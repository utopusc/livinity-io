---
status: passed
phase: 210
verified_at: 2026-05-26T09:30:46Z
verifier: claude-opus-4-7 (autonomous mode)
---

# Phase 210 Verification — Subdomain canonical format + 3 critical relay/install bugs

## Ship-gate result: CODE-COMPLETE PASSED (4/4 code gates; live verification deferred to P217)

### G1 — Bug A (parseSubdomain hyphen format) RED→GREEN

**Status:** PASS

13/13 vitest cases in `platform/relay/src/subdomain-parser.test.ts`:
```
✓ src/subdomain-parser.test.ts (13 tests) 4ms
Test Files 1 passed (1) | Tests 13 passed (13)
```

Cases: canonical hyphen (n8n-bruce), multi-hyphen app (code-server-alice), port-stripping, case-insensitive, legacy dot, bare username, apex, undefined, mismatched-base, IP host, leading-hyphen guard, trailing-hyphen guard.

### G2 — Bug B (provisionAppSubdomain null path) RED→GREEN

**Status:** PASS

Vitest case `Phase 210 Bug B: install() logs an error when provisionAppSubdomain returns null` PASS. Static-grep over `apps.ts` confirms:
- `if (!provisioned) { ... }` block exists.
- Block calls `this.logger.error` (or warn).
- Block contains the literal `Phase 210` marker for operator grep-ability.

### G3 — Bug C (REDIS_PLATFORM_URL declared) RED→GREEN

**Status:** PASS

Vitest case `Phase 210 Bug C: REDIS_PLATFORM_URL and REDIS_PLATFORM_API_KEY are both declared in apps.ts` PASS. Both `const` lines present at apps.ts:38 and apps.ts:45.

### G4 — Typecheck clean

**Status:** PASS

- `cd platform/relay && npx tsc --noEmit` → exit 0, zero output.
- `cd livos && npx tsc --noEmit -p packages/livinityd` → zero new errors in `apps.ts` or `redis-platform-keys.test.ts`.

## REQ coverage

| REQ | Status | Notes |
|-----|--------|-------|
| SUB-01 — single canonical hyphen format | PASS (code) | Tests enforce. Live cleanup of stale dot-format Redis rows is a backfill task. |
| SUB-02 — relay parseSubdomain hyphen split | PASS (code) | Bug A fix. |
| SUB-03 — Bug 210.1 RED→GREEN 4-case coverage | PASS | Actually 13 cases (4 categories x ~3 sub-cases each). |
| SUB-04 — provisionAppSubdomain THROW on non-409 | PARTIAL (softened by D-210-02 to loud-LOG, not throw) | Air-gapped/LAN deploys keep working; observability gap closed. |
| SUB-05 — Caddy never writes config without host | PASS (code) | Bug B's log surfaces the path that previously silent-null'd into dot fallback. |
| SUB-06 — Bug 210.2 RED→GREEN | PASS | Static-grep test confirms log surface. |
| SUB-07 — REDIS_PLATFORM_URL declared | PASS | apps.ts:45. |
| SUB-08 — install_history row within 2s (Bug 210.3) | DEFERRED to P217 | Requires live Mini PC install + Supabase observation. |
| SUB-09 — install n8n → n8n-bruce.livinity.io < 30s | DEFERRED to P217 | Gated on Server5 relay restart (separate incident). |
| SUB-10 — zero "fall through to offline page" log lines | DEFERRED to P217 | Same gate. |
| SUB-11 — relay state entry probe | PASS | Server5 relay STOPPED since 2026-05-18 — documented in CONTEXT.md § "D-V41-RELAY-STATE-UNKNOWN — RESOLVED". |

## Files changed in repo

```
M platform/relay/src/subdomain-parser.ts                                          (Bug A)
M livos/packages/livinityd/source/modules/apps/apps.ts                            (Bug B + Bug C)
+ platform/relay/src/subdomain-parser.test.ts                                     (13 cases)
+ livos/packages/livinityd/source/modules/apps/redis-platform-keys.test.ts        (2 cases)
+ .planning/phases/210-subdomain-canonical-bugs/210-CONTEXT.md
+ .planning/phases/210-subdomain-canonical-bugs/210-VERIFICATION.md
+ .planning/phases/210-subdomain-canonical-bugs/210-SUMMARY.md
~ .planning/ROADMAP.md (status flip to 🟡 CODE-COMPLETE)
```

## Carry-overs

- **CARRY-V41-RELAY-DOWN** — Server5 PM2 `relay` process stopped since 2026-05-18; needs orphan-row cleanup on `bandwidth_usage_user_id_fkey` OR soft-fail FK handling in `bandwidth.ts:flushBandwidthToPostgres`. Operator-attention incident, separate from Phase 210 code work.
- **CARRY-P210-RECONCILE** — Stale SubdomainConfig rows without `host` field (created pre-Phase-141-03) need a one-shot reconcile. Code path described in research § 5; not shipped in Phase 210.
- **CARRY-P210-BUG-D** — Single-char slug validation in livinityd `provisionAppSubdomain()`. Low-priority leftover from research § 2.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED (INV-210-03 PASS).
