---
phase: "105"
plan: "01"
subsystem: install-scripts
tags:
  - install-scripts
  - bash
  - refactor
  - phase-105
requires:
  - scripts/install/deploy-livinityd.sh (829 lines, post-104-13 baseline)
  - scripts/install/__tests__/test-deploy-livinityd.sh (71 PASS baseline)
  - update.sh (canonical reference, read-only)
provides:
  - "_dld_verify_build helper (verbatim port of update.sh:287-295)"
  - "Anchored --exclude='/docker/' rsync filter (D-105-STEP2-EXCLUDE-ANCHORED)"
  - "_DLD_TEMP_DIR alias matching update.sh:174-178 naming"
  - "Pipeline reorder: secrets BEFORE pnpm install (per CONTEXT pipeline order)"
  - "TEST 16 + TEST 19 + TEST 31 assertions (8 new) covering the refactor"
affects:
  - scripts/install/deploy-livinityd.sh
  - scripts/install/__tests__/test-deploy-livinityd.sh
tech-stack:
  added: []
  patterns:
    - "Named helper extraction (bash function with positional args)"
    - "rsync anchored exclude (leading-slash means top-of-tree only)"
key-files:
  created: []
  modified:
    - scripts/install/deploy-livinityd.sh
    - scripts/install/__tests__/test-deploy-livinityd.sh
decisions:
  - "Helper named _dld_verify_build (matches existing _dld_* convention per CONTEXT 'Claude's Discretion'), not step_N_verify_build"
  - "_DLD_TEMP_DIR aliases _DLD_STAGE_DIR (kept persistent semantics for re-run speed); PID-scoped swap to /tmp/livinity-update-$$ deferred to 105-02 (G7)"
  - "Existing TEST 13 assertion adjusted (Rule 3 deviation) to accept extracted-helper form; semantic invariant of 'every @liv build has a BUILD-FAIL guard' preserved"
metrics:
  duration: "approximately 12 minutes (plan-only execution)"
  completed: "2026-05-12T19:34:16Z"
  commits: 2
  tasks_completed: 2
  files_modified: 2
---

# Phase 105 Plan 01: deploy-livinityd Pipeline Refactor Summary

Pure structural refactor of `scripts/install/deploy-livinityd.sh` to extract a reusable `_dld_verify_build` helper (verbatim port of `update.sh:287-295`), close the un-anchored `docker/` rsync over-match bug (D-105-STEP2-EXCLUDE-ANCHORED), and reorder the `deploy_livinityd` pipeline so JWT + .env writes occur before pnpm install — establishing a stable contract for Plan 105-02 (gap closure) and Plan 105-03 (test extension) without behavioral drift.

## Scope

This plan was a Wave 1 prerequisite for the Phase 105 update.sh 1:1 port. It locks helper names, constants, and pipeline order so the downstream gap-closure plans can be authored against a stable baseline. No new behavior beyond (a) the documented bug fix at line 263 (anchored docker exclude) and (b) the verify_build helper extraction. The current 71-PASS test count + 18 + 24 regression smoke stays green plus 8 new TEST 16 / TEST 19 / TEST 31 assertions land cleanly.

## Tasks Completed

| Task | Name                                                                              | Commit     | Files                                                             |
| ---- | --------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| 1    | Extract _dld_verify_build helper + fix anchored docker exclude + pipeline reorder | `290885bc` | scripts/install/deploy-livinityd.sh, test-deploy-livinityd.sh     |
| 2    | Extend test harness with TEST 16, TEST 19, TEST 31 (8 new assertions)             | `82ff6b6b` | scripts/install/__tests__/test-deploy-livinityd.sh                |

## Key Changes

### 1. `_dld_verify_build` helper extracted (closes RESEARCH G1)

Added at deploy-livinityd.sh:339-352 directly above `_dld_build_packages`. Verbatim port of update.sh:287-295 with `_dld_` prefix per the existing naming convention:

```bash
_dld_verify_build() {
    local pkg="$1"
    local outdir="$2"
    if [[ ! -d "$outdir" ]] || [[ -z "$(find "$outdir" -type f 2>/dev/null | head -1)" ]]; then
        echo "BUILD-FAIL: $pkg produced empty $outdir" >&2
        exit 1
    fi
    echo "[VERIFY] $pkg dist OK ($outdir)"
}
```

Three inlined BUILD-FAIL guards replaced with helper calls:
- `_dld_verify_build "@livos/config" "$_DLD_LIVOS_DIR/packages/config/dist"` (was 4-line `[[ ! -d ]]` block)
- `_dld_verify_build "@livos/ui" "$_DLD_LIVOS_DIR/packages/ui/dist"` (was 4-line block)
- `_dld_verify_build "@liv/${pkg}" "$pkg_dir/dist"` (inside the 4-package liv build loop)

The post-rsync verify at the dist-copy step (line 474 inside `_dld_sync_liv_dist_into_pnpm_store`) was deliberately KEPT as inline — it is a post-copy verify, not a post-build verify, and the failure semantics differ (WARN-continue vs. fail-exit).

Final occurrence count in deploy-livinityd.sh: 7 (1 definition + 3 active call sites + 3 references in commit-prep comments). `grep -cE '_dld_verify_build '` = 7.

### 2. Anchored docker exclude (D-105-STEP2-EXCLUDE-ANCHORED)

deploy-livinityd.sh:272-273 — bug fix from `--exclude='docker/'` (matches both `/docker/` AND `packages/ui/src/routes/docker/`) to `--exclude='/docker/'` (anchored to repo top-level only). Adds inline comment documenting the fix.

This was a live bug from Phase 104 mainserver deployment — the un-anchored exclude silently dropped UI route files at deploy time. Reference: `project_p104_deploy_gap.md` bug #4.

### 3. `_DLD_TEMP_DIR` alias

Added at deploy-livinityd.sh:67-69 — alias for `_DLD_STAGE_DIR` matching update.sh:174-178 naming convention. Persistent semantics preserved (cached `/tmp/livos-install-stage` between install.sh re-runs for speed). Plan 105-02 (G7) will swap to PID-scoped `/tmp/livinity-update-$$` and add cleanup.

### 4. Pipeline reorder in `deploy_livinityd()` body

Moved `_dld_generate_jwt_secret` and `_dld_write_env_file` to BEFORE `_dld_write_pnpm_npmrc` per CONTEXT.md §"Pipeline Order" requirement that secrets exist before any pnpm step that might inspect env. The 6 load-bearing invariants in the plan are all preserved:

- `_dld_build_liv_packages` runs AFTER `_dld_setup_postgres` ✓
- `_dld_sync_liv_dist_into_pnpm_store` runs AFTER `_dld_build_liv_packages` ✓
- `_dld_write_liv_systemd_units` runs AFTER `_dld_sync_liv_dist_into_pnpm_store` ✓
- `_dld_write_liv_systemd_units` runs BEFORE `_dld_write_systemd_unit` ✓
- `_dld_health_check` runs AFTER `_dld_write_systemd_unit` ✓
- `_dld_update_caddy_to_livinityd` runs AFTER `_dld_health_check` ✓

### 5. Banner comments + docstring updates

- Top-of-file banner documenting the 105-01 refactor (lines 3-7)
- `deploy_livinityd()` docstring updated to reference the reordered pipeline (lines 818-823)
- `ok` final message references 104-11/104-12/104-13/**105-01** lineage

### 6. Test harness extension (test-deploy-livinityd.sh)

Three new assertion blocks inserted between TEST 15 and the Summary section:

- **TEST 16** (4 assertions): `_dld_verify_build()` defined, BUILD-FAIL literal preserved, `_dld_verify_build` called ≥ 4× (1 def + 3+ sites), no inlined `[[ ! -d ... dist ]]` guards remain
- **TEST 19** (2 assertions): positive `--exclude='/docker/'` present, negative `--exclude='docker/'` absent
- **TEST 31** (2 assertions): `_DLD_TEMP_DIR=` alias defined, alias references `_DLD_STAGE_DIR`

Summary header updated from `Plan 104-11/12/13 test results` to `Plan 104-11/12/13 + 105-01 test results`.

## Verification Evidence

### Test pass counts (target: 79 + 18 + 24 = 121)

```
test-deploy-livinityd.sh:   79 PASS, 0 FAIL   (was 71; +8 new)
test-mode-hybrid-args.sh:   18 PASS, 0 FAIL   (regression smoke unchanged)
test-mode-tunnel-args.sh:   24 PASS, 0 FAIL   (regression smoke unchanged)
COMBINED:                   121 PASS, 0 FAIL
```

### Syntax + helper presence

```
$ bash -n scripts/install/deploy-livinityd.sh    # exits 0 — syntax clean
$ grep -cE '^_dld_verify_build\(\)' scripts/install/deploy-livinityd.sh
1
$ grep -cE '_dld_verify_build ' scripts/install/deploy-livinityd.sh
7
```

### Anchored exclude (positive + negative)

```
$ grep -nE "exclude=.{0,3}/docker/" scripts/install/deploy-livinityd.sh
6:# - Fixed anchored --exclude='/docker/' (was 'docker/' — D-105-STEP2-EXCLUDE-ANCHORED).
273:        --exclude='/docker/' \
824:#   - Anchored --exclude='/docker/' (was 'docker/' — D-105-STEP2-EXCLUDE-ANCHORED)
$ grep -nE "exclude='docker/'" scripts/install/deploy-livinityd.sh
# (no output — un-anchored form fully removed)
```

### TEMP_DIR alias

```
$ grep -nE '^_DLD_TEMP_DIR=' scripts/install/deploy-livinityd.sh
68:_DLD_TEMP_DIR="$_DLD_STAGE_DIR"
```

### Sacred SHA preservation (MANDATORY invariant)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Match against the constraint declared in `<sacred_constraint>` (PLAN.md and execute-plan instructions). This plan touched zero files under `liv/packages/core/src/` — trivially preserved.

### update.sh untouched (D-105-NO-PROD-IMPACT invariant)

```
$ git diff HEAD -- update.sh | wc -l
0
```

The canonical reference at repo root is byte-identical to its pre-plan state. Mini PC re-runs of update.sh remain unaffected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TEST 13 BUILD-FAIL literal grep invalidated by extraction**

- **Found during:** Task 1 verification (running test-deploy-livinityd.sh after Task 1 edits)
- **Issue:** Existing TEST 13 assertion `grep -qE 'BUILD-FAIL.*@liv|BUILD-FAIL.*liv/' "$DEPLOY_SH"` matched the inline `fail "BUILD-FAIL: @liv/${pkg} produced empty dist..."` literal. After extraction to `_dld_verify_build`, the literal `BUILD-FAIL: @liv` no longer appears in deploy-livinityd.sh (the helper constructs the string at runtime from positional arg `"$pkg"`).
- **Fix:** Extended the grep pattern in TEST 13 to also accept the extracted-helper form: `grep -qE 'BUILD-FAIL.*@liv|BUILD-FAIL.*liv/|_dld_verify_build "@liv/'`. Added a documentation comment explaining the 105-01 update and that the semantic invariant ("every @liv build has a failure guard") is preserved.
- **Files modified:** scripts/install/__tests__/test-deploy-livinityd.sh (test edit committed alongside the Task 1 deploy-livinityd.sh edits in commit `290885bc`)
- **Commit:** `290885bc`
- **Rationale:** The plan required "existing 71 assertions still PASS unchanged" — adjusting one assertion's pattern (not removing or weakening it) to recognise the new representation is the minimal change preserving semantic intent. Alternative: leave TEST 13 broken and document — rejected because it would leave a known-broken assertion in CI.

**2. [Rule 1 - Bug in own test code] TEST 16 inline_count fallback corrupted integer comparison**

- **Found during:** Task 2 verification (first run of TEST 16 after insertion)
- **Issue:** I wrote `inline_count=$(grep -cE '...' "$DEPLOY_SH" 2>/dev/null || echo 0)`. When grep -c finds zero matches, it OUTPUTS "0" AND exits non-zero, triggering the `|| echo 0` to append another "0". The captured variable became "0\n0" → "0 0" when expanded — not a valid integer for `(( inline_count <= 0 ))`. The `(( ... ))` arithmetic comparison failed parsing and reported "FAIL: 0\n0 inlined BUILD-FAIL guards still present".
- **Fix:** Removed the spurious `2>/dev/null || echo 0` fallback. `grep -c` always outputs a number to stdout; non-zero exit on no-match is non-blocking because the test script uses `set -uo pipefail` (no `-e`). Same fix applied to the adjacent `verify_count=` line for consistency. Changed `(( inline_count <= 0 ))` to `(( inline_count == 0 ))` (equivalent since count is unsigned).
- **Files modified:** scripts/install/__tests__/test-deploy-livinityd.sh (in the same Task 2 commit `82ff6b6b`)
- **Commit:** `82ff6b6b`
- **Rationale:** Pre-existing pattern in the same file (TEST 14 awk-based extractions) uses bare `$(... | grep ...)` without `|| echo 0` fallback. Aligning new code with the existing style fixes the bug at root rather than papering over it.

### Authentication Gates

None — no auth credentials or external services involved in this refactor.

## Carry-Forward to Plan 105-02 (gap closures G2-G9)

Locked contract for Wave 2 consumers:

- Helper naming convention: `_dld_*` (NOT `step_N_*`). `_dld_verify_build` is the canonical verify guard — call it in every new build step.
- `_DLD_TEMP_DIR` is an alias of `_DLD_STAGE_DIR` today; Plan 105-02 G7 will rotate it to PID-scoped + add cleanup. Consumers should reference `_DLD_TEMP_DIR` (forward-compat).
- Pipeline order: secrets (JWT + .env) now write BEFORE pnpm install. Plan 105-02 inserts the streaming apt block between `_dld_clone_source` and `_dld_generate_jwt_secret`; gallery cache + permissions between `_dld_sync_liv_dist_into_pnpm_store` and `_dld_write_liv_systemd_units`; cleanup as final step before the `ok` banner.

Open gaps (closed in 105-02): G2 apt streaming packages + ydotoold unit, G3 atomic self-rsync, G4 npm flag alignment, G5 gallery cache helper, G6 chown + chmod app-script, G7 PID-scoped temp dir + cleanup, G8 UI `rm -rf dist` before vite build, G9 `.deployed-sha` write.

Plan 105-03 (test extension, Wave 2 parallel) will add TESTS 17, 18, 20-30, 32, 33 covering 105-02's gap closures. TEST 16/19/31 (this plan) are already shipped.

## Self-Check: PASSED

Verification claims checked:

```
$ [ -f scripts/install/deploy-livinityd.sh ] && echo FOUND || echo MISSING
FOUND
$ [ -f scripts/install/__tests__/test-deploy-livinityd.sh ] && echo FOUND || echo MISSING
FOUND
$ git log --oneline -3
82ff6b6b test(105-01): add TEST 16 + TEST 19 + TEST 31 assertions for refactor
290885bc refactor(105-01): extract _dld_verify_build + anchor docker exclude + reorder pipeline
78863ae0 docs(105): plan Phase 105 — deploy-livinityd 1:1 update.sh port (4 plans, 3 waves)
```

Both commits land on the worktree branch (290885bc Task 1, 82ff6b6b Task 2). Files referenced in this SUMMARY all exist on disk. Sacred SHA and update.sh invariants both verified above.
