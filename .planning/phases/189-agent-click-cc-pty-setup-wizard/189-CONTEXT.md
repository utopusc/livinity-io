# Phase 189: Agent Click → CC PTY + Chat-Based Setup Wizard

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Operator literal spec 2026-05-20 + Hermes Agent + OpenClaw OS research (`research/v38_2_hermes_openclaw_findings.md`)
**Wave:** 2 (depends on Phase 188 Add Modal + on-disk artifacts)

<domain>
## Phase Boundary

Wire the operator's exact agent flow: click agent in sidebar → right pane mounts `<CcTerminal>` with Claude Code running in `cwd = ~/liv/items/<agentName>/`. On FIRST open (detected by `.agent/config.json.setup_done === false`): Claude runs an interactive chat-based setup wizard that asks the operator for MCPs, tasks, schedule, and tool permissions, then writes answers to `.agent/config.json` + appends to `claude.md`. After setup, normal CC chat continues. Every session writes `<agentName>/.agent/sessions/<runId>.md` capturing what the agent did + learned.

**Research-informed enhancements (from Hermes + OpenClaw, applied carefully to NOT break operator spec):**
- **Conversation starter chips:** when setup completes (post-wizard), display 4 clickable starter prompts above the composer ("Schedule a daily summary", "Build me a simple script", "Watch this folder", "Help me explore my vault"). OpenClaw `EmptyAgentHero` pattern. (Pattern #3 from research)
- **NO inline ToolTimeline component:** the CC PTY natively shows tool calls in its stdout — adding a custom timeline overlay is feature creep. Operator hasn't asked for it. Defer to v38.3 if needed.
- **NO slash command menu:** Claude Code already supports `/` natively via its own CLI — exposing a LivOS-side slash menu is duplicate. Skip.
- **NO auto-title:** operator's spec is "user types name in Add Modal" (Phase 188). Auto-title contradicts that. Skip.

**Phase 189 sonu:**
- Operator clicks Agent in `<SidebarTree>` → `handleItemSelect` for type='agent' triggers PTY mount in right pane
- Right pane currently mounts `<AgentDetail>` (Phase 175-04 — form-based). REPLACE with `<AgentTerminalPane>` (NEW) which composes:
  - PTY area: `<CcTerminal>` keyed on `liv-agent-<agentId>` tmux session, cwd `~/liv/items/<agentName>/`
  - Footer chips (only on first-open or empty-state): 4 conversation starter chips
- On FIRST open (`.agent/config.json.setup_done === false`):
  - PTY spawns with `claude --append-system-prompt "<setup-wizard-system-prompt>"` — the wizard prompt instructs Claude to:
    1. Greet operator by name + agent name
    2. Ask "Which MCP servers should you have access to?" (Claude reads available MCPs from `liv:mcp:*` Redis via existing `mcp-router.list`)
    3. Ask "What tasks will you do?" — operator describes
    4. Ask "Do you want a schedule (e.g. every morning at 9am) or manual triggers only?"
    5. Ask "Any tool restrictions?" — default = all enabled
    6. Confirm summary, then write `.agent/config.json` (via a built-in MCP tool `agent_config_set` exposed only during setup wizard) + append guidelines to `claude.md`
    7. Set `setup_done = true`
  - Operator's chat with Claude IS the setup — no LivOS-side form
- On SUBSEQUENT opens: detect `setup_done === true`, attach to existing tmux session (or respawn if missing), show normal CC chat
- Every session end (PTY session SIGTERM or operator close): write `<agentName>/.agent/sessions/<runId>.md` with frontmatter (runAt, durationMs, summary line from last assistant message) + full transcript
- The session-log writer hooks the existing Phase 177 `agent-runner.ts` inbox writer pattern (additive — agent-triggered sessions vs. scheduled sessions)

**The `AgentDetail` form-based component from Phase 175-04: DEPRECATED but not deleted yet.** A future Phase 191 (settings gear panel) may absorb its remaining form fields (schedule edit, last-run log link) into a `⚙` gear button in the PTY pane header. For Phase 189: just stop mounting `<AgentDetail>` from `routes/ai-chat/index.tsx`'s right-pane render switch; mount `<AgentTerminalPane>` instead.
</domain>

<decisions>

### Plan 189-01: NEW `<AgentTerminalPane>` component + sidebar routing change
- NEW `livos/packages/ui/src/features/agent-terminal/AgentTerminalPane.tsx` + test
- Props: `{ agentItem: VaultItem, userId: string }`
- Render: `<CcTerminal>` keyed on `liv-agent-<agentItem.id>` (session id derived deterministically from item id), cwd `~/liv/items/<agentItem.name>/`
- MOD `routes/ai-chat/index.tsx`: in the right-pane render switch, when selected item type === 'agent', mount `<AgentTerminalPane>` instead of `<AgentDetail>`
- The Phase 175 `<AgentDetail>` form-based component STAYS on disk (Phase 191 may revive it as settings panel), just not mounted from ai-chat anymore
- Acceptance: 8 vitest assertions — agent click mounts AgentTerminalPane, CcTerminal receives correct session id + cwd, AgentDetail no longer mounted from ai-chat

### Plan 189-02: First-open detection + setup wizard system prompt template
- MOD `livos/packages/livinityd/source/modules/cc-pty/manager.ts`: when spawning a PTY session whose tmux name matches `liv-agent-*`, read the agent's `.agent/config.json` from `~/liv/items/<id>/.agent/config.json`. If `setup_done === false`, append `--append-system-prompt "$WIZARD_PROMPT"` to the claude command. ADDITIVE — keep existing spawn logic intact.
- NEW `livos/packages/livinityd/source/modules/vault-items/setup-wizard-prompt.ts` exporting `getSetupWizardPrompt(agentItem, availableMcps): string` — returns a multi-paragraph instruction:
  ```
  You are setting up a new LivOS agent named "${agentItem.name}".
  Your goal is to interview the operator briefly to capture:
  1. Which MCP servers you should have access to. Available: ${availableMcps.join(', ')}
  2. What tasks you'll perform.
  3. Schedule (cron string or "manual").
  4. Tool restrictions (default: all enabled).
  When you have all 4, call the agent_config_set tool with the captured values.
  Speak the operator's language (detect from their replies).
  Be terse and warm. Confirm summary before saving.
  ```
- Acceptance: 8 vitest assertions — wizard prompt injected on first open, NOT injected on subsequent opens, prompt content correct

### Plan 189-03: `agent_config_set` MCP tool (setup wizard's persistence hook)
- NEW `livos/packages/livinityd/source/modules/vault-items/tools/agent-setup-tools.ts` registering 1 MCP tool: `agent_config_set({mcps: string[], tasks: string, schedule: string|null, tools: string[]|null})`
- Tool implementation: writes to `~/liv/items/<id>/.agent/config.json` with `setup_done: true`, MCPs, tasks, schedule, tools; appends a guidelines section to `claude.md`
- The tool is registered ONLY for the agent's own PTY context (not globally accessible — gated by tmux session name pattern)
- Acceptance: 6 vitest assertions — tool input schema validates, writes correct config shape, idempotent on second call, .agent/config.json reaches setup_done=true

### Plan 189-04: Conversation starter chips (research Pattern #3) + empty-state UI
- NEW `livos/packages/ui/src/features/agent-terminal/StarterChips.tsx` + test
- Props: `{ onPick: (prompt: string) => void, agentItem: VaultItem }`
- Render 4 clickable chips with common starter prompts (could be locale-aware; ship English defaults):
  - "Tell me what you can do"
  - "Schedule a daily summary"
  - "Watch a folder for changes"
  - "Help me plan something"
- Chip click: programmatically types the prompt into the CC PTY input via the CcTerminal sendStdin handle (Phase 181-03 pattern)
- Mount in `<AgentTerminalPane>` ONLY when transcript is empty (heuristic: PTY output buffer is empty OR `.agent/config.json.setup_done === true && no session files yet`)
- Auto-hide after first user message
- Acceptance: 6 vitest assertions — chips render, chip click sends correct stdin, chips hide after stdin sent

### Plan 189-05: Per-session transcript writer (`.agent/sessions/<runId>.md`)
- MOD `livos/packages/livinityd/source/modules/cc-pty/manager.ts` ADDITIVELY: on PTY session SIGTERM or `kill`, if the session name matches `liv-agent-*`, write the session transcript to `~/liv/items/<id>/.agent/sessions/<runId>.md`
- Frontmatter: `{runAt, durationMs, summary: <last_assistant_msg_first_line>}`
- Body: full transcript (or last N tokens if huge)
- runId = uuid generated at session start, stored on PTY session metadata
- Acceptance: 6 vitest assertions — transcript written on close, frontmatter correct, idempotent, dir created on demand
</decisions>

<canonical_refs>
- Operator spec 2026-05-20 (literal Agent flow)
- `.planning/research/v38_2_hermes_openclaw_findings.md` (Hermes + OpenClaw research — 341 lines)
- `livos/packages/ui/src/features/cc-terminal/CcTerminal.tsx` (PTY substrate; Phase 167 + 181 hardened)
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` (Phase 174 — selection callback)
- `livos/packages/ui/src/routes/ai-chat/index.tsx` (Phase 185/186/188 — right-pane render switch)
- `livos/packages/livinityd/source/modules/cc-pty/manager.ts` (Phase 166 + 167.2 + 183 — additive only)
- `livos/packages/livinityd/source/modules/vault-items/vault-items-router.ts` (Phase 171)
- `livos/packages/livinityd/source/modules/vault-items/tools/liv-tools.ts` (Phase 176 — MCP tool registration pattern to mirror)
- `livos/packages/livinityd/source/modules/autonomous-scheduler/agent-runner.ts` (Phase 177 — session log pattern to mirror additively)
- `~/liv/items/<id>/.agent/config.json` (Phase 188-02 created the seed `{setup_done: false}`)
- `~/liv/items/<id>/claude.md` (Phase 188-02 created the seed placeholder)
- `livos/packages/ui/src/features/item-detail/AgentDetail.tsx` (Phase 175-04 — DEPRECATED but stays on disk for Phase 191 settings panel future)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 189-01 | NEW features/agent-terminal/AgentTerminalPane.tsx + test; MOD routes/ai-chat/index.tsx + test |
| 189-02 | MOD cc-pty/manager.ts (additive wizard detection); NEW vault-items/setup-wizard-prompt.ts + test |
| 189-03 | NEW vault-items/tools/agent-setup-tools.ts + test; MOD MCP tool registration in vault-items module init |
| 189-04 | NEW features/agent-terminal/StarterChips.tsx + test; MOD AgentTerminalPane to mount chips |
| 189-05 | MOD cc-pty/manager.ts (additive session-end transcript writer); add tests |

**Sacred guards:**
- sdk-agent-runner.ts (SHA f3538e1d...) UNCHANGED
- All 25 in scripts/sacred-shas-v38.json
- Phase 166 cc-pty/manager.ts ADDITIVE only (existing 23 + new for wizard detection + session log writing). If `manager.ts` is in sacred registry, wrap new behavior in a separate module (e.g. `cc-pty/agent-session-hooks.ts`) and call from manager's lifecycle events.
- Phase 167 CcTerminal.tsx ADDITIVE only
- Phase 171 vault-items source files ADDITIVE only
- Phase 174-176 components UNCHANGED (consumers)

**Deferred (to v38.3+):**
- `<ToolTimeline>` custom UI overlay → CC PTY shows tools natively, don't duplicate
- Slash command menu → Claude already has `/`, no LivOS overlay
- Auto-title from first response → operator's spec is user-typed name; don't override
- Settings gear `⚙` in PTY pane header → Phase 191 (when settings panel is built)
- AgentDetail.tsx (Phase 175-04) deletion → Phase 191 absorption (may keep some fields)
</specifics>

<deferred>
- Tool restrictions UI (per-agent enable/disable) → Phase 191
- Per-session cost tracking dashboard → v38.x
- Multi-turn rewind / fork conversation → v39+
- Auto-resume detached sessions on cross-device login → v39+
</deferred>

---

*Phase: 189-agent-click-cc-pty-setup-wizard*
*Wave: 2 (depends on Phase 188 on-disk artifacts)*
*Depends on: Phase 166, 167, 171, 174, 176, 177, 188*
*Estimated: ~1.5 days (biggest of v38.2)*
