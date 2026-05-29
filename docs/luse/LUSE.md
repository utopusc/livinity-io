# Luse — Computer-Use Capability for Liv AI Agents

Luse is the computer-use surface exposed inside Liv AI. Any agent dispatched by
AionUi (Aion CLI, Claude Code, OpenCode, OpenClaw, or any other MCP-speaking
client) can drive the host desktop session through five low-level tools:
`click`, `type`, `screenshot`, `key`, `scroll`.

This document is the canonical, agent-agnostic description. Per-agent skill
files are generated from this source by `scripts/sync-luse-skills.sh` — do
not hand-edit those shims.

## When to use Luse

Use Luse when the task requires direct interaction with a graphical
application on the LivOS host:

- Verify a UI state that no API exposes ("is the Wi-Fi toggle on?").
- Drive an app that has no headless / scriptable surface.
- Reproduce a user-reported visual bug.
- Walk a multi-step desktop flow (open Settings → click tab → toggle option).

Do NOT use Luse when:

- A REST / tRPC / CLI surface exists for the same action. Prefer the
  structured API — it is faster, deterministic, and leaves an audit trail.
- The task can be completed by editing config files. File I/O is cheaper
  than synthetic input.
- Secrets need to be entered. Use the clipboard path (paste via `key`
  `ctrl+v` after the secret is already in the clipboard) rather than
  feeding the secret through `type` arguments, which may be logged.

## Display lifecycle (Phase 248)

Beyond direct interaction with the host desktop, agents can create isolated
nested X servers (Xephyr — visible default, Xvfb — headless opt-in) to run
apps without disturbing the operator's main session. Four tools:
`computer_create_display`, `computer_list_displays`, `computer_kill_display`,
`computer_launch_app_in_display`. See [DISPLAY-LIFECYCLE.md](DISPLAY-LIFECYCLE.md)
for full workflow + cleanup discipline. Per-tool refs:
[create_display](tools/create_display.md) ·
[list_displays](tools/list_displays.md) ·
[kill_display](tools/kill_display.md) ·
[launch_app_in_display](tools/launch_app_in_display.md).

## Prerequisites

1. **Mini PC X session is running.** Luse drives an actual desktop, not a
   headless framebuffer. The session must already be up — Luse does not
   start one.
2. **Luse MCP server is active.** Registered automatically on first boot of
   `livinityd` via the Phase 241 seed orchestrator. Verify the server is
   reachable via the host's MCP catalog before issuing tool calls.
3. **Tools are X11 / xdotool / scrot based.** Wayland sessions are not
   supported. If a future LivOS release switches to Wayland, the Luse MCP
   server must be re-implemented; the tool surface described here will
   stay the same.
4. **The agent has tool-discovery on.** Luse tools appear under their
   canonical names; do not rely on aliases.

## The five tools

| Tool         | Purpose                                              | Docs                          |
| ------------ | ---------------------------------------------------- | ----------------------------- |
| `click`      | Mouse click at coordinates (left / right / middle).  | `docs/luse/tools/click.md`    |
| `type`       | Type a string into the focused window.               | `docs/luse/tools/type.md`     |
| `screenshot` | Capture the current screen (full or a region).       | `docs/luse/tools/screenshot.md` |
| `key`        | Send a keystroke or modifier combo.                  | `docs/luse/tools/key.md`      |
| `scroll`     | Scroll up / down / left / right at a point.          | `docs/luse/tools/scroll.md`   |

For a worked example covering screenshot → identify → click → verify, see
`docs/luse/LUSE-WORKFLOW.md`.

## Safety preconditions

These apply to every tool call:

- **Always screenshot before acting.** Coordinates from an older screenshot
  are unreliable — windows move, themes change, system modals appear.
- **Verify after acting.** A second screenshot confirms the action landed.
  If the second screenshot does not change in a way consistent with the
  intended action, stop and re-screenshot rather than retrying blindly.
- **Do not loop without a bound.** Agents driving Luse must cap retries.
  Unbounded click loops have historically wedged the desktop session.
- **Avoid leaking secrets in tool arguments.** `type` arguments are
  observable to the orchestrator and may be logged. For passwords / API
  keys, place the value in the clipboard via an out-of-band channel and
  paste via `key` `ctrl+v`.
- **Respect modifier shortcuts.** `key` combos like `alt+f4` close
  windows; `ctrl+alt+t` may open a new terminal. Confirm via screenshot
  that the side-effect was intended.

## Agent-agnostic guarantee

Every shim file generated under `.claude/skills/`, `.aion/skills/`,
`.opencode/skills/`, and `.openclaw/skills/` carries identical prose to
this document. Differences are confined to wrapper frontmatter and file
location. If you see drift, regenerate the shims with
`bash scripts/sync-luse-skills.sh` — never edit a shim by hand.
