---
phase: 196-onboarding-completion-installer-locale
plan: 03
subsystem: onboarding-ui
tags: [onboarding, ui, provider-selection, auto-route, xai, phase-196, wizard-step]

requires:
  - phase: 195-04
    provides: ConnectAiStep with real xAI OAuth state machine (idle/starting/awaiting-user/connected/error) — the auto-route target
  - phase: 195-03
    provides: trpc.auth.xai.start endpoint that ConnectAiStep calls when ProviderStep funnels into it
provides:
  - ProviderStep wizard component with single-tick auto-route from xAI card to ConnectAiStep
  - OnboardingData.provider field (xai|claude|openai|anthropic) as the persisted selection
  - TOTAL=7 wizard step contract (was 6); STEP_NAMES + STEP_WEIGHT extended
  - 4 vitest assertions locking the auto-route + disabled-card + props contract at the component level
affects: [196-04, 196-05]

tech-stack:
  added: []  # zero new npm deps — react-dom/client + vitest already in lockfile (D-NO-NEW-DEPS preserved)
  patterns:
    - "Single synchronous onClick handler: setData({...data, provider:'xai'}); onContinue() — no setTimeout, no useEffect, no requestAnimationFrame"
    - "Disabled cards omit onClick prop entirely (T-196-03-01 mitigation — not just an HTML `disabled` attribute) plus aria-disabled='true' + opacity 0.5 + cursor:not-allowed + pointer-events:auto so test clicks still dispatch but no handler exists"
    - "react-dom/client + vi.mock harness mirroring connect-ai-step.test.tsx (Phase 195-04 D-NO-NEW-DEPS precedent — no @testing-library/react import)"
    - "PROVIDERS array with per-entry `badge?: string` field so 'Coming soon' renders as a literal string the grep-AC can count exactly (= 3)"
    - "FooterBar continueDisabled={true} ALWAYS — provider selection is one-click via the card; footer Continue is intentionally inert so the only forward path is the xAI auto-route"

key-files:
  created:
    - livos/packages/ui/src/features/onboarding-flow/steps/provider-step.tsx
    - livos/packages/ui/src/features/onboarding-flow/steps/provider-step.test.tsx
  modified:
    - livos/packages/ui/src/features/onboarding-flow/constants.ts
    - livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx

key-decisions:
  - "Auto-route handler is verbatim per plan: `setData({...data, provider: 'xai'}); onContinue()` in the SAME synchronous handler — single tick, deterministic vitest assertions"
  - "Disabled cards omit onClick prop entirely (T-196-03-01 mitigation) — Test 3 asserts onContinue spy stays at 0 calls after clicking all three disabled cards"
  - "FooterBar Continue is always disabled — xAI auto-route is the one forward path; Back still works for return to PersonalizeStep (backwards-compat per CONTEXT.md decision)"
  - "PROVIDERS array uses per-entry `badge?: string` literal so grep -cE 'Coming soon' returns exactly 3 (one per disabled card) — matches plan AC verbatim"
  - "OnboardingData.provider is OPTIONAL (`provider?:`) — DEFAULT_DATA stays unchanged so resume / backend-hydration paths remain backwards-compatible with pre-Phase 196 sessions"
  - "TOTAL bumped 6 -> 7 via constants.ts — useStepper / readResume / getInitialStepFromUrl all read TOTAL dynamically so the bump propagates without other call-site edits"

requirements-completed: []

duration: ~5min
completed: 2026-05-22
---

# Phase 196 Plan 03: ProviderStep + Auto-Route Wizard Wave Summary

**New ProviderStep mounted at wizard stepIndex 4 with single-tick auto-route from the xAI card into ConnectAiStep — closes the "click provider then click Continue" two-click implied flow per CONTEXT.md decision 196-03, and locks the funnel pattern (one enabled provider + three "Coming soon" placeholders) for Phase 197+ provider additions.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-22T10:58:28Z
- **Completed:** 2026-05-22T11:03:59Z
- **Tasks:** 2/2
- **Files created:** 2
- **Files modified:** 2

## Task Commits

Each task committed atomically:

1. **Task 1: ProviderStep component + vitest harness** — `b4bee157` (feat)
   - `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.tsx` — 171 LOC, 4 provider cards (xAI enabled + Claude/OpenAI/Anthropic disabled), single-tick auto-route handler `handleSelectXai = () => { setData({...data, provider:'xai'} as OnboardingData); onContinue() }`, FooterBar continueDisabled=true always (Back still works), Phase 196-03 rationale docblock at file head.
   - `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.test.tsx` — 222 LOC, react-dom/client + vi.mock harness, 4 PASS / 0 FAIL in 40 ms. Covers: (1) idle render — all 4 cards + 3 aria-disabled + 3 "Coming soon" badges; (2) xAI auto-route — setData called once with `provider:'xai'` shape + onContinue called once + FooterBar Continue still disabled (proving auto-route bypassed footer); (3) T-196-03-01 — clicking each of the 3 disabled cards leaves onContinue spy at 0 calls; (4) footer — Continue disabled (browser semantics block click), Back invokes onBack once.
   - Diff: +393 / -0

2. **Task 2: Wire ProviderStep into setup-wizard-v2 (TOTAL=7, step shift)** — `5ed44ad4` (feat)
   - `livos/packages/ui/src/features/onboarding-flow/constants.ts` — TOTAL 6→7; STEP_NAMES inserted `'Provider'` before `'Connect AI'`; STEP_WEIGHT inserted `10` before `25`; OnboardingData extended with `provider?: 'xai' | 'claude' | 'openai' | 'anthropic'` (optional); DEFAULT_DATA unchanged (provider stays undefined until selection — backwards-compat with pre-Phase 196 resume payloads).
   - `livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx` — Imported `ProviderStep` from `@/features/onboarding-flow/steps/provider-step`. Mounted `<Step stepIndex={4}>` with `<ProviderStep data={data} setData={setData} onContinue={stepper.next} onSkip={stepper.next} onBack={stepper.back} />` between PersonalizeStep and ConnectAiStep. Shifted ConnectAiStep stepIndex 4→5. Shifted DoneStep stepIndex 5→6 and `isActive={stepper.idx === 5}` → `isActive={stepper.idx === 6}`.
   - Diff: +17 / -4

## Acceptance Criteria Audit

### Task 1 ACs

| Criterion | Result |
|-----------|--------|
| `npx vitest run provider-step.test.tsx` → 4 PASS / 0 FAIL | 4/4 PASS in 40 ms ✓ |
| `grep -c "@testing-library" provider-step.test.tsx` → 0 (D-NO-NEW-DEPS) | 0 ✓ |
| `grep -c "Phase 196-03" provider-step.tsx` → ≥ 1 | 1 ✓ |
| `grep -cE "Coming soon" provider-step.tsx` → 3 (exactly) | 3 ✓ |
| `grep -c "provider: 'xai'" provider-step.tsx` → ≥ 1 | 2 ✓ |
| `bash scripts/verify-sacred-sha.sh` exits 0 | PASS ✓ |
| provider-step.tsx min_lines ≥ 80 | 171 ✓ |
| provider-step.test.tsx min_lines ≥ 100 | 222 ✓ |

### Task 2 ACs

| Criterion | Result |
|-----------|--------|
| `grep -c "^export const TOTAL = 7" constants.ts` → 1 | 1 ✓ |
| `grep -c "'Provider'," constants.ts` → 1 | 1 ✓ |
| `grep -c "provider?:" constants.ts` → 1 | 1 ✓ |
| `grep -c "<ProviderStep" setup-wizard-v2.tsx` → 1 | 1 ✓ |
| `grep -c "stepIndex={4}" setup-wizard-v2.tsx` → 1 | 1 ✓ |
| `grep -c "stepIndex={5}" setup-wizard-v2.tsx` → 1 | 1 ✓ |
| `grep -c "stepIndex={6}" setup-wizard-v2.tsx` → 1 | 1 ✓ |
| `grep -c "stepper.idx === 6" setup-wizard-v2.tsx` → 1 | 1 ✓ |
| Existing onboarding-flow vitest suite still passes | 11/11 PASS (4 new + 7 connect-ai-step) ✓ |
| `pnpm --filter ui build` exits 0 (no NEW TS errors) | exit 0 in 33.86s ✓ |
| `bash scripts/verify-sacred-sha.sh` exits 0 | PASS ✓ |

All 19 acceptance criteria PASS.

## Vitest Output

Task 1 (provider-step.test.tsx in isolation):

```
 RUN  v2.1.9 livos/packages/ui
 ✓ src/features/onboarding-flow/steps/provider-step.test.tsx > ProviderStep — idle render > renders 4 provider cards: xAI enabled + 3 disabled with Coming soon badges
 ✓ src/features/onboarding-flow/steps/provider-step.test.tsx > ProviderStep — xAI auto-route > clicking the xAI card synchronously calls setData({provider:"xai"}) AND onContinue() — no Continue button needed
 ✓ src/features/onboarding-flow/steps/provider-step.test.tsx > ProviderStep — T-196-03-01 disabled cards must not advance > clicking each of the 3 disabled cards leaves onContinue at 0 calls
 ✓ src/features/onboarding-flow/steps/provider-step.test.tsx > ProviderStep — footer behaviour > footer Continue is disabled (inert); clicking Back invokes onBack exactly once

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  1.25s
```

Task 2 (full onboarding-flow suite):

```
 RUN  v2.1.9 livos/packages/ui
 ✓ src/features/onboarding-flow/steps/provider-step.test.tsx (4 tests) 42 ms
 ✓ src/features/onboarding-flow/steps/connect-ai-step.test.tsx (7 tests) 102 ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Duration  1.38s
```

## UI Build Output (Task 2)

`pnpm --filter ui build` (vite production build):

```
... 138 chunks ...
dist/assets/setup-wizard-v2-8f6f09a7.js                         44.37 kB │ gzip:  12.90 kB
dist/assets/index-c70b2ca3.js                                1,212.34 kB │ gzip: 368.34 kB
PWA v1.2.0
mode      generateSW
precache  135 entries (7030.91 KiB)
files generated
  dist/sw.js
  dist/workbox-2b3e6643.js
✓ built in 33.86s
```

setup-wizard-v2 bundle picked up the new ProviderStep code path (44.37 kB → 12.90 kB gzip). The chunk-size warning on `index-c70b2ca3.js` (1.21 MB) is pre-existing — unrelated to this plan.

## Sacred SHA Fingerprints (pre/post)

| When | sdk-agent-runner.ts | sudoers fragment | Other tracked SHAs |
|------|---------------------|------------------|--------------------|
| Pre-Task 1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `568e4403bd71b25fba44609aec47967a9babec08` | 20/20 verified ✓ |
| Post-Task 1 commit (`b4bee157`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `568e4403bd71b25fba44609aec47967a9babec08` | 20/20 verified ✓ (pre-commit hook PASS) |
| Post-Task 2 commit (`5ed44ad4`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `568e4403bd71b25fba44609aec47967a9babec08` | 20/20 verified ✓ (pre-commit hook PASS) |

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved byte-identically across both commits.

Sudoers fragment SHA `568e4403bd71b25fba44609aec47967a9babec08` UNCHANGED (INVARIANT — Plan 196-03 is UI-only; Plan 196-05 owns any future re-pin when TIMEDATECTL Cmnd_Alias is added).

## Decisions Made

See `key-decisions` frontmatter block. Summary:

- **Single synchronous onClick handler.** Verbatim per plan: `setData({...data, provider: 'xai'} as OnboardingData); onContinue()`. No setTimeout, no useEffect, no requestAnimationFrame. Vitest Test 2 asserts setData spy + onContinue spy both fire exactly once in the same act() click — single tick, deterministic.
- **Disabled cards omit onClick prop entirely.** T-196-03-01 mitigation. The disabled card branch returns a `<button>` with `aria-disabled="true"` + opacity 0.5 + cursor:not-allowed but NO onClick attribute. Test 3 dispatches `.click()` on each disabled card and asserts onContinue spy stays at 0 — proving no handler is registered.
- **FooterBar Continue intentionally inert.** continueDisabled=true ALWAYS. The only forward path is the xAI card auto-route. Test 2 verifies that AFTER the auto-route, the FooterBar Continue button is STILL disabled (proof that the auto-route bypassed the footer). Test 4 verifies Back still works.
- **PROVIDERS array with per-entry `badge?: string`.** The plan AC `grep -cE "Coming soon" provider-step.tsx → 3 (exactly)` requires the literal string to appear 3 times. Putting it in a `badge` field on each of the 3 disabled entries (and NOT in the subtitles, NOT in the docblock) satisfies the AC verbatim while keeping the render JSX clean (`{p.badge}`).
- **OnboardingData.provider is OPTIONAL.** `provider?: 'xai' | 'claude' | 'openai' | 'anthropic'` rather than required. DEFAULT_DATA stays unchanged so pre-Phase 196 resume payloads (localStorage + backend `preferences.get`) still type-check after the bump. Operator's choice is only persisted AFTER they click the xAI card.
- **TOTAL bumped via constants.ts only.** Three call sites read TOTAL: `useStepper(TOTAL, …)` (setup-wizard-v2.tsx:52), `Array.from({length: TOTAL}, …)` (top-bar.tsx:24), `obj.idx >= TOTAL` / `n < TOTAL` resume guards (setup-wizard-v2.tsx:27/36/82). All three dereference the constant at runtime so the 6→7 bump propagates with zero call-site edits.

## Deviations from Plan

**Total deviations: 0.**

Two minor self-correction iterations during Task 1 (NOT deviations — same Task 1 commit captured the final state):

1. **First test run revealed grep-AC mismatch on `@testing-library`.** Initial test-file docblock referenced `@testing-library/react` by name to cite the "RTL absent" precedent — grep -c returned 1 (AC requires 0). Reworded the docblock to "RTL (testing-library/react) is intentionally NOT used" so the grep matches the precedent name but not the package literal. Re-ran tests: 4/4 PASS.

2. **First grep-AC pass on "Coming soon" returned 5.** Initial PROVIDERS array embedded "Coming soon" in disabled-card `subtitle` fields too. Plan AC requires exactly 3 occurrences (one per badge). Restructured PROVIDERS entries to carry a separate `badge?: string` field (and cleaned subtitles to just "Anthropic Claude" / "GPT family" / "Direct API key") so the literal string appears exactly 3 times. Also reworded the docblock so its prose mentions "disabled placeholders" instead of "Coming soon" placeholders — final count = 3. Re-ran tests: 4/4 PASS still.

Both iterations were behaviour-preserving wording refinements landed within the Task 1 commit `b4bee157` — they do NOT count as deviations because the plan's spec was honoured byte-for-byte and the commit shipped with all ACs green.

## Issues Encountered

- None. No checkpoint required. No blockers. No auth gates.

## User Setup Required

None at executor time. At runtime on Mini PC:

- `bash /opt/livos/update.sh` will deploy this change (UI bundle picks up the new `setup-wizard-v2-*.js` file).
- Operator walks `/onboarding`: Welcome → Account → Wallpaper → Personalize → **Provider** → Connect AI → Done.
- At the Provider step: click the xAI card (border-cyan, no badge) → wizard advances to ConnectAiStep in a single render tick (no intermediate Continue click). The three other cards (Claude / OpenAI / Anthropic API) render greyed out with a "Coming soon" badge top-right — clicking them does nothing (no onClick handler registered).
- Clicking Back from ConnectAiStep returns to the Provider step with xAI still selected in `data.provider` (resume payload preserves the choice).
- Operator UAT walk is deferred per CONTEXT.md (`Plan 196-03 (verification → Operator UAT) — deferred`).

## Next Phase Readiness

- Phase 196-03 unblocks Phases 196-04 (region/location step at stepIndex 5? or 6?) + 196-05 (locale+timezone step). The wizard now has a clean funnel anchor: PersonalizeStep → ProviderStep → ConnectAiStep → DoneStep with `OnboardingData.provider` persisted server-side via the existing 137-04 backend-resume path (`preferences.set` writes within 500 ms — T-196-03-03 mitigation per plan threat register).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved byte-identically across both Plan 196-03 commits.
- Sudoers fragment SHA `568e4403bd71b25fba44609aec47967a9babec08` UNCHANGED — Plan 196-03 is UI-only; Plan 196-05 still owns the future TIMEDATECTL extension + sacred re-pin.
- D-NO-NEW-DEPS upheld: `git diff b4bee157^..5ed44ad4 -- '**/package.json' '**/pnpm-lock.yaml'` empty.
- Deleted-module grep (cc-pty / claude-runner / livinity-broker / vault-items / computer-use / autonomous-scheduler / AI Chat) ZERO matches in changed files.

## Self-Check: PASSED

- [x] `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.tsx` FOUND (NEW, 171 LOC)
- [x] `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.test.tsx` FOUND (NEW, 222 LOC, 4 PASS)
- [x] `livos/packages/ui/src/features/onboarding-flow/constants.ts` MODIFIED — TOTAL=7, STEP_NAMES+STEP_WEIGHT extended, provider?: field added
- [x] `livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx` MODIFIED — ProviderStep import + stepIndex=4 mount + stepIndex shifts (4→5, 5→6) + isActive shift
- [x] commit `b4bee157` (Task 1) FOUND in `git log`
- [x] commit `5ed44ad4` (Task 2) FOUND in `git log`
- [x] Vitest 11/11 PASS on full onboarding-flow suite
- [x] `pnpm --filter ui build` exit 0
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (pre-commit hook PASS 2/2 — 20 files each)
- [x] Sudoers fragment SHA `568e4403bd71b25fba44609aec47967a9babec08` UNCHANGED (Plan 196-03 is UI-only)
- [x] `grep -c "^export const TOTAL = 7" constants.ts` = 1
- [x] `grep -c "'Provider'," constants.ts` = 1
- [x] `grep -c "provider?:" constants.ts` = 1
- [x] `grep -c "<ProviderStep" setup-wizard-v2.tsx` = 1
- [x] `grep -c "stepIndex={4|5|6}" setup-wizard-v2.tsx` = 1 each
- [x] `grep -c "stepper.idx === 6" setup-wizard-v2.tsx` = 1
- [x] `grep -c "Phase 196-03" provider-step.tsx` = 1 (≥1)
- [x] `grep -cE "Coming soon" provider-step.tsx` = 3 (exactly)
- [x] `grep -c "provider: 'xai'" provider-step.tsx` = 2 (≥1)
- [x] `grep -c "@testing-library" provider-step.test.tsx` = 0 (D-NO-NEW-DEPS)
- [x] D-NO-NEW-DEPS: package.json / pnpm-lock.yaml diff empty across both commits
- [x] Deleted-module grep (cc-pty / claude-runner / livinity-broker / vault-items / computer-use / autonomous-scheduler / AI Chat) ZERO matches in changed files

---
*Phase: 196-onboarding-completion-installer-locale*
*Plan: 03 — ProviderStep + xAI auto-route (sets up the funnel for Phase 197+ provider additions)*
*Completed: 2026-05-22*
