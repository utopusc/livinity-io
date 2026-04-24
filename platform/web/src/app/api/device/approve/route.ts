import { NextRequest, NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { approveGrant } from '@/lib/device-auth';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const session = await getSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Phase 14 SESS-01: look up the session row's UUID to bind to the device grant.
    // getSession() returns SessionUser (user data only) — we need sessions.id explicitly.
    const sessionRow = await pool.query<{ id: string }>(
      'SELECT id FROM sessions WHERE token = $1 AND expires_at > NOW() LIMIT 1',
      [sessionToken]
    );
    if (sessionRow.rows.length === 0) {
      // Should be impossible (getSession just succeeded), but close the race window explicitly
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    const sessionId = sessionRow.rows[0].id;

    const body = await req.json();
    const { user_code } = body;

    if (!user_code || typeof user_code !== 'string') {
      return NextResponse.json({ error: 'user_code is required' }, { status: 400 });
    }

    // Phase 14 SESS-01: pass sessionId so approveGrant persists it into device_grants.session_id
    const result = await approveGrant(user_code, session.userId, sessionId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      deviceName: result.deviceInfo?.deviceName,
      platform: result.deviceInfo?.platform,
    });
  } catch (err) {
    console.error('[device] Approve error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
