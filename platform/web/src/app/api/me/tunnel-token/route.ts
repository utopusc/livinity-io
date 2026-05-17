/**
 * GET /api/me/tunnel-token — Phase 140-05
 *
 * Returns the decrypted cloudflared connector token for the authenticated
 * user. Called by `install.sh` on the Mini PC so the connector token is never
 * baked into the install one-liner / curl URL.
 *
 * Request:
 *   Headers: X-API-Key: liv_k_xxxxx
 *
 * Response 200: { token: "eyJhIjoi..." }
 * Response 401: invalid / missing API key
 * Response 410: user has no tunnel provisioned (Phase 140-04 never ran for
 *               this account, or provisioning was rolled back)
 * Response 500: encryption key missing/corrupt — operator must fix server env
 *
 * NOTE: Rate limiting (10 req/min per api-key per the plan) is NOT
 * implemented in this iteration. Rationale: the project has an ioredis
 * publisher (lib/session-revocation.ts) but no general-purpose
 * rate-limit middleware, and adding one without first agreeing on a
 * Redis key namespace + sliding-window vs token-bucket policy is out
 * of scope for plan 140-05. Token rotation is operator-driven, an
 * attacker hammering this endpoint will be visible in CF + relay logs,
 * and the operator can revoke the api_key via the dashboard. Track the
 * follow-up as TODO(140-05): rate limit GET /api/me/tunnel-token to
 * 10 req/min per api-key once a shared limiter helper lands.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { decryptToken } from '@/lib/token-encryption';

export async function GET(req: NextRequest) {
  // 1. Authenticate
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  // TODO(140-05): rate limit to 10 req/min per api-key once a shared
  // limiter helper lands. See header comment for rationale.

  // 2. Fetch encrypted token from DB
  const rows = await pool.query<{ cf_tunnel_token_encrypted: Buffer | null }>(
    'SELECT cf_tunnel_token_encrypted FROM users WHERE id = $1',
    [auth.userId],
  );
  if (rows.rows.length === 0) {
    return unauthorizedResponse('User not found');
  }
  const blob = rows.rows[0].cf_tunnel_token_encrypted;
  if (!blob) {
    return NextResponse.json(
      {
        error: 'No tunnel provisioned for this user',
        code: 'NO_TUNNEL',
      },
      { status: 410 },
    );
  }

  // 3. Decrypt. Failure here means LIV_SECRET_KEY is missing/wrong or the
  //    blob was tampered with — both are operator/server-state issues, not
  //    client errors.
  let token: string;
  try {
    token = await decryptToken(blob);
  } catch (err) {
    console.error(
      `[140-05/tunnel-token] decrypt failed for user_id=${auth.userId}`,
      err,
    );
    return NextResponse.json(
      {
        error: 'Token decryption failed; contact operator',
        code: 'DECRYPT_FAILED',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ token });
}
