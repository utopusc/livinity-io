import 'dotenv/config';
import Redis from 'ioredis';
import { Daemon } from './daemon.js';
import { Brain } from './brain.js';
import { Router } from './router.js';
import { DockerManager } from './docker-manager.js';
import { ShellExecutor } from './shell.js';
import { Scheduler } from './scheduler.js';
import { ToolRegistry } from './tool-registry.js';
import { SkillLoader } from './skill-loader.js';
import { SubagentManager } from './subagent-manager.js';
import { ScheduleManager } from './schedule-manager.js';
import { SkillGenerator } from './skill-generator.js';
import { LoopRunner } from './loop-runner.js';
import { McpConfigManager } from './mcp-config-manager.js';
import { McpRegistryClient } from './mcp-registry-client.js';
import { McpClientManager } from './mcp-client-manager.js';
import { ConfigManager } from './config/manager.js';
import { SessionManager } from './session-manager.js';
import { HeartbeatRunner } from './heartbeat-runner.js';
import { ChannelManager } from './channels/index.js';
import { UserSessionManager } from './user-session.js';
import { createApiServer, setupWebSocket } from './api.js';
import { Queue, Worker } from 'bullmq';
import { logger } from './logger.js';

const NEXUS_BASE_DIR = process.env.NEXUS_BASE_DIR || '/opt/nexus';
const NEXUS_SKILLS_DIR = process.env.NEXUS_SKILLS_DIR || '/opt/nexus/app/skills';

// Prevent unhandled errors from crashing the process (e.g. Gemini stream parse errors)
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled rejection (process kept alive)', {
    error: reason?.message || String(reason),
    stack: reason?.stack?.split('\n').slice(0, 3).join(' | '),
  });
});
process.on('uncaughtException', (err: Error) => {
  // Only keep alive for known recoverable errors; crash for truly fatal ones
  const recoverable = err.message?.includes('Failed to parse stream')
    || err.message?.includes('fetch failed')
    || err.message?.includes('ECONNRESET')
    || err.message?.includes('socket hang up');
  logger.error(`Uncaught exception (${recoverable ? 'recovered' : 'FATAL'})`, {
    error: err.message,
    stack: err.stack?.split('\n').slice(0, 5).join(' | '),
  });
  if (!recoverable) {
    process.exit(1);
  }
});

async function main() {
  logger.info('Nexus starting...');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));

  const brain = new Brain(redis);
  const router = new Router(brain);
  const dockerManager = new DockerManager();
  const shell = new ShellExecutor(process.env.SHELL_CWD || NEXUS_BASE_DIR);
  const scheduler = new Scheduler(router);
  const toolRegistry = new ToolRegistry();
  const skillsDir = process.env.SKILLS_DIR || NEXUS_SKILLS_DIR;
  const skillLoader = new SkillLoader(skillsDir, toolRegistry);

  // New managers
  const subagentManager = new SubagentManager(redis);
  const scheduleManager = new ScheduleManager(redis);
  const skillGenerator = new SkillGenerator(brain, skillsDir, skillLoader);
  const loopRunner = new LoopRunner(redis, subagentManager);

  // MCP managers
  const mcpConfigManager = new McpConfigManager(redis);
  const mcpRegistryClient = new McpRegistryClient();
  const mcpClientManager = new McpClientManager(redis, toolRegistry, mcpConfigManager);

  // Nexus config manager
  const configManager = new ConfigManager(redis);
  await configManager.init();
  logger.info('ConfigManager initialized', {
    agentMaxTurns: configManager.get().agent?.maxTurns,
    retryEnabled: configManager.get().retry?.enabled,
  });

  // Session manager
  const sessionConfig = configManager.get().session;
  const sessionManager = new SessionManager({
    redis,
    scope: sessionConfig?.scope,
    idleMinutes: sessionConfig?.idleMinutes,
    resetTriggers: sessionConfig?.reset?.triggers,
    maxHistoryMessages: sessionConfig?.maxHistoryMessages,
  });
  logger.info('SessionManager initialized', {
    scope: sessionConfig?.scope || 'per-sender',
    idleMinutes: sessionConfig?.idleMinutes || 60,
  });

  // Channel manager for multi-platform messaging
  const channelManager = new ChannelManager();
  await channelManager.init(redis);
  logger.info('ChannelManager initialized');

  // User session manager for per-user preferences (thinking, verbose, model)
  const userSessionManager = new UserSessionManager(redis);
  logger.info('UserSessionManager initialized');

  // Heartbeat runner
  const workspaceDir = process.env.WORKSPACE_DIR || NEXUS_BASE_DIR;
  const heartbeatRunner = new HeartbeatRunner({
    redis,
    brain,
    toolRegistry,
    workspaceDir,
    onDeliver: async (message: string, target: string) => {
      // Determine delivery method based on target
      if (['telegram', 'discord', 'slack', 'matrix'].includes(target)) {
        // Use ChannelManager for Telegram/Discord/Slack/Matrix
        // Get the last chat ID from Redis for the target channel
        const lastChatId = await redis.get(`nexus:${target}:last_chat_id`);
        if (lastChatId) {
          const success = await channelManager.sendMessage(target as 'telegram' | 'discord' | 'slack' | 'matrix', lastChatId, message);
          if (success) {
            logger.info('HeartbeatRunner: delivered via channel', { target, chatId: lastChatId, messageLength: message.length });
          } else {
            logger.error('HeartbeatRunner: failed to deliver via channel', { target, chatId: lastChatId });
          }
        } else {
          logger.warn('HeartbeatRunner: no last_chat_id for target, cannot deliver', { target });
        }
      } else if (target === 'all') {
        // Deliver to all connected channels
        for (const channelId of ['telegram', 'discord', 'slack', 'matrix'] as const) {
          const lastChatId = await redis.get(`nexus:${channelId}:last_chat_id`);
          if (lastChatId) {
            await channelManager.sendMessage(channelId, lastChatId, message);
            logger.info('HeartbeatRunner: delivered to channel', { channel: channelId, chatId: lastChatId });
          }
        }
      } else {
        // Assume WhatsApp JID - push to WhatsApp outbox
        await redis.lpush('nexus:wa_outbox', JSON.stringify({
          to: target,
          message,
          source: 'heartbeat',
        }));
        logger.info('HeartbeatRunner: queued for WhatsApp delivery', { target, messageLength: message.length });
      }
    },
  });
  heartbeatRunner.updateConfig(configManager.get());
  logger.info('HeartbeatRunner initialized', {
    enabled: configManager.get().heartbeat?.enabled,
    intervalMinutes: configManager.get().heartbeat?.intervalMinutes,
  });

  // ── Memory extraction pipeline (BullMQ) ──────────────────────────────
  const MEMORY_EXTRACTION_PROMPT = `Extract important facts, preferences, and knowledge from this conversation that would be useful to remember for future interactions. Return a JSON array of memory strings. Only include genuinely useful information — not greetings, acknowledgments, or task mechanics.

Examples of good memories:
- "User prefers dark mode"
- "User's server runs Ubuntu 22.04"
- "User's timezone is Europe/Istanbul"
- "The PostgreSQL password was changed on 2026-02-15"

Return ONLY a JSON array of strings. If nothing worth remembering, return [].

Conversation:`;

  const redisOpts = redis.options as any;
  const bullConnection = {
    host: redisOpts?.host || 'localhost',
    port: redisOpts?.port || 6379,
    ...(redisOpts?.password ? { password: redisOpts.password } : {}),
  };

  const memoryExtractionQueue = new Queue('nexus-memory-extraction', {
    connection: bullConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  const memoryExtractionWorker = new Worker(
    'nexus-memory-extraction',
    async (job) => {
      const { conversation, response, userId, sessionId, source } = job.data;
      try {
        // Use flash tier for cheap extraction
        const extractionResult = await brain.think({
          prompt: `${conversation}\n\nAssistant: ${response}`,
          systemPrompt: MEMORY_EXTRACTION_PROMPT,
          tier: 'flash',
          maxTokens: 500,
        });

        // Parse JSON array from response
        const cleaned = extractionResult.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
        let memories: string[];
        try {
          memories = JSON.parse(cleaned);
        } catch {
          // Try to extract array from response
          const match = cleaned.match(/\[[\s\S]*\]/);
          memories = match ? JSON.parse(match[0]) : [];
        }

        if (!Array.isArray(memories) || memories.length === 0) {
          logger.debug('Memory extraction: nothing to remember', { sessionId });
          return;
        }

        // Store each extracted memory via memory service
        for (const content of memories.slice(0, 5)) { // Max 5 memories per conversation
          if (typeof content !== 'string' || content.length < 5) continue;
          try {
            await fetch('http://localhost:3300/add', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.LIV_API_KEY || '',
              },
              body: JSON.stringify({
                userId,
                content,
                sessionId,
                metadata: { source, extractedAt: Date.now(), auto: true },
              }),
            });
          } catch (err: any) {
            logger.error('Memory extraction: failed to store', { error: err.message, content: content.slice(0, 50) });
          }
        }

        logger.info('Memory extraction complete', { sessionId, memoriesStored: memories.length });
      } catch (err: any) {
        logger.error('Memory extraction job failed', { error: err.message, sessionId });
      }
    },
    { connection: bullConnection, concurrency: 2 },
  );

  memoryExtractionWorker.on('failed', (job, err) => {
    logger.error('Memory extraction worker: job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Memory extraction pipeline initialized');

  const daemon = new Daemon({
    brain,
    router,
    dockerManager,
    shell,
    scheduler,
    redis,
    toolRegistry,
    skillLoader,
    subagentManager,
    scheduleManager,
    skillGenerator,
    loopRunner,
    mcpConfigManager,
    mcpRegistryClient,
    mcpClientManager,
    configManager,
    sessionManager,
    heartbeatRunner,
    channelManager,
    userSessionManager,
    memoryExtractionQueue,
    intervalMs: parseInt(process.env.DAEMON_INTERVAL_MS || '30000'),
  });

  const apiApp = createApiServer({ daemon, redis, brain, toolRegistry, mcpConfigManager, mcpRegistryClient, mcpClientManager, channelManager });
  const apiPort = parseInt(process.env.API_PORT || '3200');
  const apiHost = process.env.API_HOST || '127.0.0.1';
  const httpServer = apiApp.listen(apiPort, apiHost, () => {
    logger.info(`API server on http://${apiHost}:${apiPort}`);
  });

  // Attach WebSocket server for streaming
  setupWebSocket(httpServer, brain, toolRegistry);

  // Event-driven inbox processing using Redis BLPOP (no polling overhead)
  const inboxRedis = redis.duplicate(); // Separate connection for blocking operations
  const processInboxQueue = async () => {
    while (true) {
      try {
        // BLPOP blocks until an item is available (timeout 0 = wait forever)
        const result = await inboxRedis.blpop('nexus:inbox', 0);
        if (result) {
          const [, item] = result; // result is [key, value]
          try {
            const parsed = JSON.parse(item);
            daemon.addToInbox(
              parsed.message,
              parsed.source || 'mcp',
              parsed.requestId,
              parsed.params,
              parsed.from,
            );
          } catch {
            daemon.addToInbox(item, 'mcp');
          }
        }
      } catch (err: any) {
        // Connection closed during shutdown - exit gracefully
        if (err.message?.includes('Connection is closed') || err.message?.includes('stream isn\'t writeable')) {
          break;
        }
        logger.error('Inbox queue error', { error: err.message });
        await new Promise((r) => setTimeout(r, 1000)); // Brief pause before retry
      }
    }
  };
  processInboxQueue(); // Start the blocking listener

  const shutdown = async () => {
    logger.info('Shutting down...');
    heartbeatRunner.stop();
    await memoryExtractionWorker.close();
    await memoryExtractionQueue.close();
    await channelManager.disconnectAll();
    await mcpClientManager.stop();
    await daemon.stop();
    await inboxRedis.quit().catch(() => {}); // Close blocking connection
    await redis.quit();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start MCP client manager (connects to configured MCP servers)
  await mcpClientManager.start();

  // Connect all enabled messaging channels
  await channelManager.connectAll();

  // Set up message handler for all channels (Telegram, Discord, Slack, etc.)
  channelManager.onMessage(async (msg) => {
    logger.info('Channel message received', {
      channel: msg.channel,
      userId: msg.userId,
      userName: msg.userName,
      text: msg.text.slice(0, 100),
    });

    // Save last chat ID for heartbeat delivery
    if (msg.channel === 'telegram' || msg.channel === 'discord' || msg.channel === 'slack') {
      await redis.set(`nexus:${msg.channel}:last_chat_id`, msg.chatId);
    }

    // Add to daemon inbox for processing
    daemon.addToInbox(
      msg.text,
      msg.channel, // 'telegram', 'discord', 'slack', etc.
      undefined,
      { chatId: msg.chatId, replyToMessageId: msg.replyToMessageId },
      msg.chatId, // Use chatId as 'from' for response routing
    );
  });

  await daemon.start();

  // Start heartbeat runner (after daemon is ready)
  await heartbeatRunner.start();
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
