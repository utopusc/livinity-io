# Phase 135 Master Plan — LivOS Onboarding Redesign per Livinity DS

**Goal:** All `/onboarding/*` routes + `features/local-setup/*` components rendered with the Livinity Design System monochrome aesthetic (system fonts, Apple-like tokens, generous rhythm). User verifies each step live at `localhost:3000` while editing.

**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on `liv/packages/core/src/sdk-agent-runner.ts` — preserved on every commit. Pre-commit hook enforces.

## Success criteria (UAT goal-backward)

1. `http://localhost:3000/onboarding` renders the new monochrome entry screen (`OnboardingStart`).
2. Continue → `/onboarding/create-account` → new monochrome card.
3. `/onboarding` (setup-wizard) shows new step indicator + new mode-pick + new platform instructions, all DS-styled.
4. `LocalSetupWizard` rendered with new DS card aesthetic when triggered.
5. `/onboarding/restore` redesigned to match.
6. No regressions: every existing prop, every existing i18n key, every existing handler still works.
7. Sacred SHA preserved on every commit.
8. Operator screenshots each step → recorded in `UAT-EVIDENCE/`.

## Execution waves

```
Wave 1:  135-01 (DS tokens + OnboardingShell)
            ↓
Wave 2:  135-02 (Entry screen)  ║  135-03 (Setup-wizard core)    [parallel]
            ↓                        ↓
Wave 3:  135-04 (create-account + account-created)  ║  135-05 (local-setup feature components)  [parallel]
            ↓
Wave 4:  135-06 (Restore flow)
            ↓
Wave 5:  135-07 (Live UAT walk + screenshot evidence)
```

## Sub-plan table

| # | File | Title | Files touched | Autonomous | LOC delta (est) |
|---|------|-------|--------------|-----------|-----------------|
| 135-01 | `135-01-PLAN.md` | DS tokens + `OnboardingShell` layout | `index.css`, `layouts/onboarding-shell.tsx` (new), `router.tsx` (swap component) | true | +120 / -5 |
| 135-02 | `135-02-PLAN.md` | Entry screen `OnboardingStart` redesign | `routes/onboarding/index.tsx`, `onboarding-footer.tsx` | true | ~70 net |
| 135-03 | `135-03-PLAN.md` | Setup-wizard core redesign | `routes/onboarding/setup-wizard.tsx` (1402 LOC) | true | ~400 net |
| 135-04 | `135-04-PLAN.md` | Create-account + account-created | `routes/onboarding/create-account.tsx`, `account-created.tsx` | true | ~150 net |
| 135-05 | `135-05-PLAN.md` | Local-setup feature components | 5 files in `features/local-setup/` | true | ~300 net |
| 135-06 | `135-06-PLAN.md` | Restore flow redesign | `routes/onboarding/restore.tsx` (356 LOC) | true | ~150 net |
| 135-07 | `135-07-PLAN.md` | Live UAT walk + screenshots | Operator walks 7 surfaces, `UAT-EVIDENCE/*.png` | true (operator-walked) | 0 / +screenshots |

## Atomic commit policy

Each sub-plan = 1 atomic commit. Format:

```
{feat|refactor}(135-XX/<short>): <one-line summary>

<body — what + why; cite DS section/file the design references>

Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (preserved)
```

## Verification gate

Phase 135 → **🟡 CODE-COMPLETE** after wave 5 push.
Phase 135 → **✅ Shipped** only after 135-07 records:
- Screenshot of every onboarding step at localhost:3000
- No console errors in browser DevTools during the full walk
- Sacred SHA preserved on every commit (verified by pre-commit + post-walk audit)

## Rollback

Each sub-plan is `git revert <sha>` safe — no migrations, no schema, no backend writes.
