# Phase 90 — Cutover — SUMMARY

**Wave:** 5 (sequential — runs first; P91 UAT next)
**Status:** COMPLETE
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED
(verified before AND after every edit).

---

## Files Modified (10)

| File | Delta | Change |
|------|-------|--------|
| `livos/packages/ui/src/modules/window/app-contents/ai-chat-content.tsx` | -1 / +6 | Lazy import target swap `@/routes/ai-chat` → `@/routes/ai-chat/v32` (D-90-01) |
| `livos/packages/ui/src/routes/ai-chat/v32/index.tsx` | -2 / +35 | ThemeToggle import + mount in chat header (P89 deferred); liv-last-assistant localStorage write in v32Messages effect (P89 deferred) |
| `livos/packages/ui/src/routes/ai-chat/v32/ChatComposer.tsx` | -1 / +12 | useEffect listening for `liv-composer-focus` CustomEvent → focuses textareaRef (P89 deferred) |
| `livos/packages/livinityd/source/modules/server/index.ts` | +9 | HTTP 301 redirect `/agent-marketplace` → `/marketplace` placed BEFORE the SPA static catch-all |
| `livos/packages/ui/src/routes/agent-marketplace/index.tsx` | -7 / +24 | Default export becomes a `useNavigate('/marketplace', {replace:true})` redirector with "Redirecting…" hint; legacy body preserved as `_LegacyAgentMarketplaceBody` (Vite tree-shakes) |
| `livos/packages/ui/src/routes/agents/index.tsx` | -1 / +1 | EmptyState onBrowse now navigates to `/marketplace` (was `/agent-marketplace`) |
| `livos/packages/ui/src/routes/settings/liv-agent.tsx` | -1 / +1 | Settings link points at `/marketplace` |
| `livos/packages/ui/src/routes/ai-chat/index.tsx` | -10 / +9 | Updated 2 deprecation comments to reflect P90 deletion of mcp-panel.tsx (legacy module itself remains on disk for v33 cleanup) |
| `livos/packages/ui/src/providers/apps.tsx` | +17 | systemApps entries `LIVINITY_agents` (route `/agents`) + `LIVINITY_marketplace` (route `/marketplace`) — placeholder image assets per D-90-05 |
| `livos/packages/ui/src/modules/desktop/dock.tsx` | +35 | DockItems for Agents + Marketplace placed adjacent to AI Chat (logical grouping) |
| `livos/packages/ui/src/modules/window/window-content.tsx` | +9 | 2 lazy-imported window-content components + 2 switch cases + fullHeightApps additions for the new app IDs (D-90-06) |

## Files Deleted (2)

| File | Lines | Reason |
|------|-------|--------|
| `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx` | 1404 | P84 unwired the sidebar tab; P90 deletes the file (D-MCP-SOT — single source of truth lives in `components/mcp/`) |
| `livos/packages/ui/src/routes/ai-chat/index-v19.tsx` | (orphan) | Older legacy chat module with zero callers — held a `lazy(() => import('./mcp-panel'))` reference. Per D-CUTOVER-CLEAN: deleted together with mcp-panel.tsx so the build stays green |

## Files Created (2)

| File | Purpose |
|------|---------|
| `.planning/phases/90-cutover/90-CONTEXT.md` | Phase planning document — chosen-approach rationale (route swap over Redis flag), deliverables, hard constraints, decisions D-90-01..D-90-06 |
| `.planning/v33-DRAFT.md` | Stub milestone — scheduled cleanup carryovers (CL-01 useAgentSocket removal, CL-02 legacy ai-chat tree, CL-03 dock icon polish, CL-04 agent-marketplace directory deletion). TBD milestone goal |

---

## Approach Chosen — Route Swap (D-90-01)

The prompt presented two options for cutover gating: Redis flag or route swap.
The orchestrator's RECOMMENDED path was the route swap. After reading the
codebase architecture, the route swap is correct because:

- AI Chat is a **window-only app** in this codebase (router.tsx:82 comment:
  "AI pages are NOT registered as routes — they open exclusively as draggable
  windows from the dock"). The ONLY mounting point is
  `app-contents/ai-chat-content.tsx`'s lazy import.
- Changing one lazy-import target is the cleanest cutover possible —
  zero new state, zero runtime fetch overhead, zero failure modes from a
  Redis-key-fetch race.
- The Redis flag was useful for *dev gating* during Wave 4 parallel
  development (when both `/ai-chat` and `/ai-chat-v2` had to coexist).
  Production cutover IS the route swap.
- `/ai-chat-v2` URL stays as a permanent alias (router.tsx:147 entry
  unchanged) — both URLs converge on v32.

---

## P89 Deferred Wire-Ups (3) — All Done

Per P89-SUMMARY's "P90 Wire-Up Checklist":

### a. ThemeToggle in v32 chat header
`routes/ai-chat/v32/index.tsx` imports `<ThemeToggle />` from
`@/components/theme-toggle` and renders it in the header right side, next to
the dev preview pill. Wrapped in a flex container so the pill + toggle align
neatly. P89 deferred this because the v32 chat header was being edited by
P88 in parallel.

### b. liv-composer-focus CustomEvent listener
`routes/ai-chat/v32/ChatComposer.tsx` adds:
```ts
useEffect(() => {
  const handleFocus = () => textareaRef.current?.focus()
  window.addEventListener('liv-composer-focus', handleFocus)
  return () => window.removeEventListener('liv-composer-focus', handleFocus)
}, [])
```
This wires up Cmd+K from P89's keyboard hook (which dispatches
`new CustomEvent('liv-composer-focus')`). The event is window-scoped because
the dispatcher fires at document.body level.

### c. liv-last-assistant localStorage write
`routes/ai-chat/v32/index.tsx` adds an effect on `[v32Messages]` that walks
backward to the most recent assistant message, checks `status === 'complete'`
(skips while still streaming), and writes `m.content` to localStorage when
the message ID has changed since the last write. This wires up Cmd+Shift+C
from P89's keyboard hook. Implementation details:

- A `lastWrittenAssistantIdRef` (useRef<string | null>) tracks the last
  assistant message ID we wrote to localStorage. Prevents redundant writes
  on every render.
- Wrapped in try/catch — localStorage may be unavailable (SSR, private
  browsing quota). Best-effort only.

---

## /agent-marketplace → /marketplace Redirect (Two Layers)

### Server-side (HTTP 301)
`livos/packages/livinityd/source/modules/server/index.ts` adds:
```ts
this.app.get('/agent-marketplace', (_request, response) => {
  response.redirect(301, '/marketplace')
})
```
Placed BEFORE the SPA static catch-all (`app.use('*', express.static(...))`
at line 1720). Both the dev proxy branch and the prod static branch are
beneath this gate, so both modes honor the redirect.

### Client-side (SPA fallback)
`routes/agent-marketplace/index.tsx`'s default export becomes a tiny
component that calls `useNavigate('/marketplace', {replace: true})` on
mount and renders a brief "Redirecting…" hint. This catches React Router
push-state navigations that bypass the server entirely (e.g.
`<Link to='/agent-marketplace'>` in a not-yet-cleaned-up consumer).

### Live consumers cleaned
Two known live consumers were also pointed at `/marketplace` directly so
the redirect overhead never fires for current code paths:

- `routes/agents/index.tsx:178` — EmptyState's "Browse marketplace" CTA
- `routes/settings/liv-agent.tsx:67` — Settings link

---

## Dock + systemApps Entries

### systemApps (providers/apps.tsx)
Added `LIVINITY_agents` and `LIVINITY_marketplace` entries with placeholder
existing image assets (D-90-05):
- `LIVINITY_agents`: `/figma-exports/dock-server.svg` (placeholder)
- `LIVINITY_marketplace`: `/figma-exports/dock-app-store.png` (placeholder)

v33 ships dedicated SVGs (CL-03 in v33-DRAFT.md).

### Dock (dock.tsx)
Two new `<DockItem>` calls inserted directly after the AI Chat entry for
logical grouping (all three are LLM-domain surfaces). Both use
`handleOpenWindow` matching the existing AI Chat pattern. The `open`
prop uses `pathname.startsWith('/agents')` / `pathname.startsWith('/marketplace')`
so the dock indicator correctly highlights when the route is active.

### Window content (window-content.tsx)
Both new app IDs added to:
- `fullHeightApps` Set — so the dock-opened window does not wrap them in
  the padded scroll container (matches AI Chat behavior).
- `WindowAppContent` switch — two new cases lazy-importing
  `@/routes/agents` and `@/routes/marketplace`. Both routes are
  self-contained components; they render identically inside or outside the
  window shell.

---

## Legacy mcp-panel.tsx Deletion (D-CUTOVER-CLEAN)

The prompt instructed: "DELETE: livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx"
and "Grep first to confirm zero references — if any references remain,
either delete those too OR leave the file with a clear deprecation comment
for v33."

Grep found ONE remaining reference: `routes/ai-chat/index-v19.tsx:42` —
`const McpPanel = lazy(() => import('./mcp-panel'))`. Investigation:

- `index-v19.tsx` is an older legacy chat module (1300+ lines) — it was
  superseded by `index.tsx` ages ago.
- `grep -rln "index-v19"` returned ZERO callers anywhere in the codebase.
- `index-v19.tsx` is dead code with a single live reference: the
  `import('./mcp-panel')` lazy import.

Per D-CUTOVER-CLEAN ("NO half-deleted state"), I deleted BOTH files
together so the build stays green and there is no half-deleted state. The
1404-line `mcp-panel.tsx` and the orphan `index-v19.tsx` are both gone.

Final grep for `mcp-panel` / `McpPanel` / `index-v19`:
- 2 hits in `routes/ai-chat/index.tsx` — comment-only deprecation
  breadcrumbs (updated to reflect P90 deletion).
- 1 hit in `livinityd/source/modules/server/trpc/mcp-router.ts` — comment
  describing what mcp-router supersedes.

Zero live imports. Build green.

---

## Sacred SHA Verification

```
git hash-object liv/packages/core/src/sdk-agent-runner.ts
# → f3538e1d811992b782a9bb057d1b7f0a0189f95f  (BEFORE all edits)
# → f3538e1d811992b782a9bb057d1b7f0a0189f95f  (AFTER all edits)
```

`liv/packages/core/` directory ZERO touches verified. The wrap-don't-rewrite
constraint shipped from P77-02 holds through Wave 5.

---

## Verification Gates Run

```
# UI build
cd livos/packages/ui && pnpm build
✓ built in 35.12s              # exit 0
# (Same baseline warnings as P88/P89 — chunk-size warning on
# index-a9ed8e2b.js at 1,439 kB. Pre-existing.)

# Backend typecheck — filter to P90's modified line range (1675-1695)
cd livos/packages/livinityd && npx tsc --noEmit 2>&1 | grep -E "server/index.ts\(16(7[5-9]|8[0-9]|9[0-9])," 
(empty)                        # zero new errors at the redirect insertion site

# UI typecheck — filter to P90-touched files
cd livos && pnpm --filter ui exec tsc --noEmit 2>&1 | grep -E "(v32/index\.tsx|v32/ChatComposer\.tsx|theme-toggle\.tsx|agent-marketplace/index\.tsx|agents/index\.tsx|window-content\.tsx|ai-chat-content\.tsx|providers/apps\.tsx|modules/desktop/dock\.tsx|settings/liv-agent\.tsx)"
(empty)                        # zero new errors in any P90-modified file

# Sacred SHA
git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f  # PASS

# mcp-panel sweep
grep -rln "mcp-panel" livos/packages/ui/src/
livos/packages/ui/src/routes/ai-chat/index.tsx  # comment-only mentions, no live import
```

Pre-existing baseline noise unchanged: typecheck errors at lines 74, 175,
716, 870, 1753 of `server/index.ts` (all far from P90's insertion at line
1679); `dock-profile.tsx:41` user-id property error (in a file I did not
touch). Error count delta on changed files is ZERO.

---

## Constraints Verified

| Constraint | Status |
|-----------|--------|
| Sacred SHA `f3538e1d…` unchanged before AND after | PASS |
| `liv/packages/core/` zero changes | PASS — no edits to that directory |
| ZERO changes to v32 component internals (P81/P82/P83/P84/P85-UI/P86/P88/P89 lanes) EXCEPT the 3 P89 deferred wire-ups | PASS — only `v32/index.tsx` (P89 wire-ups: ThemeToggle mount + localStorage write) and `v32/ChatComposer.tsx` (P89 wire-up: liv-composer-focus listener) modified. Both edits are explicitly assigned by P89-SUMMARY |
| D-CUTOVER-CLEAN: NO half-deleted state | PASS — `mcp-panel.tsx` + `index-v19.tsx` deleted together; legacy `routes/ai-chat/index.tsx` kept on disk for v33 holistic cleanup (documented in v33-DRAFT.md) |
| D-NO-PROD-DEPLOY | PASS — no Mini PC SSH commands run; commit prepared but not pushed (orchestrator owns the batch push) |

---

## API / Behavior Surface After P90

- **Window AI Chat icon (dock)** → renders `routes/ai-chat/v32` (Suna-port + SSE)
- **`/ai-chat` URL** → still routes to legacy `routes/ai-chat/index.tsx` if
  navigated to directly (the route entry was never registered in
  `router.tsx`; the legacy module is only reachable as a code import,
  which we removed). The legacy module is now effectively dead code
  reachable only via direct ESM import (none exist after the cutover).
- **`/ai-chat-v2` URL** → renders v32 (alias, kept for in-flight bookmarks)
- **`/agent-marketplace` URL** → 301 → `/marketplace` (server) + client
  fallback for SPA pushes
- **`/marketplace` URL** → renders v32 marketplace (P86)
- **`/agents` URL** → renders v32 agents grid (P85-UI)
- **Dock** → AI Chat (v32) + Agents (v32) + Marketplace (v32) all visible
- **Cmd+K** → focuses v32 ChatComposer (P89 hook + P90 listener)
- **Cmd+Shift+C** → copies last assistant message via localStorage (P89
  hook + P90 writer)
- **mcp-panel sidebar tab** → permanently gone (file deleted)

---

## Carryover for v33

All scheduled work captured in `.planning/v33-DRAFT.md`:
- CL-01: Remove `useAgentSocket` + 5 legacy callers (zero functional callers post-cutover)
- CL-02: Delete the entire `routes/ai-chat/` legacy tree (everything except `v32/`)
- CL-03: Polish dock icons for Agents + Marketplace (placeholder assets in P90)
- CL-04: Delete `routes/agent-marketplace/` directory after rollback window passes

---

## Deviations from CONTEXT.md

**One minor extension** beyond the original deliverable list: I additionally
updated 2 live `/agent-marketplace` Link/navigate consumers
(`routes/agents/index.tsx:178` EmptyState and `routes/settings/liv-agent.tsx:67`
settings link) to point directly at `/marketplace`. Reason: cleaner — the
client-side useNavigate fallback already covers the redirect path, but
direct routing avoids a useless re-mount on every click and removes the
"Redirecting…" flash for known consumers. Out-of-scope `/agent-marketplace`
hits (e.g. external links from blog posts, bookmarks) still hit the server
301 + client fallback combo.

## Commit

ONE commit. NOT pushed — orchestrator owns the Wave 5 batch push.
