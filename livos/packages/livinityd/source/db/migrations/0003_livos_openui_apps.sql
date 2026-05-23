-- Phase 203-04 — `livos_openui_apps` + `livos_openui_app_versions` registry tables.
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP TRIGGER IF EXISTS.
-- Safe to re-run.
--
-- Decisions honoured:
--   D-203-09  — primary table schema (slug PK, name/content/version/user_id/timestamps)
--   D-203-09 scope clarification — versions sibling table holds prior contents
--                                  capped at MAX_VERSIONS=25 per slug (preserves
--                                  upstream plugin AppStore.update semantics on
--                                  PostgreSQL instead of {stateDir}/plugins/openclaw-os/apps/<uuid>.json)
--
-- Threat mitigations:
--   T-203-03 — OpenUI markup XSS validation lives at the tRPC boundary
--              (createAppSchema + openui-validator); DB stores already-validated
--              `content` strings. DB layer does not re-validate.
--   INV-203-02 — additive only; `livos_agents` table schema UNCHANGED.
--   INV-202-02 — Phase 202 tables not altered.

CREATE TABLE IF NOT EXISTS livos_openui_apps (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  content      TEXT NOT NULL,
  version      INT  NOT NULL DEFAULT 1,
  user_id      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS livos_openui_apps_user_idx
  ON livos_openui_apps(user_id);

CREATE INDEX IF NOT EXISTS livos_openui_apps_updated_idx
  ON livos_openui_apps(updated_at DESC);

-- Sibling: append-only version history per slug, capped at MAX_VERSIONS=25
-- by AppRepository.update() (DB has no row-count trigger — repo enforces the
-- cap inside the transaction that writes both rows). Deleting the parent row
-- cascades the history (defensive — also enforced by repo.delete()).
CREATE TABLE IF NOT EXISTS livos_openui_app_versions (
  slug         TEXT NOT NULL REFERENCES livos_openui_apps(slug) ON DELETE CASCADE,
  version      INT  NOT NULL,
  content      TEXT NOT NULL,
  snapshot_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, version)
);

CREATE INDEX IF NOT EXISTS livos_openui_app_versions_slug_idx
  ON livos_openui_app_versions(slug, version DESC);
