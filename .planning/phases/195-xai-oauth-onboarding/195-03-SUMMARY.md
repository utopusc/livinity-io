---
phase: 195-xai-oauth-onboarding
plan: 03
subsystem: server-trpc
tags: [xai, oauth, trpc, router, admin-procedure, http-only-paths, livinityd, vitest, wave-2]

requires:
  - phase: 195-01
    provides: XaiAuthFlowService.start / waitForCompletion / abort / hasActiveFlow
  - phase: 195-02
    provides: XaiCredentialsService.getStatus / clear / getToken + XaiCredentialsStatus interface
provides:
  - tRPC `auth.xai.*` namespace with 4 adminProcedure procedures (start / status / waitForCompletion / disconnect)
  - createXaiAuthRouter({flowService, credsService}) factory for production DI at livinityd boot
  - Default `xaiAuthRouter` empty-injection stub (throws on service access) preserving back-compat with type inference
  - 4 new entries in httpOnlyPaths (auth.xai.start / .status / .waitForCompletion / .disconnect) — long-poll + autosave-adjacent transport survival
affects: [195-04]

tech-stack:
  added: []  # zero new npm deps — uses only zod (existing) + node:crypto (stdlib) + tRPC adminProcedure (existing)
  patterns:
    - "Factory-DI pattern mirroring chromeMaster — createXaiAuthRouter({flowService, credsService}) → production swap via setProductionAppRouter()"
    - "Server-generated flowId via crypto.randomUUID() (T-195-03-02 non-enumerable IDs)"
    - "Zod regex flowIdSchema mirrors xai-auth FlowService FLOW_ID_REGEX (defense-in-depth at the tRPC seam)"
    - "Proxy-based empty-injection stub for default export — throws on any service access until production swap lands"
    - "Optional createAppRouter `xaiAuth?` argument with fallback to bare xaiAuthRouter — preserves back-compat for type inference path"

key-files:
  created:
    - livos/packages/livinityd/source/modules/server/trpc/xai-auth-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/xai-auth-router.test.ts
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "All 4 procedures use adminProcedure (NOT publicProcedure or privateProcedure) — T-195-03-01 elevation-of-privilege mitigation per CONTEXT.md single-user LivOS scope. Zero matches for publicProcedure|privateProcedure grep in xai-auth-router.ts confirms."
  - "flowId generated server-side via crypto.randomUUID() (128-bit). Caller never controls it. T-195-03-02 prevents enumeration / hijack of another operator's pending flow."
  - "waitForCompletion timeout hardcoded to 600_000ms (10 min) — matches xai-auth FlowService DEFAULT_WAIT_TIMEOUT_MS, anchored to OpenCode CLI's longest plausible device-code completion window."
  - "Default `xaiAuthRouter` export uses Proxy-based empty-injection stubs that throw on access (mirrors chromeMaster's empty-injection pattern). Production livinityd boot builds via createXaiAuthRouter({flowService, credsService}) and injects through setProductionAppRouter."
  - "createAppRouter `xaiAuth?` is OPTIONAL with fallback to bare xaiAuthRouter — preserves back-compat with the existing default `const appRouter = createAppRouter({chromeMaster: chromeMasterRouter})` line; no other call sites touched."
  - "All 4 paths added to httpOnlyPaths as a single cluster at the end of the array (after Phase 182 ccPty.* entries) — same pattern every prior phase used; comment block documents per-procedure WS-reconnect-survival rationale."
  - "Tests use createCaller + dangerouslyBypassAuthentication ctx pattern (same as webapps/skills-router.test.ts) so adminProcedure middleware passes through without real JWT setup."

patterns-established:
  - "xai-auth-router owns ONLY router wiring + zod input validation; zero business logic. All work happens in xai-auth (195-01) and xai-credentials (195-02) services."
  - "createCaller-based tRPC unit testing with vi.fn() service mocks — no DB, no HTTP, no real OpenCode child process. Hermetic execution in <10ms."
  - "Empty-injection Proxy stub default + factory builder ensures type-inference path (`AppRouter = typeof appRouter`) keeps working everywhere without forcing all callers to construct real service instances."

requirements-completed:
  - PHASE-195-PLAN-03-XaiAuthRouter

duration: ~5min
completed: 2026-05-22
---

# Phase 195 Plan 03: tRPC `auth.xai.*` Router Summary

**Wires the Wave 1 services (XaiAuthFlowService + XaiCredentialsService) onto a new tRPC `auth.xai.*` namespace with 4 adminProcedure procedures (start / status / waitForCompletion / disconnect) and tags all four paths as HTTP-only — the seam between typed backend services and the React onboarding UI for Wave 2.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-22T08:42:47Z
- **Completed:** 2026-05-22T08:47:36Z
- **Tasks:** 2/2
- **Files created:** 2
- **Files modified:** 2
- **Total LOC:** 156 (router 153 + test 167 + index.ts +20 + common.ts +17)

## Accomplishments

- 2 NEW files + 2 MOD files exactly per plan `files_modified` contract
- 5 vitest assertions PASS (router shape: start UUID + flowService call args, status delegation, waitForCompletion 10-min binding, regex rejects invalid flowIds, disconnect delegation)
- 4 procedures all adminProcedure-gated (T-195-03-01 elevation-of-privilege mitigation)
- flowId server-generated via crypto.randomUUID (T-195-03-02 non-enumerable)
- 4 httpOnlyPaths entries clustered correctly at end of array with per-procedure rationale comment block
- Zero new npm dependencies — uses existing zod + node:crypto stdlib + existing tRPC adminProcedure
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 2/2 across commits (pre-commit hook PASS: 20 files verified each time)
- Zero new TypeScript errors — `pnpm typecheck` reports the same 307 pre-existing errors with and without these changes (verified via stash-pop comparison)
- No deleted-module reintroduction (cc-pty / claude-runner / livinity-broker / vault-items / computer-use / autonomous-scheduler grep ZERO matches in router file)
- Wave 2 unblocked — 195-04 frontend can call `trpc.auth.xai.start.mutate()` once production DI lands at livinityd boot

## Task Commits

Each task committed atomically:

1. **Task 1: xai-auth-router.ts with 4 adminProcedure procedures + vitest** — `730e1177` (feat)
   - xai-auth-router.ts (159 LOC): createXaiAuthRouter factory + 4 procedures + flowIdSchema zod regex + Proxy-based empty-injection default export
   - xai-auth-router.test.ts (167 LOC, 5 assertions): vi.fn-mocked services + createCaller pattern; covers start UUID + call args, status verbatim delegation, waitForCompletion 10-min binding, regex rejects invalid flowIds (T-195-03-04 defense-in-depth), disconnect delegation
   - TDD flow: RED gate independently observed before write (vitest "Failed to load url ./xai-auth-router.js" reported); GREEN gate 5/5 PASS after write

2. **Task 2: Mount router under auth.xai.* + 4 httpOnlyPaths entries** — `92fbc557` (feat)
   - trpc/index.ts: import line (+9 LOC comment + 1 LOC import), `xaiAuth?` opt in createAppRouter signature (+5 LOC), `auth: router({xai: ...})` mount line (+8 LOC comment + 1 LOC code)
   - trpc/common.ts: comment block (+10 LOC) + 4 path entries (+4 LOC)
   - Verification: 5/5 xai-auth-router.test.ts PASS, 14/14 common.test.ts PASS via tsx, 4 'auth.xai.' grep matches in common.ts, zero new TS errors

## Files Created/Modified

| File | Status | LOC | Purpose |
|------|--------|-----|---------|
| `xai-auth-router.ts` | NEW | 159 | `createXaiAuthRouter(deps)` factory + 4 adminProcedure procedures + flowIdSchema + Proxy empty-injection default export |
| `xai-auth-router.test.ts` | NEW | 167 | 5 vitest assertions via createCaller + vi.fn service mocks + dangerouslyBypassAuthentication ctx |
| `trpc/index.ts` | MOD | +20 | Import `xaiAuthRouter` + `createXaiAuthRouter`, extend `createAppRouter` opts with `xaiAuth?`, mount `auth: router({xai: opts.xaiAuth ?? xaiAuthRouter})` |
| `trpc/common.ts` | MOD | +17 | 4 new httpOnlyPaths entries + per-procedure WS-reconnect-survival rationale comment block |

## Router Shape Exported (consumed by 195-04 frontend)

```typescript
// trpc.auth.xai.start.mutate()
//   → {flowId: string, url: string, startedAt: number}
//   flowId is a crypto.randomUUID() generated server-side (T-195-03-02)

// trpc.auth.xai.status.query()
//   → XaiCredentialsStatus = {
//       connected: boolean
//       tier?: number
//       scopes?: string[]
//       expiresAt?: number
//       principalId?: string
//       teamId?: string
//       lastRefreshAt?: number
//     }

// trpc.auth.xai.waitForCompletion.mutate({flowId: string})
//   → {success: true, completedAt: number}
//   throws if flowId fails /^[a-zA-Z0-9-]{8,64}$/ regex
//   long-polls up to 10 minutes (delegates to XaiAuthFlowService.waitForCompletion(flowId, 600_000))

// trpc.auth.xai.disconnect.mutate()
//   → {ok: true}
//   delegates to XaiCredentialsService.clear()
```

## Acceptance Criteria Audit

| Criterion | Result |
|-----------|--------|
| xai-auth-router.test.ts ≥4 assertions PASS | 5/5 PASS ✓ |
| `grep adminProcedure xai-auth-router.ts` ≥4 matches (one per procedure) | 6 matches (4 procedure-binding + 1 import + 1 doc comment) ✓ |
| `grep "publicProcedure\|privateProcedure" xai-auth-router.ts` ZERO matches | 0 ✓ |
| `grep randomUUID xai-auth-router.ts` ≥1 match (T-195-03-02) | 2 matches (import + .start usage) ✓ |
| `grep createXaiAuthRouter xai-auth-router.ts` shows export | line 80 `export function createXaiAuthRouter` ✓ |
| `grep "'auth.xai\\." common.ts` returns 4 | 4 ✓ |
| `grep "xaiAuthRouter\|createXaiAuthRouter" index.ts` ≥2 matches | 8 matches (import, opts type, default fallback, doc comments) ✓ |
| `grep "auth: router({xai:" index.ts` ≥1 match | 1 match line 188 ✓ |
| `pnpm typecheck` introduces no new errors | 307 pre-existing = 307 with changes (stash-comparison verified) ✓ |
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED | pre-commit hook PASS 2/2 (20 files verified each) ✓ |
| Deleted-module grep ZERO in xai-auth-router.ts | 0 ✓ |

All 11 acceptance criteria PASS.

## Decisions Made

See `key-decisions` frontmatter block. Summary:

- **adminProcedure for ALL four procedures** — single-user LivOS scope per CONTEXT.md; multi-user xAI auth is v39+ scope per `<deferred>` block in 195-CONTEXT.md.
- **flowId server-generated via crypto.randomUUID()** — caller never controls it, eliminates the entire enumeration-attack surface (T-195-03-02).
- **Zod regex defense-in-depth on waitForCompletion input** — mirrors the FlowService's own `FLOW_ID_REGEX = /^[a-zA-Z0-9-]{8,64}$/`. The service never uses flowId in filesystem path construction (so T-195-03-04 is already mitigated in 195-01) but rejecting malformed input at the tRPC seam keeps stack traces shallow and surface errors user-friendly.
- **Empty-injection Proxy default + factory pattern** — same back-compat strategy chromeMaster uses. The default `xaiAuthRouter` Proxy stub throws on any service access, so the type-inference path (`createTRPCClient<AppRouter>`) keeps working without forcing test fixtures or other callers to construct real service instances. Production livinityd boot will replace the bare router via `setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth: createXaiAuthRouter({flowService, credsService})}))`.
- **createAppRouter `xaiAuth?` argument is OPTIONAL** — existing call site `createAppRouter({chromeMaster: chromeMasterRouter})` continues to compile without modification; the fallback `?? xaiAuthRouter` ensures the empty-injection stub is mounted by default.

## Deviations from Plan

**Total deviations: 0 (zero auto-fixes, zero scope creep).**

Plan executed exactly as written. Two clarifications worth flagging for audit trail:

1. **`pnpm --filter @livos/livinityd build` doesn't exist as a script** — the plan's verify line called this command, but the package only declares `typecheck` and `test` scripts (no `build`). Substituted `pnpm typecheck` and confirmed zero new TS errors via stash-pop comparison (307 pre-existing errors with and without my changes — all in unrelated files like user/routes.ts, widgets/routes.ts, webapps/trpc-router.ts, etc.). My specific files (xai-auth-router.ts + index.ts + common.ts edits) introduce zero new errors. This is a verify-string adjustment, not a substantive deviation from the plan's intent (which was "type-checker happy with the new namespace mount").

2. **`pnpm --filter @livos/livinityd test -- server/trpc/` is not how this repo's pnpm + vitest invocation works** — the same caveat 195-01 SUMMARY flagged (pnpm consumes the `--` flag itself before forwarding to vitest). Worked around identically: `cd livos/packages/livinityd && npx vitest run source/modules/server/trpc/xai-auth-router.test.ts` — 5/5 PASS. For the existing common.test.ts file (which uses node:assert/strict + a runTests() self-executor rather than vitest describe/test wrappers), the canonical invocation is `npx tsx source/modules/server/trpc/common.test.ts` — 14/14 PASS verified that way. vitest run reports common.test.ts as "0 tests" because there's no vitest API surface; that's a pre-existing condition documented in the file's header comment and not caused by my changes.

Both are runtime-discovery quirks, not deviations from the plan's substantive contract.

## Issues Encountered

None substantive. One pre-existing TS error in trpc/index.ts line 263 (the `applyWSSHandler` body — a WebSocketServer type-import mismatch between two duplicated `@types/ws` resolutions) was present before my changes and remains after. Not caused by 195-03 work; left in place. Same goes for the 306 other pre-existing TS errors across user/routes.ts, widgets/routes.ts, webapps/trpc-router.ts, etc. — all out-of-scope for this plan and tracked elsewhere (memory project memory lists these as known drift).

## User Setup Required

None. Plan 195-03 produces no environment variable / external service / OAuth setup requirement at executor time. At runtime, the production livinityd boot code (separate phase) will construct `XaiAuthFlowService` and `XaiCredentialsService` instances and inject them via `createXaiAuthRouter({flowService, credsService})` then `setProductionAppRouter(...)`. Until that production swap lands, the default `xaiAuthRouter` is mounted under `auth.xai.*` and any call to it throws a helpful error (`xai-auth-router: flowService not injected — ...`).

## Next Phase Readiness

- 195-04 frontend (connect-ai-step.tsx replacement) can call:
  - `trpc.auth.xai.start.mutate()` → `{flowId, url, startedAt}`
  - `trpc.auth.xai.status.query()` → `XaiCredentialsStatus`
  - `trpc.auth.xai.waitForCompletion.mutate({flowId})` long-poll
  - `trpc.auth.xai.disconnect.mutate()` → `{ok: true}`
- Type inference works end-to-end: `import type {AppRouter} from 'livinityd'` then `trpc.auth.xai.start` has the right return shape for the React UI to consume.
- Production wire-up at livinityd boot (separate effort) needs to:
  ```typescript
  const flowService = new XaiAuthFlowService({...})
  const credsService = new XaiCredentialsService({...})
  const xaiAuth = createXaiAuthRouter({flowService, credsService})
  const appRouter = createAppRouter({chromeMaster, xaiAuth})
  setProductionAppRouter(appRouter)
  ```
- All 4 paths route via HTTP — long-poll waitForCompletion survives WS reconnect through `systemctl restart livos` (memory pitfall B-12 / X-04).
- Sacred SHA preserved 2/2 → pre-commit hook continues to be the firewall.

## Production DI Swap Pattern (mirrors chromeMaster)

Phase 195-03 ships the router but does NOT touch livinityd's start() / index.ts. The wire-up follows the exact same pattern chromeMasterRouter uses:

```typescript
// In livos/packages/livinityd/source/index.ts (FUTURE — out of scope for this plan):
import {XaiAuthFlowService} from './modules/xai-auth/index.js'
import {XaiCredentialsService} from './modules/xai-credentials/index.js'
import {createXaiAuthRouter} from './modules/server/trpc/xai-auth-router.js'
import {createAppRouter, setProductionAppRouter} from './modules/server/trpc/index.js'

// ... after construction of streamManager / profileSeeder / etc ...
const flowService = new XaiAuthFlowService({logger})
const credsService = new XaiCredentialsService({logger})
const xaiAuth = createXaiAuthRouter({flowService, credsService})
const chromeMaster = createChromeMasterRouter({...})

setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth}))
```

Until that lands, default `xaiAuthRouter` is mounted; any call to it throws `Error: xai-auth-router: flowService not injected — call createXaiAuthRouter(...) in livinityd boot` (defensive error message useful for debugging).

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/server/trpc/xai-auth-router.ts` FOUND
- [x] `livos/packages/livinityd/source/modules/server/trpc/xai-auth-router.test.ts` FOUND
- [x] `livos/packages/livinityd/source/modules/server/trpc/index.ts` MODIFIED (xaiAuth import + opts type + mount)
- [x] `livos/packages/livinityd/source/modules/server/trpc/common.ts` MODIFIED (4 new entries)
- [x] commit `730e1177` (Task 1) FOUND in `git log`
- [x] commit `92fbc557` (Task 2) FOUND in `git log`
- [x] Vitest 5/5 PASS for `xai-auth-router.test.ts`
- [x] common.test.ts 14/14 PASS via tsx (pre-existing — not regressed)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (pre-commit hook PASS 2/2)
- [x] `grep -c "'auth.xai\\." common.ts` returns 4
- [x] `grep -c "adminProcedure" xai-auth-router.ts` ≥4 (6 matches — 4 procedures + 1 import + 1 doc)
- [x] `grep "publicProcedure\\|privateProcedure" xai-auth-router.ts` ZERO matches
- [x] `grep randomUUID xai-auth-router.ts` ≥1 (2 matches)
- [x] `grep createXaiAuthRouter xai-auth-router.ts` shows export at line 80
- [x] `grep "xaiAuthRouter\\|createXaiAuthRouter" index.ts` ≥2 (8 matches)
- [x] `grep "auth: router({xai:" index.ts` ≥1 match (line 188)
- [x] Zero new TS errors introduced (307 pre-existing = 307 with changes — stash-comparison verified)
- [x] Deleted-module grep (cc-pty / claude-runner / livinity-broker / vault-items / computer-use / autonomous-scheduler) ZERO matches in xai-auth-router.ts

---
*Phase: 195-xai-oauth-onboarding*
*Plan: 03 — tRPC `auth.xai.*` router wiring XaiAuthFlowService + XaiCredentialsService into 4 adminProcedure procedures*
*Wave: 2 (consumes Wave 1's 195-01 + 195-02 services)*
*Completed: 2026-05-22*
