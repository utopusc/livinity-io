// POST /api/billing/sync — pull the caller's subscription state straight from
// Stripe and mirror it onto users.* (webhook-independent self-heal).
//
// Session-authed. Used by the install wizard poll + a "Refresh" affordance so a
// paying user whose webhook was missed/failed is never stranded. Returns the
// fresh access status.
import { NextRequest, NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { reconcileThrottled } from '@/lib/stripe-sync';
import { getSubscriptionStatus } from '@/lib/subscription';

// At most one Stripe reconcile per user per 2s — bounds cost/abuse while still
// matching the install wizard's 2s poll cadence.
const SYNC_THROTTLE_MS = 2_000;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await getSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await reconcileThrottled(session.userId, SYNC_THROTTLE_MS);
  } catch (err) {
    // Reconcile is best-effort; surface current DB state regardless.
    console.error('[billing-sync] reconcile failed:', err);
  }

  const status = await getSubscriptionStatus(session.userId);
  return NextResponse.json({
    active: status.active,
    plan: status.plan,
    status: status.stripeStatus,
    currentPeriodEnd: status.currentPeriodEnd,
    cancelAtPeriodEnd: status.cancelAtPeriodEnd,
    legacyFree: status.legacyFree,
    reason: status.reason ?? null,
  });
}
