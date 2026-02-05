/**
 * User Session Manager
 * Stores per-user preferences like thinking level, verbose level, model preference.
 * Data is persisted in Redis with key pattern: nexus:user:{jid}
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { ThinkLevel, VerboseLevel } from './thinking.js';
import type { ModelTier } from './brain.js';

const USER_PREFIX = 'nexus:user:';
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days

export interface UserSession {
  /** WhatsApp JID or user identifier */
  jid: string;
  /** Display name */
  name?: string;
  /** Preferred thinking level */
  thinkLevel?: ThinkLevel;
  /** Preferred verbose level */
  verboseLevel?: VerboseLevel;
  /** Preferred model tier */
  modelTier?: ModelTier;
  /** Language preference */
  language?: 'tr' | 'en';
  /** Total messages sent */
  messageCount?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Last interaction timestamp */
  lastSeen?: number;
  /** Created timestamp */
  createdAt?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export class UserSessionManager {
  private redis: Redis;
  private cache = new Map<string, UserSession>();
  private cacheTimeout = 60000; // 1 minute cache

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get user session, creating if not exists.
   */
  async get(jid: string): Promise<UserSession> {
    // Check cache first
    const cached = this.cache.get(jid);
    if (cached) return cached;

    const key = `${USER_PREFIX}${jid}`;
    const data = await this.redis.get(key);

    if (data) {
      try {
        const session = JSON.parse(data) as UserSession;
        this.cache.set(jid, session);
        setTimeout(() => this.cache.delete(jid), this.cacheTimeout);
        return session;
      } catch (err) {
        logger.error('UserSession: failed to parse', { jid, error: (err as Error).message });
      }
    }

    // Create new session
    const session: UserSession = {
      jid,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      messageCount: 0,
      totalTokens: 0,
    };

    await this.save(session);
    return session;
  }

  /**
   * Save user session to Redis.
   */
  async save(session: UserSession): Promise<void> {
    const key = `${USER_PREFIX}${session.jid}`;
    session.lastSeen = Date.now();

    await this.redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL);
    this.cache.set(session.jid, session);
    setTimeout(() => this.cache.delete(session.jid), this.cacheTimeout);

    logger.debug('UserSession: saved', { jid: session.jid });
  }

  /**
   * Update specific fields in user session.
   */
  async update(jid: string, updates: Partial<UserSession>): Promise<UserSession> {
    const session = await this.get(jid);
    const updated = { ...session, ...updates, lastSeen: Date.now() };
    await this.save(updated);
    return updated;
  }

  /**
   * Set thinking level for user.
   */
  async setThinkLevel(jid: string, level: ThinkLevel): Promise<void> {
    await this.update(jid, { thinkLevel: level });
    logger.info('UserSession: set think level', { jid, level });
  }

  /**
   * Set verbose level for user.
   */
  async setVerboseLevel(jid: string, level: VerboseLevel): Promise<void> {
    await this.update(jid, { verboseLevel: level });
    logger.info('UserSession: set verbose level', { jid, level });
  }

  /**
   * Set model tier for user.
   */
  async setModelTier(jid: string, tier: ModelTier): Promise<void> {
    await this.update(jid, { modelTier: tier });
    logger.info('UserSession: set model tier', { jid, tier });
  }

  /**
   * Increment message count and add tokens.
   */
  async recordUsage(jid: string, tokens: number): Promise<void> {
    const session = await this.get(jid);
    session.messageCount = (session.messageCount || 0) + 1;
    session.totalTokens = (session.totalTokens || 0) + tokens;
    await this.save(session);
  }

  /**
   * Reset user session to defaults.
   */
  async reset(jid: string): Promise<UserSession> {
    const session: UserSession = {
      jid,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      messageCount: 0,
      totalTokens: 0,
    };
    await this.save(session);
    logger.info('UserSession: reset', { jid });
    return session;
  }

  /**
   * Get all active users (for stats).
   */
  async getAllActive(limit = 100): Promise<UserSession[]> {
    const pattern = `${USER_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    const sessions: UserSession[] = [];

    for (const key of keys.slice(0, limit)) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          sessions.push(JSON.parse(data));
        } catch {
          // Skip invalid entries
        }
      }
    }

    return sessions.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  }

  /**
   * Get usage stats.
   */
  async getStats(): Promise<{
    totalUsers: number;
    activeToday: number;
    totalMessages: number;
    totalTokens: number;
  }> {
    const sessions = await this.getAllActive(1000);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return {
      totalUsers: sessions.length,
      activeToday: sessions.filter((s) => (now - (s.lastSeen || 0)) < dayMs).length,
      totalMessages: sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0),
      totalTokens: sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0),
    };
  }
}
