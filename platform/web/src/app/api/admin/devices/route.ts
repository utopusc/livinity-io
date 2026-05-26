import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-admin';
import pool from '@/lib/db';

/**
 * GET /api/admin/devices — Phase 16 ADMIN-01 (unified P212 auth)
 *
 * Returns every device across every user with owner username, platform, online
 * status (derived from last_seen within 60s), and timestamps.
 *
 * Auth: requireAdmin() — accepts EITHER session cookie OR x-api-key, both
 * gated by users.is_admin=true (Phase 212). Replaces the legacy "oldest
 * user is admin" heuristic from migration 0007.
 *
 * This is defense-in-depth: the primary enforcement of ADMIN-01 lives on the
 * livinityd side via tRPC `devicesAdmin.adminListAll` (adminProcedure gate
 * against the local LivOS users.role column). This REST endpoint covers the
 * platform-cloud layer so a browser call bypassing the LivOS UI still cannot
 * enumerate devices without being the platform admin.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdmin(req);
    if (ctx instanceof NextResponse) return ctx;

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
