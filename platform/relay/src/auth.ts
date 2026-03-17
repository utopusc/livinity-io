/**
 * API Key Authentication
 *
 * Verifies tunnel client API keys using prefix-based lookup + bcrypt comparison.
 * Results are cached in Redis to avoid DB lookups on every connection.
 */

import bcrypt from 'bcryptjs';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { config } from './config.js';

/** Cached user info returned on successful authentication */
export interface AuthResult {
  userId: string;
  username: string;
}

/**
 * Verify an API key against the database.
 *
 * Flow:
 *   1. Extract prefix (first 14 chars) from the key
 *   2. Check Redis cache for a previously verified result
 *   3. If not cached, query api_keys JOIN users by prefix
 *   4. bcrypt.compare the full key against the stored hash
 *   5. On success: cache result in Redis, update last_used_at, return user info
 *   6. On failure: return null
 */
export async function verifyApiKey(
  apiKey: string,
  pool: pg.Pool,
  redis: Redis,
): Promise<AuthResult | null> {
  if (!apiKey || apiKey.length < 15) return null;

  const prefix = apiKey.substring(0, 14);
  const cacheKey = `auth:cache:${prefix}`;

  // 1. Check Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as AuthResult;
    } catch {
      // Corrupted cache entry — fall through to DB
      await redis.del(cacheKey);
    }
  }

  // 2. Query DB by prefix
  const result = await pool.query<{
    key_hash: string;
    user_id: string;
    username: string;
    key_id: string;
  }>(
    `SELECT ak.key_hash, ak.id AS key_id, u.id AS user_id, u.username
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.prefix = $1
     LIMIT 1`,
    [prefix],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // 3. bcrypt compare
  const match = await bcrypt.compare(apiKey, row.key_hash);
  if (!match) return null;

  // 4. Cache successful auth
  const authResult: AuthResult = {
    userId: row.user_id,
    username: row.username,
  };

  await redis.set(cacheKey, JSON.stringify(authResult), 'EX', config.AUTH_CACHE_TTL_S);

  // 5. Update last_used_at (fire-and-forget — don't block auth)
  pool
    .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.key_id])
    .catch(() => {
      // Non-critical — swallow errors
    });

  return authResult;
}
