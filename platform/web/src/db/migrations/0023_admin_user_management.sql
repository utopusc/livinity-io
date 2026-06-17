-- Phase 280 (v46.0 Trust/Safety): capture the admin user-management columns.
--
-- These three columns were added to the LIVE Supabase ad-hoc while the admin
-- actions route (api/admin/users/[id]/actions) was built, but never recorded as
-- a migration. The route, lib/subscription.ts (the access oracle), and the
-- enforce-subscriptions cron all reference them DEFENSIVELY (they swallow
-- Postgres 42703 / undefined_column so the app never 500s before the column
-- exists). This migration makes a FRESH Supabase rebuild reproduce prod.
--
-- All three are ADD COLUMN IF NOT EXISTS — safe to run against the live DB,
-- which already has them (verified 2026-06-17), and against a clean rebuild.
-- Apply via the Supabase SQL editor or psql.

-- Admin "suspend tenant" (abuse ban). NON-NULL ⇒ the user is banned: the access
-- oracle (lib/subscription.ts) returns active=false reason='suspended' which
-- OVERRIDES legacy_free / comp / an active Stripe subscription, and the
-- enforce-subscriptions restore pass skips them so billing can never silently
-- un-ban an abuser.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspended_at  TIMESTAMPTZ;

-- Time-boxed admin comp grant. While comp_until is in the future the user has
-- access regardless of Stripe (auto-expires; the enforce cron re-checks and
-- revokes once it passes). Below legacy_free, above any Stripe state.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS comp_until    TIMESTAMPTZ;

-- Free-text admin note shown on the user detail page (support context).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS admin_note    TEXT;

-- Partial index: the enforce cron + reconcilers only ever scan the (tiny) set
-- of suspended users, so an index on the non-null subset keeps that cheap.
CREATE INDEX IF NOT EXISTS idx_users_suspended_at
  ON public.users (suspended_at) WHERE suspended_at IS NOT NULL;
