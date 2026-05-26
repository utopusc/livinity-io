/**
 * POST /api/me/tunnel-connections/[id]/disconnect
 *
 * Mini PC livinityd calls this on tunnel close. UPDATEs the row's
 * status to 'disconnected' and stamps disconnected_at. user_id
 * ownership enforced — cross-tenant updates return 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctxParam: RouteContext) {
  const auth = await validateApiKey(req);
  if (!auth.valid) return unauthorizedResponse(auth.error);

  const { id } = await ctxParam.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const result = await pool.query<{ id: string; status: string }>(
    `UPDATE tunnel_connections
       SET status = 'disconnected', disconnected_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'connected'
       RETURNING id, status`,
    [id, auth.userId],
  );

  if (result.rows.length === 0) {
    const probe = await pool.query<{ user_id: string; status: string }>(
      `SELECT user_id, status FROM tunnel_connections WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (probe.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (probe.rows[0].user_id !== auth.userId) {
      return NextResponse.json({ error: 'Not your tunnel' }, { status: 403 });
    }
    // Already disconnected — idempotent OK.
    return NextResponse.json({ id, status: probe.rows[0].status, already: true });
  }

  return NextResponse.json(result.rows[0]);
}
