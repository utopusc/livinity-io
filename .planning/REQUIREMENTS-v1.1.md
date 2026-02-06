# Requirements: LivOS v1.1 — UI Redesign

**Defined:** 2026-02-06
**Core Value:** Minimal & Clean UI with professional Livinity brand identity (Apple/Linear style)
**Milestone Goal:** Replace Umbrel-inherited UI with a modern, cohesive Livinity-branded interface

## v1.1 Requirements

### Design System (DS)

- [x] **DS-01**: Define refined color palette with improved contrast ratios and semantic color tokens ✓
- [x] **DS-02**: Refine typography scale with tighter hierarchy (reduce font size variants, establish clear heading/body/caption levels) ✓
- [x] **DS-03**: Standardize spacing system with consistent padding/gap tokens ✓
- [x] **DS-04**: Update shadow system for cleaner, more subtle depth (reduce heavy glassmorphism) ✓
- [x] **DS-05**: Create standardized card component with consistent border, radius, and background patterns ✓
- [x] **DS-06**: Redesign button variants (primary, secondary, ghost, destructive) with refined styles ✓
- [x] **DS-07**: Redesign input/form components with cleaner focus states and consistent sizing ✓
- [x] **DS-08**: Update icon usage to consistent set with proper sizing and weight ✓

### Desktop & Dock (DD)

- [x] **DD-01**: Redesign dock with slimmer profile, refined hover animations, and cleaner divider ✓
- [x] **DD-02**: Redesign desktop layout with improved app grid spacing and alignment ✓
- [x] **DD-03**: Redesign desktop header/greeting with minimal typography ✓
- [x] **DD-04**: Improve wallpaper system with better blur transitions and edge handling ✓
- [x] **DD-05**: Redesign context menu (right-click) with minimal style ✓

### Window System (WS)

- [ ] **WS-01**: Redesign floating window chrome (title bar) with cleaner, more minimal style
- [ ] **WS-02**: Update window body with refined borders, shadows, and background
- [ ] **WS-03**: Improve window drag interaction and z-index management visual feedback
- [ ] **WS-04**: Add window resize handles with smooth animation

### Sheet & Modal System (SM)

- [ ] **SM-01**: Redesign sheet header with cleaner close button and title styling
- [ ] **SM-02**: Update sheet background and border for refined appearance
- [ ] **SM-03**: Redesign dialog/modal components with consistent styling
- [ ] **SM-04**: Improve sheet open/close animations for smoother feel

### Settings (ST)

- [ ] **ST-01**: Redesign settings sidebar with cleaner navigation items and active states
- [ ] **ST-02**: Redesign settings content sections with consistent card-based layout
- [ ] **ST-03**: Redesign settings header card (user info area) with minimal style
- [ ] **ST-04**: Update form layouts within settings for better alignment and spacing
- [ ] **ST-05**: Redesign tab components used in settings (Nexus config, Integrations)

### AI Chat (AC)

- [ ] **AC-01**: Redesign AI chat sidebar with cleaner conversation list
- [ ] **AC-02**: Redesign message bubbles with refined spacing, typography, and colors
- [ ] **AC-03**: Redesign chat input area with modern, clean text input
- [ ] **AC-04**: Redesign empty state with branded illustration
- [ ] **AC-05**: Improve tool call display with cleaner accordion/expandable sections
- [ ] **AC-06**: Redesign MCP panel with consistent card layout

### App Store (AS)

- [ ] **AS-01**: Redesign app store navigation with refined category chips
- [ ] **AS-02**: Redesign app cards with cleaner layout, better icon display, and subtle hover effects
- [ ] **AS-03**: Redesign app detail page with modern hero section and structured content
- [ ] **AS-04**: Redesign gallery/banner carousel with minimal navigation

### File Manager (FM)

- [ ] **FM-01**: Redesign file list/grid view with cleaner item layout
- [ ] **FM-02**: Redesign file browser header with breadcrumb navigation
- [ ] **FM-03**: Redesign file action buttons and context menus
- [ ] **FM-04**: Improve drag-and-drop visual feedback

### Login & Onboarding (LO)

- [ ] **LO-01**: Redesign login page with Livinity-branded visual identity
- [ ] **LO-02**: Redesign onboarding flow with step indicators and cleaner forms
- [ ] **LO-03**: Add Livinity logo and brand assets to auth pages
- [ ] **LO-04**: Redesign 2FA input with improved UX

### Mobile Responsiveness (MR)

- [ ] **MR-01**: Ensure all redesigned components work on mobile viewports
- [ ] **MR-02**: Optimize touch interactions for mobile dock and navigation
- [ ] **MR-03**: Ensure sheets and modals are mobile-optimized
- [ ] **MR-04**: Test and fix responsive breakpoints across all views

### Command Palette & Notifications (CN)

- [x] **CN-01**: Redesign command palette (Cmd+K) with refined styling ✓
- [x] **CN-02**: Redesign notification/toast system with cleaner style ✓
- [x] **CN-03**: Redesign floating island notifications ✓

## Out of Scope

| Feature | Reason |
|---------|--------|
| New pages/features | v1.1 is visual redesign only |
| Backend changes | UI-only milestone |
| New functionality | Focus on polish, not features |
| Complete rewrite | Iterative improvement on existing components |
| Dark/Light theme toggle | Dark theme is core identity, light mode deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DS-01 to DS-08 | Phase 1 | Complete |
| DD-01 to DD-05 | Phase 2 | Complete |
| WS-01 to WS-04 | Phase 3 | Pending |
| SM-01 to SM-04 | Phase 3 | Pending |
| ST-01 to ST-05 | Phase 4 | Pending |
| AC-01 to AC-06 | Phase 5 | Pending |
| AS-01 to AS-04 | Phase 6 | Pending |
| FM-01 to FM-04 | Phase 6 | Pending |
| LO-01 to LO-04 | Phase 7 | Pending |
| MR-01 to MR-04 | Phase 8 | Pending |
| CN-01 to CN-03 | Phase 2 | Complete |

**Coverage:**
- v1.1 requirements: 47 total
- Complete: 16 (DS-01–DS-08, DD-01–DD-05, CN-01–CN-03)
- Pending: 31
- Unmapped: 0

---
*Requirements defined: 2026-02-06*
