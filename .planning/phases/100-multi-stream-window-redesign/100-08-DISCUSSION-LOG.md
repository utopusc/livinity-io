# Plan 100-08: SelfClaude Adoption + Per-WebApp MCP Routing — Discussion Log

> **Audit trail only.** Decisions are captured in `100-08-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-05-10
**Plan:** 100-08 (sub-plan of Phase 100 — multi-stream-window-redesign)
**Areas discussed:** Display strategy, Per-WebApp MCP wiring, Selfclaude adoption depth
**Reference studied:** https://github.com/utopusc/selfclaude (README v1.0)

---

## Display Strategy (root cause for Bug 1: vertical stream)

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Xvfb display `:1` | WebApps run on a separate Xvfb display launched by livinityd, leaving bruce's GNOME on `:0` untouched. Selfclaude-pattern. Solves IPC merge, window-size flag honored, no impact on host browsing. Adds Xvfb dependency + display lifecycle management. | ✓ |
| Kill host Chrome before each WebApp spawn | Stay on `:0`, but `pkill chrome` before spawning the new `--app=` window. Breaks bruce's interactive browsing every time a WebApp launches. Lower architectural change but high friction. | |
| Per-WebApp Xvfb display (`:10, :11, ...`) | Maximum isolation: each WebApp gets its own Xvfb display + Chrome process. Closest to selfclaude's container model on bare metal. More processes, more lifecycle to manage. | |
| Accept current state, prioritize other fixes | Defer the vertical-stream bug. Ship the per-WebApp MCP wiring (Bug 2) only. Vertical stream stays broken until v34. | |

**User's choice:** Dedicated Xvfb display `:1`
**Rationale:** Eliminates host-Chrome IPC merge that drops `--window-size`. Selfclaude-pattern adapted from container to bare-metal. Bruce's `:0` browsing stays untouched.

---

## Per-WebApp MCP Wiring (Bug 2: chat-to-bytebot scope routing)

| Option | Description | Selected |
|--------|-------------|----------|
| Spawn bytebot MCP child per WebApp | Use the existing `registerWebAppInstance` infra in `mcp-client-manager.ts`. window-manager.spawn registers, close deregisters. Tools namespaced as `mcp__bytebot:webapp:<wid>__*`. Chat surface routes by webappId → MCP child. Heaviest refactor but architecturally correct. | ✓ |
| Single host MCP + windowId injection | Keep one host bytebot MCP child. Chat surface always passes `windowId` param on every tool call. System prompt tells agent to use the right windowId. Less code, but agent can still get confused. | |
| Hybrid: shared MCP child + per-call scope hint | One MCP child but tool dispatch wraps each call with a windowId from chat-surface context. Halfway between A and B. Pragmatic but adds a routing layer hard to maintain. | |

**User's choice:** Spawn bytebot MCP child per WebApp
**Rationale:** Infrastructure (`registerWebAppInstance`, `PerWebAppMcpDescriptor`) already exists in `liv/packages/core/src/mcp-client-manager.ts` — built for this case but never wired. Architectural fix > behavioral patch.

---

## SelfClaude Adoption Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Adopt patterns, rewrite our layer | Study selfclaude's `input-dispatcher.js`, `mcp-server.js`, `agent-chat.js`. Reimplement the patterns in our codebase (TypeScript, our existing modules). No code import, no fork. Keeps LivOS architecture coherent. | ✓ |
| Spike-only — doc patterns, defer adoption | Read selfclaude, write a findings doc with patterns + gotchas, defer actual implementation to a later phase. Lowest risk but pushes the v33 ship date. | |
| Vendor selfclaude modules into LivOS | Fork `input-dispatcher.js`, `mcp-server.js` into `livos/packages/livinityd/source/modules/` (with TypeScript shim). Faster but creates a vendoring dependency. | |

**User's choice:** Adopt patterns, rewrite our layer
**Rationale:** v33 needs to ship; LivOS already has TypeScript modules in the relevant places (just not wired); vendoring would create a JS↔TS shim and divergent test infra; adoption preserves architectural coherence.

---

## Patterns identified from selfclaude README (informing CONTEXT decisions)

1. **Xvfb on isolated display + fluxbox WM** — selfclaude uses `:99` because their container has no host X server; we use `:1` because we have bruce's GNOME on `:0`.
2. **xdotool input chain** — `windowactivate --sync <wid> windowfocus --sync <wid>` then input verb without `--window` flag (works around Chrome's filter of synthetic XSendEvent input). LivOS already adopted in 100-07.3 — verified-equivalent.
3. **wid-bound x11vnc** — `x11vnc -id <wid>` per WebApp. LivOS shipped this in Phase 99-02; only DISPLAY changes from `:0` → `:1`.
4. **action_log + replay** — `{type, button, x, y, ts}` events with `min(ev.ts - prevTs, 2000)` ms inter-event sleep. Cross-check with our P96 teach-recorder shape; reconcile only if blocking.
5. **MCP via Streamable HTTP, single source-of-truth modules** — selfclaude's `src/mcp-server.js` shares tool implementations with the chat agent via direct module imports. Mirror this in our `bytebot-mcp-config` ↔ agent loop wiring.

## Claude's Discretion (planner figures out)

- Final tool namespacing pattern (e.g., `mcp__bytebot:webapp:<wid>__*` vs. `mcp__bytebot__webapp_<wid>_*`) — locked in 100-08-PLAN by reading `bytebot-mcp-config.buildBytebotConfig` shape.
- Whether to split 100-08 into multiple sub-plans (100-08-01, 100-08-02, ...) or one large 100-08-PLAN.
- fluxbox configuration specifics (keybindings file, theme).
- Whether host bruce's `:0` Chrome needs a separate `--user-data-dir` to avoid lock contention with `:1` WebApp Chromes (mitigation choice).

## Deferred Ideas (out of plan 100-08 scope)

- Streamable HTTP MCP transport for external Claude Code (selfclaude's `:8090/mcp` pattern) — interesting v34 capability.
- Full container migration of LivOS — v34+ rewrite project.
- Per-WebApp Xvfb display (`:10, :11, ...`) — rejected; revisit only if shared `:1` proves insufficient.
