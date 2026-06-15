-- 0019_oauth_identities.sql — multi-provider OAuth sign-in (Approach A bridge).
--
-- Supabase Auth (GoTrue) is used ONLY as the OAuth broker: the browser does the
-- provider round-trip, and the server bridge (lib/oauth-bridge.ts) verifies the
-- resulting GoTrue access token (ES256 / JWKS) and maps the verified identity to
-- our existing custom `public.users` + `liv_session`. This table is the link
-- record between a provider identity and our user row (find-or-create-or-link).
--
-- - `password_hash` on `users` is already nullable → OAuth users keep it NULL.
-- - RLS is auto-enabled by the project's rls_auto_enable() event trigger; the
--   server uses the direct `pg` pool (bypasses RLS), same as every other table.
-- - UNIQUE(provider, provider_subject) makes a returning sign-in idempotent and
--   prevents two of our users claiming the same provider identity.

CREATE TABLE IF NOT EXISTS public.user_oauth_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider         VARCHAR(20)  NOT NULL,          -- 'google' | 'apple' | 'github' | 'azure'
  provider_subject TEXT         NOT NULL,          -- GoTrue 'sub' (stable per user identity)
  email            TEXT,                            -- email at link time (audit only)
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON public.user_oauth_identities(user_id);
