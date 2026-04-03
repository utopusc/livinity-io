import makeWASocket, { DisconnectReason } from 'baileys';
import type { WASocket } from 'baileys';
import { Boom } from '@hapi/boom';
import type Redis from 'ioredis';
import { toDataURL as qrToDataURL } from 'qrcode';
import { logger } from '../logger.js';
import { WhatsAppAuthStore } from './whatsapp-auth.js';
import { WhatsAppRateLimiter } from './whatsapp-rate-limiter.js';
import { baileysLogger } from './whatsapp-logger.js';
import type { DmPairingManager } from '../dm-pairing.js';
import type { ApprovalManager } from '../approval-manager.js';
import type {
  ChannelProvider,
  ChannelConfig,
  ChannelStatus,
  IncomingMessage,
} from './types.js';
import { chunkText, CHANNEL_META, getRedisPrefix } from './types.js';

/**
 * WhatsApp channel provider using Baileys (headless WebSocket client).
 *
 * Implements the ChannelProvider interface so WhatsApp messages flow through
 * the same pipeline as Telegram/Discord/Slack/Matrix. Uses Redis-backed
 * auth state so server restarts do not require QR re-scan.
 */
export class WhatsAppProvider implements ChannelProvider {
  readonly id = 'whatsapp' as const;
  readonly name = 'WhatsApp';

  private redis: Redis | null = null;
  private sock: WASocket | null = null;
  private authStore: WhatsAppAuthStore | null = null;
  private rateLimiter: WhatsAppRateLimiter | null = null;
  private config: ChannelConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPhoneNumber: string | null = null;
  private dmPairing: DmPairingManager | null = null;
  private approvalManager: ApprovalManager | null = null;

  // ── Dependency injection (same pattern as TelegramProvider) ──

  setDmPairing(manager: DmPairingManager): void {
    this.dmPairing = manager;
  }

  setApprovalManager(manager: ApprovalManager): void {
    this.approvalManager = manager;
  }

  // ── ChannelProvider interface ──

  async init(redis: Redis): Promise<void> {
    this.redis = redis;
    this.authStore = new WhatsAppAuthStore(redis);
    this.rateLimiter = new WhatsAppRateLimiter(redis);
    await this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    if (!this.redis) return;
    const configStr = await this.redis.get(`${getRedisPrefix(this.id)}:config`);
    if (configStr) {
      try {
        this.config = JSON.parse(configStr);
      } catch {
        logger.warn('WhatsAppProvider: invalid config in Redis');
      }
    }
  }

  /**
   * Connect to WhatsApp. If phoneNumber is provided (first-time pairing),
   * requests a pairing code instead of QR. On reconnect (existing session),
   * connects directly without pairing.
   */
  async connect(force = false, phoneNumber?: string): Promise<void> {
    if (!this.config.enabled) {
      this.status = { enabled: false, connected: false };
      await this.saveStatus();
      return;
    }

    if (!this.authStore) {
      this.status = { enabled: true, connected: false, error: 'Auth store not initialized' };
      await this.saveStatus();
      return;
    }

    // Don't auto-connect on startup if no session exists.
    // User must click "Connect" in Settings to initiate first connection (force=true).
    if (!force) {
      const hasSession = await this.authStore.hasExistingSession();
      if (!hasSession) {
        logger.info('WhatsAppProvider: no existing session, waiting for user to connect via Settings');
        this.status = { enabled: true, connected: false };
        await this.saveStatus();
        return;
      }
    }

    // Store phone number for pairing code request after socket connects
    if (phoneNumber) {
      this.pendingPhoneNumber = phoneNumber;
    }

    try {
      const { state, saveCreds } = await this.authStore.loadState();

      this.sock = makeWASocket({
        auth: state,
        logger: baileysLogger as any,
        browser: ['LivOS', 'Desktop', '1.0.0'],
        markOnlineOnConnect: false,
        getMessage: async (_key) => undefined,
      });

      // Persist credentials after every update
      this.sock.ev.on('creds.update', saveCreds);

      // Connection lifecycle
      this.sock.ev.on('connection.update', (update) => {
        this.handleConnectionUpdate(update).catch((err: any) => {
          logger.error('WhatsAppProvider: connection update error', { error: err.message });
        });
      });

      // Message reception
      this.sock.ev.on('messages.upsert', (upsert) => {
        this.handleMessages(upsert).catch((err: any) => {
          logger.error('WhatsAppProvider: messages.upsert error', { error: err.message });
        });
      });

      // Request pairing code if phone number provided (first-time connection)
      if (this.pendingPhoneNumber && this.sock) {
        const phone = this.pendingPhoneNumber.replace(/[^0-9]/g, '');
        this.pendingPhoneNumber = null;
        // Small delay to let the socket connect before requesting pairing
        setTimeout(async () => {
          try {
            if (!this.sock) return;
            const code = await this.sock.requestPairingCode(phone);
            logger.info('WhatsAppProvider: pairing code generated', { code });
            // Store pairing code in Redis for UI to display
            if (this.redis) {
              await this.redis.set('nexus:whatsapp:pairing_code', code, 'EX', 120);
            }
          } catch (err: any) {
            logger.error('WhatsAppProvider: pairing code request failed', { error: err.message });
            if (this.redis) {
              await this.redis.set('nexus:whatsapp:pairing_error', err.message, 'EX', 60);
            }
          }
        }, 2000);
      }

      logger.info('WhatsAppProvider: socket created, awaiting connection');
    } catch (err: any) {
      this.status = { enabled: true, connected: false, error: err.message };
      await this.saveStatus();
      logger.error('WhatsAppProvider: connect failed', { error: err.message });
    }
  }

  async disconnect(): Promise<void> {
    // Clear any pending reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // Ignore close errors
      }
      this.sock = null;
    }

    this.status.connected = false;
    await this.saveStatus();
    logger.info('WhatsAppProvider: disconnected');
  }

  /**
   * Full disconnect: close socket, clear auth state (forces QR re-scan on next connect).
   * Used by Settings UI "Disconnect" button.
   */
  async fullDisconnect(): Promise<void> {
    await this.disconnect();
    if (this.authStore) {
      await this.authStore.clearAll();
    }
    // Also delete any lingering QR from Redis
    if (this.redis) {
      await this.redis.del('nexus:whatsapp:qr');
    }
    this.status = { enabled: false, connected: false };
    await this.saveStatus();
    logger.info('WhatsAppProvider: full disconnect — auth state cleared');
  }

  async getStatus(): Promise<ChannelStatus> {
    return { ...this.status };
  }

  async sendMessage(chatId: string, text: string, _replyTo?: string): Promise<boolean> {
    if (!this.sock || !this.status.connected) {
      logger.warn('WhatsAppProvider: cannot send, not connected');
      return false;
    }

    try {
      const chunks = chunkText(text, CHANNEL_META.whatsapp.textLimit);

      for (const chunk of chunks) {
        if (this.rateLimiter) {
          // Route through rate limiter -- enforces 10/min with randomized delays
          await this.rateLimiter.enqueue(async () => {
            await this.sock!.sendMessage(chatId, { text: chunk });
            return true;
          });
        } else {
          // Defensive fallback: send directly if rate limiter not initialized
          await this.sock.sendMessage(chatId, { text: chunk });
        }
      }

      this.status.lastMessage = new Date().toISOString();
      await this.saveStatus();
      return true;
    } catch (err: any) {
      logger.error('WhatsAppProvider: send failed', { chatId, error: err.message });
      return false;
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async updateConfig(config: ChannelConfig): Promise<void> {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    if (this.redis) {
      await this.redis.set(`${getRedisPrefix(this.id)}:config`, JSON.stringify(this.config));
    }

    // Reconnect if enabled changed
    if (this.config.enabled && !wasEnabled) {
      await this.disconnect();
      await this.connect();
    } else if (!this.config.enabled) {
      await this.disconnect();
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (this.status.connected) {
      return { ok: true, botName: this.status.botName || 'WhatsApp' };
    }
    return { ok: false, error: this.status.error || 'Not connected' };
  }

  // ── Internal methods ──

  private async saveStatus(): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(`${getRedisPrefix(this.id)}:status`, JSON.stringify(this.status));
  }

  /**
   * Handle Baileys connection lifecycle events.
   *
   * CRITICAL: After QR scan, WhatsApp deliberately closes the connection once
   * to provide auth credentials. This is NOT an error — the reconnect logic
   * handles this gracefully by checking DisconnectReason.
   */
  private async handleConnectionUpdate(update: Partial<{
    connection: 'close' | 'open' | 'connecting';
    lastDisconnect: { error: Error | undefined; date: Date };
    qr: string;
  }>): Promise<void> {
    // ── QR code emission ──
    if (update.qr) {
      try {
        const qrDataUrl = await qrToDataURL(update.qr);
        if (this.redis) {
          await this.redis.set('nexus:whatsapp:qr', qrDataUrl, 'EX', 60);
        }
        logger.info('WhatsAppProvider: QR code generated, stored in Redis (60s TTL)');
      } catch (err: any) {
        logger.error('WhatsAppProvider: QR generation failed', { error: err.message });
      }
    }

    // ── Connection closed ──
    if (update.connection === 'close') {
      const statusCode = (update.lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        logger.info('WhatsAppProvider: connection closed, reconnecting in 3s', { statusCode });
        this.status.connected = false;
        this.status.error = `Disconnected (code ${statusCode})`;
        await this.saveStatus();

        // Schedule reconnect — create a fresh socket
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect().catch((err: any) => {
            logger.error('WhatsAppProvider: reconnect failed', { error: err.message });
          });
        }, 3000);
      } else {
        // Logged out — clear auth state so next connect triggers QR
        logger.warn('WhatsAppProvider: logged out, clearing auth state');
        if (this.authStore) {
          await this.authStore.clearAll();
        }
        this.status = { enabled: this.config.enabled, connected: false, error: 'Logged out' };
        await this.saveStatus();
      }
    }

    // ── Connection open ──
    if (update.connection === 'open') {
      this.status = {
        enabled: true,
        connected: true,
        lastConnect: new Date().toISOString(),
      };

      // Delete QR from Redis — no longer needed
      if (this.redis) {
        await this.redis.del('nexus:whatsapp:qr');
      }

      await this.saveStatus();
      logger.info('WhatsAppProvider: connected to WhatsApp');
    }
  }

  /**
   * Handle incoming messages from Baileys.
   *
   * Key safeguards:
   * - Skip history sync messages (type !== 'notify')
   * - Echo loop guard (msg.key.fromMe)
   * - Redis-based deduplication (86400s TTL)
   * - DmPairing check for non-group DMs
   */
  private async handleMessages(upsert: { messages: any[]; type: string }): Promise<void> {
    if (upsert.type !== 'notify') return; // Skip history sync messages

    for (const msg of upsert.messages) {
      if (!msg.message || msg.key.fromMe) continue; // ECHO LOOP GUARD: skip own messages

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';
      if (!text.trim()) continue;

      // ── Deduplication via Redis ──
      if (this.redis) {
        const dedupKey = `nexus:whatsapp:dedup:${msg.key.id}`;
        const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
        if (!isNew) continue;
      }

      const jid = msg.key.remoteJid!;
      const isGroup = jid.endsWith('@g.us');
      const userId = msg.key.participant || jid;
      const userName = msg.pushName || 'Unknown';

      // ── DM Pairing check (non-group only) ──
      if (!isGroup && this.dmPairing) {
        const result = await this.dmPairing.checkAndInitiatePairing(
          'whatsapp',
          userId,
          userName,
          jid,
        );
        if (!result.allowed) {
          if (result.message) {
            await this.sock?.sendMessage(jid, { text: result.message }).catch(() => {});
          }
          continue;
        }
      }

      const incomingMsg: IncomingMessage = {
        channel: 'whatsapp',
        chatId: jid,
        userId,
        userName,
        text,
        timestamp: (msg.messageTimestamp as number) * 1000,
        isGroup,
      };

      if (this.messageHandler) {
        try {
          await this.messageHandler(incomingMsg);
        } catch (err: any) {
          logger.error('WhatsAppProvider: message handler error', { error: err.message });
        }
      }
    }
  }
}
