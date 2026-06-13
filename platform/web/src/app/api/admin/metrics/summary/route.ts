import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const MONTHLY_PRICE_USD = 7.99;

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
    signups_today: string;
    signups_7d: string;
    signups_30d: string;
    subs_trialing: string;
    subs_active: string;
    subs_past_due: string;
    subs_canceled: string;
    subs_cancelling: string;
    legacy_free_count: string;
    revoked_count: string;
    trials_ending_3d: string;
    provisioned_total: string;
    bandwidth_this_month_bytes: string;
    installs_24h: string;
    installs_7d: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM users)::text AS users_total,
       (SELECT COUNT(*) FROM users WHERE last_seen_at > NOW() - INTERVAL '24 hours')::text AS users_active_24h,
       (SELECT COUNT(*) FROM tunnel_connections WHERE status = 'connected')::text AS tunnels_online,
       (SELECT COUNT(*) FROM install_history)::text AS installs_total,
       (SELECT COUNT(*) FROM install_history WHERE action LIKE '%failed%' AND created_at > NOW() - INTERVAL '24 hours')::text AS installs_failed_24h,
       (SELECT COALESCE(SUM(bytes_in + bytes_out), 0) FROM bandwidth_usage)::text AS bandwidth_total_bytes,
       (SELECT COUNT(*) FROM apps)::text AS apps_total,
       (SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('day', NOW()))::text AS signups_today,
       (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days')::text AS signups_7d,
       (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days')::text AS signups_30d,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'trialing')::text AS subs_trialing,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'active')::text AS subs_active,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'past_due')::text AS subs_past_due,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'canceled')::text AS subs_canceled,
       (SELECT COUNT(*) FROM users WHERE cancel_at_period_end = true AND subscription_status IN ('active', 'trialing'))::text AS subs_cancelling,
       (SELECT COUNT(*) FROM users WHERE legacy_free = true)::text AS legacy_free_count,
       (SELECT COUNT(*) FROM users WHERE access_revoked_at IS NOT NULL)::text AS revoked_count,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'trialing' AND current_period_end < NOW() + INTERVAL '3 days')::text AS trials_ending_3d,
       (SELECT COUNT(*) FROM users WHERE cf_provisioned_at IS NOT NULL)::text AS provisioned_total,
       (SELECT COALESCE(SUM(bytes_in + bytes_out), 0) FROM bandwidth_usage WHERE period_month = to_char(NOW(), 'YYYY-MM'))::text AS bandwidth_this_month_bytes,
       (SELECT COUNT(*) FROM install_history WHERE action = 'install' AND created_at > NOW() - INTERVAL '24 hours')::text AS installs_24h,
       (SELECT COUNT(*) FROM install_history WHERE action = 'install' AND created_at > NOW() - INTERVAL '7 days')::text AS installs_7d
    `,
  );

  const row = result.rows[0];
  const subs_active = Number(row.subs_active);
  const mrr_usd = Math.round(subs_active * MONTHLY_PRICE_USD * 100) / 100;
  const arr_usd = Math.round(mrr_usd * 12 * 100) / 100;

  return NextResponse.json({
    users_total: Number(row.users_total),
    users_active_24h: Number(row.users_active_24h),
    tunnels_online: Number(row.tunnels_online),
    installs_total: Number(row.installs_total),
    installs_failed_24h: Number(row.installs_failed_24h),
    bandwidth_total_bytes: Number(row.bandwidth_total_bytes),
    apps_total: Number(row.apps_total),
    signups_today: Number(row.signups_today),
    signups_7d: Number(row.signups_7d),
    signups_30d: Number(row.signups_30d),
    subs_trialing: Number(row.subs_trialing),
    subs_active,
    subs_past_due: Number(row.subs_past_due),
    subs_canceled: Number(row.subs_canceled),
    subs_cancelling: Number(row.subs_cancelling),
    legacy_free_count: Number(row.legacy_free_count),
    revoked_count: Number(row.revoked_count),
    trials_ending_3d: Number(row.trials_ending_3d),
    mrr_usd,
    arr_usd,
    provisioned_total: Number(row.provisioned_total),
    bandwidth_this_month_bytes: Number(row.bandwidth_this_month_bytes),
    installs_24h: Number(row.installs_24h),
    installs_7d: Number(row.installs_7d),
  });
}
