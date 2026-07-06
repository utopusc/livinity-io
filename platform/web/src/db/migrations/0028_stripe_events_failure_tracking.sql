-- 0028: stripe_events failure tracking (webhook observability, Phase C).
--
-- WHY: the original idempotency design DELETED the claim row whenever the
-- handler failed, so a persistently-failing webhook left stripe_events at
-- 0 rows — indistinguishable from "Stripe never delivered anything". That
-- exact blind spot hid the June-12→July-6 2026 outage (launch-night 42P08
-- 500-streak → Stripe auto-disabled the endpoint) for 3+ weeks.
--
-- failed_at / error: failures are now MARKED and kept visible instead of
-- deleted. The webhook claim treats failed rows as re-claimable, so Stripe's
-- redelivery still reprocesses them (same at-most-once-success semantics).
-- Rows (success and failed alike) age out via the existing 90-day cleanup.
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS error TEXT;
