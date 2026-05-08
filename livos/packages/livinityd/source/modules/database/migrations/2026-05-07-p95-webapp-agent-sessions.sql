-- Phase 95 V33-WEBAPP-95-05 — webapp_agent_sessions table.
--
-- Per-WebApp agent run state. Reopening a WebApp window resumes the same
-- LivAgentRunner conversation slice (last_seen_idx feeds the SSE
-- ?after=<idx> reconnect path).
--
-- Design notes:
--
-- 1. Unique on (user_id, webapp_id). One agent session per (user, webapp).
--    Future cross-user sharing of WebApp windows is explicitly out of
--    scope (CONTEXT § 9 — multi-user share is its own future phase).
--
-- 2. user_id and webapp_id BOTH cascade on parent delete. If a user is
--    deleted their WebApp + its agent session row go too. If a webapp is
--    untracked from the desktop (P94 webapp.delete), its session row is
--    discarded (the runId may still exist in Liv core's run store, but
--    has no consumer).
--
-- 3. run_id is nullable until the user sends the first message. The hook
--    upserts after the agent surfaces a runId from sendMessage() (D-95-08:
--    runId == conversationId).
--
-- 4. last_seen_idx -1 means "no chunks consumed yet" — feed `after=-1` to
--    the runner to receive the entire chunk stream. After each chunk
--    processed the hook debounce-upserts to bump it.
--
-- 5. Mirrored into schema.sql so initDatabase() is idempotently
--    self-bootstrapping (same dual-write rule as the P92 webapps table).

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
