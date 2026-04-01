# Phase 39: Mobile Home Screen + App Access - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the mobile home screen into a phone-like experience: hide the dock completely, add system apps (AI Chat, Settings, Files, Server, Terminal) to the app grid, and add a bottom tab bar with 5 primary apps for quick access.

</domain>

<decisions>
## Implementation Decisions

### Dock on Mobile
- Dock completely hidden on mobile (useIsMobile guard in DockBottomPositioner → return null)
- DockSpacer also returns null on mobile (replaced by tab bar spacer)
- Desktop dock completely unchanged

### System Apps in Grid
- On mobile, add system app icons to the grid: AI Chat, Settings, Files, Server, Terminal
- Use existing AppIcon component with system app icons from /figma-exports/
- onClick opens via MobileAppContext.openApp() (from Phase 38)
- System apps appear at the TOP of the grid (before installed Docker apps)

### Bottom Tab Bar
- 5 tabs: Home (grid icon), AI Chat, Files, Settings, Server
- Fixed at bottom with safe-area-bottom padding (pb-safe from Phase 37)
- Active tab highlighted with brand color
- Home tab returns to grid (closes any open app)
- Other tabs open the app via MobileAppContext
- Tab bar visible on home screen AND when an app is open
- When app is open, corresponding tab is highlighted
- Height: ~56px + safe area bottom

### Claude's Discretion
- Exact tab bar icon choices (Tabler Icons)
- Tab bar background style (solid white vs translucent)
- Animation on tab switch
- Whether to show text labels under tab icons

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/ui/src/modules/desktop/dock.tsx` — DockBottomPositioner wraps Dock, uses useIsMobile
- `livos/packages/ui/src/modules/desktop/dock.tsx` — DockSpacer exported separately
- `livos/packages/ui/src/modules/desktop/desktop-content.tsx` — gridItems array builds app grid
- `livos/packages/ui/src/modules/mobile/mobile-app-context.tsx` — openApp/closeApp from Phase 38
- `livos/packages/ui/src/modules/mobile/mobile-app-renderer.tsx` — full-screen overlay from Phase 38
- Tabler Icons already used throughout (IconSend, IconSettings, etc.)

### Established Patterns
- useIsMobile() for conditional rendering
- CSS safe area utilities from Phase 37 (pt-safe, pb-safe)
- Framer Motion for animations

### Integration Points
- `dock.tsx` — DockBottomPositioner needs isMobile guard
- `desktop-content.tsx` — gridItems needs system apps on mobile
- `router.tsx` — MobileTabBar needs to be added (fixed at bottom)
- `mobile-app-renderer.tsx` — may need to account for tab bar height

</code_context>

<specifics>
## Specific Ideas

- Tab bar should look like iOS native tab bar (solid white, subtle top border, icons with labels)
- Home icon: IconHome or IconApps
- AI Chat icon: IconMessage or IconMessageCircle
- Files icon: IconFolder
- Settings icon: IconSettings
- Server icon: IconServer

</specifics>

<deferred>
## Deferred Ideas

- Swipe between tabs (v2)
- Badge/notification counts on tab icons (v2)
- Customizable tab bar apps (v2)

</deferred>
