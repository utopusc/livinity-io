-- =========================================================================
-- Migration 0012 ROLLBACK: Phase 140 — Cloudflare for SaaS multi-tenant
-- =========================================================================
-- Manual-run only. NOT applied by any automated migration runner.
--
-- Use case: emergency revert after a botched 140-04 register-flow rollout
-- has left `users` with NULL cf_* columns we'd rather drop, or full schema
-- teardown during a staging-DB reset.
--
-- WARNING:
--   - Dropping `user_app_subdomains` discards every recorded CF DNS record
--     ID. After rollback, deprovisionAppSubdomain calls will have no way to
--     locate the CF resources -> manual cleanup via the CF dashboard required.
--   - Dropping the cf_tunnel_id / cf_tunnel_token_encrypted columns abandons
--     every provisioned CF Tunnel record. Re-running 140-04 will create NEW
--     tunnels per user; orphaned old tunnels must be deleted manually.
--
-- To apply:
--   psql -U platform -d platform -f 0012_phase_140_cf_saas_rollback.sql
--
-- Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
-- =========================================================================

DROP TABLE IF EXISTS user_app_subdomains;

DROP INDEX IF EXISTS idx_users_cf_tunnel_id;

ALTER TABLE users
  DROP COLUMN IF EXISTS cf_tunnel_id,
  DROP COLUMN IF EXISTS cf_tunnel_token_encrypted,
  DROP COLUMN IF EXISTS cf_dns_record_id_apex,
  DROP COLUMN IF EXISTS cf_provisioned_at;
