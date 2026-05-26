/**
 * POST /api/me/install-commands/[id]/claim
 *
 * Mini PC livinityd poller atomically transitions a queued command to
 * running. Returns 200 + the row if the claim succeeded; 409 if the row
 * was already claimed by another poller (concurrency guard).
 *
 * The user_id on the row MUST match the api-key holder — cross-tenant
 * claims are rejected with 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctxParam: RouteContext) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const { id } = await ctxParam.params;

  // Atomic claim: only transition if currently queued AND owned by us.
  const result = await pool.query<{
    id: string;
    user_id: string;
    app_id: string;
    instance_name: string | null;
    params: unknown;
    status: string;
    started_at: string;
  }>(
    `UPDATE install_commands
       SET status = 'running', started_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'queued'
       RETURNING id, user_id, app_id, instance_name, params, status, started_at`,
    [id, auth.userId],
  );

  if (result.rows.length === 0) {
    // Determine reason for the 409.
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
      { error: `Command already in status=${probe.rows[0].status}, cannot claim` },
      { status: 409 },
    );
  }

  return NextResponse.json(result.rows[0]);
}
