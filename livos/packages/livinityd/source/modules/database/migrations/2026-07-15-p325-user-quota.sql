-- Phase 325 (STOR-02) — app-layer soft per-user storage quota.
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with ADD COLUMN IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change. Additive / expand-only per the operator-locked invariant
-- (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- `quota_bytes` is the hard byte ceiling for a user's data subtree; NULL =
-- unlimited / no quota (backward-compatible default for all existing + new
-- rows). Cached USAGE lives NOT in PG but in the FileStore `storageQuota` key,
-- written by the `user-quota-scan` scheduler job — so no second migration.

DO $$
BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_bytes BIGINT;
END$$;
