# Phase 248: Luse display lifecycle — create/list/kill displays + app placement - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Extend the Luse MCP server (Phase 241 registrar / Phase 242 docs surface) with display-lifecycle tools. AI can create isolated nested X servers (Xephyr default, Xvfb headless), launch any LivOS app inside a specific display, list active displays with running apps, and kill displays it created. Cleanup discipline + isolation guarantees enforce that an agent's experiments don't leak into the operator's main session.

**Direction:**
- New MCP tools registered in `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts`:
  - `computer_create_display({name?, mode: "xephyr" | "xvfb", width?: 1920, height?: 1080})` → `{display: ":N", name}`
  - `computer_list_displays()` → `[{display, name, mode, created_at, owner_session, running_apps: [...]}]`
  - `computer_kill_display({display})` → `{ok, killed_apps_count}` (only displays created by the calling session)
  - `computer_launch_app_in_display({display, app, args?})` → `{pid, app_name}` (resolves app via LivOS catalog like `computer_application`)
- Backend: spawn Xephyr (visible nested X server, default — operator can watch what AI does) or Xvfb (headless, for batch screenshots / no-display-needed workflows). Display numbers allocated from `:10` upward (avoid collision with system :0 / :1).
- Redis state: `luse:display:<display>` HSET (`owner_session`, `mode`, `created_at`, `name`, `width`, `height`); `luse:display:<display>:apps` LIST (running pids).
- Owner-scoped kill: D-V44-DISPLAY-OWNER-SCOPED — only the creator session can kill its own displays. Other sessions can `list` for awareness.
- AI guidance: new `docs/luse/DISPLAY-LIFECYCLE.md` (when-to-create, cleanup discipline, isolation guarantees, app-placement recipes). Re-syncs into shims via `scripts/sync-luse-skills.sh`.
- Auto-cleanup: TTL gc on idle displays (4h since last app activity → kill).
- Existing `computer_application` tool gets an optional `display` param so AI can target an existing display instead of always landing on `:1`.

**UAT:** AI asks `computer_create_display({mode:"xephyr"})` → returns display ID → `computer_launch_app_in_display({display, app:"firefox"})` → operator sees Firefox window in a NEW separate X server (not on main desktop) → AI takes screenshot of that display only → `computer_list_displays()` shows the display + running Firefox → `computer_kill_display({display})` → display + Firefox closed.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Xephyr spawn module structure, Redis client reuse (use existing pty-sessions style RedisClient pattern), display number allocator (start at :10, monotonic counter in Redis or in-memory map).

### v44 invariants locked
- D-V44-SACRED, D-V44-MINI-PC-ONLY, D-V44-CADDY-REUSE-226-04 (this phase doesn't touch Caddy — should be NA), D-V44-NO-ROOT-PTY
- D-V44-DISPLAY-XEPHYR-DEFAULT — Xephyr visible-nested default, Xvfb opt-in headless
- D-V44-DISPLAY-OWNER-SCOPED — only the creator session can kill its own displays

### Reuse, don't rebuild
- Phase 241 MCP registrar (`livos/packages/livinityd/source/modules/computer-use/mcp/server.ts`) — add new tool registrations, don't fork
- Phase 246 SessionManager owner_session pattern as reference for owner-scoped semantics
- Phase 246 TTL GC pattern as reference for the 4h idle-display sweep

</decisions>

<code_context>
## Existing Code Insights

- Phase 241 shipped the Luse MCP registrar: `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` + per-tool handlers in `tools.ts` or `tools/*.ts`.
- Phase 242 shipped per-tool docs at `docs/luse/`.
- Xephyr and Xvfb are external binaries — verify they're available on the Mini PC base image (apt-get install xserver-xephyr xvfb) before assuming they exist.
- Display allocation: typical Linux convention `:0`=primary, `:1`=secondary, `:10+` for nested.

</code_context>

<specifics>
## Specific Ideas

Plan count estimate: 4-5 plans
1. **248-01** — Backend display module: Xephyr/Xvfb spawn + Redis state (HSET + apps LIST + display number allocator).
2. **248-02** — MCP tool registrations: `computer_create_display`, `computer_list_displays`, `computer_kill_display`, `computer_launch_app_in_display` + optional `display` param on `computer_application`.
3. **248-03** — TTL GC for idle displays (4h since last app activity).
4. **248-04** — `docs/luse/DISPLAY-LIFECYCLE.md` + sync to all 4 shim dirs.
5. **248-05** — Mini PC deploy + automated probes + UAT checklist (deferred operator-walk if SSH unreachable, same pattern as 246-06).

</specifics>

<deferred>
## Deferred Ideas

Multi-monitor virtual display, screen-sharing of nested displays to web UI — deferred to v45+.

</deferred>
