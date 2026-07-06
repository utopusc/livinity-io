// Mirror a Stripe subscription's CURRENT state onto users.* — shared by the
// webhook (every event), the checkout route (webhook-failure self-heal), and
// the dashboard reconcile (webhook-independent healing).
//
// Basil API (stripe v22): current_period_end lives on the subscription ITEM
// (sub.items.data[0]), not the subscription object.
import type Stripe from 'stripe';
import pool from '@/lib/db';
import { stripe, PAST_DUE_GRACE_DAYS } from '@/lib/stripe';
import { restoreUserAccess, revokeUserAccess } from '@/lib/billing-enforcement';
import { hasActiveAccess } from '@/lib/subscription';
import { sendAccessPausedEmail } from '@/lib/email';
import { ensureProvisionedByCustomerId } from '@/lib/user-provisioning';

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
    // Phase 274: PERMANENTLY reserve the username + record trial use the moment a
    // real subscription (trial or paid) exists. Both ledgers are append-only and
    // ON CONFLICT DO NOTHING (idempotent across repeated webhook deliveries).
    //   • reserved_usernames → the username can NEVER be re-registered, even after
    //     the account is deleted (kills the delete→recreate username-reuse loop).
    //   • used_trials → the one-free-trial eligibility survives account deletion
    //     (keyed on lower(email)), so delete+recreate cannot reset the trial.
    // Best-effort: a failure here must NOT 500 the webhook — log + continue.
    try {
      await pool.query(
        `INSERT INTO reserved_usernames (username, reason, last_user_id, last_email)
         SELECT lower(username), 'purchased', id, lower(email)
           FROM users WHERE stripe_customer_id = $1 AND username IS NOT NULL
         ON CONFLICT (username) DO NOTHING`,
        [customerId],
      );
      await pool.query(
        `INSERT INTO used_trials (email, user_id)
         SELECT lower(email), id
           FROM users WHERE stripe_customer_id = $1 AND email IS NOT NULL
         ON CONFLICT (email) DO NOTHING`,
        [customerId],
      );
    } catch (err) {
      console.error('[stripe-sync] ledger write (reserved_usernames/used_trials) failed:', err);
    }

    // A suspended (admin-banned) user who pays must STAY out — exclude them
    // from the restore candidate set. DEFENSIVE: users.suspended_at may not
    // exist yet (operator runs the ALTER separately). Try the SELECT WITH the
    // `suspended_at IS NULL` predicate; on 42703 (undefined_column) fall back
    // to the original query without it. Only 42703 is swallowed — others throw.
    type RevokedRow = { id: string; username: string; cf_tunnel_id: string | null };
    let revokedRow;
    try {
      revokedRow = await pool.query<RevokedRow>(
        `SELECT id, username, cf_tunnel_id FROM users
          WHERE stripe_customer_id = $1 AND access_revoked_at IS NOT NULL AND suspended_at IS NULL`,
        [customerId],
      );
    } catch (err) {
      if ((err as { code?: string })?.code === '42703') {
        revokedRow = await pool.query<RevokedRow>(
          `SELECT id, username, cf_tunnel_id FROM users
            WHERE stripe_customer_id = $1 AND access_revoked_at IS NOT NULL`,
          [customerId],
        );
      } else {
        throw err;
      }
    }
    if (revokedRow.rows.length > 0) {
      try {
        await restoreUserAccess(revokedRow.rows[0]);
      } catch (err) {
        console.error('[stripe-sync] inline restore failed (cron will retry):', err);
      }
    }

    // Stage 3 of the email-verify-first signup: provision the user's CF tunnel
    // + apex DNS the moment a subscription (trial or paid) is live. Idempotent
    // (guarded on cf_provisioned_at IS NULL) and best-effort — this never throws
    // out of mirrorSubscription, so a CF hiccup can't 500 the webhook; the next
    // webhook/dashboard reconcile re-attempts. A no-op for already-provisioned
    // users (legacy_free grandfathered accounts, re-subscribes).
    await ensureProvisionedByCustomerId(customerId);
  }

  // Instant revoke: when a sub goes canceled/unpaid/incomplete_expired/paused
  // (anything NOT trialing/active), cut DNS in seconds via EVERY path that
  // mirrors (webhook + checkout self-heal + dashboard reconcile) instead of
  // waiting for the next 15-min cron sweep. hasActiveAccess() respects the
  // 3-day past_due grace, so a past_due user still inside the window is NOT
  // cut here. Idempotent (skipped once access_revoked_at is set) and fully
  // best-effort — a CF/email failure must NEVER throw out of mirrorSubscription
  // and 500 the webhook; the enforce cron is the retry.
  if (sub.status !== 'trialing' && sub.status !== 'active') {
    const candidate = await pool.query<{
      id: string;
      username: string;
      email: string;
      cf_tunnel_id: string | null;
      cf_dns_record_id_apex: string | null;
      legacy_free: boolean | null;
      access_revoked_at: Date | null;
    }>(
      `SELECT id, username, email, cf_tunnel_id, cf_dns_record_id_apex, legacy_free, access_revoked_at
         FROM users WHERE stripe_customer_id = $1`,
      [customerId],
    );
    const row = candidate.rows[0];
    if (
      row &&
      row.legacy_free === false &&
      row.cf_tunnel_id !== null &&
      row.access_revoked_at === null
    ) {
      // past_due inside the grace window keeps access — don't cut early.
      const active = await hasActiveAccess(row.id);
      if (!active) {
        try {
          await revokeUserAccess(row);
          await sendAccessPausedEmail(row.email, row.username);
        } catch (err) {
          console.error('[stripe-sync] instant revoke failed (cron will retry):', err);
        }
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

  let list;
  try {
    // limit 100 (not 10): the conservative stale-live downgrade treats "no real
    // sub in this list" as definitive, so the page must be big enough that a
    // pile of canceled/phantom rows can never hide an older live subscription.
    list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  } catch (err) {
    // The customer was deleted in Stripe (e.g. cleaned up in the dashboard).
    // That is a DEFINITIVE "no subscriptions exist" answer, not a transient
    // failure — return null so stale-live callers may downgrade. Any other
    // Stripe error rethrows (callers must NOT treat an outage as "no subs").
    if ((err as { code?: string })?.code === 'resource_missing') return null;
    throw err;
  }
  // Ignore abandoned-checkout phantoms — they are not real subscriptions and
  // must not pollute the user's billing state or burn their trial eligibility.
  const real = list.data.filter((s) => !PHANTOM_STATUSES.includes(s.status));
  const best = pickBestSubscription(real);
  if (!best) return null;

  await mirrorSubscription(best);
  return best.status;
}

// ── Stale-live healing ───────────────────────────────────────────────────────
// The webhook is the primary writer of subscription_status, but when it is
// down/misconfigured a row mirrored to a LIVE status (trialing/active/past_due)
// freezes: the dashboard reconcile used to skip all live statuses, the cron
// never rewrites the column, and checkout 409s before its self-heal. "Stale
// live" = the stored status still claims live but its own clock has run out —
// the one state we can detect locally and MUST re-check against Stripe.

/** Row shape needed to decide staleness (subset of users). */
export interface StaleCheckRow {
  subscription_status: string | null;
  current_period_end: Date | null;
  past_due_since: Date | null;
}

/**
 * Pure: does this stored billing state claim "live" past its own deadline?
 *   - trialing/active with current_period_end in the past
 *   - past_due whose grace window (PAST_DUE_GRACE_DAYS) has fully elapsed
 * A live status with NO period end is NOT considered stale here — there is no
 * local deadline to compare against (mirrorSubscription always writes one).
 */
export function isStoredStale(row: StaleCheckRow, now: Date): boolean {
  const s = row.subscription_status;
  if (s === 'trialing' || s === 'active') {
    return !!row.current_period_end && row.current_period_end.getTime() < now.getTime();
  }
  if (s === 'past_due') {
    const graceMs = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    return !!row.past_due_since && now.getTime() - row.past_due_since.getTime() > graceMs;
  }
  return false;
}

export type StaleLiveOutcome = 'not_stale' | 'mirrored' | 'downgraded' | 'error';

/**
 * Heal one user's stale-live row from Stripe (the source of truth).
 *   - not stale → no-op.
 *   - Stripe has a real subscription → mirror it (status/period rewritten).
 *   - Stripe answers definitively with NO real subscription (none listed, all
 *     phantoms, or the customer itself was deleted) → conservative downgrade to
 *     'canceled', guarded by re-checking the staleness predicate in the UPDATE
 *     itself so a concurrent webhook/reconcile mirror is never clobbered.
 *   - Stripe unreachable → 'error', row untouched (next sweep retries).
 * Callers: the enforce cron (pass 0, BEFORE any revoke decision) and the
 * dashboard's maybeReconcileBilling.
 */
export async function reconcileStaleLive(userId: string): Promise<StaleLiveOutcome> {
  const res = await pool.query<StaleCheckRow>(
    'SELECT subscription_status, current_period_end, past_due_since FROM users WHERE id = $1',
    [userId],
  );
  const row = res.rows[0];
  if (!row || !isStoredStale(row, new Date())) return 'not_stale';

  let status: string | null;
  try {
    status = await reconcileFromStripe(userId);
  } catch (err) {
    console.error('[stripe-sync] stale-live reconcile failed for', userId, err);
    return 'error';
  }
  if (status !== null) return 'mirrored';

  // Stripe answered and has no real subscription for this user — the stored
  // live status is fiction. Downgrade to 'canceled' (truthful: nothing is
  // live; also unblocks the dashboard reconcile's isLiveStatus gate so any
  // future divergence self-corrects). The WHERE re-checks staleness so this
  // can never race a fresher mirror.
  await pool.query(
    `UPDATE users
        SET subscription_status = 'canceled', past_due_since = NULL
      WHERE id = $1
        AND (
              (subscription_status IN ('trialing', 'active')
               AND current_period_end IS NOT NULL AND current_period_end < NOW())
           OR (subscription_status = 'past_due'
               AND past_due_since IS NOT NULL
               AND past_due_since < NOW() - make_interval(days => $2))
        )`,
    [userId, PAST_DUE_GRACE_DAYS],
  );
  return 'downgraded';
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

/**
 * Throttled stale-live heal for request-path callers (the dashboard's 10s
 * poll). Shares the reconcile timestamp map: a stale row that does NOT heal
 * (Stripe outage, or a chronically-stale past_due still in Stripe dunning)
 * must cost at most one Stripe round-trip per interval per user — not one per
 * poll. Best-effort like everything here: the cron sweep is the backstop.
 */
export async function reconcileStaleLiveThrottled(
  userId: string,
  minIntervalMs: number,
): Promise<StaleLiveOutcome | 'throttled'> {
  const now = Date.now();
  const last = reconcileAt.get(userId) ?? 0;
  if (now - last < minIntervalMs) return 'throttled';
  reconcileAt.set(userId, now);
  if (reconcileAt.size > RECONCILE_MAP_CAP) {
    const oldest = reconcileAt.keys().next().value;
    if (oldest !== undefined) reconcileAt.delete(oldest);
  }
  return reconcileStaleLive(userId);
}

/** Does this Stripe status count as a live/recent subscription? */
export function isLiveStatus(status: string | null | undefined): boolean {
  return !!status && LIVE_STATUSES.includes(status);
}
