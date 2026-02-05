import type Redis from 'ioredis';
import { logger } from '../logger.js';
import type { ChannelProvider, ChannelId, IncomingMessage, ChannelStatus, ChannelConfig } from './types.js';
import { TelegramProvider } from './telegram.js';
import { DiscordProvider } from './discord.js';

export * from './types.js';

/**
 * ChannelManager orchestrates all messaging channel providers
 * Handles initialization, connection management, and message routing
 */
export class ChannelManager {
  private redis: Redis | null = null;
  private subRedis: Redis | null = null;
  private providers: Map<ChannelId, ChannelProvider> = new Map();
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  constructor() {
    // Register all providers
    this.providers.set('telegram', new TelegramProvider());
    this.providers.set('discord', new DiscordProvider());
  }

  /**
   * Initialize all providers with Redis connection
   */
  async init(redis: Redis): Promise<void> {
    this.redis = redis;
    logger.info('ChannelManager: initializing providers');

    for (const [id, provider] of this.providers) {
      try {
        await provider.init(redis);
        logger.debug('ChannelManager: initialized provider', { id });
      } catch (err: any) {
        logger.error('ChannelManager: failed to init provider', { id, error: err.message });
      }
    }

    // Subscribe to config updates from UI
    await this.subscribeToConfigUpdates(redis);
  }

  /**
   * Subscribe to Redis pub/sub for config updates
   */
  private async subscribeToConfigUpdates(redis: Redis): Promise<void> {
    // Create a duplicate connection for pub/sub (required by ioredis)
    this.subRedis = redis.duplicate();

    this.subRedis.subscribe('nexus:channel:updated', (err) => {
      if (err) {
        logger.error('ChannelManager: failed to subscribe to config updates', { error: err.message });
      } else {
        logger.info('ChannelManager: subscribed to config updates');
      }
    });

    this.subRedis.on('message', async (channel, message) => {
      if (channel === 'nexus:channel:updated') {
        try {
          const data = JSON.parse(message);
          const channelId = data.channel as ChannelId;
          if (channelId && this.providers.has(channelId)) {
            logger.info('ChannelManager: config update received', { channel: channelId });
            const provider = this.providers.get(channelId)!;

            // Reload config and reconnect
            await provider.disconnect();
            await provider.init(this.redis!);
            await provider.connect();

            // Re-attach message handler
            if (this.messageHandler) {
              provider.onMessage(this.messageHandler);
            }

            const status = await provider.getStatus();
            logger.info('ChannelManager: provider reconnected after config update', {
              channel: channelId,
              connected: status.connected,
              botName: status.botName,
            });
          }
        } catch (err: any) {
          logger.error('ChannelManager: error handling config update', { error: err.message });
        }
      }
    });
  }

  /**
   * Connect all enabled providers
   */
  async connectAll(): Promise<void> {
    logger.info('ChannelManager: connecting all enabled providers');

    const promises = Array.from(this.providers.entries()).map(async ([id, provider]) => {
      try {
        await provider.connect();

        // Set up message handler for this provider
        if (this.messageHandler) {
          provider.onMessage(this.messageHandler);
        }

        const status = await provider.getStatus();
        if (status.connected) {
          logger.info('ChannelManager: provider connected', { id, botName: status.botName });
        }
      } catch (err: any) {
        logger.error('ChannelManager: failed to connect provider', { id, error: err.message });
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Disconnect all providers
   */
  async disconnectAll(): Promise<void> {
    logger.info('ChannelManager: disconnecting all providers');

    // Unsubscribe from config updates
    if (this.subRedis) {
      try {
        await this.subRedis.unsubscribe('nexus:channel:updated');
        await this.subRedis.quit();
      } catch {
        // Ignore
      }
      this.subRedis = null;
    }

    const promises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        await provider.disconnect();
      } catch (err: any) {
        logger.error('ChannelManager: failed to disconnect provider', { error: err.message });
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Get a specific provider
   */
  getProvider(id: ChannelId): ChannelProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all providers
   */
  getAllProviders(): ChannelProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get status of all providers
   */
  async getAllStatus(): Promise<Record<ChannelId, ChannelStatus>> {
    const result: Partial<Record<ChannelId, ChannelStatus>> = {};

    for (const [id, provider] of this.providers) {
      try {
        result[id] = await provider.getStatus();
      } catch (err: any) {
        result[id] = { enabled: false, connected: false, error: err.message };
      }
    }

    return result as Record<ChannelId, ChannelStatus>;
  }

  /**
   * Update config for a specific provider
   */
  async updateProviderConfig(id: ChannelId, config: ChannelConfig): Promise<void> {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Unknown channel: ${id}`);
    }

    await provider.updateConfig(config);

    // Re-attach message handler after reconnect
    if (this.messageHandler) {
      provider.onMessage(this.messageHandler);
    }
  }

  /**
   * Test connection for a specific provider
   */
  async testProvider(id: ChannelId): Promise<{ ok: boolean; error?: string; botName?: string }> {
    const provider = this.providers.get(id);
    if (!provider) {
      return { ok: false, error: `Unknown channel: ${id}` };
    }

    return provider.testConnection();
  }

  /**
   * Send message via a specific channel
   */
  async sendMessage(
    channel: ChannelId,
    chatId: string,
    text: string,
    replyTo?: string
  ): Promise<boolean> {
    const provider = this.providers.get(channel);
    if (!provider) {
      logger.error('ChannelManager: unknown channel', { channel });
      return false;
    }

    return provider.sendMessage(chatId, text, replyTo);
  }

  /**
   * Set the global message handler for all providers
   */
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;

    // Apply to all providers
    for (const provider of this.providers.values()) {
      provider.onMessage(handler);
    }
  }
}
