---
phase: 32
slug: pre-update-sanity-auto-rollback
status: findings_present
files_reviewed: 12
files_reviewed_list:
  - livos/packages/livinityd/source/modules/system/update.unit.test.ts
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.service
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/auto-rollback.conf
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-disk.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-write.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-net.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-no-prev-sha.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-loop-guard.sh
  - .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/run-all.sh
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
created: 2026-04-27
---

# Phase 32: Code Review Report

**Reviewed:** 2026-04-27
**Depth:** standard
**Files Reviewed:** 12
**Status:** findings_present

## Summary

Phase 32 delivers precheck guards (disk/write/net) spliced into `update.sh` and a systemd-triggered auto-rollback orchestrator (`livos-rollback.sh`). The overall architecture is sound and the synthetic trigger on the Mini PC completed successfully, which means the happy path works. This review focuses on latent issues the synthetic trigger did not exercise.

Two critical findings:

1. **CRLF in working-tree bash files** — `git config core.autocrlf=true` causes all nine `.sh` artifacts to be checked out with `\r\n` line endings on Windows. The recommended SSH delivery command (`ssh host 'sudo bash -s' < file`) pipes the CRLF working-tree file directly to the remote bash process. Linux bash reads `\r` as part of token values, breaking heredoc terminator matching (`EOROLLBACK\r` != `EOROLLBACK`). The installed scripts would be corrupt on first deployment from any clean Windows clone.

2. **No `trap` to remove `.rollback-attempted` lock on unexpected kill** — `livos-rollback.sh` uses `.rollback-attempted` as a re-entry guard, but it only removes this lock on the happy-path `exit 0`. If the systemd timeout (600s) fires, or a signal kills the process mid-run, the lock file persists and all future auto-rollback attempts silently abort. Operator recovery requires a manual `rm` — but the script never mentions this in journals unless re-triggered manually.

Four warnings cover: `COPY_COUNT=0` going undetected after a pnpm store reorganization, `git fetch --unshallow` as an unquoted SHA passthrough, the `$probe` variable set in subshell context under `set -euo pipefail`, and the test sandbox not rewiring `/opt/nexus` paths, causing real-host path references to appear during abort-path tests.

Three info items: `@ts-nocheck` on the test file suppresses TS checking on the entire file, the `precheck-disk.sh` stub's `df` output column naming is cosmetically wrong (not functionally incorrect), and the `run-all.sh` test aggregator silently skips tests it cannot find rather than failing.

---

## Critical Issues

### CR-01: CRLF line endings in working-tree bash artifacts break SSH pipe delivery

**File:** all `.sh` files under `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/`
**Lines:** 1 (shebang), all lines

**Problem:**
`git config core.autocrlf=true` is set in this repo. All nine bash artifacts are stored LF-clean in git (confirmed via `git show`), but are checked out with `\r\n` on Windows. The documented deployment command pipes the working-tree file directly:

```bash
ssh <host> 'sudo bash -s' < phase32-systemd-rollback-patch.sh
```

When bash on Linux reads a CRLF stream via stdin, each line has a trailing `\r`. This causes heredoc terminator matching to fail:

```
cat <<'EOROLLBACK' > "$ROLLBACK_SH_PATH"
...
EOROLLBACK        # bash sees "EOROLLBACK\r" — does NOT match "EOROLLBACK"
```

The heredoc never terminates; bash reads until EOF and treats the rest of the script body as heredoc content. The resulting installed files are either truncated or contain literal shell code as text. This would have surfaced on first deployment from a clean Windows clone, but the existing successful run likely used a file that had already been stripped of CRLF (e.g., piped from `git show` or a prior `dos2unix` pass).

Verified via `cat -A`:
```
#!/usr/bin/env bash^M$
```

**Fix:**
Add a `.gitattributes` entry forcing LF for all bash artifacts:

```
.planning/phases/**/artifacts/**/*.sh text eol=lf
.planning/phases/**/artifacts/**/*.conf text eol=lf
*.sh text eol=lf
```

Alternatively, document the deployment command as:

```bash
git show HEAD:.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh \
  | ssh <host> 'sudo bash -s'
```

This reads from the git object store (always LF) regardless of working-tree settings. The `.gitattributes` fix is strongly preferred — it makes the repo safe for all future Windows contributors.

---

### CR-02: No `trap` to release `.rollback-attempted` lock on kill/timeout

**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh`
**Lines:** 57, 237

**Problem:**
`.rollback-attempted` is touched at line 57 and only removed at line 237 (`rm -f "$ROLLBACK_LOCK"`), which runs exclusively on the `exit 0` success path. The script runs under systemd with `TimeoutStartSec=600`. If the build phase exceeds 600 seconds, or if an out-of-disk error causes `set -euo pipefail` to abort mid-build, or if the operator sends SIGTERM, the lock file is never removed. All subsequent auto-rollback triggers from systemd will hit the loop-guard check and silently abort with `[ROLLBACK-ABORT] ... exists — operator must investigate`. The systemd journal will show only the abort message with no indication of why the previous attempt failed or how long ago it happened.

This is a meaningful latent risk: a transient build timeout during a crash-loop event would permanently disable auto-rollback on that host until manual operator intervention — precisely the scenario where automated recovery is most valuable.

```bash
# Current: lock only released on success
touch "$ROLLBACK_LOCK"       # line 57
...
rm -f "$ROLLBACK_LOCK"       # line 237 — only reached on exit 0
```

**Fix:**
Add an EXIT trap immediately after `touch "$ROLLBACK_LOCK"` that removes the lock on any non-success exit, and only suppress it on explicit `exit 0`:

```bash
touch "$ROLLBACK_LOCK"
_ROLLBACK_SUCCESS=false
trap '
  if [[ "$_ROLLBACK_SUCCESS" != "true" ]]; then
    echo "[ROLLBACK] removing lock due to unexpected exit (trap)"
    rm -f "$ROLLBACK_LOCK"
  fi
' EXIT

# ... at the end, before exit 0:
_ROLLBACK_SUCCESS=true
rm -f "$ROLLBACK_LOCK"
rm -rf "$TEMP_DIR"
echo "[ROLLBACK-OK] reverted to $PREV_SHA in ${DURATION_MS}ms"
exit 0
```

Alternatively, keep the lock on any failure (current design intent) but ensure the journal message includes a timestamp so operators can judge whether the lock is stale, and add `ExecStartPost` in the service unit to log the lock state. The trap approach is cleaner.

---

## Warnings

### WR-01: `COPY_COUNT=0` after pnpm store reorganization silently continues

**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh`
**Lines:** 191-205

**Problem:**
The nexus-core dist-copy loop at lines 192-204 copies compiled JS into every `@nexus+core*` directory under the pnpm store. If the glob matches nothing (because pnpm reorganized the store or the directory was recreated fresh), `COPY_COUNT` stays 0, and the script logs `nexus core dist copied to 0 pnpm-store dir(s)` and proceeds to restart services. livinityd will then import the stale or absent dist from wherever the `@nexus/core` symlink resolves to, likely causing the same crash-loop that triggered rollback in the first place.

```bash
echo "[ROLLBACK] nexus core dist copied to $COPY_COUNT pnpm-store dir(s)"
# No abort if COPY_COUNT == 0
```

The same pattern exists in the HEREDOC copy inside `phase32-systemd-rollback-patch.sh` (line ~465).

**Fix:**
```bash
echo "[ROLLBACK] nexus core dist copied to $COPY_COUNT pnpm-store dir(s)"
if (( COPY_COUNT == 0 )); then
    echo "[ROLLBACK-ABORT] no pnpm-store @nexus+core* dirs found — livinityd import will fail"
    exit 1
fi
```

---

### WR-02: `git fetch --unshallow` fallback fetches all history but doesn't re-try the specific SHA fetch before checkout

**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh`
**Lines:** 102-106

**Problem:**
The fallback when `fetch --depth=1 origin "$PREV_SHA"` fails is `fetch --unshallow`. But `--depth=1 origin "$PREV_SHA"` can legitimately fail on GitHub for any SHA that is not a branch tip (GitHub's `uploadpack.allowReachableSHA1InWant` is disabled for public repos by default). After `--unshallow`, all history is fetched, but `git -C "$TEMP_DIR" checkout "$PREV_SHA"` at line 106 may still fail if the shallow clone started with a default branch tip and the previous SHA is not reachable from it. The `set -euo pipefail` would then abort with a non-descriptive `git checkout` error, leaving `ROLLBACK_LOCK` in place (see CR-02).

Additionally, `fetch --unshallow` is run without `2>/dev/null`, so if the clone is already unshallow (not possible here, but defensive coding) it would print "error: --unshallow on a complete repository does not make sense" to the log — harmless but noisy.

```bash
if ! git -C "$TEMP_DIR" fetch --depth=1 origin "$PREV_SHA" 2>/dev/null; then
    echo "[ROLLBACK] depth-1 fetch failed; falling back to --unshallow"
    git -C "$TEMP_DIR" fetch --unshallow
fi
git -C "$TEMP_DIR" checkout "$PREV_SHA"
```

**Fix:**
The most reliable approach for fetching an arbitrary SHA from GitHub is:
```bash
git -C "$TEMP_DIR" fetch origin
git -C "$TEMP_DIR" checkout "$PREV_SHA" || {
    echo "[ROLLBACK-ABORT] cannot checkout $PREV_SHA after full fetch — SHA not in repo history"
    exit 1
}
```
This fetches all branch tips (not all history), which is fast and covers the common case. If `$PREV_SHA` is reachable from any branch tip, checkout will succeed.

---

### WR-03: Test sandbox `sed` rewrite of livos-rollback.sh misses `/opt/nexus` references

**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-no-prev-sha.sh`  
**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-loop-guard.sh`
**Lines:** 29 (both files)

**Problem:**
Both rollback tests rewrite the script with `sed "s|/opt/livos|$SANDBOX|g"` but do not replace `/opt/nexus`. The abort-path tests (no-prev-sha and loop-guard) happen to pass because both abort before reaching the nexus paths. However, if any future test is added for a later abort point (e.g., the inline precheck failing), the script will reach nexus references pointing at the real `/opt/nexus` on the test host. This produces false failures in CI (directory does not exist) or — worse — touches real host directories on an unintended host.

```bash
sed "s|/opt/livos|$SANDBOX|g" "$ROLLBACK_SH" > "$PATCHED"
# /opt/nexus references remain unrewritten
```

**Fix:**
```bash
sed -e "s|/opt/livos|$SANDBOX|g" \
    -e "s|/opt/nexus|$SANDBOX/nexus|g" \
    "$ROLLBACK_SH" > "$PATCHED"
mkdir -p "$SANDBOX/nexus"
```

---

### WR-04: `precheck()` in `precheck-block.sh` calls `exit 1` — safe only when sourced in a subshell; will kill the parent if sourced directly

**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh`
**Lines:** 89-91

**Problem:**
`precheck-block.sh` is documented as "sourced/cat-ed by the patch script" and is sourced in unit tests via `bash -c "source '$BLOCK_FILE'; precheck"` (which runs in an explicit subshell). However, the block is also spliced verbatim into `update.sh` by the patch script. When `precheck()` is defined inline in `update.sh` and invoked directly (not in a subshell), the `exit 1` inside the function will terminate `update.sh`'s process entirely. This is the intended behavior — the function comment says "exits 1" — but it is important to note that if update.sh ever wraps the call in a subshell for any reason (e.g., `rc=$(precheck 2>&1)` idiom), the error would be swallowed.

More concretely: the Patch 2/6 call-site inserts a bare `precheck` invocation, not `precheck || exit 1`. If `precheck` is ever changed to `return 1` instead of `exit 1` (which would be the usual convention for sourced function libraries), the update.sh call-site would not terminate update.sh and the update would proceed despite failed prechecks.

**Fix:**
The call-site insertion should be:
```bash
# Phase 32 REL-01 call site
precheck || exit 1
```
This is defensive: if the function ever migrates to `return 1` semantics, the call-site correctly propagates the failure. Document in the function comment that it uses `exit` (not `return`) by design and must only be called from a non-subshell context.

---

## Info

### IN-01: `@ts-nocheck` suppresses all TypeScript checks on update.unit.test.ts

**File:** `livos/packages/livinityd/source/modules/system/update.unit.test.ts`
**Lines:** 1-3

**Problem:**
The file opens with `// @ts-nocheck` due to a pending `update.ts` rewrite. This suppresses type errors across the entire test file, including the new Test G assertion. If `getUpdateStatus()` ever returns a different shape (e.g., `error` field renamed), the test will still compile but the `expect(String(status.error)).toContain(...)` assertion will silently check `undefined`. The `TODO` comment explains the intent, but the suppression is file-wide rather than targeted.

**Fix:**
Use per-line `@ts-expect-error` comments only where needed, or add explicit `as any` casts on the specific mock calls that break under strict TS. This preserves type checking on the assertions themselves.

---

### IN-02: `precheck-disk.sh` df stub prints cosmetically wrong column header

**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-disk.sh`
**Lines:** 22-28

**Problem:**
The df stub prints `Available` in the header but `1G` in the data column. The `awk` parser in `precheck-block.sh` uses positional field `$4` (zero-indexed `NR==2`), so the header mismatch has no functional effect. However the stub documentation says it mimics `df -BG -P` output; the `-P` (POSIX) format field order is `Filesystem 1G-blocks Used Available Use% Mounted-on` — the stub has `Used Available Capacity Mounted on` which transposes `Capacity` for `Use%`. Tests pass because `$4` correctly picks up column 4 in both cases, but a future maintainer debugging a test failure might be confused by the discrepancy.

**Fix:**
Update the stub comment/output to match `df -BG -P` POSIX format exactly:
```bash
echo "Filesystem     1G-blocks  Used Available Use% Mounted on"
echo "/dev/fake          50G    49G        1G   99% /"
```

---

### IN-03: `run-all.sh` silently skips missing test files — should fail

**File:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/run-all.sh`
**Lines:** 28-32

**Problem:**
If a test file in `TESTS=()` is not found, `run-all.sh` prints `SKIP ... (not found)` and increments `SKIP_COUNT`, then exits 0 as long as no other tests fail. This was intentional while Plan 32-02 was still being authored. Now that all 5 tests exist, a missing file (e.g., due to a rename or deletion) would silently produce a green run. A CI gate relying on this aggregator would not catch it.

**Fix:**
Change skip to fail when all tests are expected to be present:
```bash
if [[ ! -f "$test_path" ]]; then
    echo "FAIL $test_name (not found — expected to exist)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_TESTS+=("$test_name")
    continue
fi
```
Or add a post-loop assertion: `if (( SKIP_COUNT > 0 )); then exit 1; fi`.

---

_Reviewed: 2026-04-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
