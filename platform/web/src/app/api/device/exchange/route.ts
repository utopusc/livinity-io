import { NextRequest, NextResponse } from 'next/server';
import { verifyDeviceToken } from '@/lib/device-auth';
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    // 1. Bearer token (Authorization is CORS-allowlisted for /api/:path*)
    const authz = req.headers.get('authorization') ?? '';
    const m = /^Bearer (.+)$/.exec(authz);
    if (!m) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

    let claims;
    try {
      claims = verifyDeviceToken(m[1]);
    } catch {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }

    // 2. Session-liveness gate — the SESS-01 sessionId claim's first real consumer.
    //    If the approving browser session was logged out / expired since approval, reject.
    const live = await pool.query(
      'SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2 AND expires_at > NOW() LIMIT 1',
      [claims.sessionId, claims.userId],
    );
    if (live.rows.length === 0) return NextResponse.json({ error: 'session_revoked' }, { status: 401 });

    // 3. Single-use enforcement — atomic CAS on devices.token_exchanged_at, bound on the
    //    device_id claim (devices.device_id column, NOT devices.id). Zero rows => already used.
    const cas = await pool.query(
      'UPDATE devices SET token_exchanged_at = NOW() WHERE device_id = $1 AND token_exchanged_at IS NULL RETURNING id',
      [claims.deviceId],
    );
    if (cas.rows.length === 0) return NextResponse.json({ error: 'already_exchanged' }, { status: 409 });

    // 4. Mint a BRAND-NEW independent session (never reuse the approving browser's row).
    //    Records THIS request's (the desktop's) IP/UA, so lifecycle is independent.
    const sessionToken = await createSession(
      claims.userId,
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
      req.headers.get('user-agent') ?? undefined,
    );

    // identity for the response body (mirror login/route.ts user shape)
    const u = await pool.query<{ id: string; username: string; email: string; email_verified: boolean }>(
      'SELECT id, username, email, email_verified FROM users WHERE id = $1 LIMIT 1',
      [claims.userId],
    );
    if (u.rows.length === 0) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    const user = u.rows[0];

    // 5. Return the value in the body (authoritative) AND set the cookie (belt-and-suspenders, §4).
    const response = NextResponse.json({
      success: true,
      session_token: sessionToken,
      user: { id: user.id, username: user.username, email: user.email, emailVerified: user.email_verified },
    });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (err) {
    console.error('[device] Exchange error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
