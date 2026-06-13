import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  // signups_daily: last 30 days, gap-filled so every day present
  const signupsDailyP = pool.query<{ date: string; count: string }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            COALESCE(s.cnt, 0)::text AS count
     FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
     LEFT JOIN (
       SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS cnt
       FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
       GROUP BY 1
     ) s ON s.day = d.day::date
     ORDER BY d.day ASC`,
  );

  // cumulative_users: running total over the same 30 days (includes all users created on/before each day)
  const cumulativeP = pool.query<{ date: string; total: string }>(
    `WITH days AS (
       SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
     )
     SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
            (SELECT COUNT(*) FROM users WHERE created_at < days.day + INTERVAL '1 day')::text AS total
     FROM days
     ORDER BY days.day ASC`,
  );

  // installs_daily: last 14 days, action=install, gap-filled
  const installsDailyP = pool.query<{ date: string; count: string }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            COALESCE(i.cnt, 0)::text AS count
     FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
     LEFT JOIN (
       SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS cnt
       FROM install_history
       WHERE action = 'install' AND created_at >= CURRENT_DATE - INTERVAL '13 days'
       GROUP BY 1
     ) i ON i.day = d.day::date
     ORDER BY d.day ASC`,
  );

  // bandwidth_monthly: last 6 calendar months from bandwidth_usage, gap-filled
  const bandwidthMonthlyP = pool.query<{ period: string; bytes: string }>(
    `SELECT to_char(m.month, 'YYYY-MM') AS period,
            COALESCE(b.bytes, 0)::text AS bytes
     FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m(month)
     LEFT JOIN (
       SELECT period_month, SUM(bytes_in + bytes_out) AS bytes
       FROM bandwidth_usage
       GROUP BY period_month
     ) b ON b.period_month = to_char(m.month, 'YYYY-MM')
     ORDER BY m.month ASC`,
  );

  const [signupsDaily, cumulative, installsDaily, bandwidthMonthly] = await Promise.all([
    signupsDailyP,
    cumulativeP,
    installsDailyP,
    bandwidthMonthlyP,
  ]);

  return NextResponse.json({
    signups_daily: signupsDaily.rows.map((r) => ({ date: r.date, count: Number(r.count) })),
    cumulative_users: cumulative.rows.map((r) => ({ date: r.date, total: Number(r.total) })),
    installs_daily: installsDaily.rows.map((r) => ({ date: r.date, count: Number(r.count) })),
    bandwidth_monthly: bandwidthMonthly.rows.map((r) => ({ period: r.period, bytes: Number(r.bytes) })),
  });
}
