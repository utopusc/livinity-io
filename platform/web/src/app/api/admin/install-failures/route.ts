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
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw))) : DEFAULT_LIMIT;

  const result = await pool.query<{
    id: string;
    user_id: string | null;
    username: string | null;
    app_id: string | null;
    app_slug: string | null;
    action: string;
    instance_name: string | null;
    created_at: string;
  }>(
    `SELECT ih.id, ih.user_id, u.username,
            ih.app_id, a.slug AS app_slug,
            ih.action, ih.instance_name, ih.created_at
     FROM install_history ih
     LEFT JOIN users u ON u.id = ih.user_id
     LEFT JOIN apps a ON a.id = ih.app_id
     WHERE ih.action LIKE '%failed%' OR ih.action LIKE '%error%'
     ORDER BY ih.created_at DESC
     LIMIT $1`,
    [limit],
  );

  return NextResponse.json({
    failures: result.rows,
    limit,
  });
}
