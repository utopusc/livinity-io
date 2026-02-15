import { App, LogLevel } from '@slack/bolt';
import type Redis from 'ioredis';
import { logger } from '../logger.js';
import type {
  ChannelProvider,
  ChannelConfig,
  ChannelStatus,
  IncomingMessage,
} from './types.js';
import { chunkText, CHANNEL_META, getRedisPrefix } from './types.js';

export class SlackProvider implements ChannelProvider {
  readonly id = 'slack' as const;
  readonly name = 'Slack';

  private redis: Redis | null = null;
  private app: App | null = null;
  private config: ChannelConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;

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
        logger.warn('SlackProvider: invalid config in Redis');
      }
    }
  }

  async updateConfig(config: ChannelConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    if (this.redis) {
      await this.redis.set(`${getRedisPrefix(this.id)}:config`, JSON.stringify(this.config));
    }
    if (config.token && config.appToken && this.config.enabled) {
      await this.disconnect();
      await this.connect();
    } else if (!this.config.enabled) {
      await this.disconnect();
    }
  }

  async connect(): Promise<void> {
    if (!this.config.enabled || !this.config.token || !this.config.appToken) {
      this.status = { enabled: false, connected: false, error: 'Not configured (need bot token + app token)' };
      await this.saveStatus();
      return;
    }

    try {
      this.app = new App({
        token: this.config.token,        // Bot token (xoxb-...)
        appToken: this.config.appToken,  // App-level token (xapp-...)
        socketMode: true,
        logLevel: LogLevel.WARN,
      });

      // Listen for messages
      this.app.message(async ({ message, say }) => {
        if (!this.messageHandler) return;
        // Skip bot messages and message_changed events
        if ((message as any).subtype) return;
        const msg = message as any;
        if (!msg.text || msg.bot_id) return;

        const incoming: IncomingMessage = {
          channel: 'slack',
          chatId: msg.channel,
          userId: msg.user || 'unknown',
          userName: msg.user, // Will be Slack user ID; display name requires API call
          text: msg.text,
          timestamp: Math.floor(parseFloat(msg.ts || '0') * 1000),
          replyToMessageId: msg.thread_ts,
          isGroup: msg.channel_type === 'group' || msg.channel_type === 'channel',
        };

        // Save last chat ID for heartbeat delivery
        if (this.redis) {
          await this.redis.set(`nexus:slack:last_chat_id`, msg.channel);
        }

        await this.messageHandler(incoming);
      });

      await this.app.start();

      // Get bot info
      const authResult = await this.app.client.auth.test({ token: this.config.token });

      this.status = {
        enabled: true,
        connected: true,
        botName: (authResult as any).bot_id || (authResult as any).user,
        botId: (authResult as any).user_id,
        lastConnect: new Date().toISOString(),
      };

      await this.saveStatus();
      logger.info('SlackProvider: connected via Socket Mode', { bot: this.status.botName });
    } catch (err: any) {
      this.status = {
        enabled: true,
        connected: false,
        error: err.message || 'Connection failed',
      };
      await this.saveStatus();
      logger.error('SlackProvider: connection failed', { error: err.message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.app) {
      try {
        await this.app.stop();
      } catch {
        // Ignore stop errors
      }
      this.app = null;
    }
    this.status = { ...this.status, connected: false };
    await this.saveStatus();
  }

  async getStatus(): Promise<ChannelStatus> {
    return this.status;
  }

  async sendMessage(chatId: string, text: string, replyTo?: string): Promise<boolean> {
    if (!this.app || !this.status.connected) return false;

    try {
      const chunks = chunkText(text, CHANNEL_META.slack.textLimit);
      for (const chunk of chunks) {
        await this.app.client.chat.postMessage({
          token: this.config.token,
          channel: chatId,
          text: chunk,
          ...(replyTo ? { thread_ts: replyTo } : {}),
        });
      }
      return true;
    } catch (err: any) {
      logger.error('SlackProvider: send failed', { error: err.message, chatId });
      return false;
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (!this.config.token || !this.config.appToken) {
      return { ok: false, error: 'Bot token and app-level token required' };
    }

    try {
      const testApp = new App({
        token: this.config.token,
        appToken: this.config.appToken,
        socketMode: true,
        logLevel: LogLevel.ERROR,
      });
      const authResult = await testApp.client.auth.test({ token: this.config.token });
      await testApp.stop().catch(() => {});
      return {
        ok: true,
        botName: (authResult as any).user || (authResult as any).bot_id,
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
