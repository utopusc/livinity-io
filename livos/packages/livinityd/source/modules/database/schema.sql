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
