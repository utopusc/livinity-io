/**
 * AgentSessionManager — Maps user sessions to SDK query() instances with relay semantics.
 *
 * Manages per-user agent sessions: start, message injection, interrupt, cancel.
 * Each user can have at most one active session. Starting a new session cancels
 * the previous one.
 *
 * Used by the /ws/agent WebSocket endpoint on livinityd to stream SDK messages
 * to the browser in real-time.
 */

import { randomUUID } from 'node:crypto';
import {
  query,
  createSdkMcpServer,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ToolRegistry, ToolPolicy } from './tool-registry.js';
import type { NexusConfig } from './config/schema.js';
import { buildSdkTools, tierToModel, isCdpReachable } from './sdk-agent-runner.js';
import { logger } from './logger.js';

// ── Wire Protocol Types ──────────────────────────────────────

/** Server -> Client WebSocket messages */
export type AgentWsMessage =
  | { type: 'sdk_message'; data: SDKMessage }
  | { type: 'error'; message: string }
  | { type: 'session_ready'; sessionId: string };

/** Client -> Server WebSocket messages */
export type ClientWsMessage =
  | { type: 'start'; prompt: string; sessionId?: string; model?: string }
  | { type: 'message'; text: string }
  | { type: 'interrupt' }
  | { type: 'cancel' };

// ── Input Channel ────────────────────────────────────────────

/**
 * Creates a controllable async generator input stream for mid-conversation
 * message injection into the SDK query().
 *
 * Uses a pending array + resolve callback pattern:
 * - Generator yields from pending array
 * - Awaits a Promise when empty
 * - push() adds to pending and resolves the wait
 * - close() breaks the generator loop
 */
export function createInputChannel() {
  const pending: SDKUserMessage[] = [];
  let resolve: (() => void) | null = null;
  let closed = false;

  async function* generator(): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      if (pending.length === 0) {
        await new Promise<void>((r) => {
          resolve = r;
        });
        // After resolving, check if we were closed while waiting
        if (closed) break;
      }
      while (pending.length > 0) {
        yield pending.shift()!;
      }
    }
  }

  function push(msg: SDKUserMessage) {
    if (closed) return;
    pending.push(msg);
    if (resolve) {
      resolve();
      resolve = null;
    }
  }

  function close() {
    closed = true;
    // Resolve any pending wait so the generator can exit
    if (resolve) {
      resolve();
      resolve = null;
    }
  }

  return { generator: generator(), push, close };
}

// ── Active Session ───────────────────────────────────────────

export interface ActiveSession {
  userId: string;
  sessionId: string;
  abortController: AbortController;
  inputChannel: ReturnType<typeof createInputChannel>;
  startedAt: number;
}

// ── Agent Session Manager ────────────────────────────────────

export class AgentSessionManager {
  private sessions = new Map<string, ActiveSession>();
  private toolRegistry: ToolRegistry;
  private nexusConfig?: NexusConfig;

  constructor(opts: { toolRegistry: ToolRegistry; nexusConfig?: NexusConfig }) {
    this.toolRegistry = opts.toolRegistry;
    this.nexusConfig = opts.nexusConfig;
  }

  /** Get the active session for a user, if any */
  getSession(userId: string): ActiveSession | undefined {
    return this.sessions.get(userId);
  }

  /**
   * Start a new agent session for the given user.
   * Cancels any existing session for this user first.
   * Returns the new sessionId.
   */
  async startSession(
    userId: string,
    prompt: string,
    model: string | undefined,
    onMessage: (msg: AgentWsMessage) => void,
  ): Promise<string> {
    // Cancel existing session for this user
    this.cleanup(userId);

    const sessionId = randomUUID();
    const inputChannel = createInputChannel();
    const abortController = new AbortController();

    const session: ActiveSession = {
      userId,
      sessionId,
      abortController,
      inputChannel,
      startedAt: Date.now(),
    };

    this.sessions.set(userId, session);

    // Send session_ready to the client
    onMessage({ type: 'session_ready', sessionId });

    // Start the relay loop in a detached promise (long-running)
    this.consumeAndRelay(userId, prompt, model, onMessage).catch((err) => {
      logger.error('AgentSessionManager: consumeAndRelay failed', { userId, error: err.message });
    });

    return sessionId;
  }

  /**
   * Consume SDK query() messages and relay them to the WebSocket client.
   * This is the main relay loop that bridges SDK output to the browser.
   */
  private async consumeAndRelay(
    userId: string,
    prompt: string,
    model: string | undefined,
    onMessage: (msg: AgentWsMessage) => void,
  ): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    const nexusConfig = this.nexusConfig;
    const agentDefaults = nexusConfig?.agent;
    const toolsConfig = nexusConfig?.tools;
    const toolPolicy = toolsConfig
      ? ({
          profile: toolsConfig.profile,
          allow: toolsConfig.allow,
          deny: toolsConfig.deny,
          alsoAllow: toolsConfig.alsoAllow,
        } as ToolPolicy)
      : undefined;

    // Build MCP tool definitions from Nexus ToolRegistry
    const sdkTools = buildSdkTools(this.toolRegistry, toolPolicy);

    // Create an SDK MCP server that hosts our Nexus tools
    const mcpServer = createSdkMcpServer({
      name: 'nexus-tools',
      tools: sdkTools,
    });

    // Build allowedTools list so Claude Code auto-approves our MCP tools
    const allowedTools = sdkTools.map((t: any) => `mcp__nexus-tools__${t.name}`);

    // Build MCP servers config
    const mcpServers: Record<string, any> = {
      'nexus-tools': mcpServer,
    };

    // Add Chrome DevTools MCP if Chrome CDP is reachable
    const browserUrl = (nexusConfig?.browser?.cdpUrl ?? 'ws://127.0.0.1:9223').replace(
      /^ws:\/\//,
      'http://',
    );
    if (nexusConfig?.browser?.enabled !== false) {
      const cdpReachable = await isCdpReachable(browserUrl).catch(() => false);
      if (cdpReachable) {
        mcpServers['chrome-devtools'] = {
          type: 'stdio' as const,
          command: 'chrome-devtools-mcp',
          args: ['--browserUrl', browserUrl, '--no-usage-statistics'],
        };
        allowedTools.push('mcp__chrome-devtools__*');
        logger.info('AgentSessionManager: Chrome DevTools MCP enabled', { browserUrl });
      }
    }

    // Build system prompt
    const systemPrompt =
      `You are Nexus, an autonomous AI assistant running on a Linux server. You interact with users via WhatsApp, Telegram, Discord, and a web UI.\n\n` +
      `You have access to MCP tools (prefixed with mcp__nexus-tools__) for shell commands, Docker management, file operations, web browsing, memory, and messaging.\n\n` +
      `CRITICAL RULES:\n` +
      `1. ONLY do what the user explicitly asks. Do NOT invent tasks, repeat previous work, or act on conversation history unless the user specifically requests it.\n` +
      `2. If the user sends a greeting or simple message, respond conversationally -- do NOT run tools.\n` +
      `3. Conversation history (if provided) is CONTEXT ONLY. Do NOT re-execute tasks from history.\n` +
      `4. Be concise. For simple questions, respond in 1-2 sentences without using tools.\n` +
      `5. If a tool fails, try ONE alternative approach, then report the issue.\n` +
      `6. When the task is complete, provide your final answer immediately -- do not keep exploring.`;

    // Budget cap per tier
    const tier = model ?? agentDefaults?.tier ?? 'sonnet';
    const budgetByTier: Record<string, number> = {
      opus: 10.0,
      sonnet: 5.0,
      haiku: 2.0,
      flash: 2.0,
    };
    const maxBudgetUsd = budgetByTier[tier] ?? 5.0;
    const maxTurns = agentDefaults?.maxTurns ?? 25;

    // Minimal subprocess environment to avoid leaking secrets
    const safeEnv: Record<string, string | undefined> = {
      HOME: process.env.HOME || '/root',
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      NODE_ENV: process.env.NODE_ENV || 'production',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };
    if (process.env.ANTHROPIC_API_KEY) {
      safeEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }

    logger.info('AgentSessionManager: starting session', {
      userId,
      sessionId: session.sessionId,
      model: tierToModel(tier),
      maxTurns,
      maxBudgetUsd,
      toolCount: sdkTools.length,
    });

    // 60s watchdog interval checking lastMessageTime
    let lastMessageTime = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastMessageTime > 60_000) {
        logger.warn('AgentSessionManager: watchdog triggered -- no message in 60s, aborting', {
          userId,
          sessionId: session.sessionId,
        });
        session.abortController.abort();
      }
    }, 10_000);

    try {
      // Push the initial user prompt into the input channel
      session.inputChannel.push({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] },
        session_id: session.sessionId,
        parent_tool_use_id: null,
      });

      const messages = query({
        prompt: session.inputChannel.generator,
        options: {
          systemPrompt,
          mcpServers,
          tools: [],
          allowedTools,
          maxTurns,
          maxBudgetUsd,
          model: tierToModel(tier),
          permissionMode: 'dontAsk',
          persistSession: false,
          abortController: session.abortController,
          env: safeEnv,
        },
      });

      // Relay each SDK message to the WebSocket client
      for await (const message of messages) {
        lastMessageTime = Date.now();
        onMessage({ type: 'sdk_message', data: message });
      }
    } catch (err: any) {
      // Only send error if not an abort (abort is intentional)
      if (err.name !== 'AbortError' && !session.abortController.signal.aborted) {
        logger.error('AgentSessionManager: relay error', {
          userId,
          sessionId: session.sessionId,
          error: err.message,
        });
        onMessage({ type: 'error', message: err.message });
      }
    } finally {
      clearInterval(watchdog);
      this.cleanup(userId);
    }
  }

  /**
   * Handle an incoming client WebSocket message.
   * Dispatches to the appropriate action based on message type.
   */
  async handleMessage(
    userId: string,
    msg: ClientWsMessage,
    onMessage: (msg: AgentWsMessage) => void,
  ): Promise<void> {
    switch (msg.type) {
      case 'start': {
        await this.startSession(userId, msg.prompt, msg.model, onMessage);
        break;
      }
      case 'message': {
        const session = this.sessions.get(userId);
        if (!session) {
          onMessage({ type: 'error', message: 'No active session' });
          return;
        }
        session.inputChannel.push({
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: msg.text }] },
          session_id: session.sessionId,
          parent_tool_use_id: null,
        });
        break;
      }
      case 'interrupt': {
        const session = this.sessions.get(userId);
        if (!session) {
          onMessage({ type: 'error', message: 'No active session to interrupt' });
          return;
        }
        session.abortController.abort();
        break;
      }
      case 'cancel': {
        this.cleanup(userId);
        break;
      }
    }
  }

  /** Clean up a user's session: abort, close input channel, remove from map */
  cleanup(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    logger.info('AgentSessionManager: cleaning up session', {
      userId,
      sessionId: session.sessionId,
    });

    // Abort the SDK query
    if (!session.abortController.signal.aborted) {
      session.abortController.abort();
    }

    // Close the input channel generator
    session.inputChannel.close();

    // Remove from sessions map
    this.sessions.delete(userId);
  }
}
