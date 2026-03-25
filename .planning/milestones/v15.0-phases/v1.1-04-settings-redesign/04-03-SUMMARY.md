---
phase: v1.1-04-settings-redesign
plan: 03
subsystem: settings-ui
tags: [semantic-tokens, settings, domain-setup, nexus-config, integrations, tab-cleanup]

dependency_graph:
  requires: [v1.1-01-design-system, 04-01]
  provides: [domain-setup-semantic, nexus-config-semantic, integrations-semantic, tab-overrides-cleaned]
  affects: []

tech_stack:
  added: []
  patterns:
    - "Tab base component defaults eliminate consumer overrides"
    - "Tailwind-default to semantic token migration (text-xs -> text-caption, rounded-xl -> rounded-radius-md)"

key_files:
  created: []
  modified:
    - livos/packages/ui/src/routes/settings/domain-setup.tsx
    - livos/packages/ui/src/routes/settings/nexus-config.tsx
    - livos/packages/ui/src/routes/settings/integrations.tsx
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx

decisions:
  - id: v1.1-04-03-domain-setup-tailwind-defaults
    description: "domain-setup.tsx Tailwind defaults migrated: text-xs->text-caption, text-sm->text-body, text-base->text-body-lg, rounded-xl->rounded-radius-md"
  - id: v1.1-04-03-tab-override-cleanup
    description: "Tab consumer overrides (bg-white/5 on TabsList, data-[state=active]:bg-white/10 on TabsTrigger) removed from 4+6 locations in settings-content.tsx"
  - id: v1.1-04-03-brand-colors-preserved
    description: "Brand colors preserved: sky/indigo (Telegram/Discord), orange (danger zone), green/red (status), blue (info), violet (accent)"

metrics:
  duration: "6 min"
  completed: "2026-02-06"
---

# Phase 4 Plan 03: Domain Setup, Nexus Config, Integrations Semantic Migration Summary

**One-liner:** Migrated 1,726 lines of settings UI across 3 standalone pages from Tailwind defaults/numeric tokens to semantic tokens, and cleaned 10 redundant Tab consumer overrides.

## What Was Done

### Task 1: domain-setup.tsx Migration (721 lines)
The most inconsistent file in the settings module. Used Tailwind default text sizes (text-xs, text-sm, text-base, text-lg, text-xl) and default radii (rounded-xl, rounded-lg, rounded-2xl) instead of the project's semantic system.

**Typography migrations:**
- `text-xs` (12px) -> `text-caption` (12px) -- exact
- `text-sm` (14px) -> `text-body` (14px) -- exact
- `text-base` (16px) -> `text-body-lg` (15px) -- 1px acceptable
- `text-lg` (18px) -> `text-heading-sm` (17px) -- 1px acceptable
- `text-xl` (20px) -> `text-heading` (19px) -- 1px acceptable

**Color migrations:**
- `text-white/50`, `text-white/40`, `text-white/30` -> `text-text-secondary`, `text-text-tertiary`
- `text-white/90` -> `text-text-primary`
- `bg-white/5` -> `bg-surface-base`
- `bg-white/10` -> `bg-surface-2`
- `border-white/10` -> `border-border-default`

**Radii migrations:**
- `rounded-xl` (12px) -> `rounded-radius-md` (12px) -- exact
- `rounded-lg` (8px) -> `rounded-radius-sm` (8px) -- exact
- `rounded-2xl` (16px) -> `rounded-radius-lg` (16px) -- exact

**Preserved:** All colored status indicators (green/red/amber/blue/violet), wizard flow structure, Framer Motion values.

### Task 2: nexus-config.tsx + integrations.tsx + Tab Cleanup

**nexus-config.tsx (537 lines):**
- All `text-12` -> `text-caption`, `text-14` -> `text-body`, `text-11` -> `text-caption-sm`
- All `rounded-12` -> `rounded-radius-md`
- All `bg-white/5` -> `bg-surface-base`, `border-white/10` -> `border-border-default`
- All `text-white/50` -> `text-text-secondary`, `text-white/40` -> `text-text-tertiary`, `text-white/30` -> `text-text-tertiary`
- Tab consumer: removed no surface/color overrides (was already clean in standalone page), just migrated tokens
- Preserved: orange danger zone colors, Tab grid-cols-6 structural layout

**integrations.tsx (470 lines):**
- All `text-12` -> `text-caption`, `text-14` -> `text-body`, `text-15` -> `text-body-lg`
- All `rounded-12` -> `rounded-radius-md`, `rounded-10` -> `rounded-radius-sm`, `rounded-8` -> `rounded-radius-sm`
- All `bg-white/5` -> `bg-surface-base` or `bg-surface-2`
- All `border-white/10` -> `border-border-default`
- All `text-white/50` -> `text-text-secondary`, `text-white/70` -> `text-text-secondary`
- Tab consumer: removed `bg-white/5` from TabsList and `data-[state=active]:bg-white/10` from TabsTrigger
- Preserved: sky/indigo brand colors, green/red status indicators

**settings-content.tsx Tab Override Cleanup:**
- NexusConfigSection TabsList: removed `bg-white/5`, migrated `rounded-8` -> `rounded-radius-sm`
- IntegrationsSection TabsList: removed `bg-white/5`, TabsTrigger: removed `data-[state=active]:bg-white/10` (2 triggers)
- BackupsSection TabsList: removed `bg-white/5`, TabsTrigger: removed `data-[state=active]:bg-white/10` (2 triggers)
- TroubleshootSection TabsList: removed `bg-white/5`, TabsTrigger: removed `data-[state=active]:bg-white/10` (2 triggers)
- Total: 4 TabsList overrides removed, 6 TabsTrigger overrides removed

## Decisions Made

1. **domain-setup.tsx Tailwind defaults migrated:** text-xs->text-caption, text-sm->text-body, text-base->text-body-lg, rounded-xl->rounded-radius-md (all exact or 1px acceptable delta)
2. **Tab consumer override cleanup:** Now that base Tabs component has bg-surface-base and data-[state=active]:bg-surface-2, consumer overrides are redundant and removed
3. **Brand colors preserved throughout:** sky/indigo for Telegram/Discord, orange for danger zones, green/red for status, blue for info links, violet for accents

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] settings-content.tsx Tab override cleanup**
- **Found during:** Task 2
- **Issue:** Verification step 7 required checking settings-content.tsx for Tab overrides that duplicate base defaults
- **Fix:** Removed bg-white/5 from 4 TabsList instances and data-[state=active]:bg-white/10 from 6 TabsTrigger instances
- **Files modified:** settings-content.tsx
- **Commit:** ef77bd9

## Verification Results

- domain-setup.tsx: zero `text-xs`, zero `text-sm`, zero `text-base`, zero `rounded-xl`, zero `rounded-lg`, zero `bg-gray-*`, zero `border-gray-*`
- nexus-config.tsx: zero `bg-white/5`, zero `border-white/10`, zero `text-14`, zero `text-12`
- integrations.tsx: zero `bg-white/5`, zero `border-white/10`, zero `text-14`, zero `text-12`
- settings-content.tsx: zero TabsList bg-white/5, zero TabsTrigger data-[state=active]:bg-white/10
- Brand/status colors preserved in all files
- TypeScript: no new errors (pre-existing backend errors only)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | d68066c | feat(04-03): migrate domain-setup.tsx to semantic tokens |
| 2 | ef77bd9 | feat(04-03): migrate nexus-config.tsx, integrations.tsx and clean Tab overrides |

## Next Phase Readiness

Phase 4 (Settings Redesign) is now complete. All 3 plans executed:
- 04-01: Navigation shell & shared foundation
- 04-02: (was done previously if exists, or deferred)
- 04-03: Domain setup, nexus config, integrations + Tab cleanup

No blockers for Phase 5.
