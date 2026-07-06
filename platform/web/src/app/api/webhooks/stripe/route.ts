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
//   - ATOMIC idempotency via stripe_events PK: the event id is CLAIMED first;
//     a concurrent redelivery loses the race and acks as duplicate. A handler
//     failure MARKS the row failed (failed_at/error, migration 0028) instead
//     of deleting it — a failed row stays visible AND is re-claimable, so the
//     500 → Stripe-redelivery loop still reprocesses it. (The old design
//     deleted the claim on failure, which left the table at 0 rows during the
//     June-12→July-6 '26 outage — indistinguishable from "nothing delivered".)
//   - Out-of-order safe: handlers re-fetch the subscription from Stripe and
//     write its CURRENT state instead of trusting the event payload snapshot.
//   - stripe v22 (Basil API): an invoice's subscription ref lives at
//     invoice.parent.subscription_details.subscription — not top-level.
//   - Ops alerts (throttled, best-effort): signature failures (secret
//     mismatch/roll) and handler failures page the operator instead of dying
//     silently in logs.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import pool from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { syncSubscription } from '@/lib/stripe-sync';
import { sendTrialEndingEmail, sendPaymentFailedEmail } from '@/lib/email';
import { opsAlertThrottled, escapeHtml } from '@/lib/ops-alert';

const UNDEFINED_COLUMN = '42703';

/**
 * Atomically claim an event for processing. Returns false when another
 * delivery already SUCCEEDED with this id (true duplicate). A previously
 * FAILED row is re-claimable: its failure marker is reset and processing
 * runs again (this is what makes Stripe's redelivery actually work now that
 * failures are kept instead of deleted). DEFENSIVE-SCHEMA: before migration
 * 0028 (failed_at/error absent) falls back to the legacy claim, whose
 * failure path releases the claim by deleting the row.
 */
async function claimEvent(id: string, type: string): Promise<boolean> {
  try {
    const res = await pool.query(
      `INSERT INTO stripe_events (id, type) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE
         SET failed_at = NULL, error = NULL, processed_at = NOW()
       WHERE stripe_events.failed_at IS NOT NULL
       RETURNING id`,
      [id, type],
    );
    return res.rows.length > 0;
  } catch (err) {
    if ((err as { code?: string })?.code !== UNDEFINED_COLUMN) throw err;
    const res = await pool.query(
      'INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id',
      [id, type],
    );
    return res.rows.length > 0;
  }
}

/**
 * Record a handler failure on the claimed row (kept + re-claimable) instead
 * of deleting the evidence. Falls back to the legacy claim-release DELETE if
 * the 0028 columns are absent or the UPDATE itself fails — the invariant
 * that matters is "a failed event must remain reprocessable".
 */
async function markEventFailed(id: string, cause: unknown): Promise<void> {
  const msg = String((cause as Error)?.message ?? cause).slice(0, 500);
  try {
    await pool.query(
      'UPDATE stripe_events SET failed_at = NOW(), error = $2 WHERE id = $1',
      [id, msg],
    );
  } catch (err) {
    if ((err as { code?: string })?.code !== UNDEFINED_COLUMN) {
      console.error('[stripe-webhook] failed-mark write failed — releasing claim instead:', err);
    }
    await pool
      .query('DELETE FROM stripe_events WHERE id = $1', [id])
      .catch((delErr) => console.error('[stripe-webhook] claim release failed:', delErr));
  }
}

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
    // The one remaining silent-500-streak shape (an env loss on redeploy) —
    // exactly how the original outage started. Page the operator directly
    // instead of waiting for Stripe to give up and disable the endpoint.
    await opsAlertThrottled(
      'stripe-secret-missing',
      3600,
      'STRIPE_WEBHOOK_SECRET missing — all webhook deliveries are 500ing',
      `<p style="color:#555;line-height:1.6;">The deployed environment has no <code>STRIPE_WEBHOOK_SECRET</code>, so every Stripe delivery to <code>/api/webhooks/stripe</code> returns 500. Restore the env var in Vercel (Production) and redeploy — see platform/web/STRIPE-WEBHOOK-RUNBOOK.md.</p>`,
    );
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
    // Only page when the header has Stripe's REAL shape (t=<unix>,…v1=<64hex>) —
    // that means an authentic-looking delivery failed verification, i.e. the
    // endpoint's signing secret was rolled/recreated and Vercel's
    // STRIPE_WEBHOOK_SECRET no longer matches (every event silently 400s).
    // Scanner junk and curl health-probes (e.g. "t=1,v1=x") log-only, so a
    // drive-by prober can't ring the pager. Max 1 email/hour.
    const looksLikeRealStripeSig =
      /^t=\d{9,},/.test(signature) && /v1=[0-9a-f]{64}/.test(signature);
    if (looksLikeRealStripeSig) {
      await opsAlertThrottled(
        'stripe-sig-fail',
        3600,
        'Stripe webhook signature failures — secret likely mismatched',
        `<p style="color:#555;line-height:1.6;">Deliveries to <code>/api/webhooks/stripe</code> are failing signature verification and being rejected with 400 — no billing events are reaching the database.</p>
         <p style="color:#555;line-height:1.6;">Most likely cause: the endpoint's signing secret was rolled or the endpoint was recreated, and Vercel's <code>STRIPE_WEBHOOK_SECRET</code> (Production) no longer matches. Reveal the secret in Stripe → Workbench → Webhooks and update the env var, then redeploy.</p>`,
      );
    }
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Atomic dedupe: CLAIM the event id before processing. A concurrent or
  // later redelivery of a SUCCEEDED event gets no row back and acks; a
  // previously FAILED event is re-claimed and reprocessed.
  const claimed = await claimEvent(event.id, event.type);
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error(`[stripe-webhook] handler failed for ${event.type} (${event.id}):`, err);
    // Keep the evidence + stay reprocessable, then let Stripe redeliver.
    await markEventFailed(event.id, err);
    // Throttle key includes the event type: two DIFFERENT broken handlers in
    // the same hour each page once (bounded — the endpoint subscribes to 7
    // types). The error text is HTML-escaped before interpolation.
    await opsAlertThrottled(
      `stripe-handler-fail:${event.type}`,
      3600,
      `Stripe webhook handler failing (${event.type})`,
      `<p style="color:#555;line-height:1.6;">Processing <code>${event.type}</code> (<code>${event.id}</code>) threw:</p>
       <pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;">${escapeHtml(String((err as Error)?.message ?? err).slice(0, 500))}</pre>
       <p style="color:#555;line-height:1.6;">The event is marked failed in <code>stripe_events</code> (kept + re-claimable) and Stripe will redeliver. If this repeats, check the row's <code>error</code> column and recent deploys.</p>`,
    );
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
