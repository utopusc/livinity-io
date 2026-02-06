---
phase: v1.1-04-settings-redesign
plan: 02
subsystem: settings-ui
tags: [semantic-tokens, settings, shared-components, toggle-row, info-card]

dependency_graph:
  requires: [04-01]
  provides: [settings-toggle-row, settings-info-card, settings-section-content-migrated]
  affects: [04-03]

tech_stack:
  added: []
  patterns:
    - "SettingsToggleRow: reusable toggle+switch row with semantic tokens"
    - "SettingsInfoCard: reusable info card with variant support (default/success/warning/danger)"
    - "Colored status badges preserved as-is (green/red/orange/sky/indigo/blue)"

key_files:
  created:
    - livos/packages/ui/src/routes/settings/_components/settings-toggle-row.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-info-card.tsx
  modified:
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
    - livos/packages/ui/src/routes/settings/ai-config.tsx
    - livos/packages/ui/src/routes/settings/2fa-enable.tsx
    - livos/packages/ui/src/routes/settings/2fa-disable.tsx
    - livos/packages/ui/src/routes/settings/advanced.tsx
    - livos/packages/ui/src/routes/settings/_components/wallpaper-picker.tsx

decisions:
  - id: "04-02-toggle-row-pattern"
    decision: "SettingsToggleRow accepts className prop for padding overrides (p-3 for compact tabs)"
    rationale: "Retry and heartbeat tabs use tighter p-3 layout vs standard p-4"
  - id: "04-02-info-card-variants"
    decision: "SettingsInfoCard variant colors use raw Tailwind (green/orange/red) not semantic tokens"
    rationale: "Status semantics are domain-specific (success/warning/danger), not generic surface tokens"
  - id: "04-02-tab-overrides-preserved"
    decision: "Tab consumer overrides (bg-white/5, data-[state=active]) left for Plan 04-03"
    rationale: "Linter auto-cleaned most overrides since base Tabs already provides semantic defaults from 04-01"
  - id: "04-02-wallpaper-ring"
    decision: "ring-white/50 on wallpaper picker kept as-is (not migrated)"
    rationale: "Active selection indicator on wallpaper thumbnails, not a generic surface"

metrics:
  duration: "12.2 min"
  completed: "2026-02-06"
---

# Phase 4 Plan 2: Settings Section Content & Standalone Pages Migration Summary

Two shared components extracted (SettingsToggleRow, SettingsInfoCard) and all 13 section functions plus 5 standalone pages migrated from raw Tailwind values to semantic tokens.

## What Was Done

### Task 1: Extract SettingsToggleRow and SettingsInfoCard (548ef45)

**settings-toggle-row.tsx** -- New shared component:
- Props: title, description, checked, onCheckedChange, disabled, className
- Semantic tokens: rounded-radius-md, border-border-default, bg-surface-base, text-body, text-caption, text-text-secondary
- className prop allows padding overrides (p-3 for compact layouts)

**settings-info-card.tsx** -- New shared component:
- Props: icon, title, description, children, variant, className
- Variants: default (border-default/surface-base), success (green-500), warning (orange-500), danger (red-500)
- Icon container: rounded-radius-sm, bg-surface-2, h-icon-md/w-icon-md
- Children slot for custom trailing content (e.g., status badges)

### Task 2: Migrate Section Functions & Standalone Pages (696da45)

**settings-content.tsx -- All 13 section functions migrated:**

*AccountSection:* text-body-sm text-text-secondary description

*WallpaperSection:* rounded-radius-md bg-surface-base thumbnails (ring-white preserved for selection)

*TwoFaSection:*
- Back button: text-body-sm text-text-secondary hover:text-text-primary
- Status card: rounded-radius-md border-border-default bg-surface-base
- Typography: text-body font-medium title, text-caption text-text-secondary description
- Loader: text-text-tertiary spinner

*AiConfigSection:*
- Replaced inline card with SettingsInfoCard component
- Labels: text-caption text-text-secondary
- Help text: text-caption-sm text-text-tertiary
- Green status badge preserved as-is

*NexusConfigSection:*
- 5 toggle rows replaced with SettingsToggleRow (show-steps, show-reasoning, stream, retry, heartbeat)
- All labels: text-caption text-text-secondary
- Save border: border-border-default
- Danger zone: rounded-radius-md (orange colors preserved)
- Tab overrides: linter auto-cleaned redundant overrides

*IntegrationsSection (Telegram + Discord panels):*
- Brand cards: rounded-radius-md, bg-surface-2 icon container
- Typography: text-body-lg font-semibold title, text-caption text-text-secondary description
- Status: text-caption text-green-400/text-red-400 (colors preserved)
- Token input: text-text-secondary hover:text-text-primary toggle button
- Help text: text-caption-sm text-text-tertiary

*BackupsSection:*
- Success card: rounded-radius-md, rounded-radius-sm icon container (green colors preserved)
- Repository list: rounded-radius-sm border-border-default bg-surface-base
- No-backups state: replaced with SettingsInfoCard
- Restore description: text-body-sm text-text-secondary
- All loaders and back buttons: semantic tokens

*MigrationSection:*
- Not-available state: replaced with SettingsInfoCard
- Migration steps: rounded-radius-md border-border-default bg-surface-base cards
- Step numbers: rounded-radius-sm (blue colors preserved)
- Typography: text-body font-medium, text-caption text-text-secondary

*LanguageSection:* text-body-sm text-text-secondary description

*TroubleshootSection:*
- Log headings: text-body-sm font-medium text-text-secondary
- Log viewers: rounded-radius-sm bg-black (bg-black preserved), text-caption-sm text-text-secondary
- No-app-selected: rounded-radius-md border-border-default bg-surface-base, text-text-tertiary icon
- Full logs dialog: border-border-default, rounded-radius-sm close button, hover:bg-surface-2
- Link buttons: text-caption text-blue-400 (blue preserved)

*AdvancedSection:*
- Beta and DNS toggle rows: replaced with SettingsToggleRow
- Factory reset: rounded-radius-md, text-body font-medium text-red-400, text-caption text-text-secondary (red preserved)

*SoftwareUpdateSection:* text-body-sm text-text-secondary description

**Standalone pages migrated:**

*ai-config.tsx:* rounded-radius-md/border-border-default/bg-surface-base card, rounded-radius-sm/bg-surface-2 icon, text-body/text-body-sm/text-caption/text-caption-sm semantic typography, text-text-secondary/text-text-tertiary text colors, green badge preserved

*2fa-enable.tsx:* paragraphClass text-body-sm/text-text-secondary, inline text-body-sm/text-text-secondary, title text-body-lg, QR wrapper rounded-radius-sm (bg-white preserved)

*2fa-disable.tsx:* Dialog inner text-heading-sm, inline title text-body-lg, description text-body-sm/text-text-secondary

*advanced.tsx:* cardClass bg-surface-1 (from bg-white/6), CardText title text-body/text-text-tertiary icon, description text-body-sm/text-text-tertiary

*wallpaper-picker.tsx:* WallpaperItem bg-surface-2 (from bg-white/10), ring-white/50 preserved for active selection

**Cleanup:** Removed unused imports (ChevronDown, ReactNode, Switch) from settings-content.tsx

## Verification Results

- TypeScript: No new type errors (all errors pre-existing in backend livinityd modules)
- bg-white/5 in settings-content.tsx: 0 occurrences
- rounded-12 in settings-content.tsx: 0 occurrences
- border-white/10 in settings-content.tsx: 0 occurrences
- bg-white/5 in ai-config.tsx: 0 occurrences
- bg-white/6 in advanced.tsx: 0 occurrences
- text-white/50 in ai-config.tsx: 0 occurrences
- text-white/60 in 2fa-enable.tsx: 0 occurrences
- opacity-45 in advanced.tsx: 0 occurrences
- bg-white/10 in wallpaper-picker.tsx: 0 occurrences
- SettingsToggleRow usages: 9 (1 import + 8 component uses)
- SettingsInfoCard usages: 5 (1 import + 4 component uses)
- Colored status badges preserved: 19 instances across all sections

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Linter auto-cleaned Tab consumer overrides**
- **Found during:** Task 2
- **Issue:** Tab overrides (bg-white/5, data-[state=active]:bg-white/10) in IntegrationsSection, BackupsSection, TroubleshootSection were auto-removed by linter since base Tabs component already provides these defaults from Plan 04-01
- **Fix:** Accepted linter changes -- the overrides were redundant after 04-01 Tabs base migration
- **Files modified:** settings-content.tsx
- **Impact:** Reduces scope of Plan 04-03 (fewer Tab overrides to clean)

**2. [Rule 3 - Blocking] Concurrent 04-03 execution absorbed settings-content.tsx changes**
- **Found during:** Task 2 commit
- **Issue:** A parallel process committed settings-content.tsx changes as part of 04-03 docs commit
- **Fix:** Remaining standalone page changes committed separately as 04-02 work
- **Files modified:** Commit split across 548ef45 (Task 1) and 696da45 (Task 2)

## Decisions Made

1. **SettingsToggleRow className override** -- Allows `p-3` for compact tabs (retry, heartbeat) while defaulting to `p-4`
2. **SettingsInfoCard variant colors** -- Raw Tailwind colors for domain-specific status semantics (not generic surface tokens)
3. **Wallpaper ring preserved** -- ring-white/50 is an active selection indicator, not a generic surface
4. **Tab overrides auto-cleaned** -- Linter removed redundant overrides that matched base Tabs defaults

## Next Phase Readiness

Plan 04-03 can proceed. The NexusConfig TabsList still has compact rounded-6 overrides specific to its icon-only layout. Other Tab consumers have been auto-cleaned by the linter. Remaining 04-03 scope is primarily domain-setup.tsx and integrations standalone pages.
