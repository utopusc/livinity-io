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
-- Devices (registered remote agents, Phase 47)
-- =========================================================================
CREATE TABLE IF NOT EXISTS devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  device_id   UUID NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  platform    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ,
  revoked     BOOLEAN NOT NULL DEFAULT false
);

-- =========================================================================
-- Device Grants (OAuth device flow pending approvals, Phase 47)
-- =========================================================================
CREATE TABLE IF NOT EXISTS device_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  device_code TEXT NOT NULL UNIQUE,
  user_code   TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending',
  device_info JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_device_grants_device_code ON device_grants(device_code);
CREATE INDEX IF NOT EXISTS idx_device_grants_user_code ON device_grants(user_code);

-- =========================================================================
-- Custom Domains (Phase 08 - custom domain routing)
-- =========================================================================
CREATE TABLE IF NOT EXISTS custom_domains (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain            TEXT NOT NULL UNIQUE,
  verification_token TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending_dns',
  dns_a_verified    BOOLEAN NOT NULL DEFAULT false,
  dns_txt_verified  BOOLEAN NOT NULL DEFAULT false,
  error_message     TEXT,
  last_dns_check    TIMESTAMPTZ,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_user_id ON custom_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status);

-- =========================================================================
-- Phase 9 test data (run manually):
-- INSERT INTO users (id, username, email)
--   VALUES ('00000000-0000-0000-0000-000000000001', 'testuser', 'test@livinity.io')
--   ON CONFLICT DO NOTHING;
-- =========================================================================
