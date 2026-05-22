---
phase: 196-onboarding-completion-installer-locale
plan: 01
subsystem: livinityd-boot
tags: [livinityd, xai-auth, dependency-injection, trpc, phase-195-followup, di-wireup]

requires:
  - phase: 195-01
    provides: XaiAuthFlowService class with start / waitForCompletion / abort / hasActiveFlow
  - phase: 195-02
    provides: XaiCredentialsService class with getStatus / clear / getToken + event surface
  - phase: 195-03
    provides: createXaiAuthRouter({flowService, credsService}) factory + xaiAuth slot in createAppRouter
provides:
  - Module-scope production singletons XaiAuthFlowService + XaiCredentialsService inside livinityd.start()
  - Production wire-up of createXaiAuthRouter({...}) through createAppRouter `xaiAuth:` slot
  - Graceful no-op shim fallback when XaiCredentialsService constructor throws (fail-open per 196-CONTEXT.md)
  - Three vitest assertions regression-locking the DI wire-up contract at module-construction level
affects: [196-02, 196-03, 196-04, 196-05]

tech-stack:
  added: []  # zero new npm deps — uses only stdlib + existing tRPC + existing vitest
  patterns:
    - "Module-scope singletons constructed inside the chromeMaster try/catch — same defensive boundary classified non-fatal so boot continues if subsystem fails"
    - "Fail-open shim: type-asserted no-throw object replaces real XaiCredentialsService when ctor throws so first-time auth.xai.start remains callable on a fresh box"
    - "vi.mock('drivelist') at vitest module level — transitive native binding has no Windows prebuild; mock affects test execution only, production runs on Linux"
    - "Test asserts createCaller.auth.xai.start() end-to-end (not internal _def.procedures inspection) so the assertion is bound to the consumer contract, not the tRPC v11 internal shape"

key-files:
  created:
    - livos/packages/livinityd/source/modules/server/trpc/__tests__/xai-auth-di-wireup.test.ts
  modified:
    - livos/packages/livinityd/source/index.ts

key-decisions:
  - "Construction goes INSIDE the existing streaming/chromeMaster try/catch block so subsystem failures are non-fatal — matches the 'boot continues' contract for streaming + WebApp manager"
  - "this.logger.error (not .warn) used for degradation message: livinityd's logger surface only exposes log/verbose/error; this is the same channel the surrounding try/catch uses for streaming failures"
  - "Shim shape returns {connected: false, reason: 'credentials-service-uninitialized'} so a misconfigured environment can never produce a false-positive connected state (T-196-01-04 mitigation)"
  - "Test imports use await import() after vi.mock('drivelist') so the mock is registered before the heavy createAppRouter module graph loads"
  - "Three assertions cover: slot wire-up (createCaller.auth.xai.start works), back-compat (default Proxy still constructs), graceful degradation (broken credsService doesn't break flowService.start)"

requirements-completed: []

duration: ~3min
completed: 2026-05-22
---

# Phase 196 Plan 01: livinityd XAI DI Wire-Up Summary

**Module-scope `XaiAuthFlowService` + `XaiCredentialsService` singletons constructed inside `livinityd.start()` and threaded through `createXaiAuthRouter({flowService, credsService})` into `createAppRouter` via the `xaiAuth:` slot — closes Phase 195 HUMAN-UAT #1 (the empty-injection Proxy that returned HTTP 500 `emptyInjectionStub` on live `POST /trpc/auth.xai.start` 2026-05-22 Mini PC probe).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-22T10:37:26Z
- **Completed:** 2026-05-22T10:40:02Z
- **Tasks:** 2/2
- **Files created:** 1
- **Files modified:** 1

## Task Commits

Each task committed atomically:

1. **Task 1: Construct singletons + extend createAppRouter call site** — `6a9820c8` (feat)
   - `livos/packages/livinityd/source/index.ts` — 3 new imports (XaiAuthFlowService + XaiCredentialsService + createXaiAuthRouter) + 1 try-wrapped construction block (35 lines including the Phase 196-01 rationale comment) + 1 createAppRouter argument added + 1 webappLogger.info line
   - Diff: +57 / -0
2. **Task 2: Vitest proving the DI wire-up at module-construction level** — `6e3f2813` (test)
   - `livos/packages/livinityd/source/modules/server/trpc/__tests__/xai-auth-di-wireup.test.ts` — 158 LOC, 3 PASS / 0 FAIL in 3.01s
   - Three vitest assertions cover: (a) createAppRouter mounts auth.xai.start as a callable procedure when xaiAuth slot is supplied (end-to-end caller.auth.xai.start() call exercised); (b) createAppRouter without xaiAuth slot still constructs (back-compat regression guard for the Phase 195-03 empty-injection Proxy default); (c) credsService that throws from getStatus does NOT prevent flowService.start from resolving (graceful-degradation regression lock per 196-CONTEXT.md fail-open decision)

## Acceptance Criteria Audit

| Criterion | Result |
|-----------|--------|
| `grep -c "new XaiAuthFlowService()" livos/packages/livinityd/source/index.ts` → 1 | 1 ✓ |
| `grep -c "new XaiCredentialsService()" livos/packages/livinityd/source/index.ts` → 1 | 1 ✓ |
| `grep -c "createXaiAuthRouter({" livos/packages/livinityd/source/index.ts` → 1 | 1 ✓ |
| `grep -cE "xaiAuth:\s*xaiAuthRouterProductionInstance" livos/packages/livinityd/source/index.ts` → 1 | 1 ✓ |
| `grep -c "Phase 196-01" livos/packages/livinityd/source/index.ts` → ≥ 2 | 3 ✓ (import comment + construction block header + webappLogger.info) |
| `tsc --noEmit` on livinityd produces zero NEW errors attributable to source/index.ts | 0 source/index.ts errors after final state ✓ |
| `bash scripts/verify-sacred-sha.sh` exits 0 (sacred SHA + sudoers fragment SHA both byte-identical) | PASS 20/20 files ✓ |
| Vitest 3 PASS / 0 FAIL on new test file | 3 PASS ✓ |
| `grep -c "Phase 196-01" xai-auth-di-wireup.test.ts` → ≥ 1 | 2 ✓ |
| Test file contains exact "createAppRouter mounts auth.xai.start" string | 2 matches ✓ (describe block + first test name) |

All 10 acceptance criteria PASS.

## Vitest Output (Task 2)

```
 RUN  v2.1.9 livos/packages/livinityd
 ✓ source/modules/server/trpc/__tests__/xai-auth-di-wireup.test.ts > Phase 196-01 — XAI auth DI wire-up > createAppRouter mounts auth.xai.start as a callable procedure when xaiAuth is supplied
 ✓ source/modules/server/trpc/__tests__/xai-auth-di-wireup.test.ts > Phase 196-01 — XAI auth DI wire-up > createAppRouter without xaiAuth slot still type-checks (default Proxy stub remains)
 ✓ source/modules/server/trpc/__tests__/xai-auth-di-wireup.test.ts > Phase 196-01 — XAI auth DI wire-up > credsService that throws from getStatus does NOT prevent flowService.start from resolving

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  3.01s
```

## tsc Diff Output

`cd livos/packages/livinityd && npx tsc --noEmit -p tsconfig.json` filtered for source/index.ts and the new test file:

```
(no errors attributable to either changed file)
```

Pre-existing TS errors elsewhere in the package (user/routes.ts, widgets/routes.ts, webapps/trpc-router.ts, etc. — documented in Phase 195-03 SUMMARY as 307 pre-existing) remain unchanged.

## Sacred SHA Fingerprints (pre/post)

| When | sdk-agent-runner.ts | Other tracked SHAs |
|------|---------------------|--------------------|
| Pre-Task 1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | 20/20 files verified ✓ |
| Post-Task 1 commit (`6a9820c8`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | 20/20 files verified ✓ (pre-commit hook PASS) |
| Post-Task 2 commit (`6e3f2813`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | 20/20 files verified ✓ (pre-commit hook PASS) |

Sacred SHA preserved byte-identically across both commits.

## Decisions Made

See `key-decisions` frontmatter block. Summary:

- **Singletons inside the existing chromeMaster try/catch.** The same defensive boundary used for streaming subsystem + WebAppWindowManager initialization. Failures classify as "non-fatal — boot continues" — livinityd still serves the rest of its tRPC namespace even if xAI auth setup hits an edge case (e.g. opencode binary not installed when XaiAuthFlowService later spawns it).
- **Inner try/catch around `new XaiCredentialsService()` specifically.** Per 196-CONTEXT.md fail-open decision: on a fresh Mini PC, the auth.json directory may not exist yet when livinityd boots for the first time. If the credentials service ctor throws (any FS error), build a no-throwing shim that returns `{connected: false}` so the UI surfaces "not yet connected" instead of crashing, and so first-time `auth.xai.start` (the path that bootstraps auth.json) remains reachable.
- **`this.logger.error` instead of `this.logger.warn`.** The livinityd Logger interface only exposes `log` / `verbose` / `error`. `.warn` does not exist. Using `.error` matches the surrounding try/catch's degradation channel (line 866 — `Failed to start streaming subsystem / WebAppWindowManager`).
- **`vi.mock('drivelist')` at test top.** `createAppRouter` transitively imports the migration router which imports the `drivelist` npm package (native binding). On Windows dev boxes there is no prebuild for the installed Node version, so the import fails at load time. The mock returns `{list: async () => []}` so the import succeeds; production livinityd runs on Linux Mini PC where drivelist has a working binding.
- **Test exercises `caller.auth.xai.start()` end-to-end** rather than inspecting `_def.procedures`. The internal tRPC v11 shape varies across versions; binding the assertion to the consumer-facing path is the stable contract.

## Deviations from Plan

**Total deviations: 2 (1 Rule 3 fix for logger surface, 1 Rule 3 fix for Windows-dev-environment test loadability).**

### Rule 3 - Blocking issue: logger has no .warn method

**Found during:** Task 1 tsc verification
**Issue:** Plan's <action> block called `this.logger.warn(...)` for the degradation message but the livinityd Logger interface (`source/modules/utilities/logger.ts`) only exposes `log / verbose / error`. tsc reported `Property 'warn' does not exist on type ...`.
**Fix:** Switched to `this.logger.error(...)` with a comment documenting that this matches the surrounding try/catch's degradation channel (line 866 — `Failed to start streaming subsystem / WebAppWindowManager`).
**Files modified:** `livos/packages/livinityd/source/index.ts`
**Commit:** `6a9820c8` (rolled into Task 1)

### Rule 3 - Blocking issue: drivelist native binding fails on Windows dev box

**Found during:** Task 2 vitest first run
**Issue:** Test imported `createAppRouter` from `../index.js` which transitively pulls migration router → drivelist npm package. drivelist needs a native `.node` binary; no Windows prebuild for the installed Node version meant the test load failed with `Could not locate the bindings file` before any assertion ran.
**Fix:** Added `vi.mock('drivelist', () => ({default: {list: async () => []}}))` at module top, then `await import(...)` of the three needed modules. Mock is test-execution-only — production livinityd boots on Linux where drivelist has a working binding.
**Files modified:** `livos/packages/livinityd/source/modules/server/trpc/__tests__/xai-auth-di-wireup.test.ts`
**Commit:** `6e3f2813` (rolled into Task 2)

Both deviations are auto-fixes per Rule 3 — they prevent completing the task and have no substantive impact on the contract. Neither changes runtime behavior on the production Mini PC.

## Issues Encountered

- Two blocking issues, both resolved inline as Rule 3 fixes (see Deviations above). No checkpoint required.

## User Setup Required

None at executor time. At runtime on Mini PC:

- `bash /opt/livos/update.sh` will deploy this change.
- After deploy, `journalctl -u livos.service -n 100 | grep "Phase 196-01"` should show: `Phase 196-01 — xAI auth router wired (auth.xai.start now serves real opencode flows, not emptyInjectionStub)`.
- Live curl probe (operator UAT — Phase verifier executes this, NOT this executor): `curl -X POST http://127.0.0.1:8080/trpc/auth.xai.start?batch=1 -H "Authorization: Bearer <admin-JWT>" -H "Content-Type: application/json" -d '{"0":{"json":null}}'` should return HTTP 200 with `{flowId, url}` in the body (NOT 500 emptyInjectionStub).

## Next Phase Readiness

- Phase 195 HUMAN-UAT #1 unblocked: real opencode device-code flow is now reachable via the production tRPC surface.
- Plan 196-02 (`install.sh` idempotent installer) is the next gate — until opencode binary lands on Mini PC, `auth.xai.start` will return `OpencodeNotInstalledError` from the FlowService rather than HTTP 500. That's the expected next failure mode per the live runtime evidence block in 196-CONTEXT.md ("`which opencode = not-found`").
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved byte-identically across both Plan 196-01 commits.
- D-NO-NEW-DEPS upheld: `git diff` of both commits shows zero `package.json` / `pnpm-lock.yaml` changes.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/index.ts` MODIFIED — 3 imports added + construction block + xaiAuth slot + logger.info line
- [x] `livos/packages/livinityd/source/modules/server/trpc/__tests__/xai-auth-di-wireup.test.ts` FOUND (NEW, 158 LOC, 3 PASS)
- [x] commit `6a9820c8` (Task 1) FOUND in `git log`
- [x] commit `6e3f2813` (Task 2) FOUND in `git log`
- [x] Vitest 3/3 PASS for `xai-auth-di-wireup.test.ts`
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (pre-commit hook PASS 2/2 — 20 files each)
- [x] `grep -c "new XaiAuthFlowService()" source/index.ts` = 1
- [x] `grep -c "new XaiCredentialsService()" source/index.ts` = 1
- [x] `grep -c "createXaiAuthRouter({" source/index.ts` = 1
- [x] `grep -cE "xaiAuth:\s*xaiAuthRouterProductionInstance" source/index.ts` = 1
- [x] `grep -c "Phase 196-01" source/index.ts` = 3 (≥ 2)
- [x] tsc on changed files: zero NEW errors
- [x] D-NO-NEW-DEPS: package.json / pnpm-lock.yaml diff empty across both commits
- [x] Deleted-module grep (cc-pty / claude-runner / livinity-broker / vault-items / computer-use / autonomous-scheduler / AI Chat) ZERO matches in changed files

---
*Phase: 196-onboarding-completion-installer-locale*
*Plan: 01 — livinityd XAI DI wire-up (closes Phase 195 HUMAN-UAT #1)*
*Completed: 2026-05-22*
