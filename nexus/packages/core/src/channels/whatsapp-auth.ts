import { Redis } from 'ioredis';
import { initAuthCreds, BufferJSON } from 'baileys';
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from 'baileys';
import { logger } from '../logger.js';

/**
 * Redis-backed auth state store for Baileys.
 *
 * Replaces the file-based `useMultiFileAuthState` which Baileys docs explicitly
 * warn against using in production. Stores Signal protocol credentials and keys
 * in Redis with proper Buffer serialization via BufferJSON.
 *
 * Key layout:
 *   nexus:wa:auth:creds           — serialized AuthenticationCreds
 *   nexus:wa:auth:keys:{type}:{id} — individual Signal protocol keys
 */
export class WhatsAppAuthStore {
  private redis: Redis;
  private readonly prefix = 'nexus:wa:auth';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Load or initialize Baileys auth state from Redis.
   *
   * Returns the exact shape Baileys expects when creating a socket:
   * `{ state: AuthenticationState, saveCreds: () => Promise<void> }`
   *
   * If no credentials exist in Redis, initializes fresh creds via `initAuthCreds()`,
   * which triggers QR code authentication on first connect.
   */
  async loadState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const credsStr = await this.redis.get(`${this.prefix}:creds`);
    const creds: AuthenticationCreds = credsStr
      ? JSON.parse(credsStr, BufferJSON.reviver)
      : initAuthCreds();

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Promise<Record<string, SignalDataTypeMap[T]>> => {
          const pipeline = this.redis.pipeline();
          for (const id of ids) {
            pipeline.get(`${this.prefix}:keys:${type}:${id}`);
          }
          const results = await pipeline.exec();
          const mapped: Record<string, SignalDataTypeMap[T]> = {};
          ids.forEach((id, i) => {
            const val = results?.[i]?.[1];
            if (val && typeof val === 'string') {
              mapped[id] = JSON.parse(val, BufferJSON.reviver);
            }
          });
          return mapped;
        },
        set: async (data: Record<string, Record<string, any | null>>): Promise<void> => {
          const pipeline = this.redis.pipeline();
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              const key = `${this.prefix}:keys:${type}:${id}`;
              if (value != null) {
                pipeline.set(key, JSON.stringify(value, BufferJSON.replacer));
              } else {
                pipeline.del(key);
              }
            }
          }
          await pipeline.exec();
        },
      },
    };

    const saveCreds = async (): Promise<void> => {
      await this.redis.set(
        `${this.prefix}:creds`,
        JSON.stringify(state.creds, BufferJSON.replacer),
      );
    };

    logger.info('[WhatsApp] Auth state loaded from Redis');
    return { state, saveCreds };
  }

  /**
   * Check if a previous session exists (creds were saved after QR scan).
   * Returns false if no creds in Redis — means user never scanned QR.
   */
  async hasExistingSession(): Promise<boolean> {
    const creds = await this.redis.get(`${this.prefix}:creds`);
    if (!creds) return false;
    try {
      const parsed = JSON.parse(creds, BufferJSON.reviver);
      // If registered is true, QR was scanned successfully before
      return !!parsed.registered;
    } catch {
      return false;
    }
  }

  /**
   * Delete all WhatsApp auth keys from Redis.
   * Used during logout/disconnect to force QR re-scan on next connect.
   */
  async clearAll(): Promise<void> {
    const keys = await this.redis.keys(`${this.prefix}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info(`[WhatsApp] Cleared ${keys.length} auth keys from Redis`);
    }
  }
}
