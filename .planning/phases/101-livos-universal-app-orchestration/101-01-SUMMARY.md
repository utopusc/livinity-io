---
phase: 101-livos-universal-app-orchestration
plan: 01
subsystem: chrome-cdp
tags: [chrome, cdp, bootstrap, devtools-protocol, livinityd, wave-1, foundation]

# Dependency graph
requires:
  - phase: 101-livos-universal-app-orchestration
    plan: 00
    provides: chrome-remote-interface@^0.34.0 + @types installed in livinityd workspace; chrome-cdp/{bootstrap,client}.test.ts stub files on disk
provides:
  - livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts — bootstrapChrome() + ChromeBootstrapTimeoutError
  - livos/packages/livinityd/source/modules/chrome-cdp/client.ts — ChromeCdpClient + CdpTimeoutError/CdpDisconnectedError typed errors
  - livos/packages/livinityd/source/modules/chrome-cdp/index.ts — barrel re-exports
  - livinityd.chromeCdpClient field (ChromeCdpClient | null) — Wave 2+ consumers pull from here
  - Chrome process at boot on Mini PC bound to 127.0.0.1:9222 (T-101-01 mitigation pinned in argv)
  - About:blank shell window minimized via SEPARATE setWindowBounds call (RESEARCH correction #1)
affects:
  - 101-04 (CDP-driven WebApp spawn — depends on chromeCdpClient.createWindowForUrl)
  - 101-08 (Teach v3 — may consume CDP for Chrome-tier click capture)
  - 101-10 (UAT rows 1, 2: /json/version 200 + single pgrep match)

# Tech tracking
tech-stack:
  added:
    - bootstrapChrome lifecycle helper (D-99-07 stderr-tail pattern from vnc-bridge.ts)
    - ChromeCdpClient typed wrapper (split setWindowBounds — RESEARCH correction #1)
  patterns:
    - "Two-call setWindowBounds: bounds-only (left/top/width/height) vs state-only (windowState). CDP rejects them combined; the wrapper enforces the split inside createWindowForUrl + minimizeWindow."
    - "Injectable cdpFactory / spawnFn / fetchFn for tests — no real Chrome, no real socket, no real HTTP needed."
    - "Degenerate-degrade try/catch inside livinityd.start() — Chrome bootstrap failure does NOT crash livinityd; chromeCdpClient stays null; downstream consumers null-check."

key-files:
  created:
    - livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts (191 lines)
    - livos/packages/livinityd/source/modules/chrome-cdp/client.ts (244 lines)
    - livos/packages/livinityd/source/modules/chrome-cdp/index.ts (28 lines, barrel)
  modified:
    - livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts (stub → 7 cases, 215 lines)
    - livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts (stub → 12 cases, 261 lines)
    - livos/packages/livinityd/source/index.ts (import + class field + try/catch boot block; +60 net)

key-decisions:
  - "RESEARCH correction #1 enforced at the wrapper: createWindowForUrl emits a SECOND bounds-only setWindowBounds call when {left, top} is requested; minimizeWindow emits its OWN state-only call. Tests assert both payloads do NOT contain the forbidden combined fields."
  - "T-101-01 mitigation pinned in CHROME_ARGS: --remote-debugging-address=127.0.0.1 alongside --remote-debugging-port=9222. Without this Chrome binds 0.0.0.0:9222 and any LAN host could drive arbitrary CDP commands."
  - "chromeCdpClient is a class field (ChromeCdpClient | null), not a constructor-time singleton. Lazy construction inside start() makes the bootstrap failure path clean (stays null) and lets Wave 2+ consumers null-check before reaching for the client."
  - "Bootstrap try/catch is INNER to the outer streaming-subsystem try (lines 362-482). Symmetric with the StreamManager pattern: Pillar A degradation is non-fatal for livinityd boot."
  - "getWindowIdForTarget public helper added on the wrapper so the about:blank minimize path in livinityd.start() doesn't have to reach into the private this.client field (clean encapsulation)."

patterns-established:
  - "chrome-cdp module exports via barrel index.ts — keeps consumer imports stable across future file splits."
  - "Test-first scaffolding: 19 test cases (7 bootstrap + 12 client) define the wrapper surface BEFORE Wave 2 consumers attach. Wave 2 plans can grep these tests to discover the API shape."

requirements-completed: [D-101-CHROME-CDP, D-101-SHARED-PROFILE, D-101-SACRED]

# Metrics
duration: 35min
completed: 2026-05-11
---

# Phase 101 Plan 01: Chrome CDP Bootstrap Summary

**Spawn singleton Chrome with --remote-debugging-port=9222 bound to 127.0.0.1 at livinityd boot; expose a typed CDP wrapper (ChromeCdpClient) with split setWindowBounds calls per RESEARCH correction #1; bootstrap failure degrades Pillar A but keeps livinityd alive.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 5/5
- **Files created:** 3 (bootstrap.ts, client.ts, index.ts barrel)
- **Files modified:** 3 (bootstrap.test.ts, client.test.ts, source/index.ts)
- **Test cases:** 19 (7 bootstrap + 12 client) — all green via vitest@2.1.9
- **Total commits:** 4 (one per Task 1-4; Task 5 merges into this SUMMARY commit)

## Accomplishments

- **Singleton Chrome CDP at livinityd boot** — `bootstrapChrome()` spawns `google-chrome` with the canonical 10-flag CDP argv on `DISPLAY=:1`, polls `http://localhost:9222/json/version` every 200 ms until 200 OK (or 10 s timeout), and returns `{pid, child}`. SIGKILL on timeout. T-101-01 mitigation (loopback-only bind) pinned in source.
- **Typed CDP wrapper** — `ChromeCdpClient` wraps `chrome-remote-interface` with `connect()`/`ensureConnected()` lifecycle (5-retry × 200 ms backoff → `CdpTimeoutError` on exhaustion), disconnect handler that lazy-reconnects, and high-level surface: `createWindowForUrl`, `minimizeWindow`, `closeTarget`, `findTargetByUrl`, `getWindowIdForTarget`.
- **RESEARCH correction #1 enforced at TWO call sites** — `createWindowForUrl` emits a SECOND bounds-only `setWindowBounds` call when `{left, top}` is requested; `minimizeWindow` emits its OWN state-only call. Two dedicated tests assert the absence of the forbidden combined fields in each payload.
- **livinityd.start() wire-up** — Inside the existing streaming-subsystem try (after StreamManager + Xvfb :1 + fluxbox, before WebAppWindowManager), bootstrap Chrome, connect the CDP client, then minimize the about:blank shell window via a SEPARATE state-only call. Inner try/catch keeps the rest of `start()` going if Chrome doesn't come up.
- **Sacred SHA preserved** — `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified at start AND after each of the four commits.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `995000d1` | `chore(101-01): chrome-cdp barrel + verify deps from 101-00` — index.ts barrel; deps confirmed installed by 101-00. |
| 2 | `11aee728` | `feat(101-01): ChromeCdpClient typed wrapper with split setWindowBounds` — client.ts + client.test.ts (12 cases). |
| 3 | `eba29916` | `feat(101-01): bootstrapChrome spawn helper with /json/version poll` — bootstrap.ts + bootstrap.test.ts (7 cases). |
| 4 | `23d9806f` | `feat(101-01): wire Chrome CDP bootstrap into livinityd.start()` — source/index.ts import + class field + inner try/catch. |

Task 5 (sacred-SHA post-verify + final stage) is folded into this SUMMARY commit since per-task commits already landed atomically (worktree mode — `--no-verify` per parallel-execution rules; orchestrator validates pre-commit hooks centrally after merge).

## Files Created/Modified

### Created

**`livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts`** (191 lines)
- `bootstrapChrome(opts: BootstrapOpts): Promise<ChromeBootstrapHandle>`
- `class ChromeBootstrapTimeoutError extends Error` with `code = 'CHROME_BOOTSTRAP_TIMEOUT'`
- `CHROME_ARGS` pinned array — 10 flags including T-101-01 mitigation.
- 50-line stderr ring buffer dumped on non-zero exit (D-99-07 pattern).
- Injectable `spawnFn` / `fetchFn` for test isolation.

**`livos/packages/livinityd/source/modules/chrome-cdp/client.ts`** (244 lines)
- `class ChromeCdpClient` with `connect`, `ensureConnected`, `createWindowForUrl`, `minimizeWindow`, `closeTarget`, `findTargetByUrl`, `getWindowIdForTarget`, `close`.
- Typed errors: `CdpDisconnectedError` (`code = 'CDP_DISCONNECTED'`), `CdpTimeoutError` (`code = 'CDP_TIMEOUT'`).
- Default host/port: `127.0.0.1` / `9222`. Override via `ChromeCdpClientOpts`.
- Injectable `cdpFactory` opt for test isolation.

**`livos/packages/livinityd/source/modules/chrome-cdp/index.ts`** (28 lines)
- Barrel re-exporting all public symbols from bootstrap.ts + client.ts.

### Modified

**`livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts`** — Wave 0 stub (8 lines, single `it.skip`) replaced with 7 real cases:
1. resolves with `{pid, child}` on 200 OK
2. retries fetch until success (multi-step sequence)
3. rejects with `ChromeBootstrapTimeoutError` after `readyTimeoutMs`
4. argv contains every required flag including `--remote-debugging-address=127.0.0.1`
5. spawn env contains `DISPLAY=:1` by default; honors override
6. stderr tail captures + caps at 50 lines, logs on non-zero exit (52-line overflow proves rotation: last line present, first line gone)
7. SIGKILL invoked on timeout

**`livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts`** — Wave 0 stub (8 lines, single `it.skip`) replaced with 12 real cases:
1. default host/port wiring (`127.0.0.1` / `9222`)
2. `connect()` resolves on factory success
3. `connect()` exhausts retries → `CdpTimeoutError`
4. disconnect handler nulls client; `ensureConnected` lazy-reconnects (factory called twice)
5. `createWindowForUrl` returns `{targetId, windowId}` from mocked `Target.createTarget` + `Browser.getWindowForTarget`
6. `createWindowForUrl` WITH `{left, top}` issues SECOND bounds-only `setWindowBounds` — **payload does NOT contain `windowState`** (RESEARCH correction #1 flank A)
7. `createWindowForUrl` WITHOUT `{left, top}` does NOT issue a second call
8. `minimizeWindow` issues `setWindowBounds` with `windowState` only — **payload does NOT contain left/top/width/height** (RESEARCH correction #1 flank B)
9. `closeTarget` calls `Target.closeTarget({targetId})`
10. `findTargetByUrl` matches via predicate; returns null on miss
11. `getWindowIdForTarget` wraps `Browser.getWindowForTarget`
12. `CdpDisconnectedError` shape exported with `code` field

**`livos/packages/livinityd/source/index.ts`** (+~60 net lines)
- Import: `import {bootstrapChrome, ChromeCdpClient} from './modules/chrome-cdp/index.js'`
- New field: `chromeCdpClient: ChromeCdpClient | null = null`
- Boot block between Xvfb/fluxbox up and `webappLogger` construction:
  - `chromeCdpLogger` adapter (matches existing streamingLogger pattern — single-arg signatures)
  - `bootstrapChrome({display, logger})` → `{pid, child}`
  - `this.chromeCdpClient = new ChromeCdpClient({logger})` + `await connect()`
  - `findTargetByUrl(u => u.startsWith('about:blank'))` → `getWindowIdForTarget` → `minimizeWindow`
  - Inner try/catch logs `Chrome CDP bootstrap failed; continuing without CDP (Pillar A degraded)` and keeps going

## Wire-up snippet (lives in `livinityd.start()`)

```typescript
// Phase 101-01 — Chrome CDP bootstrap. Spawn the singleton Chrome with
// --remote-debugging-port=9222 bound to 127.0.0.1 only (T-101-01
// mitigation), wait for /json/version to return 200, then open a
// persistent CDP connection. The about:blank shell window opened by
// --new-window=about:blank is minimized via a SEPARATE setWindowBounds
// call after connect (RESEARCH correction #1: CDP rejects state+bounds
// in one call).
try {
  const chromeCdpLogger = (() => {
    const c = this.logger.createChildLogger('chrome-cdp')
    return {
      info: (msg: string) => c.log(msg),
      warn: (msg: string, error?: unknown) => c.error(msg, error),
      error: (msg: string, error?: unknown) => c.error(msg, error),
      verbose: (msg: string) => c.verbose(msg),
    }
  })()
  const {pid: chromePid} = await bootstrapChrome({
    display: process.env.WEBAPPS_X11_DISPLAY ?? ':1',
    logger: chromeCdpLogger,
  })
  this.chromeCdpClient = new ChromeCdpClient({logger: chromeCdpLogger})
  await this.chromeCdpClient.connect()
  chromeCdpLogger.info(`Chrome CDP ready (pid=${chromePid})`)
  try {
    const blank = await this.chromeCdpClient.findTargetByUrl(
      (u) => u === 'about:blank' || u.startsWith('about:blank'),
    )
    if (blank) {
      const windowId = await this.chromeCdpClient.getWindowIdForTarget(blank.targetId)
      await this.chromeCdpClient.minimizeWindow(windowId)
      chromeCdpLogger.verbose(`minimized about:blank shell window (windowId=${windowId})`)
    }
  } catch (e) {
    chromeCdpLogger.warn(`Could not minimize about:blank shell: ${(e as Error).message}`)
  }
} catch (err) {
  this.logger.error(
    'Chrome CDP bootstrap failed; continuing without CDP (Pillar A degraded)',
    err,
  )
}
```

## Decisions Made

- **Two-call setWindowBounds (RESEARCH correction #1)** — Both call sites enforce the split:
  - `createWindowForUrl({left, top})` → `setWindowBounds({windowId, bounds: {left, top, width, height}})` (bounds only, no `windowState`)
  - `minimizeWindow(windowId)` → `setWindowBounds({windowId, bounds: {windowState: 'minimized'}})` (state only, no left/top/width/height)
  - Tests explicitly assert `expect(call.bounds).not.toHaveProperty('windowState')` and the inverse for minimize. Refactors that accidentally combine them will turn the tests red.
- **T-101-01 mitigation in source, not config** — `--remote-debugging-address=127.0.0.1` is in `CHROME_ARGS` itself, not env-derived. Auditable in one place; tests assert presence.
- **chromeCdpClient stays null on bootstrap failure** — Wave 2+ consumers (Plan 101-04 window-manager rewrite) MUST null-check. Keeps the API surface honest about Pillar A degradation rather than throwing on every CDP call.
- **getWindowIdForTarget public helper** — Wanted by Task 4's about:blank minimize path; cleaner than reaching into `this.client.Browser.getWindowForTarget` (private member tunneling). Tests added (test case 11).
- **CdpDisconnectedError exported but not thrown today** — kept as a guard-rail class for future consumers that want to refuse the lazy reconnect (e.g. shutdown path). Tests assert export shape (case 12).
- **Adapter shape for chrome-cdp logger** — Matches the existing streamingLogger/webappLogger pattern in start() (single-arg `info`/`verbose`, two-arg `warn`/`error` taking optional error). Rest-arg shape from the plan caused TS2556; collapsed to the existing single-error-arg convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's `this.logger.child({mod: 'chrome-cdp'})` call doesn't exist on livinityd's logger**
- **Found during:** Task 4 wire-up typecheck
- **Issue:** Plan's snippet referenced `this.logger.child({mod: 'chrome-cdp'})` (winston-style), but livinityd's logger exposes `createChildLogger(scope: string)` with `log`/`verbose`/`error` methods, not `child(opts)` with `info`/`warn`/`error`.
- **Fix:** Adopted the existing wire-up pattern from start() (streamingLogger / webappLogger): wrap `createChildLogger('chrome-cdp')` in an adapter that maps the ChromeCdpLogger interface to the livinityd logger surface.
- **Files modified:** `livos/packages/livinityd/source/index.ts`
- **Commit:** `23d9806f` (Task 4)

**2. [Rule 1 - Bug] Plan's `(this.chromeCdpClient as any)['client'].Browser.getWindowForTarget` tunnel through private member**
- **Found during:** Task 4 wire-up design review
- **Issue:** The plan's about:blank minimize snippet reached into `client.ts`'s private `this.client` field via `(this.chromeCdpClient as any)['client']`. This breaks encapsulation and would silently break if `client.ts` renames the field.
- **Fix:** Added a public `getWindowIdForTarget(targetId: string): Promise<number>` method on `ChromeCdpClient` that wraps `Browser.getWindowForTarget`. Used it in start(). Added test case 11 to cover.
- **Files modified:** `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` (new method), `client.test.ts` (new case), `source/index.ts` (use new helper instead of private tunnel)
- **Commits:** `11aee728` (Task 2 — helper + test) and `23d9806f` (Task 4 — wire-up uses the helper)

**3. [Rule 3 - Blocking] vitest binary missing — pnpm install needed at worktree start**
- **Found during:** Task 2 first test run
- **Issue:** Fresh worktree had no `node_modules/.bin/vitest`. `npx vitest` resolved to a global v4 install which couldn't find the local tsconfig.
- **Fix:** Ran `pnpm install --frozen-lockfile` from `livos/` root. Postinstall step for `ui` package fails on Windows (`mkdir -p` POSIX syntax under cmd.exe), pre-existing per 101-00-SUMMARY — but `node_modules/.bin/vitest` was provisioned before the failure, so the livinityd test runs proceeded.
- **Files modified:** none (install side-effect only; no commit)
- **Verification:** `pnpm --filter livinityd test:run source/modules/chrome-cdp/` exits 0 with 19/19 green.

**4. [Rule 3 - Blocking] TS2556 spread-arg error in chromeCdpLogger adapter**
- **Found during:** Task 4 typecheck
- **Issue:** First draft used `(msg: string, ...args: unknown[]) => c.log(msg, ...args)` but the livinityd logger's `log` signature is `(message?: string) => void` — no rest support.
- **Fix:** Collapsed rest-args to the single-error-arg shape used by streamingLogger/webappLogger.
- **Files modified:** `livos/packages/livinityd/source/index.ts`
- **Commit:** `23d9806f` (folded into Task 4 commit before stage)

**5. [Rule 3 - Blocking] TS error in bootstrap.test.ts spawnFn.mock.calls[0] tuple destructure**
- **Found during:** Task 4 typecheck
- **Issue:** `const [, args] = spawnFn.mock.calls[0]` widened to `[]` under TS strict because `vi.fn(() => child as any)` infers no parameter tuple.
- **Fix:** Cast `spawnFn.mock.calls[0] as unknown as [string, string[], unknown]` then index by position. Same assertion semantics, no `any` leak.
- **Files modified:** `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts`
- **Commit:** `23d9806f` (Task 4)

### Out-of-Scope Documentation

- **Pre-existing TS error at `source/index.ts:54` (`Cannot find module '@liv/core/lib'`)** is not mine. It predates this plan — introduced in commit `77262fee` (Phase 100-08-04, McpConfigManager wire). Filtered typecheck of files touched by this plan emits only that pre-existing line. Out of scope per scope-boundary rule; documented in `deferred-items.md` ALREADY (per 101-00 deferred section).

### Architectural deviations: NONE

The wire-up sits exactly where the plan specified (between StreamManager start and WebAppWindowManager construction) and the bootstrap try/catch sits inside the existing outer streaming-subsystem try (degenerate-degrade preserved).

---

**Total deviations:** 5 auto-fixed (3× Rule 3 blocking, 2× Rule 1 bug) + 1 out-of-scope documentation.
**Impact:** None on success criteria. All 19 tests green; sacred SHA preserved; all acceptance criteria met.

## Issues Encountered

- **Windows `pnpm install` postinstall step fails** for `packages/ui` (mkdir -p POSIX syntax under cmd.exe). Pre-existing; same behavior documented in 101-00-SUMMARY.md. The icons directory already exists in source so the missing copy is harmless. livinityd workspace `node_modules` provisioned cleanly; vitest works.
- **TypeScript module resolution `@liv/core/lib`** still unresolved at `source/index.ts:54`. Predates this plan. Build (`tsc --noEmit`) emits 80+ errors — all pre-existing, all in unrelated files (`webapps/trpc-router.ts`, `webapps/pipewire-portal.test.ts`, `widgets/routes.ts`, etc.). My new files type-check clean when filtered.
- **No real Chrome on Windows host** for live smoke test. The Wave 1 plan deliverable is the code; the live boot test belongs to Plan 101-10 UAT on Mini PC (rows 1, 2: `curl http://localhost:9222/json/version` + `pgrep -af 'google-chrome.*--remote-debugging-port=9222'`).

## Verification Results

- [x] `pnpm --filter livinityd test:run source/modules/chrome-cdp/bootstrap.test.ts` → **7/7 green**
- [x] `pnpm --filter livinityd test:run source/modules/chrome-cdp/client.test.ts` → **12/12 green**
- [x] `pnpm --filter livinityd test:run source/modules/chrome-cdp/` → **19/19 green** (total)
- [x] `grep -q '"chrome-remote-interface"' livos/packages/livinityd/package.json` → 0 (present from 101-00)
- [x] `grep -q '"@types/chrome-remote-interface"' livos/packages/livinityd/package.json` → 0 (present from 101-00)
- [x] `test -f livos/packages/livinityd/source/modules/chrome-cdp/{bootstrap,client,index}.ts` → all present
- [x] `grep -c 'setWindowBounds' livos/packages/livinityd/source/modules/chrome-cdp/client.ts` → 6 (≥ 2 required)
- [x] `grep -q -- '--remote-debugging-address=127.0.0.1' livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts` → 0 (T-101-01 mitigation)
- [x] `grep -q 'bootstrapChrome' livos/packages/livinityd/source/index.ts` → 0
- [x] `grep -q 'ChromeCdpClient' livos/packages/livinityd/source/index.ts` → 0
- [x] **Sacred SHA pre+post:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## Threat Flags

None new. The plan's `<threat_model>` covers:
- **T-101-01 Information Disclosure / Elevation** (CDP socket exposure) — **mitigated** in source via `--remote-debugging-address=127.0.0.1` pinned in CHROME_ARGS. Verified by test case 4 in bootstrap.test.ts which explicitly asserts the flag is present in argv.
- **T-101-01b Denial of Service** (Chrome crash) — **mitigated** via disconnect handler + `ensureConnected` lazy-reconnect (client.ts) and the inner try/catch in livinityd.start() (Pillar A degrades, livinityd lives).

No new threat surface introduced beyond what the plan declared.

## User Setup Required

None — Plan 101-10 (Wave 4 UAT) will handle the live Mini PC verification:
- `curl http://localhost:9222/json/version` should return JSON
- `pgrep -af 'google-chrome.*--remote-debugging-port=9222'` should return exactly one PID

## Next Plan Readiness

Plan 101-04 (CDP-driven WebApp spawn, Wave 2) is unblocked:
- `livinityd.chromeCdpClient: ChromeCdpClient | null` field on the instance is the entry point
- `createWindowForUrl(url, {width, height, left?, top?, background?})` returns `{targetId, windowId}` — exactly the shape `window-manager.ts:spawn()` rewrite needs
- `closeTarget(targetId)` for the close path
- `findTargetByUrl(predicate)` for adoption flows (existing about:blank detection style)

Plans 101-02 (port allocator) and 101-03 (native app spawn) are parallel-wave siblings — independent of 101-01's output.

## Self-Check: PASSED

Verified post-creation:

- [x] `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts` exists (`191 lines`)
- [x] `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` exists (`244 lines`)
- [x] `livos/packages/livinityd/source/modules/chrome-cdp/index.ts` exists (`28 lines`, barrel)
- [x] `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts` has 7 real cases (stub from 101-00 replaced)
- [x] `livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts` has 12 real cases (stub from 101-00 replaced)
- [x] `livos/packages/livinityd/source/index.ts` has `bootstrapChrome` import (line 62 region) and `ChromeCdpClient` field + use (lines ~190, ~442-510)
- [x] Commit `995000d1` exists in `git log` (Task 1 barrel)
- [x] Commit `11aee728` exists in `git log` (Task 2 client)
- [x] Commit `eba29916` exists in `git log` (Task 3 bootstrap)
- [x] Commit `23d9806f` exists in `git log` (Task 4 wire-up)
- [x] Sacred SHA preserved: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at `liv/packages/core/src/sdk-agent-runner.ts`
- [x] `pnpm --filter livinityd test:run source/modules/chrome-cdp/` exits 0 with 19/19 green

---
*Phase: 101-livos-universal-app-orchestration*
*Plan: 01 (Wave 1, Foundation — Chrome CDP)*
*Completed: 2026-05-11*
