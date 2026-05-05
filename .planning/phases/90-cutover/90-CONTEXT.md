# Phase 90 — Cutover — CONTEXT

**Wave:** 5 (sequential — runs first; P91 UAT follows)
**Status:** EXECUTING
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified pre-execution)

---

## Goal

Flip v32 to be the default chat experience, retire legacy paths cleanly, and
pick up P89's three deferred wire-up items. Add Dock entries for `/agents` and
`/marketplace` (P85-UI/P86 deferred). Schedule `useAgentSocket` removal for
v33.

---

## Chosen Approach — Route Swap (NOT Redis flag)

The prompt presented two paths:

1. **Redis flag gate** (`liv:config:new_chat_enabled`) at
   `routes/ai-chat/index.tsx` — runtime toggle without code change.
2. **Route swap** — change the lazy import target of the AI Chat window
   content from legacy `@/routes/ai-chat` → `@/routes/ai-chat/v32`.

**Decision: Route swap.** Rationale:

- Production cutover IS the route swap. The Redis flag was useful for *dev
  gating* during Wave 4 (parallel /ai-chat + /ai-chat-v2 development) — now
  obsolete. The /ai-chat-v2 router entry already exists (router.tsx:147).
- AI Chat in this codebase is a **window-only app** (router.tsx:82 comment:
  "AI pages are NOT registered as routes — they open exclusively as draggable
  windows from the dock"). The actual switching point is
  `livos/packages/ui/src/modules/window/app-contents/ai-chat-content.tsx`,
  which lazy-imports `@/routes/ai-chat`. One-line import target swap is the
  cleanest cutover.
- `/ai-chat-v2` route entry stays in `router.tsx` as an alias (still pointing
  at `routes/ai-chat/v32/index.tsx`) so any in-flight bookmarks / dev links
  keep working — both URLs converge on v32.
- Legacy `routes/ai-chat/index.tsx` file remains on disk, NOT deleted. v33 owns
  the holistic legacy directory cleanup (along with `useAgentSocket` removal —
  see Schedule below). Keeping it on disk lets us route /ai-chat-legacy back
  for emergency rollback without a code-change deploy.
- ROADMAP P90 mentions "Set `liv:config:new_chat_enabled=true` Redis flag" —
  per the orchestrator's RECOMMENDED override in the prompt: the flag was for
  dev gating; production cutover IS the route swap. Document choice here per
  D-CUTOVER-CLEAN.

**Files touched for cutover (1):**
- `livos/packages/ui/src/modules/window/app-contents/ai-chat-content.tsx`
  — change `React.lazy(() => import('@/routes/ai-chat'))` →
  `React.lazy(() => import('@/routes/ai-chat/v32'))`

---

## Deliverables

### 1. Cutover (route swap)
- `app-contents/ai-chat-content.tsx`: import target swap (1-line change).
- `router.tsx`: keep `/ai-chat-v2` entry as-is (already points at v32; it
  becomes a permanent alias — zero churn for in-flight bookmarks).

### 2. /agent-marketplace → /marketplace redirect
- **Server-side HTTP 301** in
  `livos/packages/livinityd/source/modules/server/index.ts`: add
  `app.get('/agent-marketplace', (req, res) => res.redirect(301, '/marketplace'))`
  immediately BEFORE the SPA static catch-all (which lives in the
  `if (process.env.LIVINITY_UI_PROXY) { … } else { … }` block ending at line
  1720). Place the redirect just before that gate so dev (proxy) and prod
  (static) both honor it.
- **Client-side fallback** in `routes/agent-marketplace/index.tsx`: on mount,
  `useNavigate()` → `/marketplace` with `{replace: true}`. Render brief
  "Redirecting…" spinner. This catches in-app SPA navigations that don't hit
  the server (React Router push state).

### 3. P89 deferred items (3 wire-ups)
**a. ThemeToggle in v32 chat header**
- Add `<ThemeToggle className='ml-2' />` to the v32 chat header (`routes/ai-
  chat/v32/index.tsx`), right side, alongside the dev preview pill. Source the
  component from `@/components/theme-toggle` (P89).

**b. liv-composer-focus listener in ChatComposer**
- `routes/ai-chat/v32/ChatComposer.tsx`: add useEffect that listens for the
  `liv-composer-focus` CustomEvent (dispatched by P89's keyboard hook on
  Cmd+K) and calls `textareaRef.current?.focus()`.

**c. liv-last-assistant localStorage write**
- `routes/ai-chat/v32/index.tsx`: add useEffect that watches `v32Messages`
  (already projected from SSE state). When the LAST assistant message
  transitions to `status === 'complete'`, write its text to
  `localStorage.setItem('liv-last-assistant', text)`. This wires up
  Cmd+Shift+C from P89.

### 4. Delete legacy mcp-panel.tsx
- DELETE `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx`.
- The only remaining reference is in `routes/ai-chat/index-v19.tsx` —
  itself an orphaned older version of the legacy chat with **zero callers**
  (verified via `grep -rln "index-v19"`). Per D-CUTOVER-CLEAN: delete BOTH
  files together so the build stays green and there is no half-deleted state.
  - `mcp-panel.tsx` (1404 lines)
  - `index-v19.tsx` (orphan, unreferenced)

### 5. Dock + systemApps entries for /agents and /marketplace
- `livos/packages/ui/src/providers/apps.tsx`: add 2 systemApps entries.
  - `LIVINITY_agents` — name "Agents", route `/agents`, icon
    `dock-server.svg` (placeholder — closest existing asset; future polish in
    v33 swaps in dedicated SVGs).
  - `LIVINITY_marketplace` — name "Marketplace", route `/marketplace`, icon
    `dock-app-store.png` (placeholder).
- `livos/packages/ui/src/modules/desktop/dock.tsx`: add 2 DockItems near the
  existing AI Chat entry (logical grouping). Use Lucide-equivalents from the
  Tabler set (we use Tabler in this codebase — `IconRobot` for Agents,
  `IconBuildingStore` for Marketplace) at the icon level only — but the
  Dock uses image-based icons via `systemAppsKeyed[id].icon`, so the SVG/PNG
  asset strings above are what actually render. The "Lucide Bot/Store" hint
  in the prompt was a logical-icon hint; the codebase pattern is image
  assets. We follow the existing pattern.
- Both entries use `handleOpenWindow` to open in a draggable window
  (matching the AI Chat pattern). Routes `/agents` and `/marketplace` are
  registered in `router.tsx` (lines 162-171, 218-224 — already shipped by
  P85-UI / P86).
- Window switching: `modules/window/window-content.tsx` does NOT currently
  handle these app IDs. We add minimal cases that lazy-import the same
  route components used by `router.tsx` so the window content renders
  correctly.

### 6. v33-DRAFT.md stub
- Create `.planning/v33-DRAFT.md` with a single section: TBD milestone
  goal + scheduled cleanup phase note for `useAgentSocket` removal (zero
  callers post-cutover — only legacy chat consumed it). Brief stub only.

---

## Hard Constraints

| Constraint | Approach |
|---|---|
| ZERO changes to `liv/packages/core/` | Sacred SHA verify before AND after |
| ZERO changes to v32 component internals (P81/P82/P83/P84/P85-UI/P86/P88/P89 lanes) | EXCEPT the 3 P89 deferred wire-ups (ThemeToggle mount, liv-composer-focus listener, liv-last-assistant write) — all explicitly assigned to P90 by P89-SUMMARY's "P90 Wire-Up Checklist" |
| Sacred SHA pre/post: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` runs at start (PASS) and again before commit |
| D-CUTOVER-CLEAN: NO half-deleted state | Delete `mcp-panel.tsx` + `index-v19.tsx` together (only path that keeps build green); legacy `routes/ai-chat/index.tsx` kept as-is for v33 holistic cleanup |
| D-NO-PROD-DEPLOY | Push to GitHub via orchestrator batch; do NOT touch Mini PC. User deploys per project memory hard rule (deploy ben yaparım) |

---

## Verification Gates

1. `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → exact match
   to `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (BEFORE and AFTER all edits).
2. `pnpm --filter ui build` exits 0.
3. `cd livos/packages/livinityd && npx tsc --noEmit` — zero NEW errors in
   modified files (pre-existing baseline noise unchanged).
4. `grep -rln "mcp-panel" livos/packages/ui/src/` returns nothing (or only
   `routes/ai-chat/index.tsx` deprecation comments — those are harmless
   text-only).
5. `grep -rln "index-v19" livos/packages/ui/src/` returns nothing.

---

## Out of Scope (deferred to v33)

- Removing `useAgentSocket` and the 5 legacy callers
  (`agent-status-overlay.tsx`, `agents-panel.tsx`, `chat-messages.tsx`,
  `components/liv-agent-status.tsx`, `routes/ai-chat/index.tsx`).
- Deleting the entire `routes/ai-chat/` legacy tree (everything except
  `routes/ai-chat/v32/`). v33 owns this — it's a much bigger sweep than P90.
- Polishing dock icons (we use placeholder existing assets for the new
  Agents + Marketplace entries; v33 can ship dedicated SVGs).
- Settings panel for the `liv:config:new_chat_enabled` flag — flag is no
  longer needed (route swap chosen instead). Flag is dropped from the plan.

---

## Decisions Realized

- **D-90-01** — Route swap over Redis flag (single-file change at the window
  content lazy-import; aligns with AI-pages-are-window-only architecture).
- **D-90-02** — `/ai-chat-v2` URL kept as a permanent alias (zero churn for
  in-flight dev bookmarks; both URLs render v32).
- **D-90-03** — Delete `mcp-panel.tsx` + `index-v19.tsx` together (D-CUTOVER-
  CLEAN; otherwise `index-v19.tsx`'s lazy import would break the build).
- **D-90-04** — Legacy `routes/ai-chat/index.tsx` and `useAgentSocket` family
  kept on disk for emergency rollback; v33 owns full deletion.
- **D-90-05** — Dock entries use placeholder image assets (existing
  `dock-server.svg` for Agents, `dock-app-store.png` for Marketplace).
  Polish in v33.
- **D-90-06** — `window-content.tsx` learns 2 new appIds (`LIVINITY_agents`,
  `LIVINITY_marketplace`) so the dock entries actually render in a window.
