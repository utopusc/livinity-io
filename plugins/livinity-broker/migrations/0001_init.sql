-- Livinity Broker plugin — initial schema.
-- Lives in a per-plugin schema so the plugin's tables can't collide
-- with livinityd core or other plugins.

CREATE SCHEMA IF NOT EXISTS plugin_livinity_broker;

CREATE TABLE IF NOT EXISTS plugin_livinity_broker.api_keys (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  name        text NOT NULL,
  prefix      varchar(16) NOT NULL,                 -- first 10 chars for fast lookup
  hash        text NOT NULL,                        -- SHA-256(salt:plaintext)
  salt        text NOT NULL,                        -- random per-key
  revoked     boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON plugin_livinity_broker.api_keys (user_id);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON plugin_livinity_broker.api_keys (prefix);

CREATE TABLE IF NOT EXISTS plugin_livinity_broker.usage (
  id          uuid PRIMARY KEY,
  api_key_id  uuid NOT NULL REFERENCES plugin_livinity_broker.api_keys(id) ON DELETE CASCADE,
  model       text NOT NULL,
  in_tokens   bigint NOT NULL DEFAULT 0,
  out_tokens  bigint NOT NULL DEFAULT 0,
  at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_key_at_idx ON plugin_livinity_broker.usage (api_key_id, at DESC);
