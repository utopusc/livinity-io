-- Phase 96 V33-WEBAPP-96-01 — webapp_skills table.
--
-- Per-(user, WebApp) named skills produced by Teach mode. Each row is a
-- recorded action log (clicks / keys / scrolls / heartbeats) plus a name
-- the user chose at Save time. The `action_log` JSONB blob follows the
-- canonical discriminated-union schema documented in 96-CONTEXT (version
-- 1, top-level { version, webappId, startedAt, endedAt, events[] }).
--
-- Design notes (mirroring P92 / P95 dual-write precedent):
--
-- 1. user_id and webapp_id BOTH cascade on parent delete. Deleting a user
--    or untracking a WebApp drops every skill the user recorded against
--    it (the on-disk JPEG session directory is cleaned up by the
--    skills-storage discardSession path; for cascade-via-DB the
--    application layer does NOT see a delete event and the directory may
--    leak — this is acceptable and noted in 96-SUMMARY for v34 follow-up).
--
-- 2. skill_name is plain TEXT; validation (1-80 chars, slug-safe) lives
--    in the tRPC layer (zod). DB only enforces NOT NULL + uniqueness
--    within (user_id, webapp_id) so the same name can be reused across
--    different WebApps.
--
-- 3. action_log JSONB NOT NULL. Empty recordings are not persisted
--    (rejected at the router); the column is unconditionally populated.
--
-- 4. Two indexes:
--    - UNIQUE (user_id, webapp_id, skill_name) — enforces "no duplicate
--      skill names within one (user, webapp)" at the DB level so the
--      router can rely on a unique-violation to surface the conflict
--      to the UI.
--    - (user_id, webapp_id) — supports the sidebar list query
--      (skills.list({webappId}) under the authenticated user). The
--      unique index above can serve this lookup but a dedicated
--      non-unique covering index keeps the sidebar query plan stable
--      regardless of skill_name.
--
-- 5. Mirrored into schema.sql so initDatabase() is idempotently
--    self-bootstrapping (same dual-write rule as P92 webapps and P95
--    webapp_agent_sessions).

CREATE TABLE IF NOT EXISTS webapp_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  webapp_id   UUID NOT NULL REFERENCES webapps(id) ON DELETE CASCADE,
  skill_name  TEXT NOT NULL,
  action_log  JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS webapp_skills_user_webapp_name_uniq
  ON webapp_skills(user_id, webapp_id, skill_name);

CREATE INDEX IF NOT EXISTS webapp_skills_user_webapp_idx
  ON webapp_skills(user_id, webapp_id);
