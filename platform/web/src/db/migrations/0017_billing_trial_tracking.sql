-- Phase: Stripe billing follow-up — one-trial-per-account enforcement.
--
-- has_used_trial: set TRUE the first time an account ever has a Stripe
-- subscription (the moment a trialing/active sub is mirrored). Checkout then
-- grants the 3-day trial ONLY when this is FALSE, so cancel → resubscribe does
-- NOT hand out a second free trial (the account is charged immediately instead).
--
-- Apply to the Supabase/relay Postgres (psql or Supabase SQL editor).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: anyone who already has (or had) a Stripe subscription has already
-- consumed their trial. Idempotent.
UPDATE public.users
   SET has_used_trial = TRUE
 WHERE has_used_trial = FALSE
   AND (stripe_subscription_id IS NOT NULL OR subscription_status IS NOT NULL);
