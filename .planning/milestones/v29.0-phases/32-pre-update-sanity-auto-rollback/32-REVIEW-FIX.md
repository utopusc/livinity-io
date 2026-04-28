---
phase: 32
fixed_at: 2026-04-27T00:00:00Z
review_path: .planning/phases/32-pre-update-sanity-auto-rollback/32-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 32: Code Review Fix Report

**Fixed at:** 2026-04-27
**Source review:** .planning/phases/32-pre-update-sanity-auto-rollback/32-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04)
- Fixed: 6
- Skipped: 0

All 5 bash unit tests pass after fixes: `run-all.sh` reports 5 PASS / 0 FAIL.

## Fixed Issues

### CR-01: CRLF line endings in working-tree bash artifacts break SSH pipe delivery

**Files modified:** `.gitattributes`
**Commit:** `04d57bfd`
**Applied fix:** Created `.gitattributes` at repo root with `*.sh text eol=lf` and `*.conf text eol=lf` rules (plus explicit paths for the artifacts directory). Also ran `git add --renormalize .` to fix any CRLF-in-index entries. Verified via `git show HEAD:...` that the git object store serves LF content. On Windows the working-tree files remain CRLF (OS-level), but any future checkout on Linux or pipe via `git show HEAD:... | ssh ... 'bash -s'` delivers LF-only content.

---

### CR-02: No `trap` to release `.rollback-attempted` lock on kill/timeout

**Files modified:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh`, `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh`
**Commit:** `3c088954`
**Applied fix:** Added `cleanup_lock_on_error()` EXIT trap immediately after `touch "$ROLLBACK_LOCK"` in both the standalone `livos-rollback.sh` and the HEREDOC copy embedded in the patch script. Per the O-05 lock-persistence policy the trap deliberately does NOT remove the lock on error — it emits a clear `[ROLLBACK-ERROR]` journal message with the exit code and a `sudo rm` recovery instruction. Previously a systemd timeout kill or mid-build `set -e` abort was completely silent, leaving the lock with no journal trace.

Note: fix deviates from REVIEW.md suggestion (which recommended removing the lock on error). The O-05 research decision says the lock MUST persist after failure to prevent infinite retry loops. The trap logs the failure, not clears it.

---

### WR-01: `COPY_COUNT=0` after pnpm store reorganization silently continues

**Files modified:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh`, `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh`
**Commit:** `25a969a9`
**Applied fix:** Added an explicit `(( COPY_COUNT == 0 ))` abort guard immediately after the dist-copy loop in both files. If the pnpm-store glob matches no `@nexus+core*` directories the script now emits `[ROLLBACK-ABORT] no @nexus+core* dirs found...` and exits 1, rather than proceeding to restart services with stale/absent dist which would re-enter the crash loop.

---

### WR-02: `git fetch --unshallow` fallback doesn't re-try SHA before checkout — checkout failure is silent

**Files modified:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh`, `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh`
**Commit:** `dbe1ab62`
**Applied fix:** Wrapped `git checkout "$PREV_SHA"` in an explicit `if ! ... ; then` block that emits `[ROLLBACK-ABORT] could not checkout $PREV_SHA after fetch` and exits 1. Also improved the fallback: now tries `git fetch origin` (all branch tips, fast) first before `git fetch --unshallow` (full history, slow), with both redirected to `/dev/null` and guarded with `|| true` so an already-full clone doesn't error. This covers the case where the SHA was force-pushed away from all branch tips.

Note: This finding is marked "fixed: requires human verification" — the logic change (fetch strategy) may need validation against GitHub's specific uploadpack behavior for shallow clones.

---

### WR-03: Test sandbox `sed` rewrite misses `/opt/nexus` references

**Files modified:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-no-prev-sha.sh`, `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-loop-guard.sh`
**Commit:** `45542b17`
**Applied fix:** Changed the single `sed "s|/opt/livos|$SANDBOX|g"` to a two-expression `sed -e ... -e ...` that also rewrites `/opt/nexus` to `$SANDBOX/nexus`. Added `mkdir -p "$SANDBOX/nexus"` to create the stub dir. Both abort-path tests still pass (they exit before reaching nexus paths), and future tests that reach deeper rollback steps will correctly use sandboxed paths instead of real host directories.

---

### WR-04: `precheck()` callsite in patch script uses bare `precheck` — fragile if semantics change

**Files modified:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh`, `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh`
**Commit:** `dd1ba5d0`
**Applied fix:** Changed the awk `print "precheck"` to `print "precheck || exit 1"` in Patch 2/6 of the patch script. Added a documentation comment to the `precheck()` function in both `precheck-block.sh` and the HEREDOC copy in the patch script explaining the dual-safety convention: the function uses `exit 1` internally by design, and the `|| exit 1` call-site guard ensures update.sh aborts even if the function is ever refactored to use `return 1` semantics.

---

_Fixed: 2026-04-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
