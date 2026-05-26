# Phase 210 Summary — Subdomain canonical format + 3 critical relay/install bugs

**Shipped:** 2026-05-26 (CODE-COMPLETE; live verification deferred to Phase 217 pending CARRY-V41-RELAY-DOWN resolution)
**Status:** 🟡 CODE-COMPLETE — 4/4 code gates PASS

## Bugs fixed

| Bug | File | Severity | One-line |
|-----|------|----------|----------|
| 210.1 (Bug A) | `platform/relay/src/subdomain-parser.ts` | CRITICAL | hyphen format `n8n-bruce.livinity.io` now splits on last hyphen → `{user:'bruce', app:'n8n'}` |
| 210.2 (Bug B) | `livos/packages/livinityd/source/modules/apps/apps.ts:578-589` | HIGH | silent `provisioned=null` now logs a loud `Phase 210: CF subdomain provisioning failed for ...` error |
| 210.3 (Bug C) | `livos/packages/livinityd/source/modules/apps/apps.ts:45` | MEDIUM | `REDIS_PLATFORM_URL = 'livos:platform:url'` declared (was ReferenceError silently caught) |

## Test coverage delta

- `platform/relay/src/subdomain-parser.test.ts` — NEW, 13 vitest cases (4 RED→GREEN categories × 3 sub-cases each)
- `livos/packages/livinityd/source/modules/apps/redis-platform-keys.test.ts` — NEW, 2 static-grep cases (Bug B log surface + Bug C constant declaration)

## Critical incident surfaced (D-V41-RELAY-STATE-UNKNOWN entry probe)

Server5 PM2 `relay` process **STOPPED since 2026-05-18 13:50** (8 days). Crash cause: `bandwidth_usage_user_id_fkey` FK violations exhausted PM2's `max_restarts: 10` budget. Filed as **CARRY-V41-RELAY-DOWN** — separate operator-attention task, not in original v41-DRAFT.md scope but a real production incident discovered during this phase.

## Spec adjustments

- **D-210-02** — Bug B's draft spec said "THROW (not return null) on any non-409 failure." Softened to "loud LOG (not throw)" to preserve install on LAN/air-gapped deploys where Server5 unreachability is normal. Observability gap closed; blocking-throw remains an option for future hardening.

## Deferred to Phase 217 UAT

- SUB-08 — `install_history` row appears in Supabase within 2s of install (needs live Mini PC install + Supabase observation).
- SUB-09 — install n8n → opens at `n8n-bruce.livinity.io` in <30s (needs Server5 relay restart via CARRY-V41-RELAY-DOWN).
- SUB-10 — zero "fall through to offline page" log lines per install (same gate).

## Carry-overs filed

- **CARRY-V41-RELAY-DOWN** — Server5 relay restart (orphan-row cleanup OR soft-fail FK handling).
- **CARRY-P210-RECONCILE** — Backfill `host` field on pre-Phase-141-03 SubdomainConfig rows.
- **CARRY-P210-BUG-D** — Single-char slug validation in `provisionAppSubdomain()`.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED. Phase 210 makes zero source-code changes to `sdk-agent-runner.ts` or any of the 20 protected files.

## Effort

~35 min wall-clock total: ~10 min Server5 probe + ~5 min relay incident triage + ~10 min 3 code fixes + ~5 min tests + ~5 min typecheck + docs.
