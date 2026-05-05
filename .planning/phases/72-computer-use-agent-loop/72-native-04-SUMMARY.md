---
phase: 72-computer-use-agent-loop
plan: native-04
subsystem: computer-use / ui
tags: [computer-use, ui, desktop-viewer, base64-screenshot, native-arch, no-vnc, polling, trpc]
requirements: [CU-LOOP-05]
dependency_graph:
  requires:
    - 72-native-01 (captureScreenshot from native/index.js)
    - 71-05 (computerUseRouter file already shipped — additive append)
    - 66-* (P66 design tokens + GlowPulse motion primitive)
  provides:
    - LivDesktopViewer React component (replaces 71-02 react-vnc role)
    - shouldRenderImg / nextPollDelay pure helpers (exported, tested)
    - computerUse.takeScreenshot tRPC procedure
  affects:
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (httpOnlyPaths +1)
tech-stack:
  added: []  # D-NO-NEW-DEPS hard — zero new npm packages
  patterns:
    - "renderToString + grep for component invariants (RTL-absent precedent)"
    - "Pure-helper extraction for unit-testability (P67-04 D-25 / P71-02)"
    - "tRPC useQuery with refetchInterval for live polling"
    - "React.memo dispatcher + sub-components (snapshot/live/empty)"
key-files:
  created:
    - livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-desktop-viewer.tsx
    - livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-desktop-viewer.unit.test.tsx
  modified:
    - livos/packages/livinityd/source/modules/computer-use/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
decisions:
  - "Snapshot mode wins over live mode when both src and pollingMs are set"
  - "Empty placeholder fallback when src is malformed (T-72N4-03)"
  - "Backoff curve: baseMs * 2^n, clamped at 30s, defensive against negative/NaN"
  - "Live-mode runtime tests deferred to 72-native-07 UAT (real Mini PC X server)"
  - "Sentinel data-testids: liv-desktop-viewer-img, -loading, -error, -empty"
  - "Error threshold = 3 consecutive failures before banner + Retry"
metrics:
  duration_minutes: ~70
  task_count: 3
  file_count: 4
  test_cases: 27
  completed_date: "2026-05-05"
---

# Phase 72 Plan native-04: LivDesktopViewer + base64-PNG polling Summary

**One-liner:** Replaces the deprecated 71-02 react-vnc viewer with a base64-PNG `<img>` polling display fed by a new `computerUse.takeScreenshot` tRPC procedure, removing the websockify VNC dependency for D-NATIVE-* native X11 architecture.

## What shipped

### 1. `livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-desktop-viewer.tsx` (268 lines, NEW)

**Default export:** `LivDesktopViewer` (React.memo'd dispatcher).

**Prop shape (final, binding contract):**
```typescript
export interface LivDesktopViewerProps {
  src?: string;          // data:image/png;base64,… — snapshot mode
  pollingMs?: number;    // 1000 typical — live mode
  onError?: (err: Error) => void;
  className?: string;
}
```

**Mode resolution priority** (top-level dispatcher):
1. If `shouldRenderImg(src)` is true → `<SnapshotView>` (static `<img>`).
2. Else if `pollingMs > 0` → `<LiveView>` (tRPC `useQuery` + `refetchInterval`).
3. Else → `<EmptyView>` (passive placeholder, no crash).

This priority handles the T8b case: a malformed `src` falls through to EmptyView rather than feeding arbitrary content into `<img src>` (T-72N4-03 defense).

**Pure helpers (exported):**
```typescript
shouldRenderImg(src: string | null | undefined): boolean
// true iff src starts with 'data:image/png;base64,' AND has > 0 chars after
// the prefix. Validates the data-URL contract before <img src> assignment.

nextPollDelay(consecutiveErrors: number, baseMs: number): number
// 0 errors → baseMs; n errors → min(baseMs * 2^n, 30000).
// Defensive against negative / NaN inputs (normalised to 0).
```

**LiveView internals:**
- `trpcReact.computerUse.takeScreenshot.useQuery(undefined, { refetchInterval: nextPollDelay(consecutiveErrors, pollingMs), retry: false })`.
- `useEffect` increments `consecutiveErrors` on `query.isError`, resets on `query.isSuccess`.
- After 3 consecutive failures (`ERROR_THRESHOLD = 3`), renders the error banner (`data-testid="liv-desktop-viewer-error"`) with a Retry button that calls `query.refetch()` and clears the counter.
- Pre-first-frame state: `<GlowPulse color='cyan'><span>Connecting to desktop…</span></GlowPulse>` with `data-testid="liv-desktop-viewer-loading"`.
- All styling via P66 tokens — `var(--liv-bg-elevated)`, `var(--liv-border-subtle)`, `var(--liv-text-secondary)`, `var(--liv-accent-cyan)`. No hex literals.

### 2. `livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-desktop-viewer.unit.test.tsx` (224 lines, NEW)

**27 test cases** spanning 4 describe blocks:

- **shouldRenderImg (6 cases):** valid PNG data URL → true; short payload → true; empty/null/undefined → false; http(s) URL → false; wrong mime (jpeg/gif/text) → false; valid prefix + empty payload → false (T-72N4-03 mitigation).
- **nextPollDelay (5 cases):** 0 errors → baseMs; 3 errors → 8000 (exact); 20 errors → 30000 clamp; huge/MAX_SAFE_INTEGER → 30000; negative/NaN → baseMs.
- **renderToString (3 cases):** snapshot-mode render with `data-testid="liv-desktop-viewer-img"` and src round-trip; empty mode renders `data-testid="liv-desktop-viewer-empty"` with no live-mode artifacts; malformed `src` falls back to empty placeholder.
- **Source-text invariants (13 cases):** loading/error testid presence; uses `trpc.computerUse.takeScreenshot.useQuery`; passes `refetchInterval`; exports both pure helpers + the props type; wrapped in `React.memo`; NO hex literals (D-22); UX copy "Connecting to desktop…" appears EXACTLY ONCE; error threshold of 3; NO `@testing-library/react` import; NO `react-vnc` import (replaces deprecated 71-02 role); no console.* logging of base64.

**Status:** 27/27 pass under vitest jsdom. RTL-absent precedent (P25/30/33/38/62/67-04/68-03) preserved — no `@testing-library/react`, no `msw`, no new deps.

**Deferred RTL/runtime tests** (live-mode poll loop with real DOM lifecycle, error-threshold transition with fake timers, retry-clears-counter behavior) live behind the 72-native-07 UAT walk against the real Mini PC X server, where mocking nut-js + tRPC stubs in jsdom would be more brittle than a single real walk.

### 3. `livos/packages/livinityd/source/modules/computer-use/routes.ts` (+43 lines, MODIFIED)

**Added one tRPC procedure** to the existing `computerUseRouter`:

```typescript
takeScreenshot: privateProcedure.query(async () => {
  try {
    const shot = await captureScreenshot();
    return { base64: shot.base64, width: shot.width, height: shot.height, timestamp: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: `computer-use native module unavailable: ${message}`,
    });
  }
}),
```

- Auth: `privateProcedure` (existing `isAuthenticated` middleware) — same gate as the rest of this router.
- Failure mode (D-NATIVE-14): nut-js native binding unavailable on host platform → re-wrapped as `TRPCError` `SERVICE_UNAVAILABLE` so the UI can render the error banner with a clear message instead of a JS crash.
- `import {captureScreenshot} from './native/index.js'` — wired to 72-native-01's barrel.

Existing 71-05 procedures (`getStatus`, `startStandaloneSession`, `stopSession`) preserved byte-for-byte.

### 4. `livos/packages/livinityd/source/modules/server/trpc/common.ts` (+4 lines, MODIFIED)

Added `'computerUse.takeScreenshot'` to `httpOnlyPaths` so the React client routes the screenshot query through HTTP rather than WebSocket. Three reasons (matching the existing 71-05 sibling cluster reasoning):
- Base64 PNG response bodies are 50–200 KB — HTTP chunked encoding is friendlier than WS frame buffering for this size class.
- WS reconnect after `systemctl restart livos` shouldn't drop the polling cycle.
- Aligns with the existing 71-05 cluster (`computerUse.getStatus / .startStandaloneSession / .stopSession`).

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Snapshot mode wins when both `src` and `pollingMs` are set | Avoids racing two render paths; caller's explicit `src` takes precedence over implicit live polling. |
| Empty placeholder fallback for malformed `src` (T-72N4-03) | Refusing to render arbitrary content via `<img src>` is safer than crashing or feeding tampered bytes. |
| Backoff curve: `baseMs * 2^n` clamped at 30s | Matches widely-used React Query / fetch retry shapes. 30s ceiling means a stalled X server still retries periodically without UI freeze. |
| Sentinel testids namespaced with `liv-desktop-viewer-*` | Greppable across the codebase + lockable in source-text invariant tests. |
| Error threshold = 3 consecutive failures | Plan must-have. Three transient blips (network glitch / X server restart) shouldn't pop a banner; sustained failure should. |
| Live-mode DOM/runtime tests deferred to 72-native-07 UAT | jsdom + mocked tRPC + mocked nut-js would diverge from production behavior; the real Mini PC walk is the contract. Source-text invariants lock the wire shape in the meantime. |
| Sub-component split (SnapshotView / LiveView / EmptyView) | Lets renderToString test snapshot + empty modes without a TRPCProvider; only LiveView needs the provider, and only when the caller actually requests live mode. |
| `httpOnlyPaths` registration treated as Rule 2 deviation | The plan's `files_modified` listed routes.ts but not common.ts. Without the entry, mutations would route via WS and break the cluster's reconnect resilience guarantee — same correctness reasoning as the 71-05 sibling registration. Critical for live-mode polling to survive `systemctl restart livos`. |

## Sacred SHA Verification

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b  ✓ unchanged at all 3 task gates
```

## Verification Results

- [x] All 27 unit-test cases pass (`pnpm vitest run src/routes/ai-chat/tool-views/components/liv-desktop-viewer.unit.test.tsx`).
- [x] `pnpm --filter ui build` exits 0 (33.00s, 477 PWA precache entries).
- [x] `pnpm --filter livinityd typecheck` baseline preserved (361 → 358 errors, 3 fewer because parallel-wave 72-native-02 + 72-native-03 also landed during execution; routes.ts itself adds zero new errors).
- [x] Existing `routes.test.ts` (8 cases) still pass — no regression on 71-05 procedures.
- [x] Sacred SHA `4f868d31...` confirmed unchanged.
- [ ] Live-mode polling against real Mini PC X server — deferred to 72-native-07 UAT (cannot exercise on dev Windows; the entire D-NATIVE-14 platform-guard branch is the reason this plan ships graceful 503 fallback at all).

## Threat Model Mitigations Applied

| Threat ID | Mitigation status |
|-----------|-------------------|
| T-72N4-01 (Information Disclosure — screenshot may contain credentials) | Accepted per plan disposition. Authenticated user only. |
| T-72N4-02 (DoS — client polls at very low pollingMs) | Component default `pollingMs=1000` keeps under 1 req/sec. Server-side rate limit deferred to existing broker middleware (no new code in this plan). |
| T-72N4-03 (Tampering — malformed base64 in poll response) | `shouldRenderImg` validates data-URL prefix shape before `<img src>` assignment. Tested in T2a-T2e + T8b. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Added `computerUse.takeScreenshot` to httpOnlyPaths**

- **Found during:** Task 1 (writing the tRPC procedure)
- **Issue:** Plan's `files_modified` listed only `routes.ts` and the two UI files, but the existing 71-05 cluster registers all `computerUse.*` procedures in `httpOnlyPaths` (server/trpc/common.ts) so they survive WS reconnect after `systemctl restart livos`. Without this entry, the new procedure would silently route via WebSocket and break the same B-12 / RESEARCH.md Pitfall 5 guarantee documented for the siblings.
- **Fix:** Added one entry to `httpOnlyPaths` with a comment matching the 71-05 cluster's existing comment style.
- **Files modified:** `livos/packages/livinityd/source/modules/server/trpc/common.ts` (+4 lines)
- **Commit:** `cb665e94`

### Mode-resolution priority addition (T8b case)

The plan's must-have spec said "snapshot mode" applies when `src` is set. But what if `src` is set AND malformed? The plan didn't explicitly specify; it left T-72N4-03 as the threat. I resolved the ambiguity by treating malformed src the same as absent src — falls through to `pollingMs` check, then EmptyView. This preserves the threat-model promise (no arbitrary `<img src>`) and is covered by test T8b. Documented in the Decision Log above and in component JSDoc.

## Notes for Downstream Plans

- **72-native-05 (MCP `computer_screenshot` tool):** The same tRPC procedure body (try/catch around `captureScreenshot()`) is the canonical handler shape. The MCP tool can either share the procedure (preferred — single source of truth) or duplicate the try/catch — depends on how 72-native-05 wires its surface.
- **72-native-06 / 72-native-07 (UAT):** Live-mode walk steps:
  1. Deploy livos to Mini PC (`bash /opt/livos/update.sh`).
  2. Visit the standalone `/computer` route.
  3. Component should call `trpc.computerUse.takeScreenshot.useQuery({ refetchInterval: 1000 })` and re-render the `<img>` once per second.
  4. Verify network tab shows ~1 req/s for `/trpc/computerUse.takeScreenshot`.
  5. Manually `xrandr --output X --off` to break the X server briefly — UI should show error banner after 3 seconds.
- **Cleanup phase (TBD):** `liv-vnc-screen.tsx` (71-02) remains on disk per plan `<scope_guard>` ("DO NOT delete liv-vnc-screen.tsx"). A future cleanup phase removes it once all consumers migrate to LivDesktopViewer.

## Self-Check: PASSED

- File `livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-desktop-viewer.tsx` exists (268 lines)
- File `livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-desktop-viewer.unit.test.tsx` exists (224 lines)
- Commit `cb665e94` (Task 1 — tRPC procedure) exists in `git log --all`
- Commit `ca37e2a6` (Task 2 RED — failing tests) exists in `git log --all`
- Commit `d2795d6e` (Task 2 GREEN — implementation) exists in `git log --all`
- Sacred SHA `4f868d31...` unchanged
- All 27 vitest cases pass
- UI build exits 0
- livinityd typecheck baseline preserved (no new errors in routes.ts; 361 → 358 overall thanks to parallel-wave native-02/03 fixes)
