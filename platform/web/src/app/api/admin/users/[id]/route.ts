import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

type RouteContext = { params: Promise<{ id: string }> };

const UNDEFINED_COLUMN = '42703';

interface DetailUser {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
  last_seen_at: string | null;
  cf_tunnel_id: string | null;
  cf_provisioned_at: string | null;
  subscription_status: string | null;
  legacy_free: boolean | null;
  has_used_trial: boolean | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  past_due_since: string | null;
  access_revoked_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cf_dns_record_id_apex: string | null;
  suspended_at: string | null;
  admin_note: string | null;
  comp_until: string | null;
}

/**
 * Load the detail user row defensively. suspended_at + admin_note are already
 * applied live; comp_until is operator-applied SEPARATELY and may still be
 * absent. Cascade the SELECT so whichever optional column exists is still read
 * and the missing one(s) default to null:
 *   1. all three (suspended_at, admin_note, comp_until)
 *   2. on 42703 → suspended_at + admin_note only (comp_until → null)
 *   3. on a further 42703 → base only (all three → null)
 * A normal admin path never 500s before the comp_until migration.
 */
async function loadDetailUser(id: string): Promise<DetailUser | null> {
  const baseCols = `id, username, email, is_admin, email_verified, created_at,
                    last_seen_at, cf_tunnel_id, cf_provisioned_at,
                    subscription_status, legacy_free, has_used_trial,
                    cancel_at_period_end, current_period_end, past_due_since,
                    access_revoked_at, stripe_customer_id, stripe_subscription_id,
                    cf_dns_record_id_apex`;
  try {
    const res = await pool.query<DetailUser>(
      `SELECT ${baseCols}, suspended_at, admin_note, comp_until FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return res.rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string })?.code !== UNDEFINED_COLUMN) throw err;
    // comp_until missing → retry with the already-applied optional columns.
    try {
      const res = await pool.query<Omit<DetailUser, 'comp_until'>>(
        `SELECT ${baseCols}, suspended_at, admin_note FROM users WHERE id = $1 LIMIT 1`,
        [id],
      );
      const row = res.rows[0];
      return row ? { ...row, comp_until: null } : null;
    } catch (err2) {
      if ((err2 as { code?: string })?.code !== UNDEFINED_COLUMN) throw err2;
      // Fully pre-migration schema → base columns only.
      const res = await pool.query<Omit<DetailUser, 'suspended_at' | 'admin_note' | 'comp_until'>>(
        `SELECT ${baseCols} FROM users WHERE id = $1 LIMIT 1`,
        [id],
      );
      const row = res.rows[0];
      return row ? { ...row, suspended_at: null, admin_note: null, comp_until: null } : null;
    }
  }
}

/** Target-user admin-action history. Empty list if admin_actions absent. */
async function loadUserAuditHistory(id: string): Promise<unknown[]> {
  try {
    const res = await pool.query(
      `SELECT id, admin_user_id, admin_username, target_user_id, target_username,
              action, detail, created_at
         FROM admin_actions
         WHERE target_user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
      [id],
    );
    return res.rows;
  } catch (err) {
    console.warn(
      '[admin/users/:id] audit history skipped (table may not exist yet):',
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

export async function GET(req: NextRequest, ctxParam: RouteContext) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParam.params;

  // Validate UUID shape early — avoids running joins on garbage input.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const [
    user,
    installsResult,
    bandwidthResult,
    tunnelsResult,
    subdomainsResult,
    installCommandsResult,
    adminActions,
  ] = await Promise.all([
    loadDetailUser(id),
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
    loadUserAuditHistory(id),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

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
    admin_actions: adminActions,
  });
}
