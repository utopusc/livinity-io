# Requirements — v5.0 Light Theme UI Redesign

**Defined:** 2026-03-05
**Core Value:** One-command deployment of a personal AI-powered server that just works.

## Category: Design Foundation (DF)

### REQ-DF-01: Light Theme Semantic Tokens
Convert all semantic color tokens in `tailwind.config.ts` from dark (white-on-black) to light (dark-on-white).
- `text-primary`: dark text on light bg (e.g., `rgba(15,23,42,0.92)`)
- `text-secondary`, `text-tertiary`: slate gray shades
- `surface-base/1/2/3`: light surfaces with subtle gray fills
- `border-subtle/default/emphasis`: light gray borders
- `info-surface`, `warning-surface`: light tinted surfaces
- `dialog-content`: light value

### REQ-DF-02: Light Theme CSS Variables & Globals
Update `index.css` for light theme:
- Scrollbar colors (from `white/15%` to `slate/20%`)
- Selection colors
- Divide styling (`via-white/5` to dark equivalent)
- Logo glow, gradient blobs for onboarding — light-appropriate colors
- Typography prose colors for light backgrounds

### REQ-DF-03: Light Theme Shadows
Convert all box shadows from dark-mode (white inner glow + heavy black drop) to light-mode:
- `elevation-sm/md/lg/xl`: lighter drop shadows with minimal inner glow
- `dock`, `floating-island`, `widget`: frosted glass on light
- `dialog`, `dropdown`, `context-menu`: soft gray shadows
- `card-elevated/hover`: subtle lift
- `button-highlight*`: top-edge highlights appropriate for light surfaces

### REQ-DF-04: Install Additional motion-primitives
Install components from motion-primitives.com/docs as needed per screen. Evaluate per phase.

## Category: Base Components (BC)

### REQ-BC-01: shadcn Component Light Theme
Update all 27 shadcn components for light theme consistency:
- button, input, select, checkbox, switch, radio-group
- dialog, drawer, sheet, alert-dialog, popover
- dropdown-menu, context-menu, command
- badge, alert, tooltip, tabs, table
- progress, scroll-area, separator, pagination, carousel
- form, label, sheet-scroll-area

### REQ-BC-02: Custom UI Component Light Theme
Update all custom UI components for light theme:
- card, loading, alert, toast, step-indicator
- icon-button, button-link, copy-button, copyable-field
- cover-message, error-boundary fallbacks
- list, segmented-control, numbered-list
- animated-number, arc, pin-input, notification-badge
- immersive-dialog, dialog-close-button, fade-in-img

### REQ-BC-03: Shared Module Components
Update shared/module-level components:
- install-button, progress-button, app-icon
- cmdk (command palette)
- markdown renderer
- darken-layer, fade-scroller

## Category: Screen Redesign (SR)

### REQ-SR-01: Login Page
Light theme with professional styling, motion-primitives animations.

### REQ-SR-02: Onboarding / Setup Wizard
- 6-step wizard: Account, Language, Domain, Claude Auth, AI Config, Complete
- Replace all 60+ `text-white`/`bg-white/X` references with semantic tokens
- All hardcoded English strings wrapped in `t()` i18n
- Professional light theme cards with subtle shadows
- motion-primitives transitions between steps

### REQ-SR-03: Desktop Environment
- Dock: frosted glass on light background
- App grid: clean icons on light desktop
- Desktop app icons: light-appropriate text shadows
- Wallpaper integration with light chrome

### REQ-SR-04: Window Manager
- Window chrome: light title bar with colored dots (macOS-style)
- Window content area: white/light surface
- Resize handles, drag zones: light styling

### REQ-SR-05: App Store
- Discover page: featured sections, category cards — light theme
- Category page: grid layout
- App page: detail view with install button
- Community app store variant
- Window-embedded variants (discover-window, app-page-window, marketplace-app-window, etc.)

### REQ-SR-06: AI Chat
- Main chat area: light bubbles, user/AI differentiation
- Sidebar: conversation list on light background
- Canvas panel + iframe
- Skills panel, MCP panel
- Voice button
- Input area with light styling

### REQ-SR-07: Settings Hub
Main settings index + all sub-pages:
- Account: change-name, change-password, 2fa, 2fa-enable, 2fa-disable
- System: device-info, software-update, restart, shutdown, advanced
- Network: domain-setup, wifi, wifi-unsupported
- AI: ai-config, nexus-config, voice
- Integrations: integrations, dm-pairing, gmail, webhooks
- Data: usage-dashboard, migration-assistant, app-store-preferences
- Mobile variants (8 pages)
- Settings shared components (list-row, toggle-row, info-card, page-layout, summary, content)

### REQ-SR-08: File Manager
- Main listing (grid + list views)
- Sidebar (home, docs, downloads, trash, network storage)
- Server cards
- Floating islands (uploading, operations, formatting, audio — both minimized + expanded)
- Rewind (timeline, snapshots, restore dialog)
- Mini browser
- Dialogs (share, format-drive, permanently-delete, add-network-share)
- DnD overlay, file upload drop zone

### REQ-SR-09: Server Control
Light theme dashboard with status cards, action buttons, AnimatedNumber stats.

### REQ-SR-10: Notifications
Light notification cards with read/unread states.

### REQ-SR-11: Subagents Page
Light theme agent cards (37 white/bg-white references to fix).

### REQ-SR-12: Schedules
Light theme schedule cards and creation UI.

### REQ-SR-13: Factory Reset
Light theme with appropriate warning styling for destructive action.

### REQ-SR-14: Terminal
Light chrome with dark terminal body (intentional — keep terminal dark).

### REQ-SR-15: Live Usage
Light usage statistics page with charts.

### REQ-SR-16: Miscellaneous Pages
- What's New modal
- Not Found page
- Error boundary fallbacks (page, card, component levels)

## Category: i18n (I18N)

### REQ-I18N-01: Setup Wizard i18n
Wrap all hardcoded English strings in setup-wizard.tsx with `t()`. Focus: domain labels, Claude auth instructions, AI config text.

### REQ-I18N-02: Screen-Level i18n Audit
Ensure every user-visible string across all redesigned screens uses `t()`. Priority: settings sub-pages, app store, server control, schedules, subagents.

## Category: Quality (QA)

### REQ-QA-01: Remove All Raw Color References
Eliminate all `text-white`, `bg-white/X`, `border-white/X` references (539 occurrences, 133 files). Replace with semantic tokens.

### REQ-QA-02: Visual Consistency Verification
Every screen must look intentionally light-themed — no dark remnants, no broken contrast.

### REQ-QA-03: Build Verification
Clean build with no TypeScript errors after all changes.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dark theme toggle | Light only for v5.0 |
| New backend features | UI-only redesign |
| New pages/routes | Redesign existing only |
| Mobile-first responsive rewrite | Keep existing responsive behavior |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-DF-01 | Phase 01 | Pending |
| REQ-DF-02 | Phase 01 | Pending |
| REQ-DF-03 | Phase 01 | Pending |
| REQ-DF-04 | Phase 01 | Pending |
| REQ-BC-01 | Phase 02 | Pending |
| REQ-BC-02 | Phase 02 | Pending |
| REQ-BC-03 | Phase 02 | Pending |
| REQ-SR-01 | Phase 03 | Pending |
| REQ-SR-02 | Phase 03 | Pending |
| REQ-SR-03 | Phase 04 | Pending |
| REQ-SR-04 | Phase 04 | Pending |
| REQ-SR-05 | Phase 05 | Pending |
| REQ-SR-06 | Phase 06 | Pending |
| REQ-SR-07 | Phase 07 | Pending |
| REQ-SR-08 | Phase 08 | Pending |
| REQ-SR-09 | Phase 09 | Pending |
| REQ-SR-10 | Phase 09 | Pending |
| REQ-SR-11 | Phase 09 | Pending |
| REQ-SR-12 | Phase 09 | Pending |
| REQ-SR-13 | Phase 09 | Pending |
| REQ-SR-14 | Phase 09 | Pending |
| REQ-SR-15 | Phase 09 | Pending |
| REQ-SR-16 | Phase 09 | Pending |
| REQ-I18N-01 | Phase 03 | Pending |
| REQ-I18N-02 | Phase 10 | Pending |
| REQ-QA-01 | Phase 02+10 | Pending |
| REQ-QA-02 | Phase 10 | Pending |
| REQ-QA-03 | Phase 10 | Pending |

**Coverage:**
- v5.0 requirements: 28 total
- Mapped to phases: 28/28
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
