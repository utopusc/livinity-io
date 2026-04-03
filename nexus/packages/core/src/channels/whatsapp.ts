// @ts-ignore — whatsapp-web.js has no type declarations
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import type Redis from 'ioredis';
import { toDataURL as qrToDataURL } from 'qrcode';
import { logger } from '../logger.js';
import { WhatsAppRateLimiter } from './whatsapp-rate-limiter.js';
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
 * WhatsApp channel provider using whatsapp-web.js (Puppeteer/Chrome).
 *
 * Uses a headless Chrome browser to connect to WhatsApp Web.
 * More resource-heavy than Baileys (~300MB RAM) but 100% protocol compatible.
 * QR code authentication — user scans with WhatsApp > Linked Devices.
 */
export class WhatsAppProvider implements ChannelProvider {
  readonly id = 'whatsapp' as const;
  readonly name = 'WhatsApp';

  private redis: Redis | null = null;
  private client: InstanceType<typeof Client> | null = null;
  private rateLimiter: WhatsAppRateLimiter | null = null;
  private config: ChannelConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private dmPairing: DmPairingManager | null = null;
  private approvalManager: ApprovalManager | null = null;
  private messageDedup = new Set<string>();

  // ── Dependency injection ──

  setDmPairing(manager: DmPairingManager): void {
    this.dmPairing = manager;
  }

  setApprovalManager(manager: ApprovalManager): void {
    this.approvalManager = manager;
  }

  // ── ChannelProvider interface ──

  async init(redis: Redis): Promise<void> {
    this.redis = redis;
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
   * Connect to WhatsApp via headless Chrome.
   * On first connect, emits QR code for scanning.
   * On subsequent connects (with saved session), auto-reconnects.
   */
  async connect(force = false): Promise<void> {
    if (!this.config.enabled) {
      this.status = { enabled: false, connected: false };
      await this.saveStatus();
      return;
    }

    // Don't auto-connect on startup unless session data exists or force=true
    if (!force) {
      const hasSession = await this.hasExistingSession();
      if (!hasSession) {
        logger.info('WhatsAppProvider: no existing session, waiting for user to connect via Settings');
        this.status = { enabled: true, connected: false };
        await this.saveStatus();
        return;
      }
    }

    if (this.client) {
      try { await this.client.destroy(); } catch {}
      this.client = null;
    }

    try {
      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: '/opt/nexus/data/whatsapp-session' }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
          ],
          executablePath: '/usr/bin/chromium-browser',
        },
      });

      // QR code for first-time auth
      this.client.on('qr', async (qr: string) => {
        try {
          const qrDataUrl = await qrToDataURL(qr, { width: 256 });
          if (this.redis) {
            await this.redis.set('nexus:whatsapp:qr', qrDataUrl, 'EX', 60);
          }
          logger.info('WhatsAppProvider: QR code generated');
        } catch (err: any) {
          logger.error('WhatsAppProvider: QR generation failed', { error: err.message });
        }
      });

      // Connected
      this.client.on('ready', async () => {
        const info = this.client?.info;
        this.status = {
          enabled: true,
          connected: true,
          lastConnect: new Date().toISOString(),
          botName: info?.pushname || info?.wid?.user || 'WhatsApp',
        };
        if (this.redis) {
          await this.redis.del('nexus:whatsapp:qr');
        }
        await this.saveStatus();
        logger.info('WhatsAppProvider: connected!', { name: this.status.botName });
      });

      // Disconnected
      this.client.on('disconnected', async (reason: string) => {
        logger.warn('WhatsAppProvider: disconnected', { reason });
        this.status = { enabled: this.config.enabled, connected: false, error: reason };
        await this.saveStatus();

        // Auto-reconnect after 10s
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect(true).catch((err: any) => {
            logger.error('WhatsAppProvider: reconnect failed', { error: err.message });
          });
        }, 10000);
      });

      // Auth failure
      this.client.on('auth_failure', async (msg: string) => {
        logger.error('WhatsAppProvider: auth failure', { msg });
        this.status = { enabled: true, connected: false, error: `Auth failed: ${msg}` };
        await this.saveStatus();
      });

      // Messages — use 'message_create' to capture own messages (fromMe)
      // 'message' event only fires for incoming messages from others
      this.client.on('message_create', async (msg: any) => {
        try {
          await this.handleMessage(msg);
        } catch (err: any) {
          logger.error('WhatsAppProvider: message handler error', { error: err.message });
        }
      });

      logger.info('WhatsAppProvider: initializing Chrome client...');
      await this.client.initialize();
      logger.info('WhatsAppProvider: Chrome client initialized');

    } catch (err: any) {
      this.status = { enabled: true, connected: false, error: err.message };
      await this.saveStatus();
      logger.error('WhatsAppProvider: connect failed', { error: err.message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try { await this.client.destroy(); } catch {}
      this.client = null;
    }
    this.status.connected = false;
    await this.saveStatus();
    logger.info('WhatsAppProvider: disconnected');
  }

  /**
   * Full disconnect: destroy Chrome + delete session data.
   */
  async fullDisconnect(): Promise<void> {
    await this.disconnect();
    // Clear session directory
    try {
      const { execSync } = await import('child_process');
      execSync('rm -rf /opt/nexus/data/whatsapp-session');
      logger.info('WhatsAppProvider: session data cleared');
    } catch {}
    if (this.redis) {
      await this.redis.del('nexus:whatsapp:qr');
    }
    this.status = { enabled: false, connected: false };
    await this.saveStatus();
  }

  async getStatus(): Promise<ChannelStatus> {
    return { ...this.status };
  }

  async sendMessage(chatId: string, text: string, _replyTo?: string): Promise<boolean> {
    if (!this.client || !this.status.connected) {
      logger.warn('WhatsAppProvider: cannot send, not connected');
      return false;
    }

    try {
      const chunks = chunkText(text, CHANNEL_META.whatsapp.textLimit);
      for (const chunk of chunks) {
        if (this.rateLimiter) {
          await this.rateLimiter.enqueue(async () => {
            await this.client!.sendMessage(chatId, chunk);
            return true;
          });
        } else {
          await this.client.sendMessage(chatId, chunk);
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

  private async hasExistingSession(): Promise<boolean> {
    try {
      const { existsSync } = await import('fs');
      return existsSync('/opt/nexus/data/whatsapp-session');
    } catch {
      return false;
    }
  }

  private async handleMessage(msg: any): Promise<void> {
    // Skip non-chat messages (status updates, etc)
    if (!msg.body || msg.isStatus) return;

    // ONLY respond to messages from the account owner (fromMe=true)
    // This prevents AI from responding to other people's messages
    if (!msg.fromMe) return;

    // Only respond to messages starting with "!" prefix
    if (!msg.body.startsWith('!')) return;

    // Strip the "!" prefix before passing to AI
    const text = msg.body.slice(1).trim();
    if (!text) return;

    // Dedup
    if (this.messageDedup.has(msg.id._serialized)) return;
    this.messageDedup.add(msg.id._serialized);
    if (this.messageDedup.size > 1000) {
      const first = this.messageDedup.values().next().value;
      if (first) this.messageDedup.delete(first);
    }

    const contact = await msg.getContact();
    const chat = await msg.getChat();

    const incoming: IncomingMessage = {
      channel: 'whatsapp',
      chatId: msg.from,
      userId: msg.from,
      userName: contact?.pushname || contact?.name || msg.from.replace('@c.us', ''),
      text,
      timestamp: msg.timestamp * 1000,
      replyToMessageId: msg.hasQuotedMsg ? msg._data?.quotedStanzaID : undefined,
      isGroup: chat.isGroup,
      groupName: chat.isGroup ? chat.name : undefined,
    };

    if (this.messageHandler) {
      await this.messageHandler(incoming);
    }
  }
}
