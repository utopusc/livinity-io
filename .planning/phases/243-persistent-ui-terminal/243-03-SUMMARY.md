---
phase: 243
plan: 03
subsystem: ui
tags: [terminal, xterm, ws, feature-flag, dock, react]
requires:
  - Plan 243-01 (PtySession + metadata module) — SHIPPED
  - Plan 243-02 (/livos/terminal/ws WS endpoint + Caddy matcher) — SHIPPED
  - "@xterm/xterm@^5.4.0" (pre-existing in livos/packages/ui dependencies)
  - "@xterm/addon-fit@^0.9.0" (pre-existing)
provides:
  - useTerminalPanelEnabled() — UI feature-flag hook (default OFF)
  - config.getTerminalPanelEnabled tRPC query
  - TERMINAL_PANEL_REDIS_KEY const = 'livos:v43:terminal_panel'
  - PersistentTerminalPanel React component (xterm.js + addon-fit + addon-web-links)
  - useTerminalWs hook (cookie auth, JSON parse, readyState-guarded send)
  - TerminalRouteShell in window-content.tsx (flag-aware swap)
affects:
  - Plan 243-04 (Mini PC deploy + flag flip + UAT)
tech-stack:
  added:
    - "@xterm/addon-web-links@^0.11.0 (livos/packages/ui dependency)"
  patterns:
    - Default-OFF feature flag (inverse of v42 migration default-ON)
    - publicProcedure tRPC for pre-login flag visibility (mirrors P224)
    - {showTerminal && (...)} dock-entry gate with data-test-dock-item seam (mirrors P227-02)
    - TerminalRouteShell flag-aware lazy swap (D-243-FLAG-ROLLBACK preserves legacy)
key-files:
  created:
    - livos/packages/ui/src/hooks/use-terminal-panel-enabled.ts
    - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx
    - livos/packages/ui/src/features/v43-terminal/use-terminal-ws.ts
    - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.test.tsx
    - livos/packages/livinityd/source/modules/server/trpc/__tests__/config-router.test.ts
    - .planning/phases/243-persistent-ui-terminal/deferred-items.md
  modified:
    - livos/packages/ui/package.json (+1 dep: @xterm/addon-web-links)
    - livos/packages/livinityd/source/modules/server/trpc/config-router.ts (+TERMINAL_PANEL_REDIS_KEY + getTerminalPanelEnabled query)
    - livos/packages/ui/src/modules/desktop/dock.tsx (+useTerminalPanelEnabled import + showTerminal const + gate wrap)
    - livos/packages/ui/src/modules/desktop/dock.test.tsx (+useTerminalPanelEnabled mock + 2 gate test cases)
    - livos/packages/ui/src/modules/window/window-content.tsx (+TerminalRouteShell + lazy split + switch arm swap)
decisions:
  - L-243-D honored — feature flag default-OFF; only literal string 'true' opens the gate
  - L-243-C reused — WS endpoint path /livos/terminal/ws (Plan 243-02 contract)
  - L-243-F honored — Sacred SHA preserved across all 3 commits
  - D-243-FLAG-ROLLBACK — legacy terminal-content.tsx stays as the OFF-state window-content fallback (zero-revert rollback path)
  - TERMINAL_PANEL_REDIS_KEY literal intentionally duplicated with 243-02's pty-sessions/feature-flag.ts (different surface = different drift-lock)
  - publicProcedure (NOT privateProcedure) so login-screen / pre-auth UI doesn't flicker (mirrors P224's getV42MigrationActive)
  - Hook default INVERTED from useV42MigrationActive: loading/error → false (default-OFF safety per L-243-D)
  - pnpm-lock.yaml reverted to pre-Task-2 state — Mini PC update.sh handles install fresh on Ubuntu (avoids committing Windows-dev novnc 1.7.0 transitive churn)
metrics:
  duration: ~50 min
  completed: 2026-05-28
  tasks: 3
  commits: 3
  tests_added: 11
  tests_passing: 18  # 8 config-router (5 new + 3 preserved) + 4 component + 6 dock (2 new + 4 pre-existing)
---

# Phase 243 Plan 03: LivOS UI Persistent Terminal Panel Summary

One-liner: New xterm.js panel + useTerminalWs hook + tRPC feature-flag + dock-entry gate land as the browser-side counterpart to Plans 243-01 (PtySession) and 243-02 (WS endpoint); legacy `terminal-content.tsx` stays as the OFF-state fallback for zero-revert rollback.

## What Was Built

### New UI files (livos/packages/ui/src/)

- **`hooks/use-terminal-panel-enabled.ts`** — `useTerminalPanelEnabled(): boolean` reads `trpcReact.config.getTerminalPanelEnabled` with `staleTime: 30_000` + `refetchOnWindowFocus`. **Inverse default** of `useV42MigrationActive`: loading/error → `false`, returns `true` ONLY when `q.data?.enabled === true`. L-243-D safety.
- **`features/v43-terminal/use-terminal-ws.ts`** — WS lifecycle hook with `ClientToServer` / `ServerToClient` discriminated unions matching 243-02 SUMMARY. Cookie-only auth (no `?token` query), `JSON.parse` wrapped in try/catch (malformed → `{type:'error', message:'parse error'}`), `send` guarded on `readyState === OPEN`, `useEffect` cleanup closes the WS (243-02 contract: `ws.close()` alone kills the server-side PtySession).
- **`features/v43-terminal/PersistentTerminalPanel.tsx`** — React component (~190 lines). xterm.js + `FitAddon` + `WebLinksAddon`, theme `#0b0b0c` / `#e7e7e8` / `#7dd3fc` per CONTEXT spec. Lifecycle: mount → `term.open()` → `fit.fit()` → on WS `onOpen` send `{type:'init', cols, rows}`. `onData` → `send({type:'data', data})` (suppressed when closed). `ResizeObserver` → `fit.fit()` + `proposeDimensions()` → `send({type:'resize', cols, rows})` only when dims change. `onMessage` handles `ready` / `data` / `exit` / `error` per protocol. Renders a `bg-[#0b0b0c]` container with a status pill (sessionId + 8-char prefix).
- **`features/v43-terminal/PersistentTerminalPanel.test.tsx`** — 4 vitest cases (jsdom + `react-dom/client.createRoot`):
  1. `onOpen()` → `send({type:'init', cols:<number>, rows:<number>})` with both > 0
  2. `onMessage({type:'data', data:'hello'})` → `terminal.write('hello')`
  3. `onMessage({type:'exit', code:0, signal:null})` → `terminal.writeln` matches `/session exited.*code=0/`
  4. `onMessage({type:'error', message:'boom'})` → `terminal.writeln` contains `'[error] boom'`

### New livinityd test file

- **`server/trpc/__tests__/config-router.test.ts`** — 8 vitest cases (5 new 243-03 + 3 preservation):
  - T1 — `TERMINAL_PANEL_REDIS_KEY === 'livos:v43:terminal_panel'` drift-lock
  - T1b — `V42_MIGRATION_REDIS_KEY` neighbor literal unchanged (defensive co-assertion)
  - T2 — `getTerminalPanelEnabled` returns `{enabled:false}` when `redis.get` → `null` (key missing)
  - T3 — returns `{enabled:false}` when `redis.get` → `'false'`
  - T4 — returns `{enabled:false}` when `redis.get` → `'1'` (any non-literal-`'true'`)
  - T5 — returns `{enabled:true}` ONLY when `redis.get` → the literal `'true'`
  - Preservation tests — `getV42MigrationActive` default-ON + rollback (Phase 224 contract preserved)

### Modified livinityd

- **`server/trpc/config-router.ts`** — Added `TERMINAL_PANEL_REDIS_KEY` const (40-line jsdoc explaining the intentional duplication with 243-02's `pty-sessions/feature-flag.ts`) + `getTerminalPanelEnabled` `publicProcedure` query. Existing `getV42MigrationActive` + DI factory pattern preserved byte-identical.

### Modified UI

- **`package.json`** — `@xterm/addon-web-links@^0.11.0` inserted alphabetically between `@xterm/addon-fit` and `@xterm/xterm`. pnpm-lock.yaml NOT committed (Mini PC fresh install handles).
- **`modules/desktop/dock.tsx`** — `import {useTerminalPanelEnabled}` + `const showTerminal = useTerminalPanelEnabled()` after the `showLivAssistant` line. Existing `<DockItem appId='LIVINITY_terminal' ...>` wrapped in `{showTerminal && (<div data-test-dock-item='terminal' className='contents'>...</div>)}` mirroring the `{showLivAssistant && (...)}` Phase 227-02 pattern with the same D-P227-TEST-SEAM. DockItem props preserved byte-identical inside the conditional.
- **`modules/desktop/dock.test.tsx`** — `vi.mock('@/hooks/use-terminal-panel-enabled')` + `let terminalPanelEnabled = false` + `beforeEach` reset. 2 new test cases append to the Phase 227-02 describe block.
- **`modules/window/window-content.tsx`** — Legacy `TerminalWindowContent` renamed `LegacyTerminalWindowContent`, new `PersistentTerminalPanel` lazy import alongside. New `TerminalRouteShell` helper component (inside the file, before `WindowContent`) calls `useTerminalPanelEnabled()` and conditionally mounts either child wrapped in its own `Suspense` boundary. `LIVINITY_terminal` switch arm returns `<TerminalRouteShell />` instead of `<TerminalWindowContent />`.

### Wire Protocol (operator reference, mirrors 243-02 SUMMARY)

The UI client implements the EXACT message shapes documented by 243-02:

Outbound (Client → Server):
- `{type:'init', cols, rows}` — sent IMMEDIATELY on WS `onopen` (cwd intentionally omitted in v43 MVP)
- `{type:'data', data}` — every xterm `onData` keystroke (suppressed after `isClosed`)
- `{type:'resize', cols, rows}` — every ResizeObserver-derived `fit.proposeDimensions()` delta
- `{type:'close'}` — NOT sent explicitly; `ws.close()` from useEffect cleanup triggers 243-02's server-side `PtySession.kill()`

Inbound (Server → Client):
- `{type:'ready', sessionId}` → store sessionId, status pill shows first 8 chars, banner line `[session <id> ready]`
- `{type:'data', data}` → `terminal.write(data)`
- `{type:'exit', code, signal}` → `terminal.writeln('\r\n[session exited code=<n> signal=<sig>]')`, `isClosedRef.current = true`, status pill → "disconnected"
- `{type:'error', message}` → `terminal.writeln('\r\n[error] <msg>')`, do NOT close (server may recover)

## Drift-Locks

| Anchor | Location | Test |
|---|---|---|
| `TERMINAL_PANEL_REDIS_KEY === 'livos:v43:terminal_panel'` (UI tRPC layer) | `config-router.ts` line ~67 | `config-router.test.ts` T1 |
| `V42_MIGRATION_REDIS_KEY` preserved | `config-router.ts` line 50 | `config-router.test.ts` T1b |
| Default-OFF: `redis.get(null) → {enabled:false}` | `config-router.ts` `getTerminalPanelEnabled` | `config-router.test.ts` T2 |
| Default-OFF: any non-`'true'` string → `{enabled:false}` | same | `config-router.test.ts` T3 + T4 |
| Literal-`'true'`-only gate | same | `config-router.test.ts` T5 |
| WS init message shape `{type:'init', cols:<number>, rows:<number>}` | `PersistentTerminalPanel.tsx` `onOpen` | `PersistentTerminalPanel.test.tsx` case 1 |
| `data` event → `terminal.write(data)` | `PersistentTerminalPanel.tsx` switch case `'data'` | `PersistentTerminalPanel.test.tsx` case 2 |
| `exit` writeln matches `/session exited.*code=0/` | `PersistentTerminalPanel.tsx` switch case `'exit'` | `PersistentTerminalPanel.test.tsx` case 3 |
| `error` writeln contains `[error] <msg>` (and does NOT close) | `PersistentTerminalPanel.tsx` switch case `'error'` | `PersistentTerminalPanel.test.tsx` case 4 |
| Dock entry hidden when flag OFF | `dock.tsx` `{showTerminal && (...)}` | `dock.test.tsx` Phase 243-03 case (OFF) |
| Dock entry visible when flag ON | same | `dock.test.tsx` Phase 243-03 case (ON) |

## Test Counts

| File | Pass | Notes |
|---|---|---|
| `server/trpc/__tests__/config-router.test.ts` | 8/8 | NEW — 5 new 243-03 + 3 preserved 224 contract |
| `ui/src/features/v43-terminal/PersistentTerminalPanel.test.tsx` | 4/4 | NEW — onOpen + data + exit + error |
| `ui/src/modules/desktop/dock.test.tsx` | 6/6 | +2 from baseline 4 (Phase 227-02 + Phase 231 retirement still GREEN) |
| **TOTAL (touched)** | **18/18** | combined `vitest run` over the 3 files |

11 new vitest cases (5 + 4 + 2) all GREEN.

## Commits

3 atomic commits, conventional `feat()` prefix per plan latitude (no TDD gate at the plan level — Plan 243-03 type is `execute`, not `tdd`):

| # | Hash | Subject |
|---|---|---|
| 1 | `72e43365` | `feat(243-03): tRPC config.getTerminalPanelEnabled + UI feature-flag hook + addon-web-links dep` |
| 2 | `99b08bb1` | `feat(243-03): PersistentTerminalPanel + useTerminalWs hook + 4 component tests` |
| 3 | `5a326cb0` | `feat(243-03): wire dock gate + window-content route swap + 2 dock gate tests` |

## Verification (Success Criteria)

- **SC-01** GREEN — 5 config-router (new) + 4 component + 2 dock gate = 11 new tests GREEN; 18/18 in touched files combined
- **SC-02** GREEN — `pnpm tsc --noEmit` adds zero new errors in `dock.tsx`, `window-content.tsx`, `hooks/use-terminal-panel-enabled.ts`, `features/v43-terminal/*`, `config-router.ts`, `config-router.test.ts`
- **SC-03** PARTIAL — `pnpm --filter @livos/config build` succeeds. `pnpm --filter ui build` transforms all 9,548 modules but trips on a pre-existing Windows-dev VitePWA / `@novnc/novnc@1.7.0` `exports` resolution bug **unrelated to any 243-03 change** (logged in `deferred-items.md` as `D-243-03-DEFERRED-01`). Mini PC update.sh (Ubuntu, clean `node_modules`) handles install + build fresh in 243-04.
- **SC-04** GREEN — `@xterm/addon-web-links: ^0.11.0` listed exactly once in `livos/packages/ui/package.json` `dependencies` (alphabetical between `addon-fit` and `xterm`)
- **SC-05** GREEN — L-243-D honored at BOTH layers: hook returns `false` on loading/error/missing/non-`'true'`; tRPC returns `{enabled:false}` on null/`'false'`/`'1'`; ONLY literal `'true'` opens the gate (drift-locked by `config-router.test.ts` T2-T5)
- **SC-06** GREEN — D-243-FLAG-ROLLBACK: `TerminalRouteShell` keeps `LegacyTerminalWindowContent` as the OFF-state fallback (`pnpm vitest` covers the swap surface; flipping the Redis key to `'false'` or removing it restores the pre-243-03 surface live, no code revert)
- **SC-07** GREEN — 3 atomic commits with `feat(243-03):` prefix
- **SC-08** GREEN — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED across all 3 commits (pre-commit hook PASS on every commit; final `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` confirmed)

## Deviations from Plan

Two minor deviations within plan latitude, both documented:

### 1. [Rule SCOPE BOUNDARY] pnpm-lock.yaml NOT committed (sibling chore commit skipped)

- **Found during:** Task 2 — `pnpm vitest run src/features/v43-terminal/` initially failed with `Failed to resolve import "@xterm/addon-web-links"`. Ran `pnpm install --filter ui` to fetch the new dep.
- **Issue:** The install pulled in a huge lockfile churn (9,148 deletions + 9,390 insertions) including a transitive `@novnc/novnc` upgrade `1.6.0 → 1.7.0` that triggers a Windows-dev VitePWA build failure unrelated to 243-03.
- **Fix:** Reverted `livos/packages/ui/pnpm-lock.yaml` to the pre-Task-2 state (matches `af708351` baseline). `@xterm/addon-web-links` entry stays in `package.json`. Mini PC update.sh handles install fresh on Ubuntu in 243-04.
- **Files modified:** `livos/packages/ui/pnpm-lock.yaml` (reverted)
- **Plan latitude:** Plan explicitly says `Optional sibling: chore(243-03): pnpm-lock.yaml — @xterm/addon-web-links install if step 1 required lockfile churn`. Choosing NOT to commit is within latitude.
- **Tracked in:** `.planning/phases/243-persistent-ui-terminal/deferred-items.md` as `D-243-03-DEFERRED-01` with 3 candidate fixes if Mini PC update.sh also trips.

### 2. [Plan latitude] WS URL hostname resolution gracefully degrades for SSR/test environments

- The `useTerminalWs` `buildTerminalWsUrl()` helper falls back to `'localhost'` when `typeof window === 'undefined'` so the hook is importable from SSR contexts and never throws on module-init. The plan's `<interfaces>` example assumed pure-browser context; this is defensive, not a contract change.

## Authentication Gates

None encountered during execution — all work was code/test/local-build, no Mini PC SSH, no LLM round-trips, no auth-token-required tools.

## Threat Surface

All threats from the plan's `<threat_model>` are addressed in code:

- **T-243-03-01 (E — bypass via direct URL):** `TerminalRouteShell` renders `LegacyTerminalWindowContent` when the flag is OFF, so direct URL navigation to `/terminal` NEVER reaches the new panel. Plus the WS endpoint itself enforces the flag server-side (Plan 243-02 SC-06: `isTerminalPanelEnabled` gate at handler entry).
- **T-243-03-02 (I — public flag leak):** ACCEPTED — same disposition as Phase 224. Boolean is non-sensitive; dock HTML reveals it anyway.
- **T-243-03-03 (T — verbatim PTY data write):** ACCEPTED — xterm sandboxes its own rendering. Standard PTY-host trust model.
- **T-243-03-04 (T — ANSI forge UI chrome):** ACCEPTED — out of scope for v43 MVP.
- **T-243-03-05 (D — WS data flood):** ACCEPTED — xterm bounded scrollback (default 1000 lines) + browser WS flow control.
- **T-243-03-06 (I — extension capture):** ACCEPTED — operator-controlled environment.

No new threat surface beyond the plan's register.

## Known Stubs

None. PersistentTerminalPanel is fully wired to the 243-02 WS protocol; the status pill displays the real `sessionId` returned by `{type:'ready'}` (not a placeholder); legacy fallback path is preserved verbatim.

## Threat Flags

None — no new network endpoints, no schema changes, no new auth paths beyond the cookie-auth flow already established in Plan 243-02.

## Next

Plan 243-04 will deploy the new UI bundle + the 243-02 livinityd changes to Mini PC, flip `redis-cli SET livos:v43:terminal_panel true`, then walk the 3 UAT probes from `243-CONTEXT.md`:

1. Dock shows Terminal entry → click → xterm window opens → shell prompt visible
2. Type `whoami` → returns `bruce`
3. Close window → session exits cleanly (journalctl livos.service for clean WS close + PTY SIGHUP)

The legacy `/terminal?token=` WS route at `server/index.ts:1309-1312` remains operational and is the OFF-state fallback. **Phase 243 does NOT remove it** — removal is deferred to a future plan once the persistent terminal proves out in operator usage.

## Self-Check: PASSED

- FOUND `livos/packages/ui/src/hooks/use-terminal-panel-enabled.ts`
- FOUND `livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx`
- FOUND `livos/packages/ui/src/features/v43-terminal/use-terminal-ws.ts`
- FOUND `livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.test.tsx`
- FOUND `livos/packages/livinityd/source/modules/server/trpc/__tests__/config-router.test.ts`
- FOUND TERMINAL_PANEL_REDIS_KEY const in `livos/packages/livinityd/source/modules/server/trpc/config-router.ts`
- FOUND getTerminalPanelEnabled query in `livos/packages/livinityd/source/modules/server/trpc/config-router.ts`
- FOUND useTerminalPanelEnabled() call + showTerminal const in `livos/packages/ui/src/modules/desktop/dock.tsx` (grep -c → 2 + 2)
- FOUND PersistentTerminalPanel lazy import + use in `livos/packages/ui/src/modules/window/window-content.tsx`
- FOUND `@xterm/addon-web-links: ^0.11.0` in `livos/packages/ui/package.json` (grep -c → 1)
- FOUND commit `72e43365` (Task 1) in git log
- FOUND commit `99b08bb1` (Task 2) in git log
- FOUND commit `5a326cb0` (Task 3) in git log
- PRESERVED Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (pre-commit hook PASS × 3 + `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` confirmed)
- VERIFIED 18/18 vitest cases PASS in touched files (5 + 4 + 2 NEW + 3 preserved 224 + 4 preserved 227 dock cases)
- VERIFIED zero new tsc errors in touched UI / livinityd files
- VERIFIED `pnpm --filter @livos/config build` succeeds; `pnpm --filter ui build` pre-existing Windows-dev novnc breakage logged in deferred-items.md (Mini PC Ubuntu deploys unaffected)
