-- Phase 335 (ROLE-01/02) — delegated/scoped admin grants.
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with CREATE TABLE IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change. Additive / expand-only per the operator-locked invariant
-- (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- D-335-1: NO new users.role value — the users.role CHECK is never altered.
-- A "scoped admin" is a member holding admin_scopes rows (closed scope enum:
-- 'read-only-admin' = read-only access to the bounded admin query surface;
-- 'share-admin' = app sharing + group membership management). D-335-4: a
-- per-app operator is a member holding an app_operators row (logs/restart/
-- start/stop/update of ONE app; never uninstall/relocate/clone). Grants are
-- resolved from PG per request — never JWT-embedded. Absence of a row is
-- absence of privilege (fail-closed).

CREATE TABLE IF NOT EXISTS admin_scopes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('read-only-admin','share-admin')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scope)
);
CREATE INDEX IF NOT EXISTS idx_admin_scopes_user ON admin_scopes (user_id);

CREATE TABLE IF NOT EXISTS app_operators (
  app_id     TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_app_operators_user ON app_operators (user_id);
