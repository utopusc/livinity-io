/**
 * POST /api/me/tunnel-connections/connect — CARRY-P212-TUNNEL-PERSIST
 *
 * Mini PC livinityd calls this when tunnel-presence successfully
 * subscribes to its Supabase Realtime channel. Body optional:
 *   { session_id?: string, client_version?: string }
 *
 * Inserts a tunnel_connections row with status='connected' and
 * returns the id so the caller can POST /[id]/disconnect on close.
 *
 * Gated by x-api-key (same pattern as /api/me/realtime-token).
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

type Body = {
  session_id?: string;
  client_version?: string;
};

function getClientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) return unauthorizedResponse(auth.error);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Empty body is OK — session_id auto-generated below.
  }

  const sessionId =
    body.session_id && /^[a-zA-Z0-9_-]{6,128}$/.test(body.session_id)
      ? body.session_id
      : `presence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const clientIp = getClientIp(req);

  const result = await pool.query<{
    id: string;
    connected_at: string;
  }>(
    `INSERT INTO tunnel_connections
       (user_id, session_id, status, connected_at, client_version, client_ip)
     VALUES ($1, $2, 'connected', NOW(), $3, $4::inet)
     ON CONFLICT (user_id) DO UPDATE SET
       session_id = EXCLUDED.session_id,
       status = 'connected',
       connected_at = NOW(),
       disconnected_at = NULL,
       client_version = EXCLUDED.client_version,
       client_ip = EXCLUDED.client_ip
     RETURNING id, connected_at`,
    [auth.userId, sessionId, body.client_version ?? null, clientIp],
  );

  return NextResponse.json({
    id: result.rows[0].id,
    session_id: sessionId,
    connected_at: result.rows[0].connected_at,
  });
}
