---
gsd_state_version: 1.0
milestone: v24.0
milestone_name: Mobile Responsive UI
status: planning
stopped_at: Defining requirements
last_updated: "2026-04-01T20:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v24.0 -- Mobile Responsive UI
**Current focus:** Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-01 — Milestone v24.0 started

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v23.0)
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Prior milestone (v22.0):**
| Phase 29 P01 | 2min | 1 tasks | 1 files |
| Phase 29 P02 | 3min | 2 tasks | 3 files |
| Phase 30 P01 | 5min | 2 tasks | 2 files |
| Phase 31 P01 | 5min | 2 tasks | 4 files |
| Phase 32 P01 | 3min | 2 tasks | 3 files |
| Phase 33 P01 | 4min | 2 tasks | 5 files |
| Phase 34 P01 | 5min | 2 tasks | 4 files |
| Phase 35 P01 | 5min | 2 tasks | 2 files |
| Phase 35 P02 | 14min | 2 tasks | 2 files |
| Phase 36 P01 | 5min | 2 tasks | 5 files |
| Phase 36 P02 | 4min | 2 tasks | 3 files |
| Phase 36 P03 | 3min | 2 tasks | 4 files |

*Updated after each plan completion*
| Phase 37 P01 | 3min | 2 tasks | 5 files |
| Phase 37 P02 | 2min | 2 tasks | 3 files |
| Phase 38-mobile-navigation-infrastructure P01 | 2min | 2 tasks | 5 files |
| Phase 38-mobile-navigation-infrastructure P02 | 2min | 2 tasks | 2 files |
| Phase 39-mobile-home-screen-app-access P01 | 3min | 2 tasks | 2 files |
| Phase 39-mobile-home-screen-app-access P02 | 3min | 2 tasks | 3 files |
| Phase 40 P01 | 4min | 2 tasks | 3 files |
| Phase 40 P02 | 3min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

- v23.0 continues phase numbering from v22.0 (Phase 37 is first phase)
- CRITICAL: Desktop UI must NOT be modified -- all mobile changes gated on useIsMobile()
- CRITICAL: nexus-core runs compiled JS -- MUST run `npm run build --workspace=packages/core` after source changes
- IOS-01 (safe areas) assigned to Phase 37 (not Phase 40) because viewport-fit=cover must be set before any safe area CSS works
- PWA-05 (install prompt) and PWA-06 (splash screens) deferred to Phase 40 as polish -- not required for core mobile functionality
- MobileAppContext is intentionally separate from desktop WindowManagerProvider (context-based overlay pattern, not route-based)
- Phase 38 and 37 have no code overlap (config/meta vs React components) but 38 depends on 37 for safe area CSS foundation
- [Phase 37]: registerType autoUpdate for seamless PWA updates (dashboard app)
- [Phase 37]: navigateFallbackDenylist for /trpc, /api, /ws prevents SW from intercepting API routes
- [Phase 37]: black-translucent iOS status bar style blends with app background
- [Phase 37]: tailwindcss-safe-area v0.8.0 for Tailwind v3 compatibility (not v1.x for Tailwind v4)
- [Phase 37]: Safe area CSS vars defined both as Tailwind utilities and CSS custom properties for maximum flexibility
- [Phase 37]: overscroll-behavior: none globally on html,body for native PWA feel
- [Phase 37]: --sheet-top: 0vh in @media (display-mode: standalone) removes desktop wallpaper gap in PWA mode
- [Phase 38]: MobileAppContext is separate from desktop WindowManagerProvider -- context-based overlay pattern
- [Phase 38]: useMobileBack runs on all viewports (hooks cannot be conditional) -- harmless on desktop
- [Phase 38]: iOS-style 250ms tween with ease [0.32,0.72,0,1] for mobile slide transitions
- [Phase 38-mobile-navigation-infrastructure]: MobileAppProvider wraps inside WindowManagerProvider outside CmdkProvider -- matches ARCHITECTURE.md component tree
- [Phase 38-mobile-navigation-infrastructure]: Single isMobile guard in openStreamApp covers all 6 stream apps with zero per-app changes (MOB-04)
- [Phase 39-mobile-home-screen-app-access]: 72px mobile DockSpacer height (56px tab bar + 16px safe area) for upcoming tab bar
- [Phase 39-mobile-home-screen-app-access]: 5 system apps for mobile grid: AI Chat, Files, Settings, Server, Terminal (utility apps omitted for simplicity)
- [Phase 39-mobile-home-screen-app-access]: Tabler Icons for tab bar (consistent with project icon library), z-[60] above z-50 overlay, pb-[72px] replaces pb-safe in app renderer
- [Phase 40]: Spring animation (stiffness 300, damping 30) for install banner entrance/exit
- [Phase 40]: PWA-06 splash screen satisfied by existing Phase 37 manifest configuration (theme_color #f8f9fc aligned across manifest, meta tag, body background)
- [Phase 40]: z-[70] for install banner above MobileTabBar z-[60] ensures banner visibility
- [Phase 40]: 500ms delay after visibilitychange before WS reconnect (lets iOS networking stack resume)
- [Phase 40]: 100px threshold for keyboard detection avoids false positives from toolbar/address bar changes
- [Phase 40]: paddingBottom offset approach for keyboard avoidance (works with existing flex layout, no transform hacks)

### Pending Todos

None

### Blockers/Concerns

- Real-device iOS testing is mandatory for Phase 40 -- simulators do not replicate backgrounding, storage isolation, or safe area behavior accurately
- iOS standalone mode uses separate storage sandbox from Safari -- users must re-login after PWA install (needs UX messaging)

## Session Continuity

Last session: 2026-04-01T18:22:24.472Z
Stopped at: Completed 40-02-PLAN.md (iOS WS reconnection + keyboard-safe input)
Resume file: None
