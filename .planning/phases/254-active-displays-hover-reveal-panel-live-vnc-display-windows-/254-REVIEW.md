---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows
reviewed: 2026-05-31T12:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - livos/packages/livinityd/source/index.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/index.ts
  - livos/packages/livinityd/source/modules/computer-use/trpc-router.ts
  - livos/packages/livinityd/source/modules/server/trpc/common.ts
  - livos/packages/livinityd/source/modules/server/trpc/index.ts
  - livos/packages/ui/src/modules/desktop/active-displays-panel.tsx
  - livos/packages/ui/src/modules/desktop/active-displays-panel.test.tsx
  - livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx
  - livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.test.tsx
  - livos/packages/ui/src/modules/window/window-content.tsx
  - livos/packages/ui/src/providers/window-manager.tsx
  - livos/packages/ui/src/providers/window-manager.test.tsx
  - livos/packages/ui/src/router.tsx
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 254: Code Review Report

**Reviewed:** 2026-05-31T12:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 254 adds three things: (1) a `displaysRouter` tRPC namespace (`displays.list` / `displays.getVncUrl`) backed by the existing `DisplayManager` singleton, (2) a live interactive VNC window (`X11DisplayStreamWindow`) using the existing `useWebAppVnc` hook with `viewOnly: false`, and (3) a top-edge hover-reveal `ActiveDisplaysPanel` that lists active X displays and opens VNC windows on click.

The overall security posture is sound: `getVncUrl` is `privateProcedure`-gated, owner-scoping is enforced at the `DisplayManager.isOwner()` layer, wsUrl is not logged in the backend (only `displayId`), and the React component explicitly avoids logging the wsUrl as well. The `displayIdSchema` Zod regex prevents injection of arbitrary display strings.

One critical issue was found: the owner-scoping check in `getVncUrl` compares `ctx.currentUser.id` (a database UUID / multi-user session id) against `owner_session` (written by the MCP stdio server as `LUSE_USER_ID`, defaulting to the string `'bruce'`). On a single-tenant Mini PC these will never match for MCP-created displays, so any authenticated user is permanently FORBIDDEN from viewing their own displays through the VNC window. This is a correctness bug masquerading as a security gate — the code comment in the router acknowledges the mismatch but the behaviour is broken.

Four warnings cover: (a) a double `dm.list()` call inside `getVncUrl` (races + N+1 Redis scans), (b) the hover-panel z-index ordering placing the hot-zone strip (z-[60]) above the AnimatePresence panel (z-[55]) which means the strip captures mouse events on top of any open panel row, (c) the retry path in `X11DisplayStreamWindow.onRetry` calling `vnc.reconnect()` before `setWsUrl(null)` settles, potentially connecting the old stream before the new mutation resolves, and (d) `windowManager?.openWindow(...)` silently no-ops when `windowManager` is null — the optional chaining means a missing provider is invisible to the user (no error, no feedback).

Three info items cover: the `never` type cast on `this.ai.redis` when constructing `displayManager`, a stale empty `catch {}` in `defaultProcessKill` that swallows non-ESRCH errors silently, and the `displaysRouter` being wired statically (not via `setProductionAppRouter`) while `displayManager` is wired dynamically — the static mount is correct for the current design but creates a subtle dependency order that is not documented.

---

## Critical Issues

### CR-01: owner-scoping comparison uses mismatched identity types — MCP-created displays are permanently FORBIDDEN to all UI users

**File:** `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts:74-77`

**Issue:** `getVncUrl` calls `dm.isOwner({display: input.display, session: userId})` where `userId` is `ctx.currentUser.id` — a PostgreSQL UUID for multi-user installs, or `'admin'` / `'bruce'` on legacy single-user builds. `owner_session` is written by the MCP stdio server via `resolveLuseUserId()` which reads `LUSE_USER_ID` env, defaulting to `'bruce'`. On a Mini PC where the UI user id is a UUID (e.g. `"4a7d1b3e-…"`), these strings never match. The non-empty `owner_session` branch therefore always fires `FORBIDDEN` for every MCP-created display, making the entire feature non-functional in the primary deployment scenario.

The comment at line 26-29 of the router file correctly describes the mismatch but frames it as "correct deny behaviour" — however, the intent of the plan (allowing the Mini PC operator to view their own displays) is defeated. Displays with an empty `owner_session` would work, but the MCP always writes a non-empty `owner_session`.

**Fix options (pick one):**

Option A — allow admin/single-user to bypass the owner check (minimal footprint):
```typescript
// In getVncUrl, after the owner check block:
// Replace the current FORBIDDEN gate with an admin-or-owner check:
const userRole = ctx.currentUser?.role ?? 'member'
if (
  record.owner_session &&
  userRole !== 'admin' &&
  !(await dm.isOwner({display: input.display, session: userId}))
) {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'display owned by another session',
  })
}
```

Option B — store the livinityd-side user id alongside the MCP's luse session id. Add a second Redis field `ui_user_id` when `displayManager.create()` is called from the UI, and check either field in `isOwner`. This requires a plan-level API change.

Option C — for the single-tenant Mini PC, treat any admin-role user as the implicit owner of all displays (same as Option A).

The safest minimal fix for a single-tenant device is Option A/C. If multi-tenant isolation matters, Option B is the right long-term fix.

---

## Warnings

### WR-01: double `dm.list()` in getVncUrl — N+1 Redis SCAN on every VNC open

**File:** `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts:69`

**Issue:** `getVncUrl` calls `await dm.list()` to find the display record, and `dm.list()` internally runs a full Redis SCAN + per-key HGETALL loop. This happens every time the user clicks a display row. If the display is not found the mutation throws NOT_FOUND. If found, the owner check is then a second `dm.isOwner()` call which does another `redis.hgetall()` for the same key. So a single `getVncUrl` triggers: one full SCAN, N HGETALL calls (one per display), plus a second HGETALL for the owner check.

**Fix:**
```typescript
// Replace the list().find() pattern with a direct HGETALL on the target key:
// (Add a getRecord(display) method to DisplayManager, or use dm.isOwner's
//  internal HGETALL result directly.)

// Minimal fix without API change — read the hash once:
const allDisplays = await dm.list()
const record = allDisplays.find((d) => d.display === input.display)
if (!record) throw new TRPCError({code: 'NOT_FOUND'})

// Then replace the dm.isOwner() call with an inline string comparison using
// the record we already have:
if (record.owner_session && record.owner_session !== userId) {
  throw new TRPCError({code: 'FORBIDDEN', message: 'display owned by another session'})
}
// This collapses two Redis round-trips into the one list() call already made.
```

---

### WR-02: hover-panel z-index ordering traps mouse events — hot-zone z-[60] overlaps strip z-[55]

**File:** `livos/packages/ui/src/modules/desktop/active-displays-panel.tsx:45,59`

**Issue:** The invisible hot-zone `<div>` is `z-[60]` and is a fixed sibling to the AnimatePresence strip which is `z-[55]`. Once the panel is open, the hot-zone (height 2px) sits on top of the first row of the strip. Moving the cursor back up to the very top of the strip triggers `onMouseEnter` on the z-[60] hot-zone again (which is a no-op since `open` is already true), but if the hot-zone area ever overlaps a close trigger it would fight the `onMouseLeave` on the strip.

More concretely: the strip's `onMouseLeave` at line 58 will close it when the cursor exits the strip div — but the 2px hot-zone div sitting at z-[60] above the top edge of the strip means a cursor that re-enters the top 2px of the strip actually enters the hot-zone overlay, not the strip div, so `onMouseLeave` fires and the panel flickers closed/open repeatedly during slow vertical movement.

**Fix:**
```tsx
{/* Disable pointer events on the hot-zone while the panel is open
    so the strip's own onMouseLeave fires cleanly. */}
<div
  className={cn(
    'pointer-events-auto fixed inset-x-0 top-0 z-[60] h-2',
    open && 'pointer-events-none',
  )}
  onMouseEnter={() => setOpen(true)}
  aria-hidden
/>
```

Alternatively, make the strip `z-[65]` so it renders above the hot-zone when open, and rely solely on the strip's `onMouseLeave` to close.

---

### WR-03: onRetry calls vnc.reconnect() before new wsUrl is resolved — stale RFB connection

**File:** `livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx:96-104`

**Issue:** In `onRetry`, the sequence is:
1. `resolvedForRef.current = null` (reset guard)
2. `setWsUrl(null)` (schedules re-render)
3. `setResolveError(null)` (schedules re-render)
4. `triggerResolve()` — immediately fires the mutation (asynchronous)
5. `vnc.reconnect()` — attempts to reconnect the RFB **before** the mutation resolves

At step 5, `wsUrl` in the component state is still the old value (state update is batched; the new `null` state is not yet visible in the closure). `useWebAppVnc` receives `wsUrl ?? undefined` which at render time is the stale URL. `vnc.reconnect()` reconnects to the old (dead) URL. When the mutation resolves, `setWsUrl(res.wsUrl)` triggers a re-render and `useWebAppVnc` may then reconnect again — but only if its internal logic handles a wsUrl change as a reconnect trigger (which it does, since it's a dependency). The result is two RFB connections in quick succession: one to the old dead URL (immediately fails), then one to the new URL. This is a race with a visible flicker (the `'connecting'` overlay appears twice).

**Fix:**
```typescript
const onRetry = useCallback(() => {
  // Reset guard + error first so the useEffect re-runs cleanly
  resolvedForRef.current = null
  setWsUrl(null)
  setResolveError(null)
  // Do NOT call vnc.reconnect() here — when triggerResolve() succeeds it
  // calls setWsUrl(res.wsUrl), which triggers useWebAppVnc's wsUrl-change
  // path (useEffect dep on wsUrl) which connects fresh. vnc.reconnect()
  // here would race against the mutation.
  triggerResolve()
}, [triggerResolve])
```

If explicit reconnect control is needed (e.g. when the wsUrl stays the same but the stream died), guard it:
```typescript
if (!wsUrl) {
  triggerResolve()
} else {
  vnc.reconnect()
}
```

---

### WR-04: windowManager?.openWindow silently no-ops when provider is absent — no user feedback

**File:** `livos/packages/ui/src/modules/desktop/active-displays-panel.tsx:79`

**Issue:** `windowManager?.openWindow(...)` uses optional chaining. If `useWindowManagerOptional()` returns `null` (component rendered outside `WindowManagerProvider`), the click handler silently does nothing — no error, no toast, no console warning. The `router.tsx` confirms `<ActiveDisplaysPanel />` is mounted inside `<WindowManagerProvider>`, so in production this path is never hit. However, the silent failure is a code quality concern: if the component is ever rendered in a test harness or outside the provider tree, the click appears to work but produces no window.

**Fix:**
```tsx
onClick={() => {
  if (!windowManager) {
    // Should never happen in production — ActiveDisplaysPanel is
    // always a child of WindowManagerProvider (router.tsx).
    console.warn('[ActiveDisplaysPanel] windowManager not available; cannot open display window')
    return
  }
  windowManager.openWindow(
    `DISPLAY_${d.display}`, '/', `Display ${d.display}`, '🖥️',
    undefined, {width: d.width, height: d.height}
  )
  setOpen(false)
}}
```

---

## Info

### IN-01: `never` cast on `this.ai.redis` when constructing displayManager — structural gap not documented

**File:** `livos/packages/livinityd/source/index.ts:853`

**Issue:** `redis: this.ai.redis as never` uses a `never` cast to satisfy the `DisplayRedisClient` interface. The comment explains the rationale (ioredis structurally implements the 6-method subset), but `as never` disables all type checking at that call site — if `DisplayRedisClient` adds a new method in the future, the type error will be silently swallowed. A narrower cast (`as unknown as DisplayRedisClient`) would preserve the structural gap warning on method additions.

**Fix:**
```typescript
this.displayManager = createDisplayManager({
  redis: this.ai.redis as unknown as DisplayRedisClient,  // ioredis implements the subset structurally
  logger: { ... },
})
```

---

### IN-02: `defaultProcessKill` swallows all errors beyond ESRCH — non-ESRCH signals silently fail

**File:** `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts:83-91`

**Issue:** The `defaultProcessKill` function catches all errors from `process.kill()` including EPERM (permission denied) and returns `false` silently. The comment says "ESRCH (no such process) is non-fatal" and "Other errors are silently ignored too because kill is best-effort". This is defensible for a display teardown path, but EPERM specifically means the kill did not happen — a display process that survived teardown will accumulate on repeated livinityd restarts. At minimum a log line for non-ESRCH errors would aid debugging.

**Fix:**
```typescript
function defaultProcessKill(): ProcessKillFn {
  return (pid: number, signal?: NodeJS.Signals | number) => {
    try {
      return process.kill(pid, signal)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ESRCH') {
        // Non-ESRCH means kill was attempted but may have been refused (EPERM)
        // or the signal number was invalid. Log so livinityd journal surfaces it.
        console.warn(`[display-manager] process.kill(${pid}, ${String(signal)}) failed: ${code}`)
      }
      return false
    }
  }
}
```

---

### IN-03: displaysRouter is wired statically — not rebuilt by setProductionAppRouter

**File:** `livos/packages/livinityd/source/modules/server/trpc/index.ts:329-332`

**Issue:** `displays: displaysRouter` is wired directly inside `createAppRouter()` without a DI slot, unlike `chromeMaster`, `xaiAuth`, `mastra`, and others which accept factory-injected instances. `displaysRouter` reads `ctx.livinityd?.displayManager` at request time (lazy ctx resolution), so there is no boot-order bug for the current implementation — the `displayManager` is constructed before `setProductionAppRouter` fires, and `ctx.livinityd` is always the live singleton.

However, if `displaysRouter` ever needs a constructor-time dependency (e.g. a rate-limiter, a per-user quota store), there is no established pattern to inject it without changing the router's static wiring. This is an info item only because the current implementation is correct.

**Recommendation:** Document in a comment why `displaysRouter` is static (ctx-resolved, no ctor deps), mirroring the existing pattern comments on `streamsRouter` at line 329.

---

_Reviewed: 2026-05-31T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
