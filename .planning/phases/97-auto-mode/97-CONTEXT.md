# Phase 97: Auto Mode — Skill-Guided Bytebot, Window-Scoped — Context

## Goal
Ship Auto mode for the v33 WebApp Stream Window: when the user picks a saved skill (or types a free-form goal) and clicks Run, a bytebot computer-use loop executes against the **single Chrome window** that hosts that WebApp, using the skill's recorded action log as soft guidance and validating each step with vision before acting. Window scoping is achieved by extending the existing post-P79 native primitives with an optional `windowId`, and by spawning a per-WebApp bytebot MCP server instance whose tools default to that window. The sacred SDK runner is not touched.

## Why this phase exists
v33 promises three differentiated modes (Watch / Teach / Auto / Chat). P95 ships the window + AI panel + mode pill; P96 ships Teach (recording the user's actions into `webapp_skills` rows). Auto is the payoff: it's the mode that turns a recording into a reusable agent task. It is also the most architecturally sensitive phase in v33 because it is the only one that reaches into the agent loop. Three forces converge here:

1. **Window scoping** — the existing bytebot primitives operate on the host display (post-P79 maim/xdotool path). For Auto mode we must aim those primitives at exactly one Chrome window so the agent can't click a different WebApp by accident.
2. **Per-WebApp MCP** — multiple WebApps may run concurrent agent sessions; each needs its own bytebot tool surface bound to its own window id. The existing `bytebot-mcp-config.ts` was written for a single host-display server.
3. **Skill-as-guidance** — the recorded action log is not a deterministic playback (DOM/coords drift between sessions); it's prose context the agent reads and adapts. The skill must be injected as a system-prompt addition without modifying the sacred runner.

This phase exists specifically to satisfy all three without violating the sacred SHA, and to prove (via UAT) that a recorded skill survives a real LLM-driven replay against a live web page.

## In-scope
- **Native primitive extension** in `livos/packages/livinityd/source/modules/computer-use/native/`:
  - `screenshot.ts`: add optional `windowId?: number` parameter. When set, invoke `maim -i <wid> /tmp/<file>.png`. When undefined, current host-display branch is the unchanged default. Keep the post-P79 retry/error semantics; surface `windowId` in error context.
  - `input.ts`: add optional `windowId?: number` to `clickMouse`, `typeKeys`, `pressKey`, and any other primitives that currently shell out to xdotool. When set, prepend `--window <wid>` to the xdotool argv (xdotool's documented per-window form). Keep the nut-js fallback path host-display only — do not attempt window-scoped nut-js (out of scope).
- **Tool dispatch wiring** in `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts`: thread the `windowId` from the spawned MCP server's env (`BYTEBOT_TARGET_WINDOW_ID`) down to the native calls. Preserve existing tool names and JSON-Schema; this is purely an internal default-arg plumbing change.
- **Multi-instance MCP support** in `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts`:
  - Accept a per-instance config keyed by WebApp id. Each instance spawns its own MCP child process with `BYTEBOT_TARGET_WINDOW_ID=<wid>` in env.
  - Existing single host-display MCP stays as the default for non-WebApp computer-use sessions (debug, watch, ad-hoc).
  - Lifecycle: spawn on Auto-mode start, idle-reap when WebApp window closes (signalled from P93's window-manager).
- **New AgentPress tool** at `livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.ts`:
  - Tool name: `webapp_replay_skill`.
  - Input: `{skillId: uuid, freeFormGoal?: string}`.
  - Behavior: loads the `webapp_skills` row, calls the skill-context-builder to render the system-prompt block, returns it as the tool result so the agent reads it on the next turn. Tool result format follows existing AgentPress conventions (see `bytebot-tools.ts`).
- **Skill context builder** at `livos/packages/livinityd/source/modules/webapps/skill-context-builder.ts`:
  - Loads the row, renders an XML-tagged block: `<previously-learned-skill name="…"><actions>…</actions><note>Adapt these to current screen state. Validate each step with computer_screenshot before clicking.</note></previously-learned-skill>`.
  - The action list is a compact human-readable summary of `{type, coords, key, ts}` — not the full screenshot blobs.
- **System-prompt injection path**: the skill block reaches the agent through `liv/packages/core/src/liv-agent-runner.ts` (the wrapper around the sacred runner) — either as a `taskPrefix`-style addition the wrapper already supports, or as the result the agent receives when it calls `webapp_replay_skill`. Whichever path is chosen during 97-01 discovery, it must NOT touch `sdk-agent-runner.ts`.
- **Failure recovery hook** in `liv/packages/core/src/liv-agent-runner.ts`: a small "needs help" signal protocol:
  - Track a counter of consecutive vision-validation failures (LLM disagrees with skill's expected next state).
  - At 3 in a row, emit a structured event the SSE pipeline relays as a `needs_help` chunk and pause the run pending user input.
  - Reuse the hermes tool-guardrail loop detection (Rank 1 in `.planning/research/hermes-agent/FINDINGS.md`) if it has shipped before this phase; otherwise inline a minimal counter and leave a TODO to migrate when guardrail lands.
- **Sacred SHA verification gate**: a phase-internal check that `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at every commit-touching boundary inside this phase.

## Out-of-scope
- WebApp window manager / x11vnc / window discovery → owned by **P93**.
- Mode selector UI / window infra / VNC client → owned by **P95**.
- Teach-mode action recording / `webapp_skills` table creation → owned by **P96**. P97 only **reads** that table.
- Any modification to `liv/packages/core/src/sdk-agent-runner.ts` — sacred file, locked at SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
- Multi-user Chrome profile isolation / per-user MCP tenancy → deferred to v34 per D-V33-07 (single Mini PC user only).
- Voice goal entry, mobile UI, cross-WebApp shared skills → §9 of v33-DRAFT, all deferred.
- Auto-redact of sensitive content in skill context (passwords typed during Teach) → user-facing warning shipped in P96; redaction itself deferred per Q3 in §8 of v33-DRAFT.
- nut-js window scoping — only the xdotool primary path gains `--window`; nut-js fallback stays host-display.
- New broker work or any change to the subscription auth path.
- Any frontend work for Auto mode beyond what P95 already shipped (mode pill, run button). If a UAT gap surfaces it goes into **P98**, not here.
- Backwards-compatibility shims for callers that pass legacy positional args to the native primitives — make `windowId` an optional named field, no shim layer.

## Dependencies
- **Code (livinityd, livos package)**:
  - Native primitives at `livos/packages/livinityd/source/modules/computer-use/native/{screenshot.ts, input.ts, index.ts}` (post-P79 host-display path).
  - Bytebot MCP wiring at `livos/packages/livinityd/source/modules/computer-use/{bytebot-mcp-config.ts, mcp/server.ts, mcp/tools.ts}` and tool definitions at `bytebot-tools.ts`.
  - `webapp_skills` table + skill-storage module from P96 (`livos/packages/livinityd/source/modules/webapps/skills-storage.ts` per the DRAFT).
  - Window-manager interface from P93 — must expose a "WebApp closed" signal for MCP idle-reap (P93's window-manager already plans to detect Chrome window close; this phase consumes that signal).
- **Code (liv package)**:
  - `liv/packages/core/src/liv-agent-runner.ts` — extension surface for skill-prompt injection and needs-help signal.
  - `liv/packages/core/src/mcp-client-manager.ts` (the actual file backing the conceptual `LivMcpClientManager`) — extension to register a per-WebApp MCP instance alongside the host-display default.
  - `liv/packages/core/src/sdk-agent-runner.ts` — **read-only reference, do not modify**.
- **External binaries** (already installed on Mini PC post-P79): `maim`, `xdotool`, `wmctrl`. P79 verified `maim -i <wid>` and `xdotool --window <wid>` against host Mutter.
- **Phases**: P95 (mode pill, agent panel, session row), P96 (skill table + storage), P79 (working maim/xdotool host-display path), P77 (additional MCP server enumeration in `LivAgentRunner` — the lever this phase pulls).
- **Optional reuse**: hermes tool-guardrail port (Rank 1 in `.planning/research/hermes-agent/FINDINGS.md`). If shipped pre-P97 in a separate phase, reuse its counter; if not, inline a minimal version.

## Sacred constraints
- **`liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.** No path through this file is allowed in any P97 plan, code, test, or commit. Verify before AND after every commit-touching session in this phase. If a proposed implementation appears to require touching the sacred runner, the design is wrong — re-route through `liv-agent-runner.ts` or `mcp-client-manager.ts`.
- **All extensions go through wrappers**: `LivAgentRunner` (file: `liv-agent-runner.ts`) for prompt/event/recovery extensions; `LivMcpClientManager` (file: `mcp-client-manager.ts`) for per-WebApp MCP instance registration. The skill-injection path must use one of these — it must not become a quiet edit to the sacred runner masquerading as a wrapper change.
- **Subscription-only**: no raw `@anthropic-ai/sdk` imports introduced. P97 does not touch the auth path at all.
- **No backwards-compat hacks** in new code: new optional params, new tool, new module — greenfield where we can; cleanly extended where we can't.
- **No emoji** unless explicitly authored.
- **Per-WebApp MCP scoping MUST go through `mcp-client-manager.ts`**, not `sdk-agent-runner.ts`. Per-instance env passthrough goes through the existing `additionalMcpServers` enumeration (P77) — no parallel spawn path.
- **No on-server-only edits**: all changes commit to repo and ship via `update.sh`. Do not patch the Mini PC tree directly during UAT — diff back into source first.
- **httpOnlyPaths discipline**: any new tRPC route added during P97 must be added to `httpOnlyPaths` in `common.ts` (the v32+ pitfall). P97 may not need any new tRPC routes; if it does, this rule applies.

## Gray areas / open questions
1. **Skill-context format — XML tags vs Markdown**. v33-DRAFT §5 P97 specifies XML (`<previously-learned-skill>…<actions>…<note>…`). Provisional default: **XML as drafted**, on the rationale that Anthropic prompt-engineering guidance prefers XML tags for structured context delimiters and that the closing-tag boundary is clearer to the validator pass than Markdown headings. Open: should each action be its own `<step type="…" coords="…"/>` element vs a flat free-text list? Provisional: **flat numbered list inside `<actions>`** for v33; structured per-step tags can wait for a v34 evals run that proves they help.
2. **Vision-validation prompt template**. The needs-help counter triggers on "LLM disagrees with skill's expected next state". We need a deterministic prompt the wrapper sends (or a deterministic format the agent must produce) so the wrapper can count failures without false positives. Provisional default: **structured agent self-report** — agent emits a `validation:{status:'pass'|'fail', reason:string}` line on each step (parsed by the wrapper) rather than the wrapper running a separate vision call. Open: what's the exact phrasing in the system-prompt addition that asks for the line, and how does the wrapper parse it without leaking to the UI? P97-04 owns the prompt copy + parser.
3. **Needs-help signal protocol**. How does the agent loop pause and resume? Provisional default: emit a new SSE chunk type (e.g. `needs_help`) carrying `{webappId, lastValidationReason, screenshotRef}`; the SDK runner's silence watchdog already supports pause-on-event-absence so the wrapper just stops feeding turns. Resume = user posts a chat message that the wrapper unblocks on. Open: do we time-bound the pause (auto-cancel after 10 minutes idle) or hold indefinitely until user acts?
4. **Multi-WebApp MCP server resource limits**. Each spawned bytebot MCP child is a Node process (~30-60 MB RSS) plus per-tool transient maim/xdotool spawns. Concurrent active WebApps could be 5+. Provisional default: **soft cap of 3 concurrent Auto-mode sessions** (room for 5 active WebApps but only 3 running agents at once); reject Auto-start beyond cap with a clear UI message. Open: does the cap go in `mcp-client-manager.ts` (refuse to register a 4th) or in the tRPC layer (refuse to start the run)? Provisional: **mcp-client-manager**, since that's the resource owner.
5. **Idle-reap semantics for per-WebApp MCP**. When does a per-WebApp MCP instance shut down? Provisional default: **on Chrome window close signal from P93's window-manager** OR **after 5 minutes idle without an agent turn**, whichever first. Open: do we keep the instance warm across Auto-mode pauses (waiting on user) for fast resume, or tear down to free RAM? Provisional: **keep warm during a paused needs-help state** (cheap), tear down on Chrome window close (mandatory).
6. **Failure-counter scope**. Is the 3-strikes counter per-Auto-run or per-WebApp-session (across multiple runs)? Provisional default: **per-Auto-run**. The counter resets when the user hits Run again. Rationale: a paused-then-resumed run is the same context; a fresh Run after the user fixes something deserves a clean slate.
7. **Skill context budget**. A long teach session could log hundreds of clicks; the rendered XML block could blow the system-prompt budget. Provisional default: **truncate the action list to the most recent 50 events with a `… <truncated count="N"/>` marker**, on the assumption that recent steps are most relevant for the current screen state. Open: should the user pick which steps to keep at Teach-save time? Provisional: out of scope for v33; auto-truncate in P97; rely on Teach-mode UX for length self-discipline.
8. **Where does the `webapp_replay_skill` tool live in the agent's tool list**? Two options: (a) always-on, listed alongside computer-use tools when in Auto mode; (b) auto-invoked once at run start by the wrapper before the first agent turn so the skill is in context from turn 1. Provisional default: **(b) auto-invoked once by the wrapper** so the agent doesn't have to "remember" to call it; the tool also stays callable later for re-priming if the user changes skill mid-run.
9. **Sacred-SHA failure mode**. If the SHA check fails mid-phase (someone else touched the runner, or a merge brought drift), do we hard-stop or roll back? Provisional default: **hard-stop the phase**, dump diff, escalate to user. Re-running ANY P97 plan after a sacred SHA breach is forbidden until the breach is investigated and the SHA restored.

## Success criteria
1. Calling `screenshot.captureWindow({windowId: <wid>})` returns a non-black PNG of the targeted Chrome window on Mini PC, while `screenshot.capture()` (no windowId) still returns the full host display unchanged.
2. Calling `input.clickMouse({windowId: <wid>, x, y})` clicks inside the targeted window even if a different window is currently focused (xdotool `--window` documented behavior; verified live on Mini PC).
3. Auto mode for a freshly-saved skill (e.g. "post a status on Facebook") drives the agent through at least the first two recorded steps autonomously, with `validation:pass` lines on each.
4. The per-WebApp bytebot MCP child process is visible in `ps` with `BYTEBOT_TARGET_WINDOW_ID=<wid>` in its env while Auto mode is active, and exits within 60s of the Chrome window closing.
5. Three consecutive `validation:fail` lines in one run cause the runner to emit a `needs_help` SSE chunk and stop sending turns until the user posts a chat message.
6. The host-display single-MCP debug path (`computer-use` ad-hoc usage outside a WebApp) still works, unchanged. Existing `mcp/tools.ts` test suite passes without modification beyond the new windowId parameter being accepted.
7. `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at phase open AND phase close. Every commit in the phase manifest passes the same check.
8. Total resource footprint with 3 concurrent Auto-mode WebApps stays under +250 MB RSS over the host-display-only baseline (informal sanity check, not a hard gate).
9. No new file in `liv/packages/core/src/` named or shaped like a fork of `sdk-agent-runner.ts`. All extensions in `liv-agent-runner.ts` and `mcp-client-manager.ts`.
10. `webapp_replay_skill` tool is callable through the active Auto-mode MCP instance; its result contains the rendered `<previously-learned-skill>` block; the agent's next turn references at least one detail from the block (light prompt-conditioning sanity check during UAT).
