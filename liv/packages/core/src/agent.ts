import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { Brain, ChatMessage } from './brain.js';
import { ToolRegistry } from './tool-registry.js';
import type { ToolResult } from './types.js';
import type { ToolDefinition, ToolUseBlock, ToolResultBlock } from './providers/types.js';
import { logger } from './logger.js';
import type { NexusConfig } from './config/schema.js';
import { getThinkingPromptModifier, getVerbosePromptModifier, getResponseStylePromptModifier, getUserPersonalizationPromptModifier, type ThinkLevel, type VerboseLevel, type ResponseConfig, type UserPersonalization } from './thinking.js';
import type { ApprovalManager } from './approval-manager.js';

/** Events emitted during agent execution for real-time streaming */
export interface AgentEvent {
  type: 'thinking' | 'chunk' | 'tool_call' | 'observation' | 'final_answer' | 'error' | 'done';
  turn?: number;
  data?: unknown;
}

export interface AgentConfig {
  brain: Brain;
  toolRegistry: ToolRegistry;
  /** Optional config for dynamic settings - if not provided, uses hardcoded defaults */
  nexusConfig?: NexusConfig;
  /**
   * Override HOME env for the spawned claude CLI subprocess.
   * Used for per-user OAuth credential isolation in multi-user mode
   * (each user's `.claude/.credentials.json` lives in their own synthetic dir
   * under /opt/livos/data/users/<user_id>/.claude/).
   *
   * When undefined: falls back to process.env.HOME || '/root' (pre-Phase-40 behavior).
   *
   * Introduced in v29.3 Phase 40 (FR-AUTH-03). See .planning/phases/40-per-user-claude-oauth-home-isolation/40-CONTEXT.md D-40-02.
   */
  homeOverride?: string;
  maxTurns?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Model tier: none (no model), haiku (fast/cheap), sonnet (balanced), opus (most capable) */
  tier?: 'none' | 'haiku' | 'sonnet' | 'opus';
  /** Current nesting depth (0 = root agent) */
  depth?: number;
  /** Maximum nesting depth for subagents */
  maxDepth?: number;
  /** Enable streaming — emits AgentEvent via EventEmitter */
  stream?: boolean;
  /** Replace the default system prompt entirely (for domain-specific skill phases) */
  systemPromptOverride?: string;
  /** Inject context before the user task (research results, plan, etc.) */
  contextPrefix?: string;
  /** Callback fired at each agent step — use for live action reporting */
  onAction?: (action: {
    type: 'thinking' | 'tool_call' | 'final_answer';
    tool?: string;
    params?: Record<string, unknown>;
    thought?: string;
    success?: boolean;
    output?: string;
    turn: number;
    answer?: string;
  }) => void;
  /** Max retries for transient brain errors (network, stream parsing, rate limits) */
  maxRetries?: number;
  /** Base delay between retries in ms (doubles with each retry) */
  retryDelayMs?: number;
  /** User's thinking level preference (affects reasoning depth) */
  thinkLevel?: ThinkLevel;
  /** User's verbose level preference (affects output detail) */
  verboseLevel?: VerboseLevel;
  /** Response style configuration (affects output format) */
  responseConfig?: ResponseConfig;
  /** ApprovalManager for human-in-the-loop tool approval */
  approvalManager?: ApprovalManager;
  /** Session ID for this agent run (used for approval tracking) */
  sessionId?: string;
  /** Approval policy: 'always' = all tools, 'destructive' = only requiresApproval tools, 'never' = skip */
  approvalPolicy?: 'always' | 'destructive' | 'never';
  /** User personalization preferences (role, style, use cases) from onboarding/settings */
  userPersonalization?: UserPersonalization;
  /** Maximum computer use actions (screenshot+click/type cycles) per session. Default: 50. */
  computerUseStepLimit?: number;
  /**
   * P77-02: Additional MCP servers to inject into Claude's mcpServers config.
   *
   * Built dynamically by api.ts agent-stream handler from McpConfigManager
   * .listServers() (enabled-only). Allows registered MCP servers (Bytebot,
   * future ones) to reach Claude's `tools[]` array — closes the discovery
   * gap identified by the 2026-05-05 deploy investigation.
   *
   * Each entry follows Claude Code SDK's `mcpServers` shape:
   *   { type: 'stdio', command, args, env? }
   *   { type: 'streamableHttp', url, headers? }
   *
   * Each server's tools are auto-approved via wildcard `mcp__<name>__*` in
   * allowedTools. Server names must NOT collide with reserved entries
   * 'nexus-tools' or 'chrome-devtools' (silently skipped if they do).
   */
  additionalMcpServers?: Record<string, unknown>;
}

/** Resolve agent config with defaults from NexusConfig */
function resolveAgentConfig(config: AgentConfig) {
  const nexus = config.nexusConfig;
  const agentDefaults = nexus?.agent;
  const subagentDefaults = nexus?.subagents;
  const toolsConfig = nexus?.tools;
  const retryConfig = nexus?.retry;

  return {
    maxTurns: config.maxTurns ?? agentDefaults?.maxTurns ?? 30,
    maxTokens: config.maxTokens ?? agentDefaults?.maxTokens ?? 200000,
    timeoutMs: config.timeoutMs ?? agentDefaults?.timeoutMs ?? 600000,
    tier: config.tier ?? agentDefaults?.tier ?? 'sonnet',
    maxDepth: config.maxDepth ?? agentDefaults?.maxDepth ?? 3,
    stream: config.stream ?? agentDefaults?.streamEnabled ?? true,
    // Subagent specific
    subagentMaxTurns: subagentDefaults?.maxTurns ?? 5,
    subagentMaxTokens: subagentDefaults?.maxTokens ?? 50000,
    subagentTimeoutMs: subagentDefaults?.timeoutMs ?? 120000,
    // Tool policy
    toolPolicy: toolsConfig ? {
      profile: toolsConfig.profile,
      allow: toolsConfig.allow,
      deny: toolsConfig.deny,
      alsoAllow: toolsConfig.alsoAllow,
    } : undefined,
    // Retry config for transient errors
    maxRetries: config.maxRetries ?? (retryConfig?.enabled ? (retryConfig?.attempts ?? 3) : 3),
    retryDelayMs: config.retryDelayMs ?? retryConfig?.minDelayMs ?? 1000,
  };
}

/** Check if an error is transient and should be retried */
function isTransientError(errorMessage: string): boolean {
  const transientPatterns = [
    /stream.*pars/i,           // Stream parsing errors
    /network/i,                // Network errors
    /timeout/i,                // Timeout errors
    /ECONNRESET/i,             // Connection reset
    /ECONNREFUSED/i,           // Connection refused
    /ETIMEDOUT/i,              // Connection timeout
    /rate.?limit/i,            // Rate limiting
    /429/i,                    // Too many requests
    /503/i,                    // Service unavailable
    /502/i,                    // Bad gateway
    /500/i,                    // Internal server error
    /socket.*hang.*up/i,       // Socket hang up
    /EPIPE/i,                  // Broken pipe
    /fetch.*failed/i,          // Fetch failures
    /aborted/i,                // Request aborted
  ];
  return transientPatterns.some(pattern => pattern.test(errorMessage));
}

/** Sleep for a given duration */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface AgentResult {
  success: boolean;
  answer: string;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCalls: Array<{ tool: string; params: Record<string, unknown>; result: ToolResult }>;
  stoppedReason: 'complete' | 'max_turns' | 'max_tokens' | 'timeout' | 'error';
  /** Time-to-first-byte in milliseconds (SDK mode only) */
  ttfbMs?: number;
  /** Number of tool calls made during this session */
  toolCallCount?: number;
  /** Total duration of the agent run in milliseconds */
  durationMs?: number;
}

interface AgentAction {
  type: 'tool_call';
  tool: string;
  params: Record<string, unknown>;
  thought: string;
}

interface AgentFinal {
  type: 'final_answer';
  answer: string;
  thought: string;
}

type AgentStep = AgentAction | AgentFinal;

/** @deprecated Legacy ReAct JSON prompt — only used when native tool calling is disabled. NATIVE_SYSTEM_PROMPT is the primary prompt. */
const AGENT_SYSTEM_PROMPT = (toolDescriptions: string, canSpawnSubagent: boolean) => `You are Liv, an autonomous AI assistant. You manage a Linux server and interact with users via messaging channels. You solve tasks by reasoning step-by-step and calling tools.

## Messaging

Channel indicated by [Channel: ...] prefix. Use the correct tool per channel: channel_send for Telegram/Discord/Slack/Matrix, whatsapp_send for specific contacts by name. Chat history is provided — you CAN see and reference it.

## How You Work (ReAct Pattern)

Respond with valid JSON. To call a tool:
\`\`\`json
{"type":"tool_call","thought":"reasoning","tool":"<name>","params":{...}}
\`\`\`
To give your final answer:
\`\`\`json
{"type":"final_answer","thought":"summary","answer":"response"}
\`\`\`

## Rules

1. Think then act. Call ONE tool per turn, observe result before next step.
2. If a tool fails, try a different approach.
3. Be concise in your final answer. ALWAYS respond with valid JSON.
${canSpawnSubagent ? `4. For complex subtasks, use spawn_subagent to delegate.` : ''}

## Browser Safety (CRITICAL)

When using Chrome browser tools (mcp_chrome_browser_*):
- NEVER interact with login/sign-in pages, password fields, or authentication flows
- NEVER click "Sign in", "Log in", "Sign out", or account-related buttons
- If a page requires authentication, STOP and tell the user to sign in manually

## Memory

Use memory_search to recall past knowledge before answering. Use memory_add to save important facts/preferences.

## Available Tools

${toolDescriptions}${canSpawnSubagent ? `

- **spawn_subagent**: Delegate a focused subtask to a subagent with its own ReAct loop
  Parameters:
    - task (string, required): Clear description of the subtask
    - tools (array, optional): Tool names the subagent can use (defaults to all tools)
    - max_turns (number, optional): Max turns for the subagent [default: 5]` : ''}`;

const NATIVE_SYSTEM_PROMPT = (canSpawnSubagent: boolean) => `You are Liv, an autonomous AI assistant. You manage a Linux server and interact with users via messaging channels (Telegram, Discord, WhatsApp, etc.). You solve tasks by reasoning step-by-step and calling tools.

## Computer Use

When you have device tools, use the Elements-First Workflow:
1. Call screen_elements to get interactive elements with exact (cx,cy) coordinates
2. Match target by name/type (e.g., Button "Save", Edit "Search")
3. Click with raw:true using element coords directly
4. Verify with screen_elements again after action

Fall back to screenshots only when elements return 0 results or you need visual context.
- Element coordinates (from screen_elements): ALWAYS pass raw:true
- Screenshot coordinates (from visual analysis): do NOT pass raw:true (auto-scaled)
- Aim for CENTER of elements. Click field first, then type. Use keyboard_press for shortcuts (e.g. "ctrl+c")
- After 3 failed attempts with both methods, report failure
- Confirm completion with screen_elements or screenshot

## Messaging

Channel indicated by [Channel: ...] prefix. Use channel_send for Telegram/Discord/Slack/Matrix, whatsapp_send for specific contacts by name. Chat history is provided — reference it when relevant. To message a specific person, use whatsapp_send with their name (not your final answer).
${canSpawnSubagent ? `
## Sub-agents
- spawn_subagent: Inline subtasks, returns result directly
- subagent_create: Persistent agents with cron schedule or loop
- sessions_create: Parallel ephemeral tasks, check results later` : ''}

## Rules

1. Think then act. Call one tool per turn, observe result before next step.
2. If a tool fails, try a different approach.
3. Be concise in your final answer.

## Self-Awareness

You are Liv, running on the user's Linux server. Know your boundaries:

**Can do**: Execute shell commands, manage Docker/PM2, read/write files, search the web, send messages, create skills/schedules, control connected devices, render canvas artifacts, manage email.
**Cannot do**: Access the internet without tools, modify your own code, access other users' servers, make purchases or financial transactions, access systems without configured credentials.
**Escalate to user when**: Task requires credentials you don't have, action is irreversible and high-impact (e.g., deleting production data), multiple valid approaches exist and user preference is unclear, task involves personal/sensitive decisions.
**Never assume**: Don't guess passwords or API keys. Don't assume services are running — check first. Don't assume file contents — read first.

## Browser Safety (CRITICAL)

When using Chrome browser tools (mcp_chrome_browser_*):
- NEVER interact with login/sign-in pages, password fields, or authentication flows
- NEVER click "Sign in", "Log in", "Sign out", or account-related buttons
- If a page requires authentication, STOP and tell the user to sign in manually

## Memory

Use memory_search to recall past knowledge before answering. Use memory_add to save important facts/preferences.

## Self-Improvement

Expand your capabilities when you encounter gaps:
- **Skills**: Use skill_generate for recurring workflows (kebab-case name, triggers, tools). Saved to nexus/skills/ automatically.
- **MCP Tools**: Use mcp_registry_search to find, mcp_install to add external integrations. Check env var requirements first.
- **Act autonomously** for reusable workflows and no-secret integrations. **Ask first** for ambiguous, security-sensitive, or one-off tasks.

## Autonomous Scheduling

Create persistent agents for recurring tasks:
- Trigger words: "every", "regularly", "monitor", "keep checking"
- Use subagent_create with cron schedule (e.g., "0 9 * * *") or loop config (loop_interval_ms, loop_task)
- Use task_state to persist data between iterations
- Check subagent_list before creating duplicates. Ask user if unsure about scheduling.

## Self-Evaluation

After non-trivial tasks, check if you should:
- Create a skill (recurring multi-step workflow)
- Install a tool (missing external integration)
- Save to memory (useful discovery — prefix "LEARNED:")
- Create a schedule (task should auto-recur)
Skip for one-off tasks, simple queries, or tasks that went smoothly.

## Domain & Caddy

This server uses Caddy as reverse proxy with auto-HTTPS (Let's Encrypt).
- **3 modes**: IP-only (:80), direct domain (auto-HTTPS), tunnel (edge-terminated, :80 only)
- **Subdomains**: app.domain.com -> container port; pc/chrome get JWT-gated subdomains
- **Config**: Redis keys livos:domain:config and livos:domain:subdomains; Caddyfile at /etc/caddy/Caddyfile
- **Changes**: Use tRPC API (domain.setDomain, domain.activate, domain.setAppSubdomain) — it handles Caddyfile generation + reload atomically
- NEVER manually edit Caddyfile without reloading. Ports 80/443 must be open for Let's Encrypt.`;

export class AgentLoop extends EventEmitter {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
  }

  /** Emit an agent event (for streaming clients) */
  private emitEvent(event: AgentEvent) {
    if (this.config.stream) {
      this.emit('event', event);
    }
  }

  /** Check whether a tool requires approval and wait for the decision */
  private async checkApproval(
    toolName: string,
    params: Record<string, unknown>,
    thought: string,
    turn: number,
  ): Promise<{ approved: boolean; deniedReason?: string }> {
    const { approvalManager, toolRegistry, sessionId } = this.config;
    const policy = this.config.approvalPolicy ?? 'destructive';

    // Skip if no approval manager or policy is 'never'
    if (!approvalManager || policy === 'never') {
      return { approved: true };
    }

    // Check if this tool needs approval
    const needsApproval = policy === 'always' || toolRegistry.requiresApproval(toolName);
    if (!needsApproval) {
      return { approved: true };
    }

    // Emit approval_request event for streaming clients
    this.emitEvent({
      type: 'tool_call',
      turn,
      data: {
        tool: toolName,
        params,
        thought,
        awaitingApproval: true,
      },
    });

    // Create approval request and wait for response
    const request = await approvalManager.createRequest({
      sessionId: sessionId || 'unknown',
      tool: toolName,
      params,
      thought,
    });

    logger.info('Agent: awaiting approval', { requestId: request.id, tool: toolName, sessionId });

    const response = await approvalManager.waitForResponse(request.id);

    if (!response) {
      logger.warn('Agent: approval timed out', { requestId: request.id, tool: toolName });
      return { approved: false, deniedReason: 'Approval request timed out (5 minutes). Tool execution was skipped.' };
    }

    if (response.decision === 'deny') {
      logger.info('Agent: approval denied', { requestId: request.id, tool: toolName, by: response.respondedBy });
      return { approved: false, deniedReason: `Tool execution denied by ${response.respondedBy || 'user'}${response.respondedFrom ? ` via ${response.respondedFrom}` : ''}.` };
    }

    logger.info('Agent: approval granted', { requestId: request.id, tool: toolName, by: response.respondedBy });
    return { approved: true };
  }

  async run(task: string): Promise<AgentResult> {
    const { brain, toolRegistry, depth = 0 } = this.config;

    // Auto-generate sessionId if not provided (used for approval tracking)
    if (!this.config.sessionId) {
      this.config.sessionId = randomUUID();
    }

    // Resolve config with defaults from NexusConfig
    const resolved = resolveAgentConfig(this.config);
    const { maxTurns, maxTokens, timeoutMs, tier, maxDepth, stream, toolPolicy } = resolved;

    const canSpawnSubagent = depth < maxDepth;
    // Apply tool policy filter to get available tools
    const toolDescriptions = toolRegistry.listForPromptFiltered(toolPolicy);

    // Detect active provider for tool calling mode
    const activeProvider = await brain.getActiveProviderId();
    const useNativeTools = activeProvider === 'kimi' || activeProvider === 'claude';

    // Prepare tool definitions if using native tool calling
    let nativeTools: ToolDefinition[] | undefined;
    if (useNativeTools) {
      nativeTools = toolRegistry.toToolDefinitionsFiltered(toolPolicy);
      if (canSpawnSubagent) {
        nativeTools.push({
          name: 'spawn_subagent',
          description: 'Delegate a focused subtask to a subagent with its own tool loop',
          input_schema: {
            type: 'object',
            properties: {
              task: { type: 'string', description: 'Clear description of the subtask' },
              tools: { type: 'array', description: 'Tool names the subagent can use (defaults to all tools)' },
              max_turns: { type: 'number', description: 'Max turns for the subagent (default: 5)' },
            },
            required: ['task'],
          },
        });
      }
      if (nativeTools.length === 0) nativeTools = undefined;
    }

    // Build system prompt — different for native tools vs JSON-in-text
    let systemPrompt: string;
    if (this.config.systemPromptOverride) {
      systemPrompt = this.config.systemPromptOverride;
    } else if (useNativeTools && nativeTools) {
      systemPrompt = NATIVE_SYSTEM_PROMPT(canSpawnSubagent);
    } else {
      systemPrompt = AGENT_SYSTEM_PROMPT(toolDescriptions, canSpawnSubagent);
    }

    // Inject thinking level modifier (affects reasoning depth)
    if (this.config.thinkLevel) {
      systemPrompt += getThinkingPromptModifier(this.config.thinkLevel);
    }

    // Inject verbose level modifier (affects output detail)
    if (this.config.verboseLevel) {
      systemPrompt += getVerbosePromptModifier(this.config.verboseLevel);
    }

    // Inject response style modifier (affects output format from config)
    const responseConfig = this.config.responseConfig ?? this.config.nexusConfig?.response;
    if (responseConfig) {
      systemPrompt += getResponseStylePromptModifier(responseConfig);
    }

    // Inject user personalization modifier (role, style, use cases from onboarding/settings)
    if (this.config.userPersonalization) {
      systemPrompt += getUserPersonalizationPromptModifier(this.config.userPersonalization);
    }

    const messages: ChatMessage[] = [];
    // Parallel provider message array for native tool calling (proper content blocks)
    const providerMessages: unknown[] = [];
    const toolCalls: AgentResult['toolCalls'] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let stoppedReason: AgentResult['stoppedReason'] = 'complete';

    const startTime = Date.now();
    const prefix = depth > 0 ? `Subagent[${depth}]` : 'Agent';

    // Computer use step tracking (mouse/keyboard actions on device)
    let computerUseSteps = 0;
    const computerUseStepLimit = this.config.computerUseStepLimit ?? 50;

    // Computer use inactivity timeout (SEC-04)
    let lastComputerUseTime = 0; // Timestamp of last mouse/keyboard tool call
    const computerUseTimeoutMs = 60_000; // 60 seconds inactivity timeout

    const taskWithContext = this.config.contextPrefix
      ? `${this.config.contextPrefix}\n\n## Current Task\n${task}`
      : `Task: ${task}`;
    messages.push({ role: 'user', text: taskWithContext });
    if (useNativeTools) {
      providerMessages.push({ role: 'user', content: taskWithContext });
    }

    logger.info(`${prefix}: starting task`, { task: task.slice(0, 100), maxTurns, tier, depth, provider: activeProvider });
    const streaming = this.config.stream ?? stream;

    for (let turn = 0; turn < maxTurns; turn++) {
      if (Date.now() - startTime > timeoutMs) {
        logger.warn(`${prefix}: timeout`, { turn, elapsed: Date.now() - startTime });
        stoppedReason = 'timeout';
        break;
      }

      if (totalInputTokens + totalOutputTokens > maxTokens) {
        logger.warn(`${prefix}: token budget exceeded`, { totalInputTokens, totalOutputTokens, maxTokens });
        stoppedReason = 'max_tokens';
        break;
      }

      this.emitEvent({ type: 'thinking', turn: turn + 1 });

      let responseText = '';
      let brainSuccess = false;
      let lastError: Error | null = null;

      // === NATIVE TOOL CALLING MODE ===
      if (useNativeTools && nativeTools) {
        let nativeToolUseBlocks: ToolUseBlock[] = [];
        let reasoningText = '';

        for (let attempt = 0; attempt <= resolved.maxRetries; attempt++) {
          try {
            if (streaming) {
              const { stream: brainStream, getUsage } = brain.chatStream({
                systemPrompt,
                messages,
                tier,
                maxTokens: 4096,
                tools: nativeTools,
                rawProviderMessages: providerMessages,
              });

              const textChunks: string[] = [];
              const reasoningChunks: string[] = [];
              nativeToolUseBlocks = [];
              let lastStopReason = '';

              for await (const chunk of brainStream) {
                if (chunk.text) {
                  textChunks.push(chunk.text);
                  this.emitEvent({ type: 'chunk', turn: turn + 1, data: chunk.text });
                }
                if (chunk.reasoning) {
                  reasoningChunks.push(chunk.reasoning);
                }
                if (chunk.toolUse) {
                  nativeToolUseBlocks.push(chunk.toolUse);
                }
                if (chunk.stopReason) {
                  lastStopReason = chunk.stopReason;
                }
              }

              responseText = textChunks.join('');
              reasoningText = reasoningChunks.join('');
              const usage = getUsage();
              totalInputTokens += usage.inputTokens;
              totalOutputTokens += usage.outputTokens;
            } else {
              const response = await brain.chat({
                systemPrompt,
                messages,
                tier,
                maxTokens: 4096,
                tools: nativeTools,
                rawProviderMessages: providerMessages,
              });
              responseText = response.text;
              nativeToolUseBlocks = response.toolCalls || [];
              totalInputTokens += response.inputTokens;
              totalOutputTokens += response.outputTokens;
            }
            brainSuccess = true;
            break;
          } catch (err: any) {
            lastError = err;
            const isTransient = isTransientError(err.message || '');
            if (isTransient && attempt < resolved.maxRetries) {
              const delay = resolved.retryDelayMs * Math.pow(2, attempt);
              logger.warn(`${prefix}: transient brain error, retrying in ${delay}ms`, {
                turn, attempt: attempt + 1, maxRetries: resolved.maxRetries, error: err.message,
              });
              await sleep(delay);
              continue;
            }
            logger.error(`${prefix}: brain error (${isTransient ? 'max retries reached' : 'non-transient'})`, {
              turn, attempt: attempt + 1, error: err.message,
            });
            break;
          }
        }

        if (!brainSuccess) {
          this.emitEvent({ type: 'error', turn: turn + 1, data: lastError?.message });
          stoppedReason = 'error';
          return {
            success: false,
            answer: `${prefix} error on turn ${turn + 1}: ${lastError?.message}`,
            turns: turn + 1,
            totalInputTokens, totalOutputTokens, toolCalls, stoppedReason,
          };
        }

        // === Handle tool calls from native response ===
        if (nativeToolUseBlocks.length > 0) {
          // Emit thinking text if any
          if (responseText.trim()) {
            this.emitEvent({ type: 'thinking', turn: turn + 1, data: responseText });
          }

          // Build assistant content blocks for provider message history
          const assistantContent: unknown[] = [];
          if (responseText) assistantContent.push({ type: 'text', text: responseText });
          for (const tc of nativeToolUseBlocks) {
            assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
          }
          const assistantMsg: Record<string, unknown> = { role: 'assistant', content: assistantContent };
          // Attach reasoning content for providers that require it (e.g. Kimi's reasoning_content)
          if (reasoningText) assistantMsg._reasoning = reasoningText;
          providerMessages.push(assistantMsg);
          messages.push({ role: 'model', text: responseText });

          // Execute each tool and collect results
          const toolResultBlocks: ToolResultBlock[] = [];
          for (const toolCall of nativeToolUseBlocks) {
            this.emitEvent({
              type: 'tool_call', turn: turn + 1,
              data: { tool: toolCall.name, params: toolCall.input, thought: responseText.slice(0, 200) },
            });

            if (this.config.onAction) {
              try {
                this.config.onAction({
                  type: 'thinking', thought: responseText.slice(0, 200),
                  tool: toolCall.name, turn: turn + 1,
                });
              } catch { /* callback errors don't break the loop */ }
            }

            let toolResult: ToolResult;
            if (!toolRegistry.isToolAllowed(toolCall.name, toolPolicy)) {
              toolResult = { success: false, output: '', error: `Tool "${toolCall.name}" is not allowed by the current policy.` };
            } else {
              // Approval gate — check before execution
              const approval = await this.checkApproval(toolCall.name, toolCall.input, responseText.slice(0, 200), turn + 1);
              if (!approval.approved) {
                toolResult = { success: false, output: '', error: approval.deniedReason || 'Tool execution denied.' };
              } else if (toolCall.name === 'spawn_subagent' && canSpawnSubagent) {
                toolResult = await this.spawnSubagent(toolCall.input, depth);
              } else if (toolCall.name === 'spawn_subagent' && !canSpawnSubagent) {
                toolResult = { success: false, output: '', error: `Maximum subagent depth (${maxDepth}) reached.` };
              } else {
                toolResult = await toolRegistry.execute(toolCall.name, toolCall.input);
              }
            }

            toolCalls.push({ tool: toolCall.name, params: toolCall.input, result: toolResult });

            const resultText = toolResult.success
              ? toolResult.output
              : `Error: ${toolResult.error || toolResult.output}`;

            // Build content: if tool returned images, create multimodal content array
            // Claude requires Anthropic image format; Kimi uses OpenAI image_url format
            let resultContent: string | Array<{ type: string; [k: string]: unknown }> = resultText;
            if (toolResult.images && toolResult.images.length > 0) {
              resultContent = [
                { type: 'text', text: resultText },
                ...toolResult.images.map(img => {
                  if (activeProvider === 'claude') {
                    return {
                      type: 'image' as const,
                      source: { type: 'base64' as const, media_type: img.mimeType, data: img.base64 },
                    };
                  }
                  return {
                    type: 'image_url' as const,
                    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
                  };
                }),
              ];
            }

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: resultContent,
              is_error: !toolResult.success,
            });

            const isScreenshot = /^device_.*_screenshot$/.test(toolCall.name);
            const screenshotData = isScreenshot && toolResult.images && toolResult.images.length > 0
              ? toolResult.images[0].base64 : undefined;
            this.emitEvent({
              type: 'observation', turn: turn + 1,
              data: {
                tool: toolCall.name,
                success: toolResult.success,
                output: (toolResult.output || '').slice(0, 500),
                ...(screenshotData ? { screenshot: screenshotData } : {}),
              },
            });

            if (this.config.onAction) {
              try {
                this.config.onAction({
                  type: 'tool_call', tool: toolCall.name, params: toolCall.input,
                  thought: responseText.slice(0, 200), success: toolResult.success,
                  output: (toolResult.output || '').slice(0, 200), turn: turn + 1,
                });
              } catch { /* callback errors don't break the loop */ }
            }

            logger.info(`${prefix}: observation`, {
              turn: turn + 1, tool: toolCall.name, success: toolResult.success,
              outputLength: (toolResult.output || '').length,
            });
          }

          // Add tool results as user message with content blocks for provider
          providerMessages.push({ role: 'user', content: toolResultBlocks });

          const toolResultText = toolResultBlocks.map(r => {
            const name = nativeToolUseBlocks.find(t => t.id === r.tool_use_id)?.name || 'unknown';
            const text = Array.isArray(r.content)
              ? (r.content.find((c: any) => c.type === 'text') as any)?.text || ''
              : r.content;
            return `Tool "${name}": ${text}`;
          }).join('\n\n');
          // Collect all images from tool results for the ChatMessage path
          const allToolImages = toolCalls.reduce<Array<{ base64: string; mimeType: string }>>((acc, tc) => {
            if (tc.result?.images) acc.push(...tc.result.images);
            return acc;
          }, []);
          messages.push({ role: 'user', text: toolResultText, ...(allToolImages.length > 0 ? { images: allToolImages } : {}) });

          // Track computer use steps — count mouse/keyboard device tool calls
          for (const toolCall of nativeToolUseBlocks) {
            if (/^device_.*_(mouse_|keyboard_)/.test(toolCall.name)) {
              computerUseSteps++;
              lastComputerUseTime = Date.now();
            }
          }
          if (computerUseSteps >= computerUseStepLimit) {
            const limitMsg = `\n\n[SYSTEM] Computer use step limit reached (${computerUseSteps}/${computerUseStepLimit} mouse/keyboard actions). Stop taking mouse/keyboard actions. Take a final screenshot to see current state, then provide your final answer to the user explaining what was accomplished and what remains.`;
            // Append to the last provider message (tool results)
            const lastProviderMsg = providerMessages[providerMessages.length - 1] as any;
            if (Array.isArray(lastProviderMsg?.content)) {
              const lastBlock = lastProviderMsg.content[lastProviderMsg.content.length - 1];
              if (lastBlock && typeof lastBlock.content === 'string') {
                lastBlock.content += limitMsg;
              }
            }
            messages[messages.length - 1].text += limitMsg;
            logger.warn(`${prefix}: computer use step limit reached`, { computerUseSteps, computerUseStepLimit });
          }

          // Auto-timeout: if in computer use mode and no activity for 60s (SEC-04)
          if (lastComputerUseTime > 0 && (Date.now() - lastComputerUseTime) > computerUseTimeoutMs) {
            const timeoutMsg = `\n\n[SYSTEM] Computer use session timed out -- no mouse/keyboard activity for ${computerUseTimeoutMs / 1000} seconds. Provide your final answer explaining what was accomplished.`;
            const lastProviderMsg2 = providerMessages[providerMessages.length - 1] as any;
            if (Array.isArray(lastProviderMsg2?.content)) {
              const lastBlock2 = lastProviderMsg2.content[lastProviderMsg2.content.length - 1];
              if (lastBlock2 && typeof lastBlock2.content === 'string') {
                lastBlock2.content += timeoutMsg;
              }
            }
            messages[messages.length - 1].text += timeoutMsg;
            logger.warn(`${prefix}: computer use inactivity timeout`, { lastComputerUseTime, elapsed: Date.now() - lastComputerUseTime });
          }

          if (turn === maxTurns - 1) {
            stoppedReason = 'max_turns';
            logger.warn(`${prefix}: max turns reached`, { maxTurns });
          }
          continue; // Next turn
        }

        // === No tool calls — final answer (native mode) ===
        messages.push({ role: 'model', text: responseText });
        providerMessages.push({ role: 'assistant', content: responseText });
        this.emitEvent({ type: 'final_answer', turn: turn + 1, data: responseText });
        if (this.config.onAction) {
          try {
            this.config.onAction({ type: 'final_answer', turn: turn + 1, answer: responseText });
          } catch { /* callback errors don't break the loop */ }
        }
        return {
          success: true,
          answer: responseText,
          turns: turn + 1,
          totalInputTokens, totalOutputTokens, toolCalls, stoppedReason: 'complete',
        };
      }

      // === JSON-IN-TEXT MODE (fallback code path) ===

      // Retry loop for transient errors
      for (let attempt = 0; attempt <= resolved.maxRetries; attempt++) {
        try {
          if (streaming) {
            // Stream tokens chunk-by-chunk
            const { stream: brainStream, getUsage } = brain.chatStream({
              systemPrompt,
              messages,
              tier,
              maxTokens: 2048,
            });
            const chunks: string[] = [];
            for await (const chunk of brainStream) {
              if (chunk.text) {
                chunks.push(chunk.text);
                this.emitEvent({ type: 'chunk', turn: turn + 1, data: chunk.text });
              }
            }
            responseText = chunks.join('');
            const usage = getUsage();
            totalInputTokens += usage.inputTokens;
            totalOutputTokens += usage.outputTokens;
          } else {
            // Non-streaming (original path)
            const response = await brain.chat({
              systemPrompt,
              messages,
              tier,
              maxTokens: 2048,
            });
            responseText = response.text;
            totalInputTokens += response.inputTokens;
            totalOutputTokens += response.outputTokens;
          }
          brainSuccess = true;
          break; // Success - exit retry loop
        } catch (err: any) {
          lastError = err;
          const isTransient = isTransientError(err.message || '');

          if (isTransient && attempt < resolved.maxRetries) {
            // Transient error - retry with exponential backoff
            const delay = resolved.retryDelayMs * Math.pow(2, attempt);
            logger.warn(`${prefix}: transient brain error, retrying in ${delay}ms`, {
              turn,
              attempt: attempt + 1,
              maxRetries: resolved.maxRetries,
              error: err.message,
            });
            await sleep(delay);
            continue;
          }

          // Non-transient error or max retries reached
          logger.error(`${prefix}: brain error (${isTransient ? 'max retries reached' : 'non-transient'})`, {
            turn,
            attempt: attempt + 1,
            error: err.message,
          });
          break;
        }
      }

      // If all retries failed, return error
      if (!brainSuccess) {
        this.emitEvent({ type: 'error', turn: turn + 1, data: lastError?.message });
        stoppedReason = 'error';
        return {
          success: false,
          answer: `${prefix} error on turn ${turn + 1}: ${lastError?.message}`,
          turns: turn + 1,
          totalInputTokens,
          totalOutputTokens,
          toolCalls,
          stoppedReason,
        };
      }

      const step = this.parseStep(responseText);

      if (!step) {
        logger.warn(`${prefix}: unparseable response, treating as final answer`, { turn, rawResponse: responseText.slice(0, 500) });
        messages.push({ role: 'model', text: responseText });
        this.emitEvent({ type: 'final_answer', turn: turn + 1, data: responseText });
        if (this.config.onAction) {
          try {
            this.config.onAction({ type: 'final_answer', turn: turn + 1, answer: responseText });
          } catch { /* don't let callback errors break the agent loop */ }
        }
        return {
          success: true,
          answer: responseText,
          turns: turn + 1,
          totalInputTokens,
          totalOutputTokens,
          toolCalls,
          stoppedReason: 'complete',
        };
      }

      if (step.type === 'final_answer') {
        logger.info(`${prefix}: final answer`, { turn: turn + 1, thought: step.thought.slice(0, 100) });
        messages.push({ role: 'model', text: responseText });
        this.emitEvent({ type: 'final_answer', turn: turn + 1, data: step.answer });
        if (this.config.onAction) {
          try {
            this.config.onAction({ type: 'final_answer', turn: turn + 1, answer: step.answer });
          } catch { /* don't let callback errors break the agent loop */ }
        }
        return {
          success: true,
          answer: step.answer,
          turns: turn + 1,
          totalInputTokens,
          totalOutputTokens,
          toolCalls,
          stoppedReason: 'complete',
        };
      }

      // Tool call
      logger.info(`${prefix}: tool call`, { turn: turn + 1, tool: step.tool, thought: step.thought.slice(0, 80) });
      messages.push({ role: 'model', text: responseText });
      this.emitEvent({ type: 'tool_call', turn: turn + 1, data: { tool: step.tool, params: step.params, thought: step.thought } });

      // Fire thinking event BEFORE tool execution — shows AI reasoning in real time
      if (this.config.onAction) {
        try {
          this.config.onAction({
            type: 'thinking',
            thought: step.thought,
            tool: step.tool,
            turn: turn + 1,
          });
        } catch { /* don't let callback errors break the agent loop */ }
      }

      let toolResult: ToolResult;

      // Check if tool is allowed by policy before execution
      if (!toolRegistry.isToolAllowed(step.tool, toolPolicy)) {
        toolResult = { success: false, output: '', error: `Tool "${step.tool}" is not allowed by the current policy.` };
      } else {
        // Approval gate — check before execution
        const approval = await this.checkApproval(step.tool, step.params, step.thought, turn + 1);
        if (!approval.approved) {
          toolResult = { success: false, output: '', error: approval.deniedReason || 'Tool execution denied.' };
        } else if (step.tool === 'spawn_subagent' && canSpawnSubagent) {
          toolResult = await this.spawnSubagent(step.params, depth);
        } else if (step.tool === 'spawn_subagent' && !canSpawnSubagent) {
          toolResult = { success: false, output: '', error: `Maximum subagent depth (${maxDepth}) reached. Solve the subtask directly using available tools.` };
        } else {
          toolResult = await toolRegistry.execute(step.tool, step.params);
        }
      }

      toolCalls.push({ tool: step.tool, params: step.params, result: toolResult });

      const observation = toolResult.success
        ? `Tool "${step.tool}" succeeded:\n${toolResult.output}`
        : `Tool "${step.tool}" failed:\n${toolResult.error || toolResult.output}`;

      messages.push({ role: 'user', text: `Observation:\n${observation}`, images: toolResult.images });
      const isScreenshot = /^device_.*_screenshot$/.test(step.tool);
      const screenshotData = isScreenshot && toolResult.images && toolResult.images.length > 0
        ? toolResult.images[0].base64 : undefined;
      this.emitEvent({ type: 'observation', turn: turn + 1, data: { tool: step.tool, success: toolResult.success, output: toolResult.output.slice(0, 500), ...(screenshotData ? { screenshot: screenshotData } : {}) } });

      // Fire onAction callback for live reporting
      if (this.config.onAction) {
        try {
          this.config.onAction({
            type: 'tool_call',
            tool: step.tool,
            params: step.params,
            thought: step.thought,
            success: toolResult.success,
            output: (toolResult.output || '').slice(0, 200),
            turn: turn + 1,
          });
        } catch { /* don't let callback errors break the agent loop */ }
      }

      logger.info(`${prefix}: observation`, {
        turn: turn + 1,
        tool: step.tool,
        success: toolResult.success,
        outputLength: (toolResult.output || '').length,
      });

      if (turn === maxTurns - 1) {
        stoppedReason = 'max_turns';
        logger.warn(`${prefix}: max turns reached`, { maxTurns });
      }
    }

    const partialAnswer = toolCalls.length > 0
      ? `${prefix} stopped (${stoppedReason}) after ${toolCalls.length} tool calls. Last result: ${toolCalls[toolCalls.length - 1].result.output.slice(0, 500)}`
      : `${prefix} stopped (${stoppedReason}) without completing the task.`;

    return {
      success: stoppedReason === 'complete',
      answer: partialAnswer,
      turns: toolCalls.length,
      totalInputTokens,
      totalOutputTokens,
      toolCalls,
      stoppedReason,
    };
  }

  /** Spawn a subagent with scoped tools and its own ReAct loop */
  private async spawnSubagent(params: Record<string, unknown>, parentDepth: number): Promise<ToolResult> {
    const task = params.task as string;
    if (!task) return { success: false, output: '', error: 'Subagent requires a "task" parameter.' };

    const requestedTools = params.tools as string[] | undefined;

    // Get subagent defaults from config
    const resolved = resolveAgentConfig(this.config);
    const subMaxTurns = (params.max_turns as number) || resolved.subagentMaxTurns;

    // Create scoped tool registry if specific tools requested
    let scopedRegistry = this.config.toolRegistry;
    if (requestedTools && requestedTools.length > 0) {
      scopedRegistry = new ToolRegistry();
      for (const toolName of requestedTools) {
        const tool = this.config.toolRegistry.get(toolName);
        if (tool) {
          scopedRegistry.register(tool);
        }
      }
      if (scopedRegistry.size === 0) {
        return { success: false, output: '', error: `None of the requested tools exist: ${requestedTools.join(', ')}` };
      }
    }

    logger.info(`Agent: spawning subagent`, { task: task.slice(0, 80), tools: requestedTools, depth: parentDepth + 1 });

    const subAgent = new AgentLoop({
      brain: this.config.brain,
      toolRegistry: scopedRegistry,
      nexusConfig: this.config.nexusConfig,
      maxTurns: subMaxTurns,
      maxTokens: resolved.subagentMaxTokens,
      timeoutMs: resolved.subagentTimeoutMs,
      tier: this.config.tier || resolved.tier,
      depth: parentDepth + 1,
      maxDepth: resolved.maxDepth,
    });

    try {
      const result = await subAgent.run(task);
      return {
        success: result.success,
        output: result.answer,
        data: {
          turns: result.turns,
          inputTokens: result.totalInputTokens,
          outputTokens: result.totalOutputTokens,
          stoppedReason: result.stoppedReason,
        },
      };
    } catch (err: any) {
      return { success: false, output: '', error: `Subagent error: ${err.message}` };
    }
  }

  private parseStep(text: string): AgentStep | null {
    const cleaned = text
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    // Attempt 1: standard JSON.parse
    const parsed = this.tryParseJson(cleaned);
    if (parsed) return this.extractStep(parsed);

    // Attempt 2: fix literal newlines inside JSON strings (common LLM issue)
    // Replace unescaped newlines/tabs inside string values
    const fixed = cleaned.replace(/("(?:[^"\\]|\\.)*")|[\n\r\t]/g, (match, quoted) => {
      if (quoted) return quoted; // preserve properly quoted strings
      if (match === '\n' || match === '\r') return '\\n';
      if (match === '\t') return '\\t';
      return match;
    });
    const parsed2 = this.tryParseJson(fixed);
    if (parsed2) return this.extractStep(parsed2);

    // Attempt 3: regex fallback — extract answer or tool call from malformed JSON
    if (/"type"\s*:\s*"final_answer"/.test(cleaned)) {
      // Extract the answer field — greedy match between "answer": " and the last "
      const answerMatch = cleaned.match(/"answer"\s*:\s*"([\s\S]*)"[^"]*$/);
      if (answerMatch) {
        const thoughtMatch = cleaned.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return {
          type: 'final_answer',
          answer: answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          thought: thoughtMatch?.[1] || '',
        };
      }
    }

    if (/"type"\s*:\s*"tool_call"/.test(cleaned)) {
      const toolMatch = cleaned.match(/"tool"\s*:\s*"([^"]+)"/);
      if (toolMatch) {
        const thoughtMatch = cleaned.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        // Try to extract params
        let params: Record<string, unknown> = {};
        const paramsMatch = cleaned.match(/"params"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
        if (paramsMatch) {
          try { params = JSON.parse(paramsMatch[1]); } catch { /* use empty */ }
        }
        return {
          type: 'tool_call',
          tool: toolMatch[1],
          params,
          thought: thoughtMatch?.[1] || '',
        };
      }
    }

    return null;
  }

  private tryParseJson(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private extractStep(parsed: Record<string, unknown>): AgentStep | null {
    if (parsed.type === 'final_answer' && typeof parsed.answer === 'string') {
      return {
        type: 'final_answer',
        answer: parsed.answer,
        thought: (parsed.thought as string) || '',
      };
    }

    if (parsed.type === 'tool_call' && typeof parsed.tool === 'string') {
      return {
        type: 'tool_call',
        tool: parsed.tool as string,
        params: (parsed.params as Record<string, unknown>) || {},
        thought: (parsed.thought as string) || '',
      };
    }

    return null;
  }
}
