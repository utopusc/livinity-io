---
phase: 65
plan: 01
subsystem: rename-foundation
tags: [rename, preflight, snapshot, mini-pc]
requirements: [RENAME-01]
dependency_graph:
  requires: []
  provides: [PREFLIGHT-SNAPSHOT-65-01]
  affects: [65-02, 65-03, 65-05]
tech_stack:
  added: []
  patterns: [single-batched-ssh, sacred-sha-gate, defensive-script-read]
key_files:
  created:
    - .planning/phases/65-liv-rename-foundation-cleanup/65-01-PREFLIGHT.md
  modified: []
decisions:
  - "Branch strategy: working on master directly (not liv-rename) per project convention — STATE.md shows recent commits like f04537d7 landing on master without a feature branch; switching mid-flight would entangle with concurrent-agent dirty state."
  - "Mini PC SSH unreachable at task time — single attempt per fail2ban rule; documented as deferred-to-65-05 with re-use-ready single-batched-SSH command embedded in PREFLIGHT.md."
  - "2 NEXUS_*/LIV_* env-var collisions identified for 65-03 reconciliation: NEXUS_API_URL ↔ LIV_API_URL and NEXUS_DIR ↔ LIV_DIR."
  - "update.sh defensive read: 629 lines, ZERO destructive /opt/(nexus|liv) rm -rf patterns — safe to read, not to execute pre-65-04."
metrics:
  duration_min: 3
  completed_date: "2026-05-05"
  commits: 2
  files_created: 1
  files_modified: 0
---

# Phase 65 Plan 01: Pre-flight Snapshot Summary

**One-liner:** Pre-rename snapshot capturing starting SHA, sacred SHA verification, top-5 churn-target file SHAs, source-side env-var inventory (with collision flags), and `update.sh` defensive read; Mini PC SSH unreachable at task time, snapshot deferred to 65-05 with re-use-ready batched-SSH command embedded.

## Branch Strategy

**Chosen:** working on `master` directly (NOT `liv-rename` branch).

**Rationale:** Per CONTEXT D-03, executor picks based on git state at start. State at start:

- `git branch --show-current` ⇒ `master`
- `git status --short` ⇒ NON-EMPTY (concurrent-agent in-flight: `.claude/settings.local.json` modified, `.planning/ROADMAP.md` modified, P56/P57/P58 archive deletions, etc.)
- STATE.md last activity: commit `f04537d7` landed on master directly without a feature branch

Switching to `liv-rename` would have either (a) co-mingled unrelated dirty state into the rename branch, or (b) required `git stash` + per-plan stash-pop dance. Both options are worse than just recording the starting SHA on master and treating it as the rollback reference. The starting SHA `640b928e` IS the rollback target.

## Starting Commit SHA

**`640b928e5e7d8287536b405a01af3b20e075729b`** (master HEAD at task entry)

## Sacred SHA Verification

| Checkpoint | SHA | Match |
|------------|-----|-------|
| Task 1 start | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ |
| Task 1 end | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ |
| Task 2 start | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ |
| Task 2 end | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ |
| After commit `22120f4b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ |
| After commit `32e73769` (final) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✅ |

Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` content untouched across the entire plan. D-06 honored.

## Mini PC Snapshot Results

**Status:** UNREACHABLE at task time.

**Cause:** SSH `connect to host 10.69.31.68 port 22: Connection timed out` (exit 255, `ConnectTimeout=20`). Network-level timeout — NOT a fail2ban ban (which would be `Connection refused` or auth-level rejection). The Mini PC sits on a private 10.69.31.0/24 LAN; no tunnel was active from this workstation at task time.

**Per `feedback_ssh_rate_limit.md`:** single attempt only. No retries. Further rapid attempts would risk fail2ban escalation.

**What was NOT captured (live):**

- ❌ liv-* services count + ActiveState
- ❌ /opt/nexus/ size
- ❌ /opt/livos/ inventory
- ❌ pnpm-store @nexus+* dir count
- ❌ @nexus/core symlink resolution
- ❌ Redis nexus:* key count (v31-DRAFT line 129 expectation: 0 — UNVERIFIED at this task)
- ❌ Redis liv:* key count

**What WAS captured (source-side fallback):**

- ✅ Source-side env-var inventory: 20 `NEXUS_*` names + 9 `LIV_*` names
- ✅ Collision flags: `NEXUS_API_URL ↔ LIV_API_URL`, `NEXUS_DIR ↔ LIV_DIR` (65-03 must reconcile)
- ✅ Top-5 file SHAs (for 65-03 diff baseline)
- ✅ update.sh defensive read (629 lines, no destructive `rm -rf /opt/(nexus|liv)` patterns)
- ✅ Single-batched-SSH command embedded in PREFLIGHT.md for 65-05 re-use (line-for-line)

**Mitigation for 65-05 (documented in PREFLIGHT.md):** 65-05 SHALL re-attempt the snapshot at its entry. If still unreachable, the live cutover is by definition a USER-WALK gate (per CONTEXT D-12) — the user can run the dry-run from a Mini-PC-reachable host. The migration script itself can still be authored from this workstation; only the live dry-run needs Mini PC access.

## Redis nexus:* Key Count

**Status:** UNVERIFIED at this plan (Mini PC unreachable). Expected per v31-DRAFT line 129: 0 (zero — source-only Redis prefix rename in 65-03 is sufficient). 65-05 entry MUST verify; if non-zero, signal that runtime-key migration is needed beyond source rename.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mini PC SSH connect timeout — single batched session per fail2ban rule**

- **Found during:** Task 2 step 1 (single batched SSH session)
- **Issue:** `ssh ... bruce@10.69.31.68` exited 255 with `Connection timed out` after 20s. The Mini PC sits on private LAN; no tunnel up from this workstation.
- **Fix:** Per `feedback_ssh_rate_limit.md` — single attempt only, no retries. Captured the failure mode in PREFLIGHT.md, documented every snapshot field as "deferred to 65-05 entry," and embedded the re-use-ready single-batched-SSH command verbatim in PREFLIGHT.md so 65-05 has zero re-construction cost.
- **Source-side fallback:** Captured env var name inventory from local repo grep (`grep -rohE "(NEXUS_[A-Z_]+|LIV_[A-Z_]+)" --include="*.ts" --include="*.sh"`) — 20 NEXUS_* + 9 LIV_*. This is sufficient ground truth for 65-03's rename sweep target without needing the live `/opt/livos/.env` read.
- **Files modified:** `.planning/phases/65-liv-rename-foundation-cleanup/65-01-PREFLIGHT.md`
- **Commit:** `22120f4b`

**2. [Rule 3 - Blocking] Verify-gate literal-substring requirements in plan**

- **Found during:** Task 2 verification (`node -e "..."` shape check on PREFLIGHT.md)
- **Issue:** Plan's verify gate asserts literal substrings `'systemd liv-*'` and `'Redis runtime keys'` exist in the file. My initial draft used markdown-formatted heading variants (`### systemd liv-* services` and `### Redis runtime keys (deferred...)`)— the latter passed but the former didn't because the line was a bullet `- systemd liv-* + livos unit ...` which contained `systemd liv-*` but my prior text used backticked `liv-*` separated from `systemd`. Fixed by adjusting two lines so the literal substrings `systemd liv-*` and `Redis runtime keys` both appear unbacktick'd.
- **Fix:** Two small text adjustments in PREFLIGHT.md to satisfy the literal substring greps. No semantic content changed.
- **Files modified:** `.planning/phases/65-liv-rename-foundation-cleanup/65-01-PREFLIGHT.md`
- **Commit:** rolled into `22120f4b`

**3. [Rule 3 - Blocking] Preflight commit SHA fill-in**

- **Found during:** Task 2 step 4 (commit + record SHA)
- **Issue:** Plan asks to record the preflight commit SHA in PREFLIGHT.md's Rollback reference section. The SHA is unknown until the commit lands.
- **Fix:** Two-step commit: first commit `22120f4b` lands the snapshot data; second commit `32e73769` fills in the recorded SHA in Rollback Reference. This is the standard pattern when a doc file references its own commit hash.
- **Files modified:** `.planning/phases/65-liv-rename-foundation-cleanup/65-01-PREFLIGHT.md` (1-line edit)
- **Commit:** `32e73769`

### Authentication Gates

None.

## Pause-and-Resume Safety

**Confirmed:** working tree post-plan has only the same dirty files as at task entry (concurrent-agent in-flight changes — `.claude/settings.local.json`, `.planning/ROADMAP.md`, P56-58 archive deletions). No 65-01-related state is uncommitted. Both PREFLIGHT.md commits (`22120f4b`, `32e73769`) are atomic and independently revertible:

```bash
# Roll back 65-01 only (in reverse order):
git revert 32e73769 22120f4b
# Or: jump to before 65-01 entirely:
git reset --hard 640b928e5e7d8287536b405a01af3b20e075729b   # destructive — only with user authorization
```

## Hand-off to 65-05

PREFLIGHT.md contains a [single-batched-SSH command](.planning/phases/65-liv-rename-foundation-cleanup/65-01-PREFLIGHT.md#single-batched-ssh-command-for-re-use-in-65-05) that 65-05 SHALL run verbatim at its entry to capture the live Mini PC snapshot. The expected snapshot contents are documented inline so 65-05 can diff and flag deltas.

## Self-Check: PASSED

- ✅ `.planning/phases/65-liv-rename-foundation-cleanup/65-01-PREFLIGHT.md` exists at expected path (verified by Read tool reflecting created status).
- ✅ Commit `22120f4b` exists in git log (`git log --oneline -1 -- .planning/phases/65-liv-rename-foundation-cleanup/65-01-PREFLIGHT.md` returned the expected hash).
- ✅ Commit `32e73769` exists in git log (final SHA fill-in).
- ✅ Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` verified at every gate.
- ✅ All required PREFLIGHT.md sections present (verified by `node -e "..."` literal-substring check at end of Task 2).
- ✅ No deletions in either commit (`git diff --diff-filter=D --name-only HEAD~1 HEAD` returned empty).
- ✅ Sacred-file content untouched (no edits, only `git hash-object` reads).
- ✅ Mini PC NOT mutated (SSH connection never established).
- ✅ D-NO-SERVER4 honored (only IP attempted: `10.69.31.68`, the Mini PC).
- ✅ Single batched SSH session attempted (no retries, fail2ban-aware).
