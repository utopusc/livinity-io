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
import { ToolRegistry, type ToolPolicy } from './tool-registry.js';
import type { NexusConfig } from './config/schema.js';
import { buildSdkTools, tierToModel, isCdpReachable } from './sdk-agent-runner.js';
import { composeSystemPrompt, type IntentResult } from './intent-router.js';
import type { IntentRouter } from './intent-router.js';
import type { Tool } from './types.js';
import { logger } from './logger.js';

// ── Wire Protocol Types ──────────────────────────────────────

/** Server -> Client WebSocket messages */
export type AgentWsMessage =
  | { type: 'sdk_message'; data: SDKMessage }
  | { type: 'error'; message: string }
  | { type: 'session_ready'; sessionId: string };

/** Client -> Server WebSocket messages */
export type ClientWsMessage =
  | { type: 'start'; prompt: string; sessionId?: string; model?: string; conversationId?: string }
  | { type: 'message'; text: string }
  | { type: 'interrupt' }
  | { type: 'cancel' };

// ── Turn Data ───────────────────────────────────────────────

/** Data accumulated from a single agent turn for persistence */
export interface TurnData {
  sessionId: string;
  conversationId?: string;
  userPrompt: string;
  assistantContent: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    output?: string;
    isError?: boolean;
  }>;
}

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
  conversationId?: string;
  abortController: AbortController;
  inputChannel: ReturnType<typeof createInputChannel>;
  startedAt: number;
}

// ── Base System Prompt ───────────────────────────────────────

/** Base system prompt — extended dynamically per session via composeSystemPrompt() */
const BASE_SYSTEM_PROMPT =
  `You are Nexus, an autonomous AI assistant running on a Linux server. You interact with users via WhatsApp, Telegram, Discord, and a web UI.\n\n` +
  `You have access to MCP tools (prefixed with mcp__nexus-tools__) for shell commands, Docker management, file operations, web browsing, memory, and messaging.\n\n` +
  `CRITICAL RULES:\n` +
  `1. ONLY do what the user explicitly asks. Do NOT invent tasks, repeat previous work, or act on conversation history unless the user specifically requests it.\n` +
  `2. If the user sends a greeting or simple message, respond conversationally -- do NOT run tools.\n` +
  `3. Conversation history (if provided) is CONTEXT ONLY. Do NOT re-execute tasks from history.\n` +
  `4. Be concise. For simple questions, respond in 1-2 sentences without using tools.\n` +
  `5. If a tool fails, try ONE alternative approach, then report the issue.\n` +
  `6. When the task is complete, provide your final answer immediately -- do not keep exploring.`;

// ── Agent Session Manager ────────────────────────────────────

export class AgentSessionManager {
  private sessions = new Map<string, ActiveSession>();
  private toolRegistry: ToolRegistry;
  private nexusConfig?: NexusConfig;
  private intentRouter: IntentRouter | null;

  constructor(opts: { toolRegistry: ToolRegistry; nexusConfig?: NexusConfig; intentRouter?: IntentRouter }) {
    this.toolRegistry = opts.toolRegistry;
    this.nexusConfig = opts.nexusConfig;
    this.intentRouter = opts.intentRouter ?? null;
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
    opts?: { conversationId?: string; onTurnComplete?: (turn: TurnData) => void },
  ): Promise<string> {
    // Cancel existing session for this user
    this.cleanup(userId);

    const sessionId = randomUUID();
    const inputChannel = createInputChannel();
    const abortController = new AbortController();

    const session: ActiveSession = {
      userId,
      sessionId,
      conversationId: opts?.conversationId,
      abortController,
      inputChannel,
      startedAt: Date.now(),
    };

    this.sessions.set(userId, session);

    // Send session_ready to the client
    onMessage({ type: 'session_ready', sessionId });

    // Start the relay loop in a detached promise (long-running)
    this.consumeAndRelay(userId, prompt, model, onMessage, opts?.onTurnComplete).catch((err) => {
      logger.error('AgentSessionManager: consumeAndRelay failed', { userId, error: err.message });
    });

    return sessionId;
  }

  /**
   * Consume SDK query() messages and relay them to the WebSocket client.
   * This is the main relay loop that bridges SDK output to the browser.
   *
   * Accumulates assistant text and tool calls per turn, calling onTurnComplete
   * when a 'result' message arrives so the caller can persist the conversation.
   */
  private async consumeAndRelay(
    userId: string,
    prompt: string,
    model: string | undefined,
    onMessage: (msg: AgentWsMessage) => void,
    onTurnComplete?: (turn: TurnData) => void,
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

    // Budget cap per tier (declared early — needed by IntentRouter)
    const tier = model ?? agentDefaults?.tier ?? 'sonnet';

    // Intent-based tool selection: use IntentRouter to select relevant tools
    let sdkTools: ReturnType<typeof buildSdkTools> = [];
    let intentResult: IntentResult | null = null;

    if (this.intentRouter) {
      try {
        intentResult = await this.intentRouter.resolveCapabilities(prompt, tier);
        const intentToolNames = this.intentRouter.getToolNamesFromCapabilities(intentResult.capabilities);
        // Create a scoped registry containing only intent-matched tools
        const scopedRegistry = new ToolRegistry();
        for (const toolName of intentToolNames) {
          const tool = this.toolRegistry.get(toolName);
          if (tool) scopedRegistry.register(tool);
        }

        // Register discover_capability tool in scoped registry
        const intentRouterRef = this.intentRouter;
        const fullRegistryRef = this.toolRegistry;
        const discoverCapabilityTool: Tool = {
          name: 'discover_capability',
          description:
            'Search the capability registry for a tool or skill matching a query. Returns matching capability info so you know what is available. Use this when you need a capability that is not currently loaded in this session.',
          parameters: [
            {
              name: 'query',
              type: 'string',
              description: 'Natural language description of the capability needed',
              required: true,
            },
          ],
          execute: async (params) => {
            const query = String(params.query || '');
            if (!query) {
              return { success: false, output: '', error: 'query parameter is required' };
            }

            try {
              const allCaps = await intentRouterRef.getCapabilitiesList();
              const queryLower = query.toLowerCase();

              // Filter: match capabilities by name, description, or semantic_tags (case-insensitive substring)
              const matches = allCaps.filter((cap) => {
                if (cap.name.toLowerCase().includes(queryLower)) return true;
                if (cap.description.toLowerCase().includes(queryLower)) return true;
                for (const tag of cap.semantic_tags) {
                  if (tag.toLowerCase().includes(queryLower)) return true;
                }
                return false;
              });

              if (matches.length === 0) {
                return {
                  success: true,
                  output:
                    'No matching capabilities found in the registry. The capability may need to be installed from the marketplace.',
                };
              }

              // Sort matches by name for deterministic ordering, take top 5
              matches.sort((a, b) => a.name.localeCompare(b.name));
              const topMatches = matches.slice(0, 5);

              const matchDescriptions = topMatches
                .map(
                  (cap) =>
                    `- **${cap.name}** (${cap.id}): ${cap.description}\n  Tools: [${cap.provides_tools.join(', ')}]`,
                )
                .join('\n');

              const topMatch = topMatches[0];

              logger.info('AgentSessionManager: discover_capability found matches', {
                query,
                matchCount: matches.length,
                topMatch: topMatch.id,
              });

              return {
                success: true,
                output:
                  `Found ${matches.length} matching capability(ies):\n\n${matchDescriptions}\n\n` +
                  `The top match "${topMatch.name}" provides tools: [${topMatch.provides_tools.join(', ')}]. ` +
                  `These tools will be auto-loaded in your next message turn based on conversation context. ` +
                  `You can inform the user about the available capability.`,
              };
            } catch (err: any) {
              logger.error('AgentSessionManager: discover_capability error', { error: err.message });
              return {
                success: false,
                output: '',
                error: `Failed to search registry: ${err.message}`,
              };
            }
          },
        };
        scopedRegistry.register(discoverCapabilityTool);

        // Build SDK tools AFTER registering discover_capability
        sdkTools = buildSdkTools(scopedRegistry, toolPolicy);
        logger.info('AgentSessionManager: intent-based tool selection', {
          userId,
          intentCapabilities: intentResult.capabilities.length,
          intentTools: intentToolNames.length,
          fromCache: intentResult.fromCache,
          totalContextCost: intentResult.totalContextCost,
          sdkToolCount: sdkTools.length,
          hasDiscoverCapability: true,
        });
      } catch (err: any) {
        // Fallback to full tool set if intent routing fails
        logger.error('AgentSessionManager: intent routing failed, using full tool set', { error: err.message });
        sdkTools = this.toolRegistry ? buildSdkTools(this.toolRegistry, toolPolicy) : [];
      }
    } else {
      // No intent router — use full tool set (backward compatible)
      sdkTools = this.toolRegistry ? buildSdkTools(this.toolRegistry, toolPolicy) : [];
    }

    // Build allowedTools and MCP servers only if we have tools
    const allowedTools: string[] = [];
    const mcpServers: Record<string, any> = {};

    if (sdkTools.length > 0) {
      const mcpServer = createSdkMcpServer({
        name: 'nexus-tools',
        tools: sdkTools,
      });
      mcpServers['nexus-tools'] = mcpServer;
      allowedTools.push(...sdkTools.map((t: any) => `mcp__nexus-tools__${t.name}`));
    }

    // Build system prompt — dynamic composition from base + loaded capability instructions
    const systemPrompt = intentResult
      ? composeSystemPrompt(BASE_SYSTEM_PROMPT, intentResult.capabilities)
      : BASE_SYSTEM_PROMPT;
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
      conversationId: session.conversationId,
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

    // Turn accumulation for persistence
    let accumulatedText = '';
    const accumulatedToolCalls: TurnData['toolCalls'] = [];
    // Track current user prompt (starts with initial prompt, updated on follow-up messages)
    let currentUserPrompt = prompt;

    /** Flush accumulated turn data to the onTurnComplete callback */
    const flushTurn = () => {
      if (!onTurnComplete) return;
      if (!accumulatedText && accumulatedToolCalls.length === 0) return;

      try {
        onTurnComplete({
          sessionId: session.sessionId,
          conversationId: session.conversationId,
          userPrompt: currentUserPrompt,
          assistantContent: accumulatedText,
          toolCalls: [...accumulatedToolCalls],
        });
      } catch (err: any) {
        logger.error('AgentSessionManager: onTurnComplete callback error', { error: err.message });
      }

      // Reset accumulators for next turn
      accumulatedText = '';
      accumulatedToolCalls.length = 0;
    };

    try {
      // Push the initial user prompt into the input channel
      session.inputChannel.push({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] },
        session_id: session.sessionId,
        parent_tool_use_id: null,
      });

      logger.info('AgentSessionManager: calling SDK query()', {
        userId,
        model: tierToModel(tier),
        mcpServerCount: Object.keys(mcpServers).length,
        toolCount: sdkTools.length,
        allowedToolCount: allowedTools.length,
      });

      const messages = query({
        prompt: session.inputChannel.generator,
        options: {
          systemPrompt,
          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
          tools: [],
          allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
          maxTurns,
          maxBudgetUsd,
          model: tierToModel(tier),
          permissionMode: 'dontAsk',
          persistSession: false,
          abortController: session.abortController,
          env: safeEnv,
          includePartialMessages: true,
        },
      });

      logger.info('AgentSessionManager: SDK query() returned, starting relay loop');

      // Relay each SDK message to the WebSocket client and accumulate turn data
      // Stream events are normalized to compact format for lower latency over tunnel.
      let streamDeltaCount = 0;
      let lastDeltaLogTime = 0;
      for await (const message of messages) {
        const m = message as any;
        lastMessageTime = Date.now();

        // Normalize stream text deltas to compact format (claudecodeui pattern)
        // SDK structure: m.type='stream_event', m.event={type:'content_block_delta', delta:{type:'text_delta', text:'...'}}
        // Note: m.event is an OBJECT (not a string), and delta is inside m.event (not m.delta)
        const evt = m.type === 'stream_event' ? m.event : null;
        if (evt?.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          streamDeltaCount++;
          const now = Date.now();
          if (now - lastDeltaLogTime > 500) {
            logger.info('AgentSessionManager: streaming', { deltaCount: streamDeltaCount, textLen: evt.delta.text.length });
            lastDeltaLogTime = now;
          }
          onMessage({ type: 'sdk_message', data: { type: 'stream_delta', text: evt.delta.text } as any });
        } else {
          onMessage({ type: 'sdk_message', data: message });
        }

        // Accumulate data for persistence
        const msg = message as any;

        if (msg.type === 'assistant') {
          // Assistant message — extract text content blocks
          const betaMessage = msg.message;
          if (betaMessage && Array.isArray(betaMessage.content)) {
            for (const block of betaMessage.content) {
              if (block.type === 'text' && block.text) {
                accumulatedText = block.text;
              } else if (block.type === 'tool_use') {
                accumulatedToolCalls.push({
                  name: block.name,
                  input: block.input || {},
                });
              }
            }
          }
        } else if (msg.type === 'stream_event') {
          // Streaming content delta — append text
          // SDK wraps events: msg.event is an object with .type, .delta, etc.
          const streamEvt = msg.event;
          if (streamEvt?.type === 'content_block_delta' && streamEvt.delta?.type === 'text_delta' && streamEvt.delta.text) {
            accumulatedText += streamEvt.delta.text;
          }
        } else if (msg.type === 'user') {
          // User message — may contain tool_result blocks with outputs
          const contentBlocks = msg.message?.content;
          if (Array.isArray(contentBlocks)) {
            for (const block of contentBlocks) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                // Find the matching tool call and attach output
                const tc = accumulatedToolCalls.find(
                  (t) => !t.output && accumulatedToolCalls.indexOf(t) >= 0,
                );
                if (tc) {
                  let outputStr = '';
                  if (typeof block.content === 'string') {
                    outputStr = block.content;
                  } else if (Array.isArray(block.content)) {
                    outputStr = block.content
                      .filter((b: any) => b.type === 'text' && b.text)
                      .map((b: any) => b.text)
                      .join('\n');
                  }
                  tc.output = outputStr;
                  tc.isError = block.is_error === true;
                }
              } else if (block.type === 'text' && block.text) {
                // Follow-up user message — update current prompt
                currentUserPrompt = block.text;
              }
            }
          }
        } else if (msg.type === 'result') {
          // End of turn — flush accumulated data
          flushTurn();
        }
      }
      logger.info('AgentSessionManager: relay loop ended', {
        userId,
        sessionId: session.sessionId,
        streamDeltaCount,
        accumulatedTextLen: accumulatedText.length,
        toolCallCount: accumulatedToolCalls.length,
      });
    } catch (err: any) {
      // Only send error if not an abort (abort is intentional)
      if (err.name !== 'AbortError' && !session.abortController.signal.aborted) {
        logger.error('AgentSessionManager: relay error', {
          userId,
          sessionId: session.sessionId,
          error: err.message,
          stack: err.stack?.split('\n').slice(0, 3).join(' | '),
        });
        onMessage({ type: 'error', message: err.message });
      } else {
        logger.info('AgentSessionManager: session aborted', { userId, sessionId: session.sessionId });
      }
    } finally {
      // Flush any remaining accumulated content that wasn't flushed by a result message
      flushTurn();
      clearInterval(watchdog);
      // Only cleanup if WE are still the active session for this userId.
      // A new startSession() may have already replaced us — don't kill the new session!
      const currentSession = this.sessions.get(userId);
      if (currentSession && currentSession.sessionId === session.sessionId) {
        this.cleanup(userId);
      }
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
    opts?: { onTurnComplete?: (turn: TurnData) => void },
  ): Promise<void> {
    switch (msg.type) {
      case 'start': {
        await this.startSession(userId, msg.prompt, msg.model, onMessage, {
          conversationId: msg.conversationId,
          onTurnComplete: opts?.onTurnComplete,
        });
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
