-- Phase 324 (FILES-02) — per-path user/group ACLs.
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with CREATE TABLE IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change. Additive / expand-only per the operator-locked invariant
-- (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- A grant is keyed on (virtual_path, principal_type, principal_id) and carries a
-- level. principal_type is 'user' or 'group' (the Phase-322 groups table is the
-- group source); principal_id is the users.id / groups.id UUID. level is
-- 'none' | 'read' | 'write' — evaluated as the most-permissive UNION of the
-- user's direct grant + all their group grants at the EXACT path (`none`
-- overrides only when it is the sole applicable rule, D-08). NON-inheriting,
-- explicit-path v1 (NO subtree tree-walk). This ADDS cross-user visibility on
-- top of the structural per-user isolation and can NEVER escape
-- virtualToSystemPath containment. NO POSIX ACLs / setfacl.

CREATE TABLE IF NOT EXISTS file_acls (
  virtual_path   TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user','group')),
  principal_id   UUID NOT NULL,
  level          TEXT NOT NULL CHECK (level IN ('none','read','write')),
  granted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (virtual_path, principal_type, principal_id)
);
CREATE INDEX IF NOT EXISTS idx_file_acls_path ON file_acls (virtual_path);
