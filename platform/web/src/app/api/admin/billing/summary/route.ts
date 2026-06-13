import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const MONTHLY_PRICE_USD = 7.99;

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const countsP = pool.query<{
    trialing: string;
    active: string;
    past_due: string;
    canceled: string;
    inactive: string;
    legacy_free: string;
    revoked: string;
    cancelling: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'trialing')::text AS trialing,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'active')::text AS active,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'past_due')::text AS past_due,
       (SELECT COUNT(*) FROM users WHERE subscription_status = 'canceled')::text AS canceled,
       (SELECT COUNT(*) FROM users WHERE subscription_status IS NULL AND legacy_free = false)::text AS inactive,
       (SELECT COUNT(*) FROM users WHERE legacy_free = true)::text AS legacy_free,
       (SELECT COUNT(*) FROM users WHERE access_revoked_at IS NOT NULL)::text AS revoked,
       (SELECT COUNT(*) FROM users WHERE cancel_at_period_end = true AND subscription_status IN ('active', 'trialing'))::text AS cancelling
    `,
  );

  const trialsEndingP = pool.query<{
    user_id: string;
    username: string | null;
    email: string | null;
    current_period_end: string | null;
    days_left: string | null;
  }>(
    `SELECT id AS user_id, username, email,
            current_period_end,
            CEIL(EXTRACT(EPOCH FROM (current_period_end - NOW())) / 86400.0)::int::text AS days_left
     FROM users
     WHERE subscription_status = 'trialing'
       AND current_period_end IS NOT NULL
       AND current_period_end < NOW() + INTERVAL '7 days'
     ORDER BY current_period_end ASC
     LIMIT 50`,
  );

  const recentlyCanceledP = pool.query<{
    user_id: string;
    username: string | null;
    email: string | null;
    current_period_end: string | null;
    access_revoked_at: string | null;
  }>(
    `SELECT id AS user_id, username, email, current_period_end, access_revoked_at
     FROM users
     WHERE subscription_status = 'canceled' OR access_revoked_at IS NOT NULL
     ORDER BY COALESCE(access_revoked_at, current_period_end, created_at) DESC
     LIMIT 10`,
  );

  const [counts, trialsEnding, recentlyCanceled] = await Promise.all([
    countsP,
    trialsEndingP,
    recentlyCanceledP,
  ]);

  const c = counts.rows[0];
  const active = Number(c.active);
  const trialing = Number(c.trialing);
  const canceled = Number(c.canceled);
  const mrr_usd = Math.round(active * MONTHLY_PRICE_USD * 100) / 100;
  const arr_usd = Math.round(mrr_usd * 12 * 100) / 100;
  const convDenom = active + canceled;
  const conversion_rate = convDenom > 0 ? Math.round((active / convDenom) * 100) : null;

  return NextResponse.json({
    counts: {
      trialing,
      active,
      past_due: Number(c.past_due),
      canceled,
      inactive: Number(c.inactive),
      legacy_free: Number(c.legacy_free),
      revoked: Number(c.revoked),
      cancelling: Number(c.cancelling),
    },
    mrr_usd,
    arr_usd,
    paying: active,
    trialing,
    conversion_rate,
    trials_ending: trialsEnding.rows.map((r) => ({
      user_id: r.user_id,
      username: r.username,
      email: r.email,
      current_period_end: r.current_period_end,
      days_left: r.days_left === null ? null : Number(r.days_left),
    })),
    recently_canceled: recentlyCanceled.rows.map((r) => ({
      user_id: r.user_id,
      username: r.username,
      email: r.email,
      current_period_end: r.current_period_end,
      access_revoked_at: r.access_revoked_at,
    })),
  });
}
