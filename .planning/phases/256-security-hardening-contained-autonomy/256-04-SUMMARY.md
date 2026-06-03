---
phase: 256-security-hardening-contained-autonomy
plan: 04
subsystem: auth fail-closed (livinityd tRPC RBAC / Caddy subdomain gate / liv-core+memory API key)
tags: [security, auth, fail-closed, rbac, forward-auth, jwt, LIVOS-004, LIVOS-008, LIVOS-014, LIVOS-018, LIVOS-019, LIVOS-025, WS-D, SC6, SC7]
requires: ['256-03']
provides:
  - is-authenticated.ts fail-closed (throw on inactive/missing user; explicit legacySingleUser flag in requireRole)
  - livinityd GET /auth/verify forward_auth endpoint (200 only on a valid JWT)
  - caddy.ts forward_auth JWT gate (installed-app single-user + native-app blocks)
  - liv-core verifyApiKey/requireApiKey fail-closed (503 on unset key)
  - memory requireApiKey fail-closed (503 on unset key)
  - env-seed.sh + deploy-livinityd.sh always seed LIV_API_KEY
affects:
  - livos/packages/livinityd/source/modules/server/trpc/context.ts (legacySingleUser field)
  - livos/packages/livinityd/source/modules/server/index.ts (/auth/verify route)
  - livos/packages/livinityd/source/modules/domain/caddy.ts (forward_auth blocks)
tech-stack:
  added: []
  patterns: [fail-closed-auth, explicit-legacy-flag, caddy-forward_auth, call-time-env-read, idempotent-secret-seed]
key-files:
  created:
    - liv/packages/core/src/auth.test.ts
    - liv/packages/memory/src/auth.test.ts
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts
    - livos/packages/livinityd/source/modules/server/trpc/is-authenticated.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/context.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts
    - liv/packages/core/src/auth.ts
    - liv/packages/memory/src/auth.ts
    - scripts/install/env-seed.sh
    - scripts/install/deploy-livinityd.sh
key-decisions:
  - "livinityd tests use vitest (the package's own test:run runner; vitest@2.1.9 IS installed in livos/node_modules/.pnpm and runs via npx in packages/livinityd) — NOT the tsx-only convention 256-01/02 used for liv/. The existing is-authenticated.test.ts + caddy.test.ts are vitest; I extended them in-place."
  - "liv-core + memory tests use tsx + node:assert/strict (the liv/ convention — no vitest in liv/node_modules), matching api.scope-filter.test.ts / files-sandbox.test.ts."
  - "is-authenticated catch block now rethrows a TRPCError unchanged (instanceof guard) so the fail-closed UNAUTHORIZED from the userId branch is not relabeled as the generic 'Invalid token'."
  - "verifyApiKey/requireApiKey read process.env.LIV_API_KEY at CALL time (removed the module-load const) so a late-seeded key is honored and the fail-closed branch is unit-testable."
  - "deploy-livinityd.sh seeds LIV_API_KEY idempotently by reusing the prior key from the .env.bak the same run makes (the .env is rewritten fresh each run) → no key churn / no JWT-client breakage across re-runs; falls back to openssl rand -hex 32 on a true fresh install."
requirements-completed: [LIVOS-004, LIVOS-008, LIVOS-014, LIVOS-018, LIVOS-019, LIVOS-025]
duration: ~9 min
completed: 2026-06-03
---

# Phase 256 Plan 04: Auth Fail-Closed (WS-D) Summary

Closed the WS-D auth fail-open chain. (1) LIVOS-004: a deactivated/deleted user's still-valid JWT now THROWS `UNAUTHORIZED` instead of falling through unset and being silently promoted to legacy admin by `requireRole` — `requireRole` admits an absent `currentUser` only via an EXPLICIT `ctx.legacySingleUser` flag (set for genuine single-user mode and the X-Api-Key service-token no-DB path / fix E), never by inferring admin from unresolved auth. (2) LIVOS-008: the Caddy subdomain login gate now VALIDATES the JWT via a new livinityd `GET /auth/verify` forward_auth endpoint (200 only on a valid signature+exp) instead of the cookie-PRESENCE glob that any `LIVINITY_SESSION=<garbage>` satisfied — for both single-user installed-app and native-app blocks. (3) LIVOS-014/018/019/025: liv-core (`:3200`) and the memory API now FAIL CLOSED (503) when `LIV_API_KEY` is unset, and both installers always seed a `LIV_API_KEY` so liv-core never boots into that refusal state in normal operation.

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | is-authenticated fail-closed (LIVOS-004 / fix E) | `ff4914df` | is-authenticated.test.ts — 15/15 (9 new WS-D) |
| 2 | forward_auth JWT gate for subdomains (LIVOS-008) | `1df34feb` | caddy.test.ts — 86/86 (5 new WS-D) |
| 3 | liv-core + memory fail CLOSED on unset key (LIVOS-014/018/019/025) | `51486f86` | core auth.test.ts 2/2 + memory auth.test.ts 2/2 |
| 4 | always seed LIV_API_KEY (LIVOS-014 install leg) | `f35313b9` | bash -n ×2 + resolution-order isolation test + grep |

**Total:** 4 commits, all on `master` (continuing the 256-01/02/03 chain pattern), all with the sacred-SHA hook PASS (20 files verified) — no `--no-verify`.

## Key Implementation Details

**Task 1 — `is-authenticated.ts` + `context.ts`:**
- `if (payload.userId)` branch: when `findUserById` returns null OR `dbUser.isActive===false`, `throw new TRPCError({code:'UNAUTHORIZED', message:'User inactive or not found'})` — fail closed, no fall-through.
- No-userId legacy branch: when no DB admin is found, set `ctx.legacySingleUser=true` (genuine single-user mode stays admin-equivalent).
- X-Api-Key service-token `catch` (no-DB) branch: set `ctx.legacySingleUser=true` (fix E) — the openclaw/loopback service path stays authorized under the new requireRole rule.
- `requireRole`: `if (!ctx.currentUser) { if (ctx.legacySingleUser===true) return next(); throw FORBIDDEN }` — explicit-flag-only admission.
- `catch (error)` rethrows a `TRPCError` unchanged (so the fail-closed UNAUTHORIZED isn't relabeled).
- `context.ts`: added `legacySingleUser: undefined as boolean | undefined` to the base context.

**Task 2 — `server/index.ts` + `caddy.ts`:**
- `GET /auth/verify`: reads the JWT from `Authorization: Bearer` or the `LIVINITY_SESSION` cookie, `verifyToken(token).catch(()=>null)`, returns `200` (empty) on a valid payload else `401`. Reachable on `:8080` for all hosts, not itself subdomain-gated. Mirrors the existing `/api/mcp` cookie+verify pattern.
- `caddy.ts`: BOTH the single-user installed-app block and the native-app block now emit `forward_auth 127.0.0.1:8080 { uri /auth/verify; copy_headers Cookie; @bad status 401; handle_response @bad { redir https://${mainDomain}/login?redirect=... } }`. The presence-only `@notauth { not { header Cookie *LIVINITY_SESSION=* } }` glob is gone. The OpenDesign `upstreamBearer` + loopback Host/Origin rewrite is preserved in the `reverse_proxy` body, which now runs ONLY after a positive auth decision (closes the LIVOS-037 residual — pre-auth loopback rewrite no longer fires on forged-cookie requests). The multi-user wildcard `:8080` block is untouched.

**Task 3 — `liv/packages/core/src/auth.ts` + `liv/packages/memory/src/auth.ts`:**
- Removed the module-load `const LIV_API_KEY`; both fns read `process.env.LIV_API_KEY` at call time.
- `verifyApiKey`: `if (!expected) return false` (was `return true`).
- core `requireApiKey`: `if (!expected) { logger.error(...); res.status(503).json({error:'Server auth not configured'}); return }` (was `warn + next()`).
- memory `requireApiKey`: same 503-on-unset transform (was `console.warn + next()`). Constant-time compare for the configured-key path unchanged.

**Task 4 — `env-seed.sh` + `deploy-livinityd.sh`:**
- `env-seed.sh`: `LIV_API_KEY=$(openssl rand -hex 32)` added to the fresh-.env heredoc, plus an idempotent post-block `grep -q '^LIV_API_KEY='` guard that appends a key to an existing .env that lacks one.
- `deploy-livinityd.sh`: the conditional `if [[ -n "${LIVOS_API_KEY:-}" ]]` append is now unconditional — resolves `LIVOS_API_KEY` → reuse from `.env.bak` (idempotent, no churn) → `openssl rand -hex 32`. Downstream `^LIV_API_KEY=` read (MCP wiring) now always finds a key.

## Deviations from Plan

### [Adaptation] livinityd tests use vitest (not the tsx-only convention 256-01/02 adopted)
- **Found during:** Task 1, before writing tests.
- **Issue:** 256-01/02 SUMMARYs said "vitest not installed → use tsx". That is true for `liv/` (npm workspace), but `livos/` (pnpm) DOES have vitest@2.1.9 in `node_modules/.pnpm`, and `packages/livinityd/package.json` has a `test:run` script. The existing `is-authenticated.test.ts` and `caddy.test.ts` are written in vitest and run cleanly via `npx vitest run` from `packages/livinityd`.
- **Fix:** Extended the existing vitest suites in-place (the plan's `<verify>` literally calls `npx vitest run …` for these two files — vitest works here). Used tsx + node:assert only for `liv/core` + `liv/memory` (where vitest genuinely is absent), matching the liv/ convention.
- **Verification:** `npx vitest run` → is-authenticated 15/15, caddy 86/86. tsx → core 2/2, memory 2/2.

### [Line-anchor drift] deploy-livinityd.sh LIV_API_KEY append is at :1109-1112, not :1043-1046
- **Found during:** Task 4 read_first.
- **Issue:** The plan cited `deploy-livinityd.sh:1043-1046` for the conditional LIV_API_KEY append; that range is actually the JWT-secret rotation block. The real conditional append is at :1109-1112 (inside `_dld_write_env_file`), and the downstream read is at :1240-1247 (plan said :1160-1169). Drift is from the 256-01 + 256-02 edits to this file (apt/egress + CA-material regions) shifting line numbers.
- **Fix:** Edited the correct region (:1109-1112). My LIV_API_KEY-seed edit is a DISTINCT additive region from 256-01's apt block and 256-02's CA-gen block (verified — no overlap), per the parallel-safety note. No functional gap.

### [Adaptation] is-authenticated catch rethrows TRPCError unchanged
- **Found during:** Task 1 GREEN.
- **Issue:** The new `throw UNAUTHORIZED ('User inactive or not found')` lives inside the existing `try`, whose `catch` previously rethrew everything as `'Invalid token'` — which would have masked the precise fail-closed message and the test assertion.
- **Fix:** Added `if (error instanceof TRPCError) throw error` at the top of the catch so the fail-closed UNAUTHORIZED propagates verbatim; genuine verify failures still map to the generic 'Invalid token'.
- **Verification:** WS-D.T1/T2 assert `/inactive or not found/i`; original F5 tests still assert `/Invalid token/`.

**Total deviations:** 3 (1 test-framework correction, 1 anchor drift, 1 error-handling refinement). No architectural changes. No Rule 4 escalations. No new external surface.

## Service-Token / Internal-Call Regression Check (SC7) — NOT REGRESSED

Explicitly verified the legitimate service/loopback paths are preserved:

- **X-Api-Key service-token no-DB path (openclaw/loopback, fix E):** `WS-D.T6` asserts that the X-Api-Key match → `getAdminUser()` throws → `ctx.legacySingleUser=true` is set → a downstream `requireRole('admin')` PASSES (returns next, not FORBIDDEN). The service path is NOT regressed.
- **X-Api-Key service-token WITH DB:** `WS-D.T7` — maps to `currentUser=admin`, next() called (unchanged from F5.T1).
- **Genuine legacy single-user mode (no userId, no DB admin):** `WS-D.T4b` — sets `legacySingleUser=true`; `WS-D.T5b` — requireRole admits it. `WS-D.T4` — legacy JWT + DB admin still maps to admin.
- **Active member JWT:** `WS-D.T3` — resolves to `currentUser{role:'member'}`, next() called (normal auth path intact).
- **liv-core internal calls:** `ws-gateway.ts:301` + `voice/index.ts:93` consumers of `verifyApiKey` retain a JWT fallback after the key check, so an unset key forces JWT auth rather than breaking — and Task 4 guarantees the key is always seeded, so the X-Api-Key path works normally in deployment. The constant-time compare for the configured-key case is byte-unchanged.
- **All 6 original F5 service-token tests still pass** (the F5.T1–T6 suite is green within the 15/15).

## Success Criteria

- **SC6 (fully met at code/unit level):**
  - Inactive/deleted user JWT REJECTED + never escalated → `WS-D.T1/T2` (throw UNAUTHORIZED), `WS-D.T5` (requireRole FORBIDDEN without explicit flag). ✅
  - Subdomain gate validates the JWT → `/auth/verify` returns 200 only on a valid JWT; both Caddy blocks emit `forward_auth` and drop the presence glob (`WS-D.T1/T2/T3` caddy). ✅
  - liv-core + memory fail CLOSED on unset key → core/memory `auth.test.ts` (503 + verifyApiKey=false on unset; gate correctly when set). ✅
  - Installer always seeds LIV_API_KEY → env-seed.sh heredoc + idempotent guard; deploy-livinityd.sh unconditional with reuse/openssl fallback (`bash -n` + isolation test). ✅
- **SC7 (regression clean):** service-token (fix E), genuine legacy single-user, active member, and internal liv-core JWT-fallback paths all preserved — see the dedicated section above. ✅

The live SC6/SC7 probes in the plan's `<verification>` (deactivate-a-guest replay, `curl -H 'Cookie: LIVINITY_SESSION=garbage'`, scratch liv-core 503, OpenDesign session load, openclaw service call) require the Mini PC deploy = **256-05** (this plan is local code + tests only, per the execution rules).

## Self-Check: PASSED

- Both created files exist on disk: `liv/packages/core/src/auth.test.ts`, `liv/packages/memory/src/auth.test.ts` (verified).
- All 4 task commits present in `git log`: `ff4914df`, `1df34feb`, `51486f86`, `f35313b9` (verified).
- 101 livinityd vitest cases green (15 is-authenticated + 86 caddy) + 4 tsx cases green (2 core + 2 memory). `bash -n` clean on both installers. No tracked-file deletions across the 4 commits. Sacred-SHA hook PASS (20 files) on every commit; no file I touched is sacred-frozen.

## Next

Ready for **256-05** (Mini PC deploy + live UAT — the SC6/SC7 synthetic probes). 256-06 (already has a SUMMARY) covers the remaining WS-D-adjacent work. After 256-05 deploys, the operator walk validates: deactivated-guest JWT → UNAUTHORIZED, garbage-cookie subdomain → 302 /login, scratch liv-core unset-key → 503, OpenDesign valid-session load, openclaw service call → admin routes.
