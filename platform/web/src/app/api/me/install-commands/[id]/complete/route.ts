/**
 * POST /api/me/install-commands/[id]/complete
 *
 * Mini PC livinityd poller reports terminal status for a running command.
 * Body: { status: 'ready' | 'failed', result?: object }
 *
 * Only transitions running → terminal (not queued or already-terminal).
 * user_id ownership enforced.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

type Body = {
  status?: 'ready' | 'failed';
  result?: unknown;
};

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctxParam: RouteContext) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const { id } = await ctxParam.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.status !== 'ready' && body.status !== 'failed') {
    return NextResponse.json(
      { error: 'status must be "ready" or "failed"' },
      { status: 400 },
    );
  }

  const result = await pool.query<{
    id: string;
    status: string;
    completed_at: string;
  }>(
    `UPDATE install_commands
       SET status = $1, result_json = $2::jsonb, completed_at = NOW()
       WHERE id = $3 AND user_id = $4 AND status = 'running'
       RETURNING id, status, completed_at`,
    [body.status, JSON.stringify(body.result ?? {}), id, auth.userId],
  );

  if (result.rows.length === 0) {
    const probe = await pool.query<{ user_id: string; status: string }>(
      `SELECT user_id, status FROM install_commands WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (probe.rows.length === 0) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }
    if (probe.rows[0].user_id !== auth.userId) {
      return NextResponse.json({ error: 'Not your command' }, { status: 403 });
    }
    return NextResponse.json(
      { error: `Command in status=${probe.rows[0].status}, expected 'running'` },
      { status: 409 },
    );
  }

  return NextResponse.json(result.rows[0]);
}
