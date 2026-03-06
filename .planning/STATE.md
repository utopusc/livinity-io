# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v5.2 — Comprehensive UI Overhaul
**Current focus:** Files redesign, App Store redesign, Settings fixes, Window chrome revert

## Current Position

Milestone: v5.2 (Comprehensive UI Overhaul)
Phase: v5.2-ui-overhaul — Files, App Store, Settings Window Redesign
Plan: .planning/phases/v5.2-ui-overhaul/
Status: Plans created (6 plans, 3 waves), ready for execution
Last activity: 2026-03-05

## Accumulated Context

### Decisions

- motion-primitives installed to `src/components/motion-primitives/`
- Light theme is primary (color-scheme: light)
- Terminal keeps dark background
- Vite + React 18 (NOT Next.js) -- v4.0 Next.js was reverted
- White-on-white professional palette (no colored surfaces, depth via shadows)
- Floating elements: bg-white/80 backdrop-blur-xl (frosted glass)
- Cards: bg-white + shadow-elevation-sm + border-border-subtle
- Dock: KEEP existing custom magnification (don't switch to mp Dock)
- MorphingDialog: HIGH PRIORITY — window open/close morph from dock icon
- Brand blue accent only on CTAs and active states
- All strings must use t() for i18n
- motion-primitives.com/docs as primary component source
- v5.2: Files sidebar widened to 220px with vertical divider
- v5.2: Files grid items enlarged to 128px width with 72px icons
- v5.2: App Store uses pastel gradients on light theme (no dark overlays)
- v5.2: Settings window gets WindowRouterProvider for correct in-window routing
- v5.2: Window chrome grab cursor removed (drag handled by parent)

## Session Continuity

Last session: 2026-03-05
Stopped at: v5.2 plans created, ready for /gsd:execute-phase v5.2
