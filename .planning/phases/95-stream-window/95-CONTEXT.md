# Phase 95 — WebApp Stream Window + AI Panel + Mode Selector — CONTEXT

**Milestone:** v33.0 — WebApps + Teach/Auto Modes
**Wave:** 3 (sequential after P93 window manager + P94 launcher)
**Effort:** M, 3-5 days (heaviest single-phase deliverable in v33)
**Status:** Plan-ready
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — MUST be unchanged BEFORE and AFTER this phase.

---

## 1. Mission

When a user clicks a WebApp icon on the desktop, a LivOS window opens whose content is a **two-pane vertical split**:

- **Top (~70%)** — live VNC stream of the host Chrome window dedicated to that WebApp (the websockify URL produced by P93's `webapps.spawn` tRPC).
- **Bottom (~30%)** — AI panel (chat surface ported from the existing `routes/ai-chat/` v32-style components) with a four-mode selector pill: `Watch ⏺ / Teach 🎙 / Auto 🤖 / Chat 💬`.

A toolbar above the stream gives back/forward/refresh/copy-URL/fullscreen-on-host/popout. The split position is user-resizable and persisted to `localStorage`. Each WebApp gets its own per-session agent run (row in `webapp_agent_sessions`) keyed on `(userId, webappId)`. Mode is local panel state in this phase; P96 (Teach) and P97 (Auto) consume it.

Phase 95 produces the surface; Phase 96 records actions on top of it; Phase 97 lets the agent drive Chrome end-to-end. P95 itself only needs `mode` to round-trip into the chat panel state — no recording, no replay, no agent control of the stream.

---

## 2. Source documents read

- `.planning/v33-DRAFT.md` § 5, lines 136-160 — Phase 95 scope source of truth (the file says **this** wins if anything below conflicts).
- `.planning/v33-DRAFT.md` § 5, lines 99-119 — Phase 93 window manager + tRPC contract `webapps.spawn / focus / close / list` (consumer of these is THIS phase).
- `.planning/v33-DRAFT.md` § 5, lines 123-132 — Phase 94 desktop launcher + persistence (this phase's window opens from those icons).
- `.planning/v33-DRAFT.md` § 5, lines 162-184 — Phase 96 Teach scope (informs mode selector contract — Phase 96 hooks `mode === 'teach'` into `use-teach-recorder.ts`).
- `.planning/v33-DRAFT.md` § 5, lines 187-…  — Phase 97 Auto scope (informs `mode === 'auto'` contract — Phase 97 listens for `mode === 'auto'` and starts the bytebot loop).
- `.planning/phases/88-ws-to-sse-migration/88-CONTEXT.md` — wiring pattern for `useLivAgentStream` + `status_detail` chunk consumption + ToolCallPanel auto-open. Authoritative reference for how a chat panel binds to `LivAgentRunner` SSE.
- `.planning/phases/91-uat-polish/91-CONTEXT.md` — sacred-SHA gate phrasing + UAT-CHECKLIST format reused here.
- `livos/packages/ui/src/modules/window/window-content.tsx` — registry switch for window content types; this phase appends a `webapp-stream` case.
- `livos/packages/ui/src/modules/window/app-contents/*` — peer content components; pattern for default lazy import + `appId` switch follows these.
- `livos/packages/ui/src/lib/liv-agent-types.ts` — UI mirror of Liv chunk types; the per-WebApp agent hook reuses these shapes.
- `livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx` — test file documents the contract of the hook (the file `use-liv-agent-stream.ts` itself was reverted on May 4 commit `34ced410`; see Gray Area G-7).
- `liv/packages/core/src/liv-agent-runner.ts` — backend SSE producer, sacred surface NOT for `sdk-agent-runner.ts` but still in the lane the chat hook talks to. **No changes** by this phase.
- Existing chat surface `livos/packages/ui/src/routes/ai-chat/` — index.tsx, chat-input.tsx, chat-messages.tsx, streaming-message.tsx — restored pre-May-4 baseline. The mini AI panel in this phase ports/reuses this surface (NOT the v32 surface, which was reverted).

---

## 3. Hard constraints

- **D-95-NO-SACRED**: ZERO bytes changed in `liv/packages/core/src/sdk-agent-runner.ts`. SHA `f3538e1d…` verified at start AND at commit time.
- **D-95-NO-CORE**: Phase 95 does not modify `liv/packages/core/**` at all. Per-WebApp agent session reuses existing `LivAgentRunner` SSE; no new chunk types, no new control signals, no provider changes.
- **D-95-NO-LIVINITYD-AGENT-CHANGES**: livinityd's `webapps` tRPC router (created in P93) is the only server lane this phase touches, and only to add `webapps.agent.session.{get,upsert}` endpoints + a Drizzle migration for `webapp_agent_sessions`. The `agents.*` and `webapps.spawn/focus/close/list` routers are NOT modified.
- **D-95-MODE-LOCAL**: `mode` is local state in this phase. NO Postgres column for it. P96/P97 each carry their own state when they consume it. The mode selector dispatches a CustomEvent (`liv-webapp-mode-change`) and that's it.
- **D-95-NO-NEW-DEPS unless mandatory for VNC**: New deps allowed if and only if `react-vnc` or `@novnc/novnc` is selected (Gray Area G-1). `react-resizable-panels` (the lib that backs shadcn Resizable) is also new and required (Gray Area G-3).
- **D-95-AUTORESIZE**: VNC client must autoresize on LivOS-window resize (parent ResizeObserver → VNC `scaleViewport / resizeSession`). No manual zoom controls.
- **D-95-PERSIST**: Resizable split percentage persisted to `localStorage` under key `liv:webapp-stream:split:<webappId>`. Falls back to 70/30 if absent or out of `[20, 90]` range.
- **D-95-CLEANUP**: On window close, the component fires `webapps.close({webappId})` exactly once. Fire-and-forget; failure logged not blocking. P93's window manager owns idle cleanup as a backstop.
- **D-95-LANE-DISCIPLINE**: P95 owns six new files + one Drizzle migration. The shared chat composer/messages components (chat-input.tsx, chat-messages.tsx, streaming-message.tsx) are imported but NOT modified — the AI panel reuses them at smaller scale.

---

## 4. Architecture overview

```
                Window manager (P93 surface)
                          │
                          ▼
       webapp-stream-window.tsx  (CREATE — root)
       ┌──────────────────────────────────────┐
       │  WebAppToolbar                        │  <- 36px row
       │  [←][→][↻] copy-URL ⛶ popout          │
       ├──────────────────────────────────────┤
       │                                       │
       │  <ResizablePanelGroup direction=v>    │
       │    <Panel size=70 min=20 max=90>      │
       │      <VncViewer wsUrl=…/>             │
       │      (use-webapp-vnc.ts)              │
       │    </Panel>                           │
       │    <ResizableHandle/>                 │
       │    <Panel size=30>                    │
       │      <WebAppAgentPanel                │
       │        webappId mode setMode/>        │
       │      (use-webapp-agent.ts)            │
       │    </Panel>                           │
       │  </ResizablePanelGroup>               │
       │                                       │
       └──────────────────────────────────────┘
            ▲                       ▲
            │ scaleViewport         │ POST /api/agent/start (LivAgentRunner)
            │ on parent resize      │ SSE → tool snapshots → reuse v32 panel
```

### Data flow

1. Window manager mounts `<WebAppStreamWindow webappId={…}>`.
2. On mount: `useEffect` calls `webapps.spawn.mutate({webappId})` → `{wsUrl, windowId, port}`.
3. `use-webapp-vnc(wsUrl)` opens VNC connection. Top panel renders `<canvas>` from VNC client.
4. `use-webapp-agent(webappId, userId)` calls `webapps.agent.session.get` to fetch existing `runId` (if any) and resumes via `useLivAgentStream({conversationId: runId, after: lastSeenIdx})`. If no row, creates one on first message.
5. Mode selector pill is local React state. Setting it dispatches `window.dispatchEvent(new CustomEvent('liv-webapp-mode-change', {detail: {webappId, mode}}))`. P96/P97 listen.
6. On unmount: `webapps.close.mutate({webappId})`, hook closes VNC, agent session row's `lastActiveAt` updated.

### Postgres schema (new — Drizzle migration)

Table `webapp_agent_sessions`:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | gen_random_uuid() |
| `user_id` | UUID FK → users(id) | cascade on user delete |
| `webapp_id` | UUID FK → webapps(id) | cascade on webapp delete |
| `run_id` | TEXT | `LivAgentRunner` runId; nullable until first message |
| `created_at` | TIMESTAMPTZ default now() | |
| `last_active_at` | TIMESTAMPTZ default now() | bumped on each `sendMessage` |
| `last_seen_idx` | INT default -1 | for SSE reconnect-with-after |

Unique index on `(user_id, webapp_id)`.

---

## 5. Gray areas (decision register)

| ID | Question | Options | Decision (this phase) |
|---|---|---|---|
| **G-1** | VNC client lib choice | (a) `@novnc/novnc` (canonical, vanilla JS, used by Bytebot) — direct WebSocket, manual canvas mount; (b) `react-vnc` (npm `react-vnc`) — React wrapper around noVNC; (c) `@bytebot/desktop-viewer` if exposed | **(a) `@novnc/novnc`** — direct dep on the canonical client. `react-vnc` is a thin wrapper but adds an abstraction we'd have to bypass for autoresize anyway. Bytebot already proves the noVNC handshake works against websockify. We wrap manually inside `use-webapp-vnc.ts`. Confirmed in 95-01 spike. |
| **G-2** | VNC autoresize implementation | (a) `rfb.scaleViewport = true` + ResizeObserver re-set canvas style only; (b) `rfb.resizeSession = true` + send geometry hint to host x11vnc | **(a) `scaleViewport`** for P95. `resizeSession` requires x11vnc to actually resize the underlying X window which is messier and risks breaking screenshots P96/P97 will rely on. Re-evaluate post-P97 if scaling artefacts cause skill-replay drift. |
| **G-3** | Resizable split lib | (a) `react-resizable-panels` (shadcn-aligned — produces `<ResizablePanelGroup>`); (b) hand-roll with mousemove + percentage state | **(a) `react-resizable-panels`** — single new dep. The phase ALSO ships `livos/packages/ui/src/shadcn-components/ui/resizable.tsx` (shadcn copy-paste add — not present today; verified absent). Hand-rolling would re-implement keyboard a11y from scratch. |
| **G-4** | Persistence key shape for split width | (a) `liv:webapp-stream:split:<webappId>` (per-webapp); (b) global `liv:webapp-stream:split` (all webapps share); (c) per-(userId, webappId) | **(a) per-webapp** — different webapps have different ergonomics (a video site wants 90/10, a debugger wants 50/50). userId is implicit in the browser session, no need to scope further. |
| **G-5** | Toolbar fullscreen-on-host semantics | (a) call `xdotool key F11` on host Chrome window via new tRPC; (b) toggle CSS-only "fullscreen of LivOS window inside the desktop"; (c) browser API `requestFullscreen()` on the canvas element | **(c) `requestFullscreen()` on the VNC canvas wrapper** — pure browser API, no tRPC. (a) is a future enhancement (would need server-side support and risks losing the WM hooks P93 set up). |
| **G-6** | Toolbar popout semantics | (a) detach into a top-level browser window using `window.open` + same-component-tree-via-Portal; (b) future stub `disabled aria-label="coming soon"` button | **(b) stubbed disabled button** — full popout requires a chromeless browser tab with its own provider tree which is its own phase. We ship the button placeholder so the toolbar layout doesn't shift later. Marked TODO inline. |
| **G-7** | Chat-panel host: which surface to reuse? | (a) compose a mini panel from existing `routes/ai-chat/{chat-input,chat-messages,streaming-message}.tsx`; (b) wait for v32 reincarnation (DRAFT references `routes/ai-chat/v32/{MessageThread,ChatComposer,ToolCallPanel}.tsx` but those were **reverted** on commit `34ced410` May 4 and do not currently exist in the tree); (c) build a brand-new minimal panel | **(a) reuse existing chat-input + chat-messages + streaming-message** — DRAFT predates the May-4 revert. We wrap them in a `WebAppAgentPanel` shell that supplies its own `useLivAgentStream` + agent-session keying. NO change to those shared files. v32 reincarnation is a separate concern (see Carryovers). |
| **G-8** | Per-WebApp agent's conversationId | (a) reuse `runId` as conversationId (one run = one conversation, persists across reconnects); (b) generate stable `webapp:<webappId>` and let runner pick runIds underneath | **(a) `runId` as conversationId** — matches `useLivAgentStream` semantics today. P88 used `'v32-' + uuid` per page mount; this phase persists the runId in `webapp_agent_sessions.run_id` so reload/reopen resumes the same Liv conversation slice. |
| **G-9** | What does "session resumes on reopen" mean exactly? | (a) re-attach SSE with `?after=<last_seen_idx>` to receive missed chunks; (b) re-fetch full transcript from `/api/agent/runs/:runId` then re-attach | **(a) re-attach with after**. The runner already persists chunks; the hook's existing reconnect path covers this. We feed `last_seen_idx` from the Postgres row. If runner has GC'd the run, hook surfaces an error → panel shows "Session ended, start new" CTA. |
| **G-10** | Mode selector default | (a) `chat`; (b) `watch` | **(a) `chat`** — most users opening a webapp window first want to ask a question. Watch is for passive observation while doing other tasks; that's a deliberate toggle. |
| **G-11** | Mode-change persistence | per-(userId, webappId) sticky vs reset on reopen | **Reset on reopen (in-memory only)** — D-95-MODE-LOCAL. Persisting mode is a future P96/P97 concern. |
| **G-12** | When wsUrl spawn fails | (a) show empty stream pane with error + retry; (b) close the window automatically | **(a) error + retry** — the AI panel still works (the user can still chat about the WebApp even if the stream is dead). Banner "Stream unavailable — retry" with a button. |
| **G-13** | VNC keyboard input scope | (a) Chrome window receives keystrokes whenever VNC pane is focused; (b) read-only by default in P95 (Watch mode), input only when mode is Chat or Auto | **(a) input always when pane focused** — Phase 96/97 mode semantics live in the recorder/agent layer, not the VNC client. Watch mode for **P95** just means "don't record" (P96 enforces). The user can always click the canvas to drive Chrome manually; that's the home-server desktop expectation. |
| **G-14** | Toolbar back/forward/refresh — drive what? | (a) browser-level via xdotool key chords through new tRPC; (b) noVNC keyboard injection (Alt+Left, Alt+Right, F5) | **(b) noVNC keyboard injection** — works without server-side changes, exact same path as user typing the chord. P93 owns the actual Chrome process so we don't introduce a sibling control surface. |
| **G-15** | Copy-URL: where does the URL come from? | (a) `webapps.list` returns the URL (P92 metadata); (b) ask the host Chrome via xdotool to read the address bar | **(a) from `webapps.list` row** — P92 metadata authoritative. URL is static for the WebApp config, not the live tab URL. Future enhancement to track live URL via DevTools protocol is post-v33. |

---

## 6. Files affected

**Created (this phase owns):**

1. `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` — root window content; the `webapp-stream` case in `window-content.tsx`'s switch.
2. `livos/packages/ui/src/modules/window/webapp-toolbar.tsx` — back/forward/refresh/copy-URL/fullscreen/popout pill row.
3. `livos/packages/ui/src/modules/window/webapp-mode-selector.tsx` — four-pill mode selector (Watch/Teach/Auto/Chat) with active highlight.
4. `livos/packages/ui/src/hooks/use-webapp-vnc.ts` — wraps `@novnc/novnc` `RFB`, exposes `{canvasRef, status, reconnect, sendKey}`.
5. `livos/packages/ui/src/hooks/use-webapp-agent.ts` — per-WebApp agent session: fetch/upsert `webapp_agent_sessions` row, returns `useLivAgentStream` bindings.
6. `livos/packages/ui/src/shadcn-components/ui/resizable.tsx` — shadcn copy-paste of `<ResizablePanelGroup>` / `<ResizablePanel>` / `<ResizableHandle>` (verified absent today). Standard shadcn template — no project-specific edits.
7. `livos/packages/livinityd/source/modules/database/migrations/<NN>_webapp_agent_sessions.sql` — Drizzle migration creating the table per § 4.
8. `livos/packages/livinityd/source/modules/database/schema/webapp-agent-sessions.ts` — Drizzle schema definition for the table.
9. `livos/packages/livinityd/source/modules/server/trpc/webapps-router.ts` — ADD a `agent.session.{get, upsert}` sub-router. (Router file is created in P93; we add to it, not create from scratch.)
10. `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` — unit tests (mode selector state, toolbar copy-URL, persistence key behavior, autoresize observer).
11. `livos/packages/ui/src/hooks/use-webapp-vnc.unit.test.tsx` — unit tests with mock RFB (D-NO-NEW-TEST-DEPS — same posture as `use-liv-agent-stream.unit.test.tsx`).

**Modified:**

- `livos/packages/ui/src/modules/window/window-content.tsx` — add lazy import + new `case 'webapp-stream':` (or per-webapp-id wildcard match — see Plan 95-02).
- `livos/packages/ui/package.json` — add `@novnc/novnc` and `react-resizable-panels` deps.
- `livos/packages/ui/src/lib/utils.ts` (or wherever `cn` lives) — none expected; shadcn resizable usually only needs `cn` which already exists.

**NOT modified (sacred / lane discipline):**

- `liv/packages/core/src/sdk-agent-runner.ts` ← SHA `f3538e1d…` MUST be unchanged (verified by `git hash-object`)
- `liv/packages/core/**` ← entire dir untouched
- `livos/packages/livinityd/source/modules/server/trpc/agents-router.ts`
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (P93's lane)
- `livos/packages/ui/src/routes/ai-chat/{index,chat-input,chat-messages,streaming-message,*}.tsx` — imported, not modified
- `livos/packages/ui/src/modules/desktop/**` — P94's lane
- `livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx` — referenced as contract documentation only

---

## 7. Verification gates

| Gate | Method | Pass criterion |
|---|---|---|
| Sacred SHA pre-flight | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Sacred SHA post-flight | same command after commit | unchanged |
| UI build green | `pnpm --filter ui build` | exit 0 |
| Unit tests pass | `pnpm --filter ui test` | all green incl. two new test files |
| livinityd build green | `cd livos/packages/livinityd && npm run build` | exit 0 |
| livinityd tests pass | `cd livos/packages/livinityd && npm test` | all green incl. webapps-router agent.session tests |
| Drizzle migration runs locally | `npm run db:migrate` against scratch PG | exit 0; table present in `\dt`; indexes present |
| New deps audit | `npm ls @novnc/novnc react-resizable-panels` | both present, no peer-dep warnings |
| TypeScript strict | `pnpm --filter ui typecheck` (or build's tsc step) | no new errors |
| Window content registry | grep `'webapp-stream'` in `window-content.tsx` | present in switch + lazy import |
| Persistence key | manual: open WebApp window, drag split to 50/50, close, reopen → split is 50/50 | localStorage `liv:webapp-stream:split:<webappId>` reflects state |

---

## 8. Decisions (D-95-…)

| ID | Decision | Rationale |
|---|---|---|
| D-95-01 | VNC client = `@novnc/novnc` direct dep (G-1) | Canonical; one less abstraction; Bytebot precedent |
| D-95-02 | Autoresize via `scaleViewport` + ResizeObserver (G-2) | Stable for P95; doesn't perturb host x11vnc geometry |
| D-95-03 | Use `react-resizable-panels` + ship `shadcn-components/ui/resizable.tsx` (G-3) | Single shadcn-aligned dep; keyboard a11y free |
| D-95-04 | Split persistence key per-webapp `liv:webapp-stream:split:<webappId>` (G-4) | Different ergonomics per app; userId implicit |
| D-95-05 | Fullscreen via `requestFullscreen()` on canvas wrapper (G-5) | Browser-native, no server round-trip |
| D-95-06 | Popout = stubbed disabled button (G-6) | Future enhancement; preserves toolbar layout |
| D-95-07 | Reuse legacy `routes/ai-chat/{chat-input,chat-messages,streaming-message}.tsx` (G-7) | v32 surface reverted May 4; legacy is the live one |
| D-95-08 | conversationId = runId (G-8) | Matches existing hook semantics; persists in PG |
| D-95-09 | Resume via `?after=<last_seen_idx>` (G-9) | Hook already supports it (P67-04) |
| D-95-10 | Default mode = `chat` (G-10) | Matches user's first-action expectation |
| D-95-11 | Mode is in-memory only (G-11) | D-95-MODE-LOCAL; future phases own their persistence |
| D-95-12 | Stream-fail UX = banner + retry (G-12) | Chat still useful even if VNC dead |
| D-95-13 | VNC input always live when focused (G-13) | Watch is recording-scope, not input-scope |
| D-95-14 | Back/forward/refresh = noVNC key injection (G-14) | No server-side surface needed |
| D-95-15 | Copy-URL from `webapps.list` row (G-15) | P92 metadata authoritative |

---

## 9. Out of scope

- Action recording (P96 owns `mode === 'teach'`)
- Bytebot loop wiring (P97 owns `mode === 'auto'`)
- Live tab URL tracking via Chrome DevTools protocol
- Popout window mode (stubbed disabled per D-95-06)
- xdotool-driven host fullscreen (D-95-05)
- Cross-WebApp agent memory (each session is its own row)
- Touching `liv/packages/core/**` (D-95-NO-CORE)
- Mobile responsive variants (desktop-only window manager)
- Multi-user share of a WebApp window (each `(userId, webappId)` is its own row)

---

## 10. Carryovers / cross-phase gotchas

- **C-95-01** — DRAFT references `routes/ai-chat/v32/{MessageThread,ChatComposer,ToolCallPanel}.tsx` but those were reverted on commit `34ced410` (May 4). Plan uses legacy chat surface. If v32 is restored before this phase ships, swap imports — paths only.
- **C-95-02** — `use-liv-agent-stream.ts` source file is missing in tree; only the unit-test file remains. P88's wiring still depends on it. Confirm presence (or re-create from P67-04 spec) before 95-04. If missing, this phase BLOCKS until the hook is restored — flag at 95-01 spike.
- **C-95-03** — `webapps` tRPC router is created by P93. P95 cannot land before P93. Verify presence at 95-01; if absent, escalate.
- **C-95-04** — `webapps` table created by P94. The new `webapp_agent_sessions.webapp_id` FK depends on it. Verify migration ordering; this phase's migration number is strictly greater than P94's.
- **C-95-05** — Window manager's window-content registry assumes `appId === 'LIVINITY_<id>'` shape today; webapps need a different match (`appId.startsWith('WEBAPP_')` or a `kind` discriminator). Plan 95-02 resolves this.
- **C-95-06** — `react-resizable-panels` ships with `dnd-kit`-style focus rings; verify they don't clash with Liv's design tokens. Quick visual check during 95-03.

---

## 11. Commit plan

ONE commit per task (95-01..95-08), atomic. Final commit message preamble:

```
feat(95): WebApp stream window — VNC pane + AI panel + mode selector

- modules/window/app-contents/webapp-stream-window.tsx: vertical split
  (ResizablePanelGroup) — top VNC, bottom WebAppAgentPanel
- modules/window/webapp-toolbar.tsx: back/forward/refresh/copy-URL/
  fullscreen/popout (popout stubbed)
- modules/window/webapp-mode-selector.tsx: Watch/Teach/Auto/Chat pill
- hooks/use-webapp-vnc.ts: @novnc/novnc wrapper + scaleViewport autoresize
- hooks/use-webapp-agent.ts: per-WebApp LivAgentRunner session,
  resumes via webapp_agent_sessions.run_id + last_seen_idx
- shadcn-components/ui/resizable.tsx: shadcn copy-paste add
- livinityd: webapp_agent_sessions Drizzle table + migration +
  webapps.agent.session.{get,upsert} sub-router
- ui: @novnc/novnc + react-resizable-panels added to package.json
- two new unit-test files (webapp-stream-window, use-webapp-vnc)

Phase: 95-stream-window
Wave: 3 (after P93/P94)
Sacred SHA f3538e1d UNTOUCHED.
```

Each task in 95-PLAN gets its own atomic sub-commit during execution; final phase commit aggregates them with the SUMMARY.md write.
