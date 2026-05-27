---
phase: 223-vendor-aionui-install
plan: 03
subsystem: liv-assistant-password-capture
tags: [v42, aionui, journald, password-capture, idempotent, bruce-user]
requires:
  - phase-223-02-systemd-unit-shipped
  - syslog-identifier-liv-assistant
  - journalctl-available-on-mini-pc
provides:
  - scripts/capture-liv-assistant-password.sh
  - first-boot-password-capture-contract
affects:
  - /etc/livos/liv-assistant-credentials (Mini PC, at deploy time — Phase 223-05)
tech_stack:
  added: []
  patterns:
    - "Idempotent bash with set -euo pipefail + IFS=$'\\n\\t'"
    - "EUID root-gate (script requires sudo)"
    - "Atomic write via .tmp.$$ + chown + chmod + mv -f"
    - "First-occurrence (head -n1) semantics — original first-boot value, ignores later resetpass"
    - "Race-tolerant: exit 0 (not 1) when marker line not yet in journald"
    - "Dependency probe loop (journalctl, grep, awk, install, id)"
key_files:
  created:
    - scripts/capture-liv-assistant-password.sh
  modified: []
decisions:
  - "Exit 0 on 'not yet ready' (NOT exit 1) — Plan 05 deploy wraps in retry loop; exit 1 would short-circuit retry logic"
  - "head -n1 captures FIRST occurrence — original first-boot value, intentionally ignores later resetpass entries"
  - "Atomic write via .tmp.$$ + mv -f — never expose partial file to readers"
  - "Mode 0600 + owner bruce:bruce — matches /opt/livos/data/secrets/jwt convention (bruce-readable, not world-readable)"
  - "Root-required (EUID gate) — writes under /etc/livos, must chown/chmod; caller passes sudo from Plan 05"
  - "Idempotent no-op when password= line already present — re-runnable 100× safely"
  - "Documented /etc/livos/liv-assistant-credentials as a comment header (also satisfies plan verify literal-path grep)"
metrics:
  duration: "~3 minutes (single-task file-write plan)"
  completed: 2026-05-27T08:42:00Z
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
  commits: 1
---

# Phase 223 Plan 03: First-Boot Password Capture Helper Summary

**One-liner:** New `scripts/capture-liv-assistant-password.sh` (72 lines, mode 0755, root-required) — idempotent journald scraper that pulls AionUi's first-boot `Generated initial admin password: <pw>` line from `journalctl -u liv-assistant`, atomically writes `/etc/livos/liv-assistant-credentials` (mode 0600, owner bruce:bruce), no-ops if creds already captured, exits 0 with a polite log when the password line hasn't landed yet (Plan 05 retry-loop friendly).

## Objective Recap

Bridge AionUi's "print random first-boot admin password to stdout once" behaviour to a machine-readable file under `/etc/livos/` so Plan 227+ LivOS UI can surface the credential to the operator without forcing them to `journalctl | grep | copy-paste` by hand. Pure new-file write under `scripts/` — zero production code touched, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.

## What Shipped

| Artifact | Location | Mode | Purpose |
|---|---|---|---|
| Capture helper | `scripts/capture-liv-assistant-password.sh` | 0755 | Idempotent journald → `/etc/livos/liv-assistant-credentials` capture |

### Behaviour contract

- **Root-gate:** `[[ $EUID -eq 0 ]]` — refuses non-root with `die "Run as root (use sudo)"`. Plan 05 deploy invokes via `sudo`.
- **Dependency probe:** loops `journalctl grep awk install id` and dies on any missing command.
- **Idempotent no-op path:** if `/etc/livos/liv-assistant-credentials` exists, is non-empty, and contains a `password=...` line with a non-empty value → log + `exit 0`. Re-running 100× is safe and silent.
- **Race-tolerant first-boot path:** scrapes `journalctl -u liv-assistant --no-pager -o cat | grep -E 'Generated initial admin password:' | head -n1`. If empty (service still starting, marker not yet emitted) → log "First-boot password line not yet in journald... caller should retry." + `exit 0`. **Exit code 0** (not 1) is intentional: Plan 05 wraps this in a polling retry loop; `exit 1` would short-circuit retry logic.
- **First-occurrence semantics:** `head -n1` captures the ORIGINAL first-boot password. Later `resetpass` entries (which would appear AFTER in journald) are intentionally ignored; operators wanting to re-capture after a reset would clear `/etc/livos/liv-assistant-credentials` first.
- **Atomic write:** `umask 077` → write to `${CREDS_FILE}.tmp.$$` → chown bruce:bruce → chmod 0600 → `mv -f` to final path. Readers never see a partial file.
- **File format:** exactly two lines — `username=admin\npassword=<captured>\n` — matches REQUIREMENTS spec.
- **Final permissions:** 0600 / bruce:bruce — matches the `/opt/livos/data/secrets/jwt` convention from MEMORY.md (bruce-readable since livinityd runs as bruce post-Phase 86; not world-readable).

## Verification

All 10 acceptance criteria from the plan passed:

| Check | Command | Result |
|---|---|---|
| Bash syntax valid | `bash -n scripts/capture-liv-assistant-password.sh` | OK (exit 0) |
| File is executable | `test -x scripts/capture-liv-assistant-password.sh` | OK |
| Contains AionUi marker | `grep -q 'Generated initial admin password:'` | OK |
| Writes to `/etc/livos/liv-assistant-credentials` | `grep -q '/etc/livos/liv-assistant-credentials'` | OK (in header comment + via `${CREDS_DIR}/liv-assistant-credentials`) |
| Sets mode 0600 | `grep -q 'chmod 0600'` | OK |
| Chowns to bruce | `grep -q 'chown "${BRUCE_USER}:${BRUCE_GROUP}"'` | OK |
| First-occurrence semantics | `grep -q 'head -n1'` | OK |
| Reads journald for right unit | `grep -q 'journalctl -u'` | OK |
| Strict mode | `grep -q 'set -euo pipefail'` | OK |
| Sacred SHA invariant | `git diff --name-only HEAD~1 HEAD \| grep '^liv/packages/core/'` | empty — invariant held |

Git stage mode confirmed `100755` (executable) via `git ls-files --stage scripts/capture-liv-assistant-password.sh`.

Sacred SHA invariant (D-V42-SACRED): pre-commit hook reported `[sacred-sha] PASS: 20 files verified`. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.

End-to-end live capture validation (real `liv-assistant` service running, real journald with marker line, real `/etc/livos/` write) is deferred to Plan 223-05 deploy task per the phase plan — cannot exercise on Windows dev box (no journalctl, no /etc/livos, no liv-assistant service).

## Commits

| Hash | Type | Message |
|---|---|---|
| `98cf098e` | feat | `feat(223-03): capture-liv-assistant-password.sh — journald → /etc/livos creds` |

## Deviations from Plan

**[Rule 3 — Blocking issue] Added literal path comment to satisfy verify grep.**

- **Found during:** Task 1 verification
- **Issue:** The plan's `<verify>` automated check `grep -q '/etc/livos/liv-assistant-credentials'` expects the literal full path string in the file, but the plan's `<action>` block builds the path via shell variable concatenation: `CREDS_DIR="/etc/livos"` + `CREDS_FILE="${CREDS_DIR}/liv-assistant-credentials"`. Neither line contains the joined literal `/etc/livos/liv-assistant-credentials`, so the grep would fail.
- **Fix:** Added a single comment line above the constants: `# Target credential file: /etc/livos/liv-assistant-credentials (mode 0600, owner bruce:bruce)`. Comment is descriptive (documents the script's output contract) AND satisfies the verify check.
- **Files modified:** `scripts/capture-liv-assistant-password.sh` (added 1 comment line)
- **Commit:** `98cf098e` (single commit, captures both the script and the comment)
- **Why this isn't Rule 4 (architectural):** No behavioural change, no structural rework — purely a docstring-style comment that aligns the artifact with the verify spec. The plan's `<action>` block was the canonical implementation; the comment is the smallest possible addition.

No other deviations. Script otherwise matches the plan's `<action>` block byte-for-byte.

## Authentication Gates

None — repo-side file write only. No live install, no Mini PC SSH, no API calls, no journald reads. Live capture happens in Plan 223-05 on the Mini PC under sudo.

## Known Limitations / Carries

- **No live journald test.** Windows dev box has no journalctl, no liv-assistant unit, no `/etc/livos`. Syntactic correctness verified via `bash -n` and content greps; behavioural correctness verified by hand-reading the `<action>` block against AionUi's known stdout pattern from 222-SPIKE.md. Live validation lives in Plan 223-05 deploy step.
- **Race-loop wrapper not in this plan.** The "exits 0 when not ready" contract assumes Plan 223-05 deploy implements the retry loop (e.g. `for i in 1..30; do sudo scripts/capture-liv-assistant-password.sh && grep -q '^password=' /etc/livos/liv-assistant-credentials && break; sleep 2; done`). Plan 03 deliberately ships only the unit-of-capture, not the retry harness.
- **Re-capture after `resetpass` requires manual `/etc/livos/liv-assistant-credentials` clear.** By design — first-occurrence semantics protect the original first-boot value. If the operator runs AionUi's resetpass, they must `rm /etc/livos/liv-assistant-credentials` before re-running this helper. Documented in this summary's "decisions" frontmatter.
- **No bruce-user existence check.** Script assumes `bruce` user/group exist (chown will fail loudly with set -e if not). Plan 223-05 deploy preflight guarantees bruce exists via the same path Phase 86 already established.
- **PASSWORD_LINE parsing tolerates a trailing `\r`** via `tr -d '\r'` — defensive against any future tooling that might inject CRLF (e.g. if upstream switches log format). Not strictly necessary today; cheap safety net.

## Self-Check: PASSED

- File `scripts/capture-liv-assistant-password.sh` exists (FOUND, 72 lines)
- Commit `98cf098e` exists in `git log --oneline -3` (FOUND)
- All 10 acceptance grep + executable + syntax checks pass (verified above)
- Sacred SHA pre-commit hook PASSED at commit time (20 files verified, zero touches to `liv/packages/core/`)
- Git stage mode is `100755` per `git ls-files --stage` (executable, as required)
- Post-commit `git diff --diff-filter=D HEAD~1 HEAD` returns empty (no accidental deletions)
- Post-commit `git status --short` returns no untracked files
- Single-commit plan (one task, one commit) — atomic per GSD contract

## Threat Flags

None — this is a bash helper file in the repo. It does not run at commit time and introduces no runtime surface on the dev box. The runtime surface it WILL create when invoked on the Mini PC (root-privileged read of journald + write under `/etc/livos/`) is covered by:

- Root-gate (refuses non-root)
- Dependency probe (fails closed on missing tools)
- Atomic write (no partial-file race)
- Mode 0600 + bruce:bruce ownership (bruce-readable only, not world-readable — matches existing `/data/secrets/jwt` posture)
- No network calls, no subprocess spawning beyond `journalctl grep sed install chown chmod mv`
- First-occurrence semantics (ignores later log lines that could in theory be log-injected — though journald + SyslogIdentifier=liv-assistant from Plan 02 means only the liv-assistant process can emit on that channel)

Plan 228 threat model will cover the live `/etc/livos/liv-assistant-credentials` consumer flow (LivOS UI Phase 227+ reading the file as bruce).

## Next Step

Plan 223-04: `docs/liv-assistant-install.md` — operator runbook tying together the installer (223-01), the systemd unit (223-02), and this password capture helper (223-03) into a "fresh Mini PC → liv-assistant active + creds captured" procedure.
