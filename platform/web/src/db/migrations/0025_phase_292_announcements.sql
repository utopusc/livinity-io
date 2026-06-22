-- =========================================================================
-- 0025_phase_292_announcements.sql — admin-authored fleet-wide announcements
--
-- Powers /admin/announcements (requireAdmin authoring + per-pop-up analytics)
-- and /api/me/announcements/* (box poll + seen/feedback write-back). Admins
-- compose a theme-aware LivOS pop-up; every targeted box shows it to each user
-- EXACTLY ONCE, with votes/feedback aggregated back to the admin.
--
-- Storage model (DEC-01): Drizzle tables over the existing Supabase Postgres —
-- "Supabase vs Drizzle" is the SAME database. user_id columns store the CLOUD
-- users.id (the stable cross-instance identity resolved server-side from the
-- API key — DEC-03); they are NOT Drizzle .references() because the users table
-- lives in platform/relay/src/schema.sql (raw SQL), same convention as devices.
--
-- Raw HTML (DEC-04): `raw_html_sanitized` is the DOMPurify-sanitized HTML the
-- fleet renders (inside a sandboxed iframe); `raw_html_source` is the admin's
-- original, kept ONLY for re-editing and NEVER served to a box.
--
-- Applied by the operator OUT-OF-BAND (per the docs/feedback precedent) — every
-- consuming route is 42P01-defensive, so code ships and degrades cleanly until
-- this runs. Do NOT wire drizzle-kit push.
--
-- Idempotent (IF NOT EXISTS throughout) so it is safe to re-run.
-- =========================================================================

CREATE TABLE IF NOT EXISTS announcements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT UNIQUE,                          -- optional human handle
  title              TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'announcement'
                       CHECK (kind IN ('announcement','campaign','promo','feature','feedback')),
  -- content: ordered block JSON for the visual builder (trusted, rendered natively)
  blocks             JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- raw-HTML escape hatch: sanitized at publish (served); source kept for re-edit only
  raw_html_sanitized TEXT,
  raw_html_source    TEXT,                                 -- NEVER served to a box
  -- display settings
  frequency          TEXT NOT NULL DEFAULT 'once_ever'
                       CHECK (frequency IN ('once_ever','once_per_day','n_times')),
  frequency_n        INTEGER,                              -- when frequency='n_times'
  priority           INTEGER NOT NULL DEFAULT 100,         -- lower = higher priority (stacking)
  dismissible        BOOLEAN NOT NULL DEFAULT true,
  start_at           TIMESTAMPTZ,                          -- null = immediately
  end_at             TIMESTAMPTZ,                          -- null = no end
  -- targeting (MVP: all | explicit user_ids | plan_tier — DEC-08)
  target_kind        TEXT NOT NULL DEFAULT 'all'
                       CHECK (target_kind IN ('all','user_ids','plan_tier')),
  target_user_ids    UUID[] NOT NULL DEFAULT '{}',
  target_plan_tier   TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','published','archived')),
  published_at       TIMESTAMPTZ,
  created_by         UUID,                                 -- CLOUD users.id (admin author)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot path: the box poll route selects published, in-window announcements.
CREATE INDEX IF NOT EXISTS announcements_live_idx
  ON announcements (status, start_at, end_at) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS announcement_seen (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,                           -- CLOUD users.id (cross-instance identity, DEC-03)
  seen_count      INTEGER NOT NULL DEFAULT 0,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at    TIMESTAMPTZ,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS announcement_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,                           -- CLOUD users.id
  block_id        TEXT,                                    -- which poll/feedback block (null = announcement-level)
  vote_option     TEXT,                                    -- selected poll option (null for free-text)
  free_text       TEXT,                                    -- free-text feedback (bounded at the write route)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- one ledger row per (announcement, user, block): vote idempotency / no ballot stuffing (DEC-07).
  UNIQUE (announcement_id, user_id, block_id)
);

-- Analytics aggregation: count votes per option per block.
CREATE INDEX IF NOT EXISTS announcement_feedback_agg_idx
  ON announcement_feedback (announcement_id, block_id, vote_option);

-- RLS on (matches every other table). No policies: only the app's pg.Pool /
-- service-role connection (which bypasses RLS) reads/writes — admin writes go
-- through requireAdmin(), box reads/writes resolve identity from the API key.
ALTER TABLE announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_seen    ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_feedback ENABLE ROW LEVEL SECURITY;
