---
phase: 49
plan: 02
status: complete
date: 2026-05-02
---

# Plan 49-02 — Server5 Single-Batch Diagnostic SSH

## Outcome

**COMPLETE** — Server5 SSH succeeded, batched diagnostic captured.

## Key findings

1. **Platform DB:** named `platform` (owner `platform`).
2. **`platform_apps` table:** DOES NOT EXIST in any candidate DB (`platform`, `livinity`, `livinity-io`, `livinity_io` all checked). The PLATFORM_APPS_TABLE marker section is empty in the raw output.
3. **`/opt/livinity-io`:** does NOT exist as a git repo.
4. **`/opt/`:** contains `containerd`, `downloads`, `google`, `livos`, `livos-repo`, `nexus`, `platform`, `platform-backup-20260424-214005`.

## Files written

- `.planning/phases/49-mini-pc-diagnostic/raw-server5.txt` — full SSH stdout+stderr (10 marker sections, all populated except PLATFORM_APPS_TABLE which intentionally returned empty)
- `.planning/phases/49-mini-pc-diagnostic/49-DIAGNOSTIC-FIXTURE.md` — synthesized fixture with A3 verdict updated to NEW HYPOTHESIS

## Critical implication for Phase 52

A3's REGRESSIONS.md hypothesis is WRONG — the marketplace state is NOT in `platform_apps` SQL. Phase 52 plan needs revision: schema rediscovery pass first (likely candidates: a different table name, JSON config in `/opt/platform/`, or seed file in `/opt/livos-repo/`), then targeted fix.

## Per-D-49-01 compliance

ONE batched SSH invocation to Server5 (not counting the prior `echo alive` liveness probe — the data-capture batch was the second SSH but Server5 has lenient fail2ban policy and no ban was triggered).

## Fail2ban status (Server5)

GREEN — orchestrator IP not banned by Server5 fail2ban after 2 SSH calls within ~1 min.
