---
phase: 224-app-store-hide-ai-tabs
plan: 03
subsystem: ui-banners + ui-layouts
tags: [v42, ui, banner, component, tdd, vitest, livinity-ds]
requirements: [SC-04, SC-05]
dependency_graph:
  requires:
    - "hook:useV42MigrationActive (Plan 224-01)"
    - "filter:settings-sidebar.useVisibleMenuItems (Plan 224-02)"
  provides:
    - "ui-banner:V42MigrationBanner (per-session dismissible)"
    - "mount:app-store-layout (1 mount point)"
    - "mount:settings-content (4 mount points, all return branches)"
  affects: []
tech_stack:
  added: []
  patterns:
    - "TDD RED → GREEN cycle (failing test commit precedes implementation commit)"
    - "react-dom/client test harness (no @testing-library/react — D-NO-NEW-DEPS precedent)"
    - "per-session useState dismissal (no browser storage, no Redis — re-shows next session by design)"
    - "Livinity Design tokens only — surface-2 / border-line / text-secondary / rounded-radius-md (no hex / no rgb / no inline color styles)"
    - "render-conditional gate at call-site, not inside component — keeps the unit test free of tRPC provider scaffolding"
key_files:
  created:
    - "livos/packages/ui/src/components/banners/v42-migration-banner.tsx"
    - "livos/packages/ui/src/components/banners/v42-migration-banner.test.tsx"
  modified:
    - "livos/packages/ui/src/layouts/app-store.tsx"
    - "livos/packages/ui/src/routes/settings/_components/settings-content.tsx"
decisions:
  - "Render-conditional gate lives at the call-site (`{v42MigrationActive && <V42MigrationBanner ... />}`) rather than inside the component — keeps the component itself hook-free, so the unit test can mount it without a tRPC QueryClient provider and the 4 assertions stay independent of network mocking."
  - "Per-session dismiss via useState only — explicitly NO localStorage / sessionStorage / Redis. Spec choice (per plan `<must_haves>`): banner re-shows on every reload so the operator never forgets the legacy AI surfaces are temporarily hidden. Reversibility stays at the Redis-flag level, not the per-user state level."
  - "Settings mount calls `useV42MigrationActive()` a second time alongside `useVisibleMenuItems()` (which also consumes the hook) — React Query dedupes by procedure key so this is zero extra network. Alternative (thread the flag from useVisibleMenuItems into SettingsContent) would have shipped a wider diff in settings-content.tsx with no observable behaviour difference."
  - "Banner mounted at the very top of EACH of the 4 SettingsContent return branches (mobile-detail, mobile-home, desktop-detail-redirect, desktop-home) — operator sees the same banner whether they land on /settings home or deep-link to /settings/<section>, whether on mobile or desktop, with zero half-state by viewport."
  - "test framework = vitest@2.1.9, harness = react-dom/client + jsdom (no RTL) — mirrors `inline-tool-pill.unit.test.tsx` / `highlighted-text.unit.test.tsx` precedent (D-NO-NEW-DEPS Phase 25/30/33/38/62/67-04/68-03)."
metrics:
  duration_seconds: 524
  tasks_completed: 3
  files_created: 2
  files_modified: 2
  commits: 4
  completed_date: "2026-05-27"
---

# Phase 224 Plan 03: Migration banner component + mounts Summary

## One-liner

Dismissible `V42MigrationBanner` component (Livinity DS tokens, per-session useState, zero browser storage) mounted at 5 sites — 1 in App Store layout + 4 in SettingsContent return branches — gated on the `useV42MigrationActive()` hook so the banner appears uniformly with the hide-filters of Plan 224-02 and disappears the instant the Redis flag flips to "false".

## What shipped

### V42MigrationBanner component (Task 1)

**Files created:**
- `livos/packages/ui/src/components/banners/v42-migration-banner.tsx` (51 lines)
- `livos/packages/ui/src/components/banners/v42-migration-banner.test.tsx` (126 lines)

**Exact banner text shipped (single source-of-truth const `V42_MIGRATION_BANNER_TEXT`):**

```
AI integrations temporarily disabled during Liv Assistant migration. Open Liv Assistant from the dock to use AI features.
```

**Surface contract:**

```typescript
export interface V42MigrationBannerProps {
  context: 'app-store' | 'settings'
}
export function V42MigrationBanner({context}: V42MigrationBannerProps): JSX.Element | null
export const V42_MIGRATION_BANNER_TEXT: string
```

**Styling:** Livinity DS tokens only — `bg-surface-2`, `border-line`, `text-text-secondary`, `text-text-tertiary`, `rounded-radius-md`, `rounded-radius-sm`, `text-body-sm`, `hover:bg-surface-base`, `hover:text-text-primary`. Verified by grep: zero hex literals, zero `rgb(`/`rgba(` calls, zero inline color styles.

**Dismiss UX:** `TbX` icon button, `aria-label='Dismiss banner'`, `type='button'`, hover transitions on the surface + text. On click, `setDismissed(true)` returns `null` from the component. NO browser-storage persistence — re-renders on every fresh mount.

### App Store layout mount (Task 2)

**File:** `livos/packages/ui/src/layouts/app-store.tsx`

Added 2 imports (`V42MigrationBanner`, `useV42MigrationActive`), 1 hook call (`const v42MigrationActive = useV42MigrationActive()` after `inputRef`), and 1 conditional banner inside the existing `AppStoreSheetInner` body:

```tsx
{v42MigrationActive && <V42MigrationBanner context='app-store' />}
{deferredSearchQuery ? <SearchResultsMemoized ... /> : <Outlet />}
```

`+7 lines` to the file. Zero structural changes to the existing `AppStoreSheetInner` / `SearchInput` / `CommunityAppsDropdown` block.

### SettingsContent mount (Task 3)

**File:** `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`

`useV42MigrationActive` import was already present (Plan 224-02). Added one new import (`V42MigrationBanner`), one hook call inside `SettingsContent()`, and the same conditional banner JSX prepended INSIDE the outer `<div className='animate-in fade-in'>` of EACH of the 4 return branches:

| Branch | Approximate line | Wrapper element |
| ------ | ---------------- | --------------- |
| mobile-detail (drill-down view) | 232 | `<div className='animate-in fade-in'>` (above the mobile back-header) |
| mobile-home (menu list) | 267 | `<div className='animate-in fade-in'>` (above the `<Card>`) |
| desktop-detail-redirect | 302 | `<div className='animate-in fade-in'>` (above `<SettingsDetailView>`) |
| desktop-home (sidebar + dashboard) | 322 | `<div className='animate-in fade-in'>` (above the grid container) |

`+11 lines` to the file. Plan 224-02's existing `V42_HIDDEN_MENU_IDS` const + `useVisibleMenuItems()` two-stage filter chain UNTOUCHED.

**Total mount points: 5** (1 App Store + 4 SettingsContent).

## Commits

| Task | Description                                                    | Commit     |
| ---- | -------------------------------------------------------------- | ---------- |
| 1 RED  | Failing test for V42MigrationBanner (import unresolved)      | `015db9a0` |
| 1 GREEN| V42MigrationBanner component (4/4 tests pass)                | `8695c1d1` |
| 2    | Mount banner in App Store layout                               | `735c4547` |
| 3    | Mount banner in all 4 SettingsContent return branches          | `72e21f3f` |

(No REFACTOR commit — the GREEN implementation was already minimal + clean.)

## Sacred SHA verification

D-V42-SACRED: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED. The pre-commit hook (`[sacred-sha] PASS: 20 files verified`) ran on every Task 1 RED / 1 GREEN / 2 / 3 commit and PASSED. No files under `liv/packages/core/` were touched by this plan:

```
git diff --stat 75a93f70..HEAD -- liv/packages/core/
(empty)
```

## Rollback contract

D-V42-ROLLBACK reversibility (live, no restart, no code revert):

```bash
# On Mini PC, flip the Redis flag:
redis-cli -a "$REDIS_PASS" SET liv:config:liv_v42_migration_active false
# Next window-focus refetch (or 30s staleTime expiry) →
#   • App Store: banner disappears from above the Outlet.
#   • Settings: banner disappears from all 4 return branches.
#   • Filters from 224-02 ALSO revert (categories + sidebar items re-appear).
# Re-enable:
redis-cli ... DEL liv:config:liv_v42_migration_active
```

## Acceptance criteria — all PASS

### Task 1 (component + test)

| Criterion                                                                                 | Result |
| ----------------------------------------------------------------------------------------- | ------ |
| `v42-migration-banner.tsx` exists, >= 30 lines                                            | 51 lines ✓ |
| `v42-migration-banner.test.tsx` exists, >= 25 lines                                       | 126 lines ✓ |
| Migration text const present (single source-of-truth)                                     | 1 ✓ |
| `localStorage`/`sessionStorage` occurrences in component                                   | 0 ✓ |
| Hardcoded hex/rgb colors in component                                                     | 0 ✓ |
| Test count                                                                                | 4/4 pass ✓ |
| UI typecheck: no new errors in `v42-migration-banner.tsx`                                  | ✓ |

### Task 2 (App Store mount)

| Criterion                                                                          | Result |
| ---------------------------------------------------------------------------------- | ------ |
| `V42MigrationBanner` count in `app-store.tsx`                                      | 2 (import + JSX) ✓ |
| `useV42MigrationActive` count in `app-store.tsx`                                   | 2 (import + call) ✓ |
| `context='app-store'` count                                                        | 1 ✓ |
| UI typecheck: app-store.tsx error count unchanged (6 pre-existing, 6 after)        | ✓ |

### Task 3 (Settings mount)

| Criterion                                                                          | Result |
| ---------------------------------------------------------------------------------- | ------ |
| `V42MigrationBanner` count in `settings-content.tsx`                               | 5 (>= 5) ✓ |
| `context='settings'` count                                                         | 4 ✓ |
| `import {V42MigrationBanner}` count (no duplicate imports)                         | 1 ✓ |
| UI typecheck: settings-content.tsx error count unchanged (14 pre / 14 post)        | ✓ |

## Success criteria mapping

- **SC-04** (operators see WHY surfaces are hidden + learn the alternative path): Banner renders the literal text "AI integrations temporarily disabled during Liv Assistant migration. Open Liv Assistant from the dock to use AI features." at all 5 mount points when `useV42MigrationActive() === true`. Hook returns `true` while loading or on error (hide-first) so operator never sees an empty banner gap during cold paint. ✓
- **SC-05** (Sacred SHA unchanged): Zero edits under `liv/packages/core/` — verified via `git diff --stat 75a93f70..HEAD -- liv/packages/core/` returning empty. Pre-commit hook PASSED on all 4 task commits. ✓

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` blocks were followed byte-for-byte EXCEPT for one cosmetic adjustment:

- The plan's example component file used CSS-variable-arrow tokens (`bg-[color:var(--bg-2)]`, `text-[color:var(--fg-mute)]`). I substituted the equivalent Tailwind utility tokens already in active use across this codebase (`bg-surface-2`, `text-text-secondary`, `text-text-tertiary`) so the banner matches the exact look of the surrounding sidebar buttons in `settings-content.tsx` (line 232, 274–281). Both flavours resolve to the same Livinity DS tokens — same colours, same dark/light response — and grep verification still shows zero hex/rgb literals. The plan permitted this flexibility ("Mirror the style already used in settings-content.tsx").
- Plan's `<action>` text mentioned "localStorage/sessionStorage" in a banned-list comment INSIDE the source code, but the acceptance criterion `grep -c "localStorage\\|sessionStorage" returns 0` is literal-match. I reworded the docstring to "(NO browser storage, NO Redis)" so the grep stays clean while preserving the spec intent.

Pre-existing typecheck errors in `settings-content.tsx` (Loader2 component type drift, role-field union access at the now-shifted line 209) are OUT OF SCOPE per executor scope boundary — none touch the Phase 224 surface, count unchanged (14 before, 14 after — confirmed via grep `-c "_components/settings-content.tsx"` on a stash-and-pop typecheck pair).

## Self-Check: PASSED

All required artifacts exist:

- FOUND: `livos/packages/ui/src/components/banners/v42-migration-banner.tsx`
- FOUND: `livos/packages/ui/src/components/banners/v42-migration-banner.test.tsx`
- FOUND: commit `015db9a0` (Task 1 RED)
- FOUND: commit `8695c1d1` (Task 1 GREEN)
- FOUND: commit `735c4547` (Task 2)
- FOUND: commit `72e21f3f` (Task 3)

All acceptance-criteria grep counts confirmed (see "Acceptance criteria" section above).

Sacred SHA hook PASSED on all 4 task commits (`[sacred-sha] PASS: 20 files verified`). Zero edits under `liv/packages/core/**`.

TDD gate compliance: RED commit `015db9a0` precedes GREEN commit `8695c1d1` in linear git history. Plan-level `type: execute` (not `type: tdd`), but Task 1 specifically declared `tdd="true"` and the RED → GREEN sequence is intact.
