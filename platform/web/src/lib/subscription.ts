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

export type SubscriptionPlan = 'free' | 'trialing' | 'active' | 'past_due' | 'inactive';

export interface SubscriptionStatus {
  /** Whether the user may currently use the tunnel/install. */
  active: boolean;
  plan: SubscriptionPlan;
  stripeStatus: string | null; // raw Stripe subscription.status
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  legacyFree: boolean;
  /** Machine-readable reason when active=false (for 402/403 responses + UI). */
  reason?: 'no_subscription' | 'trial_or_subscription_expired' | 'past_due_expired' | 'canceled' | 'user_not_found';
}

interface UserBillingRow {
  subscription_status: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean | null;
  past_due_since: Date | null;
  legacy_free: boolean | null;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const res = await pool.query<UserBillingRow>(
    `SELECT subscription_status, current_period_end, cancel_at_period_end, past_due_since, legacy_free
       FROM users WHERE id = $1`,
    [userId],
  );

  if (res.rows.length === 0) {
    return {
      active: false, plan: 'inactive', stripeStatus: null, currentPeriodEnd: null,
      cancelAtPeriodEnd: false, legacyFree: false, reason: 'user_not_found',
    };
  }

  const row = res.rows[0];
  const now = new Date();
  const status = row.subscription_status;
  const currentPeriodEnd = row.current_period_end;
  const cancelAtPeriodEnd = !!row.cancel_at_period_end;
  const legacyFree = !!row.legacy_free;

  // Grandfathered legacy accounts always have access.
  if (legacyFree) {
    return { active: true, plan: 'free', stripeStatus: status, currentPeriodEnd, cancelAtPeriodEnd, legacyFree: true };
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
