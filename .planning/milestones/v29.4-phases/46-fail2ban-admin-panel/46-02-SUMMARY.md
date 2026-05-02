---
phase: 46-fail2ban-admin-panel
plan: "02"
subsystem: backend-fail2ban-admin
tags: [fail2ban, backend, parser, dependency-injection, audit, active-sessions]
dependency_graph:
  requires:
    - 46-01-DIAGNOSTIC.md (binary path + version pin + verbatim parser fixtures)
    - livos/packages/livinityd/source/modules/devices/audit-pg.ts (REUSE computeParamsDigest)
    - livos/packages/livinityd/source/modules/database/index.ts (REUSE getPool)
  provides:
    - parser.ts (pure text parsers — no I/O, no node: imports)
    - client.ts (execFile DI factory + Fail2banClientError kind discriminator)
    - active-sessions.ts (mock-friendly `who -u` provider)
    - events.ts (fire-and-forget audit writer reusing device_audit_log)
  affects:
    - 46-03-PLAN.md (routes.ts will import all four modules via barrel index.ts)
    - 46-04-PLAN.md (UI hooks consume the routes which consume these modules)
tech_stack:
  added: []
  patterns:
    - dependency-injection factory pattern (ExecFileFn) — enforces W-20 no-vi.mock rule
    - structured error class with kind discriminator (analog UpstreamHttpError)
    - REUSE existing PG audit table via sentinel (NO new migration)
    - belt-and-suspenders JSON forensics row (offline path when PG down)
    - bare tsx + node:assert/strict test harness (no Vitest)
key_files:
  created:
    - livos/packages/livinityd/source/modules/fail2ban-admin/parser.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/parser.test.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/client.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.test.ts
    - livos/packages/livinityd/source/modules/fail2ban-admin/events.ts
  modified: []
decisions:
  - "BINARY_PATH = '/usr/bin/fail2ban-client' hardcoded (NOT runtime which-lookup) — pinned to fail2ban 1.0.2-3ubuntu0.1 captured live in 46-01-DIAGNOSTIC.md"
  - "EXECFILE_TIMEOUT_MS = 10_000 (per pitfall M-07 — 5s too tight on slow Mini PC I/O peaks; 10s matches Phase 45 broker)"
  - "DI factory pattern (makeFail2banClient(ExecFileFn)) used instead of vi.mock — fakes injected via constructor for testability without monkey-patching child_process (pitfall W-20)"
  - "Action-targeted unbanip command (set <jail> unbanip <ip>) — NEVER global flush (pitfall B-01); test 3 asserts argv shape exactly"
  - "Defense-in-depth jail name regex /^[a-zA-Z0-9_.-]+$/ + IPv4 regex re-validated BEFORE every execFile spawn (T-46-04 / T-46-09 / X-03 layer 2 even though routes.ts Zod-validates upstream)"
  - "REUSE device_audit_log via sentinel device_id='fail2ban-host' + tool_name in {unban_ip, ban_ip, whitelist_ip} — NO new table migration (FR-F2B-04 invariant)"
  - "computeParamsDigest imported from devices/audit-pg.ts (NOT redefined) — preserves SHA-256 hashing contract from Phase 15 AUDIT-01/02"
  - "events.ts is fire-and-forget — PG INSERT failure → JSON belt-and-suspenders write; both wrapped in independent try/catch; NEVER re-throws (T-46-08)"
  - "active-sessions.ts ENOENT for `who` binary → graceful degrade to [] + warn (sub-issue #7 + B-19 cellular CGNAT mitigation; HTTP X-Forwarded-For path remains as fallback in routes.ts)"
  - "parser.ts is import-pure — ZERO node: imports verified by grep (proves no fs/no child_process; safe for golden-file fixture testing)"
  - "parseJailStatus tolerates BOTH `Journal matches:` (LIVE Mini PC, journald-integrated sshd on Ubuntu 24.04) AND `File list:` (classic file-watcher) variants per 46-01-DIAGNOSTIC.md Plan 02 contract item #7"
  - "parseAuthLogForLastUser uses substring pre-filter before regex (auth.log can be megabytes); scans in REVERSE for the LAST matching line; treats captured username as untrusted text (T-46-05 — never used as exec arg)"
  - "parseWhoOutput shape gate isIpShaped() rejects '(login screen)' (alpha) and '(:0)' (single colon, no dotted-quad / no IPv6 hex group) — only legitimate IPs leak to sourceIp"
  - "IPv4-mapped IPv6 prefix `::ffff:` stripped in parseWhoOutput (some sshd configs emit this form)"
metrics:
  duration: ~3 minutes (files pre-existed from prior attempt; this run executed verification + tests + commit + state updates)
  completed: "2026-05-01T20:30:00Z"
  test_count: 31  # 14 parser + 13 client + 4 active-sessions
  source_loc: ~620  # parser 246 + client 262 + active-sessions 89 + events 113 (rough)
  test_loc: ~430   # parser 222 + client 235 + active-sessions 99 (rough)
---

# Phase 46 Plan 02: Backend Pure Modules (Wave 2) Summary

**One-liner:** 4 production source files (parser/client/active-sessions/events) + 3 test files implementing fail2ban admin backend foundation via DI factory pattern; 31/31 unit tests pass; sacred file untouched.

## What Was Built

### parser.ts (246 LOC, 0 node: imports)

Four pure functions — no I/O, no side effects, no dependencies beyond TS/JS stdlib:

- `parseJailList(stdout: string): string[]` — extracts comma-separated jail names from `fail2ban-client status` Jail list line. Returns `[]` for empty list, throws `Error('parse: jail list line not found')` when missing.
- `parseJailStatus(stdout: string): {currentlyFailed, totalFailed, currentlyBanned, totalBanned, bannedIps}` — line-by-line scan for the 5 required fields. Tolerates BOTH `Journal matches:` (Mini PC LIVE / journald sshd on Ubuntu 24.04) AND `File list:` (classic file-watcher) as the filter source line.
- `parseAuthLogForLastUser(authLogContent, ip): string | null` — scans reverse for last sshd `Failed password for [invalid user] X from <ip>` line; substring pre-filter before regex (auth.log can be megabytes).
- `parseWhoOutput(stdout): Array<{user, sourceIp, since}>` — splits `who -u` output; trailing parens token only extracted as IP if shape-checked (rejects `(login screen)`, `(:0)`); strips `::ffff:` IPv4-mapped-IPv6 prefix.

### client.ts (262 LOC)

`makeFail2banClient(ExecFileFn): Fail2banClient` factory plus `realFail2banClient` production wiring:

- **BINARY_PATH** = `/usr/bin/fail2ban-client` hardcoded (verified live in 46-01-DIAGNOSTIC.md against fail2ban 1.0.2-3ubuntu0.1).
- **EXECFILE_TIMEOUT_MS** = 10_000 (pitfall M-07).
- **Fail2banClientError** with `kind` discriminator: `binary-missing | service-down | jail-not-found | ip-invalid | timeout | parse-failed | transient`. Routes.ts (Plan 03) discriminates on `.kind` to map to TRPC codes.
- **Defense-in-depth validators** (`assertJailName`, `assertIp`) re-check inputs BEFORE every execFile spawn (T-46-04 / T-46-09 / X-03 layer 2).
- **7 client methods**: `listJails`, `getJailStatus`, `unbanIp`, `banIp`, `addIgnoreIp`, `ping`, `readAuthLogForLastUser`.
- **Action-targeted unban** (B-01): `unbanIp` calls `set <jail> unbanip <ip>` (NEVER global `unban`).
- **`addIgnoreIp`** (FR-F2B-02 whitelist): `set <jail> addignoreip <ip>`.
- **`ping`** returns `{healthy: false, reason: 'binary-missing' | 'service-down'}` on failure — does NOT throw (graceful for UI service-state banner per W-04).

### active-sessions.ts (89 LOC)

`makeActiveSessionsProvider(ExecFileFn): ActiveSessionsProvider` factory:

- Calls `who` (binary lookup via PATH — not pinned because `who` is a coreutils standard at `/usr/bin/who` but tolerable to be PATH-resolved).
- ENOENT for `who` → returns `[]` + warns via injected logger (sub-issue #7 + B-19 cellular CGNAT mitigation; routes.ts merges this with HTTP X-Forwarded-For for self-ban detection).
- Other errors (timeout, perm) also degrade to `[]` — best-effort enrichment.
- Delegates parsing to `parseWhoOutput` from `parser.ts`.

### events.ts (113 LOC)

`recordFail2banEvent(event, logger?): Promise<void>` fire-and-forget audit writer:

- **REUSES** `device_audit_log` table — sentinel `device_id='fail2ban-host'`, `tool_name in ('unban_ip','ban_ip','whitelist_ip')`, `user_id` from event, `params_digest=sha256(JSON.stringify({jail, ip}))`. NO new table migration (FR-F2B-04 invariant).
- **REUSES** `computeParamsDigest` imported from `../devices/audit-pg.js` (NOT redefined).
- **REUSES** `getPool` from `../database/index.js`.
- **Belt-and-suspenders JSON row** to `/opt/livos/data/security-events/<ts>-<uuid8>-<action>.json` (offline forensics path when PG down; mirrors Phase 33 OBS-01 schema).
- **Fire-and-forget contract** (T-46-08): both PG INSERT and JSON write wrapped in independent try/catch; logs warnings; NEVER re-throws to caller.

### Tests (3 files, 31 assertions, all green)

| File                       | Tests | Status   |
| -------------------------- | ----- | -------- |
| `parser.test.ts`           | 14/14 | PASS     |
| `client.test.ts`           | 13/13 | PASS     |
| `active-sessions.test.ts`  | 4/4   | PASS     |
| **Total**                  | 31/31 | **PASS** |

All tests run via bare `tsx` + `node:assert/strict`. NO Vitest. NO `vi.mock`. Test doubles injected via the DI factory contract.

**Verbatim Mini PC fixtures used in parser.test.ts** (per pitfall B-05 — not synthesized strings):

- Test 2 (`parseJailList` single jail) — LIVE A1 from `46-01-DIAGNOSTIC.md`
- Test 5 (`parseJailStatus` happy path) — LIVE B1 (`Journal matches:` variant)
- Test 12 (`parseWhoOutput` mixed local) — LIVE C1 (`(login screen)` and `(:0)` rejected as IPs)

SYNTHETIC fixtures (tagged in DIAGNOSTIC.md):

- Test 1 (multi-jail), Test 3 (empty list)
- Test 6 (multi-banned IPs, `File list:` variant)
- Test 14 (remote SSH with IPv4-mapped IPv6)

## Verification Gates (all passed)

| Gate                                                                                                  | Status |
| ----------------------------------------------------------------------------------------------------- | ------ |
| `parser.test.ts` exits 0 with `All parser.test.ts tests passed (14/14)`                               | PASS   |
| `client.test.ts` exits 0 with `All client.test.ts tests passed (13/13)`                               | PASS   |
| `active-sessions.test.ts` exits 0 with `All active-sessions.test.ts tests passed (4/4)`               | PASS   |
| `grep -rE "vi\.mock\|from 'vitest'"` in fail2ban-admin/ → 0 matches (W-20)                            | PASS   |
| `grep "device_audit_log"` in events.ts → 6 matches (REUSE — FR-F2B-04)                                | PASS   |
| `grep "fail2ban-host"` in events.ts → 4 matches (sentinel)                                            | PASS   |
| `grep -E "unbanip\|addignoreip"` in client.ts → 4 matches (B-01 + FR-F2B-02)                          | PASS   |
| `grep "^import.*from 'node:'" in parser.ts` → 0 matches (proves pure)                                 | PASS   |
| `grep "^export (function\|class\|interface\|type)" in parser.ts` → 4 (exact count)                    | PASS   |
| Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` `git diff --shortstat HEAD~1 HEAD` → empty  | PASS   |
| Post-commit deletion check → no deleted files                                                         | PASS   |

## Threat Model Compliance

All threat-register entries from the plan are mitigated:

- **T-46-04 (Tampering — execFile arg construction):** `assertJailName` + `assertIp` re-validate BEFORE every spawn; args always passed as array (never shell string); no `shell: true`.
- **T-46-05 (Elevation — attacker-controlled username from auth.log):** `parseAuthLogForLastUser` returns captured username as text; never used as exec arg by client.ts. UI surfaces it as plain text only (Plan 04 contract).
- **T-46-06 (Information Disclosure — JSON files in /opt/livos/data/security-events/):** accept; same data already in fail2ban logs; livinityd-uid (root) only readable.
- **T-46-07 (DoS — runaway subprocess):** EXECFILE_TIMEOUT_MS = 10_000; SIGKILL on timeout; `kind='timeout'` surfaced to caller.
- **T-46-08 (Tampering — events.ts blocks caller):** fire-and-forget contract enforced; PG and JSON each wrapped in try/catch; never re-throws.
- **T-46-09 (Information Disclosure — command injection via jail name):** `JAIL_NAME_RE` regex rejects anything not `/^[a-zA-Z0-9_.-]+$/` BEFORE execFile; Test 11 verifies `'sshd; rm -rf /'` is rejected pre-spawn (calls.length === 0).

## Deviations from Plan

**None — plan executed exactly as written.**

The 7 source files matched the `<interfaces>` and `<action>` blocks of `46-02-PLAN.md` step-for-step. All acceptance criteria pass. All verification gates pass. No auto-fixes (Rules 1-3) needed. No architectural decisions (Rule 4) encountered.

(Files pre-existed from a prior in-progress attempt of this same plan; this execution verified them against the plan, ran all tests, validated all grep gates, and committed atomically.)

## Self-Check: PASSED

- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/parser.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/parser.test.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/client.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.test.ts` exists
- [x] File `livos/packages/livinityd/source/modules/fail2ban-admin/events.ts` exists
- [x] Commit `5a2c031f` exists in `git log`
- [x] All 31 tests pass via bare tsx + node:assert/strict
- [x] Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` UNTOUCHED (empty diff vs HEAD~1)
- [x] No new DB tables introduced (events.ts INSERTs into existing device_audit_log)

## Threat Flags

None. No new network endpoints, no new auth paths beyond what the routes.ts (Plan 03) will introduce, no new schema (REUSE device_audit_log). Only addition is FS write to `/opt/livos/data/security-events/` which is pre-disposed in the plan's threat register as `T-46-06: accept`.
