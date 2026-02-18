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
function paramTypeToZod(type: string, description?: string, enumValues?: string[]): z.ZodTypeAny {
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

/** Build SDK MCP tool definitions from Nexus ToolRegistry */
function buildSdkTools(
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
        const result = await toolRegistry.execute(name, args);
        return {
          content: [{
            type: 'text' as const,
            text: result.success ? result.output : `Error: ${result.error || result.output}`,
          }],
          isError: !result.success,
        };
      },
    );
  });
}

/** Check if Chrome CDP is reachable at the given HTTP URL */
function isCdpReachable(url: string): Promise<boolean> {
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
function tierToModel(tier?: string): string | undefined {
  switch (tier) {
    case 'opus': return 'claude-opus-4-6';
    case 'sonnet': return 'claude-sonnet-4-5';
    case 'haiku': return 'claude-haiku-4-5';
    case 'flash': return 'claude-haiku-4-5';
    default: return 'claude-sonnet-4-5';
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

    const maxTurns = this.config.maxTurns ?? agentDefaults?.maxTurns ?? 30;
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

    // Build system prompt
    let systemPrompt = this.config.systemPromptOverride || `You are Nexus, an autonomous AI assistant. You manage a Linux server and interact with users via WhatsApp, Telegram, Discord, and a web UI.

You have access to tools for shell commands, Docker management, file operations, web browsing, memory, and messaging. Use them to accomplish the user's task.

Rules:
1. Think before acting
2. If a tool fails, try a different approach
3. When the task is complete, provide your final answer
4. Be concise in your final answer`;

    if (this.config.contextPrefix) {
      task = `${this.config.contextPrefix}\n\n## Current Task\n${task}`;
    }

    logger.info('SdkAgentRunner: starting task', {
      task: task.slice(0, 100),
      maxTurns,
      tier,
      toolCount: sdkTools.length,
    });

    this.emitEvent({ type: 'thinking', turn: 1 });

    const toolCalls: AgentResult['toolCalls'] = [];
    let answer = '';
    let turns = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      const messages = query({
        prompt: task,
        options: {
          systemPrompt,
          mcpServers,
          tools: [],        // Disable built-in Claude Code tools
          allowedTools,     // Auto-approve all Nexus MCP tools
          maxTurns,
          model: tierToModel(tier),
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          persistSession: false,
        },
      });

      for await (const message of messages) {
        turns++;

        if (message.type === 'assistant') {
          // Assistant message — extract text from BetaMessage.content
          const betaMessage = (message as SDKAssistantMessage).message;
          if (betaMessage && Array.isArray(betaMessage.content)) {
            for (const block of betaMessage.content) {
              if (block.type === 'text' && block.text) {
                this.emitEvent({ type: 'chunk', turn: turns, data: block.text });
                answer = block.text;
              } else if (block.type === 'tool_use') {
                this.emitEvent({
                  type: 'tool_call',
                  turn: turns,
                  data: { tool: block.name, params: block.input },
                });
              }
            }
          }

          // Fire onAction callback
          if (this.config.onAction && answer) {
            try {
              this.config.onAction({
                type: 'thinking',
                thought: answer.slice(0, 200),
                turn: turns,
              });
            } catch { /* callback errors don't break the loop */ }
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

      logger.info('SdkAgentRunner: completed', { turns, answerLength: answer.length });

      return {
        success: true,
        answer: answer || 'Task completed (no text response).',
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolCalls,
        stoppedReason: 'complete',
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
    }
  }
}
