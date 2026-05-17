-- =========================================================================
-- Migration 0012: Phase 140 — Cloudflare for SaaS multi-tenant schema
-- =========================================================================
-- Adds the columns + table needed to track per-user and per-app CF resources
-- provisioned via the cf-saas client (platform/web/src/lib/cf-saas.ts).
--
-- Schema changes:
--   1. users.cf_tunnel_id              — CF Tunnel UUID owned by the user
--   2. users.cf_tunnel_token_encrypted — encrypted tunnel token (BYTEA)
--   3. users.cf_dns_record_id_apex     — DNS record ID for {username}.livinity.io
--   4. users.cf_provisioned_at         — timestamp of first successful provision
--   5. user_app_subdomains             — one row per installed app subdomain
--
-- Idempotent (IF NOT EXISTS guards on every statement). Rollback companion
-- at 0012_phase_140_cf_saas_rollback.sql is manual-run only.
--
-- Note: gen_random_uuid() assumes pgcrypto is loaded into the `platform` DB.
-- Existing migrations (0000, 0004, 0005, etc.) use the same default without
-- an explicit CREATE EXTENSION — matching that convention here.
--
-- Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Additions to `users`
-- -------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cf_tunnel_id TEXT,
  ADD COLUMN IF NOT EXISTS cf_tunnel_token_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS cf_dns_record_id_apex TEXT,
  ADD COLUMN IF NOT EXISTS cf_provisioned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_cf_tunnel_id
  ON users(cf_tunnel_id)
  WHERE cf_tunnel_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 2. New `user_app_subdomains` table
-- -------------------------------------------------------------------------
-- One row per app a user has installed. Tracks the CF DNS record so we can
-- delete it cleanly during app uninstall (deprovisionAppSubdomain) and on
-- user delete (CASCADE -> deprovisionUser sweep).
--
-- Constraints:
--   - subdomain UNIQUE (global)         — only one `n8n-lucy` ever exists
--   - (user_id, app_slug) UNIQUE        — a user installs each app at most once
--   - ON DELETE CASCADE (user_id -> users.id)
--       — deleting a user removes app-subdomain rows. CF deprovision MUST run
--         in app code BEFORE the user row is deleted (orphaned CF resources
--         otherwise).
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_app_subdomains (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_slug          TEXT NOT NULL,
  subdomain         TEXT NOT NULL UNIQUE,
  cf_dns_record_id  TEXT NOT NULL,
  port              INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_slug)
);

CREATE INDEX IF NOT EXISTS idx_uas_user_id    ON user_app_subdomains(user_id);
CREATE INDEX IF NOT EXISTS idx_uas_subdomain  ON user_app_subdomains(subdomain);
