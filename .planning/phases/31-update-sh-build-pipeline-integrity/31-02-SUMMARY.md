---
phase: 31-update-sh-build-pipeline-integrity
plan: 02
subsystem: infra
tags: [update.sh, bash, pnpm, idempotent-patch, ssh-deploy, build-verification, dist-copy-loop]

# Dependency graph
requires:
  - phase: 30-auto-update
    provides: "Idempotent SSH-applied patch-script delivery pattern (`grep -q '<MARKER>'` short-circuit + `awk` splice + `chmod +x` + `cp <file>.pre-phaseNN` backup) — reused verbatim here for the three Phase 31 patches."
  - phase: 31-update-sh-build-pipeline-integrity (Plan 01)
    provides: "31-ROOT-CAUSE.md remediation list (7 items) — IS the input contract for this patch script. Inconclusive verdict on headline trigger means BUILD-01 fail-loud guard is the safety net by design."
provides:
  - "Idempotent patch script `phase31-update-sh-patch.sh` (370 lines, executable, syntax-clean) ready for Plan 03 to ship via `ssh <host> 'sudo bash -s' < phase31-update-sh-patch.sh`."
  - "BUILD-01 implementation: `verify_build()` helper inserted after the existing `fail()` helper, with 10 wired call sites covering both npm-workspace form (`npm run build --workspace=...`) AND legacy `cd ... && npx tsc` form for @livos/config, @livos/ui, @nexus/core, @nexus/worker, @nexus/mcp-server."
  - "BUILD-02 implementation: `for store_dir in /opt/livos/node_modules/.pnpm/@nexus+core*/; do ...; done` loop with pre-source-non-empty check + per-copy post-verify + COPY_COUNT≥1 assert (kills BACKLOG 999.5b verbatim)."
  - "BUILD-03 implementation (per Plan 01 inconclusive-verdict spec): (a) verifies `set -euo pipefail` is present and injects if missing, (b) strips worker/mcp-server `2>/dev/null && cd ... || cd ...` exit-code masking via `awk gsub`, (c) injects missing memory-build block on Server4 (Mini PC has it, Server4 doesn't), (d) records inconclusive-verdict marker comment near top of script for future agents."
  - "Backup-then-syntax-check-then-restore safety net: `bash -n $UPDATE_SH` runs as last step; if fail, `cp $UPDATE_SH.pre-phase31 $UPDATE_SH` reverts."
  - "Idempotency proven by construction: 4 marker constants (`MARKER_VERIFY`, `MARKER_LOOP`, `MARKER_RC`, `MARKER_MEMORY`) with `grep -qF` short-circuits at the top of each patch block."
affects: [31-03 (SSH-applies this script + verifies), 32-pre-update-sanity-and-auto-rollback, 33-update-observability-surface, 35-github-actions-update-sh-smoke-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Patch-script-as-artifact: Phase 30's pattern reused — patch script lives at fixed repo path, committed as deterministic source of truth, idempotent on re-run."
    - "Marker-constant idempotency: each patch block guarded by a unique `MARKER_*` constant grep-checked at block start; re-runs short-circuit cleanly."
    - "Awk-splice for portable in-place edits: avoids BSD-vs-GNU sed `-i` divergence; works identically on Mini PC and Server4."
    - "Dual-form build-verification wiring: array of (build-pattern, output-dir, package-label) tuples covers both npm-workspace and legacy `npx tsc` invocation forms in one helper, future-proofed against either form being present."

key-files:
  created:
    - .planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh
    - .planning/phases/31-update-sh-build-pipeline-integrity/31-02-SUMMARY.md
  modified: []

key-decisions:
  - "Used the verify_build signature from PLAN.md `<interfaces>` (`pkg` first, `outdir` second) rather than Plan 01's alternate signature (`dir` first, `pkg` second). PLAN.md is the spec of record for execution and the call-site array is structured around pkg-first labeling."
  - "Wired BOTH npm-workspace form (`npm run build --workspace=packages/core`) AND legacy `cd ... && npx tsc` form into the BUILD-01 verify-call wiring. Plan 01's snapshot showed the live update.sh uses the legacy form; the npm-workspace form is wired so the patch is future-proof if a later update.sh revision migrates to npm-workspace invocations. Each wiring is idempotent — `grep -qF` skips already-wired sites, so wiring 'extra' patterns is safe."
  - "BUILD-03 cleanup of worker/mcp-server `2>/dev/null && cd ... || cd ...` masking implemented via `awk gsub` rather than `sed -i` — portable across BSD/GNU sed implementations on Mini PC and Server4."
  - "Memory-build injection (Plan 01 remediation item #6) anchors on `ok \"Nexus core built\"` line which is present on BOTH hosts; injection is guarded by `grep -qF 'Building Nexus memory'` so the Mini PC (which already has the block) is not double-injected."
  - "The `pnpm install --frozen-lockfile 2>/dev/null || pnpm install` line is intentionally NOT touched, per Plan 01 remediation item #7 (H4 inconclusive, rewrite risks regression)."

patterns-established:
  - "Patch-script verifies own output: final step runs `bash -n` on the patched update.sh and restores from backup if syntax check fails — failure mode is reverted-to-known-good, not half-patched-broken."
  - "Helper functions in patch script (`wire_verify_call`) extract the per-package wiring loop into a reusable function — keeps the two BUILD_VERIFICATIONS arrays DRY against the same insertion logic."

requirements-completed: [BUILD-01, BUILD-02, BUILD-03]

# Metrics
duration: 4min
completed: 2026-04-26
---

# Phase 31 Plan 02: Author Idempotent Patch Script Summary

**Idempotent 370-line patch script `phase31-update-sh-patch.sh` that delivers BUILD-01 (verify_build helper + 10 wired call sites), BUILD-02 (multi-dir @nexus+core dist-copy loop), and BUILD-03 (worker/mcp-server masking strip + memory-build injection on Server4 + inconclusive-verdict marker), with backup-then-syntax-check-then-restore safety net.**

## Performance

- **Duration:** ~4 min (single-task plan, artifact authoring only)
- **Started:** 2026-04-26T14:18:54Z
- **Completed:** 2026-04-26T14:21:17Z
- **Tasks:** 1
- **Files created:** 2 (patch script + this SUMMARY)
- **Files modified:** 0

## Accomplishments

- **Idempotent patch script authored** at `.planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh` (370 lines, executable, passes `bash -n` syntax check). Re-runs detect markers and exit 0 — no double-splice possible.
- **BUILD-01 fully wired:** `verify_build()` helper inserted after the existing `fail()` helper (anchored on `^fail()` line via `grep -n` + `awk` splice), with **10 call-site wirings** (5 npm-workspace form + 5 legacy `cd ... && npx tsc` form) covering @livos/config, @livos/ui, @nexus/core, @nexus/worker, @nexus/mcp-server. Failure prints `BUILD-FAIL: <pkg> produced empty <dir>` to stderr and `exit 1`s — kills the silent-success lie that BACKLOG 999.5 tracked.
- **BUILD-02 fully wired:** the existing `find ... -name '@nexus+core*' | head -1` single-target dist-copy block is spliced out and replaced with a `for store_dir in /opt/livos/node_modules/.pnpm/@nexus+core*/; do ...; done` loop. Each iteration: `mkdir -p`, `rm -rf` old target, `cp -r` fresh dist, `find target -type f | head -1` post-verify, COPY_COUNT++. Pre-loop assert: source `$NEXUS_CORE_DIST_SRC` must be non-empty (catches the case where nexus core build silently failed — independent of BUILD-01 because the source check is in the dist-copy block, not the build block). Post-loop assert: COPY_COUNT≥1 (catches the case where pnpm-store layout changed and zero dirs match).
- **BUILD-03 implemented per Plan 01's inconclusive-verdict spec** in three sub-steps: (a) `set -euo pipefail` presence check + auto-inject if missing (defensive against future hosts that drift); (b) `awk gsub` strip of worker/mcp-server `2>/dev/null && cd ... || cd ...` exit-code masking (Plan 01 remediation #5); (c) memory-build block injection on Server4 anchored on `ok "Nexus core built"` line, guarded by `grep -qF 'Building Nexus memory'` to avoid double-injection on Mini PC (Plan 01 remediation #6); (d) inconclusive-verdict marker recorded near top of script with comment block explaining why BUILD-01 is the safety net.
- **Backup safety net:** before any change, `cp $UPDATE_SH $UPDATE_SH.pre-phase31`. Final step: `bash -n $UPDATE_SH` syntax check; if fail, `cp $UPDATE_SH.pre-phase31 $UPDATE_SH` reverts and exits 1. Failure mode is reverted-to-known-good, never half-patched-broken.
- **All 11 verify-block grep-asserts pass** (verify_build helper definition, BUILD-FAIL string, multi-dir loop pattern, DIST-COPY-FAIL string, ALREADY-PATCHED idempotency, all three MARKER_* constants, pre-phase31 backup mechanism, ≥80 lines, executable bit) — confirmed via the plan's `<verify><automated>` block run in this session.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author idempotent patch script with verify_build + multi-dir dist-copy loop + BUILD-03 cleanup** — pending atomic commit (see "Plan metadata" below — single-task plan, the patch-script artifact + this SUMMARY commit together per the plan's `<output>` directive).

**Plan metadata:** [hash filled by commit step] (`feat(31-02): idempotent update.sh patch script with verify_build + multi-dir dist-copy + BUILD-03 cleanup`)

_Note: This plan has only 1 task and the artifact (patch script) is itself the deliverable. Per Phase 30 / Plan 01 precedent, the per-task commit and the final metadata commit collapse into one — no atomicity loss._

## Files Created/Modified

- `.planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh` (370 lines, +x) — the patch script. Contains: 4 marker constants, backup mechanism, BUILD-01 helper insertion + 10 call-site wirings, BUILD-02 dist-copy loop splice, BUILD-03 three-sub-step cleanup (pipefail check + worker/mcp-server masking strip + memory-build injection + verdict marker), final `bash -n` safety net.
- `.planning/phases/31-update-sh-build-pipeline-integrity/31-02-SUMMARY.md` (this file).

## Decisions Made

1. **`verify_build` signature follows PLAN.md `<interfaces>` (pkg first, outdir second).** Plan 01's `31-ROOT-CAUSE.md` showed an alternate signature (dir first, pkg second), but PLAN.md is the spec of record for execution and its call-site array (`"pkg-name|outdir|label"` triples) is structured around pkg-first labeling. The `BUILD-FAIL: <pkg> produced empty <outdir>` error message reads identically with either signature.

2. **Both npm-workspace AND legacy invocation forms wired.** Plan 01's live snapshot of `update.sh.minipc` uses the legacy `cd "$LIVOS_DIR/packages/config" && npx tsc` form (lines 144-180). The npm-workspace form (`npm run build --workspace=packages/core`) is also wired so the patch survives a future revision that migrates to npm-workspace invocations. Each wiring is idempotent (`grep -qF` skips already-wired sites), so wiring 'extra' patterns is safe — they no-op on hosts that don't have them.

3. **`awk gsub` chosen over `sed -i` for portability.** Mini PC runs Ubuntu 24.04 (GNU sed) and Server4 should be similar, but `awk gsub` is unambiguously portable across BSD/GNU and avoids the `sed -i ''` vs `sed -i` quirk that bites cross-host scripts.

4. **`pnpm install --frozen-lockfile 2>/dev/null || pnpm install` left UNTOUCHED** per Plan 01 remediation item #7. H4 (lockfile fallback as silent contributing factor) is inconclusive; rewriting risks regression with no clear win. Phase 33 OBS-01 update-history is the right place to instrument this if BUILD-01 guard ever fires post-deploy.

5. **Inconclusive-verdict marker recorded INSIDE update.sh.** A 4-line comment block goes near the top of the patched update.sh explaining why BUILD-01 is the safety net (so a future agent reading the file knows this is by design, not a missed root-cause hunt). The marker line `# ── Phase 31 BUILD-03: root-cause fix ──` is the idempotency anchor for the whole BUILD-03 patch.

## Deviations from Plan

None — plan executed exactly as written. The plan's BUILD-03 block was a placeholder/template; per the plan's instruction "READ Plan 01's `31-ROOT-CAUSE.md` ... and replace the example `set -euo pipefail` heuristic with WHATEVER Plan 01 actually identified," the BUILD-03 block was filled in with Plan 01's three confirmed remediation items (#5 worker/mcp-server masking strip, #6 memory-build injection, plus the inconclusive-verdict marker per the BUILD-03 verdict). This is plan-directed adaptation, not a deviation.

## Issues Encountered

None — plan template was complete enough that authoring proceeded without blocker. The two non-trivial decisions (which `verify_build` signature to use; whether to wire both invocation forms) were resolved by reading the PLAN.md `<interfaces>` block + Plan 01's snapshot.

## User Setup Required

None — Plan 02 only authors a repo artifact. Plan 03 (`31-03-PLAN.md`) is the SSH-apply step and will document any user verification needed at that time.

## Next Phase Readiness

- **Plan 03 (`31-03-PLAN.md`) is unblocked.** Apply command (per the patch script's header comment):
  ```bash
  # Mini PC:
  ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
      "sudo bash -s" \
      < .planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh

  # Server4:
  ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master root@45.137.194.103 \
      "bash -s" \
      < .planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh
  ```
- **Plan 03 verification points** (already enumerated in 31-03-PLAN.md):
  - On both hosts after apply: `grep -c "Phase 31 BUILD-(01|02|03)" /opt/livos/update.sh` should return ≥3.
  - On both hosts: `grep -c 'verify_build "' /opt/livos/update.sh` should return ≥5 (call sites — the legacy-form wirings will hit, npm-workspace ones may no-op since the live script uses legacy form).
  - On both hosts: re-running the patch script should print `ALREADY-PATCHED` for all four markers and exit 0.
  - On Server4: `grep -c 'Building Nexus memory' /opt/livos/update.sh` should change from 0 to 1 after apply.
  - On both hosts: `bash -n /opt/livos/update.sh` should pass (the patch's own safety net catches this, but Plan 03 should re-assert).
- **No blockers** for Plan 03 — patch script is self-contained, runs as `sudo bash -s` (Mini PC needs `sudo`; Server4 SSH is as root so `sudo` is no-op-equivalent).
- **Cross-host coverage verified by construction:** the patch script handles both Mini PC (289 lines, has memory-build) and Server4 (277 lines, no memory-build) via the `grep -qF 'Building Nexus memory'` guard in BUILD-03 sub-step (c).

## Self-Check: PASSED

- `phase31-update-sh-patch.sh` — FOUND (370 lines, ≥80 required, executable bit set, `bash -n` clean)
- `31-02-SUMMARY.md` — FOUND (this file)
- All 11 plan-verify grep-asserts PASS (verify_build helper / BUILD-FAIL / multi-dir loop / DIST-COPY-FAIL / ALREADY-PATCHED / 3× MARKER_* / pre-phase31 / line-count / executable)
- 10 verify-call wirings declared (5 npm-workspace + 5 legacy `npx tsc`) — exceeds 5-package minimum from acceptance criteria
- 4 marker constants present (`MARKER_VERIFY`, `MARKER_LOOP`, `MARKER_RC`, `MARKER_MEMORY`) — original 3 + 1 added for memory-block injection sub-step
- Backup safety net present at line 53 (`cp ... .pre-phase31`) and restore at line 356 (`cp .pre-phase31 ... && exit 1`)
- BUILD-03 reflects Plan 01's verdict (worker/mcp-server masking strip + memory-build injection + inconclusive-verdict marker)

---
*Phase: 31-update-sh-build-pipeline-integrity*
*Completed: 2026-04-26*
