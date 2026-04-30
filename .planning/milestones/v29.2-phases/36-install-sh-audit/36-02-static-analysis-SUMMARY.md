---
phase: 36-install-sh-audit
plan: 02
subsystem: infra
tags: [audit, install-sh, static-analysis, idempotency, api-key, argv-leak, factory-reset, v29.2]

# Dependency graph
requires:
  - phase: 36-install-sh-audit
    plan: 01
    provides: install.sh.snapshot (1604 lines, SHA-256 c00be0bf...3137) + AUDIT-FINDINGS.md scaffold with 9 mandatory section headings
provides:
  - AUDIT-FINDINGS.md sections 3 (Argument Surface), 4 (Idempotency Verdict), 5 (API Key Transport) populated with line-cited static-analysis findings
  - decisive idempotency verdict (NOT-IDEMPOTENT) with 74 classified side-effecting commands
  - decisive API key transport classification (argv, FAIL FR-AUDIT-04) — triggers Plan 03 wrapper proposal
  - three of four Phase 37 readiness questions answered (per CONTEXT.md D-10): "Is install.sh safe to run twice?" (no, NOT-IDEMPOTENT), "How does Phase 37 pass the API key without leaking it via ps?" (it cannot today; needs wrapper), "What command does Phase 37 invoke?" (literal hint provided in API Key Transport section pending Plan 03's wrapper)
affects:
  - 36-03-recovery-server5-hardening (Plan 03 — must produce wrapper proposal per FR-AUDIT-04 FAIL verdict)
  - 37-factory-reset-backend (downstream — wipe step is mandatory pre-install.sh per NOT-IDEMPOTENT verdict; PG role drop + .env removal are non-optional to bypass install.sh's CREATE USER guard)

# Tech tracking
tech-stack:
  added: []  # audit-only plan; zero production deps added, zero source-code changes
  patterns:
    - "Side-effecting command classification table per CONTEXT.md D-06 (IDEMPOTENT_NATIVE / IDEMPOTENT_WITH_GUARD / NOT_IDEMPOTENT / UNKNOWN_NEEDS_VERIFICATION)"
    - "Leak-surface row-per-channel matrix for API key transport audit (argv / echo / set -x / sub-process pass-through / env-in-proc)"
    - "Static analysis with line:N citations back into the immutable Plan 01 snapshot — every finding traceable, zero fabrication risk"

key-files:
  created:
    - ".planning/phases/36-install-sh-audit/36-02-static-analysis-SUMMARY.md"
  modified:
    - ".planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md"

key-decisions:
  - "Idempotency verdict: NOT-IDEMPOTENT — driven by 4 unconditional NOT_IDEMPOTENT commands (generate_secrets line:861-864, JWT secret-file write line:1086, Redis FLUSHALL line:1125, PG password mismatch trap line:1136-1137 + line:912 drift)"
  - "API key transport: argv-only (line:14) — FR-AUDIT-04 FAIL; Plan 03 must produce livos-install-wrap.sh + ${LIV_PLATFORM_API_KEY} env-var fallback patch to install.sh"
  - "Argument surface anomaly: install.sh silently shifts unknown flags (line:16 `*) shift ;;`) — typos like `--api-key-file` are no-ops without warning; Phase 37 wrapper must validate flag spelling"
  - "Sub-process pass-through medium-severity leak at line:1565 (redis-cli -a + SET pass key as argv) — separate from primary argv exposure but same channel; Plan 03 should harden via heredoc-fed redis-cli or --pipe mode"

patterns-established:
  - "Per-command idempotency classification (74 rows) with three-line failure-mode narrative for hard re-run errors (PG mismatch, Redis FLUSHALL, JWT rotation) — template Phase 37 backend planner can reuse for verifying wipe step coverage"
  - "Leak-surface table format (5 channels × severity × line ref) — reusable for any future shell-script credential audit"

requirements-completed: [FR-AUDIT-01, FR-AUDIT-02, FR-AUDIT-04]

# Metrics
duration: ~25min
completed: 2026-04-29
---

# Phase 36 Plan 02: Static Analysis Summary

**install.sh is NOT-IDEMPOTENT and leaks the platform API key via argv (FR-AUDIT-04 FAIL) — three sections of AUDIT-FINDINGS.md (Argument Surface, Idempotency Verdict, API Key Transport) populated with 132 line:N citations into the frozen Plan 01 snapshot. Plan 03 owes a `livos-install-wrap.sh` proposal; Phase 37 wipe is mandatory before any install.sh re-run.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 (all auto-completed; no checkpoints, no human gates)
- **Files created:** 1 (this SUMMARY)
- **Files modified:** 1 (`.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` — three sections populated, no structural changes)
- **Source-code touches:** zero (audit-only per D-12)
- **Live executions of install.sh:** zero (D-11 upheld)

## Accomplishments

- **Argument Surface mapped end-to-end** — install.sh's only flag is `--api-key <value>` (line:14, two-arg form); unknown flags are silently shifted (line:16) without `getopts`, no `--help`, no `--version`, no `--api-key-file`, no `--resume`. Six `read -*` calls catalogued, none flow the platform API key from stdin. No env-var path consumes the platform key. Two argument-surface anomalies recorded (silent unknown-flag shift, `install_cloudflared` dead infrastructure at line:502-513/1488).
- **Idempotency verdict rendered as NOT-IDEMPOTENT** — 74 side-effecting commands classified per CONTEXT.md D-06: 41 IDEMPOTENT_NATIVE, 27 IDEMPOTENT_WITH_GUARD, 4 NOT_IDEMPOTENT, 2 UNKNOWN_NEEDS_VERIFICATION. The 4 NOT_IDEMPOTENT rows produce hard errors on re-run: `generate_secrets` (line:861-864) regenerates JWT/PG/Redis passwords each run; `write_env_file` (line:879-893) is bypassed because `setup_repository` (line:971) `rm -rf`s `/opt/livos` including `.env`; `configure_postgresql` (line:1136-1137) skips CREATE USER if role exists, leaving PG with old password while `.env` carries the new one — exact pitfall documented in project memory; `redis-cli FLUSHALL` (line:1125) wipes ALL Redis data on every re-run; JWT secret-file write (line:1086) invalidates existing sessions. Verdict is decisive and Phase 37-actionable.
- **API Key Transport identified as argv-only (FR-AUDIT-04 FAIL)** — `--api-key $2` at line:14 puts the key on install.sh's argv (visible to `ps -ef` for the entire install duration). Sub-process pass-through at line:1565 (`redis-cli -a "$redis_pass" SET livos:platform:api_key "$PLATFORM_API_KEY"`) creates a second narrower argv-exposure window. No echo/log leaks (zero `grep` hits on `echo.*PLATFORM_API_KEY`), no `set -x`, no `export PLATFORM_API_KEY` (so `/proc/PID/environ` is clean). Plan 03 explicitly tasked with `livos-install-wrap.sh` proposal + `${LIV_PLATFORM_API_KEY:-}` env-var fallback patch to install.sh.
- **AUDIT-FINDINGS.md structural integrity preserved** — 9 `^## ` headings unchanged; only stubs in sections 3, 4, 5 replaced; sections 6-9 still carry "Populated by Plan 03" markers (4 expected). 132 `line:N` references throughout the populated sections; one Server4 mention (the original disclaimer from Plan 01) — snapshot itself contains zero Server4 references, so no anomaly rows added.
- **Three of four CONTEXT.md D-10 readiness questions answered** — 1) "Is install.sh safe to run twice?" → no (NOT-IDEMPOTENT, with 4 specific failure modes cited). 2) "How does Phase 37 pass the API key without leaking it via ps?" → it cannot today; Plan 03 wrapper required. 3) "What command does Phase 37 invoke for reinstall?" → literal hint provided for both wrapper-shipped and v29.2-fallback paths. The 4th question (recovery action on non-zero exit) is Plan 03's deliverable per the section split in CONTEXT.md D-02.

## Task Commits

Each task committed atomically (sequential mode, hooks ON, no `--no-verify`):

1. **Task 1: Argument Surface populated** — `f33c2207` (docs)
2. **Task 2: Idempotency Verdict populated (NOT-IDEMPOTENT)** — `8f2de100` (docs)
3. **Task 3: API Key Transport populated (argv FAIL)** — `5c073823` (docs)

## Files Created/Modified

- `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` — three sections populated (Argument Surface, Idempotency Verdict, API Key Transport); +236 lines net across the three commits (+53 / +133 / +51, minus the three single-line stubs replaced). Heading structure unchanged at 9 `^## ` sections.
- `.planning/phases/36-install-sh-audit/36-02-static-analysis-SUMMARY.md` — this file.

## Verdict Snapshot

| Concern | Verdict | Evidence |
|---|---|---|
| Argument surface — flags | **1 flag only** (`--api-key <value>`) | line:14 case branch; line:16 `*) shift ;;` swallows everything else |
| Argument surface — env vars consumed | **none for platform key** | `grep` for `${LIV_API_KEY}|${API_KEY}|${PLATFORM_API_KEY:-}` returns zero env-read lines |
| Argument surface — stdin | **no platform-key path** | 6 `read -*` calls catalogued; all confined to wizard helpers, none invoked against `PLATFORM_API_KEY` |
| Idempotency | **NOT-IDEMPOTENT** | 4 NOT_IDEMPOTENT rows (line:861-864, 1086, 1125, 1136-1137); re-run damages running install before re-bootstrapping |
| API key transport | **argv (line:14)** | `case "$1" in --api-key) PLATFORM_API_KEY="$2"; shift 2 ;;` |
| FR-AUDIT-04 compliance | **FAIL** | argv-only ingestion is the prohibited pattern per requirement text |
| Plan 03 wrapper proposal owed? | **YES** | per FR-AUDIT-04 FAIL + CONTEXT.md D-08 escalation rule |
| Phase 37 wipe mandatory? | **YES** | per NOT-IDEMPOTENT verdict; install.sh cannot self-clean its own re-run state |

## Decisions Made

- **Verdict floor for Idempotency was set at NOT-IDEMPOTENT (not PARTIALLY-IDEMPOTENT)** — CONTEXT.md D-06 says "any NOT_IDEMPOTENT producing a hard error on re-run → NOT-IDEMPOTENT". Three of the four NOT_IDEMPOTENT rows produce hard errors (PG password mismatch crashes livinityd auth; Redis FLUSHALL destroys runtime state; setup_repository rm -rf bypasses write_env_file's overwrite guard). PARTIALLY-IDEMPOTENT would have understated Phase 37's risk envelope. Verdict has to be decisive per CONTEXT.md "Specific Ideas" line: "every open question must resolve into a chosen path."
- **Server4 NOT introduced into AUDIT-FINDINGS.md** — `grep -n "Server4|45\.137\.194\.103" install.sh.snapshot` returned zero matches, so per executor critical_constraints rule #4 ("If snapshot has no Server4 mentions, simply do not introduce any"), no anomaly rows were added. The single existing Server4 mention in the document (line 33 of AUDIT-FINDINGS.md) is the disclaimer Plan 01 placed; this plan did not add any.
- **`install_cloudflared` flagged as anomaly but NOT escalated to verdict-blocker** — the function exists at line:502-513 and is called at line:1488. Project memory says "Cloudflare is DNS-only, NOT a tunnel — `cloudflared` is not in this stack." The package gets installed but is never started by install.sh (no `systemctl enable cloudflared` line) so it is dead-on-disk infrastructure inherited from a prior deployment model. Recorded as anomaly #2 in the Argument Surface findings summary; left to Plan 03's Hardening Proposals to decide whether to remove. Does NOT influence the idempotency or API-key verdicts. (Note: this is install.sh content quoted from the snapshot; per Plan 02 plan text line 161, anomalies are recorded with line refs but the snapshot is not edited.)
- **API key transport severity table treats sub-process pass-through (line:1565) as MEDIUM, primary argv (line:14) as HIGH** — the line:1565 redis-cli call has a brief argv-exposure window (single SET call, milliseconds-to-seconds) vs. the line:14 install.sh window (entire install, several minutes). Both are real but quantitatively different. Plan 03's wrapper proposal needs to address both: env-var read into install.sh closes line:14, heredoc-fed `redis-cli` or `--pipe` mode closes line:1565.

## Deviations from Plan

### Auto-fixed Issues

None. The plan as-written was directly executable end-to-end. The static-analysis findings were unambiguous enough to populate the three sections without architectural questions, and the snapshot from Plan 01 was hash-stable so no re-fetch was needed. Three task commits, one per section, with no rule-1/2/3 fixes required and no rule-4 architectural escalations.

### Auth Gates

None. Static analysis required no credentials, no SSH, no remote calls. The only network-touching tool used was the editor against local files.

### Plan-text wording observations (non-deviations)

- The plan's verify regex for Task 2 (`grep -E "^\\*\\*Verdict:\\*\\* \\\`(IDEMPOTENT|PARTIALLY-IDEMPOTENT|NOT-IDEMPOTENT)\\\`"`) and Task 3 (`grep -E "^\\*\\*Primary transport:\\*\\* \\\`(argv|stdin|--api-key-file|env-var|none)\\\`"` + `grep -E "^\\*\\*Verdict:\\*\\* (PASS|FAIL)"`) all match the populated sections — no deviation.
- The Task 3 acceptance criterion that the leak-surface table contain 5 rows (argv exposure, echo/log, set -x, sub-process pass-through, env-in-proc) is satisfied row-for-row, every cell non-blank.

## Issues Encountered

- **Windows-host CRLF warnings on commit** — `git commit` emitted "LF will be replaced by CRLF" warnings for `.md` edits. Existing `.gitattributes` rules govern; the AUDIT-FINDINGS.md content is text, hash-irrelevant for this audit (only `install.sh.snapshot` requires byte-exact preservation, and that file has `*.sh text eol=lf` covering it from Plan 01). No mitigation needed for `.md` files.
- **No other operational issues** — read-only static analysis is friction-free; the snapshot was on disk and hash-stable from Plan 01.

## User Setup Required

None. No external services touched, no env vars added, no production toolchain edits, no SSH calls, no Mini PC interactions.

## Next Phase Readiness

- **Plan 36-03 (Recovery + Server5 + Hardening + Phase 37 Readiness) inputs ready:**
  - The same `install.sh.snapshot` (Plan 01) feeds Plan 03's Recovery Model and Server5 Dependency Analysis.
  - Plan 03 explicitly owes a `livos-install-wrap.sh` proposal per FR-AUDIT-04 FAIL → Hardening Proposals section.
  - Plan 03 owes the Phase 37 Readiness section's 4th question ("recovery action on non-zero exit") — D-07's `tar -czf /tmp/livos-pre-reset-<ts>.tar.gz /opt/livos` snapshot pattern is the chosen path per CONTEXT.md.
- **Phase 37 (factory-reset-backend) inputs partially ready:**
  - Three of four D-10 readiness questions answered. The fourth (recovery action) is Plan 03's deliverable.
  - Wipe-step requirements are now concrete: `systemctl stop livos liv-core liv-memory liv-worker`, `dropdb livos`, `dropuser livos`, `redis-cli FLUSHALL` (redundant but defensive), `rm -rf /opt/livos /opt/nexus /etc/systemd/system/livos*.service /etc/systemd/system/liv-*.service`, `systemctl daemon-reload` BEFORE invoking install.sh. Without this ordering, install.sh's CREATE USER guard skips and PG password mismatch crashes livinityd post-restart.
- **Hard rules upheld:** zero live execution of install.sh, zero edits to `livos/` or `nexus/`, zero Server4 references introduced (only the existing Plan 01 disclaimer remains), zero SSH calls.

## Self-Check: PASSED

Verified before SUMMARY commit:

- `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` — FOUND, 9 `^## ` headings, 0 "Populated by Plan 02" stubs, 4 "Populated by Plan 03" stubs (sections 6-9 expected), 1 Server4 mention (Plan 01's disclaimer; not added by this plan), 132 `line:N` references.
- Idempotency Verdict regex match: `**Verdict:** \`NOT-IDEMPOTENT\`` — VERIFIED.
- Primary transport regex match: `**Primary transport:** \`argv\`` — VERIFIED.
- FR-AUDIT-04 verdict regex match: `**Verdict:** FAIL` — VERIFIED.
- "Plan 03 must produce a wrapper proposal" literal phrase — VERIFIED at AUDIT-FINDINGS.md line 286 (FAIL reasoning paragraph).
- Commit `f33c2207` (Task 1, Argument Surface) — FOUND in `git log --oneline`.
- Commit `8f2de100` (Task 2, Idempotency Verdict) — FOUND in `git log --oneline`.
- Commit `5c073823` (Task 3, API Key Transport) — FOUND in `git log --oneline`.
- No `bash install.sh.snapshot` / `sh install.sh.snapshot` / `bash -n install.sh.snapshot` / `| bash` / `source install.sh.snapshot` in the command stream — VERIFIED.
- No edits to `livos/`, `nexus/`, or any production toolchain file — VERIFIED (`git status` shows changes only inside `.planning/phases/36-install-sh-audit/` plus pending STATE.md/ROADMAP.md/REQUIREMENTS.md updates).
- No SSH/scp/rsync calls in this plan — VERIFIED.
- All static-analysis claims spot-check against the snapshot: line:14 contains `--api-key) PLATFORM_API_KEY="$2"; shift 2 ;;`, line:16 contains `*) shift ;;`, line:1125 contains `redis-cli -a "$SECRET_REDIS" FLUSHALL`, line:1136-1137 contains the `SELECT 1 FROM pg_roles WHERE rolname='livos'` guard pattern, line:1565 contains the `redis-cli SET livos:platform:api_key` invocation — VERIFIED via Grep.

---
*Phase: 36-install-sh-audit*
*Completed: 2026-04-29*
