---
phase: 18-store-ui
plan: 01
subsystem: ui
tags: [react, next.js, tailwind, app-store, context-api, responsive]

# Dependency graph
requires:
  - phase: 17-livinity-platform
    provides: Next.js app with API routes, Drizzle ORM, apps table, /api/apps endpoint
provides:
  - Store types (App, AppSummary, StoreContextValue, CATEGORIES)
  - StoreProvider context with token auth and /api/apps data fetching
  - Store layout shell (sidebar + topbar + scrollable content area)
  - Light-mode CSS variables for Apple aesthetic
affects: [18-02-PLAN, 18-03-PLAN, 19-postmessage-bridge, 20-iframe-embedding]

# Tech tracking
tech-stack:
  added: []
  patterns: [store-layout CSS class for light-mode override, StoreProvider context for auth+data, server layout with client shell pattern]

key-files:
  created:
    - platform/web/src/app/store/types.ts
    - platform/web/src/app/store/store-provider.tsx
    - platform/web/src/app/store/store-shell.tsx
    - platform/web/src/app/store/layout.tsx
    - platform/web/src/app/store/components/sidebar.tsx
    - platform/web/src/app/store/components/topbar.tsx
  modified:
    - platform/web/src/app/globals.css

key-decisions:
  - "Server layout + client shell pattern for Next.js metadata export with client-side state"
  - "Suspense boundary inside StoreProvider for Next.js 16 useSearchParams requirement"
  - "Unicode characters for category icons (not SVG) for simplicity"

patterns-established:
  - "Store context pattern: StoreProvider wraps all /store routes, provides apps data, search state, and auth token"
  - "Light-mode override: .store-layout CSS class forces light color scheme regardless of system preference"
  - "Sidebar responsive pattern: fixed overlay on mobile, static on desktop (md breakpoint)"

requirements-completed: [STORE-05, STORE-06, STORE-07]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 18 Plan 01: Store Layout Shell Summary

**Store layout shell with sidebar navigation, search topbar, and token-based auth context provider using Apple App Store aesthetic**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T03:49:25Z
- **Completed:** 2026-03-21T03:51:06Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- TypeScript types for App, AppSummary, StoreContextValue, and CATEGORIES constant covering all 8 database categories
- StoreProvider context that extracts token/instance from URL params and fetches /api/apps with X-Api-Key auth
- Responsive sidebar with Discover link, 8 category buttons with active teal highlight, and grayed-out My Apps placeholder
- Search topbar with controlled input bound to store context, hamburger toggle on mobile, and instance name badge
- Server/client layout split: server component exports metadata, client StoreShell manages sidebar toggle state
- Light-mode CSS variables on .store-layout class ensuring white, clean, premium Apple aesthetic

## Task Commits

Each task was committed atomically:

1. **Task 1: Create types, auth context provider, and globals.css store overrides** - `0a78ee4` (feat)
2. **Task 2: Create sidebar, topbar, and store layout shell** - `e9c1f0f` (feat)

## Files Created/Modified
- `platform/web/src/app/store/types.ts` - App, AppSummary, StoreContextValue interfaces and CATEGORIES constant
- `platform/web/src/app/store/store-provider.tsx` - React context provider with token auth and /api/apps fetching
- `platform/web/src/app/store/store-shell.tsx` - Client shell managing sidebar toggle state
- `platform/web/src/app/store/layout.tsx` - Server layout with metadata export
- `platform/web/src/app/store/components/sidebar.tsx` - Left sidebar with Discover, Categories, My Apps navigation
- `platform/web/src/app/store/components/topbar.tsx` - Top bar with search input and instance badge
- `platform/web/src/app/globals.css` - Added .store-layout light-mode CSS variables

## Decisions Made
- Server layout + client shell pattern: Next.js requires server components for metadata export, so layout.tsx is a thin server wrapper that delegates to StoreShell client component for state management
- Suspense boundary inside StoreProvider: Next.js 16 requires useSearchParams to be wrapped in Suspense; placed internally so consumers don't need to worry about it
- Unicode characters for category icons rather than SVG or icon library, keeping the component simple with no additional dependencies

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully wired. My Apps is intentionally grayed out per plan (deferred to Phase 21).

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Store layout shell is complete and ready for Plan 02 (Discover page) to add content inside the `<main>` area
- StoreProvider context provides apps data, search state, and category selection that Plan 02 will consume
- Types exported for reuse across Plan 02 (discover) and Plan 03 (detail page)

## Self-Check: PASSED

All 8 files verified present. Both task commits (0a78ee4, e9c1f0f) verified in git log.

---
*Phase: 18-store-ui*
*Completed: 2026-03-21*
