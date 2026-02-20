import { google, type gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type Redis from 'ioredis';
import { logger } from '../logger.js';
import type {
  ChannelProvider,
  ChannelConfig,
  ChannelStatus,
  IncomingMessage,
} from './types.js';
import { getRedisPrefix } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Redis Key Constants
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_PREFIX = 'nexus:gmail';
const KEY_CONFIG = `${REDIS_PREFIX}:config`;
const KEY_TOKENS = `${REDIS_PREFIX}:tokens`;
const KEY_PROFILE = `${REDIS_PREFIX}:profile`;
const KEY_SEEN_IDS = `${REDIS_PREFIX}:seen_message_ids`;
const KEY_STATUS = `${REDIS_PREFIX}:status`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GmailTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

interface GmailProfile {
  email: string;
  name?: string;
}

interface GmailConfig {
  enabled: boolean;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailPollIntervalSec?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gmail Channel Provider
// ─────────────────────────────────────────────────────────────────────────────

export class GmailProvider implements ChannelProvider {
  readonly id = 'gmail' as const;
  readonly name = 'Gmail';

  private redis: Redis | null = null;
  private oauth2Client: OAuth2Client | null = null;
  private gmail: gmail_v1.Gmail | null = null;
  private config: GmailConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollTime: string | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async init(redis: Redis): Promise<void> {
    this.redis = redis;
    await this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    if (!this.redis) return;
    const configStr = await this.redis.get(KEY_CONFIG);
    if (configStr) {
      try {
        this.config = JSON.parse(configStr);
      } catch {
        logger.warn('GmailProvider: invalid config in Redis');
      }
    }
  }

  async connect(): Promise<void> {
    if (!this.config.enabled || !this.config.gmailClientId || !this.config.gmailClientSecret) {
      this.status = { enabled: false, connected: false, error: 'Not configured' };
      await this.saveStatus();
      return;
    }

    try {
      // Create OAuth2 client
      this.oauth2Client = new OAuth2Client(
        this.config.gmailClientId,
        this.config.gmailClientSecret,
        this.getRedirectUri(),
      );

      // Load tokens from Redis
      const tokens = await this.loadTokens();
      if (!tokens) {
        this.status = { enabled: true, connected: false, error: 'Not authenticated — connect via Settings' };
        await this.saveStatus();
        return;
      }

      this.oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      });

      // Auto-persist refreshed tokens
      this.oauth2Client.on('tokens', async (newTokens) => {
        logger.info('GmailProvider: tokens refreshed automatically');
        const existing = await this.loadTokens();
        const merged: GmailTokens = {
          access_token: newTokens.access_token || existing?.access_token || '',
          refresh_token: newTokens.refresh_token || existing?.refresh_token || '',
          expiry_date: newTokens.expiry_date || existing?.expiry_date || 0,
        };
        await this.saveTokens(merged);
      });

      // Create Gmail API client
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Verify connection
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      const email = profile.data.emailAddress || '';

      await this.saveProfile({ email });

      this.status = {
        enabled: true,
        connected: true,
        botName: email,
        lastConnect: new Date().toISOString(),
      };
      await this.saveStatus();

      // Start polling for new emails
      this.startPolling();

      logger.info('GmailProvider: connected', { email });
    } catch (err: any) {
      logger.error('GmailProvider: connection failed', { error: err.message });
      this.status = {
        enabled: true,
        connected: false,
        error: err.message,
      };
      await this.saveStatus();
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.gmail = null;
    this.oauth2Client = null;
    this.status = { enabled: false, connected: false };
    await this.saveStatus();
    logger.info('GmailProvider: disconnected');
  }

  async getStatus(): Promise<ChannelStatus> {
    // Refresh status from Redis if available
    if (this.redis) {
      const statusStr = await this.redis.get(KEY_STATUS);
      if (statusStr) {
        try {
          this.status = JSON.parse(statusStr);
        } catch { /* use cached */ }
      }
    }
    return this.status;
  }

  async sendMessage(_chatId: string, _text: string, _replyTo?: string): Promise<boolean> {
    // Sending email will be implemented in a future plan
    logger.debug('GmailProvider: sendMessage not yet implemented');
    return false;
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async updateConfig(config: ChannelConfig): Promise<void> {
    const newConfig: GmailConfig = {
      enabled: config.enabled,
      gmailClientId: config.gmailClientId ?? this.config.gmailClientId,
      gmailClientSecret: config.gmailClientSecret ?? this.config.gmailClientSecret,
      gmailPollIntervalSec: config.gmailPollIntervalSec ?? this.config.gmailPollIntervalSec,
    };
    this.config = newConfig;
    if (this.redis) {
      await this.redis.set(KEY_CONFIG, JSON.stringify(this.config));
    }

    // Reconnect if credentials changed
    if (this.config.enabled && this.config.gmailClientId && this.config.gmailClientSecret) {
      await this.disconnect();
      await this.connect();
    } else if (!this.config.enabled) {
      await this.disconnect();
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (!this.gmail || !this.oauth2Client) {
      return { ok: false, error: 'Not connected — authenticate via Settings first' };
    }

    try {
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      return { ok: true, botName: profile.data.emailAddress || undefined };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  // ── OAuth 2.0 Helpers ─────────────────────────────────────────────────

  /**
   * Generate an OAuth 2.0 authorization URL.
   * Called by the API endpoint to start the auth flow.
   */
  getAuthUrl(clientId: string, clientSecret: string, redirectUri: string): string {
    const client = new OAuth2Client(clientId, clientSecret, redirectUri);
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
    });
  }

  /**
   * Exchange an authorization code for tokens.
   * Called by the OAuth callback endpoint.
   */
  async exchangeCode(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string,
  ): Promise<{ tokens: GmailTokens; profile: GmailProfile }> {
    const client = new OAuth2Client(clientId, clientSecret, redirectUri);
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Google did not return valid tokens — try again');
    }

    client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    const gmailTokens: GmailTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || 0,
    };

    const gmailProfile: GmailProfile = {
      email: profile.data.emailAddress || '',
    };

    return { tokens: gmailTokens, profile: gmailProfile };
  }

  /**
   * Persist tokens and profile to Redis, then connect.
   */
  async finishOAuth(tokens: GmailTokens, profile: GmailProfile): Promise<void> {
    await this.saveTokens(tokens);
    await this.saveProfile(profile);

    // Update config to enabled
    this.config.enabled = true;
    if (this.redis) {
      await this.redis.set(KEY_CONFIG, JSON.stringify(this.config));
    }

    // Reconnect with new tokens
    if (this.status.connected) {
      await this.disconnect();
    }
    await this.connect();
  }

  /**
   * Clear all OAuth state (tokens, profile, seen IDs).
   */
  async clearOAuth(): Promise<void> {
    this.stopPolling();
    if (this.redis) {
      await this.redis.del(KEY_TOKENS);
      await this.redis.del(KEY_PROFILE);
      await this.redis.del(KEY_SEEN_IDS);
    }
    this.config.enabled = false;
    if (this.redis) {
      await this.redis.set(KEY_CONFIG, JSON.stringify(this.config));
    }
    this.gmail = null;
    this.oauth2Client = null;
    this.status = { enabled: false, connected: false };
    await this.saveStatus();
    logger.info('GmailProvider: OAuth cleared');
  }

  /**
   * Get the stored Gmail profile (email address).
   */
  async getProfile(): Promise<GmailProfile | null> {
    if (!this.redis) return null;
    const str = await this.redis.get(KEY_PROFILE);
    if (!str) return null;
    try {
      return JSON.parse(str) as GmailProfile;
    } catch {
      return null;
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────

  private startPolling(): void {
    if (this.pollTimer) return;

    const intervalMs = (this.config.gmailPollIntervalSec || 60) * 1000;
    logger.info('GmailProvider: starting polling', { intervalSec: intervalMs / 1000 });

    // Initial poll after a short delay
    setTimeout(() => this.poll().catch((err) => {
      logger.error('GmailProvider: initial poll failed', { error: err.message });
    }), 5000);

    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        logger.error('GmailProvider: poll failed', { error: err.message });
      });
    }, intervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.info('GmailProvider: polling stopped');
    }
  }

  private async poll(): Promise<void> {
    if (!this.gmail || !this.redis) return;

    try {
      // Fetch recent unread messages
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread newer_than:1d',
        maxResults: 10,
      });

      const messages = response.data.messages || [];
      if (messages.length === 0) {
        this.lastPollTime = new Date().toISOString();
        return;
      }

      // Get already-seen message IDs
      const seenIds = await this.redis.smembers(KEY_SEEN_IDS);
      const seenSet = new Set(seenIds);

      const newMessages = messages.filter((m) => m.id && !seenSet.has(m.id));
      if (newMessages.length === 0) {
        this.lastPollTime = new Date().toISOString();
        return;
      }

      logger.info('GmailProvider: new messages found', { count: newMessages.length });

      for (const msgRef of newMessages) {
        if (!msgRef.id) continue;

        try {
          const full = await this.gmail.users.messages.get({
            userId: 'me',
            id: msgRef.id,
            format: 'full',
          });

          const headers = full.data.payload?.headers || [];
          const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '(no subject)';
          const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || 'unknown';
          const body = this.extractBody(full.data.payload);

          const text = `[Email] From: ${from}\nSubject: ${subject}\n\n${body}`;

          if (this.messageHandler) {
            const incomingMsg: IncomingMessage = {
              channel: 'gmail',
              chatId: `gmail:${msgRef.id}`,
              userId: from,
              userName: from,
              text,
              timestamp: parseInt(full.data.internalDate || '0', 10),
            };
            await this.messageHandler(incomingMsg);
          }

          // Mark as seen
          await this.redis.sadd(KEY_SEEN_IDS, msgRef.id);
        } catch (err: any) {
          logger.error('GmailProvider: failed to process message', { id: msgRef.id, error: err.message });
        }
      }

      // Trim seen IDs to prevent unbounded growth (keep last 500)
      const currentSize = await this.redis.scard(KEY_SEEN_IDS);
      if (currentSize > 500) {
        const allIds = await this.redis.smembers(KEY_SEEN_IDS);
        const toRemove = allIds.slice(0, allIds.length - 500);
        if (toRemove.length > 0) {
          await this.redis.srem(KEY_SEEN_IDS, ...toRemove);
        }
      }

      this.lastPollTime = new Date().toISOString();

      // Update status with last message time
      this.status.lastMessage = this.lastPollTime;
      await this.saveStatus();
    } catch (err: any) {
      logger.error('GmailProvider: poll error', { error: err.message });

      // If token expired / revoked, update status
      if (err.message?.includes('invalid_grant') || err.response?.status === 401) {
        this.status = {
          enabled: true,
          connected: false,
          error: 'Token expired or revoked — reconnect in Settings',
        };
        await this.saveStatus();
        this.stopPolling();
      }
    }
  }

  /**
   * Extract plain text body from Gmail message payload.
   */
  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';

    // Direct text body
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // Multipart — recurse into parts
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
      // If no text/plain, try html as fallback
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
          // Strip HTML tags for a rough text version
          return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
      // Recurse into nested multipart
      for (const part of payload.parts) {
        const nested = this.extractBody(part);
        if (nested) return nested;
      }
    }

    return '';
  }

  // ── Redis Helpers ─────────────────────────────────────────────────────

  private getRedirectUri(): string {
    const base = process.env.NEXUS_PUBLIC_URL || `http://localhost:${process.env.API_PORT || '3200'}`;
    return `${base}/api/gmail/oauth/callback`;
  }

  private async loadTokens(): Promise<GmailTokens | null> {
    if (!this.redis) return null;
    const str = await this.redis.get(KEY_TOKENS);
    if (!str) return null;
    try {
      return JSON.parse(str) as GmailTokens;
    } catch {
      return null;
    }
  }

  private async saveTokens(tokens: GmailTokens): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(KEY_TOKENS, JSON.stringify(tokens));
  }

  private async saveProfile(profile: GmailProfile): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(KEY_PROFILE, JSON.stringify(profile));
  }

  private async saveStatus(): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(KEY_STATUS, JSON.stringify(this.status));
  }
}
