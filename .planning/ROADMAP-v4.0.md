# v4.0 Roadmap — UI Polish, Fixes & Motion Primitives Overhaul

## Phase 01: Install motion-primitives & Fix Design System
**Goal:** Install all motion-primitives components, switch to light theme, rebuild design tokens
**Requirements:** R2.1, R2.2, R3.1-R3.7
**Plans:**
1. Install motion-primitives components via CLI
2. Overhaul globals.css — light theme tokens, new color palette, typography
3. Update tailwind config and base styles

## Phase 02: Fix App Store (Critical Bug)
**Goal:** App Store shows apps, install/uninstall works
**Requirements:** R1.1, R1.2, R1.3, R5.1-R5.6
**Plans:**
1. Fix tRPC calls — use both appStore.registry + appStore.builtinApps
2. Rebuild App Store with discover layout, featured sections, categories
3. Add motion-primitives animations (AnimatedGroup, InView, TransitionPanel)

## Phase 03: Fix & Polish Login/Onboarding
**Goal:** Beautiful login page with animations, working auth flow
**Requirements:** R1.8, R4.1
**Plans:**
1. Fix login/onboarding tRPC calls and flow
2. Redesign with light theme, TextEffect heading, smooth form transitions
3. Add entrance animations and polish

## Phase 04: Desktop, Dock & Window System Polish
**Goal:** Beautiful desktop with animated greeting, polished dock, smooth window management
**Requirements:** R4.2, R4.7, R4.8, R4.9
**Plans:**
1. Redesign desktop page — TextEffect greeting, animated clock/date
2. Polish Dock — hover magnification, glow effects, smooth transitions
3. Polish Window system — smooth open/close, shadows, resize animations
4. Polish Command Palette — use MorphingDialog or smooth scale

## Phase 05: AI Chat Polish & Fixes
**Goal:** Working AI chat with beautiful message animations
**Requirements:** R1.4, R4.4
**Plans:**
1. Verify/fix AI chat tRPC calls (send, listConversations, getConversation, getChatStatus)
2. Add message entrance animations with AnimatedGroup
3. Polish sidebar, input area, tool call display with Accordion
4. Add TextShimmer loading indicator

## Phase 06: File Manager Polish & Fixes
**Goal:** Working file manager with animated grid, smooth navigation
**Requirements:** R1.5, R4.5
**Plans:**
1. Verify/fix file manager tRPC calls
2. Add AnimatedGroup for file grid, InView for lazy loading
3. Polish breadcrumb with TransitionPanel, smooth navigation transitions

## Phase 07: Settings Polish
**Goal:** All settings sections work, beautiful accordion layout
**Requirements:** R1.6, R4.6
**Plans:**
1. Verify/fix all settings tRPC calls
2. Redesign with Accordion from motion-primitives
3. Add TransitionPanel for section navigation, smooth toggles

## Phase 08: System Pages Polish (Server, Agents, Schedules, Terminal, Usage)
**Goal:** All system pages work and look professional
**Requirements:** R1.7
**Plans:**
1. Verify/fix tRPC calls for all system pages
2. Add animations — AnimatedNumber for stats, AnimatedGroup for lists
3. Polish Terminal connection, Usage charts, Agent/Schedule CRUD

## Phase 09: General Polish & Loading States
**Goal:** Skeleton loading, toast animations, hover effects, final touches
**Requirements:** R6.1-R6.7
**Plans:**
1. Replace spinners with skeleton loading animations
2. Add InView animations throughout, stagger effects on lists
3. Polish toast notifications, hover states, focus rings
4. Final responsive check and cleanup

## Phase 10: Build, Deploy & Verify
**Goal:** Deploy to production, verify all features
**Requirements:** All
**Plans:**
1. Build standalone, fix any build errors
2. Deploy to server4 (livinity.cloud)
3. End-to-end verification of all features
4. Performance check and final tweaks
