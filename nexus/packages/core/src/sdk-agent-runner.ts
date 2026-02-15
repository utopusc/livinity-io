/**
 * SdkAgentRunner — Runs tasks through the Claude Agent SDK (subscription mode).
 *
 * Instead of our own AgentLoop, this uses the SDK's query() function which
 * spawns Claude Code CLI as a subprocess. The CLI handles its own OAuth auth
 * from `claude login`, so no API key is needed.
 *
 * Nexus tools are wrapped as SDK tool() definitions so Claude can call them.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { query, tool, type Tool as SdkTool } from '@anthropic-ai/claude-agent-sdk';
import type { ToolRegistry } from './tool-registry.js';
import type { AgentEvent, AgentConfig, AgentResult } from './agent.js';
import type { ApprovalManager } from './approval-manager.js';
import type { ToolPolicy } from './tool-registry.js';
import { logger } from './logger.js';

/** Map Nexus ToolRegistry tools to SDK tool() definitions */
function wrapToolsForSdk(
  toolRegistry: ToolRegistry,
  toolPolicy?: ToolPolicy,
  approvalManager?: ApprovalManager,
  sessionId?: string,
  approvalPolicy?: 'always' | 'destructive' | 'never',
): SdkTool[] {
  const toolNames = toolRegistry.listFiltered(toolPolicy);

  return toolNames.map((name) => {
    const t = toolRegistry.get(name)!;

    // Build JSON schema properties from our ToolParameter format
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of t.parameters) {
      const prop: Record<string, unknown> = {
        type: p.type,
        description: p.description,
      };
      if (p.enum) prop.enum = p.enum;
      if (p.default !== undefined) prop.default = p.default;
      properties[p.name] = prop;
      if (p.required) required.push(p.name);
    }

    return tool({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: 'object' as const,
        properties,
        required,
      },
      async run(input: Record<string, unknown>) {
        // Approval gate
        const policy = approvalPolicy ?? 'destructive';
        if (approvalManager && policy !== 'never') {
          const needsApproval = policy === 'always' || toolRegistry.requiresApproval(name);
          if (needsApproval) {
            const request = await approvalManager.createRequest({
              sessionId: sessionId || 'unknown',
              tool: name,
              params: input,
              thought: 'SDK agent tool call',
            });
            const response = await approvalManager.waitForResponse(request.id);
            if (!response || response.decision === 'deny') {
              return `Error: Tool execution denied.`;
            }
          }
        }

        const result = await toolRegistry.execute(name, input);
        return result.success ? result.output : `Error: ${result.error || result.output}`;
      },
    });
  });
}

/** Model tier to SDK model string */
function tierToModel(tier?: string): string | undefined {
  switch (tier) {
    case 'opus': return 'opus';
    case 'sonnet': return 'sonnet';
    case 'haiku': return 'haiku';
    case 'flash': return 'haiku';
    default: return 'sonnet';
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

    // Wrap Nexus tools for the SDK
    const sdkTools = wrapToolsForSdk(
      this.config.toolRegistry,
      toolPolicy,
      this.config.approvalManager,
      sessionId,
      this.config.approvalPolicy,
    );

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

    try {
      const messages = query({
        prompt: task,
        options: {
          systemPrompt,
          tools: sdkTools,
          maxTurns,
          model: tierToModel(tier),
          permissionMode: 'acceptEdits',
        },
      });

      for await (const message of messages) {
        turns++;

        if (message.type === 'assistant') {
          // Assistant message — may contain text and/or tool calls
          const content = message.content;
          if (typeof content === 'string' && content) {
            this.emitEvent({ type: 'chunk', turn: turns, data: content });
            answer = content;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                this.emitEvent({ type: 'chunk', turn: turns, data: block.text });
                answer = block.text;
              } else if (block.type === 'tool_use') {
                this.emitEvent({
                  type: 'tool_call',
                  turn: turns,
                  data: { tool: block.name, params: block.input },
                });
                // Tool result will come in a subsequent message
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
        } else if (message.type === 'user') {
          // Tool results come back as user messages
          const content = message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                this.emitEvent({
                  type: 'observation',
                  turn: turns,
                  data: {
                    tool: block.tool_use_id,
                    success: !block.is_error,
                    output: typeof block.content === 'string'
                      ? block.content.slice(0, 500)
                      : JSON.stringify(block.content).slice(0, 500),
                  },
                });
              }
            }
          }
        } else if (message.type === 'result') {
          // Final result from the SDK
          answer = typeof message.content === 'string'
            ? message.content
            : (message.text || answer);

          this.emitEvent({ type: 'final_answer', turn: turns, data: answer });

          if (this.config.onAction) {
            try {
              this.config.onAction({ type: 'final_answer', turn: turns, answer });
            } catch { /* callback errors don't break the loop */ }
          }
        }
      }

      logger.info('SdkAgentRunner: completed', { turns, answerLength: answer.length });

      return {
        success: true,
        answer: answer || 'Task completed (no text response).',
        turns,
        totalInputTokens: 0, // SDK doesn't expose token counts
        totalOutputTokens: 0,
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
