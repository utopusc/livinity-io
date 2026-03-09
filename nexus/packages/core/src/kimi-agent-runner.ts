/**
 * KimiAgentRunner -- Runs tasks through the Kimi CLI in print mode (subprocess).
 *
 * Instead of using the Kimi Agent SDK (v0.1.5, pre-stable), this spawns
 * `kimi --print --output-format=stream-json` as a child process and parses
 * JSONL output. Nexus tools are exposed via `--mcp-config` pointing to the
 * existing nexus-mcp HTTP server on port 3100.
 *
 * This mirrors AgentLoop's public interface (extends EventEmitter,
 * constructor takes AgentConfig, has `run(task): Promise<AgentResult>`).
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:http';
import type { ToolRegistry, ToolPolicy } from './tool-registry.js';
import type { AgentEvent, AgentConfig, AgentResult } from './agent.js';
import { logger } from './logger.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map Nexus model tier to Kimi model ID */
function tierToModel(tier?: string): string {
  switch (tier) {
    case 'opus': return 'kimi-k2.5';
    case 'sonnet': return 'kimi-for-coding';
    case 'haiku': return 'kimi-latest';
    case 'flash': return 'kimi-latest';
    default: return 'kimi-for-coding';
  }
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

/** Build --mcp-config JSON from nexus-tools HTTP server and optionally Chrome DevTools */
async function buildMcpConfig(
  nexusConfig?: AgentConfig['nexusConfig'],
): Promise<Record<string, any>> {
  const mcpServers: Record<string, any> = {
    'nexus-tools': {
      url: 'http://127.0.0.1:3100/mcp',
    },
  };

  // Add Chrome DevTools MCP if Chrome CDP is reachable
  const browserUrl = (nexusConfig?.browser?.cdpUrl ?? 'ws://127.0.0.1:9223')
    .replace(/^ws:\/\//, 'http://');
  if (nexusConfig?.browser?.enabled !== false) {
    const cdpReachable = await isCdpReachable(browserUrl).catch(() => false);
    if (cdpReachable) {
      mcpServers['chrome-devtools'] = {
        command: 'chrome-devtools-mcp',
        args: ['--browserUrl', browserUrl, '--no-usage-statistics'],
      };
      logger.info('KimiAgentRunner: Chrome DevTools MCP enabled', { browserUrl });
    } else {
      logger.info('KimiAgentRunner: Chrome CDP not reachable, skipping Chrome DevTools MCP', { browserUrl });
    }
  }

  return { mcpServers };
}

// ── Temp Agent Files ────────────────────────────────────────────────────────

const AGENT_TEMP_DIR = '/tmp/nexus-agents';

/** Write temporary agent YAML and system prompt markdown files for a session */
async function writeAgentFiles(
  sessionId: string,
  systemPrompt: string,
): Promise<{ yamlPath: string; mdPath: string }> {
  await mkdir(AGENT_TEMP_DIR, { recursive: true });

  const mdPath = join(AGENT_TEMP_DIR, `${sessionId}.md`);
  const yamlPath = join(AGENT_TEMP_DIR, `${sessionId}.yaml`);

  // Write system prompt markdown
  await writeFile(mdPath, systemPrompt, 'utf-8');

  // Write agent YAML pointing to the markdown file
  const yaml = `name: nexus-agent\nsystem_prompt_path: ${mdPath}\n`;
  await writeFile(yamlPath, yaml, 'utf-8');

  return { yamlPath, mdPath };
}

/** Clean up temporary agent files (safe to call even if files don't exist) */
async function cleanupAgentFiles(yamlPath: string, mdPath: string): Promise<void> {
  await unlink(yamlPath).catch(() => {});
  await unlink(mdPath).catch(() => {});
}

// ── Default System Prompt ───────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are Nexus, an autonomous AI assistant running on a Linux server. You interact with users via WhatsApp, Telegram, Discord, and a web UI.

You have access to MCP tools (prefixed with mcp__nexus-tools__) for shell commands, Docker management, file operations, web browsing, memory, and messaging.

CRITICAL RULES:
1. ONLY do what the user explicitly asks. Do NOT invent tasks, repeat previous work, or act on conversation history unless the user specifically requests it.
2. If the user sends a greeting or simple message, respond conversationally -- do NOT run tools.
3. Conversation history (if provided) is CONTEXT ONLY. Do NOT re-execute tasks from history.
4. Be concise. For simple questions, respond in 1-2 sentences without using tools.
5. If a tool fails, try ONE alternative approach, then report the issue.
6. When the task is complete, provide your final answer immediately -- do not keep exploring.`;

// ── JSONL Message Types ─────────────────────────────────────────────────────

interface KimiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface KimiMessage {
  role: 'assistant' | 'tool' | 'system';
  content?: string;
  tool_calls?: KimiToolCall[];
  tool_call_id?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_other?: number;
    input_cache_read?: number;
    output?: number;
  };
}

// ── KimiAgentRunner ─────────────────────────────────────────────────────────

export class KimiAgentRunner extends EventEmitter {
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

    const maxTurns = Math.min(this.config.maxTurns ?? agentDefaults?.maxTurns ?? 15, 25);
    const maxTokenBudget = this.config.maxTokens ?? 0; // 0 = unlimited
    const timeoutMs = this.config.timeoutMs ?? agentDefaults?.timeoutMs ?? 600000;
    const tier = this.config.tier ?? agentDefaults?.tier ?? 'sonnet';

    // Build system prompt
    const systemPrompt = this.config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;

    // Prepend context prefix to task if provided
    let taskWithContext = task;
    if (this.config.contextPrefix) {
      taskWithContext = `${this.config.contextPrefix}\n\n## Current Task\n${task}`;
    }

    // Write temp agent files
    let yamlPath = '';
    let mdPath = '';

    // Tracking variables
    const toolCalls: AgentResult['toolCalls'] = [];
    let answer = '';
    let turns = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let ttfbMs = 0;
    let firstContentReceived = false;
    let toolCallCount = 0;
    let estimatedTokens = 0;
    let stoppedReason: AgentResult['stoppedReason'] = 'complete';

    try {
      // Write agent YAML + system prompt markdown files
      const agentFiles = await writeAgentFiles(sessionId, systemPrompt);
      yamlPath = agentFiles.yamlPath;
      mdPath = agentFiles.mdPath;

      // Build MCP config (checks CDP reachability)
      const mcpConfigObj = await buildMcpConfig(nexusConfig);
      const mcpConfigJson = JSON.stringify(mcpConfigObj);

      // Build subprocess args
      const args = [
        '--print',
        '--output-format=stream-json',
        '--yolo',
        '--agent-file', yamlPath,
        '--model', tierToModel(tier),
        '--max-steps-per-turn', String(maxTurns),
        '--work-dir', '/opt/livos',
        '--mcp-config', mcpConfigJson,
        '-p', taskWithContext,
      ];

      logger.info('KimiAgentRunner: starting task', {
        task: task.slice(0, 100),
        maxTurns,
        tier,
        model: tierToModel(tier),
        sessionId: sessionId.slice(0, 8),
      });

      this.emitEvent({ type: 'thinking', turn: 1 });

      // Spawn kimi subprocess
      const child = spawn('kimi', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      // Capture stderr for error reporting
      let stderrBuffer = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      // Handle spawn errors (e.g., kimi not found)
      let spawnError: Error | null = null;
      child.on('error', (err: Error) => {
        spawnError = err;
        logger.error('KimiAgentRunner: spawn error', { error: err.message });
      });

      // Timeout enforcement
      let timedOut = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          logger.warn('KimiAgentRunner: timeout, killing child process', { timeoutMs });
          child.kill('SIGTERM');
          // Force kill after 5s if SIGTERM doesn't work
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }, timeoutMs);
      }

      // Parse JSONL output line-by-line
      const rl = createInterface({ input: child.stdout });
      // Track tool_call IDs to tool names for observation mapping
      const toolCallIdMap = new Map<string, string>();
      let lastAssistantContent = '';

      for await (const line of rl) {
        if (!line.trim()) continue;

        let msg: KimiMessage;
        try {
          msg = JSON.parse(line);
        } catch {
          logger.warn('KimiAgentRunner: unparseable JSONL line, skipping', { line: line.slice(0, 200) });
          continue;
        }

        // Token budget enforcement (estimate: ~4 chars per token)
        if (maxTokenBudget > 0 && estimatedTokens > maxTokenBudget) {
          logger.warn('KimiAgentRunner: token budget exceeded, killing child', { estimatedTokens, maxTokenBudget });
          stoppedReason = 'max_tokens';
          child.kill('SIGTERM');
          break;
        }

        // Extract usage from any message that has it
        if (msg.usage) {
          const u = msg.usage;
          totalInputTokens += (u.input_tokens ?? 0) + (u.input_other ?? 0) + (u.input_cache_read ?? 0);
          totalOutputTokens += (u.output_tokens ?? 0) + (u.output ?? 0);
        }

        if (msg.role === 'assistant') {
          // Assistant message with text content
          if (msg.content) {
            // Track TTFB
            if (!firstContentReceived) {
              ttfbMs = Date.now() - runStartTime;
              firstContentReceived = true;
            }

            lastAssistantContent = msg.content;
            estimatedTokens += Math.ceil(msg.content.length / 4);

            // If this message also has tool_calls, it's a thinking + action message
            // If no tool_calls, this is a content message (potentially final answer)
            if (!msg.tool_calls || msg.tool_calls.length === 0) {
              this.emitEvent({ type: 'chunk', turn: turns + 1, data: msg.content });
              answer = msg.content;

              // Fire onAction callback for live channel updates
              if (this.config.onAction && msg.content.trim()) {
                try {
                  this.config.onAction({
                    type: 'thinking',
                    thought: msg.content,
                    turn: turns + 1,
                  });
                } catch { /* callback errors don't break the loop */ }
              }
            }
          }

          // Assistant message with tool calls
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            turns++;
            for (const tc of msg.tool_calls) {
              toolCallCount++;
              const toolName = tc.function.name;
              let params: Record<string, unknown> = {};
              try {
                params = JSON.parse(tc.function.arguments);
              } catch {
                params = { raw: tc.function.arguments };
              }

              // Map tool_call ID to name for observation lookup
              toolCallIdMap.set(tc.id, toolName);

              estimatedTokens += Math.ceil(tc.function.arguments.length / 4);

              this.emitEvent({
                type: 'tool_call',
                turn: turns,
                data: { tool: toolName, params },
              });

              // Fire onAction for live updates
              if (this.config.onAction) {
                try {
                  this.config.onAction({
                    type: 'thinking',
                    thought: msg.content || `Calling ${toolName}`,
                    tool: toolName,
                    turn: turns,
                  });
                } catch { /* callback errors don't break the loop */ }
              }
            }
          }
        } else if (msg.role === 'tool') {
          // Tool result message
          const toolName = msg.tool_call_id ? (toolCallIdMap.get(msg.tool_call_id) || msg.tool_call_id) : 'unknown';
          const output = msg.content || '';

          estimatedTokens += Math.ceil(output.length / 4);

          this.emitEvent({
            type: 'observation',
            turn: turns,
            data: { tool: toolName, output: output.slice(0, 500) },
          });
        }
        // System messages are logged but not emitted
      }

      // Clear timeout
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      // Wait for process exit
      const exitCode = await new Promise<number>((resolve) => {
        // If process already exited, resolve immediately
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        child.on('close', (code) => resolve(code ?? 1));
      });

      // Handle spawn error
      if (spawnError) {
        const errMsg = (spawnError as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'Kimi CLI not found. Is kimi installed and in PATH?'
          : `Kimi CLI spawn error: ${(spawnError as Error).message}`;

        this.emitEvent({ type: 'error', turn: turns, data: errMsg });

        return {
          success: false,
          answer: errMsg,
          turns,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCalls,
          stoppedReason: 'error',
          ttfbMs: 0,
          toolCallCount: 0,
          durationMs: Date.now() - runStartTime,
        };
      }

      // Determine final answer and stopped reason
      if (timedOut) {
        stoppedReason = 'timeout';
      } else if (stoppedReason !== 'max_tokens') {
        stoppedReason = exitCode === 0 ? 'complete' : 'error';
      }

      // Use last assistant content as answer if we didn't capture one from a non-tool-call message
      if (!answer && lastAssistantContent) {
        answer = lastAssistantContent;
      }

      // Emit final answer
      const finalAnswer = answer || stderrBuffer || 'Task completed (no response).';
      this.emitEvent({ type: 'final_answer', turn: turns || 1, data: finalAnswer });

      if (this.config.onAction) {
        try {
          this.config.onAction({ type: 'final_answer', turn: turns || 1, answer: finalAnswer });
        } catch { /* callback errors don't break the loop */ }
      }

      const durationMs = Date.now() - runStartTime;
      logger.info('KimiAgentRunner: completed', {
        turns,
        exitCode,
        answerLength: finalAnswer.length,
        timedOut,
        ttfbMs,
        toolCallCount,
        durationMs,
        stoppedReason,
      });

      return {
        success: exitCode === 0 && stoppedReason === 'complete',
        answer: finalAnswer,
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolCalls,
        stoppedReason,
        ttfbMs,
        toolCallCount,
        durationMs,
      };
    } catch (err: any) {
      logger.error('KimiAgentRunner: error', {
        error: err.message,
        stack: err.stack?.split('\n').slice(0, 3).join(' | '),
      });

      this.emitEvent({ type: 'error', turn: turns, data: err.message });

      return {
        success: false,
        answer: `Kimi agent error: ${err.message}`,
        turns,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCalls,
        stoppedReason: 'error',
        ttfbMs: 0,
        toolCallCount: 0,
        durationMs: Date.now() - runStartTime,
      };
    } finally {
      // Always clean up temp files
      if (yamlPath && mdPath) {
        await cleanupAgentFiles(yamlPath, mdPath);
      }
    }
  }
}
