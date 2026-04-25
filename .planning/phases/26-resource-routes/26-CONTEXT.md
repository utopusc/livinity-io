# Phase 26: Resource Routes (Containers / Images / Volumes / Networks) — Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

Migrate the four most-used resource lists (Containers / Images / Volumes / Networks) from the legacy Server Control horizontal-tabs layout into dedicated section components within the v28.0 Docker app. Each list ships with deep-linkable URLs (DOC-20 partial — full deep-linking polish in Phase 29).

**Depends on:** Phase 24 (DockerApp + sections + section store), Phase 22 (env-aware tRPC), Phase 25 (env tag filter precedent).

**Requirement IDs:** DOC-07, DOC-08, DOC-09, DOC-10, DOC-20 (partial)

**Success criteria from ROADMAP:**
1. `/docker/containers` renders the full container list (current Containers tab content) with detail panel that slides over from right.
2. `/docker/images` renders image list with Scan + Explain CVEs buttons (Phase 19 + Phase 23 features preserved).
3. `/docker/volumes` renders volume list; backup config link to Schedules.
4. `/docker/networks` renders network list.
5. Deep-linking works: `/docker/containers/n8n_server_1` opens with that container's detail panel pre-expanded.
6. Search input filters list client-side; clicking a row updates URL deep-link.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All choices at planner discretion (discuss skipped). Key constraint: minimize re-implementation. Server Control already has working Containers / Images / Volumes / Networks tab content — extract those tab bodies into section components.

### Likely Patterns
- **Extract pattern**: Each tab body in `livos/packages/ui/src/routes/server-control/index.tsx` is currently a JSX block within a Tabs primitive. Extract to standalone components: `livos/packages/ui/src/routes/docker/sections/containers.tsx` (etc.). Replace Phase 24 placeholders.
- **Deep-linking via window-app routing**: LivOS window-app pattern (Phase 24 D-2: `useDockerSection` zustand store, NOT URL routing). Phase 26 keeps section navigation in zustand, but ADDS a separate "selectedContainerId" / "selectedImageDigest" / etc. mini-stores OR uses a single `useDockerResource` zustand slice for in-section deep-linking. URL bar deep-linking (e.g., `/docker/containers/n8n`) is Phase 29 polish (DOC-20 final) — Phase 26 just makes the deep-link state programmatically settable so other surfaces (env card click, palette, etc.) can navigate to specific resources.
- **Detail panel**: Container detail sheet that slides over from right is already implemented in Server Control — port the existing sheet component. Same for Image expanded row, Volume detail, Network detail.
- **Search**: Each section gets a search input that filters list client-side (already exists in Server Control tabs — port).
- **Env-scoped lists**: All four use `useSelectedEnvironmentId()` from the env store — same as Phase 22 pattern.

### Scope Boundaries
- DOC-07/08/09/10 = port the four lists. DOC-20 partial = programmatic deep-linking (settable state).
- DO NOT migrate Stacks (Phase 27) or other tabs.
- DO NOT delete `routes/server-control/index.tsx` yet — Phase 27 final cleanup deletes it after Stacks migration.
- AI Diagnose button on container detail (Phase 23) carries over.
- Scan + Explain CVEs buttons on images (Phase 19 + Phase 23) carry over.

</decisions>

<code_context>
## Existing Code Insights

Anchor files:
- `livos/packages/ui/src/routes/server-control/index.tsx` — has the four tab bodies (very large file, ~5000+ lines). Find sections like `// Containers tab content` and `<TabsContent value="containers">`.
- `livos/packages/ui/src/routes/docker/sections/containers.tsx` — Phase 24 placeholder. Replace.
- Same for `images.tsx`, `volumes.tsx`, `networks.tsx`.
- `livos/packages/ui/src/hooks/use-containers.ts` etc. — Phase 22 env-aware hooks. Already env-scoped.
- Container detail sheet component(s) — find via grep `<Sheet` or similar Radix primitive in Server Control.
- AI Diagnose button (Phase 23): `livos/packages/ui/src/hooks/use-ai-diagnostics.ts` + container-detail-sheet wiring.
- Scan + Explain CVEs (Phase 19 + 23): scan button + ScanResultPanel with Explain CVEs.

</code_context>

<specifics>
## Specific Ideas

- Plan 26-01: Extract Containers section (largest, has detail sheet, AI Diagnose, search) + Images section (Scan / Explain CVEs preserved). Deep-linking state hooks for both.
- Plan 26-02: Extract Volumes + Networks (smaller). Deep-linking state hooks.
- Each extracted section is its own file — keep co-located with `sections/` directory.

</specifics>

<deferred>
## Deferred Ideas

- URL bar deep-linking (browser history, /docker/containers/n8n syntax) — Phase 29 (DOC-20 final). Phase 26 lays the programmatic settable state.
- Server Control file deletion — Phase 27 cleanup task.

</deferred>
