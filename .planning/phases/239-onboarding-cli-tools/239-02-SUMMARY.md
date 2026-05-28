---
phase: 239-onboarding-cli-tools
plan: 02
subsystem: ui/onboarding
tags: [ui, react, onboarding, feature-flag, tdd, cli-tools]
provides:
  - "Onboarding step 5 = CLI Tools (5-card install grid) gated by livos:v43:onboarding_cli_section"
  - "CliToolsStep React component with per-card 4-state machine + Install dispatch"
  - "SUPPORTED_CLI_DISPLAY export — UI-side drift-lock vs backend SUPPORTED_CLIS"
requires:
  - "Plan 239-01 cliInstaller.install / cliInstaller.detect tRPC procedures"
affects:
  - "OnboardingData type (dropped 4 fields, added cliInstalled: string[])"
  - "Wizard route setup-wizard-v2.tsx (slot-4 mount swap + feature-flag gate)"
  - "STEP_NAMES[4] + STEP_WEIGHT[4] (40s, was 35s)"
tech_stack_added: []
patterns:
  - "react-dom/client + act + vi.mock test harness (D-NO-NEW-DEPS precedent)"
  - "useReducer cards state + 5 unconditional detect useQuery fan-out (rules-of-hooks safe)"
  - "Feature-flag gate via localStorage with informational fallback notice (no legacy code on disk)"
  - "TDD RED -> GREEN gate sequence (test commit precedes implementation commit)"
key_files:
  created:
    - livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.tsx
    - livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.test.tsx
  modified:
    - livos/packages/ui/src/features/onboarding-flow/constants.ts
    - livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx
    - livos/packages/ui/src/features/onboarding-flow/steps/done-step.tsx
    - livos/packages/ui/src/features/onboarding-flow/steps/region-step.test.tsx
  deleted:
    - livos/packages/ui/src/features/onboarding-flow/steps/provider-step.tsx
    - livos/packages/ui/src/features/onboarding-flow/steps/provider-step.test.tsx
    - livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.tsx
    - livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.test.tsx
decisions:
  - "D-239-03 vs D-239-15 tension RESOLVED: D-239-03 'no shim' wins. Flag-off path renders an informational notice (with Skip), NOT the legacy ProviderStep. Legacy files deleted; rollback safety preserved without keeping orphaned type-broken code."
  - "Feature-flag transport defers to a future Phase 239-04 micro-plan; for now localStorage-only ('livos.v43.onboarding_cli_section'='true'). Plan 239-03 (deploy) seeds Redis."
  - "Type-safe drift-lock: SUPPORTED_CLI_DISPLAY ids/order mirror backend SUPPORTED_CLIS (D-239-10). Reordering requires coordinated Phase 240 bump."
  - "T-239-02-02 mitigation implemented inline: install output tail-truncated to 3 lines / 400 chars before rendering in failed-state tooltip."
metrics:
  duration_minutes: ~14
  tasks_completed: 4
  files_created: 2
  files_modified: 4
  files_deleted: 4
  commits: 5
  tests_added: 10
completed_date: 2026-05-27
---

# Phase 239 Plan 02: Onboarding CLI Tools step (UI) — Summary

Wizard slot 4 swapped from Provider to CLI Tools — a 5-card install grid feeding the Plan 239-01 `cliInstaller.*` tRPC namespace, gated behind a localStorage-backed feature flag so the rollout can be flipped per-browser before Plan 239-03 lights up Redis.

## Files

- **2 created** — `cli-tools-step.tsx` (301 lines, GREEN component) + `cli-tools-step.test.tsx` (340 lines, 10 vitest cases)
- **4 modified** — `constants.ts` (STEP_NAMES + STEP_WEIGHT + OnboardingData + DEFAULT_DATA), `setup-wizard-v2.tsx` (import swap + feature-flag gate + slot-4 mount), `done-step.tsx` (drop `data.authMode` orphan), `region-step.test.tsx` (refresh stale harness pointer)
- **4 deleted** (`git rm`) — `provider-step.tsx`, `provider-step.test.tsx`, `connect-ai-step.tsx`, `connect-ai-step.test.tsx` (D-239-04/05)

## Vitest

`livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.test.tsx`: **10/10 GREEN (134 ms)**:

| # | Block | Covers |
|---|-------|--------|
| 1 | drift-lock | `SUPPORTED_CLI_DISPLAY.length === 5` + exact id order |
| 2 | drift-lock | 5 `cli-card-*` elements rendered in fixed document order |
| 3 | initial state | each card shows Install button when detect `{detected:false}` |
| 4 | already-installed | detect `{detected:true}` → Installed pill + Install button hidden |
| 5 | install dispatch | click Install → `mutateAsync({name})` + Installing spinner |
| 6 | install success | `ok:true` → Installed + `setData(cliInstalled+=id)` |
| 7 | install failure | `ok:false` → Failed panel + Retry + `title=` tooltip with tail-truncated message |
| 8 | retry recovery | Retry click → Install button visible again |
| 9 | continue gate | Continue enabled on initial render (D-239-14) |
| 10 | continue dispatch | Continue click → `onContinue()` |

Full onboarding-flow vitest suite: **22/22 GREEN** (cli-tools 10 + locale-timezone 6 + region 6).

## D-239-03 vs D-239-15 tension — resolution

D-239-03 mandates "no back-compat shim" deletions of the legacy `OnboardingData.provider / authMode / otpSecret / otpCode` fields, and D-239-04/05 delete `provider-step.tsx` + `connect-ai-step.tsx`. D-239-15 simultaneously wants the wizard to render the OLD Provider step when `livos:v43:onboarding_cli_section === false`.

These are mutually exclusive at the type level (the legacy ProviderStep references types that no longer exist). Plan-internal authority gives D-239-03 the win (more specific, cites CLAUDE.md). Therefore:

- All 4 legacy files removed from disk (`git rm`)
- `setup-wizard-v2.tsx` no longer imports `ProviderStep`
- Flag-off branch renders an **informational notice** (`onb-eyebrow` + title + paragraph + Skip footer) instead of the legacy step
- Rollback safety is preserved in spirit: operator can still finish onboarding while the new UX is gated off, just without an alternative install UI

## Feature-flag transport

Read from `window.localStorage.getItem('livos.v43.onboarding_cli_section')` only — no dedicated tRPC procedure shipped this plan. Rationale: `config-router.ts` currently only exposes the v42 migration flag (a one-off `publicProcedure`), and a generic `config.getFlag({key})` procedure was not part of Plan 239-01's scope. Adding it is a clean ~30-line micro-plan (deferred to Phase 239-04 if/when needed). Plan 239-03 (deploy) writes the Redis key; until the backend procedure ships, operator previews the new step via DevTools `localStorage.setItem`.

## Sacred SHA verify

`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — **PRESERVED** across all 5 commits (`[sacred-sha] PASS: 20 files verified` on each).

## Commits

1. `1afb0445` feat(239-02): update onboarding constants — STEP_NAMES + STEP_WEIGHT + OnboardingData
2. `d95d55df` test(239-02): add failing test for CliToolsStep (TDD RED)
3. `07926b70` feat(239-02): implement CliToolsStep — 5-card grid + per-card state machine (TDD GREEN)
4. `9130e7d2` feat(239-02): wizard mounts CliToolsStep at slot 4 with feature-flag gate
5. `bc6f3ae9` feat(239-02): delete legacy provider/connect-ai steps + audit orphan refs (D-239-04/05/06)

## Deviations from Plan

**Resolved tensions (intra-plan, no operator decision needed):**

1. **D-239-03 vs D-239-15** — see "tension — resolution" section above. Plan itself anticipated this and resolved in favour of D-239-03 + informational notice fallback. Acceptance criteria adjusted accordingly:
   - Plan Task 3 grep `ProviderStep ... wc -l >= 2` → returns 0 (file deleted + import removed in same commit chain). This is the intended end-state per Task 4's policy resolution; the >=2 criterion was provisional language that Task 4 explicitly overrides.

2. **Auto-fix done-step.tsx orphan** (Rule 2 — missing critical functionality / type correctness) — `data.authMode === '2fa' ? 'two-factor' : 'password'` referenced a now-deleted OnboardingData field. Replaced with hardcoded `'password'` label since 2FA was never enabled in the live onboarding flow (the UI was a Phase 196 placeholder). Functionally equivalent; commit `bc6f3ae9`.

3. **Auto-fix region-step.test.tsx orphan comment** (Rule 2 — passing tests pre-merge clean) — header pointed at deleted `connect-ai-step.test.tsx + provider-step.test.tsx` files. Updated to point at current canonical harness (`locale-timezone-step.test.tsx + cli-tools-step.test.tsx`). Commit `bc6f3ae9`.

4. **Auto-fix tsc narrowing** (Rule 3 — blocking) — `resolveInstall` closure variable widened to `null` after re-assignment caused TS2349; added explicit cast `(... | null)` so the narrowing survives across the `await` boundary. Commit `bc6f3ae9`.

**Out-of-scope deferred (Rule 1 scope boundary):**

`pnpm --filter ui tsc --noEmit` still exits non-zero with pre-existing errors in:

- `stories/src/routes/stories/*.tsx` (~25 errors — missing `@/modules/widgets/*` + `@/modules/wifi/*` paths, unused `@ts-expect-error`, implicit any)
- `src/features/backups/components/setup-wizard.tsx` (~9 errors — `Loader2 / ChevronDown / Trans` JSX type-component incompat from a `@types/react` mismatch upstream)
- `src/features/onboarding-flow/steps/account-step.tsx:156` (QRCode JSX type-component incompat — same root cause)

None of these touch the Phase 239 surface (no `OnboardingData` field references, no Phase 239 file). They predate this plan and would have been live errors on commit `12de36bf` (the pre-plan baseline). Per CLAUDE.md scope-boundary rule + plan-execute deviation rules, these are deferred to a future cleanup phase. Logged here so they don't surprise the verifier or Plan 239-03 deploy step.

## Threat Flags

None. All `<threat_model>` items addressed:

- T-239-02-01 (browser tamper of CLI list): backend whitelist (Plan 239-01) is the real boundary; UI display array is decorative
- T-239-02-02 (info disclosure in failure tooltip): mitigated via tail-truncate to 3 lines / 400 chars
- T-239-02-03 (forged feature flag): accepted — UX-only gate, no security boundary
- T-239-02-04 (parallel install DoS): accepted — operator-induced
- T-239-02-05 (OnboardingData drift): mitigated — `grep -rn "authMode\|otpSecret\|otpCode\|ProviderStep\|ConnectAiStep" livos/packages/ui/src/features/onboarding-flow/ livos/packages/ui/src/routes/onboarding/` returns 0 lines

## Acceptance criteria — all PASS

- 5-card grid renders in fixed order with full 4-state machine ✓
- Continue enabled on initial render (D-239-14) ✓
- OnboardingData has `cliInstalled: string[]`, NO provider/authMode/otpSecret/otpCode ✓
- Wizard mounts CliToolsStep when `cliSectionFlagEnabled === true`, otherwise notice ✓
- 4 legacy files removed from disk ✓
- vitest onboarding-flow/ 22/22 GREEN ✓
- Sacred SHA preserved ✓
- All 4 plan tasks committed individually (Task 2 = RED+GREEN = 2 commits) ✓

## Known Stubs

None. No `=[]` / `="placeholder"` / `TODO` / `FIXME` patterns introduced. `data.cliInstalled` is wired end-to-end through the install mutation success path.

## Self-Check: PASSED

Files exist on disk:

- `livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.tsx` — FOUND
- `livos/packages/ui/src/features/onboarding-flow/steps/cli-tools-step.test.tsx` — FOUND
- `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.tsx` — GONE (intended)
- `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.test.tsx` — GONE (intended)
- `livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.tsx` — GONE (intended)
- `livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.test.tsx` — GONE (intended)

Commits in `git log`:

- `1afb0445` FOUND
- `d95d55df` FOUND
- `07926b70` FOUND
- `9130e7d2` FOUND
- `bc6f3ae9` FOUND

Plan 239-03 unblocked: UI artifact exists, behind a feature flag. Deploy plan can ship the bundle and (separately) flip the Redis key.
