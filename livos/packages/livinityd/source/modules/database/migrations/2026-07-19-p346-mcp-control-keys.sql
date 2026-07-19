-- Phase 346-01 (MCP-01, D-346-4) — mcp_control_keys: scoped liv_mcp_* keys for the
-- Native MCP control-plane transport. DELIBERATELY a SEPARATE table from api_keys
-- (broker liv_sk_*) so a liv_mcp_* value can never be resolved by the broker bearer
-- path. Only SHA-256(plaintext) persisted; a leaked DB never reveals a usable key.
-- created_by = admin who minted it (attribution), nullable for legacy single-user.
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
