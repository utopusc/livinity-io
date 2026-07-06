# Stripe webhook runbook

Written 2026-07-06 after the launch-night→July-6 webhook outage was diagnosed and fixed.
This file is the durable record of the webhook's configuration and every failure mode we
have actually seen, with the exact recovery steps.

## Canonical configuration

| Thing | Value |
|---|---|
| Endpoint URL | `https://livinity.io/api/webhooks/stripe` |
| Endpoint id (live) | `we_1ThdhCQrAlAsl3FZYzVrse8S` (created launch day, 2026-06-12) |
| Subscribed events | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed` |
| Signing secret | Stripe → Workbench → Webhooks → endpoint → *Reveal signing secret* → Vercel env `STRIPE_WEBHOOK_SECRET` (**Production** scope). Env changes require a **redeploy**. |
| Handler | `src/app/api/webhooks/stripe/route.ts` (nodejs runtime, raw-body signature verification) |
| Idempotency | `stripe_events` table — one row per event id. Success rows persist; **failure rows persist too** (`failed_at` + `error`, migration 0028) and are re-claimable so Stripe's redelivery reprocesses them. 90-day cleanup in the enforce cron. |
| Watchdog | `enforce-subscriptions` cron checks the endpoint exists + is enabled (~1/hour) and emails `OPS_ALERT_EMAIL` (max 1/day) if not. Signature failures and handler failures also alert (max 1/hour each). |

## Health checks (fastest first)

1. **Are events landing?** `SELECT id, type, processed_at, failed_at, error FROM stripe_events ORDER BY processed_at DESC LIMIT 10;`
   - Recent rows with `failed_at IS NULL` → healthy.
   - Rows with `failed_at` set → handler bug: read `error`, check recent deploys. Stripe redelivers automatically for ~3 days; once fixed, the retry reprocesses.
   - **No recent rows despite subscription activity → delivery problem, go to (2).**
2. **Is the endpoint alive?** `stripe webhook_endpoints list --live` (CLI) or Workbench → Webhooks. Check `status` (must be `enabled`) and the URL.
3. **Is the secret right?** `curl -X POST https://livinity.io/api/webhooks/stripe -H "stripe-signature: t=1,v1=x" -d '{}'`
   - `400 {"error":"Invalid signature"}` → secret IS set server-side (good; if real deliveries still 400, it's set to the WRONG value).
   - `500 {"error":"Webhook not configured"}` → `STRIPE_WEBHOOK_SECRET` missing in the deployed env.
   - This probe does NOT page anyone: the sig-failure alert only fires for headers with Stripe's real shape (`t=<unix>,…v1=<64-hex>`); `t=1,v1=x` is log-only by design.
4. **Limbo rows** (claimed but neither succeeded nor failed — a crash between claim and completion; redeliveries then duplicate-ack until the 90-day cleanup). In the table alone a limbo row looks identical to a success (`failed_at IS NULL`), so the tell is on the STRIPE side: the endpoint's delivery attempts show an event STILL RETRYING (or exhausted with failures) while our row for that id has `failed_at IS NULL`. Recover: `DELETE FROM stripe_events WHERE id = 'evt_…';` then Workbench-Shell resend that event. (Rare: requires a crash in the milliseconds between claim and outcome; identical window existed in the old design.)

## Failure modes we have actually hit

### 1. Endpoint auto-disabled by Stripe (THE 3.5-week outage)
Symptom: `stripe_events` gains nothing, Stripe's own Events log shows events being created, dashboard "Resend" button absent. Cause: sustained 5xx from our handler (launch-night 42P08 bug) → Stripe disabled the endpoint; a disabled endpoint receives NOTHING, so our side shows zero failures.
Fix: Workbench → Webhooks → endpoint → **Enable**. Past events are NOT redelivered automatically — resend what matters (see below) or rely on the cron's stale-live reconcile.

### 2. "Resend" button missing in the dashboard
The dashboard only offers Resend on events that already have a delivery attempt to that endpoint. New/disabled endpoints have none. Use the **Workbench Shell** (the `$` prompt at the bottom of Workbench — it runs with full dashboard permissions):
```
stripe events resend evt_XXXXXXXX --webhook-endpoint we_1ThdhCQrAlAsl3FZYzVrse8S
```
Note: the LOCAL `stripe` CLI after `stripe login` holds a **restricted key** that cannot resend/update in live mode — the Workbench Shell is the privileged path.

### 3. Secret mismatch / roll
Symptom: deliveries 400 "Invalid signature" in Stripe's attempt log; sig-failure ops alert fires. Fix: reveal the endpoint's current signing secret → update Vercel `STRIPE_WEBHOOK_SECRET` (Production) → redeploy.

### 4. Handler bug (launch night's 42P08)
Symptom: rows appear with `failed_at`/`error` set, handler-failure ops alert fires, Stripe shows 500s. The event evidence is preserved now (pre-0028 the claim was deleted, hiding everything). Fix the bug, deploy — Stripe's automatic retries reprocess the failed rows.

## Defense-in-depth (works even with the webhook fully dead)
The `enforce-subscriptions` cron (every 15 min) reconciles any stored live status whose own period has passed directly against the Stripe API (`reconcileStaleLive`), and the dashboard load does the same (throttled). Statuses self-correct within ~15 minutes; the webhook only makes it instant. Admin → user → **Sync from Stripe** does it on demand.
