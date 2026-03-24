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

-- =========================================================================
-- Indexes
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_device_grants_device_code ON device_grants(device_code);
CREATE INDEX IF NOT EXISTS idx_device_grants_user_code ON device_grants(user_code);
