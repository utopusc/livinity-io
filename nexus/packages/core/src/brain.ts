import type { Redis } from 'ioredis';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderManager } from './providers/manager.js';
import { normalizeMessages } from './providers/normalize.js';
import type { ToolDefinition, ToolUseBlock, ProviderStreamChunk } from './providers/types.js';
import { logger } from './logger.js';

export type ModelTier = 'none' | 'haiku' | 'sonnet' | 'opus';

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

interface TierConfig {
  defaultTier: ModelTier;
  rules: Record<string, string[]>;
}

export class Brain {
  private manager: ProviderManager;
  private tierConfig: TierConfig;

  constructor(redis?: Redis) {
    this.manager = new ProviderManager(redis);
    // Init is async — we fire and forget, the default order works until init completes
    this.manager.init().catch((err) => {
      logger.warn('ProviderManager init failed', { error: (err as Error).message });
    });
    this.tierConfig = this.loadTierConfig();
  }

  private loadTierConfig(): TierConfig {
    const defaults: TierConfig = {
      defaultTier: 'haiku',
      rules: {
        none: ['docker_command', 'file_read', 'cron_set', 'status_check', 'direct_execute', 'shell_command', 'system_monitor', 'file_operation', 'service_management'],
        haiku: ['classify', 'summarize', 'parse_message', 'simple_answer', 'format'],
        sonnet: ['research', 'analyze', 'code_review', 'write_content', 'debug'],
        opus: ['complex_plan', 'architecture', 'multi_step_reasoning'],
      },
    };

    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const configPath = resolve(__dirname, '..', '..', '..', 'config', 'tiers.json');
      if (existsSync(configPath)) {
        const raw = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        logger.debug('Brain: loaded tiers.json', { path: configPath });
        return { defaultTier: parsed.defaultTier || 'haiku', rules: parsed.rules || defaults.rules };
      }
    } catch (err) {
      logger.warn('Brain: failed to load tiers.json, using defaults', { error: (err as Error).message });
    }
    return defaults;
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
    for (const [tier, intents] of Object.entries(this.tierConfig.rules)) {
      if (intents.includes(intentType)) {
        logger.debug('selectTier', { intentType, tier });
        return tier as ModelTier;
      }
    }
    logger.debug('selectTier', { intentType, tier: this.tierConfig.defaultTier, fallback: true });
    return this.tierConfig.defaultTier;
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
