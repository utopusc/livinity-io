-- Phase 218 T3 — user_app_subdomains table.
--
-- Mini PC schema drift fix: Phase 140-05 added this table to the Supabase
-- platform DB (where Server5 mints CF DNS records) but never added it to the
-- on-box Postgres that livinityd uses. The Phase 140 hyphen-pattern subdomain
-- (e.g. `bolt-diy-bruce.livinity.io`) is minted Server5-side then cached
-- locally so Caddy can regenerate without re-asking Server5 on every reload.
--
-- Without this table, T2's buildCaddyConfigFromState() helper cannot read the
-- canonical FQDN for an installed app, falls back to the legacy compute path
-- that produces the wrong shape, and the Caddy regen ships a stale Caddyfile.
--
-- Schema notes:
--   - app_slug is the canonical identifier (mirrors apps.slug in Supabase,
--     and is what Server5 mints the DNS record against). app_id is the
--     LivOS-internal UUID kept for join symmetry with user_app_instances.
--     No FK on app_id because the local apps table is not guaranteed to
--     exist on every install shape.
--   - subdomain stores the full host (e.g. `bolt-diy-bruce.livinity.io`),
--     NOT just the label. This matches the SubdomainConfig.host field in
--     caddy.ts (post Phase 141-03) so reads are zero-transform.
--   - UNIQUE (user_id, app_slug) so re-install upserts cleanly.
--
-- This file mirrors the table block added to schema.sql in the same commit;
-- schema.sql is the authoritative apply path (CREATE TABLE IF NOT EXISTS
-- runs in initDatabase() at boot), this migration file is the audit record.

CREATE TABLE IF NOT EXISTS user_app_subdomains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id           TEXT,
  app_slug         TEXT NOT NULL,
  subdomain        TEXT NOT NULL,
  cf_dns_record_id TEXT,
  port             INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_app_subdomains_user
  ON user_app_subdomains (user_id);
