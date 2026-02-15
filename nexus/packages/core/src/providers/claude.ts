/**
 * ClaudeProvider — Primary AI provider for LivOS using Anthropic's Claude API.
 * Implements the AIProvider interface with chat, streaming, and think capabilities.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Redis } from 'ioredis';
import type {
  AIProvider,
  ProviderChatOptions,
  ProviderChatResult,
  ProviderStreamResult,
  ProviderStreamChunk,
  ModelTier,
} from './types.js';
import { prepareForProvider } from './normalize.js';
import { logger } from '../logger.js';

const CLAUDE_MODELS: Record<string, string> = {
  flash: 'claude-haiku-4-5',
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-5',
  opus: 'claude-opus-4-6',
};

const REDIS_KEY = 'nexus:config:anthropic_api_key';

export class ClaudeProvider implements AIProvider {
  readonly id = 'claude';
  readonly supportsVision = true;
  readonly supportsToolCalling = true;

  private client: Anthropic | null = null;
  private redis: Redis | null = null;
  private cachedApiKey: string = '';

  constructor(redis?: Redis) {
    this.redis = redis ?? null;
  }

  private async getApiKey(): Promise<string> {
    // Try Redis first
    if (this.redis) {
      try {
        const key = await this.redis.get(REDIS_KEY);
        if (key) return key;
      } catch (err: any) {
        logger.warn('ClaudeProvider: Redis read failed, falling back to env', { error: err.message });
      }
    }

    // Fallback to env
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;

    throw new Error('No Anthropic API key configured');
  }

  private async getClient(): Promise<Anthropic> {
    const apiKey = await this.getApiKey();

    // Re-create client if key changed
    if (this.client && apiKey === this.cachedApiKey) {
      return this.client;
    }

    this.client = new Anthropic({ apiKey });
    this.cachedApiKey = apiKey;
    return this.client;
  }

  async chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
    const tier = options.tier || 'sonnet';
    const model = CLAUDE_MODELS[tier] || CLAUDE_MODELS.sonnet;
    const maxTokens = options.maxOutputTokens || 4096;
    const claudeMessages = prepareForProvider(options.messages, 'claude') as Anthropic.MessageParam[];

    const client = await this.getClient();

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: options.systemPrompt,
      messages: claudeMessages,
    });

    // Extract text from content blocks
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      provider: 'claude',
      model,
    };
  }

  chatStream(options: ProviderChatOptions): ProviderStreamResult {
    const tier = options.tier || 'sonnet';
    const model = CLAUDE_MODELS[tier] || CLAUDE_MODELS.sonnet;
    const maxTokens = options.maxOutputTokens || 4096;
    const claudeMessages = prepareForProvider(options.messages, 'claude') as Anthropic.MessageParam[];

    let finalInputTokens = 0;
    let finalOutputTokens = 0;
    const self = this;

    async function* generate(): AsyncGenerator<ProviderStreamChunk> {
      const client = await self.getClient();
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: options.systemPrompt,
        messages: claudeMessages,
      });

      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            yield { text: event.delta.text, done: false };
          }
        }

        // Get final usage from the accumulated message
        const finalMessage = await stream.finalMessage();
        finalInputTokens = finalMessage.usage.input_tokens;
        finalOutputTokens = finalMessage.usage.output_tokens;

        yield { text: '', done: true };
      } catch (err: any) {
        logger.error('ClaudeProvider.chatStream error', { error: err.message });
        yield { text: '', done: true };
        throw err;
      }
    }

    return {
      stream: generate(),
      getUsage: () => ({ inputTokens: finalInputTokens, outputTokens: finalOutputTokens }),
      provider: 'claude',
      model,
    };
  }

  async think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string> {
    const result = await this.chat({
      systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
      messages: [{ role: 'user', content: options.prompt }],
      tier: options.tier,
      maxOutputTokens: options.maxTokens,
    });
    return result.text;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.getApiKey();
      return true;
    } catch {
      return false;
    }
  }

  getModels(): Record<string, string> {
    return { ...CLAUDE_MODELS };
  }
}
