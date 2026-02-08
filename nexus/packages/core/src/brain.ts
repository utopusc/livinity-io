import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Redis } from 'ioredis';
import { logger } from './logger.js';
import { retryAsync, type RetryOptions } from './infra/retry.js';
import { isRetryableError, isRateLimitError, extractRetryAfter, formatErrorMessage } from './infra/errors.js';
import { BACKOFF_POLICIES } from './infra/backoff.js';

export type ModelTier = 'none' | 'flash' | 'haiku' | 'sonnet' | 'opus';

// Retry configuration for LLM calls
const LLM_RETRY_OPTIONS: RetryOptions = {
  attempts: 3,
  minDelayMs: BACKOFF_POLICIES.llm.initialMs,
  maxDelayMs: BACKOFF_POLICIES.llm.maxMs,
  jitter: BACKOFF_POLICIES.llm.jitter,
  label: 'llm-call',
  shouldRetry: (err) => {
    // Always retry rate limits
    if (isRateLimitError(err)) return true;
    // Retry other retryable errors
    return isRetryableError(err);
  },
  retryAfterMs: (err) => extractRetryAfter(err),
  onRetry: (info) => {
    logger.warn('Brain: retrying LLM call', {
      attempt: info.attempt,
      maxAttempts: info.maxAttempts,
      delayMs: info.delayMs,
      error: formatErrorMessage(info.err),
      label: info.label,
    });
  },
};

interface ThinkOptions {
  prompt: string;
  systemPrompt?: string;
  tier?: ModelTier;
  maxTokens?: number;
}

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

// Gemini model mapping per tier
const GEMINI_MODELS: Record<string, string> = {
  flash: 'gemini-3-flash-preview',  // Cheapest, fastest — routine tasks, classification
  haiku: 'gemini-3-flash-preview',  // Light tasks — parsing, simple answers
  sonnet: 'gemini-3-flash-preview', // Agent loop — reasoning, multi-step tasks
  opus: 'gemini-3-pro-preview',     // Heavy tasks — complex architecture
};

export class Brain {
  private gemini: GoogleGenerativeAI | null = null;
  private redis: Redis | null = null;
  private cachedApiKey: string = '';

  constructor(redis?: Redis) {
    this.redis = redis || null;
    // Initialize with env key if available
    const envKey = process.env.GEMINI_API_KEY || '';
    if (envKey) {
      this.cachedApiKey = envKey;
      this.gemini = new GoogleGenerativeAI(envKey);
    }
  }

  private async getGeminiClient(): Promise<GoogleGenerativeAI> {
    // Try to get API key from Redis first
    if (this.redis) {
      const redisKey = await this.redis.get('livos:config:gemini_api_key');
      if (redisKey && redisKey !== this.cachedApiKey) {
        this.cachedApiKey = redisKey;
        this.gemini = new GoogleGenerativeAI(redisKey);
        logger.info('Brain: Updated Gemini API key from Redis');
      }
    }

    // Fallback to env if still no key
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

  async think(options: ThinkOptions): Promise<string> {
    const { prompt, systemPrompt, tier = 'flash', maxTokens = 1024 } = options;

    if (tier === 'none') {
      return ''; // No AI needed
    }

    const modelName = GEMINI_MODELS[tier] || GEMINI_MODELS.flash;

    // Use retry wrapper for resilient LLM calls
    return retryAsync(
      () => this.geminiCall(modelName, prompt, systemPrompt, maxTokens),
      { ...LLM_RETRY_OPTIONS, label: `think-${tier}` }
    );
  }

  /** Multi-turn chat — used by agent loop for conversation history */
  async chat(options: ChatOptions): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const { systemPrompt, messages, tier = 'sonnet', maxTokens = 2048 } = options;
    const modelName = GEMINI_MODELS[tier] || GEMINI_MODELS.flash;

    // Use retry wrapper for resilient LLM calls
    return retryAsync(
      async () => {
        const gemini = await this.getGeminiClient();
        const model = gemini.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
        });

        const contents = messages.map((m) => ({
          role: m.role,
          parts: [
            { text: m.text },
            ...(m.images || []).map(img => ({
              inlineData: { data: img.base64, mimeType: img.mimeType },
            })),
          ],
        }));

        const result = await model.generateContent({
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        });

        const usage = result.response.usageMetadata;
        return {
          text: result.response.text(),
          inputTokens: usage?.promptTokenCount || 0,
          outputTokens: usage?.candidatesTokenCount || 0,
        };
      },
      { ...LLM_RETRY_OPTIONS, label: `chat-${tier}` }
    );
  }

  /** Streaming multi-turn chat — yields text chunks as they arrive from Gemini */
  chatStream(options: ChatOptions): ChatStreamResult {
    const { systemPrompt, messages, tier = 'sonnet', maxTokens = 2048 } = options;
    const modelName = GEMINI_MODELS[tier] || GEMINI_MODELS.flash;

    let inputTokens = 0;
    let outputTokens = 0;
    let retryCount = 0;
    const maxRetries = LLM_RETRY_OPTIONS.attempts || 3;

    const self = this;
    async function* generate(): AsyncGenerator<ChatStreamChunk> {
      while (retryCount < maxRetries) {
        try {
          const gemini = await self.getGeminiClient();
          const model = gemini.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
          });

          const contents = messages.map((m) => ({
            role: m.role,
            parts: [
              { text: m.text },
              ...(m.images || []).map(img => ({
                inlineData: { data: img.base64, mimeType: img.mimeType },
              })),
            ],
          }));

          const result = await model.generateContentStream({
            contents,
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

            logger.warn('Brain: retrying stream', {
              attempt: retryCount,
              maxAttempts: maxRetries,
              delayMs: delay,
              error: formatErrorMessage(err),
            });

            await new Promise((r) => setTimeout(r, delay));
            continue; // Retry
          }

          // No more retries, throw
          logger.error('Brain.chatStream error', { tier, error: err.message, attempts: retryCount });
          throw err;
        }
      }
    }

    return {
      stream: generate(),
      getUsage: () => ({ inputTokens, outputTokens }),
    };
  }

  private async geminiCall(modelName: string, prompt: string, systemPrompt?: string, maxTokens = 1024): Promise<string> {
    const gemini = await this.getGeminiClient();
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

  selectTier(intentType: string): ModelTier {
    // Level 0: No AI needed
    const noAi = ['docker_command', 'file_read', 'cron_set', 'status_check', 'direct_execute', 'shell_command', 'system_monitor', 'file_operation', 'service_management'];
    if (noAi.includes(intentType)) return 'none';

    // Level 1: Cheap model
    const cheap = ['classify', 'summarize', 'parse_message', 'simple_answer', 'format'];
    if (cheap.includes(intentType)) return 'flash';

    // Level 2: Mid model
    const mid = ['research', 'analyze', 'code_review', 'write_content', 'debug'];
    if (mid.includes(intentType)) return 'sonnet';

    // Level 3: Powerful model (rare)
    const strong = ['complex_plan', 'architecture', 'multi_step_reasoning'];
    if (strong.includes(intentType)) return 'opus';

    return 'flash'; // Default to cheapest
  }
}
