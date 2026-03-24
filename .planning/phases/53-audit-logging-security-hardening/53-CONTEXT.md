# Phase 53: Audit Logging + Security Hardening - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds audit logging for all remote tool executions and security hardening (dangerous command blocklist, agent runs as user). This is the final phase — wraps the working system with accountability and safety. After this phase, all 36 v14.0 requirements are complete.

</domain>

<decisions>
## Implementation Decisions

### Audit Logging — Agent Side
- Every tool execution logged locally to `~/.livinity/audit.log` (append-only, JSON lines format)
- Log entry: { timestamp, toolName, params (truncated), success, duration, error? }
- Also send audit events back to LivOS through the relay (new message type: `device_audit_event`)
- Agent emits audit event after each tool execution completes

### Audit Logging — Relay Side
- Relay passes `device_audit_event` from device to LivOS tunnel (same pass-through pattern as tool_result)
- No relay-side storage — relay is a conduit only

### Audit Logging — LivOS Side
- DeviceBridge receives audit events, stores in Redis list: `livos:devices:{userId}:{deviceId}:audit`
- Audit entries: { timestamp, toolName, params, success, duration, deviceId, deviceName }
- Keep last 1000 entries per device (LTRIM after RPUSH)
- New tRPC route: `devices.auditLog` — query returns paginated audit entries for a device
- Add to httpOnlyPaths

### Audit Logging — UI
- Add "Activity" tab or section to the device detail drawer in My Devices panel
- Show recent operations in a chronological list: timestamp, tool name, success/failure badge, duration
- Expandable rows to see parameters
- Auto-refresh every 10 seconds (same as device list)

### Dangerous Command Blocklist — Agent Side
- Configurable blocklist in `~/.livinity/config.json` (created on setup)
- Default blocklist patterns (regex):
  - `rm\s+-rf\s+/` (recursive delete root)
  - `mkfs\.` (format disk)
  - `dd\s+if=` (raw disk write)
  - `shutdown` / `reboot` / `halt` / `poweroff`
  - `:(){ :|:& };:` (fork bomb)
  - Windows: `format\s+[a-z]:` / `del\s+/s\s+/q\s+c:\\` / `reg\s+delete.*HKLM`
- Shell tool checks command against blocklist BEFORE execution
- Blocked commands return error result: { success: false, error: "Command blocked by security policy: [pattern]" }
- User can customize blocklist via config file (add/remove patterns)

### Agent Runs as User
- Agent process inherits the OS user context (whoever runs `livinity-agent start`)
- Document this in the agent's --help output and status command
- No privilege escalation — agent cannot sudo/runas without user explicitly running it as root/admin
- Status command shows current user: `Running as: {username}`

### Claude's Discretion
- Exact audit log format details beyond minimum fields
- Blocklist regex specifics beyond the examples listed
- UI layout for audit log display

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent/src/tools/shell.ts` — Where to add blocklist check before spawn
- `agent/src/connection-manager.ts` — Where to emit audit events after tool execution
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` — Add audit event handler
- `livos/packages/livinityd/source/modules/devices/routes.ts` — Add auditLog route
- `livos/packages/ui/src/routes/my-devices/index.tsx` — Add audit section to device detail

### Established Patterns
- Redis list operations: RPUSH + LTRIM for capped lists
- tRPC query with pagination (offset/limit)
- JSON lines for log files (one JSON object per line)
- Regex-based input validation patterns

### Integration Points
- Agent: shell.ts (blocklist check), connection-manager.ts (audit emit), cli.ts (user display)
- Relay: protocol.ts + index.ts (pass-through audit events)
- LivOS: device-bridge.ts (audit storage), routes.ts (audit query), UI (audit display)

</code_context>

<specifics>
## Specific Ideas

- Audit log should be useful for debugging — when the AI does something wrong, the user can see exactly what commands were run
- The blocklist should err on the side of safety — it's easier to remove a false positive than recover from `rm -rf /`
- Running as user is a feature, not a limitation — document it positively

</specifics>

<deferred>
## Deferred Ideas

- Audit log persistence to PostgreSQL (currently Redis-only, capped at 1000) — v14.1
- Audit log export (CSV/JSON download) — v14.1
- Per-command confirmation for destructive operations — v14.1
- Audit log alerts/notifications — v14.1

</deferred>
