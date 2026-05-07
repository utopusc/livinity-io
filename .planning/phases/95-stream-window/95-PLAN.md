# Phase 95 — WebApp Stream Window + AI Panel + Mode Selector — PLAN

**Phase:** 95-stream-window
**Wave:** 3 (sequential after P93 + P94)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.
**Tasks:** 95-01 → 95-08 (8 atomic plans). Heaviest single phase in v33; tasks chained sequentially because almost every task depends on the previous file landing.

This file complements `95-CONTEXT.md`. Read CONTEXT first; this PLAN assumes its decisions (D-95-01..D-95-15) and file list (§ 6) as given.

---

## Task index

| # | Task | Effort | Depends on | New files | Modified files |
|---|---|---|---|---|---|
| 95-01 | Spike: VNC client + dep audit + P93/P94 contract verify | 0.5d | — | — | — |
| 95-02 | Window-content registry + `webapp-stream` discriminator | 0.5d | 95-01 | — | window-content.tsx |
| 95-03 | Add deps + shadcn `resizable.tsx` + visual smoke | 0.5d | 95-01 | resizable.tsx | package.json, lockfile |
| 95-04 | `use-webapp-vnc.ts` hook + tests | 1.0d | 95-01, 95-03 | use-webapp-vnc.ts (+ test) | — |
| 95-05 | Drizzle migration + `webapp_agent_sessions` schema + sub-router | 0.75d | 95-01 | migration sql, schema ts, router section | webapps-router.ts |
| 95-06 | `use-webapp-agent.ts` hook | 0.75d | 95-05 | use-webapp-agent.ts | — |
| 95-07 | Toolbar + mode selector + WebAppAgentPanel | 1.0d | 95-04, 95-06 | webapp-toolbar.tsx, webapp-mode-selector.tsx | — |
| 95-08 | `webapp-stream-window.tsx` integration + unit test + persistence + UAT note | 1.0d | 95-02..95-07 | webapp-stream-window.tsx (+ test) | window-content.tsx (final wire) |

Total: ~5 days end-to-end. Wave 3 is sequential.

---

## 95-01 — Spike: VNC + deps + upstream dependency verify

**Effort:** ~4h
**Goal:** Pre-flight kill-the-unknowns. Land zero code from this task — only NOTES and a go/no-go.

### Steps

1. Verify sacred SHA (`f3538e1d…`). If mismatch, abort phase.
2. Verify `livos/packages/livinityd/source/modules/server/trpc/webapps-router.ts` exists with `webapps.spawn / focus / close / list` (P93 deliverable). If missing → escalate; phase blocks until P93 lands.
3. Verify `webapps` Postgres table exists (P94 migration). If missing → escalate.
4. Verify `livos/packages/ui/src/lib/use-liv-agent-stream.ts` exists with `useLivAgentStream` hook export. **Currently only the test file is in tree**; the source file may have been reverted with the May-4 v32 cleanup. If missing, restore from P67-04 plan or escalate to milestone owner. (CONTEXT carryover C-95-02.)
5. Verify the legacy chat surface still exists at `livos/packages/ui/src/routes/ai-chat/{chat-input,chat-messages,streaming-message}.tsx` (CONTEXT C-95-01) — these are imported by 95-07.
6. Quick spike: run `npm view @novnc/novnc dist-tags` and `npm view react-resizable-panels dist-tags` to confirm both are publishable + check for last-publish age (sanity, not blocking).
7. Read the noVNC `RFB` constructor surface from `node_modules/@novnc/novnc/lib/rfb.js` (post-install in 95-03) OR from upstream README at this stage — confirm `scaleViewport`, `resizeSession`, `clipViewport` properties are settable on the instance. Note constructor signature for 95-04.
8. Write a short notes section into `95-CONTEXT.md` § 5 if any decision shifts (e.g., if `@novnc/novnc` isn't on npm any more under that name, fall back to G-1 (b)).

### Deliverables

- Inline verification log appended to `95-CONTEXT.md` § 5 if anything changed (else: nothing).
- Zero code changes. Zero commits.

### Verification

- All five P93/P94/hook/legacy-chat presence checks return `present`. Otherwise escalate.

---

## 95-02 — Window-content registry: `webapp-stream` discriminator

**Effort:** ~2h
**Goal:** Make the window manager render `<WebAppStreamWindow>` for webapp-kind windows. The actual component arrives in 95-08; this task introduces the routing slot only (returns a "Loading…" placeholder until 95-08 fills it in via lazy import).

### Steps

1. Open `livos/packages/ui/src/modules/window/window-content.tsx`. Inspect existing `appId` switch and `fullHeightApps` set.
2. Choose discriminator strategy. Per P93/P94: WebApps use a different `appId` namespace. Recommend matching by prefix `WEBAPP_<webappId>` (so the existing `appId: string` parameter still carries the webappId in-band; no new props on `WindowContent`).
3. Add lazy import: `const WebAppStreamWindowContent = React.lazy(() => import('./app-contents/webapp-stream-window'))`.
4. Add `appId.startsWith('WEBAPP_')` case to `WindowAppContent`. Pass `webappId={appId.slice('WEBAPP_'.length)}` to the component.
5. Add the wildcard pattern (or every actual webappId — the desktop launcher knows them) to the `fullHeightApps` set so the wrapper does not pad/scroll. Cleanest: add a derived `isWebAppKind(appId)` helper, use it on both sides.
6. Smoke: `pnpm --filter ui build` — must compile (the lazy import target won't exist yet, but TS/Vite tolerates missing file as a runtime concern in lazy chunks; confirm). If Vite errors at import-resolution time, gate behind a tiny placeholder file at the target path that 95-08 will overwrite.

### Deliverables

- `livos/packages/ui/src/modules/window/window-content.tsx` modified with the new case + lazy import + helper.
- (Possibly) a single-line placeholder `webapp-stream-window.tsx` exporting an empty component to keep the build green; 95-08 overwrites.

### Verification

- `pnpm --filter ui build` exits 0.
- Sacred SHA unchanged.

### Commit

`feat(95-02): wire 'WEBAPP_*' window discriminator into WindowContent registry`

---

## 95-03 — Add deps + shadcn `resizable.tsx` + visual smoke

**Effort:** ~3h
**Goal:** Land the two new dependencies and the shadcn copy-paste so subsequent tasks can `import {ResizablePanelGroup} from '@/shadcn-components/ui/resizable'`.

### Steps

1. `cd livos && pnpm --filter @livos/ui add @novnc/novnc react-resizable-panels`. Capture exact versions in 95-SUMMARY (later).
2. Confirm the lockfile diff includes only the two new deps (and their fresh transitives). No accidental updates of unrelated packages.
3. Create `livos/packages/ui/src/shadcn-components/ui/resizable.tsx` from the canonical shadcn template (https://ui.shadcn.com/docs/components/resizable). Three exports: `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`. Uses `cn` from local utils (must already exist).
4. Quick storybook-equivalent: spin up a temporary playground route `playground/95-resizable.tsx` (DELETE before commit) with a `<ResizablePanelGroup direction="vertical">` and two stub panels. Verify drag works, keyboard arrows work, focus ring renders without clashing with Liv tokens (CONTEXT C-95-06).
5. `pnpm --filter ui build` green.
6. `pnpm --filter ui test` green (no test changes yet, just regression check).
7. Sacred SHA still matches.

### Deliverables

- `livos/packages/ui/src/shadcn-components/ui/resizable.tsx` (new)
- `livos/packages/ui/package.json` + lockfile updated with `@novnc/novnc` and `react-resizable-panels`

### Verification

- `pnpm ls @novnc/novnc react-resizable-panels` lists both.
- UI build green; tests still green.
- Visual smoke: drag handle works; panel sizes respond.

### Commit

`feat(95-03): add @novnc/novnc + react-resizable-panels + shadcn resizable.tsx`

---

## 95-04 — `use-webapp-vnc.ts` hook + tests

**Effort:** ~6h
**Goal:** A React hook that opens a noVNC connection to a websockify URL and exposes a stable mountpoint + lifecycle.

### Hook contract

Inputs:
- `wsUrl: string | undefined` — the websockify URL from `webapps.spawn`. Hook is no-op when undefined.
- `options?: {credentials?: {password?: string}; viewOnly?: boolean}` — both default false/undefined.

Outputs:
- `containerRef: React.RefObject<HTMLDivElement>` — the consumer mounts this on the wrapper div; the hook attaches the noVNC canvas inside it.
- `status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'`
- `errorMessage: string | null`
- `reconnect: () => void` — closes any existing RFB and re-opens; resets backoff.
- `sendKey: (keysym: number, code: string, down?: boolean) => void` — wraps `rfb.sendKey` for toolbar back/forward/refresh.
- `requestFullscreen: () => Promise<void>` — calls `containerRef.current.requestFullscreen()` (toolbar fullscreen-on-host per D-95-05).

Internals:
- Constructs `new RFB(containerRef.current, wsUrl, {credentials})` on mount/wsUrl-change.
- Sets `rfb.scaleViewport = true` (D-95-02). Does NOT set `resizeSession`.
- Sets `rfb.clipViewport = false` (full-fit scaling instead of scrollbars).
- Listens to `connect`, `disconnect`, `securityfailure`, `clipboard` events; updates status.
- ResizeObserver on container element → on each resize, force a re-flow by setting `containerRef.current.style.width` (canvas listens via MutationObserver internally; verified in 95-01 spike).
- Cleanup on unmount: `rfb.disconnect()`, disconnect ResizeObserver.
- Reconnect backoff: 1s, 2s, 4s, 8s, capped 8s; resets on successful `connect`.

### Test plan (unit, no msw — D-NO-NEW-TEST-DEPS posture per `use-liv-agent-stream.unit.test.tsx`)

1. **Mock RFB**: vi.mock `'@novnc/novnc/lib/rfb'` → returns a class with `disconnect`, `addEventListener`, `sendKey`, settable `scaleViewport`/`clipViewport` properties, and an `_emit(name, evt)` test helper.
2. ULA-95-04-1: hook with `wsUrl=undefined` → status stays `idle`, no RFB constructed.
3. ULA-95-04-2: hook with `wsUrl='ws://x/y'` → status becomes `connecting`, then `connected` after `_emit('connect')`.
4. ULA-95-04-3: `_emit('disconnect', {clean: false})` → status `disconnected`, schedule reconnect timer (advance with `vi.useFakeTimers`), assert new RFB is constructed.
5. ULA-95-04-4: `reconnect()` called manually → existing RFB `disconnect()` called, new one constructed immediately (no backoff).
6. ULA-95-04-5: `sendKey(0xFF51, 'ArrowLeft', true)` → underlying `rfb.sendKey` called with same args.
7. ULA-95-04-6: unmount → `rfb.disconnect()` called; ResizeObserver disconnected.
8. ULA-95-04-7: ResizeObserver fires → status unchanged; the hook does NOT thrash (assert single style write per resize event).
9. Source-text invariants: hook string includes `scaleViewport = true` literal and does NOT include `resizeSession = true`.

### Deliverables

- `livos/packages/ui/src/hooks/use-webapp-vnc.ts` (new)
- `livos/packages/ui/src/hooks/use-webapp-vnc.unit.test.tsx` (new)

### Verification

- `pnpm --filter ui test use-webapp-vnc` — all 9 cases green.
- TypeScript strict — no `any` leaks; the `RFB` import has typings or uses an explicit interface stub locally.

### Commit

`feat(95-04): use-webapp-vnc hook (noVNC wrapper) + unit tests`

---

## 95-05 — Drizzle migration + schema + `webapps.agent.session.*` sub-router

**Effort:** ~5h
**Goal:** Persist per-WebApp agent session keying so reopening a WebApp resumes the same Liv conversation.

### Schema (`webapp-agent-sessions.ts`)

Drizzle table mirror of CONTEXT § 4:

- `id` UUID PK default `gen_random_uuid()`
- `userId` UUID NOT NULL → users(id) ON DELETE CASCADE
- `webappId` UUID NOT NULL → webapps(id) ON DELETE CASCADE
- `runId` TEXT (nullable)
- `createdAt` TIMESTAMPTZ DEFAULT now()
- `lastActiveAt` TIMESTAMPTZ DEFAULT now()
- `lastSeenIdx` INTEGER DEFAULT -1

Unique index `idx_webapp_agent_sessions_user_webapp` on (`userId`, `webappId`).

### Migration

- New file `<NN>_webapp_agent_sessions.sql` where `<NN>` is the next number in livinityd's migrations dir (verify in 95-01).
- `CREATE TABLE` + `CREATE UNIQUE INDEX`. No data backfill; existing webapps get rows lazily on first WebApp window open.

### Router additions (in existing `webapps-router.ts` from P93)

Add a sub-router `agent`:
- `webapps.agent.session.get({webappId})` → row or null. Authorizes via `ctx.currentUser`.
- `webapps.agent.session.upsert({webappId, runId?, lastSeenIdx?})` → inserts row if absent (using `ON CONFLICT (user_id, webapp_id) DO UPDATE SET run_id = EXCLUDED.run_id, last_seen_idx = EXCLUDED.last_seen_idx, last_active_at = now()`). Returns updated row.

Ownership check: the row's `userId` MUST match `ctx.currentUser.id`. If `webapps.list` already filters by user-shared access, mirror that here (cross-reference P94).

### Tests (livinityd vitest)

1. Insert: missing → upsert with runId='r-abc' → row created with correct userId.
2. Update: upsert again with runId='r-def' lastSeenIdx=42 → row updated, lastActiveAt bumped.
3. Auth: different userId tries to get → returns null (or 403 — match P93 convention).
4. Cascade: delete the webapps row → session row goes too.

### Deliverables

- `livos/packages/livinityd/source/modules/database/schema/webapp-agent-sessions.ts`
- `livos/packages/livinityd/source/modules/database/migrations/<NN>_webapp_agent_sessions.sql`
- Section added to `webapps-router.ts` (existing file, not new)
- Test file (vitest) — existing pattern in `livinityd/test/`

### Verification

- `npm run db:migrate` exit 0; psql `\dt` shows table; `\d webapp_agent_sessions` shows columns + unique index.
- `npm test` green; new tests pass.
- TypeScript build green.

### Commit

`feat(95-05): webapp_agent_sessions Drizzle table + migration + tRPC sub-router`

---

## 95-06 — `use-webapp-agent.ts` hook

**Effort:** ~5h
**Goal:** Wrap `useLivAgentStream` with per-WebApp session keying. Surface a clean API to the agent panel (95-07).

### Hook contract

Inputs:
- `webappId: string`

Outputs:
- All `useLivAgentStream` outputs (`messages`, `snapshots`, `status`, `runId`, `currentStatus`, `sendMessage`, `stop`)
- `sessionStatus: 'loading' | 'ready' | 'no-session' | 'session-ended'`
- `startNewSession: () => void` — clears local state, drops runId, next `sendMessage` creates a new run.

Internals:
1. On mount: `webapps.agent.session.get.useQuery({webappId})` to read existing row.
2. If row has `runId`: pass `{conversationId: row.runId, after: row.lastSeenIdx}` to `useLivAgentStream`.
3. If no row OR `runId` is null: pass `{conversationId: 'webapp:' + webappId + ':' + uuid()}` (fresh — D-95-08 says runId == conversationId; first message creates the run).
4. After each `sendMessage` resolves with a runId (the hook surfaces it as `runId`): call `webapps.agent.session.upsert.mutate({webappId, runId})` to persist.
5. On each chunk processed (lastSeenIdx tick): debounced upsert (500ms) of `lastSeenIdx`. Avoids hammering Postgres.
6. Detect "session ended": if hook's `status === 'error'` AND error indicates run not found, set `sessionStatus = 'session-ended'`. UI surfaces a "Start new session" CTA.
7. `startNewSession()`: invalidates the session.get query, generates a new conversationId, re-mounts the inner hook (key-on-conversationId trick).

### Tests

Lighter than 95-04 — mock `useLivAgentStream` and the tRPC hooks. Key cases:
1. First open (no row) → session.get returns null → status='ready' → sendMessage('hi') → session.upsert called with the new runId.
2. Reopen (row with runId='r-1', lastSeenIdx=10) → useLivAgentStream called with `{conversationId: 'r-1', after: 10}`.
3. Stream error "run not found" → sessionStatus becomes 'session-ended'.
4. startNewSession → next render uses fresh conversationId.

### Deliverables

- `livos/packages/ui/src/hooks/use-webapp-agent.ts` (new)
- `livos/packages/ui/src/hooks/use-webapp-agent.unit.test.tsx` (new)

### Verification

- Tests green; type-check clean; UI build green.

### Commit

`feat(95-06): use-webapp-agent hook (session-keyed Liv agent stream)`

---

## 95-07 — Toolbar + mode selector + WebAppAgentPanel composition

**Effort:** ~7h
**Goal:** Build the three sub-components that the root window will compose: toolbar (top), agent panel (bottom), mode selector (inside the panel header).

### 95-07.A — `webapp-toolbar.tsx`

Props:
- `url: string` (from `webapps.list` row — D-95-15)
- `onBack: () => void` / `onForward: () => void` / `onRefresh: () => void` — wired to `use-webapp-vnc`'s `sendKey` from the parent
- `onCopyUrl: () => void`
- `onFullscreen: () => void` — calls hook's `requestFullscreen`
- `onPopout?: () => void` — UNDEFINED in P95 → button is rendered disabled with tooltip "Coming soon"

Layout: 36px row, flex, gap-1. Use existing Liv design tokens. Icons from `lucide-react` (already a dep — verify in 95-01).

Key chord mapping for the buttons (used by parent):
- Back → `Alt+Left` → noVNC `sendKey(0xFF51, 'ArrowLeft')` while Alt is held (per D-95-14, parent simulates `keyDown(Alt)` → `sendKey(arrow)` → `keyUp(Alt)` sequence)
- Forward → `Alt+Right`
- Refresh → `F5` keysym 0xFFC2

### 95-07.B — `webapp-mode-selector.tsx`

Props:
- `mode: 'watch' | 'teach' | 'auto' | 'chat'`
- `onModeChange: (m) => void`

Layout: pill of 4 segmented buttons. Active highlight. Emoji prefix per DRAFT (`⏺ 🎙 🤖 💬`). Keyboard: arrow-left/right cycles modes when focused.

When mode changes, the selector ALSO dispatches `window.dispatchEvent(new CustomEvent('liv-webapp-mode-change', {detail: {webappId, mode}}))`. The webappId is supplied via prop.

### 95-07.C — `WebAppAgentPanel` (lives inside `webapp-stream-window.tsx` as a local component, NOT a new file — keeps file count manageable)

Header row (28px): mode selector left, agent name right (read from `webapps.list` row's optional `defaultAgentId` if present, else "Liv Default" — light wiring; full agent selector parity is post-v33).

Body: reuse `chat-messages` (or its closest legacy equivalent) bound to `useWebAppAgent(webappId)` outputs. Reuse `chat-input` (legacy `routes/ai-chat/chat-input.tsx`) for composer.

Mode behavior in P95:
- `watch` — composer disabled (placeholder "Watch mode — recording disabled in P95"). Will be P96's surface.
- `teach` — composer disabled with placeholder "Teach mode arrives in P96". Selector shows red pulsing dot (visual only; no recording).
- `auto` — composer disabled with placeholder "Auto mode arrives in P97".
- `chat` — composer enabled, sendMessage wired.

NOTE: This is the "mode is local state" rule (D-95-MODE-LOCAL). The visual differentiation is intentional so users know what each mode WILL do.

### Tests

- Toolbar: copy-URL clicks → onCopyUrl called; popout button has aria-disabled.
- Mode selector: setting mode dispatches CustomEvent (assert on a captured event listener).
- Agent panel: chat composer disabled when mode != 'chat'; enabled when mode == 'chat'.

### Deliverables

- `livos/packages/ui/src/modules/window/webapp-toolbar.tsx`
- `livos/packages/ui/src/modules/window/webapp-mode-selector.tsx`
- (no new file for WebAppAgentPanel — lives in 95-08's window file)

### Verification

- Tests green; UI build green; visual quick check via the playground route from 95-03 (delete after).

### Commit

`feat(95-07): webapp-toolbar + webapp-mode-selector components`

---

## 95-08 — `webapp-stream-window.tsx` integration + persistence + final wire

**Effort:** ~7h
**Goal:** Compose all the pieces. This is the file the window manager mounts.

### Component contract

Props:
- `webappId: string`

Behaviour:
1. On mount: `webapps.spawn.useMutation()` fired with `{webappId}`. Store `wsUrl`, `windowId`, `port` in local state.
2. Spawn failure → render an error banner in place of the VNC pane with a "Retry" button (D-95-12). Agent panel stays functional below.
3. On unmount: `webapps.close.mutate({webappId})` fire-and-forget. (D-95-CLEANUP.)
4. `use-webapp-vnc(wsUrl)` for the top pane.
5. `use-webapp-agent(webappId)` for the bottom pane.
6. Mode is `useState<'watch'|'teach'|'auto'|'chat'>('chat')` (D-95-10).
7. Resizable split: `<ResizablePanelGroup direction="vertical" autoSaveId={'liv:webapp-stream:split:' + webappId}>` — `react-resizable-panels` natively persists to localStorage when `autoSaveId` is set; verify the key shape matches D-95-04. If the lib's autosave key doesn't match D-95-04, fall back to: `onLayout={(sizes) => localStorage.setItem('liv:webapp-stream:split:' + webappId, JSON.stringify(sizes))}` plus initial-size read on mount.
8. Top panel: `<WebAppToolbar>` + `<div ref={vnc.containerRef} className="…h-full w-full bg-black"/>` + spawn-error banner (conditional).
9. Bottom panel: `<WebAppAgentPanel>` (local component) — header (mode selector + agent name) + chat-messages + chat-input.
10. Toolbar wire: `onBack` → `vnc.sendKey(Alt-down) ; sendKey(ArrowLeft) ; sendKey(Alt-up)`; analogous for forward/refresh.
11. Copy-URL: `navigator.clipboard.writeText(webapp.url)` + small toast (use existing toast surface — verify which lib in 95-01).
12. Fullscreen: `vnc.requestFullscreen()`.

### File-level guardrails

- File is < 400 lines (split out `WebAppAgentPanel` to a sub-module if it grows past this).
- All side-effecty logic in hooks; component body is mostly composition.
- No `any`. Strict typing on all event handlers.

### Persistence cross-check

After the visual smoke (manual step), open DevTools and inspect localStorage. Confirm key `liv:webapp-stream:split:<webappId>` (or whatever `autoSaveId` resolves to per react-resizable-panels' shape — document the actual key format in 95-SUMMARY).

If the actual key shape differs from D-95-04, decide:
- (a) accept the lib's default key shape and update D-95-04 — reasonable if the lib already includes the autoSaveId verbatim.
- (b) override with explicit `onLayout` (above), keep D-95-04 verbatim.

### Tests (`webapp-stream-window.unit.test.tsx`)

Mocks needed: `webapps.spawn` mutation, `webapps.close` mutation, `use-webapp-vnc`, `use-webapp-agent`, `react-resizable-panels`.

1. Mount → spawn.mutate called with `{webappId}`; wsUrl stored after success.
2. Spawn fails → error banner present; retry button calls spawn.mutate again.
3. Unmount → close.mutate called with `{webappId}`.
4. Mode state: default 'chat'; toolbar's onModeChange wired through.
5. Toolbar back-button → vnc.sendKey called 4 times (alt-down, arrow, arrow-up, alt-up — verify exact sequence).
6. Copy-URL → clipboard.writeText called with the webapp.url.
7. Fullscreen → vnc.requestFullscreen called.
8. Persistence: render with localStorage `liv:webapp-stream:split:abc-123` set to `[40, 60]` → `<ResizablePanel>` initial size matches (or `defaultSize={40}` is passed). Out-of-range value `[5, 95]` (panel < 20 min) → falls back to 70/30.
9. Source-text invariants: file imports `webapps.spawn`, `webapps.close`, `useWebAppVnc`, `useWebAppAgent`, `ResizablePanelGroup`.

### Final touches

1. Update `window-content.tsx` to remove any placeholder added in 95-02 — the real component now exists.
2. Add `appId.startsWith('WEBAPP_')` to `fullHeightApps` (or its derived helper) if not done in 95-02.
3. Append a UAT note section to `91-uat-polish/UAT-CHECKLIST.md` (or create `.planning/phases/95-stream-window/UAT-CHECKLIST.md` if 91's is locked) — sections K (WebApp window open) / L (toolbar functions) / M (mode selector visual) / N (split persistence). PASS/FAIL/NOTES per row.
4. Sacred SHA verify (`git hash-object`).
5. Write `95-SUMMARY.md` capturing dep versions, persistence-key resolved shape, any in-flight gray-area updates.

### Deliverables

- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` (new — replaces placeholder if any)
- `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` (new)
- `.planning/phases/95-stream-window/UAT-CHECKLIST.md` (new) — sections K-N
- `.planning/phases/95-stream-window/95-SUMMARY.md` (new)

### Verification

- All tests green: `pnpm --filter ui test` AND `cd livos/packages/livinityd && npm test`.
- UI build green; livinityd build green.
- Sacred SHA unchanged (`f3538e1d811992b782a9bb057d1b7f0a0189f95f`).
- Manual: open a WebApp window (after P93+P94 are deployed) → stream renders, chat panel functional in `chat` mode, mode selector pills cycle, split is draggable + persisted across reload.

### Commit

`feat(95-08): WebAppStreamWindow integration — VNC pane + AI panel + mode selector + split persistence`

---

## Cross-task verification (run at end of phase)

| Gate | Method |
|---|---|
| Sacred SHA still matches | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| All new files present | `ls` against CONTEXT § 6 file list |
| Build matrix green | `pnpm --filter ui build`, `cd livos/packages/livinityd && npm run build` |
| Test matrix green | `pnpm --filter ui test`, `cd livos/packages/livinityd && npm test` |
| Migration runs | `npm run db:migrate` against scratch PG; `\d webapp_agent_sessions` shows expected schema |
| TODO/FIXME sweep | Grep new files for `TODO`/`FIXME`/`XXX`/`@ts-expect-error` — only the popout-stub comment is acceptable |
| Lockfile minimal | Lockfile diff only adds `@novnc/novnc`, `react-resizable-panels`, and their fresh transitives |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `use-liv-agent-stream.ts` source missing in tree (C-95-02) | Spike 95-01 detects + escalates before any code ships |
| react-resizable-panels' autoSaveId key shape ≠ D-95-04 | 95-08 has fallback path to explicit `onLayout`; D-95-04 updated in SUMMARY |
| `@novnc/novnc` types missing (often a `.d.ts`-light package) | Local interface stub in `use-webapp-vnc.ts` for the RFB surface used; small + scoped |
| `scaleViewport` flicker on rapid resize | ResizeObserver writes are idempotent; debounce by `requestAnimationFrame` if observed |
| Spawn mutation slow → blank pane | Skeleton with subtle pulse during mount; spawn typically < 1s per P93 |
| Mode-change CustomEvent collides with another listener | Namespaced event name `liv-webapp-mode-change` + detail.webappId scope |
| Phase exceeds 5 days due to noVNC integration friction | Cut scope to "static iframe placeholder + back/forward stubs" only if 95-04 hits day-3 wall — escalate to milestone owner |

---

## Out of scope (reaffirmed)

- Recording (P96), agent-driven control (P97)
- Popout window mode (D-95-06 stub)
- xdotool host fullscreen (D-95-05)
- Live tab URL via DevTools protocol
- Cross-WebApp memory/sharing
- Mobile responsive layouts
- ANY change to `liv/packages/core/**` (D-95-NO-CORE / sacred SHA)
