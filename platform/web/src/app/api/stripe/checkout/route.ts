// POST /api/stripe/checkout — start a subscription Checkout (hosted, redirect).
// Session-authed (dashboard cookie). Body: { interval?: 'monthly' | 'yearly' }.
// Card-upfront 3-day trial; Stripe auto-charges on day 3. Returns { url }.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { stripe, priceIdForInterval, eduPriceIdForInterval, TRIAL_PERIOD_DAYS, type BillingInterval } from '@/lib/stripe';
import { mirrorSubscription, isLiveStatus } from '@/lib/stripe-sync';

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
  // Phase 274: a username is required before subscribing — provisioning keys the
  // CF tunnel + apex DNS off it. The /username guard normally funnels users here
  // only after they pick; this is the defensive backstop.
  if (!session.username) {
    return NextResponse.json({ error: 'Choose a username first', code: 'username_required' }, { status: 409 });
  }

  let interval: BillingInterval = 'monthly';
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.interval === 'yearly') interval = 'yearly';
  } catch {
    /* default monthly */
  }

  // Already-subscribed users shouldn't double-subscribe — send them to the portal.
  const existing = await pool.query<{
    stripe_customer_id: string | null;
    subscription_status: string | null;
    has_used_trial: boolean | null;
    current_period_end: Date | null;
  }>(
    'SELECT stripe_customer_id, subscription_status, has_used_trial, current_period_end FROM users WHERE id = $1',
    [session.userId],
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const row = existing.rows[0];
  // PERIOD-AWARE gate: the raw column can be a stale 'trialing'/'active' when
  // the webhook missed the trial's end (that froze 5 users into a 409 loop —
  // checkout said "already subscribed" while the dashboard said "expired", so
  // they could never pay again). Only 409 straight away when the stored live
  // status is still within its own period; past_due keeps the hard 409 (the
  // portal, not a second subscription, is the fix for a failing payment). A
  // live-but-EXPIRED row falls through to the Stripe self-heal below, which
  // 409s if Stripe says the sub is genuinely still live and otherwise lets the
  // user start a fresh checkout.
  if (isLiveStatus(row.subscription_status)) {
    const periodCurrent =
      !row.current_period_end || row.current_period_end.getTime() > Date.now();
    if (row.subscription_status === 'past_due' || periodCurrent) {
      return NextResponse.json({ error: 'already_subscribed' }, { status: 409 });
    }
  }

  try {
    // Webhook-failure self-heal: DB says never/no-longer subscribed but a
    // Stripe customer exists — ask Stripe directly before creating a second
    // subscription for the same customer.
    if (row.stripe_customer_id) {
      let subs = null;
      try {
        subs = await stripe.subscriptions.list({
          customer: row.stripe_customer_id,
          status: 'all',
          limit: 5,
        });
      } catch (err) {
        // The stored customer no longer exists in Stripe (deleted in the
        // dashboard / cleaned up). Without this, checkout is a PERMANENT 502
        // dead-end for a user actively trying to pay: the dead id fails here
        // and again at sessions.create, and the get-or-create branch below
        // never runs because the stale id is non-null. Treat it as "no
        // customer": fall through to create a fresh one. Trial eligibility is
        // unaffected — has_used_trial/used_trials deny a second trial anyway.
        if ((err as { code?: string })?.code !== 'resource_missing') throw err;
        console.warn(
          `[stripe-checkout] stored customer ${row.stripe_customer_id} missing in Stripe — recreating for user ${session.userId}`,
        );
        row.stripe_customer_id = null;
      }
      if (subs) {
        const live = subs.data.find((s) => isLiveStatus(s.status));
        if (live) {
          await mirrorSubscription(live);
          return NextResponse.json({ error: 'already_subscribed' }, { status: 409 });
        }
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

    // One free trial per account: grant the 3-day trial only if this account
    // has never had a subscription. Cancel → resubscribe is charged immediately.
    // Phase 274: also deny the trial if this EMAIL has ever consumed one — the
    // used_trials ledger survives account deletion, so delete+recreate (the
    // livinitydemo abuse) can no longer reset trial eligibility.
    let emailUsedTrial = false;
    if (session.email) {
      const ut = await pool.query<{ exists: number }>(
        'SELECT 1 AS exists FROM used_trials WHERE email = lower($1) LIMIT 1',
        [session.email],
      );
      emailUsedTrial = ut.rows.length > 0;
    }
    const grantTrial = !row.has_used_trial && !emailUsedTrial;
    const subscriptionData: Record<string, unknown> = { metadata: { userId: session.userId } };
    if (grantTrial) {
      subscriptionData.trial_period_days = TRIAL_PERIOD_DAYS;
    }

    // Idempotency: a double-click or a lost-response retry within the same 15s
    // bucket returns the SAME checkout session instead of creating a second one
    // (which could yield two subscriptions / two trials for one user).
    const idempotencyKey = `checkout:${session.userId}:${interval}:${Math.floor(Date.now() / 15000)}`;

    // EDU discount: verified US `.edu` emails get $3.99/mo or $34.99/yr.
    // COUPLED INVARIANT: this sits BELOW the `session.emailVerified` 403 guard
    // (top of this handler) ON PURPOSE — a user only reaches checkout with an
    // email they actually verified (clicked the link), so they cannot claim the
    // `.edu` rate with an address they don't own. If that email-verification
    // guard is ever relaxed, this discount becomes spoofable.
    // TLD-ANCHORED (`/\.edu$/`), NOT `host.includes('.edu')` — `x@edu.evil.com`
    // and `notedu.com` must NOT qualify.
    const emailHost = (session.email.split('@')[1] ?? '').toLowerCase();
    const isEdu = /\.edu$/.test(emailHost);
    let priceId = priceIdForInterval(interval);
    if (isEdu) {
      const eduPrice = eduPriceIdForInterval(interval);
      if (eduPrice) {
        priceId = eduPrice;
      } else {
        console.warn(
          `[stripe-checkout] .edu user but STRIPE_PRICE_ID_EDU_${interval === 'yearly' ? 'YEARLY' : 'MONTHLY'} unset — using standard ${interval} price`,
        );
      }
    }

    const checkout = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: subscriptionData,
        // Returning subscribers without a trial pay now — make sure Stripe always
        // collects a payment method.
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        // Land on the install wizard: it polls billing until the webhook hits,
        // then auto-mints the API key — pay → install command in one flow.
        success_url: `${baseUrl()}/dashboard/install?checkout=success`,
        cancel_url: `${baseUrl()}/pricing?checkout=cancelled`,
      },
      { idempotencyKey },
    );

    if (!checkout.url) {
      return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 });
    }
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error('[stripe-checkout] Stripe API error:', err);
    // Surface the Stripe error CODE only (e.g. authentication_error /
    // resource_missing) — safe to expose, decisive for ops diagnosis.
    const e = err as { type?: string; code?: string; statusCode?: number; message?: string };
    return NextResponse.json(
      {
        error: 'Payment service is temporarily unavailable. Please try again.',
        hint: e?.code || e?.type || (e?.message ? e.message.slice(0, 80) : null),
      },
      { status: 502 },
    );
  }
}
