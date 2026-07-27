-- Phase 197-03 — Mastra-required tables for Liv AI agent memory.
-- Idempotent: every CREATE uses IF NOT EXISTS. Safe to re-run.
-- No destructive (table-remove) statements anywhere.

-- Phase 368.8-18 — `CREATE EXTENSION IF NOT EXISTS vector;` used to be here and
-- was removed. On a box whose Postgres has no pgvector package it raises
--   extension "vector" is not available
-- and, because the whole file is executed as ONE query, it took every statement
-- below down with it — so mastra_* was absent on every such box while the log
-- called the failure "non-fatal".
--
-- Checked before deleting rather than assumed: no column in this file uses the
-- `vector` type, and the only `vector` in the wider schema is `content_tsv
-- TSVECTOR` (database/schema.sql), which is Postgres's built-in full-text type
-- and has nothing to do with pgvector. Nothing here needs the extension.
--
-- If an embedding column is ever added, add the extension back as its own
-- statement with its own error handling — never inline in this batch.

CREATE TABLE IF NOT EXISTS mastra_threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  text,
  title        text,
  metadata     jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mastra_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid REFERENCES mastra_threads(id) ON DELETE CASCADE,
  role        text NOT NULL,
  content     text NOT NULL,
  tool_calls  jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mastra_working_memory (
  thread_id   uuid PRIMARY KEY REFERENCES mastra_threads(id) ON DELETE CASCADE,
  content     text,
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mastra_workflow_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   text NOT NULL,
  status        text NOT NULL,
  state         jsonb,
  created_at    timestamptz DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mastra_messages_thread ON mastra_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_mastra_workflow_runs_status ON mastra_workflow_runs(status);
