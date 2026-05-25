-- Phase 208-07 R7 — per-app icon customization.
-- Adds icon_kind + icon_config columns to livos_openui_apps so each
-- OpenUI app can carry its own dock/window-chrome icon configuration.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS — safe to re-run on already-migrated
-- databases. Both columns are NOT NULL with safe defaults so existing rows
-- (pre-208-07) populate as `icon_kind = 'icon-pack'`, `icon_config = '{}'`
-- and the AppIcon renderer falls back to a default Folder lucide tile.
--
-- Decisions honoured:
--   D-208-07-01 — three icon kinds: 'icon-pack' (default), 'url', 'ai-generated'.
--                  DB stays permissive (TEXT not enum) so a future kind doesn't
--                  require another migration; the zod schema at the tRPC
--                  boundary is the enforcement point.
--   D-208-07-02 — icon_config is JSONB (not TEXT) so dock-renderer queries can
--                  index into shape if we ever need a server-side projection.
--
-- Threat mitigations:
--   T-208-07-01 — `iconConfig.url` may be operator-supplied; the AppIcon
--                  renderer guards with isSafeUrl() (http/https/data only).
--                  No DB-layer URL validation; the renderer is the trust gate.
--   INV-208-07-01 — additive only; existing columns + indexes UNCHANGED.

ALTER TABLE livos_openui_apps
  ADD COLUMN IF NOT EXISTS icon_kind   TEXT  NOT NULL DEFAULT 'icon-pack',
  ADD COLUMN IF NOT EXISTS icon_config JSONB NOT NULL DEFAULT '{}'::jsonb;
