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
