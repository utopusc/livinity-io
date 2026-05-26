import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctxParam: RouteContext) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParam.params;

  const result = await pool.query(
    `SELECT ic.id, ic.user_id, u.username, ic.app_id, a.slug AS app_slug, a.name AS app_name,
            ic.instance_name, ic.status, ic.params, ic.result_json,
            ic.created_at, ic.started_at, ic.completed_at, ic.requested_by
       FROM install_commands ic
       LEFT JOIN users u ON u.id = ic.user_id
       LEFT JOIN apps a ON a.id = ic.app_id
       WHERE ic.id = $1
       LIMIT 1`,
    [id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

export async function DELETE(req: NextRequest, ctxParam: RouteContext) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParam.params;

  // Only queued commands can be cancelled.
  const result = await pool.query<{ id: string; status: string }>(
    `UPDATE install_commands
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND status = 'queued'
       RETURNING id, status`,
    [id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: 'Cannot cancel: command not found, already running, or already completed' },
      { status: 409 },
    );
  }

  return NextResponse.json({ id: result.rows[0].id, status: result.rows[0].status });
}
