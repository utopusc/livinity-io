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
import { logger } from './logger.js';

const NEXUS_BASE_DIR = process.env.NEXUS_BASE_DIR || '/opt/nexus';
const NEXUS_SKILLS_DIR = process.env.NEXUS_SKILLS_DIR || '/opt/nexus/app/skills';

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
      if (target === 'telegram' || target === 'discord') {
        // Use ChannelManager for Telegram/Discord
        // Get the last chat ID from Redis for the target channel
        const lastChatId = await redis.get(`nexus:${target}:last_chat_id`);
        if (lastChatId) {
          const success = await channelManager.sendMessage(target as 'telegram' | 'discord', lastChatId, message);
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
        for (const channelId of ['telegram', 'discord'] as const) {
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
    intervalMs: parseInt(process.env.DAEMON_INTERVAL_MS || '30000'),
  });

  const apiApp = createApiServer({ daemon, redis, brain, toolRegistry, mcpConfigManager, mcpRegistryClient, mcpClientManager, channelManager });
  const apiPort = parseInt(process.env.API_PORT || '3200');
  const httpServer = apiApp.listen(apiPort, '0.0.0.0', () => {
    logger.info(`API server on http://0.0.0.0:${apiPort}`);
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
    if (msg.channel === 'telegram' || msg.channel === 'discord') {
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
