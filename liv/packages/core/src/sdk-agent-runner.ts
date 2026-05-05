/**
 * SdkAgentRunner — Runs tasks through the Claude Agent SDK (subscription mode).
 *
 * Instead of our own AgentLoop, this uses the SDK's query() function which
 * spawns Claude Code CLI as a subprocess. The CLI handles its own OAuth auth
 * from `claude login`, so no API key is needed.
 *
 * Nexus tools are exposed via createSdkMcpServer() so Claude can call them.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { z } from 'zod';
import {
  query,
  tool,
  createSdkMcpServer,
  type SdkMcpToolDefinition,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultSuccess,
  type SDKResultError,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ToolRegistry } from './tool-registry.js';
import type { AgentEvent, AgentConfig, AgentResult } from './agent.js';
import type { ToolPolicy } from './tool-registry.js';
import { logger } from './logger.js';

/** Convert our ToolParameter type string to a Zod type */
export function paramTypeToZod(type: string, description?: string, enumValues?: string[]): z.ZodTypeAny {
  if (enumValues && enumValues.length > 0) {
    return z.enum(enumValues as [string, ...string[]]).describe(description || '');
  }

  let field: z.ZodTypeAny;
  switch (type) {
    case 'number':
    case 'integer':
      field = z.number();
      break;
    case 'boolean':
      field = z.boolean();
      break;
    case 'array':
      field = z.array(z.any());
      break;
    case 'object':
      field = z.record(z.string(), z.any());
      break;
    case 'string':
    default:
      field = z.string();
      break;
  }

  if (description) field = field.describe(description);
  return field;
}

/** Maximum tool output size in characters (~12.5k tokens) to prevent SDK context exhaustion */
const MAX_TOOL_OUTPUT = 50_000;

/** Build SDK MCP tool definitions from Nexus ToolRegistry */
export function buildSdkTools(
  toolRegistry: ToolRegistry,
  toolPolicy?: ToolPolicy,
): SdkMcpToolDefinition<any>[] {
  const toolNames = toolRegistry.listFiltered(toolPolicy);

  return toolNames.map((name) => {
    const t = toolRegistry.get(name)!;

    // Build Zod raw shape from our ToolParameter definitions
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const p of t.parameters) {
      let field = paramTypeToZod(p.type, p.description, p.enum);
      if (!p.required) {
        field = field.optional();
      }
      shape[p.name] = field;
    }

    // Use tool() with proper 4-arg signature: (name, description, zodShape, handler)
    return tool(
      t.name,
      t.description,
      shape,
      async (args: Record<string, unknown>) => {
        // SDK mode: skip Nexus approval gate — Claude Code CLI handles permissions
        // via permissionMode + allowedTools. No need for double approval.
        const startMs = Date.now();
        try {
          const result = await toolRegistry.execute(name, args);
          const elapsed = Date.now() - startMs;

          // Build MCP content array with text + optional images
          const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

          // Add text content (truncate if too large to prevent SDK context exhaustion)
          let text = result.success ? result.output : `Error: ${result.error || result.output}`;
          if (text.length > MAX_TOOL_OUTPUT) {
            text = text.slice(0, MAX_TOOL_OUTPUT) + `\n...[truncated — ${text.length} chars total, showing first ${MAX_TOOL_OUTPUT}]`;
          }
          if (text) {
            content.push({ type: 'text' as const, text });
          }

          // Forward images from ToolResult as MCP image content blocks
          if (result.images && result.images.length > 0) {
            for (const img of result.images) {
              content.push({
                type: 'image' as const,
                data: img.base64,
                mimeType: img.mimeType || 'image/png',
              });
            }
          }

          // Fallback: if no content at all, add empty text
          if (content.length === 0) {
            content.push({ type: 'text' as const, text: '(no output)' });
          }

          logger.info(`MCP tool "${name}" completed`, { elapsed, success: result.success, outputLen: result.output?.length ?? 0, imageCount: result.images?.length ?? 0 });

          return { content, isError: !result.success };
        } catch (err: any) {
          const elapsed = Date.now() - startMs;
          logger.error(`MCP tool "${name}" threw`, { elapsed, error: err.message });
          return {
            content: [{ type: 'text' as const, text: `Tool execution error: ${err.message}` }],
            isError: true,
          };
        }
      },
    );
  });
}

/** Check if Chrome CDP is reachable at the given HTTP URL */
export function isCdpReachable(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parsed = new URL(url.replace(/^ws:\/\//, 'http://'));
    const req = request(
      { hostname: parsed.hostname, port: parsed.port || 9223, path: '/json/version', method: 'GET', timeout: 2000 },
      (res) => resolve(res.statusCode === 200),
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/** Model tier to SDK model string */
// Phase 43.12: bumped to current Claude 4.X family (Opus 4.7 / Sonnet 4.6 /
// Haiku 4.5). Earlier mapping pinned 4.6/4.5 — drift caught during the
// model-identity hallucination fix sweep. The identity line generated in
// the systemPrompt now reflects "Claude Opus 4.7" / "Claude Sonnet 4.6"
// when the caller picks the generic alias.
export function tierToModel(tier?: string): string | undefined {
  switch (tier) {
    case 'opus': return 'claude-opus-4-7';
    case 'sonnet': return 'claude-sonnet-4-6';
    case 'haiku': return 'claude-haiku-4-5';
    case 'flash': return 'claude-haiku-4-5'; // legacy alias
    default: return 'claude-sonnet-4-6';
  }
}

export class SdkAgentRunner extends EventEmitter {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
  }

  private emitEvent(event: AgentEvent) {
    if (this.config.stream !== false) {
      this.emit('event', event);
    }
  }

  async run(task: string): Promise<AgentResult> {
    const runStartTime = Date.now();
    const sessionId = this.config.sessionId || randomUUID();
    const nexusConfig = this.config.nexusConfig;
    const agentDefaults = nexusConfig?.agent;
    const toolsConfig = nexusConfig?.tools;
    const toolPolicy = toolsConfig ? {
      profile: toolsConfig.profile,
      allow: toolsConfig.allow,
      deny: toolsConfig.deny,
      alsoAllow: toolsConfig.alsoAllow,
    } as ToolPolicy : undefined;

    const maxTurns = Math.min(this.config.maxTurns ?? agentDefaults?.maxTurns ?? 15, 25);
    const maxTokenBudget = this.config.maxTokens ?? 0; // 0 = unlimited
    const tier = this.config.tier ?? agentDefaults?.tier ?? 'sonnet';

    // Build MCP tool definitions from Nexus ToolRegistry
    const sdkTools = buildSdkTools(
      this.config.toolRegistry,
      toolPolicy,
    );

    // Create an SDK MCP server that hosts our Nexus tools
    const mcpServer = createSdkMcpServer({
      name: 'nexus-tools',
      tools: sdkTools,
    });

    // Build allowedTools list so Claude Code auto-approves our MCP tools
    const allowedTools = sdkTools.map((t: any) => `mcp__nexus-tools__${t.name}`);

    // Build MCP servers config — always include nexus-tools + chrome-devtools if available
    const mcpServers: Record<string, any> = {
      'nexus-tools': mcpServer,
    };

    // Add Chrome DevTools MCP if Chrome CDP is reachable
    // Connects via socat proxy on port 9223 (Chrome CDP on 127.0.0.1:9222 inside container)
    const browserUrl = (nexusConfig?.browser?.cdpUrl ?? 'ws://127.0.0.1:9223')
      .replace(/^ws:\/\//, 'http://');
    if (nexusConfig?.browser?.enabled !== false) {
      const cdpReachable = await isCdpReachable(browserUrl).catch(() => false);
      if (cdpReachable) {
        mcpServers['chrome-devtools'] = {
          type: 'stdio' as const,
          command: 'chrome-devtools-mcp',
          args: ['--browserUrl', browserUrl, '--no-usage-statistics'],
        };
        // Auto-approve ALL chrome-devtools tools via wildcard
        allowedTools.push('mcp__chrome-devtools__*');
        logger.info('SdkAgentRunner: Chrome DevTools MCP enabled', { browserUrl });
      } else {
        logger.info('SdkAgentRunner: Chrome CDP not reachable, skipping Chrome DevTools MCP', { browserUrl });
      }
    }

    // Build system prompt.
    //
    // Phase 43.10 (model identity): @anthropic-ai/claude-agent-sdk 0.2.x
    // suppresses the bundled Claude Code `<env>` block (which carries the
    // model's display name + exact id) whenever any non-preset systemPrompt
    // is set. Without that block the model falls back to its training-data
    // identity ("Claude 3.5 Sonnet") even when query() routes to 4.x.
    // Fix: prepend an explicit identity line built from `tierToModel(tier)`
    // so the model always knows which version it is, regardless of whether
    // the caller is the broker (empty override), an in-app Nexus chat (no
    // override → Nexus default), or a custom system prompt from any caller.
    //
    // Phase 43.8 (broker passthrough — preserved): `??` instead of `||`
    // keeps explicit empty strings from the broker passthrough mode
    // routing back to the Nexus default. Combined with 43.10's prepend,
    // a broker request with `system: ''` produces just the identity line
    // — no Nexus branding leaks into the response.
    //
    // Sacred-file invariant respected: agent loop, watchdog, per-tier
    // budget caps, restricted subprocess env, MCP tool wiring all
    // unchanged. Edit confined to the systemPrompt string construction.
    const _modelId = tierToModel(tier) || 'claude-sonnet-4-5';
    const _modelMatch = _modelId.match(/claude-(opus|sonnet|haiku)-(\d)-(\d)/);
    const _displayName = _modelMatch
      ? `Claude ${_modelMatch[1][0].toUpperCase()}${_modelMatch[1].slice(1)} ${_modelMatch[2]}.${_modelMatch[3]}`
      : 'Claude';
    const _identityLine = `You are powered by the model named ${_displayName}. The exact model ID is ${_modelId}.\n\n`;
    let systemPrompt = _identityLine + (this.config.systemPromptOverride ?? `You are Nexus, an autonomous AI assistant running on a Linux server. You interact with users via WhatsApp, Telegram, Discord, and a web UI.

You have access to MCP tools (prefixed with mcp__nexus-tools__) for shell commands, Docker management, file operations, web browsing, memory, and messaging.

CRITICAL RULES:
1. ONLY do what the user explicitly asks. Do NOT invent tasks, repeat previous work, or act on conversation history unless the user specifically requests it.
2. If the user sends a greeting or simple message, respond conversationally — do NOT run tools.
3. Conversation history (if provided) is CONTEXT ONLY. Do NOT re-execute tasks from history.
4. Be concise. For simple questions, respond in 1-2 sentences without using tools.
5. If a tool fails, try ONE alternative approach, then report the issue.
6. When the task is complete, provide your final answer immediately — do not keep exploring.`);

    if (this.config.contextPrefix) {
      task = `${this.config.contextPrefix}\n\n## Current Task\n${task}`;
    }

    // Budget cap per tier to prevent runaway costs (Pitfall 9)
    const budgetByTier: Record<string, number> = {
      opus: 10.0,
      sonnet: 5.0,
      haiku: 2.0,
      flash: 2.0,
    };
    const maxBudgetUsd = budgetByTier[tier] ?? 5.0;

    // Minimal subprocess environment to avoid leaking secrets (Pitfall 12)
    const safeEnv: Record<string, string | undefined> = {
      HOME: this.config.homeOverride || process.env.HOME || '/root',
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      NODE_ENV: process.env.NODE_ENV || 'production',
      LANG: process.env.LANG || 'en_US.UTF-8',
      // ANTHROPIC_API_KEY is handled by the SDK internally
    };
    if (process.env.ANTHROPIC_API_KEY) {
      safeEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }

    logger.info('SdkAgentRunner: starting task', {
      task: task.slice(0, 100),
      maxTurns,
      tier,
      maxBudgetUsd,
      toolCount: sdkTools.length,
    });

    this.emitEvent({ type: 'thinking', turn: 1 });

    const toolCalls: AgentResult['toolCalls'] = [];
    let answer = '';
    let turns = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let ttfbMs = 0;
    let firstContentReceived = false;
    let toolCallCount = 0;
    let estimatedTokens = 0; // Running estimate for token budget enforcement
    let tokenBudgetExceeded = false;

    // Stream read watchdog: abort if no SDK message arrives within 60s (Pitfall 2)
    const abortController = new AbortController();
    let lastMessageTime = Date.now();

    const watchdog = setInterval(() => {
      if (Date.now() - lastMessageTime > 60_000) {
        logger.warn('SdkAgentRunner: watchdog triggered — no message in 60s, aborting');
        abortController.abort();
      }
    }, 10_000);

    try {
      const messages = query({
        prompt: task,
        options: {
          systemPrompt,
          mcpServers,
          tools: [],        // Disable built-in Claude Code tools
          allowedTools,     // Auto-approve all Nexus MCP tools
          maxTurns,
          maxBudgetUsd,
          model: tierToModel(tier),
          permissionMode: 'dontAsk',
          persistSession: false,
          abortController,  // Pass abort controller for watchdog + external cancellation
          env: safeEnv,     // Restrict subprocess environment
        },
      });

      let turnLimitReached = false;

      for await (const message of messages) {
        lastMessageTime = Date.now(); // Reset watchdog on each message
        turns++;

        // Safety: break if turn limit exceeded (SDK may keep running)
        if (turns > maxTurns) {
          logger.warn('SdkAgentRunner: turn limit reached, stopping', { turns, maxTurns });
          turnLimitReached = true;
          break;
        }

        // Token budget enforcement: estimate tokens from content length
        // SDK only reports actual usage in the final 'result' message, so we estimate mid-run
        if (maxTokenBudget > 0 && estimatedTokens > maxTokenBudget) {
          logger.warn('SdkAgentRunner: token budget exceeded, stopping', { estimatedTokens, maxTokenBudget });
          tokenBudgetExceeded = true;
          break;
        }

        if (message.type === 'assistant') {
          // Assistant message — extract text from BetaMessage.content
          const betaMessage = (message as SDKAssistantMessage).message;
          if (betaMessage && Array.isArray(betaMessage.content)) {
            for (const block of betaMessage.content) {
              if (block.type === 'text' && block.text) {
                // Track TTFB — time to first text content from start of run
                if (!firstContentReceived) {
                  ttfbMs = Date.now() - runStartTime;
                  firstContentReceived = true;
                }
                this.emitEvent({ type: 'chunk', turn: turns, data: block.text });
                answer = block.text;
                // Estimate tokens: ~4 chars per token (input prompt + output)
                estimatedTokens += Math.ceil(block.text.length / 4);

                // Send the AI's own reasoning text to channels as a live update
                if (this.config.onAction && block.text.trim()) {
                  try {
                    this.config.onAction({
                      type: 'thinking',
                      thought: block.text,
                      turn: turns,
                    });
                  } catch { /* callback errors don't break the loop */ }
                }
              } else if (block.type === 'tool_use') {
                toolCallCount++;
                // Estimate tokens for tool call input
                estimatedTokens += Math.ceil(JSON.stringify(block.input || {}).length / 4);
                this.emitEvent({
                  type: 'tool_call',
                  turn: turns,
                  data: { tool: block.name, params: block.input },
                });
              }
            }
          }
        } else if (message.type === 'result') {
          // Final result from the SDK
          const resultMsg = message as SDKResultMessage;

          if (resultMsg.subtype === 'success') {
            const success = resultMsg as SDKResultSuccess;
            answer = success.result || answer;
            totalInputTokens = success.usage?.input_tokens ?? 0;
            totalOutputTokens = success.usage?.output_tokens ?? 0;
          } else {
            // Error result
            const errorResult = resultMsg as SDKResultError;
            const errorText = errorResult.errors?.join('; ') || 'SDK execution error';
            answer = answer || errorText;
          }

          this.emitEvent({ type: 'final_answer', turn: turns, data: answer });

          if (this.config.onAction) {
            try {
              this.config.onAction({ type: 'final_answer', turn: turns, answer });
            } catch { /* callback errors don't break the loop */ }
          }
        }
        // Other message types (system, stream_event, tool_progress, etc.) are logged but not emitted
      }

      const durationMs = Date.now() - runStartTime;
      logger.info('SdkAgentRunner: completed', { turns, answerLength: answer.length, turnLimitReached, tokenBudgetExceeded, ttfbMs, toolCallCount, durationMs });

      return {
        success: !turnLimitReached && !tokenBudgetExceeded,
        answer: answer || 'Task completed (no text response).',
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolCalls,
        stoppedReason: turnLimitReached ? 'max_turns' : tokenBudgetExceeded ? 'max_tokens' : 'complete',
        ttfbMs,
        toolCallCount,
        durationMs,
      };
    } catch (err: any) {
      logger.error('SdkAgentRunner: error', { error: err.message, stack: err.stack?.split('\n').slice(0, 3).join(' | ') });

      this.emitEvent({ type: 'error', turn: turns, data: err.message });

      return {
        success: false,
        answer: `SDK agent error: ${err.message}`,
        turns,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCalls,
        stoppedReason: 'error',
      };
    } finally {
      clearInterval(watchdog);
    }
  }
}
