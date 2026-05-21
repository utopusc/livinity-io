# v38.2 Research: Hermes Agent + OpenClaw OS Findings

**Date:** 2026-05-20
**Researcher:** technical-researcher agent
**Purpose:** Inform v38.2 Agent UX rebuild (Phases 188/189/190) after v38.0/v38.1 UAT failure

---

## Repo 1: nousresearch/hermes-agent

**What it is:**
A self-improving AI agent framework (Python + TypeScript). It is NOT a web UI — it is a CLI/TUI tool and multi-platform gateway (Telegram, Discord, Slack, WhatsApp, Signal). The "UX" the user is referencing is the **terminal-first interaction model**: you type `hermes` and you are in a live REPL with the agent. There is no form. There is no modal. The agent exists the moment you start talking.

**Repository stats:**
- Stars: ~160,000 (extremely high — among the most starred agent repos on GitHub)
- Forks: ~26,000
- Language: Python 88.4%, TypeScript 8.6%
- Latest release: v0.14.0 (May 16, 2026 — actively maintained)
- License: MIT

**Agent creation flow:**
There is no "create agent" form. You run `hermes setup` once, which runs a short CLI wizard to configure model provider and API key. After that, `hermes` drops you directly into a chat session. The agent is a persistent singleton that learns across sessions. No wizard for each new agent. No system prompt textarea. No type picker.

For multi-agent: sub-agents are spawned automatically by the main agent via RPC delegation when it decides parallel workstreams are needed. The user never manually "creates" a sub-agent.

**How users interact once in session:**
- Full TUI: multiline editing, slash-command autocomplete (`/new`, `/model`, `/skills`, `/compress`, `/retry`)
- Streaming tool output appears inline as the agent works — each tool call shows `"📞 Tool: name(args)"` then `"✅ completed in Xs"` then truncated result preview
- Interrupt-and-redirect: user can type while agent is running to redirect mid-task
- `/retry` to redo last turn
- `/compress` to summarize context when token budget runs low

**"Watch the agent work" experience:**
Real-time streaming in the terminal. Tool calls are numbered and timestamped:
```
⚡ Concurrent: 3 tool calls — read_file, grep, list_dir
📞 Tool 1: read_file(/src/index.ts)
📞 Tool 2: grep("useState", /src/)
📞 Tool 3: list_dir(/src/components)
✅ Tool 1 completed in 0.12s
✅ Tool 2 completed in 0.31s
✅ Tool 3 completed in 0.09s
⚡ 3/3 tools completed in 0.31s total
```
Progress is text-based and ephemeral — it scrolls past as the conversation continues. There is no persistent "activity log" panel separate from the chat.

**Agent metadata storage:**
- `MEMORY.md` and `USER.md` files in a profile-scoped `hermes_home` directory — plain markdown, agent-curated
- Skills stored as `SKILL.md` files under `.hermes/plans/YYYY-MM-DD_HHMMSS-<slug>.md`
- Session data: SQLite with FTS5 for full-text search across conversation history
- Configuration: YAML files in `hermes_home`
- System prompt: assembled at runtime from `SOUL.md` (identity) + context discovered from `AGENTS.md`, `.cursorrules` in working directory + volatile memory snapshot

**MCP / tool integration:**
- `mcp_tool.py` in tools directory — MCP discovery runs at startup if `mcp_servers` configured
- Tools are registered via `registry.py` — 40+ built-in tools (browser, file ops, terminal, code execution, image/video gen, skill manager, memory tool, cron, etc.)
- Users do NOT configure tools via a checkbox UI. Tools are always available; the agent decides which to use
- MCP server configuration lives in YAML; cold-start discovery is skipped when no MCP config to avoid latency

**Folder / project organization:**
Flat — there is no tree. The agent operates in whatever directory you `cd` to before running `hermes`. Project context is inferred from `AGENTS.md`, `.cursorrules`, or similar convention files found in the working directory. Skills are organized into categorical directories (`/skills/software-development/plan/SKILL.md`) but this is the framework's internal organization, not something the user manages.

**Screenshots referenced in README:** None embedded. Documentation screenshots are at `hermes-agent.nousresearch.com/docs`.

**Key architectural decisions:**
1. **No vendor lock-in**: Model abstraction layer allows `hermes model` switch with no code change
2. **System prompt caching**: `_cached_system_prompt` locked for session lifetime; rebuilds only after context compression — preserves Anthropic prefix cache
3. **Preflight compression**: Detects oversized history before API calls; compresses iteratively if tokens exceed threshold
4. **Sidecar publisher**: Optional WebSocket mirror of all TUI events to a dashboard sidebar via `TeeTransport` — this is how external UIs hook into the terminal stream
5. **Interrupt handling**: Checks for user-sent interrupts at loop start respecting thread scope
6. **Session search**: FTS5 SQLite with LLM summarization enables cross-session memory recall

---

## Repo 2: thesysdev/openclaw-os

**What it is:**
A Next.js web workspace UI (TypeScript 95%) that plugs into the OpenClaw agent gateway. It renders agent responses as live, interactive React components (via "OpenUI Lang" — a structured component emission protocol). It is a web-based counterpart to what LivOS is trying to build, but for OpenClaw's gateway instead of Claude.

**Repository stats:**
- Stars: 214
- Forks: 30
- Language: TypeScript 95.2%
- License: MIT
- Last commit: Active (CI workflows present, recent activity visible)

**Agent creation flow:**
**There is no "create agent" form.** Agents appear in the sidebar automatically when threads are created. The `AgentsView` component calls `buildAgents()` which groups existing threads by `clawAgentId`. "No agents yet. Start a conversation to see them here." is the empty state. The implied flow: send a message in the `HomeComposer` → that creates a thread → that thread's agent appears in the sidebar. Agent creation = first message sent.

**How users interact once in session:**
- `SessionComposer` textarea: auto-grows, multiline, `Enter` or `Cmd+Enter` to send (preference-based)
- Slash commands: `/reset`, `/compress`, plus gateway-registered commands — shown in a popup menu when typing `/{partial}`
- File attachments: picker + drag-drop + clipboard paste → shown as dismissible chips
- Tab completion: pressing Tab fills the textarea with the full `rotatingPlaceholderFillWith` prompt
- Model + effort selector dropdowns inline in the composer
- Speech-to-text integration

**"Watch the agent work" experience:**
Tool calls render in the `AssistantMessage` component as a `ThinkingPanel` with a timeline of `TimelineRow` entries:
- Each tool shows: status glyph (pulsing dot while running, checkmark on success, X on error) + tool name + expandable input/output tabs + duration + token counts
- When streaming: incomplete tools show "Waiting for tool output..."
- `ThinkingPanel` enables internal scroll when timeline exceeds 10 rows — prevents vertical explosion
- OpenUI Lang segments render as live React components via `<Renderer library={openuiChatLibrary} response={segment.content} isStreaming={isStreaming} />`
- Text segments render through ReactMarkdown with prose styling

**Agent metadata storage:**
- Threads stored with `clawAgentId`, `clawKind` ("main" or refinement), `createdAt`, session model metadata
- Agent name: derived from the thread with `clawKind === "main"` — the first message or thread title
- No separate agent config file/table — the agent IS the set of its threads
- Apps and artifacts persist in separate stores (`app-store.ts`, `artifact-store.ts`) and re-render across turns
- Session state: `sessionMeta: Map<string, SessionRow>` tracking model selection and patches

**MCP / tool integration:**
Not surfaced to the user as a configuration UI. Tools are available at the gateway level; the UI only receives tool call events and renders them in the `ThinkingPanel` timeline. Users do not manage a tools checklist.

**Folder / project organization:**
Hash-based routing (`useHashRoute()`):
- `#chat/{sessionId}` — active conversation
- `#app/{appId}` — persistent app surface
- `#artifact/{artifactId}` — artifact viewer
- `#agents` — agent grid view
- `#crons` — scheduled tasks
- `#notifications` — notification inbox

Sidebar is a persistent left rail showing agents, apps, artifacts, crons, and notifications as first-class surfaces. No tree. No nesting. No drag-to-reparent.

**Screenshots referenced in README:** None embedded.

**Key architectural decisions:**
1. **Plugin-served static UI**: The Next.js app is statically exported and bundled into the gateway plugin — no separate process, no tunnel, no CORS
2. **Hash routing**: All navigation is hash-based so the static export has a single index.html entry point
3. **Agents-from-threads**: Agents are not configured entities — they emerge from conversation threads; `buildAgents()` is a pure client-side grouping function
4. **OpenUI Lang injection**: A `before_prompt_build` hook injects a system prompt segment that teaches the LLM to emit structured `<openui>` blocks, which the renderer turns into interactive React components
5. **Session composer primeable via custom event**: `openclaw-os:prime-composer` event seeds the textarea and optionally auto-submits — enables deep-linking into a specific prompt
6. **`hiddenRefinementThreadIds`**: Scaffolding threads without actual messages are filtered from sidebar to avoid clutter — the user never sees "empty" threads

---

## Comparison: Hermes vs OpenClaw vs LivOS-current

| Dimension | Hermes | OpenClaw | LivOS (now) | Gap |
|---|---|---|---|---|
| Agent creation | No form — first `hermes` command | No form — first message | 5-step modal (type picker + name + cwd + system prompt + schedule) | LivOS is 5 steps for something Hermes/OpenClaw do in 0 clicks |
| Interaction model | Terminal REPL — always live | Persistent chat composer — always open | Click agent in tree → `AgentDetail` side panel (form) | LivOS opens a config panel instead of a chat |
| "Watch agent work" | Inline streaming text (tool emoji + timing) | `ThinkingPanel` timeline with status glyphs + expandable I/O | Inbox preview (3 rows) + last-run log link — post-hoc, not live | LivOS has no live tool-call stream at all |
| Setup friction | Zero — talk to the agent, it configures itself | Zero — send a message, agent appears | Five fields before first use | Every new agent costs the user a full form fill |
| System prompt | Auto-built from SOUL.md + context discovery | Injected via `before_prompt_build` hook | Raw textarea in side panel | Textarea exists but is not guided; user must know what to write |
| Tools | Always available, agent decides | Always available, rendered as timeline | Checkbox list in side panel | Checkboxes are cognitive overhead; agent should decide |
| Memory / persistence | MEMORY.md auto-curated by agent | Apps/artifacts re-render across turns | Inbox entries (success/failed/date) | LivOS shows run status but not agent learning or artifact output |
| Project organization | `cd` to directory, infer from AGENTS.md | Hash routing to flat surfaces | `react-arborist` tree with drag-to-reparent | Tree is a strong pattern for LivOS vault use case — KEEP IT |
| MCP surfacing | YAML config + automatic discovery | Gateway-level, not user-configured | Read-only text list in side panel | List is fine; no checkbox needed |

---

## Top 5 Patterns to Adopt for v38.2

### #1 (CRITICAL) — Chat-First Agent Onboarding: Agent Is Born From First Message

**Source:** Both Hermes and OpenClaw — Hermes does it in a terminal, OpenClaw does it in a web chat.

**Description:** Remove the AddItemModal "Agent" form path entirely. When user clicks "+ New Agent", open a CC PTY chat pane immediately with a guided system message: "Name your agent and describe what it should do." The agent record is created from the first exchange, not before it.

**Why it improves UX:** The current modal forces the user to articulate system prompt, schedule, and tools BEFORE they have had any conversation with the agent. This is cognitively backwards. Hermes and OpenClaw both recognize that agent configuration is discovered through conversation, not prescribed in advance. The user goes from "fill 5 fields, then talk" to "talk, it configures itself."

**How to implement in LivOS:**
1. In `AddItemModal`, when user clicks the "Agent" type card (step 1 stays — type selection is fine), instead of rendering `form-step-agent`, immediately call `vault.items.create.mutate({ type: 'agent', name: 'New Agent', parentId })` with a generated default name, then `onItemCreated(item)`.
2. `onItemCreated` in the parent panel fires `openCcPty(item.id)` — spawns a CC PTY session with an injected system message: `"Hi! I'm setting up your new agent. First, what should I call this agent? Then tell me what you want it to do."`
3. The CC PTY session runs a short setup script (not a full Claude agent loop — a simple guided prompt template). When the user says "Call me DailyDigest, check Hacker News every morning", extract name + task via a tRPC mutation `vault.items.update({ id, name, systemPrompt })`. This can be a simple Claude call with a structured output schema — no full agent loop needed.
4. After name + task confirmed, agent is ready. Schedule and tools are set by asking follow-up questions inside the same PTY session.

**Difficulty:** Medium
**Priority:** Critical

---

### #2 (CRITICAL) — Inline Live Tool Timeline in Chat Pane

**Source:** OpenClaw — `AssistantMessage.tsx` + `ThinkingPanel` + `TimelineRow`

**Description:** When an agent run is triggered (Run Now or cron-fired), display tool calls as they happen in the CC PTY chat pane: status glyph (pulsing dot → checkmark/X) + tool name + duration + expandable args/output.

**Why it improves UX:** The current LivOS inbox shows "2026-05-20 — success" after the run completes. The user has zero visibility into what happened during the run. OpenClaw's `ThinkingPanel` shows the agent "thinking" in real-time: you see each tool call start, you see it complete, you see the result. This is the "watch the agent work" experience that is entirely absent from LivOS today.

**How to implement in LivOS:**
1. The CC PTY manager already streams output. Tool call events need to be parsed out of the stream as structured events (not just raw text).
2. Add a `ToolTimeline` component alongside the CC PTY output area. Each entry: `{ id, toolName, status: 'running'|'ok'|'error', startedAt, durationMs, argsPreview, resultPreview }`.
3. When the live stream receives a `tool_use` block from the Claude stream, push an entry with `status: 'running'`. When `tool_result` arrives, update to `ok` or `error` + set duration.
4. Render as a vertically stacked list of `TimelineRow` cards — each row collapsible (collapsed shows name + duration; expanded shows JSON args + truncated result).
5. Cap at 10 rows before enabling internal scroll (OpenClaw pattern: prevents vertical explosion).

**Difficulty:** Medium
**Priority:** Critical

---

### #3 (CRITICAL) — Conversation Starters / Empty-State Prompt Chips

**Source:** OpenClaw — `EmptyAgentHero.tsx` + `EmptyChatWelcome.tsx`

**Description:** When a user opens a new agent chat with zero messages, show 3-4 clickable prompt chips below the composer that send a pre-written message on click. No blank state. No "enter system prompt here."

**Why it improves UX:** The current LivOS `AgentDetail` shows a blank textarea labeled "System prompt" and an empty tools checklist. Users with no prior agent experience do not know what to type. OpenClaw's `EmptyAgentHero` shows concrete starters: "Build an app", "Schedule a task", "Pull data from a site". Clicking one sends that message immediately. The agent responds and the conversation is live.

**How to implement in LivOS:**
1. Create an `AgentEmptyState` component that renders when the CC PTY session has zero messages for this agent.
2. Provide 4 starters as clickable chips. For LivOS's home-server context:
   - "Monitor my server and alert me if disk usage goes above 80%"
   - "Check Hacker News every morning and send me the top 5 AI stories"
   - "Watch my /opt/livos/logs/ folder and summarize errors weekly"
   - "Help me set up this agent — tell me what you need to know"
3. Clicking a chip calls `ptyManager.sendInput(sessionId, starter.prompt)` — no special handling, just sends the text as a user message.
4. Hide the component once any message exists (same self-gating pattern as OpenClaw).

**Difficulty:** Small
**Priority:** Critical

---

### #4 (NICE-TO-HAVE) — Slash Command Menu in Chat Input

**Source:** OpenClaw — `SessionComposer.tsx`; Hermes — `slash_worker.py` + TUI slash autocomplete

**Description:** When user types `/` in the CC PTY chat input area, show a popup menu of available commands: `/reset` (clear context), `/runNow` (trigger agent), `/pause` (pause schedule), `/skills` (list available MCP tools), `/compress` (summarize history). Gateway-registered commands get a "gateway" badge. Local commands short-circuit without sending to the LLM.

**Why it improves UX:** Hermes users discover capabilities through slash commands — no separate settings panel to hunt through. OpenClaw extends this to web by layering a command menu over the textarea. For LivOS, this means schedule + run + pause controls move INTO the conversation rather than living in a side panel that the user has to find.

**How to implement in LivOS:**
1. Add a `useSlashCommands` hook that tracks textarea value. When value starts with `/`, filter against `COMMANDS` array and show a `Popover` above the textarea with matching commands.
2. Commands: `{ id: 'reset', label: 'Reset context', description: 'Clear conversation history', handler: () => ptyManager.sendInput(sid, '/reset') }` etc.
3. Keyboard: arrow keys navigate, Enter selects, Escape closes.
4. Short-circuit local commands (reset, pause, run-now) via tRPC mutations before sending to PTY.
5. Gateway commands (from `mcpManager.listServers()`) get "MCP" badge in the menu.

**Difficulty:** Small
**Priority:** Nice-to-have

---

### #5 (NICE-TO-HAVE) — Agents-From-Threads: Auto-Title From First Response

**Source:** OpenClaw — `AgentsView.tsx` (`buildAgents()` derives agent name from thread title derived from first exchange)

**Description:** When a new agent chat session starts and the user sends their first message, use Claude to auto-generate a short agent name (3-5 words) from the first user message + assistant response, and update `vault.items.update({ id, name })` automatically. User never has to type a name.

**Why it improves UX:** Currently LivOS requires a name in the AddItemModal form before the agent exists. OpenClaw skips this entirely — the agent gets a meaningful name derived from what it actually did. "Hacker News Digest", "Disk Monitor", "Log Summarizer" are better names than whatever the user types before they know what the agent will do.

**How to implement in LivOS:**
1. After the first full assistant response in a new agent's CC PTY session, fire a background tRPC call `vault.items.autoNameAgent({ id, firstUserMsg, firstAssistantMsg })`.
2. Server-side: call Claude with a one-shot prompt: "Given this task description, return a 3-5 word agent name. Task: {firstUserMsg}. Response: {firstAssistantMsg}. Name only, no quotes."
3. Update the vault item name; SidebarTree refetches via the existing 5s interval.
4. Gate this: only auto-name if current name matches the generated-default pattern (`/^New Agent \d+$/`).

**Difficulty:** Small
**Priority:** Nice-to-have

---

## Concrete Recommendations Per LivOS Phase

### Phase 188 (Add Modal — Agent | Project + name + icon)

The modal type-picker step (3 cards: Project, Agent, Chat) is CORRECT and aligns with both reference repos having a clear conceptual distinction. Keep the type picker.

**Remove from Phase 188:**
- The `form-step-agent` entirely — the 3-field form (name, system prompt, schedule) should be deleted from `AddItemModal.tsx`. This is the core of the "terrible UX" complaint.
- The `form-step-chat` name field — auto-generate via the `defaultChatName()` function that already exists; no need to ask.

**Add to Phase 188:**
- When user clicks the Agent type card: immediately call `vault.items.create.mutate({ type: 'agent', name: generateDefaultName(), parentId })` — no form step, no waiting.
- `onItemCreated` receives the new item and immediately fires the Phase 189 PTY launch.
- For icon: a small 4-icon picker (Bot, Zap, Eye, Clock — matching LivOS's Lucide usage) can replace the type card click with a 2-step mini-flow: click Agent → pick icon → instantly create. This keeps the modal under 2 steps.
- Parent selection stays on the type-picker step (it is already there) — no need for a separate form step.

**Net change to `AddItemModal.tsx`:** Remove `step === 'form' && selectedType === 'agent'` branch entirely. The `submitAgent` function goes away. The agent type card `onClick` becomes a direct create-then-navigate action.

### Phase 189 (Agent click → CC PTY + chat-based setup)

**This is the critical phase. Specific implementation:**

1. When `SidebarTree` fires `onSelect(itemId)` for an item with `type === 'agent'`, the parent panel should NOT open `AgentDetail`. Instead, open a CC PTY pane for that agent's session.

2. On first open (agent has zero messages, `ccSessionId` is null on the vault item):
   - Spawn a CC PTY session via the existing `ptyManager.create()` path.
   - Inject a guided system preamble INTO the PTY (not as a system prompt to the LLM, but as a displayed message): display the `AgentEmptyState` component with 4 starter chips above the composer.
   - The CC PTY pane layout: full-height split — top 60% is the streaming chat/tool-timeline area, bottom 40% is the `SessionComposer`-style input.

3. On subsequent opens (agent has messages, `ccSessionId` exists):
   - Resume the existing PTY session — show history + resume stream.
   - No setup flow, no empty state.

4. The `AgentDetail` component in its current form should be DELETED or reduced to a settings gear panel accessible via a `⚙` button in the PTY pane header. The settings panel becomes a read-only metadata view (schedule, last run) with an Edit Schedule link. Tools and MCP servers should NOT be a checklist — remove them from the main interaction surface.

5. Inside the PTY pane, implement `ToolTimeline` (Pattern #2 above) as a collapsible panel that appears when a run starts.

6. Inline the slash command menu (Pattern #4) in the composer textarea.

### Phase 190 (Multiple terminal tabs)

**Patterns from Hermes:**
- Hermes supports multiple concurrent contexts via `/new` slash command — each `/new` starts a fresh session within the same terminal window. Apply this: the CC PTY pane in LivOS should have a tab strip at the top, one tab per open agent/chat.
- Tab label = agent name (auto-generated from Pattern #5) + status dot (idle / running / error).
- Maximum 5 tabs before tabs compress or scroll horizontally — no modal, just a horizontal scroll.

**Patterns from OpenClaw:**
- OpenClaw's `SessionWorkspaceStrip.tsx` provides a horizontal strip of active workspace contexts. Adapt this: a horizontal tab bar across the top of the right-side PTY panel, not inside the SidebarTree.
- Tab reorder: drag-to-reorder tabs (not the arborist tree) for quick context switching.
- Tab close (X) on hover — keyboard shortcut `Cmd+W` closes active tab.

**Do NOT implement:**
- Full split-pane layout (side-by-side PTY windows) — too complex for Phase 190.
- Floating terminal windows — LivOS already has the WindowManager; if a user needs a floating terminal, they can use the existing terminal app. Phase 190 tabs are for agent sessions, not general terminals.

---

## Anti-Patterns to Avoid (things in Hermes/OpenClaw that DON'T fit LivOS)

1. **No tree / flat surface model (OpenClaw):** OpenClaw has no nesting — agents, apps, artifacts are flat lists. LivOS's `react-arborist` SidebarTree is CORRECT for the vault use case (nested projects with agents and chats underneath). Do NOT flatten the tree to match OpenClaw. The tree is a feature.

2. **Terminal-only TUI (Hermes):** Hermes's Python TUI is excellent for CLI power users but cannot be ported to the LivOS React web app. The pattern to steal is the *interaction philosophy* (talk first, configure later), not the rendering technology.

3. **MCP tool checkbox removal goes too far:** The current `AgentDetail` tools checklist is overkill as a primary surface, but a minimized version (collapsed by default, expandable) in the settings gear panel is appropriate for LivOS power users who want to restrict what Claude can do on their home server. Do not delete it completely — demote it.

4. **Auto-spawning sub-agents (Hermes):** Hermes delegates to sub-agents automatically when parallel workstreams are needed. This is powerful but opaque. LivOS users have one Mini PC — running parallel agent processes without explicit user consent would be alarming. Keep sub-agent spawning as a Phase 191+ feature with explicit UI affordance.

5. **OpenUI Lang component emission (OpenClaw):** Injecting `before_prompt_build` hooks to make Claude emit structured component definitions is a significant protocol change. LivOS's current approach of rendering Claude's text output via `Streamdown` is correct for Phase 188-190. OpenUI Lang is a future enhancement, not a blocker.

6. **Skill files on disk (Hermes):** Hermes stores skills as `SKILL.md` files in a categorized directory tree. LivOS already has a vault-items table in PostgreSQL. Do not add a parallel disk-based skill store. If skills land, they go in `vault_items` as a new type.

7. **Rotating placeholders (OpenClaw HomeComposer):** The `useRotatingPlaceholder` hook that cycles through starter texts in the textarea placeholder is a nice touch but adds complexity. Implement the clickable starter chips (Pattern #3) instead — they are simpler and more actionable.

---

## Summary: The Root Cause of "Incredibly Bad" UX

The user's critique is precisely identified by comparing the two repos:

**LivOS current:** User intent (create an agent) → 5-field form (type, name, system prompt, schedule, parent) → submit → agent appears in tree → click agent → side panel with more forms (system prompt editor, tools checklist, MCP list, schedule cron, inbox) → user confused about where the "chat" is.

**Hermes / OpenClaw:** User intent (create an agent) → 0 clicks → talk. The agent's behavior emerges from conversation.

The fix is not a visual redesign. It is a **flow inversion**: defer all configuration into the conversation, make the PTY/chat window the primary surface, and surface settings only when explicitly requested via gear icon or slash command.
