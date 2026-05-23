-- Phase 197-03 — Mastra-required tables for Liv AI agent memory.
-- Idempotent: every CREATE uses IF NOT EXISTS. Safe to re-run.
-- No destructive (table-remove) statements anywhere.

CREATE EXTENSION IF NOT EXISTS vector;

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
