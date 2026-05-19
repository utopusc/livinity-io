---
phase: 163-surface-vault-contexts
plan: 01
plan_number: 163-01
phase_number: 163
type: summary
wave: 1
tags:
  - surface-vault
  - cc-integration
  - phase-163
  - v34
requires:
  - "Phase 162-01 vault scaffolder SHIPPED (provides /home/bruce/livinity-vault root)"
provides:
  - "writeSurfaceContext({kind, metadata, vaultPath?, ownerUser?, ownerGroup?, logger?}) -> WriteSurfaceContextResult"
  - "removeSurfaceContext({kind, appId, vaultPath?, logger?}) -> RemoveSurfaceContextResult (move-to-trash via fs.rename)"
  - "Tail-call wire-up in apps.ts::installForUser + uninstallForUser (webapp kind)"
  - "Tail-call wire-up in NativeInstaller.install + uninstall (native kind)"
  - "claude-runner barrel re-exports for both functions + 6 types"
affects:
  - "Plan 163-02 can use vault/surfaces/<kind>/<appId>/ as cwd for surface-prefixed SDK sessions"
  - "Webapp installs (apps.ts) and native installs (native-installer.ts) auto-materialise per-app CLAUDE.md"
tech-stack:
  added: []
  patterns:
    - "Discriminated-union result type (never throws — mirrors Phase 162-01 ScaffoldResult contract)"
    - "Move-to-trash uninstall via fs.rename → `<dir>.deleted-<Date.now()>` (operator-recoverable)"
    - "Best-effort chown -R via execFile child process; failure logged + non-fatal"
    - "Idempotent file write (writeFile overwrites; chmod 0644 explicit because mode option only applies on create)"
    - ".then(result-discriminator) tail-call pattern in callers — no try/catch needed since the function never throws"
key-files:
  created:
    - livos/packages/livinityd/source/modules/claude-runner/surface-context.ts
    - livos/packages/livinityd/source/modules/claude-runner/surface-context.test.ts
  modified:
    - livos/packages/livinityd/source/modules/claude-runner/index.ts (barrel re-export)
    - livos/packages/livinityd/source/modules/apps/apps.ts (installForUser + uninstallForUser tail-calls)
    - livos/packages/livinityd/source/modules/apps/native-installer.ts (install + uninstall tail-calls)
decisions:
  - "Move-to-trash via fs.rename (NOT rm -rf) so operator can recover an accidental uninstall"
  - "Non-fatal contract: vault write/rename failure NEVER propagates to install/uninstall outcome"
  - "Best-effort chown: execFile chown is wrapped in try/catch and continues on failure (CI/Windows safe)"
  - "Template renderers are pure (no I/O) — testable in isolation; embedded directly in the module per plan, NOT consulted from 163-CONTEXT.md sketch"
  - "removeSurfaceContext signature takes just opts.appId (no opts.metadata?.appId walked-back form, per executor guidance)"
metrics:
  duration_minutes: ~10
  tasks_completed: 3
  commits: 3
  files_created: 2
  files_modified: 3
  tests_added: 12
  tests_passing: 12
  completed_at: 2026-05-19T10:52:00Z
---

# Phase 163 Plan 01: Surface Vault Scaffolder + App Install Hooks Summary

One-liner: Per-app `CLAUDE.md` materialiser at `vault/surfaces/<kind>/<appId>/` wired into webapp + native install/uninstall paths, with rename-based move-to-trash on uninstall and a strict non-fatal discriminated-union contract.

## What Shipped

Plan 163-01 lays the cwd target every Phase 163-02+ surface-prefixed SDK session will read. Before this plan there was nothing to point `cwd` at when a session used a `webapp:` or `native:` `conversationId`. After this plan:

- WebApp install → `vault/surfaces/webapp/<appId>/CLAUDE.md` is rendered with app metadata + computer-use tool hints + cross-surface wikilinks.
- Native install → `vault/surfaces/native/<appId>/CLAUDE.md` is rendered with binaryPath + `desktopEntry.comment` as the `appSpecificHint`.
- WebApp/Native uninstall → surface dir is renamed `<dir>.deleted-<unixMs>` for operator-recoverable move-to-trash safety.
- All vault writes are non-fatal: a vault that is unmounted, full, or has wrong permissions never blocks an install or uninstall.

### Commits

| Hash       | Task | Subject                                                                       |
| ---------- | ---- | ----------------------------------------------------------------------------- |
| `e66e92a2` | 1    | feat(163-01): surface vault scaffolder module                                 |
| `33e6a089` | 2    | test(163-01): surface-context invariants (12 tests)                           |
| `ea949acf` | 3    | feat(163-01): wire writeSurfaceContext into installForUser + NativeInstaller  |

### Files Created (2)

- `livos/packages/livinityd/source/modules/claude-runner/surface-context.ts` (236 lines) — the new module exporting `writeSurfaceContext`, `removeSurfaceContext`, plus 6 types.
- `livos/packages/livinityd/source/modules/claude-runner/surface-context.test.ts` (166 lines) — vitest suite: 5 source-text invariants + 7 runtime behaviors = 12 tests.

### Files Modified (3)

- `livos/packages/livinityd/source/modules/claude-runner/index.ts` — added `writeSurfaceContext`/`removeSurfaceContext` re-export + 6 type re-exports.
- `livos/packages/livinityd/source/modules/apps/apps.ts` — added import + `installForUser` tail-call (`kind: 'webapp'`) + `uninstallForUser` tail-call.
- `livos/packages/livinityd/source/modules/apps/native-installer.ts` — added import + `install` tail-call (`kind: 'native'`) + `uninstall` tail-call.

## Test Results

```
$ pnpm exec vitest run source/modules/claude-runner/surface-context.test.ts
 ✓ source/modules/claude-runner/surface-context.test.ts (12 tests) 157ms
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

12/12 PASS:

**Source-text invariants (5):**
1. `writeSurfaceContext` exported
2. `removeSurfaceContext` exported
3. Move-to-trash invariant (`.deleted-` present; no `rm -rf` or `fse.remove`)
4. Non-fatal contract (`failed-non-fatal` literal appears ≥2 times)
5. Default vault path is `/home/bruce/livinity-vault`

**Runtime behaviors (7):**
6. WebApp CLAUDE.md written with rendered metadata (App ID, subdomain)
7. Native CLAUDE.md written with binaryPath
8. Idempotency — re-running with same args returns `written` both times
9. Rename-on-remove — original dir gone, `.deleted-<unixMs>` exists, suffix matches `/\.deleted-\d{10,}$/`
10. Absent appId → `{status: 'absent'}` no throw
11. File mode 0644 (Windows skipped — POSIX bits N/A)
12. Chown to non-existent owner → still `written` (best-effort contract)

### Regression Tests

```
$ pnpm exec vitest run source/modules/apps/install-for-user-injection.test.ts
 ✓ install-for-user-injection.test.ts (3 tests) 8ms
 Tests  3 passed (3)
```

3/3 PASS — the pre-existing apps install-path tests unchanged.

`apps.integration.test.ts` was NOT run because of a pre-existing Windows-only native binding failure (`drivelist.node` not built for Windows). Verified via `git stash` round-trip that this failure pre-dates this plan's changes. Out-of-scope per executor Scope Boundary rule.

## Sacred Constraint Verification

| Constraint                                                          | Status | Evidence                                                                                                |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Sacred SHA (`liv/packages/core/src/sdk-agent-runner.ts`)            | PASS   | `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| D-09 verbatim (`luse-system-prompt.ts`)                             | PASS   | `git diff HEAD~3 -- livos/.../computer-use/luse-system-prompt.ts \| wc -l` → 0                          |
| 161-02 helper (`agent-prompt-builder.ts`)                           | PASS   | `git diff HEAD~3 -- livos/.../ai/agent-prompt-builder.ts \| wc -l` → 0                                  |
| `agent-session.ts` zero-diff (163-02.5 territory)                   | PASS   | `git diff HEAD~3 -- liv/packages/core/src/agent-session.ts \| wc -l` → 0                                |
| D-NO-NEW-DEPS                                                       | PASS   | `git diff HEAD~3 -- '**/package.json' \| wc -l` → 0                                                     |

## Source-Text Invariants (Acceptance Lock)

| Invariant                                                                                              | Result |
| ------------------------------------------------------------------------------------------------------ | ------ |
| `grep -cF "writeSurfaceContext" claude-runner/index.ts` ≥ 1                                            | PASS (1) |
| `grep -cF "writeSurfaceContext" apps/apps.ts` ≥ 2                                                      | PASS (2) |
| `grep -cF "removeSurfaceContext" apps/apps.ts` ≥ 2                                                     | PASS (2) |
| `grep -cF "writeSurfaceContext" apps/native-installer.ts` ≥ 2                                          | PASS (2) |
| `grep -cF "removeSurfaceContext" apps/native-installer.ts` ≥ 2                                         | PASS (2) |
| `grep -cF "kind: 'webapp'" apps/apps.ts` ≥ 1                                                           | PASS (2) |
| `grep -cF "kind: 'native'" apps/native-installer.ts` ≥ 1                                               | PASS (2) |
| `grep -cF ".deleted-" claude-runner/surface-context.ts` ≥ 1                                            | PASS (3) |
| `grep -cE "rm\s+-rf\|fse\.remove" claude-runner/surface-context.ts` == 0                               | PASS (0) |
| `grep -cE "^export (async )?function (write\|remove)SurfaceContext" surface-context.ts` == 2          | PASS (2) |
| `grep -cE "^export (type\|interface)" surface-context.ts` ≥ 6                                          | PASS (6) |
| `grep -c "failed-non-fatal" surface-context.ts` ≥ 2                                                    | PASS (6) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc-comment literals `rm -rf` triggered "forbidden pattern" guard**

- **Found during:** Task 1, after creating `surface-context.ts`
- **Issue:** The module header doc-comment originally read "renames the surface dir to `.deleted-<unixMs>` (move-to-trash, NOT rm -rf) when uninstalled" and the `removeSurfaceContext` function jsdoc said "This is deliberately NOT `rm -rf`". Both lines literally contain `rm -rf`, which made:
  - Task 1 acceptance criterion `grep -cE "rm.*-rf|rmdir|fse\.remove" surface-context.ts` returns 0 matches FAIL (returned 2 instead of 0).
  - Task 2 source-text invariant `expect(MODULE_SOURCE).not.toMatch(/rm\s+-rf/)` would have failed.
  These doc comments semantically express the OPPOSITE of using `rm -rf`, but the grep-based guards can't tell the difference.
- **Fix:** Rephrased both doc comments to use "unlink" / "(NOT an unlink)" instead of literal `rm -rf` while preserving meaning. Functionally identical documentation.
- **Files modified:** `livos/packages/livinityd/source/modules/claude-runner/surface-context.ts` (2 comment lines)
- **Committed in:** `e66e92a2` (Task 1, same commit — adjustment was made before initial commit)

### Plan Inconsistency Adjustments

**2. [Plan optional `manifest.name` guard]**

- **Found during:** Task 3 wiring `apps.ts::installForUser`
- **Issue:** Plan literal said `name: manifest.name ?? appId`. The plan's `<defensive notes>` block also said "`manifest.name` may be undefined for some legacy templates. Fall back to `appId`." However, since `manifest` is typed `any` (parsed from YAML), passing it directly into `SurfaceMetadata.name: string` would TypeScript-error if strict. To match the plan's defensive intent without TS friction, wrote `name: typeof manifest.name === 'string' ? manifest.name : appId` (same defensive guard pattern as `description`/`category` in the same call).
- **Files modified:** `livos/packages/livinityd/source/modules/apps/apps.ts` (installForUser call)
- **Committed in:** `ea949acf` (Task 3)

## TypeScript Health

`pnpm exec tsc --noEmit` on the livinityd workspace:

- **Zero NEW errors** in `surface-context.ts`, `surface-context.test.ts`, or `claude-runner/index.ts`.
- **Zero NEW errors** in `apps.ts` or `native-installer.ts` — pre-existing errors at the same line offsets (`Buffer<ArrayBufferLike>` not assignable to `string` × 3, `REDIS_PLATFORM_URL` not found × 1, `working_dir` × 1) are present BEFORE and AFTER this plan's changes (verified via `git stash` diff). Out-of-scope per executor Scope Boundary rule (matches 162-01-SUMMARY precedent).

## Authentication Gates

None. This plan touches no auth-bearing code paths.

## Next Steps (Plan 163-02)

Plan 163-02 (`Phase 161 isComputerUseSession → CWD Resolution`) consumes the surface dirs as `cwd` for `webapp:` / `native:` prefixed sessions. It modifies `livos/packages/livinityd/source/modules/server/ws-agent.ts` ONLY — Phase 161 helpers + 163-01 module remain untouched.

This plan unblocks 163-02 by providing two function signatures + the on-disk vault directories that the resolver in ws-agent.ts will `stat` and pass as `vaultPath` into `sessionManager.startSession`.

## Self-Check: PASSED

- Files created exist: 2/2 verified via filesystem
- Files modified exist + contain expected greps: 3/3 verified
- Commits exist in `git log --oneline`: `e66e92a2`, `33e6a089`, `ea949acf` all present
- Sacred SHA preserved: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches at HEAD
- D-09 zero-diff vs HEAD~3: confirmed
- 161-02 helper zero-diff vs HEAD~3: confirmed
- `agent-session.ts` zero-diff vs HEAD~3: confirmed
- D-NO-NEW-DEPS: zero package.json diff vs HEAD~3
- Tests: 12/12 PASS for new suite; 3/3 PASS for install-for-user-injection regression

## TDD Gate Compliance

Plan structure: Task 1 (feat) → Task 2 (test) → Task 3 (feat). Task 2 carries `tdd="true"`. The test file exercises a module already shipped by Task 1's `feat` commit — this is the same single-GREEN-commit pattern used in Phase 162-01 (and the rationale is identical: the scaffolder module file itself does not exist during a pure RED phase, so committing a test-only state would leave the tree uncompilable). The plan-level type is `execute`, not `tdd`, so plan-level RED/GREEN/REFACTOR gate ordering does not apply. Per-task `tdd="true"` GREEN-only execution matches the plan's `<action>` instructions verbatim.
