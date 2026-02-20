/**
 * UsageTracker — Tracks per-session and cumulative token usage in Redis.
 *
 * Records input/output tokens, turn count, tool call count, and TTFB latency
 * for each agent session. Provides daily rollup and cost estimation.
 *
 * Redis keys:
 *   nexus:usage:session:{sessionId}          — Current session metrics (JSON, TTL 24h)
 *   nexus:usage:daily:{date}:{userId}        — Daily aggregated usage (hash)
 *   nexus:usage:cumulative:{userId}          — All-time totals (hash)
 *   nexus:usage:display:{userId}             — Display mode preference (string)
 *   nexus:usage:sessions:{userId}            — Recent session list (sorted set by timestamp)
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';

// ── Types ──────────────────────────────────────────────────────────────

export type UsageDisplayMode = 'off' | 'tokens' | 'full' | 'cost';

export interface SessionUsage {
  sessionId: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  toolCalls: number;
  ttfbMs: number;
  durationMs: number;
  timestamp: number;
  success: boolean;
}

export interface DailyUsage {
  date: string;
  userId: string;
  inputTokens: number;
  outputTokens: number;
  sessions: number;
  turns: number;
  toolCalls: number;
  avgTtfbMs: number;
  estimatedCostUsd: number;
}

export interface CumulativeUsage {
  inputTokens: number;
  outputTokens: number;
  sessions: number;
  turns: number;
  toolCalls: number;
  firstSeen: number;
  lastSeen: number;
}

export interface UserUsageSummary {
  currentSession: SessionUsage | null;
  today: DailyUsage;
  cumulative: CumulativeUsage;
  displayMode: UsageDisplayMode;
}

export interface UsageOverview {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalSessions: number;
  totalTurns: number;
  estimatedCostUsd: number;
  activeUsers: number;
}

// ── Cost Estimation ────────────────────────────────────────────────────

/** Per-million-token pricing (USD) */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  haiku:  { input: 0.25,  output: 1.25 },
  flash:  { input: 0.25,  output: 1.25 },
  sonnet: { input: 3.00,  output: 15.00 },
  opus:   { input: 15.00, output: 75.00 },
};

/** Estimate cost for a given model tier and token counts */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.sonnet;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ── Redis Key Helpers ──────────────────────────────────────────────────

function sessionKey(sessionId: string): string {
  return `nexus:usage:session:${sessionId}`;
}

function dailyKey(date: string, userId: string): string {
  return `nexus:usage:daily:${date}:${userId}`;
}

function cumulativeKey(userId: string): string {
  return `nexus:usage:cumulative:${userId}`;
}

function displayKey(userId: string): string {
  return `nexus:usage:display:${userId}`;
}

function sessionsListKey(userId: string): string {
  return `nexus:usage:sessions:${userId}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── UsageTracker Class ────────────────────────────────────────────────

export class UsageTracker {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Record a completed agent session's usage metrics.
   */
  async recordSession(usage: SessionUsage): Promise<void> {
    try {
      const { sessionId, userId, model, inputTokens, outputTokens, turns, toolCalls, ttfbMs, durationMs, timestamp, success } = usage;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const cost = estimateCost(model, inputTokens, outputTokens);

      // 1. Store session snapshot (TTL 24h)
      await this.redis.set(
        sessionKey(sessionId),
        JSON.stringify(usage),
        'EX',
        86400,
      );

      // 2. Add to user's recent sessions list (sorted set, score = timestamp)
      await this.redis.zadd(sessionsListKey(userId), timestamp, sessionId);
      // Trim to last 100 sessions
      await this.redis.zremrangebyrank(sessionsListKey(userId), 0, -101);

      // 3. Increment daily aggregates
      const dKey = dailyKey(date, userId);
      const pipeline = this.redis.pipeline();
      pipeline.hincrby(dKey, 'inputTokens', inputTokens);
      pipeline.hincrby(dKey, 'outputTokens', outputTokens);
      pipeline.hincrby(dKey, 'sessions', 1);
      pipeline.hincrby(dKey, 'turns', turns);
      pipeline.hincrby(dKey, 'toolCalls', toolCalls);
      pipeline.hincrby(dKey, 'totalTtfbMs', Math.round(ttfbMs));
      // Store cost as integer cents to avoid float precision issues
      pipeline.hincrby(dKey, 'costCents', Math.round(cost * 100));
      pipeline.expire(dKey, 90 * 86400); // Keep daily data for 90 days
      await pipeline.exec();

      // 4. Increment cumulative totals
      const cKey = cumulativeKey(userId);
      const cPipeline = this.redis.pipeline();
      cPipeline.hincrby(cKey, 'inputTokens', inputTokens);
      cPipeline.hincrby(cKey, 'outputTokens', outputTokens);
      cPipeline.hincrby(cKey, 'sessions', 1);
      cPipeline.hincrby(cKey, 'turns', turns);
      cPipeline.hincrby(cKey, 'toolCalls', toolCalls);
      cPipeline.hsetnx(cKey, 'firstSeen', String(timestamp));
      cPipeline.hset(cKey, 'lastSeen', String(timestamp));
      await cPipeline.exec();

      logger.debug('UsageTracker: session recorded', {
        sessionId,
        userId,
        model,
        inputTokens,
        outputTokens,
        turns,
        cost: cost.toFixed(4),
      });
    } catch (err: any) {
      logger.error('UsageTracker: failed to record session', { error: err.message });
    }
  }

  /**
   * Get the most recent session for a user.
   */
  async getCurrentSession(userId: string): Promise<SessionUsage | null> {
    try {
      const sessionIds = await this.redis.zrevrange(sessionsListKey(userId), 0, 0);
      if (!sessionIds.length) return null;

      const data = await this.redis.get(sessionKey(sessionIds[0]));
      if (!data) return null;

      return JSON.parse(data) as SessionUsage;
    } catch {
      return null;
    }
  }

  /**
   * Get daily usage for a specific date and user.
   */
  async getDailyUsage(date: string, userId: string): Promise<DailyUsage> {
    try {
      const data = await this.redis.hgetall(dailyKey(date, userId));
      if (!data || Object.keys(data).length === 0) {
        return {
          date,
          userId,
          inputTokens: 0,
          outputTokens: 0,
          sessions: 0,
          turns: 0,
          toolCalls: 0,
          avgTtfbMs: 0,
          estimatedCostUsd: 0,
        };
      }

      const sessions = parseInt(data.sessions || '0');
      const totalTtfbMs = parseInt(data.totalTtfbMs || '0');
      const costCents = parseInt(data.costCents || '0');

      return {
        date,
        userId,
        inputTokens: parseInt(data.inputTokens || '0'),
        outputTokens: parseInt(data.outputTokens || '0'),
        sessions,
        turns: parseInt(data.turns || '0'),
        toolCalls: parseInt(data.toolCalls || '0'),
        avgTtfbMs: sessions > 0 ? Math.round(totalTtfbMs / sessions) : 0,
        estimatedCostUsd: costCents / 100,
      };
    } catch {
      return {
        date,
        userId,
        inputTokens: 0,
        outputTokens: 0,
        sessions: 0,
        turns: 0,
        toolCalls: 0,
        avgTtfbMs: 0,
        estimatedCostUsd: 0,
      };
    }
  }

  /**
   * Get daily usage for a range of days (most recent first).
   */
  async getDailyRange(userId: string, days: number = 30): Promise<DailyUsage[]> {
    const results: DailyUsage[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const usage = await this.getDailyUsage(dateStr, userId);
      results.push(usage);
    }

    return results;
  }

  /**
   * Get cumulative usage for a user.
   */
  async getCumulative(userId: string): Promise<CumulativeUsage> {
    try {
      const data = await this.redis.hgetall(cumulativeKey(userId));
      if (!data || Object.keys(data).length === 0) {
        return {
          inputTokens: 0,
          outputTokens: 0,
          sessions: 0,
          turns: 0,
          toolCalls: 0,
          firstSeen: 0,
          lastSeen: 0,
        };
      }

      return {
        inputTokens: parseInt(data.inputTokens || '0'),
        outputTokens: parseInt(data.outputTokens || '0'),
        sessions: parseInt(data.sessions || '0'),
        turns: parseInt(data.turns || '0'),
        toolCalls: parseInt(data.toolCalls || '0'),
        firstSeen: parseInt(data.firstSeen || '0'),
        lastSeen: parseInt(data.lastSeen || '0'),
      };
    } catch {
      return {
        inputTokens: 0,
        outputTokens: 0,
        sessions: 0,
        turns: 0,
        toolCalls: 0,
        firstSeen: 0,
        lastSeen: 0,
      };
    }
  }

  /**
   * Get full usage summary for a user.
   */
  async getUserSummary(userId: string): Promise<UserUsageSummary> {
    const [currentSession, today, cumulative, displayMode] = await Promise.all([
      this.getCurrentSession(userId),
      this.getDailyUsage(todayStr(), userId),
      this.getCumulative(userId),
      this.getDisplayMode(userId),
    ]);

    return { currentSession, today, cumulative, displayMode };
  }

  /**
   * Get overall usage overview across all tracked users.
   */
  async getOverview(): Promise<UsageOverview> {
    try {
      // Scan for all cumulative keys
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, found] = await this.redis.scan(cursor, 'MATCH', 'nexus:usage:cumulative:*', 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...found);
      } while (cursor !== '0');

      let totalInput = 0;
      let totalOutput = 0;
      let totalSessions = 0;
      let totalTurns = 0;

      for (const key of keys) {
        const data = await this.redis.hgetall(key);
        totalInput += parseInt(data.inputTokens || '0');
        totalOutput += parseInt(data.outputTokens || '0');
        totalSessions += parseInt(data.sessions || '0');
        totalTurns += parseInt(data.turns || '0');
      }

      // Estimate cost using sonnet pricing as average
      const estimatedCostUsd = estimateCost('sonnet', totalInput, totalOutput);

      return {
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalSessions,
        totalTurns,
        estimatedCostUsd,
        activeUsers: keys.length,
      };
    } catch {
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalSessions: 0,
        totalTurns: 0,
        estimatedCostUsd: 0,
        activeUsers: 0,
      };
    }
  }

  /**
   * Set the usage display mode for a user.
   */
  async setDisplayMode(userId: string, mode: UsageDisplayMode): Promise<void> {
    if (mode === 'off') {
      await this.redis.del(displayKey(userId));
    } else {
      await this.redis.set(displayKey(userId), mode);
    }
  }

  /**
   * Get the usage display mode for a user (default: 'off').
   */
  async getDisplayMode(userId: string): Promise<UsageDisplayMode> {
    const mode = await this.redis.get(displayKey(userId));
    if (mode && ['off', 'tokens', 'full', 'cost'].includes(mode)) {
      return mode as UsageDisplayMode;
    }
    return 'off';
  }

  /**
   * Format a usage summary as a human-readable string for chat display.
   */
  formatSummary(summary: UserUsageSummary): string {
    const { currentSession, today, cumulative, displayMode } = summary;

    if (displayMode === 'off') {
      return '';
    }

    const lines: string[] = [];

    if (displayMode === 'tokens' || displayMode === 'full') {
      if (currentSession) {
        lines.push(`*Last Session:* ${currentSession.inputTokens.toLocaleString()} in / ${currentSession.outputTokens.toLocaleString()} out (${currentSession.turns} turns)`);
      }
      lines.push(`*Today:* ${today.inputTokens.toLocaleString()} in / ${today.outputTokens.toLocaleString()} out (${today.sessions} sessions)`);
      lines.push(`*All Time:* ${cumulative.inputTokens.toLocaleString()} in / ${cumulative.outputTokens.toLocaleString()} out (${cumulative.sessions} sessions)`);
    }

    if (displayMode === 'full' && currentSession) {
      lines.push(`*TTFB:* ${currentSession.ttfbMs}ms | *Duration:* ${Math.round(currentSession.durationMs / 1000)}s | *Tools:* ${currentSession.toolCalls}`);
    }

    if (displayMode === 'cost' || displayMode === 'full') {
      const todayCost = today.estimatedCostUsd;
      const totalCost = estimateCost('sonnet', cumulative.inputTokens, cumulative.outputTokens);
      lines.push(`*Cost (est.):* Today $${todayCost.toFixed(2)} | All Time $${totalCost.toFixed(2)}`);
    }

    return lines.join('\n');
  }
}
