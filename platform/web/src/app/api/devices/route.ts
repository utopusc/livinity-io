import { NextRequest, NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';

/**
 * GET /api/devices
 *
 * Phase 11 OWN-03: Returns the list of devices owned by the authenticated
 * session user. Unauthenticated requests get 401. Admin users see ONLY their
 * own devices — admin-wide cross-user listing is Phase 16 (GET /api/admin/devices).
 */
export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const session = await getSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Phase 11 OWN-03: WHERE user_id = session.userId enforces per-request ownership
    // at the REST layer (defense in depth — tRPC already filters on the livinityd side).
    const result = await pool.query<{
      device_id: string;
      device_name: string;
      platform: string;
      created_at: Date;
      last_seen: Date | null;
      revoked: boolean;
    }>(
      `SELECT device_id, device_name, platform, created_at, last_seen, revoked
       FROM devices
       WHERE user_id = $1 AND revoked = false
       ORDER BY created_at DESC`,
      [session.userId],
    );

    return NextResponse.json({
      devices: result.rows.map((row) => ({
        deviceId: row.device_id,
        deviceName: row.device_name,
        platform: row.platform,
        createdAt: row.created_at.toISOString(),
        lastSeen: row.last_seen ? row.last_seen.toISOString() : null,
        revoked: row.revoked,
      })),
    });
  } catch (err) {
    console.error('[devices] List error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
