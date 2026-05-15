-- Phase 131-02 V36-PIN-02 — pinned_windows table.
--
-- One row per (user_id, window_id) pair. Survives page refresh
-- (tier-(a) of D-131-E). The payload_json column is reserved for the
-- per-app freeze state in Plan 131-03 (tier-(b)) — stays NULL in
-- 131-02. position_in_shelf orders the chips left→right (Plan 131-05).
--
-- This mirrors the table in schema.sql so a future migration runner
-- can replay it deterministically. Today, schema.sql's
-- CREATE TABLE IF NOT EXISTS is the authoritative apply path
-- (initDatabase() runs it at boot).
--
-- Per D-131-A: Postgres NOT Redis. Joins on users.id for RBAC +
-- cascade-delete come for free.

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
