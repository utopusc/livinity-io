# Requirements: LivOS v2.0 — Command Center Redesign

**Defined:** 2026-02-07
**Core Value:** Transform LivOS from an Umbrel clone into a unique "Command Center" — information-dense, AI-first, with its own visual identity
**Milestone Goal:** Complete structural redesign — new layouts, new navigation, new home screen, bug fixes, new features. Every screen must look and function differently from Umbrel.

## Context

v1.0-v1.2 kept the same Umbrel-like layout (dock + icon grid + glassmorphism). The user explicitly demands a completely new UI with different positions, layouts, and identity. Based on `.planning/UI-RESEARCH.md` (40-source research) and deep codebase audit.

## v2.0 Requirements

### Bug Fixes (BF)

- [ ] **BF-01**: Fix window stacking bug — openWindow useCallback has stale closure ([] deps reads stale state.windows.length), all windows spawn at same position
- [ ] **BF-02**: Fix AI Chat layout in window — window-content.tsx wraps all apps in overflow-auto + p-4 padding, breaking chat's flex h-full layout (input scrolls away)
- [ ] **BF-03**: Fix Files layout in window — same overflow-auto + padding issue as BF-02, files sidebar gets cut off
- [ ] **BF-04**: Fix MCP config in AI Chat — MCP panel uses raw fetch() instead of tRPC, config save doesn't work reliably
- [ ] **BF-05**: Fix window-only apps inaccessible on mobile — WindowsContainer returns null on mobile, making AI Chat/Terminal/etc completely unreachable

### Visual Foundation (VF)

- [ ] **VF-01**: Switch to solid dark surfaces — replace all rgba(255,255,255,0.XX) surface tokens with solid hex colors: bg #111111, surface-1 #191919, surface-2 #222222, surface-3 #2A2A2A
- [ ] **VF-02**: Switch fonts — replace Plus Jakarta Sans with Inter (body) + DM Sans (headings) + JetBrains Mono (code). Update font imports and tailwind.config.ts
- [ ] **VF-03**: Visible borders — replace translucent border tokens with solid #333333 (border-default), #444444 (border-emphasis), #282828 (border-subtle)
- [ ] **VF-04**: Fixed accent color — use violet #7C3AED as primary brand color, remove wallpaper-derived dynamic theming dependency for UI elements
- [ ] **VF-05**: Simplify border radius — reduce to 3 values: 8px (elements/buttons), 12px (cards/inputs), 16px (sheets/dialogs). Remove radius-2xl, radius-3xl, radius-sm
- [ ] **VF-06**: Solid text colors — replace rgba text tokens with solid: text-primary #EDEDED, text-secondary #888888, text-tertiary #555555
- [ ] **VF-07**: Update shadow system — darker, more visible shadows for solid surface theme. Remove white inset glows (designed for glass, not solid surfaces)

### Navigation Overhaul (NO)

- [ ] **NO-01**: Create collapsible sidebar component — persistent left sidebar with: logo, navigation items, app list with status dots, collapse to icon-only mode, resizable width
- [ ] **NO-02**: Integrate sidebar into desktop layout — replace current dock+icon-grid layout with sidebar+main-content layout
- [ ] **NO-03**: Remove dock from desktop — dock no longer renders on desktop when sidebar is active (keep dock code for potential mobile use)
- [ ] **NO-04**: Mobile bottom tab bar — on mobile, replace dock with a simple 5-item bottom tab bar (Home, Apps, AI, Files, Settings)
- [ ] **NO-05**: Enhanced command palette — upgrade existing Cmd+K to search across apps, files, settings, docker containers, and AI queries. Add keyboard shortcut hints in results.

### Dashboard Home (DH)

- [ ] **DH-01**: Replace icon grid with bento widget layout — configurable grid of mixed-size widgets instead of uniform app icons
- [ ] **DH-02**: System health widget — shows CPU, RAM, disk usage, temperature in a compact card with mini visualizations
- [ ] **DH-03**: Pinned apps widget — small grid of user-pinned apps with status dots (running/stopped/error), replaces the old full-screen icon grid
- [ ] **DH-04**: Quick actions widget — one-tap buttons for common operations (Update All, Create Backup, Restart Docker, View Logs)
- [ ] **DH-05**: Recent files widget — shows last 5-8 accessed files with type icons and quick open
- [ ] **DH-06**: AI insights widget — shows Nexus-generated tips/alerts about system status, available updates, potential issues

### AI Chat Redesign (AC)

- [ ] **AC-01**: Fix chat layout — chat must work correctly in both sheet and window modes, input always visible at bottom, messages scrollable
- [ ] **AC-02**: Improved tool call cards — collapsible cards showing tool name, status (running/success/error), output preview, expand for full output
- [ ] **AC-03**: Better empty state — centered with large Nexus icon, greeting, and 4-6 suggestion chips for common actions
- [ ] **AC-04**: Input area improvements — multiline support, file attachment button, slash command hints, model indicator
- [ ] **AC-05**: Conversation sidebar improvements — grouped by date (Today, Yesterday, This Week), search conversations, delete/rename

### Settings Redesign (SR)

- [ ] **SR-01**: Settings sidebar with search — left sidebar showing all settings categories, search bar that filters sections and individual settings
- [ ] **SR-02**: Grouped sections with clear headings — each settings page divided into logical groups with horizontal dividers and group headings
- [ ] **SR-03**: Danger zone pattern — destructive actions (reset, shutdown) visually separated at bottom with red-tinted section border

### App Store Redesign (AS)

- [ ] **AS-01**: Hero featured section — full-width featured app card with gradient background at top of app store
- [ ] **AS-02**: Horizontal scroll rows — Netflix-style category rows (Popular, Media, Development, etc.) with See All links
- [ ] **AS-03**: Improved app cards — larger icons (48px), one-line tagline, status indicator (Installed/Running/Update), category pill badge, action button (Install/Open/Update)
- [ ] **AS-04**: Category pill navigation — horizontal scrollable pill/chip bar at top for category filtering (All, Media, Productivity, Development, Network, Security, AI)

### File Manager Redesign (FM)

- [ ] **FM-01**: Add grid/thumbnail view — card-based view with large file type icons and image thumbnails, toggle between list and grid
- [ ] **FM-02**: Breadcrumb navigation — clickable path segments (Home / Documents / Projects) replacing current path display
- [ ] **FM-03**: Improved empty states — when folder is empty, show illustration and Upload Files CTA
- [ ] **FM-04**: Hover quick actions — show share, delete, rename buttons on row hover without requiring right-click

### Window System (WS)

- [ ] **WS-01**: Per-app content handling — remove universal overflow-auto + padding wrapper, let each app control its own scroll and padding
- [ ] **WS-02**: Add maximize button — window chrome gets maximize button that expands window to fill viewport (minus sidebar)
- [ ] **WS-03**: Better resize handles — increase from 1px/3px to 4px edges and 8px corners for easier grabbing
- [ ] **WS-04**: Window snapping — drag to screen edges to snap to half/quarter screen positions

### Polish & Features (PF)

- [ ] **PF-01**: Keyboard shortcuts system — Cmd+K (palette), Cmd+/ (AI chat), Cmd+E (files), Cmd+T (terminal), Cmd+, (settings). Show in tooltips.
- [ ] **PF-02**: Loading skeletons — add skeleton placeholders for dashboard widgets, app store cards, file lists while data loads
- [ ] **PF-03**: Professional animations — replace bouncy springs (damping 10-14) with dampened springs (damping 25-30), reduce animation surface area
- [ ] **PF-04**: Status-aware design — green/amber/red status dots on apps, docker containers, and services throughout the UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Light theme | Dark theme is core identity |
| Brand surface tinting from wallpaper | Moving to fixed accent color |
| Push notifications (PWA) | Requires service worker infrastructure |
| Split view | Complex window management, defer to v2.1 |
| Activity/audit log page | Backend infrastructure needed, defer |
| Connection/dependency map | Complex visualization, defer |
| File preview panel | Complex file rendering, defer to v2.1 |
| Column/Miller file view | Low priority view mode, defer |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BF-01 to BF-05 | Phase 1 | Pending |
| VF-01 to VF-07 | Phase 2 | Pending |
| NO-01 to NO-05 | Phase 3 | Pending |
| DH-01 to DH-06 | Phase 4 | Pending |
| WS-01 to WS-04 | Phase 5 | Pending |
| AC-01 to AC-05 | Phase 6 | Pending |
| SR-01 to SR-03 | Phase 7 | Pending |
| AS-01 to AS-04 | Phase 8 | Pending |
| FM-01 to FM-04 | Phase 9 | Pending |
| PF-01 to PF-04 | Phase 10 | Pending |

**Coverage:**
- v2.0 requirements: 47 total
- Complete: 0
- Pending: 47
- Unmapped: 0

---
*Requirements defined: 2026-02-07*
