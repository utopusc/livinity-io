import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctxParam: RouteContext) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParam.params;

  // Validate UUID shape early — avoids running joins on garbage input.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const [
    userResult,
    installsResult,
    bandwidthResult,
    tunnelsResult,
    subdomainsResult,
    installCommandsResult,
  ] = await Promise.all([
    pool.query<{
      id: string;
      username: string;
      email: string | null;
      is_admin: boolean;
      email_verified: boolean;
      created_at: string;
      last_seen_at: string | null;
      cf_tunnel_id: string | null;
      cf_provisioned_at: string | null;
    }>(
      `SELECT id, username, email, is_admin, email_verified, created_at,
              last_seen_at, cf_tunnel_id, cf_provisioned_at
         FROM users WHERE id = $1 LIMIT 1`,
      [id],
    ),
    pool.query(
      `SELECT ih.id, ih.app_id, a.slug AS app_slug, a.name AS app_name,
              ih.action, ih.instance_name, ih.created_at
         FROM install_history ih
         LEFT JOIN apps a ON a.id = ih.app_id
         WHERE ih.user_id = $1
         ORDER BY ih.created_at DESC
         LIMIT 100`,
      [id],
    ),
    pool.query<{
      period_month: string;
      bytes_in: string;
      bytes_out: string;
      updated_at: string;
    }>(
      `SELECT period_month, bytes_in::text, bytes_out::text, updated_at
         FROM bandwidth_usage WHERE user_id = $1
         ORDER BY period_month DESC
         LIMIT 12`,
      [id],
    ),
    pool.query(
      `SELECT id, session_id, status, connected_at, disconnected_at,
              client_version, host(client_ip)::text AS client_ip
         FROM tunnel_connections WHERE user_id = $1
         ORDER BY connected_at DESC NULLS LAST
         LIMIT 50`,
      [id],
    ),
    pool.query(
      `SELECT id, app_slug, subdomain, cf_dns_record_id, port, created_at
         FROM user_app_subdomains WHERE user_id = $1
         ORDER BY created_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT ic.id, ic.app_id, a.slug AS app_slug, a.name AS app_name,
              ic.instance_name, ic.status, ic.created_at, ic.started_at,
              ic.completed_at, ic.result_json
         FROM install_commands ic
         LEFT JOIN apps a ON a.id = ic.app_id
         WHERE ic.user_id = $1
         ORDER BY ic.created_at DESC
         LIMIT 50`,
      [id],
    ),
  ]);

  if (userResult.rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const user = userResult.rows[0];
  const bandwidth = bandwidthResult.rows.map((r) => ({
    period_month: r.period_month,
    bytes_in: Number(r.bytes_in),
    bytes_out: Number(r.bytes_out),
    updated_at: r.updated_at,
  }));

  return NextResponse.json({
    user,
    install_history: installsResult.rows,
    install_commands: installCommandsResult.rows,
    bandwidth,
    tunnel_sessions: tunnelsResult.rows,
    subdomains: subdomainsResult.rows,
  });
}
