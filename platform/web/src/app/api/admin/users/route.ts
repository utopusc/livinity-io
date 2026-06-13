import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UNDEFINED_COLUMN = '42703';

type PlanLabel = 'Legacy' | 'Pro' | 'Trial' | 'Past due' | 'Canceled' | 'Suspended' | 'None';

interface UserListRow {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
  last_seen_at: string | null;
  subscription_status: string | null;
  legacy_free: boolean | null;
  suspended_at: string | null;
}

/** Derive the display plan label from billing state + suspension. */
function computePlanLabel(row: { suspended_at: string | null; legacy_free: boolean | null; subscription_status: string | null }): PlanLabel {
  if (row.suspended_at) return 'Suspended';
  if (row.legacy_free) return 'Legacy';
  switch (row.subscription_status) {
    case 'active': return 'Pro';
    case 'trialing': return 'Trial';
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

  // suspended_at is operator-applied separately. Try WITH it; on undefined_column
  // (42703) retry WITHOUT it and synthesize suspended_at=null (suspended=false).
  async function runList(includeSuspended: boolean) {
    const suspendedCol = includeSuspended ? 'suspended_at' : 'NULL::timestamptz AS suspended_at';
    const baseSelect = `SELECT id, username, email, is_admin, email_verified, created_at,
                               last_seen_at, subscription_status, legacy_free, ${suspendedCol}
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
