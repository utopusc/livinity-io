-- Phase: Email-verify-FIRST signup — defer user creation until the email link
-- is clicked, and defer CF tunnel provisioning until a subscription is taken.
--
-- pending_registrations holds an UNCONFIRMED signup (email + username + bcrypt
-- hash + verification token) BEFORE any public.users row exists:
--   • POST /api/auth/register  → INSERT/UPSERT a pending row + email the link
--                                (NO users row, NO CF tunnel, NO session).
--   • POST /api/auth/verify-email (link click) → promote the pending row into
--                                public.users (email_verified=TRUE), delete it,
--                                and log the user in.
--   • Stage 3 (mirrorSubscription on trial/paid) → provision the CF tunnel.
--
-- Abandoned rows are garbage-collected by /api/cron/enforce-subscriptions once
-- verification_expires has passed.
--
-- Apply to the Supabase/relay Postgres (psql or Supabase SQL editor).

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(255) NOT NULL,
  username             VARCHAR(64)  NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  verification_token   VARCHAR(255) NOT NULL,
  verification_expires TIMESTAMPTZ  NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness so a pending signup can't collide ANOTHER pending
-- signup. (verify-email re-checks against public.users to catch a slot taken
-- between register and the link click.) The lower(email) index is also the
-- ON CONFLICT target for register's upsert (re-register refreshes the link).
CREATE UNIQUE INDEX IF NOT EXISTS pending_registrations_email_key
  ON public.pending_registrations (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS pending_registrations_username_key
  ON public.pending_registrations (lower(username));

-- token lookup on verify; expiry index drives the cron cleanup sweep.
CREATE UNIQUE INDEX IF NOT EXISTS pending_registrations_token_key
  ON public.pending_registrations (verification_token);
CREATE INDEX IF NOT EXISTS pending_registrations_expires_idx
  ON public.pending_registrations (verification_expires);
