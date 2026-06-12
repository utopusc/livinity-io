-- Phase: Stripe billing — $7.99/mo (price_1ThcAeQrAlAsl3FZ8fqbNVWR) or
-- $69.99/yr (price_1ThcAeQrAlAsl3FZ7LXZzw62), 3-day free trial (code-side
-- trial_period_days=3, card upfront). Stripe owns the trial clock; we mirror
-- subscription.status into users via webhooks and gate access on it.
--
-- Gate = subscription_status IN ('trialing','active') (NOT just 'active' —
-- status is 'trialing' for the 3 trial days) OR legacy_free=true.
-- Apply to the Supabase/relay Postgres (psql or Supabase SQL editor).

-- ── Subscription columns on users ──────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id      VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_subscription_id  VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_status     VARCHAR(20);   -- trialing|active|past_due|canceled|paused|incomplete|incomplete_expired|unpaid|NULL(never subscribed)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_price_id         VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_period_end      TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE;

-- past_due grace: when the first failed-payment was observed. The enforcement
-- cron cuts access only after grace (3 days) has elapsed since this timestamp.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS past_due_since          TIMESTAMPTZ;

-- Enforcement bookkeeping: when the CF tunnel was de-provisioned for this user.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS access_revoked_at       TIMESTAMPTZ;

-- Grandfather: existing verified users keep free access; only NEW signups must
-- subscribe. hasActiveAccess() returns true when legacy_free=true.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS legacy_free             BOOLEAN NOT NULL DEFAULT FALSE;

-- stripe_customer_id must be unique (one Stripe customer per user). Partial-safe:
-- add the constraint only if absent.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_stripe_customer_id_key') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_stripe_customer_id_key UNIQUE (stripe_customer_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_subscription_status_idx ON public.users (subscription_status);
CREATE INDEX IF NOT EXISTS users_stripe_customer_id_idx  ON public.users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS users_current_period_end_idx  ON public.users (current_period_end);

-- ── Grandfather existing verified users (run ONCE at migration time) ────────
-- Every account that already exists + is email-verified keeps free access so we
-- never break a live box. New signups (created after this migration) default to
-- legacy_free=false and must subscribe.
UPDATE public.users SET legacy_free = TRUE WHERE email_verified = TRUE;

-- ── Webhook idempotency ─────────────────────────────────────────────────────
-- Stripe event IDs (evt_…) — natural PK dedupes redelivered/duplicate events.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id           VARCHAR(255) PRIMARY KEY,
  type         VARCHAR(64),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
