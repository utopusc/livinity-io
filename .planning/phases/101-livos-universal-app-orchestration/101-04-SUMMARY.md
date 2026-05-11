---
phase: 101
plan: 04
title: CDP-Driven WebApp Spawn (Window-Manager Rewrite)
subsystem: webapps
tags: [cdp, chrome, x11, window-manager, pid-narrowed]
requires: [101-00, 101-01]
provides:
  - "WebAppWindowManager.spawn() drives Chrome via CDP createWindowForUrl"
  - "discovery.findNewWindowByPid PID-narrowed wid lookup (RESEARCH Q1 RESOLVED)"
  - "discovery.listWindowIdsForPid baseline helper"
  - "ChromeCdpClient.setChromePid + getChromePid pid caching"
  - "WebAppCdpUnavailableError for degraded-Pillar-A surfacing"
  - "close() routes Chrome teardown through CDP closeTarget"
affects:
  - "Plan 101-05 (Stream lifecycle integration) — will consume entry.targetId + CDP close path"
  - "Plan 101-10 UAT — rows 3/4/5 expect multi-WebApp distinct windows under shared profile"
tech-stack:
  added: []
  patterns:
    - "PID-narrowed baseline-and-poll for X11 wid discovery (replaces title-match race)"
    - "CDP target stash on ActiveWebApp record for deterministic close-path"
    - "WebAppCdpUnavailableError loud-fail guard (vs silent argv fallback)"
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.test.ts
    - livos/packages/livinityd/source/modules/webapps/window-discovery.ts
    - livos/packages/livinityd/source/modules/chrome-cdp/client.ts
    - livos/packages/livinityd/source/index.ts
decisions:
  - "PID-narrowed wid lookup (xdotool search --pid) replaces title-match — deterministic, no race"
  - "Implementation choice (a) per PLAN Task 2: cache chromePid via setChromePid (not /json/version + pgrep)"
  - "findNewWindowMatching kept in window-discovery.ts (other call sites may use it); removed only from window-manager.ts call sites + imports + types"
  - "WebAppCdpUnavailableError thrown at spawn() entry when chromeCdpClient is null — Pillar A degrades loudly, not silently"
metrics:
  duration_minutes: 30
  tasks_completed: 4
  files_modified: 5
  tests_added: 10
  tests_passing: 217  # all webapps tests (window-manager + window-discovery + 16 others)
  completed_date: 2026-05-11
---

# Phase 101 Plan 04: CDP-Driven WebApp Spawn Summary

Rewrote `WebAppWindowManager.spawn()` to drive the singleton Chrome (booted at livinityd.start() by Plan 101-01) via `ChromeCdpClient.createWindowForUrl()` instead of the legacy `sudo google-chrome --app=URL ...` argv path. PID-narrowed wid lookup (`xdotool search --pid <pid>` baseline-and-poll) replaces the title-match race; close path routes through CDP `closeTarget` for deterministic teardown.

## What Changed

### `livos/packages/livinityd/source/modules/webapps/window-manager.ts`

**Before** (lines 288-490, ~200 lines):
```typescript
async spawn(opts: SpawnOpts): Promise<SpawnResult> {
  // ... idempotency, cap ...
  const baselineWids = await this.discovery.snapshotWindowIds()  // unbounded baseline
  const chromeDisplay = ':1'
  // cascade computed into `--window-position=X,Y` argv
  const chromeArgs = [
    '-n', '-u', chromeUser, `DISPLAY=${chromeDisplay}`,
    this.chromeBinary,
    `--user-data-dir=${chromeProfile}`,
    '--window-size=1280,720',
    `--window-position=${cascadeWindowPosition}`,
    `--app=${opts.url}`,
  ]
  const chromeProc = this.spawnFactory('sudo', chromeArgs, { detached: true, stdio: 'ignore', ... })
  chromeProc.unref?.()

  // Title-match race — picks up wrong window when title contains 'Chrome'/'Firefox'
  const titleHints = [new URL(opts.url).hostname]
  const newWin = await this.discovery.findNewWindowMatching({
    titleHints, baselineWids, timeoutMs: this.titleTimeoutMs,
  })
  if (!newWin) throw new WindowNotFoundError(opts.url)
  // ... rest of spawn ...
}
```

**After** (Phase 101-04 CDP-driven, lines 376-503):
```typescript
async spawn(opts: SpawnOpts): Promise<SpawnResult> {
  // ... idempotency, cap ...
  if (!this.chromeCdpClient) throw new WebAppCdpUnavailableError()

  const chromeDisplay = ':1'

  // Cascade flows into CDP createWindowForUrl bounds, not argv
  const cascadeSlot = this.active.size % CASCADE_WRAP
  const cascadeOffsetX = (cascadeSlot * CASCADE_PIXELS) % CASCADE_X_RANGE
  const cascadeOffsetY = (cascadeSlot * CASCADE_PIXELS) % CASCADE_Y_RANGE

  // RESEARCH Q1 RESOLVED — PID-narrowed baseline-and-poll
  const chromePid = await this.chromeCdpClient.getChromePid()
  const baselineWidsForPid = await this.discovery.listWindowIdsForPid(chromePid)
  const {targetId, windowId: cdpWindowId} =
    await this.chromeCdpClient.createWindowForUrl(opts.url, {
      width: 1280, height: 720,
      left: cascadeOffsetX, top: cascadeOffsetY,
    })
  const newWin = await this.discovery.findNewWindowByPid({
    chromePid, baselineWids: baselineWidsForPid, timeoutMs: 5000,
  })
  if (!newWin) {
    try { await this.chromeCdpClient.closeTarget(targetId) } catch { /* noop */ }
    throw new WindowNotFoundError(opts.url)
  }
  const newWindowWidNumber = parseInt(newWin.wid, 10)
  // ... rest of spawn ...
}
```

Plus `close()` (lines 605-617) now routes Chrome teardown through CDP:
```typescript
if (entry.targetId && this.chromeCdpClient) {
  try {
    await this.chromeCdpClient.closeTarget(entry.targetId)
  } catch (err) {
    this.logger?.warn?.(`webapp ${opts.webappId}: chromeCdpClient.closeTarget(...) threw (non-fatal)`, err)
  }
}
```

### `livos/packages/livinityd/source/modules/webapps/window-discovery.ts`

Added two helpers (78 LOC):

```typescript
export async function listWindowIdsForPid(pid: number): Promise<string[]> {
  if (!Number.isInteger(pid) || pid <= 0) return []
  try {
    const {stdout} = await execFileAsync('xdotool', ['search', '--pid', String(pid)], {
      timeout: DEFAULT_TIMEOUT_MS,
    })
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  } catch (err) {
    // ENOENT / no-windows / X11 unreachable → empty list (graceful)
    return []
  }
}

export async function findNewWindowByPid(opts: {
  chromePid: number
  baselineWids: string[]
  timeoutMs: number
  pollIntervalMs?: number
}): Promise<{wid: string} | null> {
  const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const deadline = Date.now() + opts.timeoutMs
  const baseline = new Set(opts.baselineWids)
  while (Date.now() < deadline) {
    const current = await listWindowIdsForPid(opts.chromePid)
    const fresh = current.filter((w) => !baseline.has(w))
    if (fresh.length > 0) return {wid: fresh[0]!}
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await sleep(Math.min(pollMs, remaining))
  }
  return null
}
```

Legacy `findNewWindowMatching` retained — only removed from `window-manager.ts` call sites + imports + types.

### `livos/packages/livinityd/source/modules/chrome-cdp/client.ts`

Added pid caching (implementation choice (a) per PLAN Task 2):

```typescript
private chromePid: number | null = null

setChromePid(pid: number): void { this.chromePid = pid }

async getChromePid(): Promise<number> {
  if (this.chromePid == null) {
    throw new Error('chrome-cdp: getChromePid() called before setChromePid()')
  }
  return this.chromePid
}
```

Loud failure when called pre-bootstrap — surfaces the wiring bug rather than silently `xdotool search --pid 0` mis-targeting.

### `livos/packages/livinityd/source/index.ts`

Three changes thread the live ChromeCdpClient + pid into WebAppWindowManager:

1. New imports (101-01 left these as bare references — TS2304):
   ```typescript
   import {bootstrapChrome, ChromeCdpClient} from './modules/chrome-cdp/index.js'
   ```

2. New class field (101-01 missed this — TS2339):
   ```typescript
   chromeCdpClient?: ChromeCdpClient
   ```

3. Call `setChromePid(chromePid)` right after `connect()`:
   ```typescript
   const {pid: chromePid} = await bootstrapChrome({...})
   this.chromeCdpClient = new ChromeCdpClient({logger: chromeCdpLogger})
   await this.chromeCdpClient.connect()
   this.chromeCdpClient.setChromePid(chromePid)  // ← 101-04 wiring
   ```

4. Pass `chromeCdpClient` into the WebAppWindowManager opts:
   ```typescript
   this.webappWindowManager = new WebAppWindowManager({
     // ...existing opts...,
     chromeCdpClient: this.chromeCdpClient,
   })
   ```

## New Tests

10 test cases in a dedicated `describe('Phase 101-04 — CDP-driven spawn body', ...)` block in `window-manager.test.ts`:

| #  | Name | Asserts |
|----|------|---------|
| 01 | `createWindowForUrl called with {url, width:1280, height:720, left, top}` | CDP transport receives URL + bounds |
| 02 | `findNewWindowByPid called with {chromePid, baselineWids, timeoutMs:5000}` | RESEARCH Q1 RESOLVED contract |
| 03 | `findNewWindowMatching NOT called` | legacy title-match gone from spawn body |
| 04 | `listWindowIdsForPid baselines BEFORE createWindowForUrl` | invocationCallOrder asserts ordering |
| 05 | `spawnFactory("sudo", ...) NEVER called` | argv path dead |
| 06 | `spawnFactory("google-chrome", ...) NEVER called` | argv path dead |
| 07 | `cascade (0,0)→(120,120)→...→wrap@10 via CDP bounds` | 100-10-11 invariant preserved |
| 08 | `spawn stashes targetId for close-path` | indirect via closeTarget contract |
| 09 | `close calls closeTarget(targetId)` | deterministic Chrome teardown |
| 10 | `WindowNotFoundError + closeTarget cleanup on timeout` | degenerate-case no leak |

Plus 6 pre-existing tests updated:
- Test 4 (timeout): swapped title-match for PID-narrowed assert.
- Test 11 (legacy `--app=` argv): retired into a regression lock that the argv path is dead.
- Test 15 (XAUTHORITY leak): repurposed as "spawnFactory never called on happy path".
- T-WM-10-08-01 + 03 (display-allocator no-op): updated to assert CDP path instead of `DISPLAY=:1` argv.
- T-10-11-CASCADE-01 + 02 (cascade positions): swap argv assertions for CDP bounds.

**Test result:** 36 passing, 3 pre-existing skipped (from 100-10-08 D-100-10-A revert).

## Verification

| Check | Expected | Actual |
|-------|----------|--------|
| Sacred SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ |
| `grep -c 'findNewWindowMatching' window-manager.ts` | 0 | 0 ✓ |
| `grep -c '--app=' window-manager.ts` | 0 | 0 ✓ |
| `grep -c 'sudo' window-manager.ts` | 0 | 0 ✓ |
| `grep -c 'app=' window-manager.ts` | 0 | 0 ✓ |
| `grep -q 'chromeCdpClient.createWindowForUrl' window-manager.ts` | ✓ | 3 occurrences ✓ |
| `grep -q 'findNewWindowByPid' window-manager.ts` | ✓ | 5 occurrences ✓ |
| `grep -q 'listWindowIdsForPid' window-manager.ts` | ✓ | 5 occurrences ✓ |
| `grep -q 'getChromePid' window-manager.ts` | ✓ | 2 occurrences ✓ |
| `grep -q 'closeTarget' window-manager.ts` | ✓ | 12 occurrences ✓ |
| `grep -q 'findNewWindowByPid\|listWindowIdsForPid' window-discovery.ts` | ✓ | 4 occurrences ✓ |
| `grep -q 'chromeCdpClient' index.ts` | ✓ | 10 occurrences ✓ |
| `grep -q 'setChromePid' index.ts` | ✓ | 2 occurrences ✓ |
| `pnpm --filter @livos/livinityd test:run webapps/window-manager.test.ts` | exit 0 | 36/39 pass (3 skipped) ✓ |
| `pnpm --filter @livos/livinityd test:run webapps/` | exit 0 | 217/220 pass (3 skipped) ✓ |

## Deviations from Plan

**[Rule 1 - Bug] Fixed missing `ChromeCdpClient` + `bootstrapChrome` imports and class field declaration in `livinityd/source/index.ts`**

- **Found during:** Task 3 typecheck.
- **Issue:** Plan 101-01 reportedly wired `this.chromeCdpClient = new ChromeCdpClient(...)` in `livinityd.start()`, but no `import` and no class field declaration were added. The code referenced bare `ChromeCdpClient` and `bootstrapChrome` symbols — `tsc` flagged TS2304 (unresolved name) and TS2339 (no property on Livinityd) on every chromeCdpClient access.
- **Fix:** Added the import + class field as part of the 101-04 Task 3 wire-up (since they were a prerequisite for passing the live client into WebAppWindowManager opts).
- **Files modified:** `livos/packages/livinityd/source/index.ts` (lines 62-71 import, lines 213-220 field decl).
- **Commit:** f851eed6 (Task 3).

**Deferred:** Pre-existing `Cannot find module '@liv/core/lib'` import error in `index.ts:54` (McpConfigManager) and other unrelated typecheck failures (user/routes.ts, file-store.ts, trpc-router.ts, server/index.ts) — out of scope for this plan (Rule scope boundary: only fix issues directly caused by this task's changes).

## Self-Check

Files created/modified (verified to exist on disk):
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — FOUND ✓
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — FOUND ✓
- `livos/packages/livinityd/source/modules/webapps/window-discovery.ts` — FOUND ✓
- `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` — FOUND ✓
- `livos/packages/livinityd/source/index.ts` — FOUND ✓

Commits verified in git log:
- `cecd5811` test(101-04): RED — CDP mock + PID-narrowed discovery tests — FOUND ✓
- `fbbfb244` feat(101-04): GREEN — CDP-driven spawn body + PID-narrowed wid lookup — FOUND ✓
- `f851eed6` feat(101-04): wire chromeCdpClient + setChromePid through livinityd.start() — FOUND ✓

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `test(101-04)` cecd5811 | ✓ |
| GREEN | `feat(101-04)` fbbfb244 | ✓ |
| REFACTOR | (none — clean GREEN, no refactor commit needed) | — |

## Self-Check: PASSED
