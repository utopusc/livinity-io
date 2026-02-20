import { Client, GatewayIntentBits, Events, Message, TextChannel } from 'discord.js';
import type Redis from 'ioredis';
import { logger } from '../logger.js';
import type { DmPairingManager } from '../dm-pairing.js';
import type {
  ChannelProvider,
  ChannelConfig,
  ChannelStatus,
  IncomingMessage,
} from './types.js';
import { chunkText, CHANNEL_META, getRedisPrefix } from './types.js';

export class DiscordProvider implements ChannelProvider {
  readonly id = 'discord' as const;
  readonly name = 'Discord';

  private redis: Redis | null = null;
  private client: Client | null = null;
  private config: ChannelConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private dmPairing: DmPairingManager | null = null;

  setDmPairing(manager: DmPairingManager): void {
    this.dmPairing = manager;
  }

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
        logger.warn('DiscordProvider: invalid config in Redis');
      }
    }
  }

  async updateConfig(config: ChannelConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    if (this.redis) {
      await this.redis.set(`${getRedisPrefix(this.id)}:config`, JSON.stringify(this.config));
    }

    if (config.token && this.config.enabled) {
      await this.disconnect();
      await this.connect();
    } else if (!this.config.enabled) {
      await this.disconnect();
    }
  }

  async connect(): Promise<void> {
    if (!this.config.enabled || !this.config.token) {
      this.status = { enabled: false, connected: false, error: 'Not configured' };
      await this.saveStatus();
      return;
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      });

      // Ready event
      this.client.once(Events.ClientReady, async (readyClient) => {
        this.status = {
          enabled: true,
          connected: true,
          botName: readyClient.user.username,
          botId: readyClient.user.id,
          lastConnect: new Date().toISOString(),
        };
        await this.saveStatus();
        logger.info('DiscordProvider: connected', { botName: this.status.botName });
      });

      // Message event
      this.client.on(Events.MessageCreate, async (message: Message) => {
        if (!this.messageHandler) return;
        if (message.author.bot) return; // Ignore bot messages

        const isGuild = message.guild !== null;
        const botMention = this.client?.user ? `<@${this.client.user.id}>` : '';

        // In guilds, only respond if mentioned
        if (isGuild && !message.mentions.has(this.client!.user!)) {
          return;
        }

        // Remove bot mention from message
        let text = message.content;
        if (botMention) {
          text = text.replace(new RegExp(`<@!?${this.client!.user!.id}>`, 'g'), '').trim();
        }

        if (!text) return;

        // ── DM Pairing: check unknown DM users ──
        if (!isGuild && this.dmPairing) {
          const result = await this.dmPairing.checkAndInitiatePairing(
            'discord',
            message.author.id,
            message.author.username,
            message.channelId,
          );
          if (!result.allowed) {
            if (result.message) {
              try {
                await message.reply(result.message);
              } catch (replyErr: any) {
                logger.error('DiscordProvider: failed to send pairing message', { error: replyErr.message });
              }
            }
            return; // Do NOT pass to handler
          }
        }

        const incomingMsg: IncomingMessage = {
          channel: 'discord',
          chatId: message.channelId,
          userId: message.author.id,
          userName: message.author.username,
          text,
          timestamp: message.createdTimestamp,
          isGroup: isGuild,
          groupName: message.guild?.name,
          replyToMessageId: message.reference?.messageId,
        };

        try {
          // Send typing indicator
          if (message.channel.isTextBased() && 'sendTyping' in message.channel) {
            await message.channel.sendTyping();
          }
          await this.messageHandler(incomingMsg);
        } catch (err: any) {
          logger.error('DiscordProvider: message handler error', { error: err.message });
        }
      });

      // Error handling
      this.client.on(Events.Error, (error) => {
        logger.error('DiscordProvider: client error', { error: error.message });
        this.status.error = error.message;
        this.saveStatus().catch(() => {});
      });

      // Login
      await this.client.login(this.config.token);
    } catch (err: any) {
      this.status = {
        enabled: true,
        connected: false,
        error: err.message,
      };
      await this.saveStatus();
      logger.error('DiscordProvider: connection failed', { error: err.message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch {
        // Ignore destroy errors
      }
    }
    this.client = null;
    this.status.connected = false;
    await this.saveStatus();
    logger.info('DiscordProvider: disconnected');
  }

  async getStatus(): Promise<ChannelStatus> {
    return { ...this.status };
  }

  private async saveStatus(): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(`${getRedisPrefix(this.id)}:status`, JSON.stringify(this.status));
  }

  async sendMessage(chatId: string, text: string, replyTo?: string): Promise<boolean> {
    if (!this.client || !this.status.connected) {
      logger.warn('DiscordProvider: cannot send, not connected');
      return false;
    }

    try {
      const channel = await this.client.channels.fetch(chatId);
      if (!channel || !channel.isTextBased()) {
        logger.warn('DiscordProvider: channel not found or not text-based', { chatId });
        return false;
      }

      const textChannel = channel as TextChannel;
      const chunks = chunkText(text, CHANNEL_META.discord.textLimit);

      for (const chunk of chunks) {
        await textChannel.send({
          content: chunk,
          reply: replyTo ? { messageReference: replyTo } : undefined,
        });
        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      this.status.lastMessage = new Date().toISOString();
      await this.saveStatus();
      return true;
    } catch (err: any) {
      logger.error('DiscordProvider: send failed', { chatId, error: err.message });
      return false;
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (!this.config.token) {
      return { ok: false, error: 'No token configured' };
    }

    try {
      // Use REST API to validate token
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${this.config.token}` },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        return { ok: false, error: error.message || `HTTP ${response.status}` };
      }

      const user = await response.json();
      return { ok: true, botName: user.username };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
