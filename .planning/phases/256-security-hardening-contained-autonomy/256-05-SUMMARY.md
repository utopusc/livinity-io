# 256-05 — Integration / Deploy — SUMMARY

**Status:** DEPLOYED to Mini PC; core SCs live-proven; remaining SCs deployed + code-verified, operator agent-walk pending.
**Deployed SHA:** `74fc49c` → `dbfd3e0b` (2 deploy-time hot-fixes). Full transcript: `256-DEPLOY-LOG.md`.

## What happened
- Pushed 29 commits to `origin/master`; ran `update.sh` ×2 on the Mini PC (run #1 = new code + new update.sh; run #2 = new installer bootstrap).
- Pre-deploy gate GREEN: liv-core `tsc` build clean; liv security suites (sandbox/files-sandbox/agent-git-snapshot/irreversible-classifier/tool-registry.gate) PASS; livinityd vitest 101 + node:test (cred-egress 11, sanitizer 9, inject 18, metered 7) PASS; installers `bash -n` OK.

## Two deploy-time bugs caught by the live walk + fixed
1. `livos-egress` tinyproxy config — unquoted `Filter` path → `Syntax error on line 5`. Fix `c919c2fc` (quote path, both installers). Live: egress active.
2. bwrap broke on Ubuntu 24.04 (`apparmor_restrict_unprivileged_userns=1` → `uid map: Permission denied`). Without a fix the agent shell tool would error on every command (`usable` gates on bwrap-on-PATH only). Fix `dbfd3e0b` (scoped AppArmor `userns` profile, both installers). Live: bwrap works + SC1 enforced.

## SC results
- **Live-PASS:** SC1 (sandbox denies secret-read + self-modify), SC2 (egress allowlist deny/allow), SC6 (auth/verify rejects garbage cookie — LIVOS-008).
- **Deployed + wired + code/unit-verified (operator agent-walk pending):** SC3, SC4, SC4b, SC5, SC7, SC8 — implementing code confirmed live in the running deployment; full live confirmation needs driving the agent loop / installing apps (the plan's `checkpoint:human-verify` items).

## Follow-up (non-blocking)
`sandbox.ts` `usable` should runtime-probe that userns actually works (not just bwrap-on-PATH) so it falls back to env-scrubbed-unsandboxed rather than erroring on a box without the AppArmor profile.

## Services
All active: livos · liv-core · liv-worker · liv-memory · liv-assistant · livos-egress · tinyproxy. liv-claw-gateway active (pre-existing claw-client build warn, unrelated).
