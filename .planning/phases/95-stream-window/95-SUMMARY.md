# Phase 95 — WebApp Stream Window + AI Panel + Mode Selector — SUMMARY

**Milestone:** v33.0 — WebApps + Teach/Auto Modes
**Wave:** 3 (sequential after P93 / P94)
**Status:** Code-complete. Live UAT pending Mini PC deploy + P98 lifecycle hookup.
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after every commit.

## Tasks delivered

| Task | Commit | Effort | Notes |
|---|---|---|---|
| 95-01 | (verified inline; no commit) | 0.5d | Spike — sacred SHA, P93/P94 contract presence, G-7 fallback flagged |
| 95-02 | `e303017b` | 0.5d | `WEBAPP_*` discriminator + lazy import + `isWebAppKind` helper + placeholder file |
| 95-03 | `dd6a12b6` | 0.5d | `@novnc/novnc ^1.6.0` + `react-resizable-panels` + shadcn `resizable.tsx` |
| 95-04 | `623b282e` | 1.0d | `use-webapp-vnc.ts` hook + 11-case unit test (RFB mock + source-text invariants) |
| 95-05 | `4637a6e3` | 0.75d | `webapp_agent_sessions` Postgres table + repo + `webapp.agent.session.{get, upsert}` sub-router (in `webapps/trpc-router.ts`) |
| 95-06 | `0cb4de18` | 0.75d | `use-webapp-agent.ts` hook + 11-case test (G-7 fallback to `useAgentSocket`) |
| 95-07 | `87936cad` | 1.0d | `webapp-toolbar.tsx` + `webapp-mode-selector.tsx` |
| 95-08 | (this commit) | 1.0d | `webapp-stream-window.tsx` integration + 17-case test + UAT-CHECKLIST.md |

Total: 8 commits across the phase (95-01 was a no-code verification step, folded into 95-02 per CONTEXT § 5 since no decision shifted).

## Files created

### UI (livos/packages/ui)

- `src/hooks/use-webapp-vnc.ts` (95-04)
- `src/hooks/use-webapp-vnc.unit.test.tsx` (95-04)
- `src/hooks/use-webapp-agent.ts` (95-06)
- `src/hooks/use-webapp-agent.unit.test.tsx` (95-06)
- `src/modules/window/webapp-toolbar.tsx` (95-07)
- `src/modules/window/webapp-mode-selector.tsx` (95-07)
- `src/modules/window/webapp-stream-window.unit.test.tsx` (95-08)
- `src/modules/window/app-contents/webapp-stream-window.tsx` (95-02 stub → 95-08 full integration)
- `src/shadcn-components/ui/resizable.tsx` (95-03)

### livinityd

- `source/modules/database/migrations/2026-05-07-p95-webapp-agent-sessions.sql` (95-05)
- `source/modules/webapps/webapp-agent-sessions-repository.ts` (95-05)

### Modified

- `livos/packages/ui/src/modules/window/window-content.tsx` (95-02 — added `WEBAPP_*` discriminator + lazy import + `fullHeightApps` helper)
- `livos/packages/ui/package.json` + lockfile (95-03 — `@novnc/novnc ^1.6.0`, `react-resizable-panels`)
- `livos/packages/livinityd/source/modules/database/schema.sql` (95-05 — boot-time idempotent apply mirror)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (95-05 — `httpOnlyPaths` adds `webapp.agent.session.{get, upsert}`)
- `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` (95-05 — `agent.session.*` sub-router added)

### Phase artifacts

- `.planning/phases/95-stream-window/95-PLAN.md` (existing — plan from spec)
- `.planning/phases/95-stream-window/95-CONTEXT.md` (existing — context from spec)
- `.planning/phases/95-stream-window/UAT-CHECKLIST.md` (this commit, sections K-N)
- `.planning/phases/95-stream-window/95-SUMMARY.md` (this file)

## Dependency versions

- `@novnc/novnc`: `^1.6.0`
- `react-resizable-panels`: latest at lockfile capture (P95-03 commit `dd6a12b6`)

## Persistence key shape (resolved D-95-04)

We OWN the localStorage write via `onLayout` callback rather than using
react-resizable-panels' `autoSaveId`. The `autoSaveId` would resolve to the
lib's internal key shape (e.g. `react-resizable-panels:<id>:0`), which sits
outside the `liv:` namespace. Owning the write keeps the contract on D-95-04:

  Key:   `liv:webapp-stream:split:<webappId>`
  Value: `JSON.stringify([topPct, bottomPct])` — e.g. `"[70,30]"`

Read on mount via `readPersistedLayout(webappId)` with `[20, 90]` guard;
out-of-range writes from previous versions fall back to `70/30`.

## Deviations / gray areas resolved at execution

### G-7 deviation (CONTEXT C-95-02 — chat surface host)

**Problem:** `useLivAgentStream` source file is missing in tree (only its
unit-test file remains, contract-locked but un-implemented). The plan's
95-06 `use-webapp-agent.ts` was specified to wrap that hook.

**Resolution:** Per the executor's G-7 fallback instruction, we wrap the
legacy `useAgentSocket` singleton hook from `@/hooks/use-agent-socket`
instead. The wrapper preserves the public API the plan specified
(`messages`, `isStreaming`, `sendMessage`, `interrupt`, `sessionStatus`,
`startNewSession`, etc.) — it owns the `runId`/`lastSeenIdx` round-trip
via tRPC and passes the conversationId through `useAgentSocket.sendMessage`'s
third arg so the server can scope the run.

**Caveat:** `useAgentSocket` is a singleton WS; opening multiple WebApp
windows simultaneously will share the underlying connection and message
buffer. P96/P97 will need to revisit if per-window isolation becomes a
requirement (most likely path: restore `useLivAgentStream` upstream,
then swap the inner hook in `use-webapp-agent.ts` — public API is
already shaped for that drop-in).

### G-9 (session-ended detection)

`useAgentSocket` does not surface a structured "run not found" error
channel. We detect session-ended heuristically by scanning `messages`
for a system-role entry matching `/run.*not found|run.*expired|run.*gone/i`,
gated on `resumedConversationId` being set. This is intentionally
conservative; the panel always offers a "Start new session" CTA which
the user can click regardless.

### Tests (D-NO-NEW-TEST-DEPS posture)

Per the established 95-04 / 67-04 / 25 / 30 / 33 / 38 / 62 precedent
(`@testing-library/react` is NOT installed in the UI package), all three
new test files (`use-webapp-vnc.unit.test.tsx`, `use-webapp-agent.unit.test.tsx`,
`webapp-stream-window.unit.test.tsx`) ship as **source-text invariants +
smoke imports**, not full RTL renders. The contract surface is locked
at the file-text level so it cannot drift before the next phase consumes it.

## Verification gates (final state)

| Gate | Method | Result |
|---|---|---|
| Sacred SHA pre/post | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d…` (unchanged) |
| ui typecheck baseline | `pnpm --filter ui typecheck` error count | **560** (unchanged from baseline) |
| livinityd typecheck baseline | `cd livos/packages/livinityd && npm run build` | 95-05 commit verified 371 unchanged |
| Filtered vitest (95-06) | 11/11 pass | green |
| Filtered vitest (95-08) | 17/17 pass | green |
| Window content registry | `WEBAPP_*` prefix matched in `window-content.tsx` | present (95-02) |
| Persistence key shape | localStorage `liv:webapp-stream:split:<webappId>` | matches D-95-04 (manual UAT row N-3) |
| Lockfile minimal | only `@novnc/novnc`, `react-resizable-panels`, fresh transitives | per 95-03 commit |

## Carryovers to v33 follow-ups

- **C-95-LIVE-UAT** — Sections K-1..K-7 of UAT-CHECKLIST.md require a
  Mini PC deploy AND **P98** (WebApp window lifecycle: `webapp.window.spawn`
  must return a real wsUrl, not SERVICE_UNAVAILABLE). The error banner
  + retry path is exercisable today; the rest of the toolbar/mode
  selector/split persistence rows are exercisable against the agent
  panel + error banner alone.
- **C-95-LIV-AGENT-STREAM-RESTORE** — When `useLivAgentStream` is
  restored upstream (currently only its `.unit.test.tsx` exists), swap
  the inner hook in `livos/packages/ui/src/hooks/use-webapp-agent.ts`
  from `useAgentSocket` to `useLivAgentStream`. Public API of
  `useWebAppAgent` was designed to make this a drop-in change. No
  caller of `useWebAppAgent` needs to be touched.
- **C-95-POPOUT** — Toolbar popout button is stubbed disabled (D-95-06).
  Future phase ships chromeless popout + Portal-based component tree
  re-mount. Current callers MUST NOT pass an `onPopout` prop.
- **C-95-V32-CHAT-RESTORE** — If the v32 chat surface
  (`routes/ai-chat/v32/{MessageThread, ChatComposer, ToolCallPanel}.tsx`)
  is restored, swap the imports in
  `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx`'s
  `WebAppAgentPanel` from `chat-messages.tsx` / `chat-input.tsx` to the
  v32 surface. Paths only; no contract change.

## Commit log

```
0cb4de18 feat(95-06): use-webapp-agent hook (per-WebApp session-keyed agent stream)
87936cad feat(95-07): webapp-toolbar + webapp-mode-selector components
<this>   feat(95-08): WebAppStreamWindow integration — VNC pane + AI panel + mode selector + split persistence
```

(Pre-resume commits: `4637a6e3` 95-05, `623b282e` 95-04, `dd6a12b6` 95-03,
`e303017b` 95-02.)

Phase 95 closes the Wave 3 sequential chain. P96 (Teach) and P97 (Auto)
can now consume `mode === 'teach'` / `mode === 'auto'` from the local
state of `WebAppStreamWindow` — they listen to the
`liv-webapp-mode-change` CustomEvent dispatched by `WebAppModeSelector`
(event name exported as `WEBAPP_MODE_CHANGE_EVENT`).
