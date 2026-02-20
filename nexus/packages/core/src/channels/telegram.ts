import { Bot, Context } from 'grammy';
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

export class TelegramProvider implements ChannelProvider {
  readonly id = 'telegram' as const;
  readonly name = 'Telegram';

  private redis: Redis | null = null;
  private bot: Bot | null = null;
  private config: ChannelConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private pollingActive = false;
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
        logger.warn('TelegramProvider: invalid config in Redis');
      }
    }
  }

  async updateConfig(config: ChannelConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    if (this.redis) {
      await this.redis.set(`${getRedisPrefix(this.id)}:config`, JSON.stringify(this.config));
    }

    // Reconnect if token changed and enabled
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
      // Create bot instance
      this.bot = new Bot(this.config.token);

      // Get bot info
      const me = await this.bot.api.getMe();
      this.status = {
        enabled: true,
        connected: true,
        botName: me.username,
        botId: String(me.id),
        lastConnect: new Date().toISOString(),
      };

      // Setup message handler
      this.bot.on('message:text', async (ctx: Context) => {
        if (!this.messageHandler) return;

        const msg = ctx.message;
        if (!msg || !msg.text) return;

        // ── Deduplication: skip already-processed messages ──
        const msgUpdateId = ctx.update.update_id;
        if (this.redis) {
          const dedupKey = `nexus:telegram:dedup:${msgUpdateId}`;
          const already = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
          if (!already) {
            // NX returned null → key existed → already processed
            logger.info('TelegramProvider: duplicate skipped', { updateId: msgUpdateId });
            return;
          }
        }

        // Persist polling offset for restart recovery (even for stale/skipped messages)
        if (this.redis) {
          await this.redis.set('nexus:telegram:offset', String(msgUpdateId + 1)).catch((err: any) => {
            logger.warn('TelegramProvider: failed to persist offset', { error: err.message });
          });
        }

        // ── Drop stale messages (older than 2 minutes) ──
        const msgAge = Date.now() - msg.date * 1000;
        if (msgAge > 120_000) {
          logger.info('TelegramProvider: stale message dropped', {
            updateId: msgUpdateId,
            ageMs: msgAge,
            text: msg.text.slice(0, 50),
          });
          return;
        }

        const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
        const userName = msg.from?.username || msg.from?.first_name || 'Unknown';

        // In groups, only respond if mentioned
        if (isGroup) {
          const botUsername = this.status.botName;
          if (botUsername && !msg.text.includes(`@${botUsername}`)) {
            return;
          }
        }

        // ── DM Pairing: check unknown DM users ──
        if (!isGroup && this.dmPairing) {
          const result = await this.dmPairing.checkAndInitiatePairing(
            'telegram',
            String(msg.from?.id || 0),
            userName,
            String(msg.chat.id),
          );
          if (!result.allowed) {
            if (result.message) {
              try {
                await ctx.reply(result.message);
              } catch (replyErr: any) {
                logger.error('TelegramProvider: failed to send pairing message', { error: replyErr.message });
              }
            }
            return; // Do NOT pass to handler
          }
        }

        const incomingMsg: IncomingMessage = {
          channel: 'telegram',
          chatId: String(msg.chat.id),
          userId: String(msg.from?.id || 0),
          userName,
          text: msg.text.replace(/@\w+/g, '').trim(), // Remove mentions
          timestamp: msg.date * 1000,
          isGroup,
          groupName: isGroup ? ('title' in msg.chat ? msg.chat.title : undefined) : undefined,
          replyToMessageId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
        };

        try {
          // Send typing indicator
          await ctx.replyWithChatAction('typing');
          await this.messageHandler(incomingMsg);
        } catch (err: any) {
          logger.error('TelegramProvider: message handler error', { error: err.message });
        }
      });

      // Error handler
      this.bot.catch((err) => {
        logger.error('TelegramProvider: bot error', { error: err.message });
        this.status.error = err.message;
        this.saveStatus().catch(() => {});
      });

      // Load persisted polling offset from Redis for restart recovery
      let pollingOffset: number | undefined;
      if (this.redis) {
        const savedOffset = await this.redis.get('nexus:telegram:offset');
        if (savedOffset) {
          pollingOffset = parseInt(savedOffset, 10);
          if (isNaN(pollingOffset)) pollingOffset = undefined;
          else logger.info('TelegramProvider: restored polling offset', { offset: pollingOffset });
        }
      }

      // Start polling
      this.pollingActive = true;
      this.bot.start({
        onStart: () => {
          logger.info('TelegramProvider: polling started', { botName: this.status.botName });
        },
        ...(pollingOffset ? { offset: pollingOffset } : {}),
      });

      await this.saveStatus();
      logger.info('TelegramProvider: connected', { botName: this.status.botName });
    } catch (err: any) {
      this.status = {
        enabled: true,
        connected: false,
        error: err.message,
      };
      await this.saveStatus();
      logger.error('TelegramProvider: connection failed', { error: err.message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.bot && this.pollingActive) {
      try {
        await this.bot.stop();
      } catch {
        // Ignore stop errors
      }
      this.pollingActive = false;
    }
    this.bot = null;
    this.status.connected = false;
    await this.saveStatus();
    logger.info('TelegramProvider: disconnected');
  }

  async getStatus(): Promise<ChannelStatus> {
    return { ...this.status };
  }

  private async saveStatus(): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(`${getRedisPrefix(this.id)}:status`, JSON.stringify(this.status));
  }

  async sendMessage(chatId: string, text: string, replyTo?: string): Promise<boolean> {
    if (!this.bot || !this.status.connected) {
      logger.warn('TelegramProvider: cannot send, not connected');
      return false;
    }

    try {
      const chunks = chunkText(text, CHANNEL_META.telegram.textLimit);

      for (const chunk of chunks) {
        try {
          // Try with Markdown first
          await this.bot.api.sendMessage(chatId, chunk, {
            reply_to_message_id: replyTo ? parseInt(replyTo, 10) : undefined,
            parse_mode: 'Markdown',
          });
        } catch (parseErr: any) {
          // If Markdown parsing fails, retry without parse_mode
          if (parseErr.message?.includes("can't parse entities")) {
            logger.warn('TelegramProvider: Markdown parse failed, retrying as plain text');
            await this.bot.api.sendMessage(chatId, chunk, {
              reply_to_message_id: replyTo ? parseInt(replyTo, 10) : undefined,
            });
          } else {
            throw parseErr;
          }
        }
        // Small delay between chunks
        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      this.status.lastMessage = new Date().toISOString();
      await this.saveStatus();
      return true;
    } catch (err: any) {
      logger.error('TelegramProvider: send failed', { chatId, error: err.message });
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
      const testBot = new Bot(this.config.token);
      const me = await testBot.api.getMe();
      return { ok: true, botName: me.username };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
