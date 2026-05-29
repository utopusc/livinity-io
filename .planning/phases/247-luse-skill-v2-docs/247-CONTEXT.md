# Phase 247: Luse skill set v2 — professional reference documentation - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Take the v43 Phase 242 minimum-viable Luse docs and turn `docs/luse/` into a production reference an AI can rely on for complex automation. Add the patterns/troubleshooting/limits layer that distinguishes "this tool exists" from "here's how to use it well."

**Direction:**
- New canonical files (agent-agnostic — all flow through `scripts/sync-luse-skills.sh` to 5 shims):
  - `docs/luse/PATTERNS.md` — 5-10 production patterns: screenshot-then-act, landmark-anchored clicks (not pixel coords), retry-with-screenshot-verify, multi-step wizard navigation, focus-before-type, modal dismissal, scroll-and-search.
  - `docs/luse/TROUBLESHOOTING.md` — failure modes + diagnostic steps (display gone away / X server not reachable / Luse MCP can't reach Redis / wrong DISPLAY env / window not focused / xdotool race conditions).
  - `docs/luse/ANTI-PATTERNS.md` — what NOT to do: brittle pixel coords without screenshot verify, fire-and-forget clicks without exit-criteria check, modifier-key combos that trigger desktop-shell shortcuts, sensitive-text via `computer_type_text` (use `computer_paste_text` + `isSensitive: true`).
  - `docs/luse/INTEGRATION-RECIPES.md` — one section per supported CLI agent (Claude Code / Aion CLI / OpenCode / Gemini / OpenClaw) — how to invoke luse tools idiomatically in each, including the per-agent shim location reminder.
  - `docs/luse/KNOWN-LIMITS.md` — DPI / scaling table, multi-monitor caveats, Wayland gaps, sandboxed-app limits (snap/flatpak isolation), root-only apps (gated).
- Update existing tool docs (`click.md`/`type.md`/`screenshot.md`/`key.md`/`scroll.md`) with cross-references to PATTERNS.md examples.
- New `docs/luse/CHEAT-SHEET.md` — single-page quick reference (one-line examples per tool).
- Run sync script — verify each of `.claude/skills/luse/`, `.aion/skills/luse.md`, `.opencode/skills/luse.md`, `.openclaw/skills/luse.md` picks up new content (sha256 marker drift detection).
- Optional: link Phase 248's `DISPLAY-LIFECYCLE.md` into the index if Phase 248 ships first.

**UAT:** Operator opens `.claude/skills/luse/PATTERNS.md` in editor — sees 5+ concrete patterns with real code examples. Operator opens `.aion/skills/luse.md` — sees the same patterns content with the AUTO-GENERATED FROM banner. Sync re-run reports `0 new / N updated / 0 unchanged` confirming all shims got the v2 docs.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Pattern picks (which 5-10 patterns) at Claude's discretion. Use Phase 242 docs + actual luse MCP tool surface + project memory on Liv AI failure modes to inform choices.

### v44 invariants
- D-V44-SACRED, D-V44-MINI-PC-ONLY apply if any deploy step touches the Mini PC (this phase is docs-only, so no deploy required).

</decisions>

<code_context>
## Existing Code Insights

Phase 242 shipped `docs/luse/` with per-tool docs + shim sync script. Phase 247 layers reference docs on top — no tool code changes. Codebase locations:
- `docs/luse/` (canonical docs)
- `scripts/sync-luse-skills.sh` (shim sync — hashes content into `.claude/skills/luse/`, `.aion/skills/luse.md`, `.opencode/skills/luse.md`, `.openclaw/skills/luse.md`, plus `.gemini/`)
- `livos/packages/livinityd/source/modules/computer-use/mcp/` (Luse MCP server — read for tool surface)

</code_context>

<specifics>
## Specific Ideas

Plan count estimate: 2 plans
1. 247-01 — Write the 6 new canonical docs (PATTERNS / TROUBLESHOOTING / ANTI-PATTERNS / INTEGRATION-RECIPES / KNOWN-LIMITS / CHEAT-SHEET) + cross-reference updates to existing per-tool docs.
2. 247-02 — Sync script verification: run `scripts/sync-luse-skills.sh`, verify each of 5 shim dirs picks up new content, sha256 marker drift check, commit shim deltas.

</specifics>

<deferred>
## Deferred Ideas

DISPLAY-LIFECYCLE.md cross-reference deferred to Phase 248 (which writes it).

</deferred>
