---
phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
plan: 03
subsystem: webapps + computer-use/displays
tags: [webapp-visibility, display-registry, registerExisting, disjoint-allocator, tdd]
requires:
  - "displayManager constructed on Livinityd singleton (254-01)"
  - "displayManager.registerExisting + kill (254-05 / Phase 248)"
  - "WebAppWindowManager per-app Xvfb spawn/close (102-04 / 102-08)"
provides:
  - "WebApp spawn writes a display registry record (owner = WebApp user) so the WebApp appears in displays.list / the Displays popover"
  - "WebApp close removes the display registry record via displayManager.kill (owner-gated)"
  - "Disjoint allocator ranges: webapps [10,60) + MCP create() floor 60 — no within-boot :N collision"
  - "WEBAPP_DISPLAY_ALLOCATOR_RANGE + MCP_CREATE_ALLOCATOR_START exported constants (streaming/display-allocator.ts)"
affects:
  - "livos/packages/livinityd/source/modules/webapps/window-manager.ts"
  - "livos/packages/livinityd/source/index.ts"
  - "livos/packages/livinityd/source/modules/computer-use/mcp/server.ts"
  - "livos/packages/livinityd/source/modules/streaming/display-allocator.ts"
tech-stack:
  added: []
  patterns:
    - "Optional injected dependency (mirrors mcpConfigManager) — undefined => byte-identical pre-255 behavior"
    - "Best-effort try/catch around registry writes (registerExisting/kill) — a Redis failure never breaks WebApp launch/close"
    - "registerExisting (Redis-only HSET, no spawn, no allocator advance) — NEVER create() (Pitfall 2)"
    - "Disjoint allocator ranges locked by a unit-test invariant (extract-constant-for-test)"
key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/webapps/window-manager.ts"
    - "livos/packages/livinityd/source/modules/webapps/window-manager.test.ts"
    - "livos/packages/livinityd/source/index.ts"
    - "livos/packages/livinityd/source/modules/computer-use/mcp/server.ts"
    - "livos/packages/livinityd/source/modules/streaming/display-allocator.ts"
    - "livos/packages/livinityd/source/modules/streaming/index.ts"
decisions:
  - "D-255-WEBAPP-REGISTER: WebApp spawn adopts its already-running Xvfb into the display registry via registerExisting (owner=userId), not create()"
  - "Set allocatorStart=60 on BOTH createDisplayManager call sites (index.ts UI displayManager + stdio MCP server) so the disjoint-range invariant holds for the actual computer_create_display path (Rule 2)"
  - "Allocator-range constants live in streaming/display-allocator.ts (light leaf module) so the invariant test can import them without loading the full daemon + native bindings"
metrics:
  duration: "~7 min"
  completed: "2026-06-02"
  tasks: 2
  commits: 4
  files_modified: 6
---

# Phase 255 Plan 03: WebApp Display Registry Visibility Summary

WebApps now write a per-user display registry record on spawn (`registerExisting`,
owner = the WebApp user) and remove it on close (`kill`), so an installed WebApp's
`:N` appears in `displays.list` and the Displays popover correctly owner-isolated;
webapp and MCP-`create()` `:N` allocator ranges are made provably disjoint ([10,60)
vs floor 60) to eliminate within-boot collisions — all backend tests green, tsc
baseline unchanged.

## What Shipped

### Task 1 — register on spawn / kill on close + DI (TDD RED→GREEN)
- `WebAppWindowManager` gains an OPTIONAL `displayManager` dependency (mirrors the
  existing `mcpConfigManager` optional-dep pattern): opts field + private class
  field + ctor assignment.
- `spawn()`: immediately after `this.active.set(...)`, a guarded best-effort block
  calls `displayManager.registerExisting({display, width:1280, height:720,
  mode:'xvfb', name: opts.url, ownerSession: opts.userId})`. Owner = the WebApp
  user (NOT `''` — `''` would make it host/shared). Uses `registerExisting`
  (Redis-only HSET, no second Xvfb spawn, does NOT advance the `:N` allocator) —
  NEVER `create()` (Pitfall 2, which would spawn a duplicate Xvfb on a divergent `:N`).
- `close()`: alongside the existing `displayAllocator.release(entry.displayN)`
  step, a guarded best-effort block calls `displayManager.kill({display:
  entry.display, callerSession: entry.userId})`. `callerSession` = the owner so the
  display-manager owner-gate (`owner_session === callerSession`) passes.
- Both blocks are `if (this.displayManager) { try {...} catch { warn } }` — a Redis
  write failure is non-fatal and never propagates out of spawn/close.

### Task 2 — inject displayManager + disjoint allocator ranges (TDD RED→GREEN)
- Two new exported constants in `streaming/display-allocator.ts`:
  `WEBAPP_DISPLAY_ALLOCATOR_RANGE = {min:10, max:60}` and
  `MCP_CREATE_ALLOCATOR_START = 60` (re-exported from `streaming/index.ts`).
- `index.ts`: the webapp `DisplayAllocator` is now constructed with the disjoint
  range `[10, 60)`; `displayManager: this.displayManager` is injected into the
  `WebAppWindowManager` ctor; the UI `createDisplayManager` call gets
  `allocatorStart: 60`.
- `mcp/server.ts`: the stdio MCP server's `createDisplayManager` (the ACTUAL
  `computer_create_display` path the operator/agent uses) also gets
  `allocatorStart: 60` — a Rule 2 critical addition so the disjoint-range
  invariant holds end-to-end, not just for the UI displayManager.
- A unit test (T-255-09a/b) locks the invariant: `WEBAPP_DISPLAY_ALLOCATOR_RANGE`
  is `[10,60)`, the MCP floor is `60`, `max <= floor`, and exhausting a real
  `DisplayAllocator` over the webapp range only ever yields values `< 60`.

## Verification Evidence

- **Phase 255-03 tests GREEN:** `pnpm exec vitest run window-manager.test.ts -t "255-03"`
  → **8 passed | 62 skipped (70)**. 6 register/kill cases (T-255-03-01..06) + 2
  disjoint-range cases (T-255-09a/b).
- **Full window-manager suite:** 45 passed + the 2 disjoint-range tests
  (66 passed across the file with display-manager.test.ts) | 22 skipped |
  **3 pre-existing baseline failures** (Tests 16/18/23 — `LIVOS_PER_APP_LUSE='1'`
  asserting `installServer`/`updateServer` calls that the now-no-op
  `registerWebAppMcp` never makes). These 3 fail on the unmodified tree (confirmed
  Test 23 fails in isolation pre-change) and are OUT OF SCOPE for this plan — see
  Deferred Issues. The passing count rose from 37 → 45 (+8 net: my 6 register/kill
  in the main file count + the previously-passing 37 unchanged; the 2
  disjoint-range live in a separate describe).
- **display-manager.test.ts:** 17/17 GREEN (the createDisplayManager
  allocatorStart=60 additions did not regress its own tests — they pass their own
  `allocatorStart`).
- **tsc gate:** `pnpm exec tsc --noEmit` → **390 errors**, byte-identical to the
  documented baseline (389 Phase-254 baseline + 1 pre-existing 255-01 branded-shell
  RED scaffold). **ZERO errors in any edited file.** This plan contributes 0 new
  tsc errors.
- **Acceptance greps (Task 1):** `registerExisting({` inside spawn() ✓ ·
  `.kill({display: entry.display` inside close() ✓ · `ownerSession: opts.userId`
  ✓ (NOT `''`) · `displayManager.create(` count = **0** ✓ ·
  `this.displayManager = opts.displayManager` ✓.
- **Acceptance greps (Task 2):** `displayManager: this.displayManager` in ctor ✓ ·
  webapp `DisplayAllocator` range = `WEBAPP_DISPLAY_ALLOCATOR_RANGE` [10,60) ✓ ·
  `allocatorStart: MCP_CREATE_ALLOCATOR_START` (=60) on both createDisplayManager
  sites ✓.

## Commits

- `a584b3fa` test(255-03): RED — webapp displayManager registerExisting on spawn / kill on close
- `10419dc9` feat(255-03): GREEN — webapp spawn registerExisting / close kill via displayManager
- `46e6dc90` test(255-03): RED — disjoint webapp/MCP-create display allocator ranges
- `41c503ca` feat(255-03): GREEN — inject displayManager + disjoint webapp/MCP-create ranges

## TDD Gate Compliance

Plan `type: tdd`. Both task cycles followed RED → GREEN:
- Task 1: `a584b3fa` (test, 5/6 RED — the optional-absent case was already green) → `10419dc9` (feat, 6/6 GREEN).
- Task 2: `46e6dc90` (test, 2/2 RED — constants undefined) → `41c503ca` (feat, 2/2 GREEN).
No REFACTOR commit needed (implementation was minimal and clean). RED gate + GREEN gate present for both cycles.

## Threat Surface

All five threat-register dispositions from the plan are addressed:
- **T-255-07 (info disclosure):** spawn writes `ownerSession: opts.userId` (NOT `''`).
  `displays.screenshot`/`getVncUrl` gate on `canAccessDisplay`, so a non-admin cannot
  screenshot/open a foreign owner's display — owner isolation preserved end-to-end.
- **T-255-08 (tampering — kill another's record):** `kill` gates on
  `owner_session === callerSession`; close() passes `callerSession: entry.userId`
  (the owner), so only the owner's teardown deletes the record.
- **T-255-09 (collision):** disjoint allocator ranges (webapps [10,60),
  MCP create() floor 60) + a unit test asserting no overlap; `registerExisting`
  is Redis-only (no Xvfb spawn) so it cannot double-spawn.
- **T-255-10 (DoS — Redis failure aborts launch):** registerExisting/kill are
  best-effort try/catch (non-fatal warn) — a registry write failure never breaks
  spawn/close (locked by T-255-03-04 and T-255-03-05).
- **T-255-11 (repudiation):** owner_session = userId recorded in Redis; existing
  display-manager logging covers it (accepted — no extra audit for single-tenant box).

No NEW threat surface introduced beyond the plan's `<threat_model>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] allocatorStart=60 set on the stdio MCP server's createDisplayManager too**
- **Found during:** Task 2.
- **Issue:** The plan's Task 2 acceptance criterion only required `allocatorStart: 60`
  on the `index.ts` `createDisplayManager` (the UI displayManager). But the ACTUAL
  `computer_create_display` operator/agent path runs through the SEPARATE stdio MCP
  server's `createDisplayManager` (`mcp/server.ts:222`), which also defaulted to
  `allocatorStart` 10. Without setting it there too, the disjoint-range invariant
  (T-255-09) would not actually hold for the real create() path — the MCP child
  could still hand out `:10` and collide with a webapp `:10`.
- **Fix:** Imported `MCP_CREATE_ALLOCATOR_START` into `mcp/server.ts` and passed
  `allocatorStart: MCP_CREATE_ALLOCATOR_START` (=60) there as well. The invariant
  now holds end-to-end for the operator-facing create() path.
- **Files modified:** `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts`
- **Commit:** `41c503ca`

**2. [Rule 3 - Blocking issue] Allocator-range constants placed in streaming/display-allocator.ts (leaf module), not index.ts**
- **Found during:** Task 2 (RED test authoring).
- **Issue:** The plan's Task 2 step 4 implied a test reading "the configured
  allocatorStart" wiring from index.ts. Importing the whole `index.ts` into a
  vitest unit test failed with "Could not locate the bindings file" — index.ts
  pulls in the entire daemon + native modules (node-pty/sharp) at load.
- **Fix:** Defined `WEBAPP_DISPLAY_ALLOCATOR_RANGE` + `MCP_CREATE_ALLOCATOR_START`
  in the light leaf module `streaming/display-allocator.ts` (re-exported via
  `streaming/index.ts`); `index.ts` and `mcp/server.ts` consume them. The test
  imports the constants from the leaf module — no native-bindings load. The
  invariant is still locked at the single source of truth the production wiring
  references.
- **Files modified:** `streaming/display-allocator.ts`, `streaming/index.ts`,
  `index.ts` (import the constants instead of inline literals).
- **Commit:** `46e6dc90` (test) + `41c503ca` (feat).

## Deferred Issues

**3 pre-existing baseline failures in window-manager.test.ts (OUT OF SCOPE).**
Tests 16, 18, 23 (`LIVOS_PER_APP_LUSE='1'` per-WebApp Luse MCP registration) assert
`mcpConfigManager.installServer`/`updateServer` are called on spawn. They fail
because `registerWebAppMcp()` is now a **no-op** (the `luse-mcp-config` module was
deleted with the AI-Chat teardown — `window-manager.ts:792-803`). These fail on the
unmodified tree (confirmed Test 23 fails in isolation BEFORE any 255-03 change) and
are unrelated to this plan's scope (display registry / allocator ranges). Logged to
`deferred-items.md` in the phase directory. Not fixed here — a separate cleanup
should either delete the dead per-WebApp-Luse tests or re-wire `registerWebAppMcp`.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — FOUND (modified)
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — FOUND (modified)
- `livos/packages/livinityd/source/index.ts` — FOUND (modified)
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` — FOUND (modified)
- `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` — FOUND (modified)
- `livos/packages/livinityd/source/modules/streaming/index.ts` — FOUND (modified)
- Commit `a584b3fa` — FOUND
- Commit `10419dc9` — FOUND
- Commit `46e6dc90` — FOUND
- Commit `41c503ca` — FOUND
