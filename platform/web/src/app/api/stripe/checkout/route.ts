// POST /api/stripe/checkout — start a subscription Checkout (hosted, redirect).
// Session-authed (dashboard cookie). Body: { interval?: 'monthly' | 'yearly' }.
// Card-upfront 3-day trial; Stripe auto-charges on day 3. Returns { url }.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { stripe, priceIdForInterval, TRIAL_PERIOD_DAYS, type BillingInterval } from '@/lib/stripe';
import { mirrorSubscription } from '@/lib/stripe-sync';

export const runtime = 'nodejs';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'https://livinity.io';
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await getSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.emailVerified) {
    return NextResponse.json({ error: 'Verify your email first' }, { status: 403 });
  }

  let interval: BillingInterval = 'monthly';
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.interval === 'yearly') interval = 'yearly';
  } catch {
    /* default monthly */
  }

  // Already-subscribed users shouldn't double-subscribe — send them to the portal.
  const existing = await pool.query<{ stripe_customer_id: string | null; subscription_status: string | null }>(
    'SELECT stripe_customer_id, subscription_status FROM users WHERE id = $1',
    [session.userId],
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const row = existing.rows[0];
  if (row.subscription_status && ['trialing', 'active', 'past_due'].includes(row.subscription_status)) {
    return NextResponse.json({ error: 'already_subscribed' }, { status: 409 });
  }

  try {
    // Webhook-failure self-heal: DB says never/no-longer subscribed but a
    // Stripe customer exists — ask Stripe directly before creating a second
    // subscription for the same customer.
    if (row.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({
        customer: row.stripe_customer_id,
        status: 'all',
        limit: 5,
      });
      const live = subs.data.find((s) => ['trialing', 'active', 'past_due'].includes(s.status));
      if (live) {
        await mirrorSubscription(live);
        return NextResponse.json({ error: 'already_subscribed' }, { status: 409 });
      }
    }

    // Get-or-create the Stripe customer, store the id on the user.
    let customerId = row.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.email,
        metadata: { userId: session.userId, username: session.username },
      });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, session.userId]);
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceIdForInterval(interval), quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: { userId: session.userId },
      },
      allow_promotion_codes: true,
      success_url: `${baseUrl()}/dashboard?checkout=success`,
      cancel_url: `${baseUrl()}/pricing?checkout=cancelled`,
    });

    if (!checkout.url) {
      return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 });
    }
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error('[stripe-checkout] Stripe API error:', err);
    return NextResponse.json(
      { error: 'Payment service is temporarily unavailable. Please try again.' },
      { status: 502 },
    );
  }
}
