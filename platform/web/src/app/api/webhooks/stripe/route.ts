// POST /api/webhooks/stripe — Stripe event sink.
//
// Mirrors subscription state into users.* (keyed by stripe_customer_id) so the
// access gate (lib/subscription.ts) never has to call Stripe at request time.
// The mirror itself lives in lib/stripe-sync.ts (shared with the checkout
// route's webhook-failure self-heal).
//
// Invariants:
//   - nodejs runtime + raw `req.text()` body: signature verification needs the
//     exact bytes Stripe sent (middleware.ts matcher does not touch this path).
//   - ATOMIC idempotency via stripe_events PK: the event id is CLAIMED first
//     (INSERT … ON CONFLICT DO NOTHING RETURNING) so a concurrent redelivery
//     loses the race and acks as duplicate. If the handler then fails, the
//     claim is released and a 500 makes Stripe redeliver.
//   - Out-of-order safe: handlers re-fetch the subscription from Stripe and
//     write its CURRENT state instead of trusting the event payload snapshot.
//   - stripe v22 (Basil API): an invoice's subscription ref lives at
//     invoice.parent.subscription_details.subscription — not top-level.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import pool from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { syncSubscription } from '@/lib/stripe-sync';
import { sendTrialEndingEmail, sendPaymentFailedEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function customerIdOf(obj: { customer: string | Stripe.Customer | Stripe.DeletedCustomer | null }): string | null {
  if (!obj.customer) return null;
  return typeof obj.customer === 'string' ? obj.customer : obj.customer.id;
}

async function emailForCustomer(customerId: string): Promise<string | null> {
  const r = await pool.query<{ email: string }>(
    'SELECT email FROM users WHERE stripe_customer_id = $1',
    [customerId],
  );
  return r.rows[0]?.email ?? null;
}

/** Subscription id referenced by an invoice (Basil: nested under parent). */
function subscriptionIdOfInvoice(inv: Stripe.Invoice): string | null {
  const ref = inv.parent?.subscription_details?.subscription;
  if (!ref) {
    // Non-subscription invoice (one-off / manual) or missing parent chain —
    // nothing to sync, but never fail silently.
    console.warn(
      `[stripe-webhook] invoice ${inv.id} has no parent.subscription_details.subscription (customer=${customerIdOf(inv)})`,
    );
    return null;
  }
  return typeof ref === 'string' ? ref : ref.id;
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const cs = event.data.object as Stripe.Checkout.Session;
      const subId = typeof cs.subscription === 'string' ? cs.subscription : cs.subscription?.id;
      if (subId) await syncSubscription(subId);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub.id);
      break;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdOfInvoice(inv);
      if (subId) await syncSubscription(subId);

      if (event.type === 'invoice.payment_failed') {
        const customerId = customerIdOf(inv);
        const email = customerId ? await emailForCustomer(customerId) : null;
        if (email) {
          // Best-effort: an email outage must not 500 the event (Stripe would
          // redeliver and re-send on every retry).
          await sendPaymentFailedEmail(email).catch((err) =>
            console.error('[stripe-webhook] payment-failed email failed:', err),
          );
        } else {
          console.warn(
            `[stripe-webhook] payment-failed email skipped: no user email for customer=${customerId} (invoice=${inv.id})`,
          );
        }
      }
      break;
    }

    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object as Stripe.Subscription;
      // Sync first so the DB reflects 'trialing' even if this event beats
      // customer.subscription.created (out-of-order delivery).
      await syncSubscription(sub.id);

      const customerId = customerIdOf(sub);
      const email = customerId ? await emailForCustomer(customerId) : null;
      if (email) {
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
        await sendTrialEndingEmail(email, trialEnd).catch((err) =>
          console.error('[stripe-webhook] trial-ending email failed:', err),
        );
      } else {
        console.warn(
          `[stripe-webhook] trial-ending email skipped: no user email for customer=${customerId} (sub=${sub.id})`,
        );
      }
      break;
    }

    default:
      // Endpoint is subscribed to a fixed event list; anything else is fine to ack.
      console.log(`[stripe-webhook] ignoring unhandled event type ${event.type}`);
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Atomic dedupe: CLAIM the event id before processing. A concurrent or
  // later redelivery hits the PK conflict, gets no row back, and acks.
  const claim = await pool.query(
    'INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id',
    [event.id, event.type],
  );
  if (claim.rows.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error(`[stripe-webhook] handler failed for ${event.type} (${event.id}):`, err);
    // Release the claim so Stripe's redelivery actually reprocesses.
    await pool
      .query('DELETE FROM stripe_events WHERE id = $1', [event.id])
      .catch((delErr) => console.error('[stripe-webhook] claim release failed:', delErr));
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
