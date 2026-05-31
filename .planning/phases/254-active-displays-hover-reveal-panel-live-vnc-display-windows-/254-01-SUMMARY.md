---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
plan: 01
subsystem: livinityd / computer-use + tRPC
tags: [trpc, computer-use, displays, vnc, x11vnc, streaming, authz, stride]
requires:
  - StreamManager (mode 'vnc-window', target {display}) — streaming/stream-manager.ts
  - DisplayManager (list/isOwner) — computer-use/displays/display-manager.ts
  - this.ai.redis (daemon Redis client, same keys the stdio MCP writes)
provides:
  - displays.list tRPC query → {displays: DisplayRecord[], count}
  - displays.getVncUrl tRPC mutation → {wsUrl} (owner-scoped, host/shared allowed)
  - ctx.livinityd.displayManager (UI-reachable DisplayManager instance)
affects:
  - 254-03 (live-VNC display window consumes displays.getVncUrl)
  - 254-04 (hover panel consumes displays.list)
tech-stack:
  added: []
  patterns:
    - "privateProcedure + ctx.currentUser.id (never input) for STRIDE-S"
    - "owner-scoped authz via displayManager.isOwner; empty owner_session = host/shared"
    - "long-running spawn mutation registered in httpOnlyPaths (WS-reconnect survival)"
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/trpc-router.ts
  modified:
    - livos/packages/livinityd/source/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
decisions:
  - "Mounted inner displaysRouter directly (displays: displaysRouter) for exact displays.list/displays.getVncUrl path shape"
  - "Caller session = ctx.currentUser.id; MCP stores owner_session as luse session id ('bruce') — FORBIDDEN gate kept intact, mapping divergence documented"
  - "Used ctx.logger.log (correct Livinityd['logger'] surface) instead of .info to avoid adding to the package's pre-existing tsc error baseline"
metrics:
  duration: ~7m
  completed: 2026-05-31
  tasks: 3
  files: 4
---

# Phase 254 Plan 01: Active-Displays tRPC Seam (displays.list + displays.getVncUrl) Summary

Exposed the active X displays (previously only reachable via the stdio MCP `computer_list_displays`) to the LivOS UI over tRPC, and added a per-display VNC websocket-URL resolver that reuses the existing `StreamManager` whole-display x11vnc capture path (`mode: 'vnc-window'`, `target: {display}`).

## What shipped

- **Task 1 (`09e8b9ae`)** — Wired `displayManager?: DisplayManager` onto the `Livinityd` singleton. Constructed in `start()` immediately after `StreamManager`, on the **same daemon Redis client** (`this.ai.redis`) the stdio MCP `createDisplayManager` uses, so `displays.list` reads the identical `luse:display:*` keys the MCP wrote. Construction is non-fatal (try/catch → field stays `undefined` → routes fail-closed `SERVICE_UNAVAILABLE`), mirroring the `streamManager` / Xvfb `:1` fallback pattern. `await displayManager.initialized` for `:N` allocator continuity.
- **Task 2 (`8daf7ef0`)** — New `computer-use/trpc-router.ts` exporting `computerUseRouter` (with `displays` namespace) and the inner `displaysRouter`:
  - `displays.list` (query) → `{displays, count}` — identical wrap to MCP `computer_list_displays`.
  - `displays.getVncUrl` (mutation) → `{wsUrl}` — zod `:N` regex input; `userId` from `ctx.currentUser.id` only; owner-scoped authz; resolves via `streamManager.startStream({userId, mode: 'vnc-window', target: {display}})`.
- **Task 3 (`10e1c471`)** — Mounted `displays: displaysRouter` on `appRouter` (exact path shape `displays.list` / `displays.getVncUrl`); added `'displays.getVncUrl'` to `httpOnlyPaths` in `common.ts` (spawns x11vnc via `startStream`, same WS-reconnect-survival rationale as `streams.start`).

## must_haves verification

- **A logged-in UI client can call displays.list and receive the same active X displays the MCP reports** — `displays.list` reads `ctx.livinityd.displayManager.list()`, the same DisplayManager surface the MCP `computer_list_displays` calls, backed by the same Redis client/keys. Return wrap `{displays, count}` is byte-identical to the MCP wrap (tools.ts:1138).
- **A logged-in UI client can call displays.getVncUrl({display}) and receive a VNC ws URL** — `displays.getVncUrl` returns `{wsUrl}` from `streamManager.startStream(... mode: 'vnc-window', target: {display})`.
- **A client cannot obtain a VNC ws URL for a display owned by a different session** — when `record.owner_session` is non-empty and `!isOwner({display, session: ctx.currentUser.id})`, the route throws `FORBIDDEN` before any `startStream` call (T-254-01).

## Threat model dispositions applied

| Threat | Disposition | How |
|--------|-------------|-----|
| T-254-01 (I — ws URL for foreign-owned display) | mitigate | `isOwner` gate; non-empty `owner_session` + non-owner → FORBIDDEN; empty owner_session (host/shared) allowed |
| T-254-02 (S — userId from input) | mitigate | `userId = ctx.currentUser?.id` ONLY; UNAUTHORIZED when absent; no userId field in zod input |
| T-254-03 (I — wsUrl in logs) | mitigate | log line emits only `display=:N`, never the wsUrl |
| T-254-04 (E — unauthenticated reach) | mitigate | both routes `privateProcedure`; getVncUrl additionally UNAUTHORIZED-guards on currentUser |
| T-254-05 (D — unbounded x11vnc) | accept | StreamManager per-user cap (StreamCapExceededError) reused for free |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Type mismatch] `ctx.logger.info` does not exist on `Livinityd['logger']`**
- **Found during:** Task 2 (tsc verify)
- **Issue:** The plan's `<action>` example used `ctx.logger?.info?.()` (copied from the streaming/webapps routers). The actual `ctx.logger` type (`Livinityd['logger']`) exposes `.log`, not `.info`; the existing `.info?.()` calls in streaming/webapps routers are part of the package's ~389-error pre-existing tsc baseline. Adding another `.info?.()` raised the count to 390.
- **Fix:** Used `ctx.logger?.log?.()` (the correct logger surface) — preserves the Repudiation/INFO trail with zero new tsc errors.
- **Files modified:** `computer-use/trpc-router.ts`
- **Commit:** `8daf7ef0`

### Documented mapping decision (FORBIDDEN gate kept intact)

- The stdio MCP stores `owner_session` as the **luse session id** (`resolveLuseUserId` → `LUSE_USER_ID` env, default `'bruce'` / fallback `'admin'`), whereas the UI carries `ctx.currentUser.id`. On the single-tenant Mini PC these may differ. Per the plan note, the chosen caller-session identity is `ctx.currentUser.id` and the **FORBIDDEN gate is kept intact** — it correctly denies any caller whose id does not match a display's non-empty `owner_session`. Displays with an empty `owner_session` (host/shared) remain readable by any authenticated user.

## Known Stubs

None. No hardcoded empty values, placeholders, or unwired data sources introduced. Both routes are fully wired to live `DisplayManager` / `StreamManager` instances.

## Notes for downstream plans

- **Host `:1` is NOT in `displays.list`.** The boot-time Xvfb `:1` (started via `startXvfb` in livinityd `start()`) is created OUTSIDE the DisplayManager, so it has no `luse:display:*` Redis record and will not appear in `list()` — `getVncUrl(':1')` currently returns `NOT_FOUND`. CONTEXT #2 expects `:1` to be listable; making `:1` a DisplayManager-tracked record (and CONTEXT #3's `:1` resolution change) is separate-plan scope, not 254-01.
- The router file also exports `computerUseRouter` (top key `displays`) for callers that prefer the wrapped form; `appRouter` mounts the inner `displaysRouter` directly.

## tsc gate

`npx tsc --noEmit -p tsconfig.json` for the livinityd package: **389 errors before AND after** this plan (all 389 are pre-existing in unrelated files — `server/index.ts`, `@types/ws` resolution drift, `Apps.docker`, etc.). **Zero new errors** introduced by any of the 3 tasks; zero errors mention `displayManager`, `computerUseRouter`, `displaysRouter`, or `displays`.

## Self-Check: PASSED

- FOUND: `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts`
- FOUND: commit `09e8b9ae` (Task 1)
- FOUND: commit `8daf7ef0` (Task 2)
- FOUND: commit `10e1c471` (Task 3)
