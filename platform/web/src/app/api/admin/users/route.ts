import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const offsetRaw = Number(searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw))) : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const [rowsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      username: string;
      email: string | null;
      is_admin: boolean;
      email_verified: boolean;
      created_at: string;
      last_seen_at: string | null;
    }>(
      `SELECT id, username, email, is_admin, email_verified, created_at, last_seen_at
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM users'),
  ]);

  return NextResponse.json({
    users: rowsResult.rows,
    total: Number(totalResult.rows[0].total),
    limit,
    offset,
  });
}
