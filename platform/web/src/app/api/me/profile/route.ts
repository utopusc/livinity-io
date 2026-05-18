/**
 * GET /api/me/profile — Phase 145
 *
 * Returns the authenticated user's username + email so install.sh can
 * auto-resolve the subdomain from --api-key alone (no --subdomain needed).
 *
 * Request:
 *   Headers: X-API-Key: liv_k_xxxxx
 *
 * Response 200: { username: "lucy", email: "lucy@example.com" }
 * Response 401: invalid / missing API key
 * Response 404: api-key valid but user row missing (defensive — should not
 *               happen with FK integrity on api_keys.user_id)
 *
 * Cache: no-store (api-key bearer responses are sensitive + cheap to fetch).
 *
 * NOTE: Rate limiting NOT implemented — same posture as /api/me/tunnel-token
 * (TODO Phase 145+: 10 req/min per api-key once a shared limiter helper lands).
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const result = await pool.query<{ username: string; email: string }>(
    'SELECT username, email FROM users WHERE id = $1',
    [auth.userId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json(
    { username: result.rows[0].username, email: result.rows[0].email },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
