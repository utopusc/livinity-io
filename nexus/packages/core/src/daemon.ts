import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Brain, type ModelTier } from './brain.js';
import { Router, Intent } from './router.js';
import { DockerManager } from './docker-manager.js';
import { ShellExecutor } from './shell.js';
import { Scheduler } from './scheduler.js';
import { ToolRegistry } from './tool-registry.js';
import { AgentLoop } from './agent.js';
import { KimiAgentRunner } from './kimi-agent-runner.js';
import { SdkAgentRunner } from './sdk-agent-runner.js';
import { SkillLoader } from './skill-loader.js';
import { SubagentManager } from './subagent-manager.js';
import { ScheduleManager } from './schedule-manager.js';
import { SkillGenerator } from './skill-generator.js';
import { LoopRunner } from './loop-runner.js';
import { COMPLEXITY_PROMPT, SELF_REFLECTION_PROMPT, subagentPrompt } from './prompts.js';
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
import type { UsageTracker } from './usage-tracker.js';
import type { WebhookManager } from './webhook-manager.js';
import type { GmailProvider } from './channels/gmail.js';
import type { MultiAgentManager } from './multi-agent.js';
import { CanvasManager } from './canvas-manager.js';
import type { CanvasArtifact } from './canvas-manager.js';
import { CapabilityRegistry } from './capability-registry.js';
import type { CapabilityManifest } from './capability-registry.js';

const NEXUS_LOGS_DIR = process.env.NEXUS_LOGS_DIR || '/opt/nexus/logs';

const SELF_IMPROVEMENT_TASK = `You are the Self-Improvement Agent. Your job is to identify and fill capability gaps in Nexus.

## Process
1. Use memory_search with "LEARNED:" and "self_reflection" to review recent insights
2. Use task_state (key: "self-improvement-state") to load your previous findings
3. Scan for gaps: search memory for recent failures, missing capabilities, repetitive workflows
4. Take action if gaps found:
   - skill_generate for recurring multi-step workflows
   - mcp_registry_search + mcp_install for missing integrations
   - memory_add (tag: "self_reflection") to record insights
5. Use task_state to save findings for next iteration

## Rules
- Be conservative: only act on clear evidence of recurring need
- Check mcp_list and existing skills before creating duplicates
- Maximum two improvements per run
- If no gaps found, save brief "no gaps found" state and finish`;

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
  cronQueue?: Queue;
  approvalManager?: ApprovalManager;
  usageTracker?: UsageTracker;
  webhookManager?: WebhookManager;
  gmailProvider?: GmailProvider;
  multiAgentManager?: MultiAgentManager;
  multiAgentQueue?: Queue;
  canvasManager?: CanvasManager;
  capabilityRegistry?: CapabilityRegistry;
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
  /** Current conversation ID for canvas tools — set from SSE request context */
  private currentCanvasConversationId: string | undefined;

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

  /** Expose loop runner for external consumers (API) */
  get loopRunner(): LoopRunner {
    return this.config.loopRunner;
  }

  /** Expose heartbeat runner for external consumers (API) */
  get heartbeatRunner(): HeartbeatRunner | undefined {
    return this.config.heartbeatRunner;
  }

  /** Expose approval manager for external consumers (API, WS) */
  get approvalManager(): ApprovalManager | undefined {
    return this.config.approvalManager;
  }

  /** Expose usage tracker for external consumers (API, commands) */
  get usageTracker(): UsageTracker | undefined {
    return this.config.usageTracker;
  }

  /** Expose multi-agent manager for external consumers (API, sub-agent worker) */
  get multiAgentManager(): MultiAgentManager | undefined {
    return this.config.multiAgentManager;
  }

  /** Expose canvas manager for external consumers (API) */
  get canvasManager(): CanvasManager | undefined {
    return this.config.canvasManager;
  }

  /** Expose user session manager for external consumers (API commands) */
  get userSessionManager(): UserSessionManager | undefined {
    return this.config.userSessionManager;
  }

  /** Set webhook manager after construction (circular dependency: WebhookManager needs Daemon) */
  setWebhookManager(webhookManager: WebhookManager): void {
    this.config.webhookManager = webhookManager;
  }

  /** Set current canvas conversation ID (called from SSE endpoint before agent runs) */
  setCanvasConversationId(conversationId: string): void {
    this.currentCanvasConversationId = conversationId;
  }

  /** Clear current canvas conversation ID (called after agent run completes) */
  clearCanvasConversationId(): void {
    this.currentCanvasConversationId = undefined;
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
    await this.registerTools();
    logger.info(`Tool registry: ${this.config.toolRegistry.size} tools registered`);

    // Load skills from skills/ directory
    await this.config.skillLoader.loadAll();
    await this.config.skillLoader.startWatching();
    logger.info(`Skill loader: ${this.config.skillLoader.size} skills loaded`);

    // Re-sync CapabilityRegistry now that all tools + skills are registered
    // (initial sync at startup ran before daemon tools were registered)
    if (this.config.capabilityRegistry) {
      await this.config.capabilityRegistry.syncAll();
      logger.info(`CapabilityRegistry re-synced after tool registration`, { capabilities: this.config.capabilityRegistry.size });
    }

    // Start scheduler
    await this.config.scheduler.start();

    // Wire and start ScheduleManager
    this.config.scheduleManager.onJob(async (data) => {
      logger.info('ScheduleManager: executing scheduled job', { subagentId: data.subagentId, task: data.task.slice(0, 80) });
      try {
        const result = await this.executeSubagentTask(data.subagentId, data.task);
        const agentConfig = await this.config.subagentManager.get(data.subagentId);
        if (agentConfig && agentConfig.createdBy !== 'system') {
          const header = `*${agentConfig.name}* (scheduled):`;
          await this.routeSubagentResult(agentConfig, `${header}\n\n${result}`);
        }
      } catch (err) {
        logger.error('Scheduled job execution error', { subagentId: data.subagentId, error: formatErrorMessage(err) });
        const agentConfig = await this.config.subagentManager.get(data.subagentId);
        if (agentConfig && agentConfig.createdBy !== 'system') {
          await this.routeSubagentResult(agentConfig, `${agentConfig.name} (scheduled) hata: ${formatErrorMessage(err)}`);
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
        if (ctx.config.createdBy && ctx.config.createdBy !== 'system') {
          const header = `*${ctx.config.name}* (loop #${ctx.iteration || 1}):`;
          await this.routeSubagentResult(ctx.config, `${header}\n\n${result}`);
        }
        return { result, state: result.slice(0, 4000) };
      } catch (err) {
        logger.error('Loop execution error', { subagentId: ctx.config.id, error: formatErrorMessage(err) });
        if (ctx.config.createdBy && ctx.config.createdBy !== 'system') {
          await this.routeSubagentResult(ctx.config, `${ctx.config.name} (loop) hata: ${formatErrorMessage(err)}`);
        }
        return { result: `Error: ${formatErrorMessage(err)}`, state: `error: ${formatErrorMessage(err)}` };
      }
    });
    await this.config.loopRunner.startAll();

    // Seed built-in agents (Self-Improvement Agent)
    await this.seedBuiltInAgents();

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

  private async seedBuiltInAgents(): Promise<void> {
    const SELF_IMPROVEMENT_ID = 'self-improvement-agent';

    // Only create if it doesn't exist — respect user changes (stop/delete)
    const existing = await this.config.subagentManager.get(SELF_IMPROVEMENT_ID);
    if (existing) {
      logger.debug('Built-in Self-Improvement Agent already exists', { status: existing.status });
      return;
    }

    // Skip if no API credentials are available (ANTHROPIC_API_KEY or claude login)
    // The agent requires Claude API access; without it, the loop would fail on every execution.
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    let hasCliAuth = false;
    if (!hasApiKey) {
      try {
        const { readFile } = await import('node:fs/promises');
        const { homedir } = await import('node:os');
        const { join } = await import('node:path');
        const credPath = join(homedir(), '.claude', 'credentials.json');
        const creds = JSON.parse(await readFile(credPath, 'utf8'));
        hasCliAuth = !!(creds && (creds.apiKey || creds.oauthToken || Object.keys(creds).length > 0));
      } catch {
        // Credentials file not found or unreadable
      }
    }

    if (!hasApiKey && !hasCliAuth) {
      logger.info('Skipping Self-Improvement Agent: no Anthropic API key or claude login found');
      return;
    }

    try {
      const config = await this.config.subagentManager.create({
        id: SELF_IMPROVEMENT_ID,
        name: 'Self-Improvement Agent',
        description: 'Periodically scans for capability gaps and triggers improvements (skill creation, tool installation, memory insights)',
        tools: ['*'],
        tier: 'haiku',
        maxTurns: 15,
        status: 'active',
        createdBy: 'system',
        createdVia: 'web',
        loop: {
          intervalMs: 21_600_000, // 6 hours
          task: SELF_IMPROVEMENT_TASK,
        },
      });

      // Start the loop immediately
      await this.config.loopRunner.start(config);
      logger.info('Seeded and started built-in Self-Improvement Agent');
    } catch (err) {
      logger.error('Failed to seed Self-Improvement Agent', { error: formatErrorMessage(err) });
    }
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

        // Update heartbeat's last recipient for messaging channels
        if (item.from && this.config.heartbeatRunner && ['whatsapp', 'telegram', 'discord', 'slack', 'matrix'].includes(item.source)) {
          await this.config.heartbeatRunner.setLastRecipient(item.from);
        }

        // Fetch conversation history for channel messages (including WhatsApp)
        if (item.from) {
          if (['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
            item.conversationHistory = await this.getChannelHistory(item.source, item.from);
          }
        }

        // Handle slash commands (/think, /verbose, /model, /help, /reset, /status, /new, /compact, /activation)
        if (isCommand(item.message) && item.from && this.config.userSessionManager) {
          const session = await this.config.userSessionManager.get(item.from);
          const cmdResult = await handleCommand(item.message, {
            jid: item.from,
            userSession: this.config.userSessionManager,
            currentThink: session.thinkLevel,
            currentVerbose: session.verboseLevel,
            currentModel: session.modelTier,
            sessionManager: this.config.sessionManager,
            channelId: item.from,
            redis: this.config.redis,
            usageTracker: this.config.usageTracker,
            brain: this.config.brain,
          });

          if (cmdResult?.handled && cmdResult.response) {
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
          await this.sendChannelResponse(item, skillResult.message);

          // Save conversation turn for history
          if (item.from && ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
            await this.saveChannelTurn(item.source, item.from, item.message, skillResult.message);
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
        await this.sendChannelResponse(item, responseText);

        // Save conversation turn for history
        if (item.from && ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
          await this.saveChannelTurn(item.source, item.from, item.message, responseText);
        }
      } catch (err) {
        // Per-item error handling — ALWAYS send a response to the user
        const errorMsg = `Error processing message: ${formatErrorMessage(err)}`;
        logger.error('Inbox item error', { message: item.message.slice(0, 80), error: formatErrorMessage(err), source: item.source });

        // Send error response so user isn't left waiting
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

    // 2b. MultiAgent stale session cleanup (every 10 cycles = ~5 min)
    if (this.cycleCount % 10 === 0 && this.config.multiAgentManager) {
      await this.config.multiAgentManager.cleanup().catch((err) => {
        logger.error('MultiAgent cleanup error', { error: formatErrorMessage(err) });
      });
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
    const realtimeSources = ['telegram', 'discord', 'slack', 'matrix', 'voice', 'whatsapp'];
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

      // Fetch conversation history for channel messages (including WhatsApp)
      if (item.from) {
        if (['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
          item.conversationHistory = await this.getChannelHistory(item.source, item.from);
        }
      }

      // Handle slash commands (/think, /verbose, /model, /help, /reset, /status, /new, /compact, /activation)
      if (isCommand(item.message) && item.from && this.config.userSessionManager) {
        const session = await this.config.userSessionManager.get(item.from);
        const cmdResult = await handleCommand(item.message, {
          jid: item.from,
          userSession: this.config.userSessionManager,
          currentThink: session.thinkLevel,
          currentVerbose: session.verboseLevel,
          currentModel: session.modelTier,
          sessionManager: this.config.sessionManager,
          channelId: item.from,
          redis: this.config.redis,
          usageTracker: this.config.usageTracker,
          brain: this.config.brain,
        });

        if (cmdResult?.handled && cmdResult.response) {
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
        await this.sendChannelResponse(item, skillResult.message);

        // Save conversation turn for history
        if (item.from && ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
          await this.saveChannelTurn(item.source, item.from, item.message, skillResult.message);
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
      await this.sendChannelResponse(item, responseText);

      // Save conversation turn for history
      if (item.from && ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(item.source)) {
        await this.saveChannelTurn(item.source, item.from, item.message, responseText);
      }
    } catch (err) {
      // Per-item error handling — ALWAYS send a response to the user
      const errorMsg = `Error processing message: ${formatErrorMessage(err)}`;
      logger.error('Inbox item error', { message: item.message.slice(0, 80), error: formatErrorMessage(err), source: item.source });

      // Send error response so user isn't left waiting
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

      // Use BullMQ delayed job instead of setTimeout — survives process restarts
      if (this.config.cronQueue) {
        await this.config.cronQueue.add('cron-task', {
          task: scheduledTask,
          source: scheduledSource,
          from: scheduledFrom,
          params: scheduledParams,
        }, { delay: ms, removeOnComplete: true, removeOnFail: true });
      } else {
        // Fallback: use setTimeout if cronQueue not available (shouldn't happen in production)
        setTimeout(() => {
          this.addToInbox(scheduledTask, scheduledSource as any, undefined, scheduledParams, scheduledFrom);
          logger.info('Cron (tool) fired via setTimeout fallback', { task: scheduledTask, source: scheduledSource, from: scheduledFrom });
        }, ms);
      }

      const confirmMsg = task
        ? `Scheduled in ${delayStr}: "${task}"`
        : `Reminder set for ${delayStr} from now.`;

      logger.info('Cron scheduled', { delay, unit, task: scheduledTask, source: scheduledSource, from: scheduledFrom, viaBullMQ: !!this.config.cronQueue });
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

      // Complexity assessment — quick haiku call to determine routing
      let complexity = 3; // default to moderate
      try {
        const scoreText = await this.config.brain.think({
          prompt: COMPLEXITY_PROMPT + task.slice(0, 1000),
          tier: 'haiku',
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

      const nexusConfig = this.getNexusConfig();
      const agentDefaults = nexusConfig?.agent;

      const maxTurns = Math.min(
        intent.params.max_turns ? parseInt(intent.params.max_turns) : (agentDefaults?.maxTurns ?? parseInt(process.env.AGENT_MAX_TURNS || '30')),
        100, // Hard cap
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
      // Voice mode defaults to haiku for lowest latency
      const configTier = agentDefaults?.tier ?? ((process.env.AGENT_TIER as any) || 'sonnet');
      const baseTier = intent.source === 'voice'
        ? 'haiku'
        : (complexity >= 4 ? 'sonnet' : configTier);
      const effectiveTier = userModelTier || baseTier;
      const effectiveMaxTurns = complexity >= 4 ? Math.max(maxTurns, 20) : maxTurns;

      const approvalPolicy = nexusConfig?.approval?.policy ?? 'destructive';
      const configThinkLevel = agentDefaults?.thinkingLevel !== 'off' ? agentDefaults?.thinkingLevel : undefined;

      const agentConfig = {
        brain: this.config.brain,
        toolRegistry: this.config.toolRegistry,
        nexusConfig,
        maxTurns: effectiveMaxTurns,
        maxTokens: agentDefaults?.maxTokens ?? parseInt(process.env.AGENT_MAX_TOKENS || '200000'),
        timeoutMs: agentDefaults?.timeoutMs ?? parseInt(process.env.AGENT_TIMEOUT_MS || '600000'),
        tier: effectiveTier as 'haiku' | 'sonnet' | 'opus',
        maxDepth: agentDefaults?.maxDepth ?? parseInt(process.env.AGENT_MAX_DEPTH || '3'),
        onAction: this.buildActionCallback(intent.from, intent.source),
        thinkLevel: userThinkLevel ?? configThinkLevel,
        verboseLevel: userVerboseLevel,
        approvalManager: this.config.approvalManager,
        approvalPolicy: approvalPolicy as 'always' | 'destructive' | 'never',
        sessionId: randomUUID(),
      };

      // Always use SdkAgentRunner — it uses Claude CLI OAuth (no API key needed)
      // AgentLoop requires ProviderManager API keys which may not be configured
      const agent = new SdkAgentRunner(agentConfig);

      // Voice TTS streaming: buffer agent text at sentence boundaries and publish to Redis
      const voiceSessionId = intent.params?.voiceSessionId as string | undefined;
      if (intent.source === 'voice' && voiceSessionId) {
        let voiceTextBuffer = '';

        const flushVoiceBuffer = (isFinal: boolean) => {
          const text = voiceTextBuffer.trim();
          if (!text) return;
          voiceTextBuffer = '';

          this.config.redis.publish('nexus:voice:response', JSON.stringify({
            sessionId: voiceSessionId,
            text,
            isFinal,
          })).catch((err) => {
            logger.error('Failed to publish voice response', { error: (err as Error).message });
          });

          logger.debug('Voice TTS: published text', {
            sessionId: voiceSessionId.slice(0, 8),
            textLength: text.length,
            isFinal,
          });
        };

        // Listen for agent events to stream text to TTS
        agent.on('event', (event: { type: string; data?: unknown }) => {
          if (event.type === 'final_answer' && typeof event.data === 'string') {
            // Final answer: send the full response text for TTS
            voiceTextBuffer += event.data;
            flushVoiceBuffer(true);
          } else if (event.type === 'chunk' && typeof event.data === 'string') {
            // Text chunk: buffer and flush at sentence boundaries
            voiceTextBuffer += event.data;

            // Check for sentence boundary (period, question mark, exclamation, or 100+ chars without)
            const sentenceMatch = voiceTextBuffer.match(/^([\s\S]*?[.!?])\s/);
            if (sentenceMatch) {
              const sentence = sentenceMatch[1].trim();
              voiceTextBuffer = voiceTextBuffer.slice(sentenceMatch[0].length);
              if (sentence) {
                this.config.redis.publish('nexus:voice:response', JSON.stringify({
                  sessionId: voiceSessionId,
                  text: sentence,
                  isFinal: false,
                })).catch(() => {});
              }
            } else if (voiceTextBuffer.length > 100) {
              // No punctuation found but buffer is large — flush what we have
              flushVoiceBuffer(false);
            }
          }
        });

        logger.info('Voice TTS streaming enabled for agent', {
          sessionId: voiceSessionId.slice(0, 8),
        });
      }

      // For complex tasks (4-5), prepend autonomous guidance context
      let agentTask = task;
      if (complexity >= 4) {
        agentTask = `## Task Complexity: ${complexity}/5 (Complex)
You should approach this methodically:
1. First check memory for any relevant past knowledge (memory_search) and past conversations (conversation_search)
2. If needed, research the topic (web_search, scrape)
3. Plan your approach before executing
4. Verify results after each major step
5. Save learnings to memory when done (memory_add)

${task}`;
      }

      // Voice mode: prepend voice-optimized system instruction
      if (intent.source === 'voice') {
        agentTask = `[VOICE MODE] You are in a real-time voice conversation. Keep responses under 2 sentences. No markdown, no code blocks, no lists, no bullet points. Speak naturally and conversationally. If the user asks something that requires tools, do it quickly and summarize the result in one brief sentence.\n\n${agentTask}`;
      }

      // Inject channel source so the agent knows which platform the user is on
      const messagingChannels = ['telegram', 'discord', 'whatsapp', 'slack', 'matrix', 'signal', 'line', 'gmail'];
      if (messagingChannels.includes(intent.source)) {
        const channelLabel = intent.source.charAt(0).toUpperCase() + intent.source.slice(1);
        agentTask = `[Channel: ${channelLabel}] This message is from ${channelLabel}. When replying or sending messages, use the appropriate channel. To send messages on this channel, use the channel_send tool with channel="${intent.source}".\n\n${agentTask}`;
      }

      const result = await agent.run(agentTask);

      // Record usage in user session for stats
      if (intent.from && this.config.userSessionManager) {
        const totalTokens = result.totalInputTokens + result.totalOutputTokens;
        await this.config.userSessionManager.recordUsage(intent.from, totalTokens).catch(() => {});
      }

      // Record detailed usage metrics in UsageTracker
      if (this.config.usageTracker) {
        this.config.usageTracker.recordSession({
          sessionId: agentConfig.sessionId || 'unknown',
          userId: intent.from || 'web',
          model: effectiveTier,
          inputTokens: result.totalInputTokens,
          outputTokens: result.totalOutputTokens,
          turns: result.turns,
          toolCalls: result.toolCallCount ?? result.toolCalls.length,
          ttfbMs: result.ttfbMs ?? 0,
          durationMs: result.durationMs ?? 0,
          timestamp: Date.now(),
          success: result.success,
        }).catch(() => {});
      }

      // COMP-05: Auto-compact when session exceeds 100k token threshold
      if (this.config.sessionManager && intent.from) {
        try {
          const sessionTokens = await this.config.sessionManager.getSessionTokenCount(intent.from);
          if (sessionTokens > 100_000) {
            logger.info('Auto-compact triggered', { senderId: intent.from, sessionTokens });
            const compactResult = await this.config.sessionManager.compactSession(intent.from, this.config.brain);
            logger.info('Auto-compact complete', {
              senderId: intent.from,
              savedTokens: compactResult.savedTokens,
              compactedMessages: compactResult.compactedMessages,
            });
          }
        } catch (err: any) {
          logger.error('Auto-compact failed', { senderId: intent.from, error: err.message });
        }
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

  private async registerTools(): Promise<void> {
    const { toolRegistry, dockerManager, shell } = this.config;

    toolRegistry.register({
      name: 'status',
      description: 'Get daemon health: uptime, containers, cycles',
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
      description: 'Read daemon log file',
      parameters: [
        { name: 'lines', type: 'number', description: 'Lines to return', required: false, default: 20 },
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
      description: 'Execute a shell command on the server',
      parameters: [
        { name: 'cmd', type: 'string', description: 'Shell command', required: true },
        { name: 'timeout', type: 'number', description: 'Timeout (ms)', required: false, default: 30000 },
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
      description: 'List Docker containers and their state',
      parameters: [],
      execute: async () => {
        const containers = await dockerManager.list();
        const summary = containers.map((c) => `${c.Names?.[0] || 'unknown'}: ${c.State}`).join('\n');
        return { success: true, output: summary || 'No containers running.' };
      },
    });

    toolRegistry.register({
      name: 'docker_manage',
      description: 'Start, stop, restart, inspect, or get logs for a Docker container',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['start', 'stop', 'restart', 'inspect', 'logs'] },
        { name: 'name', type: 'string', description: 'Container name', required: true },
        { name: 'tail', type: 'number', description: 'Log lines to return', required: false, default: 100 },
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
      description: 'Execute a command inside a Docker container',
      parameters: [
        { name: 'container', type: 'string', description: 'Container name', required: true },
        { name: 'cmd', type: 'string', description: 'Command to execute', required: true },
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
      description: 'Manage PM2 processes: list, restart, stop, start, reload, logs, status',
      parameters: [
        { name: 'operation', type: 'string', description: 'PM2 operation', required: true, enum: ['list', 'restart', 'stop', 'start', 'reload', 'logs', 'status'] },
        { name: 'name', type: 'string', description: 'Process name', required: false },
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
      description: 'Get system resource info: CPU, RAM, disk, network',
      parameters: [
        { name: 'topic', type: 'string', description: 'Info topic', required: false, enum: ['all', 'cpu', 'ram', 'disk', 'network', 'uptime'], default: 'all' },
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
      description: 'File operations: read, write, list, stat, delete, mkdir',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['read', 'write', 'list', 'stat', 'delete', 'mkdir'] },
        { name: 'path', type: 'string', description: 'Path', required: true },
        { name: 'content', type: 'string', description: 'Content to write', required: false },
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
      description: 'Schedule a delayed task for later execution',
      parameters: [
        { name: 'delay', type: 'number', description: 'Delay amount', required: true },
        { name: 'unit', type: 'string', description: 'Time unit', required: true, enum: ['minutes', 'hours'] },
        { name: 'task', type: 'string', description: 'Task to execute when timer fires', required: true },
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

        // Use BullMQ delayed job — survives process restarts
        if (this.config.cronQueue) {
          await this.config.cronQueue.add('cron-task', {
            task: msg,
            source: scheduledSource,
            from: scheduledFrom,
            params: scheduledParams,
          }, { delay: ms, removeOnComplete: true, removeOnFail: true });
        } else {
          // Fallback: setTimeout only if cronQueue not available
          setTimeout(() => {
            this.addToInbox(msg, scheduledSource as any, undefined, scheduledParams, scheduledFrom);
            logger.info('Cron (tool) fired via setTimeout fallback', { task: msg, source: scheduledSource, from: scheduledFrom });
          }, ms);
        }
        return { success: true, output: `Scheduled: "${msg}" in ${delay} ${unit}. Response will be sent to ${scheduledSource}.` };
      },
    });

    // ── Scrape tool (Firecrawl via localhost:3002) ─────────────────────

    toolRegistry.register({
      name: 'scrape',
      description: 'Fetch a URL and return content as markdown',
      parameters: [
        { name: 'url', type: 'string', description: 'URL', required: true },
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

    // ── WhatsApp messaging tool (conditional: only when WhatsApp is enabled) ──

    const waConfig = this.config.configManager?.get()?.channels?.whatsapp;
    if (waConfig?.enabled !== false) {
      toolRegistry.register({
        name: 'whatsapp_send',
        description: 'Send a WhatsApp message to a contact by name',
        parameters: [
          { name: 'contact', type: 'string', description: 'Contact name', required: true },
          { name: 'message', type: 'string', description: 'Message text', required: true },
        ],
        execute: async (params) => {
          const { contact, message } = params as { contact: string; message: string };
          if (!contact || !message) return { success: false, output: '', error: 'Contact name and message are required.' };

          try {
            const channelMgr = this.config.channelManager;
            if (!channelMgr) return { success: false, output: '', error: 'ChannelManager not available' };

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
              // Found partial match — send via ChannelManager
              const sent = await channelMgr.sendMessage('whatsapp', match[1], message);
              if (!sent) return { success: false, output: '', error: 'WhatsApp send failed (not connected?)' };
              return { success: true, output: `Message sent to ${match[0]} (${match[1]}): "${message.slice(0, 80)}"` };
            }

            const sent = await channelMgr.sendMessage('whatsapp', jid, message);
            if (!sent) return { success: false, output: '', error: 'WhatsApp send failed (not connected?)' };
            return { success: true, output: `Message sent to ${contact} (${jid}): "${message.slice(0, 80)}"` };
          } catch (err) {
            return { success: false, output: '', error: `WhatsApp send error: ${formatErrorMessage(err)}` };
          }
        },
      });
      logger.info('Tool registered: whatsapp_send (WhatsApp enabled)');
    } else {
      logger.info('Tool skipped: whatsapp_send (WhatsApp not enabled)');
    }

    // ── Channel messaging tool (conditional: only when at least one messaging channel is connected) ──

    const channelMgr = this.config.channelManager;
    let hasConnectedChannel = false;
    if (channelMgr) {
      const messagingChannels: Array<'telegram' | 'discord' | 'slack'> = ['telegram', 'discord', 'slack'];
      for (const ch of messagingChannels) {
        const provider = channelMgr.getProvider(ch);
        if (provider) {
          try {
            const status = await provider.getStatus();
            if (status.connected || status.enabled) {
              hasConnectedChannel = true;
              break;
            }
          } catch {
            // If getStatus fails, skip this channel
          }
        }
      }
    }

    if (hasConnectedChannel) {
      toolRegistry.register({
        name: 'channel_send',
        description: 'Send a message to a Telegram, Discord, Slack, Matrix, or WhatsApp channel',
        parameters: [
          { name: 'channel', type: 'string', description: 'Channel ID (telegram, discord, slack, matrix, whatsapp)', required: true },
          { name: 'text', type: 'string', description: 'Message text', required: true },
          { name: 'chatId', type: 'string', description: 'Chat/channel ID (defaults to last active)', required: false },
        ],
        execute: async (params) => {
          const { channel, text, chatId: explicitChatId } = params as { channel: string; text: string; chatId?: string };
          if (!channel || !text) return { success: false, output: '', error: 'Channel and text are required.' };

          const validChannels = ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'];
          if (!validChannels.includes(channel)) {
            return { success: false, output: '', error: `Invalid channel "${channel}". Use: ${validChannels.join(', ')}` };
          }

          try {
            const targetChatId = explicitChatId || await this.config.redis.get(`nexus:${channel}:last_chat_id`);
            if (!targetChatId) {
              return { success: false, output: '', error: `No chat ID for ${channel}. Send a message to the bot first to register a chat.` };
            }

            const success = await this.config.channelManager!.sendMessage(
              channel as 'telegram' | 'discord' | 'slack' | 'matrix' | 'whatsapp',
              targetChatId,
              text,
            );

            if (success) {
              return { success: true, output: `Message sent via ${channel} to chat ${targetChatId}: "${text.slice(0, 100)}"` };
            }
            return { success: false, output: '', error: `Failed to send via ${channel} — channel may not be connected.` };
          } catch (err) {
            return { success: false, output: '', error: `Channel send error: ${formatErrorMessage(err)}` };
          }
        },
      });
      logger.info('Tool registered: channel_send (messaging channel connected)');
    } else {
      logger.info('Tool skipped: channel_send (no messaging channels connected)');
    }

    // ── Memory tools (Cognee integration via localhost:3300) ──────────

    toolRegistry.register({
      name: 'memory_search',
      description: 'Search long-term memory for stored knowledge',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query', required: true },
        { name: 'limit', type: 'number', description: 'Max results', required: false, default: 5 },
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
      description: 'Store information in long-term memory',
      parameters: [
        { name: 'content', type: 'string', description: 'Content to store', required: true },
        { name: 'tags', type: 'string', description: 'Comma-separated tags', required: false },
        { name: 'source', type: 'string', description: 'Source identifier', required: false },
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

    // ── Conversation Search tool (search past conversations via memory service) ──

    toolRegistry.register({
      name: 'conversation_search',
      description: 'Search past conversation history across all channels (Web, Telegram, Discord, WhatsApp, Slack). Use this when the user asks about previous discussions, past conversations, or what was said before.',
      parameters: [
        { name: 'query', type: 'string', description: 'Search keywords (e.g. "Docker setup", "backup strategy")', required: true },
        { name: 'channel', type: 'string', description: 'Filter by channel: web, telegram, discord, whatsapp, slack', required: false },
        { name: 'limit', type: 'number', description: 'Max results to return', required: false, default: 10 },
        { name: 'since', type: 'number', description: 'Only return results after this Unix timestamp (ms). Use for "last week", "yesterday" etc.', required: false },
      ],
      execute: async (params) => {
        const { query, channel, limit, since } = params as { query: string; channel?: string; limit?: number; since?: number };
        if (!query) return { success: false, output: '', error: 'Query is required.' };
        try {
          const body: Record<string, unknown> = { query, limit: limit || 10 };
          if (channel) body.channel = channel;
          if (since) body.since = since;

          const res = await fetch('http://localhost:3300/conversation-search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.LIV_API_KEY || '',
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errText = await res.text();
            return { success: false, output: '', error: `Conversation search failed (${res.status}): ${errText}` };
          }
          const data = await res.json() as { results: Array<{ role: string; content: string; channel: string; createdAt: number }> };
          const results = data.results || [];
          if (results.length === 0) {
            return { success: true, output: 'No past conversations found matching this query.' };
          }
          const formatted = results.map((r: any, i: number) => {
            const date = new Date(r.createdAt).toISOString().slice(0, 10);
            const ch = r.channel ? ` [${r.channel}]` : '';
            const speaker = r.role === 'user' ? 'User' : 'Assistant';
            return `[${i + 1}] ${date}${ch} ${speaker}: ${r.content.slice(0, 300)}`;
          }).join('\n\n');
          return { success: true, output: formatted, data: results };
        } catch (err) {
          return { success: false, output: '', error: `Conversation search error: ${formatErrorMessage(err)}` };
        }
      },
    });
    logger.info('Tool registered: conversation_search');

    // ── Web Search tool (Google via Firecrawl scraping) ───────────────

    toolRegistry.register({
      name: 'web_search',
      description: 'Search Google and return results as markdown',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query', required: true },
        { name: 'max_results', type: 'number', description: 'Max results (1-10)', required: false, default: 5 },
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
      description: 'Persistent key-value store for multi-phase workflows',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['save', 'load', 'list', 'delete'] },
        { name: 'key', type: 'string', description: 'State key name', required: true },
        { name: 'data', type: 'string', description: 'JSON data to save', required: false },
        { name: 'ttl', type: 'number', description: 'TTL in seconds', required: false, default: 86400 },
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

    // ── Progress Report tool (multi-channel interim updates) ───────────

    toolRegistry.register({
      name: 'progress_report',
      description: 'Send a progress update to user during long tasks',
      parameters: [
        { name: 'message', type: 'string', description: 'Progress message', required: true },
        { name: 'jid', type: 'string', description: 'WhatsApp JID (auto-detected)', required: false },
      ],
      execute: async (params) => {
        const { message, jid } = params as { message: string; jid?: string };
        if (!message) return { success: false, output: '', error: 'Message is required.' };

        try {
          const ctx = this.currentChannelContext;

          // Route to the correct channel based on context (including WhatsApp)
          if (ctx && ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'].includes(ctx.source) && this.config.channelManager) {
            await this.config.channelManager.sendMessage(ctx.source as any, ctx.chatId, message);
            return { success: true, output: `Progress sent via ${ctx.source}: ${message.slice(0, 100)}` };
          }

          // WhatsApp: use JID param or auto-detected JID (fallback for non-channel context)
          const targetJid = jid || this.currentWhatsAppJid;
          if (targetJid && this.config.channelManager) {
            const sent = await this.config.channelManager.sendMessage('whatsapp', targetJid, message);
            if (sent) return { success: true, output: `Progress sent via WhatsApp: ${message.slice(0, 100)}` };
            return { success: false, output: '', error: 'WhatsApp send failed' };
          }

          // Web/MCP: publish to Redis for WebSocket gateway
          if (ctx?.source === 'web' || ctx?.source === 'mcp') {
            await this.config.redis.publish('nexus:agent_results', JSON.stringify({
              type: 'progress',
              text: message,
              timestamp: Date.now(),
            }));
            return { success: true, output: `Progress published: ${message.slice(0, 100)}` };
          }

          return { success: false, output: '', error: 'No channel context available — cannot route progress report.' };
        } catch (err) {
          return { success: false, output: '', error: `Progress report error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Subagent Management Tools ─────────────────────────────────────

    toolRegistry.register({
      name: 'subagent_create',
      description: 'Create a persistent subagent with role, tools, and optional schedule/loop',
      parameters: [
        { name: 'id', type: 'string', description: 'Unique kebab-case ID', required: true },
        { name: 'name', type: 'string', description: 'Display name', required: true },
        { name: 'description', type: 'string', description: 'What this subagent does', required: true },
        { name: 'tools', type: 'string', description: 'Tool names (comma-separated) or "*"', required: false },
        { name: 'system_prompt', type: 'string', description: 'Custom system prompt', required: false },
        { name: 'schedule', type: 'string', description: 'Cron expression', required: false },
        { name: 'timezone', type: 'string', description: 'IANA timezone', required: false },
        { name: 'scheduled_task', type: 'string', description: 'Task for schedule trigger', required: false },
        { name: 'loop_interval_ms', type: 'number', description: 'Loop interval (ms)', required: false },
        { name: 'loop_task', type: 'string', description: 'Task per loop iteration', required: false },
        { name: 'loop_max_iterations', type: 'number', description: 'Max iterations (0=unlimited)', required: false },
        { name: 'tier', type: 'string', description: 'Model tier', required: false, enum: ['haiku', 'sonnet', 'opus'] },
        { name: 'max_turns', type: 'number', description: 'Max turns per execution', required: false },
      ],
      execute: async (params) => {
        const { id, name, description, tools: toolsParam, system_prompt, schedule, timezone, scheduled_task,
                loop_interval_ms, loop_task, loop_max_iterations, tier, max_turns } = params as Record<string, any>;

        if (!id || !name || !description) {
          return { success: false, output: '', error: 'id, name, and description are required.' };
        }

        // Validate schedule+scheduled_task coupling
        if (schedule && !scheduled_task) {
          return { success: false, output: '', error: 'scheduled_task is required when schedule is set. Provide the task to execute on each schedule trigger.' };
        }

        try {
          const config = await this.config.subagentManager.create({
            id,
            name,
            description,
            tools: toolsParam ? toolsParam.split(',').map((s: string) => s.trim()) : ['*'],
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
            createdVia: (this.currentChannelContext?.source as any) || (this.currentWhatsAppJid ? 'whatsapp' : 'web'),
            createdChatId: this.currentChannelContext?.chatId || this.currentWhatsAppJid || undefined,
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
          if (config.schedule && config.scheduledTask) output += ` Schedule registered: ${config.schedule} (task: "${config.scheduledTask}")`;
          if (config.loop) output += ` Loop: every ${config.loop.intervalMs}ms`;
          return { success: true, output };
        } catch (err) {
          return { success: false, output: '', error: `Create subagent error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'subagent_list',
      description: 'List all subagents with status, schedule, and run history',
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
      description: 'Send a task to a subagent for execution',
      parameters: [
        { name: 'id', type: 'string', description: 'Subagent ID', required: true },
        { name: 'message', type: 'string', description: 'Task message', required: true },
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
      description: 'Manage subagent cron schedules: add, remove, list',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['add', 'remove', 'list'] },
        { name: 'id', type: 'string', description: 'Subagent ID', required: false },
        { name: 'cron', type: 'string', description: 'Cron expression', required: false },
        { name: 'task', type: 'string', description: 'Scheduled task', required: false },
        { name: 'timezone', type: 'string', description: 'IANA timezone', required: false },
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
      description: 'Generate a new AI skill file from a description',
      parameters: [
        { name: 'description', type: 'string', description: 'What the skill should do', required: true },
        { name: 'name', type: 'string', description: 'Skill name (kebab-case)', required: false },
        { name: 'triggers', type: 'string', description: 'Trigger patterns (comma-separated)', required: false },
        { name: 'tools', type: 'string', description: 'Required tool names (comma-separated)', required: false },
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
            // Register in CapabilityRegistry for same-session discovery (MOD-01)
            if (this.config.capabilityRegistry) {
              try {
                const skillName = name || result.filePath?.split('/').pop()?.replace('.ts', '') || 'unknown';
                const manifest: CapabilityManifest = {
                  id: `skill:${skillName}`,
                  type: 'skill',
                  name: skillName,
                  description: description,
                  semantic_tags: triggers ? triggers.split(',').map((t: string) => t.trim()) : [],
                  triggers: triggers ? triggers.split(',').map((t: string) => t.trim()) : [],
                  provides_tools: tools ? tools.split(',').map((t: string) => t.trim()) : [],
                  requires: [],
                  conflicts: [],
                  context_cost: Math.ceil(description.length / 4),
                  tier: 'any',
                  source: 'custom',
                  status: 'active',
                  last_used_at: 0,
                  registered_at: Date.now(),
                  metadata: { createdBy: 'ai-self-modification', filePath: result.filePath },
                };
                await this.config.capabilityRegistry.registerCapability(manifest);
              } catch (regErr) {
                // Non-fatal: skill was still created successfully
                logger.warn('skill_generate: failed to register in CapabilityRegistry', { error: formatErrorMessage(regErr) });
              }
            }
            return { success: true, output: `Skill generated and compiled: ${result.filePath}\nThe skill is now available for trigger-based activation in future conversations and registered in the capability registry. Test it immediately by invoking its trigger to verify correctness.` };
          }
          return { success: false, output: '', error: `Skill generation failed: ${result.error}` };
        } catch (err) {
          return { success: false, output: '', error: `Skill generate error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Self-Modification Tools (Phase 34) ──────────────────────────────

    toolRegistry.register({
      name: 'create_hook',
      description: 'Create an event-driven hook that fires on pre-task, post-task, or scheduled events. The hook runs a shell command when triggered.',
      parameters: [
        { name: 'name', type: 'string', description: 'Unique hook name (kebab-case)', required: true },
        { name: 'event', type: 'string', description: 'Event type that triggers this hook', required: true, enum: ['pre-task', 'post-task', 'scheduled'] },
        { name: 'command', type: 'string', description: 'Shell command to execute when hook fires', required: true },
        { name: 'description', type: 'string', description: 'What this hook does', required: false },
        { name: 'schedule', type: 'string', description: 'Cron expression (required if event=scheduled)', required: false },
        { name: 'enabled', type: 'boolean', description: 'Whether the hook is active (default: true)', required: false },
      ],
      execute: async (params) => {
        const { name: hookName, event, command, description: hookDesc, schedule, enabled } = params as Record<string, any>;
        if (!hookName || !event || !command) {
          return { success: false, output: '', error: 'name, event, and command are required.' };
        }
        if (!['pre-task', 'post-task', 'scheduled'].includes(event)) {
          return { success: false, output: '', error: 'event must be one of: pre-task, post-task, scheduled' };
        }
        if (event === 'scheduled' && !schedule) {
          return { success: false, output: '', error: 'schedule (cron expression) is required for scheduled hooks.' };
        }

        try {
          const hookConfig = {
            name: hookName,
            event,
            command,
            description: hookDesc || `Hook: ${hookName}`,
            schedule: schedule || undefined,
            enabled: enabled !== false,
            createdAt: Date.now(),
          };

          // Store hook config in Redis
          await this.config.redis.set(
            `nexus:hooks:${hookName}`,
            JSON.stringify(hookConfig),
          );

          // Register in CapabilityRegistry
          if (this.config.capabilityRegistry) {
            const manifest: CapabilityManifest = {
              id: `hook:${hookName}`,
              type: 'hook',
              name: hookName,
              description: hookDesc || `Hook: ${hookName} (${event})`,
              semantic_tags: ['hook', event],
              triggers: [event],
              provides_tools: [],
              requires: [],
              conflicts: [],
              context_cost: 0,
              tier: 'any',
              source: 'custom',
              status: hookConfig.enabled ? 'active' : 'inactive',
              last_used_at: 0,
              registered_at: Date.now(),
              metadata: { event, command, schedule },
            };
            await this.config.capabilityRegistry.registerCapability(manifest);
          }

          // If scheduled hook, register the schedule via ScheduleManager
          if (event === 'scheduled' && schedule) {
            await this.config.scheduleManager.addSchedule({
              subagentId: `hook:${hookName}`,
              task: command,
              cron: schedule,
            });
          }

          let output = `Hook "${hookName}" created (event: ${event}, command: "${command}")`;
          if (schedule) output += `, schedule: ${schedule}`;
          output += '. Test it by triggering the event to verify it works correctly.';
          return { success: true, output };
        } catch (err) {
          return { success: false, output: '', error: `Create hook error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'create_agent_template',
      description: `Create a persistent agent template with a system prompt, tool set, and optional scheduling. The agent appears in the Agents panel immediately.

IMPORTANT: Generate a DETAILED system prompt following this structure:
1. Identity & Role (2-3 sentences) — Who is this agent? What domain does it operate in?
2. Goals (bullet list) — Primary goal, secondary goals, success metrics.
3. Available Tools & How to Use Them — List specific tools, when to use each, tool chains (e.g. "search → analyze → report").
4. Workflow Steps — Step-by-step process, decision points (if X then Y), error handling ("if blocked, try alternative").
5. Output Format — How to present results, reporting structure, progress updates.
6. Constraints & Safety — What NOT to do, rate limits, user approval gates.
7. State Management — What to remember between runs, how to track progress, where to store findings.

Do NOT generate short or generic system prompts. Each section should have concrete, actionable instructions.`,
      parameters: [
        { name: 'name', type: 'string', description: 'Agent display name', required: true },
        { name: 'description', type: 'string', description: 'What this agent does', required: true },
        { name: 'system_prompt', type: 'string', description: 'Detailed system prompt following the 7-section structure above', required: true },
        { name: 'tools', type: 'string', description: 'Tool names (comma-separated) or "*" for all tools', required: false },
        { name: 'tier', type: 'string', description: 'Model tier', required: false, enum: ['haiku', 'sonnet', 'opus'] },
        { name: 'schedule', type: 'string', description: 'Cron expression for scheduled execution', required: false },
        { name: 'scheduled_task', type: 'string', description: 'Task to execute on schedule (required if schedule is set)', required: false },
        { name: 'loop_interval_ms', type: 'number', description: 'Loop interval in ms for continuous execution', required: false },
        { name: 'loop_task', type: 'string', description: 'Task for each loop iteration', required: false },
      ],
      execute: async (params) => {
        const { name: agentName, description: agentDesc, system_prompt, tools: toolsParam,
                tier, schedule, scheduled_task, loop_interval_ms, loop_task } = params as Record<string, any>;
        if (!agentName || !agentDesc || !system_prompt) {
          return { success: false, output: '', error: 'name, description, and system_prompt are required.' };
        }
        if (schedule && !scheduled_task) {
          return { success: false, output: '', error: 'scheduled_task is required when schedule is set.' };
        }

        try {
          // Generate kebab-case ID from name
          const agentId = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

          const config = await this.config.subagentManager.create({
            id: agentId,
            name: agentName,
            description: agentDesc,
            tools: toolsParam ? toolsParam.split(',').map((s: string) => s.trim()) : ['*'],
            systemPrompt: system_prompt,
            schedule: schedule || undefined,
            timezone: undefined,
            scheduledTask: scheduled_task || undefined,
            loop: loop_interval_ms && loop_task ? {
              intervalMs: loop_interval_ms,
              task: loop_task,
              maxIterations: undefined,
            } : undefined,
            tier: tier || 'sonnet',
            maxTurns: 15,
            status: 'active',
            createdBy: this.currentWhatsAppJid || 'ai-self-modification',
            createdVia: (this.currentChannelContext?.source as any) || 'web',
            createdChatId: this.currentChannelContext?.chatId || undefined,
          });

          // Register schedule if provided
          if (config.schedule && config.scheduledTask) {
            await this.config.scheduleManager.addSchedule({
              subagentId: config.id,
              task: config.scheduledTask,
              cron: config.schedule,
            });
          }

          // Start loop if configured
          if (config.loop) {
            await this.config.loopRunner.start(config);
          }

          // Register in CapabilityRegistry
          if (this.config.capabilityRegistry) {
            const manifest: CapabilityManifest = {
              id: `agent:${agentId}`,
              type: 'agent',
              name: agentName,
              description: agentDesc,
              semantic_tags: ['agent', 'template'],
              triggers: [],
              provides_tools: [],
              requires: [],
              conflicts: [],
              context_cost: Math.ceil((system_prompt?.length || 0) / 4),
              tier: (tier || 'sonnet') as any,
              source: 'custom',
              status: 'active',
              last_used_at: 0,
              registered_at: Date.now(),
              metadata: { systemPrompt: system_prompt, tools: config.tools, schedule },
            };
            await this.config.capabilityRegistry.registerCapability(manifest);
          }

          let output = `Agent template "${agentName}" (${agentId}) created and registered.`;
          if (config.schedule) output += ` Schedule: ${config.schedule}`;
          if (config.loop) output += ` Loop: every ${config.loop.intervalMs}ms`;
          output += ' The agent now appears in the Agents panel. Test it by checking subagent_list.';
          return { success: true, output };
        } catch (err) {
          return { success: false, output: '', error: `Create agent template error: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Agent Workspace Tools ──────────────────────────────────────

    toolRegistry.register({
      name: 'agent_save',
      description: 'Save data to an agent\'s persistent workspace. Use this to store findings, results, or any data the agent needs to remember between runs.',
      parameters: [
        { name: 'agent_id', type: 'string', description: 'Agent ID', required: true },
        { name: 'key', type: 'string', description: 'Data key (e.g. "jobs-found", "applications", "progress")', required: true },
        { name: 'data', type: 'string', description: 'JSON data to save', required: true },
      ],
      execute: async (params) => {
        const { agent_id, key, data: dataStr } = params as Record<string, string>;
        if (!agent_id || !key || !dataStr) {
          return { success: false, output: '', error: 'agent_id, key, and data are required' };
        }
        try {
          const parsed = JSON.parse(dataStr);
          await this.config.subagentManager.saveData(agent_id, key, parsed);
          return { success: true, output: `Saved "${key}" to agent workspace (${agent_id})` };
        } catch (err: any) {
          return { success: false, output: '', error: `agent_save error: ${err.message}` };
        }
      },
    });

    toolRegistry.register({
      name: 'agent_load',
      description: 'Load data from an agent\'s persistent workspace. Use this to retrieve previously saved findings or state.',
      parameters: [
        { name: 'agent_id', type: 'string', description: 'Agent ID', required: true },
        { name: 'key', type: 'string', description: 'Data key to load. Use "list" to see all available keys.', required: true },
      ],
      execute: async (params) => {
        const { agent_id, key } = params as Record<string, string>;
        if (!agent_id || !key) {
          return { success: false, output: '', error: 'agent_id and key are required' };
        }
        try {
          if (key === 'list') {
            const keys = await this.config.subagentManager.listFindings(agent_id);
            return { success: true, output: keys.length > 0 ? `Available keys: ${keys.join(', ')}` : 'No saved data yet.' };
          }
          const data = await this.config.subagentManager.loadData(agent_id, key);
          if (data === null) {
            return { success: true, output: `No data found for key "${key}" in agent ${agent_id}` };
          }
          return { success: true, output: JSON.stringify(data, null, 2), data };
        } catch (err: any) {
          return { success: false, output: '', error: `agent_load error: ${err.message}` };
        }
      },
    });

    toolRegistry.register({
      name: 'agent_state',
      description: 'Update or read an agent\'s current state (progress, current task, iteration count, etc.).',
      parameters: [
        { name: 'agent_id', type: 'string', description: 'Agent ID', required: true },
        { name: 'progress', type: 'string', description: 'Progress description (e.g. "3/10 jobs applied")', required: false },
        { name: 'current_task', type: 'string', description: 'What the agent is currently doing', required: false },
        { name: 'read_only', type: 'boolean', description: 'If true, just read the current state without updating', required: false },
      ],
      execute: async (params) => {
        const { agent_id, progress, current_task, read_only } = params as Record<string, any>;
        if (!agent_id) {
          return { success: false, output: '', error: 'agent_id is required' };
        }
        try {
          if (read_only) {
            const state = await this.config.subagentManager.getState(agent_id);
            return { success: true, output: state ? JSON.stringify(state, null, 2) : 'No state recorded yet.' };
          }
          const updates: Record<string, unknown> = {};
          if (progress) updates.progress = progress;
          if (current_task) updates.currentTask = current_task;
          await this.config.subagentManager.updateState(agent_id, updates);
          return { success: true, output: `State updated for agent ${agent_id}: ${JSON.stringify(updates)}` };
        } catch (err: any) {
          return { success: false, output: '', error: `agent_state error: ${err.message}` };
        }
      },
    });

    toolRegistry.register({
      name: 'loop_manage',
      description: 'Manage subagent loops: start, stop, list, status',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation to perform', required: true, enum: ['start', 'stop', 'list', 'status'] },
        { name: 'id', type: 'string', description: 'Subagent ID', required: false },
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
              await this.config.subagentManager.update(id, { status: 'stopped' });
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
      description: 'Search the MCP Registry for available servers',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query', required: false },
        { name: 'limit', type: 'number', description: 'Max results', required: false, default: 10 },
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
      description: 'Install an MCP server from registry or manually',
      parameters: [
        { name: 'name', type: 'string', description: 'Server name (kebab-case)', required: true },
        { name: 'transport', type: 'string', description: 'Transport type', required: true, enum: ['stdio', 'streamableHttp'] },
        { name: 'command', type: 'string', description: 'Spawn command (stdio)', required: false },
        { name: 'args', type: 'string', description: 'Comma-separated args (stdio)', required: false },
        { name: 'url', type: 'string', description: 'Server URL (streamableHttp)', required: false },
        { name: 'env', type: 'string', description: 'KEY=VALUE pairs, comma-separated', required: false },
        { name: 'description', type: 'string', description: 'Server description', required: false },
        { name: 'installed_from', type: 'string', description: 'Registry identifier', required: false },
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

          return { success: true, output: `MCP server "${name}" installed and connecting. Its tools will be available in your next conversation. Use mcp_list to verify installation status.` };
        } catch (err) {
          return { success: false, output: '', error: `Install error: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'mcp_list',
      description: 'List installed MCP servers with status and tools',
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
      description: 'Manage an MCP server: restart, enable, disable, remove',
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
      description: 'Get or set raw JSON config for MCP servers',
      parameters: [
        { name: 'operation', type: 'string', description: 'Operation', required: true, enum: ['get', 'set'] },
        { name: 'json', type: 'string', description: 'JSON config (for set)', required: false },
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

    // ── Webhook Management Tools ───────────────────────────────

    toolRegistry.register({
      name: 'webhook_create',
      description: 'Create a webhook endpoint with HMAC secret',
      parameters: [
        { name: 'name', type: 'string', description: 'Webhook name', required: true },
        { name: 'secret', type: 'string', description: 'Custom HMAC secret (auto-generated if omitted)', required: false },
      ],
      execute: async (params) => {
        const webhookMgr = this.config.webhookManager;
        if (!webhookMgr) return { success: false, output: '', error: 'Webhook system not initialized.' };
        const name = params.name as string;
        if (!name) return { success: false, output: '', error: 'Webhook name is required.' };
        try {
          const result = await webhookMgr.createWebhook(name, params.secret as string | undefined);
          return {
            success: true,
            output: `Webhook "${name}" created.\nID: ${result.id}\nURL: ${result.url}\nSecret: ${result.secret}\n\nSave the secret now — it will not be shown again.`,
            data: result,
          };
        } catch (err) {
          return { success: false, output: '', error: `Failed to create webhook: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'webhook_list',
      description: 'List registered webhook endpoints',
      parameters: [],
      execute: async () => {
        const webhookMgr = this.config.webhookManager;
        if (!webhookMgr) return { success: false, output: '', error: 'Webhook system not initialized.' };
        try {
          const webhooks = await webhookMgr.listWebhooks();
          if (webhooks.length === 0) {
            return { success: true, output: 'No webhooks configured.' };
          }
          const lines = webhooks.map((w) =>
            `- ${w.name} (ID: ${w.id})\n  URL: /api/webhook/${w.id}\n  Deliveries: ${w.deliveryCount} | Last used: ${w.lastUsed || 'never'}`
          );
          return { success: true, output: `Webhooks (${webhooks.length}):\n${lines.join('\n')}`, data: webhooks };
        } catch (err) {
          return { success: false, output: '', error: `Failed to list webhooks: ${formatErrorMessage(err)}` };
        }
      },
    });

    toolRegistry.register({
      name: 'webhook_delete',
      description: 'Delete a webhook endpoint by ID',
      parameters: [
        { name: 'id', type: 'string', description: 'Webhook ID', required: true },
      ],
      execute: async (params) => {
        const webhookMgr = this.config.webhookManager;
        if (!webhookMgr) return { success: false, output: '', error: 'Webhook system not initialized.' };
        const id = params.id as string;
        if (!id) return { success: false, output: '', error: 'Webhook ID is required.' };
        try {
          const deleted = await webhookMgr.deleteWebhook(id);
          if (deleted) {
            return { success: true, output: `Webhook ${id} deleted successfully.` };
          } else {
            return { success: false, output: '', error: `Webhook ${id} not found.` };
          }
        } catch (err) {
          return { success: false, output: '', error: `Failed to delete webhook: ${formatErrorMessage(err)}` };
        }
      },
    });

    // ── Gmail MCP Tools (conditional: only when Gmail OAuth is connected) ──

    const gp = this.config.gmailProvider;
    let gmailConnected = false;
    if (gp) {
      try {
        const gmailStatus = await gp.getStatus();
        gmailConnected = gmailStatus.connected;
      } catch {
        // If getStatus fails, Gmail is not connected
      }
    }

    if (gp && gmailConnected) {
      toolRegistry.register({
        name: 'gmail_read',
        description: 'Read a specific email by ID',
        parameters: [
          { name: 'id', type: 'string', description: 'Gmail message ID', required: true },
        ],
        execute: async (params) => {
          const id = params.id as string;
          if (!id) return { success: false, output: '', error: 'Email ID is required.' };
          try {
            const email = await gp.readEmail(id);
            const formatted = [
              `From: ${email.from}`,
              `To: ${email.to}`,
              email.cc ? `Cc: ${email.cc}` : null,
              `Date: ${email.date}`,
              `Subject: ${email.subject}`,
              `Labels: ${email.labels.join(', ')}`,
              `Thread: ${email.threadId}`,
              '',
              email.body || email.snippet,
            ].filter(Boolean).join('\n');
            return { success: true, output: formatted, data: email };
          } catch (err) {
            return { success: false, output: '', error: `Failed to read email: ${formatErrorMessage(err)}` };
          }
        },
      });

      toolRegistry.register({
        name: 'gmail_reply',
        description: 'Reply to an email thread',
        parameters: [
          { name: 'id', type: 'string', description: 'Message ID to reply to', required: true },
          { name: 'body', type: 'string', description: 'Reply body', required: true },
        ],
        execute: async (params) => {
          const { id, body } = params as { id: string; body: string };
          if (!id || !body) return { success: false, output: '', error: 'Email ID and body are required.' };
          try {
            const result = await gp.sendReply(id, body);
            return { success: true, output: `Reply sent (message ID: ${result.messageId})`, data: result };
          } catch (err) {
            return { success: false, output: '', error: `Failed to send reply: ${formatErrorMessage(err)}` };
          }
        },
      });

      toolRegistry.register({
        name: 'gmail_send',
        description: 'Compose and send a new email',
        parameters: [
          { name: 'to', type: 'string', description: 'Recipient email', required: true },
          { name: 'subject', type: 'string', description: 'Subject', required: true },
          { name: 'body', type: 'string', description: 'Email body', required: true },
        ],
        execute: async (params) => {
          const { to, subject, body } = params as { to: string; subject: string; body: string };
          if (!to || !subject || !body) return { success: false, output: '', error: 'To, subject, and body are required.' };
          try {
            const result = await gp.sendEmail(to, subject, body);
            return { success: true, output: `Email sent to ${to} (message ID: ${result.messageId})`, data: result };
          } catch (err) {
            return { success: false, output: '', error: `Failed to send email: ${formatErrorMessage(err)}` };
          }
        },
      });

      toolRegistry.register({
        name: 'gmail_search',
        description: 'Search emails with Gmail query operators',
        parameters: [
          { name: 'query', type: 'string', description: 'Gmail search query', required: true },
          { name: 'max_results', type: 'number', description: 'Max results', required: false, default: 10 },
        ],
        execute: async (params) => {
          const { query, max_results } = params as { query: string; max_results?: number };
          if (!query) return { success: false, output: '', error: 'Search query is required.' };
          try {
            const results = await gp.searchEmails(query, max_results || 10);
            if (results.length === 0) {
              return { success: true, output: 'No emails found matching the query.' };
            }
            const formatted = results.map((r, i) =>
              `[${i + 1}] ID: ${r.id}\n    From: ${r.from}\n    Subject: ${r.subject}\n    Date: ${r.date}\n    Preview: ${r.snippet.slice(0, 100)}`
            ).join('\n\n');
            return { success: true, output: `Found ${results.length} emails:\n\n${formatted}`, data: results };
          } catch (err) {
            return { success: false, output: '', error: `Failed to search emails: ${formatErrorMessage(err)}` };
          }
        },
      });

      toolRegistry.register({
        name: 'gmail_archive',
        description: 'Archive an email (remove from inbox)',
        parameters: [
          { name: 'id', type: 'string', description: 'Gmail message ID', required: true },
        ],
        execute: async (params) => {
          const id = params.id as string;
          if (!id) return { success: false, output: '', error: 'Email ID is required.' };
          try {
            await gp.archiveEmail(id);
            return { success: true, output: `Email ${id} archived successfully.` };
          } catch (err) {
            return { success: false, output: '', error: `Failed to archive email: ${formatErrorMessage(err)}` };
          }
        },
      });

      logger.info('Gmail MCP tools registered (gmail_read, gmail_reply, gmail_send, gmail_search, gmail_archive)');
    } else {
      logger.info('Tool skipped: gmail_* tools (Gmail OAuth not connected)');
    }

    // ── Multi-agent session tools ────────────────────────────────────────
    // Allow the AI agent to spawn, list, message, and inspect sub-agent sessions.
    // Sessions are managed by MultiAgentManager with Redis persistence.
    if (this.config.multiAgentManager) {
      const mam = this.config.multiAgentManager;

      toolRegistry.register({
        name: 'sessions_create',
        description: 'Spawn a sub-agent session for a specific task',
        parameters: [
          { name: 'task', type: 'string', description: 'Task description', required: true },
          { name: 'max_turns', type: 'number', description: 'Max turns (default 8)', required: false },
        ],
        execute: async (params) => {
          try {
            const session = await mam.create({
              parentSessionId: this.currentChannelContext?.chatId || this.currentWhatsAppJid || 'web',
              task: params.task as string,
              maxTurns: params.max_turns as number | undefined,
            });

            // Enqueue BullMQ job for sub-agent execution
            if (this.config.multiAgentQueue) {
              await this.config.multiAgentQueue.add('execute-sub-agent', {
                sessionId: session.id,
              }, {
                removeOnComplete: { count: 50 },
                removeOnFail: { count: 25 },
              });
              logger.info('Sub-agent job enqueued', { sessionId: session.id.slice(0, 8), task: session.task.slice(0, 80) });
            } else {
              logger.warn('sessions_create: multiAgentQueue not available, sub-agent will not execute');
            }

            return {
              success: true,
              output: `Sub-agent session created and queued for execution.\nID: ${session.id}\nTask: ${session.task}\nMax turns: ${session.maxTurns}\nStatus: pending\n\nUse sessions_history with this ID to check progress and results.`,
              data: session,
            };
          } catch (err: any) {
            return { success: false, output: '', error: err.message };
          }
        },
      });

      toolRegistry.register({
        name: 'sessions_list',
        description: 'List active sub-agent sessions',
        parameters: [
          { name: 'parent_session_id', type: 'string', description: 'Filter by parent session', required: false },
        ],
        execute: async (params) => {
          try {
            const sessions = await mam.list(params.parent_session_id as string | undefined);
            if (sessions.length === 0) {
              return { success: true, output: 'No active sub-agent sessions.' };
            }
            const lines = sessions.map(s =>
              `[${s.id.slice(0, 8)}] ${s.status} | Task: ${s.task.slice(0, 80)} | Turns: ${s.turns}/${s.maxTurns} | Tokens: ${s.inputTokens + s.outputTokens}`
            );
            return { success: true, output: lines.join('\n'), data: sessions };
          } catch (err: any) {
            return { success: false, output: '', error: err.message };
          }
        },
      });

      toolRegistry.register({
        name: 'sessions_send',
        description: 'Send a message to a sub-agent session',
        parameters: [
          { name: 'session_id', type: 'string', description: 'Session ID', required: true },
          { name: 'message', type: 'string', description: 'Message to send', required: true },
        ],
        execute: async (params) => {
          try {
            const session = await mam.get(params.session_id as string);
            if (!session) {
              return { success: false, output: '', error: `Session ${params.session_id} not found or expired.` };
            }
            if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
              return { success: false, output: '', error: `Session ${params.session_id} is already ${session.status}. Result: ${session.result || session.error || 'N/A'}` };
            }

            // Add the message to session history
            await mam.addMessage(params.session_id as string, {
              role: 'user',
              content: params.message as string,
              timestamp: Date.now(),
            });

            // Mark session as pending for the worker to pick up
            await mam.updateStatus(params.session_id as string, {
              status: 'pending',
              updatedAt: Date.now(),
            });

            // Enqueue BullMQ job for the sub-agent to process the new message
            // Only enqueue if session is not already running (avoid duplicate execution)
            if (this.config.multiAgentQueue && session.status !== 'running') {
              await this.config.multiAgentQueue.add('execute-sub-agent', {
                sessionId: params.session_id as string,
              }, {
                jobId: `sub-agent-send-${params.session_id}-${Date.now()}`,
                removeOnComplete: { count: 50 },
                removeOnFail: { count: 25 },
              });
            }

            return {
              success: true,
              output: `Message sent to session ${(params.session_id as string).slice(0, 8)}. Sub-agent will process it.\n\nUse sessions_history to check progress and results.`,
            };
          } catch (err: any) {
            return { success: false, output: '', error: err.message };
          }
        },
      });

      toolRegistry.register({
        name: 'sessions_history',
        description: 'Read sub-agent session history and result',
        parameters: [
          { name: 'session_id', type: 'string', description: 'Session ID', required: true },
        ],
        execute: async (params) => {
          try {
            const session = await mam.get(params.session_id as string);
            if (!session) {
              return { success: false, output: '', error: `Session ${params.session_id} not found or expired.` };
            }

            const history = await mam.getHistory(params.session_id as string);
            const lines: string[] = [
              `Session: ${session.id.slice(0, 8)}`,
              `Status: ${session.status}`,
              `Task: ${session.task}`,
              `Turns: ${session.turns}/${session.maxTurns}`,
              `Tokens: ${session.inputTokens} in / ${session.outputTokens} out`,
              '',
            ];

            if (history.length > 0) {
              lines.push('--- History ---');
              for (const msg of history) {
                lines.push(`[${msg.role}] ${msg.content.slice(0, 500)}`);
              }
            }

            if (session.result) {
              lines.push('', '--- Result ---', session.result);
            }
            if (session.error) {
              lines.push('', '--- Error ---', session.error);
            }

            return { success: true, output: lines.join('\n'), data: { session, history } };
          } catch (err: any) {
            return { success: false, output: '', error: err.message };
          }
        },
      });

      logger.info('Multi-agent session tools registered (sessions_create, sessions_list, sessions_send, sessions_history)');
    }

    // ── Canvas Tools (Live Canvas artifact creation/update) ──────────────
    if (this.config.canvasManager) {
      const canvasManager = this.config.canvasManager;

      toolRegistry.register({
        name: 'canvas_render',
        description: `Render interactive content in the Live Canvas panel next to the chat.

Types:
- react: React functional component (App/Main/Dashboard). React 18 + Tailwind + hooks available.
- html: HTML document or fragment. Tailwind CSS available.
- svg: SVG markup, centered on dark background.
- mermaid: Diagram definition (graph, sequence, ER, gantt, pie, etc). Dark theme.
- recharts: React component using Recharts (LineChart, BarChart, PieChart, etc as globals).`,
        parameters: [
          { name: 'type', type: 'string', description: 'Artifact type', required: true, enum: ['react', 'html', 'svg', 'mermaid', 'recharts'] },
          { name: 'title', type: 'string', description: 'Short title', required: true },
          { name: 'content', type: 'string', description: 'Source code for the artifact', required: true },
        ],
        execute: async (params) => {
          const { type, title, content } = params as { type: string; title: string; content: string };
          if (!type || !title || !content) {
            return { success: false, output: '', error: 'type, title, and content are required' };
          }
          const convId = this.currentCanvasConversationId || 'unknown';
          try {
            const artifact = await canvasManager.create({
              type: type as CanvasArtifact['type'],
              title,
              content,
              conversationId: convId,
            });
            return {
              success: true,
              output: `Canvas artifact "${title}" created (ID: ${artifact.id}, type: ${type}). The user can now see it in the Live Canvas panel.`,
              data: { artifactId: artifact.id, type, title, version: artifact.version },
            };
          } catch (err: any) {
            return { success: false, output: '', error: `Canvas render failed: ${err.message}` };
          }
        },
      });

      toolRegistry.register({
        name: 'canvas_update',
        description: 'Update content of an existing Live Canvas artifact',
        parameters: [
          { name: 'artifactId', type: 'string', description: 'Artifact ID', required: true },
          { name: 'content', type: 'string', description: 'Updated source code', required: true },
          { name: 'title', type: 'string', description: 'Updated title', required: false },
        ],
        execute: async (params) => {
          const { artifactId, content, title } = params as { artifactId: string; content: string; title?: string };
          if (!artifactId || !content) {
            return { success: false, output: '', error: 'artifactId and content are required' };
          }
          try {
            const artifact = await canvasManager.update(artifactId, content, title);
            if (!artifact) {
              return { success: false, output: '', error: `Artifact "${artifactId}" not found or expired` };
            }
            return {
              success: true,
              output: `Canvas artifact "${artifact.title}" updated (version ${artifact.version}).`,
              data: { artifactId: artifact.id, version: artifact.version, title: artifact.title },
            };
          } catch (err: any) {
            return { success: false, output: '', error: `Canvas update failed: ${err.message}` };
          }
        },
      });

      logger.info('Canvas tools registered (canvas_render, canvas_update)');
    }

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

  /** Send response via channel (Telegram, Discord, Slack, Matrix, WhatsApp).
   *  Uses the ChannelManager to route messages to the appropriate platform.
   *
   *  CHAN-05: Response routing uses per-request context (source, chatId from InboxItem)
   *  to prevent race conditions when multiple channels send concurrent messages.
   *  Do NOT replace item.source/item.from with instance state (this.currentChannelContext, etc.). */
  private async sendChannelResponse(item: InboxItem, text: string) {
    // Skip if not a channel source or no chatId
    const channelSources = ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'] as const;
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
        item.source as 'telegram' | 'discord' | 'slack' | 'matrix' | 'whatsapp',
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

  /** Fetch recent channel conversation history (Telegram, Discord, WhatsApp, etc.) */
  private async getChannelHistory(channel: string, chatId: string): Promise<string> {
    try {
      const key = `nexus:${channel}_history:${chatId}`;
      const items = await this.config.redis.lrange(key, 0, 19); // last 10 turns (20 entries)
      if (items.length === 0) return '';

      const entries: Array<{ role: string; text: string; ts: number }> = [];
      for (const item of items) {
        try {
          entries.push(JSON.parse(item));
        } catch { /* skip malformed */ }
      }

      // Sort oldest first
      entries.sort((a, b) => (a.ts || 0) - (b.ts || 0));

      return entries
        .map((e) => e.role === 'assistant' ? `Nexus: ${e.text}` : `User: ${e.text}`)
        .filter(Boolean)
        .join('\n');
    } catch (err) {
      logger.error('Failed to fetch channel history', { channel, error: formatErrorMessage(err) });
      return '';
    }
  }

  /** Resolve the canonical userId for a channel user via Redis identity cache.
   *  Falls back to the raw chatId if no mapping is cached (lazy creation by livinityd). */
  private async resolveCanonicalUserId(channel: string, chatId: string): Promise<string> {
    try {
      const cached = await this.config.redis.get(`nexus:identity:${channel}:${chatId}`);
      if (cached) return cached;
    } catch {
      // Redis unavailable — fall back to chatId
    }
    return chatId;
  }

  /** Cache a channel identity mapping in Redis for fast daemon-side lookups. */
  async linkIdentity(channel: string, channelUserId: string, canonicalUserId: string): Promise<void> {
    try {
      await this.config.redis.set(`nexus:identity:${channel}:${channelUserId}`, canonicalUserId);
    } catch {
      // Best-effort — identity will be resolved lazily
    }
  }

  /** Save a conversation turn to channel history */
  private async saveChannelTurn(channel: string, chatId: string, userMsg: string, response: string) {
    try {
      const key = `nexus:${channel}_history:${chatId}`;
      await this.config.redis.lpush(key,
        JSON.stringify({ role: 'assistant', text: response.slice(0, 2000), ts: Date.now() }),
        JSON.stringify({ role: 'user', text: userMsg.slice(0, 500), ts: Date.now() }),
      );
      // Keep only last 20 entries (10 turns) and set TTL of 24h
      await this.config.redis.ltrim(key, 0, 19);
      await this.config.redis.expire(key, 86400);

      // Resolve canonical userId before archiving for unified identity
      const canonicalId = await this.resolveCanonicalUserId(channel, chatId);

      // Archive to persistent SQLite store for cross-session search
      await this.archiveToMemory(canonicalId, channel, chatId, 'user', userMsg);
      await this.archiveToMemory(canonicalId, channel, chatId, 'assistant', response);
    } catch (err) {
      logger.error('Failed to save channel turn', { channel, error: formatErrorMessage(err) });
    }
  }

  /** Archive a conversation turn to the memory service for persistent FTS5-backed search */
  private async archiveToMemory(userId: string, channel: string, chatId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    try {
      await fetch('http://localhost:3300/archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.LIV_API_KEY || '',
        },
        body: JSON.stringify({ userId, channel, chatId, role, content }),
      });
    } catch (err) {
      logger.error('Failed to archive conversation turn', { channel, error: formatErrorMessage(err) });
    }
  }

  /** Build an onAction callback that sends live action updates to the appropriate channel.
   *
   *  CHAN-05: Uses per-request closure context (chatId, source parameters) for routing,
   *  not instance state. Each inbox item creates its own callback with its own routing context.
   *  Do NOT replace these parameters with this.currentChannelContext or similar instance state. */
  private buildActionCallback(chatId?: string, source?: Intent['source']) {
    if (!chatId) return undefined;
    let lastSentText = '';
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
      // Only send the AI's own reasoning text
      if (action.type !== 'thinking' || !action.thought) return;

      let text = action.thought.trim();
      if (!text) return;

      // Take first sentence or max 150 chars
      const sentenceEnd = text.search(/[.!?]\s/);
      if (sentenceEnd > 0 && sentenceEnd < 150) {
        text = text.slice(0, sentenceEnd + 1);
      } else if (text.length > 150) {
        text = text.slice(0, 147) + '...';
      }

      // Don't send if identical to last
      if (text === lastSentText) return;
      lastSentText = text;

      const line = `💭 ${text}`;
      this.actionMessageCount++;

      // Route to appropriate channel (including WhatsApp via ChannelManager)
      const channelSources = ['telegram', 'discord', 'slack', 'matrix', 'whatsapp'] as const;
      if (source && channelSources.includes(source as any) && this.config.channelManager) {
        this.config.channelManager.sendMessage(
          source as 'telegram' | 'discord' | 'slack' | 'matrix' | 'whatsapp',
          chatId,
          line
        ).catch(() => {});
      }
    };
  }

  /** Route subagent result to the correct channel based on createdVia */
  private async routeSubagentResult(config: import('./subagent-manager.js').SubagentConfig, text: string): Promise<void> {
    const via = config.createdVia || 'whatsapp';
    const chatId = config.createdChatId || config.createdBy;

    if (['whatsapp', 'telegram', 'discord', 'slack', 'matrix'].includes(via) && this.config.channelManager && chatId) {
      await this.config.channelManager.sendMessage(via as any, chatId, text).catch((err) => {
        logger.error('routeSubagentResult: channel send failed', { via, chatId, error: formatErrorMessage(err) });
      });
    } else if (via === 'web' || via === 'mcp') {
      // Web/MCP: publish to Redis pubsub for WebSocket gateway pickup
      await this.config.redis.publish('nexus:agent_results', JSON.stringify({
        subagentId: config.id,
        subagentName: config.name,
        text,
        timestamp: Date.now(),
      }));
    } else {
      logger.warn('routeSubagentResult: no route for result', { via, chatId, subagentId: config.id });
    }
  }

  /** Execute a task as a specific subagent with its own context and system prompt */
  public async executeSubagentTask(subagentId: string, task: string, previousState?: string): Promise<string> {
    const config = await this.config.subagentManager.get(subagentId);
    if (!config) throw new Error(`Subagent "${subagentId}" not found.`);
    if (config.status !== 'active') throw new Error(`Subagent "${subagentId}" is ${config.status}.`);

    // Get conversation history for context
    const history = await this.config.subagentManager.getHistoryContext(subagentId, 10);

    // Build scoped tool registry
    const scopedRegistry = new ToolRegistry();
    const agentTools = config.tools || config.skills || ['*'];
    for (const toolName of agentTools.includes('*') ? this.config.toolRegistry.list() : agentTools) {
      const tool = this.config.toolRegistry.get(toolName);
      if (tool) scopedRegistry.register(tool);
    }

    // Ensure basic tools are always available
    for (const basicTool of ['memory_search', 'memory_add', 'conversation_search', 'progress_report']) {
      if (!scopedRegistry.get(basicTool)) {
        const tool = this.config.toolRegistry.get(basicTool);
        if (tool) scopedRegistry.register(tool);
      }
    }

    // Detect if native tool mode is active (Kimi uses native tool calling)
    const activeProvider = await this.config.brain.getActiveProviderId();
    const useNativeTools = activeProvider === 'kimi';

    const systemPrompt = config.systemPrompt
      ? subagentPrompt(config.name, config.systemPrompt, scopedRegistry.listForPrompt(), useNativeTools)
      : subagentPrompt(config.name, config.description, scopedRegistry.listForPrompt(), useNativeTools);

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

    const agentConfig = {
      brain: this.config.brain,
      toolRegistry: scopedRegistry,
      nexusConfig: subNexusConfig,
      maxTurns: config.maxTurns,
      maxTokens: 300_000,
      timeoutMs: 600_000,
      tier: config.tier as 'haiku' | 'sonnet' | 'opus',
      systemPromptOverride: systemPrompt,
      contextPrefix: contextPrefix || undefined,
      approvalManager: this.config.approvalManager,
      approvalPolicy: subApprovalPolicy as 'always' | 'destructive' | 'never',
      sessionId: randomUUID(),
    };

    // Always use SdkAgentRunner — uses Claude CLI OAuth (no API key needed)
    const agent = new SdkAgentRunner(agentConfig);

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
        tier: 'haiku',
        maxTokens: 1024,
      });

      // Parse reflection response (with fallback for malformed JSON)
      const cleaned = response.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      let reflection: any;
      try {
        reflection = JSON.parse(cleaned);
      } catch {
        // Regex fallback: extract JSON object from response
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { reflection = JSON.parse(jsonMatch[0]); } catch { reflection = null; }
        }
        if (!reflection) {
          logger.warn('Self-reflection: could not parse response as JSON', { response: cleaned.slice(0, 200) });
          return;
        }
      }

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
