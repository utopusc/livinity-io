/**
 * Broker auth + user resolution — Phase 147
 *
 * Accepts either `Authorization: Bearer liv_k_*` (LLM-tool convention) OR
 * `X-API-Key: liv_k_*` (livinityd convention). Looks up the api-key against
 * Supabase api_keys, returns userId + username so the broker route can
 * proxy to <username>.livinity.io/u/<userId>/...
 */
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';

export interface BrokerAuthOk {
  ok: true;
  userId: string;
  username: string;
  apiKey: string; // pass-through to downstream livinityd Bearer auth (Phase 59)
}

export interface BrokerAuthErr {
  ok: false;
  status: number;
  error: string;
}

export type BrokerAuthResult = BrokerAuthOk | BrokerAuthErr;

function extractApiKey(req: Request): string | null {
  const bearer = req.headers.get('authorization');
  if (bearer) {
    const m = bearer.match(/^Bearer\s+(liv_k_\S+)/i);
    if (m) return m[1];
  }
  const xKey = req.headers.get('x-api-key');
  if (xKey && xKey.startsWith('liv_k_')) return xKey;
  return null;
}

export async function authenticateBrokerRequest(req: Request): Promise<BrokerAuthResult> {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      error: 'missing api-key — send Authorization: Bearer liv_k_… or X-API-Key',
    };
  }

  // Full table scan + bcrypt compare. OK at current scale (single-digit users).
  // Future optimisation: SHA256(apiKey) lookup index per livinity-broker/auth.ts.
  const result = await pool.query<{ user_id: string; key_hash: string }>(
    'SELECT user_id, key_hash FROM api_keys',
  );
  for (const row of result.rows) {
    const match = await bcrypt.compare(apiKey, row.key_hash);
    if (match) {
      const userRow = await pool.query<{ username: string }>(
        'SELECT username FROM users WHERE id = $1',
        [row.user_id],
      );
      if (userRow.rows.length === 0) {
        return { ok: false, status: 401, error: 'api-key references missing user' };
      }
      return {
        ok: true,
        userId: row.user_id,
        username: userRow.rows[0].username,
        apiKey,
      };
    }
  }
  return { ok: false, status: 401, error: 'invalid api-key' };
}
