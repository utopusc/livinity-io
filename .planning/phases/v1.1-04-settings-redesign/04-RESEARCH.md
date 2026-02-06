# Phase 4: Settings Redesign - Research

**Researched:** 2026-02-06
**Domain:** Settings UI redesign / Sidebar navigation / Card layout / Form alignment / Tab components
**Confidence:** HIGH (all findings from direct source code analysis)

## Summary

Phase 4 covers the complete visual overhaul of the settings interface in LivOS. The settings module is the largest view-level surface area in the app: ~4,400 lines across 15+ files, containing a sidebar navigation menu, a user info header card, 13 content sections (Account, Theme, 2FA, AI Config, Nexus Config, Integrations, Domain, Backups, Migration, Language, Troubleshoot, Advanced, Software Update), multiple tab-based sub-UIs (Nexus Config has 6 tabs, Integrations has 2, Troubleshoot has 2, Backups has 2), and separate mobile vs. desktop rendering paths.

The current settings module has two parallel implementations: `settings-content.tsx` (1,453 lines, desktop master-detail view) and `settings-content-mobile.tsx` (218 lines, mobile list view). Both are riddled with raw Tailwind values that need semantic token migration: `text-white/50`, `bg-white/10`, `border-white/10`, `rounded-12`, `text-14`, `text-13`, etc. The tab component (`tabs.tsx`) is essentially a stock shadcn/ui component with generic theme colors (`bg-muted`, `data-[state=active]:bg-background`) that don't match the app's dark theme design language.

**Primary recommendation:** Structure into 3 plans: (1) Sidebar navigation + user info header card + shared classes/layout; (2) Content sections with card-based layout + form alignment across all 13 sections; (3) Tab component redesign + Nexus Config/Integrations tab migration. This order ensures the navigation shell is refined first, then the content fills, then the specialized tab UI.

## Component Inventory

### 1. settings-content.tsx (THE MAIN FILE)

**File:** `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`
**Lines:** 1,453
**Role:** Desktop settings view with master-detail layout (sidebar + content area)

**Architecture:**
- `SettingsContent()` renders home view (sidebar menu + header card) or detail view
- `SettingsDetailView()` renders sidebar with active highlight + content area
- `SectionContent()` routes to 13 section components
- 13 section functions: `AccountSection`, `WallpaperSection`, `TwoFaSection`, `AiConfigSection`, `NexusConfigSection`, `IntegrationsSection`, `DomainSection`, `BackupsSection`, `MigrationSection`, `LanguageSection`, `TroubleshootSection`, `AdvancedSection`, `SoftwareUpdateSection`

**Key raw values needing migration:**

Sidebar menu items:
```typescript
// Home view (line 161):
'flex w-full items-center gap-3 rounded-10 px-3 py-2.5 text-left transition-colors hover:bg-white/10'
// -> 'flex w-full items-center gap-3 rounded-radius-sm px-3 py-2.5 text-left transition-colors hover:bg-surface-2'

// Icon container (line 163):
'flex h-8 w-8 items-center justify-center rounded-8 bg-white/10'
// -> 'flex h-8 w-8 items-center justify-center rounded-radius-sm bg-surface-2'

// Icon (line 164):
'h-4 w-4 text-white/70'
// -> 'h-4 w-4 text-text-secondary'

// Label (line 167):
'text-13 font-medium truncate'
// -> 'text-body-sm font-medium truncate'

// Description (line 168):
'text-11 text-white/40 truncate'
// -> 'text-caption-sm text-text-tertiary truncate'

// Chevron (line 170):
'h-4 w-4 text-white/30'
// -> 'h-4 w-4 text-text-tertiary'
```

Active state (detail view, lines 243-260):
```typescript
// Active sidebar item:
item.id === section && 'bg-white/15'
// -> item.id === section && 'bg-surface-3'

// Active icon container:
item.id === section ? 'bg-white/20' : 'bg-white/10'
// -> item.id === section ? 'bg-surface-3' : 'bg-surface-2'

// Active icon:
item.id === section ? 'text-white' : 'text-white/70'
// -> item.id === section ? 'text-text-primary' : 'text-text-secondary'

// Active chevron:
'h-4 w-4 text-white/50'
// -> 'h-4 w-4 text-text-secondary'
```

User info header card (lines 181-201):
```typescript
// User name heading (line 183):
'text-24 font-bold leading-none -tracking-4'
// -> 'text-heading-lg -tracking-4'

// "Livinity" brand text opacity (line 185):
'opacity-40'
// -> 'text-text-tertiary' (or keep opacity-40)
```

Detail view header (lines 270-281):
```typescript
// Border (line 270):
'flex items-center gap-4 border-b border-white/10 pb-4 mb-6'
// -> 'flex items-center gap-4 border-b border-border-default pb-4 mb-6'

// Back button (line 272-274):
'flex h-10 w-10 items-center justify-center rounded-12 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white'
// -> 'flex h-10 w-10 items-center justify-center rounded-radius-md bg-surface-base text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary'

// Section title (line 278):
'text-20 font-semibold -tracking-2'
// -> 'text-heading -tracking-2' (heading = 19px, close to 20px)

// Section description (line 279):
'text-13 text-white/50'
// -> 'text-body-sm text-text-secondary'
```

**Repeated card-row pattern across ALL sections:**
The settings module has a recurring UI pattern for toggle rows:
```typescript
// Used in: TwoFaSection, AiConfigSection, NexusConfigSection, IntegrationsSection, AdvancedSection, etc.
'rounded-12 border border-white/10 bg-white/5 p-4'
// -> 'rounded-radius-md border border-border-default bg-surface-base p-4'

'text-14 font-medium'     // -> 'text-body font-medium'
'text-12 text-white/50'   // -> 'text-caption text-text-secondary'
```

**Status badges (green/red/orange):**
```typescript
// Active/Connected (green):
'rounded-full bg-green-500/20 px-3 py-1 text-12 text-green-400'
'flex items-center gap-2 text-12 text-green-400'

// Disconnected/Error (red):
'flex items-center gap-2 text-12 text-red-400'
'rounded-8 bg-red-500/20 p-2 text-12 text-red-400'

// Danger zone (orange):
'rounded-12 border border-orange-500/30 bg-orange-500/10 p-4'
'text-14 font-medium text-orange-400'

// Factory reset (red):
'rounded-12 border border-red-500/20 bg-red-500/5 p-4'
'text-14 font-medium text-red-400'
```
These colored status indicators should be kept as-is -- they are intentional semantic colors (green=success, red=error/danger, orange=warning) and don't map to the surface/text token system.

### 2. settings-content-mobile.tsx

**File:** `livos/packages/ui/src/routes/settings/_components/settings-content-mobile.tsx`
**Lines:** 218
**Role:** Mobile settings view with list navigation

**Key raw values needing migration:**

Mobile header (line 82):
```typescript
'text-24 font-bold leading-none -tracking-4'
// -> 'text-heading-lg -tracking-4'
```

Mobile list container (line 132):
```typescript
'livinity-divide-y rounded-12 bg-white/5 p-1'
// -> 'livinity-divide-y rounded-radius-md bg-surface-base p-1'
```

### 3. shared.tsx (Settings shared classes)

**File:** `livos/packages/ui/src/routes/settings/_components/shared.tsx`
**Lines:** 50
**Role:** Shared class constants and utilities

**Raw values needing migration:**
```typescript
// Line 14:
export const cardTitleClass = tw`text-12 font-semibold leading-tight truncate -tracking-2 text-white/40`
// -> tw`text-caption font-semibold leading-tight truncate -tracking-2 text-text-tertiary`

// Line 15:
export const cardValueClass = tw`font-bold -tracking-4 truncate text-17 leading-inter-trimmed`
// -> tw`font-bold -tracking-4 truncate text-heading-sm leading-inter-trimmed`

// Line 16:
export const cardValueSubClass = tw`text-14 font-bold truncate leading-inter-trimmed -tracking-3 text-white/40`
// -> tw`text-body font-bold truncate leading-inter-trimmed -tracking-3 text-text-tertiary`

// Line 17:
export const cardSecondaryValueBaseClass = tw`text-14 font-medium -tracking-3 text-white/40 leading-inter-trimmed`
// -> tw`text-body font-medium -tracking-3 text-text-tertiary leading-inter-trimmed`

// Line 23:
'mx-auto text-12 font-normal text-white/70'
// -> 'mx-auto text-caption font-normal text-text-secondary'
```

### 4. list-row.tsx

**File:** `livos/packages/ui/src/routes/settings/_components/list-row.tsx`
**Lines:** 86
**Role:** Reusable list row components for desktop and mobile settings

**Raw values needing migration:**

Desktop ListRow (lines 50-52):
```typescript
// Title:
'text-14 font-medium leading-none -tracking-2'
// -> 'text-body font-medium leading-none -tracking-2'

// Description:
'text-12 leading-tight -tracking-2 text-white/40'
// -> 'text-caption leading-tight -tracking-2 text-text-tertiary'
```

Mobile ListRowMobile (lines 76-82):
```typescript
// Icon container (line 76):
'flex h-8 w-8 shrink-0 items-center justify-center rounded-6 bg-white/6'
// -> 'flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-sm bg-surface-1'

// Title (line 80):
'text-13 font-medium leading-none -tracking-2'
// -> 'text-body-sm font-medium leading-none -tracking-2'

// Description (line 81):
'truncate text-12 leading-none -tracking-2 text-white/40'
// -> 'truncate text-caption leading-none -tracking-2 text-text-tertiary'
```

### 5. settings-page-layout.tsx

**File:** `livos/packages/ui/src/routes/settings/_components/settings-page-layout.tsx`
**Lines:** 39
**Role:** Wrapper for standalone settings pages (Nexus Config, Integrations, Domain Setup)

**Raw values needing migration:**
```typescript
// Border (line 21):
'flex items-center gap-4 border-b border-white/10 pb-4'
// -> 'flex items-center gap-4 border-b border-border-default pb-4'

// Back button (line 23-25):
'flex h-10 w-10 items-center justify-center rounded-12 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white'
// -> 'flex h-10 w-10 items-center justify-center rounded-radius-md bg-surface-base text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary'

// Title (line 29):
'text-20 font-semibold -tracking-2'
// -> 'text-heading -tracking-2'

// Description (line 30):
'text-13 text-white/50'
// -> 'text-body-sm text-text-secondary'
```

### 6. settings-summary.tsx

**File:** `livos/packages/ui/src/routes/settings/_components/settings-summary.tsx`
**Lines:** 47
**Role:** System info grid (device, LivOS version, IP, uptime)

**Raw values needing migration:**
```typescript
// Grid (line 20):
'grid grid-cols-2 items-center gap-x-5 gap-y-2 text-14 leading-none -tracking-2'
// -> 'grid grid-cols-2 items-center gap-x-5 gap-y-2 text-body leading-none -tracking-2'

// Labels (line 26, etc.):
'opacity-40'
// -> 'text-text-tertiary' (use semantic token instead of opacity)
```

### 7. tabs.tsx (shadcn/ui Tabs)

**File:** `livos/packages/ui/src/shadcn-components/ui/tabs.tsx`
**Lines:** 53
**Role:** Base Tabs component used throughout settings

**Current state:** Uses generic shadcn defaults (`bg-muted`, `data-[state=active]:bg-background`, `text-muted-foreground`) that don't match the app's dark theme.

**All consumers in settings override these defaults inline:**
```typescript
// NexusConfigSection (settings-content.tsx line 586):
<TabsList className='mb-3 grid w-full grid-cols-6 gap-0.5 bg-white/5 p-0.5 rounded-8'>
<TabsTrigger className='flex items-center justify-center p-1.5 rounded-6'>

// IntegrationsSection (settings-content.tsx line 803):
<TabsList className='grid w-full grid-cols-2 bg-white/5 mb-4'>
<TabsTrigger className='flex items-center gap-1.5 data-[state=active]:bg-white/10'>

// Troubleshoot (settings-content.tsx line 1267):
<TabsList className='grid w-full grid-cols-2 bg-white/5'>
<TabsTrigger className='flex items-center gap-2 data-[state=active]:bg-white/10'>

// Backups (settings-content.tsx line 1066):
<TabsList className='grid w-full grid-cols-2 bg-white/5'>
<TabsTrigger className='flex items-center gap-2 data-[state=active]:bg-white/10'>
```

**Problem:** Every consumer overrides the base styles with `bg-white/5` and `data-[state=active]:bg-white/10`. This means the base component defaults are wrong for this app. The fix is to update the base Tabs component to use semantic tokens so consumers don't need overrides.

**Recommended base tabs update:**
```typescript
// TabsList:
'bg-surface-base text-text-secondary inline-flex h-10 items-center justify-center rounded-radius-sm p-1'

// TabsTrigger:
'data-[state=active]:bg-surface-2 data-[state=active]:text-text-primary inline-flex items-center justify-center whitespace-nowrap rounded-radius-sm px-3 py-1.5 text-body-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-elevation-sm'
```

### 8. Standalone settings pages

These are route-level pages that use `SettingsPageLayout` wrapper:

**integrations.tsx** (469 lines):
- Uses Tabs with Telegram/Discord channels
- Has colored status badges (sky-400, indigo-400, green-400, red-400)
- Uses `bg-white/5`, `border-white/10`, `text-white/50` extensively
- Token input with show/hide toggle

**nexus-config.tsx** (537 lines):
- Uses Tabs with 6 sections (Response, Agent, Retry, Heartbeat, Session, Advanced)
- Toggle rows with `rounded-12 border border-white/10 bg-white/5 p-4` pattern
- Form grids with labels and inputs
- Danger zone with orange warning

**domain-setup.tsx** (720 lines):
- Multi-step wizard (Enter domain -> DNS record -> Verify -> HTTPS -> Done)
- Uses `text-xs`, `text-sm`, `text-base` (Tailwind defaults, not semantic)
- Heavy use of `bg-white/5`, `border-white/10`, `text-white/N` patterns
- Custom inline `rounded-xl` (not semantic)
- Uses `text-blue-400`, `text-violet-500`, `bg-green-500/20`, etc.
- Most inconsistent file -- uses Tailwind default text sizes instead of project tokens

**ai-config.tsx** (101 lines):
- Simple API key input form
- Status card with green "Active" badge
- Uses `text-blue-400` for external links

### 9. Minor settings files

**2fa-enable.tsx** (159 lines), **2fa-disable.tsx** (64 lines):
- QR code display, code input
- Uses `text-16`, `text-17`, `text-13`, `text-white/60`

**advanced.tsx** (220 lines):
- Toggle rows (beta, DNS, factory reset)
- Has its own `cardClass`: `tw'flex items-start gap-x-2 rounded-12 bg-white/6 p-4 pointer-events-none'`

**wallpaper-picker.tsx** (104 lines):
- Horizontal scroll picker with active wallpaper highlight
- Uses `bg-white/10`, `ring-white/50`

## Token Migration Summary

### Systematic raw-to-semantic token replacements across settings:

| Raw Value | Semantic Token | Occurrence Count | Files |
|-----------|---------------|-----------------|-------|
| `text-white/50` | `text-text-secondary` | ~30 | All section files |
| `text-white/40` | `text-text-tertiary` | ~25 | shared.tsx, list-row.tsx, settings-content.tsx |
| `text-white/70` | `text-text-secondary` | ~8 | settings-content.tsx, domain-setup.tsx |
| `text-white/30` | `text-text-tertiary` | ~8 | settings-content.tsx, domain-setup.tsx |
| `bg-white/5` | `bg-surface-base` | ~30 | All section files, tabs |
| `bg-white/10` | `bg-surface-2` | ~20 | Sidebar, tabs active, icon containers |
| `bg-white/15` | `bg-surface-3` | 1 | Active sidebar state |
| `bg-white/6` | `bg-surface-1` | ~3 | list-row mobile, advanced card |
| `border-white/10` | `border-border-default` | ~25 | All section files |
| `rounded-12` | `rounded-radius-md` | ~20 | All section card rows |
| `rounded-10` | `rounded-radius-sm` | ~5 | Sidebar items, icon containers |
| `rounded-8` | `rounded-radius-sm` | ~5 | Icon containers, tabs |
| `text-14` | `text-body` | ~15 | Settings content sections |
| `text-13` | `text-body-sm` | ~12 | Descriptions, labels |
| `text-12` | `text-caption` | ~20 | Labels, status text |
| `text-11` | `text-caption-sm` | ~5 | Hints, small descriptions |
| `text-24` | `text-heading-lg` | 2 | Header card title |
| `text-20` | `text-heading` | 2 | Section titles (19px close enough) |
| `text-17` | `text-heading-sm` | 2 | Card values, 2fa |
| `text-15` | `text-body-lg` | 3 | Integration headings |

### Values to keep as-is (intentional, not generic surfaces):

| Value | Reason |
|-------|--------|
| `text-green-400`, `bg-green-500/20` | Success/Connected status -- semantic color |
| `text-red-400`, `bg-red-500/20` | Error/Disconnected/Danger -- semantic color |
| `text-orange-400`, `bg-orange-500/10` | Warning/Danger Zone -- semantic color |
| `text-sky-400`, `bg-sky-500/10` | Telegram brand color |
| `text-indigo-400`, `bg-indigo-500/10` | Discord brand color |
| `text-blue-400` | External links -- consider `text-brand` but blue is conventional for links |
| `bg-black` | Log viewer background |
| `border-green-500/30`, `border-sky-500/30`, etc. | Status card borders -- match their semantic color |

## Architecture Patterns

### Settings Navigation Architecture

```
settings/index.tsx (entry point)
    |
    +-- SheetHeader + SheetTitle (sheet chrome)
    |
    +-- (mobile?) SettingsContentMobile
    |       |
    |       +-- DesktopPreview
    |       +-- User header (heading + summary + action buttons)
    |       +-- System stat cards (4x: Storage, Memory, CPU, Temperature)
    |       +-- ListRowMobile items (13 navigation items)
    |
    +-- (desktop?) SettingsContent
    |       |
    |       +-- Home view:
    |       |   +-- Sidebar (DesktopPreview + menu items Card)
    |       |   +-- Right side (user header Card + placeholder Card)
    |       |
    |       +-- Detail view:
    |           +-- Sidebar (menu items Card with active highlight)
    |           +-- Content Card (back button + section title + SectionContent)
    |
    +-- Routes (dialogs/drawers opened from settings)
        +-- /2fa, /device-info, /account/*, /wallpaper, /wifi, /backups/*
        +-- /nexus-config, /ai-config, /integrations, /domain-setup (standalone pages)
        +-- /troubleshoot/*, /terminal/*, /advanced/*
```

### Repeated UI Patterns (Extract Into Shared Components)

**Pattern 1: Settings Toggle Row**
Used ~15 times across sections. Should be a shared component:
```typescript
// Current (repeated everywhere):
<div className='flex items-center justify-between rounded-12 border border-white/10 bg-white/5 p-4'>
    <div>
        <div className='text-14 font-medium'>Title</div>
        <div className='text-12 text-white/50'>Description</div>
    </div>
    <Switch ... />
</div>

// Recommended: Create SettingsToggleRow component
function SettingsToggleRow({title, description, checked, onCheckedChange, disabled}) {
    return (
        <div className='flex items-center justify-between rounded-radius-md border border-border-default bg-surface-base p-4'>
            <div>
                <div className='text-body font-medium'>{title}</div>
                <div className='text-caption text-text-secondary'>{description}</div>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        </div>
    )
}
```

**Pattern 2: Settings Info Card**
Used ~10 times for status display:
```typescript
// Current:
<div className='rounded-12 border border-white/10 bg-white/5 p-4'>
    <div className='flex items-center gap-3'>
        <div className='flex h-10 w-10 items-center justify-center rounded-10 bg-white/10'>
            <Icon className='h-5 w-5 text-white/70' />
        </div>
        <div className='flex-1'>
            <div className='text-14 font-medium'>Title</div>
            <div className='text-12 text-white/50'>Description</div>
        </div>
    </div>
</div>

// Recommended: Create SettingsInfoCard component
function SettingsInfoCard({icon: Icon, title, description, children, variant = 'default'}) {
    return (
        <div className={cn(
            'rounded-radius-md border p-4',
            variant === 'default' && 'border-border-default bg-surface-base',
            variant === 'success' && 'border-green-500/30 bg-green-500/10',
            variant === 'warning' && 'border-orange-500/30 bg-orange-500/10',
            variant === 'danger' && 'border-red-500/20 bg-red-500/5',
        )}>
            <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
                    <Icon className='h-icon-md w-icon-md text-text-secondary' />
                </div>
                <div className='flex-1'>
                    <div className='text-body font-medium'>{title}</div>
                    <div className='text-caption text-text-secondary'>{description}</div>
                </div>
                {children}
            </div>
        </div>
    )
}
```

**Pattern 3: Settings Form Field**
Used ~15 times for labeled inputs/selects:
```typescript
// Current:
<div className='flex flex-col gap-2'>
    <label className='text-12 text-white/50'>Label</label>
    <Input ... />
</div>

// Recommended: Just migrate the label styling
// -> <label className='text-caption text-text-secondary'>Label</label>
// Note: The Labeled component in input.tsx already exists for this pattern.
```

### Anti-Patterns Found

- **1,453-line monolith:** `settings-content.tsx` contains ALL 13 section implementations inline. This is already mitigated by lazy imports for standalone pages, but the inline sections (Account through SoftwareUpdate) are all in one file.
- **Duplicated sections:** Some sections exist both inline (in settings-content.tsx) AND as standalone pages (nexus-config.tsx, integrations.tsx). The standalone pages use `SettingsPageLayout`, while inline versions use the SettingsDetailView wrapper. This duplication means token migration must happen in both places.
- **Inconsistent typography:** domain-setup.tsx uses `text-xs`, `text-sm`, `text-base` (Tailwind defaults) while every other file uses numeric tokens (`text-12`, `text-14`). Both need migration to semantic tokens, but they start from different baselines.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toggle row component | Inline repeated markup | Extract `SettingsToggleRow` from existing pattern | Pattern appears 15+ times, extracting ensures consistency |
| Info card component | Inline repeated markup | Extract `SettingsInfoCard` from existing pattern | Pattern appears 10+ times with slight color variations |
| Tab styling overrides | Per-consumer className overrides | Fix base Tabs component defaults | Every consumer currently overrides the same broken defaults |
| Form labels | Custom label elements | Use existing `Labeled` component from input.tsx or standardized label class | Already exists in the codebase |
| Back button | Repeated inline button | Extract `SettingsBackButton` or use from settings-page-layout | Exact same markup in 3+ places |

**Key insight:** The settings redesign is primarily a token migration + pattern extraction exercise. There are ~15 instances of "toggle row", ~10 of "info card", and ~15 of "form field" patterns that repeat with slight variations. Extracting these into shared components while applying semantic tokens will dramatically reduce code volume and ensure consistency.

## Common Pitfalls

### Pitfall 1: Breaking Inline Sections AND Standalone Pages
**What goes wrong:** Migrating tokens in settings-content.tsx's inline NexusConfigSection without also updating nexus-config.tsx standalone page (or vice versa)
**Why it happens:** Sections exist in TWO places -- inline in settings-content.tsx AND as standalone route pages. They share the same UI but have separate code.
**How to avoid:** List all duplicate sections and migrate both copies:
  - NexusConfig: `settings-content.tsx` lines 531-783 AND `nexus-config.tsx`
  - Integrations: `settings-content.tsx` lines 797-983 AND `integrations.tsx`
  - AiConfig: `settings-content.tsx` lines 429-515 AND `ai-config.tsx`
  - DomainSetup: `settings-content.tsx` lines 994-1000 (lazy loads from `domain-setup.tsx`)
**Warning signs:** Settings look different when navigated to inline vs. via route

### Pitfall 2: Tab Component Changes Breaking Non-Settings Consumers
**What goes wrong:** Updating TabsList/TabsTrigger base styles breaks Tabs usage outside settings
**Why it happens:** `tabs.tsx` is a shared shadcn/ui component used across the entire app
**How to avoid:**
  - Grep for all Tabs consumers before changing base styles
  - Ensure new defaults are neutral enough for all consumers
  - Test non-settings Tabs usage after changes
**Warning signs:** Tabs in AI chat, app store, or other views look wrong

### Pitfall 3: Mobile vs Desktop Divergence
**What goes wrong:** Migrating desktop settings-content.tsx but forgetting settings-content-mobile.tsx, or vice versa
**Why it happens:** Settings has completely separate mobile and desktop rendering paths
**How to avoid:** Always migrate both files in the same plan. The shared components (shared.tsx, list-row.tsx, settings-summary.tsx) affect both paths.
**Warning signs:** Mobile settings look inconsistent with desktop

### Pitfall 4: domain-setup.tsx Base Token System
**What goes wrong:** Using Tailwind default tokens (`text-xs`, `text-sm`, `text-base`, `rounded-xl`) instead of project tokens during migration
**Why it happens:** domain-setup.tsx was written using Tailwind defaults, not the project's numeric system. Migrating to semantic tokens requires mapping from a different baseline.
**How to avoid:** Map Tailwind defaults to semantic tokens:
  - `text-xs` (12px) -> `text-caption`
  - `text-sm` (14px) -> `text-body`
  - `text-base` (16px) -> `text-body-lg` (closest at 15px)
  - `rounded-xl` -> `rounded-radius-lg` (16px)
  - `rounded-lg` -> `rounded-radius-md` (12px)
  - `rounded-2xl` -> `rounded-radius-xl` (20px)
**Warning signs:** Mix of Tailwind defaults and project tokens in same component

### Pitfall 5: Over-Extracting Shared Components
**What goes wrong:** Creating too many tiny shared components that add indirection without clear benefit
**Why it happens:** Seeing repeated patterns and wanting to DRY everything up
**How to avoid:** Only extract if the pattern appears 5+ times AND the repetition causes maintenance issues. For 2-3 occurrences, just apply consistent tokens directly.
**Recommended extractions:** SettingsToggleRow (15+ occurrences), SettingsInfoCard (10+ occurrences). Skip extraction for patterns with <5 occurrences.
**Warning signs:** Components that are only used 2-3 times, adding prop complexity without clear benefit

## Recommended Plan Structure

### Plan 04-01: Settings Sidebar + Header Card + Shared Classes
**Scope:** Navigation shell, user info card, shared class constants, layout components
**Files (~8):**
1. `_components/settings-content.tsx` — sidebar menu items, active states, user header card, detail view header (partial: just navigation/header, NOT section content)
2. `_components/settings-content-mobile.tsx` — mobile header, mobile list container, mobile list items
3. `_components/shared.tsx` — all 5 exported class constants (cardTitleClass, etc.)
4. `_components/list-row.tsx` — ListRow and ListRowMobile
5. `_components/settings-page-layout.tsx` — back button, title, description
6. `_components/settings-summary.tsx` — summary grid, opacity labels
7. `shadcn-components/ui/tabs.tsx` — base Tab component redesign with semantic tokens
8. `index.tsx` — SheetHeader className migration (minor)

**Changes:**
- Sidebar menu items: `bg-white/10` -> `bg-surface-2`, `text-white/70` -> `text-text-secondary`, `text-13` -> `text-body-sm`, `text-11` -> `text-caption-sm`
- Active states: `bg-white/15` -> `bg-surface-3`, `text-white` -> `text-text-primary`
- Header card: `text-24` -> `text-heading-lg`, summary `opacity-40` -> `text-text-tertiary`
- Detail header: `border-white/10` -> `border-border-default`, back button to surface tokens
- Shared classes: All 5 constants migrated to semantic tokens
- ListRow/ListRowMobile: typography and colors to semantic tokens
- Tabs base component: `bg-muted` -> `bg-surface-base`, `data-[state=active]:bg-background` -> `data-[state=active]:bg-surface-2`
- SettingsPageLayout: same header pattern as detail view

**Verification:** Open settings on desktop and mobile. Verify sidebar navigation, active states, header card, and tab base styling.

**Estimated complexity:** MEDIUM (8 files, many similar changes, but high visual impact)

### Plan 04-02: Content Sections Token Migration + Shared Component Extraction
**Scope:** All 13 section content areas, inline AND standalone versions, shared component extraction
**Files (~8-10):**
1. `_components/settings-content.tsx` — ALL section content functions (AccountSection through SoftwareUpdateSection)
2. `integrations.tsx` — standalone integrations page
3. `nexus-config.tsx` — standalone nexus config page
4. `ai-config.tsx` — standalone AI config page
5. `domain-setup.tsx` — standalone domain setup page (needs most work)
6. `2fa-enable.tsx` — 2FA enable inline/dialog
7. `2fa-disable.tsx` — 2FA disable inline/dialog
8. `advanced.tsx` — advanced settings dialog/drawer
9. `_components/progress-card-content.tsx` — progress stat cards (minor)
10. NEW: `_components/settings-toggle-row.tsx` — extracted shared component

**Changes:**
- Extract `SettingsToggleRow` component for the repeated toggle-with-switch pattern
- Extract `SettingsInfoCard` component for the repeated status display pattern
- All `rounded-12 border border-white/10 bg-white/5 p-4` -> use SettingsInfoCard or `rounded-radius-md border border-border-default bg-surface-base p-4`
- All `text-14 font-medium` -> `text-body font-medium`
- All `text-12 text-white/50` -> `text-caption text-text-secondary`
- All label elements: `text-12 text-white/50` -> `text-caption text-text-secondary`
- domain-setup.tsx: Convert from Tailwind defaults to semantic tokens (biggest file, most inconsistent)
- Form grids: Consistent spacing with `gap-3` or `gap-4`

**Verification:** Navigate through all 13 settings sections. Verify forms have consistent alignment, cards have consistent appearance, toggle rows are uniform.

**Estimated complexity:** HIGH (10 files, 2500+ lines of content, domain-setup is most work)

### Plan 04-03: Tab Polish + Consumer Cleanup
**Scope:** Clean up all Tab consumer overrides now that base component has correct defaults, final polish
**Files (~5):**
1. `_components/settings-content.tsx` — Remove redundant Tab overrides from NexusConfigSection, IntegrationsSection, TroubleshootSection, BackupsSection
2. `integrations.tsx` — Remove redundant Tab overrides
3. `nexus-config.tsx` — Remove redundant Tab overrides
4. `_components/settings-content-mobile.tsx` — Final mobile polish pass
5. Any remaining raw values caught in final audit

**Changes:**
- Remove `bg-white/5` from TabsList consumers (now in base component)
- Remove `data-[state=active]:bg-white/10` from TabsTrigger consumers (now in base component)
- Keep intentional overrides (e.g., NexusConfig's `grid-cols-6` layout, icon-only triggers)
- Final pass for any missed raw values

**Verification:** Verify all tabbed interfaces (Nexus Config, Integrations, Troubleshoot, Backups) look consistent and match the new design language.

**Estimated complexity:** LOW (cleanup pass, removing overrides)

## Estimated Total Plans: 3

| Plan | Files | Complexity | Requirements |
|------|-------|------------|-------------|
| 04-01 | 8 | MEDIUM | ST-01 (sidebar), ST-03 (header card), ST-05 (tabs base) |
| 04-02 | 8-10 | HIGH | ST-02 (content sections), ST-04 (form layouts) |
| 04-03 | 5 | LOW | ST-05 (tab consumer cleanup) |

## Open Questions

1. **Extract shared components or just migrate tokens?**
   - The SettingsToggleRow and SettingsInfoCard patterns repeat 15+ and 10+ times respectively
   - Extracting them reduces code volume by ~200-300 lines
   - Recommendation: Extract both. The settings module is the perfect place for these since they're only used here. Put them in `_components/`.

2. **domain-setup.tsx full rewrite or just token migration?**
   - This file is 720 lines and uses Tailwind defaults (`text-xs`, `text-sm`, `rounded-xl`) unlike every other settings file
   - It's also a multi-step wizard with very different UI patterns
   - Recommendation: Token migration only, not a rewrite. Map Tailwind defaults to semantic tokens. The wizard flow itself works fine.

3. **Duplicate inline vs standalone sections -- should they be deduplicated?**
   - NexusConfig, Integrations, AiConfig exist in BOTH settings-content.tsx AND as standalone pages
   - The standalone pages use `SettingsPageLayout`, inline versions use SettingsDetailView
   - Recommendation: Out of scope for this phase. Just migrate tokens in both places. Deduplication is a structural refactor that could break navigation patterns.

4. **QuickInfo placeholder card in home view**
   - Line 204-208 of settings-content.tsx has a placeholder "Select a setting from the menu" card
   - This seems like temporary UI
   - Recommendation: Keep but migrate tokens. Could be replaced with system stats or recent activity in a future phase.

5. **Tabs icon-only triggers in NexusConfig**
   - NexusConfig uses icon-only tab triggers (`grid-cols-6` with just icons)
   - This is a unique pattern among all Tab consumers
   - Recommendation: Keep the custom layout (grid-cols-6, icon-only) but use the semantic token base from the redesigned Tabs component

## Sources

### Primary (HIGH confidence)
- Direct source code analysis of all files listed above
- Tailwind config: `livos/packages/ui/tailwind.config.ts`
- Phase 1 research and verification: `.planning/phases/v1.1-01-design-system/01-RESEARCH.md`, `01-VERIFICATION.md`
- Phase 3 research: `.planning/phases/v1.1-03-window-sheet-system/03-RESEARCH.md`

### Secondary (MEDIUM confidence)
- Phase 1 established token definitions and migration patterns
- Codebase conventions from `.planning/codebase/CONVENTIONS.md`

## Metadata

**Confidence breakdown:**
- Component inventory: HIGH -- all 15+ settings files read directly, line counts verified
- Token mappings: HIGH -- verified against tailwind.config.ts token definitions from Phase 1
- Plan structure: HIGH -- based on file dependencies and logical grouping
- Shared component extraction: MEDIUM -- recommendation based on pattern analysis, exact API needs implementation-time decisions

**Research date:** 2026-02-06
**Valid until:** Indefinite (codebase-specific research, not library-dependent)
