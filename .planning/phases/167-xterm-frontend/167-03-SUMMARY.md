---
phase: 167
plan: 167-03
subsystem: ui/cc-terminal
status: code-complete
date-completed: 2026-05-19
files:
  created:
    - livos/packages/ui/src/features/cc-terminal/terminal-theme.ts
    - livos/packages/ui/src/features/cc-terminal/terminal-theme.test.ts
  modified:
    - livos/packages/ui/src/features/cc-terminal/CcTerminal.tsx (stub removed, imports terminal-theme)
    - livos/packages/ui/src/features/cc-terminal/index.ts (barrel re-exports livosThemeToXtermTheme)
acceptance:
  vitest: "31/31 cc-terminal tests pass (7 terminal-theme + 11 CcTerminal + 13 ws-client)"
  tsc: "no errors in cc-terminal/*"
  grep-invariants:
    - "function livosThemeToXtermTheme inline stub: 0 (removed from CcTerminal.tsx)"
    - "import from './terminal-theme' in CcTerminal.tsx: 1"
    - "theme-provider.tsx unchanged"
    - "20+ hex color literals in terminal-theme.ts"
sacred-guards-verified:
  - "liv/packages/core/src/sdk-agent-runner.ts — NOT touched"
  - "D-09 luse-system-prompt.ts — NOT touched"
  - "Phase 161-02 agent-prompt-builder.ts — NOT touched"
  - "Phase 162-01 vault-scaffolder.ts — NOT touched"
  - "Phase 162-02 agent-session.ts — NOT touched"
  - "Phase 163 ws-agent.ts — NOT touched"
  - "Phase 164 autonomous-scheduler — NOT touched"
  - "Phase 165-01 claude-runner/idle-reaper.ts — NOT touched"
  - "Phase 166 server-side cc-pty/* — NOT touched"
  - "@/providers/theme-provider.tsx — NOT touched (read-only via useTheme hook)"
  - "D-NEW-DEPS-v35: package.json unchanged"
---

# Phase 167 Plan 167-03: Theme Bridge Summary

`livosThemeToXtermTheme()` extracted into its own module with the complete ANSI-16 palette, wired into `CcTerminal.tsx` via import (replacing the Plan 167-01 inline stub), and verified to drive live theme updates without remounting the terminal.

## Summary

- `terminal-theme.ts` ships the canonical LivOS-resolved-theme → xterm `ITheme` translator with all 16 ANSI colors set as literal hex constants.
- Three resolved-theme inputs are supported: `'dark'`, `'light'`, `'iridescent'` (per Phase 120-01 `ResolvedTheme` union). The iridescent branch reuses the dark palette since xterm cannot render the gradient on its own canvas; surrounding LivOS chrome retains its iridescent treatment.
- `CcTerminal.tsx` deletes its Plan 167-01 inline stub and imports the canonical helper. The existing 11 CcTerminal tests still pass because they mock `'@xterm/xterm'` rather than the theme module, so the theme value flowing into `Terminal({theme: ...})` is irrelevant to the assertions.
- `index.ts` barrel re-exports `livosThemeToXtermTheme` so downstream consumers (e.g., Phase 168 settings UI surfacing terminal preview) can reuse the same palette helper.

## Acceptance Evidence

- **vitest**: `pnpm --filter ui exec vitest run src/features/cc-terminal/` → **31/31 passed**
  - 7 terminal-theme assertions (5 behavior + 2 source-text invariants)
  - 11 CcTerminal assertions (still green after stub removal)
  - 13 ws-client assertions (unchanged)
- **tsc**: `pnpm --filter ui exec tsc --noEmit` → no errors in cc-terminal/*.
- **Grep invariants**:
  - `grep -c "^function livosThemeToXtermTheme" CcTerminal.tsx` → **0** (stub removed)
  - `grep -c "from ['\"]./terminal-theme['\"]" CcTerminal.tsx` → **1** (import added)
  - `git diff HEAD -- @/providers/theme-provider.tsx` → empty (sacred guard preserved)
  - `terminal-theme.ts` contains ≥ 20 `#[0-9a-f]{6}` hex literals (no template interpolation)

## Test Strategy Notes

`terminal-theme.test.ts` runs in the `node` environment (no jsdom needed — pure function). The 5 behavior assertions cover dark/light/iridescent palettes plus the full ANSI-16 completeness check. The 2 source-text invariants lock the literal-constant property (T-167-03-01) — any future PR that introduces a `${userColor}` interpolation will trip the regex.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Adaptation] `LivosTheme.colorScheme` ↔ `ResolvedTheme` type alignment**

- **Found during:** Task 1 (read of `@/providers/theme-provider`)
- **Issue:** Plan 167-CONTEXT and 167-03 described the helper as `livosThemeToXtermTheme(theme: LivosTheme): ITheme` where `LivosTheme.colorScheme === 'dark' | 'light'`. Reality: the existing `theme-provider.tsx` exports `Theme = 'light'|'dark'|'iridescent'|'system'` and `ResolvedTheme = 'light'|'dark'|'iridescent'`. There is no `LivosTheme` type and no `colorScheme` field.
- **Fix:** Signature is `livosThemeToXtermTheme(resolvedTheme: ResolvedTheme): ITheme`. The iridescent input is mapped to the dark palette explicitly. No theme-provider modification.
- **Files modified:** terminal-theme.ts + CcTerminal.tsx (already passing `resolvedTheme` from 167-01).

**2. [Rule 1 - Test removal] Plan's "Test 4" (live theme change in component) was a duplicate of 167-01 Test 8**

- **Found during:** Task 2 (test design)
- **Issue:** Plan 167-03's Test 4 ("live theme change updates term.options.theme without remount") replicates 167-01 Test 8 (the `[resolvedTheme]`-keyed useEffect) — and would require re-mocking `@xterm/xterm` + `./terminal-ws-client` + rerender. Adding a redundant 4th test would obscure the fact that the live-update path is already covered.
- **Fix:** Replaced with a richer cursor + selectionBackground assertion (`dark.cursor !== light.cursor`) plus an iridescent palette assertion. Net behavior coverage is broader than the plan's outline. The 167-01 component-level live-update path is unchanged and still green.
- **Files modified:** terminal-theme.test.ts only.

## Notes

- Self-Check passed: terminal-theme.ts + .test.ts created, stub removed, 31/31 green, tsc clean.

## Self-Check: PASSED

- `terminal-theme.ts` exists, exports `livosThemeToXtermTheme`
- `terminal-theme.test.ts` exists, 7/7 pass
- `CcTerminal.tsx` no longer contains the inline stub (grep: 0)
- `CcTerminal.tsx` imports `./terminal-theme` (grep: 1)
- `index.ts` barrel re-exports `livosThemeToXtermTheme`
- Previous commits (74b608ef, 05758e80) preserved
