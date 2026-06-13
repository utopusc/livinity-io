import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuditRow {
  id: string;
  admin_user_id: string | null;
  admin_username: string | null;
  target_user_id: string | null;
  target_username: string | null;
  action: string;
  detail: unknown;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;

  const userId = searchParams.get('user_id');
  const filterByUser = userId && UUID_RE.test(userId) ? userId : null;

  // admin_actions is operator-applied separately — degrade to an empty list if
  // the table does not exist yet (42P01) rather than 500ing the audit page.
  try {
    const sql = filterByUser
      ? `SELECT id, admin_user_id, admin_username, target_user_id, target_username,
                action, detail, created_at
           FROM admin_actions
           WHERE target_user_id = $2
           ORDER BY created_at DESC
           LIMIT $1`
      : `SELECT id, admin_user_id, admin_username, target_user_id, target_username,
                action, detail, created_at
           FROM admin_actions
           ORDER BY created_at DESC
           LIMIT $1`;
    const params = filterByUser ? [limit, filterByUser] : [limit];
    const res = await pool.query<AuditRow>(sql, params);
    return NextResponse.json({ actions: res.rows, limit });
  } catch (err) {
    console.warn(
      '[admin/audit] select skipped (table may not exist yet):',
      (err as Error)?.message ?? err,
    );
    return NextResponse.json({ actions: [], limit });
  }
}
