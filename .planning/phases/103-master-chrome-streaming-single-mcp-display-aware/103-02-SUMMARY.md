---
phase: 103
plan: 02
subsystem: chrome-master-ui
tags:
  - chrome-master
  - novnc
  - input-dispatch
  - ui
  - trpc
  - http-only-paths
dependency-graph:
  requires:
    - 103-01-chromeMaster-startLogin-input.*-mutations
    - 95-04-useWebAppVnc-hook
    - 100-07-webapp-stream-window-input-pattern
    - 102-07-master-chrome-login-component
  provides:
    - inline noVNC viewer in Settings -> Chrome Profile panel
    - DOM-event-to-chromeMaster.input.* dispatch loop (click/key/type/scroll)
    - chromeMaster.stopLogin Close button affordance
  affects:
    - livos/packages/ui/src/modules/settings/master-chrome-login.tsx
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (httpOnlyPaths)
tech-stack:
  added: []
  patterns:
    - source-text-grep test invariants (no @testing-library/react per D-NO-NEW-DEPS)
    - debounced printable-key batching (250 ms idle flush) with non-printable key flushing the buffer
    - viewer-mount gating on `running && wsUrl !== undefined` (Pitfall 4 fix)
key-files:
  created: []
  modified:
    - livos/packages/ui/src/modules/settings/master-chrome-login.tsx
    - livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
decisions:
  - "Behavioral tests (plan Tests 1-8) encoded as source-text-grep invariants rather than @testing-library/react render-and-fire — matches D-NO-NEW-DEPS established by Phase 102-07-04 test pattern (commit 683c9912)."
  - "Modifier-bearing single-char chord (Ctrl+L, Alt+F4, etc.) routes via inputKeyMut with `mods+key` xdotool keysym — NOT batched into type. Mirrors webapp-stream-window.tsx:367 pattern; flush printable buffer first to keep event order coherent."
  - "Added chromeMaster.input.{click,key,type,scroll} + chromeMaster.stopLogin to httpOnlyPaths in server/trpc/common.ts — same admin-mid-systemctl-restart rationale as the 102-07 cluster (pitfall B-12/X-04)."
  - "useWebAppVnc options omits scaleViewport (plan referenced it; actual hook signature in use-webapp-vnc.ts only accepts viewOnly + credentials and forces scaleViewport=true internally — D-95-02 contract)."
metrics:
  duration: 35min
  completed: 2026-05-11
---

# Phase 103 Plan 02: Master Chrome embedded noVNC viewer + input dispatch

Wire the master Chrome Xvfb stream produced by 103-01 into the Settings -> Chrome Profile panel as an inline noVNC viewer with bidirectional input forwarding via tRPC. On a headless Mini PC the user can now master-login directly inside the LivOS UI instead of relying on a physical display.

## What Shipped

| Task | Commit | Files | Lines (+/-) |
|------|--------|-------|-------------|
| 1. Render embedded noVNC viewer with input dispatch | `c5eb9360` | 3 (`master-chrome-login.{tsx, test.tsx}`, `server/trpc/common.ts`) | +429 / -10 |

**Total: 429 + / 10 - across 3 files in 1 commit.**

## Behaviour

### Before (Phase 102-07 r14a + 103-01 backend)

The Settings panel only exposed Status indicators + Open/Reset buttons. Clicking Open spawned master Chrome behind the scenes; on a headless Mini PC the user saw nothing because there was no rendered surface for the master's pixels. 103-01 wired the backend to return `{wsUrl, streamId, display}` but the UI ignored those fields.

### After (Phase 103-02)

When `chromeMaster.status` returns `{running:true, wsUrl: 'ws://.../stream/...'}` the Settings panel renders an inline 16:9 viewer (`max-w-[1280px]`) whose canvas mirrors the master's Xvfb framebuffer. The viewer:

1. Receives pixels via `useWebAppVnc(wsUrl, {viewOnly: true})` — gated on `running && wsUrl !== undefined` (Pitfall 4 — never construct an RFB against `undefined`).
2. Intercepts `mousedown`, `mouseup`, `contextmenu`, `wheel`, `keydown` on the container div. RFB is `viewOnly:true`, so noVNC's own input handlers no-op.
3. Translates `clientX/Y` to FB coords via the same coord math as `webapp-stream-window.tsx` (rect.width<=0 + NaN guards, integer rounding, [0..1279]/[0..719] clamping).
4. Dispatches via the new admin-gated mutations:
   - `chromeMaster.input.click({x, y, button, kind: 'mousedown'|'mouseup'})` — button mapped via `e.button === 1 ? 2 : e.button === 2 ? 3 : 1`.
   - `chromeMaster.input.scroll({x, y, direction, clicks})` — direction in `'up'|'down'|'left'|'right'`, clicks bounded `[1, 50]`.
   - `chromeMaster.input.key({key: mapped, kind: 'keydown'})` for special keys (Enter -> Return, Backspace -> BackSpace, Escape, Tab, arrows, Home/End/PageUp/PageDown, Delete) and modifier chords (Ctrl+L -> "ctrl+l", etc.).
   - `chromeMaster.input.type({text})` for batched printable-char runs — single-char keydowns accumulate into `printableBuffer`, flushed via 250 ms idle timer OR a non-printable keydown (flushes before the special key dispatches, preserving order).
5. NO mutation carries a `display:` argument — backend reads `currentMaster.display` itself (T-103-01-03 mitigation preserved).

New buttons:

- **Close Master Chrome** (destructive variant) -> `chromeMaster.stopLogin.mutate()`. Disabled when `!running || stopMut.isPending`.

Existing **Open Master Chrome** button gained `running` to its disabled clause (was only `startMut.isPending`).

`useEffect` cleanup removes every DOM listener AND clears `flushTimerRef` on unmount or when `running`/`wsUrl` flip back — prevents the buffer from leaking type events after the viewer disappears.

## HTTP-only paths

Added 5 entries to `httpOnlyPaths` in `livos/packages/livinityd/source/modules/server/trpc/common.ts`:

- `chromeMaster.stopLogin`
- `chromeMaster.input.click`
- `chromeMaster.input.key`
- `chromeMaster.input.type`
- `chromeMaster.input.scroll`

Same admin-mid-`systemctl restart livos` resilience rationale as the 102-07 cluster (memory pitfall B-12 / X-04). Without these, the input.* mutations would route through WebSocket by default and silently queue during the ~5 s WS reconnect window.

## Key Decisions

- **Source-text-grep invariants over render-and-fire (Test 1-8 encoding):** `@livos/ui` has D-NO-NEW-DEPS — `@testing-library/react` is not installed and the existing 102-07-04 test pattern (`683c9912`) uses `readFileSync` + regex invariants on the component source. The 103-02 plan's prescriptive `<action>` Tests 5-8 (fire mousedown/wheel/key on the container, assert mutation called) require runtime DOM rendering, which would need `@testing-library/react` added as a dep. Resolution: encoded each behavioral test as a wiring-pattern grep over the handler body source. Test 5 = grep for `inputClickMut.mutate({...x: fb.x...button...kind: 'mousedown'})` literal + the `e.button === 1 ? 2 : e.button === 2 ? 3 : 1` mapping. Test 6 = grep for direction/clicks/`Math.max(1, Math.min(50,` bounds. Tests 7a/b/c split the special-key map, the keydown dispatch, and the batched type flow into three separate grep invariants. Test 8 cleanup verifies every `removeEventListener` + `clearTimeout(flushTimerRef`. This keeps the file in the established convention while still providing tight wiring-regression coverage.

- **`useWebAppVnc` option signature deviation:** Plan referenced `useWebAppVnc(wsUrl, {viewOnly: true, scaleViewport: true})`. The actual hook signature in `use-webapp-vnc.ts` (Phase 95-04, D-95-02) only accepts `{credentials?, viewOnly?}` and forces `rfb.scaleViewport = true` internally. Passing the spurious `scaleViewport: true` would be a TS error. Omitted it from the call site; the hook's behavior is unchanged.

- **Modifier-bearing single-char chord routes via key not type:** Plan only specified KEYSYM_MAP special keys + plain printables. Added a `(e.ctrlKey || e.altKey || e.metaKey) && e.key.length === 1` branch matching `webapp-stream-window.tsx:367` so Ctrl+L / Ctrl+A / Alt+F4 etc. dispatch as an xdotool chord keysym instead of getting typed literally as "l"/"a"/"4". This is correctness for browser shortcuts; without it, "Ctrl+L" inside the master Chrome would type the letter "l" instead of focusing the address bar.

- **HTTPS-only path additions for input.* + stopLogin:** Per Plan success criterion #6 and 103-01 carry-forward. The 103-01 SUMMARY explicitly flags this as a UI-side responsibility ("103-02 will add the four new mutation paths if it wants the admin-mid-restart resilience guarantee"). Adopted the guarantee for parity with the 102-07 cluster.

## Tests

| Suite | Before | After | Notes |
|-------|--------|-------|-------|
| master-chrome-login.test.tsx | 16 | 41 | +25 new (6 viewer-mount + 16 input-dispatch + 3 theme preservation). All 41 green. |
| chrome-master folder | 29 | 29 | No regression (smoke-checked: 19 master-login-routes + 10 profile-seeder). |
| settings folder (UI) | 16 | 41 | Same as master-chrome-login.test.tsx — sole file. |

Vitest command: `pnpm vitest run src/modules/settings/master-chrome-login.test.tsx` (from `livos/packages/ui/`).

Pre-existing failures in the broader UI vitest suite (10 files, 21 failing tests — `localStorage is not defined`, playwright .spec.ts files invoked under vitest) are Phase 101 Wave 0 deferred items, NOT regressions from this plan. Verified by running full `pnpm vitest run` before and after — failure set is identical.

## TypeScript Compliance

`pnpm tsc --noEmit` in `livos/packages/ui/` and `livos/packages/livinityd/`: 0 new errors in any of the 3 touched files. The pre-existing `ai/routes.ts` `ctx.livinityd is possibly undefined` errors and the cross-pnpm-store `@types/ws` quirk in `server/trpc/index.ts` are unchanged from baseline.

## Sacred SHA Verification

| Checkpoint | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|------------|--------------------------------------------------------------|
| Baseline (pre-commit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-commit `c5eb9360` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) fired and passed. The plan touches only `livos/packages/ui/` and `livos/packages/livinityd/source/modules/server/trpc/common.ts` — no `liv/` files modified.

## Deviations from Plan

### Minor

**1. [Adaptation] Test 5-8 encoded as source-text-grep invariants instead of @testing-library/react render-and-fire.**
- **Found during:** Task 1 test-file editing.
- **Issue:** Plan's `<action>` Step 8 prescribed `vi.mock('@/hooks/use-webapp-vnc', ...)` + `fireEvent` on the viewer container. `@testing-library/react` is NOT installed in `@livos/ui` (verified via `livos/packages/ui/node_modules/@testing-library` absent + `livos/node_modules/.pnpm | grep testing-library` empty). The existing 102-07-04 test file pattern (`683c9912`) explicitly cites "D-NO-NEW-DEPS, per @livos/ui convention" and uses source-text grep + smoke import.
- **Fix:** Translated each behavioral test into a wiring-pattern grep over the handler body source — see "Key Decisions" above for the per-test mapping. Still covers all 9 plan-specified behaviors at static-analysis precision.
- **Files modified:** `master-chrome-login.test.tsx`.
- **Commit:** `c5eb9360`.
- **Rationale:** Maintaining `D-NO-NEW-DEPS` matters more than literal test-style fidelity. Adding `@testing-library/react` would have rippled into a Rule 4 architectural-decision checkpoint.

**2. [Type widening] `useWebAppVnc` options shape — `scaleViewport: true` dropped.**
- **Found during:** Task 1 type-check pass.
- **Issue:** Plan said `useWebAppVnc(wsUrl, {viewOnly: true, scaleViewport: true})`. Actual `UseWebAppVncOptions` interface only accepts `credentials?` + `viewOnly?` (use-webapp-vnc.ts:56-59). The hook forces `rfb.scaleViewport = true` internally (D-95-02 contract, use-webapp-vnc.ts:150).
- **Fix:** Omitted `scaleViewport` from the call site. Behavior is identical because the hook hardcodes it.
- **Files modified:** `master-chrome-login.tsx`.
- **Commit:** `c5eb9360`.

**3. [Belt-and-suspenders] Added modifier-bearing single-char chord routing via key not type.**
- **Found during:** Task 1 implementation review.
- **Issue:** Plan's keydown handler covered only KEYSYM_MAP special keys + plain printables. A user pressing Ctrl+L (address bar focus) would get e.key === "l" with ctrlKey:true, fall through to the "single-char printable" branch, and type "l" inside the focused field instead of triggering the browser shortcut.
- **Fix:** Added `(e.ctrlKey || e.altKey || e.metaKey) && e.key.length === 1` branch that flushes the printable buffer, builds a `mods+key` xdotool keysym, and dispatches via inputKeyMut. Mirrors `webapp-stream-window.tsx:367` exactly.
- **Files modified:** `master-chrome-login.tsx`.
- **Commit:** `c5eb9360`.
- **Rule classification:** Rule 2 (auto-add missing critical functionality — keyboard shortcuts are essential for a usable master-login viewer).

**4. [Defensive] Added `contextmenu` preventDefault handler.**
- **Found during:** Task 1 implementation.
- **Issue:** Plan only handled mousedown/mouseup/wheel/keydown. Right-clicking on the viewer would fire the browser-native context menu, occluding the master Chrome view. The mousedown handler already maps `e.button === 2 -> button 3` to xdotool right-click, so the menu is redundant.
- **Fix:** Added `contextmenu` listener with `e.preventDefault()`, matching `webapp-stream-window.tsx:311`.
- **Commit:** `c5eb9360`.
- **Rule classification:** Rule 2 (UX correctness — right-click must reach Chrome, not the browser).

### None Material

No bugs, security gaps, blocking issues, or scope changes. Task 1 followed the plan's prescriptive `<action>` Steps 1-7 verbatim; Step 8 (tests) was adapted to the codebase convention.

## Authentication Gates

None — Phase 103-02 is code-only. The Mini PC deploy + UAT walk lands in 103-05/06+.

## Carry-Forward Notes for 103-05 / 103-06

- `chromeMaster.input.*` + `chromeMaster.stopLogin` are now on `httpOnlyPaths` — survives `systemctl restart livos` mid-call.
- Settings -> Chrome Profile panel UX is feature-complete for headless Mini PC: status indicator + Open / Close / Reset buttons + inline noVNC viewer + bidirectional input.
- `data-testid="master-chrome-viewer"` is the stable selector for any future UAT automation that wants to assert the viewer DOM presence.
- The printable buffer 250 ms idle flush window is empirically reasonable for English typing cadence (~3-5 chars/sec). If we ever see "Google Auth refuses pasted password" reports during UAT, lowering this to 100 ms or flushing on every TAB/Enter+ would be a safe tweak — the current logic already flushes on every special key.

## Threat Flags

None. This plan's surface (DOM event -> tRPC input.* mutation) was already enumerated in T-103-02-02 (mitigated via FB coord math + zod schema re-validation at the backend). No new trust boundary introduced.

## Self-Check: PASSED

All three modified files exist on disk. The single commit is present in `git log`. Sacred SHA preserved. Verified via:

```bash
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f

$ git log --oneline -1
c5eb9360 feat(103-02): embedded noVNC viewer + input dispatch in MasterChromeLogin

$ cd livos/packages/ui && pnpm vitest run src/modules/settings/master-chrome-login.test.tsx 2>&1 | tail -5
 Test Files  1 passed (1)
      Tests  41 passed (41)

$ cd livos/packages/livinityd && pnpm vitest run source/modules/chrome-master 2>&1 | tail -5
 Test Files  2 passed (2)
      Tests  29 passed (29)
```

File existence:

```
livos/packages/ui/src/modules/settings/master-chrome-login.tsx                   [FOUND]
livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx              [FOUND]
livos/packages/livinityd/source/modules/server/trpc/common.ts                     [FOUND]
```
