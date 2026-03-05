# v4.0 Requirements — UI Polish, Fixes & Motion Primitives Overhaul

## Overview

Complete overhaul of the v3.0 Next.js UI to fix broken features, upgrade visual quality using motion-primitives library, and achieve a professional, modern design with beautiful animations and transitions.

## Problem Statement

The v3.0 UI was deployed but has critical issues:
1. App Store doesn't show applications (broken tRPC call or empty registry)
2. Several features may not work correctly (need audit)
3. UI quality is poor — dark theme looks flat, no polish
4. Missing beautiful transitions and animation effects
5. User wants light/bright design with professional aesthetics
6. Need to use motion-primitives library (https://motion-primitives.com) exclusively for animations

## Requirements

### R1: Fix All Broken Features
- R1.1: App Store must load and display apps from registry + builtin apps
- R1.2: All tRPC calls must work (apps.list, appStore.registry, appStore.builtinApps, etc.)
- R1.3: App install/uninstall/start/stop must work
- R1.4: AI Chat must send messages and receive streaming responses
- R1.5: File Manager must browse, upload, create dirs, rename, copy, move, delete
- R1.6: Settings sections must all load and save correctly
- R1.7: Terminal WebSocket must connect
- R1.8: Login/onboarding flow must work end-to-end

### R2: Install & Integrate motion-primitives
- R2.1: Install motion-primitives components via CLI (`npx motion-primitives@latest add <component>`)
- R2.2: Components to install: text-effect, text-shimmer, accordion, transition-panel, animated-group, animated-background, in-view, carousel, dialog, disclosure, border-trail, infinite-slider, morphing-dialog, dock (if different from current), glow-effect, progressive-blur, text-loop, text-morph, animated-number
- R2.3: Replace framer-motion direct usage with motion-primitives where applicable
- R2.4: All page transitions use TransitionPanel or AnimatedGroup
- R2.5: All text headings use TextEffect for entrance animations
- R2.6: All list items use AnimatedGroup with stagger

### R3: Design System Overhaul — Light & Bright
- R3.1: Switch from dark-mode primary to light-mode primary
- R3.2: Clean, bright color palette (whites, light grays, subtle brand accents)
- R3.3: Proper typography hierarchy with Inter font
- R3.4: Consistent spacing, padding, and border radius
- R3.5: Subtle shadows and depth (not flat design)
- R3.6: Glass morphism effects where appropriate
- R3.7: Keep dark mode as secondary option

### R4: Component-Level Polish
- R4.1: Login page — beautiful entrance animation, TextEffect on heading, smooth form transitions
- R4.2: Desktop page — animated greeting with TextShimmer/TextEffect, smooth dock with hover scaling
- R4.3: App Store — InView animations on cards, smooth category transitions, AnimatedGroup for grid items
- R4.4: AI Chat — smooth message entrance, typing indicator with animation, tool call accordion
- R4.5: File Manager — animated file grid, smooth breadcrumb transitions
- R4.6: Settings — Accordion sections with smooth expand, TransitionPanel between sections
- R4.7: Windows — smooth open/close/minimize animations, subtle shadow depth
- R4.8: Command Palette — MorphingDialog or smooth scale animation
- R4.9: Dock — proper macOS-style magnification or at least hover scale effects

### R5: App Store Enhancement
- R5.1: Show both builtin apps AND registry apps
- R5.2: Featured section with discover-style layout (hero, categories, grids)
- R5.3: App detail page with screenshots, description, install button
- R5.4: Smooth transitions between discover → category → detail views
- R5.5: Search with animated results
- R5.6: Install progress indication

### R6: General Polish
- R6.1: Smooth page/view transitions everywhere
- R6.2: Loading states with skeleton animations (not just spinners)
- R6.3: Toast notifications with slide-in animation
- R6.4: Hover effects on all interactive elements
- R6.5: Focus states for accessibility
- R6.6: Consistent iconography (Lucide React)
- R6.7: Responsive — works on all screen sizes

## Technical Constraints

- Use motion-primitives library components (install via `npx motion-primitives@latest add <name>`)
- motion-primitives requires `motion` (framer-motion v12+) as peer dep
- Components install to `src/components/core/` directory
- Keep Next.js 16 + React 19 + Tailwind CSS 4 stack
- tRPC v11 client (httpBatchLink only, no wsLink)
- No SSR for auth — all client-side
- Deploy to server4 (livinity.cloud) after each major phase

## Success Criteria

- All features from old UI work in new UI
- App Store shows apps and install/uninstall works
- UI looks professional and polished — no "generic AI-generated" feel
- Smooth animations on every interaction
- Light/bright color scheme as default
- motion-primitives used throughout
