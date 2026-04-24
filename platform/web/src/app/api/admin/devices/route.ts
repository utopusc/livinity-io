import { NextRequest, NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';

/**
 * GET /api/admin/devices — Phase 16 ADMIN-01
 *
 * Returns every device across every user with owner username, platform, online
 * status (derived from last_seen within 60s), and timestamps.
 *
 * Admin detection: platform/web has no explicit role column, so the historical
 * convention from migration 0007 is adopted — the "admin" is the user with the
 * smallest `created_at` (i.e., the first registered user, who bootstrapped the
 * deployment). Every other authenticated user receives 403.
 *
 * This is defense-in-depth: the primary enforcement of ADMIN-01 lives on the
 * livinityd side via tRPC `devicesAdmin.adminListAll` (adminProcedure gate
 * against the local LivOS users.role column). This REST endpoint covers the
 * platform-cloud layer so a browser call bypassing the LivOS UI still cannot
 * enumerate devices without being the platform admin.
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

    // Admin check — is this session's user the oldest (bootstrap) user?
    // Matches migration 0007's "oldest admin" fallback convention.
    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM users ORDER BY created_at ASC LIMIT 1`,
    );
    const platformAdminId = adminRow.rows[0]?.id;
    if (!platformAdminId || platformAdminId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Cross-user listing: every non-revoked device with owner username.
    // Online = last_seen within 60 seconds (matches relay heartbeat cadence).
    const result = await pool.query<{
      device_id: string;
      device_name: string;
      platform: string;
      created_at: Date;
      last_seen: Date | null;
      revoked: boolean;
      user_id: string;
      username: string;
    }>(
      `SELECT d.device_id, d.device_name, d.platform, d.created_at, d.last_seen, d.revoked,
              d.user_id, u.username
       FROM devices d
       JOIN users u ON u.id = d.user_id
       WHERE d.revoked = false
       ORDER BY d.last_seen DESC NULLS LAST, d.created_at DESC`,
    );

    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 60_000;

    return NextResponse.json({
      devices: result.rows.map((row) => ({
        deviceId: row.device_id,
        deviceName: row.device_name,
        platform: row.platform,
        ownerUserId: row.user_id,
        ownerUsername: row.username,
        createdAt: row.created_at.toISOString(),
        lastSeen: row.last_seen ? row.last_seen.toISOString() : null,
        online: row.last_seen ? (now - row.last_seen.getTime()) < ONLINE_THRESHOLD_MS : false,
      })),
    });
  } catch (err) {
    console.error('[admin/devices] List error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
