/**
 * User provisioning — Stage 3 of the email-verify-first signup flow.
 *
 * Cloudflare resources (tunnel + apex DNS + encrypted connector token) are
 * created ONLY once a subscription (trial or paid) exists — NOT at register and
 * NOT at email-verify. This module is the single hook the subscription mirror
 * (lib/stripe-sync.ts mirrorSubscription) calls on every trialing/active sync.
 *
 * Reuses the same provision → encrypt → persist sequence the admin
 * cf-reprovision route and the (now-retired) register-time flow used.
 */

import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { provisionUserHostnames, deprovisionUser } from '@/lib/cf-saas';
import { encryptToken } from '@/lib/token-encryption';

/**
 * Idempotently provision a user's CF tunnel + apex DNS and persist the
 * encrypted token — keyed by Stripe customer id.
 *
 * Concurrency + idempotency: runs inside a transaction holding a FOR UPDATE row
 * lock on the user, then re-checks `cf_provisioned_at IS NULL` before doing any
 * CF work. Two webhook deliveries racing on the same user serialize on the lock
 * — the second observes `cf_provisioned_at` set and no-ops, so we never create a
 * second (orphan) tunnel. (Mirrors the original register-time transaction shape,
 * which also held a DB tx across the CF calls.)
 *
 * Best-effort: NEVER throws. A CF/encryption/DB failure is logged and swallowed
 * so it cannot 500 the webhook; because the guard stays `cf_provisioned_at IS
 * NULL`, the next webhook / dashboard reconcile re-attempts. If CF resources got
 * created before a later failure, they're released best-effort so a retry
 * provisions cleanly instead of leaking an orphan tunnel.
 */
export async function ensureProvisionedByCustomerId(customerId: string): Promise<void> {
  // client + BEGIN live INSIDE the try so even a pool.connect() rejection
  // (DB unreachable, pool exhausted/ended) is swallowed — the function must
  // NEVER throw out into mirrorSubscription and 500 the webhook.
  let client: PoolClient | null = null;
  let cf: { tunnel_id: string; tunnel_token: string; apex_dns_record_id: string } | null = null;
  let username: string | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const row = await client.query<{ id: string; username: string; cf_provisioned_at: Date | null }>(
      'SELECT id, username, cf_provisioned_at FROM users WHERE stripe_customer_id = $1 FOR UPDATE',
      [customerId],
    );
    const user = row.rows[0];
    if (!user || user.cf_provisioned_at !== null) {
      // Unknown customer, or already provisioned → nothing to do (idempotent).
      await client.query('COMMIT');
      return;
    }
    // Phase 274: username is now nullable (picked in a /username step AFTER
    // signup). Provisioning needs it (tunnel name `livos-{username}` + apex
    // CNAME). If billing somehow started before the pick, do NOT call CF with a
    // null username — leave cf_provisioned_at NULL so the next webhook/reconcile
    // retries once the username exists. (The /username guard makes this rare.)
    if (!user.username) {
      await client.query('COMMIT');
      console.warn(
        `[provision] customer ${customerId} has no username yet — deferring CF provision until /username pick`,
      );
      return;
    }
    username = user.username;

    // External CF calls happen while the row lock is held so a concurrent
    // provisioner blocks until we commit/rollback (bounded by CF request
    // timeouts) — guarantees exactly one tunnel per user.
    cf = await provisionUserHostnames(user.username);
    const encryptedToken = await encryptToken(cf.tunnel_token);

    await client.query(
      `UPDATE users
          SET cf_tunnel_id = $1,
              cf_tunnel_token_encrypted = $2,
              cf_dns_record_id_apex = $3,
              cf_provisioned_at = NOW()
        WHERE id = $4`,
      [cf.tunnel_id, encryptedToken, cf.apex_dns_record_id, user.id],
    );

    await client.query('COMMIT');
    console.info(`[provision] provisioned ${user.username} on subscribe: tunnel=${cf.tunnel_id}`);
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[provision] rollback failed:', rollbackErr);
      }
    }
    // Release any CF resources created before the failure so the next retry
    // provisions cleanly (no orphan tunnel). Cleanup errors must not mask the
    // original failure or throw out of this best-effort function.
    if (cf && username) {
      await deprovisionUser({
        tunnel_id: cf.tunnel_id,
        username,
        apex_dns_record_id: cf.apex_dns_record_id,
        app_dns_record_ids: [],
      }).catch((cleanupErr) =>
        console.error('[provision] orphan cleanup failed:', cleanupErr),
      );
    }
    console.error(
      '[provision] ensureProvisionedByCustomerId failed (retry on next webhook/reconcile):',
      err,
    );
  } finally {
    client?.release();
  }
}
