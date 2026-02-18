/**
 * Nexus Configuration Manager
 * Handles config persistence via Redis and environment variables.
 */

import { Redis } from 'ioredis';
import { NexusConfigSchema, NexusConfig, DEFAULT_NEXUS_CONFIG } from './schema.js';
import { logger } from '../logger.js';

const REDIS_CONFIG_KEY = 'nexus:config';
const REDIS_CONFIG_VERSION_KEY = 'nexus:config:version';

export class ConfigManager {
  private redis: Redis;
  private config: NexusConfig;
  private initialized = false;

  constructor(redis: Redis) {
    this.redis = redis;
    this.config = { ...DEFAULT_NEXUS_CONFIG };
  }

  /**
   * Initialize config from Redis + environment variables
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load from Redis
      const stored = await this.redis.get(REDIS_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const validated = NexusConfigSchema.safeParse(parsed);
        if (validated.success) {
          this.config = this.mergeConfigs(DEFAULT_NEXUS_CONFIG, validated.data);
          logger.info('ConfigManager: loaded config from Redis');
        } else {
          logger.warn('ConfigManager: invalid stored config, using defaults', {
            errors: validated.error.errors.slice(0, 3),
          });
        }
      }

      // Override with environment variables
      this.applyEnvOverrides();

      this.initialized = true;
      logger.info('ConfigManager: initialized', {
        version: this.config.version,
        agentMaxTurns: this.config.agent?.maxTurns,
        retryEnabled: this.config.retry?.enabled,
      });
    } catch (err) {
      logger.error('ConfigManager: init error', { error: (err as Error).message });
      // Continue with defaults
      this.initialized = true;
    }
  }

  /**
   * Get current config
   */
  get(): NexusConfig {
    return this.config;
  }

  /**
   * Get a specific config section
   */
  getSection<K extends keyof NexusConfig>(key: K): NexusConfig[K] {
    return this.config[key];
  }

  /**
   * Update config (partial update)
   */
  async update(partial: Partial<NexusConfig>): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const merged = this.mergeConfigs(this.config, partial as NexusConfig);
      merged.updatedAt = new Date().toISOString();

      const validated = NexusConfigSchema.safeParse(merged);
      if (!validated.success) {
        return {
          success: false,
          errors: validated.error.issues.map((e: { path: (string | number)[]; message: string }) => `${e.path.join('.')}: ${e.message}`),
        };
      }

      this.config = validated.data;
      await this.persist();

      logger.info('ConfigManager: config updated', { keys: Object.keys(partial) });
      return { success: true };
    } catch (err) {
      logger.error('ConfigManager: update error', { error: (err as Error).message });
      return { success: false, errors: [(err as Error).message] };
    }
  }

  /**
   * Reset to defaults
   */
  async reset(): Promise<void> {
    this.config = { ...DEFAULT_NEXUS_CONFIG, updatedAt: new Date().toISOString() };
    await this.persist();
    logger.info('ConfigManager: reset to defaults');
  }

  /**
   * Persist config to Redis
   */
  private async persist(): Promise<void> {
    await this.redis.set(REDIS_CONFIG_KEY, JSON.stringify(this.config));
    await this.redis.set(REDIS_CONFIG_VERSION_KEY, this.config.version || '1.0.0');
  }

  /**
   * Deep merge two configs
   */
  private mergeConfigs(base: NexusConfig, overrides: Partial<NexusConfig>): NexusConfig {
    const result = { ...base };

    for (const key of Object.keys(overrides) as Array<keyof NexusConfig>) {
      const override = overrides[key];
      if (override === undefined) continue;

      if (typeof override === 'object' && override !== null && !Array.isArray(override)) {
        // Deep merge objects
        (result as any)[key] = {
          ...(base[key] as object || {}),
          ...(override as object),
        };
      } else {
        // Direct assignment for primitives and arrays
        (result as any)[key] = override;
      }
    }

    return result;
  }

  /**
   * Apply environment variable overrides
   * Uses type assertions because Zod inferred types have optional properties
   * even when defaults are provided.
   */
  private applyEnvOverrides(): void {
    const env = process.env;

    // Ensure all sections exist with defaults
    if (!this.config.agent) {
      this.config.agent = { ...DEFAULT_NEXUS_CONFIG.agent } as NonNullable<NexusConfig['agent']>;
    }
    if (!this.config.retry) {
      this.config.retry = { ...DEFAULT_NEXUS_CONFIG.retry } as NonNullable<NexusConfig['retry']>;
    }
    if (!this.config.logging) {
      this.config.logging = { ...DEFAULT_NEXUS_CONFIG.logging } as NonNullable<NexusConfig['logging']>;
    }
    if (!this.config.api) {
      this.config.api = { ...DEFAULT_NEXUS_CONFIG.api } as NonNullable<NexusConfig['api']>;
    }

    // Agent settings
    if (env.NEXUS_AGENT_MAX_TURNS) {
      this.config.agent!.maxTurns = parseInt(env.NEXUS_AGENT_MAX_TURNS, 10);
    }
    if (env.NEXUS_AGENT_MAX_TOKENS) {
      this.config.agent!.maxTokens = parseInt(env.NEXUS_AGENT_MAX_TOKENS, 10);
    }
    if (env.NEXUS_AGENT_TIMEOUT_MS) {
      this.config.agent!.timeoutMs = parseInt(env.NEXUS_AGENT_TIMEOUT_MS, 10);
    }
    if (env.NEXUS_AGENT_TIER) {
      this.config.agent!.tier = env.NEXUS_AGENT_TIER as 'none' | 'flash' | 'haiku' | 'sonnet' | 'opus';
    }

    // Retry settings
    if (env.NEXUS_RETRY_ENABLED !== undefined) {
      this.config.retry!.enabled = env.NEXUS_RETRY_ENABLED === 'true';
    }
    if (env.NEXUS_RETRY_ATTEMPTS) {
      this.config.retry!.attempts = parseInt(env.NEXUS_RETRY_ATTEMPTS, 10);
    }

    // Logging
    if (env.NEXUS_LOG_LEVEL) {
      this.config.logging!.level = env.NEXUS_LOG_LEVEL as 'info' | 'debug' | 'warn' | 'error' | 'silent' | 'fatal' | 'trace';
    }

    // API port
    if (env.NEXUS_API_PORT) {
      this.config.api!.port = parseInt(env.NEXUS_API_PORT, 10);
    }
  }

  /**
   * Export config for UI display (without sensitive data)
   */
  exportForUI(): NexusConfig {
    return { ...this.config };
  }

  /**
   * Validate a partial config without saving
   */
  validate(partial: Partial<NexusConfig>): { valid: boolean; errors?: string[] } {
    try {
      const merged = this.mergeConfigs(this.config, partial as NexusConfig);
      const validated = NexusConfigSchema.safeParse(merged);
      if (validated.success) {
        return { valid: true };
      }
      return {
        valid: false,
        errors: validated.error.issues.map((e: { path: (string | number)[]; message: string }) => `${e.path.join('.')}: ${e.message}`),
      };
    } catch (err) {
      return { valid: false, errors: [(err as Error).message] };
    }
  }
}

export default ConfigManager;
