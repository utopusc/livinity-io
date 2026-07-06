import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UNDEFINED_COLUMN = '42703';

type PlanLabel = 'Legacy' | 'Free' | 'Comp' | 'Pro' | 'Trial' | 'Expired' | 'Past due' | 'Canceled' | 'Suspended' | 'None';

interface UserListRow {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
  last_seen_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  legacy_free: boolean | null;
  free_byod: boolean | null;
  suspended_at: string | null;
  comp_until: string | null;
}

/**
 * Derive the display plan label from billing state + suspension + comp grant.
 * Priority: Suspended > Comp (active grant) > Legacy > Stripe state.
 */
function computePlanLabel(row: {
  suspended_at: string | null;
  legacy_free: boolean | null;
  free_byod: boolean | null;
  subscription_status: string | null;
  current_period_end: string | null;
  comp_until: string | null;
}): PlanLabel {
  if (row.suspended_at) return 'Suspended';
  // Active time-boxed comp grant (comp_until in the future) — below Suspended,
  // above Legacy/Trial/Pro. Absent column → comp_until null → skipped.
  if (row.comp_until && new Date(row.comp_until).getTime() > Date.now()) return 'Comp';
  if (row.legacy_free) return 'Legacy';
  // Free BYO-domain tier — user chose Free (no Stripe sub). Above the stripe
  // switch (a free_byod account has null subscription_status → would show None).
  if (row.free_byod) return 'Free';
  // PERIOD-AWARE: the raw column freezes at 'trialing'/'active' when the Stripe
  // webhook misses the transition (July '26 incident: 5 ended trials rendered
  // as "Trial" here for days). Never present a live label past its own period
  // end — show the honest 'Expired' until a Stripe reconcile rewrites the row.
  const periodPassed =
    !!row.current_period_end && new Date(row.current_period_end).getTime() < Date.now();
  switch (row.subscription_status) {
    case 'active': return periodPassed ? 'Expired' : 'Pro';
    case 'trialing': return periodPassed ? 'Expired' : 'Trial';
    case 'past_due': return 'Past due';
    case 'canceled': return 'Canceled';
    default: return 'None';
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const offsetRaw = Number(searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw))) : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const q = (searchParams.get('q') ?? '').trim();
  const hasQuery = q.length > 0;
  // ILIKE pattern with the query escaped so % / _ are treated literally.
  const likePattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  // Build the WHERE clause + ordered param list once so the list + count stay in sync.
  const whereSql = hasQuery ? `WHERE (username ILIKE $1 OR email ILIKE $1)` : '';

  // suspended_at is applied live; comp_until is operator-applied SEPARATELY and
  // may still be absent. Try WITH comp_until; on undefined_column (42703) retry
  // substituting NULL for comp_until (suspended_at stays real). Either way the
  // list keeps working before the comp_until migration.
  async function runList(includeComp: boolean) {
    const compCol = includeComp ? 'comp_until' : 'NULL::timestamptz AS comp_until';
    const baseSelect = `SELECT id, username, email, is_admin, email_verified, created_at,
                               last_seen_at, subscription_status, current_period_end, legacy_free, free_byod, suspended_at, ${compCol}
                          FROM users ${whereSql}
                          ORDER BY created_at DESC
                          LIMIT $${hasQuery ? 2 : 1} OFFSET $${hasQuery ? 3 : 2}`;
    const listParams = hasQuery ? [likePattern, limit, offset] : [limit, offset];

    const countSql = `SELECT COUNT(*)::text AS total FROM users ${whereSql}`;
    const countParams = hasQuery ? [likePattern] : [];

    const [rowsResult, totalResult] = await Promise.all([
      pool.query<UserListRow>(baseSelect, listParams),
      pool.query<{ total: string }>(countSql, countParams),
    ]);
    return { rowsResult, totalResult };
  }

  let result;
  try {
    result = await runList(true);
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_COLUMN) {
      result = await runList(false);
    } else {
      throw err;
    }
  }

  const users = result.rowsResult.rows.map((r) => ({
    ...r,
    suspended: r.suspended_at !== null,
    plan_label: computePlanLabel(r),
  }));

  return NextResponse.json({
    users,
    total: Number(result.totalResult.rows[0].total),
    limit,
    offset,
  });
}
