import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';
import { logAdminAction } from '@/lib/admin-actions';
import {
  revokeUserAccess,
  restoreUserAccess,
  type EnforceableUser,
} from '@/lib/billing-enforcement';
import { deprovisionUser } from '@/lib/cf-saas';
import { stripe } from '@/lib/stripe';
import { syncSubscription } from '@/lib/stripe-sync';
import { hasActiveAccess } from '@/lib/subscription';

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres SQLSTATEs we degrade on (defensive-schema rule).
const UNDEFINED_COLUMN = '42703';

/** Full target-user row, including the MAYBE-ABSENT suspended_at column. */
interface TargetUser {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  email_verified: boolean;
  legacy_free: boolean | null;
  subscription_status: string | null;
  access_revoked_at: Date | null;
  stripe_subscription_id: string | null;
  cf_tunnel_id: string | null;
  cf_dns_record_id_apex: string | null;
  suspended_at: Date | null;
}

/**
 * Load the target user defensively: try the SELECT WITH suspended_at; on
 * undefined_column (42703 — operator hasn't added it yet) retry WITHOUT it and
 * synthesize suspended_at=null.
 */
async function loadTargetUser(id: string): Promise<TargetUser | null> {
  const baseCols = `id, username, email, is_admin, email_verified, legacy_free,
                    subscription_status, access_revoked_at, stripe_subscription_id,
                    cf_tunnel_id, cf_dns_record_id_apex`;
  try {
    const res = await pool.query<TargetUser>(
      `SELECT ${baseCols}, suspended_at FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return res.rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_COLUMN) {
      const res = await pool.query<Omit<TargetUser, 'suspended_at'>>(
        `SELECT ${baseCols} FROM users WHERE id = $1 LIMIT 1`,
        [id],
      );
      const row = res.rows[0];
      return row ? { ...row, suspended_at: null } : null;
    }
    throw err;
  }
}

/** Map a TargetUser to the EnforceableUser shape billing-enforcement expects. */
function toEnforceable(u: TargetUser): EnforceableUser {
  return {
    id: u.id,
    username: u.username,
    cf_tunnel_id: u.cf_tunnel_id,
    cf_dns_record_id_apex: u.cf_dns_record_id_apex,
  };
}

export async function POST(req: NextRequest, ctxParam: RouteContext) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParam.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  const user = await loadTargetUser(id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Audit helper bound to this request's acting admin + target.
  const audit = (act: string, detail?: Record<string, unknown>) =>
    logAdminAction({
      adminUserId: ctx.userId,
      adminUsername: ctx.username,
      targetUserId: user.id,
      targetUsername: user.username,
      action: act,
      detail,
    });

  try {
    switch (action) {
      // ── Comp / legacy-free ───────────────────────────────────────────────
      case 'grant_comp': {
        await pool.query('UPDATE users SET legacy_free = true WHERE id = $1', [user.id]);
        if (user.access_revoked_at !== null) {
          try {
            await restoreUserAccess(toEnforceable(user));
          } catch (err) {
            console.error('[admin-actions] grant_comp restore failed:', err);
          }
        }
        await audit('grant_comp');
        return NextResponse.json({ ok: true, legacy_free: true });
      }

      case 'remove_comp': {
        await pool.query('UPDATE users SET legacy_free = false WHERE id = $1', [user.id]);
        await audit('remove_comp');
        return NextResponse.json({ ok: true, legacy_free: false });
      }

      // ── Access revoke / restore ──────────────────────────────────────────
      case 'revoke': {
        try {
          await revokeUserAccess(toEnforceable(user));
        } catch (err) {
          console.error('[admin-actions] revoke failed:', err);
          return NextResponse.json({ error: 'Revoke failed (see logs)' }, { status: 502 });
        }
        await audit('revoke');
        return NextResponse.json({ ok: true });
      }

      case 'restore': {
        if (user.suspended_at !== null) {
          return NextResponse.json(
            { error: 'User is suspended — unsuspend first' },
            { status: 409 },
          );
        }
        try {
          await restoreUserAccess(toEnforceable(user));
        } catch (err) {
          console.error('[admin-actions] restore failed:', err);
          return NextResponse.json({ error: 'Restore failed (see logs)' }, { status: 502 });
        }
        await audit('restore');
        return NextResponse.json({ ok: true });
      }

      // ── Stripe subscription lifecycle ────────────────────────────────────
      case 'cancel_subscription': {
        const subId = user.stripe_subscription_id;
        if (!subId) {
          return NextResponse.json(
            { error: 'User has no Stripe subscription to cancel' },
            { status: 400 },
          );
        }
        const immediate = body.immediate === true;
        try {
          if (immediate) {
            await stripe.subscriptions.cancel(subId);
          } else {
            await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
          }
          await syncSubscription(subId);
        } catch (err) {
          console.error('[admin-actions] cancel_subscription failed:', err);
          return NextResponse.json(
            { error: 'Stripe cancel failed (see logs)' },
            { status: 502 },
          );
        }
        await audit('cancel_subscription', { immediate });
        return NextResponse.json({ ok: true, immediate });
      }

      case 'resume_subscription': {
        const subId = user.stripe_subscription_id;
        if (!subId) {
          return NextResponse.json(
            { error: 'User has no Stripe subscription to resume' },
            { status: 400 },
          );
        }
        try {
          await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
          await syncSubscription(subId);
        } catch (err) {
          console.error('[admin-actions] resume_subscription failed:', err);
          return NextResponse.json(
            { error: 'Stripe resume failed (see logs)' },
            { status: 502 },
          );
        }
        await audit('resume_subscription');
        return NextResponse.json({ ok: true });
      }

      // ── Admin role ───────────────────────────────────────────────────────
      case 'make_admin': {
        await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [user.id]);
        await audit('make_admin');
        return NextResponse.json({ ok: true, is_admin: true });
      }

      case 'remove_admin': {
        if (user.id === ctx.userId) {
          return NextResponse.json(
            { error: 'You cannot remove your own admin role' },
            { status: 400 },
          );
        }
        const countRes = await pool.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM users WHERE is_admin = true',
        );
        if (Number(countRes.rows[0]?.count ?? 0) <= 1) {
          return NextResponse.json(
            { error: 'Cannot remove the last admin' },
            { status: 400 },
          );
        }
        await pool.query('UPDATE users SET is_admin = false WHERE id = $1', [user.id]);
        await audit('remove_admin');
        return NextResponse.json({ ok: true, is_admin: false });
      }

      // ── Email verification ───────────────────────────────────────────────
      case 'verify_email': {
        await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
        await audit('verify_email');
        return NextResponse.json({ ok: true, email_verified: true });
      }

      // ── Suspend / unsuspend (suspended_at MAYBE-ABSENT) ──────────────────
      case 'suspend': {
        try {
          await pool.query('UPDATE users SET suspended_at = NOW() WHERE id = $1', [user.id]);
        } catch (err) {
          if ((err as { code?: string })?.code === UNDEFINED_COLUMN) {
            return NextResponse.json(
              { error: 'Suspend is unavailable — run the suspended_at column migration first' },
              { status: 409 },
            );
          }
          throw err;
        }
        try {
          await revokeUserAccess(toEnforceable(user));
        } catch (err) {
          console.error('[admin-actions] suspend revoke failed:', err);
        }
        await audit('suspend');
        return NextResponse.json({ ok: true, suspended: true });
      }

      case 'unsuspend': {
        try {
          await pool.query('UPDATE users SET suspended_at = NULL WHERE id = $1', [user.id]);
        } catch (err) {
          if ((err as { code?: string })?.code === UNDEFINED_COLUMN) {
            return NextResponse.json(
              { error: 'Unsuspend is unavailable — run the suspended_at column migration first' },
              { status: 409 },
            );
          }
          throw err;
        }
        // Restore access only if billing is currently active.
        try {
          if (await hasActiveAccess(user.id)) {
            await restoreUserAccess(toEnforceable(user));
          }
        } catch (err) {
          console.error('[admin-actions] unsuspend restore failed:', err);
        }
        await audit('unsuspend');
        return NextResponse.json({ ok: true, suspended: false });
      }

      // ── Admin note (admin_note MAYBE-ABSENT) ─────────────────────────────
      case 'set_note': {
        const note = typeof body.note === 'string' ? body.note : '';
        try {
          await pool.query('UPDATE users SET admin_note = $2 WHERE id = $1', [user.id, note]);
        } catch (err) {
          if ((err as { code?: string })?.code === UNDEFINED_COLUMN) {
            return NextResponse.json(
              { error: 'Notes are unavailable — run the admin_note column migration first' },
              { status: 409 },
            );
          }
          throw err;
        }
        await audit('set_note', { length: note.length });
        return NextResponse.json({ ok: true, admin_note: note });
      }

      // ── Delete user (full teardown) ──────────────────────────────────────
      case 'delete_user': {
        const confirm = typeof body.confirm === 'string' ? body.confirm : '';
        if (confirm !== user.username) {
          return NextResponse.json(
            { error: 'Confirmation does not match username' },
            { status: 400 },
          );
        }
        if (user.id === ctx.userId) {
          return NextResponse.json(
            { error: 'You cannot delete your own account' },
            { status: 400 },
          );
        }
        if (user.is_admin) {
          return NextResponse.json(
            { error: 'Cannot delete an admin user' },
            { status: 400 },
          );
        }

        // Log BEFORE the row is gone — admin_actions has no FK to users, but the
        // target_username is the durable record once the user row disappears.
        await audit('delete_user', {
          username: user.username,
          email: user.email,
          had_tunnel: user.cf_tunnel_id !== null,
        });

        // (1) Best-effort Cloudflare teardown — only if the user has a tunnel.
        if (user.cf_tunnel_id) {
          try {
            const appRecs = await pool.query<{ cf_dns_record_id: string }>(
              'SELECT cf_dns_record_id FROM user_app_subdomains WHERE user_id = $1',
              [user.id],
            );
            await deprovisionUser({
              tunnel_id: user.cf_tunnel_id,
              username: user.username,
              apex_dns_record_id: user.cf_dns_record_id_apex ?? '',
              app_dns_record_ids: appRecs.rows
                .map((r) => r.cf_dns_record_id)
                .filter((v): v is string => !!v),
            });
          } catch (err) {
            console.error('[admin-actions] delete_user CF teardown failed (continuing):', err);
          }
        }

        // (2) Best-effort Stripe cancel.
        if (user.stripe_subscription_id) {
          await stripe.subscriptions
            .cancel(user.stripe_subscription_id)
            .catch((err) =>
              console.error('[admin-actions] delete_user Stripe cancel failed (continuing):', err),
            );
        }

        // (3) + (4) DB teardown in a transaction: devices is FK RESTRICT so it
        // must be deleted first; the users DELETE then CASCADEs the rest.
        const client: PoolClient = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM devices WHERE user_id = $1', [user.id]);
          await client.query('DELETE FROM users WHERE id = $1', [user.id]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('[admin-actions] delete_user DB teardown failed:', err);
          return NextResponse.json(
            { error: 'Delete failed (see logs)' },
            { status: 500 },
          );
        } finally {
          client.release();
        }

        return NextResponse.json({ ok: true, deleted: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error(`[admin-actions] action=${action} unexpected error:`, err);
    return NextResponse.json({ error: 'Internal error (see logs)' }, { status: 500 });
  }
}
