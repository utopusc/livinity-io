---
phase: 167
plan: 167-02
subsystem: ui/cc-terminal
status: code-complete
date-completed: 2026-05-19
files:
  created:
    - livos/packages/ui/src/features/cc-terminal/terminal-ws-client.ts
    - livos/packages/ui/src/features/cc-terminal/terminal-ws-client.test.ts
  modified: []
acceptance:
  vitest: "13/13 passed (terminal-ws-client.test.ts) — 10 behavior + 1 robustness (invalid JSON) + 2 source-text invariants"
  tsc: "no errors in terminal-ws-client.ts"
  grep-invariants:
    - "BACKOFF_MS = [250, 500, 1000, 2000, 4000] — present"
    - "MAX_STDIN_BYTES = 64 * 1024 — present"
sacred-guards-verified:
  - "liv/packages/core/src/sdk-agent-runner.ts — NOT touched"
  - "D-09 luse-system-prompt.ts — NOT touched"
  - "Phase 161-02 agent-prompt-builder.ts — NOT touched"
  - "Phase 162-01 vault-scaffolder.ts — NOT touched"
  - "Phase 162-02 agent-session.ts — NOT touched"
  - "Phase 163 ws-agent.ts (server) — NOT touched"
  - "Phase 164 autonomous-scheduler — NOT touched"
  - "Phase 165-01 claude-runner/idle-reaper.ts — NOT touched"
  - "Phase 166 server-side cc-pty/* — NOT touched (read for protocol contract only)"
  - "D-NEW-DEPS-v35: package.json unchanged — no new deps added"
---

# Phase 167 Plan 167-02: WebSocket Client (CcPtyWsClient) Summary

CcPtyWsClient class shipped — browser-side WebSocket client speaking the Phase 166 `/ws/cc-pty` envelope protocol with attach/stdin/resize/detach uplink, base64-decoded stdout downlink, and 5-attempt exponential reconnect backoff.

## Summary

Implemented the browser-side WebSocket client (`CcPtyWsClient`) that the Plan 167-01 `<CcTerminal>` component will consume. The client:

- Connects to `/ws/cc-pty` and emits an `{type:'attach', sessionId}` envelope on open.
- Decodes incoming `{type:'stdout', payload}` frames via `atob()` and forwards to `opts.onStdout`.
- Forwards `{type:'attached'}` to `opts.onAttached`, `{type:'error', message}` to `opts.onError`, and surfaces `{type:'exit', code}` as an onError call (`session exited code=N`).
- Throttles outgoing stdin chunks > 64 KB client-side via `TextEncoder` byte-length check, mirroring the server's 1 MB hard cap with a tighter client headroom.
- Reconnects on unexpected close with backoff `[250, 500, 1000, 2000, 4000]` ms, max 5 attempts; 6th close triggers `onError('reconnect attempts exhausted')` + `onClose()`.
- `detach()` sets a flag that suppresses reconnects, sends `{type:'detach'}` then closes the WebSocket.
- Successful reconnect (open event fires after a failed attempt) resets the attempt counter to 0.

## Acceptance Evidence

- **vitest**: `pnpm --filter ui exec vitest run src/features/cc-terminal/terminal-ws-client.test.ts` → **13/13 passed** (10 behavior assertions + 1 invalid-JSON robustness + 2 source-text invariants).
- **tsc**: `pnpm --filter ui exec tsc --noEmit` → no errors for `terminal-ws-client.ts`.
- **Source-text invariants** (in-test):
  - `BACKOFF_MS = [250, 500, 1000, 2000, 4000]` literal present
  - `MAX_STDIN_BYTES = 64 * 1024` literal present

## Test Strategy Notes

Used the codebase's established **RTL-absent pattern (D-NO-NEW-DEPS)** — `@testing-library/react` is NOT installed, so the test stubs `globalThis.WebSocket` with a controllable `MockWebSocket` class that fires `__fireOpen()` / `__fireMessage(data)` / `__fireClose()` synchronously. Used `vi.useFakeTimers()` to drive backoff timing without real waits.

The `ws` Node package referenced in the plan is a server-side library — not appropriate inside jsdom. The fake-WebSocket approach matches existing test files like `use-webapp-agent.unit.test.tsx` that combine vitest mocks with source-text invariants.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test infrastructure mismatch — switched from `ws` mock-server to fake-WebSocket stub**

- **Found during:** Task 2 (test design)
- **Issue:** Plan specified `ws` package's WebSocketServer for tests. The `ws` package is Node-only server tooling; using it in a UI-package jsdom test would require adding `ws` as a devDependency, violating D-NEW-DEPS-v35 (package.json must not change). Additionally `@testing-library/react` is not installed (D-NO-NEW-DEPS) per multiple `*.unit.test.tsx` precedents in this repo.
- **Fix:** Replaced with `globalThis.WebSocket = MockWebSocket` swap + `vi.useFakeTimers()` for backoff. No new dependency added. Pattern mirrors the established RTL-absent pattern (e.g., `livos/packages/ui/src/components/highlighted-text.unit.test.tsx`).
- **Files modified:** terminal-ws-client.test.ts only (production code unchanged).

**2. [Rule 1 - Contract Bug] Server stdout envelope field is `data`, not `payload`**

- **Found during:** Task 1 (cross-checked against Plan 166-04 SUMMARY's shipped ws-handler.ts)
- **Issue:** Plan 167-02's `<interfaces>` block documented the server as emitting `{type:'stdout', payload: string}` — but the actually shipped Phase 166-04 ws-handler.ts (commit 6e9e2bc6, line 100) emits `{type:'stdout', data: chunk.toString('base64')}`. Same drift for `exited` vs `exit`. If the client decoded `env.payload` the terminal would see no output.
- **Fix:** Client reads `env.data` (matching server) and treats `type === 'exited'` (not `'exit'`) as the session-exit envelope. Source comment notes the divergence explicitly so a future reviewer doesn't "fix" it back to the doc.
- **Files modified:** terminal-ws-client.ts, terminal-ws-client.test.ts.

## Notes

- The 167-CONTEXT.md `<interfaces>` block at lines 109-138 was the source of the field-name drift; the source-of-truth is the shipped 166-04 ws-handler. This summary is the trail.
- Self-Check passed: file exists, vitest green.

## Self-Check: PASSED

- `terminal-ws-client.ts` exists at `livos/packages/ui/src/features/cc-terminal/terminal-ws-client.ts`
- `terminal-ws-client.test.ts` exists at same dir
- 13/13 vitest assertions pass
- No package.json changes
