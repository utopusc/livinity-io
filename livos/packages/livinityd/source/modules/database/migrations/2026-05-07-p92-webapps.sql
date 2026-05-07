-- Phase 92 V33-WEBAPP-01 — webapps table (v33 milestone Wave 1 leaf).
--
-- Per-user WebApp entries (URL + extracted metadata snapshot). Powers the
-- v33 desktop "WebApp" concept: paste a URL, LivOS auto-extracts a title
-- and favicon to render an icon. P92 ships only the metadata extractor +
-- this table schema; CRUD procedures (create / list / delete / update)
-- ship in P94 alongside the desktop UI dialog.
--
-- Design notes (mirroring the 2026-05-05-v32-agents.sql precedent):
--
-- 1. Primary key column named `id` (not `webapp_id`) — repo-wide convention
--    (every other table in schema.sql uses `id UUID PRIMARY KEY`).
--
-- 2. user_id is NOT NULL with ON DELETE CASCADE. WebApps are strictly
--    per-user (no system seeds, no public surface). Deleting a user wipes
--    every WebApp they pinned to their desktop.
--
-- 3. title + favicon_url are nullable: extraction may fail (Cloudflare 403,
--    network timeout) and we still want to persist the user's pinned URL
--    so the desktop can render a hostname-based fallback. P94 CRUD will
--    re-attempt extraction on next dialog open.
--
-- 4. position INTEGER NOT NULL DEFAULT 0 — ordering within a user's
--    desktop. P94 will re-shuffle on drag-drop. Index on (user_id, position)
--    makes the "render a user's desktop in order" query a sub-ms
--    sequential index scan.
--
-- This migration is applied via two paths:
--   - At boot: schema.sql appends the same DDL with IF NOT EXISTS (idempotent).
--   - For documentation/manual deploy review: this file as a discrete artifact.
-- Both must stay in sync. Future migrations follow the same dual-write rule
-- until livinityd grows a real migration runner (out of scope for v33).

CREATE TABLE IF NOT EXISTS webapps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT,
  favicon_url TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webapps_user_position_idx
  ON webapps(user_id, position);
