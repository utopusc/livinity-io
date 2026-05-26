import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

type InstallRequestBody = {
  user_id?: string;     // target Mini PC user; defaults to requesting admin
  app_slug?: string;    // OR app_id
  app_id?: string;
  instance_name?: string | null;
  params?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  let body: InstallRequestBody;
  try {
    body = (await req.json()) as InstallRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Resolve target user (defaults to admin's own user_id — typical case for
  // single-operator Mini PC).
  const userId = body.user_id ?? ctx.userId;

  // Resolve app_id (accept either app_id or app_slug).
  let appId = body.app_id ?? null;
  if (!appId && body.app_slug) {
    const r = await pool.query<{ id: string }>('SELECT id FROM apps WHERE slug = $1 LIMIT 1', [body.app_slug]);
    if (r.rows.length === 0) {
      return NextResponse.json({ error: `Unknown app slug: ${body.app_slug}` }, { status: 404 });
    }
    appId = r.rows[0].id;
  }
  if (!appId) {
    return NextResponse.json({ error: 'Must provide app_id or app_slug' }, { status: 400 });
  }

  const result = await pool.query<{
    id: string;
    status: string;
    created_at: string;
  }>(
    `INSERT INTO install_commands (user_id, app_id, instance_name, params, requested_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, status, created_at`,
    [userId, appId, body.instance_name ?? null, JSON.stringify(body.params ?? {}), ctx.userId],
  );

  const row = result.rows[0];
  return NextResponse.json({
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    user_id: userId,
    app_id: appId,
    note: 'Queued. Mini PC livinityd poller (CARRY-P215-MINIPC-POLLER) will pick up. Poll GET /api/admin/install/[id] or subscribe to SSE for status updates.',
  });
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const status = searchParams.get('status');

  const params: unknown[] = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE ic.status = $${params.length}`;
  }
  params.push(limit);

  const result = await pool.query(
    `SELECT ic.id, ic.user_id, u.username, ic.app_id, a.slug AS app_slug, a.name AS app_name,
            ic.instance_name, ic.status, ic.created_at, ic.started_at, ic.completed_at,
            ic.result_json
       FROM install_commands ic
       LEFT JOIN users u ON u.id = ic.user_id
       LEFT JOIN apps a ON a.id = ic.app_id
       ${where}
       ORDER BY ic.created_at DESC
       LIMIT $${params.length}`,
    params,
  );

  return NextResponse.json({ commands: result.rows, limit });
}
