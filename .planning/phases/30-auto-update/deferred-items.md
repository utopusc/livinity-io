# Phase 30 — Deferred Items

Out-of-scope discoveries during Phase 30 plan execution. Logged per executor scope-boundary rule.

## Pre-existing UI Vitest Failures (Discovered During Plan 30-02 Wave-End Verification)

`pnpm --filter ui exec vitest run` (full suite) reports 19 test failures across 4 test files. **All 4 test files predate Phase 30 by months** (verified by `git log --oneline` on each — they ship in commits b16efdad/6949a23b/4cfebf7b/aaff5e83 from Phases 25 and 29). The same failures reproduce when Phase 30 commits are not yet in HEAD.

**Failing files:**

1. `src/routes/docker/palette/use-recent-searches.unit.test.ts` — 8 fails ("localStorage is not defined")
2. `src/routes/docker/sidebar-density.unit.test.ts` — 4 fails (same)
3. `src/routes/docker/store.unit.test.ts` — 3 fails (same)
4. `src/routes/docker/dashboard/use-tag-filter.unit.test.ts` — 4 fails (same)

**Common root cause:** all 4 files reference `localStorage` in `beforeEach` / inside helpers without a `// @vitest-environment jsdom` directive at the top of the file. Vitest's default Node test environment does not provide `localStorage`. The fix per file is a single-line directive:

```ts
// @vitest-environment jsdom
```

**Why this lands as deferred-items:**
- Pre-existing failures (master ships them today on b6981b5f).
- Fixing all 4 files requires a small edit per file but adds 4 unrelated commits.
- Phase 30 verifier should treat these as out-of-scope; treat them as a Phase 31 maintenance fix or a separate `chore(ui-tests)` PR.

**Phase 30 Plan 30-02 vitest evidence (relevant):**
- New test file `update-notification.unit.test.ts` — passes (1/1, has the directive).
- All other Phase 30 file-touches: zero new failing tests introduced.

## Pre-existing UI TypeScript Errors

`pnpm --filter ui exec tsc --noEmit` reports ~40 pre-existing errors across:
- `src/components/cmdk.tsx`, `install-button.tsx`, `install-button-connected.tsx`
- `src/components/motion-primitives/*.tsx` (5 files)
- `src/hooks/use-current-user.ts`, `use-stacks.ts`
- `src/modules/app-store/*.tsx` (3 files)
- `src/modules/desktop/app-icon.tsx`, `dock-profile.tsx`
- `src/routes/ai-chat/*.tsx` (4 files), `routes/ai-chat/capabilities-panel.tsx` and others
- `stories/src/routes/stories/widgets.tsx`, `wifi.tsx`, `tailwind.tsx`
- `src/features/files/components/floating-islands/audio-island/equalizer.tsx`

**Phase 30 Plan 30-02 contribution:** zero new TS errors. `tsc --noEmit | grep -E "update-notification|software-update|use-settings-notification|providers/global-system-state/update|router\.tsx|use-software-update"` returns zero matches.

These errors should be triaged in a separate phase (likely a `chore(ui-typecheck)` cleanup phase). They are not blockers for Phase 30 because:
1. They predate Phase 30 (master already ships them).
2. They sit in unrelated subsystems (cmdk, motion-primitives, ai-chat, app-store).
3. Vite's swc-based dev/prod build is happy regardless (tsc is advisory-only in this project's CI).

## Non-English i18n Updates for software-update.new-version

The English locale was updated from "New {{name}} is available to install" to "Update {{name}} is available to install" so a 7-char SHA reads naturally as a placeholder. The other 12 locales (`de`, `es`, `fr`, `it`, `hu`, `nl`, `pt`, `uk`, `tr`, `ja`, `ko`) still use their pre-Phase-30 wording (e.g., German "Neue X ist verfügbar zur Installation"), which degrades gracefully — the SHA still substitutes into `{{name}}`, just with slightly awkward wording. A future i18n cleanup pass should re-translate these 12 strings to be SHA-friendly.
