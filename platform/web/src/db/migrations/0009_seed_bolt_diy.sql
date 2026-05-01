-- Migration: 0009_seed_bolt_diy.sql
-- Purpose: Seed Bolt.diy into the apps catalog so it appears in the
--          livinity.io/store marketplace browse iframe (which reads from
--          platform PostgreSQL, not the sibling utopusc/livinity-apps repo).
-- Phase: 43.11 (v29.3 hot-patch sweep — broker integration)
--
-- Bolt.diy is the open-source AI app builder (StackBlitz Labs fork of bolt.new).
-- requiresAiProvider: true triggers livinityd auto-injection of broker env vars
-- on install (apps.ts Phase 43.2 inject + 43.9 OPENAI_LIKE_API_BASE_URL alias).
-- No env_overrides — install dialog skipped. User picks "OpenAI-Like" provider
-- in Bolt.diy's settings after first launch (upstream lacks ANTHROPIC_BASE_URL).

BEGIN;

-- Idempotency: remove existing seed before re-inserting (matches the pattern
-- in 0001/0003 seed migrations).
DELETE FROM apps WHERE slug = 'bolt-diy';

INSERT INTO apps (slug, name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'bolt-diy',
  'Bolt.diy',
  'AI-powered web app builder — your Claude subscription, no API key needed',
  'Bolt.diy is an open-source AI app builder (community fork of bolt.new by StackBlitz Labs) that lets you describe apps in natural language and watch them get built in your browser. The LLM backend is auto-configured to use your Claude subscription via Livinity Broker — no LLM API key prompt inside the app.

First-time setup: open Bolt.diy after install, then in the provider menu choose "OpenAI-Like" (Bolt.diy uses this label for any OpenAI-compatible third-party endpoint — the broker speaks OpenAI Chat Completions format). Pick any Claude model id (e.g. claude-sonnet-4-6, claude-opus-4-7) and start prompting.

Note: Bolt.diy upstream does NOT currently support ANTHROPIC_BASE_URL env var, so the Anthropic provider entry will bypass Livinity Broker and try to reach api.anthropic.com directly. Stick with OpenAI-Like until the upstream PR lands.

MIT licensed. Active maintenance, 10K+ stars.',
  'developer',
  '0.0.7',
  $$version: "3.7"
services:
  server:
    image: ghcr.io/stackblitz-labs/bolt.diy:latest
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
      start_period: 60s
volumes:
  bolt_diy_data:
$$,
  '{"port": 5173, "subdomain": "bolt", "requiresAiProvider": true, "env": []}'::jsonb,
  'https://avatars.githubusercontent.com/u/28635252',
  true,
  true
);

COMMIT;
