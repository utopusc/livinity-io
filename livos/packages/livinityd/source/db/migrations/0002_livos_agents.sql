-- Phase 202-01 — `livos_agents` registry table.
-- Idempotent: every CREATE / DROP TRIGGER IF EXISTS pattern. Safe to re-run.
--
-- Decisions honoured:
--   D-202-01 — PostgreSQL `livos_agents` in existing `livos` DB
--   D-202-02 — Drizzle migration pattern (sibling of Mastra `001-mastra-tables.sql`)
--   D-202-13 — sub-agent depth ≤ 2 (parent + 1 layer)
--   D-202-14 — UNIQUE constraint on `name`
--
-- Threat mitigations:
--   T-202-02 — DB UNIQUE on `name` (duplicate-name insert blows up at the DB)
--   T-202-04 — recursion-depth trigger raises EXCEPTION on grandchild insert/update
--   INV-202-07 — UNIQUE constraint enforced (form validation lives in 202-03+)

CREATE TABLE IF NOT EXISTS livos_agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  instructions    TEXT NOT NULL DEFAULT '',
  model_name      TEXT NOT NULL DEFAULT 'grok-4.3',
  tool_ids        TEXT[] NOT NULL DEFAULT '{}',
  schedule_cron   TEXT,
  parent_agent_id TEXT REFERENCES livos_agents(id) ON DELETE SET NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  system          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS livos_agents_parent_idx
  ON livos_agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS livos_agents_enabled_idx
  ON livos_agents(enabled) WHERE enabled = true;

-- T-202-04 — prevent recursion depth > 2 (grandchildren disallowed).
-- If the row's parent itself has a parent, this would be a grandchild → reject.
CREATE OR REPLACE FUNCTION livos_agents_no_grandchildren() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_agent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM livos_agents
      WHERE id = NEW.parent_agent_id AND parent_agent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Sub-agent depth > 2 not allowed (D-202-13)';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS livos_agents_depth_check ON livos_agents;
CREATE TRIGGER livos_agents_depth_check
  BEFORE INSERT OR UPDATE ON livos_agents
  FOR EACH ROW EXECUTE FUNCTION livos_agents_no_grandchildren();
