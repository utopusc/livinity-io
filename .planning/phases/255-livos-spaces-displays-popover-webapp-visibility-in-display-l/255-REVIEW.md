---
phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
reviewed: 2026-06-02T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - livos/install.sh
  - livos/packages/livinityd/source/index.ts
  - livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-screenshot.test.ts
  - livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
  - livos/packages/livinityd/source/modules/computer-use/native/screenshot.display.test.ts
  - livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts
  - livos/packages/livinityd/source/modules/computer-use/trpc-router.ts
  - livos/packages/livinityd/source/modules/shell/__tests__/branded-shell.test.ts
  - livos/packages/livinityd/source/modules/shell/branded-shell.ts
  - livos/packages/livinityd/source/modules/streaming/display-allocator.ts
  - livos/packages/livinityd/source/modules/streaming/index.ts
  - livos/packages/livinityd/source/modules/webapps/window-manager.test.ts
  - livos/packages/livinityd/source/modules/webapps/window-manager.ts
  - livos/packages/ui/src/modules/desktop/clock-helpers.test.ts
  - livos/packages/ui/src/modules/desktop/clock-helpers.ts
  - livos/packages/ui/src/modules/desktop/displays-popover.test.tsx
  - livos/packages/ui/src/modules/desktop/displays-popover.tsx
  - livos/packages/ui/src/modules/desktop/top-bar.tsx
  - livos/packages/ui/src/router.tsx
  - update.sh
  - livos/packages/ui/src/modules/desktop/active-displays-panel.tsx (deleted)
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 255: Code Review Report

**Reviewed:** 2026-06-02
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 255 ("LivOS Spaces") wires five seams: a `displays.screenshot` tRPC query
for popover thumbnails, subprocess-scoped `DISPLAY` threading in the native
screenshot capture, WebApp display-registry registration on spawn/close, the
merged `DisplaysPopover`, and an in-display branded fluxbox/feh/tint2 shell. The
change set is unusually well-disciplined: the security-critical invariants the
brief flagged are all correctly implemented.

Verified clean on the high-risk surfaces:

- **Subprocess env threading is correct.** `captureScreenshot({display})`
  builds `{...process.env, DISPLAY: options.display}` and passes it to `execFile`
  only — `process.env` is never mutated (screenshot.ts:155-157). `branded-shell.ts`
  does the same with `childEnv` (L161) and explicitly `void user`s the unused
  param. The `screenshot.display.test.ts` "NEVER mutates global process.env"
  case and branded-shell Test 4 both lock this.
- **tRPC auth contract is reused verbatim and fails closed.** `displays.screenshot`
  sources `userId`/`role` from `ctx.currentUser` only (never input), runs
  `canAccessDisplay` BEFORE any capture, and throws UNAUTHORIZED → SERVICE_UNAVAILABLE
  → NOT_FOUND → FORBIDDEN in the correct order (trpc-router.ts:179-227). It never
  logs the base64/dataUrl.
- **Allocator ranges are provably disjoint.** WebApps own `[10,60)`
  (`WEBAPP_DISPLAY_ALLOCATOR_RANGE`), MCP `create()` floors at 60
  (`MCP_CREATE_ALLOCATOR_START`), and `max <= floor` is locked by T-255-09a/b.
  Both the daemon and MCP `createDisplayManager` calls pass `allocatorStart: 60`.
- **Branded-shell graceful degrade is real.** A missing binary / spawn throw is
  caught in `spawnBranded`, feh failure falls back to `xsetroot`, and an
  outermost try/catch guarantees `bootBrandedShell` never throws — the boot call
  site is additionally inside a non-fatal try/catch.
- **No shell-injection surface.** All spawns use `execFile`/`spawn` with argv
  arrays (no `exec`/shell string interpolation); the `displayIdSchema`
  (`^:\d+(\.\d+)?$`) validates the only user-influenced value before it reaches
  the subprocess env. The install.sh / update.sh edits are static package-name
  additions (`feh tint2`) to existing apt lists — no interpolation.

Two warnings concern lifecycle robustness (a WebApp display record can be
GC-reaped or orphaned), and five info items note minor inconsistencies. Nothing
blocks the phase.

## Warnings

### WR-01: WebApp display records may be TTL-GC-reaped while the WebApp is still alive

**File:** `livos/packages/livinityd/source/modules/webapps/window-manager.ts:521-546`
**Issue:** `spawn()` now calls `displayManager.registerExisting()` to publish the
WebApp's `:N` into the same Redis namespace the display TTL garbage-collector
sweeps (`displays/display-ttl-gc.ts`). The GC reaps displays by staleness using
`last_app_at` / `created_at`. A WebApp display is registered with `mode:'xvfb'`
and an `ownerSession` but no app-pid attach (the WebApp's Chrome is not
`attachApp`'d to this record), so from the GC's perspective it looks like an
idle display with zero running apps. If the GC's idle policy reaps it, the
WebApp vanishes from `displays.list` / the popover while its Xvfb+Chrome are
still running — and worse, the GC calls `displayManager.kill({callerSession:
owner_session})`, which `processKillFn`s any app pids and DELs the Redis keys.
For a host-owned (empty owner_session) record the GC would pass the owner gate;
for a WebApp record owned by `userId` it would too (GC reads owner off the
record). The window-manager's own `close()` would then later `kill()` an
already-gone record (harmless `not-found`), but the live UX regression (display
disappears under the user) is real.
**Fix:** Confirm the TTL-GC's staleness predicate excludes WebApp-owned records,
or have `spawn()` stamp `last_app_at`/attach the Chrome pid so the record reads
as active. If WebApp records should never be GC-eligible, tag them (e.g. a
`source:'webapp'` field) and have `display-ttl-gc.ts` skip that source:
```ts
// in spawn(), after registerExisting:
await this.displayManager.attachApp?.({display, pid: chrome.pid, app_name: opts.url})
// OR in display-ttl-gc.ts sweep: if (r.mode === 'xvfb' && r.owner_session) continue
```

### WR-02: WebApp display record leaks if `close()` is never reached (crash / idle-cleanup path)

**File:** `livos/packages/livinityd/source/modules/webapps/window-manager.ts:753-771`
**Issue:** The `registerExisting` → `kill` pairing assumes `close()` always runs
for the symmetric teardown. But `spawn()` registers the display unconditionally,
while `kill()` only fires from the explicit `close()` path. The idle-cleanup
tick (Test 10/14 note the idleCleanupTick is currently a no-op under per-app
display) and any abnormal exit (livinityd crash, Chrome dying out-of-band) leave
the Redis record behind with no `kill()`. On next boot the stale `:N` record
both shows a dead display in the popover (its screenshot poll will fail/black)
and seeds `nextDisplayNum` past it. This is the same class of orphan the boot-`:1`
idempotency comment worries about, but for `[10,60)` records there is no
re-adoption path.
**Fix:** Have `startIdleCleanup()` (or the existing window-gone cascade) also
call `displayManager.kill()` for the reaped entry, and/or sweep `[10,60)` records
with no live Xvfb on boot. At minimum, document that the TTL-GC (WR-01) is the
intended backstop for orphaned WebApp records — but that contradicts WR-01's
need to exempt them, so the two must be reconciled.

## Info

### IN-01: `fluxbox-remote setStyle <path>` is passed as a single argv element

**File:** `livos/packages/livinityd/source/modules/shell/branded-shell.ts:214`
**Issue:** `spawnBranded('fluxbox-remote', [`setStyle ${stylePath}`])` passes
`"setStyle /tmp/livos-fluxbox-style"` as one argv token. `fluxbox-remote`
typically expects the command and operand split, or a quoted single-string
command. Whether it parses a single combined token is binary-version-dependent;
if it doesn't, the style silently never applies (the wallpaper+dock still
brand, so it degrades, but the themed colors are lost). No security impact —
purely a "does the style actually apply" correctness risk.
**Fix:** Verify on the Mini PC fluxbox build; if it needs split args use
`['setStyle', stylePath]`. Since this is unlike any existing call in
`fluxbox-wm.ts`, a one-line live check is warranted.

### IN-02: `feh --bg-fill` writes `~/.fehbg` despite the "do NOT rely on ~/.fehbg" comment

**File:** `livos/packages/livinityd/source/modules/shell/branded-shell.ts:220`
**Issue:** The comment (L217-218) says the wallpaper is re-invoked each boot and
does not rely on `~/.fehbg`, which is correct for the *read* side. But `feh
--bg-fill` still *writes* `~/.fehbg` as a side effect. Per project memory
(`feedback_bruce_home_ownership`), a root-owned `/home/bruce` makes home-dir
writes fail. feh would still set the wallpaper for the session (the write
failure is non-fatal) and the code degrades to xsetroot on a non-zero exit, so
this is benign — but the comment slightly overstates the independence from
`~/.fehbg`.
**Fix:** None required. Optionally add `feh --no-fehbg --bg-fill` if the build
supports it to avoid the home-dir write entirely.

### IN-03: `wmoGlyph` fallback swallows several real WMO bands

**File:** `livos/packages/ui/src/modules/desktop/clock-helpers.ts:13-23`
**Issue:** Codes 4-44, 49-50, 68-70, 78-79, 83-94 fall through to the `☁️`
fallback. Most are unused/reserved in the Open-Meteo current set, but `85-86`
(snow showers) and `66-67` is covered while `68-70` is not. This is intentional
per the documented map and the test only asserts the listed bands, so it is
cosmetic, not a bug. Noted only so a future "snow shower shows as cloud" report
isn't treated as a regression.
**Fix:** None required. If snow-shower fidelity matters later, add
`if (code >= 85 && code <= 86) return '❄️'` before the fallback.

### IN-04: `DisplayCard.running_apps.length` assumes the field is always present

**File:** `livos/packages/ui/src/modules/desktop/displays-popover.tsx:122`
**Issue:** The card reads `d.running_apps.length` with `running_apps` typed as a
non-optional `unknown[]`. `display-manager.ts list()` always sets `running_apps`,
so this is safe today. But the local `DisplayRecord` type is a hand-rolled
structural subset (L26), decoupled from the backend type — if a future
`displays.list` shape drops/renames the field, this throws a runtime TypeError
inside render rather than a type error at build.
**Fix:** Defensive read: `{(d.running_apps?.length ?? 0)} app(s)` — cheap
insurance against backend/UI type drift across packages.

### IN-05: Deleted `active-displays-panel` files not in the explicit review file list

**File:** `livos/packages/ui/src/modules/desktop/active-displays-panel.tsx` (deleted)
**Issue:** `router.tsx` correctly drops the `ActiveDisplaysPanel` import and
mount (replaced by the in-TopBar `DisplaysPopover`), and the component + its test
were deleted (178 lines removed, confirmed via git). The deletion is clean — no
dangling imports remain (grep-verified the only importer was router.tsx). Noted
only because the deleted files were not in the `<config> files:` list, so a
reader of this report should know they were checked for orphan references.
**Fix:** None — informational. The removal is complete and consistent.

---

_Reviewed: 2026-06-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
