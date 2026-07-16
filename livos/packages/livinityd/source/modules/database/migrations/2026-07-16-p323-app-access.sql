-- Phase 323 (IDENT-04) — group/user app access grants.
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with CREATE TABLE IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change. Additive / expand-only per the operator-locked invariant
-- (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- Mirrors file_acls EXACTLY (schema.sql:970-978, D-06) but keyed on app_id
-- instead of virtual_path. principal_type is 'user' or 'group' (the Phase-322
-- groups table is the group source); principal_id is the users.id or groups.id
-- UUID. access_type is 'none' | 'readonly' | 'full' — evaluated as the
-- most-permissive UNION of the user's direct grant + all their group grants for
-- the app (getEffectiveAppAccess in apps/app-access.ts). This table carries
-- GROUP grants ONLY (D-07 (b-i)); user_app_access (line 43) stays the sole
-- DIRECT-user source, untouched. granted_by is the admin who set it (ON DELETE
-- SET NULL keeps the grant if that admin is deleted). PK can't be ALTERed —
-- expand-only CREATE TABLE IF NOT EXISTS per migrations/index.ts:16-26.

CREATE TABLE IF NOT EXISTS app_access (
  app_id         TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user','group')),
  principal_id   UUID NOT NULL,
  access_type    TEXT NOT NULL DEFAULT 'full' CHECK (access_type IN ('none','readonly','full')),
  granted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, principal_type, principal_id)
);
CREATE INDEX IF NOT EXISTS idx_app_access_app ON app_access (app_id);
