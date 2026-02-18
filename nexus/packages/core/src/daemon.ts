import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Brain, type ModelTier } from './brain.js';
import { Router, Intent } from './router.js';
import { DockerManager } from './docker-manager.js';
import { ShellExecutor } from './shell.js';
import { Scheduler } from './scheduler.js';
import { ToolRegistry } from './tool-registry.js';
import { AgentLoop } from './agent.js';
import { SdkAgentRunner } from './sdk-agent-runner.js';
import { ClaudeProvider } from './providers/claude.js';
import { SkillLoader } from './skill-loader.js';
import { SubagentManager } from './subagent-manager.js';
import { ScheduleManager } from './schedule-manager.js';
import { SkillGenerator } from './skill-generator.js';
import { LoopRunner } from './loop-runner.js';
import { COMPLEXITY_PROMPT, SELF_REFLECTION_PROMPT, subagentPrompt } from './prompts.js';
import { chunkForWhatsApp } from './utils.js';
import type { Tool, ToolResult } from './types.js';
import { logger } from './logger.js';
import { formatErrorMessage } from './infra/errors.js';
import type Redis from 'ioredis';
import type { Queue } from 'bullmq';
import type { McpConfigManager } from './mcp-config-manager.js';
import type { McpRegistryClient } from './mcp-registry-client.js';
import type { McpClientManager } from './mcp-client-manager.js';
import { ConfigManager } from './config/manager.js';
import type { NexusConfig } from './config/schema.js';
import type { SessionManager } from './session-manager.js';
import type { HeartbeatRunner } from './heartbeat-runner.js';
import type { ChannelManager } from './channels/index.js';
import { UserSessionManager } from './user-session.js';
import { handleCommand, isCommand } from './commands.js';
import { getThinkingPromptModifier, getVerbosePromptModifier, type ThinkLevel, type VerboseLevel } from './thinking.js';
import type { ApprovalManager } from './approval-manager.js';

const NEXUS_LOGS_DIR = process.env.NEXUS_LOGS_DIR || '/opt/nexus/logs';

interface DaemonConfig {
  brain: Brain;
  router: Router;
  dockerManager: DockerManager;
  shell: ShellExecutor;
  scheduler: Scheduler;
  redis: Redis;
  toolRegistry: ToolRegistry;
  skillLoader: SkillLoader;
  subagentManager: SubagentManager;
  scheduleManager: ScheduleManager;
  skillGenerator: SkillGenerator;
  loopRunner: LoopRunner;
  mcpConfigManager?: McpConfigManager;
  mcpRegistryClient?: McpRegistryClient;
  mcpClientManager?: McpClientManager;
  configManager?: ConfigManager;
  sessionManager?: SessionManager;
  heartbeatRunner?: HeartbeatRunner;
  channelManager?: ChannelManager;
  userSessionManager?: UserSessionManager;
  memoryExtractionQueue?: Queue;
  approvalManager?: ApprovalManager;
  intervalMs: number;
}

interface InboxItem {
  message: string;
  source: Intent['source'];
  requestId?: string;
  params?: Record<string, any>;
  from?: string; // WhatsApp JID
  conversationHistory?: string; // Recent chat context (injected for WhatsApp)
}

export class Daemon {
  private config: DaemonConfig;
  private running = false;
  private cycleCount = 0;
  private inbox: InboxItem[] = [];
  /** Current WhatsApp JID for progress_report tool (set during inbox processing).
   *  CHAN-05: This is tool-level context only, NOT used for response routing. */
  private currentWhatsAppJid: string | undefined;
  /** Current channel context for tools like cron (telegram, discord, slack, matrix, whatsapp).
   *  CHAN-05: This is tool-level context only, NOT used for response routing.
   *  Response routing uses per-request InboxItem (source, from) passed through closures. */
  private currentChannelContext: { source: string; chatId: string; params?: Record<string, any> } | undefined;
  /** Count of action feed messages sent during current inbox item processing */
  private actionMessageCount = 0;

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  /** Expose the tool registry for external consumers (agent, skills) */
  get tools(): ToolRegistry {
    return this.config.toolRegistry;
  }

  /** Expose config manager for external consumers */
  get configManager(): ConfigManager | undefined {
    return this.config.configManager;
  }

  /** Expose session manager for external consumers */
  get sessionManager(): SessionManager | undefined {
    return this.config.sessionManager;
  }

  /** Expose subagent manager for external consumers (API) */
  get subagentManager(): SubagentManager {
    return this.config.subagentManager;
  }

  /** Expose schedule manager for external consumers (API) */
  get scheduleManager(): ScheduleManager {
    return this.config.scheduleManager;
  }

  /** Expose channel manager for external consumers (API) */
  get channelManager(): ChannelManager | undefined {
    return this.config.channelManager;
  }

  /** Expose heartbeat runner for external consumers (API) */
  get heartbeatRunner(): HeartbeatRunner | undefined {
    return this.config.heartbeatRunner;
  }

  /** Expose approval manager for external consumers (API, WS) */
  get approvalManager(): ApprovalManager | undefined {
    return this.config.approvalManager;
  }

  /** Get current Nexus config (from ConfigManager or defaults) */
  getNexusConfig(): NexusConfig | undefined {
    return this.config.configManager?.get();
  }

  async start() {
    this.running = true;
    logger.info(`Daemon started (interval: ${this.config.intervalMs}ms)`);

    // Register built-in handlers (router-based dispatch)
    this.registerHandlers();

    // Register tools (agent-facing, with schemas)
    this.registerTools();
    logger.info(`Tool registry: ${this.config.toolRegistry.size} tools registered`);

    // Load skills from skills/ directory
    await this.config.skillLoader.loadAll();
    await this.config.skillLoader.startWatching();
    logger.info(`Skill loader: ${this.config.skillLoader.size} skills loaded`);

    // Start scheduler
    await this.config.scheduler.start();

    // Wire and start ScheduleManager
    this.config.scheduleManager.onJob(async (data) => {
      logger.info('ScheduleManager: executing scheduled job', { subagentId: data.subagentId, task: data.task.slice(0, 80) });
      try {
        const result = await this.executeSubagentTask(data.subagentId, data.task);
        // Send the final result to the creator's WhatsApp
        const agentConfig = await this.config.subagentManager.get(data.subagentId);
        if (agentConfig?.createdBy && agentConfig.createdBy !== 'system') {
          const header = `*${agentConfig.name}* (scheduled):`;
          const chunks = chunkForWhatsApp(`${header}\n\n${result}`);
          for (const chunk of chunks) {
            await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
              jid: agentConfig.createdBy,
              text: chunk,
              timestamp: Date.now(),
            }));
          }
        }
      } catch (err) {
        logger.error('Scheduled job execution error', { subagentId: data.subagentId, error: formatErrorMessage(err) });
        // Send error notification to creator
        const agentConfig = await this.config.subagentManager.get(data.subagentId);
        if (agentConfig?.createdBy && agentConfig.createdBy !== 'system') {
          await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
            jid: agentConfig.createdBy,
            text: `${agentConfig.name} (scheduled) hata: ${formatErrorMessage(err)}`,
            timestamp: Date.now(),
          }));
        }
      }
    });
    await this.config.scheduleManager.start();

    // Register existing subagent schedules
    await this.syncSubagentSchedules();

    // Wire and start LoopRunner
    this.config.loopRunner.onExecute(async (ctx) => {
      try {
        const result = await this.executeSubagentTask(ctx.config.id, ctx.config.loop!.task, ctx.previousState);
        // Send loop result to creator's WhatsApp
        if (ctx.config.createdBy && ctx.config.createdBy !== 'system') {
          const header = `*${ctx.config.name}* (loop #${ctx.iteration || 1}):`;
          const chunks = chunkForWhatsApp(`${header}\n\n${result}`);
          for (const chunk of chunks) {
            await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
              jid: ctx.config.createdBy,
              text: chunk,
              timestamp: Date.now(),
            }));
          }
        }
        return { result, state: result.slice(0, 4000) };
      } catch (err) {
        logger.error('Loop execution error', { subagentId: ctx.config.id, error: formatErrorMessage(err) });
        if (ctx.config.createdBy && ctx.config.createdBy !== 'system') {
          await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
            jid: ctx.config.createdBy,
            text: `${ctx.config.name} (loop) hata: ${formatErrorMessage(err)}`,
            timestamp: Date.now(),
          }));
        }
        return { result: `Error: ${formatErrorMessage(err)}`, state: `error: ${formatErrorMessage(err)}` };
      }
    });
    await this.config.loopRunner.startAll();

    logger.info('All managers started');

    // Main loop
    while (this.running) {
      try {
        await this.cycle();
      } catch (err) {
        logger.error('Daemon cycle error', { error: (err as Error).message });
      }
      await this.sleep(this.config.intervalMs);
    }
  }

  async stop() {
    this.running = false;
    await this.config.scheduler.stop();
    await this.config.scheduleManager.stop();
    await this.config.loopRunner.stopAll();
    logger.info('Daemon stopped');
  }

  async cycle() {
    this.cycleCount++;

    // 1. Process inbox (messages from MCP, WhatsApp, webhooks)
    while (this.inbox.length > 0) {
      const item = this.inbox.shift()!;

      try {
        // Track current WhatsApp JID for progress_report tool
        this.currentWhatsAppJid = item.from;
        // Track current channel context for cron tool
        if (['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
          this.currentChannelContext = {
            source: item.source,
            chatId: item.from || item.params?.chatId || '',
            params: item.params,
          };
          logger.info('Channel context set', { source: item.source, chatId: this.currentChannelContext.chatId });
        }
        // Reset action feed counter for this item
        this.actionMessageCount = 0;

        // Update heartbeat's last recipient for WhatsApp messages
        if (item.source === 'whatsapp' && item.from && this.config.heartbeatRunner) {
          await this.config.heartbeatRunner.setLastRecipient(item.from);
        }

        // Fetch conversation history for WhatsApp messages
        if (item.source === 'whatsapp' && item.from) {
          item.conversationHistory = await this.getWhatsAppHistory(item.from);
        }

        // Handle slash commands (/think, /verbose, /model, /help, /reset, /status)
        if (isCommand(item.message) && item.from && this.config.userSessionManager) {
          const session = await this.config.userSessionManager.get(item.from);
          const cmdResult = await handleCommand(item.message, {
            jid: item.from,
            userSession: this.config.userSessionManager,
            currentThink: session.thinkLevel,
            currentVerbose: session.verboseLevel,
            currentModel: session.modelTier,
          });

          if (cmdResult?.handled && cmdResult.response) {
            await this.sendWhatsAppResponse(item, cmdResult.response);
            await this.sendChannelResponse(item, cmdResult.response);
            logger.info('Command handled', { jid: item.from, message: item.message.slice(0, 50) });
            continue;
          }
          // If not handled, continue to skill/agent processing
        }

        // Check skill triggers first (before AI classification)
        const matchedSkill = this.config.skillLoader.matchTrigger(item.message);
        if (matchedSkill) {
          logger.info('Skill triggered', { skill: matchedSkill.meta.name, message: item.message.slice(0, 80) });

          const skillResult = await this.config.skillLoader.execute(
            matchedSkill.meta.name,
            item.message,
            item.source,
            item.params || {},
            { from: item.from, redis: this.config.redis, brain: this.config.brain, onAction: this.buildActionCallback(item.from, item.source) },
          );

          // Store result for MCP polling
          if (item.requestId) {
            await this.config.redis.set(
              `nexus:answer:${item.requestId}`,
              skillResult.message,
              'EX',
              120,
            );
          }

          // Send result back to the appropriate channel
          await this.sendWhatsAppResponse(item, skillResult.message);
          await this.sendChannelResponse(item, skillResult.message);

          // Save conversation turn for WhatsApp history
          if (item.source === 'whatsapp' && item.from) {
            await this.saveWhatsAppTurn(item.from, item.message, skillResult.message);
          }

          logger.info('Inbox processed (skill)', { skill: matchedSkill.meta.name, success: skillResult.success });
          continue;
        }

        // Merge params from MCP into classified intent
        const intent = await this.config.router.classify(item.message, item.source);
        if (item.params) {
          Object.assign(intent.params, item.params);
        }
        // Carry WhatsApp context through to handlers
        if (item.from) {
          intent.from = item.from;
        }
        if (item.conversationHistory) {
          intent.params.__history = item.conversationHistory;
        }

        const result = await this.config.router.route(intent);
        logger.info('Inbox processed', { action: intent.action, success: result.success });

        const responseText = typeof result.data === 'string' ? result.data : result.message;

        // If requestId present, store result for MCP polling
        if (item.requestId) {
          await this.config.redis.set(
            `nexus:answer:${item.requestId}`,
            responseText,
            'EX',
            120,
          );
        }

        // Send result back to the appropriate channel
        await this.sendWhatsAppResponse(item, responseText);
        await this.sendChannelResponse(item, responseText);

        // Save conversation turn for WhatsApp history
        if (item.source === 'whatsapp' && item.from) {
          await this.saveWhatsAppTurn(item.from, item.message, responseText);
        }
      } catch (err) {
        // Per-item error handling — ALWAYS send a response to the user
        const errorMsg = `Error processing message: ${formatErrorMessage(err)}`;
        logger.error('Inbox item error', { message: item.message.slice(0, 80), error: formatErrorMessage(err), source: item.source });

        // Send error response so user isn't left waiting
        await this.sendWhatsAppResponse(item, errorMsg).catch(() => {});
        await this.sendChannelResponse(item, errorMsg).catch(() => {});

        // Also store error for MCP polling
        if (item.requestId) {
          await this.config.redis.set(
            `nexus:answer:${item.requestId}`,
            errorMsg,
            'EX',
            120,
          ).catch(() => {});
        }
      }
    }

    // 2. Docker health check (every 10 cycles = ~5 min)
    if (this.cycleCount % 10 === 0) {
      await this.config.dockerManager.cleanup();
    }

    // 3. Log cycle stats (every 120 cycles = ~1 hour)
    if (this.cycleCount % 120 === 0) {
      const stats = await this.getStats();
      logger.info('Hourly stats', stats);
    }

    // 4. Self-reflection (every 480 cycles = ~4 hours)
    if (this.cycleCount % 480 === 0) {
      await this.selfReflect().catch((err) => {
        logger.error('Self-reflection error', { error: err.message });
      });
    }
  }

  addToInbox(message: string, source: Intent['source'], requestId?: string, params?: Record<string, any>, from?: string) {
    const item: InboxItem = { message, source, requestId, params, from };

    // Real-time messaging sources - process immediately (event-driven)
    const realtimeSources = ['telegram', 'discord', 'slack', 'matrix'];
    if (realtimeSources.includes(source)) {
      // Process immediately without waiting for polling loop
      this.processInboxItem(item).catch((err) => {
        logger.error('Immediate inbox processing error', { source, error: err.message });
      });
    } else {
      // Other sources (mcp, cron, daemon, webhook) - queue for polling
      this.inbox.push(item);
    }
  }

  /** Process a single inbox item immediately (for real-time messaging).
   *
   *  CHAN-05: Response routing (sendChannelResponse, buildActionCallback) uses per-request
   *  closure context from the InboxItem, NOT instance state. The instance properties below
   *  (currentWhatsAppJid, currentChannelContext) are only used by tools (cron, progress_report)
   *  that need to know the "current" context at tool execution time. These are NOT used for
   *  response routing and are safe for sequential processing within a single item. */
  private async processInboxItem(item: InboxItem): Promise<void> {
    try {
      // Track current WhatsApp JID for progress_report tool
      this.currentWhatsAppJid = item.from;
      // Track current channel context for cron tool
      if (['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
        this.currentChannelContext = {
          source: item.source,
          chatId: item.from || item.params?.chatId || '',
          params: item.params,
        };
        logger.info('Channel context set (realtime)', { source: item.source, chatId: this.currentChannelContext.chatId });
      }
      // Reset action feed counter for this item
      this.actionMessageCount = 0;

      // Update heartbeat's last recipient for WhatsApp messages
      if (item.source === 'whatsapp' && item.from && this.config.heartbeatRunner) {
        await this.config.heartbeatRunner.setLastRecipient(item.from);
      }

      // Fetch conversation history for WhatsApp messages
      if (item.source === 'whatsapp' && item.from) {
        item.conversationHistory = await this.getWhatsAppHistory(item.from);
      }

      // Handle slash commands (/think, /verbose, /model, /help, /reset, /status)
      if (isCommand(item.message) && item.from && this.config.userSessionManager) {
        const session = await this.config.userSessionManager.get(item.from);
        const cmdResult = await handleCommand(item.message, {
          jid: item.from,
          userSession: this.config.userSessionManager,
          currentThink: session.thinkLevel,
          currentVerbose: session.verboseLevel,
          currentModel: session.modelTier,
        });

        if (cmdResult?.handled && cmdResult.response) {
          await this.sendWhatsAppResponse(item, cmdResult.response);
          await this.sendChannelResponse(item, cmdResult.response);
          logger.info('Command handled', { jid: item.from, message: item.message.slice(0, 50) });
          return;
        }
        // If not handled, continue to skill/agent processing
      }

      // Check skill triggers first (before AI classification)
      const matchedSkill = this.config.skillLoader.matchTrigger(item.message);
      if (matchedSkill) {
        logger.info('Skill triggered', { skill: matchedSkill.meta.name, message: item.message.slice(0, 80) });

        const skillResult = await this.config.skillLoader.execute(
          matchedSkill.meta.name,
          item.message,
          item.source,
          item.params || {},
          { from: item.from, redis: this.config.redis, brain: this.config.brain, onAction: this.buildActionCallback(item.from) },
        );

        // Store result for MCP polling
        if (item.requestId) {
          await this.config.redis.set(
            `nexus:answer:${item.requestId}`,
            skillResult.message,
            'EX',
            120,
          );
        }

        // Send result back to the appropriate channel
        await this.sendWhatsAppResponse(item, skillResult.message);
        await this.sendChannelResponse(item, skillResult.message);

        // Save conversation turn for WhatsApp history
        if (item.source === 'whatsapp' && item.from) {
          await this.saveWhatsAppTurn(item.from, item.message, skillResult.message);
        }

        logger.info('Inbox processed (skill)', { skill: matchedSkill.meta.name, success: skillResult.success });
        return;
      }

      // Merge params from MCP into classified intent
      const intent = await this.config.router.classify(item.message, item.source);
      if (item.params) {
        Object.assign(intent.params, item.params);
      }
      // Carry WhatsApp context through to handlers
      if (item.from) {
        intent.from = item.from;
      }
      if (item.conversationHistory) {
        intent.params.__history = item.conversationHistory;
      }

      const result = await this.config.router.route(intent);
      logger.info('Inbox processed', { action: intent.action, success: result.success });

      const responseText = typeof result.data === 'string' ? result.data : result.message;

      // Store result for MCP polling
      if (item.requestId) {
        await this.config.redis.set(
          `nexus:answer:${item.requestId}`,
          responseText,
          'EX',
          120,
        );
      }

      // Send result back to the appropriate channel
      await this.sendWhatsAppResponse(item, responseText);
      await this.sendChannelResponse(item, responseText);

      // Save conversation turn for WhatsApp history
      if (item.source === 'whatsapp' && item.from) {
        await this.saveWhatsAppTurn(item.from, item.message, responseText);
      }
    } catch (err) {
      // Per-item error handling — ALWAYS send a response to the user
      const errorMsg = `Error processing message: ${formatErrorMessage(err)}`;
      logger.error('Inbox item error', { message: item.message.slice(0, 80), error: formatErrorMessage(err), source: item.source });

      // Send error response so user isn't left waiting
      await this.sendWhatsAppResponse(item, errorMsg).catch(() => {});
      await this.sendChannelResponse(item, errorMsg).catch(() => {});

      // Also store error for MCP polling
      if (item.requestId) {
        await this.config.redis.set(
          `nexus:answer:${item.requestId}`,
          errorMsg,
          'EX',
          120,
        ).catch(() => {});
      }
    } finally {
      this.currentWhatsAppJid = undefined;
      this.currentChannelContext = undefined;
    }
  }

  private registerHandlers() {
    const { router, dockerManager, shell } = this.config;

    // ── Existing handlers ───────────────────────────────────────────

    router.register('status', async () => {
      const containers = await dockerManager.list();
      const uptime = process.uptime();
      return {
        success: true,
        message: `Nexus uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m. Containers: ${containers.length}. Cycles: ${this.cycleCount}.`,
        data: { uptime, containers: containers.length, cycles: this.cycleCount },
      };
    });

    router.register('logs', async () => {
      const { readFileSync } = await import('fs');
      try {
        const log = readFileSync(path.join(NEXUS_LOGS_DIR, 'nexus.log'), 'utf-8');
        const lines = log.trim().split('\n').slice(-20);
        return { success: true, message: lines.join('\n') };
      } catch {
        return { success: true, message: 'No logs available yet.' };
      }
    });

    router.register('docker', async (intent) => {
      const cmd = intent.params.cmd;
      if (cmd === 'list') {
        const containers = await dockerManager.list();
        const summary = containers.map((c) => `${c.Names?.[0] || 'unknown'}: ${c.State}`).join('\n');
        return { success: true, message: summary || 'No containers running.' };
      }
      return { success: false, message: `Unknown docker command: ${cmd}` };
    });

    router.register('cron', async (intent) => {
      const { delay, unit, task } = intent.params;
      const ms = unit === 'hours' ? delay * 3600000 : delay * 60000;
      const delayStr = `${delay} ${unit}`;

      // Capture channel context to replay when timer fires (WhatsApp, Telegram, Discord, Slack)
      const validSources = ['whatsapp', 'telegram', 'discord', 'slack', 'matrix'] as const;
      const scheduledSource = validSources.includes(intent.source as any) ? intent.source : 'cron';
      const scheduledFrom = intent.from; // Chat ID or JID
      const scheduledParams = intent.params?.chatId ? { chatId: intent.params.chatId } : undefined;
      const scheduledTask = task || `Scheduled reminder (set ${delayStr} ago)`;

      setTimeout(() => {
        this.addToInbox(scheduledTask, scheduledSource as any, undefined, scheduledParams, scheduledFrom);
        logger.info('Cron (tool) fired', { task: scheduledTask, source: scheduledSource, from: scheduledFrom });
      }, ms);

      const confirmMsg = task
        ? `Scheduled in ${delayStr}: "${task}"`
        : `Reminder set for ${delayStr} from now.`;

      logger.info('Cron scheduled', { delay, unit, task: scheduledTask, source: scheduledSource, from: scheduledFrom });
      return { success: true, message: confirmMsg };
    });

    // ── New handlers ────────────────────────────────────────────────

    // 1. Shell command execution
    router.register('shell', async (intent) => {
      const cmd = intent.params.cmd;
      if (!cmd) return { success: false, message: 'No command provided.' };

      try {
        const result = await shell.execute(cmd);
        const output = result.stdout || result.stderr || '(no output)';
        return {
          success: result.code === 0,
          message: `Exit code: ${result.code}\n${output}`,
          data: result,
        };
      } catch (err) {
        return { success: false, message: `Shell error: ${(err as Error).message}` };
      }
    });

    // 2. Docker container management (start/stop/restart/inspect/logs)
    router.register('docker-manage', async (intent) => {
      const { operation, name } = intent.params;
      if (!name) return { success: false, message: 'Container name required.' };

      try {
        switch (operation) {
          case 'start': {
            const msg = await dockerManager.startContainer(name);
            return { success: true, message: msg };
          }
          case 'stop': {
            const msg = await dockerManager.stopContainer(name);
            return { success: true, message: msg };
          }
          case 'restart': {
            const msg = await dockerManager.restartContainer(name);
            return { success: true, message: msg };
          }
          case 'inspect': {
            const info = await dockerManager.inspectContainer(name);
            return { success: true, message: JSON.stringify(info, null, 2), data: info };
          }
          case 'logs': {
            const logs = await dockerManager.containerLogs(name, intent.params.tail || 100);
            return { success: true, message: logs || '(no logs)' };
          }
          default:
            return { success: false, message: `Unknown docker operation: ${operation}` };
        }
      } catch (err) {
        return { success: false, message: `Docker error: ${(err as Error).message}` };
      }
    });

    // 3. Docker exec (run command inside container)
    router.register('docker-exec', async (intent) => {
      const { container: containerName, cmd } = intent.params;
      if (!containerName || !cmd) return { success: false, message: 'Container name and command required.' };

      try {
        const containers = await dockerManager.list();
        const target = containers.find(
          (c) => c.Names?.some((n) => n === `/${containerName}` || n === containerName),
        );
        if (!target) return { success: false, message: `Container not found: ${containerName}` };

        const output = await dockerManager.exec(target.Id, ['sh', '-c', cmd]);
        return { success: true, message: output || '(no output)', data: { container: containerName, output } };
      } catch (err) {
        return { success: false, message: `Docker exec error: ${(err as Error).message}` };
      }
    });

    // 4. PM2 process management
    router.register('pm2', async (intent) => {
      const { operation, name } = intent.params;
      let cmd: string;

      switch (operation) {
        case 'list':
        case 'ls':
          cmd = 'pm2 jlist';
          break;
        case 'status':
          cmd = name ? `pm2 describe ${name}` : 'pm2 status';
          break;
        case 'logs':
          cmd = `pm2 logs ${name || ''} --nostream --lines 50`;
          break;
        default:
          if (!name) return { success: false, message: `PM2 ${operation} requires a process name.` };
          cmd = `pm2 ${operation} ${name}`;
      }

      try {
        const result = await shell.execute(cmd);
        let message = result.stdout || result.stderr || '(no output)';

        // For jlist, format nicely
        if (operation === 'list' || operation === 'ls') {
          try {
            const procs = JSON.parse(result.stdout);
            message = procs
              .map((p: any) => `${p.name}: ${p.pm2_env?.status || 'unknown'} (pid: ${p.pid}, cpu: ${p.monit?.cpu || 0}%, mem: ${Math.round((p.monit?.memory || 0) / 1024 / 1024)}MB)`)
              .join('\n');
          } catch { /* keep raw */ }
        }

        return { success: result.code === 0, message, data: result };
      } catch (err) {
        return { success: false, message: `PM2 error: ${(err as Error).message}` };
      }
    });

    // 5. System info (CPU/RAM/disk/network)
    router.register('sysinfo', async (intent) => {
      const topic = intent.params.topic || 'all';
      const commands: Record<string, string> = {
        cpu: 'top -bn1 | head -5',
        ram: 'free -h',
        mem: 'free -h',
        disk: 'df -h',
        network: 'ss -tuln | head -20',
        uptime: 'uptime',
        all: 'echo "=== UPTIME ===" && uptime && echo "\\n=== MEMORY ===" && free -h && echo "\\n=== DISK ===" && df -h && echo "\\n=== TOP PROCESSES ===" && ps aux --sort=-%mem | head -10',
        sysinfo: 'echo "=== UPTIME ===" && uptime && echo "\\n=== MEMORY ===" && free -h && echo "\\n=== DISK ===" && df -h && echo "\\n=== TOP PROCESSES ===" && ps aux --sort=-%mem | head -10',
        system: 'echo "=== UPTIME ===" && uptime && echo "\\n=== MEMORY ===" && free -h && echo "\\n=== DISK ===" && df -h && echo "\\n=== TOP PROCESSES ===" && ps aux --sort=-%mem | head -10',
      };

      const cmd = commands[topic] || commands.all;

      try {
        const result = await shell.execute(cmd, 15_000);
        return { success: result.code === 0, message: result.stdout || result.stderr || '(no output)', data: result };
      } catch (err) {
        return { success: false, message: `Sysinfo error: ${(err as Error).message}` };
      }
    });

    // 6. File operations (read/write/list/stat/delete/mkdir)
    router.register('files', async (intent) => {
      const { operation, path, content } = intent.params;
      if (!path) return { success: false, message: 'File path required.' };

      const fs = await import('fs/promises');

      try {
        switch (operation) {
          case 'read': {
            const data = await fs.readFile(path, 'utf-8');
            const truncated = data.length > 10_000 ? data.slice(0, 10_000) + '\n...[truncated]' : data;
            return { success: true, message: truncated };
          }
          case 'write': {
            if (!content) return { success: false, message: 'Content required for write operation.' };
            await fs.writeFile(path, content, 'utf-8');
            return { success: true, message: `Written ${content.length} bytes to ${path}` };
          }
          case 'list': {
            const entries = await fs.readdir(path, { withFileTypes: true });
            const listing = entries
              .map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)
              .join('\n');
            return { success: true, message: listing || '(empty directory)' };
          }
          case 'stat': {
            const stat = await fs.stat(path);
            return {
              success: true,
              message: `Path: ${path}\nSize: ${stat.size} bytes\nType: ${stat.isDirectory() ? 'directory' : 'file'}\nModified: ${stat.mtime.toISOString()}\nPermissions: ${stat.mode.toString(8)}`,
              data: { size: stat.size, isDirectory: stat.isDirectory(), mtime: stat.mtime },
            };
          }
          case 'delete': {
            const stat = await fs.stat(path);
            if (stat.isDirectory()) {
              await fs.rm(path, { recursive: true });
            } else {
              await fs.unlink(path);
            }
            return { success: true, message: `Deleted: ${path}` };
          }
          case 'mkdir': {
            await fs.mkdir(path, { recursive: true });
            return { success: true, message: `Directory created: ${path}` };
          }
          default:
            return { success: false, message: `Unknown file operation: ${operation}` };
        }
      } catch (err) {
        return { success: false, message: `File error: ${(err as Error).message}` };
      }
    });

    // ── Scrape handler (Firecrawl via localhost:3002) ──────────────────
    router.register('scrape', async (intent) => {
      const url = intent.params.url || intent.raw.replace(/^scrape:?\s*/i, '').trim();
      if (!url) return { success: false, message: 'No URL provided.' };
      const format = intent.params.format || 'markdown';

      try {
        const res = await fetch('http://localhost:3002/v1/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: [format], waitFor: 3000 }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `Firecrawl error (${res.status}): ${errText}` };
        }
        const result = await res.json() as any;
        const content = result.data?.[format] || result.data?.markdown || 'No content extracted';
        const truncated = content.length > 5000 ? content.slice(0, 5000) + '\n...[truncated]' : content;
        return { success: true, message: `Scraped ${url} (${content.length} chars):\n\n${truncated}`, data: { url, content, format } };
      } catch (err) {
        return { success: false, message: `Scrape error: ${formatErrorMessage(err)}` };
      }
    });

    // ── Remember handler (Cognee memory) ───────────────────────────────
    router.register('remember', async (intent) => {
      const content = intent.params.content || intent.raw.replace(/^remember:?\s*/i, '').trim();
      if (!content) return { success: false, message: 'Nothing to remember.' };

      try {
        const res = await fetch('http://localhost:3300/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.LIV_API_KEY || '',
          },
          body: JSON.stringify({
            content,
            tags: ['user_memory'],
            source: intent.source,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `Memory error (${res.status}): ${errText}` };
        }
        return { success: true, message: `Saved to memory: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"` };
      } catch (err) {
        return { success: false, message: `Memory error: ${formatErrorMessage(err)}` };
      }
    });

    // ── Agent handler (ReAct loop with complexity-based routing) ─────

    router.register('agent', async (intent) => {
      let task = intent.params.task || intent.raw;
      if (!task) return { success: false, message: 'No task provided for agent.' };

      // Inject conversation history for context-aware responses
      if (intent.params.__history) {
        task = `## Recent Conversation History\n${intent.params.__history}\n\n## Current Task\n${task}`;
      }

      // Fetch relevant memory context for this conversation (best-effort, 2s timeout)
      let memoryContext = '';
      try {
        const memoryFetchWithTimeout = Promise.race([
          fetch('http://localhost:3300/context', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.LIV_API_KEY || '',
            },
            body: JSON.stringify({
              userId: intent.from || 'default',
              query: task.slice(0, 500),
              tokenBudget: 2000,
              limit: 20,
            }),
          }),
          new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        const memRes = await memoryFetchWithTimeout;
        if (memRes.ok) {
          const memData = await memRes.json() as { context: string; memoriesUsed: number };
          if (memData.context && memData.memoriesUsed > 0) {
            memoryContext = memData.context;
            logger.debug('Memory context injected', { memoriesUsed: memData.memoriesUsed });
          }
        }
      } catch {
        // Memory service might be down or timed out — continue without context
      }

      if (memoryContext) {
        task = `${memoryContext}\n${task}`;
      }

      // Complexity assessment — quick flash call to determine routing
      let complexity = 3; // default to moderate
      try {
        const scoreText = await this.config.brain.think({
          prompt: COMPLEXITY_PROMPT + task.slice(0, 500),
          tier: 'flash',
          maxTokens: 5,
        });
        const parsed = parseInt(scoreText.trim());
        if (parsed >= 1 && parsed <= 5) {
          complexity = parsed;
        }
        logger.info('Agent: complexity assessed', { complexity, task: task.slice(0, 80) });
      } catch {
        logger.warn('Agent: complexity assessment failed, defaulting to 3');
      }

      const maxTurns = Math.min(
        intent.params.max_turns ? parseInt(intent.params.max_turns) : parseInt(process.env.AGENT_MAX_TURNS || '30'),
        50, // Hard cap
      );

      // Get user session for personalized settings (thinking, verbose, model)
      let userThinkLevel: ThinkLevel | undefined;
      let userVerboseLevel: VerboseLevel | undefined;
      let userModelTier: ModelTier | undefined;

      if (intent.from && this.config.userSessionManager) {
        try {
          const session = await this.config.userSessionManager.get(intent.from);
          userThinkLevel = session.thinkLevel;
          userVerboseLevel = session.verboseLevel;
          userModelTier = session.modelTier;
          logger.debug('Agent: user session loaded', {
            jid: intent.from,
            thinkLevel: userThinkLevel,
            verboseLevel: userVerboseLevel,
            modelTier: userModelTier,
          });
        } catch {
          // Ignore session errors
        }
      }

      // High complexity (4-5): Give agent more turns and use sonnet tier
      // User's model preference takes priority if set
      const baseTier = complexity >= 4 ? 'sonnet' : ((process.env.AGENT_TIER as any) || 'sonnet');
      const effectiveTier = userModelTier || baseTier;
      const effectiveMaxTurns = complexity >= 4 ? Math.max(maxTurns, 20) : maxTurns;

      const nexusConfig = this.getNexusConfig();
      const approvalPolicy = nexusConfig?.approval?.policy ?? 'destructive';

      // Check if we should use SDK subscription mode
      const claudeProvider = this.config.brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
      const authMethod = claudeProvider ? await claudeProvider.getAuthMethod() : 'api-key';
      const useSdk = authMethod === 'sdk-subscription';

      const agentConfig = {
        brain: this.config.brain,
        toolRegistry: this.config.toolRegistry,
        nexusConfig,
        maxTurns: effectiveMaxTurns,
        maxTokens: parseInt(process.env.AGENT_MAX_TOKENS || '200000'),
        timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '600000'),
        tier: effectiveTier as 'flash' | 'haiku' | 'sonnet' | 'opus',
        maxDepth: parseInt(process.env.AGENT_MAX_DEPTH || '3'),
        onAction: this.buildActionCallback(intent.from, intent.source),
        thinkLevel: userThinkLevel,
        verboseLevel: userVerboseLevel,
        approvalManager: this.config.approvalManager,
        approvalPolicy: approvalPolicy as 'always' | 'destructive' | 'never',
        sessionId: randomUUID(),
      };

      const agent = useSdk
        ? new SdkAgentRunner(agentConfig)
        : new AgentLoop(agentConfig);

      if (useSdk) {
        logger.info('Daemon: using SDK subscription mode for task');
      }

      // For complex tasks (4-5), prepend autonomous guidance context
      let agentTask = task;
      if (complexity >= 4) {
        agentTask = `## Task Complexity: ${complexity}/5 (Complex)
You should approach this methodically:
1. First check memory for any relevant past knowledge (memory_search)
2. If needed, research the topic (web_search, scrape)
3. Plan your approach before executing
4. Verify results after each major step
5. Save learnings to memory when done (memory_add)

${task}`;
      }

      const result = await agent.run(agentTask);

      // Record usage in user session for stats
      if (intent.from && this.config.userSessionManager) {
        const totalTokens = result.totalInputTokens + result.totalOutputTokens;
        await this.config.userSessionManager.recordUsage(intent.from, totalTokens).catch(() => {});
      }

      // Fire-and-forget: enqueue memory extraction for this conversation
      if (this.config.memoryExtractionQueue && result.success) {
        const sessionId = `session_${intent.from || 'web'}_${Date.now()}`;
        this.config.memoryExtractionQueue.add('extract-memories', {
          conversation: task.slice(0, 4000),
          response: result.answer.slice(0, 4000),
          userId: intent.from || 'default',
          sessionId,
          source: intent.source || 'web',
        }, {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        }).catch(err => logger.error('Failed to enqueue memory extraction', { error: (err as Error).message }));
      }

      // For WhatsApp, chunk long responses
      const responseText = result.answer;

      return {
        success: result.success,
        message: responseText,
        data: {
          turns: result.turns,
          complexity,
          inputTokens: result.totalInputTokens,
          outputTokens: result.totalOutputTokens,
          toolCalls: result.toolCalls.map((tc) => ({ tool: tc.tool, params: tc.params, success: tc.result.success })),
          stoppedReason: result.stoppedReason,
        },
      };
    });
  }

  private registerTools() {
    const { toolRegistry, dockerManager, shell } = this.config;

    toolRegistry.register({
      name: 'status',
      description: 'Get Nexus daemon health status (uptime, container count, cycle count)',
      parameters: [],
      execute: async () => {
        const containers = await dockerManager.list();
        const uptime = process.uptime();
        return {
          success: true,
          output: `Nexus uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m. Containers: ${containers.length}. Cycles: ${this.cycleCount}.`,
          data: { uptime, containers: containers.length, cycles: this.cycleCount },
        };
      },
    });

    toolRegistry.register({
      name: 'logs',
      description: 'Read the last N lines from the Nexus daemon log file',
      parameters: [
        { name: 'lines', type: 'number', description: 'Number of log lines to return', required: false, default: 20 },
      ],
      execute: async (params) => {
        const { readFileSync } = await import('fs');
        const lines = (params.lines as number) || 20;
        try {
          const log = readFileSync(path.join(NEXUS_LOGS_DIR, 'nexus.log'), 'utf-8');
          const tail = log.trim().split('\n').slice(-lines);
          return { success: true, output: tail.join('\n') };
        } catch {
          return { success: true, output: 'No logs available yet.' };
        }
      },
    });

    toolRegistry.register({
      name: 'shell',
      description: 'Execute a shell command on the server. Supports any Linux command. Dangerous commands are blocked.',
      parameters: [
        { name: 'cmd', type: 'string', description: 'The shell command to execute', required: true },
        { name: 'timeout', type: 'number', description: 'Timeout in milliseconds', required: false, default: 30000 },
      ],
      execute: async (params) => {
        const cmd = params.cmd as string;
        if (!cmd) return { success: false, output: '', error: 'No command provided.' };
        const result = await shell.execute(cmd, (params.timeout as number) || 30000);
        return {
          success: result.code === 0,
          output: result.stdout || result.stderr || '(no output)',
          error: result.code !== 0 ? `Exit code ${result.code}: ${result.stderr}` : undefined,
          data: result,
        };
      },
    });

    toolRegistry.register({
      name: 'docker_list',
      description: 'List all Docker containers with their current state',
      parameters: [],
      execute: async () => {
        const containers = await dockerManager.list();
        const summary = containers.map((c) => `${c.Names?.[0] || 'unknown'}: ${c.State}`).join('\n');
        return { success: true, output: summary || 'No containers running.' };
      },
    });

    toolRegistry.register({
      name: 'docker_manage',
      description: 'Manage Docker container lifecycle: start, stop, restart, inspect, or get logs',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['start', 'stop', 'restart', 'inspect', 'logs'] },
        { name: 'name', type: 'string', description: 'Container name', required: true },
        { name: 'tail', type: 'number', description: 'Number of log lines (for logs operation)', required: false, default: 100 },
      ],
      execute: async (params) => {
        const { operation, name } = params as { operation: string; name: string };
        if (!name) return { success: false, output: '', error: 'Container name required.' };
        try {
          switch (operation) {
            case 'start': return { success: true, output: await dockerManager.startContainer(name) };
            case 'stop': return { success: true, output: await dockerManager.stopContainer(name) };
            case 'restart': return { success: true, output: await dockerManager.restartContainer(name) };
            case 'inspect': {
              const info = await dockerManager.inspectContainer(name);
              return { success: true, output: JSON.stringify(info, null, 2), data: info };
            }
            case 'logs': {
              const logs = await dockerManager.containerLogs(name, (params.tail as number) || 100);
              return { success: true, output: logs || '(no logs)' };
            }
            default:
              return { success: false, output: '', error: `Unknown operation: ${operation}` };
          }
        } catch (err) {
          return { success: false, output: '', error: `Docker error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'docker_exec',
      description: 'Execute a command inside a running Docker container',
      parameters: [
        { name: 'container', type: 'string', description: 'Container name', required: true },
        { name: 'cmd', type: 'string', description: 'Command to execute inside the container', required: true },
      ],
      execute: async (params) => {
        const { container: containerName, cmd } = params as { container: string; cmd: string };
        if (!containerName || !cmd) return { success: false, output: '', error: 'Container name and command required.' };
        try {
          const containers = await dockerManager.list();
          const target = containers.find((c) => c.Names?.some((n) => n === `/${containerName}` || n === containerName));
          if (!target) return { success: false, output: '', error: `Container not found: ${containerName}` };
          const output = await dockerManager.exec(target.Id, ['sh', '-c', cmd]);
          return { success: true, output: output || '(no output)', data: { container: containerName, output } };
        } catch (err) {
          return { success: false, output: '', error: `Docker exec error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'pm2',
      description: 'Manage Node.js processes via PM2: list, restart, stop, start, reload, logs, status',
      parameters: [
        { name: 'operation', type: 'string', description: 'PM2 operation', required: true, enum: ['list', 'restart', 'stop', 'start', 'reload', 'logs', 'status'] },
        { name: 'name', type: 'string', description: 'Process name (required for restart/stop/start/reload/logs)', required: false },
      ],
      execute: async (params) => {
        const { operation, name } = params as { operation: string; name?: string };
        let cmd: string;
        switch (operation) {
          case 'list': cmd = 'pm2 jlist'; break;
          case 'status': cmd = name ? `pm2 describe ${name}` : 'pm2 status'; break;
          case 'logs': cmd = `pm2 logs ${name || ''} --nostream --lines 50`; break;
          default:
            if (!name) return { success: false, output: '', error: `PM2 ${operation} requires a process name.` };
            cmd = `pm2 ${operation} ${name}`;
        }
        const result = await shell.execute(cmd);
        let output = result.stdout || result.stderr || '(no output)';
        if (operation === 'list') {
          try {
            const procs = JSON.parse(result.stdout);
            output = procs.map((p: any) => `${p.name}: ${p.pm2_env?.status || 'unknown'} (pid: ${p.pid}, cpu: ${p.monit?.cpu || 0}%, mem: ${Math.round((p.monit?.memory || 0) / 1024 / 1024)}MB)`).join('\n');
          } catch { /* keep raw */ }
        }
        return {
          success: result.code === 0,
          output,
          error: result.code !== 0 ? `Exit code ${result.code}` : undefined,
          data: result,
        };
      },
    });

    toolRegistry.register({
      name: 'sysinfo',
      description: 'Get system resource information: CPU, RAM, disk usage, network connections, or full overview',
      parameters: [
        { name: 'topic', type: 'string', description: 'What system info to retrieve', required: false, enum: ['all', 'cpu', 'ram', 'disk', 'network', 'uptime'], default: 'all' },
      ],
      execute: async (params) => {
        const topic = (params.topic as string) || 'all';
        const commands: Record<string, string> = {
          cpu: 'top -bn1 | head -5',
          ram: 'free -h',
          disk: 'df -h',
          network: 'ss -tuln | head -20',
          uptime: 'uptime',
          all: 'echo "=== UPTIME ===" && uptime && echo "\\n=== MEMORY ===" && free -h && echo "\\n=== DISK ===" && df -h && echo "\\n=== TOP PROCESSES ===" && ps aux --sort=-%mem | head -10',
        };
        const cmd = commands[topic] || commands.all;
        const result = await shell.execute(cmd, 15_000);
        return {
          success: result.code === 0,
          output: result.stdout || result.stderr || '(no output)',
          error: result.code !== 0 ? result.stderr : undefined,
          data: result,
        };
      },
    });

    toolRegistry.register({
      name: 'files',
      description: 'File system operations: read, write, list directory, stat, delete, or create directory',
      parameters: [
        { name: 'operation', type: 'string', description: 'File operation to perform', required: true, enum: ['read', 'write', 'list', 'stat', 'delete', 'mkdir'] },
        { name: 'path', type: 'string', description: 'File or directory path', required: true },
        { name: 'content', type: 'string', description: 'Content to write (required for write operation)', required: false },
      ],
      execute: async (params) => {
        const { operation, path, content } = params as { operation: string; path: string; content?: string };
        if (!path) return { success: false, output: '', error: 'File path required.' };
        const fs = await import('fs/promises');
        try {
          switch (operation) {
            case 'read': {
              const data = await fs.readFile(path, 'utf-8');
              const truncated = data.length > 10_000 ? data.slice(0, 10_000) + '\n...[truncated]' : data;
              return { success: true, output: truncated };
            }
            case 'write': {
              if (!content) return { success: false, output: '', error: 'Content required for write operation.' };
              await fs.writeFile(path, content, 'utf-8');
              return { success: true, output: `Written ${content.length} bytes to ${path}` };
            }
            case 'list': {
              const entries = await fs.readdir(path, { withFileTypes: true });
              const listing = entries.map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
              return { success: true, output: listing || '(empty directory)' };
            }
            case 'stat': {
              const stat = await fs.stat(path);
              return {
                success: true,
                output: `Path: ${path}\nSize: ${stat.size} bytes\nType: ${stat.isDirectory() ? 'directory' : 'file'}\nModified: ${stat.mtime.toISOString()}\nPermissions: ${stat.mode.toString(8)}`,
                data: { size: stat.size, isDirectory: stat.isDirectory(), mtime: stat.mtime },
              };
            }
            case 'delete': {
              const stat = await fs.stat(path);
              if (stat.isDirectory()) {
                await fs.rm(path, { recursive: true });
              } else {
                await fs.unlink(path);
              }
              return { success: true, output: `Deleted: ${path}` };
            }
            case 'mkdir': {
              await fs.mkdir(path, { recursive: true });
              return { success: true, output: `Directory created: ${path}` };
            }
            default:
              return { success: false, output: '', error: `Unknown file operation: ${operation}` };
          }
        } catch (err) {
          return { success: false, output: '', error: `File error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'cron',
      description: 'Schedule a task to execute after a delay. The task message re-enters the inbox and gets processed normally. Response will be sent back to the original channel.',
      parameters: [
        { name: 'delay', type: 'number', description: 'Delay amount', required: true },
        { name: 'unit', type: 'string', description: 'Time unit', required: true, enum: ['minutes', 'hours'] },
        { name: 'task', type: 'string', description: 'Task/command to execute when timer fires (goes through normal classification)', required: true },
      ],
      execute: async (params) => {
        const { delay, unit, task } = params as { delay: number; unit: string; task: string };
        const ms = unit === 'hours' ? delay * 3600000 : delay * 60000;
        const msg = task || `Scheduled check triggered (${delay} ${unit} ago)`;
        // Capture current channel context to replay when timer fires
        const ctx = this.currentChannelContext;
        logger.info('Cron tool: context check', { hasContext: !!ctx, source: ctx?.source, chatId: ctx?.chatId });
        const scheduledSource = ctx?.source || 'cron';
        const scheduledFrom = ctx?.chatId;
        const scheduledParams = ctx?.params;
        setTimeout(() => {
          this.addToInbox(msg, scheduledSource as any, undefined, scheduledParams, scheduledFrom);
          logger.info('Cron (tool) fired', { task: msg, source: scheduledSource, from: scheduledFrom });
        }, ms);
        return { success: true, output: `Scheduled: "${msg}" in ${delay} ${unit}. Response will be sent to ${scheduledSource}.` };
      },
    });

    // ── Scrape tool (Firecrawl via localhost:3002) ─────────────────────

    toolRegistry.register({
      name: 'scrape',
      description: 'Scrape a URL and return its content as markdown using Firecrawl. Use this for reading web pages, extracting text, or analyzing websites.',
      parameters: [
        { name: 'url', type: 'string', description: 'The URL to scrape', required: true },
        { name: 'format', type: 'string', description: 'Output format', required: false, enum: ['markdown', 'text', 'html'], default: 'markdown' },
      ],
      execute: async (params) => {
        const { url, format } = params as { url: string; format?: string };
        if (!url) return { success: false, output: '', error: 'URL is required.' };
        const fmt = format || 'markdown';
        try {
          const res = await fetch('http://localhost:3002/v1/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, formats: [fmt], waitFor: 3000 }),
          });
          if (!res.ok) {
            const errText = await res.text();
            return { success: false, output: '', error: `Firecrawl error (${res.status}): ${errText}` };
          }
          const result = await res.json() as any;
          const content = result.data?.[fmt] || result.data?.markdown || 'No content extracted';
          const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n...[truncated]' : content;
          return { success: true, output: truncated, data: { url, contentLength: content.length, format: fmt } };
        } catch (err) {
          return { success: false, output: '', error: `Scrape error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── WhatsApp messaging tool ────────────────────────────────────────

    toolRegistry.register({
      name: 'whatsapp_send',
      description: 'Send a WhatsApp message to a specific contact by name. Use this when the user asks you to message someone (e.g. "send Fei a message", "tell Emre hello"). The message will be delivered to that contact\'s chat.',
      parameters: [
        { name: 'contact', type: 'string', description: 'Contact name (case-insensitive)', required: true },
        { name: 'message', type: 'string', description: 'Message text to send', required: true },
      ],
      execute: async (params) => {
        const { contact, message } = params as { contact: string; message: string };
        if (!contact || !message) return { success: false, output: '', error: 'Contact name and message are required.' };

        try {
          // Look up contact JID from name mapping
          const jid = await this.config.redis.hget('nexus:wa_contacts', contact.toLowerCase());
          if (!jid) {
            // Try partial match
            const allContacts = await this.config.redis.hgetall('nexus:wa_contacts');
            const match = Object.entries(allContacts).find(([name]) =>
              name.includes(contact.toLowerCase()) || contact.toLowerCase().includes(name)
            );
            if (!match) {
              const available = Object.keys(allContacts).join(', ') || 'none';
              return { success: false, output: '', error: `Contact "${contact}" not found. Known contacts: ${available}` };
            }
            // Found partial match
            await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
              jid: match[1],
              text: message,
              timestamp: Date.now(),
            }));
            return { success: true, output: `Message sent to ${match[0]} (${match[1]}): "${message.slice(0, 80)}"` };
          }

          await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
            jid,
            text: message,
            timestamp: Date.now(),
          }));
          return { success: true, output: `Message sent to ${contact} (${jid}): "${message.slice(0, 80)}"` };
        } catch (err) {
          return { success: false, output: '', error: `WhatsApp send error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Memory tools (Cognee integration via localhost:3300) ──────────

    toolRegistry.register({
      name: 'memory_search',
      description: 'Search long-term memory for previously stored knowledge. Use this to recall facts, preferences, past conversations, or any information saved with memory_add.',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query — what are you looking for?', required: true },
        { name: 'limit', type: 'number', description: 'Max results to return', required: false, default: 5 },
      ],
      execute: async (params) => {
        const { query, limit } = params as { query: string; limit?: number };
        if (!query) return { success: false, output: '', error: 'Query is required.' };
        try {
          const res = await fetch('http://localhost:3300/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.LIV_API_KEY || '',
            },
            body: JSON.stringify({ query, limit: limit || 5 }),
          });
          if (!res.ok) {
            const errText = await res.text();
            return { success: false, output: '', error: `Memory search failed (${res.status}): ${errText}` };
          }
          const data = await res.json() as any;
          const results = data?.data?.results || data?.results || [];
          if (results.length === 0) {
            return { success: true, output: 'No memories found for this query.' };
          }
          const formatted = results
            .map((r: any, i: number) => {
              // Cognee returns {search_result: [...], dataset_id, ...}
              const content = Array.isArray(r.search_result) ? r.search_result.join(', ') : (r.content || r.search_result || JSON.stringify(r));
              const score = r.score ? ` (relevance: ${(r.score * 100).toFixed(0)}%)` : '';
              const tags = r.tags?.length ? ` [tags: ${r.tags.join(', ')}]` : '';
              return `[${i + 1}] ${content}${score}${tags}`;
            })
            .join('\n\n');
          return { success: true, output: formatted, data: results };
        } catch (err) {
          return { success: false, output: '', error: `Memory search error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'memory_add',
      description: 'Store information in long-term memory for future retrieval. Use this to remember facts, user preferences, important events, or any knowledge worth retaining.',
      parameters: [
        { name: 'content', type: 'string', description: 'The information to remember', required: true },
        { name: 'tags', type: 'string', description: 'Comma-separated tags for categorization (e.g. "user_pref,server,config")', required: false },
        { name: 'source', type: 'string', description: 'Where this info came from (e.g. "whatsapp", "agent", "user")', required: false },
      ],
      execute: async (params) => {
        const { content, tags, source } = params as { content: string; tags?: string; source?: string };
        if (!content) return { success: false, output: '', error: 'Content is required.' };
        try {
          const tagList = tags ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
          const res = await fetch('http://localhost:3300/add', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.LIV_API_KEY || '',
            },
            body: JSON.stringify({ content, tags: tagList, source: source || 'daemon' }),
          });
          if (!res.ok) {
            const errText = await res.text();
            return { success: false, output: '', error: `Memory add failed (${res.status}): ${errText}` };
          }
          return { success: true, output: `Remembered: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"` };
        } catch (err) {
          return { success: false, output: '', error: `Memory add error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Web Search tool (Google via Firecrawl scraping) ───────────────

    toolRegistry.register({
      name: 'web_search',
      description: 'Search Google for any query and return results as markdown. Use this to research topics, find documentation, discover tools, or gather information before executing tasks.',
      parameters: [
        { name: 'query', type: 'string', description: 'The search query', required: true },
        { name: 'max_results', type: 'number', description: 'Max results to return (1-10)', required: false, default: 5 },
      ],
      execute: async (params) => {
        const { query, max_results } = params as { query: string; max_results?: number };
        if (!query) return { success: false, output: '', error: 'Search query is required.' };

        const numResults = Math.min(Math.max(max_results || 5, 1), 10);
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}`;

        try {
          const res = await fetch('http://localhost:3002/v1/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: searchUrl,
              formats: ['markdown'],
              waitFor: 3000,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            return { success: false, output: '', error: `Search scrape error (${res.status}): ${errText}` };
          }

          const result = await res.json() as any;
          const content = result.data?.markdown || 'No search results extracted';
          const truncated = content.length > 6000 ? content.slice(0, 6000) + '\n...[truncated]' : content;
          return { success: true, output: `Search results for "${query}":\n\n${truncated}`, data: { query, contentLength: content.length } };
        } catch (err) {
          return { success: false, output: '', error: `Web search error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Task State tool (Redis-backed persistent state) ───────────────

    toolRegistry.register({
      name: 'task_state',
      description: 'Save, load, list, or delete persistent state for multi-phase workflows. Use this to store research findings, plans, intermediate results across agent phases.',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['save', 'load', 'list', 'delete'] },
        { name: 'key', type: 'string', description: 'State key name', required: true },
        { name: 'data', type: 'string', description: 'JSON string data to save (required for save operation)', required: false },
        { name: 'ttl', type: 'number', description: 'Time-to-live in seconds (default: 86400 = 24h)', required: false, default: 86400 },
      ],
      execute: async (params) => {
        const { operation, key, data, ttl } = params as { operation: string; key: string; data?: string; ttl?: number };
        if (!key && operation !== 'list') return { success: false, output: '', error: 'Key is required.' };

        const prefix = 'nexus:task_state:';
        const redis = this.config.redis;

        try {
          switch (operation) {
            case 'save': {
              if (!data) return { success: false, output: '', error: 'Data is required for save operation.' };
              await redis.set(`${prefix}${key}`, data, 'EX', ttl || 86400);
              return { success: true, output: `State saved: ${key} (${data.length} bytes, TTL: ${ttl || 86400}s)` };
            }
            case 'load': {
              const value = await redis.get(`${prefix}${key}`);
              if (!value) return { success: true, output: `No state found for key: ${key}` };
              return { success: true, output: value, data: { key, size: value.length } };
            }
            case 'list': {
              const keys = await redis.keys(`${prefix}${key || '*'}`);
              const names = keys.map((k) => k.replace(prefix, ''));
              return { success: true, output: names.length > 0 ? names.join('\n') : 'No saved states found.' };
            }
            case 'delete': {
              await redis.del(`${prefix}${key}`);
              return { success: true, output: `State deleted: ${key}` };
            }
            default:
              return { success: false, output: '', error: `Unknown operation: ${operation}` };
          }
        } catch (err) {
          return { success: false, output: '', error: `Task state error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Progress Report tool (WhatsApp interim updates) ───────────────

    toolRegistry.register({
      name: 'progress_report',
      description: 'Send a WhatsApp progress update during long-running tasks without ending the agent loop. Use this to keep the user informed about multi-step operations.',
      parameters: [
        { name: 'message', type: 'string', description: 'Progress message to send', required: true },
        { name: 'jid', type: 'string', description: 'WhatsApp JID to send to (auto-detected if from WhatsApp context)', required: false },
      ],
      execute: async (params) => {
        const { message, jid } = params as { message: string; jid?: string };
        if (!message) return { success: false, output: '', error: 'Message is required.' };

        const targetJid = jid || this.currentWhatsAppJid;
        if (!targetJid) {
          return { success: true, output: `Progress (no WhatsApp target): ${message}` };
        }

        try {
          await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
            jid: targetJid,
            text: message,
            timestamp: Date.now(),
          }));
          return { success: true, output: `Progress sent: ${message.slice(0, 100)}` };
        } catch (err) {
          return { success: false, output: '', error: `Progress report error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Subagent Management Tools ─────────────────────────────────────

    toolRegistry.register({
      name: 'subagent_create',
      description: 'Create a new persistent subagent with a specific role, tools, and optional schedule or loop. Subagents run autonomously on tasks.',
      parameters: [
        { name: 'id', type: 'string', description: 'Unique ID (kebab-case, e.g. "lead-finder")', required: true },
        { name: 'name', type: 'string', description: 'Display name', required: true },
        { name: 'description', type: 'string', description: 'What this subagent does', required: true },
        { name: 'skills', type: 'string', description: 'Comma-separated skill names or "*" for all', required: false },
        { name: 'system_prompt', type: 'string', description: 'Custom system prompt for the subagent', required: false },
        { name: 'schedule', type: 'string', description: 'Cron expression (e.g. "0 9 * * MON-FRI" for weekdays at 9am)', required: false },
        { name: 'timezone', type: 'string', description: 'IANA timezone for schedule (e.g. "Europe/Istanbul")', required: false },
        { name: 'scheduled_task', type: 'string', description: 'Task to execute on schedule trigger', required: false },
        { name: 'loop_interval_ms', type: 'number', description: 'Loop interval in ms (for continuous execution)', required: false },
        { name: 'loop_task', type: 'string', description: 'Task to execute each loop iteration', required: false },
        { name: 'loop_max_iterations', type: 'number', description: 'Max loop iterations (0 = unlimited)', required: false },
        { name: 'tier', type: 'string', description: 'Model tier: flash, sonnet, or opus', required: false, enum: ['flash', 'sonnet', 'opus'] },
        { name: 'max_turns', type: 'number', description: 'Max agent turns per execution', required: false },
      ],
      execute: async (params) => {
        const { id, name, description, skills, system_prompt, schedule, timezone, scheduled_task,
                loop_interval_ms, loop_task, loop_max_iterations, tier, max_turns } = params as Record<string, any>;

        if (!id || !name || !description) {
          return { success: false, output: '', error: 'id, name, and description are required.' };
        }

        try {
          const config = await this.config.subagentManager.create({
            id,
            name,
            description,
            skills: skills ? skills.split(',').map((s: string) => s.trim()) : ['*'],
            systemPrompt: system_prompt,
            schedule,
            timezone,
            scheduledTask: scheduled_task,
            loop: loop_interval_ms && loop_task ? {
              intervalMs: loop_interval_ms,
              task: loop_task,
              maxIterations: loop_max_iterations || undefined,
            } : undefined,
            tier: tier || 'sonnet',
            maxTurns: max_turns || 15,
            status: 'active',
            createdBy: this.currentWhatsAppJid || 'system',
          });

          // Register schedule if provided
          if (config.schedule && config.scheduledTask) {
            await this.config.scheduleManager.addSchedule({
              subagentId: config.id,
              task: config.scheduledTask,
              cron: config.schedule,
              timezone: config.timezone,
            });
          }

          // Start loop if configured
          if (config.loop) {
            await this.config.loopRunner.start(config);
          }

          let output = `Subagent "${name}" (${id}) created.`;
          if (config.schedule) output += ` Schedule: ${config.schedule}`;
          if (config.loop) output += ` Loop: every ${config.loop.intervalMs}ms`;
          return { success: true, output };
        } catch (err) {
          return { success: false, output: '', error: `Create subagent error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'subagent_list',
      description: 'List all subagents with their status, schedule, and run history',
      parameters: [],
      execute: async () => {
        try {
          const agents = await this.config.subagentManager.list();
          if (agents.length === 0) {
            return { success: true, output: 'No subagents created yet.' };
          }
          const output = agents.map((a) => {
            let line = `${a.name} (${a.id}): ${a.status}`;
            if (a.schedule) line += ` | schedule: ${a.schedule}`;
            line += ` | runs: ${a.runCount}`;
            if (a.lastRunAt) line += ` | last: ${new Date(a.lastRunAt).toISOString()}`;
            return line;
          }).join('\n');

          // Also show active loops
          const loops = this.config.loopRunner.listActive();
          const loopInfo = loops.length > 0
            ? `\n\nActive loops:\n${loops.map((l) => `  ${l.subagentId}: iteration ${l.iteration}, every ${l.intervalMs}ms`).join('\n')}`
            : '';

          return { success: true, output: output + loopInfo, data: { agents, loops } };
        } catch (err) {
          return { success: false, output: '', error: `List subagents error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'subagent_message',
      description: 'Send a message/task to a specific subagent for execution. The subagent will process it with its own context and tools.',
      parameters: [
        { name: 'id', type: 'string', description: 'Subagent ID', required: true },
        { name: 'message', type: 'string', description: 'Message or task for the subagent', required: true },
      ],
      execute: async (params) => {
        const { id, message } = params as { id: string; message: string };
        if (!id || !message) return { success: false, output: '', error: 'id and message are required.' };

        try {
          const result = await this.executeSubagentTask(id, message);
          return { success: true, output: result };
        } catch (err) {
          return { success: false, output: '', error: `Subagent message error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'subagent_schedule',
      description: 'Manage subagent schedules: add, remove, or list cron-based recurring tasks',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['add', 'remove', 'list'] },
        { name: 'id', type: 'string', description: 'Subagent ID (required for add/remove)', required: false },
        { name: 'cron', type: 'string', description: 'Cron expression (required for add)', required: false },
        { name: 'task', type: 'string', description: 'Task to execute on schedule (required for add)', required: false },
        { name: 'timezone', type: 'string', description: 'IANA timezone (e.g. "Europe/Istanbul")', required: false },
      ],
      execute: async (params) => {
        const { operation, id, cron, task, timezone } = params as Record<string, any>;

        try {
          switch (operation) {
            case 'add': {
              if (!id || !cron || !task) {
                return { success: false, output: '', error: 'id, cron, and task are required for add.' };
              }
              await this.config.scheduleManager.addSchedule({ subagentId: id, task, cron, timezone });
              await this.config.subagentManager.update(id, { schedule: cron, scheduledTask: task, timezone });
              return { success: true, output: `Schedule set for ${id}: "${cron}" → "${task}"` };
            }
            case 'remove': {
              if (!id) return { success: false, output: '', error: 'id is required for remove.' };
              await this.config.scheduleManager.removeSchedule(id);
              await this.config.subagentManager.update(id, { schedule: undefined, scheduledTask: undefined });
              return { success: true, output: `Schedule removed for ${id}` };
            }
            case 'list': {
              const schedules = await this.config.scheduleManager.listSchedules();
              if (schedules.length === 0) return { success: true, output: 'No active schedules.' };
              const output = schedules.map((s) =>
                `${s.subagentId}: ${s.cron}${s.next ? ` (next: ${s.next})` : ''}`
              ).join('\n');
              return { success: true, output, data: schedules };
            }
            default:
              return { success: false, output: '', error: `Unknown operation: ${operation}` };
          }
        } catch (err) {
          return { success: false, output: '', error: `Schedule error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'skill_generate',
      description: 'Generate a new AI skill file from a description. The AI will create a complete TypeScript skill with proper frontmatter, triggers, and handler.',
      parameters: [
        { name: 'description', type: 'string', description: 'What the skill should do', required: true },
        { name: 'name', type: 'string', description: 'Skill name (kebab-case)', required: false },
        { name: 'triggers', type: 'string', description: 'Comma-separated trigger patterns', required: false },
        { name: 'tools', type: 'string', description: 'Comma-separated tool names the skill needs', required: false },
      ],
      execute: async (params) => {
        const { description, name, triggers, tools } = params as Record<string, any>;
        if (!description) return { success: false, output: '', error: 'Description is required.' };

        try {
          const result = await this.config.skillGenerator.generate({
            description,
            name,
            triggers: triggers ? triggers.split(',').map((t: string) => t.trim()) : undefined,
            tools: tools ? tools.split(',').map((t: string) => t.trim()) : undefined,
          });

          if (result.success) {
            return { success: true, output: `Skill generated: ${result.filePath}` };
          }
          return { success: false, output: '', error: `Skill generation failed: ${result.error}` };
        } catch (err) {
          return { success: false, output: '', error: `Skill generate error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'loop_manage',
      description: 'Manage subagent loops: start, stop, or list continuous execution loops',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['start', 'stop', 'list', 'status'] },
        { name: 'id', type: 'string', description: 'Subagent ID (required for start/stop/status)', required: false },
      ],
      execute: async (params) => {
        const { operation, id } = params as { operation: string; id?: string };

        try {
          switch (operation) {
            case 'start': {
              if (!id) return { success: false, output: '', error: 'Subagent ID required.' };
              const config = await this.config.subagentManager.get(id);
              if (!config) return { success: false, output: '', error: `Subagent "${id}" not found.` };
              if (!config.loop) return { success: false, output: '', error: `Subagent "${id}" has no loop config.` };
              await this.config.loopRunner.start(config);
              return { success: true, output: `Loop started for ${id}` };
            }
            case 'stop': {
              if (!id) return { success: false, output: '', error: 'Subagent ID required.' };
              this.config.loopRunner.stopOne(id);
              return { success: true, output: `Loop stopped for ${id}` };
            }
            case 'list': {
              const loops = this.config.loopRunner.listActive();
              if (loops.length === 0) return { success: true, output: 'No active loops.' };
              const output = loops.map((l) =>
                `${l.subagentId}: iteration ${l.iteration}, every ${l.intervalMs}ms, running: ${l.running}`
              ).join('\n');
              return { success: true, output, data: loops };
            }
            case 'status': {
              if (!id) return { success: false, output: '', error: 'Subagent ID required.' };
              const state = await this.config.loopRunner.getState(id);
              const loops = this.config.loopRunner.listActive();
              const active = loops.find((l) => l.subagentId === id);
              return {
                success: true,
                output: active
                  ? `Loop ${id}: iteration ${active.iteration}, every ${active.intervalMs}ms\nState: ${state?.slice(0, 2000) || '(no state)'}`
                  : `Loop ${id}: not running\nLast state: ${state?.slice(0, 2000) || '(no state)'}`,
              };
            }
            default:
              return { success: false, output: '', error: `Unknown operation: ${operation}` };
          }
        } catch (err) {
          return { success: false, output: '', error: `Loop manage error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── MCP Marketplace + Manager Tools ──────────────────────────────

    toolRegistry.register({
      name: 'mcp_registry_search',
      description: 'Search the official MCP Registry for available servers to install. Use this to discover MCP tools and integrations.',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query (e.g. "filesystem", "github", "slack")', required: false },
        { name: 'limit', type: 'number', description: 'Max results to return (default 10)', required: false, default: 10 },
      ],
      execute: async (params) => {
        const registry = this.config.mcpRegistryClient;
        if (!registry) return { success: false, output: '', error: 'MCP Registry client not configured.' };

        try {
          const result = await registry.search(
            params.query as string | undefined,
            undefined,
            (params.limit as number) || 10,
          );

          if (!result.servers || result.servers.length === 0) {
            return { success: true, output: 'No servers found matching the query.' };
          }

          const formatted = result.servers.map((s, i) => {
            let line = `[${i + 1}] ${s.name}`;
            if (s.description) line += ` — ${s.description}`;
            if (s.packages?.length) {
              const pkg = s.packages[0];
              line += ` (${pkg.registryType}: ${pkg.identifier})`;
            }
            return line;
          }).join('\n');

          return {
            success: true,
            output: `Found ${result.servers.length} servers:\n\n${formatted}`,
            data: result,
          };
        } catch (err) {
          return { success: false, output: '', error: `Registry search error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'mcp_install',
      description: 'Install an MCP server from the registry or manually. After install, the server connects automatically and its tools become available.',
      parameters: [
        { name: 'name', type: 'string', description: 'Server name (kebab-case identifier)', required: true },
        { name: 'transport', type: 'string', description: 'Transport type', required: true, enum: ['stdio', 'streamableHttp'] },
        { name: 'command', type: 'string', description: 'Command to spawn (stdio transport, e.g. "npx")', required: false },
        { name: 'args', type: 'string', description: 'Comma-separated arguments (stdio transport, e.g. "-y,@modelcontextprotocol/server-filesystem,/tmp")', required: false },
        { name: 'url', type: 'string', description: 'Server URL (streamableHttp transport)', required: false },
        { name: 'env', type: 'string', description: 'Environment variables as KEY=VALUE pairs separated by commas', required: false },
        { name: 'description', type: 'string', description: 'What this server does', required: false },
        { name: 'installed_from', type: 'string', description: 'Registry identifier (auto-set when installing from registry)', required: false },
      ],
      execute: async (params) => {
        const configMgr = this.config.mcpConfigManager;
        if (!configMgr) return { success: false, output: '', error: 'MCP Config Manager not configured.' };

        const name = params.name as string;
        const transport = params.transport as 'stdio' | 'streamableHttp';

        if (transport === 'stdio' && !params.command) {
          return { success: false, output: '', error: 'stdio transport requires a "command" parameter.' };
        }
        if (transport === 'streamableHttp' && !params.url) {
          return { success: false, output: '', error: 'streamableHttp transport requires a "url" parameter.' };
        }

        // Parse env vars
        let env: Record<string, string> | undefined;
        if (params.env) {
          env = {};
          for (const pair of (params.env as string).split(',')) {
            const [key, ...rest] = pair.trim().split('=');
            if (key && rest.length > 0) env[key.trim()] = rest.join('=').trim();
          }
        }

        try {
          await configMgr.installServer({
            name,
            transport,
            command: params.command as string | undefined,
            args: params.args ? (params.args as string).split(',').map((a) => a.trim()) : undefined,
            url: params.url as string | undefined,
            env,
            enabled: true,
            description: params.description as string | undefined,
            installedFrom: params.installed_from as string | undefined,
            installedAt: Date.now(),
          });

          return { success: true, output: `MCP server "${name}" installed and will connect shortly.` };
        } catch (err) {
          return { success: false, output: '', error: `Install error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'mcp_list',
      description: 'List all installed MCP servers with their status, transport type, and discovered tools.',
      parameters: [],
      execute: async () => {
        const configMgr = this.config.mcpConfigManager;
        const clientMgr = this.config.mcpClientManager;
        if (!configMgr) return { success: false, output: '', error: 'MCP Config Manager not configured.' };

        try {
          const servers = await configMgr.listServers();
          if (servers.length === 0) {
            return { success: true, output: 'No MCP servers installed.' };
          }

          const statuses = clientMgr ? await clientMgr.getAllStatuses() : {};

          const formatted = servers.map((s) => {
            const status = statuses[s.name];
            const statusDot = status?.running ? 'RUNNING' : 'STOPPED';
            const toolCount = status?.tools?.length || 0;
            let line = `${s.name}: ${statusDot} | ${s.transport} | ${s.enabled ? 'enabled' : 'disabled'} | ${toolCount} tools`;
            if (s.description) line += ` | ${s.description}`;
            if (status?.lastError) line += ` | error: ${status.lastError}`;
            return line;
          }).join('\n');

          return { success: true, output: formatted, data: { servers, statuses } };
        } catch (err) {
          return { success: false, output: '', error: `List error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'mcp_manage',
      description: 'Manage an installed MCP server: restart, enable, disable, or remove it.',
      parameters: [
        { name: 'name', type: 'string', description: 'Server name', required: true },
        { name: 'action', type: 'string', description: 'Action to perform', required: true, enum: ['restart', 'enable', 'disable', 'remove'] },
      ],
      execute: async (params) => {
        const configMgr = this.config.mcpConfigManager;
        const clientMgr = this.config.mcpClientManager;
        if (!configMgr) return { success: false, output: '', error: 'MCP Config Manager not configured.' };

        const name = params.name as string;
        const action = params.action as string;

        try {
          switch (action) {
            case 'restart': {
              if (!clientMgr) return { success: false, output: '', error: 'MCP Client Manager not configured.' };
              await clientMgr.restartServer(name);
              return { success: true, output: `MCP server "${name}" restarted.` };
            }
            case 'enable': {
              const updated = await configMgr.updateServer(name, { enabled: true });
              if (!updated) return { success: false, output: '', error: `Server "${name}" not found.` };
              return { success: true, output: `MCP server "${name}" enabled.` };
            }
            case 'disable': {
              const updated = await configMgr.updateServer(name, { enabled: false });
              if (!updated) return { success: false, output: '', error: `Server "${name}" not found.` };
              return { success: true, output: `MCP server "${name}" disabled.` };
            }
            case 'remove': {
              const removed = await configMgr.removeServer(name);
              if (!removed) return { success: false, output: '', error: `Server "${name}" not found.` };
              return { success: true, output: `MCP server "${name}" removed.` };
            }
            default:
              return { success: false, output: '', error: `Unknown action: ${action}` };
          }
        } catch (err) {
          return { success: false, output: '', error: `Manage error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'mcp_config_raw',
      description: 'Get or set the raw JSON configuration for all MCP servers. Use "get" to read, "set" to write.',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['get', 'set'] },
        { name: 'json', type: 'string', description: 'JSON config to save (required for "set")', required: false },
      ],
      execute: async (params) => {
        const configMgr = this.config.mcpConfigManager;
        if (!configMgr) return { success: false, output: '', error: 'MCP Config Manager not configured.' };

        const operation = params.operation as string;

        try {
          if (operation === 'get') {
            const raw = await configMgr.getRawConfig();
            return { success: true, output: raw };
          }
          if (operation === 'set') {
            if (!params.json) return { success: false, output: '', error: 'JSON config is required for "set".' };
            await configMgr.setRawConfig(params.json as string);
            return { success: true, output: 'MCP config updated. Servers will reconcile shortly.' };
          }
          return { success: false, output: '', error: `Unknown operation: ${operation}` };
        } catch (err) {
          return { success: false, output: '', error: `Config error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // Mark destructive tools for human-in-the-loop approval
    const destructiveTools = ['shell']; // Shell can run rm, kill, etc.
    for (const toolName of destructiveTools) {
      const tool = toolRegistry.get(toolName);
      if (tool) {
        tool.requiresApproval = true;
        logger.info(`Marked tool "${toolName}" as requiresApproval`);
      }
    }
  }

  /** Write response to WhatsApp — uses pending channel if available, otherwise pushes to outbox.
   *  Long messages are automatically chunked for WhatsApp's message size limits.
   *  When action feed messages were sent during execution, routes the main response
   *  through the outbox too (preserving FIFO order) and signals the polling channel. */
  private async sendWhatsAppResponse(item: InboxItem, text: string) {
    if (item.source !== 'whatsapp' || !item.from) return;
    try {
      const channel = await this.config.redis.get(`nexus:wa_pending:${item.from}`);
      const chunks = chunkForWhatsApp(text);

      if (channel && this.actionMessageCount > 0) {
        // Action feed messages were sent via outbox during execution.
        // Route main response through outbox too so it arrives AFTER action messages.
        // (lpush + rpop = FIFO: older action messages get rpop'd first, then this response)
        for (let i = 0; i < chunks.length; i++) {
          await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
            jid: item.from,
            text: chunks[i],
            timestamp: Date.now() + i,
          }));
        }
        // Signal the polling channel to stop waiting (bot recognizes this marker)
        await this.config.redis.set(channel, '__OUTBOX_DELIVERY__', 'EX', 30);
        logger.info('WhatsApp response sent (outbox, after action feed)', {
          from: item.from, chunks: chunks.length, actionMessages: this.actionMessageCount,
        });
      } else if (channel) {
        // No action messages — use fast polling channel for immediate delivery
        await this.config.redis.set(channel, chunks[0], 'EX', 660);
        for (let i = 1; i < chunks.length; i++) {
          await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
            jid: item.from,
            text: chunks[i],
            timestamp: Date.now() + i,
          }));
        }
        logger.info('WhatsApp response sent (channel)', { from: item.from, chunks: chunks.length });
      } else {
        // No polling channel — push to outbox (for scheduled/cron tasks)
        for (let i = 0; i < chunks.length; i++) {
          await this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
            jid: item.from,
            text: chunks[i],
            timestamp: Date.now() + i,
          }));
        }
        logger.info('WhatsApp response sent (outbox)', { from: item.from, chunks: chunks.length });
      }
    } catch (err) {
      logger.error('WhatsApp response error', { error: formatErrorMessage(err) });
    }
  }

  /** Send response via channel (Telegram, Discord, Slack, Matrix).
   *  Uses the ChannelManager to route messages to the appropriate platform.
   *
   *  CHAN-05: Response routing uses per-request context (source, chatId from InboxItem)
   *  to prevent race conditions when multiple channels send concurrent messages.
   *  Do NOT replace item.source/item.from with instance state (this.currentChannelContext, etc.). */
  private async sendChannelResponse(item: InboxItem, text: string) {
    // Skip if not a channel source or no chatId
    const channelSources = ['telegram', 'discord', 'slack', 'matrix'] as const;
    if (!channelSources.includes(item.source as any) || !item.from) return;

    try {
      const channelManager = this.config.channelManager;
      if (!channelManager) {
        logger.warn('ChannelManager not available for response', { source: item.source });
        return;
      }

      // Get replyToMessageId from params if available
      const replyTo = item.params?.replyToMessageId;

      // Send via the appropriate channel
      const success = await channelManager.sendMessage(
        item.source as 'telegram' | 'discord' | 'slack' | 'matrix',
        item.from,
        text,
        replyTo
      );

      if (success) {
        logger.info('Channel response sent', { channel: item.source, chatId: item.from });
      } else {
        logger.error('Channel response failed', { channel: item.source, chatId: item.from });
      }
    } catch (err) {
      logger.error('Channel response error', { channel: item.source, error: formatErrorMessage(err) });
    }
  }

  /** Fetch recent WhatsApp conversation history for context.
   *  Merges messages from ALL chats because Baileys v7 uses different JIDs
   *  (@lid vs @s.whatsapp.net) for incoming vs outgoing in the same chat.
   */
  private async getWhatsAppHistory(jid: string): Promise<string> {
    try {
      // Fetch from ALL history keys and merge by timestamp
      const keys = await this.config.redis.keys('nexus:wa_history:*');
      if (keys.length === 0) return '';

      const allEntries: Array<{ role: string; text: string; sender?: string; ts: number; chat: string }> = [];

      for (const key of keys) {
        const chatId = key.replace('nexus:wa_history:', '');
        const items = await this.config.redis.lrange(key, 0, 29);
        for (const item of items) {
          try {
            const parsed = JSON.parse(item);
            allEntries.push({ ...parsed, chat: chatId });
          } catch { /* skip malformed */ }
        }
      }

      if (allEntries.length === 0) return '';

      // Sort by timestamp, oldest first
      allEntries.sort((a, b) => (a.ts || 0) - (b.ts || 0));

      // Take last 30 messages
      const recent = allEntries.slice(-30);

      return recent
        .map((e) => {
          if (e.role === 'contact') {
            const name = e.sender || 'Contact';
            return `${name}: ${e.text}`;
          }
          if (e.role === 'assistant') return `Nexus: ${e.text}`;
          return `User: ${e.text}`;
        })
        .filter(Boolean)
        .join('\n');
    } catch (err) {
      logger.error('Failed to fetch WhatsApp history', { error: formatErrorMessage(err) });
      return '';
    }
  }

  /** Save a conversation turn to WhatsApp history */
  private async saveWhatsAppTurn(jid: string, userMsg: string, response: string) {
    try {
      const key = `nexus:wa_history:${jid}`;
      // Push user message and response (newest first via lpush)
      await this.config.redis.lpush(key,
        JSON.stringify({ role: 'assistant', text: response.slice(0, 2000), ts: Date.now() }),
        JSON.stringify({ role: 'user', text: userMsg.slice(0, 500), ts: Date.now() }),
      );
      // Keep only last 40 entries (20 turns) and set TTL of 24h
      await this.config.redis.ltrim(key, 0, 39);
      await this.config.redis.expire(key, 86400);
    } catch (err) {
      logger.error('Failed to save WhatsApp turn', { error: formatErrorMessage(err) });
    }
  }

  /** Build an onAction callback that sends live action updates to the appropriate channel.
   *
   *  CHAN-05: Uses per-request closure context (chatId, source parameters) for routing,
   *  not instance state. Each inbox item creates its own callback with its own routing context.
   *  Do NOT replace these parameters with this.currentChannelContext or similar instance state. */
  private buildActionCallback(chatId?: string, source?: Intent['source']) {
    if (!chatId) return undefined;
    return (action: {
      type: 'thinking' | 'tool_call' | 'final_answer';
      tool?: string;
      params?: Record<string, unknown>;
      thought?: string;
      success?: boolean;
      output?: string;
      turn: number;
      answer?: string;
    }) => {
      let line: string;

      if (action.type === 'thinking' && action.thought) {
        // Show AI reasoning before tool execution
        const thought = action.thought.length > 200 ? action.thought.slice(0, 200) + '...' : action.thought;
        line = `[Step ${action.turn}] ${thought}`;
      } else if (action.type === 'tool_call' && action.tool) {
        // Show tool call result after execution
        const paramSummary = action.params
          ? Object.entries(action.params).map(([k, v]) => {
              const val = typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60);
              return `${k}=${val}`;
            }).join(', ')
          : '';
        const status = action.success ? '✓' : '✗';
        line = `  ↳ ${action.tool}(${paramSummary.slice(0, 80)}) ${status}`;
      } else if (action.type === 'final_answer') {
        line = `[Done] Completed in ${action.turn} turns`;
      } else {
        return; // Unknown type, skip
      }

      this.actionMessageCount++;

      // Route to appropriate channel
      const channelSources = ['telegram', 'discord', 'slack', 'matrix'] as const;
      if (source && channelSources.includes(source as any) && this.config.channelManager) {
        // Send via channel manager for Telegram/Discord/Slack/Matrix
        this.config.channelManager.sendMessage(
          source as 'telegram' | 'discord' | 'slack' | 'matrix',
          chatId,
          line
        ).catch(() => {});
      } else {
        // Default: send via WhatsApp outbox
        this.config.redis.lpush('nexus:wa_outbox', JSON.stringify({
          jid: chatId,
          text: line,
          timestamp: Date.now(),
        })).catch(() => {});
      }
    };
  }

  /** Execute a task as a specific subagent with its own context and system prompt */
  private async executeSubagentTask(subagentId: string, task: string, previousState?: string): Promise<string> {
    const config = await this.config.subagentManager.get(subagentId);
    if (!config) throw new Error(`Subagent "${subagentId}" not found.`);
    if (config.status !== 'active') throw new Error(`Subagent "${subagentId}" is ${config.status}.`);

    // Get conversation history for context
    const history = await this.config.subagentManager.getHistoryContext(subagentId, 10);

    // Build scoped tool registry
    const scopedRegistry = new ToolRegistry();
    for (const toolName of config.skills.includes('*') ? this.config.toolRegistry.list() : config.skills) {
      const tool = this.config.toolRegistry.get(toolName);
      if (tool) scopedRegistry.register(tool);
    }

    // Ensure basic tools are always available
    for (const basicTool of ['memory_search', 'memory_add', 'progress_report']) {
      if (!scopedRegistry.get(basicTool)) {
        const tool = this.config.toolRegistry.get(basicTool);
        if (tool) scopedRegistry.register(tool);
      }
    }

    const systemPrompt = config.systemPrompt
      ? subagentPrompt(config.name, config.systemPrompt, scopedRegistry.listForPrompt())
      : subagentPrompt(config.name, config.description, scopedRegistry.listForPrompt());

    let contextPrefix = '';
    if (history) {
      contextPrefix += `## Previous Conversation\n${history}\n\n`;
    }
    if (previousState) {
      contextPrefix += `## Previous State\n${previousState}\n\n`;
    }

    // Fetch relevant memory context for subagent (best-effort, 2s timeout, smaller budget)
    try {
      const memoryFetchWithTimeout = Promise.race([
        fetch('http://localhost:3300/context', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.LIV_API_KEY || '',
          },
          body: JSON.stringify({
            userId: 'default',
            query: task.slice(0, 500),
            tokenBudget: 1000,
            limit: 10,
          }),
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      const memRes = await memoryFetchWithTimeout;
      if (memRes.ok) {
        const memData = await memRes.json() as { context: string; memoriesUsed: number };
        if (memData.context && memData.memoriesUsed > 0) {
          contextPrefix += `${memData.context}\n\n`;
        }
      }
    } catch { /* memory service might be down */ }

    const subNexusConfig = this.getNexusConfig();
    const subApprovalPolicy = subNexusConfig?.approval?.policy ?? 'destructive';

    // Use SDK subscription mode if authenticated, same as main agent
    const claudeProvider = this.config.brain.getProviderManager().getProvider('claude') as ClaudeProvider | undefined;
    const subAuthMethod = claudeProvider ? await claudeProvider.getAuthMethod() : 'api-key';
    const useSubSdk = subAuthMethod === 'sdk-subscription';

    const agentConfig = {
      brain: this.config.brain,
      toolRegistry: scopedRegistry,
      nexusConfig: subNexusConfig,
      maxTurns: config.maxTurns,
      maxTokens: 300_000,
      timeoutMs: 600_000,
      tier: config.tier as 'flash' | 'haiku' | 'sonnet' | 'opus',
      systemPromptOverride: systemPrompt,
      contextPrefix: contextPrefix || undefined,
      approvalManager: this.config.approvalManager,
      approvalPolicy: subApprovalPolicy as 'always' | 'destructive' | 'never',
      sessionId: randomUUID(),
    };

    const agent = useSubSdk
      ? new SdkAgentRunner(agentConfig)
      : new AgentLoop(agentConfig);

    if (useSubSdk) {
      logger.info('executeSubagentTask: using SDK subscription mode', { subagentId });
    }

    // Record the user message in history
    await this.config.subagentManager.addMessage(subagentId, {
      role: 'user',
      text: task,
      ts: Date.now(),
    });

    const result = await agent.run(task);

    // Record the response in history
    await this.config.subagentManager.addMessage(subagentId, {
      role: 'assistant',
      text: result.answer.slice(0, 2000),
      ts: Date.now(),
    });

    // Record the run
    await this.config.subagentManager.recordRun(subagentId, result.answer);

    return result.answer;
  }

  /** Sync all subagent schedules from Redis to BullMQ on startup */
  private async syncSubagentSchedules(): Promise<void> {
    try {
      const scheduled = await this.config.subagentManager.getScheduledAgents();
      for (const agent of scheduled) {
        if (agent.schedule && agent.scheduledTask) {
          await this.config.scheduleManager.addSchedule({
            subagentId: agent.id,
            task: agent.scheduledTask,
            cron: agent.schedule,
            timezone: agent.timezone,
          });
        }
      }
      logger.info('Synced subagent schedules', { count: scheduled.length });
    } catch (err) {
      logger.error('Failed to sync subagent schedules', { error: formatErrorMessage(err) });
    }
  }

  /** Self-reflection: analyze recent activity and update goals */
  private async selfReflect(): Promise<void> {
    logger.info('Self-reflection starting...');

    // Gather recent context
    const keys = await this.config.redis.keys('nexus:wa_history:*');
    const recentMessages: string[] = [];

    for (const key of keys.slice(0, 5)) {
      const items = await this.config.redis.lrange(key, 0, 9);
      for (const item of items) {
        try {
          const parsed = JSON.parse(item);
          recentMessages.push(`${parsed.role}: ${parsed.text}`);
        } catch { /* skip */ }
      }
    }

    if (recentMessages.length === 0) {
      logger.info('Self-reflection: no recent activity to reflect on');
      return;
    }

    const context = `## Recent Activity (last ${recentMessages.length} messages)\n${recentMessages.slice(0, 20).join('\n')}`;

    try {
      const response = await this.config.brain.think({
        prompt: context,
        systemPrompt: SELF_REFLECTION_PROMPT,
        tier: 'flash',
        maxTokens: 1024,
      });

      // Parse reflection response
      const cleaned = response.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      const reflection = JSON.parse(cleaned);

      // Save insights to memory
      if (reflection.memory_updates && Array.isArray(reflection.memory_updates)) {
        for (const update of reflection.memory_updates) {
          if (update.action === 'add' && update.content) {
            try {
              await fetch('http://localhost:3300/add', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-API-Key': process.env.LIV_API_KEY || '',
                },
                body: JSON.stringify({
                  content: update.content,
                  tags: update.tags ? update.tags.split(',').map((t: string) => t.trim()) : ['self_reflection'],
                  source: 'self_reflection',
                }),
              });
            } catch { /* memory service might be down */ }
          }
        }
      }

      // Save reflection summary to Redis for debugging
      await this.config.redis.set('nexus:last_reflection', JSON.stringify({
        ...reflection,
        timestamp: Date.now(),
      }), 'EX', 7 * 86400);

      logger.info('Self-reflection complete', {
        insights: reflection.insights?.length || 0,
        improvements: reflection.improvements?.length || 0,
        goals: reflection.goals?.length || 0,
      });
    } catch (err) {
      logger.error('Self-reflection failed', { error: formatErrorMessage(err) });
    }
  }

  private async getStats() {
    const containers = await this.config.dockerManager.list();
    return {
      cycles: this.cycleCount,
      uptime: process.uptime(),
      containers: containers.length,
      inboxSize: this.inbox.length,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
