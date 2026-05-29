# Luse Integration Recipes

All supported agents reach the same Luse MCP server inside livinityd —
only the discovery shape and the per-agent skill-shim format differ.
Each agent below either reads a hand-curated shim file checked in under
the agent's skill directory (regenerated from this repo's
`docs/luse/` canonical sources by `bash scripts/sync-luse-skills.sh`),
or discovers the Luse tool surface dynamically through MCP
tool-discovery at AionUi boot.

After editing any canonical doc under `docs/luse/`, re-run
`bash scripts/sync-luse-skills.sh` to refresh every shim that this
script writes to. The sync script hashes the canonical content into
each shim's `AUTO-GENERATED FROM` banner; sha256 marker drift is the
signal to regenerate.

## Claude Code

**Shim location:** `.claude/skills/luse/SKILL.md` (plus per-tool
`.claude/skills/luse/tools/*.md` references regenerated from
`docs/luse/tools/`).

**Invocation pattern:** Claude Code surfaces Luse tools via the MCP
protocol exactly as livinityd advertises them. The agent invokes a
tool through its standard tool-use block:

```jsonc
{
  "type": "tool_use",
  "name": "computer_screenshot",
  "input": {}
}
```

```jsonc
{
  "type": "tool_use",
  "name": "computer_click_mouse",
  "input": { "coordinates": { "x": 120, "y": 1024 }, "button": "left" }
}
```

**Per-agent note:** When the canonical docs under `docs/luse/` change,
re-run `bash scripts/sync-luse-skills.sh` to refresh
`.claude/skills/luse/` — Claude Code rereads the skill on next
agent boot.

## Aion CLI

**Shim location:** `.aion/skills/luse.md` (single concatenated file —
the Aion skill format prefers one file per skill name).

**Invocation pattern:** Aion reads the skill body into its system
prompt at session start; the agent then calls the underlying MCP tools
through the same livinityd-exposed names. The CLI-driven shape:

```text
$ aion run "open settings and toggle wi-fi off"
# Aion reads .aion/skills/luse.md → composes a screenshot-first plan →
# emits MCP tool_use calls for computer_screenshot / computer_click_mouse
# / etc. through the AionUi MCP transport.
```

<!-- Idiomatic invocation TBD when Aion CLI skill format locks in.
     Current shim is the Phase 242 placeholder shape. -->

**Per-agent note:** After editing `docs/luse/`, re-run
`bash scripts/sync-luse-skills.sh` to refresh `.aion/skills/luse.md`.
Aion reloads skills on the next `aion run` invocation; no daemon
restart required.

## OpenCode

**Shim location:** `.opencode/skills/luse.md` (single file, same shape
as the Aion shim).

**Invocation pattern:** OpenCode is also MCP-native — the skill file
seeds the agent's prompt with the patterns and tool inventory; tool
calls go through livinityd's MCP transport.

```text
$ opencode "drive the wi-fi toggle off via the Settings app"
# OpenCode loads .opencode/skills/luse.md → emits MCP tool calls for
# the canonical computer_* tool names.
```

<!-- Idiomatic invocation TBD when OpenCode skill format locks in.
     Current shim is the Phase 242 placeholder shape. -->

**Per-agent note:** Re-run `bash scripts/sync-luse-skills.sh` after
editing the canonical docs. OpenCode reloads skills on the next
command invocation.

## Gemini

**Shim location:** none — Gemini discovers Luse via MCP tool-discovery
on AionUi boot (Phase 242 D-242-C).

**Invocation pattern:** The Gemini agent enumerates available MCP
tools at session start and binds the `computer_*` handlers directly
from livinityd's advertised tool list. No skill file mirrors this
documentation — the agent works from the tool descriptions baked into
the MCP server's schema.

```text
# Gemini session start → MCP tool-discovery handshake →
# computer_screenshot, computer_click_mouse, computer_type_text,
# computer_paste_text, computer_press_keys, computer_scroll,
# computer_application, computer_wait become available as native tools.
```

<!-- Idiomatic invocation TBD when Gemini agent invocation format
     locks in for LivOS. Today the agent uses the MCP-native tool-use
     shape on every model turn. -->

**Per-agent note:** Because Gemini has no skill file, the
documentation in this repo informs the operator but does not flow
into the agent. If a future phase needs Gemini to receive the
PATTERNS / TROUBLESHOOTING content, add a sync target to
`scripts/sync-luse-skills.sh` — this is currently an explicit
non-goal per Phase 242 D-242-C.

## OpenClaw

**Shim location:** `.openclaw/skills/luse.md` (single file, same shape
as the Aion / OpenCode shims).

**Invocation pattern:** OpenClaw runs inside the Liv AI desktop shell;
the skill file feeds the agent's system prompt, and tool calls route
through the AionUi MCP transport into livinityd.

```text
# Inside the OpenClaw desktop chat:
> drive the wi-fi toggle off via the Settings app
# OpenClaw loads .openclaw/skills/luse.md → emits computer_screenshot
# then computer_click_mouse / computer_application calls.
```

<!-- Idiomatic invocation TBD when OpenClaw skill format locks in.
     Current shim is the Phase 242 placeholder shape. -->

**Per-agent note:** Re-run `bash scripts/sync-luse-skills.sh` after
editing the canonical docs. OpenClaw rereads skills on every new
agent session.
