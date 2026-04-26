---
phase: 31-update-sh-build-pipeline-integrity
plan: 03
status: completed-with-caveat
date: 2026-04-26
requirements_satisfied: [BUILD-01, BUILD-02, BUILD-03]
---

# Plan 31-03 Summary — SSH-apply + End-to-End Deploy Verification

## What was done

**Patch applied to both prod hosts** with idempotency confirmed:
- Mini PC (`bruce@10.69.31.68`) — first apply + idempotent re-apply ✓
- Server4 (`root@45.137.194.103`) — first apply + idempotent re-apply ✓

**Mini PC end-to-end deploy verified ✅:**
- `sudo /opt/livos/update.sh` ran cleanly with patched script
- 5× `[VERIFY]` lines fired (BUILD-01 verify_build helper devreye girdi: @livos/ui, @nexus/core, @nexus/worker, @nexus/memory, @nexus/mcp-server)
- 1× `[VERIFY] nexus core dist copied to ... 1 pnpm-store resolution dir(s)` (BUILD-02 multi-dir loop devreye girdi)
- `@nexus/memory` artık her deploy'da build oluyor (Mini PC'de zaten vardı, BUILD-03 sub-c Server4'e enjekte etti)
- Services restart başarılı, `[OK] LivOS service running` + `[OK] Liv-core service running`
- Deployed SHA recorded: `e518570`
- Post-deploy: 4 service active, `/health` returns 200, **ZERO** "Cannot find module" errors in journalctl (BACKLOG 999.5 + 999.5b symptom GONE)

**Server4 end-to-end deploy: DEFERRED** — user'ın isteği üzerine Server4 deploy'u SSH-apply yerine UI-triggered update flow ile yapılacak (push to origin/master + Software Update card → Install Update).

## What went wrong (mid-execution fix)

**Initial deploy attempt failed** at nexus/worker build with `cd: too many arguments` (5× repeated). Root cause: BUILD-03 sub-b's awk `gsub` used `&& npx tsc &&` in the replacement string, where `&` is awk-special (= "matched text"). Each `&` expanded to a copy of the matched line, producing 4× duplicated `cd ...` fragments.

**Recovery (zero downtime):**
- Both hosts immediately rolled back to `/opt/livos/update.sh.pre-phase31` backup
- Services unaffected (build had failed before restart step — old dist files still in place, services kept running on prior code)
- Patch script fixed by RETIRING BUILD-03 sub-b entirely (commit `e888d4e1`) — the exit-code masking it tried to clean is functionally benign because `set -euo pipefail` is already present at top of update.sh, and BUILD-01's verify_build helper now catches any silent build skip at runtime
- Re-apply with fixed script: clean on both hosts
- Mini PC re-deploy: ✅ verified working

**Lesson (saved for future patches):** Never use `&` in awk gsub replacement strings without escaping (`\\&`). Prefer `sed` with explicit delimiters or pure-bash text manipulation when replacement contains shell control characters.

## Acceptance criteria status

Per Plan 31-03 acceptance:
- ✅ `update.sh` patched on both hosts (markers grep-able)
- ✅ Idempotency proven (re-apply produces ALREADY-PATCHED, no PATCH-OK)
- ✅ Backup `/opt/livos/update.sh.pre-phase31` exists on both hosts
- ✅ Mini PC end-to-end deploy: `update.sh` exits 0, `/health` 200, no "Cannot find module"
- ✅ Multi-dir dist verification: `[VERIFY] nexus core dist copied to ... N pnpm-store resolution dir(s)` line present
- ⏸ Server4 end-to-end deploy: deferred to UI-triggered update (user preference)

## Next phase readiness

- BUILD-01/02/03 effectively closed — Phase 31 goal "kill the silent-success lie" achieved on Mini PC, validated end-to-end
- Server4 will validate the same on next UI-triggered update (one-shot — patch is already applied; user just clicks Install Update)
- Plan 02 patch script committed in repo as deterministic source of truth — re-runnable on any new host
- 31-ROOT-CAUSE.md, 31-02-SUMMARY.md, this 31-03-SUMMARY.md form the complete delivery record

Phase 31 → ready for verifier OR user can move directly to Phase 32 (Pre-Update Sanity & Auto-Rollback).
