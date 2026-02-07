# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v1.2 — Visual Impact Redesign
**Current focus:** Phase 2 - Component Visual Fixes

## Current Position

Milestone: v1.2 (Visual Impact Redesign)
Phase: 2 of 2 — Component Visual Fixes
Plan: 4 of 4 in current phase
Status: Phase complete
Last activity: 2026-02-07 - Completed 02-02-PLAN.md

Progress: [████████████████████████████] 100% (5 of 5 v1.2 plans)

## Performance Metrics

**v1.0 Velocity (reference):**
- Total plans completed: 20
- Average duration: 2.7 min
- Total execution time: 0.9 hours

**v1.1 Velocity:**
- Total plans completed: 28
- Average duration: 3.2 min
- Total execution time: 1.73 hours

*Updated after each plan completion*

## Accumulated Context

### Decisions

v1.1 decisions:

- [Milestone]: "Minimal & Clean" design language (Apple/Linear style)
- [Milestone]: Full UI redesign — not a partial update
- [Milestone]: Dark theme core identity — no light mode toggle
- [Milestone]: Iterative improvement on existing components — not a rewrite
- [Milestone]: 8 phases: Design System → Desktop → Windows/Sheets → Settings → AI Chat → App Store/Files → Login → Mobile
- [Requirements]: 47 requirements across 11 categories (DS, DD, WS, SM, ST, AC, AS, FM, LO, MR, CN)
- [Tech]: Keep existing stack: React 18, Tailwind 3.4, shadcn/ui, Radix, Framer Motion
- [Tech]: Keep existing wallpaper-based theming with refined color tokens
- [Tech]: Reduce glassmorphism — cleaner, more subtle depth
- [v1.1-01-01]: Dual token strategy: preserve numeric tokens alongside semantic for gradual migration
- [v1.1-01-01]: Static rgba for semantic colors (surface/border/text) vs CSS variables for brand colors
- [v1.1-01-01]: Complete typographic definitions (size + line-height + letter-spacing + weight)
- [v1.1-01-02]: focus-visible pattern for keyboard navigation (better UX than focus:)
- [v1.1-01-02]: Ghost variant for minimal buttons (transparent, reveals on hover)
- [v1.1-01-02]: Keep rounded-14 for dialog sizes until Phase 3 dialog redesign
- [v1.1-01-03]: Brand-colored focus states for form inputs (border-brand + ring-brand/20)
- [v1.1-01-03]: Semantic icon sizing tokens (icon-sm, icon-md) for consistent icon dimensions
- [v1.1-02-01]: OpenPill kept as pure bg-white for maximum visibility (not migrated to semantic token)
- [v1.1-02-01]: Preview dock retains bg-neutral-900/80 solid background (not surface token)
- [v1.1-02-01]: Dock border hierarchy: border-default for container, border-emphasis for items, border-subtle for dividers
- [v1.1-02-02]: bg-text-primary used as progress bar fill (same rgba as bg-white/90)
- [v1.1-02-02]: bg-border-emphasis used as inactive paginator pill background (same 0.20 opacity)
- [v1.1-02-02]: text-text-secondary replaces opacity-50 hack for proper semantic app description color
- [v1.1-02-02]: Reduced backdrop-blur from 2xl to md on install-first-app cards
- [v1.1-02-03]: Preserve color-mix brand background in menu content (not a generic surface)
- [v1.1-02-03]: Keep focus:text-white at full opacity on brand-tinted backgrounds for contrast
- [v1.1-02-03]: Keep text-[10px] as arbitrary value on mobile FrequentApp (below caption-sm 11px)
- [v1.1-02-04]: Toast bg-surface-3 replaces both container bg-[#404040]/40 and close button bg-neutral-600/70
- [v1.1-02-04]: Island close button hover subtler (surface-3 at 0.14 vs original white/20 at 0.20) — adequate on solid black
- [v1.1-02-04]: Island container desktop bottom-[86px] maintains ~6px gap above slimmer 80px dock
- [v1.1-02-04]: Island bg-black and shadow-floating-island preserved (component identity, not generic surface)
- [v1.1-02-04]: Framer Motion borderRadius animation values (22, 32) untouched (JS inline styles, not Tailwind)
- [v1.1-02-05]: Wallpaper duration-700 -> duration-500 safe (transition-duration controls opacity/transform, not blur animation)
- [v1.1-02-05]: DesktopPreviewFrame rounded-15 -> rounded-radius-lg (16px vs 15px, acceptable for semantic consistency)
- [v1.1-02-05]: Preview-specific sizing preserved (rounded-5/rounded-3/bg-neutral-900-70/bg-white-20 not migrated)
- [v1.1-03-01]: Dialog glassmorphism reduced: backdrop-blur-3xl (64px) -> backdrop-blur-2xl (40px)
- [v1.1-03-01]: Dialog border semantic: border-white/5 -> border-border-subtle (0.05 -> 0.06)
- [v1.1-03-01]: Dialog description visibility: text-white/50 -> text-text-secondary (0.50 -> 0.60)
- [v1.1-03-01]: Close button semantic: opacity-30/hover:opacity-40 -> text-text-tertiary/hover:text-text-secondary
- [v1.1-03-01]: Button rounded-14 resolved: dialog/lg sizes now rounded-radius-md (14px -> 12px)
- [v1.1-03-02]: Sheet title text-text-primary (0.90) chosen over text-text-secondary (0.60) for prominent page title readability
- [v1.1-03-02]: Sheet description text-body-sm (13px) over Tailwind text-sm (14px) to match semantic scale
- [v1.1-03-02]: Scrollbar group-hover:bg-white/50 kept as raw value (no semantic match at 0.50 opacity)
- [v1.1-03-03]: Drag opacity feedback via Framer Motion animate prop (not style prop, since animate overrides style for shared properties)
- [v1.1-03-03]: Window body boxShadow isDragging ternary in style prop (boxShadow not animated by Framer Motion, so style prop works correctly)
- [v1.1-03-04]: ImmersiveDialog title text-text-primary (0.90) from text-white/80 (0.80) for title prominence
- [v1.1-03-04]: Icon message description visibility: text-text-secondary (0.60) from text-white/50 (0.50)
- [v1.1-03-04]: KeyValue key: opacity-60 replaced with text-text-secondary semantic token
- [v1.1-03-04]: Window resize 400x400 minimum matches getResponsiveSize constraint
- [v1.1-03-04]: EXIT_DURATION_MS 100ms -> 150ms (50% longer) for smoother close feel
- [v1.1-04-01]: Sidebar surface hierarchy: surface-2 default, surface-3 active (mirrors dock pattern)
- [v1.1-04-01]: Tabs base component: dark-theme semantic defaults (surface-base list, surface-2 active trigger)
- [v1.1-04-01]: Section content functions intentionally untouched — deferred to Plan 04-02/04-03
- [v1.1-04-02]: SettingsToggleRow className override for compact p-3 in retry/heartbeat tabs
- [v1.1-04-02]: SettingsInfoCard variant colors use raw Tailwind (domain-specific status, not generic surface)
- [v1.1-04-02]: Wallpaper picker ring-white/50 preserved (active selection indicator, not generic surface)
- [v1.1-04-03]: domain-setup.tsx Tailwind defaults migrated: text-xs->text-caption, text-sm->text-body, text-base->text-body-lg, rounded-xl->rounded-radius-md
- [v1.1-04-03]: Tab consumer overrides (bg-white/5 on TabsList, data-[state=active]:bg-white/10 on TabsTrigger) removed from 10 locations in settings-content.tsx
- [v1.1-04-03]: Brand colors preserved: sky/indigo (Telegram/Discord), orange (danger zone), green/red (status), blue (info), violet (accent)
- [v1.1-05-01]: Brand gradients (violet-500/30, blue-500/30) and text-violet-400 preserved as Liv AI brand identity
- [v1.1-05-01]: text-blue-400 kept on tool names in ToolCallDisplay (semantic tool accent)
- [v1.1-05-01]: Status icon colors (violet/purple/orange/blue) preserved as semantic tool status indicators
- [v1.1-05-01]: Conversation title upgraded from text-xs to text-body-sm with text-caption-sm relative timestamp
- [v1.1-05-03]: Transport toggle active state preserved as bg-violet-500/20 (deliberate brand accent, not generic surface)
- [v1.1-05-03]: CATEGORY_COLORS and FEATURED_MCPS gradients preserved as domain-specific (not migrated to semantic tokens)
- [v1.1-05-03]: InstallDialog uses bg-dialog-content (consistent with Phase 3 dialog pattern)
- [v1.1-05-03]: All MCP form inputs use brand focus pattern (focus-visible:border-brand + ring-brand/20)
- [v1.1-05-03]: Server status colors preserved: green-400 (running), amber-400 (connecting), red-400 (error)
- [v1.1-05-02]: ai-quick.tsx dialog uses bg-dialog-content (consistent with Phase 3 dialog redesign pattern)
- [v1.1-05-02]: ai-quick.tsx border-border-subtle on dialog content (matches shared/dialog.ts convention)
- [v1.1-05-02]: MiniToolCall cn() for status badge conditional classes (matches ToolCallDisplay pattern from 05-01)
- [v1.1-06-03]: search-input uses focus-within:border-brand on container (not focus-visible on input) because input has !border-none !ring-0
- [v1.1-06-03]: Sidebar gradient preserved with semantic from-surface-base to-surface-2 (was from-white/[0.04] to-white/[0.08])
- [v1.1-06-03]: Navigation controls disabled state uses text-text-secondary instead of opacity-50
- [v1.1-06-03]: Context menu file required no changes — already uses shared menu styles from Phase 2
- [v1.1-06-03]: drag-and-drop.tsx and file-upload-drop-zone.tsx already use brand tokens correctly — no changes needed
- [v1.1-06-01]: cardClass flattened from gradient-to-br + backdrop-blur-xl to flat bg-surface-1 with shadow-elevation-sm
- [v1.1-06-01]: All glow orbs and decorative purple/cyan gradients removed entirely (Minimal & Clean direction)
- [v1.1-06-01]: sectionTitleClass gradient text (bg-clip-text) replaced with flat text-text-primary
- [v1.1-06-01]: Gallery simplified from 3-4 overlay layers to single gradient overlay for text readability
- [v1.1-06-01]: Dynamic useColorThief gradients preserved as inline styles while Tailwind classes use semantic tokens
- [v1.1-06-01]: Window-mode hex fallbacks (#24242499) replaced with rgba notation (rgba(36,36,36,0.6))
- [v1.1-06-02]: opacity-50 on disabled Button in select-dependencies preserved (UI state indicator, not text hack)
- [v1.1-06-02]: bg-black/30 on marketplace-app-window header preserved (iframe overlay, not generic surface)
- [v1.1-06-02]: text-sm in public-access replaced with text-body-sm (13px semantic scale match)
- [v1.1-06-02]: text-xs in public-access DNS badges replaced with text-caption (12px semantic match)
- [v1.1-07-01]: md:text-56 kept on Title (custom 56px hero text, no semantic match)
- [v1.1-07-01]: secondaryButtonClasss typo preserved to avoid breaking imports
- [v1.1-07-01]: darken-layer.tsx unchanged (bg-black/50 is intentional overlay, not generic surface)
- [v1.1-07-01]: StepIndicator 0-indexed to match restore.tsx Step enum convention
- [v1.1-07-01]: focus-visible:ring-3 -> ring-2 ring-brand/20 (consistent with Phase 1 brand focus pattern)
- [v1.1-07-02]: PinInput error recovery 500ms -> 800ms for better user recognition of error state
- [v1.1-07-02]: 2FA step changed from form to div (PinInput auto-submits, form wrapping was redundant)
- [v1.1-07-02]: ToS text opacity-70 -> text-text-secondary (0.70 -> 0.60, consistent with design system)
- [v1.1-07-02]: Error spacer -my-2.5 -> -my-2 (standardized to Tailwind scale)
- [v1.1-07-03]: BackupSnapshot badge text-caption-sm (11px) over text-[10px] — enough space in onboarding for 11px
- [v1.1-07-03]: bg-dialog-content/70 preserved on app-auth card (semantic token from Phase 3 dialog system with transparency)
- [v1.1-07-03]: bg-black/50 overlay preserved on app-auth (intentional darken layer convention)
- [v1.1-07-03]: bg-neutral-600 preserved on placeholder app icon (domain-specific, not generic surface)
- [v1.1-08-02]: Mobile-first touch targets: h-[44px] md:h-[Npx] on default/md/sm/icon-only button sizes
- [v1.1-08-02]: md-squared (38px) and input-short (40px) unchanged -- close enough to 44px guideline
- [v1.1-08-02]: IconButton inherits touch targets via buttonVariants import -- no changes needed
- [v1.1-08-01]: Drawer component for mobile sidebar (matches vaul-based drawer pattern)
- [v1.1-08-01]: ConversationSidebar className prop for mobile width override (w-full, border-r-0, bg-transparent)
- [v1.1-08-01]: h-11 w-11 touch targets on mobile header buttons (44px minimum)
- [v1.1-08-01]: Responsive padding: messages p-3 md:p-6, input p-3 md:p-4
- [v1.1-08-03]: Sheet content 3xl->xl on mobile (64px->20px): heaviest blur, overkill on small screens
- [v1.1-08-03]: Dialog content 2xl->lg on mobile (40px->12px): 12px still visually effective
- [v1.1-08-03]: Sheet overlay xl->lg on mobile (20px->12px): lighter but benefits from reduction
- [v1.1-08-03]: transform-gpu added to all modified backdrop-blur elements for GPU layer promotion
- [v1.1-08-03]: Dock/window-chrome/command-palette NOT changed (static, desktop-only, or infrequent)
- [v1.1-08-04]: Drawer bg-[#0F0F0F] -> bg-black/90 (slight translucency complements inset box-shadow glass highlight)
- [v1.1-08-04]: ImmersiveDialog close mt-5 -> mt-2 md:mt-5 (keeps button visible on 667px-tall viewports)
- [v1.1-08-04]: ImmersiveDialog close 44px mobile touch target matching Plan 08-02 pattern

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-07
Stopped at: Completed 02-02-PLAN.md (Sheet + Dialog + Window visual fixes)
Resume file: None

## v1.1 Phase Artifacts

**Phase v1.1-01: Design System Foundation**
- Plan 01-01: Design Tokens (completed 2026-02-06)
  - Semantic color tokens: surface/border/text hierarchy
  - Semantic typography: caption/body/heading/display scale
  - Semantic radii: radius-sm/md/lg/xl
  - Elevation shadows: elevation-sm/md/lg/xl
  - Icon sizing: icon-sm/md/lg
  - Summary: .planning/phases/v1.1-01-design-system/01-01-SUMMARY.md
- Plan 01-02: Button and Card Redesign (completed 2026-02-06)
  - Button with semantic tokens (surface/border/text)
  - Card with semantic tokens and elevation shadows
  - Ghost variant for minimal buttons
  - focus-visible pattern established
  - Summary: .planning/phases/v1.1-01-design-system/01-02-SUMMARY.md
- Plan 01-03: Input, Select, Switch Redesign (completed 2026-02-06)
  - Input with semantic tokens and brand-colored focus
  - Select with semantic tokens and elevation shadows
  - Switch with semantic surface tokens
  - Brand focus pattern: border-brand + ring-brand/20
  - Icon sizing with semantic tokens (icon-sm, icon-md)
  - Summary: .planning/phases/v1.1-01-design-system/01-03-SUMMARY.md

**Phase v1.1-02: Desktop Shell**
- Plan 02-01: Dock Redesign (completed 2026-02-06)
  - Dock container: semantic surface/border/radius tokens
  - Dock slimmer profile: 74px -> 70px height
  - Dock items: semantic surface/border/text tokens
  - Dock divider: subtler and shorter (border-subtle, h-6)
  - Notification badge: semantic caption-sm typography
  - Summary: .planning/phases/v1.1-02-desktop-shell/02-01-SUMMARY.md
- Plan 02-02: Desktop Content Semantic Tokens (completed 2026-02-06)
  - Header greeting: text-heading / md:text-display-lg
  - Search button: surface-1/border-subtle/text-caption/text-primary
  - App icon: surface-2/border-emphasis/radius-sm/md, caption-sm/body-sm labels
  - Paginator: surface-base arrows, border-emphasis pills
  - Install-first-app: radius-xl/elevation-lg, reduced backdrop-blur-md
  - Summary: .planning/phases/v1.1-02-desktop-shell/02-02-SUMMARY.md
- Plan 02-03: Context Menu + Command Palette (completed 2026-02-06)
  - Shared menu.ts: text-body-sm, surface-base focus/highlight, text-text-primary, radius-sm/md
  - Context menu: rounded-radius-sm items and content
  - Dropdown menu: rounded-radius-md content, rounded-radius-sm items
  - Command input: text-body-lg, placeholder:text-text-tertiary
  - Command items: text-body-sm, aria-selected:bg-surface-base, rounded-radius-sm
  - Frequent apps: semantic border-default/surface-base/text-secondary tokens
  - shared/dialog.ts explicitly NOT modified (deferred to Phase 3)
  - Summary: .planning/phases/v1.1-02-desktop-shell/02-03-SUMMARY.md
- Plan 02-04: Toast & Floating Island (completed 2026-02-06)
  - Toast: semantic surface-3/radius-md/elevation-lg/body-lg/text-primary/text-secondary
  - Toast: eliminated bg-[#404040]/40 hex background and opacity-60 hack
  - Island close button: bg-surface-2 / hover:bg-surface-3
  - Island container: md:bottom-[86px] adjusted for slimmer dock
  - Island identity preserved: bg-black, shadow-floating-island, Framer Motion sizes object
  - Summary: .planning/phases/v1.1-02-desktop-shell/02-04-SUMMARY.md
- Plan 02-05: Wallpaper & Desktop Preview (completed 2026-02-06)
  - Wallpaper: duration-700 -> duration-500 on all three layers (thumbnail, full, exit)
  - Wallpaper: scale-125 edge artifact prevention preserved
  - Wallpaper: brand color extraction completely untouched
  - Desktop preview frame: rounded-15 -> rounded-radius-lg
  - Basic preview dock: border-white/10 -> border-border-default
  - Summary: .planning/phases/v1.1-02-desktop-shell/02-05-SUMMARY.md

**Phase v1.1-03: Window & Sheet System**
- Plan 03-01: Dialog Foundation & Semantic Tokens (completed 2026-02-06)
  - shared/dialog.ts: border-border-subtle, backdrop-blur-2xl (cascades to ~60 consumers)
  - Dialog title: text-heading, description: text-body text-text-secondary
  - AlertDialog title: text-heading, description: text-body text-text-secondary, icon: bg-surface-2
  - Dialog close button: text-text-tertiary/hover:text-text-secondary, icon-md/icon-lg sizing
  - Button dialog/lg: rounded-radius-md (resolved Phase 1 deferred decision)
  - Summary: .planning/phases/v1.1-03-window-sheet-system/03-01-SUMMARY.md
- Plan 03-02: Sheet System Semantic Tokens (completed 2026-02-06)
  - SheetTitle: text-heading-lg font-bold text-text-primary md:text-display-lg
  - SheetDescription: text-body-sm text-text-tertiary
  - Sticky header border: border-border-default (was border-white/10)
  - Scroll area: bg-border-emphasis thumb, hover:bg-surface-2 track
  - Wallpaper blur (backdrop-blur-3xl) and sheet radii preserved
  - Summary: .planning/phases/v1.1-03-window-sheet-system/03-02-SUMMARY.md
- Plan 03-03: Window Chrome & Body Redesign (completed 2026-02-06)
  - Chrome: border-border-emphasis, shadow-elevation-md, text-body, text-text-primary, h-icon-md
  - Chrome: hover:bg-destructive, slimmer profile (px-4 py-2, w-9 h-9)
  - Window body: rounded-radius-xl, backdrop-blur-xl, border-border-default
  - Drag feedback: deeper shadow + opacity via Framer Motion animate prop
  - Window content: text-text-secondary for unknown app
  - Summary: .planning/phases/v1.1-03-window-sheet-system/03-03-SUMMARY.md
- Plan 03-04: ImmersiveDialog, Window Resize, Animation Polish (completed 2026-02-06)
  - ImmersiveDialog: text-heading-lg/text-text-primary title, text-body-lg/text-text-tertiary description
  - ImmersiveDialog: body text-body-lg/text-text-primary, separator border-border-default
  - ImmersiveDialog: icon messages rounded-radius-sm/border-border-subtle/bg-surface-base
  - ImmersiveDialog: icon text text-body-sm/text-caption/text-text-secondary
  - Window resize: UPDATE_SIZE action, updateWindowSize context, 8 resize handles, 400x400 min
  - EXIT_DURATION_MS: 100ms -> 150ms for smoother close animations
  - Summary: .planning/phases/v1.1-03-window-sheet-system/03-04-SUMMARY.md

**Phase v1.1-04: Settings Redesign**
- Plan 04-01: Settings Navigation Shell & Shared Foundation (completed 2026-02-06)
  - Shared class constants: text-caption/text-body/text-heading-sm/text-text-tertiary
  - ListRow desktop/mobile: semantic typography and surface tokens
  - SettingsSummary: text-body grid, text-text-tertiary labels
  - SettingsPageLayout: border-border-default, semantic back button
  - Sidebar: surface-2 default, surface-3 active, rounded-radius-sm
  - Header card: text-heading-lg, text-text-tertiary brand
  - Tabs base: surface-base/surface-2/text-text-primary/text-text-secondary
  - Mobile: text-heading-lg header, rounded-radius-md/bg-surface-base list
  - Summary: .planning/phases/v1.1-04-settings-redesign/04-01-SUMMARY.md
- Plan 04-02: Settings Section Content & Standalone Pages (completed 2026-02-06)
  - SettingsToggleRow: shared toggle+switch component with semantic tokens
  - SettingsInfoCard: shared info card with variant support (default/success/warning/danger)
  - All 13 section functions migrated to semantic tokens
  - 5 standalone pages: ai-config, 2fa-enable, 2fa-disable, advanced, wallpaper-picker
  - 8 SettingsToggleRow usages, 4 SettingsInfoCard usages
  - Colored status badges preserved (green/red/orange/sky/indigo/blue)
  - Summary: .planning/phases/v1.1-04-settings-redesign/04-02-SUMMARY.md
- Plan 04-03: Domain Setup, Nexus Config, Integrations Migration (completed 2026-02-06)
  - domain-setup.tsx: Tailwind defaults (text-xs/sm/base/lg/xl, rounded-xl/lg/2xl) -> semantic tokens
  - nexus-config.tsx: numeric tokens (text-12/14, rounded-12) -> semantic tokens
  - integrations.tsx: numeric tokens + raw colors -> semantic tokens
  - Tab consumer overrides cleaned: 4 TabsList bg-white/5, 6 TabsTrigger data-[state=active]:bg-white/10
  - Brand/status colors preserved throughout
  - Summary: .planning/phases/v1.1-04-settings-redesign/04-03-SUMMARY.md

**Phase v1.1-05: AI Chat Redesign**
- Plan 05-01: AI Chat Sidebar, Messages, Tool Calls (completed 2026-02-07)
  - ConversationSidebar: semantic surface-base/border-default/text-primary tokens
  - Relative timestamps via date-fns formatDistanceToNow
  - Tab switcher: border-brand for active state
  - ChatMessage: bg-brand user bubbles, bg-surface-2 assistant bubbles
  - ToolCallDisplay: border-default/surface-base/caption typography
  - StatusIndicator: surface-base/text-secondary
  - All conditional classes converted to cn()
  - Summary: .planning/phases/v1.1-05-ai-chat-redesign/05-01-SUMMARY.md
- Plan 05-02: Chat Input, Empty State, Quick Chat Dialog (completed 2026-02-07)
  - Empty state: text-heading-sm/text-text-secondary, text-body/text-text-tertiary, rounded-radius-xl
  - Suggestion chips: border-default/surface-base/text-caption with semantic hover hierarchy
  - Chat input: bg-surface-1, focus-visible:border-brand + ring-brand/20 brand focus pattern
  - Send button: bg-brand in both index.tsx and ai-quick.tsx
  - ai-quick.tsx dialog: bg-dialog-content, border-border-subtle, rounded-radius-xl
  - MiniToolCall: border-default/surface-base/text-caption matching ToolCallDisplay
  - Footer kbd: border-default/bg-surface-base/text-caption-sm
  - Summary: .planning/phases/v1.1-05-ai-chat-redesign/05-02-SUMMARY.md
- Plan 05-03: MCP Panel Semantic Token Migration (completed 2026-02-07)
  - All ~81 raw opacity values replaced with semantic tokens
  - InstallDialog: bg-dialog-content, border-border-default
  - Install/save buttons: bg-brand, hover:bg-brand-lighter
  - Tab bar active: border-brand (was border-violet-500)
  - All form inputs: brand focus pattern (focus-visible:border-brand + ring)
  - All text-[Npx] -> semantic typography, all rounded-XX -> semantic radii
  - Status/category/gradient colors preserved
  - Summary: .planning/phases/v1.1-05-ai-chat-redesign/05-03-SUMMARY.md

**Phase v1.1-06: App Store & Files**
- Plan 06-01: App Store Navigation, Cards, Discover Sections (completed 2026-02-07)
  - shared.tsx: cardClass/cardFaintClass/cardFeaturedClass -> bg-surface-1/base/2, border-subtle, elevation-sm
  - Gallery: simplified from 3-4 overlays to single gradient, removed purple/cyan glow
  - Grid/row/three-column: semantic surface/border/text, useColorThief preserved
  - Window-mode shared-components.tsx synced with sheet-mode tokens
  - Summary: .planning/phases/v1.1-06-app-store-files/06-01-SUMMARY.md
- Plan 06-03: File Manager Listing, Actions Bar, Sidebar & DnD (completed 2026-02-07)
  - File item views: text-text-tertiary/secondary/primary, text-caption/caption-sm
  - Grid view: bg-surface-1 upload overlay, text-text-tertiary
  - Actions bar: bg-surface-base search, brand focus, bg-surface-1 view toggle
  - Sidebar: surface-base/surface-2 gradient, text-caption, border-border-subtle
  - DnD overlay: border-border-emphasis, text-caption
  - Selection styling (bg-brand/10) and list-view-file-item.css preserved
  - Summary: .planning/phases/v1.1-06-app-store-files/06-03-SUMMARY.md
- Plan 06-02: App Store Detail Page & Dialogs (completed 2026-02-07)
  - Hero header: text-heading-lg/body-lg/heading-sm, rounded-radius-sm/md/xl
  - Local shared.tsx: rounded-radius-md, text-caption text-text-secondary, text-body-lg
  - 8 content sections: opacity-50/40 replaced with text-text-secondary/tertiary
  - Public access: all white/* replaced, status colors (green/red/yellow) preserved
  - 5 dialogs: divide-border-subtle, bg-surface-1, rounded-radius-md/sm, text-body-sm
  - Window-mode pages synced with sheet-mode token vocabulary
  - Summary: .planning/phases/v1.1-06-app-store-files/06-02-SUMMARY.md

**Phase v1.1-07: Login & Onboarding**
- Plan 07-01: Auth Layout Foundation (completed 2026-02-07)
  - shared.tsx: semantic tokens for Title/SubTitle/buttonClass/secondaryButtonClasss/footerLinkClass
  - buttonClass: bg-white text-black -> bg-brand text-white
  - secondaryButtonClasss: bg-neutral-600/40 -> bg-surface-2
  - Layout: stepIndicator prop slot between logo and title
  - StepIndicator: pill/dot component (bg-brand active, bg-brand/50 completed, bg-surface-3 future)
  - bare-page.tsx: min-h-[100dvh] -> min-h-dvh
  - Summary: .planning/phases/v1.1-07-login-onboarding/07-01-SUMMARY.md
- Plan 07-02: Login, PinInput & Onboarding Pages (completed 2026-02-07)
  - Login 2FA step: back button with secondaryButtonClasss, form->div wrapping
  - PinInput: border-border-emphasis, bg-surface-base, bg-surface-2 dots, rounded-radius-sm, bg-text-primary caret
  - PinInput: error recovery 500ms -> 800ms
  - OnboardingStart: StepIndicator step 0/3
  - CreateAccount: StepIndicator step 1/3, error spacer standardized
  - AccountCreated: StepIndicator step 2/3, text-caption + text-text-secondary for ToS
  - Summary: .planning/phases/v1.1-07-login-onboarding/07-02-SUMMARY.md
- Plan 07-03: Restore Flow & App-Auth Migration (completed 2026-02-07)
  - restore.tsx: StepIndicator with steps=4 and dynamic currentStep=step
  - restore.tsx: back button border-border-default/bg-surface-base/focus-visible:border-brand
  - restore.tsx: BackupSnapshot cn() with semantic tokens (rounded-radius-sm, border-border-default, bg-surface-2)
  - login-with-livinity.tsx: rounded-radius-xl, shadow-elevation-lg, text-heading-sm, text-body-sm, text-text-tertiary
  - Summary: .planning/phases/v1.1-07-login-onboarding/07-03-SUMMARY.md

**Phase v1.1-08: Mobile & Polish**
- Plan 08-01: Mobile AI Chat Drawer Sidebar (completed 2026-02-07)
  - useIsMobile hook + Drawer for mobile sidebar
  - Mobile header: hamburger menu, title, new conversation button
  - Responsive padding: p-3 md:p-6 messages, p-3 md:p-4 input
  - ConversationSidebar className prop for mobile override
  - Desktop layout completely unchanged
  - Summary: .planning/phases/v1.1-08-mobile-polish/08-01-SUMMARY.md
- Plan 08-02: Touch Target Optimization (completed 2026-02-07)
  - Mobile-first touch targets: h-[44px] md:h-[Npx] on button sizes
  - md-squared and input-short unchanged (close enough to 44px)
  - IconButton inherits via buttonVariants
  - Summary: .planning/phases/v1.1-08-mobile-polish/08-02-SUMMARY.md
- Plan 08-03: Backdrop-Blur Mobile Optimization (completed 2026-02-07)
  - Sheet overlay: backdrop-blur-lg md:backdrop-blur-xl + transform-gpu
  - Sheet content: backdrop-blur-xl md:backdrop-blur-3xl + transform-gpu
  - Dialog content: backdrop-blur-lg md:backdrop-blur-2xl + transform-gpu
  - Toast: transform-gpu for GPU-composited backdrop blur
  - Dock item: transform-gpu for GPU-composited backdrop blur
  - Summary: .planning/phases/v1.1-08-mobile-polish/08-03-SUMMARY.md
- Plan 08-04: Drawer/Modal Polish & Cross-Viewport Verification (completed 2026-02-07)
  - Drawer: bg-[#0F0F0F] -> bg-black/90 (semantic consistency)
  - ImmersiveDialog close: mt-2 md:mt-5 responsive margin
  - ImmersiveDialog close: 44px mobile touch target (md:36px desktop)
  - Summary: .planning/phases/v1.1-08-mobile-polish/08-04-SUMMARY.md

---

## v1.0 Archive

v1.0 completed 20/25 plans across 9 phases (Phases 4 and 10 not started).
See ROADMAP.md for v1.0 details. v1.0 artifacts preserved in phase directories.
