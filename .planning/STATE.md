---
gsd_state_version: 1.0
milestone: v23.0
milestone_name: Mobile PWA
status: unknown
stopped_at: Completed 37-02-PLAN.md (safe area CSS foundation)
last_updated: "2026-04-01T16:40:07.244Z"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v23.0 -- Mobile PWA
**Current focus:** Phase 37 — pwa-foundation

## Current Position

Phase: 38
Plan: Not started

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

### Pending Todos

None

### Blockers/Concerns

- Real-device iOS testing is mandatory for Phase 40 -- simulators do not replicate backgrounding, storage isolation, or safe area behavior accurately
- iOS standalone mode uses separate storage sandbox from Safari -- users must re-login after PWA install (needs UX messaging)

## Session Continuity

Last session: 2026-04-01T16:37:06.383Z
Stopped at: Completed 37-02-PLAN.md (safe area CSS foundation)
Resume file: None
