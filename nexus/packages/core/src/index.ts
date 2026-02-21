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
import { ApprovalManager } from './approval-manager.js';
import { DmPairingManager } from './dm-pairing.js';
import { UsageTracker } from './usage-tracker.js';
import { TaskManager } from './task-manager.js';
import { SkillRegistryClient } from './skill-registry-client.js';
import { SkillInstaller } from './skill-installer.js';
import { WebhookManager } from './webhook-manager.js';
import { MultiAgentManager } from './multi-agent.js';
import { CanvasManager } from './canvas-manager.js';
import { createApiServer, setupWsGateway } from './api.js';
import { VoiceGateway } from './voice/index.js';
import { Queue, Worker } from 'bullmq';
import { logger } from './logger.js';
import { CircuitBreaker } from './infra/circuit-breaker.js';
import { formatErrorMessage } from './infra/errors.js';

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
  const msg = err.message ?? '';
  const name = err.name ?? '';
  const recoverable = msg.includes('Failed to parse stream')
    || msg.includes('fetch failed')
    || msg.includes('ECONNRESET')
    || msg.includes('socket hang up')
    || name === 'AbortError' || msg.includes('AbortError')
    || msg.includes('EPIPE')
    || msg.includes('ECONNREFUSED')
    || msg.includes('ERR_STREAM')
    || msg.includes('write after end')
    || msg.includes('Cannot read properties of null')
    || msg.includes('ETIMEDOUT')
    || msg.includes('ENOTFOUND');
  logger.error(`Uncaught exception (${recoverable ? 'recovered' : 'FATAL'})`, {
    error: msg,
    name,
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

  // Circuit breaker for Redis — prevents cascade crashes when Redis goes down temporarily
  const redisCircuitBreaker = new CircuitBreaker({
    name: 'RedisCircuitBreaker',
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxAttempts: 3,
  });

  redis.on('connect', () => {
    redisCircuitBreaker.recordSuccess();
    logger.info('Redis connected');
  });
  redis.on('error', (err: Error) => {
    redisCircuitBreaker.recordFailure();
    logger.error('Redis error (circuit breaker notified)', { error: err.message, circuitState: redisCircuitBreaker.getState() });
  });

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

  // Get Gmail provider reference (used for MCP tools + config)
  const gmailProvider = channelManager.getProvider('gmail') as any;

  // Configure Gmail provider with OAuth credentials from env
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) {
    if (gmailProvider?.updateConfig) {
      await gmailProvider.updateConfig({
        enabled: true,
        gmailClientId: process.env.GMAIL_CLIENT_ID,
        gmailClientSecret: process.env.GMAIL_CLIENT_SECRET,
        gmailPollIntervalSec: parseInt(process.env.GMAIL_POLL_INTERVAL_SEC || '60'),
      });
      logger.info('GmailProvider configured from env vars');
    }
  }

  // Wire channelManager into GmailProvider for token failure notifications
  if (gmailProvider?.setChannelManager) {
    gmailProvider.setChannelManager(channelManager);
    logger.info('GmailProvider: channelManager wired for notifications');
  }

  // User session manager for per-user preferences (thinking, verbose, model)
  const userSessionManager = new UserSessionManager(redis);
  logger.info('UserSessionManager initialized');

  // DM pairing manager for activation code flow on DM channels
  const dmPairingManager = new DmPairingManager(redis);
  // Wire into Telegram and Discord providers
  const telegramProvider = channelManager.getProvider('telegram') as any;
  if (telegramProvider?.setDmPairing) telegramProvider.setDmPairing(dmPairingManager);
  const discordProvider = channelManager.getProvider('discord') as any;
  if (discordProvider?.setDmPairing) discordProvider.setDmPairing(dmPairingManager);
  logger.info('DmPairingManager initialized');

  // Usage tracker for per-session and cumulative token usage
  const usageTracker = new UsageTracker(redis);
  logger.info('UsageTracker initialized');

  // Multi-agent session manager for sub-agent orchestration
  const multiAgentManager = new MultiAgentManager({
    redis,
    maxConcurrent: 2, // MULTI-06: VPS resource constraint
    brain,
    toolRegistry,
    nexusConfig: configManager.get(),
  });
  logger.info('MultiAgentManager initialized', { maxConcurrent: 2 });

  // Canvas manager for Live Canvas artifact storage
  const canvasManager = new CanvasManager({ redis });
  logger.info('CanvasManager initialized');

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

  // ── Multi-agent sub-agent execution queue (BullMQ) ──────────────────
  const multiAgentQueue = new Queue('nexus-multi-agent', {
    connection: bullConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  });

  const multiAgentWorker = new Worker(
    'nexus-multi-agent',
    async (job) => {
      const { sessionId } = job.data;
      logger.info('Multi-agent worker: executing sub-agent', { sessionId: sessionId?.slice(0, 8) });
      try {
        await multiAgentManager.executeSubAgent(sessionId);
      } catch (err: any) {
        logger.error('Multi-agent worker: job failed', { sessionId: sessionId?.slice(0, 8), error: err.message });
        throw err; // Let BullMQ handle retry/fail
      }
    },
    {
      connection: bullConnection,
      concurrency: 2, // MULTI-06: Maximum 2 concurrent sub-agents
    },
  );

  multiAgentWorker.on('failed', (job, err) => {
    logger.error('Multi-agent worker: job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Multi-agent execution pipeline initialized', { concurrency: 2 });

  // ApprovalManager for human-in-the-loop tool authorization
  const approvalManager = new ApprovalManager(redis);
  logger.info('ApprovalManager initialized');

  // TaskManager for parallel agent task execution (BullMQ-based)
  const taskManager = new TaskManager({
    brain,
    toolRegistry,
    redis,
    nexusConfig: configManager.get(),
    approvalManager,
  });
  logger.info('TaskManager initialized', {
    maxConcurrent: configManager.get().tasks?.maxConcurrent || 4,
  });

  // Skill marketplace: registry client + installer
  const skillCacheDir = process.env.SKILL_CACHE_DIR || '/opt/nexus/data/skill-cache';
  const skillRegistryClient = new SkillRegistryClient({ cacheDir: skillCacheDir });
  const defaultSkillRegistry = process.env.SKILL_REGISTRY_URL || 'https://github.com/utopusc/livinity-skills';
  skillRegistryClient.addRegistry(defaultSkillRegistry);

  // Load persisted registries from Redis (user-added registries survive restarts)
  try {
    const savedRegistries = await redis.get('nexus:skills:registries');
    if (savedRegistries) {
      const urls: string[] = JSON.parse(savedRegistries);
      for (const url of urls) {
        skillRegistryClient.addRegistry(url);
      }
      logger.info('SkillRegistryClient: loaded persisted registries', { count: urls.length });
    }
  } catch (err) {
    logger.warn('SkillRegistryClient: failed to load persisted registries', { error: formatErrorMessage(err) });
  }

  const skillInstallDir = process.env.SKILL_INSTALL_DIR || '/opt/nexus/skills/marketplace';
  const skillInstaller = new SkillInstaller({
    skillLoader,
    registryClient: skillRegistryClient,
    installDir: skillInstallDir,
    redis,
  });

  // Load previously installed marketplace skills from disk
  await skillLoader.loadMarketplaceSkills(skillInstallDir);
  logger.info('SkillInstaller initialized', { installDir: skillInstallDir, registry: defaultSkillRegistry });

  // ── BullMQ cron queue (replaces setTimeout-based scheduling) ──────────
  const cronQueue = new Queue('nexus-cron', {
    connection: bullConnection,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
  logger.info('Cron queue initialized (BullMQ)');

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
    cronQueue,
    approvalManager,
    usageTracker,
    gmailProvider,
    multiAgentManager,
    multiAgentQueue,
    canvasManager,
    intervalMs: parseInt(process.env.DAEMON_INTERVAL_MS || '30000'),
  });

  // ── BullMQ cron worker — processes delayed cron jobs by injecting into daemon inbox ──
  const cronWorker = new Worker(
    'nexus-cron',
    async (job) => {
      const { task, source, from, params } = job.data;
      logger.info('Cron (BullMQ) fired', { task, source, from, jobId: job.id });
      daemon.addToInbox(task, source || 'cron', undefined, params, from);
    },
    { connection: bullConnection, concurrency: 1 },
  );
  cronWorker.on('failed', (job, err) => {
    logger.error('Cron worker: job failed', { jobId: job?.id, error: err.message });
  });
  logger.info('Cron worker initialized (BullMQ)');

  // ── WebhookManager — secure webhook receiver with HMAC verification + BullMQ ──
  const webhookManager = new WebhookManager({ redis, daemon, bullConnection });
  daemon.setWebhookManager(webhookManager);
  logger.info('WebhookManager initialized');

  const apiApp = createApiServer({ daemon, redis, brain, toolRegistry, mcpConfigManager, mcpRegistryClient, mcpClientManager, channelManager, approvalManager, taskManager, skillInstaller, skillRegistryClient, skillLoader, dmPairingManager, usageTracker, webhookManager });
  const apiPort = parseInt(process.env.API_PORT || '3200');
  const apiHost = process.env.API_HOST || '127.0.0.1';
  const httpServer = apiApp.listen(apiPort, apiHost, () => {
    logger.info(`API server on http://${apiHost}:${apiPort}`);
  });

  // Dedicated Redis subscriber connection for WebSocket gateway pub/sub
  const redisSub = redis.duplicate();

  // Attach JSON-RPC 2.0 WebSocket gateway for streaming
  const wsGateway = setupWsGateway(httpServer, { brain, toolRegistry, daemon, redis, redisSub, taskManager });

  // Dedicated Redis subscriber for voice response pub/sub (TTS routing)
  const voiceRedisSub = redis.duplicate();

  // Voice WebSocket gateway for real-time voice pipeline (/ws/voice)
  const voiceConfig = configManager.get().voice;
  const voiceGateway = new VoiceGateway(httpServer, { redis, redisSub: voiceRedisSub, daemon, voiceConfig });
  logger.info('VoiceGateway initialized', {
    enabled: voiceConfig?.enabled,
    hasDeepgramKey: !!voiceConfig?.deepgramApiKey,
    hasCartesiaKey: !!voiceConfig?.cartesiaApiKey,
  });

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
    redisCircuitBreaker.destroy();
    voiceGateway.stop();
    wsGateway.stop();
    heartbeatRunner.stop();
    await cronWorker.close();
    await cronQueue.close();
    await memoryExtractionWorker.close();
    await memoryExtractionQueue.close();
    await multiAgentWorker.close();
    await multiAgentQueue.close();
    await channelManager.disconnectAll();
    await mcpClientManager.stop();
    await taskManager.cleanup();
    await webhookManager.close();
    await daemon.stop();
    await voiceRedisSub.quit().catch(() => {}); // Close voice pub/sub subscriber connection
    await redisSub.quit().catch(() => {}); // Close pub/sub subscriber connection
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
    if (['telegram', 'discord', 'slack', 'matrix'].includes(msg.channel)) {
      await redis.set(`nexus:${msg.channel}:last_chat_id`, msg.chatId);
    }

    // Add to daemon inbox for processing
    daemon.addToInbox(
      msg.text,
      msg.channel, // 'telegram', 'discord', 'slack', 'matrix', etc.
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
