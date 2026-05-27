---
phase: 224-app-store-hide-ai-tabs
plan: 02
subsystem: ui-app-store + ui-settings-sidebar
tags: [v42, ui, app-store, settings, feature-flag, filter-only]
requirements: [SC-01, SC-02, SC-03, SC-05]
dependency_graph:
  requires:
    - "hook:useV42MigrationActive (Plan 224-01)"
  provides:
    - "ui-filter:app-store-nav.ai-category-hidden-when-flag-active"
    - "ui-filter:settings-sidebar.mcp-servers-hidden-when-flag-active"
  affects:
    - "Phase 224-03 banner (consumes the same hook)"
tech_stack:
  added: []
  patterns:
    - "filter-only feature flag (additive, zero data deletion)"
    - "shared hook consumed by sibling components — no prop drilling"
    - "readonly ID list for future AI-shaped sidebar items (defensive pattern)"
key_files:
  created: []
  modified:
    - "livos/packages/ui/src/modules/app-store/app-store-nav.tsx"
    - "livos/packages/ui/src/routes/settings/_components/settings-content.tsx"
decisions:
  - "Filter callback rather than separate filter() chain in App Store nav — keeps the `discover`/`all` always-on rule and the empty-category rule in the same predicate; new flag rule sits between them for natural reading order."
  - "Module-scope `V42_HIDDEN_MENU_IDS: ReadonlyArray<SettingsSection>` typed against the existing union so any ID typo fails typecheck immediately; future AI-shaped entries can be hidden by appending one string."
  - "Two-stage `.filter().filter()` chain in `useVisibleMenuItems()` (admin gate THEN v42 gate) rather than a single combined predicate — preserves the admin-gate diff for future readers and makes either filter trivially removable."
  - "SectionContent switch case `'mcp-servers'` deliberately NOT touched — SC-03 requires the direct URL to still render so an admin who reaches `/settings/mcp-servers` via a stored bookmark / shared link / link in a docs page can still recover their pre-Phase-224 access."
  - "SettingsSection type union NOT pruned — same reason: the route handler still uses the literal `'mcp-servers'`."
  - "`categoryishDescriptions` const in app-store/constants.ts NOT touched — same filter-only rationale; the `ai` Category type stays valid for the data layer."
metrics:
  duration_seconds: 257
  tasks_completed: 2
  files_created: 0
  files_modified: 2
  commits: 2
  completed_date: "2026-05-27"
---

# Phase 224 Plan 02: App Store + Settings sidebar filters Summary

## One-liner

Two filter-only edits (App Store category nav drops the `ai` tab, Settings sidebar drops the `mcp-servers` entry) gated on the Plan-224-01 `useV42MigrationActive()` hook — fully reversible via Redis without rebuild, with the `mcp-servers` route still reachable by direct URL for admin recovery.

## What shipped

### App Store nav filter (Task 1)

**File:** `livos/packages/ui/src/modules/app-store/app-store-nav.tsx`

The `ConnectedAppStoreNav` component now consumes the hook and adds one predicate to the existing `categoriesWithApps` filter callback:

```tsx
if (v42MigrationActive && categoryId === 'ai') return false
```

That predicate sits BETWEEN the `discover`/`all` always-on rule and the empty-category drop rule, so:

- `discover` + `all` still ALWAYS render (untouched).
- `ai` is dropped when flag = true, regardless of how many AI apps exist.
- Every other category still falls through to the "only if it has apps" rule.

The `categoryishDescriptions` array in `app-store/constants.ts` was NOT mutated (verified empty `git diff` on that file). The `ai` Category type stays valid for the data layer, which means an operator flipping the Redis key to `false` instantly restores the tab on the next React refetch with zero rebuild.

### Settings sidebar filter (Task 2)

**File:** `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`

Added the hidden-ID array at module scope:

```ts
const V42_HIDDEN_MENU_IDS: ReadonlyArray<SettingsSection> = ['mcp-servers']
```

Typed against the existing `SettingsSection` union so any future ID typo fails typecheck immediately. The hook is consumed inside `useVisibleMenuItems()` and the filter chain reads:

```ts
return MENU_ITEMS
  .filter((item) => !item.adminOnly || isAdmin)
  .filter((item) => !(v42MigrationActive && V42_HIDDEN_MENU_IDS.includes(item.id)))
```

Both the desktop home-view sidebar (line ~302) AND the detail-view sidebar (`SettingsDetailView`, line ~412) consume the same `visibleItems` array, so the hide is uniform with NO half-state.

`SectionContent` switch arm `case 'mcp-servers':` (line 529) was deliberately UNTOUCHED — direct URL `/settings/mcp-servers` STILL routes to `<McpServersLazy />` for SC-03 graceful admin recovery. The `SettingsSection` type union (line 123-141) STILL contains the literal `'mcp-servers'` for the same reason.

The Plan's `<action>` noted that the other AI-shaped surfaces (`ai-config`, `liv-agent`, `autonomous-agents`, `ai-chat-settings`) were already removed from MENU_ITEMS in the prior "AI Chat teardown" — leaving the array in place is a defensive pattern that auto-suppresses any re-added entry while the migration is active.

## Commits

| Task | Description                                                     | Commit     |
| ---- | --------------------------------------------------------------- | ---------- |
| 1    | App Store `ai` category tab hidden behind v42 flag              | `e1b519f9` |
| 2    | Settings sidebar MCP Servers entry hidden behind v42 flag       | `206961bc` |

## Sacred SHA verification

D-V42-SACRED: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED. The pre-commit hook (`[sacred-sha] PASS: 20 files verified`) ran on both Task 1 and Task 2 commits and PASSED. No files under `liv/packages/core/` were touched by this plan:

```
git diff --stat 28f39757..HEAD -- liv/packages/core/
(empty)
```

## Rollback contract

D-V42-ROLLBACK reversibility (live, no restart, no code revert):

```bash
# On Mini PC, flip the Redis flag:
redis-cli -a "$REDIS_PASS" SET liv:config:liv_v42_migration_active false
# Next window-focus refetch (or 30s staleTime expiry) →
#   • App Store nav: `ai` category tab re-appears.
#   • Settings sidebar: MCP Servers entry re-appears in WORKSPACE group.
# Re-enable:
redis-cli ... DEL liv:config:liv_v42_migration_active
# (or SET ... true — equivalent, since any value != 'false' reads as ON)
```

## Acceptance criteria — all PASS

### Task 1

- `useV42MigrationActive` count in app-store-nav.tsx = **2** (1 import + 1 call) ✓
- `v42MigrationActive && categoryId === 'ai'` count = **1** ✓
- `Phase 224` comment count = **1** (>= 1) ✓
- `git diff livos/packages/ui/src/modules/app-store/constants.ts` = **empty** ✓
- UI typecheck: no new errors in `app-store-nav.tsx` (clean grep against typecheck output) ✓

### Task 2

- `useV42MigrationActive` count in settings-content.tsx = **2** (import + call) ✓
- `V42_HIDDEN_MENU_IDS` count = **2** (const decl + filter call) — meets `>= 2` ✓
- `'mcp-servers'` count = **4** (type union + MENU_ITEMS entry + SectionContent case + V42_HIDDEN_MENU_IDS) — meets `>= 3` ✓
- `case 'mcp-servers':` count = **1** (route handler intact for SC-03) ✓
- UI typecheck: settings-content error count unchanged (14 before / 14 after — confirmed via `git stash` diff) ✓

## Success criteria mapping

- **SC-01** (App Store hides `ai`): App Store nav code path: when flag=true, `categoriesWithApps` filter callback returns `false` for `categoryId === 'ai'`. ✓
- **SC-02** (Settings sidebar hides MCP Servers): `useVisibleMenuItems()` second filter chain drops the `mcp-servers` entry when flag=true. Applies to both home-view (line ~302) and detail-view (line ~412) sidebars via the shared `visibleItems` array. ✓
- **SC-03** (direct URL still works): `SectionContent` switch arm `case 'mcp-servers':` at line 529 UNTOUCHED — `<McpServersLazy />` still renders for `/settings/mcp-servers` direct visits. The `SettingsSection` type union still contains `'mcp-servers'` so the route prop typechecks. ✓
- **SC-05** (Sacred SHA unchanged): Zero edits under `liv/packages/core/` — verified via `git diff --stat 28f39757..HEAD -- liv/packages/core/` returning empty. Pre-commit hook PASSED on both task commits. ✓

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` blocks for both tasks were followed byte-for-byte (import location, comment text, predicate placement). The pre-existing typecheck errors in `settings-content.tsx` (the `role` field union access at the now-shifted line 208, plus the cluster of `Loader2` / `Link` / `ErrorBoundary` JSX-component type mismatches) are OUT OF SCOPE per executor scope boundary — none touch the Phase 224 surface, none were introduced by this plan (verified via `git stash` + before-after diff: 14 errors before, 14 errors after). The `app-store-nav.tsx` file is clean of typecheck errors entirely.

## Self-Check: PASSED

All required artifacts exist:

- FOUND: `livos/packages/ui/src/modules/app-store/app-store-nav.tsx` (modified)
- FOUND: `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` (modified)
- FOUND: commit `e1b519f9` (Task 1)
- FOUND: commit `206961bc` (Task 2)

All acceptance-criteria grep counts confirmed (see "Acceptance criteria" section above).

Sacred SHA hook PASSED on both task commits (`[sacred-sha] PASS: 20 files verified`). Zero edits under `liv/packages/core/**`.
