/**
 * ProviderManager — Orchestrates AI providers with automatic fallback.
 * Claude is primary, Gemini is fallback on 429/503/timeout errors.
 */

import type { Redis } from 'ioredis';
import type {
  AIProvider,
  ProviderChatOptions,
  ProviderChatResult,
  ProviderStreamResult,
  ProviderStreamChunk,
  ModelTier,
} from './types.js';
import { ClaudeProvider } from './claude.js';
import { GeminiProvider } from './gemini.js';
import { logger } from '../logger.js';

export class ProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private fallbackOrder: string[] = [];

  constructor(redis?: Redis) {
    const claude = new ClaudeProvider(redis);
    const gemini = new GeminiProvider(redis);
    this.providers.set('claude', claude);
    this.providers.set('gemini', gemini);
    this.fallbackOrder = ['claude', 'gemini'];
  }

  async chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
    const errors: Array<{ provider: string; error: Error }> = [];

    for (const providerId of this.fallbackOrder) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      const available = await provider.isAvailable();
      if (!available) {
        logger.debug(`ProviderManager: ${providerId} not available, skipping`);
        continue;
      }

      try {
        const result = await provider.chat(options);
        if (errors.length > 0) {
          logger.warn('ProviderManager: fell back to alternate provider', {
            primary: errors[0]?.provider,
            fallback: providerId,
            reason: errors[0]?.error?.message,
          });
        }
        return result;
      } catch (err: any) {
        errors.push({ provider: providerId, error: err });

        if (this.isFallbackableError(err)) {
          logger.warn(`ProviderManager: ${providerId} failed with fallbackable error, trying next`, {
            error: err.message,
            status: err.status,
          });
          continue;
        }

        // Non-fallbackable error -- don't try next provider
        throw err;
      }
    }

    const lastError = errors[errors.length - 1]?.error;
    throw lastError || new Error('No AI providers available');
  }

  chatStream(options: ProviderChatOptions): ProviderStreamResult {
    let usageGetter: (() => { inputTokens: number; outputTokens: number }) | null = null;
    let resolvedProvider = '';
    let resolvedModel = '';
    const self = this;

    async function* generateWithFallback(): AsyncGenerator<ProviderStreamChunk> {
      const errors: Array<{ provider: string; error: Error }> = [];

      for (const providerId of self.fallbackOrder) {
        const provider = self.providers.get(providerId);
        if (!provider) continue;

        const available = await provider.isAvailable();
        if (!available) continue;

        let hasYielded = false;
        try {
          const result = provider.chatStream(options);
          resolvedProvider = result.provider;
          resolvedModel = result.model;
          usageGetter = result.getUsage;

          for await (const chunk of result.stream) {
            hasYielded = true;
            yield chunk;
          }
          return; // Success
        } catch (err: any) {
          if (hasYielded) {
            logger.error('ProviderManager: stream failed after partial delivery, cannot fall back', {
              provider: providerId,
              error: err.message,
            });
            throw err;
          }

          errors.push({ provider: providerId, error: err });
          if (self.isFallbackableError(err)) {
            logger.warn(`ProviderManager: ${providerId} stream failed before any chunks, trying next`, {
              error: err.message,
            });
            continue;
          }
          throw err;
        }
      }

      const lastError = errors[errors.length - 1]?.error;
      throw lastError || new Error('No AI providers available');
    }

    return {
      stream: generateWithFallback(),
      getUsage: () => usageGetter ? usageGetter() : { inputTokens: 0, outputTokens: 0 },
      get provider() { return resolvedProvider; },
      get model() { return resolvedModel; },
    };
  }

  async think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string> {
    const errors: Array<{ provider: string; error: Error }> = [];

    for (const providerId of this.fallbackOrder) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      const available = await provider.isAvailable();
      if (!available) continue;

      try {
        return await provider.think(options);
      } catch (err: any) {
        errors.push({ provider: providerId, error: err });
        if (this.isFallbackableError(err)) {
          logger.warn(`ProviderManager: ${providerId} think failed, trying next`, { error: err.message });
          continue;
        }
        throw err;
      }
    }

    const lastError = errors[errors.length - 1]?.error;
    throw lastError || new Error('No AI providers available');
  }

  private isFallbackableError(err: any): boolean {
    const status = err.status || err.statusCode;
    if (status === 429 || status === 503 || status === 502 || status === 529) return true;

    const message = err.message?.toLowerCase() || '';
    if (message.includes('timeout') || message.includes('econnreset') || message.includes('socket hang up') ||
        message.includes('fetch failed') || message.includes('econnrefused') || message.includes('overloaded')) {
      return true;
    }

    return false;
  }

  getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  async listProviders(): Promise<Array<{ id: string; available: boolean }>> {
    const results: Array<{ id: string; available: boolean }> = [];
    for (const [id, provider] of this.providers) {
      const available = await provider.isAvailable();
      results.push({ id, available });
    }
    return results;
  }

  /** Get the first available provider ID without making an API call */
  async getActiveProviderId(): Promise<string> {
    for (const providerId of this.fallbackOrder) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;
      const available = await provider.isAvailable();
      if (available) return providerId;
    }
    return 'gemini'; // fallback default
  }

  setFallbackOrder(order: string[]): void {
    this.fallbackOrder = order.filter((id) => this.providers.has(id));
  }
}
