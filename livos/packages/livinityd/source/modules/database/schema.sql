-- LivOS Multi-User Schema
-- This schema is applied idempotently (IF NOT EXISTS) so it's safe to run on every startup.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  hashed_password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'guest')),
  avatar_color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_name TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_app_access (
  app_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  access_type TEXT NOT NULL DEFAULT 'full' CHECK (access_type IN ('full', 'readonly')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_app_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  container_name TEXT NOT NULL UNIQUE,
  port INTEGER NOT NULL UNIQUE,
  volume_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, app_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES users(id)
);

-- =========================================================================
-- Custom Domains (synced from platform via tunnel, v19.0)
-- =========================================================================
CREATE TABLE IF NOT EXISTS custom_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      TEXT NOT NULL UNIQUE,
  app_mapping JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'active',
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);

-- =========================================================================
-- Channel Identity Map (unified cross-channel userId, v25.0 Phase 10)
-- =========================================================================
CREATE TABLE IF NOT EXISTS channel_identity_map (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  channel     TEXT NOT NULL,
  channel_user_id TEXT NOT NULL,
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel, channel_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cim_user ON channel_identity_map(user_id);
CREATE INDEX IF NOT EXISTS idx_cim_channel_user ON channel_identity_map(channel, channel_user_id);

-- =========================================================================
-- Device Audit Log (Phase 15 AUDIT-01 / AUDIT-02)
-- Immutable append-only log of every device tool invocation (success + auth
-- failure). UPDATE/DELETE are blocked at the DB level by a trigger.
-- =========================================================================
CREATE TABLE IF NOT EXISTS device_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  device_id     TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  params_digest TEXT NOT NULL,  -- SHA-256 hex of JSON.stringify(params); 64 chars
  success       BOOLEAN NOT NULL,
  error         TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_audit_log_user_id   ON device_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_device_audit_log_device_id ON device_audit_log(device_id);
CREATE INDEX IF NOT EXISTS idx_device_audit_log_timestamp ON device_audit_log(timestamp DESC);

-- Append-only enforcement (AUDIT-02). CREATE OR REPLACE is idempotent across startups.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'device_audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

-- CREATE TRIGGER has no IF NOT EXISTS on older PG versions; wrap in DO-block to skip
-- if already present. This keeps schema.sql idempotent on repeated startups.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'device_audit_log_no_modify'
  ) THEN
    CREATE TRIGGER device_audit_log_no_modify
      BEFORE UPDATE OR DELETE ON device_audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
  END IF;
END$$;

-- =========================================================================
-- Scheduled Jobs (Phase 20 SCH-01)
-- node-cron-driven persistent job definitions. Loaded on boot by the
-- scheduler module. Idempotent — defaults seeded ON CONFLICT (name) DO NOTHING.
-- =========================================================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  schedule        TEXT NOT NULL,                  -- cron expression, e.g. "0 3 * * 0"
  type            TEXT NOT NULL,                  -- 'image-prune' | 'container-update-check' | 'git-stack-sync' | 'volume-backup'
  config_json     JSONB NOT NULL DEFAULT '{}',    -- type-specific config (destination for backups, etc.)
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_run        TIMESTAMPTZ,
  last_run_status TEXT,                           -- 'success' | 'failure' | 'skipped' | 'running'
  last_run_error  TEXT,
  last_run_output JSONB,                          -- handler-specific result, e.g. {spaceReclaimed: ..., deletedCount: ...}
  next_run        TIMESTAMPTZ,                    -- best-effort, computed on schedule load
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_type    ON scheduled_jobs(type);

-- =========================================================================
-- Job Runs (Phase 329 APPS-04)
-- Per-run history for user-defined custom-command scheduled jobs: one row per
-- execution with the truncated (LAST 16 KB) output/error. Written by the
-- scheduler's customCommandHandler (recordJobRun) and retention-pruned in-tick
-- (pruneJobRuns: keep last 20 runs/job_name + 30-day cap, D-14) so history can
-- never bloat the shared Postgres. Additive / expand-only per the operator-locked
-- schema invariant (migrations/index.ts:16-26).
-- =========================================================================
CREATE TABLE IF NOT EXISTS job_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID,                          -- scheduled_jobs.id (soft ref — a deleted job keeps its history until pruned)
  job_name     TEXT NOT NULL,                 -- denormalized name (survives job rename/delete; prune key)
  started_at   TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL,                 -- 'success' | 'failure' | 'skipped' | 'running'
  output       TEXT,                          -- truncated to LAST 16 KB
  error        TEXT,                          -- truncated to LAST 16 KB
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON job_runs (job_name, started_at DESC);

-- =========================================================================
-- Git Credentials (Phase 21 GIT-01)
-- AES-256-GCM-encrypted at rest using SHA-256 of JWT secret as key.
-- encrypted_data shape depends on type:
--   type='https' -> encrypted JSON {"username":"...","password":"..."} (PAT goes in password)
--   type='ssh'   -> encrypted SSH private key (single-line PEM)
-- =========================================================================
CREATE TABLE IF NOT EXISTS git_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('ssh', 'https')),
  encrypted_data TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_git_credentials_user ON git_credentials(user_id);

-- =========================================================================
-- Registry Credentials (Phase 29 DOC-16)
-- AES-256-GCM-encrypted-at-rest credentials for Docker Hub + private
-- registries. Mirrors git_credentials shape — same JWT-derived key, same
-- {iv12 || tag16 || ciphertext} blob. Payload (decrypted JSON):
--   {"password": "..."}    (username + registry_url are non-secret columns)
-- =========================================================================
CREATE TABLE IF NOT EXISTS registry_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  registry_url   TEXT NOT NULL,
  username       TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_registry_credentials_user ON registry_credentials(user_id);

-- =========================================================================
-- Stacks (Phase 21 GIT-01)
-- ONLY git-backed stacks live here. YAML-only stacks remain filesystem-only at
-- /opt/livos/data/stacks/<name>/docker-compose.yml — no PG row required for them.
-- This keeps the existing YAML deploy path 100% backwards compatible.
-- =========================================================================
CREATE TABLE IF NOT EXISTS stacks (
  name              TEXT PRIMARY KEY,
  git_url           TEXT NOT NULL,
  git_branch        TEXT NOT NULL DEFAULT 'main',
  git_credential_id UUID REFERENCES git_credentials(id) ON DELETE SET NULL,
  compose_path      TEXT NOT NULL DEFAULT 'docker-compose.yml',
  webhook_secret    TEXT NOT NULL,                           -- 64-char hex (32 random bytes)
  last_synced_sha   TEXT,                                    -- HEAD sha after last successful sync
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stacks_git_url ON stacks(git_url);

-- =========================================================================
-- Environments (Phase 22 MH-01) — multi-host Docker management
-- One row per Docker host: 'socket' (local Unix socket), 'tcp-tls' (remote
-- dockerd over TLS), or 'agent' (outbound-agent — see docker_agents in 22-03).
-- A 'local' row is auto-seeded on every boot so single-host installs are
-- byte-for-byte backwards compatible (route input envId=null/'local' resolves here).
--
-- NOTE: agent_id deliberately has NO foreign-key constraint. The docker_agents
-- table is created in Plan 22-03 — adding an FK now would force a circular
-- dependency. Plan 22-03 may add an ALTER TABLE … ADD CONSTRAINT later.
-- =========================================================================
CREATE TABLE IF NOT EXISTS environments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL CHECK (type IN ('socket', 'tcp-tls', 'agent')),
  socket_path  TEXT,                                       -- type='socket'
  tcp_host     TEXT,                                       -- type='tcp-tls'
  tcp_port     INTEGER,                                    -- type='tcp-tls'
  tls_ca_pem   TEXT,                                       -- type='tcp-tls'
  tls_cert_pem TEXT,                                       -- type='tcp-tls'
  tls_key_pem  TEXT,                                       -- type='tcp-tls'
  agent_id     UUID,                                       -- type='agent' (FK declared in 22-03)
  agent_status TEXT NOT NULL DEFAULT 'offline' CHECK (agent_status IN ('online', 'offline')),
  last_seen    TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_environments_type ON environments(type);

-- Phase 25 DOC-06 — environment tags for filter chips. Idempotent ADD COLUMN
-- IF NOT EXISTS wrapped in DO-block (matches the audit_log_no_modify trigger
-- pattern above). DEFAULT '{}' ensures NOT NULL is satisfied for existing rows.
DO $$
BEGIN
  ALTER TABLE environments ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
END$$;

-- =========================================================================
-- Docker Agents (Phase 22 MH-04, MH-05) — outbound-WS Docker proxies.
-- One row per agent token. token_hash is SHA-256(cleartext_token) so the
-- cleartext is unrecoverable (verifies via constant-time hash comparison).
-- revoked_at NOT NULL means the token is dead; subscribed livinityd instances
-- disconnect the live WS within 5s on revocation (Redis pub/sub).
--
-- env_id has ON DELETE CASCADE — deleting an environment scrubs every
-- agent token that ever pointed at it (no orphans).
-- =========================================================================
CREATE TABLE IF NOT EXISTS docker_agents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id       UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_docker_agents_env_id     ON docker_agents(env_id);
CREATE INDEX IF NOT EXISTS idx_docker_agents_token_hash ON docker_agents(token_hash);

-- =========================================================================
-- AI Alerts (Phase 23 AID-02) — proactive Kimi-generated resource alerts.
-- One row per stress event detected by the ai-resource-watch scheduler job.
-- Dedupe is enforced at insert-time by findRecentAlertByKind (60-min window).
-- environment_id is nullable — multi-host watching defers to v28; current
-- handler runs on the local socket only (per Plan 22-01 D-06 constraint).
-- =========================================================================
CREATE TABLE IF NOT EXISTS ai_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_name  TEXT NOT NULL,
  environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  kind            TEXT NOT NULL CHECK (kind IN ('memory-pressure','cpu-throttle','restart-loop','disk-pressure','other')),
  message         TEXT NOT NULL,
  payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_alerts_undismissed
  ON ai_alerts(dismissed_at, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_alerts_dedupe
  ON ai_alerts(container_name, kind, created_at DESC)
  WHERE dismissed_at IS NULL;

-- =========================================================================
-- SMART Alerts (Phase 313 SMART-02/03) — persisted disk-health alert history.
-- One row per NEW failing/unavailable condition. Dedupe at insert-time via
-- findRecentSmartAlert (6h window) so a daily scan does not re-insert. The
-- external-channel dispatch itself is the Phase-310 notifications bridge; this
-- table is the dismissable audit list only (NOT a second dispatch path).
-- =========================================================================
CREATE TABLE IF NOT EXISTS smart_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  kind          TEXT NOT NULL CHECK (kind IN ('sata-attribute','nvme-critical','unavailable','permission-denied','self-test-failed','other')),
  message       TEXT NOT NULL,
  payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_smart_alerts_undismissed ON smart_alerts(dismissed_at, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_alerts_dedupe ON smart_alerts(device_id, kind, created_at DESC) WHERE dismissed_at IS NULL;

-- =========================================================================
-- Broker Usage (Phase 44 FR-DASH-01)
-- One row per broker request that completes (sync or SSE). Captured by the
-- usage-tracking capture middleware which wraps /u/:userId/v1/* OUTSIDE the
-- livinity-broker module (broker is feature-frozen since Phase 42).
-- request_id is the Anthropic msg_* / OpenAI chatcmpl-* id; null for 429s.
-- endpoint = 'messages' | 'chat-completions' | '429-throttled'.
-- =========================================================================
CREATE TABLE IF NOT EXISTS broker_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id            TEXT,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  request_id        TEXT,
  endpoint          TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_usage_user_created ON broker_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_usage_app          ON broker_usage(app_id, created_at DESC);

-- =========================================================================
-- API Keys (Phase 59 FR-BROKER-B1-01..05) — Per-user `liv_sk_*` Bearer tokens.
-- Cleartext returned ONCE on create. SHA-256 hash stored. Revocation is soft
-- (revoked_at NOT NULL means revoked). Mirrors docker_agents shape (Phase 22).
-- gen_random_uuid() works WITHOUT a pgcrypto extension declaration (matches
-- existing convention: 14 other tables use gen_random_uuid() with no extension
-- line). RESEARCH.md Open Question 1 verdict: omit the extension line.
-- =========================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      CHAR(64) NOT NULL UNIQUE,
  key_prefix    VARCHAR(16) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active  ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- =========================================================================
-- Phase 62 FR-BROKER-E1-01 — broker_usage.api_key_id (per CONTEXT.md decision).
-- Idempotent ADD COLUMN IF NOT EXISTS in DO-block (matches Phase 25 pattern
-- at line 261-264). Backward-compat: existing rows + legacy URL-path traffic
-- get NULL. ON DELETE SET NULL preserves historic attribution if a key row
-- is hard-deleted (Phase 59 soft-deletes via revoked_at, but defense-in-depth).
-- =========================================================================
DO $$
BEGIN
  ALTER TABLE broker_usage
    ADD COLUMN IF NOT EXISTS api_key_id UUID
    REFERENCES api_keys(id) ON DELETE SET NULL;
END$$;

CREATE INDEX IF NOT EXISTS idx_broker_usage_api_key_id
  ON broker_usage(api_key_id)
  WHERE api_key_id IS NOT NULL;

-- =========================================================================
-- Phase 257-04 WS-A (LIVOS-005) — sessions.jti for JWT revocation.
-- The sessions table (lines 16-26) has long existed (token_hash/revoked/
-- expires_at) but was never written/read. WS-A wires it: every DB-backed user
-- JWT carries a `jti` (jwt.signUserToken), login records a session row keyed off
-- that jti, and a password change / deactivation / deletion sets revoked=TRUE,
-- which is-authenticated checks via isSessionActive(jti). Idempotent ADD COLUMN
-- IF NOT EXISTS in a DO-block (matches the Phase 25 / Phase 62 pattern above);
-- partial index on the live (non-revoked) jti keeps the per-request lookup hot.
-- =========================================================================
DO $$
BEGIN
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS jti TEXT;
END$$;

CREATE INDEX IF NOT EXISTS idx_sessions_jti
  ON sessions(jti)
  WHERE revoked = FALSE;

-- =========================================================================
-- Conversations + Messages (Phase 75 MEM-04 — Postgres FTS)
-- Mirror of the in-memory/Redis conversation cache in livos/packages/livinityd/
-- source/modules/ai/index.ts. Postgres is search-index-only; Redis remains the
-- runtime source-of-truth for chat read path. Write-through populates these
-- tables (see Phase 75-02). content_tsv is a STORED GENERATED column (PG12+);
-- GIN index makes user-scoped FTS sub-100ms even at 100k messages.
-- =========================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content         TEXT NOT NULL,
  reasoning       TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_tsv     TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created
  ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_content_tsv
  ON messages USING GIN (content_tsv);

-- =========================================================================
-- Phase 75-03: Pinned Messages (MEM-07)
-- User-pinned chat messages auto-injected into the agent system prompt.
-- content is snapshotted at pin time so deleted/edited messages still render.
-- message_id may be null for free-form pins not tied to a specific message.
-- conversation_id is also nullable — pins survive conversation deletion when
-- the user pins free-form notes from outside any conversation context.
-- UNIQUE(user_id, message_id) makes re-pinning the same message idempotent
-- (the repo INSERT uses ON CONFLICT (user_id, message_id) DO NOTHING and
-- falls back to a SELECT for the existing pin id).
-- =========================================================================
CREATE TABLE IF NOT EXISTS pinned_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES messages(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  label           TEXT,
  pinned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_user_pinned
  ON pinned_messages(user_id, pinned_at DESC);

-- =========================================================================
-- Phase 76: Agent Templates (MARKET-01) — global catalog of agent presets.
-- Per-LivOS-install (NOT synced from Server5). 8 seeds run via boot
-- seed runner (76-02). Cloning a template POSTs to nexus /api/subagents
-- with system_prompt + tools_enabled (76-05). slug PK matches Server5
-- platform.apps convention. tools_enabled jsonb (NOT text[]) for future
-- per-tool config. GIN on tags for tag-filter queries.
-- =========================================================================
CREATE TABLE IF NOT EXISTS agent_templates (
  slug          VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(128) NOT NULL,
  description   TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  tools_enabled JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  mascot_emoji  VARCHAR(16) NOT NULL DEFAULT '🤖',
  clone_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_templates_tags
  ON agent_templates USING GIN (tags);

-- Phase 71: Computer Use Tasks
-- (CU-FOUND-06) Per-user Bytebot container lifecycle.
-- The partial unique index enforces "max 1 active container per user" at the
-- DB layer — not just app-layer logic. Defense in depth.
CREATE TABLE IF NOT EXISTS computer_use_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('active', 'idle', 'stopped')),
  container_id  TEXT,
  port          INTEGER,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS computer_use_tasks_user_active_idx
  ON computer_use_tasks(user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS computer_use_tasks_active_last_activity_idx
  ON computer_use_tasks(last_activity) WHERE status = 'active';

-- =========================================================================
-- Phase 85 V32-AGENT-01..04 — agents table (v32 milestone Wave 1).
--
-- Mirrored from migrations/2026-05-05-v32-agents.sql so that boot's
-- idempotent schema apply (initDatabase) materializes the table on every
-- LivOS install without a separate runner. See that file for the full
-- design-decision commentary (id-vs-agent_id, nullable user_id, agent_templates
-- backfill mapping). Keep both files in sync for the duration of v32.
--
-- Companion seed: seeds/agents.ts (TS runner; SQL mirror at
-- migrations/2026-05-05-v32-agents-seed.sql).
-- =========================================================================
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

-- V32-AGENT-04 backfill from agent_templates. Idempotent on (name, user_id IS NULL).
-- See migrations/2026-05-05-v32-agents.sql for column-mapping rationale.
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

-- =========================================================================
-- Phase 92 V33-WEBAPP-01 — webapps table (v33 milestone Wave 1 leaf).
--
-- Mirrored from migrations/2026-05-07-p92-webapps.sql so that boot's
-- idempotent schema apply (initDatabase) materializes the table on every
-- LivOS install without a separate runner. See that file for the full
-- design-decision commentary (NOT NULL user_id, nullable title/favicon_url
-- for extraction-failure persistence, position-only index).
--
-- P92 ships only the read-side metadata extractor + this table schema;
-- the CRUD repo functions + tRPC procedures (`webapps.create / list /
-- delete / update`) land with the P94 desktop UI dialog. Until then the
-- table is intentionally write-empty.
-- =========================================================================
CREATE TABLE IF NOT EXISTS webapps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT,
  favicon_url TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webapps_user_position_idx
  ON webapps(user_id, position);

-- =========================================================================
-- Phase 95 V33-WEBAPP-95-05 — webapp_agent_sessions table.
--
-- Mirrored from migrations/2026-05-07-p95-webapp-agent-sessions.sql so
-- boot's idempotent schema apply materializes the table without a runner.
-- See that file for the full design-decision commentary (cascade rules,
-- nullable run_id, last_seen_idx -1 sentinel).
--
-- One row per (user_id, webapp_id) keys the per-WebApp LivAgentRunner
-- conversation; the WebApp window UI fetches it on mount and upserts the
-- runId once the first message produces one. last_seen_idx feeds the SSE
-- reconnect ?after=<idx> path so reopening a WebApp window resumes the
-- same conversation slice.
-- =========================================================================
CREATE TABLE IF NOT EXISTS webapp_agent_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  webapp_id       UUID NOT NULL REFERENCES webapps(id) ON DELETE CASCADE,
  run_id          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_idx   INTEGER NOT NULL DEFAULT -1
);

CREATE UNIQUE INDEX IF NOT EXISTS webapp_agent_sessions_user_webapp_uniq
  ON webapp_agent_sessions(user_id, webapp_id);

-- =========================================================================
-- Phase 96 V33-WEBAPP-96-01 — webapp_skills table.
--
-- Mirrored from migrations/2026-05-08-p96-webapp-skills.sql so boot's
-- idempotent schema apply materializes the table without a runner. See
-- that file for the full design-decision commentary (cascade rules,
-- skill_name uniqueness scope, dual-index rationale).
--
-- Each row is a recorded Teach-mode action log (clicks / keys / scrolls
-- / heartbeats) plus the user-chosen name. action_log JSONB carries the
-- canonical version-1 schema documented in 96-CONTEXT (top-level {
-- version, webappId, startedAt, endedAt, events[] }, ActionEvent
-- discriminated union by `type`).
--
-- skill_name is unique within (user_id, webapp_id) so the same name can
-- exist across different WebApps without collision but never within one.
-- =========================================================================
CREATE TABLE IF NOT EXISTS webapp_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  webapp_id   UUID NOT NULL REFERENCES webapps(id) ON DELETE CASCADE,
  skill_name  TEXT NOT NULL,
  action_log  JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS webapp_skills_user_webapp_name_uniq
  ON webapp_skills(user_id, webapp_id, skill_name);

CREATE INDEX IF NOT EXISTS webapp_skills_user_webapp_idx
  ON webapp_skills(user_id, webapp_id);

-- =========================================================================
-- Phase 131-02 — pinned_windows registry (D-131-A: Postgres, NOT Redis).
--
-- One row per (user_id, window_id) pair the user has pinned to the TopBar
-- shelf. Survives page refresh (tier-(a) of D-131-E). The actual app
-- session continuity (Chrome handle / hermes run / Files watcher) is
-- Plan 131-03 scope (tier-(b)); payload_json is reserved for the per-app
-- freeze state defined in D-131-C.
--
-- position_in_shelf orders the chips left→right (default 0; Plan 131-05
-- adds the .reorder mutation).
-- =========================================================================
CREATE TABLE IF NOT EXISTS pinned_windows (
  user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_id         TEXT         NOT NULL,
  app_id            TEXT         NOT NULL,
  route             TEXT         NOT NULL,
  title             TEXT         NOT NULL,
  icon              TEXT         NOT NULL,
  position_x        INTEGER      NOT NULL,
  position_y        INTEGER      NOT NULL,
  size_w            INTEGER      NOT NULL,
  size_h            INTEGER      NOT NULL,
  position_in_shelf INTEGER      NOT NULL DEFAULT 0,
  payload_json      JSONB,
  pinned_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, window_id)
);

CREATE INDEX IF NOT EXISTS pinned_windows_user_idx
  ON pinned_windows (user_id, position_in_shelf ASC, pinned_at ASC);

-- =========================================================================
-- Phase 218 T3 — user_app_subdomains table.
--
-- Mini PC schema drift fix: Phase 140-05 added this table to Supabase but
-- never to the on-box Postgres. T2's buildCaddyConfigFromState() reads
-- subdomain (full host) per (user_id, app_slug) to derive Caddyfile shape.
-- See migrations/2026-05-26-p218-user-app-subdomains.sql for full rationale.
-- =========================================================================
CREATE TABLE IF NOT EXISTS user_app_subdomains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id           TEXT,
  app_slug         TEXT NOT NULL,
  subdomain        TEXT NOT NULL,
  cf_dns_record_id TEXT,
  port             INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_app_subdomains_user
  ON user_app_subdomains (user_id);

-- =========================================================================
-- Phase 290 — shortcuts table (unified "Add Shortcut" launcher).
--
-- B1 FIX: there is NO migration runner — database/migrations/*.sql are
-- documentation only (migrations/index.ts). The live schema is THIS file,
-- applied at boot by initDatabase() via the idempotent CREATE TABLE/INDEX
-- IF NOT EXISTS pass. So the shortcuts DDL lives here (NOT in a migration
-- file). The gate is "table exists after boot", not "migration ran".
--
-- 100% ADDITIVE: the existing `webapps` table (line ~590) is UNTOUCHED. The
-- webapps→shortcuts backfill + store-bridge cutover are a DEFERRED later wave
-- (needs live-data box UAT) — no data is migrated here.
--
-- kind: 'web' | 'terminal' | 'local'. H1 — NO 'native' kind: native apps
--   already render as desktop tiles via the server-merged apps.list; a
--   kind:'native' shortcut would double-tile. The Native tab (later wave)
--   creates ONLY a NativeAppConfig, never a shortcut row. (Only 'web' +
--   'terminal' are wired in the dialog this session; 'local' is defined for
--   forward-compat but its UI is deferred.)
-- open_mode: 'iframe' | 'browser-stream' | 'local-port' | 'terminal'. L1 —
--   'new-tab' is a runtime-only fallback of the open-mode engine, never stored.
-- source: 'user' | 'deploy' | 'migrated'. L2 — dropped the unused 'catalog'.
-- title + icon_url are BOTH NOT NULL (#3 — icon/title mandatory; no blank tiles).
-- dedup_key is a sha256 over a kind-specific tuple (M2); UNIQUE(user_id,
--   dedup_key) makes re-adding the same shortcut idempotent.
-- =========================================================================
CREATE TABLE IF NOT EXISTS shortcuts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('web','terminal','local')),
  title      TEXT NOT NULL,
  icon_url   TEXT NOT NULL,
  open_mode  TEXT NOT NULL CHECK (open_mode IN ('iframe','browser-stream','local-port','terminal')),
  payload    JSONB NOT NULL,
  dedup_key  TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','deploy','migrated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS shortcuts_user_position_idx
  ON shortcuts(user_id, position);

-- =========================================================================
-- Phase 290 R2 — user_terminal_templates table.
--
-- Operator-saved Terminal-tab templates (the "Save as template" affordance in
-- the custom-shell builder). Same B1 rationale as the shortcuts table above:
-- there is NO migration runner — this DDL is applied at boot by initDatabase()
-- via the idempotent CREATE TABLE/INDEX IF NOT EXISTS pass.
--
-- 100% ADDITIVE. Mirrors the shortcuts/webapps user-scoped shape. The built-in
-- TERMINAL_TEMPLATES (terminal-templates.ts) stay code-only; these are the
-- USER-authored ones merged into the same dialog grid. UNIQUE(user_id, label)
-- makes "Save as template" idempotent via ON CONFLICT DO UPDATE.
-- =========================================================================
CREATE TABLE IF NOT EXISTS user_terminal_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  command    TEXT NOT NULL,
  hint       TEXT,
  icon_url   TEXT,
  cwd        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, label)
);

CREATE INDEX IF NOT EXISTS user_terminal_templates_user_updated_idx
  ON user_terminal_templates(user_id, updated_at DESC);

-- =========================================================================
-- Phase 320 (MON-01) — persisted host-resource history, 3-tier rollup.
-- Retention (enforced by scheduler resource-metrics-rollup, Plan 02, from day one):
--   raw   pruned  >48h   | 5m rollups pruned >30d | 1h rollups pruned >365d
-- Bounded footprint ~3MB forever. No per-user dimension (one box, one time axis).
-- Wide row per tick (all metrics as columns) — chart-ready with a single SELECT.
CREATE TABLE IF NOT EXISTS resource_samples_raw (
  ts               TIMESTAMPTZ PRIMARY KEY,
  cpu_pct          REAL,             -- systeminformation.currentLoad().currentLoad, 0-100
  mem_used_bytes   BIGINT,
  mem_total_bytes  BIGINT,
  disk_read_bps    BIGINT,           -- getDiskIO().rIOSec (nullable on first sample)
  disk_write_bps   BIGINT,           -- getDiskIO().wIOSec
  net_rx_bps       BIGINT,           -- sum across interfaces, getNetworkStats()
  net_tx_bps       BIGINT
);

CREATE TABLE IF NOT EXISTS resource_rollups_5m (
  bucket_start        TIMESTAMPTZ PRIMARY KEY,
  sample_count        INTEGER NOT NULL DEFAULT 0,
  cpu_pct_avg         REAL, cpu_pct_min REAL, cpu_pct_max REAL,
  mem_used_bytes_avg  BIGINT, mem_used_bytes_max BIGINT,
  disk_read_bps_avg   BIGINT, disk_read_bps_max BIGINT,
  disk_write_bps_avg  BIGINT, disk_write_bps_max BIGINT,
  net_rx_bps_avg      BIGINT, net_rx_bps_max BIGINT,
  net_tx_bps_avg      BIGINT, net_tx_bps_max BIGINT
);

CREATE TABLE IF NOT EXISTS resource_rollups_1h (
  bucket_start        TIMESTAMPTZ PRIMARY KEY,
  sample_count        INTEGER NOT NULL DEFAULT 0,
  cpu_pct_avg         REAL, cpu_pct_min REAL, cpu_pct_max REAL,
  mem_used_bytes_avg  BIGINT, mem_used_bytes_max BIGINT,
  disk_read_bps_avg   BIGINT, disk_read_bps_max BIGINT,
  disk_write_bps_avg  BIGINT, disk_write_bps_max BIGINT,
  net_rx_bps_avg      BIGINT, net_rx_bps_max BIGINT,
  net_tx_bps_avg      BIGINT, net_tx_bps_max BIGINT
);

-- =========================================================================
-- Groups (Phase 322, IDENT-01) — the SINGLE groups source consumed by OIDC
-- claims (322-04), file ACLs (Phase 324/FILES-02), and app sharing
-- (Phase 323/IDENT-04). Additive/expand-only per migrations/index.ts:16-26.
-- =========================================================================
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

-- =========================================================================
-- Phase 328 IDENT-05 — per-user TOTP (genuinely per-DB-user, unlike the
-- legacy single-secret YAML path). Secret + recovery codes are DEK-encrypted
-- at rest (secrets/dek.ts, AES-256-GCM) — NEVER plaintext, NEVER in the audit
-- log. Idempotent ADD COLUMN IF NOT EXISTS in a DO-block (Phase 25/62/257-04).
-- Backward-compat: existing rows get NULL/FALSE.
-- =========================================================================
DO $$
BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes_enc TEXT;
END$$;

-- =========================================================================
-- Phase 325 STOR-02 — app-layer soft per-user storage quota (D-05/D-06).
-- `quota_bytes` is the hard byte ceiling for a user's data subtree; NULL =
-- unlimited / no quota (the default for every existing + new user, so this is
-- backward-compatible). Cached USAGE is NOT a PG column — the `user-quota-scan`
-- scheduler job du-accounts each user's dir and caches the per-user byte map in
-- the FileStore (`storageQuota` key), so no second migration is needed.
-- Idempotent ADD COLUMN IF NOT EXISTS in a DO-block (mirrors the totp block).
-- =========================================================================
DO $$
BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_bytes BIGINT;
END$$;

-- =========================================================================
-- Phase 324 (FILES-01) — public share links (opaque-token, api_keys pattern).
-- The signed opaque token IS the auth for the one deliberate unauthenticated
-- surface (D-01/D-02). Only SHA-256(token) is persisted (token_hash CHAR(64)
-- UNIQUE) — a leaked DB never reveals a usable link; the raw `liv_share_<32>`
-- token is shown to the owner ONCE. password_hash is bcryptjs (NULL = no
-- password); expires_at / max_downloads NULL = never / unlimited. Rows are
-- soft-revoked (revoked_at) and NEVER hard-deleted so the owner's "my shares"
-- audit list can surface every share ever minted (D-05, CVE-2026-45285).
-- Additive/expand-only per migrations/index.ts:16-26 (no destructive ALTER/DROP).
-- =========================================================================
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
-- Hot-path partial index for the token-hash lookup (only live shares).
CREATE INDEX IF NOT EXISTS idx_file_shares_active ON file_shares (token_hash) WHERE revoked_at IS NULL;
-- Owner "my shares" audit list.
CREATE INDEX IF NOT EXISTS idx_file_shares_owner ON file_shares (owner_user_id);

-- =========================================================================
-- Phase 324 (FILES-02) — per-path user/group ACLs (D-07/D-08).
-- Superset of user_app_access (line 43): a grant is keyed on (virtual_path,
-- principal_type, principal_id) and carries a level. principal_type is 'user'
-- or 'group' (the Phase-322 groups table is the group source); principal_id is
-- the users.id or groups.id UUID. level is 'none' | 'read' | 'write' — evaluated
-- as the most-permissive UNION of the user's direct grant + all their group
-- grants at the EXACT path (`none` overrides only when it is the sole rule,
-- D-08). NON-inheriting, explicit-path v1 (NO subtree tree-walk). granted_by is
-- the admin who set it (ON DELETE SET NULL keeps the grant if that admin is
-- deleted). This ADDS cross-user visibility on top of the structural per-user
-- isolation — it can NEVER escape virtualToSystemPath containment. NO POSIX
-- ACLs / setfacl (every file is one OS uid). Additive/expand-only per
-- migrations/index.ts:16-26 (no destructive ALTER/DROP).
-- =========================================================================
CREATE TABLE IF NOT EXISTS file_acls (
  virtual_path   TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user','group')),
  principal_id   UUID NOT NULL,
  level          TEXT NOT NULL CHECK (level IN ('none','read','write')),
  granted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (virtual_path, principal_type, principal_id)
);
-- Hot-path lookup: every grant at a given path (getEffectiveLevel + render-time
-- Samba `valid users`).
CREATE INDEX IF NOT EXISTS idx_file_acls_path ON file_acls (virtual_path);

-- =========================================================================
-- Phase 323 (IDENT-03) — WebAuthn / passkey credentials (D-01/D-04).
-- One row per enrolled authenticator. credential_id is the globally-unique
-- lookup key (the login path resolves the owning user from it — hence the
-- standalone UNIQUE index below). public_key is stored PLAINTEXT/base64 and is
-- NOT secret — the authenticator holds the private key, so there is NO DEK
-- (unlike TOTP's totp_secret_enc). counter is the authenticator signature
-- counter (replay defence, bumped on each auth). transports is the JSONB list
-- of authenticator transports. Persisted from the @simplewebauthn/server v13
-- NESTED registrationInfo.credential.{id, publicKey, counter, transports} shape
-- (NOT the pre-v13 flat fields). ON DELETE CASCADE removes a user's passkeys
-- when the user is deleted. Additive/expand-only per migrations/index.ts:16-26
-- (no destructive ALTER/DROP).
-- =========================================================================
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    TEXT NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    JSONB,
  nickname      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, credential_id)
);
-- Hot-path lookup: the login ceremony resolves the owning user from the raw
-- credential_id returned by the browser assertion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials (credential_id);

-- =========================================================================
-- Phase 323 (IDENT-04) — group/user app access grants (D-06/D-07).
-- Mirrors file_acls (line 970) EXACTLY but keyed on app_id instead of
-- virtual_path. principal_type is 'user' or 'group' (the Phase-322 groups table
-- is the group source); principal_id is the users.id or groups.id UUID.
-- access_type is 'none' | 'readonly' | 'full' — evaluated as the most-permissive
-- UNION of the user's direct grant + all their group grants for the app
-- (getEffectiveAppAccess in apps/app-access.ts). This table carries GROUP grants
-- ONLY (D-07 (b-i)); user_app_access (line 43) stays the sole DIRECT-user source,
-- untouched. granted_by is the admin who set it (ON DELETE SET NULL keeps the
-- grant if that admin is deleted). Additive/expand-only per
-- migrations/index.ts:16-26 (PK can't ALTER — no destructive ALTER/DROP).
-- =========================================================================
CREATE TABLE IF NOT EXISTS app_access (
  app_id         TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user','group')),
  principal_id   UUID NOT NULL,
  access_type    TEXT NOT NULL DEFAULT 'full' CHECK (access_type IN ('none','readonly','full')),
  granted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, principal_type, principal_id)
);
-- Hot-path lookup: every grant for a given app (getEffectiveAppAccess +
-- listAppAccessPrincipals for the share dialog).
CREATE INDEX IF NOT EXISTS idx_app_access_app ON app_access (app_id);

-- =========================================================================
-- Phase 335 (ROLE-01/02) — delegated/scoped admin grants (D-335-1/D-335-4).
-- TWO additive sidecar tables. users.role stays the binary admin/member(/guest)
-- source of truth and its CHECK is NEVER altered (additive-only invariant,
-- migrations/index.ts:16-26). A "scoped admin" is a member holding admin_scopes
-- rows (scope = closed enum, mirrored in database/admin-grants.ts); a per-app
-- operator is a member holding an app_operators row (app_id keyed like
-- app_access). Grants are resolved from PG per request — NEVER embedded in the
-- JWT (no stale-privilege window; contrast server/index.ts payload.role sites).
-- Absence of a row = absence of privilege (fail-closed by construction: every
-- existing inline role==='admin' check correctly denies scope-holders).
-- =========================================================================
CREATE TABLE IF NOT EXISTS admin_scopes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('read-only-admin','share-admin')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scope)
);
CREATE INDEX IF NOT EXISTS idx_admin_scopes_user ON admin_scopes (user_id);

CREATE TABLE IF NOT EXISTS app_operators (
  app_id     TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_app_operators_user ON app_operators (user_id);

-- =========================================================================
-- Phase 346-01 (MCP-01, D-346-4) — mcp_control_keys: scoped `liv_mcp_*` keys
-- for the Native MCP control-plane transport. DELIBERATELY a SEPARATE table
-- from api_keys (broker `liv_sk_*`) so a `liv_mcp_*` value can never be
-- resolved by the broker bearer path (bearer-auth.ts queries api_keys only)
-- nor by the LIV_API_KEY env compare. Only SHA-256(plaintext) is persisted; a
-- leaked DB never reveals a usable key. created_by = admin who minted it
-- (attribution), nullable for legacy single-user. Additive/expand-only per the
-- operator-locked invariant (migrations/index.ts:16-26).
-- =========================================================================
CREATE TABLE IF NOT EXISTS mcp_control_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash      CHAR(64) NOT NULL UNIQUE,
  key_prefix    VARCHAR(16) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mcp_control_keys_active ON mcp_control_keys(key_hash) WHERE revoked_at IS NULL;
