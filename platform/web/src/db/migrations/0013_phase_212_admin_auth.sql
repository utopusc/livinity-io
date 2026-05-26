-- Phase 212: add is_admin + last_seen_at to users; seed operator admin.
-- created_at already exists on public.users (default now()).
-- Seed condition: bruce username OR hello@bruceoz.com email — whichever exists,
-- both get is_admin=true. Idempotent (re-running is safe).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_is_admin_idx ON public.users (is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS users_last_seen_at_idx ON public.users (last_seen_at DESC NULLS LAST);

UPDATE public.users
  SET is_admin = TRUE
  WHERE username = 'bruce' OR email = 'hello@bruceoz.com';
