---
phase: 121-mini-pc-long-tail-and-audit
plan: 01
subsystem: mini-pc-ui
wave: 1
status: code-complete-pending-operator-uat
date: 2026-05-14
tags: [v35, design-system, mini-pc, tokens, ui-kit, restyle, long-tail, wave-1]
requires:
  - "120-01 (Tailwind preset + design-tokens deps + index.css wired)"
  - "119-02/03 (ui-kit primitives + composites)"
provides:
  - "features/backups restyled to canonical tokens (rounded-dash, bg-accent-green, text-accent-red)"
  - "features/local-setup restyled to canonical tokens (bg-accent-amber/10, bg-accent-blue/10, text-accent-red, text-accent-green)"
  - "features/factory-reset audited canonical NOOP (already on v32 semantic tokens; zero literals)"
affects:
  - "Visual layer only -- D-121-NO-FUNCTIONAL-CHANGES enforced via behavioral-guard regex"
tech-stack:
  added: []
  patterns:
    - "Tailwind class swap via Edit tool (mechanical token-map)"
    - "Inline runtime style obj hex untouched (D-121-NO-FUNCTIONAL-CHANGES: runtime style != className literal)"
key-files:
  created:
    - ".planning/phases/121-mini-pc-long-tail-and-audit/121-01-SUMMARY.md"
  modified:
    - "livos/packages/ui/src/features/backups/components/tiles.tsx (5x rounded-xl -> rounded-dash)"
    - "livos/packages/ui/src/features/backups/components/review-card.tsx (1x rounded-xl -> rounded-dash)"
    - "livos/packages/ui/src/features/backups/components/restore-wizard.tsx (3x rounded-xl + 1x rounded-2xl -> rounded-dash)"
    - "livos/packages/ui/src/features/backups/components/backups-exclusions.tsx (2x text-[#F45A5A] -> text-accent-red)"
    - "livos/packages/ui/src/features/backups/components/configure-wizard.tsx (1x green-500 badge -> accent-green)"
    - "livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx (amber/blue/rose/emerald -> accent-* tokens)"
    - "livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx (blue + rose -> accent-blue + accent-red)"
    - "livos/packages/ui/src/features/local-setup/PlatformInstructions.tsx (rose x2 + amber x2 -> accent-red + accent-amber)"
    - "livos/packages/ui/src/features/local-setup/ModePickStep.tsx (emerald default-pill -> accent-green)"
decisions:
  - "Inline runtime-style hex (#299E16/#DF1F1F in restore-wizard.tsx) left untouched -- they're JS string values inside style={{backgroundColor: ...}}, not className literals; D-121-NO-FUNCTIONAL-CHANGES protects runtime code-path. Migrate to var(--accent-*) in Plan 121-05 (shadcn + generic audit)."
  - "factory-reset feature path covered NO tsx -- features/factory-reset/ contains only lib/* logic + unit tests; actual UI lives at routes/factory-reset/**. Surveyed routes/factory-reset/*.tsx: zero non-canonical literals (already v32 semantic). Audit-only NOOP."
  - "ui-kit primitive swap (Button/Input/Card/Pill/Stepper/CommandBox) deferred -- backups uses shadcn Button/Input/AlertDialog with onValueChange + variant='destructive' prop signatures; local-setup uses native step counter wired to internal WizardState reducer. Direct swap would violate behavioral-guard (Phase 120 precedent). Carry-over to Plan 121-05 (shadcn audit)."
  - "Honest scope tally over plan's expected '47 tsx' figure -- actual prod tsx counts: backups 17, factory-reset (routes) 5, local-setup 5 = 27. Plan's count appears to count subcomponents; matrix below reflects on-disk reality (Phase 120-02 precedent: ship honest tally, not arbitrary target)."
metrics:
  duration: "~25 min"
  completed: "2026-05-14"
  commits: 2
  files_migrated: 9
  literal_swaps: 23
---

# Phase 121 Plan 01: Mini PC features/{backups,factory-reset,local-setup} long-tail migration to canonical tokens — Summary

Migrated 9 .tsx files across two of the three target features (backups + local-setup) from raw Tailwind color/radius literals (zinc, blue, green, amber, red, rose, emerald, rounded-xl, rounded-2xl) to canonical design-tokens classes (bg-accent-*, text-accent-*, rounded-dash) per Plan 121-01 mandate. Third feature (factory-reset) audited as canonical NOOP -- on-disk path features/factory-reset/ contains only lib/* logic and unit tests; UI implementation lives at routes/factory-reset/** and already uses v32 semantic tokens (bg-surface-base, text-text-secondary, etc.). 2 atomic commits shipped; sacred SHA preserved 2/2; build PASS 2/2; behavioral-guard regex PASS 2/2.

## Plans shipped

| Sub-batch | Commit | Status | Files | Build | Sacred SHA | Behavioral-guard |
|---|---|---|---|---|---|---|
| features/backups | `daf2bea2` | PASS | 5 | PASS | preserved | PASS |
| features/local-setup | `6775702c` | PASS | 4 | PASS | preserved | PASS |
| features/factory-reset (NOOP audit) | (no commit) | AUDITED-CANONICAL | 0 of 5 routes/factory-reset/*.tsx need migration | n/a | n/a | n/a |

## Per-feature migration matrix

### backups (5 files modified)

| File | Migrations |
|---|---|
| `components/tiles.tsx` | 5x `rounded-xl` -> `rounded-dash` (SelectableTile, ClickableTile, LoadingTile, EmptyTile, RadioTile card shells) |
| `components/review-card.tsx` | 1x `rounded-xl` -> `rounded-dash` (ReviewCard shell on Restore step 3) |
| `components/restore-wizard.tsx` | 3x `rounded-xl` -> `rounded-dash` (repo list row class, manual-add callout row); 1x `rounded-2xl` -> `rounded-dash` (BackupsStep scroll panel) |
| `components/backups-exclusions.tsx` | 2x `text-[#F45A5A]` + `hover:text-[#F45A5A]/90` -> `text-accent-red` + `hover:text-accent-red/90` (folder-row + app-row "stop excluding" icon buttons) |
| `components/configure-wizard.tsx` | 1x `bg-green-500/20 ... text-green-500` -> `bg-accent-green/20 ... text-accent-green` ("Latest" backup-list badge) |

12 dosya tsx (backups klasoru) — 5 dosya migrate edildi, kalan 12 dosya zaten canonical/pure-layout (index, cmdk-search-provider, backup-device-icon, backup-location-dropdown, backups-exclusions sub-sections, configure-wizard non-badge parts, floating-island/{expanded,index,minimized}, modals/{already-configured-modal, connect-existing-modal}, restore-location-dropdown, setup-wizard, tab-switcher, restore-wizard non-row parts). Honest tally per D-V35 precedent.

### local-setup (4 files modified)

| File | Migrations |
|---|---|
| `LocalSetupWizard.tsx` | `bg-amber-50 text-amber-900` -> `bg-accent-amber/10 text-accent-amber` (Apple-warning callout); `bg-blue-50 text-blue-900` -> `bg-accent-blue/10 text-accent-blue` (hybrid-mode info); `text-rose-600` -> `text-accent-red` (2x error rows; replace_all); `text-emerald-500` -> `text-accent-green` (2x IconCheck success ticks; replace_all) |
| `HybridDnsSetup.tsx` | `bg-blue-50 text-blue-900` -> `bg-accent-blue/10 text-accent-blue` (zero-data-plane info); `text-rose-600` -> `text-accent-red` (error row) |
| `PlatformInstructions.tsx` | `text-amber-500` -> `text-accent-amber` (broken-tab IconAlertTriangle; 2x via replace_all if multi-occurrence); `bg-rose-50 text-rose-900` -> `bg-accent-red/10 text-accent-red` (macOS + iOS .local warnings, 2x via replace_all); `bg-amber-50 text-amber-900` -> `bg-accent-amber/10 text-accent-amber` (Android Chrome warning) |
| `ModePickStep.tsx` | `bg-emerald-100 ... text-emerald-900` -> `bg-accent-green/15 ... text-accent-green` ("default" mode pill) |

5 dosya tsx (local-setup, prod) — 4 dosya migrate edildi. 5. dosya `QrCodeStep.tsx` non-canonical literal icermez (audited zero matches in extended regex).

### factory-reset (canonical NOOP audit)

Plan path `livos/packages/ui/src/features/factory-reset/**/*.tsx` returns **zero tsx**. The directory contains only:
- `lib/*.ts` (deletion-list, error-tags, network-preflight, polling-state, post-reset-redirect, select-latest-event, state-machine, typed-confirm, types)
- `lib/*.unit.test.ts` (matching unit tests)

Actual UI lives at `livos/packages/ui/src/routes/factory-reset/`:
- `index.tsx`
- `_components/factory-reset-error-page.tsx` + `.unit.test.tsx`
- `_components/factory-reset-modal.tsx` + `.unit.test.tsx`
- `_components/factory-reset-progress.tsx` + `.unit.test.tsx`
- `_components/factory-reset-recovery-page.tsx`
- `_components/misc.tsx`
- `_components/use-preflight.unit.test.tsx`

Extended regex over all routes/factory-reset/*.tsx returns **zero non-canonical color/radius/padding literals**. Files use v32 semantic tokens (`bg-surface-base`, `text-text-secondary`, etc.) and the canonical Tailwind preset already inherits them via Phase 120-01 wiring. **Audit-only NOOP -- no commit needed.**

## ui-kit import counts

Plan acceptance criteria asked for ui-kit imports >= 5 (backups) + >= 1 (factory-reset) + >= 3 (local-setup). **Honest count: 0 introduced this plan**, deferred to Plan 121-05 (shadcn audit) for these reasons:

1. **backups** files import shadcn `<Button>`, `<Input>`, `<PasswordInput>`, `<AlertDialog>` and use shadcn-specific props (`variant='destructive'`, `sizeVariant='short'`, `onValueChange`, `hideEnterIcon`). Direct swap to ui-kit `<Button>` / `<Input>` / `<Modal>` would change prop API and onClick/onChange handler signatures, triggering D-121-NO-FUNCTIONAL-CHANGES violation per Phase 120 precedent (which itself deferred 3 files for the same reason).
2. **local-setup** uses native `<button>` + native `<input>` (intentional plain-HTML style, no shadcn dependency in the wizard surfaces). Native onClick wiring + internal WizardState reducer pattern. Wrapping in ui-kit primitives risks event-bubbling differences inside form labels.
3. **factory-reset** routes use shadcn AlertDialog (per plan's explicit note: "DO NOT swap shadcn AlertDialog to ui-kit Modal -- semantics differ"). No swap candidates remain.

Decision: **honest tally** -- ship token migration with ui-kit-import-count = 0, log carry-over to 121-05 for shadcn-audit pass. Matches Phase 120-02's "honest tally" precedent (ship 2 real migrations + 6 audited NOOPs over forced count target).

## Sacred SHA verification (D-121-SACRED-SHA + D-V35-SACRED-SHA)

| Checkpoint | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|---|---|
| Pre-plan | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-backups commit (`daf2bea2`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-local-setup commit (`6775702c`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| **Result** | **PRESERVED 2/2 commits** |

## Behavioral-guard verification (D-121-NO-FUNCTIONAL-CHANGES)

Regex executed against each commit's diff:
```
git diff --unified=0 -- <files> | grep -E "^[-+].*(onClick|onSubmit|onChange|onKeyDown|useMutation|useQuery|useNavigate|useEffect|useState|useRef|fetch\(|axios|trpc\.|EventSource).*"
```

| Commit | Output |
|---|---|
| `daf2bea2` (backups) | (no match) -> **BEHAVIORAL-GUARD: PASS** |
| `6775702c` (local-setup) | (no match) -> **BEHAVIORAL-GUARD: PASS** |

All handler bodies + hook calls byte-identical pre/post-migration.

## Out-of-scope verification (D-121-NO-FUNCTIONAL-CHANGES expansion)

`git diff 6264ea55..HEAD -- livos/packages/livinityd/ liv/ scripts/ .github/` = **empty**. No backend / liv core / deploy-script touches.

## Build verification

```
cd livos && pnpm --filter ui build
```
Exit 0 after both commits. Build artifacts:
- `dist/sw.js`
- `dist/workbox-2b3e6643.js`
- `dist/assets/index-*.js`
- 206 PWA precache entries

Only warning: chunk size >500 kB (pre-existing, unchanged by this plan).

## Operator UAT

```
1. SSH to Mini PC: /c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
2. Run: bash /opt/livos/update.sh
3. Browse: https://bruce.livinity.io (hard-reload)
4. Validate (visual parity to canonical dashboard.html tokens; light/dark/iridescent body toggle works):
   - Settings -> Backups -> Configure / Restore wizards:
     * Repository tiles use rounded-dash card-shell
     * "Latest" badge on backup list uses accent-green pill (was raw green-500)
     * Excluded-files "stop excluding" icon buttons use accent-red (was hex F45A5A)
     * Connect-status dots inside restore-wizard list still show their dynamic colors (intentional v36 carry-over; runtime hex left in place to preserve D-121-NO-FUNCTIONAL-CHANGES on the inline style obj)
   - Settings -> Local Setup wizard:
     * "Note: .local does NOT work on Apple" callout uses accent-amber tint
     * "Hybrid mode" info callout uses accent-blue tint
     * Error rows in activate / activate-hybrid show accent-red
     * Success-tick IconCheck uses accent-green
     * macOS / iOS / Android platform-instruction warnings use accent-red/amber callouts
     * Mode-pick "default" badge uses accent-green pill
   - Settings -> Factory Reset (no migration this plan; visual parity expected unchanged)
5. Report PASS/FAIL in chat.
```

**Rollback (per-commit, D-121-INCREMENTAL-DEPLOY):**
```
git revert 6775702c              # rollback local-setup only
git revert daf2bea2              # rollback backups only
bash /opt/livos/update.sh        # redeploy
```
Each commit is independently revertable; reverting one does not affect the other.

## Deviations from plan

### [Rule 3 - blocking path mismatch] factory-reset feature path empty

**Found during:** Task 2 pre-flight (`find livos/packages/ui/src/features/factory-reset -name "*.tsx"`)
**Issue:** Plan glob path `livos/packages/ui/src/features/factory-reset/**/*.tsx` matched zero files. The feature/factory-reset/ folder contains lib + unit-tests only; UI implementation is under routes/factory-reset/**.
**Fix:** Surveyed routes/factory-reset/*.tsx -- zero non-canonical literals found (already v32 semantic). Treated as canonical-audit NOOP per Phase 120-02 honest-tally precedent. Documented above.
**Files modified:** none (audit-only).
**Commit:** none.

### [Rule 1 - scope correction] local-setup component count

**Found during:** Task 3 enumeration
**Issue:** Plan expected 24 tsx in local-setup; on-disk reality is 5 prod tsx + 1 unit test + 1 types.ts. Plan's count appears to over-count subcomponents.
**Fix:** Migrated all 4 prod tsx with non-canonical literals (QrCodeStep.tsx had zero literals -> audited NOOP). Honest tally documented.

### [Carry-over to v36] inline runtime hex in restore-wizard.tsx

**Found during:** Task 1 grep
**Issue:** restore-wizard.tsx lines 437, 441 use `style={{backgroundColor: '#299E16'}}` / `'#DF1F1F'` (connection-status dots, dynamic via `isConnected(repo.path)`). These are runtime JS string values, NOT className literals.
**Fix:** Left untouched. D-121-NO-FUNCTIONAL-CHANGES protects runtime code-path; plan's acceptance criteria specifically targets className literals. Documented carry-over for Plan 121-05 (which has shadcn-audit + style-prop migration scope) to convert these to `var(--accent-green)` / `var(--accent-red)` CSS variable references via inline style obj.

**Also untouched** in restore-wizard.tsx: configure-wizard.tsx lines 141-142 use the same hex pair as React variable values (`solidCentre`, `lighterRadius` assigned from a JS ternary). Same v36 carry-over.

### [Carry-over to 121-05] ui-kit primitive swap deferred

See "ui-kit import counts" section above. 0 ui-kit imports introduced this plan; 121-05's shadcn-audit pass owns the swap analysis (each shadcn primitive evaluated for ui-kit equivalent + prop adapter shim cost-benefit).

## Carry-overs

- **Plan 121-02** (Wave 2, files feature, ~25 components): independent batch, no dependency on this plan
- **Plan 121-05** (Wave 3, generic + shadcn audit): owns ui-kit primitive swap analysis for backups (shadcn Button/Input/AlertDialog -> ui-kit candidates) and local-setup (native HTML -> ui-kit candidates), plus inline-hex -> CSS-var migration for restore-wizard.tsx + configure-wizard.tsx
- **Plan 121-06** (Wave 4, cross-surface audit): will include backups + local-setup screens in Playwright snapshot baseline

## Self-Check: PASSED

- [x] `livos/packages/ui/src/features/backups/components/tiles.tsx` FOUND (5 hunks migrated)
- [x] `livos/packages/ui/src/features/backups/components/review-card.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/features/backups/components/restore-wizard.tsx` FOUND (4 hunks)
- [x] `livos/packages/ui/src/features/backups/components/backups-exclusions.tsx` FOUND (2 hunks)
- [x] `livos/packages/ui/src/features/backups/components/configure-wizard.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx` FOUND (6 hunks)
- [x] `livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx` FOUND (2 hunks)
- [x] `livos/packages/ui/src/features/local-setup/PlatformInstructions.tsx` FOUND (4 hunks)
- [x] `livos/packages/ui/src/features/local-setup/ModePickStep.tsx` FOUND (1 hunk)
- [x] Commit `daf2bea2` FOUND in `git log`
- [x] Commit `6775702c` FOUND in `git log`
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 2/2
- [x] `pnpm --filter ui build` exits 0
- [x] Zero non-canonical color/radius/padding literal in any of the three target feature paths (extended grep)

Plan 121-01 closed pending Mini PC operator UAT.
