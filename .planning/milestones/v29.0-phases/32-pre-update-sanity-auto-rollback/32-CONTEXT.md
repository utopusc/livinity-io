# Phase 32: Pre-Update Sanity & Auto-Rollback - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Make a failed deploy self-heal — `update.sh` refuses to start if the host can't possibly succeed (disk, perms, GitHub reachability), and if livinityd 3× crashes after a successful deploy, the system automatically reverts to the previous known-good SHA without user intervention.

**Depends on:** Phase 31 (reuses the `/opt/livos/.deployed-sha` file pattern + fail-loud exit conventions; rollback assumes update.sh already records SHAs reliably)

**Requirements covered:** REL-01 (precheck guards), REL-02 (auto-rollback)

**Patch artifact target:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh`

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss=true`. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Inherited from Phase 31 conventions
- Idempotent SSH-applied patch script following Phase 30/31 pattern
- Single artifact at `.planning/phases/<phase-dir>/artifacts/<name>.sh` applies to BOTH Mini PC + Server4
- Backup-then-syntax-check-then-restore safety net
- `grep -qF` idempotency guards on every block insertion
- Fail-loud exit conventions (PRECHECK-FAIL: <reason>) match BUILD-01's verify_build error style

### Critical constraints (from success criteria)
- Precheck MUST exit before any `git clone`/`rsync` — early-bail design
- Rollback MUST be systemd-level (not livinityd in-process) — works when livinityd can't start
- Recovery target: <2 minutes from third crash to prior code running
- Rollback marker MUST land in `/opt/livos/data/update-history/` for Phase 33 to consume as `status:rolled-back`

### Phase 34 contract
- Precheck error format `PRECHECK-FAIL: <reason>` is the exact string Phase 34's UX-01 toast surfaces
- Single-line, actionable, no ANSI codes — must round-trip through `system.update` tRPC mutation cleanly

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Anchors known from Phase 31:
- `/opt/livos/update.sh` is the deploy entrypoint (rsynced from `livos/scripts/update.sh.minipc`)
- `/opt/livos/.deployed-sha` records the last successful deploy SHA (Phase 30 introduced)
- Systemd services: `livos.service` (livinityd), `liv-core.service`, `liv-worker.service`, `liv-memory.service`
- Update history dir does NOT exist yet — Phase 32 creates it; Phase 33 consumes

</code_context>

<specifics>
## Specific Ideas

### REL-01 (precheck) — three guards minimum
- Disk free check on `/opt/livos` partition (≥2 GB threshold per success criterion #1)
- Write-test on `/opt/livos` (touch + rm a tmpfile, exit if EROFS / EACCES)
- Network reach test for `api.github.com` (curl --head with 5s timeout)
- Each failure emits `PRECHECK-FAIL: <reason>` and exits non-zero before `git clone`/`rsync`

### REL-02 (auto-rollback) — systemd watchdog pattern
- `livos.service` already has `Restart=on-failure`; add `StartLimitIntervalSec=300` + `StartLimitBurst=3` so systemd marks it failed after 3 crashes in 5 min
- `OnFailure=livos-rollback.service` triggers the watchdog
- `livos-rollback.service` is a oneshot that:
  1. Reads previous SHA from `/opt/livos/.deployed-sha.previous` (introduced here; update.sh now writes both `.deployed-sha` and shifts the old one to `.deployed-sha.previous` before overwriting)
  2. Runs `git -C /tmp/livinity-update-rollback fetch + checkout <prev-sha>`, rsyncs source, runs build, swaps in
  3. Writes `/opt/livos/data/update-history/<timestamp>-rollback.json` with `{status: "rolled-back", from_sha, to_sha, reason: "3-crash-loop"}`
  4. Restarts `livos liv-core liv-worker liv-memory`

### update.sh modifications
- Add `precheck()` function called at top of script (before `set -euo pipefail` work begins... or right after)
- Add `record_previous_sha()` to shift `.deployed-sha` → `.deployed-sha.previous` before writing new SHA
- Add `mkdir -p /opt/livos/data/update-history` if missing

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped. Plan-phase research will surface anything else worth pulling in.

</deferred>
