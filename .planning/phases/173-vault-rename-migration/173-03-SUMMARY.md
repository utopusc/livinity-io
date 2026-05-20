---
phase: 173-vault-rename-migration
plan: 03
subsystem: build-tools/sacred-sha-gate
tags: [sacred-sha, byte-freeze, pre-commit, v38, json-registry]
requires:
  - .husky/pre-commit  # caller, unchanged
  - liv/packages/core/src/sdk-agent-runner.ts  # Phase 97 SHA carry-over
  - livos/packages/livinityd/source/modules/vault-items/*.ts  # Phase 171 freeze targets
  - livos/packages/cli/src/**/*.ts (non-test)  # Phase 172 freeze targets
provides:
  - JSON-driven sacred SHA pin registry (25 files locked)
  - Data-driven check-sacred.sh (no shell edits needed for future freezes)
  - Bash CI test exercising PASS + FAIL paths
affects:
  - All future commits in this repo: pre-commit hook now verifies 25 files (was 1)
tech_stack:
  added:
    - node (eval for JSON parsing inside POSIX shell — already a transitive engine requirement)
  patterns:
    - JSON-driven registry pattern → future freeze plans add records, not shell code
key_files:
  created:
    - scripts/sacred-shas-v38.json
    - scripts/__tests__/test-check-sacred-v38.sh
  modified:
    - scripts/check-sacred.sh
decisions:
  - "JSON registry over hardcoded array: future v38 freezes (Phase 175, 179, etc.) add records without touching the hook script"
  - "node -e over jq: keeps the hook portable across Linux/macOS/Windows-git-bash without an extra dep (node is already an engines requirement)"
  - "Test uses cygpath-aware path normalizer (npath helper) so the same script runs on Windows Git-Bash CI + Linux CI without forking"
  - "Sandbox registry placed under scripts/__sandbox_173_03_N__/ (not mktemp) — guarantees a relative-path-resolvable location from repo root on Windows, where /tmp resolves to C:\\tmp under Node"
  - "migration-v35-to-v38.ts (sibling 173-02 output) intentionally NOT in the registry — circular freeze within Wave 1 is unsafe; a later phase will pin it"
metrics:
  duration: "5m 23s"
  completed: "2026-05-20"
  commits: 3
  files_created: 2
  files_modified: 1
  registry_entries: 25
---

# Phase 173 Plan 03: Sacred SHA Hook v38 Freeze Summary

JSON-driven sacred SHA registry shipped with **25 entries** (1 Phase 97 + 6 Phase 171 vault-items + 18 Phase 172 @livos/cli src files); rewrote `scripts/check-sacred.sh` to iterate the JSON registry while preserving the existing `.husky/pre-commit` exit-code contract verbatim; added a CI test that exercises both PASS-on-HEAD and FAIL-on-mutation/missing-file paths.

## Outcome

- `scripts/check-sacred.sh` now reads `scripts/sacred-shas-v38.json`, iterates every `{path, expected_sha, frozen_in_phase}` record, computes `git hash-object` per entry, and exits non-zero on any mismatch or missing file.
- Verified live: `sh scripts/check-sacred.sh` → `[sacred-sha] PASS: 25 files verified`, exit 0.
- Verified live: `bash scripts/__tests__/test-check-sacred-v38.sh` → **12 PASS / 0 FAIL** (shape, registry JSON shape, sdk-agent-runner pin presence, HEAD PASS path, mutated-file FAIL path, missing-file FAIL path).
- `.husky/pre-commit` UNCHANGED — last commit `a6c519fd feat(100-01): install sacred-SHA pre-commit gate (D-100-SACRED)`. Its contract `exec sh check-sacred.sh` continues to work.
- Phase 97 audit harness `scripts/verify-sacred-sha.cjs` still PASSes — single-file legacy check intact, separate concern unchanged.
- Pre-commit hook ran during each of this plan's 3 commits and **PASSed all 3 times** → live proof that the new data-driven check works on the actual commit-flow path.

## SHA Drift Check

Re-ran `git hash-object` against every file listed in the planning-time interfaces block **before** writing the JSON. Result: **ZERO drift** — all 25 SHAs match the planning-time values exactly. Wave 1 parallel siblings (173-01, 173-02, 173-04) did NOT mutate any vault-items or cli/src/ files (as designed — they ship NEW files and modify deploy scripts only).

| File | Planning-time SHA | Execution-time SHA | Drift |
|------|-------------------|---------------------|-------|
| `liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d…` | `f3538e1d…` | 0 |
| `livos/packages/livinityd/source/modules/vault-items/types.ts` | `b95ec8c5…` | `b95ec8c5…` | 0 |
| `…/vault-root-resolver.ts` | `b1e22923…` | `b1e22923…` | 0 |
| `…/item-store.ts` | `8bafbdce…` | `8bafbdce…` | 0 |
| `…/tree-resolver.ts` | `ce4b8320…` | `ce4b8320…` | 0 |
| `…/pubsub.ts` | `35e62155…` | `35e62155…` | 0 |
| `…/vault-items/index.ts` | `5045b76c…` | `5045b76c…` | 0 |
| `livos/packages/cli/src/cli.ts` | `28496c16…` | `28496c16…` | 0 |
| `…/cli/src/auth.ts` | `23fa2a07…` | `23fa2a07…` | 0 |
| `…/cli/src/version.ts` | `ff67758e…` | `ff67758e…` | 0 |
| `…/cli/src/vault-bootstrap.ts` | `dfac729b…` | `dfac729b…` | 0 |
| `…/cli/src/filesystem-mode.ts` | `602ed2b2…` | `602ed2b2…` | 0 |
| `…/cli/src/query-client.ts` | `4dea59a7…` | `4dea59a7…` | 0 |
| `…/cli/src/commands/agent.ts` | `ffc7fe91…` | `ffc7fe91…` | 0 |
| `…/cli/src/commands/attach.ts` | `3a9999e0…` | `3a9999e0…` | 0 |
| `…/cli/src/commands/chat.ts` | `074d08fb…` | `074d08fb…` | 0 |
| `…/cli/src/commands/config.ts` | `2e65bb6c…` | `2e65bb6c…` | 0 |
| `…/cli/src/commands/doctor.ts` | `8bcbd007…` | `8bcbd007…` | 0 |
| `…/cli/src/commands/init.ts` | `d6f1ea80…` | `d6f1ea80…` | 0 |
| `…/cli/src/commands/list.ts` | `116e6981…` | `116e6981…` | 0 |
| `…/cli/src/commands/migrate.ts` | `57503f31…` | `57503f31…` | 0 |
| `…/cli/src/commands/project.ts` | `cf54f3ba…` | `cf54f3ba…` | 0 |
| `…/cli/src/commands/query.ts` | `b9c33984…` | `b9c33984…` | 0 |
| `…/cli/src/query/handlers.ts` | `b6039e0f…` | `b6039e0f…` | 0 |
| `…/cli/src/query/registry.ts` | `bed545d2…` | `bed545d2…` | 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Windows path translation in test script**
- **Found during:** Task 3 first run
- **Issue:** Initial test (per plan template) used `mktemp -d` for sandbox dirs and passed paths to `node -e` via Bash interpolation. On Windows Git-Bash, `mktemp -d` returns POSIX paths like `/tmp/tmp.XYZ`; Node interprets them as Windows-relative (`C:\tmp\tmp.XYZ`) and throws `ENOENT`. Also, multiple Node calls embedded the registry path as a string in the script body (`'$REGISTRY'`) instead of passing it as `process.argv[1]`, compounding the same translation bug.
- **Fix:**
  1. Added `npath()` helper that calls `cygpath -w` when available, passes through unchanged on Linux/macOS.
  2. Switched all `node -e` calls to read paths from `process.argv[1]` (single, controlled translation point) instead of in-string interpolation.
  3. Moved sandbox dirs from `mktemp -d` to `scripts/__sandbox_173_03_N__/` (relative to repo root) so the same `sed s|scripts/sacred-shas-v38.json|scripts/__sandbox_…/registry.json|` substitution resolves identically on every platform when the hook is launched from `$REPO_ROOT`.
- **Files modified:** `scripts/__tests__/test-check-sacred-v38.sh` (replaced before the first commit — no separate bug-fix commit)
- **Result:** Test went from 7 PASS / 5 FAIL → **12 PASS / 0 FAIL**, single commit `421365ce`.

## Authentication Gates

None. Fully autonomous execution.

## Self-Check: PASSED

- `scripts/sacred-shas-v38.json` exists, parses to a 25-element array, every entry has `{path, expected_sha (40-hex), frozen_in_phase}` — verified.
- `scripts/check-sacred.sh` rewritten — `sh -n` clean, exits 0 on HEAD with `[sacred-sha] PASS: 25 files verified` — verified.
- `scripts/__tests__/test-check-sacred-v38.sh` exists, exits 0 with 12 PASS / 0 FAIL — verified.
- Commits `2799440a`, `3a122aeb`, `421365ce` present in `git log` — verified.
- `.husky/pre-commit` untouched (last commit `a6c519fd` from Phase 100-01) — verified.
- `scripts/verify-sacred-sha.cjs` (Phase 97 audit harness) still PASSes — verified.
- `migration-v35-to-v38.ts` (sibling 173-02 output) NOT in registry — verified by grep.

## Registry Extension Recipe (for future v38 freezes)

When a future plan (Phase 175 backend, Phase 179, etc.) wants to lock additional files:

1. Compute `git hash-object <path>` for each file you want frozen against the current HEAD.
2. Append a new record to `scripts/sacred-shas-v38.json`:
   ```json
   {
     "path": "path/to/new/file.ts",
     "expected_sha": "<40-hex from git hash-object>",
     "frozen_in_phase": "<phase-id>",
     "rationale": "<1-sentence why this file must not drift>"
   }
   ```
3. Run `sh scripts/check-sacred.sh` — should print `[sacred-sha] PASS: N+1 files verified` (where N was previous count).
4. Run `bash scripts/__tests__/test-check-sacred-v38.sh` — should stay at 12 PASS / 0 FAIL.
5. Commit. Pre-commit hook auto-verifies the new entry.

**Do NOT** edit `scripts/check-sacred.sh` or the test script for normal freeze additions — the JSON IS the contract.

## Commit Log

| Hash | Task | Message |
|------|------|---------|
| `2799440a` | Task 1 | feat(173-03): add sacred-shas-v38 JSON registry (25 entries pinned) |
| `3a122aeb` | Task 2 | feat(173-03): rewrite check-sacred.sh to iterate JSON registry (25 files) |
| `421365ce` | Task 3 | test(173-03): add CI test for JSON-driven sacred SHA check (PASS+FAIL paths) |

Each commit passed the pre-commit hook ⇒ live proof that the v38 sacred gate is working end-to-end on the actual commit flow.
