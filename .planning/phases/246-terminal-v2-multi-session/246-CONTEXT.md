# Phase 246: Terminal v2 — multi-session + reattach + TTL GC - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Take the v43 Phase 243 single-session MVP terminal and ship the v44 production version: multiple named tabs in one dock window, each session survives browser reload, idle sessions auto-collect at 24h, admin "kill session by id" UI.

**Direction:**
- **Multi-session UI:** xterm.js panel grows a tab bar at top (one tab per session). "+" button creates a new session. Right-click tab → "Rename" / "Close". Session list panel (sidebar) shows all sessions with last-active timestamps.
- **Redis-backed scrollback:** per-session ring buffer at `livos:pty:session:<id>:scrollback` LIST (LTRIM to 10000 lines). Server writes every output chunk to the ring; client reads it on reattach.
- **Reload-survive reattach:** session ID stored in `localStorage['livos.v44.terminal.session.<tab-id>']`. On page load, UI tries `wss://.../livos/terminal/ws?attach=<session-id>`; livinityd looks up Redis metadata + scrollback, sends `{ type: "reattached", sessionId, scrollback: [...lines] }` then resumes live stream.
- **TTL GC:** new cron-like timer in livinityd: every 1h, scan `livos:pty:session:*`, kill PTY processes whose `lastAttachAt` is > 24h. Admin can override per-session TTL.
- **Admin kill UI:** new "Active terminals" section in LivOS Settings → System. Lists all sessions across all browser tabs (per-user when v45 multi-user lands; v44 still single-user). Kill button next to each.
- **Backward compat:** existing v43 single-session API preserved; v2 multi-session API is opt-in via UI tab bar. Feature flag stays `livos:v43:terminal_panel` (no separate v44 flag — v44 is a UI/UX evolution, not a new feature).
- D-V43-NO-ROOT-PTY + D-V43-PER-USER-READY carried forward.

**UAT:** Operator opens Terminal dock entry → 1 session. Click "+" → 2nd tab. Type `whoami` in each (different sessions). Reload browser → both tabs reattach with scrollback. Open new browser → admin UI shows 2 active sessions. Click "kill" → tab in original browser shows session-ended notice.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Locked invariants (v44 PROJECT.md)
- D-V44-SACRED, D-V44-MINI-PC-ONLY, D-V44-CADDY-REUSE-226-04, D-V44-NO-ROOT-PTY
- D-V44-TERMINAL-SCROLLBACK-RING (10000-line Redis ring per session)

</decisions>

<code_context>
## Existing Code Insights

Builds on Phase 243 single-session terminal MVP. Look at `livos/packages/livinityd/source/modules/terminal/` (or whichever module owns the v43 PTY WebSocket) plus the xterm.js panel in `livos/packages/ui/`. Caddy routing reuses Phase 226-04 emitter for the `/livos/terminal/ws` path. Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

Plan count estimate: 5-6 plans (backend session manager refactor + WS protocol extension + scrollback + TTL GC + UI tab bar + admin kill + Mini PC deploy + UAT).

</specifics>

<deferred>
## Deferred Ideas

Per-user session scoping deferred to v45 multi-user; v44 stays single-user.

</deferred>
