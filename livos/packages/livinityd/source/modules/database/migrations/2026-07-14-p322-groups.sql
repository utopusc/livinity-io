-- Phase 322 (IDENT-01) — groups + group_members.
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with CREATE TABLE IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change. Additive / expand-only per the operator-locked invariant
-- (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- These two tables are the SINGLE groups source consumed by OIDC group claims
-- (322-04), file ACLs (Phase 324/FILES-02), and app sharing (Phase 323/IDENT-04).

CREATE TABLE IF NOT EXISTS groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
