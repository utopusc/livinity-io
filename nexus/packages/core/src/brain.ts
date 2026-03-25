import type { Redis } from 'ioredis';
import { ProviderManager } from './providers/manager.js';
import { normalizeMessages } from './providers/normalize.js';
import type { ToolDefinition, ToolUseBlock, ProviderStreamChunk } from './providers/types.js';
import { logger } from './logger.js';

export type ModelTier = 'none' | 'flash' | 'haiku' | 'sonnet' | 'opus';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  /** Optional inline images (e.g. browser screenshots) sent as vision input */
  images?: Array<{ base64: string; mimeType: string }>;
}

interface ChatOptions {
  systemPrompt: string;
  messages: ChatMessage[];
  tier?: ModelTier;
  maxTokens?: number;
  /** Tool definitions for native tool calling */
  tools?: ToolDefinition[];
  /** Pre-formatted provider messages (bypasses normalization, used for tool_result messages) */
  rawProviderMessages?: unknown[];
}

interface ChatStreamChunk {
  text: string;
  done: boolean;
  /** Tool use block completed during streaming */
  toolUse?: ToolUseBlock;
  /** Stop reason from the provider */
  stopReason?: string;
  /** Reasoning/thinking content (e.g. Kimi's reasoning_content) */
  reasoning?: string;
}

interface ChatStreamResult {
  stream: AsyncGenerator<ChatStreamChunk>;
  /** Call after stream ends to get final token usage */
  getUsage: () => { inputTokens: number; outputTokens: number };
}

export class Brain {
  private manager: ProviderManager;

  constructor(redis?: Redis) {
    this.manager = new ProviderManager(redis);
    // Init is async — we fire and forget, the default order works until init completes
    this.manager.init().catch((err) => {
      logger.warn('ProviderManager init failed', { error: (err as Error).message });
    });
  }

  async think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string> {
    if (options.tier === 'none') return '';
    return this.manager.think(options);
  }

  async chat(options: ChatOptions): Promise<{ text: string; inputTokens: number; outputTokens: number; toolCalls?: ToolUseBlock[]; stopReason?: string }> {
    const messages = options.rawProviderMessages
      ? undefined
      : normalizeMessages(options.messages);
    const result = await this.manager.chat({
      systemPrompt: options.systemPrompt,
      messages: messages || [],
      tier: options.tier,
      maxOutputTokens: options.maxTokens,
      tools: options.tools,
      rawMessages: options.rawProviderMessages,
    });
    return {
      text: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      toolCalls: result.toolCalls,
      stopReason: result.stopReason,
    };
  }

  chatStream(options: ChatOptions): ChatStreamResult {
    const messages = options.rawProviderMessages
      ? undefined
      : normalizeMessages(options.messages);
    const result = this.manager.chatStream({
      systemPrompt: options.systemPrompt,
      messages: messages || [],
      tier: options.tier,
      maxOutputTokens: options.maxTokens,
      tools: options.tools,
      rawMessages: options.rawProviderMessages,
    });
    return {
      stream: result.stream as AsyncGenerator<ChatStreamChunk>,
      getUsage: result.getUsage,
    };
  }

  selectTier(intentType: string): ModelTier {
    const noAi = ['docker_command', 'file_read', 'cron_set', 'status_check', 'direct_execute', 'shell_command', 'system_monitor', 'file_operation', 'service_management'];
    if (noAi.includes(intentType)) return 'none';
    const cheap = ['classify', 'summarize', 'parse_message', 'simple_answer', 'format'];
    if (cheap.includes(intentType)) return 'flash';
    const mid = ['research', 'analyze', 'code_review', 'write_content', 'debug'];
    if (mid.includes(intentType)) return 'sonnet';
    const strong = ['complex_plan', 'architecture', 'multi_step_reasoning'];
    if (strong.includes(intentType)) return 'opus';
    return 'flash';
  }

  /** Get the ID of the primary available provider */
  async getActiveProviderId(): Promise<string> {
    return this.manager.getActiveProviderId();
  }

  /** Access the underlying ProviderManager for advanced usage */
  getProviderManager(): ProviderManager {
    return this.manager;
  }
}
