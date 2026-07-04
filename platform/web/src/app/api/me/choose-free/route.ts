import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getSubscriptionStatus } from '@/lib/subscription';

// Opt an already-signed-in account into the free BYO-domain tier.
//
// Used when a logged-in user clicks "Choose Free" (the free intent can't ride a
// fresh signup for them — they already have an account). Sets users.free_byod so
// the entitlement gate grants market/catalog access with plan='free', and the
// box does its own DNS with the operator's Cloudflare token.
//
// GUARD: never flip a genuine paying subscriber. free_byod has precedence over
// Stripe in decideSubscriptionAccess, so setting it on a trialing/active/past_due
// user would MASK their live paid plan. Those users are left untouched.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }
  const user = await getSession(token);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  const sub = await getSubscriptionStatus(user.userId);
  if (sub.plan === 'trialing' || sub.plan === 'active' || sub.plan === 'past_due') {
    // Paying subscriber — do not downgrade/mask. They keep their paid plan.
    return NextResponse.json({ ok: false, reason: 'has_paid_plan', free_byod: false });
  }

  try {
    await pool.query('UPDATE users SET free_byod = TRUE WHERE id = $1', [user.userId]);
  } catch (err) {
    if ((err as { code?: string })?.code === '42703') {
      // free_byod column not migrated yet — fail soft rather than 500.
      return NextResponse.json({ ok: false, error: 'Free tier not available yet' }, { status: 503 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true, free_byod: true });
}
