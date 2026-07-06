// Shared, hardened account-deletion teardown — used by BOTH the admin
// delete_user action and the user's own POST /api/user/delete so the two
// paths can never drift.
//
// Money-safety invariants (July '26 billing forensics):
//   1. Stripe cancellation is keyed on the CUSTOMER, never the possibly-stale
//      users.stripe_subscription_id mirror. With the webhook down, a paying
//      user can hold a live subscription the DB never heard about — the old
//      sub-id-only cancel silently skipped those, leaving a card charged
//      forever with no user row anywhere (invisible zombie billing).
//   2. FAIL-CLOSED on Stripe: if cancellation fails, the account is NOT
//      deleted. A retriable 502 beats an invisible perpetual charge.
//   3. Cloudflare teardown stays best-effort — leftover DNS is harmless (the
//      nightly reconcile-dns cron sweeps it) and must never block erasure.
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { deprovisionUser } from '@/lib/cf-saas';

export interface DeletableUser {
  id: string;
  username: string;
  stripe_customer_id: string | null;
  cf_tunnel_id: string | null;
  cf_dns_record_id_apex: string | null;
}

/** Thrown when Stripe cancellation fails — callers MUST abort the deletion. */
export class StripeCancelFailedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StripeCancelFailedError';
  }
}

/**
 * Thrown when the DB teardown fails AFTER Stripe subscriptions were already
 * (irreversibly) canceled — the account still exists but its subs are gone.
 * Carries the cancel count so callers can leave a durable audit trace of the
 * partial state instead of a bare 500.
 */
export class DeletionDbFailedError extends Error {
  constructor(message: string, readonly canceledSubs: number, readonly cause?: unknown) {
    super(message);
    this.name = 'DeletionDbFailedError';
  }
}

// A subscription in any of these states can still generate charges (or revive
// into charging) and must be canceled before its owner's account disappears.
// 'canceled' / 'incomplete_expired' are terminal — nothing to do.
const TERMINAL_STATUSES = new Set(['canceled', 'incomplete_expired']);

/**
 * Cancel EVERY non-terminal subscription on a Stripe customer, immediately.
 * Returns how many were canceled. Throws StripeCancelFailedError if the list
 * or any individual cancel fails (a deleted-in-Stripe customer counts as
 * success — there is nothing left that could charge).
 */
export async function cancelAllStripeSubscriptions(customerId: string): Promise<number> {
  let list;
  try {
    list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  } catch (err) {
    if ((err as { code?: string })?.code === 'resource_missing') {
      // Customer genuinely gone from Stripe = nothing can charge. Logged LOUD:
      // if this fires for many customers, suspect a misconfigured or
      // mode-mismatched STRIPE_SECRET_KEY (test vs live) — under that fault
      // every deletion would "find no subs" and zombie billing returns.
      console.error(
        `[user-deletion] Stripe customer ${customerId} not found (resource_missing) — proceeding with 0 cancels. If this repeats across users, CHECK STRIPE_SECRET_KEY mode/config.`,
      );
      return 0;
    }
    throw new StripeCancelFailedError(
      `Stripe subscriptions.list failed for customer ${customerId}`,
      err,
    );
  }

  const cancelable = list.data.filter((s) => !TERMINAL_STATUSES.has(s.status));
  for (const sub of cancelable) {
    try {
      await stripe.subscriptions.cancel(sub.id);
    } catch (err) {
      // Lost race (someone else canceled it between list and cancel) is fine;
      // anything else aborts the whole deletion.
      const code = (err as { code?: string })?.code;
      if (code === 'resource_missing') continue;
      const msg = (err as Error)?.message ?? '';
      if (/already.*cancel/i.test(msg)) continue;
      throw new StripeCancelFailedError(`Stripe cancel failed for subscription ${sub.id}`, err);
    }
  }
  return cancelable.length;
}

/**
 * Full account teardown. Order matters:
 *   (1) Stripe cancel-all by customer — FAIL-CLOSED (throws, nothing deleted).
 *   (2) Cloudflare deprovision — best-effort.
 *   (3) DB delete in a transaction (devices is FK RESTRICT → deleted first;
 *       the users DELETE cascades the rest; reserved_usernames / used_trials
 *       intentionally survive as append-only ledgers).
 * Returns the number of Stripe subscriptions canceled.
 */
export async function deleteUserAccount(user: DeletableUser): Promise<{ canceledSubs: number }> {
  // (1) Stripe FIRST, fail-closed.
  let canceledSubs = 0;
  if (user.stripe_customer_id) {
    canceledSubs = await cancelAllStripeSubscriptions(user.stripe_customer_id);
  }

  // (2) Best-effort Cloudflare teardown — only if the user has a tunnel.
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
      console.error('[user-deletion] CF teardown failed (continuing):', err);
    }
  }

  // (3) DB teardown in a transaction.
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM devices WHERE user_id = $1', [user.id]);
    await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Stripe cancels already happened and cannot be undone — surface the
    // partial state so callers audit it durably (not just a console line).
    throw new DeletionDbFailedError(
      `DB teardown failed for user ${user.id} after ${canceledSubs} Stripe cancel(s)`,
      canceledSubs,
      err,
    );
  } finally {
    client.release();
  }

  return { canceledSubs };
}
