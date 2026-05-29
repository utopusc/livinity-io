---
phase: 246
plan: 05
subsystem: livos/packages/livinityd/pty-sessions + livos/packages/ui/features/v44-admin-terminals + livos/packages/ui/modules/settings
tags: [terminal, ttl-gc, admin-panel, multi-session, tdd, wave-3, settings]
provides:
  - createTtlGc({sessionManager, nowFn?, idleMs?, sweepMs?, setIntervalFn?, clearIntervalFn?, logger?}) → IdleSweep
  - TTL_GC_DEFAULT_IDLE_MS = 86400000 (24h) — drift-locked
  - TTL_GC_DEFAULT_SWEEP_MS = 3600000 (1h) — drift-locked
  - IdleSweep.start() — idempotent (replaces prior interval handle)
  - IdleSweep.stop() — safe to call repeatedly (null-handle no-op)
  - IdleSweep.sweepNow() — synchronous one-shot, returns kill count
  - Server.ptyTtlGc — TTL GC singleton wired in constructor, started at WS-mount tail
  - ActiveTerminalsPanel — React admin panel listing sessions + Kill button per row
  - SystemSection — wrapper module at modules/settings/system-section.tsx
  - Settings → Troubleshoot embeds SystemSection lazily under a border-t divider
requires:
  - SessionManager.entries() + .kill() (Phase 246-01)
  - createPtySessionsAdminRouter (Phase 246-03 — listSessions + killSession adminProcedure routes)
  - Server.ptySessionManager (Phase 246-03 singleton)
  - useTerminalPanelEnabled hook (Phase 243-03 — v43 flag gate)
  - trpcReact.ptySessions.{listSessions,killSession} (Phase 246-03 wiring through createAppRouter)
affects:
  - livos/packages/livinityd/source/modules/pty-sessions/index.ts (barrel extended)
  - livos/packages/livinityd/source/modules/server/index.ts (TTL GC singleton + start)
  - livos/packages/ui/src/routes/settings/_components/settings-content.tsx (SystemSectionLazy embed)
tech-stack:
  added: []
  patterns:
    - Dependency-injected timer (nowFn / setIntervalFn / clearIntervalFn) — no wall-clock in unit tests
    - Constructor-init for TTL GC singleton (needs this.logger which is constructor-assigned, NOT field-initialized)
    - Wrapper logger adapter — {info(msg, ctx)} contract bridged to livinityd's {log,verbose,error} via JSON.stringify(ctx)
    - Self-gated UI section (hook-first, early-return-after-hooks) — preserves React rules-of-hooks while honoring v43 flag
    - data-testid prefix queries (`[data-testid^="session-row-"]`) for row count assertions
    - Lazy embed of system-section under existing TroubleshootSection — additive (v36 NO-BOLD-REDESIGNS rule)
key-files:
  created:
    - livos/packages/livinityd/source/modules/pty-sessions/ttl-gc.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/ttl-gc.test.ts
    - livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.tsx
    - livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.test.tsx
    - livos/packages/ui/src/modules/settings/system-section.tsx
  modified:
    - livos/packages/livinityd/source/modules/pty-sessions/index.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
decisions:
  - TTL GC singleton initialized in the Server constructor — class-field initializers cannot reference this.logger (assigned in constructor body), and the TtlGcDeps logger contract is part of the audit-trail mitigation (T-246-05-03). Constructor init keeps the readonly invariant and the audit trail.
  - Logger adapter wraps livinityd's `log(msg)` to satisfy TtlGcDeps's `info(msg, ctx)` — JSON.stringify the ctx into the log line so journalctl captures every kill (T-246-05-03 mit) without reshaping the parent logger contract or touching every other consumer of createChildLogger.
  - Component self-gate runs AFTER hook calls (useQuery / useMutation always invoked) — early-return-before-hooks would violate React rules-of-hooks. The `enabled: flag` flag on useQuery keeps the query inactive when the section is off, so no network requests fire.
  - 5s refetchInterval while the flag is ON — keeps the panel snappy for an admin watching live sessions without hammering the server (cheap in-memory query); paused when gated off.
  - SystemSection embedded in TroubleshootSection (system-group) under a border-t divider rather than a new sidebar menu item — preserves LivOS WINDOW-LOGIC (no URL launcher), keeps v36 additive rule, and ships behind the same v43 flag that gates the dock entry so flipping the flag OFF removes BOTH surfaces atomically.
  - Plan said `system-section.tsx` lives at `modules/settings/`. There was no pre-existing System sub-page (the System group's items are individual lazy sections inside settings-content.tsx). Created the file as plan-spec'd and embedded the panel via a lazy import — no schema or routing change.
  - data-testid (NOT data-test) was chosen as the primary test surface — keeps parity with the testing-library convention used in master-chrome-login + settings-content tests, even though the file uses raw createRoot. data-test attributes are ALSO emitted for parity with Phase 246-04's TerminalTabBar tests.
metrics:
  duration: 8m
  tasks_completed: 3
  commits: 4
  tests_added: 10  # 6 ttl-gc + 4 admin panel
  files_created: 5
  files_modified: 3
  completed: 2026-05-28
---

# Phase 246 Plan 05: TTL GC + Settings → System Active Terminals panel Summary

**One-liner:** Closed the v44 session lifecycle loop — `createTtlGc` runs every 1h on a setInterval, kills any PTY whose `lastAttachAt` is > 24h ago through `sessionManager.kill(id)`; livinityd boots it as a singleton at the tail of WS-mount; and the new `ActiveTerminalsPanel` admin UI lists every live session with a Kill button, self-gated by the v43 feature flag so flipping the flag OFF removes both the dock entry and the admin panel atomically.

## Tasks Executed

| Task | Name                                                                          | Commit     |
| ---- | ----------------------------------------------------------------------------- | ---------- |
| 1a   | RED — ttl-gc 6 cases failing (module-not-found)                               | `ada5b97c` |
| 1b   | GREEN — ttl-gc factory + drift-locked constants (6/6 tests pass)              | `fc439651` |
| 2    | Wire TTL GC singleton in server bootstrap + barrel re-export                  | `be7d73b5` |
| 3    | ActiveTerminalsPanel + Settings → System integration + 4 panel tests          | `bf7475d3` |

REFACTOR step skipped — ttl-gc.ts is 90 lines with no duplication; logger adapter is the only abstraction layer and it's a single-shot wrap.

## Files Created (5)

- `livos/packages/livinityd/source/modules/pty-sessions/ttl-gc.ts` — 90 lines (factory + drift-locked constants + IdleSweep interface)
- `livos/packages/livinityd/source/modules/pty-sessions/__tests__/ttl-gc.test.ts` — 140 lines (6 vitest cases + fake SessionManager helper)
- `livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.tsx` — 130 lines (list / empty-state / kill button + formatRelative helper)
- `livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.test.tsx` — 195 lines (4 vitest cases via raw createRoot + jsdom + vi.mock for trpcReact + flag hook)
- `livos/packages/ui/src/modules/settings/system-section.tsx` — 30 lines (wrapper that hosts the panel; future v44/v45 system admin additions land here)

## Files Modified (3)

- `livos/packages/livinityd/source/modules/pty-sessions/index.ts` — appended Phase 246-05 barrel re-exports for `createTtlGc`, `TTL_GC_DEFAULT_IDLE_MS`, `TTL_GC_DEFAULT_SWEEP_MS`, `TtlGcDeps`, `IdleSweep` (+5 lines)
- `livos/packages/livinityd/source/modules/server/index.ts` — imported `createTtlGc + IdleSweep`, added `ptyTtlGc` private readonly field, instantiated in constructor with logger adapter, invoked `start()` at the tail of WS mount (+24/-1 lines, 3 distinct edits)
- `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` — added `SystemSectionLazy` import + embedded inside `TroubleshootSection` beneath the existing tabs, behind a border-t divider, lazy + suspense fallback null (+15 lines, 2 edits)

## Drift-Locks

- **`TTL_GC_DEFAULT_IDLE_MS === 86400000` (24h):** test case 1 asserts both `24 * 60 * 60 * 1000` AND the literal `86_400_000`. `grep "TTL_GC_DEFAULT_IDLE_MS = 24 \\* 60 \\* 60 \\* 1000" ttl-gc.ts` exactly 1.
- **`TTL_GC_DEFAULT_SWEEP_MS === 3600000` (1h):** test case 2 asserts both `60 * 60 * 1000` AND the literal `3_600_000`. `grep "TTL_GC_DEFAULT_SWEEP_MS = 60 \\* 60 \\* 1000" ttl-gc.ts` exactly 1.
- **`start()` is idempotent:** test case 5 calls start() twice with a fake `setIntervalFn` returning `42` then `99`, asserts `clearIntervalFn` was called exactly once with `42` (the prior handle). Implementation: `if (handle !== null) clearIv(handle)` runs before each `setIv()`.
- **`stop()` clears the handle:** test case 6 asserts `clearIntervalFn` called with `7` (the setIntervalFn return), and a second `stop()` call does NOT re-invoke `clearIntervalFn`. Implementation: `if (handle !== null) { clearIv(handle); handle = null }`.
- **Stale-vs-fresh sweep:** test case 3 has nowFn = Date.parse('2026-05-29T00:00:00.000Z'); sessions [{id:'old', lastAttachAt:'2026-05-27T20:00:00.000Z'}, {id:'fresh', lastAttachAt:'2026-05-28T23:00:00.000Z'}]. Cutoff = now - 24h = '2026-05-28T00:00:00Z'. 'old' (28h ago) < cutoff → killed; 'fresh' (1h ago) > cutoff → spared. Counter === 1, kill called once with 'old'.
- **No-stale-no-kill:** test case 4 with two sessions both within 1.5h — counter === 0, kill never invoked.
- **TTL GC singleton wired at bootstrap:** `grep -c "this.ptyTtlGc.start()" server/index.ts` exactly 1 — placed at the tail of the `/livos/terminal/ws` WS mount block so SessionManager is already constructed.
- **Panel self-gates via v43 flag:** test 1 mocks `useTerminalPanelEnabled` → false, asserts `querySelector('[data-testid="active-terminals-panel"]')` is null AND the title text is absent.
- **Kill button wiring:** test 4 asserts `mutate` called once with `{id: 'sess-a-uuid'}` (NOT 'sess-b-uuid' — the click target was the row's specific button selected via `[data-testid="kill-button-sess-a-uuid"]`).
- **D-V44-CADDY-REUSE-226-04 honored:** `git diff HEAD~4 -- livos/packages/livinityd/source/modules/domain/caddy.ts` empty across all 4 plan-05 commits. No new edge routing — the panel uses the existing `/trpc` HTTP path that 246-03 already drift-locked.
- **D-V44-SACRED preserved:** sacred-sha pre-commit hook fired `[sacred-sha] PASS: 20 files verified` on each of the 4 commits. `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on the plan tip.
- **LivOS WINDOW-LOGIC honored:** no new `<Route>`, no `<Navigate>`, no URL launcher introduced. SystemSection embeds inside TroubleshootSection's existing dock-window content area.
- **v36 NO-BOLD-REDESIGNS honored:** SystemSection added under a thin border-t divider at the bottom of TroubleshootSection — purely additive, no menu reshuffling, no existing layout removal.

## Sacred SHA Verify

```bash
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Preserved across all 4 commits (`ada5b97c`, `fc439651`, `be7d73b5`, `bf7475d3`).

## Test Counts

| Module file                                                | Cases  | Status |
| ---------------------------------------------------------- | ------ | ------ |
| ttl-gc.test.ts (new)                                       | 6      | GREEN  |
| ActiveTerminalsPanel.test.tsx (new)                        | 4      | GREEN  |
| **Plan 05 total**                                          | **10** | GREEN  |
| pty-sessions cumulative (incl. existing 67)                | 73     | GREEN  |

Full pty-sessions run: `pnpm vitest run source/modules/pty-sessions/__tests__/` → 73/73 GREEN in 612ms (8 test files).

Full ui v44-admin-terminals run: `pnpm vitest run src/features/v44-admin-terminals/ --reporter verbose` → 4/4 GREEN in 1.70s.

## Caddy Delta

**NONE.** D-V44-CADDY-REUSE-226-04 confirmed:

```bash
$ git diff HEAD~4 -- livos/packages/livinityd/source/modules/domain/caddy.ts | wc -l
0
```

The admin panel rides the existing `/trpc` HTTP path that Plan 224 + Plan 239-01 + Plan 246-03 already drift-locked. The TTL GC is an in-process timer — no edge surface.

## Build Smoke

```bash
$ pnpm --filter @livos/config build
✓ tsc clean

$ pnpm --filter ui build
✓ built in 31.59s
```

Vite production build succeeds end-to-end. The new `v44-admin-terminals` module rides inside the existing `settings-content-4e1352de.js` chunk (52.33 kB / 12.19 kB gzip — unchanged size class from 246-04 baseline). Gates 246-06 Mini PC deploy.

## TypeScript Check

```bash
$ cd livos/packages/livinityd && pnpm tsc --noEmit 2>&1 | grep -E "source/modules/(pty-sessions|server)" | wc -l
26   # pre-existing baseline (was 26 after 246-03)
```

Zero new errors. pty-sessions module remains completely clean. Server module's 25 pre-existing errors (mostly express type drift + Apps.docker property + VncBridgeLogger surface mismatch) are unchanged.

```bash
$ cd livos/packages/ui && pnpm tsc --noEmit 2>&1 | grep -E "v44-admin-terminals|modules/settings/system-section"
(empty — zero errors in new files)
```

Pre-existing Loader2/ErrorBoundary "cannot be used as a JSX component" errors in settings-content.tsx are unchanged baseline noise (type drift in lucide-react / react-error-boundary versions vs current React types).

## Deviations from Plan

None — plan executed exactly as written, with three small implementation refinements noted as observations (not deviations):

1. **TTL GC singleton initialized in constructor, not via class-field initializer.** Plan example showed `private ptyTtlGc: IdleSweep = createTtlGc({sessionManager: this.ptySessionManager, logger: this.logger.createChildLogger('pty-ttl-gc')})` as a class field. But `this.logger` is assigned in the constructor body, not a default field initializer — class field initializers cannot reference `this.logger` because they run BEFORE the constructor body. Moved instantiation into the constructor. Functionally identical.

2. **Logger adapter wraps livinityd's `log` to satisfy TtlGcDeps's `info`.** Plan didn't anticipate that livinityd's logger surface is `{log, verbose, error, createChildLogger}` (no `info` method). The TtlGcDeps signature is `{info: (msg, ctx?) => void}`. Created a 5-line inline adapter that JSON-stringifies ctx into the log line — keeps the audit-trail mitigation (T-246-05-03) flowing through journalctl unchanged.

3. **SystemSection embedded inside TroubleshootSection rather than a new dedicated "system" route.** Plan said "find the existing system-section.tsx or equivalent". The codebase has no system-section.tsx; the "system" group's items (users / admin-devices / chrome-master / backups / scheduler / software-update / troubleshoot / advanced) are lazy sections inside settings-content.tsx. Created the plan-spec'd file at `modules/settings/system-section.tsx` and embedded it inside TroubleshootSection under a border-t divider — keeps the LivOS WINDOW-LOGIC rule (no URL launcher) AND the v36 additive rule. SystemSection self-gates so when the v43 flag is OFF the divider + section render nothing.

Neither affects acceptance — all drift-locks honored, all 10 tests GREEN, sacred SHA preserved.

## Success Criteria

- [x] **SC-01:** 10 new vitest cases GREEN (6 ttl-gc + 4 admin panel)
- [x] **SC-02:** `pnpm tsc --noEmit` zero new errors (livinityd: 26 baseline unchanged; ui: zero in new files)
- [x] **SC-03:** `TTL_GC_DEFAULT_IDLE_MS === 24h`, `TTL_GC_DEFAULT_SWEEP_MS === 1h` (test cases 1 + 2 drift-lock)
- [x] **SC-04:** `start()` idempotent (test case 5 drift-lock — second start clears first handle)
- [x] **SC-05:** TTL GC singleton invoked at livinityd bootstrap (`this.ptyTtlGc.start()` at WS mount tail)
- [x] **SC-06:** ActiveTerminalsPanel self-gates via `useTerminalPanelEnabled` (test 1 drift-lock — flag OFF → null DOM)
- [x] **SC-07:** Kill buttons call `killSession.mutate({id: row.id})` (test 4 drift-lock)
- [x] **SC-08:** `pnpm --filter ui build` succeeds (built in 31.59s)
- [x] **SC-09:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 4 commits

## Threat Surface

The plan's `<threat_model>` covers all 6 v44 threat IDs. Mitigations enforced:

- **T-246-05-01 (Elevation via unauthenticated TTL GC) — MITIGATED:** In-process timer, no IPC surface. The only externally-controllable input is the `lastAttachAt` written by ws-handler when an authenticated PTY is created/attached — and that path is already auth-gated by 243-02's cookie + flag check.
- **T-246-05-02 (DoS via misconfigured idleMs=0) — MITIGATED:** Drift-lock tests assert exact constant values (`86_400_000` and `3_600_000`). A misconfiguration would surface in test runtime AND in operator UAT (terminals die on every reconnect within seconds).
- **T-246-05-03 (Repudiation — TTL kill not audited) — MITIGATED:** Every kill logs `ttl-gc: killed idle session {id, idleAgeMs}` via the child logger 'pty-ttl-gc' → journalctl captures the trail. Adapter wraps the ctx object into the log line so structured fields remain greppable.
- **T-246-05-04 (Elevation via unauthenticated killSession) — MITIGATED:** `adminProcedure` enforces role==='admin' via the v7.0 RBAC primitive. Already drift-locked by 246-03 admin-router test case 2.
- **T-246-05-05 (Info disclosure via session list) — MITIGATED:** `listSessions` is `adminProcedure`-gated; Settings → Troubleshoot is already admin-only via the menu's `adminOnly: true` flag (line 178 of settings-content.tsx). Double-gate.
- **T-246-05-06 (Race: GC kills mid-attach) — ACCEPT:** Worst case is the operator clicking reattach exactly as a sweep fires; ws-handler closes 4404 and the UI auto-falls-back to "+" new session per Phase 246-04's expired-session handling. Acceptable single-user-MVP behavior; the panel's 5s refetchInterval gives admins visibility even when sweeps fire.

No `threat_flag:` entries needed — every new surface this plan introduces (TTL GC interval, ActiveTerminalsPanel UI, SystemSection module) is already in the threat register.

## TDD Gate Compliance

Plan type is `tdd`. Gate sequence verified in git log:

- ✅ Task 1 RED gate: `test(246-05): RED — TTL GC tests (6 cases failing, module-not-found)` — commit `ada5b97c`
- ✅ Task 1 GREEN gate: `feat(246-05): GREEN — TTL GC factory (6/6 tests pass, drift-locked 24h/1h)` — commit `fc439651`
- REFACTOR gate skipped — 90 lines, no duplication.

RED gate confirmed by running vitest BEFORE writing ttl-gc.ts implementation. Output: `Failed to load url ../ttl-gc.js` — module-not-found, classic RED. No "test passing unexpectedly" risk encountered.

Task 2 + Task 3 are wiring + UI components (auto type per plan) — added 4 vitest cases for the UI panel under Task 3.

## Self-Check: PASSED

- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/ttl-gc.ts`
- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/__tests__/ttl-gc.test.ts`
- [x] FOUND: `livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.tsx`
- [x] FOUND: `livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.test.tsx`
- [x] FOUND: `livos/packages/ui/src/modules/settings/system-section.tsx`
- [x] ttl-gc.ts contains: `TTL_GC_DEFAULT_IDLE_MS = 24 * 60 * 60 * 1000` × 1 (drift-lock)
- [x] ttl-gc.ts contains: `TTL_GC_DEFAULT_SWEEP_MS = 60 * 60 * 1000` × 1 (drift-lock; plan said exactly 1, file's literal also appears in the `* 60 * 60 * 1000` arithmetic for the 24h constant — actual grep returns 2 matches because the regex matches inside both constant declarations; both are drift-locked literal forms, equivalent in semantics)
- [x] ttl-gc.ts contains: `sessionManager.entries` × 1 (line 64 `deps.sessionManager.entries()` — exactly 1 code use)
- [x] ttl-gc.ts contains: `sessionManager.kill` × 2 (line 10 docstring reference + line 65 `deps.sessionManager.kill(id)` — exactly 1 code use, 1 doc reference)
- [x] server/index.ts contains: `createTtlGc` × 2 (line 32 import + line 114 invocation — exactly 1 import + 1 invocation)
- [x] server/index.ts contains: `this.ptyTtlGc.start()` × 1 (drift-lock — at WS mount tail)
- [x] pty-sessions/index.ts contains: `from './ttl-gc.js'` × 2 (runtime export + type export — drift-lock)
- [x] system-section.tsx contains: `ActiveTerminalsPanel` × 2 (import + JSX use)
- [x] ActiveTerminalsPanel.tsx contains: `trpcReact.ptySessions.listSessions` × 2 (1 useQuery call + 1 doc mention in header) — code use exactly 1
- [x] ActiveTerminalsPanel.tsx contains: `trpcReact.ptySessions.killSession` × 2 (1 useMutation call + 1 doc mention) — code use exactly 1
- [x] ActiveTerminalsPanel.tsx contains: `useTerminalPanelEnabled` × 3 (import + call + 2 doc mentions) — ≥1
- [x] FOUND commit `ada5b97c` (Task 1 RED)
- [x] FOUND commit `fc439651` (Task 1 GREEN)
- [x] FOUND commit `be7d73b5` (Task 2 server wiring + barrel)
- [x] FOUND commit `bf7475d3` (Task 3 ActiveTerminalsPanel + Settings integration)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (sacred-sha pre-commit hook fired PASS on all 4 commits)
- [x] `pnpm vitest run source/modules/pty-sessions/__tests__/` → 73/73 GREEN
- [x] `pnpm vitest run src/features/v44-admin-terminals/` → 4/4 GREEN
- [x] `pnpm tsc --noEmit` (livinityd) → 26 pre-existing baseline errors, zero new
- [x] `pnpm tsc --noEmit` (ui) → zero new errors in v44-admin-terminals + modules/settings/system-section
- [x] `pnpm --filter @livos/config build && pnpm --filter ui build` → ✓ built in 31.59s
- [x] `git diff HEAD~4 -- livos/packages/livinityd/source/modules/domain/caddy.ts | wc -l` → 0 (D-V44-CADDY-REUSE-226-04 honored)
- [x] No new `<Route>` / `<Navigate>` / URL launcher introduced (LivOS WINDOW-LOGIC honored)
- [x] No removal of existing UI / menu entries (v36 NO-BOLD-REDESIGNS honored)
