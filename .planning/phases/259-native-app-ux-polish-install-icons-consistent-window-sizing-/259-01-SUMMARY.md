---
phase: 259-native-app-ux-polish
plan: 01
subsystem: ui
tags: [native-apps, desktop-grid, window-manager, trpc-invalidation, vnc]
requires:
  - "apps.native.list tRPC query (livinityd native-routes.ts)"
  - "getResponsiveSize preserveAspect path (window-manager.tsx, unchanged)"
provides:
  - "apps.native.list invalidation after native install/uninstall (immediate desktop-grid refetch)"
  - "NATIVE_ window sizing routed into the WebApp 1280x720 + preserveAspect branch (no letterbox)"
affects:
  - "Native app desktop icons (surface immediately post-install)"
  - "Native app window geometry (16:9, matches Displays-popover proportion)"
tech-stack:
  added: []
  patterns:
    - "tRPC query invalidation per query path (utilsRef.current.apps.<path>.invalidate)"
    - "appId-prefix -> window Size (appId.startsWith('PREFIX_') boolean feeding base-size + preserveAspect)"
key-files:
  created: []
  modified:
    - "livos/packages/ui/src/hooks/use-app-store-bridge.ts"
    - "livos/packages/ui/src/providers/window-manager.tsx"
decisions:
  - "SC1: invalidate apps.native.list at all 3 install/uninstall completion sites, NOT gated on section==='native' (harmless for other sections, minimal edit)"
  - "SC2: additive isNative branch ORed into both base-size and preserveAspect — WEBAPP_/DISPLAY_/default paths kept byte-identical (SC4 no-regression)"
  - "No suggested-size arg added to use-launch-native-app.ts; NATIVE_ gets its own 1280x720 base instead (matches WebApp, not Display)"
metrics:
  duration: "~10 min"
  completed: "2026-06-04"
  tasks: 2
  files: 2
---

# Phase 259 Plan 01: Native App UX Polish (Icons + Window Sizing) Summary

Two surgical UI-layer edits closing SC1 (native icon absent until 30s staleTime) and SC2 (NATIVE_ window letterboxed into black bands), each mirroring an existing correct same-file/same-function sibling.

## What Was Done

**Task 1 (SC1 — icons):** Added `utilsRef.current.apps.native.list.invalidate()` immediately after the existing `apps.myApps.invalidate()` line at the three install/uninstall completion sites in `use-app-store-bridge.ts`:
- Site A: polling-done branch (post line 326)
- Site B: `handleInstallV37` mutation-return branch (post line 364)
- Site C: `handleUninstall` branch (post line 506, alongside the existing `apps.state` invalidation)

The desktop grid reads native icons from `apps.native.list` (30s staleTime). Without this invalidation a freshly-installed native icon did not appear until staleTime expired ("apps'de yok"). The pair at lines 452-455 (a different completion site, `handleInstall` not `handleInstallV37`/uninstall) was deliberately NOT modified. Commit `8d46fc71`.

**Task 2 (SC2 — window size):** Added `const isNative = appId.startsWith('NATIVE_')` mirroring `isWebApp` in `window-manager.tsx` `openWindow`, and ORed it into both the base-size ternary (`(isWebApp || isNative)` -> 1280x720) and the `getResponsiveSize` preserveAspect flag (`isWebApp || isNative || isDisplay || suggested != null`). A `NATIVE_<uuid>` window previously had `isWebApp=false`, `isDisplay=false`, `suggested=undefined` -> fell to `DEFAULT_WINDOW_SIZES.default` (900x600, 3:2) with `preserveAspect=false`, letterboxing the 16:9 1280x720 noVNC stream. Now it takes the same 1280x720 + aspect-clamp path as WebApp, matching the Displays-popover proportion. `getResponsiveSize` body and `DEFAULT_WINDOW_SIZES` map were not touched. Commit `79b7576e`.

## SC4 Preservation (no regression)

- `use-webapp-vnc.ts` NOT touched — WebApp + Displays-popover canvas rendering unchanged.
- The SC2 edit is purely additive (`NATIVE_`-gated). `WEBAPP_`, `DISPLAY_`, and default (Docker/community) windows take byte-identical size paths.
- SC1 invalidates a native-only query (`apps.native.list`) — cannot affect `apps.list` (Docker) or `webapp.list` (WebApp) queries.
- No edits to DisplayAllocator / spawnXvfb / StreamManager / x11vnc / `:N` allocation.

## Verification

- Task 1 automated check: `apps.native.list.invalidate` appears exactly 3 times — PASS.
- Task 2 automated check: `isNative` declared + routed into base-size and preserveAspect — PASS.
- Confirmed `apps.native.list` is a real tRPC query path (livinityd `native-routes.ts` header: "tRPC routes apps.native.{list,get,create,delete,spawn}").
- UI typecheck (`pnpm --filter ui exec tsc --noEmit`): the two edited files produce ZERO errors. Remaining tsc errors are all pre-existing cross-package `livinityd` lib/Buffer/`ctx`-undefined drift (e.g. `builtin-apps.ts(1433)`, `apps.ts`, `routes.ts`) — the same pre-existing baseline logged to `deferred-items.md` in 256-02; out of scope per the scope boundary (not caused by this plan's changes).

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-4 deviations. No auth gates.

## Deploy (operator — NOT done by this executor, local code-only per plan)

1. `pnpm --filter @livos/config build && pnpm --filter ui build`
2. `systemctl restart livos`
3. PWA service-worker pitfall (MEMORY.md): if the icon/window-size "doesn't change" despite a correct deploy -> DevTools -> Application -> Clear site data / Unregister SW, then reload.
4. Live verify on Mini PC: install a native app -> icon appears on the desktop grid immediately; open it from the icon -> window is 16:9 1280x720 with no top/bottom black bands; confirm a WebApp + Docker (beszel) window still open at their normal size.

## Known Stubs

None — both edits wire real query invalidation / real size computation; no placeholder/empty-value stubs introduced.

## Self-Check: PASSED

- FOUND: livos/packages/ui/src/hooks/use-app-store-bridge.ts (3 native invalidations)
- FOUND: livos/packages/ui/src/providers/window-manager.tsx (isNative branch)
- FOUND commit: 8d46fc71 (Task 1)
- FOUND commit: 79b7576e (Task 2)
