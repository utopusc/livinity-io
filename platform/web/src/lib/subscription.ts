// Subscription access gate — the single source of truth for "can this user use
// the LivOS tunnel/install right now?". Reads the Stripe-mirrored columns on
// users (populated by the webhook handler). Mirrors the lib/db `pool` pattern
// used by lib/api-auth.ts.
//
// Decisions (locked 2026-06-12):
//   - Stripe owns the trial clock (trial_period_days=3, card upfront) → access
//     while status ∈ {trialing, active}.
//   - past_due gets a 3-day grace before cut-off (Smart Retries window).
//   - Existing verified users are grandfathered free (legacy_free=true).
import pool from '@/lib/db';
import { PAST_DUE_GRACE_DAYS } from '@/lib/stripe';

export type SubscriptionPlan = 'free' | 'comp' | 'trialing' | 'active' | 'past_due' | 'inactive';

export interface SubscriptionStatus {
  /** Whether the user may currently use the tunnel/install. */
  active: boolean;
  plan: SubscriptionPlan;
  stripeStatus: string | null; // raw Stripe subscription.status
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  legacyFree: boolean;
  /** Machine-readable reason when active=false (for 402/403 responses + UI). */
  reason?: 'no_subscription' | 'trial_or_subscription_expired' | 'past_due_expired' | 'canceled' | 'suspended' | 'user_not_found';
}

interface UserBillingRow {
  subscription_status: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean | null;
  past_due_since: Date | null;
  legacy_free: boolean | null;
  suspended_at?: Date | null;
  comp_until?: Date | null;
  // Free BYOD tier (own domain + own Cloudflare). Undefined when the column
  // doesn't exist yet (42703 fallback path) → treated as false (no free access
  // until the migration lands — the safe direction).
  free_byod?: boolean | null;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  // DEFENSIVE: users.suspended_at is applied live, but users.comp_until may not
  // exist yet (the operator runs that ALTER separately, possibly AFTER this
  // deploys). Try the SELECT WITH BOTH suspended_at and comp_until; if Postgres
  // reports 42703 (undefined_column — the missing one is comp_until in practice),
  // retry the SAME SELECT WITHOUT comp_until so the gate keeps working
  // (comp_until treated as null/absent → no comp grant). The gate must NEVER 500
  // before comp_until exists. Only 42703 is swallowed here — any other rethrows.
  let res;
  try {
    res = await pool.query<UserBillingRow>(
      `SELECT subscription_status, current_period_end, cancel_at_period_end, past_due_since, legacy_free, suspended_at, comp_until, free_byod
         FROM users WHERE id = $1`,
      [userId],
    );
  } catch (err) {
    if ((err as { code?: string })?.code === '42703') {
      // One of the optional columns (comp_until / free_byod) doesn't exist yet
      // — the operator may run those ALTERs after this deploys. Retry with ONLY
      // the guaranteed columns; the absent ones are treated as null/false (no
      // comp grant, no free_byod → the safe direction, never a false grant).
      res = await pool.query<UserBillingRow>(
        `SELECT subscription_status, current_period_end, cancel_at_period_end, past_due_since, legacy_free, suspended_at
           FROM users WHERE id = $1`,
        [userId],
      );
    } else {
      throw err;
    }
  }

  return decideSubscriptionAccess(res.rows[0], new Date());
}

/**
 * Pure decision core of getSubscriptionStatus — extracted so the access rules
 * (suspended > legacy_free > free_byod > comp > stripe state) are unit-testable
 * without a DB. Behavior-preserving: getSubscriptionStatus does the query and
 * delegates here. `row` is undefined when the user isn't found.
 */
export function decideSubscriptionAccess(row: UserBillingRow | undefined, now: Date): SubscriptionStatus {
  if (!row) {
    return {
      active: false, plan: 'inactive', stripeStatus: null, currentPeriodEnd: null,
      cancelAtPeriodEnd: false, legacyFree: false, reason: 'user_not_found',
    };
  }

  const status = row.subscription_status;
  const currentPeriodEnd = row.current_period_end;
  const cancelAtPeriodEnd = !!row.cancel_at_period_end;
  const legacyFree = !!row.legacy_free;
  // suspended_at is undefined when the column doesn't exist yet (42703 retry
  // path above) — treat that as "not suspended".
  const suspended = !!row.suspended_at;
  // comp_until is undefined when the column doesn't exist yet (42703 retry path
  // above) — treat that as "no comp grant".
  const compUntil = row.comp_until ?? null;

  // Admin suspension (ban) overrides EVERYTHING: a suspended user has no access
  // even if comped (legacy_free) or actively paying (trialing/active). Must be
  // checked before legacy_free and before the trialing/active branch.
  if (suspended) {
    return {
      active: false, plan: 'inactive', stripeStatus: status, currentPeriodEnd,
      cancelAtPeriodEnd, legacyFree, reason: 'suspended',
    };
  }

  // Grandfathered legacy accounts always have access.
  if (legacyFree) {
    return { active: true, plan: 'free', stripeStatus: status, currentPeriodEnd, cancelAtPeriodEnd, legacyFree: true };
  }

  // Free BYOD tier — own domain + own Cloudflare. Entitled to key issuance +
  // market/catalog (active=true, plan='free') but NOT platform-managed DNS: the
  // box provisions its own subdomains, and this account never has a Stripe
  // customer id so ensureProvisionedByCustomerId is never triggered for it. Below
  // the suspended check (a suspended free_byod user stays blocked). free_byod is
  // undefined when the column doesn't exist yet → falsy → this branch skipped.
  if (row.free_byod) {
    return { active: true, plan: 'free', stripeStatus: status, currentPeriodEnd, cancelAtPeriodEnd, legacyFree: false };
  }

  // Time-boxed admin comp grant: while comp_until is in the future the user has
  // access regardless of Stripe (auto-expires — the enforce cron re-checks this
  // gate and revokes once comp_until passes). Surface comp_until as the period
  // end so the user/admin sees when the grant ends. Below legacy_free, above any
  // Stripe state. Absent column → compUntil null → this branch is skipped.
  if (compUntil && compUntil.getTime() > now.getTime()) {
    return {
      active: true, plan: 'comp', stripeStatus: status, currentPeriodEnd: compUntil,
      cancelAtPeriodEnd, legacyFree: false,
    };
  }

  // Never subscribed.
  if (!status) {
    return {
      active: false, plan: 'inactive', stripeStatus: null, currentPeriodEnd,
      cancelAtPeriodEnd, legacyFree: false, reason: 'no_subscription',
    };
  }

  // Trialing or active → access (period end is a belt-and-suspenders check).
  if (status === 'trialing' || status === 'active') {
    const periodOk = !currentPeriodEnd || currentPeriodEnd.getTime() > now.getTime();
    if (periodOk) {
      return {
        active: true,
        plan: status === 'trialing' ? 'trialing' : 'active',
        stripeStatus: status, currentPeriodEnd, cancelAtPeriodEnd, legacyFree: false,
      };
    }
    return {
      active: false, plan: 'inactive', stripeStatus: status, currentPeriodEnd,
      cancelAtPeriodEnd, legacyFree: false, reason: 'trial_or_subscription_expired',
    };
  }

  // past_due → keep access during the grace window (Smart Retries), then cut.
  if (status === 'past_due') {
    const since = row.past_due_since;
    const graceMs = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    const withinGrace = since ? now.getTime() - since.getTime() < graceMs : true;
    if (withinGrace) {
      return { active: true, plan: 'past_due', stripeStatus: status, currentPeriodEnd, cancelAtPeriodEnd, legacyFree: false };
    }
    return {
      active: false, plan: 'inactive', stripeStatus: status, currentPeriodEnd,
      cancelAtPeriodEnd, legacyFree: false, reason: 'past_due_expired',
    };
  }

  // canceled / paused / incomplete / unpaid / incomplete_expired → no access.
  return {
    active: false, plan: 'inactive', stripeStatus: status, currentPeriodEnd,
    cancelAtPeriodEnd, legacyFree: false, reason: 'canceled',
  };
}

/** Convenience: just the boolean gate. */
export async function hasActiveAccess(userId: string): Promise<boolean> {
  return (await getSubscriptionStatus(userId)).active;
}
