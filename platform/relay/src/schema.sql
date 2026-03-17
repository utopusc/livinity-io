-- Livinity Platform Database Schema
--
-- Applied idempotently on relay startup. Phase 11 will add registration fields.
-- Target: PostgreSQL 15+ on Server5 (45.137.194.102)

-- =========================================================================
-- Users
-- =========================================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(32) NOT NULL UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- API Keys (one active key per user for tunnel authentication)
-- =========================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash    VARCHAR(255) NOT NULL,
  prefix      VARCHAR(14) NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- =========================================================================
-- Bandwidth Usage (per-user, per-month metering)
-- =========================================================================
CREATE TABLE IF NOT EXISTS bandwidth_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month VARCHAR(7) NOT NULL,  -- e.g., '2026-03'
  bytes_in    BIGINT NOT NULL DEFAULT 0,
  bytes_out   BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_month)
);

-- =========================================================================
-- Tunnel Connections (one active tunnel per user)
-- =========================================================================
CREATE TABLE IF NOT EXISTS tunnel_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      VARCHAR(64) NOT NULL UNIQUE,
  status          VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  connected_at    TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  client_version  VARCHAR(32),
  client_ip       INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- =========================================================================
-- Auth tokens (Phase 11)
-- =========================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- =========================================================================
-- Sessions (cookie-based auth, Phase 11)
-- =========================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(255) UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  ip_address  VARCHAR(45),
  user_agent  TEXT
);

-- =========================================================================
-- Indexes
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON api_keys(prefix);

CREATE INDEX IF NOT EXISTS idx_bandwidth_user_month
  ON bandwidth_usage(user_id, period_month);

CREATE INDEX IF NOT EXISTS idx_sessions_token
  ON sessions(token);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions(user_id);

-- =========================================================================
-- Phase 9 test data (run manually):
-- INSERT INTO users (id, username, email)
--   VALUES ('00000000-0000-0000-0000-000000000001', 'testuser', 'test@livinity.io')
--   ON CONFLICT DO NOTHING;
-- =========================================================================
