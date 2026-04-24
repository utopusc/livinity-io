import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { publishSessionRevoked } from '@/lib/session-revocation';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    // Phase 14 SESS-03: resolve sessions.id BEFORE deletion so we can broadcast
    // the revocation to the relay. DeviceConnection.sessionId at the relay
    // (from Plan 14-01) is the sessions.id UUID — that's the matching key.
    let sessionId: string | null = null;
    try {
      const result = await pool.query<{ id: string }>(
        'SELECT id FROM sessions WHERE token = $1 LIMIT 1',
        [token]
      );
      sessionId = result.rows[0]?.id ?? null;
    } catch (err) {
      // If the lookup fails, still proceed with deleteSession — logout's primary
      // contract is to invalidate the cookie; pub/sub is best-effort.
      console.error('[logout] Failed to resolve sessionId before delete:', err);
    }

    await deleteSession(token);

    // Phase 14 SESS-03: broadcast revocation so the relay can close any
    // active device bridges bound to this session within one Redis round-trip.
    // Fire-and-forget; publish failures inside publishSessionRevoked are swallowed.
    if (sessionId) {
      await publishSessionRevoked(sessionId);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', { httpOnly: true, secure: true, path: '/', maxAge: 0 });
  return response;
}
