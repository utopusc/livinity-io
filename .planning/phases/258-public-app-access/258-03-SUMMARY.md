---
phase: 258-public-app-access
plan: 03
subsystem: apps + security (server-side public-access enforcement)
tags: [public-access, never-public, trpc, caddy-regen, fail-closed, owner-or-admin, docker-sock, daemon-bearer]

# Dependency graph
requires:
  - phase: 258-01
    provides: "resolvePublicAccess + PublicAccessConfig/PublicAccessInstallSetting types + SubdomainConfig.publicAccess? field"
provides:
  - "apps/public-forbidden.ts — isPublicForbidden(signals) the ONE never-public policy (load-bearing: neverPublic/requiresLocalAiClis/daemon-bearer; defense-in-depth: compose docker.sock/privileged/host-net) + effectivePublicAccess() pure composition"
  - "apps.ts — getPublicAccessSetting/setPublicAccessSetting (Redis sibling key), getPublicForbiddenSignals, computeEffectivePublicAccess (fail-closed re-assert), registerAppSubdomain threads SubdomainConfig.publicAccess"
  - "apps.setPublicAccess tRPC mutation (owner-or-admin gate + 403 forbidden + runtime Caddy regen) + apps.getPublicAccess query (resolved config + forbidden reason + suggested paths)"
affects:
  - "258-02 (Caddy emit) consumes the threaded SubdomainConfig.publicAccess this plan now writes"
  - "258-04 (Share dialog UI) consumes apps.getPublicAccess (forbidden+reason+suggestedPaths) + apps.setPublicAccess — the UI lock is cosmetic; THIS plan is the real enforcement"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ONE source of truth predicate (isPublicForbidden) imported by BOTH the API gate (routes.ts) and the regen wiring (apps.ts) — single policy, two call sites"
    - "Load-bearing vs defense-in-depth signal taxonomy: the 257 sanitizer strips compose signals at install, so manifest flags + daemon bearer carry the real guarantee (NOTE-2)"
    - "Fail-closed re-assert: computeEffectivePublicAccess re-runs isPublicForbidden on EVERY regen so a stale/forged Redis setting can never make a forbidden app public (T-258C-03)"
    - "Owner-or-admin authority: getUserAppInstance ownership OR admin role; legacy single-user (no currentUser) = admin (mirrors install gate convention routes.ts:218)"
    - "SubdomainConfig-adjacent Redis sibling key (livos:apps:public-access:<appId>) for the per-install toggle, round-trips alongside the subdomain like upstreamBearer"

key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/public-forbidden.ts
    - livos/packages/livinityd/source/modules/apps/public-forbidden.test.ts
    - livos/packages/livinityd/source/modules/apps/routes-public-access.test.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/apps.ts
    - livos/packages/livinityd/source/modules/apps/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "isPublicForbidden checks LOAD-BEARING first (never-public → local-ai-clis → daemon-bearer) then DEFENSE-IN-DEPTH (docker-sock → privileged → host-network) for a deterministic, load-bearing-first reason"
  - "Compose scan mirrors compose-sanitizer.ts:134/140/176-185 predicate shapes inline (cross-referenced in code) rather than importing a shared helper — the sanitizer's helpers are private + do appDataDir containment we don't need; mirroring avoids drift via the cross-ref comment"
  - "effectivePublicAccess (the regen decision) lives in public-forbidden.ts (my file) and composes isPublicForbidden + resolvePublicAccess — keeps the never-public re-assert co-located with the policy"
  - "Public-access setting on a Redis sibling key (not a field on the SubdomainConfig entry) so it survives set-before-register and a stale value is independently inspectable; the fail-closed re-assert makes a stale non-none value harmless"
  - "Disabling (mode 'none') is always allowed in setPublicAccess (no forbidden check) — removing public access must never be blocked"

patterns-established:
  - "Server-side spine pattern: 403 at the mutation BEFORE persist/regen + re-assert at the regen layer (two independent fail-closed checkpoints) — the UI lock is cosmetic"
  - "getPublicForbiddenSignals (public on Apps) reads the daemon bearer + manifest + compose so the route layer never touches the private readAppDaemonToken — one forbidden-input builder shared by both call sites"

requirements-completed: [PUB-C]

# Metrics
duration: ~13min
completed: 2026-06-03
---

# Phase 258 Plan 03: Public-Access Hard Guardrails (Server-Side Spine) Summary

**isPublicForbidden — the ONE never-public policy (load-bearing manifest/daemon signals + defense-in-depth compose backstop) — enforced at BOTH the setPublicAccess 403 gate AND every Caddy regen (fail-closed), so a forbidden OpenDesign/OpenHands/Portainer-class app can never be made public even with a forged config.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-03T21:29:00Z
- **Completed:** 2026-06-03T21:40:00Z
- **Tasks:** 3 (all TDD: RED → GREEN)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `isPublicForbidden(signals)` — the single never-public predicate, imported by BOTH `routes.ts` (the 403 API gate) and `apps.ts` (the regen re-assert). Load-bearing triggers (neverPublic / requiresLocalAiClis / daemon-bearer — NOT stripped by the 257 sanitizer) are the primary guard; compose docker.sock/privileged/host-net are documented defense-in-depth (NOTE-2 / Test 9).
- `setPublicAccess` tRPC mutation rejects a forbidden app with `TRPCError FORBIDDEN` (403) BEFORE any persist/regen, and gates non-owner-non-admin callers; owner/admin can set paths/whole-app/none on a clean app with a runtime Caddy regen + returned `publicUrl`.
- `computeEffectivePublicAccess` re-runs `isPublicForbidden` on EVERY `registerAppSubdomain` (every regen) — fail-closed against a stale/forged Redis setting, so a forbidden app never reaches a public emit.
- `getPublicAccess` query exposes the resolved config + forbidden reason + suggested paths for the 258-04 UI lock.

## Task Commits

1. **Task 1: public-forbidden.ts — the ONE source of truth** - `22951ae7` (feat) — 11 vitest tests
2. **Task 2: persist + thread SubdomainConfig.publicAccess (fail-closed)** - `42b34a37` (feat) — +6 tests (17 total in public-forbidden.test.ts)
3. **Task 3: setPublicAccess/getPublicAccess tRPC — owner-or-admin + 403 + regen** - `dc123d8f` (feat) — 8 vitest tests (routes-public-access.test.ts)

_TDD: each task wrote a failing test first (RED), then implementation (GREEN). Tests + impl committed together per task (single atomic commit) since the pure predicate + its test are one logical unit._

## Files Created/Modified
- `apps/public-forbidden.ts` (created) — `isPublicForbidden` + `PublicForbiddenReason`/`PublicForbiddenSignals` + `effectivePublicAccess` pure composition; top-of-file NOTE-2 doc (load-bearing vs defense-in-depth); compose scan cross-refs compose-sanitizer.ts:134/140/176-185.
- `apps/public-forbidden.test.ts` (created) — 17 tests: 9 plan tests (incl. Test 9 sanitized-compose still-forbidden) + 2 edge cases + 6 effectivePublicAccess composition tests.
- `apps/routes-public-access.test.ts` (created) — 8 tests for setPublicAccess (forbidden load-bearing→403, forbidden docker.sock defense-in-depth→403, non-owner→403, owner allowed, admin allowed, disable allowed) + getPublicAccess (forbidden+reason+suggestedPaths, clean app resolved).
- `apps/apps.ts` (modified) — `REDIS_PUBLIC_ACCESS_PREFIX`; get/setPublicAccessSetting; getPublicForbiddenSignals (public); buildPublicForbiddenSignals; computeEffectivePublicAccess (fail-closed); registerAppSubdomain spreads `...(publicAccess ? {publicAccess} : {})` into newSub.
- `apps/routes.ts` (modified) — setPublicAccess mutation + getPublicAccess query in the `apps` router.
- `server/trpc/common.ts` (modified) — `apps.setPublicAccess` + `apps.getPublicAccess` added to httpOnlyPaths.

## Decisions Made
See `key-decisions` frontmatter. Notably: the compose-signal scan is mirrored inline (not imported) from compose-sanitizer.ts with a cross-reference comment to prevent drift — the sanitizer's `bindHostSide`/`isUnder` helpers are private and do appDataDir-containment we don't need (we only need "is this the docker socket"). The `effectivePublicAccess` regen decision was placed in public-forbidden.ts (my file) rather than 258-01's public-access.ts so the never-public re-assert stays co-located with the policy and 258-01's shipped file is untouched.

## Deviations from Plan

None — plan executed exactly as written.

Notes (not deviations):
- **Router name:** the plan's anchors say "routes.ts" generically; the app procedures (shareApp/sharedUsers and now setPublicAccess/getPublicAccess) live in the `export const apps = router({...})` router (line 64+), NOT the `appStore` repo-management router (line 30-62). My test initially imported `appStore` → "No procedure found"; corrected to import `apps`. The httpOnlyPaths entries are correctly `apps.*` (the `apps` router is mounted under the `apps` namespace).
- **Test runner:** new tests use vitest (`describe/it/expect`) to match public-access.test.ts and the verify command. The sibling `common.test.ts` uses `node:test` and reports "no test suite found" under vitest but self-asserts + PASSES 18/18 when run via `tsx --test` (confirmed unbroken by the httpOnlyPaths addition). Same node:test-vs-vitest situation 258-01 documented.
- **Task 2 verify:** the plan's verify falls back to public-forbidden.test.ts when apps.test.ts is absent (it is). The apps.ts wiring (computeEffectivePublicAccess / registerAppSubdomain) is unit-covered via the pure `effectivePublicAccess` composition (6 tests, incl. the sanitized-compose daemon-bearer re-assert) — testing the class method directly would require a full Livinityd/Redis harness that does not exist; the pure helper is the load-bearing decision.

## Issues Encountered
- **tsc "possibly undefined" noise:** `tsc -p packages/livinityd --noEmit` reports ~52 `ctx.apps/ctx.appStore/ctx.livinityd possibly undefined` (TS18048) errors blanketing routes.ts AND a `Type 'true' is not assignable to 'false'` error. Confirmed PRE-EXISTING via a `git stash` baseline of routes.ts: the baseline has the identical 52 undefined-errors + the same type error (at line 157, shifted to 160 by my +3 import lines). My additions follow the exact same `ctx.apps.*` pattern every other procedure uses → ZERO new tsc errors. apps.ts likewise: the 3 `string|Buffer` errors (lines 197/198/237) are pre-existing (baseline 186/187/226, shifted by my added const/import lines). public-forbidden.ts / public-access.ts / common.ts: clean.

## TDD Gate Compliance
All three tasks are `type: tdd`. Each wrote its test first (verified RED — e.g. Task 1 `Cannot find module './public-forbidden.js'`; Task 3 `No procedure found`), then implementation (GREEN). Test + impl committed in one atomic `feat(...)` commit per task (the pure predicate and its test are a single logical unit; no separate `test(...)` commit). All 35 tests across the 4 touched test files pass.

## User Setup Required
None - no external service configuration required. Mini PC only; NO deploy performed this plan.

## Next Phase Readiness
- **258-02 (Caddy emit):** consumes `SubdomainConfig.publicAccess` which this plan now writes via `registerAppSubdomain`. The carve-out emit is 258-02's job; the field is populated only for clean apps with a non-none persisted setting (forbidden + no-setting apps stay `undefined` → fully-gated 256-04 block).
- **258-04 (Share dialog UI):** consumes `apps.getPublicAccess` (`forbidden` + `reason` + `suggestedPaths` + resolved `mode/paths/hasOwnAuth` + `publicUrl`) and `apps.setPublicAccess`. The UI lock is cosmetic — the server already rejects forbidden apps with 403 and re-asserts at every regen, so a UI bug cannot expose a forbidden app.
- **Confirmation:** forbidden apps are rejected server-side at BOTH the API layer (setPublicAccess → 403 before persist/regen) AND the caddy-regen layer (computeEffectivePublicAccess re-asserts isPublicForbidden on every registerAppSubdomain → forbidden forces `publicAccess` undefined regardless of any persisted/forged setting). Fail-closed on both checkpoints.

## Self-Check: PASSED

All 4 created files verified on disk (public-forbidden.ts, public-forbidden.test.ts, routes-public-access.test.ts, 258-03-SUMMARY.md) and all 3 task commits (`22951ae7`, `42b34a37`, `dc123d8f`) present in git history. `isPublicForbidden` imported by BOTH routes.ts and apps.ts (verified via grep — single policy, two call sites). 35 tests pass across the 4 touched test files; zero NEW tsc errors (confirmed against `git stash` baselines of apps.ts + routes.ts).

---
*Phase: 258-public-app-access*
*Completed: 2026-06-03*
