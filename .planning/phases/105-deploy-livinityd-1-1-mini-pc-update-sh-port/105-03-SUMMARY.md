---
phase: "105"
plan: "03"
subsystem: install-scripts
tags:
  - install-scripts
  - bash
  - test-harness
  - phase-105
requires:
  - scripts/install/deploy-livinityd.sh (post-105-02 baseline, 1038 lines)
  - scripts/install/__tests__/test-deploy-livinityd.sh (79 PASS baseline from 105-01)
provides:
  - "TEST 17/18 — G2 streaming pkgs + ydotoold systemd unit assertions"
  - "TEST 20 — G3 atomic update.sh self-rsync assertion"
  - "TEST 21 — G5 gallery cache helper assertion"
  - "TEST 22/23 — G6 chown + chmod app-script assertions"
  - "TEST 24 — G7 cleanup + LIVOS_UPDATE_COMPLETED sentinel assertion"
  - "TEST 25 — G8 UI rm -rf dist defensive fresh-build assertion"
  - "TEST 26 — D-105-NO-PROD-IMPACT update.sh write-protection guard"
  - "TEST 27/28 — Hazard #2 + #3 pipeline-order invariants"
  - "TEST 28b/c/d — D-105-STEP8 sub-decision (daemon-reload + start-order + warn-not-fail) guards"
  - "TEST 29 — Hazard #1 PGPASSWORD shell-scope guard"
  - "TEST 30 — Sacred SHA negative-grep on sdk-agent-runner writes"
  - "TEST 32a/b/c/d/e — 4 systemd unit-write constants + ydotoold literal-path heredoc"
affects:
  - scripts/install/__tests__/test-deploy-livinityd.sh
tech-stack:
  added: []
  patterns:
    - "Function-body awk-extraction + word-boundary grep for multi-line apt-get install blocks"
    - "Negative-grep invariant assertions for sacred-file write protection"
    - "Pipeline-order assertions via awk-extracted line-number comparison"
key-files:
  created: []
  modified:
    - scripts/install/__tests__/test-deploy-livinityd.sh
decisions:
  - "TEST 17 multi-line apt-get install pattern handled via function-body extraction (single-line regex was insufficient for backslash-continuation form)"
  - "TEST 33 deleted per plan revision — duplicate of existing TEST 10 (liv-mcp-server negative-grep at line 277)"
  - "Plan-table arithmetic error (36 sum vs 38 row-by-row) acknowledged; actual PASS count is 117 not 115 (intent preserved — all 21 TEST blocks added)"
metrics:
  duration: "approximately 8 minutes (worktree parallel-execution mode)"
  completed: "2026-05-12T20:55:30Z"
  commits: 1
  tasks_completed: 1
  files_modified: 1
  lines_added: 347
  test-count: "117 PASS (was 79 — +38 new assertions; plan estimate was 115 due to upstream 36 vs 38 arithmetic error)"
---

# Phase 105 Plan 03: Test Harness Extension Summary

Static-grep enforcement of every Plan 105-02 gap closure (G2-G9), the three pipeline/auth hazards from RESEARCH §4, the D-105-STEP8 sub-decisions (daemon-reload / start-order / warn-not-fail), the sacred-SHA write-protection invariant, and the D-105-NO-PROD-IMPACT update.sh write-protection invariant — all now grep-asserted in `scripts/install/__tests__/test-deploy-livinityd.sh`. The harness grows from 79 to 117 PASS (38 new assertions across 21 TEST blocks); any future refactor that silently undoes a gap closure or violates an invariant trips the suite.

## Scope

Wave 2 plan executed in parallel with Plan 105-02 (different file — 105-02 modifies `deploy-livinityd.sh`, 105-03 modifies the test file). Because 105-02 landed first on this worktree base, all 38 new assertions PASS immediately (the parallelism-tolerance caveat in the plan body — `~11 G2-G8 FAILs expected if 105-03 lands first` — does not apply here).

This plan does NOT modify `scripts/install/deploy-livinityd.sh` (105-02's territory). This plan does NOT modify `update.sh` (D-105-NO-PROD-IMPACT). This plan does NOT touch any file under `liv/packages/core/src/` — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` trivially preserved.

## Tasks Completed

| Task | Name                                                                                                                    | Commit     | Files                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| 1    | Append 21 TEST blocks (TESTs 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 28b, 28c, 28d, 29, 30, 32a, 32b, 32c, 32d, 32e) | `535e4f3c` | scripts/install/__tests__/test-deploy-livinityd.sh   |

## 21 New TEST Blocks (38 new assertions)

| TEST    | Assertions | Subject                                                       | Plan reference        |
| ------- | ---------- | ------------------------------------------------------------- | --------------------- |
| TEST 17 | 6          | G2 streaming pkgs (helper defined + ffmpeg/xdotool/ydotool/xvfb/fluxbox) | 105-02 G2     |
| TEST 18 | 3          | G2 ydotoold systemd unit (path + ExecStart + UID≥1000 detect) | 105-02 G2             |
| TEST 20 | 2          | G3 atomic update.sh self-rsync (.new staging + mv rename)     | 105-02 G3             |
| TEST 21 | 3          | G5 gallery cache (helper + path + git fetch origin)           | 105-02 G5             |
| TEST 22 | 3          | G6 chown helper (function + LIVOS_DIR target + LIV_DIR target) | 105-02 G6            |
| TEST 23 | 1          | G6 app-script chmod +x                                        | 105-02 G6             |
| TEST 24 | 2          | G7 cleanup helper + LIVOS_UPDATE_COMPLETED sentinel           | 105-02 G7             |
| TEST 25 | 1          | G8 UI rm -rf dist inside _dld_build_packages body             | 105-02 G8             |
| TEST 26 | 2          | D-105-NO-PROD-IMPACT — no bare `> update.sh` + no `sed -i update.sh` | CONTEXT D-105 |
| TEST 27 | 1          | Hazard #2 — _dld_health_check before _dld_update_caddy_to_livinityd | RESEARCH §4     |
| TEST 28 | 1          | Hazard #3 — _dld_sync_liv_dist_into_pnpm_store before _dld_write_systemd_unit | RESEARCH §4 |
| TEST 28b | 1         | D-105-STEP8-DAEMON-RELOAD — systemctl daemon-reload present   | CONTEXT D-105-STEP8   |
| TEST 28c | 1         | D-105-STEP8-START-ORDER — memory → worker → core for-loop     | CONTEXT D-105-STEP8   |
| TEST 28d | 2         | D-105-STEP8-HEALTH-CHECK — warn-semantic + no fail() in health body | CONTEXT D-105-STEP8 |
| TEST 29 | 2          | Hazard #1 — PGPASSWORD shell-scope (positive) + no inline env-file grep (negative) | RESEARCH §4 |
| TEST 30 | 2          | Sacred SHA — no `> sdk-agent-runner` redirect + no `sed -i sdk-agent-runner` | sacred constraint |
| TEST 32a | 1         | livos.service heredoc via `$_DLD_SYSTEMD_UNIT`                | replaces broken TEST 32 |
| TEST 32b | 1         | `_DLD_SYSTEMD_LIV_CORE_UNIT` constant defined                 | revision addition     |
| TEST 32c | 1         | `_DLD_SYSTEMD_LIV_WORKER_UNIT` constant defined               | revision addition     |
| TEST 32d | 1         | `_DLD_SYSTEMD_LIV_MEMORY_UNIT` constant defined               | revision addition     |
| TEST 32e | 1         | ydotoold.service literal-path heredoc                         | 105-02 G2 addition    |
| **TOTAL** | **38**   |                                                               |                       |

## 1 Deleted TEST

**TEST 33 (was: no liv-mcp-server systemd unit)** — Deleted per plan revision because it duplicates existing TEST 10 at line 277 (`grep -qE '_DLD_SYSTEMD_LIV_MCP|liv-mcp-server\.service|Description=Liv mcp-server'`). Coverage preserved — TEST 10 remains untouched in the file.

## Coverage Matrix

### Plan 105-02 gap closures (G2-G9)

| Gap | TEST                | Pattern                                                       |
| --- | ------------------- | ------------------------------------------------------------- |
| G2  | TEST 17 + TEST 18 + TEST 32e | streaming pkgs + ydotoold systemd unit + literal-path heredoc |
| G3  | TEST 20             | atomic .new + mv update.sh self-rsync                         |
| G5  | TEST 21             | gallery cache helper + git fetch                              |
| G6  | TEST 22 + TEST 23   | chown -R both trees + chmod +x app-script                     |
| G7  | TEST 24             | cleanup helper + LIVOS_UPDATE_COMPLETED sentinel              |
| G8  | TEST 25             | UI rm -rf dist defensive fresh-build                          |
| G9  | (covered by 105-02's own .deployed-sha write — not test-asserted in this plan; deferred per plan body) |

### RESEARCH §4 Hazards

| Hazard | TEST       | Mechanism                                                                  |
| ------ | ---------- | -------------------------------------------------------------------------- |
| #1 (PG password regression) | TEST 29 | positive `PGPASSWORD=$pg_pass` + negative `PGPASSWORD=$(grep ... env-file)` |
| #2 (Caddy 502 window) | TEST 27 | awk-extracted line-number compare: health_line < caddy_line |
| #3 (stale dist boot) | TEST 28 | awk-extracted line-number compare: sync_line < livos_unit_line |

### D-105-STEP8 sub-decisions

| Decision                          | TEST     | Pattern                                                                |
| --------------------------------- | -------- | ---------------------------------------------------------------------- |
| D-105-STEP8-DAEMON-RELOAD         | TEST 28b | positive `systemctl[[:space:]]+daemon-reload`                          |
| D-105-STEP8-START-ORDER           | TEST 28c | positive `for svc in liv-memory liv-worker liv-core` (or bare-pkg form) |
| D-105-STEP8-HEALTH-CHECK-WARN-NOT-FAIL | TEST 28d | positive `warn ... did not respond` + negative `^[[:space:]]*fail "` in health-check body |

### Sacred-file enforcement

| Invariant                 | TEST     | Negative grep pattern                                                          |
| ------------------------- | -------- | ------------------------------------------------------------------------------ |
| Sacred SHA (`sdk-agent-runner.ts`) | TEST 30 | `^[^#]*>[[:space:]]*.*sdk-agent-runner` + `sed -i.*sdk-agent-runner`           |
| update.sh write-protection (D-105-NO-PROD-IMPACT) | TEST 26 | `^[^#]*>[[:space:]]*update\.sh[[:space:]]*$` + `sed -i.*update\.sh` |

### 4 systemd units + 1 conditional unit

| Unit                  | TEST    | Form                                            |
| --------------------- | ------- | ----------------------------------------------- |
| livos.service         | TEST 32a | heredoc via `$_DLD_SYSTEMD_UNIT` variable reference |
| liv-core.service      | TEST 32b | `_DLD_SYSTEMD_LIV_CORE_UNIT` constant           |
| liv-worker.service    | TEST 32c | `_DLD_SYSTEMD_LIV_WORKER_UNIT` constant         |
| liv-memory.service    | TEST 32d | `_DLD_SYSTEMD_LIV_MEMORY_UNIT` constant         |
| ydotoold.service      | TEST 32e | literal-path heredoc (105-02 G2 addition)       |
| liv-mcp-server.service | TEST 10 (existing) | negative-grep — MUST NOT exist (on-demand spawn) |

## Verification Evidence

### Test pass counts

```
$ bash scripts/install/__tests__/test-deploy-livinityd.sh 2>&1 | tail -3
================================================================
  Plan 104-11/12/13 + 105-01/02/03 test results: 117 PASS, 0 FAIL
================================================================

$ bash scripts/install/__tests__/test-mode-hybrid-args.sh 2>&1 | tail -3
================================================================
  Plan 104-08 test results: 18 PASS, 0 FAIL
================================================================

$ bash scripts/install/__tests__/test-mode-tunnel-args.sh 2>&1 | tail -3
================================================================
  Plan 104-09 test results: 24 PASS, 0 FAIL
================================================================
```

**Combined: 18 + 24 + 117 = 159 PASS** (plan estimate was 157 — see Deviations §1 below)

### Syntax + new TEST presence

```
$ bash -n scripts/install/__tests__/test-deploy-livinityd.sh && echo OK
OK

$ for n in 17 18 20 21 22 23 24 25 26 27 28 28b 28c 28d 29 30 32a 32b 32c 32d 32e; do
>   grep -qE "^info \"TEST $n" scripts/install/__tests__/test-deploy-livinityd.sh \
>     && echo "FOUND: TEST $n" || echo "MISSING: TEST $n"
> done | wc -l
21

$ grep -cE "^info \"TEST 33" scripts/install/__tests__/test-deploy-livinityd.sh
0  # TEST 33 correctly absent (deleted per revision)

$ grep -cE "Plan 104-11/12/13 \+ 105-01/02/03 test results" scripts/install/__tests__/test-deploy-livinityd.sh
1  # summary header updated
```

### Sacred SHA preservation (MANDATORY invariant)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Plan touched zero files under `liv/packages/core/src/` — trivially preserved.

### update.sh untouched (D-105-NO-PROD-IMPACT invariant)

```
$ git diff HEAD~ -- update.sh | wc -l
0
```

### deploy-livinityd.sh untouched by this plan

```
$ git diff HEAD~ -- scripts/install/deploy-livinityd.sh | wc -l
0
```

This plan only modifies the test file. 105-02 already shipped the deploy-livinityd.sh changes in a prior commit (`f6406f44`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in plan-spec grep regex] TEST 17 multi-line apt-get install pattern**

- **Found during:** Task 1 verification (first run of new test suite)
- **Issue:** The plan-provided regex for TEST 17 (`grep -qE "apt-get install.*${pkg}" "$DEPLOY_SH"`) only matches when the package name appears on the SAME line as `apt-get install`. `deploy-livinityd.sh` uses multi-line continuation form (`apt-get install -y -qq \` then continuation lines with packages). For `xdotool` (mid-line on continuation 338) and `fluxbox` (mid-line on continuation 347), the original regex returned no match — even though both packages are demonstrably present.
- **Fix:** Replaced the per-pkg one-line regex with a function-body extraction (`awk '/^_dld_install_streaming_packages\(\)/,/^}/'`) followed by a word-boundary grep for each package name (`grep -qE "(^|[[:space:]])${pkg}([[:space:]]|\\\\|\$)"`). This correctly handles all positions within the multi-line apt-get install block.
- **Files modified:** scripts/install/__tests__/test-deploy-livinityd.sh (TEST 17 loop only)
- **Commit:** `535e4f3c`
- **Rationale:** The plan-provided regex was a transcription error, not a design intent — TEST 17's documented purpose is "assert all 5 streaming packages are listed in apt-get install." The fixed regex preserves that semantic intent precisely. Alternative: leave TEST 17 with 2/5 packages FAILing and document — rejected because it would leave a known-broken assertion in CI and violate the plan's "after both 105-02 and 105-03 merge, 115 PASS expected" success criterion (would have been 113 PASS instead).

**2. [Plan-spec arithmetic inconsistency, not a bug] 36 vs 38 new-assertion sum / 115 vs 117 PASS target**

- **Found during:** Task 1 final test run (117 PASS observed, 115 expected per plan target)
- **Issue:** The plan's `<interfaces>` "Expected PASS count" table sums to 38 new assertions row-by-row (TEST 17=6 + TEST 18=3 + ... + TEST 32e=1), but the table's stated **TOTAL** row reads "36 new assertions" — a 2-assertion arithmetic error in the table's own bottom line. The plan's `<success_criteria>` then derives "115 PASS" from the buggy 36 figure (79 + 36 = 115), but the row-by-row truth is 79 + 38 = 117.
- **Fix:** None at the code level — the actual count of 38 new assertions matches the per-TEST specifications in the plan body. Intent (all 21 TEST blocks added per spec with 0 FAIL) is preserved. SUMMARY documents the discrepancy.
- **Files modified:** None (this is a plan-arithmetic observation, not a code fix)
- **Commit:** N/A
- **Rationale:** The plan's per-TEST counts are authoritative (each TEST block's `<assertions>` count is fixed by the test code itself). The plan table's bottom-line "36" is a transcription / arithmetic error. Following the per-TEST authoritative counts yields 38 new and 117 total — a 2-PASS overshoot of the success-criteria number but a 0-FAIL outcome that satisfies the substantive intent. Documenting this in SUMMARY is the minimal forward-looking action.

### Authentication Gates

None — no auth credentials or external services involved in this test-file extension.

## Self-Check: PASSED

```
$ [ -f scripts/install/__tests__/test-deploy-livinityd.sh ] && echo FOUND || echo MISSING
FOUND

$ git log --oneline -2
535e4f3c test(105-03): extend test-deploy-livinityd.sh with TESTs 17-32e covering ...
19f01fbc docs(105-02): SUMMARY — close G2-G9 update.sh parity gaps in deploy-livinityd

$ git log --oneline | grep -q "535e4f3c" && echo FOUND-TASK1 || echo MISSING
FOUND-TASK1

$ git diff HEAD~ -- update.sh | wc -l
0

$ git diff HEAD~ -- scripts/install/deploy-livinityd.sh | wc -l
0

$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f

$ bash -n scripts/install/__tests__/test-deploy-livinityd.sh && echo SYNTAX_OK
SYNTAX_OK

$ bash scripts/install/__tests__/test-deploy-livinityd.sh 2>&1 | tail -1
================================================================
$ bash scripts/install/__tests__/test-deploy-livinityd.sh 2>&1 | grep -E "test results:"
  Plan 104-11/12/13 + 105-01/02/03 test results: 117 PASS, 0 FAIL
```

All verification claims confirmed. The Task 1 commit (`535e4f3c`) lands on the worktree branch. Sacred SHA, update.sh, and deploy-livinityd.sh invariants all verified. 117 PASS in test-deploy-livinityd.sh (+38 new vs 79 baseline). 18 + 24 regression smoke green. Combined 159 PASS across 3 test files.

## Carry-Forward to Plan 105-04 (Wave 3 — Live VPS UAT)

The static-grep test harness is now an exhaustive regression guard for the deploy-livinityd source. Plan 105-04 takes over with the operator-walked GO/NO-GO criteria from CONTEXT.md §"Live UAT Gate":

1. `systemctl is-active livos liv-core liv-worker liv-memory` → 4× "active"
2. `curl -sk https://<domain>` returns LivOS login HTML (NOT Caddy placeholder, NOT 502)
3. Browser green padlock + LivOS UI renders (operator screenshot)
4. Sacred SHA preserved — `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
5. Re-running `bash /opt/livos/update.sh` on the same box succeeds idempotently (proves deploy-livinityd produced an update.sh-compatible layout)

Specific 105-02 + 105-03 UAT additions:
- Verify `/etc/systemd/system/ydotoold.service` exists OR info-log "skipped" message present in install output
- Verify `/opt/livos/.deployed-sha` matches `(cd /tmp/livos-install-stage && git rev-parse HEAD)`
- Verify `/opt/livos/packages/livinityd/source/modules/apps/legacy-compat/app-script` has executable bit set
- Verify streaming binaries on PATH: `ffmpeg gst-launch-1.0 dbus-send xdotool maim Xvfb fluxbox` (or warn-line surfaced in install output)
- Verify gallery cache git pull on second install run (if cache pre-exists from prior install)
- After install completes, confirm: 117 PASS in test-deploy-livinityd.sh runs green from the deployed `/opt/livos/scripts/install/__tests__/` copy (the test harness ships with the install for self-verification)
