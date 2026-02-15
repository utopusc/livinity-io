import * as sdk from 'matrix-js-sdk';
import type Redis from 'ioredis';
import { logger } from '../logger.js';
import type {
  ChannelProvider,
  ChannelConfig,
  ChannelStatus,
  IncomingMessage,
} from './types.js';
import { chunkText, CHANNEL_META, getRedisPrefix } from './types.js';

export class MatrixProvider implements ChannelProvider {
  readonly id = 'matrix' as const;
  readonly name = 'Matrix';

  private redis: Redis | null = null;
  private client: sdk.MatrixClient | null = null;
  private config: ChannelConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private botUserId: string = '';

  async init(redis: Redis): Promise<void> {
    this.redis = redis;
    await this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    if (!this.redis) return;
    const configStr = await this.redis.get(`${getRedisPrefix(this.id)}:config`);
    if (configStr) {
      try {
        this.config = JSON.parse(configStr);
      } catch {
        logger.warn('MatrixProvider: invalid config in Redis');
      }
    }
  }

  async updateConfig(config: ChannelConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    if (this.redis) {
      await this.redis.set(`${getRedisPrefix(this.id)}:config`, JSON.stringify(this.config));
    }
    if (config.token && config.homeserverUrl && this.config.enabled) {
      await this.disconnect();
      await this.connect();
    } else if (!this.config.enabled) {
      await this.disconnect();
    }
  }

  async connect(): Promise<void> {
    if (!this.config.enabled || !this.config.token || !this.config.homeserverUrl) {
      this.status = { enabled: false, connected: false, error: 'Not configured (need homeserver URL + access token)' };
      await this.saveStatus();
      return;
    }

    try {
      this.client = sdk.createClient({
        baseUrl: this.config.homeserverUrl,
        accessToken: this.config.token,
        userId: '', // Will be populated after whoami
      });

      // Get bot user ID
      const whoami = await this.client.whoami();
      this.botUserId = whoami.user_id;

      // Listen for room messages
      this.client.on(sdk.RoomEvent.Timeline, (event: sdk.MatrixEvent, room: sdk.Room | undefined, toStartOfTimeline: boolean | undefined) => {
        if (toStartOfTimeline) return; // Skip historical messages
        if (event.getType() !== 'm.room.message') return;
        if (event.getSender() === this.botUserId) return; // Skip own messages

        const content = event.getContent();
        if (!content.body || content.msgtype !== 'm.text') return;

        // Only process messages from configured room(s)
        const roomId = room?.roomId || event.getRoomId();
        if (this.config.roomId && roomId !== this.config.roomId) return;

        if (!this.messageHandler) return;

        const incoming: IncomingMessage = {
          channel: 'matrix',
          chatId: roomId || '',
          userId: event.getSender() || 'unknown',
          userName: event.getSender()?.split(':')[0].replace('@', ''),
          text: content.body,
          timestamp: event.getTs() || Date.now(),
          isGroup: true, // Matrix rooms are always "group" context
        };

        // Save last chat ID for heartbeat delivery
        if (this.redis && roomId) {
          this.redis.set(`nexus:matrix:last_chat_id`, roomId).catch(() => {});
        }

        this.messageHandler(incoming).catch(err => {
          logger.error('MatrixProvider: message handler error', { error: err.message });
        });
      });

      // Start syncing - use limited initial sync to avoid processing old messages
      await this.client.startClient({ initialSyncLimit: 0 });

      this.status = {
        enabled: true,
        connected: true,
        botName: this.botUserId.split(':')[0].replace('@', ''),
        botId: this.botUserId,
        lastConnect: new Date().toISOString(),
      };

      await this.saveStatus();
      logger.info('MatrixProvider: connected', { userId: this.botUserId, homeserver: this.config.homeserverUrl });
    } catch (err: any) {
      this.status = {
        enabled: true,
        connected: false,
        error: err.message || 'Connection failed',
      };
      await this.saveStatus();
      logger.error('MatrixProvider: connection failed', { error: err.message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        this.client.stopClient();
      } catch {
        // Ignore stop errors
      }
      this.client = null;
    }
    this.status = { ...this.status, connected: false };
    await this.saveStatus();
  }

  async getStatus(): Promise<ChannelStatus> {
    return this.status;
  }

  async sendMessage(chatId: string, text: string, _replyTo?: string): Promise<boolean> {
    if (!this.client || !this.status.connected) return false;

    try {
      const chunks = chunkText(text, CHANNEL_META.matrix.textLimit);
      for (const chunk of chunks) {
        await this.client.sendTextMessage(chatId, chunk);
      }
      return true;
    } catch (err: any) {
      logger.error('MatrixProvider: send failed', { error: err.message, chatId });
      return false;
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (!this.config.token || !this.config.homeserverUrl) {
      return { ok: false, error: 'Homeserver URL and access token required' };
    }

    try {
      const testClient = sdk.createClient({
        baseUrl: this.config.homeserverUrl,
        accessToken: this.config.token,
        userId: '',
      });
      const whoami = await testClient.whoami();
      testClient.stopClient();
      return {
        ok: true,
        botName: whoami.user_id.split(':')[0].replace('@', ''),
      };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Test failed' };
    }
  }

  private async saveStatus(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(`${getRedisPrefix(this.id)}:status`, JSON.stringify(this.status));
    } catch {
      // Ignore Redis errors during status save
    }
  }
}
