-- Phase 329 (APPS-04) — job_runs run-history table for custom-command jobs.
--
-- Documentation mirror of the schema.sql additive block. There is no live
-- migration runner (see migrations/index.ts): schema.sql is applied
-- idempotently at boot by initDatabase() with CREATE TABLE/INDEX IF NOT EXISTS.
-- This file is the discrete, reviewable, hand-runnable artifact for the same
-- change and — unlike the un-registered p325 quota file — IS registered in
-- ALL_MIGRATIONS (migrations/index.ts, drift #7). Additive / expand-only per the
-- operator-locked invariant (migrations/index.ts:16-26): no destructive ALTER/DROP.
--
-- One row per custom-command execution (started/finished, status, truncated
-- LAST-16 KB output/error). Retention is enforced at runtime by the scheduler's
-- pruneJobRuns() (keep last 20 runs per job_name + 30-day cap, D-14), NOT here.

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS job_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id       UUID,
    job_name     TEXT NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL,
    finished_at  TIMESTAMPTZ,
    status       TEXT NOT NULL,
    output       TEXT,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON job_runs (job_name, started_at DESC);
END$$;
