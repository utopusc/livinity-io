import { randomInt } from 'node:crypto';
import type Redis from 'ioredis';
import { logger } from './logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DmPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled';

export interface PairingRequest {
  channel: string;
  userId: string;
  userName: string;
  code: string;
  createdAt: number;
  channelChatId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CODE_TTL_SECONDS = 3600; // 1 hour
const MAX_PENDING_PER_CHANNEL = 3;
const DEFAULT_POLICY: DmPolicy = 'pairing';

// ─────────────────────────────────────────────────────────────────────────────
// Redis Key Helpers
// ─────────────────────────────────────────────────────────────────────────────

function allowlistKey(channel: string): string {
  return `nexus:dm:allowlist:${channel}`;
}

function pendingKey(channel: string): string {
  return `nexus:dm:pending:${channel}`;
}

function policyKey(channel: string): string {
  return `nexus:dm:policy:${channel}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DmPairingManager
// ─────────────────────────────────────────────────────────────────────────────

export class DmPairingManager {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  // ── Policy Management ───────────────────────────────────────────────────

  async getPolicy(channel: string): Promise<DmPolicy> {
    const raw = await this.redis.get(policyKey(channel));
    if (raw && ['pairing', 'allowlist', 'open', 'disabled'].includes(raw)) {
      return raw as DmPolicy;
    }
    return DEFAULT_POLICY;
  }

  async setPolicy(channel: string, policy: DmPolicy): Promise<void> {
    await this.redis.set(policyKey(channel), policy);
    logger.info('DmPairingManager: policy updated', { channel, policy });
  }

  // ── Allowlist ───────────────────────────────────────────────────────────

  async isAllowed(channel: string, userId: string): Promise<boolean> {
    return (await this.redis.sismember(allowlistKey(channel), userId)) === 1;
  }

  async getAllowlist(channel: string): Promise<string[]> {
    return this.redis.smembers(allowlistKey(channel));
  }

  async removeFromAllowlist(channel: string, userId: string): Promise<void> {
    await this.redis.srem(allowlistKey(channel), userId);
    logger.info('DmPairingManager: user removed from allowlist', { channel, userId });
  }

  // ── Pairing Flow ────────────────────────────────────────────────────────

  /**
   * Check if a DM user is allowed. If not, initiate the pairing flow.
   * Returns { allowed: true } if user can proceed, or { allowed: false, message } with a reply.
   */
  async checkAndInitiatePairing(
    channel: string,
    userId: string,
    userName: string,
    chatId: string,
  ): Promise<{ allowed: boolean; message?: string }> {
    const policy = await this.getPolicy(channel);

    switch (policy) {
      case 'open':
        return { allowed: true };

      case 'disabled':
        return { allowed: false, message: 'DMs are disabled on this bot.' };

      case 'allowlist':
        if (await this.isAllowed(channel, userId)) {
          return { allowed: true };
        }
        return {
          allowed: false,
          message: 'You are not on the allowlist. Contact the server owner to be added.',
        };

      case 'pairing': {
        // Check if already approved
        if (await this.isAllowed(channel, userId)) {
          return { allowed: true };
        }

        // Check if there's already a pending request for this user
        const existingRaw = await this.redis.hget(pendingKey(channel), userId);
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw) as PairingRequest;
            // Check if the existing code has expired
            const age = Date.now() - existing.createdAt;
            if (age < CODE_TTL_SECONDS * 1000) {
              return {
                allowed: false,
                message: `Your activation request is pending approval. Your code: ${existing.code}`,
              };
            }
            // Expired — remove and create a new one
            await this.redis.hdel(pendingKey(channel), userId);
          } catch {
            // Corrupt data — remove it
            await this.redis.hdel(pendingKey(channel), userId);
          }
        }

        // Enforce max pending per channel
        const pendingCount = await this.redis.hlen(pendingKey(channel));
        if (pendingCount >= MAX_PENDING_PER_CHANNEL) {
          // Evict expired entries first
          await this.evictExpiredPending(channel);
          const countAfterEvict = await this.redis.hlen(pendingKey(channel));
          if (countAfterEvict >= MAX_PENDING_PER_CHANNEL) {
            return {
              allowed: false,
              message: 'Too many pending activation requests. Please try again later.',
            };
          }
        }

        // Generate 6-digit code
        const code = String(randomInt(100000, 999999));
        const request: PairingRequest = {
          channel,
          userId,
          userName,
          code,
          createdAt: Date.now(),
          channelChatId: chatId,
        };

        await this.redis.hset(pendingKey(channel), userId, JSON.stringify(request));

        logger.info('DmPairingManager: activation code issued', {
          channel,
          userId,
          userName,
          code,
        });

        return {
          allowed: false,
          message: `Welcome! To use this bot, you need to be approved by the server owner.\n\nYour activation code: ${code}\n\nThe server owner will review your request shortly.`,
        };
      }

      default:
        return { allowed: false, message: 'Unknown DM policy.' };
    }
  }

  // ── Admin Approval ──────────────────────────────────────────────────────

  async approvePairing(channel: string, userId: string): Promise<boolean> {
    const raw = await this.redis.hget(pendingKey(channel), userId);
    if (!raw) return false;

    // Add to allowlist (persists across restarts)
    await this.redis.sadd(allowlistKey(channel), userId);
    // Remove from pending
    await this.redis.hdel(pendingKey(channel), userId);

    logger.info('DmPairingManager: user approved', { channel, userId });
    return true;
  }

  async denyPairing(channel: string, userId: string): Promise<boolean> {
    const removed = await this.redis.hdel(pendingKey(channel), userId);
    if (removed === 0) return false;

    logger.info('DmPairingManager: user denied', { channel, userId });
    return true;
  }

  // ── Query ───────────────────────────────────────────────────────────────

  /**
   * Get all pending pairing requests, optionally filtered by channel.
   * Automatically evicts expired entries.
   */
  async getPendingRequests(channel?: string): Promise<PairingRequest[]> {
    const channels = channel
      ? [channel]
      : ['telegram', 'discord', 'slack', 'matrix'];

    const results: PairingRequest[] = [];

    for (const ch of channels) {
      const all = await this.redis.hgetall(pendingKey(ch));
      for (const [userId, raw] of Object.entries(all)) {
        try {
          const req = JSON.parse(raw) as PairingRequest;
          const age = Date.now() - req.createdAt;
          if (age >= CODE_TTL_SECONDS * 1000) {
            // Expired — evict
            await this.redis.hdel(pendingKey(ch), userId);
            continue;
          }
          results.push(req);
        } catch {
          // Corrupt entry — remove
          await this.redis.hdel(pendingKey(ch), userId);
        }
      }
    }

    return results;
  }

  // ── Internal Helpers ────────────────────────────────────────────────────

  private async evictExpiredPending(channel: string): Promise<void> {
    const all = await this.redis.hgetall(pendingKey(channel));
    for (const [userId, raw] of Object.entries(all)) {
      try {
        const req = JSON.parse(raw) as PairingRequest;
        if (Date.now() - req.createdAt >= CODE_TTL_SECONDS * 1000) {
          await this.redis.hdel(pendingKey(channel), userId);
        }
      } catch {
        await this.redis.hdel(pendingKey(channel), userId);
      }
    }
  }
}
