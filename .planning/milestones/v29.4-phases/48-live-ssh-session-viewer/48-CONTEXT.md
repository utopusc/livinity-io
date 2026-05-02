# Phase 48: Live SSH Session Viewer — Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true)

<domain>
## Phase Boundary

Admin can watch live SSH session activity on the Mini PC and one-click-ban a malicious-looking source IP via cross-link into Phase 46's manual ban modal — closing the operator-loop from observation to action.

**Requirements:** FR-SSH-01, FR-SSH-02

**Success Criteria (5):**
1. Server Management → Security → SSH Sessions sub-section. WebSocket `/ws/ssh-sessions` streams live `journalctl -u ssh -o json -f --since "1 hour ago"` events filtered to `_SYSTEMD_UNIT === "ssh.service"`. Real-time timestamps + messages + extracted IPs.
2. Each row's IP column has click-to-copy button AND click-to-ban button. Click-to-ban opens Phase 46 FR-F2B-03 manual ban modal pre-populated with that IP and `LOCK ME OUT` self-ban check active.
3. 5000-line ring buffer (mirror Phase 28). 4px scroll-tolerance auto-disables live-tail with explicit "Resume tailing" button.
4. `/ws/ssh-sessions` enforces `adminProcedure` RBAC. Reject non-admin handshake with WS close code 4403 (mirror v26.0 `authorizeDeviceAccess`).
5. NO geo-IP / `maxmind` dep. Raw IP + click-to-ban gives 80% of value (geo deferred to FR-SSH-future-01 / v30+).

**Depends on:** Phase 46 ✅ (click-IP→ban cross-link routes to FR-F2B-03 ban-ip-modal pre-populated)

</domain>

<decisions>
## Implementation Decisions

**Locked decisions:**
- D-NO-NEW-DEPS: 0 new deps. `journalctl` already on Mini PC. No `maxmind` for v29.4 (deferred to v30+).
- D-NO-SERVER4: Mini PC only.
- Sacred file MUST NOT be touched.

**Architecture (from v29.4-ARCHITECTURE.md):**
- New backend module: `livos/packages/livinityd/source/modules/ssh-sessions/` — small (3-file shape: index.ts + journalctl-stream.ts + ws-handler.ts).
- WebSocket endpoint: `/ws/ssh-sessions` (mirror `/ws/docker/logs` from Phase 28).
- Stream: `child_process.spawn("journalctl", ["-u", "ssh", "-o", "json", "--follow", "--since", "1 hour ago"])` with line-split → JSON.parse → broadcast.
- IP extraction: regex on MESSAGE field (e.g., `Failed password for invalid user X from <IP>`).
- 5000-line ring buffer + 4px scroll-tolerance — mirror Phase 28 cross-container logs aggregator.
- `adminProcedure`-equivalent gate at WS handshake (JWT auth + role check); close code 4403 for non-admin.
- ENOENT graceful degrade if `journalctl` binary missing (similar to Phase 46 `who -u`).

**UI:**
- New tab inside Phase 46's `routes/docker/security/` directory: `ssh-sessions-tab.tsx` (or sub-section).
- xterm-style terminal feel? OR table view? Pattern map will decide; table view recommended for click-to-ban affordance.
- Click-to-ban cross-link: imports Phase 46's `ban-ip-modal.tsx` and pre-populates IP via prop or context.
- Ring buffer: virtualized list (mirror Phase 28 — no react-window dep).

**httpOnlyPaths additions:** `/ws/ssh-sessions` is a WebSocket endpoint (NOT tRPC), so doesn't need httpOnlyPaths. Express WebSocket route registration only.

</decisions>

<code_context>
## Existing Code Insights

- Phase 28 cross-container Logs WS aggregator (`/ws/docker/logs`) — direct analog. Multi-tab xterm-style. Color stripe + grep + severity classifier + 5000-line ring buffer + 4px scroll tolerance. Phase 48 mirrors this pattern but for SSH journalctl events instead of Docker container logs.
- Phase 46 fail2ban-admin module shape (5-file pattern). Phase 48 simpler (3 files).
- v26.0 `authorizeDeviceAccess` middleware for RBAC at WS handshake.
- Phase 46 `ban-ip-modal.tsx` accepts pre-populated IP — Phase 48 cross-links into this.
- Phase 46 `active-sessions.ts` `who -u` parser — analog for journalctl JSON line parsing pattern.

</code_context>

<specifics>
## Specific Ideas

- Plan 48-01: Backend ssh-sessions module (journalctl-stream + ws-handler + ENOENT degrade) + ring buffer logic + adminProcedure RBAC gate + close-code-4403 + unit tests
- Plan 48-02: UI ssh-sessions-tab.tsx (table view) + click-to-copy + click-to-ban cross-link to Phase 46 ban-ip-modal + 4px scroll-tolerance + Resume-tailing button + tab registration in Phase 46's security section
- Plan 48-03: test:phase48 npm script + 48-UAT.md + integration test (mocked journalctl spawn returning fixture lines)

Test harness: bare tsx + node:assert/strict.

</specifics>

<deferred>
## Deferred Ideas

- Geo-IP / ASN enrichment via `maxmind` — FR-SSH-future-01 (v30+).
- `journalctl --output=json-pretty` for large-payload events (current `--output=json` NDJSON is sufficient).
- Multi-tab SSH session viewer (one Mini PC only for v29.4 — multi-host journalctl deferred).

</deferred>
