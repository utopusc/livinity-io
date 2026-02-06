# Roadmap: LivOS v1.1 — UI Redesign

## Overview

This roadmap transforms the LivOS UI from its Umbrel-inherited design into a cohesive, professional Livinity-branded interface. The approach is "Minimal & Clean" inspired by Apple and Linear design languages — reducing visual noise, improving contrast, tightening typography, and creating a consistent brand identity throughout the application.

The redesign progresses from foundation (design system tokens) through core shell components (desktop, dock, windows), into major views (settings, AI chat, app store), and finishes with auth pages and responsive polish.

## Phases

- [x] **Phase 1: Design System Foundation** — Define tokens, update Tailwind config, refine base components ✓
- [x] **Phase 2: Desktop Shell** — Dock, desktop layout, context menu, command palette, notifications ✓
- [x] **Phase 3: Window & Sheet System** — Floating windows, sheet modals, dialogs ✓
- [ ] **Phase 4: Settings Redesign** — Settings sidebar, content sections, forms, tabs
- [ ] **Phase 5: AI Chat Redesign** — Chat sidebar, messages, input, tool calls, MCP
- [ ] **Phase 6: App Store & Files** — App store navigation/cards/detail, file manager views
- [ ] **Phase 7: Login & Onboarding** — Auth pages with Livinity branding
- [ ] **Phase 8: Mobile & Polish** — Responsive fixes, animations, final polish

## Phase Details

### Phase 1: Design System Foundation
**Goal**: Establish the refined design tokens and base component library that all other phases build upon
**Depends on**: Nothing (first phase)
**Requirements**: DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07, DS-08
**Success Criteria** (what must be TRUE):
  1. Updated color palette with semantic tokens in tailwind.config.ts
  2. Refined typography scale with clear heading/body/caption levels
  3. Standardized spacing tokens applied to base components
  4. Updated shadow system with cleaner, subtler depth effects
  5. Redesigned card, button, and input components
  6. Consistent icon sizing and weight throughout base components
**Plans**: 3 plans in 2 waves

Plans:
- [x] 01-01-PLAN.md — Define semantic design tokens (colors, typography, shadows, radii, icon sizes) in tailwind.config.ts
- [x] 01-02-PLAN.md — Redesign Button and Card components with semantic tokens
- [x] 01-03-PLAN.md — Redesign Input, Select, and Switch components with semantic tokens

### Phase 2: Desktop Shell
**Goal**: Redesign the main desktop experience — dock, app grid, command palette, notifications
**Depends on**: Phase 1
**Requirements**: DD-01, DD-02, DD-03, DD-04, DD-05, CN-01, CN-02, CN-03
**Success Criteria** (what must be TRUE):
  1. Dock has slimmer profile with refined hover animation
  2. Desktop app grid has improved spacing and alignment
  3. Desktop header uses minimal typography
  4. Context menu follows new design language
  5. Command palette (Cmd+K) has refined styling
  6. Notifications and floating island updated
**Plans**: 5 plans in 3 waves

Plans:
- [x] 02-01-PLAN.md — Dock redesign with slimmer profile and semantic tokens (DD-01)
- [x] 02-02-PLAN.md — Desktop content, app grid, header, and search button token migration (DD-02, DD-03)
- [x] 02-03-PLAN.md — Context menu shared classes and command palette token migration (DD-05, CN-01)
- [x] 02-04-PLAN.md — Toast and floating island notification redesign (CN-02, CN-03)
- [x] 02-05-PLAN.md — Wallpaper blur transitions and desktop preview alignment (DD-04)

### Phase 3: Window & Sheet System
**Goal**: Redesign the window chrome, sheet/modal patterns, and dialog system with semantic tokens, plus add window resize
**Depends on**: Phase 1
**Requirements**: WS-01, WS-02, WS-03, WS-04, SM-01, SM-02, SM-03, SM-04
**Success Criteria** (what must be TRUE):
  1. Window title bar is cleaner and more minimal
  2. Window body has refined borders and shadows
  3. Sheet header and background use new design tokens
  4. Dialogs/modals have consistent styling
  5. Animations are smooth and polished
**Plans**: 4 plans in 3 waves

Plans:
- [x] 03-01-PLAN.md — shared/dialog.ts foundation + Dialog + AlertDialog + button rounded-14 migration (SM-03)
- [x] 03-02-PLAN.md — Sheet title/description, sticky header, scroll area token migration (SM-01, SM-02)
- [x] 03-03-PLAN.md — Window chrome redesign + window body semantic tokens + drag feedback (WS-01, WS-02, WS-03)
- [x] 03-04-PLAN.md — ImmersiveDialog migration + window resize handles + animation polish (WS-04, SM-04)

### Phase 4: Settings Redesign
**Goal**: Complete visual overhaul of the settings interface
**Depends on**: Phase 1, Phase 3
**Requirements**: ST-01, ST-02, ST-03, ST-04, ST-05
**Success Criteria** (what must be TRUE):
  1. Settings sidebar has clean navigation with clear active state
  2. Content sections use consistent card layout
  3. User info header card is minimal and branded
  4. Forms have proper alignment and spacing
  5. Tab components match new design language
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 04-01-PLAN.md — Settings sidebar + header card + shared classes + tabs base component (ST-01, ST-03, ST-05)
- [ ] 04-02-PLAN.md — Section content token migration + shared component extraction (ST-02, ST-04)
- [ ] 04-03-PLAN.md — Large standalone pages (domain-setup, nexus-config, integrations) + tab consumer cleanup (ST-02, ST-04, ST-05)

### Phase 5: AI Chat Redesign
**Goal**: Transform the AI chat into a professional, polished conversation interface
**Depends on**: Phase 1, Phase 3
**Requirements**: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06
**Success Criteria** (what must be TRUE):
  1. Chat sidebar has clean conversation list with timestamps
  2. Message bubbles have refined styling and spacing
  3. Input area is modern and inviting
  4. Empty state has branded design
  5. Tool calls are displayed cleanly
  6. MCP panel has consistent layout
**Plans**: TBD (estimated 2-3 plans)

### Phase 6: App Store & Files
**Goal**: Redesign app browsing and file management interfaces
**Depends on**: Phase 1, Phase 3
**Requirements**: AS-01, AS-02, AS-03, AS-04, FM-01, FM-02, FM-03, FM-04
**Success Criteria** (what must be TRUE):
  1. App store has refined category navigation
  2. App cards have modern layout with subtle hover effects
  3. App detail page has clean hero section
  4. File list/grid has proper spacing and alignment
  5. File browser navigation is intuitive
  6. File actions and context menus match design language
**Plans**: TBD (estimated 3-4 plans)

### Phase 7: Login & Onboarding
**Goal**: Create a branded authentication experience
**Depends on**: Phase 1
**Requirements**: LO-01, LO-02, LO-03, LO-04
**Success Criteria** (what must be TRUE):
  1. Login page has Livinity brand identity
  2. Onboarding flow has step indicators
  3. Forms are clean and well-spaced
  4. 2FA input has improved UX
  5. Brand assets (logo) are present
**Plans**: TBD (estimated 1-2 plans)

### Phase 8: Mobile & Polish
**Goal**: Ensure responsive design works across all redesigned views and add final polish
**Depends on**: All previous phases
**Requirements**: MR-01, MR-02, MR-03, MR-04
**Success Criteria** (what must be TRUE):
  1. All views work on mobile viewport (375px+)
  2. Touch interactions work on dock and navigation
  3. Sheets and modals are mobile-optimized
  4. No responsive breakpoint issues
  5. Animations perform well on mobile
**Plans**: TBD (estimated 2-3 plans)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8
(Phase 3-7 can partially parallel after Phase 1, but Phase 3 before 4-6)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Design System Foundation | 3/3 | Complete | 2026-02-06 |
| 2. Desktop Shell | 5/5 | Complete | 2026-02-06 |
| 3. Window & Sheet System | 4/4 | Complete | 2026-02-06 |
| 4. Settings Redesign | 3/3 | Complete | 2026-02-06 |
| 5. AI Chat Redesign | 0/? | Not started | - |
| 6. App Store & Files | 0/? | Not started | - |
| 7. Login & Onboarding | 0/? | Not started | - |
| 8. Mobile & Polish | 0/? | Not started | - |

---
*Roadmap created: 2026-02-06*
*Total phases: 8 | Total plans: ~22-28 (estimated)*
*Coverage: 47/47 v1.1 requirements mapped*
