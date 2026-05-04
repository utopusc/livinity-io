-- v30.5 — Insert Suna AI into Server5 apps table (livinity.io/store catalog)
-- Idempotent: removes existing row first
DELETE FROM apps WHERE slug = 'suna';

INSERT INTO apps (
  slug, name, tagline, description, category, version,
  docker_compose, manifest, icon_url, featured, verified, sort_order
) VALUES (
  'suna',
  'Suna AI',
  'Autonomous AI agents — your Claude subscription, your own sandbox',
  E'Suna is an open-source autonomous agent platform (Manus alternative) — agents run 24/7 in isolated Docker sandboxes with shared filesystem, credentials, and history. 60+ skills, 3000+ integrations.\n\n**Setup requires a free Supabase Cloud project** (managed Postgres + Auth, no extra services on your Mini PC).\n\n1. Go to supabase.com → New Project (free tier is fine)\n2. Settings → API → copy 3 values:\n   - Project URL\n   - Anon Key\n   - Service Role Key (secret)\n3. Paste them into the install form.\n\nLLM backend auto-configured to use your Claude subscription via Livinity Broker — no LLM API key prompt inside the app.\n\nApache 2.0 licensed. 19.7K+ stars. v0.8.44 (Apr 2026).',
  'developer-tools',
  '0.8.44',
$compose$
version: "3.7"
services:
  frontend:
    image: ghcr.io/kortix-ai/suna/suna-frontend:latest
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      NEXT_PUBLIC_BACKEND_URL: http://backend:8000
    ports:
      - 127.0.0.1:3000:3000
    depends_on:
      - backend
      - redis
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
  backend:
    image: ghcr.io/kortix-ai/suna/suna-backend:latest
    restart: unless-stopped
    entrypoint:
      - sh
      - -c
      - 'mkdir -p /root/.config/opencode && printf "%s" "$$OPENCODE_CONFIG_JSON" > /root/.config/opencode/config.json && exec "$$@"'
      - --
    environment:
      SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      REDIS_URL: redis://redis:6379
    volumes:
      - ${APP_DATA_DIR}/backend-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - redis
  worker:
    image: ghcr.io/kortix-ai/suna/suna-backend:latest
    restart: unless-stopped
    entrypoint:
      - sh
      - -c
      - 'mkdir -p /root/.config/opencode && printf "%s" "$$OPENCODE_CONFIG_JSON" > /root/.config/opencode/config.json && exec "$$@"'
      - --
    environment:
      SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      REDIS_URL: redis://redis:6379
    volumes:
      - ${APP_DATA_DIR}/backend-data:/app/data
    depends_on:
      - redis
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - ${APP_DATA_DIR}/redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3
$compose$,
  '{"env":[],"port":3000,"subdomain":"suna","requiresAiProvider":true,"installOptions":{"environmentOverrides":[{"name":"NEXT_PUBLIC_SUPABASE_URL","label":"Supabase Project URL (from supabase.com → Settings → API)","type":"string","required":true},{"name":"NEXT_PUBLIC_SUPABASE_ANON_KEY","label":"Supabase Anon Key (public — same Settings → API page)","type":"string","required":true},{"name":"SUPABASE_SERVICE_ROLE_KEY","label":"Supabase Service Role Key (secret — same Settings → API page)","type":"password","required":true}]}}'::jsonb,
  'https://avatars.githubusercontent.com/u/128464470',
  false,
  true,
  100
);

-- Verify
SELECT id, slug, name, version, category, featured, verified
FROM apps WHERE slug = 'suna';
