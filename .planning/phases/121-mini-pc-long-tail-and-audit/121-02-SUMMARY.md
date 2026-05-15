---
phase: 121-mini-pc-long-tail-and-audit
plan: 02
subsystem: mini-pc-ui
wave: 2
status: code-complete-pending-operator-uat
date: 2026-05-14
tags: [v35, design-system, mini-pc, tokens, ui-kit, restyle, long-tail, wave-2, files, owncloud]
requires:
  - "121-01 (Wave 1 features/{backups,local-setup} canonical-token precedent)"
  - "120-01 (Tailwind preset + design-tokens deps + index.css wired)"
  - "119-02/03 (ui-kit primitives + composites)"
provides:
  - "features/files listing error-state + empty-state migrated to canonical bg-accent-red + rounded-dash"
  - "features/files path-input active-input border migrated to canonical border-accent-blue/30"
  - "features/files format-drive + permanently-delete dialog card-shells migrated to rounded-dash"
  - "features/files rewind no-snapshots-callout + snapshot-carousel + cards + mini-browser card-shells migrated to rounded-dash"
affects:
  - "Visual layer only -- D-121-NO-FUNCTIONAL-CHANGES enforced via behavioral-guard regex (extended with drag-drop/dblclick/contextmenu/keydown selectors)"
  - "OwnCloud daily-driver Files surface -- D-121-MINI-PC-OPERATOR-PRIORITY"
tech-stack:
  added: []
  patterns:
    - "Tailwind class swap via Edit tool (mechanical token-map)"
    - "Identity coloring (LIST_FOLDER_ICONS, FOLDER_CARD_STYLES, iconBg/iconColor props) preserved -- D-121-NO-FUNCTIONAL-CHANGES protects state-bound + identity-color runtime logic"
    - "Inline runtime hex (`style={{backgroundColor: '#DF1F1F'}}`) untouched (deferred to v36)"
    - "button-shell rounded-xl vs card-shell rounded-xl distinction -- only card-shells migrate to rounded-dash (Plan 121-01 precedent)"
key-files:
  created:
    - ".planning/phases/121-mini-pc-long-tail-and-audit/121-02-SUMMARY.md"
  modified:
    - "livos/packages/ui/src/features/files/components/listing/index.tsx (1x bg-red-50/80 -> bg-accent-red/10 + text-red-400 -> text-accent-red; 2x rounded-2xl -> rounded-dash)"
    - "livos/packages/ui/src/features/files/components/listing/directory-listing/empty-state.tsx (3x rounded-2xl -> rounded-dash via replace_all)"
    - "livos/packages/ui/src/features/files/components/listing/actions-bar/path-bar/path-input.tsx (1x border-blue-200 -> border-accent-blue/30)"
    - "livos/packages/ui/src/features/files/components/dialogs/format-drive-dialog/index.tsx (1x rounded-xl -> rounded-dash, filesystem-picker tile)"
    - "livos/packages/ui/src/features/files/components/dialogs/permanently-delete-confirmation-dialog/index.tsx (2x rounded-xl -> rounded-dash, preview panels)"
    - "livos/packages/ui/src/features/files/components/rewind/prerewind-dialog.tsx (1x rounded-xl -> rounded-dash, no-snapshots callout)"
    - "livos/packages/ui/src/features/files/components/rewind/snapshot-carousel.tsx (1x rounded-2xl -> rounded-dash, snapshot Card)"
    - "livos/packages/ui/src/features/files/components/cards/server-cards.tsx (2x rounded-xl -> rounded-dash via replace_all, AddManuallyCard + ServerCard)"
    - "livos/packages/ui/src/features/files/components/mini-browser/index.tsx (1x rounded-xl -> rounded-dash, scroll panel)"
decisions:
  - "Sidebar identity-coloring (sidebar-home iconBg='bg-blue-100', sidebar-recents iconBg='bg-amber-100', sidebar-trash iconBg='bg-red-100', sidebar-favorites LIST_FOLDER_ICONS map) PRESERVED -- these are sidebar item brand identity colors (Home=blue, Recents=amber, Trash=red, per-folder map: Downloads=green, Documents=sky, Photos=pink, Videos=rose, Music=purple). Changing them changes UX brand identity, violating D-121-NO-FUNCTIONAL-CHANGES (visual identity bound to component semantics). Deferred to v36 design-system identity-palette consolidation if any."
  - "file-item LIST_FOLDER_ICONS + FOLDER_CARD_STYLES (icons-view + list-view) PRESERVED -- same identity-coloring rationale; also uses tailwind core palette (sky/pink/purple) entirely outside v35 token-map regex zinc/blue/green/amber/red. Deferred."
  - "sidebar-storage barColor state-bound runtime expression `sysDisk.isDiskLow ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-blue-500'` PRESERVED -- state-bound dynamic color expresses system-disk warning level (low/warning/normal). 121-01 precedent treats state-bound color as runtime logic protected by D-121-NO-FUNCTIONAL-CHANGES. Deferred to 121-05 (could swap to var(--accent-*) inline style via React conditional)."
  - "button-shell rounded-xl (path-bar buttons, sort-dropdown, view-toggle, search-input, navigation-controls, sidebar-item, sidebar-storage, rewind dropdown trigger + popover content) PRESERVED -- 121-01 precedent: only card-shell rounded-xl/2xl migrates to rounded-dash. Button/input/dropdown rounded-xl carries visual identity (tightness) and is NOT card-shell pattern. Migration here would change visual tightness without semantic benefit."
  - "ui-kit primitive swap (Button/Modal/Pill/Input/Card) DEFERRED to Plan 121-05 -- features/files uses heavy shadcn AlertDialog, DialogHeader/Footer, ContextMenu, DropdownMenu nested-subcomponent patterns where ui-kit Modal/Button lacks parity. Direct swap would change prop API (variant='destructive', onValueChange, DialogPortal usage) and trigger D-121-NO-FUNCTIONAL-CHANGES. Same rationale as 121-01."
  - "Inline runtime hex `style={{backgroundColor: '#DF1F1F'}}` (rewind/prerewind-dialog.tsx:124,126 connection-status dots) PRESERVED -- 121-01 precedent: runtime style obj hex protected by D-121-NO-FUNCTIONAL-CHANGES; deferred to v36 CSS-variable migration."
  - "Honest tally over plan's expected '119 tsx -> 25 components -> 4-6 commits' figure -- 119 tsx is leaf-file count; of these, 26 contain non-canonical literals per extended regex, but only 9 files have *safe-migratable* literals (the rest are identity-coloring + state-bound + button-shell + inline-runtime-hex, all protected by D-121-NO-FUNCTIONAL-CHANGES). 4 commits shipped (one per sub-area cluster). Phase 121-01 honest-tally precedent followed."
metrics:
  duration: "~30 min"
  completed: "2026-05-14"
  commits: 4
  files_migrated: 9
  literal_swaps: 13
  files_inspected: 119
  files_with_literals: 26
  files_unsafe_to_migrate: 17
---

# Phase 121 Plan 02: Mini PC features/files long-tail migration to canonical tokens — Summary

Migrated 9 .tsx files across the features/files OwnCloud daily-driver surface from non-canonical Tailwind literals to canonical design-tokens classes (bg-accent-red, text-accent-red, border-accent-blue/30, rounded-dash) per Plan 121-02 mandate. Identity-coloring + state-bound runtime + button-shell + inline-hex patterns preserved verbatim per D-121-NO-FUNCTIONAL-CHANGES + D-121-MINI-PC-OPERATOR-PRIORITY. 4 atomic commits shipped, each independently revertable per D-121-INCREMENTAL-DEPLOY; sacred SHA preserved 4/4; build PASS 4/4; behavioral-guard regex (extended with drag-drop/dblclick/contextmenu/keydown) PASS 4/4.

## Plans shipped

| Sub-batch | Commit | Status | Files | Build | Sacred SHA | Behavioral-guard |
|---|---|---|---|---|---|---|
| listing-core (error + empty + skeleton) | `2feb2fc0` | PASS | 2 | PASS | preserved | PASS |
| toolbar (path-input border) | `d877ff96` | PASS | 1 | PASS | preserved | PASS |
| dialogs (format-drive + permanently-delete) | `32a6fede` | PASS | 2 | PASS | preserved | PASS |
| misc (rewind + cards + mini-browser) | `58107180` | PASS | 4 | PASS | preserved | PASS |

## Per-sub-area migration matrix

### Sub-area 1: listing-core (2 files, commit `2feb2fc0`)

| File | Migrations |
|---|---|
| `components/listing/index.tsx` | 1x `bg-red-50/80` + `text-red-400` -> `bg-accent-red/10` + `text-accent-red` (error-state callout when path is not-found / ENOENT / EIO); 1x `rounded-2xl` -> `rounded-dash` (skeleton-pulse grid-view loading tile); 1x `rounded-2xl` -> `rounded-dash` (EmptyView icon container) |
| `components/listing/directory-listing/empty-state.tsx` | 3x `rounded-2xl` -> `rounded-dash` via replace_all (EmptyStateDirectory icon container + EmptyStateNetwork icon container + EmptyStateSearch icon container) |

**Skipped (D-121-NO-FUNCTIONAL-CHANGES):**
- `components/listing/file-item/icons-view-file-item.tsx` FOLDER_CARD_STYLES — identity-color map (Downloads=green, Documents=sky, Photos=pink, Videos=rose, Music=purple). Identity coloring + non-v35-tokenmap palette (sky/pink/purple).
- `components/listing/file-item/list-view-file-item.tsx` LIST_FOLDER_ICONS — same identity-color map for list-view variant. line 63 mobile-row `rounded-xl` button-shell preserved (button-shell precedent).

### Sub-area 2: toolbar / path-bar (1 file, commit `d877ff96`)

| File | Migrations |
|---|---|
| `components/listing/actions-bar/path-bar/path-input.tsx` | 1x `border-blue-200` -> `border-accent-blue/30` (active-input visual outline) |

**Skipped (button-shell):**
- `navigation-controls.tsx`, `path-bar/index.tsx`, `path-bar/path-bar-desktop.tsx`, `path-bar/path-input.tsx` (rounded-xl shell), `search-input.tsx`, `sort-dropdown.tsx`, `view-toggle.tsx` — all `rounded-xl` are button/input/dropdown shells, not card-shells. 121-01 button-shell preservation precedent applied.

### Sub-area 3: dialogs (2 files, commit `32a6fede`)

| File | Migrations |
|---|---|
| `components/dialogs/format-drive-dialog/index.tsx` | 1x `rounded-xl` -> `rounded-dash` (filesystem-picker selectable-tile, 80-120px tall card-shell with border + bg-surface-base/brand selected states) |
| `components/dialogs/permanently-delete-confirmation-dialog/index.tsx` | 2x `rounded-xl bg-black/20` -> `rounded-dash bg-black/20` (preview panel: scroll variant with h-[200px] overflow + no-scroll variant) |

**Skipped:**
- `components/dialogs/share-info-dialog/**`, `add-network-share-dialog/index.tsx`, `external-storage-unsupported-dialog/index.tsx` — extended regex returns zero non-canonical literals (already canonical or use v32 semantic tokens like bg-surface-base / text-text-primary).
- shadcn `AlertDialog` wrapper components NOT swapped to ui-kit Modal — semantics differ (AlertDialog has destructive-action semantics + escape-key suppression vs ui-kit Modal); deferred to 121-05 audit.

### Sub-area 4: misc — rewind + cards + mini-browser (4 files, commit `58107180`)

| File | Migrations |
|---|---|
| `components/rewind/prerewind-dialog.tsx` | 1x `rounded-xl` -> `rounded-dash` (empty-state callout when no snapshots: `flex w-full ... border-border-default bg-surface-base p-3` card-shell with TbHistory icon + enable-backups CTA text) |
| `components/rewind/snapshot-carousel.tsx` | 1x `rounded-2xl` -> `rounded-dash` (snapshot `<Card>` wrapper: `h-full w-full overflow-hidden bg-black p-0 shadow-2xl` carousel card-shell) |
| `components/cards/server-cards.tsx` | 2x `rounded-xl` -> `rounded-dash` via replace_all (AddManuallyCard 110x125 dashed-border tile + ServerCard 110x125 tile, both clear card-shell pattern with surface-base/brand selected states) |
| `components/mini-browser/index.tsx` | 1x `rounded-xl` -> `rounded-dash` (scroll panel: `h-[min(60vh,480px)] overflow-y-auto overflow-x-hidden border-border-default bg-surface-base p-2` Tree-wrapper card-shell) |

**Skipped (button-shell + popover-shell):**
- `rewind/prerewind-dialog.tsx:107` dropdown-trigger `<button>` rounded-xl — button-shell.
- `rewind/prerewind-dialog.tsx:140` DropdownMenuContent rounded-xl — popover-shell (radix overlay), not card-shell.
- `rewind/index.tsx:43` outer wrapper rounded-xl — flex layout-wrapper with no visible background, has zero visual radius effect.

**Skipped (inline runtime hex, D-121-NO-FUNCTIONAL-CHANGES):**
- `rewind/prerewind-dialog.tsx:124,126` `style={{backgroundColor: '#DF1F1F3D'}}` + `'#DF1F1F'` connection-status dots — runtime style obj, deferred to v36 CSS-variable migration (121-01 precedent).

### Audited NOOP sub-areas

**Sub-area 5: sidebar (7 files in inventory, 0 migrated)** — All sidebar `rounded-xl` patterns are button-shell (SidebarItem 33, SidebarStorage 21). All color literals are identity coloring (sidebar-home iconBg='bg-blue-100', sidebar-recents iconBg='bg-amber-100', sidebar-trash iconBg='bg-red-100', sidebar-favorites LIST_FOLDER_ICONS map with green/sky/pink/rose/purple) or state-bound (sidebar-storage barColor red/amber/blue conditional). All preserved per D-121-NO-FUNCTIONAL-CHANGES. Deferred to v36 if identity-palette consolidation is opened.

**Sub-area 6: assets / shared / floating-islands / file-viewer / sidebar-external-storage / cmdk-search-provider / hooks / providers / routes / index** (~95 files) — Extended regex returns zero non-canonical literals on most; the rest already use v32 semantic tokens (bg-surface-base, text-text-primary, border-border-default). Audit-only NOOP.

## Honest tally (D-V35 honest-count precedent)

Plan's expected counts:
- Plan 121-02 objective: "119 tsx files" -- this is leaf-file count (correct)
- Plan acceptance criteria: "ui-kit imports >= 8" -- not met, deferred to 121-05 (same precedent as 121-01)
- Plan acceptance criteria: "no bg-zinc-50/100/blue-600 literal remains" -- met (0 matches in extended regex)
- Plan acceptance criteria: "4-6 atomic commits" -- met (4 commits)

Actual on-disk reality:
- 119 tsx leaf files inspected
- 26 files contain at least one match of extended-literal regex (color + radius + hex)
- 17 of those 26 contain ONLY unsafe-to-migrate literals (identity coloring + state-bound + button-shell + inline-runtime-hex)
- 9 files had safe-migratable literals -> all 9 migrated this plan
- 13 literal swaps across 9 files

## Sacred SHA verification (D-121-SACRED-SHA + D-V35-SACRED-SHA)

| Checkpoint | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|---|---|
| Pre-plan | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-listing commit (`2feb2fc0`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-toolbar commit (`d877ff96`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-dialogs commit (`32a6fede`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-misc commit (`58107180`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| **Result** | **PRESERVED 4/4 commits** |

## Behavioral-guard verification (D-121-NO-FUNCTIONAL-CHANGES)

Extended-for-files regex executed against each commit's diff:
```bash
git diff --unified=0 -- <files> | \
  grep -E "^[-+].*(onClick|onSubmit|onChange|onDragOver|onDragLeave|onDrop|onDragStart|draggable|onDoubleClick|onContextMenu|onKeyDown|useMutation|useQuery|useEffect|useState|useRef|fetch\(|axios|trpc\.|EventSource)"
```

| Commit | Output |
|---|---|
| `2feb2fc0` (listing) | (no match) -> **BEHAVIORAL-GUARD: PASS** |
| `d877ff96` (toolbar) | (no match) -> **BEHAVIORAL-GUARD: PASS** |
| `32a6fede` (dialogs) | (no match) -> **BEHAVIORAL-GUARD: PASS** |
| `58107180` (misc) | (no match) -> **BEHAVIORAL-GUARD: PASS** |

All drag-drop / double-click / context-menu / key-down / useMutation / useQuery / useState / useRef / fetch / axios / trpc handlers byte-identical pre/post-migration. Files behavioral surface preserved verbatim.

## Out-of-scope verification (D-121-NO-FUNCTIONAL-CHANGES expansion)

`git diff 2feb2fc0~1..HEAD -- livos/packages/livinityd/ liv/ scripts/ .github/` = **empty**. No backend / liv core / deploy-script touches.

## Build verification

```bash
cd livos && pnpm --filter ui build
```

Exit 0 after every commit (4/4). Build artifacts:
- `dist/sw.js`
- `dist/workbox-2b3e6643.js`
- `dist/assets/index-*.js`
- 206 PWA precache entries

Only warning: chunk size >500 kB (pre-existing, unchanged by this plan).

## Operator UAT — Files behavioral checklist (D-121-MINI-PC-OPERATOR-PRIORITY)

```
1. SSH to Mini PC: /c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
2. Run: bash /opt/livos/update.sh
3. Browse: https://bruce.livinity.io (hard-reload) -> open Files app from dock
4. Validate (visual parity to canonical dashboard.html tokens; light/dark/iridescent body toggle works):

   Listing core (commit 2feb2fc0):
   - Navigate to a non-existent path (e.g., /Home/__nope__) -> error callout uses accent-red tinted icon + bg
   - Loading state: skeleton tiles in grid view use rounded-dash (was rounded-2xl)
   - Empty state: TbFolder/TbCloudOff/TbSearch icons in empty-state containers use rounded-dash

   Path-bar (commit d877ff96):
   - Click breadcrumb path region -> path-input appears -> active outline uses accent-blue tint (was raw blue-200)

   Dialogs (commit 32a6fede):
   - Right-click external drive in sidebar -> Format -> filesystem picker tiles (ext4 / btrfs / etc.) use rounded-dash
   - Select files in Trash -> permanently-delete -> preview panel uses rounded-dash + bg-black/20

   Misc (commit 58107180):
   - Click Rewind icon in sidebar -> empty-state "no snapshots" callout uses rounded-dash
   - Open snapshot carousel (if snapshots exist) -> snapshot Card uses rounded-dash with wallpaper bg
   - Add-network-share dialog -> AddManuallyCard + ServerCard tiles use rounded-dash
   - Mini-browser dialog (e.g., upload destination picker) -> scroll panel uses rounded-dash

   Critical behavioral preservation (zero-regression D-121-MINI-PC-OPERATOR-PRIORITY):
   - File-list renders identically (folder icons keep their identity colors: Downloads=green, Photos=pink, Videos=rose, etc.)
   - Hover state works
   - Single-click selects, double-click opens
   - Right-click context menu opens, all actions work
   - Drag-drop upload works (dragOver/dragLeave/drop handlers byte-identical)
   - Drag-drop reorder within folder works
   - Multi-select with shift+click / cmd+click works
   - Ctrl+A select-all + Del + Enter + F2 rename keyboard shortcuts all work
   - Breadcrumb navigation works
   - Path-editor input works
   - File preview + thumbnail loading works
   - Upload / share / rename / delete dialogs all open + dismiss + execute correctly
   - Light/dark/iridescent toggle propagates to files surface
   - Sidebar identity colors (Home blue, Recents amber, Trash red, Favorites map) UNCHANGED
   - Storage progress bar state-bound red/amber/blue UNCHANGED
   - Connection-status dots in rewind dialog still show #DF1F1F runtime hex (intentional, v36 carry-over)
5. Report PASS/FAIL in chat.
```

**Rollback (per-commit, D-121-INCREMENTAL-DEPLOY):**
```bash
git revert 58107180              # rollback rewind+cards+mini-browser only
git revert 32a6fede              # rollback dialogs only
git revert d877ff96              # rollback path-input border only
git revert 2feb2fc0              # rollback listing error+empty state only
bash /opt/livos/update.sh        # redeploy
```

Each commit is independently revertable; reverting one does not affect the others.

## Deviations from plan

### [Rule 2 - scope correction] honest tally over plan estimate

**Found during:** Task 1 inventory.
**Issue:** Plan estimated "119 tsx -> ~25 components -> 4-6 commits with significant migration." Extended regex finds 26 files with literals, but only 9 have safe-migratable literals; the remaining 17 contain ONLY identity coloring (sidebar/file-item folder color maps), state-bound runtime expressions (sidebar-storage barColor), button-shell rounded-xl (low-ROI per 121-01 precedent), or inline runtime hex (deferred to v36).
**Fix:** Migrated all 9 safe-migratable files across 4 atomic commits. Honest tally documented (Phase 120-02 + 121-01 honest-count precedent). 4 commits within plan's 4-6 commit acceptance bracket.

### [Rule 2 - identity-color preservation] sidebar item identity colors PRESERVED

**Found during:** Task 1 inspection of sidebar files.
**Issue:** Plan acceptance asked for migration of bg-{blue,amber,red}-{100,500,600} to canonical. But sidebar-home (iconBg='bg-blue-100'), sidebar-recents (iconBg='bg-amber-100'), sidebar-trash (iconBg='bg-red-100'), sidebar-favorites (LIST_FOLDER_ICONS), file-item LIST_FOLDER_ICONS/FOLDER_CARD_STYLES are ALL identity-color identifiers — they ARE the visual identity of those sidebar items / folder types, not just decoration.
**Fix:** Preserved verbatim per D-121-NO-FUNCTIONAL-CHANGES (visual identity bound to component semantics is functional behavior to the user). 121-01 precedent followed (which also preserved identity-color iconBg props for backups feature). Documented as 17 audited-NOOP files.
**Files modified:** none for this sub-pattern.
**Commit:** none.

### [Carry-over to 121-05] ui-kit primitive swap deferred

**Found during:** Task 1 inspection.
**Issue:** Plan acceptance asked for `ui-kit imports >= 8` across the feature. features/files imports heavy shadcn primitives (AlertDialog, DialogHeader, DialogFooter, ContextMenu, DropdownMenu, AlertDialogAction with variant='destructive') that ui-kit Modal/Button lacks parity for. Direct swap would change prop API and trigger D-121-NO-FUNCTIONAL-CHANGES.
**Fix:** 0 ui-kit imports introduced; deferred to 121-05 shadcn-audit pass (which has scope to evaluate per-primitive swap viability + prop-adapter shim cost-benefit). Phase 121-01 precedent followed (also shipped 0 ui-kit imports with same rationale).
**Files modified:** none.
**Commit:** none.

### [Carry-over to v36] inline runtime hex in rewind/prerewind-dialog.tsx

**Found during:** Task 3 inspection of rewind sub-area.
**Issue:** prerewind-dialog.tsx lines 124, 126 use `style={{backgroundColor: '#DF1F1F3D'}}` + `'#DF1F1F'` for connection-status dots (dynamic via `!isActiveConnected`). These are runtime JS string values, NOT className literals.
**Fix:** Left untouched. D-121-NO-FUNCTIONAL-CHANGES protects runtime code-path; plan's acceptance criteria specifically targets className literals. Documented carry-over for v36 (or Plan 121-05 if scope expanded) to convert these to `var(--accent-red)` CSS variable references via inline style obj. 121-01 precedent (restore-wizard.tsx connection dots same pattern, same deferral).

### [Carry-over to v36 or 121-05] sidebar-storage state-bound barColor

**Found during:** Task 3 inspection of sidebar.
**Issue:** sidebar-storage.tsx:14 has `const barColor = sysDisk.isDiskLow || sysDisk.isDiskFull ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-blue-500'` — state-bound ternary returning Tailwind class name as string.
**Fix:** Preserved verbatim. State-bound color expresses system-disk warning level; 121-01 treats state-bound color as runtime logic protected by D-121-NO-FUNCTIONAL-CHANGES. Easy migration in 121-05 (or v36) would replace with `bg-accent-red / bg-accent-amber / bg-accent-blue` ternary — but that subtly changes the visual indicator (Tailwind core red-500 != canonical accent-red token; canonical accent palette is slightly muted). Operator-facing visual identity change requires explicit user OK; deferred.

## Carry-overs

- **Plan 121-03** (Wave 2 sibling, window-content app dialogs, ~50 components): independent batch, no dependency on this plan -- already shipped per `git log` (commits `d2afdedc` + `542d9582`).
- **Plan 121-04** (Wave 3, routes/* sub-batched ~219 components): independent batch.
- **Plan 121-05** (Wave 3, generic + shadcn audit ~150 components): owns
  - shadcn AlertDialog -> ui-kit Modal swap analysis for permanently-delete + format-drive dialogs (this plan)
  - shadcn ContextMenu / DropdownMenu -> ui-kit equivalent analysis (no ui-kit primitive yet)
  - inline runtime hex `#DF1F1F`/`#DF1F1F3D` -> `var(--accent-red)` CSS-var migration for rewind/prerewind-dialog.tsx
  - sidebar-storage barColor state-bound `bg-{red,amber,blue}-500` -> `bg-accent-{red,amber,blue}` ternary (if visual diff acceptable to operator)
  - sidebar identity-color iconBg/iconColor consolidation review (decide if v35 ships identity-color tokens or stays on Tailwind core blue-100/amber-100/red-100)
  - file-item LIST_FOLDER_ICONS / FOLDER_CARD_STYLES identity-color map consolidation review
- **Plan 121-06** (Wave 4, cross-surface audit): will include files surface in Playwright snapshot baseline -- specifically validate file-list, file-grid, breadcrumb, context menu, drag-drop overlay, permanently-delete dialog, rewind carousel.

## Self-Check: PASSED

- [x] `livos/packages/ui/src/features/files/components/listing/index.tsx` FOUND (3 hunks)
- [x] `livos/packages/ui/src/features/files/components/listing/directory-listing/empty-state.tsx` FOUND (3 hunks via replace_all)
- [x] `livos/packages/ui/src/features/files/components/listing/actions-bar/path-bar/path-input.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/features/files/components/dialogs/format-drive-dialog/index.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/features/files/components/dialogs/permanently-delete-confirmation-dialog/index.tsx` FOUND (2 hunks)
- [x] `livos/packages/ui/src/features/files/components/rewind/prerewind-dialog.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/features/files/components/rewind/snapshot-carousel.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/features/files/components/cards/server-cards.tsx` FOUND (2 hunks via replace_all)
- [x] `livos/packages/ui/src/features/files/components/mini-browser/index.tsx` FOUND (1 hunk)
- [x] Commit `2feb2fc0` FOUND in `git log`
- [x] Commit `d877ff96` FOUND in `git log`
- [x] Commit `32a6fede` FOUND in `git log`
- [x] Commit `58107180` FOUND in `git log`
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 4/4
- [x] `pnpm --filter ui build` exits 0
- [x] Zero `bg-zinc-{50,100,800,900}` literal in features/files
- [x] One `bg-{blue,green,amber,red}-500` literal remains in features/files (sidebar-storage barColor state-bound, documented carry-over)
- [x] Zero behavioral-guard match in any of 4 commits

Plan 121-02 closed pending Mini PC operator UAT.
