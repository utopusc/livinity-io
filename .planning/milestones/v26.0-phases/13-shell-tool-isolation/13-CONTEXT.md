# Phase 13: Shell Tool Isolation - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

A user's terminal/shell invocations can never reach another user's device — unknown device IDs are rejected, and omitting a device ID routes safely to the user's local session.

**Scope:**
- Shell tool: when device_id param is supplied, verify user owns it via Phase 12's authorizeDeviceAccess before any dispatch
- Shell tool: when device_id is omitted, default routing goes to user's local livinityd session (NOT to another user's device)
- Cross-user device_id → reject with clear error
- Document ownership constraint in shell tool schema so AI won't hallucinate cross-user IDs

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Phase 12's authorizeDeviceAccess + recordAuthFailure are already in place — reuse them
- Shell tool is registered in nexus/packages/core/src/daemon.ts (ToolRegistry) — find it and add guard
- Local session = no device_id → execute locally on livinityd (existing behavior)

</decisions>

<specifics>
## Specific Ideas

**Success criteria (from ROADMAP):**
1. Explicit unowned device_id blocked before tunnel send, returns device_not_owned error
2. Omitted device_id executes on user's local livinityd session, never falls back to another user's device
3. Shell tool schema documents ownership constraint

**Implementation sketch:**
- Plan 13-01: Shell tool ownership guard — verify device_id ownership if present, document schema
- (Single-plan phase — shell tool isolation is tightly scoped)

</specifics>

<deferred>
## Deferred Ideas

- Per-tool granular permission (screenshot / files / shell as separate toggles) — v27.0
- Device sharing — v28.0

</deferred>
