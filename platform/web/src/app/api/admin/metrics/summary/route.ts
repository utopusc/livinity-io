import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const result = await pool.query<{
    users_total: string;
    users_active_24h: string;
    tunnels_online: string;
    installs_total: string;
    installs_failed_24h: string;
    bandwidth_total_bytes: string;
    apps_total: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM users)::text AS users_total,
       (SELECT COUNT(*) FROM users WHERE last_seen_at > NOW() - INTERVAL '24 hours')::text AS users_active_24h,
       (SELECT COUNT(*) FROM tunnel_connections WHERE status = 'connected')::text AS tunnels_online,
       (SELECT COUNT(*) FROM install_history)::text AS installs_total,
       (SELECT COUNT(*) FROM install_history WHERE action LIKE '%failed%' AND created_at > NOW() - INTERVAL '24 hours')::text AS installs_failed_24h,
       (SELECT COALESCE(SUM(bytes_in + bytes_out), 0) FROM bandwidth_usage)::text AS bandwidth_total_bytes,
       (SELECT COUNT(*) FROM apps)::text AS apps_total
    `,
  );

  const row = result.rows[0];
  return NextResponse.json({
    users_total: Number(row.users_total),
    users_active_24h: Number(row.users_active_24h),
    tunnels_online: Number(row.tunnels_online),
    installs_total: Number(row.installs_total),
    installs_failed_24h: Number(row.installs_failed_24h),
    bandwidth_total_bytes: Number(row.bandwidth_total_bytes),
    apps_total: Number(row.apps_total),
  });
}
