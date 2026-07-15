-- Phase 324 (FILES-01) — public share links (opaque-token, api_keys pattern).
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with CREATE TABLE IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change. Additive / expand-only per the operator-locked invariant
-- (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- The signed opaque token IS the auth for the one deliberate unauthenticated
-- surface (D-01/D-02). Only SHA-256(token) is persisted (token_hash CHAR(64)
-- UNIQUE) — a leaked DB never reveals a usable link. Rows are soft-revoked
-- (revoked_at) and NEVER hard-deleted so the owner's "my shares" audit list
-- can surface every share ever minted (D-05, CVE-2026-45285).

CREATE TABLE IF NOT EXISTS file_shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  virtual_path     TEXT NOT NULL,
  token_hash       CHAR(64) NOT NULL UNIQUE,
  token_prefix     TEXT NOT NULL,
  password_hash    TEXT,                       -- bcryptjs, NULL = no password
  expires_at       TIMESTAMPTZ,                -- NULL = never
  max_downloads    INTEGER,                    -- NULL = unlimited
  download_count   INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_file_shares_active ON file_shares (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_shares_owner ON file_shares (owner_user_id);
