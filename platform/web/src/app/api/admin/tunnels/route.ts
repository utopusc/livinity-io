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
  const status = searchParams.get('status'); // 'connected' | 'disconnected' | null

  const params: unknown[] = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE tc.status = $${params.length}`;
  }
  params.push(limit);

  const result = await pool.query<{
    id: string;
    user_id: string;
    username: string | null;
    session_id: string;
    status: string;
    connected_at: string;
    disconnected_at: string | null;
    client_version: string | null;
    client_ip: string | null;
  }>(
    `SELECT tc.id, tc.user_id, u.username, tc.session_id, tc.status,
            tc.connected_at, tc.disconnected_at, tc.client_version,
            host(tc.client_ip)::text AS client_ip
     FROM tunnel_connections tc
     LEFT JOIN users u ON u.id = tc.user_id
     ${where}
     ORDER BY tc.connected_at DESC NULLS LAST
     LIMIT $${params.length}`,
    params,
  );

  return NextResponse.json({
    tunnels: result.rows,
    limit,
  });
}
