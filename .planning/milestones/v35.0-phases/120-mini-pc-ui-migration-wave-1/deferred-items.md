# Phase 120 — Deferred items

## Pre-existing test failures (out-of-scope for Wave 1 plans)

Discovered during Plan 120-04 (`pnpm --filter ui test:run -- ai-chat`):

- `src/routes/docker/palette/use-recent-searches.unit.test.ts` — 7 failures: `ReferenceError: localStorage is not defined` (vitest jsdom environment config gap).
- `src/routes/docker/window/bytebot/__tests__/*` — bytebot ws/sse client tests failing on missing `WebSocket` / `EventSource` shims in test env.
- `stories/src/routes/stories/widgets.tsx` + `wifi.tsx` — 18 pre-existing typecheck errors (already logged in Plan 120-01 SUMMARY).

None touch `routes/ai-chat/**` and none are caused by Wave-1 token swaps. Owner: Phase 121 or dedicated test-infra cleanup plan.

## Build warnings (informational)

- Vite `chunks larger than 500 kBs` warning — pre-existing main bundle size. Tracked but out-of-scope for visual token migration.
- Vite sourcemap warnings on `motion-primitives/*.tsx` — pre-existing, not introduced by Wave 1.
