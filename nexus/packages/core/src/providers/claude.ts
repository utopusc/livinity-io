/**
 * ClaudeProvider — Primary AI provider for LivOS using Anthropic's Claude API.
 * Implements the AIProvider interface with chat, streaming, think, and native tool calling.
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
  ToolUseBlock,
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
    if (this.redis) {
      try {
        const key = await this.redis.get(REDIS_KEY);
        if (key) return key;
      } catch (err: any) {
        logger.warn('ClaudeProvider: Redis read failed, falling back to env', { error: err.message });
      }
    }

    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;

    throw new Error('No Anthropic API key configured');
  }

  private async getClient(): Promise<Anthropic> {
    const apiKey = await this.getApiKey();

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
    const claudeMessages = (options.rawMessages as Anthropic.MessageParam[])
      || prepareForProvider(options.messages, 'claude') as Anthropic.MessageParam[];

    const client = await this.getClient();

    const createParams: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      system: options.systemPrompt,
      messages: claudeMessages,
    };

    if (options.tools && options.tools.length > 0) {
      (createParams as any).tools = options.tools;
    }

    const response = await client.messages.create(createParams);

    // Extract text and tool_use blocks from content
    let text = '';
    const toolCalls: ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      provider: 'claude',
      model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: response.stop_reason || undefined,
    };
  }

  chatStream(options: ProviderChatOptions): ProviderStreamResult {
    const tier = options.tier || 'sonnet';
    const model = CLAUDE_MODELS[tier] || CLAUDE_MODELS.sonnet;
    const maxTokens = options.maxOutputTokens || 4096;
    const claudeMessages = (options.rawMessages as Anthropic.MessageParam[])
      || prepareForProvider(options.messages, 'claude') as Anthropic.MessageParam[];

    let finalInputTokens = 0;
    let finalOutputTokens = 0;
    const self = this;

    async function* generate(): AsyncGenerator<ProviderStreamChunk> {
      const client = await self.getClient();

      const createParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        system: options.systemPrompt,
        messages: claudeMessages,
      };

      if (options.tools && options.tools.length > 0) {
        (createParams as any).tools = options.tools;
      }

      const stream = client.messages.stream(createParams);

      // Track tool_use accumulation
      let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
      let stopReason = '';

      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              yield { text: event.delta.text, done: false };
            } else if (event.delta.type === 'input_json_delta') {
              if (currentToolUse) {
                currentToolUse.inputJson += event.delta.partial_json;
              }
            }
          } else if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: '',
              };
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              let input: Record<string, unknown> = {};
              try {
                input = currentToolUse.inputJson ? JSON.parse(currentToolUse.inputJson) : {};
              } catch {
                logger.warn('ClaudeProvider: failed to parse tool input JSON', {
                  raw: currentToolUse.inputJson.slice(0, 200),
                });
              }
              yield {
                text: '',
                done: false,
                toolUse: {
                  type: 'tool_use',
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input,
                },
              };
              currentToolUse = null;
            }
          } else if (event.type === 'message_delta') {
            stopReason = (event as any).delta?.stop_reason || '';
          }
        }

        const finalMessage = await stream.finalMessage();
        finalInputTokens = finalMessage.usage.input_tokens;
        finalOutputTokens = finalMessage.usage.output_tokens;

        yield { text: '', done: true, stopReason: stopReason || finalMessage.stop_reason || '' };
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
