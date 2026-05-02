-- Migration: 0011_fix_bolt_diy_wrangler.sql
-- Purpose: Patch the Bolt.diy docker_compose to install wrangler globally at
--          container start time. The upstream image
--          ghcr.io/stackblitz-labs/bolt.diy:latest builds with
--          `pnpm prune --prod --ignore-scripts` which strips wrangler (a
--          devDependency) — but the dockerstart script needs wrangler in PATH.
--          Container restart-loops with `sh: 1: wrangler: not found` until
--          wrangler is installed at runtime.
-- Phase: 56 (v29.5 post-deploy hot-fix from Phase 51)
--
-- The injected `command:` line:
--   command: ["sh", "-c", "command -v wrangler >/dev/null 2>&1 || npm install -g wrangler@latest; pnpm run dockerstart"]
--
-- Behavior:
--   1. Check if wrangler is in PATH (cheap, no-op for re-runs after install)
--   2. If absent: `npm install -g wrangler@latest` (one-time ~30s on first start)
--   3. Always run: `pnpm run dockerstart` (the upstream-defined entrypoint that
--      invokes `wrangler pages dev ./build/client ...`)
--
-- Live applied to Mini PC bolt-diy_server_1 on 2026-05-02 — container went from
-- 22-restart loop to "Up (healthy)" with HTTP 200 on port 5173.

BEGIN;

UPDATE apps
SET docker_compose = $$version: "3.7"
services:
  server:
    image: ghcr.io/stackblitz-labs/bolt.diy:latest
    command: ["sh", "-c", "command -v wrangler >/dev/null 2>&1 || npm install -g wrangler@latest; pnpm run dockerstart"]
    container_name: bolt-diy
    restart: unless-stopped
    ports:
      - "127.0.0.1:5173:5173"
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: "5173"
      RUNNING_IN_DOCKER: "true"
      # OPENAI_API_KEY, OPENAI_API_BASE_URL, OPENAI_LIKE_API_BASE_URL,
      # ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_REVERSE_PROXY,
      # LLM_BASE_URL + extra_hosts auto-injected by livinityd at install
      # time when manifest.requiresAiProvider is true.
    volumes:
      - bolt_diy_data:/app/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:5173/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 90s
volumes:
  bolt_diy_data:
$$
WHERE slug = 'bolt-diy';

COMMIT;

-- Note: start_period bumped from 60s to 90s to accommodate the one-time
-- wrangler install on first container start. Subsequent restarts skip the
-- install (PATH check short-circuits) and start in normal time.
