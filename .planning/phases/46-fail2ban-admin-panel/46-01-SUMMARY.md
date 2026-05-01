---
phase: 46-fail2ban-admin-panel
plan: "01"
subsystem: diagnostics
tags: [fail2ban, diagnostic, fixtures, mini-pc]
dependency_graph:
  requires: []
  provides:
    - 46-01-DIAGNOSTIC.md (parser fixture corpus + binary path + version pin)
  affects:
    - 46-02-PLAN.md (paste verbatim fixtures into parser.test.ts + active-sessions.test.ts)
tech_stack:
  added: []
  patterns:
    - live SSH read-only diagnostic
    - synthetic fixture corpus with explicit SYNTHETIC tags
key_files:
  created:
    - .planning/phases/46-fail2ban-admin-panel/46-01-DIAGNOSTIC.md
  modified: []
decisions:
  - "Journal matches: variant confirmed live — Plan 02 parser must tolerate both File list: and Journal matches: as filter source lines"
  - "Binary path /usr/bin/fail2ban-client confirmed live on Mini PC — Plan 02 client.ts hardcodes this"
  - "Package version fail2ban 1.0.2-3ubuntu0.1 pinned for client.ts version-pin comment"
  - "sudo NOPASSWD confirmed for bruce@10.69.31.68 — no fallback to synthetic-only path needed"
  - "who -u live output contains no source IPs (all local/console sessions) — synthetic fixtures added for remote-SSH IP-bearing rows"
metrics:
  duration: ~5 minutes
  completed: "2026-05-01T20:20:00Z"
---

# Phase 46 Plan 01: Mini PC fail2ban Diagnostic Summary

**One-liner:** Live Mini PC fail2ban 1.0.2-3ubuntu0.1 diagnostic captured — sshd jail active, journal-based filter, binary at /usr/bin/fail2ban-client, sudo passwordless, parser fixture corpus complete.

## What Was Captured

### Mini PC Binary Path
- **Verified path:** `/usr/bin/fail2ban-client` (exit 0, no ambiguity)
- **Who binary:** `/usr/bin/who` (also confirmed)

### fail2ban Version
- **apt package:** `fail2ban 1.0.2-3ubuntu0.1` (Ubuntu 24.04 noble)
- **Service state:** `active (running)` since 2026-04-29 10:54:46 PDT
- **PID:** 1610 (`/usr/bin/python3 /usr/bin/fail2ban-server -xf start`)

### Jails Discovered
- **Count:** 1
- **List:** `sshd`
- **Filter type:** `Journal matches: _SYSTEMD_UNIT=sshd.service + _COMM=sshd` (NOT file-based — Mini PC uses journald-integrated sshd)
- **Currently banned:** 0 (no active bans at capture time)

### Fixture Corpus in DIAGNOSTIC.md
- Fixture sections: 8 total (A1-A3, B1-B3, C1-C3)
- Live sections: A1 (single jail), B1 (zero-banned journal-based), C1 (mixed local sessions)
- Synthetic sections: A2 (multi-jail), A3 (zero jails), B2 (single banned IP, file-based), B3 (multi-banned IP), C2 (remote SSH with IPs), C3 (empty output)
- All synthetic fixtures tagged with `<!-- SYNTHETIC FIXTURE -->` comments

### who -u Live Output
- 3 rows: `bruce seat0` (physical login), `bruce :0` (X11 display), `root pts/1` (SSH, no source IP)
- No parens-with-IP rows in live capture (all current sessions are local or IP-less)
- Synthetic fixtures added for full parser coverage of the parens-IP format

### auth.log Readability
- `/var/log/auth.log` exists, 1.2MB, group `adm` read-only
- livinityd runs as root (D-LIVINITYD-IS-ROOT) → root-readable = YES
- Last-attempted-user parser (PATTERNS.md sub-issue #3) is feasible

### Write Commands Issued to Mini PC
**NONE.** All commands were read-only: `which`, `dpkg -l`, `systemctl is-active`, `systemctl status`, `sudo -n fail2ban-client status`, `sudo -n fail2ban-client status sshd`, `which who`, `who -u`, `ls -la /var/log/auth.log*`.

## Deviations from Plan

### Auto-discovered: Journal matches: vs File list: variant

**Found during:** Task 1, step (f) — `fail2ban-client status sshd`
**Issue:** The plan and PATTERNS.md showed the expected parser format as having `File list: /var/log/auth.log`. The live Mini PC actually returns `Journal matches: _SYSTEMD_UNIT=sshd.service + _COMM=sshd` instead. This is because Ubuntu 24.04's sshd is integrated with systemd-journald and fail2ban reads from the journal rather than a log file.
**Fix (Rule 2 — auto-add missing critical functionality):** Added explicit parser contract requirement #7 in `46-01-DIAGNOSTIC.md`: "parseJailStatus MUST handle BOTH `Journal matches:` AND `File list:` as the filter source line." Synthetic Fixture B2 uses `File list:` to ensure both variants are tested.
**Files modified:** `46-01-DIAGNOSTIC.md` (Plan 02 contract section + Fixture B1 notes)
**Commit:** fd56d1e9

### Auto-discovered: who -u has no source IPs in live capture

**Found during:** Task 1, step (g) — `who -u`
**Issue:** All current Mini PC sessions are local (physical seat + X11 display + a root shell with no IP shown). The live `who -u` output has no `(ip-address)` parens for any row. Without synthetic fixtures, `parseWhoOutput` test coverage of the primary use-case (extracting admin's SSH source IP for self-ban guard) would be zero.
**Fix (Rule 2):** Added Fixtures C2 and C3 as clearly-tagged synthetic fixtures covering remote SSH with IPv4, IPv4, and IPv6-mapped-IPv4 addresses. Added detailed field layout documentation from `man who`.
**Files modified:** `46-01-DIAGNOSTIC.md` (Corpus C section)
**Commit:** fd56d1e9

## Self-Check: PASSED

- [x] File `.planning/phases/46-fail2ban-admin-panel/46-01-DIAGNOSTIC.md` exists
- [x] Pattern `which fail2ban-client` found in file
- [x] Pattern `Jail list:` found in file
- [x] Pattern `Currently banned:` found in file
- [x] Pattern `D-NO-SERVER4` found in file
- [x] Pattern `Plan 02 contract` found in file
- [x] Pattern `dpkg -l` found in file
- [x] Pattern `who -u` found in file
- [x] Commit fd56d1e9 exists
- [x] Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` untouched (pre-commit gate: empty diff)

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The diagnostic file contains real Mini PC session data (user `bruce`, `root`, host `bruce-EQ`) but no IPs from current sessions. The threat register entry T-46-01 (information disclosure) was pre-accepted in the plan's threat model.
