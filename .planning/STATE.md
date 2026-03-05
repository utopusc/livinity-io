# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v5.1 — Motion Primitives Integration
**Current focus:** Executing phases

## Current Position

Milestone: v5.1 (Motion Primitives Integration)
Phase: 01 — Foundation (dependencies + components)
Plan: .planning/phases/v5.1-motion-primitives/ROADMAP.md
Status: v5.0 light theme COMPLETE, starting v5.1
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

## Session Continuity

Last session: 2026-03-05
Stopped at: v5.1 Phase 01 starting
