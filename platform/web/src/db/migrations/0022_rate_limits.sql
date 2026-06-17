-- Phase 282 (v46.0 Endpoint Hardening): Postgres-backed rate limiting.
-- Redis is not reliably reachable from Vercel serverless (no REDIS_URL set;
-- ioredis defaults to localhost), but pg.Pool/Postgres is used everywhere and
-- is the platform's hard dependency — so the limiter rides on Postgres with an
-- atomic fixed-window counter (one row per "scope:identifier").

CREATE TABLE IF NOT EXISTS rate_limits (
  key       text PRIMARY KEY,
  count     integer NOT NULL DEFAULT 0,
  reset_at  timestamptz NOT NULL DEFAULT now()
);

-- Lets a cleanup job prune expired windows efficiently (Phase 284 COST-03).
CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx ON rate_limits (reset_at);

-- Match the rest of the schema's posture: RLS on, no policy. Only the server's
-- pg.Pool/service role touches this table (it bypasses RLS); no public Supabase
-- client can read or write it.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
