/**
 * ProviderManager — Orchestrates AI providers.
 * Manages Kimi and Claude providers.
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
import { KimiProvider } from './kimi.js';
import { ClaudeProvider } from './claude.js';
import { logger } from '../logger.js';

export class ProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private fallbackOrder: string[] = [];
  private redis: Redis | null = null;

  constructor(redis?: Redis) {
    this.redis = redis ?? null;

    const kimi = new KimiProvider(redis);
    this.providers.set('kimi', kimi);

    const claude = new ClaudeProvider(redis);
    this.providers.set('claude', claude);

    this.fallbackOrder = ['kimi', 'claude'];
  }

  /**
   * Initialize provider order from config.
   * Call after construction to load primary_provider preference from Redis.
   */
  async init(): Promise<void> {
    if (!this.redis) return;

    try {
      // Read primary_provider from Redis config (set by API or ConfigManager)
      // Try individual key first (set by PUT /api/provider/primary), then fall back to config blob
      let primary = await this.redis.get('liv:config:primary_provider');

      if (!primary) {
        // Try reading from the NexusConfig JSON blob
        const configBlob = await this.redis.get('liv:config');
        if (configBlob) {
          try {
            const config = JSON.parse(configBlob);
            primary = config.provider?.primaryProvider;
          } catch { /* ignore parse errors */ }
        }
      }

      if (primary && this.providers.has(primary)) {
        const secondary = primary === 'claude' ? 'kimi' : 'claude';
        this.fallbackOrder = [primary, secondary].filter((id) => this.providers.has(id));
        logger.info('ProviderManager: fallback order set from config', { order: this.fallbackOrder });
      } else {
        logger.info('ProviderManager: using default fallback order', { order: this.fallbackOrder });
      }
    } catch (err: any) {
      logger.warn('ProviderManager: failed to read config, using default order', { error: err.message });
    }
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
    if (status === 401 || status === 403 || status === 429 || status === 503 || status === 502 || status === 529) return true;

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
    return 'kimi'; // fallback default
  }

  setFallbackOrder(order: string[]): void {
    this.fallbackOrder = order.filter((id) => this.providers.has(id));
  }

  getFallbackOrder(): string[] {
    return [...this.fallbackOrder];
  }
}
