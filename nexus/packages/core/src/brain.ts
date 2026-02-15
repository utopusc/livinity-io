import type { Redis } from 'ioredis';
import { ProviderManager } from './providers/manager.js';
import { normalizeMessages } from './providers/normalize.js';

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
}

interface ChatStreamChunk {
  text: string;
  done: boolean;
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
  }

  async think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string> {
    if (options.tier === 'none') return '';
    return this.manager.think(options);
  }

  async chat(options: ChatOptions): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const normalized = normalizeMessages(options.messages);
    const result = await this.manager.chat({
      systemPrompt: options.systemPrompt,
      messages: normalized,
      tier: options.tier,
      maxOutputTokens: options.maxTokens,
    });
    return { text: result.text, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  chatStream(options: ChatOptions): ChatStreamResult {
    const normalized = normalizeMessages(options.messages);
    const result = this.manager.chatStream({
      systemPrompt: options.systemPrompt,
      messages: normalized,
      tier: options.tier,
      maxOutputTokens: options.maxTokens,
    });
    return {
      stream: result.stream,
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

  /** Access the underlying ProviderManager for advanced usage */
  getProviderManager(): ProviderManager {
    return this.manager;
  }
}
