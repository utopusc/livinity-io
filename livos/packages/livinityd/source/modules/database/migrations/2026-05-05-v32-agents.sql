-- Phase 85 V32-AGENT-01 — agents table (v32 milestone, Wave 1 schema slice).
--
-- Design notes (deviations from CONTEXT.md DDL, documented in 85-SCHEMA-SUMMARY.md):
--
-- 1. Primary key column named `id` (not `agent_id`) to match the project-wide
--    convention: every other table in schema.sql uses `id UUID PRIMARY KEY`
--    (users, sessions, environments, docker_agents, api_keys, messages, etc.).
--    Consistency with siblings beats CONTEXT verbatim — repo + tRPC consumers
--    will map column->property the same way they do for every other table.
--
-- 2. FK targets `users(id)` (not `users(user_id)`) because the users table PK
--    column is `id`, not `user_id` (see schema.sql line 5).
--
-- 3. user_id is NULLABLE (not NOT NULL). Two reasons:
--    a. CONTEXT V32-AGENT-03 explicitly requires system seeds with no owner
--       ("agents.user_id allows NULL OR uses a system user UUID; pick the
--       existing pattern from agent_templates"). agent_templates has NO
--       user_id column at all; the closest pattern with a user_id column is
--       git_credentials (line 175-183 in schema.sql) which uses nullable
--       `user_id REFERENCES users(id) ON DELETE SET NULL`. We pick NULLABLE.
--    b. CONTEXT mandates ON DELETE CASCADE (V32-AGENT-01 DDL); we keep CASCADE
--       so deleting a user wipes their personal agents, but system seeds
--       (user_id=NULL) survive. CASCADE on a NULL FK is a no-op for that row.
--
-- This migration is applied via two paths:
--   - At boot: schema.sql appends the same DDL with IF NOT EXISTS (idempotent).
--   - For documentation/manual deploy review: this file as a discrete artifact.
-- Both must stay in sync. Future migrations follow the same dual-write rule
-- until livinityd grows a real migration runner (out of scope for v32).

CREATE TABLE IF NOT EXISTS agents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  description              TEXT NOT NULL DEFAULT '',
  system_prompt            TEXT NOT NULL DEFAULT 'You are a helpful assistant.',
  model_tier               TEXT NOT NULL DEFAULT 'sonnet'
                             CHECK (model_tier IN ('haiku', 'sonnet', 'opus')),
  configured_mcps          JSONB NOT NULL DEFAULT '[]'::jsonb,
  agentpress_tools         JSONB NOT NULL DEFAULT '{}'::jsonb,
  avatar                   TEXT,
  avatar_color             TEXT,
  is_default               BOOLEAN NOT NULL DEFAULT FALSE,
  is_public                BOOLEAN NOT NULL DEFAULT FALSE,
  marketplace_published_at TIMESTAMPTZ,
  download_count           INTEGER NOT NULL DEFAULT 0,
  tags                     TEXT[] NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id
  ON agents(user_id);

CREATE INDEX IF NOT EXISTS idx_agents_is_public_published
  ON agents(is_public, marketplace_published_at)
  WHERE is_public = TRUE;

CREATE INDEX IF NOT EXISTS idx_agents_default
  ON agents(user_id, is_default)
  WHERE is_default = TRUE;

-- V32-AGENT-04 — backfill existing agent_templates rows into agents as
-- read-only public entries. agent_templates is NOT dropped (per CONTEXT —
-- v33 cleanup phase will retire it). Backfill is idempotent: duplicate slug
-- inserts are no-ops because we INSERT...WHERE NOT EXISTS keyed on a stable
-- name match.
--
-- Column mapping (explicit, no SELECT *):
--   agent_templates.slug          -> agents.id (deterministic UUID via md5)
--                                    NOTE: instead of synthesizing a UUID from
--                                    slug, we simply insert with a fresh
--                                    gen_random_uuid() and key idempotency on
--                                    (name, user_id IS NULL) which is
--                                    sufficient because the 5 v32 system seeds
--                                    use a different name set than the 8
--                                    Phase 76 templates.
--   agent_templates.name          -> agents.name
--   agent_templates.description   -> agents.description
--   agent_templates.system_prompt -> agents.system_prompt
--   agent_templates.tools_enabled -> agents.agentpress_tools (JSONB->JSONB)
--                                    NOTE: tools_enabled is a JSON array of
--                                    tool name strings; agentpress_tools is a
--                                    JSON object of {toolName: bool}. We
--                                    convert via jsonb_object_agg.
--   agent_templates.tags          -> agents.tags
--   agent_templates.mascot_emoji  -> agents.avatar
--   (no source col)               -> agents.avatar_color  = NULL
--   (no source col)               -> agents.model_tier    = 'sonnet' (default)
--   (no source col)               -> agents.configured_mcps = '[]' (default)
--   (constants)                   -> agents.is_public = TRUE, is_default = FALSE

INSERT INTO agents
  (name, description, system_prompt, agentpress_tools, tags, avatar,
   model_tier, configured_mcps, is_public, is_default, marketplace_published_at)
SELECT
  t.name,
  t.description,
  t.system_prompt,
  COALESCE(
    (SELECT jsonb_object_agg(tool_name, TRUE)
     FROM jsonb_array_elements_text(t.tools_enabled) AS tool_name),
    '{}'::jsonb
  ) AS agentpress_tools,
  t.tags,
  t.mascot_emoji AS avatar,
  'sonnet'::text AS model_tier,
  '[]'::jsonb AS configured_mcps,
  TRUE  AS is_public,
  FALSE AS is_default,
  NOW() AS marketplace_published_at
FROM agent_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM agents a
  WHERE a.name = t.name AND a.user_id IS NULL
);
