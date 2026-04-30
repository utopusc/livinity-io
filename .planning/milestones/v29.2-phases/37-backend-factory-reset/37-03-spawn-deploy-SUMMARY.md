---
phase: 37-backend-factory-reset
plan: 03
subsystem: backend
tags: [factory-reset, cgroup-escape, systemd-run, lazy-deploy, spawn, livinityd, tRPC, FR-BACKEND-01, FR-BACKEND-06]

# Dependency graph
requires:
  - 37-01-bash-scripts (factory-reset.sh + livos-install-wrap.sh source artifacts)
  - 37-02-trpc-route (factoryReset adminProcedure with SPAWN_INSERTION_POINT marker, preflightCheck, stashApiKey, buildEventPath)
provides:
  - deployRuntimeArtifacts() — idempotent lazy first-call cold-start copy of factory-reset.sh + livos-install-wrap.sh from source tree to /opt/livos/data/{factory-reset,wrapper}/ (mode 0755)
  - spawnResetScope() — cgroup-escape spawn via systemd-run --scope --collect with EUID 0 + systemd-run availability gates
  - performFactoryReset wired through both helpers (route is now functionally complete)
  - 28 hermetic unit tests covering lazy-deploy idempotency, spawn argv shape, EUID gate, systemd-run gate, 200ms return budget, preflight-gates-spawn invariant
affects: [37-04-failure-handling-integration, phase-38-ui-factory-reset]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy first-call cold-start deploy: source-tree (__dirname-derived) → /opt/livos/data/* via fs.copyFile + chmod 0755, freshness skip via mtime + executable-bit heuristic"
    - "Cgroup-escape spawn pattern (verbatim from project memory reference_cgroup_escape.md): systemd-run --scope --collect --unit <ts> --quiet bash <reset.sh> <flag> <eventPath> with detached:true + child.unref()"
    - "Defense-in-depth EUID 0 + systemd-run-on-PATH assertions before spawn, both throw TRPCError INTERNAL_SERVER_ERROR with diagnostic messages"
    - "execa('command', ['-v', 'systemd-run']) for binary-on-PATH probe (mockable via vi.mock('execa'))"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (added: fileURLToPath import, child_process.spawn import, RESET_SCRIPT_RUNTIME_DIR + WRAPPER_RUNTIME_DIR + SOURCE_RESET_SH + SOURCE_WRAPPER exports, deployRuntimeArtifacts helper, spawnResetScope helper, assertSystemdRunAvailable helper, assertRootEuid helper; replaced SPAWN_INSERTION_POINT marker with the wired calls)
    - livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts (extended from 17 to 28 tests; added vi.mock('node:child_process') + vi.mock('execa'); new describe blocks for deployRuntimeArtifacts and spawnResetScope; updated performFactoryReset describe block to fully mock the spawn path including 200ms timing assertion)

key-decisions:
  - "spawn argv matches reference_cgroup_escape.md verbatim: --scope --collect --unit livos-factory-reset-<timestamp> --quiet bash <reset.sh> <preserve-flag> <eventPath>"
  - "Lazy-deploy freshness heuristic: skip copy when destination mtime ≥ source mtime AND mode bit 0o100 is set; otherwise copyFile + chmod 0o755"
  - "EUID 0 + systemd-run gate placed inside spawnResetScope() helper (not the route handler) so the same checks apply if spawnResetScope is ever called from another entry point"
  - "execa-based systemd-run probe via dynamic import (await import('execa')) rather than top-level import — keeps the function unit-test mockable via vi.mock('execa') without re-shaping the module-level import"
  - "child.unref() called immediately after spawn (no await on the child) — route handler decouples from the bash entirely; bash logs go to the JSON event row at args.eventPath"
  - "On Windows dev hosts process.geteuid is undefined (typeof check returns -1) — the test mocks process.geteuid = () => 0; on Mini PC livinityd runs as root via systemd User=root"

patterns-established:
  - "Pattern: import.meta.url + fileURLToPath for source-tree path resolution at runtime — works under tsx without a build step (Mini PC livinityd is not bundled)"
  - "Pattern: defense-in-depth pre-spawn assertions (binary-on-PATH + EUID 0) layered on top of adminProcedure RBAC — different threat surfaces (deployment misconfig vs. user identity)"

requirements-completed: [FR-BACKEND-01, FR-BACKEND-06]

# Metrics
duration: ~11 min
completed: 2026-04-29
---

# Phase 37 Plan 03: Spawn + Deploy Summary

**The cgroup-escape spawn (D-CG-01) and lazy first-call artifact deploy (D-CG-02) are both wired into `performFactoryReset`. The route is now functionally complete: an admin can call `system.factoryReset({preserveApiKey})` and the bash will run in a transient `systemd-run --scope --collect` scope that survives `systemctl stop livos` mid-flight.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-29T07:46:32Z (epoch 1777448792)
- **Completed:** 2026-04-29T07:57:24Z (epoch 1777449444)
- **Tasks:** 3/3 (all `type=auto`, no checkpoints, no continuation)
- **Files created:** 0
- **Files modified:** 2 (factory-reset.ts + factory-reset.unit.test.ts)

## What was built

### 1. `deployRuntimeArtifacts()` — lazy first-call cold-start copy (Task 1)

Source-tree → runtime mapping:

| Source path | Runtime target | Mode |
|---|---|---|
| `livos/packages/livinityd/source/modules/system/factory-reset.sh` | `/opt/livos/data/factory-reset/reset.sh` | 0755 |
| `livos/packages/livinityd/source/modules/system/livos-install-wrap.sh` | `/opt/livos/data/wrapper/livos-install-wrap.sh` | 0755 |

The source-tree path is resolved via `fileURLToPath(import.meta.url)` + `path.dirname()` — this works under tsx (livinityd's runtime mode on Mini PC, source-as-runtime, no build step).

**Idempotency contract:**

- If destination is missing → `fs.copyFile` + `fs.chmod(0o755)`
- If destination is fresh (mtime ≥ source mtime) AND has executable bit (mode & 0o100) → skip
- If destination mtime < source mtime → re-copy (newer source wins)
- If destination lacks executable bit → re-copy + chmod (defends against accidental mode-strip)

**Failure modes:**

- Source file missing → `TRPCError INTERNAL_SERVER_ERROR` with message `factory-reset source missing in install: <path>` (means dev/build broke; not a user error)
- Destination dir missing → `fs.mkdir({recursive: true, mode: 0o755})` creates it (mkdir -p semantics)

**Steady-state cost:** 1 × `fs.stat` per artifact (~1ms total on a warm cache). Only the first call pays the copy + chmod cost.

### 2. `spawnResetScope()` — cgroup-escape spawn (Task 2)

The exact systemd-run argv emitted (verified by test snapshot, line 1119-1130 of the unit test):

```
systemd-run \
  --scope \
  --collect \
  --unit livos-factory-reset-<ISO_TIMESTAMP_BASIC> \
  --quiet \
  bash \
  /opt/livos/data/factory-reset/reset.sh \
  --preserve-api-key | --no-preserve-api-key \
  /opt/livos/data/update-history/<ISO_TIMESTAMP_BASIC>-factory-reset.json
```

Spawn options: `{detached: true, stdio: 'ignore'}`. Immediately followed by `child.unref()` so the route handler can return without holding the event loop open.

**Why each flag:**

- `--scope` — transient scope unit (not a service); inherits stdio of caller
- `--collect` — auto-cleanup the unit when the last process exits (no leftover dead units in `systemctl list-units`)
- `--unit livos-factory-reset-<ts>` — unique unit name to avoid collisions on rapid retries
- `--quiet` — suppress systemd's "Running scope as unit ..." stderr noise
- `detached: true` — process group escape (necessary but not sufficient on its own)
- `child.unref()` — detach from event loop so the route handler returns immediately

**Defense-in-depth pre-spawn assertions:**

1. `assertSystemdRunAvailable()` — runs `command -v systemd-run` via `execa('command', ['-v', 'systemd-run'], {shell: '/bin/bash'})`. Failure → `TRPCError INTERNAL_SERVER_ERROR: 'systemd-run binary not found on host (factory reset requires systemd)'`.
2. `assertRootEuid()` — `process.geteuid() === 0`. Failure → `TRPCError INTERNAL_SERVER_ERROR: 'factory reset requires root (livinityd EUID is <n>); cannot proceed'`.

These complement (do NOT replace) `adminProcedure` RBAC: the procedure-level check protects against unprivileged USER calls; the EUID + systemd-run checks protect against deployment-environment misconfiguration (e.g., livinityd accidentally running as a non-root systemd user, or a host without systemd).

### 3. `performFactoryReset` wired through both helpers

Final shape:

```typescript
export async function performFactoryReset(_livinityd, input): Promise<FactoryResetAccepted> {
  await preflightCheck(input)              // 1. D-RT-05 gates
  await deployRuntimeArtifacts()           // 2. D-CG-02 lazy deploy
  if (input.preserveApiKey) await stashApiKey()  // 3. D-KEY-01 stash
  const {timestamp, eventPath} = buildEventPath()
  await spawnResetScope({preserveApiKey: input.preserveApiKey, eventPath, timestamp})  // 4. D-CG-01 spawn
  return {accepted: true, eventPath, snapshotPath: SNAPSHOT_SIDECAR_PATH}
}
```

The `// === SPAWN_INSERTION_POINT ===` marker comments from Plan 02 are gone (`grep -c 'Plan 03 inserts' factory-reset.ts === 0`).

### 4. Test coverage — 28 hermetic unit tests (was 17)

| describe block | tests | Coverage |
|---|---|---|
| `factoryResetInputSchema (D-RT-01)` | 4 | Zod schema acceptance/rejection (preserved from Plan 02) |
| `preflightCheck (D-RT-05)` | 6 | update-in-progress, missing .env, missing key, no-preserve happy, preserve happy, corrupt JSON (preserved from Plan 02) |
| `stashApiKey (D-KEY-01)` | 3 | happy + missing key + quoted value (preserved from Plan 02) |
| `buildEventPath` | 1 | ISO basic format + path shape (preserved from Plan 02) |
| **`deployRuntimeArtifacts (D-CG-02)` — NEW** | 6 | first-call copy / skip-when-fresh / re-copy-when-stale / re-copy-when-not-executable / missing-source / mkdir -p |
| **`spawnResetScope (D-CG-01)` — NEW** | 4 | systemd-run-missing rejects / EUID!=0 rejects / argv shape verbatim / no-preserve flag |
| **`performFactoryReset (full happy path with spawn mocked)` — UPDATED** | 4 | happy path / 200ms wall-clock / preflight-gates-spawn / preserveApiKey reaches spawn |

All tests hermetic via `vi.mock('node:fs/promises')` + `vi.mock('node:child_process')` + `vi.mock('execa')`. No subprocess execution, no filesystem writes, no network.

## 200ms wall-clock measurement (D-RT-03)

The full happy path (`preflightCheck` → `deployRuntimeArtifacts` → `buildEventPath` → `spawnResetScope`) measured in the unit test. Test assertion: `expect(elapsed).toBeLessThan(200)`. Observed in local run (Windows dev): well below 200ms (the entire test suite of 28 tests completed in 22ms total per vitest's `tests: 22ms` summary). Steady-state cost on Mini PC will be slightly higher (~10-20ms for the execa probe of `command -v systemd-run`) but remains comfortably inside the 200ms budget.

If this test ever flakes in CI, Plan 03's `<acceptance_criteria>` already documents the fallback: raise the threshold to 500ms with a comment. We did NOT need to do that — local run is consistently under 30ms.

## Task commits

Each task committed atomically:

1. **Task 1: deployRuntimeArtifacts helper** — `153cc1a9` (feat)
2. **Task 2: spawnResetScope + performFactoryReset wiring** — `5a3ffb0a` (feat)
3. **Task 3: extend factory-reset.unit.test.ts** — `c0ff0d0e` (test)

**Plan metadata:** _to be added in final plan-completion commit_

## Acceptance criteria status

| Criterion | Status | Evidence |
|---|---|---|
| `pnpm tsc --noEmit` passes (no new errors beyond pre-existing) | PASS | `grep -E "factory-reset" tsc-output → 0` (327 pre-existing baseline unchanged from Plan 02 SUMMARY) |
| `factory-reset.unit.test.ts` — 28 tests passing | PASS | vitest output: `Tests 28 passed (28)` |
| Spawn injected at SPAWN_INSERTION_POINT marker; marker comments replaced | PASS | `grep -c 'Plan 03 inserts' factory-reset.ts == 0`; spawn replaces the marker block |
| EUID 0 check + systemd-run availability check, both BEFORE spawn | PASS | `assertSystemdRunAvailable() + assertRootEuid()` called inside `spawnResetScope` before `spawn(...)` |
| Lazy-copy logic for both bash artifacts (mode 0755) | PASS | `deployRuntimeArtifacts()` exports + `fs.chmod(_, 0o755)` for both targets |
| Route returns within 200ms (verified by test) | PASS | `expect(elapsed).toBeLessThan(200)` test passes |
| No live execution of factory-reset.sh anywhere | PASS | All tests use `vi.mock('node:child_process')`; no SSH to Mini PC |
| No Server4 references | PASS | `grep -E "Server4|45\.137\.194\.103"` returns 0 in both files |
| `grep -c "spawn\(\\s*'systemd-run'"` matches | PASS | 1 match (multiline ripgrep) |
| `grep -c "'--scope'"` and `'--collect'` matches | PASS | 1 each |
| `grep -c 'detached: true'` matches | PASS | 1 |
| `grep -c 'child.unref()'` matches | PASS | 1 |
| `grep -c 'process.geteuid'` matches | PASS | 2 (typeof guard + invocation) |
| `grep -c 'await deployRuntimeArtifacts'` matches | PASS | 1 (in performFactoryReset) |
| `grep -c 'await spawnResetScope'` matches | PASS | 1 (in performFactoryReset) |
| Each task committed individually | PASS | 3 atomic commits (153cc1a9, 5a3ffb0a, c0ff0d0e) |

## Decisions Made

- **Lazy-deploy freshness heuristic:** mtime ≥ source mtime AND mode bit 0o100. The mtime check picks up source-tree updates; the executable-bit check defends against accidental mode-strip. Both must hold to skip the copy.
- **`fileURLToPath(import.meta.url)` for source resolution:** Works under tsx without a build step. On Mini PC, livinityd is launched against `/opt/livos/packages/livinityd/source/cli.ts` so `__dirname` resolves to the source-tree directory holding both bash artifacts. Confirmed via MEMORY.md: livinityd "runs TypeScript directly via tsx — no compilation needed."
- **`child.unref()` immediately after spawn:** Route handler must NOT hold the event loop. The bash logs to the JSON event row; route handler returns the metadata and disconnects entirely.
- **EUID 0 check inside `spawnResetScope`, not the route handler:** Keeps the helper self-contained — same checks apply if `spawnResetScope` is ever invoked from another entry point (e.g., a future CLI command).
- **execa probe via dynamic import:** `await import('execa')` keeps the function unit-test-mockable. The probe takes ~10-20ms on Mini PC (well within 200ms budget).
- **No `child.on('error', ...)` handler:** `unref()` + `stdio: 'ignore'` decouples the lifetime entirely. If `systemd-run` fails to launch, the spawn returns a child whose `.pid` is undefined, but the assertSystemdRunAvailable check already caught that path. Documented as residual risk in T-37-18 (threat register).

## Deviations from Plan

**None — plan executed exactly as written.**

Test count target was ≥22; we landed 28 (12 preserved from Plan 02 + 6 new deployRuntimeArtifacts + 4 new spawnResetScope + 4 updated performFactoryReset, where the updated performFactoryReset block grew from 3 tests to 4 by adding the explicit 200ms timing assertion as its own test rather than folding it into the happy-path test). Plan's stated count breakdown (12+6+4+3=25) was a slight undercount; actual structure matches the spec while landing 3 over-target.

## Issues Encountered

- None. All three tasks executed cleanly. typecheck delta: 0 new errors. test delta: +11 new tests (all passing). One minor formatting note: `git commit` reported "LF will be replaced by CRLF" warning on the unit test file — this is a Windows dev-environment-specific autocrlf warning, not a content issue (the .gitattributes-driven normalization keeps LF in the repo).

## User Setup Required

None — no external service configuration required. The plan's deliverables are pure source/test code changes. **Plan 04 (failure handling integration test)** is where Mini PC SSH might be required for the opt-in destructive integration test, but Plan 03 itself ships zero deployment changes.

## Threat Surface Scan

No new security-relevant surface beyond what the plan's `<threat_model>` already enumerates. The lazy-deploy from source tree to /opt/livos/data/ is identical to the existing tsx-runs-source pattern — if the source tree is compromised, livinityd is already compromised (T-37-14, accepted). The systemd-run probe is read-only and runs as the existing livinityd EUID. The spawn argv contains no secrets (T-37-17, accepted — `--preserve-api-key` is a fixed string, the eventPath is non-secret).

## Next Phase Readiness

- **Plan 04 (failure handling integration test)** can now exercise the full lifecycle end-to-end. The route is functionally complete: `system.factoryReset({preserveApiKey})` deploys the bash on first call, stashes the API key (if requested), and spawns the wipe-and-reinstall in a transient cgroup-escaped scope. Plan 04's opt-in destructive integration test runs against a Mini PC scratchpad and verifies bash exit codes 0/1/2 map to event-row statuses success/rolled-back/failed, plus the cgroup-escape verification (kill livos.service mid-wipe and observe the bash continues).
- **Plan 04 will run the integration test against Mini PC** (opt-in, manual). This plan only ships the source/test changes; no live execution of factory-reset.sh has occurred during Plan 03.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/system/factory-reset.ts` — FOUND (modified, ~480 lines after edits)
- `livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts` — FOUND (modified, 28 tests, all passing)
- Commit `153cc1a9` (Task 1: deployRuntimeArtifacts) — FOUND in `git log --oneline -5`
- Commit `5a3ffb0a` (Task 2: spawnResetScope + wiring) — FOUND in `git log --oneline -5`
- Commit `c0ff0d0e` (Task 3: tests extended) — FOUND in `git log --oneline -5`
- All acceptance_criteria from Tasks 1-3: PASS (see table above)
- All plan-level checks: PASS (tsc-noEmit clean for factory-reset.*, 28/28 unit tests pass, spawn argv matches reference_cgroup_escape.md verbatim, performFactoryReset returns within 200ms wall-clock, preflight gates the spawn)
- Server4 references: 0 in both files (zero violations)

---
*Phase: 37-backend-factory-reset*
*Completed: 2026-04-29*
