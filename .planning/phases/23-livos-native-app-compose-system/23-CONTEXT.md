# Phase 23: LivOS-Native App Compose System - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace community app store git repo dependency with self-contained compose generation from builtin-apps.ts. Generate complete docker-compose.yml at install time for each builtin app. Fall back to platform DB for non-builtin apps. Eliminate server-side git clone requirement.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase with clear requirements from user.

Key design decisions:
1. **Compose generation in builtin-apps.ts** — Each app gets a `compose` field with complete service definitions
2. **Main service identification** — Use `mainService` field to specify which service gets port binding (fixes Portainer issue)
3. **Health checks** — Each app gets appropriate Docker healthcheck (curl, wget, or tcp check)
4. **Multi-service apps** — Portainer (docker+portainer), Nextcloud (app only, simple), Immich (server+ml+db+redis)
5. **Fallback chain** — Builtin compose → Platform DB docker_compose → Error (no community repo needed)
6. **patchComposeFile still runs** — But compose is already correct, so patches are minimal (container names, volume paths)
7. **Manifest generation** — Generate livinity-app.yml manifest alongside compose for apps without repo templates
8. **Restart policy** — `unless-stopped` for all services
9. **Port binding** — Always `127.0.0.1:{port}:{port}` on the main service only

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` — Current builtin app definitions (metadata only, no compose)
- `livos/packages/livinityd/source/modules/apps/apps.ts` — Install flow, calls appStore.getAppTemplateFilePath()
- `livos/packages/livinityd/source/modules/apps/app.ts` — patchComposeFile(), readManifest(), install()
- `livos/packages/livinityd/source/modules/apps/app-store.ts` — getAppTemplateFilePath() searches git repos

### Current Install Flow
1. `apps.install(appId)` → `appStore.getAppTemplateFilePath(appId)` (searches git repos)
2. Read manifest from template dir
3. Copy template to app-data dir via rsync
4. `app.patchComposeFile()` — adds port mapping, container names, volume paths
5. `app.pull()` — download Docker images
6. `appScript('install')` — run legacy install hooks

### Problems Being Solved
- Server needs git repos cloned (fragile, requires network)
- patchComposeFile adds ports to wrong service for multi-service apps
- No health checks on any app containers
- No proper restart policies
- Community compose files may conflict with LivOS architecture (app_proxy, wrong volumes)

### Builtin Apps (11 apps)
n8n, portainer, home-assistant, jellyfin, nextcloud, code-server, uptime-kuma, gitea, grafana, postgresql, chromium

</code_context>

<specifics>
## Specific Ideas

- Generate compose + manifest in a temp dir, then rsync to app-data (same flow as before)
- Keep patchComposeFile for backwards compat but generated compose should need minimal patching
- Health checks: HTTP apps use `curl -f http://localhost:{port}/` or wget, DB apps use pg_isready/redis-cli
- Chromium needs special handling (GPU passthrough, Selkies display)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
