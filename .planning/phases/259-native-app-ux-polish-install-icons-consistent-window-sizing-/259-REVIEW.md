---
phase: 259-native-app-ux-polish-install-icons-consistent-window-sizing
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - livos/packages/livinityd/source/modules/apps/native-installer.ts
  - livos/packages/livinityd/source/modules/apps/native-routes.ts
  - livos/packages/ui/src/hooks/use-app-store-bridge.ts
  - livos/packages/ui/src/providers/window-manager.tsx
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 259: Code Review Report

**Reviewed:** 2026-06-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four edits were reviewed: the `iconUrl` field added to `configCandidate` in `native-installer.ts`, the `fullscreenNativeWindow` rewrite into a spaced EWMH re-apply loop in `native-routes.ts`, three `apps.native.list.invalidate()` calls added in `use-app-store-bridge.ts`, and the `NATIVE_` appId-prefix branch for 1280x720 base sizing in `window-manager.tsx`.

The window-manager, bridge invalidation, and fullscreen loop edits are correct. One warning-level bug was found in the `iconUrl` assignment: passing a bare freedesktop icon name into a field whose schema only accepts `https?://` URLs or `/`-prefixed paths will cause `nativeAppConfigSchema.parse()` to throw `manifest_invalid` for any app whose manifest supplies a normal `.desktop` icon name — silently blocking installs for exactly the apps this phase targets (VS Code, Brave, etc.). One info item covers the fullscreen loop's wall-time budget.

---

## Warnings

### WR-01: Bare `.desktop` icon name passed as `iconUrl` fails schema validation, blocking native installs

**File:** `livos/packages/livinityd/source/modules/apps/native-installer.ts:255`

**Issue:** The new line assigns `manifest.desktopEntry.icon` to the `iconUrl` field of `configCandidate`:

```typescript
iconUrl: manifest.desktopEntry.icon || undefined,
```

`manifest.desktopEntry.icon` is typed as `string` and is the raw value of the `Icon=` key in the `.desktop` entry — for apt/deb-installed apps this is almost always a bare freedesktop icon name (e.g. `"vscode"`, `"brave-browser"`, `"gimp"`) or an absolute filesystem path (e.g. `"/usr/share/icons/hicolor/…/vscode.png"`).

`nativeAppConfigSchema` (native-app-config.ts:73–88) validates `iconUrl` as either:
- a `/`-prefixed root-relative path matching `ROOT_RELATIVE_PATH_RE` (`/^\/[A-Za-z0-9_\-./]*$/`), or
- a string that parses as a `new URL(v)` (i.e. a full `https?://` URL).

A bare icon name like `"vscode"` satisfies neither condition. The schema parse at line 262:

```typescript
nativeAppConfigSchema.parse(configCandidate)
```

will throw, causing the install to return `fail(... 'manifest_invalid' ...)` for any manifest that supplies a normal icon name. Absolute filesystem paths like `/usr/share/icons/…/icon.png` are also rejected because `ROOT_RELATIVE_PATH_RE` does not permit uppercase letters (`A-Z` are excluded from the first character class after `\//`).

This means the `iconUrl` line, as written, turns a correctly-formed native manifest icon into an install blocker for every app in the category this phase targets.

**Fix:** Validate the icon string before assigning it. Only populate `iconUrl` if the value is already a valid URL or root-relative path per the schema; otherwise omit it (leave the `.desktop` `Icon=` field intact for the desktop environment to resolve, but do not propagate the value into the Redis config where the schema rejects it):

```typescript
function toIconUrl(icon: string | undefined): string | undefined {
  if (!icon) return undefined
  // Root-relative path (schema accepts these as iconUrl)
  if (icon.startsWith('/') && /^\/[A-Za-z0-9_\-./]*$/.test(icon)) return icon
  // Full URL
  try { new URL(icon); return icon } catch { /* fall through */ }
  // Bare freedesktop icon name — keep for .desktop but omit from iconUrl
  return undefined
}

// In configCandidate:
iconUrl: toIconUrl(manifest.desktopEntry.icon),
```

---

## Info

### IN-01: `fullscreenNativeWindow` adds up to ~9s of background processing per spawn

**File:** `livos/packages/livinityd/source/modules/apps/native-routes.ts:53–107`

**Issue:** The new implementation has two sequential timing loops: the poll phase (up to 24 × 250ms = 6s) followed by the re-apply phase (6 × 500ms = 3s), totalling up to ~9s of background execution after every `apps.native.spawn`. The function is correctly `void`-prefixed at the call site (line 369) so it does not block the spawn RPC response to the UI.

However, each pass in the re-apply loop runs an `xdotool search` plus up to four `execFileP` calls per window. On a box running many concurrent native apps, simultaneous re-apply loops from staggered spawns could queue up many short-lived child processes. This is acceptable for the current single-app-at-a-time Mini PC use case.

No code change is strictly required for correctness — noting for awareness if multi-app concurrency increases.

**Fix (optional):** If re-apply pass count or timing is tunable later, externalise the constants (`MAX_POLL_ATTEMPTS = 24`, `POLL_INTERVAL_MS = 250`, `REAPPLY_PASSES = 6`, `REAPPLY_INTERVAL_MS = 500`) so they can be adjusted without re-reading the logic.

---

_Reviewed: 2026-06-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
