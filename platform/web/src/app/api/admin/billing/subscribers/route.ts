import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const MONTHLY_PRICE_USD = 7.99;

type SubscriberRow = {
  user_id: string;
  username: string | null;
  email: string | null;
  subscription_status: string | null;
  legacy_free: boolean;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  past_due_since: string | null;
  access_revoked_at: string | null;
  created_at: string;
  has_tunnel: boolean;
};

function clampLimit(raw: string | null, def: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(500, Math.max(1, Math.floor(n)));
}

function planLabel(row: SubscriberRow): string {
  if (row.legacy_free) return 'Legacy free';
  switch (row.subscription_status) {
    case 'active':
      return 'Pro';
    case 'trialing':
      return 'Trial';
    case 'past_due':
      return 'Past due';
    case 'canceled':
      return 'Canceled';
    default:
      return 'None';
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limit = clampLimit(searchParams.get('limit'), 200);

  // Billing priority order: active, trialing, past_due, then others; then created_at desc.
  const orderBy = `
    CASE subscription_status
      WHEN 'active' THEN 0
      WHEN 'trialing' THEN 1
      WHEN 'past_due' THEN 2
      WHEN 'canceled' THEN 3
      ELSE 4
    END ASC,
    created_at DESC`;

  const filtered = await pool.query<SubscriberRow>(
    `SELECT id AS user_id, username, email, subscription_status,
            COALESCE(legacy_free, false) AS legacy_free,
            COALESCE(cancel_at_period_end, false) AS cancel_at_period_end,
            current_period_end, past_due_since, access_revoked_at, created_at,
            (cf_tunnel_id IS NOT NULL) AS has_tunnel
     FROM users
     WHERE stripe_price_id IS NOT NULL
        OR subscription_status IS NOT NULL
        OR legacy_free = true
        OR access_revoked_at IS NOT NULL
     ORDER BY ${orderBy}
     LIMIT $1`,
    [limit],
  );

  let rows = filtered.rows;
  // Fall back to all users newest-first if the focused filter is too sparse.
  if (rows.length < 5) {
    const fallback = await pool.query<SubscriberRow>(
      `SELECT id AS user_id, username, email, subscription_status,
              COALESCE(legacy_free, false) AS legacy_free,
              COALESCE(cancel_at_period_end, false) AS cancel_at_period_end,
              current_period_end, past_due_since, access_revoked_at, created_at,
              (cf_tunnel_id IS NOT NULL) AS has_tunnel
       FROM users
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    rows = fallback.rows;
  }

  const subscribers = rows.map((r) => ({
    user_id: r.user_id,
    username: r.username,
    email: r.email,
    subscription_status: r.subscription_status,
    plan_label: planLabel(r),
    legacy_free: r.legacy_free,
    cancel_at_period_end: r.cancel_at_period_end,
    current_period_end: r.current_period_end,
    past_due_since: r.past_due_since,
    access_revoked_at: r.access_revoked_at,
    mrr_usd: r.subscription_status === 'active' ? MONTHLY_PRICE_USD : 0,
    created_at: r.created_at,
    has_tunnel: r.has_tunnel,
  }));

  return NextResponse.json({ subscribers, limit });
}
