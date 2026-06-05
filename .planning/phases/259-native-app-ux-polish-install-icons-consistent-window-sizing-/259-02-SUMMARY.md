---
phase: 259-native-app-ux-polish
plan: 02
subsystem: api
tags: [livinityd, native-apps, xdotool, wmctrl, ewmh, fluxbox, x11vnc, fullscreen, icons]

# Dependency graph
requires:
  - phase: 259-01
    provides: "NATIVE_ 16:9 window sizing + apps.native.list invalidation (SC1 load-bearing + SC2)"
provides:
  - "fullscreenNativeWindow rewritten as a spaced EWMH re-apply loop over ALL matched top-levels (SC3 — OBS no longer leaves a black strip)"
  - "Native app config now carries iconUrl from manifest.desktopEntry.icon so desktop tiles render real artwork (SC1-cosmetic)"
affects: [native-app-install, desktop-grid, fullscreen-window-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Spaced EWMH re-apply loop (maximize + fullscreen + explicit move-resize, re-queried each pass) for apps that restore their own layout after mapping"
    - "Catalog-icon → persisted installed-app record thread, native equivalent of apps.ts:1085 (icon source = manifest.desktopEntry.icon)"

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/apps/native-routes.ts"
    - "livos/packages/livinityd/source/modules/apps/native-installer.ts"

key-decisions:
  - "SC3: re-apply EWMH state across 6 passes (~500ms apart, ~3s total) over ALL windows instead of one-shot on the last window — robust regardless of why OBS resists the first resize"
  - "SC3: added wmctrl add,maximized_vert,maximized_horz alongside add,fullscreen (fluxbox fullMaximization: true covers the whole screen) + kept windowsize/windowmove as explicit fallback"
  - "SC1-cosmetic: used manifest.desktopEntry.icon (in-scope, schema-valid, lowest-risk) — NOT a catalog icon_url threaded through the install context (AppCatalogRow does not expose icon_url)"

patterns-established:
  - "Re-apply (not one-shot) for best-effort X11 window manipulation when the app re-layouts after mapping"

requirements-completed: []

# Metrics
duration: ~8 min
completed: 2026-06-05
---

# Phase 259 Plan 02: Native App UX Polish (livinityd layer — SC3 fullscreen robustness + SC1-cosmetic icons) Summary

**`fullscreenNativeWindow` rewritten from a one-shot/last-window-only apply into a spaced EWMH re-apply loop (maximize + fullscreen + explicit 0,0,1280,720) over ALL matched top-levels so OBS fills the 1280x720 Xvfb with no leftover desktop strip, plus native config now carries `iconUrl` from the manifest so desktop tiles render real artwork.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-05T00:29:07Z
- **Completed:** 2026-06-05T00:37:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- **SC3 (fullscreen robust):** `fullscreenNativeWindow` now polls once to find a visible top-level, then re-applies state across 6 spaced passes (~3s total), re-querying the window list each pass so a late-mapped main window (after a splash closes) is also covered. Each pass applies `wmctrl add,maximized_vert,maximized_horz` + `add,fullscreen` + `xdotool windowsize 1280 720` + `windowmove 0 0` to EVERY matched window. This corrects OBS, which restores its own Qt geometry after mapping and so reverted the prior single early resize ("black on the right").
- **SC1-cosmetic (icon artwork):** the installer's `configCandidate` now sets `iconUrl: manifest.desktopEntry.icon || undefined`, mirroring the Docker/platform installer's `icon: data.icon_url || data.icon` thread (apps.ts:1085). `NativeAppIcon` no longer falls back to the placeholder.

## Task Commits

Each task was committed atomically:

1. **Task 1: SC3 — rewrite fullscreenNativeWindow into a spaced EWMH re-apply loop over all windows** - `6c022069` (fix)
2. **Task 2: SC1-cosmetic — set iconUrl on the native config from manifest.desktopEntry.icon** - `b38e425f` (feat)

**Plan metadata:** (final docs commit — this SUMMARY + STATE/ROADMAP)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/native-routes.ts` - `fullscreenNativeWindow` rewritten: poll-to-find then 6-pass spaced re-apply loop (maximize+fullscreen+move-resize) over ALL matched windows; signature + caller (`:330` `void fullscreenNativeWindow(spawnedPid, display, adaptLogger)`) unchanged; `const env = {...process.env, DISPLAY: display}` + per-call `.catch(() => {})` best-effort style preserved verbatim.
- `livos/packages/livinityd/source/modules/apps/native-installer.ts` - one line added to `configCandidate` after `name: app.name,`: `iconUrl: manifest.desktopEntry.icon || undefined`.

## Decisions Made
- Followed plan as specified. Re-apply over ALL windows (not `_NET_WM_WINDOW_TYPE == NORMAL` xprop selection, the cleaner-but-heavier alternative noted in RESEARCH.md) — applying to all matched top-levels is the lowest-risk robust choice and the splash is transient (re-applying over ~3s naturally lands on the main window once the splash is gone).
- Icon source = `manifest.desktopEntry.icon` (in-scope at `:237`, schema-valid via the `.optional()` `iconUrl` URL/root-relative path gate at native-app-config.ts:73-86), not a catalog `icon_url` (AppCatalogRow doesn't expose it).

## SC4 Preservation (no regression)
- `fullscreenNativeWindow` is invoked ONLY from the native spawn path (native-routes.ts:330) and runs on the native app's dedicated `:N` Xvfb + per-display fluxbox. Docker apps use no Xvfb; WebApp/Chrome windows have their own geometry handling (webapps/geometry-tracker.ts) and are never passed to this helper. Re-applying EWMH state cannot leak into another app's display.
- `iconUrl` is a native-config-only field — no Docker/WebApp code reads it.
- NO edits to DisplayAllocator / spawnXvfb / bind / StreamManager / x11vnc / `:N` allocation (orchestration steps 1-3, 5-6 in native-routes.ts untouched). The `:N` display allocation and x11vnc streaming transport (the operator's fragile/shared hard constraint) were not touched.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Local typecheck baseline:** `npx tsc --noEmit` in `livos/packages/livinityd` reports the same pre-existing cross-package drift documented in 256-02/259-01 deferred-items (lib/Buffer/ctx/http-typing). My two edited files: `native-routes.ts` produces ZERO errors; `native-installer.ts` reports only `(133,19)` + `(136,5)` — a `lib.get` download block confirmed present in `HEAD~2` (before my changes), entirely unrelated to the one-line `iconUrl` addition at `:256`. No new errors introduced by this plan. Both automated `<verify>` node checks PASS.

## Next Phase Readiness
- **CODE ONLY — NO DEPLOY** (Mini PC single-user; operator's call). livinityd runs TypeScript via tsx — no build needed for these backend edits; deploy = `systemctl restart livos`.
- Live verify (operator, Mini PC bruce@100.112.68.1): install + open a native app → fills 1280x720 fullscreen; open OBS specifically → fills with NO right-side black strip; the icon shows real artwork. Confirm a Docker app (beszel) + a WebApp still open fine.
- Phase 259 SCs status: SC1 (icons — invalidation in 259-01, cosmetic iconUrl here), SC2 (16:9 sizing in 259-01), SC3 (fullscreen robustness here), SC4 (no regression — preserved both plans). All four SCs now have code; only operator visual UAT remains.

## Self-Check: PASSED
- FOUND: 259-02-SUMMARY.md
- FOUND: commit 6c022069 (Task 1)
- FOUND: commit b38e425f (Task 2)

---
*Phase: 259-native-app-ux-polish*
*Completed: 2026-06-05*
