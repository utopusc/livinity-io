---
phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
plan: 02
subsystem: computer-use
tags: [trpc, displays, screenshot, maim, scrot, subprocess-env, jpeg, tdd, green, concurrency-safety]

# Dependency graph
requires:
  - phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
    plan: 01
    provides: "RED test scaffold trpc-router-screenshot.test.ts (Tests 4-6 the GREEN gate for this plan)"
  - phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
    provides: "displaysRouter (displays.list / displays.getVncUrl) + canAccessDisplay export + DisplayManager DI on ctx.livinityd"
provides:
  - "captureScreenshot({display}) — subprocess-scoped DISPLAY, never mutates global process.env"
  - "displays.screenshot tRPC query → {dataUrl: data:image/jpeg;base64,…, width, height} (powers the ~2s Displays-popover JPEG thumbnails, D-255-THUMBS-SCREENSHOT)"
affects: [255-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subprocess-scoped env override: {...process.env, DISPLAY} computed once, passed to BOTH maim+scrot execFile, process.env never mutated (concurrency-safe per Pitfall 1 / T-255-04)"
    - "tRPC QUERY (not mutation) for refetchInterval polling — no httpOnlyPaths entry required (vs getVncUrl mutation which spawns survive-reconnect x11vnc)"
    - "Auth-contract reuse verbatim: displays.screenshot clones getVncUrl's canAccessDisplay + caller-from-ctx gate rather than re-implementing"

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts (CaptureScreenshotOptions.display? + subprocessEnv applied to maim+scrot)"
    - "livos/packages/livinityd/source/modules/computer-use/trpc-router.ts (import captureScreenshot + displays.screenshot query)"
  created-test:
    - "livos/packages/livinityd/source/modules/computer-use/native/screenshot.display.test.ts (4 tests — subprocess DISPLAY threading + no global mutation)"

key-decisions:
  - "captureScreenshot computes subprocessEnv ONCE ({...process.env, DISPLAY} when display set, else the live process.env reference) and reuses it for BOTH maim + scrot execFile calls — DRY single-source-of-truth. The plan's grep hint expected `DISPLAY: options` to appear ≥2× literally; the implementation instead writes the literal once and applies it twice via `env: subprocessEnv` (grep -c `env: subprocessEnv` == 2). Functionally identical and verified by the unit test asserting DISPLAY lands in BOTH maim AND scrot envs."
  - "displays.screenshot is a QUERY (matches the 255-01 RED test which resolves `_def.procedures.screenshot._def.resolver` via `.query`) — refetchInterval-friendly, needs no httpOnlyPaths entry."
  - "captureScreenshot left at its existing JPEG q60 default (LUSE_SCREENSHOT_FORMAT default = jpeg, MAX_DIM=0) — the popover thumbnails inherit the same env-driven transcode the MCP screenshot path uses; no transcode change made."

requirements-completed: [GOAL-255-LIVE-THUMBS]

# Metrics
duration: 5min
completed: 2026-06-02
tasks-completed: 2
files-modified: 2
files-created: 1
---

# Phase 255 Plan 02: §1 Screenshot Seam (captureScreenshot{display} + displays.screenshot query) Summary

GREEN for the 255-01 RED screenshot scaffold: `captureScreenshot` now threads an optional `display` into the maim/scrot subprocess env (concurrency-safe — global `process.env.DISPLAY` is never mutated), and a new `displays.screenshot` tRPC **query** returns a JPEG `dataUrl` after reusing the verbatim 254-06 `canAccessDisplay` + caller-from-context authorization contract. Together they power the ~2s auto-refreshing JPEG thumbnails in the Displays popover without opening any RFB socket.

## What Was Built

### Task 1 — `captureScreenshot({display})` subprocess-scoped DISPLAY (commits `aca19e3f` RED, `46d08f75` GREEN)

- `CaptureScreenshotOptions` gains `display?: string` (documented as subprocess-scoped, no global mutation, T-255-04 / Pitfall 1).
- A single `subprocessEnv` constant is computed: `options?.display ? {...process.env, DISPLAY: options.display} : process.env`. It is passed to BOTH the maim primary `execFileAsync` and the scrot fallback `execFileAsync` (timeout `10_000` preserved on both).
- `process.env` is never assigned to — `grep -c "process.env.DISPLAY ="` returns 0. Two concurrent ~2s polls of different displays cannot cross-contaminate via a shared global.
- The JPEG transcode (`parsePngResult`, sharp q60) is untouched.
- New unit test `screenshot.display.test.ts` (4 tests, all GREEN) mocks `node:child_process` execFile to capture the 3rd-arg `env.DISPLAY`, forces the maim size-guard to fail (tiny PNG) so the scrot fallback also fires, and asserts DISPLAY threads into both subprocess envs while `process.env.DISPLAY` stays unchanged.

### Task 2 — `displays.screenshot` tRPC query (commit `e0d01f7a`)

- `import {captureScreenshot} from './native/screenshot.js'` added.
- New `screenshot` key on `displaysRouter` as a `.query` (NOT `.mutation`):
  - `userId = ctx.currentUser?.id` (UNAUTHORIZED if absent — never read from input).
  - `dm = ctx.livinityd?.displayManager` (SERVICE_UNAVAILABLE if absent).
  - record lookup via `dm.list()` (NOT_FOUND if no match).
  - `canAccessDisplay({ownerSession: record.owner_session, callerSession: userId, callerRole})` gate BEFORE any capture (FORBIDDEN for a foreign non-admin).
  - logs only `display=${input.display}` — never the dataUrl/base64.
  - returns `{dataUrl: \`data:${shot.mimeType};base64,${shot.base64}\`, width, height}`.
- No mount edit needed — `displaysRouter` was already mounted (254-01, `server/trpc/index.ts`). A query needs no `httpOnlyPaths` entry.

## Verification Evidence

- **255-01 screenshot Tests 4-6 now GREEN.** `npx vitest run …/__tests__/trpc-router-screenshot.test.ts` → `6 passed (6)`. Tests 1-3 (canAccessDisplay matrix) still pass; Tests 4-6 (handler shape: UNAUTHORIZED / SERVICE_UNAVAILABLE / dataUrl wrap) flipped RED → GREEN.
- **New Task-1 unit test GREEN.** `screenshot.display.test.ts` → `4 passed (4)`.
- **Combined run:** both files → `10 passed (10)`.
- **tsc gate — zero new errors vs baseline.** `tsc --noEmit` reports **390** errors. The documented Phase 254 baseline is **389**. The single +1 delta is the pre-existing 255-01 Wave-2 RED scaffold `shell/__tests__/branded-shell.test.ts:24` `Cannot find module '../branded-shell.js'` (the module is built by plan 255-05, EXPECTED to fail per this plan's own note). ZERO errors live in `screenshot.ts`, `screenshot.display.test.ts`, or `trpc-router.ts` — confirmed via `tsc … | grep computer-use/trpc-router.ts → NONE` and `grep screenshot.ts → NONE`. My 255-02 changes contribute **0** new tsc errors.
- **Acceptance greps:** `display?: string` present in screenshot.ts; `env: subprocessEnv` appears 2× (maim+scrot); `process.env.DISPLAY =` == 0; `screenshot:` == 1 in trpc-router.ts; `.query(` at the screenshot key (not mutation); `captureScreenshot({display: input.display})` == 1; `canAccessDisplay(` == 3; logger-with-base64 == 0.

## Deviations from Plan

### Implementation refinements (within plan intent — no behavior change vs spec)

**1. [Rule N/A — DRY refinement] Single `subprocessEnv` constant instead of two inline `{...process.env, DISPLAY: …}` literals**
- **Plan said:** at each execFile, set `env` to `options?.display ? {...process.env, DISPLAY: options.display} : process.env` — and its acceptance grep expected `DISPLAY: options` ≥2 matches.
- **What was done:** computed the override ONCE as `const subprocessEnv` and passed `env: subprocessEnv` to both maim and scrot. The literal `DISPLAY: options.display` therefore appears once (grep returns 1) but is applied twice (`grep -c "env: subprocessEnv"` == 2).
- **Why:** single source of truth; eliminates the risk of the two branches drifting. Functionally identical to the plan — the load-bearing assertion (DISPLAY lands in BOTH maim AND scrot envs) is proven by the unit test, which passes.
- **Files:** `native/screenshot.ts`. **Commit:** `46d08f75`.

No other deviations — both auth gates, the query-not-mutation choice, the dataUrl wrap, and the no-log-of-base64 contract were implemented exactly as the plan specified.

## Authentication Gates

None encountered (pure backend code + unit tests; no live services or credentials touched).

## Known Stubs

None. Both procedures are fully wired: `displays.screenshot` resolves a real `captureScreenshot` call against a real `displayManager.list()` record. The popover consumer (the query caller) is built in a later Phase 255 plan (255-03) — this plan delivers the backend seam only, which is the declared scope.

## TDD Gate Compliance

- **Task 1:** RED commit `aca19e3f` (`test(255-02): …` — 2 of 4 tests failed) → GREEN commit `46d08f75` (`feat(255-02): …` — 4/4 pass). Sequence intact.
- **Task 2:** RED was authored by plan 255-01 (`trpc-router-screenshot.test.ts`, committed `c8cb9e36`); this plan's GREEN commit `e0d01f7a` flips Tests 4-6. The RED `test(...)` commit predates the GREEN `feat(...)` commit in git history — gate sequence satisfied.

## Self-Check: PASSED

- FOUND: `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` (modified)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/native/screenshot.display.test.ts` (created)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts` (modified)
- FOUND commit: `aca19e3f` (RED test)
- FOUND commit: `46d08f75` (GREEN Task 1)
- FOUND commit: `e0d01f7a` (GREEN Task 2)
- Tests: 10/10 GREEN (6 plan-01 screenshot + 4 new display-env)
- tsc: zero new errors attributable to 255-02
