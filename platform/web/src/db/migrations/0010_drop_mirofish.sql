-- Migration: 0010_drop_mirofish.sql
-- Purpose: Remove MiroFish from the apps catalog. User dropped MiroFish at
--          v29.3 close (2026-05-01) but the seed entry was never UPDATEd to
--          status='archived' or DELETEd — MiroFish kept rendering on
--          livinity.io/store. v29.5 Phase 52 closes the gap.
-- Phase: 52 (v29.5 A3 — marketplace state correction)
--
-- Provenance: MiroFish was never committed via a numbered migration in this
-- repo. It was seeded manually on Server5 (out-of-band insert). v29.3 close
-- decision dropped MiroFish but the live row survived. This migration is the
-- canonical removal — applies cleanly to any fresh-DB platform redeploy.
--
-- The original MiroFish row (captured for forensic reference):
--   slug = 'mirofish'
--   name = 'MiroFish'
--   category = 'ai'
--   featured = false
--   verified = true
--   manifest = {
--     "id": "mirofish",
--     "name": "MiroFish",
--     "port": 3000,
--     "repo": "https://github.com/666ghj/MiroFish",
--     "tagline": "Swarm intelligence engine — predict trends with multi-agent simulations",
--     "version": "0.1.0",
--     "website": "https://mirofish.ai",
--     "category": "ai",
--     "developer": "666ghj",
--     "description": "MiroFish swarm intelligence engine",
--     "manifestVersion": "1.0.0",
--     "requiresAiProvider": true
--   }
--
-- install_history FK pre-cleanup: 14 rows existed; cascading delete handled
-- here so the apps DELETE doesn't error on FK constraint.

BEGIN;

-- Cascade: install_history references apps.id via FK. Remove FK rows first.
DELETE FROM install_history
 WHERE app_id IN (SELECT id FROM apps WHERE slug = 'mirofish');

-- Remove the apps row itself.
DELETE FROM apps WHERE slug = 'mirofish';

COMMIT;

-- Live state on Server5 platform DB after applying this migration on
-- 2026-05-02 (Phase 52 execution):
--   apps total = 26 (was 27)
--   apps WHERE slug='mirofish' → 0 rows
--   apps WHERE slug='bolt-diy' → 1 row (featured=t, untouched)
