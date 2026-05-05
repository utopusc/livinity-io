-- Phase 71 (CU-FOUND-01) — Upsert Bytebot Desktop into Server5 apps table
-- (livinity.io/store catalog). Idempotent — safe to re-run.
-- Reference: scripts/suna-insert.sql (shipped 2026-05-04 in 64-04).
INSERT INTO apps (
  slug, name, tagline, description, category, version,
  docker_compose, manifest, icon_url, featured, verified, sort_order
) VALUES (
  'bytebot-desktop',
  'Bytebot Desktop',
  'AI-driven computer use desktop',
  E'Bytebot Desktop is an XFCE-based Linux desktop image (1280x960) packaged for AI agent control. Apache 2.0 licensed.\n\nDesigned to be driven programmatically by the Liv Agent — typically not started directly; the Liv Agent spawns this on demand. Includes Firefox, file manager, terminal, and a VNC server (websockify on port 9990) for live screen viewing.\n\nThis app pairs with the Liv Agent computer use loop (Phase 72) to enable browse + click + type tasks like "navigate to gmail.com and check unread".',
  'developer-tools',
  '0.1.0',
$compose$
services:
  bytebot:
    image: ghcr.io/bytebot-ai/bytebot-desktop:edge
    restart: unless-stopped
    environment:
      RESOLUTION: 1280x960
      DISPLAY: ":0"
    volumes:
      - ${APP_DATA_DIR}/data:/data
    ports:
      - 127.0.0.1:9990:9990
    privileged: true
    shm_size: 2g
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9990/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
$compose$,
  '{"port":9990,"subdomain":"desktop","requiresAiProvider":false,"installOptions":{"environmentOverrides":[]}}'::jsonb,
  'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/bytebot/icon.svg',
  false,
  true,
  110
)
ON CONFLICT (slug) DO UPDATE SET
  name           = EXCLUDED.name,
  tagline        = EXCLUDED.tagline,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  version        = EXCLUDED.version,
  docker_compose = EXCLUDED.docker_compose,
  manifest       = EXCLUDED.manifest,
  icon_url       = EXCLUDED.icon_url,
  verified       = EXCLUDED.verified,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = now();

-- Verify
SELECT id, slug, name, version, category, featured, verified
FROM apps WHERE slug = 'bytebot-desktop';
