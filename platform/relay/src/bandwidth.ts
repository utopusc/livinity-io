/**
 * Bandwidth Tracking & Quota Enforcement
 *
 * Per-user bandwidth is tracked in Redis using atomic INCRBY counters.
 * Counters are periodically flushed to PostgreSQL for persistence.
 * Quota enforcement checks Redis counters before proxying requests.
 */

import type { Redis } from 'ioredis';
import type pg from 'pg';
import { config } from './config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns "YYYY-MM" for the current month. */
function currentMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const EXPIRY_SECONDS = 90 * 24 * 60 * 60; // 90 days

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track bandwidth usage for a user.
 * Uses Redis INCRBY for atomic, lock-free counting.
 */
export async function trackBandwidth(
  redis: Redis,
  userId: string,
  direction: 'in' | 'out',
  bytes: number,
): Promise<void> {
  if (bytes <= 0) return;
  const key = `bandwidth:${userId}:${direction}:${currentMonth()}`;
  await redis.pipeline().incrby(key, bytes).expire(key, EXPIRY_SECONDS).exec();
}

/**
 * Check whether a user is within their monthly bandwidth quota.
 */
export async function checkQuota(
  redis: Redis,
  userId: string,
): Promise<{ allowed: boolean; usedBytes: number; limitBytes: number }> {
  const month = currentMonth();
  const inKey = `bandwidth:${userId}:in:${month}`;
  const outKey = `bandwidth:${userId}:out:${month}`;

  const [inVal, outVal] = await redis.mget(inKey, outKey);
  const inBytes = parseInt(inVal ?? '0', 10) || 0;
  const outBytes = parseInt(outVal ?? '0', 10) || 0;
  const total = inBytes + outBytes;

  return {
    allowed: total < config.FREE_TIER_BYTES,
    usedBytes: total,
    limitBytes: config.FREE_TIER_BYTES,
  };
}

/**
 * Start periodic flush of Redis bandwidth counters to PostgreSQL.
 * Returns the interval handle for cleanup.
 */
export function startBandwidthFlush(redis: Redis, pool: pg.Pool): ReturnType<typeof setInterval> {
  console.log(`[relay] Bandwidth flush started (every ${config.BANDWIDTH_FLUSH_INTERVAL_MS / 1000}s)`);
  return setInterval(() => {
    flushBandwidthToPostgres(redis, pool).catch((err) => {
      console.error('[relay] Bandwidth flush error:', err);
    });
  }, config.BANDWIDTH_FLUSH_INTERVAL_MS);
}

/**
 * Stop the bandwidth flush interval.
 */
export function stopBandwidthFlush(interval: ReturnType<typeof setInterval>): void {
  clearInterval(interval);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Flush Redis bandwidth counters to PostgreSQL.
 *
 * For each counter key:
 * 1. Read the current value
 * 2. Upsert into bandwidth_usage table
 * 3. DECRBY the flushed amount (handles concurrent writes safely)
 */
async function flushBandwidthToPostgres(redis: Redis, pool: pg.Pool): Promise<void> {
  const keys = await redis.keys('bandwidth:*');
  if (keys.length === 0) return;

  let flushed = 0;

  for (const key of keys) {
    const raw = await redis.get(key);
    const bytes = parseInt(raw ?? '0', 10) || 0;
    if (bytes === 0) continue;

    // Parse key: bandwidth:{userId}:{direction}:{month}
    const parts = key.split(':');
    if (parts.length !== 4) continue;

    const [, userId, direction, month] = parts;
    const column = direction === 'in' ? 'bytes_in' : 'bytes_out';

    try {
      await pool.query(
        `INSERT INTO bandwidth_usage (user_id, period_month, ${column})
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, period_month)
         DO UPDATE SET ${column} = bandwidth_usage.${column} + $3,
                       updated_at = NOW()`,
        [userId, month, bytes],
      );

      // DECRBY instead of DEL to handle concurrent writes between GET and now
      await redis.decrby(key, bytes);
      flushed++;
    } catch (err) {
      console.error(`[relay] Flush failed for ${key}:`, err);
      // Non-critical -- continue with other keys
    }
  }

  if (flushed > 0) {
    console.log(`[relay] Flushed bandwidth: ${flushed} keys processed`);
  }
}
