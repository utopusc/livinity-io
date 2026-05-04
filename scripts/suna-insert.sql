-- v30.5 — Upsert Suna AI into Server5 apps table (livinity.io/store catalog)
-- Idempotent UPDATE — does not violate install_history FK constraint
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
services:
  frontend:
    image: kortix/kortix-frontend:latest
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      NEXT_PUBLIC_BACKEND_URL: http://kortix-api:13738
    ports:
      - 127.0.0.1:13737:13737
    depends_on:
      - kortix-api
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:13737/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
  kortix-api:
    image: kortix/kortix-api:latest
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
      DB_MODE: external
      ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENCODE_CONFIG_JSON: ${OPENCODE_CONFIG_JSON}
      KORTIX_SANDBOX_URL: http://host.docker.internal:14000
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ${APP_DATA_DIR}/api-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock
$compose$,
  '{"env":[],"port":13737,"subdomain":"suna","requiresAiProvider":true,"installOptions":{"environmentOverrides":[{"name":"NEXT_PUBLIC_SUPABASE_URL","label":"Supabase Project URL (Dashboard → Settings → API)","type":"string","required":true},{"name":"NEXT_PUBLIC_SUPABASE_ANON_KEY","label":"Supabase Anon Key (public; same Settings → API page)","type":"string","required":true},{"name":"SUPABASE_SERVICE_ROLE_KEY","label":"Supabase Service Role Key (secret; same Settings → API page)","type":"password","required":true},{"name":"DATABASE_URL","label":"Supabase Connection String (Dashboard → Settings → Database → URI tab → Use pooling, Mode: Transaction)","type":"password","required":true}]}}'::jsonb,
  'https://avatars.githubusercontent.com/u/128464470',
  false,
  true,
  100
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
FROM apps WHERE slug = 'suna';
