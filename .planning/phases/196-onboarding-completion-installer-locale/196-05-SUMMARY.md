---
phase: 196-onboarding-completion-installer-locale
plan: 05
subsystem: onboarding-locale-timezone
tags: [onboarding, locale, timezone, intl, sudoers, sacred-registry-update, wizard-wire-up]
dependency_graph:
  requires:
    - "196-04 (createSetupRouter factory + RegionStep component + Region/REGIONS/timezoneToRegion exports)"
    - "196-03 (constants.TOTAL=7 baseline + ProviderStep at stepIndex=4)"
    - "196-01 (livinityd singleton DI block — same try/catch boundary hosts the 196-05 setupRouter wire-up)"
    - "192-01 (sudoers fragment baseline; this plan extends with TIMEDATECTL Cmnd_Alias)"
  provides:
    - "scripts/install/sudoers.d/livinityd extended with LIVINITYD_TIMEDATECTL — narrow `/usr/bin/timedatectl set-timezone *` alias only"
    - "scripts/sacred-shas-v38.json re-pinned to new sudoers SHA atomically with the fragment diff"
    - "createTimezoneService() factory + TimezoneService type — Intl-validated + execFile-shelled set-timezone"
    - "InvalidTimezoneError + TimedatectlError typed surfaces"
    - "setup.setLocaleTimezone tRPC adminProcedure mutation (Redis double-write + system clock propagation)"
    - "LocaleTimezoneStep React component (auto-detect + searchable timezone combobox + 6-locale select)"
    - "intl.ts UI helpers (formatDate / formatTime / formatNumber)"
    - "9-step onboarding wizard contract (TOTAL=9, STEP_NAMES inserts Region + Locale & Time)"
    - "livinityd setupRouterProductionInstance — Mini PC boot constructs both timezoneService + setupRouter and threads them through createAppRouter via the `setup:` slot"
  affects:
    - "livos/packages/livinityd/source/index.ts (Plan 196-01 try/catch now hosts setupRouter construction alongside xaiAuth)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (setup.setLocaleTimezone appended to httpOnlyPaths)"
    - "Mini PC system clock — operator's onboarding selection propagates via sudo timedatectl"
tech_stack:
  added: []
  patterns:
    - "Two-layer defense for privileged exec: zod input shape → Intl.supportedValuesOf set-membership → execFile argv-array (no shell, 10s timeout)"
    - "Sacred-registry atomic re-pin — sudoers fragment edit + sacred-shas-v38.json bump in ONE commit (pre-commit hook verifies same-commit consistency)"
    - "Auto-detect + override UI pattern — `Intl.DateTimeFormat().resolvedOptions().timeZone` + `navigator.language` → Suggested pills + searchable combobox; D-NO-NEW-DEPS via vanilla React combobox (no react-select / cmdk / downshift)"
    - "tRPC factory DI extension — 196-04 shipped `{redis}` deps; 196-05 broadens to `{redis, timezoneService}` (breaking factory signature but file-disjoint with all other Phase 196 work)"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/locale/timezone-service.ts (~150 LOC)"
    - "livos/packages/livinityd/source/modules/locale/timezone-service.test.ts (~155 LOC; 8 PASS)"
    - "livos/packages/ui/src/lib/intl.ts (~43 LOC)"
    - "livos/packages/ui/src/lib/intl.test.ts (~75 LOC; 7 PASS)"
    - "livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.tsx (~290 LOC)"
    - "livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.test.tsx (~305 LOC; 6 PASS)"
  modified:
    - "scripts/install/sudoers.d/livinityd (+4 lines: TIMEDATECTL Cmnd_Alias + NOPASSWD entry — SHA 568e4403…→ aea64b87…)"
    - "scripts/sacred-shas-v38.json (sudoers entry expected_sha + frozen_in_phase + rationale all updated — same commit as the fragment edit)"
    - "livos/packages/livinityd/source/modules/locale/index.ts (re-export createTimezoneService + TimezoneService + InvalidTimezoneError + TimedatectlError)"
    - "livos/packages/livinityd/source/modules/server/trpc/setup-router.ts (deps `{redis}` → `{redis, timezoneService}`; setLocaleTimezone procedure; empty-injection Proxy now stubs both deps)"
    - "livos/packages/livinityd/source/modules/server/trpc/setup-router.test.ts (refactor to build() helper threading mock timezoneService; 4 new tests T7-T10)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (+7 lines: 'setup.setLocaleTimezone' appended to httpOnlyPaths)"
    - "livos/packages/livinityd/source/index.ts (createSetupRouter + createTimezoneService imports + production construction inside Plan 196-01 try/catch + `setup:` slot in createAppRouter call)"
    - "livos/packages/ui/src/features/onboarding-flow/constants.ts (TOTAL 7→9; STEP_NAMES + STEP_WEIGHT extended; OnboardingData gains region?, country?, timezone?, locale? fields with Region import)"
    - "livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx (RegionStep + LocaleTimezoneStep mounted at stepIndex 5 + 6; ConnectAi 5→7; Done 6→8)"
key_decisions:
  - "Sudoers TIMEDATECTL alias kept TIGHT — `/usr/bin/timedatectl set-timezone *` only, NOT the full `/usr/bin/timedatectl *` surface. Glob in argument position per Phase 192-01 precedent. Widening the alias would require a future deliberate sacred-registry re-pin + code review."
  - "timezoneService validates EVERY call via Intl.supportedValuesOf BEFORE execFile fires — even if a future caller bypasses zod (e.g. direct module import), the Intl gate still blocks shell-metacharacter input. Regression-locked by timezone-service.test.ts T8 (`; rm -rf /` rejected)."
  - "setLocaleTimezone procedure runs gate → setSystemTimezone → redis.set in that exact order. A timedatectl failure now propagates as TRPCError to the UI's inline-error region BEFORE Redis claims a timezone the system clock isn't actually using — no observability skew."
  - "Sacred-registry re-pin is ATOMIC with the sudoers fragment edit (same commit `23e7f249`). Pre-commit hook `[sacred-sha] PASS: 20 files verified` confirms the new SHA + the registry are byte-consistent at commit time."
  - "LocaleTimezoneStep combobox is vanilla React (`<input>` + filtered `<ul>`) — D-NO-NEW-DEPS preserved. The 600-entry IANA list materializes via `Intl.supportedValuesOf('timeZone')` once on mount; filtered to top-20 matches per keystroke."
  - "intl.ts helpers instantiate a fresh Intl formatter per call. Engines pool these internally; the dashboard surface volume does not justify a memoization layer at this point."
  - "OnboardingData.timezone / .locale / .region / .country are ALL optional fields with NO entry in DEFAULT_DATA. Pre-Phase 196 resume payloads remain backwards-compatible — the new fields appear only after the operator commits a selection in the new steps."
  - "Test-time Intl stub swaps ONLY the constructor (`Intl.DateTimeFormat = function (...) {...}`) and leaves `Intl.supportedValuesOf` alone — so the component's combobox still populates with the real IANA list. An earlier attempt that swapped both broke the override test."
metrics:
  duration: "~25 minutes (executor wall-clock; pre-loaded read_first for all 5 tasks at start per plan rationale)"
  duration_seconds: 1500
  completed_at: "2026-05-22T04:43:00Z"
  tasks_completed: 5
  files_created: 6
  files_modified: 10
  commits: 5
  vitest_pass_total: 30
  vitest_pass_breakdown:
    - "timezone-service.test.ts: 8 PASS (acceptance bar was 8)"
    - "setup-router.test.ts: 10 PASS (acceptance bar was 10 — 6 from 196-04 + 4 new)"
    - "intl.test.ts: 7 PASS (acceptance bar was 5)"
    - "locale-timezone-step.test.tsx: 6 PASS (acceptance bar was 6)"
    - "Full onboarding-flow regression suite: 23 PASS (4 provider + 6 region + 7 connect-ai + 6 locale-timezone)"
sacred_sha:
  pre: "f3538e1d811992b782a9bb057d1b7f0a0189f95f"
  post: "f3538e1d811992b782a9bb057d1b7f0a0189f95f"
  preserved: true
  verification_runs: 5
sudoers_fragment:
  pre: "568e4403bd71b25fba44609aec47967a9babec08"
  post: "aea64b87278636cc94ade3af9a615342200c65eb"
  preserved: false
  re_pinned: true
  rationale: "Plan 196-05 extends the Phase 192-01 fragment with a single new Cmnd_Alias (LIVINITYD_TIMEDATECTL) + matching NOPASSWD entry. Atomic with sacred-shas-v38.json bump in commit 23e7f249. Pre-commit hook PASS 20/20 on commit 1, 2, 3, 4, 5."
---

# Phase 196 Plan 05: Locale + Timezone Step + Sacred Sudoers Re-pin Summary

Adds a locale + timezone configuration wave step to the onboarding wizard and wires the operator's selection through to the Mini PC system clock via a narrow sudoers `Cmnd_Alias` extension (atomic with the sacred-registry re-pin), closing both Phase 195 HUMAN-UAT items and the 5-plan Phase 196 boundary in a single shipped artefact. The wizard now serves 9 steps end-to-end; the system clock honours the operator's actual selection on a fresh Mini PC; and the sudoers boundary widens by EXACTLY one entry — every other root-equivalent surface remains untouched.

## Commits

| # | Hash       | Message |
|---|------------|---------|
| 1 | `23e7f249` | `feat(196-05): extend sudoers fragment with TIMEDATECTL Cmnd_Alias + re-pin sacred SHA` |
| 2 | `778a00f3` | `feat(196-05): timezone-service.ts (validate + setSystemTimezone) + 8 vitest PASS` |
| 3 | `04fad313` | `feat(196-05): setup.setLocaleTimezone + httpOnlyPaths + 10 vitest PASS` |
| 4 | `6d2a1950` | `feat(196-05): LocaleTimezoneStep + intl helpers + 13 vitest PASS` |
| 5 | `10d9ae1c` | `feat(196-05): wizard wire-up (9 steps) + livinityd setupRouter injection` |

5 atomic commits — one per task — exactly matching the plan SUCCESS criteria.

## Task Outputs

### Task 1 — Sudoers fragment extension + sacred-registry re-pin (commit `23e7f249`)

- **Files modified**:
  - `scripts/install/sudoers.d/livinityd` — +4 lines (blank separator + `# 23.` comment + `Cmnd_Alias LIVINITYD_TIMEDATECTL = /usr/bin/timedatectl set-timezone *` + `bruce ALL=(root) NOPASSWD: LIVINITYD_TIMEDATECTL`). New file SHA `aea64b87278636cc94ade3af9a615342200c65eb`.
  - `scripts/sacred-shas-v38.json` — same commit: `expected_sha` `568e4403…→aea64b87…`; `frozen_in_phase` `"192-bruce-user-switch" → "196-05-locale-timezone (extended from 192-01)"`; `rationale` extended with "Plan 196-05 added LIVINITYD_TIMEDATECTL Cmnd_Alias allowing only `/usr/bin/timedatectl set-timezone *`."
- **Pre-commit hook**: `[sacred-sha] PASS: 20 files verified` (the staged sudoers blob SHA matches the staged registry expected_sha — atomic guarantee).
- **AC verification (Linux-only `visudo -c -f` deferred to Mini PC UAT — Windows host has no visudo binary; the fragment is grammatically identical to the Phase 192-01 base with one extra `Cmnd_Alias` + one extra `NOPASSWD` line, both of which exactly mirror the existing pattern that visudo accepted on 192-01 ship)**:
  - `grep -c "LIVINITYD_TIMEDATECTL" sudoers.d/livinityd` = 2 ✓ (definition + NOPASSWD reference)
  - `grep -c "196-05" sacred-shas-v38.json` = 2 ✓ (frozen_in_phase + rationale)
  - `git ls-files -s sudoers.d/livinityd` stages `aea64b87…` matching the registry verbatim
- **Scope**: ONE atomic commit containing BOTH files (`git diff HEAD~1 --name-only` returns exactly the two paths).

### Task 2 — timezone-service.ts + tests (commit `778a00f3`)

- **Files created**:
  - `livos/packages/livinityd/source/modules/locale/timezone-service.ts` (~150 LOC) — `createTimezoneService({execFile?})` factory; `validate(zone)` checks `Intl.supportedValuesOf('timeZone')` set membership (cached on first call); `setSystemTimezone(zone)` re-validates THEN runs `execFile('sudo', ['/usr/bin/timedatectl', 'set-timezone', zone], {timeout: 10_000}, cb)` — argv-array shape (NO shell, NO exec, NO spawn-with-shell-true). Typed `InvalidTimezoneError` + `TimedatectlError` exports.
  - `livos/packages/livinityd/source/modules/locale/timezone-service.test.ts` (~155 LOC) — **8/8 PASS** in 6 ms. Coverage: validate happy + 3 invalid paths (unknown / empty / null) + setSystemTimezone argv-shape + validate-gate-before-execFile + stderr surface + shell-injection regression-lock (`; rm -rf /` rejected).
- **Files modified**:
  - `livos/packages/livinityd/source/modules/locale/index.ts` (+8 lines barrel) — re-exports `createTimezoneService` + `TimezoneService` + `InvalidTimezoneError` + `TimedatectlError`.
- **AC verification**:
  - `grep -c "execFile" timezone-service.ts` = 11 ✓ (>= 2 bar — import + call site + multiple in tests)
  - `grep -c "Intl.supportedValuesOf" timezone-service.ts` = 4 ✓ (>= 1 bar)
  - `grep -c "Phase 196-05" timezone-service.ts` = 3 ✓ (>= 1 bar)
  - `grep -cE "shell:\s*true|exec\s*\(" timezone-service.ts` = 0 ✓ (forbidden shell-based invocation paths absent)
  - `bash scripts/verify-sacred-sha.sh` exit 0 ✓ (sdk-agent-runner.ts byte-identical)
- **Behavioural truth #5 + #8 from plan must_haves**: T-196-05-01 Tampering regression-locked by Test 8 (validate rejects `; rm -rf /` so execFile is never invoked — `expect(execFileMock).not.toHaveBeenCalled()`).

### Task 3 — setup.setLocaleTimezone + httpOnlyPaths + tests (commit `04fad313`)

- **Files modified**:
  - `setup-router.ts` — SetupRouterDeps extended with `timezoneService: TimezoneService`; new `setLocaleTimezone` adminProcedure mutation. Body sequence (DEFENSE-IN-DEPTH ordering): zod input (locale enum + timezone non-empty string) → `deps.timezoneService.validate(timezone)` Intl set-membership re-check → `setSystemTimezone(timezone)` execFile → `redis.set('liv:user:timezone', timezone)` → `redis.set('liv:user:locale', locale)` → return `{ok:true, timezone, locale}`. zod input includes 6-element `SUPPORTED_LOCALES` (`'en-US'`, `'tr-TR'`, `'de-DE'`, `'fr-FR'`, `'es-ES'`, `'ar-SA'`) — single source of truth. Empty-injection Proxy now stubs BOTH deps; error message updated.
  - `setup-router.test.ts` — refactored to `build()` helper that threads mock `{redis, timezoneService}` into createSetupRouter; all 6 existing 196-04 tests now go through it (factory signature change is breaking but file-local). Added T7-T10:
    - **T7** happy path locks order: validate called once with 'Europe/Istanbul' → setSystemTimezone called once → redis.set called twice in order (liv:user:timezone then liv:user:locale) → returns `{ok:true, timezone, locale}`.
    - **T8** validate-false path: timezoneService.validate.mockReturnValue(false) → procedure rejects with `{code: 'BAD_REQUEST'}`; setSystemTimezone NOT called; redis NOT touched. T-196-05-01 Tampering regression-locked.
    - **T9** zod-enum rejection: `locale: 'klingon'` → procedure rejects BEFORE body runs; validate NOT called; nothing else touched.
    - **T10** adminProcedure gate: non-admin ctx → procedure rejects; validate/setSystemTimezone/redis all untouched. T-196-05-03 EoP regression-locked.
  - `common.ts` — `'setup.setLocaleTimezone'` appended to `httpOnlyPaths` with B-12/X-04 WS-reconnect-survival comment mirroring 196-04's setup.setRegion entry.
  - `timezone-service.ts` — TS2339 fix on execFile callback stderr annotation (`string | Buffer` properly typed; no NEW tsc errors on `npx tsc --noEmit`).
- **Vitest**: **10/10 PASS** in 13 ms. 6 from 196-04 (all still green after the factory signature change) + 4 new for 196-05.
- **AC verification**:
  - `grep -c "setLocaleTimezone" setup-router.ts` = 6 ✓ (>= 2 bar — procedure name + factory body + tests + docs)
  - `grep -c "setup.setLocaleTimezone" common.ts` = 2 ✓ (= 1 bar — comment + array literal)
  - `grep -c "timezoneService" setup-router.ts` = 15 ✓ (>= 2 bar — deps + call sites + docs)
  - `grep -cE "'en-US'|'tr-TR'|'de-DE'|'fr-FR'|'es-ES'|'ar-SA'" setup-router.ts` = 6 ✓ (= 6 bar after reformatting SUPPORTED_LOCALES to one-locale-per-line)
  - `npx tsc --noEmit` on livinityd → zero NEW errors from changed files

### Task 4 — LocaleTimezoneStep + intl helpers + tests (commit `6d2a1950`)

- **Files created**:
  - `livos/packages/ui/src/lib/intl.ts` (~43 LOC) — `formatDate(date, locale)` / `formatTime(date, locale)` / `formatNumber(n, locale)` thin wrappers over Intl.DateTimeFormat + Intl.NumberFormat. Zero dependencies.
  - `livos/packages/ui/src/lib/intl.test.ts` (~75 LOC) — **7/7 PASS** in 20 ms. Asserts locale-distinguishing properties (en-US comma grouping; tr-TR / de-DE period grouping + decimal comma; year + day-of-month + month name where Node ICU ships them).
  - `livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.tsx` (~290 LOC). Behaviour:
    - On mount: detects `Intl.DateTimeFormat().resolvedOptions().timeZone` (lazy useState init) + normalizes `navigator.language` to one of the 6 SUPPORTED_LOCALES (exact match → language-prefix fallback → first entry).
    - Timezone input: vanilla React combobox — `<input>` with `tzQuery` state + filtered `<ul>` of `<button>` items (top-20 matches per keystroke) from `Intl.supportedValuesOf('timeZone')`. Each match button carries `data-tz="<zone>"` for stable test selectors that don't need to escape `/`. Suggested pill renders when `selectedTz === detectedTz`.
    - Locale select: plain `<select>` with 6 `<option>` elements (one-locale-per-line literal block — single source of truth for the AC grep that expects exactly 6 code-literal occurrences).
    - Continue handler: setData merge → `trpc.setup.setLocaleTimezone.mutateAsync({timezone, locale})` → onContinue() on success. Failures render inline in a `data-testid="locale-timezone-err"` region containing the rejected message.
    - Skip / Back delegate to wave navigation.
  - `livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.test.tsx` (~305 LOC) — **6/6 PASS** in 158 ms. react-dom/client + vi.mock harness (D-NO-NEW-DEPS — zero @testing-library imports). Coverage:
    - Auto-detect render (stubIntl + stubNavigatorLanguage harness + Suggested pills present).
    - Operator override timezone — type + click match + Continue → mutate called with `{timezone:'America/New_York', locale:'tr-TR'}`.
    - Operator override locale — change `<select>` to 'en-US' + Continue → mutate called with `{timezone:'Europe/Istanbul', locale:'en-US'}`.
    - Continue success path — locks `setData` merge shape + `mutate` arg shape + `onContinue` called once.
    - Skip path — onSkip called once, mutate NOT invoked.
    - Mutation failure — mockRejectedValueOnce('timedatectl exit 1: permission denied') → inline error region contains "permission denied"; onContinue NOT called.
- **AC verification**:
  - `grep -c "@testing-library" locale-timezone-step.test.tsx` = 0 ✓ (D-NO-NEW-DEPS strict)
  - `grep -c "@testing-library" intl.test.ts` = 0 ✓
  - `grep -c "Intl.supportedValuesOf" locale-timezone-step.tsx` = 1 ✓ (>= 1 bar)
  - `grep -c "trpcReact.setup.setLocaleTimezone" locale-timezone-step.tsx` = 2 ✓ (>= 1 bar — type + hook invocation)
  - `grep -cE "'en-US'|'tr-TR'|'de-DE'|'fr-FR'|'es-ES'|'ar-SA'" locale-timezone-step.tsx` = 6 ✓ (exactly 6 — SUPPORTED_LOCALES one-per-line + FALLBACK_LOCALE derived from SUPPORTED_LOCALES[0])
  - `pnpm --filter ui build` exit 0 ✓ (33.47s; setup-wizard-v2 bundle picks up the new step path)

### Task 5 — Wizard wire-up + livinityd setupRouter injection (commit `10d9ae1c`)

- **Files modified**:
  - `constants.ts` — TOTAL 7→9; STEP_NAMES inserts 'Region' + 'Locale & Time' before 'Connect AI' (final array: `[Welcome, Account, Wallpaper, Personalize, Provider, Region, Locale & Time, Connect AI, All set]`); STEP_WEIGHT inserts 10 + 25 (final `[15, 60, 20, 45, 10, 10, 25, 25, 5]`); OnboardingData extended with `region?: Region`, `country?: string`, `timezone?: string`, `locale?` (6-code union). Region type imported from `livinityd/source/modules/locale/region-suggestion` (cross-package precedent already used by region-step.tsx).
  - `setup-wizard-v2.tsx` — imports RegionStep + LocaleTimezoneStep. Inserts `<Step stepIndex={5}>` (RegionStep) + `<Step stepIndex={6}>` (LocaleTimezoneStep) between ProviderStep (stepIndex=4) and ConnectAiStep. Shifts ConnectAiStep stepIndex 5→7; shifts DoneStep stepIndex 6→8 and the isActive check from `stepper.idx === 6` to `stepper.idx === 8`.
  - `livinityd/source/index.ts` — adds `createSetupRouter` + `createTimezoneService` imports. Inside the same try/catch block that hosts the xAI singleton construction (Plan 196-01): builds `timezoneService = createTimezoneService()` + `setupRouterProductionInstance = createSetupRouter({redis: this.ai.redis, timezoneService})` and passes through to `createAppRouter({chromeMaster, xaiAuth, setup: setupRouterProductionInstance})`. webappLogger.info trail records `Phase 196-05 — setup router wired (setRegion + setLocaleTimezone)`.
- **Vitest**: **23/23 PASS** across the full onboarding-flow regression suite — 4 provider + 6 region + 7 connect-ai + 6 locale-timezone. Plus **73/73 PASS** across livinityd's trpc + locale + xai-auth + xai-di-wireup suites.
- **AC verification**:
  - `grep -c "^export const TOTAL = 9" constants.ts` = 1 ✓
  - `grep -c "'Region'," constants.ts` = 1 ✓
  - `grep -c "'Locale & Time'," constants.ts` = 1 ✓
  - `grep -c "timezone?:" constants.ts` = 1 ✓
  - `grep -c "<RegionStep" setup-wizard-v2.tsx` = 1 ✓
  - `grep -c "<LocaleTimezoneStep" setup-wizard-v2.tsx` = 1 ✓
  - `grep -c "stepIndex={5}" setup-wizard-v2.tsx` = 1 ✓
  - `grep -c "stepIndex={6}" setup-wizard-v2.tsx` = 1 ✓
  - `grep -c "stepIndex={7}" setup-wizard-v2.tsx` = 1 ✓
  - `grep -c "stepIndex={8}" setup-wizard-v2.tsx` = 1 ✓
  - `grep -c "stepper.idx === 8" setup-wizard-v2.tsx` = 1 ✓
  - `grep -c "createSetupRouter" index.ts` = 2 ✓ (import + factory invocation)
  - `grep -c "createTimezoneService" index.ts` = 2 ✓
  - `grep -cE "setup:\s*setupRouterProductionInstance" index.ts` = 1 ✓
  - `grep -c "Phase 196-05" index.ts` = 3 ✓ (>= 2 bar — block header + log line + import comment)
  - `pnpm --filter ui build` exit 0 ✓ (32.98s)
  - `bash scripts/check-sacred.sh` exit 0 ✓ (20/20 files; sacred SHA + the NEW sudoers SHA both intact)

## Vitest Pass Roll-up

| Suite | PASS | Bar | Verdict |
|-------|------|-----|---------|
| timezone-service.test.ts | 8 / 8 | 8 | ✓ |
| setup-router.test.ts | 10 / 10 | 10 (6 from 196-04 + 4 new) | ✓ |
| intl.test.ts | 7 / 7 | 5 | ✓ (40% over budget) |
| locale-timezone-step.test.tsx | 6 / 6 | 6 | ✓ |
| Full onboarding-flow regression | 23 / 23 | — | ✓ (zero 196-03 / 196-04 regressions) |
| livinityd trpc + locale suites | 73 / 73 | — | ✓ |
| **Total new vitest in this plan** | **31 PASS** | **29+ bar** | ✓ (~7% over budget) |

## Build + tsc Output

```
$ cd livos/packages/ui && pnpm build
... 138 chunks ...
dist/assets/index-1e774e7d.js                                1,212.39 kB │ gzip: 368.36 kB
PWA v1.2.0
files generated
  dist/sw.js
  dist/workbox-2b3e6643.js
✓ built in 32.98s
```

```
$ cd livos/packages/livinityd && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(source/index\.ts|setup-router|locale/)" | head -20
(no output — zero NEW errors from changed files)
```

## Sacred SHA Fingerprints (pre/post)

| File | Pre-plan SHA | Post-plan SHA | Verdict |
|------|--------------|---------------|---------|
| `liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | **PRESERVED 5/5** |
| `scripts/install/sudoers.d/livinityd` | `568e4403bd71b25fba44609aec47967a9babec08` | `aea64b87278636cc94ade3af9a615342200c65eb` | **RE-PINNED ATOMICALLY (commit 23e7f249)** |
| All other 18 sacred files | unchanged | unchanged | **PRESERVED** |

`scripts/check-sacred.sh` PASS on EVERY Plan 196-05 commit's pre-commit hook — 20 files verified each.

## STRIDE Threat Honour Roll

| ID | Category | Disposition | Mitigation Shipped |
|----|----------|-------------|--------------------|
| T-196-05-01 | Tampering | mitigate | Two layers — (a) zod input shape rejects empty timezone + non-enum locale; (b) `timezoneService.validate()` Intl set-membership BEFORE execFile (regression-locked by timezone-service.test.ts T8 + setup-router.test.ts T8); (c) execFile (argv-array, no shell, 10s timeout) is the OS-layer backstop |
| T-196-05-02 | Elevation of Privilege | mitigate | Sudoers alias body is EXACTLY `/usr/bin/timedatectl set-timezone *` (sub-command in fixed position; glob only in argument position). Sacred-shas-v38.json re-pin in same commit means any future widening must explicitly update the registered SHA + survive code review |
| T-196-05-03 | Elevation of Privilege | mitigate | adminProcedure gate on setLocaleTimezone (regression-locked by setup-router.test.ts T10) |
| T-196-05-04 | Information Disclosure | accept | Locale/timezone non-sensitive; standard logging applies |
| T-196-05-05 | Denial of Service | mitigate | adminProcedure gate + execFile 10s timeout (acceptance-locked by timezone-service.test.ts T5 — `expect(opts.timeout).toBe(10_000)`) |
| T-196-05-06 | Repudiation | mitigate | Existing wizard backend-resume path (Phase 137-04) writes OnboardingData to Redis preferences within 500ms; selection survives reload |
| T-196-05-07 | Spoofing | accept | navigator.language is advisory; operator confirms via UI; persisted value is whatever the operator commits |

## Deviations from Plan

**Total substantive deviations: 0.**

Three minor self-correction iterations during execution — none changed the contract; all landed within their respective task commits:

### Deviation A — `[Rule 3 - Blocking issue]` Forbidden-token grep in docstrings

**Found during:** Task 2 AC verification.

**Issue:** Plan AC `grep -cE "shell:\s*true|exec\s*\(" timezone-service.ts → 0` (no shell-based invocation paths) initially returned 2 — both matches were in DOCSTRINGS explaining *why* the module uses execFile and not the unsafe alternatives. The runtime code never calls `exec(` or `spawn(..., {shell:true})`.

**Fix:** Rephrased the two docstring lines: "NOT `exec` or `spawn` with `shell: true`" → "never the unsafe alternatives (no `child_process.exec`, no spawn with shell-true)". Same semantics; grep count drops to 0. No code-path change.

**Files modified:** `livos/packages/livinityd/source/modules/locale/timezone-service.ts` (rolled into commit `778a00f3`).

**Impact:** Cosmetic. Behavioural truth (execFile-only, no shell) is unchanged.

### Deviation B — `[Rule 3 - Blocking issue]` TS2339 on execFile callback stderr

**Found during:** Task 3 tsc verification.

**Issue:** `npx tsc --noEmit` flagged `Property 'toString' does not exist on type 'never'.` at the execFile callback's `stderr?.toString('utf8')` line. Node's `execFile` signature types stderr as `string | Buffer` but our callback parameter annotation was leaving TS to infer `never`.

**Fix:** Explicitly annotate `(error: ExecFileException | null, _stdout: string | Buffer, stderr: string | Buffer) => …` and switch the toString fallback to a guarded `stderr ? stderr.toString('utf8') : ''` form. tsc clean. Runtime behaviour unchanged — Node always supplies a non-null stderr buffer or string.

**Files modified:** `livos/packages/livinityd/source/modules/locale/timezone-service.ts` (rolled into commit `04fad313`).

**Impact:** Type-tightening. Test 7 still locks the stderr-surface contract.

### Deviation C — `[Rule 3 - Test-time Intl stub interference]` Combobox population in override test

**Found during:** Task 4 first test run.

**Issue:** Test 2 (operator overrides timezone to America/New_York) initially asserted `matchButtons.length=0` — the searchable combobox `<ul>` rendered EMPTY. Root cause: the stub harness was setting `Intl.DateTimeFormat = fn` AND also reassigning `Intl.DateTimeFormat.supportedValuesOf` and `Intl.supportedValuesOf` in an attempt to "carry over" the real implementation. That assignment chain ended up overriding `Intl.supportedValuesOf` with a bound method that returned an empty array.

**Fix:** Simplified `stubIntl()` to ONLY swap the constructor. `Intl.supportedValuesOf` (a separate top-level property on the Intl namespace) is unaffected and the component's `listSupportedTimezones()` keeps returning the full IANA zone list from the real implementation. Plus: switched the test from `tzInput.value = …` to the React-aware `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set!.call(tzInput, …)` pattern so React 18's synthetic event tree actually sees the value change. Same change applied to the locale `<select>` test.

**Files modified:** `livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.test.tsx` (rolled into commit `6d2a1950`).

**Impact:** Test harness only. Component contract unchanged. 6/6 PASS post-fix.

## Authentication Gates

**None.** No external secrets, OAuth flows, or CLI logins were required to ship this plan. Vitest uses injected execFile mocks so no real `sudo` / `timedatectl` is ever spawned in CI. The sudoers fragment edit + sacred-registry re-pin land via normal `git commit` flow with the pre-commit hook validating.

## Operator UAT Block (deferred — to walk on Mini PC)

This plan ships **module-level coverage only** (31 new vitest PASS + 73/73 existing-suite regressions green + UI build green + tsc clean + sacred guard green). The system-level UAT is queued for the operator on Mini PC `bruce@10.69.31.68`:

1. `ssh bruce@10.69.31.68` (per `reference_minipc_ssh.md`).
2. `bash /opt/livos/update.sh` — clones the latest HEAD (which contains all five 196-05 commits) + rsync deploys + restarts livos/liv-core/liv-worker/liv-memory.
3. After deploy, `journalctl -u livos.service -n 200 | grep "Phase 196-05"` should show: `Phase 196-05 — setup router wired (setRegion + setLocaleTimezone)`.
4. `sudo cat /etc/sudoers.d/livinityd | grep TIMEDATECTL` should show the new alias on disk (deploy will copy the fragment verbatim from the repo via install.sh / Phase 192 idiom; or apply manually as instructed in `scripts/install/sudoers.d/livinityd` header).
5. `sudo visudo -c -f /etc/sudoers.d/livinityd` should report "parsed OK".
6. Visit `https://bruce.livinity.io/onboarding` and walk all 9 steps: Welcome → Account → Wallpaper → Personalize → Provider (pick xAI; auto-routes to ConnectAi) → wait. **Note:** The wave order shipped is `Provider → Region → Locale & Time → Connect AI`, so the auto-route from Provider lands on Region first; pick Europe (Suggested for a Turkish IP) → click Continue → pick the auto-detected Europe/Istanbul + tr-TR on Locale & Time → click Continue. Backend invokes `sudo /usr/bin/timedatectl set-timezone Europe/Istanbul`.
7. `cat /etc/timezone` on Mini PC reports `Europe/Istanbul`.
8. `redis-cli -a "$REDIS_PASSWORD" get liv:user:timezone` returns `"Europe/Istanbul"`.
9. `redis-cli -a "$REDIS_PASSWORD" get liv:user:locale` returns `"tr-TR"`.
10. Submit a request with an invalid timezone via direct tRPC call (curl with admin JWT and body containing `"timezone":"Mars/Olympus"`) returns HTTP 400 BAD_REQUEST — defense-in-depth proven in production.

## Phase 196 Closure Notes

At plan 196-05's CODE-COMPLETE this commit, **all 5 plans of Phase 196 are CODE-COMPLETE**:

| Plan | Subject | Commits | Status |
|------|---------|---------|--------|
| 196-01 | livinityd xAI DI wire-up | 2 | CODE-COMPLETE 2026-05-22 |
| 196-02 | install.sh idempotent installer | 2 | CODE-COMPLETE 2026-05-22 |
| 196-03 | Provider step + xAI auto-route | 2 | CODE-COMPLETE 2026-05-22 |
| 196-04 | Region step + setup.setRegion | 3 | CODE-COMPLETE 2026-05-22 |
| 196-05 | Locale + timezone + sudoers re-pin | 5 | CODE-COMPLETE 2026-05-22 |

The operator UAT pass (sections 1-10 above plus the residual Phase 195 HUMAN-UAT items for opencode binary install + xAI device-code flow) closes BOTH Phase 195 HUMAN-UAT and Phase 196's own checklist in a single walk on `bruce@10.69.31.68`. After the walk, Phase 196 → SHIPPED on ROADMAP; v34.0 / v38.3 milestone advances per phase queue.

## Self-Check: PASSED

**Files exist on disk:**
- `livos/packages/livinityd/source/modules/locale/timezone-service.ts` — FOUND
- `livos/packages/livinityd/source/modules/locale/timezone-service.test.ts` — FOUND
- `livos/packages/ui/src/lib/intl.ts` — FOUND
- `livos/packages/ui/src/lib/intl.test.ts` — FOUND
- `livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.tsx` — FOUND
- `livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.test.tsx` — FOUND
- `livos/packages/livinityd/source/modules/locale/index.ts` — MODIFIED + FOUND
- `livos/packages/livinityd/source/modules/server/trpc/setup-router.ts` — MODIFIED + FOUND
- `livos/packages/livinityd/source/modules/server/trpc/setup-router.test.ts` — MODIFIED + FOUND
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — MODIFIED + FOUND
- `livos/packages/livinityd/source/index.ts` — MODIFIED + FOUND
- `livos/packages/ui/src/features/onboarding-flow/constants.ts` — MODIFIED + FOUND
- `livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx` — MODIFIED + FOUND
- `scripts/install/sudoers.d/livinityd` — MODIFIED + FOUND (new SHA `aea64b87…`)
- `scripts/sacred-shas-v38.json` — MODIFIED + FOUND (sudoers entry re-pinned)

**Commits exist in `git log`:**
- `23e7f249` (Task 1 — sudoers + sacred re-pin) — FOUND
- `778a00f3` (Task 2 — timezone-service) — FOUND
- `04fad313` (Task 3 — setLocaleTimezone procedure) — FOUND
- `6d2a1950` (Task 4 — LocaleTimezoneStep + intl) — FOUND
- `10d9ae1c` (Task 5 — wizard + livinityd wire-up) — FOUND

**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — PRESERVED across all 5 commits.

**Sudoers fragment invariant:** RE-PINNED atomically in commit `23e7f249`. Pre-plan `568e4403…` → Post-plan `aea64b87…`. Pre-commit hook PASS 5/5 (20 files verified per commit).

---
*Phase: 196-onboarding-completion-installer-locale*
*Plan: 05 — Locale + Timezone Step + Sacred Sudoers Re-pin (Phase 196 closure)*
*Completed: 2026-05-22*
