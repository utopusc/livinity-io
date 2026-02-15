/**
 * GeminiProvider — Fallback AI provider for LivOS using Google's Gemini API.
 * Extracted from the original Brain class, preserving all existing retry and streaming logic.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
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
import { retryAsync, type RetryOptions } from '../infra/retry.js';
import { isRetryableError, isRateLimitError, extractRetryAfter, formatErrorMessage } from '../infra/errors.js';
import { BACKOFF_POLICIES } from '../infra/backoff.js';

const GEMINI_MODELS: Record<string, string> = {
  flash: 'gemini-3-flash-preview',
  haiku: 'gemini-3-flash-preview',
  sonnet: 'gemini-3-flash-preview',
  opus: 'gemini-3-pro-preview',
};

const REDIS_KEY = 'livos:config:gemini_api_key';

// Retry configuration for LLM calls (preserved from original Brain class)
const LLM_RETRY_OPTIONS: RetryOptions = {
  attempts: 3,
  minDelayMs: BACKOFF_POLICIES.llm.initialMs,
  maxDelayMs: BACKOFF_POLICIES.llm.maxMs,
  jitter: BACKOFF_POLICIES.llm.jitter,
  label: 'llm-call',
  shouldRetry: (err) => {
    if (isRateLimitError(err)) return true;
    return isRetryableError(err);
  },
  retryAfterMs: (err) => extractRetryAfter(err),
  onRetry: (info) => {
    logger.warn('GeminiProvider: retrying LLM call', {
      attempt: info.attempt,
      maxAttempts: info.maxAttempts,
      delayMs: info.delayMs,
      error: formatErrorMessage(info.err),
      label: info.label,
    });
  },
};

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly supportsVision = true;
  readonly supportsToolCalling = false;

  private gemini: GoogleGenerativeAI | null = null;
  private redis: Redis | null = null;
  private cachedApiKey: string = '';

  constructor(redis?: Redis) {
    this.redis = redis ?? null;
    const envKey = process.env.GEMINI_API_KEY || '';
    if (envKey) {
      this.cachedApiKey = envKey;
      this.gemini = new GoogleGenerativeAI(envKey);
    }
  }

  private async getClient(): Promise<GoogleGenerativeAI> {
    // Try Redis first
    if (this.redis) {
      const redisKey = await this.redis.get(REDIS_KEY);
      if (redisKey && redisKey !== this.cachedApiKey) {
        this.cachedApiKey = redisKey;
        this.gemini = new GoogleGenerativeAI(redisKey);
        logger.info('GeminiProvider: Updated API key from Redis');
      }
    }

    // Fallback to env
    if (!this.gemini) {
      const envKey = process.env.GEMINI_API_KEY || '';
      if (envKey) {
        this.cachedApiKey = envKey;
        this.gemini = new GoogleGenerativeAI(envKey);
      }
    }

    if (!this.gemini) {
      throw new Error('No Gemini API key configured. Set GEMINI_API_KEY or configure via UI.');
    }

    return this.gemini;
  }

  private async geminiCall(modelName: string, prompt: string, systemPrompt?: string, maxTokens = 1024): Promise<string> {
    const gemini = await this.getClient();
    const model = gemini.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt || 'You are Nexus, a personal AI server assistant. Be concise and actionable.',
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });

    return result.response.text();
  }

  async chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
    const tier = options.tier || 'sonnet';
    const modelName = GEMINI_MODELS[tier] || GEMINI_MODELS.flash;
    const maxTokens = options.maxOutputTokens || 2048;
    const geminiMessages = prepareForProvider(options.messages, 'gemini') as Array<{ role: string; parts: any[] }>;

    return retryAsync(
      async () => {
        const gemini = await this.getClient();
        const model = gemini.getGenerativeModel({
          model: modelName,
          systemInstruction: options.systemPrompt,
        });

        const result = await model.generateContent({
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: maxTokens },
        });

        const usage = result.response.usageMetadata;
        return {
          text: result.response.text(),
          inputTokens: usage?.promptTokenCount || 0,
          outputTokens: usage?.candidatesTokenCount || 0,
          provider: 'gemini' as const,
          model: modelName,
        };
      },
      { ...LLM_RETRY_OPTIONS, label: `gemini-chat-${tier}` },
    );
  }

  chatStream(options: ProviderChatOptions): ProviderStreamResult {
    const tier = options.tier || 'sonnet';
    const modelName = GEMINI_MODELS[tier] || GEMINI_MODELS.flash;
    const maxTokens = options.maxOutputTokens || 2048;
    const geminiMessages = prepareForProvider(options.messages, 'gemini') as Array<{ role: string; parts: any[] }>;

    let inputTokens = 0;
    let outputTokens = 0;
    let retryCount = 0;
    const maxRetries = LLM_RETRY_OPTIONS.attempts || 3;

    const self = this;
    async function* generate(): AsyncGenerator<ProviderStreamChunk> {
      while (retryCount < maxRetries) {
        try {
          const gemini = await self.getClient();
          const model = gemini.getGenerativeModel({
            model: modelName,
            systemInstruction: options.systemPrompt,
          });

          const result = await model.generateContentStream({
            contents: geminiMessages,
            generationConfig: { maxOutputTokens: maxTokens },
          });

          // Prevent unhandled rejection: if the stream errors, result.response
          // also rejects but we skip its await (jump to catch). Attach a no-op
          // handler so the rejection doesn't crash the process.
          result.response.catch(() => {});

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              yield { text, done: false };
            }
          }

          const final = await result.response;
          const usage = final.usageMetadata;
          inputTokens = usage?.promptTokenCount || 0;
          outputTokens = usage?.candidatesTokenCount || 0;

          yield { text: '', done: true };
          return; // Success, exit retry loop

        } catch (err: any) {
          retryCount++;
          const shouldRetry = isRetryableError(err) && retryCount < maxRetries;

          if (shouldRetry) {
            const retryAfter = extractRetryAfter(err);
            const baseDelay = retryAfter || (LLM_RETRY_OPTIONS.minDelayMs || 1000) * Math.pow(2, retryCount - 1);
            const delay = Math.min(baseDelay, LLM_RETRY_OPTIONS.maxDelayMs || 30000);

            logger.warn('GeminiProvider: retrying stream', {
              attempt: retryCount,
              maxAttempts: maxRetries,
              delayMs: delay,
              error: formatErrorMessage(err),
            });

            await new Promise((r) => setTimeout(r, delay));
            continue; // Retry
          }

          // No more retries, throw
          logger.error('GeminiProvider.chatStream error', { tier, error: err.message, attempts: retryCount });
          throw err;
        }
      }
    }

    return {
      stream: generate(),
      getUsage: () => ({ inputTokens, outputTokens }),
      provider: 'gemini',
      model: modelName,
    };
  }

  async think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string> {
    const tier = options.tier || 'flash';
    const modelName = GEMINI_MODELS[tier] || GEMINI_MODELS.flash;

    return retryAsync(
      () => this.geminiCall(modelName, options.prompt, options.systemPrompt, options.maxTokens || 1024),
      { ...LLM_RETRY_OPTIONS, label: `gemini-think-${tier}` },
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.getClient();
      return true;
    } catch {
      return false;
    }
  }

  getModels(): Record<string, string> {
    return { ...GEMINI_MODELS };
  }
}
