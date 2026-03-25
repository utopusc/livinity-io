---
phase: v1.1-04-settings-redesign
plan: 01
subsystem: settings-ui
tags: [semantic-tokens, settings, sidebar, tabs, navigation]

dependency_graph:
  requires: [v1.1-01-design-system, v1.1-03-window-sheet-system]
  provides: [settings-navigation-shell, tabs-base-component, shared-class-constants]
  affects: [04-02, 04-03]

tech_stack:
  added: []
  patterns:
    - "Settings sidebar surface hierarchy: surface-2 default, surface-3 active"
    - "Tabs base component: surface-base list, surface-2 active trigger, shadow-elevation-sm"
    - "Settings back button pattern: bg-surface-base/hover:bg-surface-1 with text-text-secondary/hover:text-text-primary"

key_files:
  created: []
  modified:
    - livos/packages/ui/src/routes/settings/_components/shared.tsx
    - livos/packages/ui/src/routes/settings/_components/list-row.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-summary.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-page-layout.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-content-mobile.tsx
    - livos/packages/ui/src/shadcn-components/ui/tabs.tsx

decisions:
  - id: "04-01-sidebar-surface"
    decision: "Sidebar active state uses bg-surface-3 (0.14) replacing bg-white/15"
    rationale: "Surface-3 at 0.14 is close to white/15 but uses semantic token for consistency"
  - id: "04-01-tabs-base"
    decision: "Tabs base defaults to dark-theme semantic tokens (surface-base list, surface-2 trigger)"
    rationale: "All Tabs consumers in settings override classNames; files/view-toggle.tsx also fully overrides — base change is safe"
  - id: "04-01-section-content-untouched"
    decision: "13 section content functions intentionally NOT migrated in this plan"
    rationale: "Section content handled in Plan 04-02 and 04-03 for manageable scope"

metrics:
  duration: "3.6 min"
  completed: "2026-02-06"
---

# Phase 4 Plan 1: Settings Navigation Shell & Shared Foundation Summary

Semantic token migration for settings sidebar, header card, shared class constants, tabs base, and mobile navigation chrome — establishing the visual foundation for the entire settings interface.

## What Was Done

### Task 1: Shared Classes, ListRow, SettingsSummary, SettingsPageLayout (935387b)

**shared.tsx** — All 5 exported class constants migrated:
- `cardTitleClass`: text-12 -> text-caption, text-white/40 -> text-text-tertiary
- `cardValueClass`: text-17 -> text-heading-sm
- `cardValueSubClass`: text-14 -> text-body, text-white/40 -> text-text-tertiary
- `cardSecondaryValueBaseClass`: text-14 -> text-body, text-white/40 -> text-text-tertiary
- `ContactSupportLink`: text-12 -> text-caption, text-white/70 -> text-text-secondary

**list-row.tsx** — Desktop and mobile variants:
- Desktop: text-14 -> text-body, text-12 -> text-caption, text-white/40 -> text-text-tertiary
- Mobile: rounded-6 -> rounded-radius-sm, bg-white/6 -> bg-surface-1, text-13 -> text-body-sm, text-12 -> text-caption, text-white/40 -> text-text-tertiary

**settings-summary.tsx** — Grid labels:
- text-14 -> text-body, opacity-40 -> text-text-tertiary (4 occurrences)

**settings-page-layout.tsx** — Standalone page header:
- border-white/10 -> border-border-default
- Back button: rounded-12 -> rounded-radius-md, bg-white/5 -> bg-surface-base, text-white/70 -> text-text-secondary, hover:bg-white/10 -> hover:bg-surface-1, hover:text-white -> hover:text-text-primary
- Title: text-20 -> text-heading
- Description: text-13 -> text-body-sm, text-white/50 -> text-text-secondary

### Task 2: Settings Content Sidebar, Header, Detail View, Mobile, Tabs (1054c1b)

**settings-content.tsx — Home sidebar:**
- Item container: rounded-10 -> rounded-radius-sm, hover:bg-white/10 -> hover:bg-surface-2
- Icon container: rounded-8 -> rounded-radius-sm, bg-white/10 -> bg-surface-2
- Icon color: text-white/70 -> text-text-secondary
- Label: text-13 -> text-body-sm
- Description: text-11 -> text-caption-sm, text-white/40 -> text-text-tertiary
- Chevron: text-white/30 -> text-text-tertiary

**settings-content.tsx — Detail sidebar:**
- Active item: bg-white/15 -> bg-surface-3
- Active icon: bg-white/20 -> bg-surface-3, inactive bg-white/10 -> bg-surface-2
- Active text: text-white -> text-text-primary, inactive text-white/70 -> text-text-secondary
- Active chevron: text-white/50 -> text-text-secondary
- Item rounded: rounded-10 -> rounded-radius-sm

**settings-content.tsx — Header card:**
- User name: text-24 -> text-heading-lg
- "Livinity" brand: opacity-40 -> text-text-tertiary

**settings-content.tsx — Detail view header:**
- Border: border-white/10 -> border-border-default
- Back button: same pattern as settings-page-layout
- Title: text-20 -> text-heading
- Description: text-13 -> text-body-sm, text-white/50 -> text-text-secondary

**settings-content-mobile.tsx:**
- Header: text-24 -> text-heading-lg, opacity-40 -> text-text-tertiary
- List container: rounded-12 -> rounded-radius-md, bg-white/5 -> bg-surface-base

**tabs.tsx — Base component redesign:**
- TabsList: bg-muted -> bg-surface-base, text-muted-foreground -> text-text-secondary, rounded-md -> rounded-radius-sm
- TabsTrigger: ring-offset-background removed, data-active:bg-background -> bg-surface-2, text-foreground -> text-text-primary, rounded-sm -> rounded-radius-sm, text-sm -> text-body-sm, shadow-sm -> shadow-elevation-sm, focus ring -> ring-3 ring-white/20
- TabsContent: ring-offset-background and ring classes removed, simplified to mt-2 focus-visible:outline-none

## Verification Results

- TypeScript: No new type errors (all errors pre-existing in backend livinityd modules)
- shared.tsx: 0 occurrences of text-white/40
- list-row.tsx: 0 occurrences of bg-white/
- settings-summary.tsx: 0 occurrences of opacity-40
- settings-page-layout.tsx: 0 occurrences of border-white/10
- settings-content.tsx: 0 occurrences of bg-white/15
- tabs.tsx: 0 occurrences of bg-muted, text-muted-foreground, ring-offset-background
- Section content functions: 13 occurrences of raw values confirmed untouched

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Sidebar surface hierarchy** — surface-2 for default icon containers and hover, surface-3 for active states. This mirrors the established pattern from Phase 2 dock design.
2. **Tabs base defaults** — Changed from shadcn light-theme defaults (bg-muted, text-foreground) to dark-theme semantic tokens. Safe because all consumers override classNames.
3. **Section content intentionally untouched** — Verified 13 raw-value occurrences remain in section functions for Plan 04-02 and 04-03.

## Next Phase Readiness

Plan 04-02 can proceed immediately. The navigation shell foundation is complete, and all shared class constants are migrated. Section content functions retain their original raw values for migration in subsequent plans.
