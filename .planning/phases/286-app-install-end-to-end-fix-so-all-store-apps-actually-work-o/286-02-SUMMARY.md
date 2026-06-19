---
phase: 286-app-install-end-to-end-fix
plan: 02
subsystem: livinityd/apps
tags: [health-check, readiness, docker-inspect, install-pipeline, caddy-reachability]
requires:
  - "286-01 (reconcileAppVolumeOwnership wired into app.ts install()/start())"
provides:
  - "apps/health-poll.ts — classifyInspect() pure classifier + pollContainerHealth() bounded docker-inspect poll"
  - "App.getMainContainerName() — resolves the main service container to inspect"
  - "Health-gated state='ready' in App.install() and App.start()"
affects:
  - "App install/start lifecycle: state='ready' now means the main container is actually Running (+ healthy if a healthcheck exists), not merely scheduled"
tech-stack:
  added: []
  patterns:
    - "execa `$` arg-array docker inspect (no shell:true) — same style as getContainerIp()"
    - "pure-function extraction (classifyInspect) for Docker-free unit testing"
    - "bounded timeout + interval poll loop; throw-on-terminal-failure so caller lands an error state"
key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/health-poll.ts
    - livos/packages/livinityd/source/modules/apps/health-poll.test.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/app.ts
decisions:
  - "Test framework = vitest (project standard), NOT node:test — the plan's <action> text said to mirror compose-sanitizer.test.ts (node:test), but node:test files FAIL under `npx vitest run` ('No test suite found') which is the plan's own verify command. Used `import {test, expect} from 'vitest'` (matches api-key.test.ts)."
  - "Health poll budget = 90s timeout / 3s interval (plan defaults); tolerate 3 transient 'unhealthy' samples before failing; 'restarting'/'created' = pending (keep polling through a crash-loop until the budget); 'exited'/'dead' = immediate terminal failure."
  - "On poll failure install()/start() set state='unknown' and re-throw — the throw short-circuits setAutoStart(true) in start() (correct: never auto-start a failing app)."
metrics:
  duration: ~10m
  completed: 2026-06-19
  tasks: 2
  files-created: 2
  files-modified: 1
  tsc-error-count: 305
  tests: "9/9 passing (health-poll.test.ts)"
---

# Phase 286 Plan 02: Container health/readiness verification Summary

Added real container health/readiness verification (CONTEXT decision #7, requirement SC4): an app's
state is now set `'ready'` ONLY after its main service container is actually `Running` (and
`Health.Status==healthy` if a healthcheck is defined), instead of the instant `docker compose up
--detach` returns. A crash-looping / unhealthy app lands `state='unknown'` and re-throws, so the UI
and Caddy see the truth — ending the "container Up but 502" lie at the old `app.ts state='ready'`
line.

## What was built

- **`apps/health-poll.ts`** (new)
  - `classifyInspect({status, health})` — pure, Docker-free classifier returning
    `'ready' | 'pending' | 'unhealthy' | 'failed'`. `running`+no-healthcheck or `running`+`healthy`
    → `ready`; `running`+`starting` → `pending`; `running`+`unhealthy` → `unhealthy`;
    `restarting`/`created` → `pending`; everything else (`exited`/`dead`/…) → `failed`.
  - `pollContainerHealth(containerName, opts)` — bounded poll loop (default 90s budget, 3s interval).
    Reads `docker inspect -f {{.State.Status}}` + `{{.State.Health.Status}}` via execa `$` arg-arrays
    (no `shell:true`). Returns `'ready'` on success; throws on terminal failure (`failed`, or 3×
    `unhealthy`) or timeout. A not-yet-existing container (compose still scheduling) is treated as
    pending. The loop always exits — install/start can never block forever (T-286-08).

- **`app.ts`** (modified)
  - Import `{pollContainerHealth}` from `./health-poll.js`.
  - New private `getMainContainerName()` reusing the EXACT mainService selection rule from
    `patchComposeFile()` (the same service Caddy reverse-proxies to); resolves `container_name` or
    the deterministic `${appId}_${mainServiceName}_1` fallback.
  - `install()`: the bare `state='ready'` is now health-gated — poll the main container, set `ready`
    only on success; on failure set `state='unknown'`, reset `stateProgress=0`, re-throw.
  - `start()`: same health gate; on failure set `state='unknown'`, re-throw (which correctly skips
    `setAutoStart(true)`).

## Tasks

| Task | Name | Status |
| ---- | ---- | ------ |
| 1 | Create health-poll.ts (classifyInspect + pollContainerHealth) + tests (TDD) | done |
| 2 | Wire pollContainerHealth into app.ts install()/start() before state='ready' | done |

## Verification

- `npx vitest run source/modules/apps/health-poll.test.ts` → **9/9 passing, 0 failures** (7 from the
  plan's `<behavior>` + 2 extra guards: empty health string → ready, `dead` → failed).
- `npx tsc --noEmit | grep -c "error TS"` → **305** (== baseline 305, ≤ 305 ✓; stable across repeated
  runs; zero errors reference `health-poll.ts` or `app.ts`).
- `apps.ts` NOT modified by this plan (its working-tree diff is entirely Wave-1 / Plan 286-01 reconcile
  work; verified no `health-poll`/`pollContainerHealth`/`getMainContainerName` references in its diff).
- No `shell:true` in `health-poll.ts`.
- Acceptance greps all matched: `export function classifyInspect`, `export async function
  pollContainerHealth`, `docker inspect -f`, `import {pollContainerHealth}`, `private async
  getMainContainerName`, `pollContainerHealth(mainContainer` count = 2, `this.state = 'unknown'`
  count = 2.

## Deviations from Plan

### 1. [Rule 3 - Blocking issue] Test framework: vitest instead of node:test

- **Found during:** Task 1.
- **Issue:** The plan's `<action>` said to write `health-poll.test.ts` mirroring
  `compose-sanitizer.test.ts` (`import {test} from 'node:test'`, `import assert from
  'node:assert/strict'`). But the plan's `<verify>` and `<acceptance_criteria>` both run the test via
  `npx vitest run`. The project's existing `node:test`-style files (e.g. `compose-sanitizer.test.ts`)
  FAIL under `npx vitest run` with `Error: No test suite found in file` (vitest reports the suite as a
  failed file even though the inline `node:test` runner prints its own checkmarks). So following the
  literal instruction would have made the plan's own verification command fail.
- **Fix:** Wrote the test with vitest's native API — `import {test, expect} from 'vitest'` — matching
  the working `api-key.test.ts` style already in the codebase. All 9 tests pass under `npx vitest run`.
- **Files modified:** `health-poll.test.ts` (new).
- **Impact:** None on behavior; only the test's import/assert style differs from the plan text. The
  classifier logic and all 7 `<behavior>` cases are covered exactly as specified.

### Note on line-number drift (not a deviation, expected)

The plan cited `state='ready'` at app.ts:349 (install) / :406 (start). Wave-1 (Plan 286-01) had
already shifted these to :343 / :403. As instructed, I read the current file and located the real
anchors before editing. `update()`'s own `state='ready'` was intentionally left untouched (plan only
targets install + start).

## Self-Check: PASSED

- FOUND: `livos/packages/livinityd/source/modules/apps/health-poll.ts`
- FOUND: `livos/packages/livinityd/source/modules/apps/health-poll.test.ts`
- FOUND: `livos/packages/livinityd/source/modules/apps/app.ts` (modified — import + 2 health gates + helper)
- tsc error count = 305 (baseline, ≤ 305)
- health-poll.test.ts = 9/9 passing
- No commit was made (changes left staged/uncommitted per execution instructions).
