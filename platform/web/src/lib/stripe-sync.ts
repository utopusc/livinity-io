// Mirror a Stripe subscription's CURRENT state onto users.* — shared by the
// webhook (every event) and the checkout route (webhook-failure self-heal).
//
// Basil API (stripe v22): current_period_end lives on the subscription ITEM
// (sub.items.data[0]), not the subscription object.
import type Stripe from 'stripe';
import pool from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { restoreUserAccess } from '@/lib/billing-enforcement';

/** Pull the current subscription state from Stripe and mirror it onto users. */
export async function syncSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await mirrorSubscription(sub);
  return sub;
}

/** Mirror an already-fetched subscription onto users (no extra Stripe call). */
export async function mirrorSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const currentPeriodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;
  const priceId = item?.price?.id ?? null;

  // past_due_since starts the 3-day grace clock on the FIRST observation of
  // past_due and resets whenever the subscription leaves that state.
  const res = await pool.query(
    `UPDATE users SET
       stripe_subscription_id = $1,
       subscription_status    = $2,
       stripe_price_id        = $3,
       current_period_end     = $4,
       cancel_at_period_end   = $5,
       past_due_since = CASE WHEN $2 = 'past_due' THEN COALESCE(past_due_since, NOW()) ELSE NULL END
     WHERE stripe_customer_id = $6`,
    [sub.id, sub.status, priceId, currentPeriodEnd, sub.cancel_at_period_end, customerId],
  );
  if (res.rowCount === 0) {
    // Subscription for a customer we don't know (e.g. created manually in the
    // Stripe dashboard). Log + swallow — retrying won't make the user appear.
    console.warn(`[stripe-sync] no user with stripe_customer_id=${customerId} (sub=${sub.id})`);
    return;
  }

  // Re-subscribe after enforcement cut DNS: restore inline so a paying user
  // doesn't wait for the next cron sweep. Best-effort — the cron is the retry.
  if (sub.status === 'trialing' || sub.status === 'active') {
    const revokedRow = await pool.query<{ id: string; username: string; cf_tunnel_id: string | null }>(
      `SELECT id, username, cf_tunnel_id FROM users
        WHERE stripe_customer_id = $1 AND access_revoked_at IS NOT NULL`,
      [customerId],
    );
    if (revokedRow.rows.length > 0) {
      try {
        await restoreUserAccess(revokedRow.rows[0]);
      } catch (err) {
        console.error('[stripe-sync] inline restore failed (cron will retry):', err);
      }
    }
  }
}
