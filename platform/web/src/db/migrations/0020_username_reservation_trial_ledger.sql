-- 0020_username_reservation_trial_ledger.sql — Phase 274
--
-- Make usernames + trial eligibility PERMANENTLY non-recyclable so the
-- delete→recreate abuse loop is structurally impossible.
--
-- Root cause (livinitydemo): admin delete is a HARD DELETE (no deleted_at on
-- users), so deleting a user FREED the username (only a UNIQUE constraint) AND
-- reset has_used_trial. Re-registering the same username then collided with the
-- still-existing CF tunnel `livos-{username}` / apex CNAME → provisioning
-- rolled back → had_tunnel:false → install 410 NO_TUNNEL.
--
-- This migration:
--   1. Makes users.username NULLABLE — signup no longer collects a username;
--      the user picks one in a later /username step (the row exists username-less
--      between account creation and the pick). The UNIQUE index stays (Postgres
--      UNIQUE permits multiple NULLs), so picked usernames are still unique.
--   2. Adds reserved_usernames — an APPEND-ONLY ledger of every username that has
--      ever been permanently claimed (written when a subscription goes
--      trialing|active). NEVER deleted on user delete → a username can never be
--      re-registered by anyone (blocked for everyone, including the prior owner).
--   3. Adds used_trials — an APPEND-ONLY ledger keyed on lower(email) so deleting
--      + recreating an account cannot reset the one-free-trial eligibility.
--   4. Relaxes pending_registrations.username to NULLABLE (register no longer
--      collects it).
--   5. Backfills both ledgers from current data + seeds known deleted abusers.
--
-- RLS is auto-enabled by the project's rls_auto_enable() event trigger; the
-- server uses the direct `pg` pool (bypasses RLS), same as every other table.
--
-- Apply to the Supabase Postgres (psql or Supabase SQL editor). Idempotent —
-- safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP NOT NULL is a
-- no-op once dropped).

-- 1. username nullable (UNIQUE index users_username_key is left intact).
ALTER TABLE public.users        ALTER COLUMN username DROP NOT NULL;
ALTER TABLE public.pending_registrations ALTER COLUMN username DROP NOT NULL;

-- 2. Permanent username reservation ledger (blocked-for-everyone, append-only).
CREATE TABLE IF NOT EXISTS public.reserved_usernames (
  username     VARCHAR(32)  PRIMARY KEY,            -- normalized lower-case
  reserved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reason       TEXT,                                 -- 'purchased' | 'backfill' | 'seed-deleted'
  last_user_id UUID,                                 -- audit: who held it last (nullable; NOT a live FK)
  last_email   TEXT                                  -- audit: their email at reserve time
);

-- 3. Permanent trial-eligibility ledger (per identity, append-only).
CREATE TABLE IF NOT EXISTS public.used_trials (
  email   TEXT         PRIMARY KEY,                  -- ALWAYS stored lower(email)
  used_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  user_id UUID                                       -- audit (nullable; NOT a live FK)
);

-- 4. Backfill reserved_usernames from every current username.
INSERT INTO public.reserved_usernames (username, reason, last_user_id, last_email)
SELECT lower(username), 'backfill', id, lower(email)
  FROM public.users
 WHERE username IS NOT NULL
ON CONFLICT (username) DO NOTHING;

-- 5. Backfill used_trials from everyone who has already consumed a trial.
INSERT INTO public.used_trials (email, user_id)
SELECT lower(email), id
  FROM public.users
 WHERE has_used_trial = TRUE AND email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- 6. Seed the known deleted abusers (livinitydemo / livinityio, same person,
--    email livinityio@gmail.com) so the freed slots can never be re-claimed and
--    they cannot re-trial.
INSERT INTO public.reserved_usernames (username, reason)
VALUES ('livinitydemo', 'seed-deleted'), ('livinityio', 'seed-deleted')
ON CONFLICT (username) DO NOTHING;

INSERT INTO public.used_trials (email)
VALUES ('livinityio@gmail.com')
ON CONFLICT (email) DO NOTHING;
