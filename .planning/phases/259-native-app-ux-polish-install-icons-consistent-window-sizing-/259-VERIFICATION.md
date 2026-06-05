---
phase: 259-native-app-ux-polish
verified: 2026-06-04T00:00:00Z
status: human_needed
score: 4/4 must-haves verified (code-structural)
overrides_applied: 0
human_verification:
  - test: "Install a native app (e.g. VS Code) from the store and confirm its icon appears on the LivOS desktop grid immediately without a manual reload"
    expected: "Within 1-2 seconds of the install completion toast, the native app's icon is visible on the apps grid — no page refresh required"
    why_human: "tRPC invalidation triggers a React-Query refetch whose visual result (icon render) requires a live Mini PC browser session; not unit-testable from the repo"
  - test: "Open a native app from its desktop icon and verify the window is 16:9 (1280x720) with no top/bottom black letterbox bands"
    expected: "The noVNC canvas fills the window without black bands top or bottom; aspect is 16:9 matching the Displays-popover window"
    why_human: "Window geometry and canvas scaling are X11/noVNC runtime behavior — not statically verifiable from source"
  - test: "Open OBS (the failing reference app) and confirm it fills 1280x720 with no black strip on the right"
    expected: "OBS window occupies the full 1280x720 Xvfb; the right-side black desktop strip from the prior one-shot fullscreen is gone"
    why_human: "OBS fullscreen robustness depends on Qt geometry restore timing; requires live X11 session on Mini PC"
  - test: "Confirm a Docker app (e.g. beszel) and a WebApp still open at their normal sizes with no regression"
    expected: "Docker/WebApp windows open at their existing sizes; the Displays-popover window is unchanged"
    why_human: "Runtime window sizing and app-launch flow requires a live browser + Mini PC session"
  - test: "Confirm native app icons show real artwork from the manifest rather than a placeholder image"
    expected: "A native app tile on the desktop grid displays the app's icon artwork (svg/png from manifest.desktopEntry.icon); no blank/gray placeholder"
    why_human: "Icon rendering depends on what manifest.desktopEntry.icon resolves to at install time and the NativeAppIcon component rendering — needs live verification"
---

# Phase 259: Native App UX Polish Verification Report

**Phase Goal:** Installed native apps surface correctly as launch icons AND open consistently at fullscreen 1280x720 with no letterbox; Docker + WebApp app types keep working.
**Verified:** 2026-06-04T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A freshly-installed native app's launch icon appears on the desktop grid immediately (no manual reload) | VERIFIED (code) | `apps.native.list.invalidate()` added at all 3 install/uninstall completion sites in `use-app-store-bridge.ts` (lines 329, 368, 512); grep confirms exactly 3 occurrences |
| 2 | A native app window opened from its desktop icon is 16:9 (1280x720-derived) with no top/bottom black letterbox bands | VERIFIED (code) | `isNative = appId.startsWith('NATIVE_')` added in `window-manager.tsx` (line 347), ORed into both the base-size ternary (`isWebApp \|\| isNative` → 1280x720) and the `getResponsiveSize` preserveAspect flag (line 352); additive — WEBAPP_/DISPLAY_/default paths byte-identical |
| 3 | Every installed native app opens fullscreen filling the 1280x720 Xvfb — OBS specifically has no leftover black strip | VERIFIED (code) | `fullscreenNativeWindow` rewritten: poll phase (24×250ms) finds first visible window, then 6-pass re-apply loop (500ms apart, ~3s total) applies `add,maximized_vert,maximized_horz` + `add,fullscreen` + `windowsize 1280 720` + `windowmove 0 0` to ALL matched windows per pass; re-queries window list each pass for late-mapped splash-to-main transitions; `.filter(Boolean).pop()` (the one-shot-last-window bug) is gone |
| 4 | Docker apps and WebApp stream windows keep working (no regression) | VERIFIED (code) | SC4 checks: `fullscreenNativeWindow` invoked ONLY from native spawn path (line 369, `void fullscreenNativeWindow(spawnedPid, display, adaptLogger)` — signature unchanged); `use-webapp-vnc.ts` not in any 259-01/02 commit; `git show --stat` of all four commits shows exactly the 4 expected files and no others; no edits to DisplayAllocator/spawnXvfb/StreamManager/x11vnc/`:N` allocation |

**Score:** 4/4 code-structural truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/ui/src/hooks/use-app-store-bridge.ts` | `apps.native.list.invalidate()` at 3 install/uninstall completion sites | VERIFIED | Grep confirms exactly 3 occurrences at lines 329, 368, 512; each follows `apps.myApps.invalidate()`; the pair at ~452 (different completion site) was correctly left untouched |
| `livos/packages/ui/src/providers/window-manager.tsx` | NATIVE_ prefix routed into 1280x720 + preserveAspect | VERIFIED | `isNative` declared at line 347; ORed into base-size ternary (line 349) and preserveAspect arg (line 352); `getResponsiveSize` body unchanged |
| `livos/packages/livinityd/source/modules/apps/native-routes.ts` | fullscreenNativeWindow as a spaced EWMH re-apply loop, `maximized_vert,maximized_horz` | VERIFIED | 6-pass re-apply loop at lines 79-107; `add,maximized_vert,maximized_horz` at line 94; `add,fullscreen` at line 97; no `.pop()` (removed); caller line 369 identical |
| `livos/packages/livinityd/source/modules/apps/native-installer.ts` | iconUrl gated to schema-valid values (WR-01 fix applied) | VERIFIED | `isSchemaValidIconUrl` inline validator at lines 260-268; `configCandidate` uses `rawIcon && isSchemaValidIconUrl(rawIcon) ? rawIcon : undefined` (line 272); bare freedesktop names like "vscode" are filtered to `undefined` — WR-01 (schema-parse blocker identified in REVIEW.md) is fixed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `use-app-store-bridge.ts` install/uninstall sites | `apps.native.list` query | `utilsRef.current.apps.native.list.invalidate()` | WIRED | 3 call sites confirmed; each immediately follows `apps.myApps.invalidate()` |
| `window-manager.tsx openWindow` | `getResponsiveSize` preserveAspect path | `isNative` ORed into base-size + preserveAspect flag | WIRED | Lines 347, 349, 352 confirmed; additive — existing WebApp/Display paths unchanged |
| `native-routes.ts` spawn path (line 369) | `fullscreenNativeWindow` re-apply loop | `void fullscreenNativeWindow(spawnedPid, display, adaptLogger)` | WIRED | Caller unchanged; function body is the new 6-pass loop |
| `native-installer.ts configCandidate` | NativeAppIcon artwork | `iconUrl` threaded from schema-validated `manifest.desktopEntry.icon` | WIRED | `isSchemaValidIconUrl` guard prevents bare icon names from reaching `nativeAppConfigSchema.parse()` |

### Data-Flow Trace (Level 4)

Not applicable — this phase edits query-invalidation, window-size computation, X11 EWMH sequencing, and a config field assignment. None render dynamic data directly from a DB query in the modified functions. The data-flow for icon rendering (NativeAppIcon reading `iconUrl` from the stored config) and grid invalidation (React Query rehydrating `apps.native.list`) are runtime behaviors requiring live verification (see Human Verification section).

### Behavioral Spot-Checks

Step 7b: SKIPPED for the UI edits (no runnable entry points without a live Mini PC + browser session). The livinityd edits run as tsx — the fullscreen function fires only on native app spawn which requires a real X11 Xvfb. All behavioral verification is routed to Human Verification.

### Requirements Coverage

Phase 259 tracks requirements as SC1-SC4 in CONTEXT.md (no REQUIREMENTS.md REQ-IDs).

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SC1 — ICONS | 259-01 (invalidation), 259-02 (iconUrl) | Native app icon appears on desktop grid immediately after install; renders real artwork | SATISFIED (code) | 3 `apps.native.list.invalidate()` sites + schema-gated `iconUrl` in configCandidate |
| SC2 — CONSISTENT WINDOW SIZE / NO LETTERBOX | 259-01 | Native app window is 16:9 (1280x720) with no top/bottom black bands | SATISFIED (code) | `isNative` branch in `window-manager.tsx` routes `NATIVE_` windows to 1280x720 + preserveAspect |
| SC3 — FULLSCREEN ROBUST | 259-02 | Every native app fills 1280x720 Xvfb; OBS no longer leaves a black strip | SATISFIED (code) | `fullscreenNativeWindow` 6-pass re-apply loop over ALL windows; EWMH maximize + fullscreen re-applied each pass |
| SC4 — NO REGRESSION | 259-01, 259-02 | Docker + WebApp windows unchanged; streaming transport untouched | SATISFIED (code) | `git show --stat` confirms only the 4 expected files changed; no forbidden files touched |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `native-installer.ts` (pre-WR-01-fix) | 272 | `iconUrl: manifest.desktopEntry.icon \|\| undefined` — bare freedesktop name fails schema | WR-01 identified in REVIEW.md | FIXED in the committed code: inline `isSchemaValidIconUrl` guard prevents schema-parse throw |

No anti-patterns remain in the committed code. The REVIEW.md WR-01 (bare `.desktop` icon name failing `nativeAppConfigSchema.parse()`) was resolved before the commit was authored — the committed `native-installer.ts` uses `rawIcon && isSchemaValidIconUrl(rawIcon) ? rawIcon : undefined` (line 272), not the naive `manifest.desktopEntry.icon || undefined` from the original plan task description.

### Human Verification Required

#### 1. Desktop grid icon appearance (SC1 load-bearing)

**Test:** On Mini PC (`bruce@10.69.31.68`), open the LivOS UI, navigate to the app store, install a native app (e.g. VS Code or Brave via the .deb path). Watch the desktop/apps grid WITHOUT reloading the page.
**Expected:** Within 1-2 seconds of the install completion, the native app's launch icon appears on the desktop grid — no manual page refresh required.
**Why human:** tRPC React Query invalidation triggers a background refetch whose result (icon rendered in the grid) requires a live browser session; not statically observable from source.

#### 2. Native window aspect ratio / no letterbox (SC2)

**Test:** From the desktop icon created in test 1, click to open the native app. Observe the window that opens.
**Expected:** The noVNC canvas fills the window with no black bands top or bottom; window aspect ratio is 16:9 matching the Displays-popover proportion (1280x720-derived, with responsive scaling).
**Why human:** Window geometry and canvas render scaling are X11/noVNC runtime outputs — not verifiable from static source analysis.

#### 3. OBS fullscreen robustness (SC3 failing reference)

**Test:** Install OBS (the specific regression reference) as a native app and open it.
**Expected:** OBS fills the 1280x720 Xvfb fully — no black/gray strip remains on the right side. The 6-pass re-apply loop should correct OBS's Qt geometry-restore behavior.
**Why human:** OBS Qt geometry restore timing is nondeterministic; only a live X11 session can confirm the re-apply loop wins.

#### 4. No regression — Docker + WebApp (SC4)

**Test:** Open a Docker app (beszel) and a WebApp window. Observe their sizes.
**Expected:** Both open at their normal pre-259 sizes. Docker/community windows use `DEFAULT_WINDOW_SIZES.default` as before (900x600 or per-map entry). WebApp windows remain 1280x720 + preserveAspect as before.
**Why human:** App-launch window sizing requires a live browser session with the deployed UI dist.

#### 5. Native app icon artwork (SC1-cosmetic)

**Test:** After a native app installs, observe the icon tile on the desktop grid.
**Expected:** The tile shows the app's real artwork (svg/png resolved from `manifest.desktopEntry.icon` when it is a schema-valid URL or root-relative path), not the gray placeholder. Note: for apps whose manifest provides only a bare freedesktop icon name (e.g. "vscode"), the iconUrl will be `undefined` and the placeholder is expected — only apps with http(s) or absolute-path icons will show artwork.
**Why human:** Icon rendering from the persisted `iconUrl` config field requires a live install + UI observation on Mini PC.

### Gaps Summary

No code-structural gaps. All four SC artifacts exist, are substantive, and are wired correctly. The WR-01 bug identified in the REVIEW.md (bare freedesktop icon names failing `nativeAppConfigSchema.parse()`) was resolved in the committed code before this verification — the fix is an inline `isSchemaValidIconUrl` guard rather than the external `toIconUrl` helper suggested by the reviewer, but the outcome is identical: bare names become `undefined`, schema parse is safe, installs are not blocked.

All remaining open items are runtime/X11 behaviors requiring live Mini PC verification. No gaps are blocking code-structural goal achievement.

---

_Verified: 2026-06-04T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
