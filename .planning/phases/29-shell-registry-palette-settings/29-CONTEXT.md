# Phase 29: Shell + Registry + cmd+k Palette + Docker Settings — Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

The final phase of v28.0 — closes 6 requirements with 4 surface areas:
1. **Shell** — cross-container exec terminal with sidebar + multi-tab sessions (DOC-15)
2. **Registry** — Docker Hub / private registry credentials + image search (DOC-16)
3. **Docker Settings** — Environments + theme + palette + sidebar density (DOC-17)
4. **cmd+k command palette** — searches across containers/stacks/images/envs/events/settings (DOC-18)
5. **Theme toggle persistence** — already shipped in Phase 24-02 (DOC-19 closure verification)
6. **Deep-linking final** — URL-bar / browser history (DOC-20 final, programmatic half done in Phase 26)

**Depends on:** Phase 24 (DockerApp + section store), Phase 17 (per-container exec WS `/ws/docker/exec`), Phase 21 (AES-256-GCM credential vault pattern), Phase 26 (resource-store programmatic deep-link state).

**Requirement IDs:** DOC-15, DOC-16, DOC-17, DOC-18, DOC-19 (verify), DOC-20 (final)

</domain>

<decisions>
## Implementation Decisions

### Shell (DOC-15)
- Section layout: left sidebar lists running containers in selected env (similar to Logs section); main pane with tabs for multiple concurrent sessions.
- Click container in sidebar → opens new tab with exec session via existing `/ws/docker/exec` (Phase 17). Tab gets container name as title + close button.
- Each tab is its own xterm.js instance. Close tab → close WS, dispose xterm.
- Session state local to component (no zustand persistence — exec sessions are conversational not preferential).
- Carry the env-aware extension pattern from docker-logs-socket (Phase 28-01) — extend `docker-exec-socket.ts` to accept envId via getDockerClient.

### Registry (DOC-16)
- Two sections within Registry: Credentials list + Image search
- **Credentials**: AES-256-GCM encrypted (mirror Phase 21 git-credentials pattern). New PG table `registry_credentials` (id, user_id FK, name, registry_url, username, encrypted_data, created_at). Idempotent CREATE TABLE in schema.sql.
- **tRPC routes**: `docker.listRegistryCredentials`, `docker.createRegistryCredential`, `docker.deleteRegistryCredential` (mutations on httpOnlyPaths)
- **Image search**: backend `docker.searchImages({query, registryId?})` — calls Docker Hub search API for public OR registry-specific search if creds present
- "Pull" button on result → `docker.pullImage({tag, environmentId, registryId?})` — existing pullImage extended with optional registryId for auth

### Docker Settings (DOC-17)
- Settings section in Docker app (NOT global Livinity settings — that stays at /settings)
- Tabs: Environments (port from current Settings > Environments) + Appearance (theme + sidebar density) + Palette (cmd+k preferences)
- Environments tab: same component logic as Phase 22 EnvironmentsSection but mounted within Docker Settings
- Theme: reuse existing useDockerTheme (Phase 24)
- Sidebar density: NEW preference — compact / comfortable. Adjusts sidebar item padding. localStorage `livos:docker:sidebar-density`.
- Palette config: cmd+k toggle (default on), recent searches limit, etc.

### cmd+k Palette (DOC-18)
- Trigger: cmd+k (mac) / ctrl+k (win/linux) keyboard shortcut + Search button in StatusBar (Phase 24 placeholder).
- Modal with search input + categorized results (Containers / Stacks / Images / Volumes / Networks / Envs / Recent Events / Settings)
- Search across all 5 resource types via existing env-aware tRPC + filter client-side
- Result click → setSelectedX (resource-store) + setSection appropriately
- Recent searches: localStorage ring buffer
- Use cmdk library OR build custom — planner picks. shadcn/ui has cmdk integration via Command primitive (verify available).

### Deep-linking final (DOC-20)
- URL-bar form: while LivOS uses window-app pattern (no React Router for /docker), the Docker WINDOW can sync its internal state to a URL-like address bar within the docker app's StatusBar.
- Implementation: optional URL bar component in StatusBar that shows current section + selectedResourceId. Edit URL → set state. Back/forward buttons in StatusBar?
- Pragmatic choice: skip browser-level history (not viable in window-app) but make selectedX state sync to a "deep link" string the user can copy/paste. Click "share" → copy `livinity://docker/containers/n8n` style URI. v29.0+ enhancement.
- For Phase 29 final, focus on PROGRAMMATIC deep-link API closure (already done in Phase 26) + a "copy deep link" button on resource detail panels. Real URL routing is out of scope for the window-app pattern.

### DOC-19 (Theme persistence)
- Already shipped in Phase 24-02 (useDockerTheme + localStorage `livos:docker:theme`).
- Phase 29 just verifies + checks off in REQUIREMENTS.

### Backend Extensions (Allowed)
- `registry_credentials` PG table (idempotent CREATE TABLE in schema.sql).
- 3 new tRPC routes (listRegistryCredentials / createRegistryCredential / deleteRegistryCredential) + httpOnlyPaths registration.
- `docker.searchImages` route (calls Docker Hub search API; basic-auth registry support).
- `docker.pullImage` extension with optional registryId.
- `docker.execSocket` (in `docker-exec-socket.ts`) extension to accept envId — same pattern as Phase 28-01 logs.

### Scope Boundaries
- 4-5 distinct surfaces in Phase 29 — large scope. May need 3 plans (planner judges).
- DO NOT delete the legacy theme system (already only LivOS one).
- Cross-container shell sessions are NOT persisted (conversational state).
- Image search results not cached (live API).

</decisions>

<code_context>
## Existing Code Insights

- `livos/packages/ui/src/routes/docker/sections/shell.tsx` + `registry.tsx` + `settings.tsx` (Phase 24 placeholders)
- `livos/packages/livinityd/source/modules/server/docker-exec-socket.ts` (Phase 17 — extend with envId)
- `livos/packages/livinityd/source/modules/docker/git-credentials.ts` (Phase 21 — AES-256-GCM pattern reference)
- `livos/packages/livinityd/source/modules/database/schema.sql` (add registry_credentials)
- `livos/packages/livinityd/source/modules/docker/routes.ts` (add 4 new routes)
- `livos/packages/ui/src/routes/docker/_components/environment-selector.tsx` (Phase 22, relocated in Phase 27)
- xterm.js — already used in Phase 17
- Docker Hub search API: `https://hub.docker.com/v2/search/repositories?query=X` (no auth needed for public)

</code_context>

<specifics>
## Specific Ideas

Plan split (3 plans likely):
- **Plan 29-01**: Shell section (DOC-15) + cmd+k palette (DOC-18) — both reuse Phase 17 infra and section navigation patterns
- **Plan 29-02**: Registry credentials + image search (DOC-16) — new backend table + 4 tRPC routes
- **Plan 29-03**: Docker Settings page (DOC-17) + DOC-19 verification + DOC-20 programmatic deep-link copy-button + final v28 polish

Or 2 plans:
- **Plan 29-01**: Shell + cmd+k palette
- **Plan 29-02**: Registry + Docker Settings + DOC-19/20 closure

Planner judges based on size estimates.

</specifics>

<deferred>
## Deferred Ideas

- Real URL bar / browser history (window-app pattern incompatible — programmatic API closes DOC-20)
- Image SBOM / license scanning (out of scope per REQUIREMENTS.md)
- Saved query presets in palette (out of scope)

</deferred>
