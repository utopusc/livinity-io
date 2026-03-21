# Phase 24: App Store Expansion - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add 10 new single-container web UI apps to LivOS builtin-apps.ts and platform DB. Research Docker configurations, assign non-conflicting ports, test end-to-end on Server4. Categories: Privacy, Media, Productivity, Communication, Dev Tools.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — highly specified expansion phase with clear app list and established pattern from 19 existing builtin apps.

Key design decisions:
1. **Follow existing pattern** — Each app gets full BuiltinAppManifest entry matching the structure in builtin-apps.ts
2. **Port allocation** — Assign unique host ports avoiding all existing: 2283, 3000, 3001, 3002, 3100, 5432, 5678, 8000, 8070, 8080, 8081, 8096, 8123, 8180, 8384, 9000, 11434
3. **Health checks** — Every app gets a Docker healthcheck (curl/wget to web UI endpoint)
4. **Single-container only** — Element/Matrix: deploy Element Web as single container with configurable homeserver URL (default matrix.org)
5. **Platform DB** — Add SQL seed migration for all 10 apps matching 0001_seed_apps.sql format
6. **Categories** — Use existing category slugs where possible, add new ones as needed (privacy, communication)
7. **Compose pattern** — mainService: 'server', unless-stopped restart, 127.0.0.1 port binding, ${APP_DATA_DIR} volumes
8. **Testing** — Deploy each app on Server4, verify web UI loads, verify health check passes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `builtin-apps.ts` — 19 existing apps with full BuiltinAppManifest definitions + ComposeDefinition
- `compose-generator.ts` — Generates docker-compose.yml from builtin definitions at install time
- `apps.ts` — Install flow: generateAppTemplate → patchComposeFile → pull → start
- Platform DB seed: `platform/web/src/db/migrations/0001_seed_apps.sql`

### Established Patterns
- Single service named 'server' for single-container apps
- Volumes: `${APP_DATA_DIR}/data:/container/path`
- Ports: `127.0.0.1:{host}:{container}`
- Health: wget/curl to localhost health endpoint, 30s interval, 10s timeout, 3 retries
- deterministicPassword for apps with default admin accounts
- environmentOverrides for user-configurable credentials

### Integration Points
- `BUILTIN_APPS` array in builtin-apps.ts (just append new entries)
- Platform DB apps table via SQL migration
- Category system in store UI (auto-discovers from app data)

</code_context>

<specifics>
## Specific Ideas

Target apps (from ROADMAP):
1. AdGuard Home — DNS ad blocker (Privacy)
2. WireGuard Easy — VPN server with web UI (Privacy)
3. Navidrome — Music streaming server (Media)
4. Calibre-web — Ebook library (Media)
5. Homarr — Dashboard/homepage (Productivity)
6. Wiki.js — Wiki/documentation (Productivity)
7. Linkwarden — Bookmark manager (Productivity)
8. Element Web — Matrix chat client (Communication)
9. Hoppscotch — API development platform (Dev Tools)
10. Stirling PDF — PDF manipulation toolkit (Dev Tools)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
