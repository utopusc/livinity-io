// Mirror a Stripe subscription's CURRENT state onto users.* — shared by the
// webhook (every event), the checkout route (webhook-failure self-heal), and
// the dashboard reconcile (webhook-independent healing).
//
// Basil API (stripe v22): current_period_end lives on the subscription ITEM
// (sub.items.data[0]), not the subscription object.
import type Stripe from 'stripe';
import pool from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { restoreUserAccess } from '@/lib/billing-enforcement';

/** Statuses that mean "this account is (or was) a real paying/trialing sub". */
export const LIVE_STATUSES = ['trialing', 'active', 'past_due'];

/** Abandoned-checkout statuses — NOT real subscriptions; never mirror these. */
const PHANTOM_STATUSES = ['incomplete', 'incomplete_expired'];

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
  // has_used_trial flips TRUE once a REAL subscription exists (one trial per
  // account). It must NOT flip for incomplete/incomplete_expired (an abandoned
  // checkout) — otherwise a user who never finished paying loses trial
  // eligibility forever. It stays TRUE for canceled/unpaid/paused so cancel →
  // resubscribe is correctly denied a second free trial.
  // NOTE: status is passed TWICE — $2 for the direct varchar assignment and $7
  // for the CASE/IN text comparisons. Reusing a single $2 in both contexts makes
  // Postgres deduce conflicting types (varchar vs text) → SQLSTATE 42P08
  // (ambiguous_parameter). A separate param gives each a single inference
  // context. (Verified against the live DB via PREPARE.)
  const res = await pool.query(
    `UPDATE users SET
       stripe_subscription_id = $1,
       subscription_status    = $2,
       stripe_price_id        = $3,
       current_period_end     = $4,
       cancel_at_period_end   = $5,
       past_due_since = CASE WHEN $7 = 'past_due' THEN COALESCE(past_due_since, NOW()) ELSE NULL END,
       has_used_trial = CASE WHEN $7 IN ('incomplete', 'incomplete_expired') THEN has_used_trial ELSE TRUE END
     WHERE stripe_customer_id = $6`,
    [sub.id, sub.status, priceId, currentPeriodEnd, sub.cancel_at_period_end, customerId, sub.status],
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

/** Rank subscriptions so reconcile mirrors the most "authoritative" one. */
function subscriptionRank(status: string): number {
  switch (status) {
    case 'active': return 5;
    case 'trialing': return 4;
    case 'past_due': return 3;
    case 'unpaid': return 2;
    case 'canceled': return 1;
    default: return 0; // incomplete / incomplete_expired / paused
  }
}

function pickBestSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  return [...subs].sort((a, b) => {
    const r = subscriptionRank(b.status) - subscriptionRank(a.status);
    if (r !== 0) return r;
    return (b.created ?? 0) - (a.created ?? 0); // newer first on a tie
  })[0];
}

/**
 * Webhook-independent healing: ask Stripe directly for the user's
 * subscriptions and mirror the best one onto users.*. Returns the resulting
 * raw status string (or null if the user has no Stripe customer / no subs).
 *
 * Called on dashboard load + the explicit /api/billing/sync so a paying user
 * is NEVER stranded by a missed/failed webhook delivery.
 */
export async function reconcileFromStripe(userId: string): Promise<string | null> {
  const row = await pool.query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId],
  );
  const customerId = row.rows[0]?.stripe_customer_id;
  if (!customerId) return null;

  const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  // Ignore abandoned-checkout phantoms — they are not real subscriptions and
  // must not pollute the user's billing state or burn their trial eligibility.
  const real = list.data.filter((s) => !PHANTOM_STATUSES.includes(s.status));
  const best = pickBestSubscription(real);
  if (!best) return null;

  await mirrorSubscription(best);
  return best.status;
}

// ── Shared, bounded reconcile throttle (used by dashboard + billing/sync) ────
// Caps per-user Stripe calls and the Map size so a warm serverless instance
// can't grow it without bound. Returns true if a reconcile actually ran.
const reconcileAt = new Map<string, number>();
const RECONCILE_MAP_CAP = 5000;

export async function reconcileThrottled(userId: string, minIntervalMs: number): Promise<boolean> {
  const now = Date.now();
  const last = reconcileAt.get(userId) ?? 0;
  if (now - last < minIntervalMs) return false;
  reconcileAt.set(userId, now);
  if (reconcileAt.size > RECONCILE_MAP_CAP) {
    const oldest = reconcileAt.keys().next().value;
    if (oldest !== undefined) reconcileAt.delete(oldest);
  }
  await reconcileFromStripe(userId);
  return true;
}

/** Does this Stripe status count as a live/recent subscription? */
export function isLiveStatus(status: string | null | undefined): boolean {
  return !!status && LIVE_STATUSES.includes(status);
}
