---
phase: 13-shell-tool-isolation
plan: 01
subsystem: nexus/daemon + livos/devices
tags: [shell-tool, local-isolation, reserved-names, schema-hardening, phase-13]
requirements_completed: [SHELL-01, SHELL-02]
requirements_partial: false
dependency_graph:
  requires:
    - Phase 12 authorizeDeviceAccess gate (existing, unchanged)
    - ToolRegistry.register overwrite-by-default semantics
  provides:
    - RESERVED_TOOL_NAMES guard on /api/tools/register (409 on collision)
    - Frozen local shell parameter contract (no device_id escape hatch)
    - AI-readable ownership constraint in both shell tool descriptions
  affects:
    - Phase 14 (Device Session Binding) — shell proxy tools will re-register on device reconnect under the new session; description stays the same
    - Phase 15 (Device Audit Log) — recordAuthFailure still fires from device-bridge.ts on cross-user shell attempts
tech-stack:
  added: []
  patterns:
    - "ReadonlySet<string> for immutable reserved-name lookup"
    - "HTTP 409 Conflict semantics for namespace reservation (not 400/403)"
    - "Inline phase markers (`Phase 13 SHELL-01/02`) for cross-file traceability"
key-files:
  created: []
  modified:
    - nexus/packages/core/src/daemon.ts
    - nexus/packages/core/src/api.ts
    - livos/packages/livinityd/source/modules/devices/device-bridge.ts
decisions:
  - "Hardcoded RESERVED_TOOL_NAMES set in api.ts (not imported from tool-registry.ts TOOL_PROFILES) — explicit security contract, minimal blast radius"
  - "Schema layer documents the constraint; Phase 12 authorizeDeviceAccess remains the ACTUAL runtime enforcer (not duplicated here)"
  - "Kept `device_id` literal in comment/description strings (as documentation) — only the parameter LIST is frozen, not the word appearing anywhere"
metrics:
  duration_minutes: 3
  completed_date: 2026-04-24
---

# Phase 13 Plan 01: Shell Tool Isolation Summary

Closed the shell-tool isolation boundary by freezing the local shell parameter contract, documenting ownership constraints in both local and device shell tool descriptions, and adding a RESERVED_TOOL_NAMES guard to `/api/tools/register` to prevent external callers from clobbering built-in local tools via `ToolRegistry.register`'s overwrite-by-default semantics.

## What Was Changed

### `nexus/packages/core/src/daemon.ts` (Task 1)
- Replaced the local shell tool description with an explicit LOCAL-ONLY contract that directs agents to `device_<deviceId>_shell` proxies for remote execution.
- Added an inline `Phase 13 SHELL-02` comment above the registration block documenting why the parameter list must not grow a `device_id`.
- Parameter list frozen to `{cmd, timeout}` (no behavior change; description strengthened).

### `nexus/packages/core/src/api.ts` (Task 2)
- Added a module-level `RESERVED_TOOL_NAMES: ReadonlySet<string>` containing all built-in local tool names (`shell`, `docker_*`, `pm2`, `files*`, `web_search`, `scrape`, messaging, memory, etc.).
- Added a reserved-name guard inside `/api/tools/register` that returns **HTTP 409** with `error: 'tool_name_reserved'` on collision, before any tool construction or registration.
- Device proxy tools use the `device_<deviceId>_<toolName>` convention and will never collide; the guard only triggers on adversarial/misconfigured registrations.

### `livos/packages/livinityd/source/modules/devices/device-bridge.ts` (Task 3)
- Replaced the `DEVICE_TOOL_SCHEMAS.shell` description with an ownership-aware string stating that the tool is bound to ONE owned device, that cross-user targeting is impossible (server-side authorize gate), and that no `device_id` parameter should be passed (device is implicit in tool name).
- Added inline `Phase 13 SHELL-01` marker for traceability.
- Phase 12 wiring (authorizeDeviceAccess import at line 12, callbackUrl expectedUserId propagation at line 245, executeOnDevice gate at line 322) unchanged.

## Invariant Grep Audit

| Check | Description | Expected | Actual | Status |
| ----- | ----------- | -------- | ------ | ------ |
| A | Local shell parameter contract frozen to `cmd` + `timeout` only (no `device_id`/`deviceId` param entries) | Exactly 2 param name lines: `cmd`, `timeout` | 2 lines: `cmd`, `timeout` | PASS |
| B | Reserved-name guard precedes `toolRegistry.register(tool)` call | guard_line < register_line | 936 < 960 | PASS |
| C | `RESERVED_TOOL_NAMES` set includes `'shell'` | Present | Present | PASS |
| D1 | Device shell description mentions "device_id parameter" | 1 | 1 | PASS |
| D2 | Device shell schema has zero `name: 'device_id'` param entries | 0 | 0 | PASS |
| E1 | `authorizeDeviceAccess` present in device-bridge.ts (Phase 12 gate) | ≥1 callsite | 1 callsite (line 322) + 1 import + 3 comment refs | PASS |
| E2 | `expectedUserId=${encodeURIComponent(userId)}` preserved in callbackUrl | 1 | 1 | PASS |
| F | `Phase 13 SHELL` markers traceable across both repos | ≥4 | 4 | PASS |
| G1 | `nexus/packages/core` typecheck — no new errors in daemon.ts / api.ts | 0 | 0 | PASS |
| G2 | `livos/packages/livinityd` typecheck — no new errors in device-bridge.ts | 0 | 0 | PASS |
| H | Optional curl smoke test of 409 behavior against live Nexus | 409 (if running) | No local instance | SKIP |

## Verification Results

- **TypeScript (nexus/packages/core):** `npx tsc --noEmit -p packages/core` — 0 errors introduced in `daemon.ts` or `api.ts` by Phase 13 edits.
- **TypeScript (livos/packages/livinityd):** `npx tsc --noEmit` — 0 errors introduced in `device-bridge.ts` by Phase 13 edits.
- **Runtime:** No runtime smoke test executed (no local Nexus instance); grep-level evidence confirms the guard path is in place before registration.

## Deviations from Plan

**Minor plan-count imprecisions (no code deviation, informational only):**

1. **Rule-N/A: Plan count off-by-one for `device_<deviceId>_shell` in daemon.ts.** Plan expected grep count of exactly 1, actual is 2. Reason: the plan's EXACT required block specifies the literal in BOTH the comment block ("the per-device proxy tool `device_<deviceId>_shell`") AND the description string. Both matches come directly from the plan's verbatim content, so this is a plan internal inconsistency, not a code deviation.
2. **Rule-N/A: Plan count off-by-one for `RESERVED_TOOL_NAMES` in api.ts.** Plan expected 3 occurrences ("1 definition + 1 `Set` literal + 1 `.has(name)` check"), actual is 2. The `Set` literal IS the definition (same line), so only 2 references exist (`const RESERVED_TOOL_NAMES` + `.has(name)`). Both are functional and required; the count expectation was imprecise.
3. **Rule-N/A: Plan count off-by-three for `authorizeDeviceAccess` in device-bridge.ts.** Plan expected 2 (import + callsite); actual is 5 (import + callsite + 3 comment references, including my new Phase 13 comment and two pre-existing Phase 12 comments at lines 173 and 247). The load-bearing call at line 322 and import at line 12 are both preserved; comment references are cosmetic.
4. **Rule-N/A: `device_id` occurrences in daemon.ts.** Plan done-criteria said "zero `device_id` occurrences." Actual: 2 occurrences, both in the plan's own verbatim-specified content (one in the SHELL-02 comment explaining the freeze rationale, one in the `cmd` parameter description). The PARAMETER LIST is frozen (no `name: 'device_id'`), which is the load-bearing invariant.

No code was modified to paper over these count discrepancies — each is a direct consequence of executing the plan verbatim. **No deviation Rules (1–4) were triggered during execution.** No Auto-fixes, no architectural changes, no blockers, no auth gates.

## Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Harden local shell tool description (daemon.ts) | `4f5becf` |
| 2 | RESERVED_TOOL_NAMES guard on /api/tools/register (api.ts) | `25add04` |
| 3 | Device shell proxy ownership description (device-bridge.ts) | `7264b81` |
| 4 | End-to-end invariant grep audit + typecheck | (verification only — no commit) |

## Security Posture After Phase 13

Three independent defenses now guard the shell tool isolation boundary:

1. **Schema layer (Tasks 1, 3):** Both local and device shell descriptions are self-documenting — agent cannot "accidentally" hallucinate a cross-user shell call because the descriptions forbid it.
2. **Parameter contract layer (Task 1):** Local shell parameters are frozen to `{cmd, timeout}`. The inline SHELL-02 comment ensures future editors see the freeze rationale before attempting to add a device routing parameter.
3. **Registration boundary layer (Task 2):** `/api/tools/register` rejects any attempt to register a tool whose name collides with the built-in local set — the ToolRegistry.register overwrite loophole is closed.
4. **Runtime enforcement (Phase 12, unchanged):** `authorizeDeviceAccess` in `DeviceBridge.executeOnDevice` remains the actual ownership gate for `device_<id>_*` proxy tool calls. Phase 13 does not modify it; it only hardens the surrounding defenses.

## Known Stubs

None — this plan hardens existing code paths only. No placeholder data, no TODOs, no disconnected UI wiring.

## Self-Check: PASSED

- [x] `nexus/packages/core/src/daemon.ts` contains `Phase 13 SHELL-02` marker (grep count 1)
- [x] daemon.ts local shell parameter list is `{cmd, timeout}` only (grep A)
- [x] `nexus/packages/core/src/api.ts` contains `RESERVED_TOOL_NAMES` set with `'shell'` (grep C)
- [x] api.ts `/api/tools/register` returns 409 with `tool_name_reserved` on collision (grep visible at lines 937–938)
- [x] api.ts guard is at line 936 < `toolRegistry.register(tool)` at line 960 (grep B)
- [x] `livos/packages/livinityd/source/modules/devices/device-bridge.ts` contains `Phase 13 SHELL-01` marker and ownership description (grep D1)
- [x] device-bridge.ts has no `device_id` parameter entries in shell schema (grep D2 = 0)
- [x] device-bridge.ts retains Phase 12 `authorizeDeviceAccess` gate and callbackUrl expectedUserId wiring (grep E)
- [x] TypeScript compiles with zero new errors in Phase 13 files (grep G1, G2 = 0)
- [x] Commits `4f5becf`, `25add04`, `7264b81` all present in `git log --oneline`
