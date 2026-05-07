# Hermes-Agent → LivOS — Port Analysis

**Research date**: 2026-05-07
**Hermes repo**: `https://github.com/nousresearch/hermes-agent` (HEAD `cff821e2dc03e55e5b036d266ea38a8d39a2b938` at research time)
**Sacred SHA verified**: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — `liv/packages/core/src/sdk-agent-runner.ts` untouched, before and after.
**Caveat**: Agent's "137k stars" claim for hermes-agent is unverified (likely overstated — typical Nous Research repos are smaller). All file:line citations below are from agent's reads of the live repos.

## 1. Hermes-Agent Overview

Hermes Agent is a Python-based self-improving AI agent framework by Nous Research. Its defining differentiator is a **closed learning loop**: after complex tasks the agent autonomously creates and curates reusable skill files, and past sessions are full-text searchable with LLM-based summarization injected back as recall context. The system runs headlessly on any hardware and exposes a unified messaging gateway (Telegram, Discord, Slack, WhatsApp, Signal, email) so the same agent instance answers across channels without per-platform code paths.

Architecturally it is a Python monorepo with a `agent/` core (~50 modules), `skills/` persistence layer, `tools/` library of 40+ integrations, `providers/` multi-LLM adapters, `gateway/` messaging bridge, and `environments/` multi-backend terminal execution (Docker, SSH, Modal, Daytona, Singularity). Skill curation is driven by an auxiliary LLM pass (`agent/curator.py`) that consolidates/archives agent-written `SKILL.md` files stored under `~/.hermes/skills/`. Context compression uses a separate auxiliary model call (`agent/context_compressor.py`) with structured head/tail protection rather than naive truncation.

---

## 2. Architecture Comparison

| Layer | hermes-agent | LivOS today | Gap |
|---|---|---|---|
| Agent loop | Python `AIAgent` w/ per-turn memory injection | `SdkAgentRunner` (TypeScript, Claude SDK subscription, sacred `f3538e1d`) + `LivAgentRunner` wrapper | Different language + SDK; no loop-level gap |
| Context compression | LLM auxiliary model; 50% threshold; structured summary; head/tail protection (`agent/context_compressor.py`) | `ContextManager` truncate-oldest at 75%; LLM path throws "not implemented in v31" (`context-manager.ts:6-10`) | LLM summarization missing |
| Memory/recall | `MemoryManager` + providers; per-turn prefetch; fence-tag injection; streaming scrubber (`agent/memory_manager.py`) | `RunStore` Redis LIST per run; no cross-session recall; no FTS | No cross-session recall |
| Skill curation | `agent/curator.py` — background LLM pass; SKILL.md lifecycle; consolidation merges | `SkillFrontmatter` in `skill-types.ts` — manually authored; no auto-creation | No autonomous skill creation |
| Prompt builder | Dynamic per-turn: identity + cwd context file + platform hints + skills index + model-specific guidance (`agent/prompt_builder.py`) | Static string + identity line in `sdk-agent-runner.ts:304-314`; `bytebot-system-prompt.ts` for computer-use only | No cwd injection; no channel hints |
| Tool guardrails | `ToolCallGuardrailController`: failure repetition, same-tool failure cap, idempotent no-progress (`agent/tool_guardrails.py`) | `MAX_TOOL_OUTPUT` truncation only (`sdk-agent-runner.ts:63`); watchdog for silence only (line 366) | No loop/repetition detection |
| Scheduling | `croniter`-based natural language cron | `ScheduleManager` BullMQ (`schedule-manager.ts`) | Already covered |
| Multi-provider | OpenAI + Anthropic + OpenRouter + Bedrock + Gemini adapters | Subscription Claude-only (locked) | Intentional constraint |

---

## 3. Feature Inventory

**Feature**: LLM-based context compression
- **What it does**: When context exceeds 50% of model window, spawns auxiliary cheap model to produce a structured summary (Active Task / Completed Actions / Pending Asks). Iteratively updates across multiple compactions. Head/tail protection keeps first 3 and last ~20k-token messages intact.
- **Hermes file/module**: `agent/context_compressor.py` (50% threshold, 20% summary budget capped at 12k tokens, `[CONTEXT COMPACTION — REFERENCE ONLY]` prefix marker)
- **LivOS equivalent**: `liv/packages/core/src/context-manager.ts:1-30` (truncate-oldest only; LLM path throws `'not implemented in v31'`)
- **Port verdict**: PORT
- **Reason**: The `SummarizationStrategy` interface slot already exists; only the implementation is missing. Structured summarization prevents task state loss that truncation causes.
- **Estimated effort**: M

---

**Feature**: Cross-session memory recall via fence-tag injection
- **What it does**: `MemoryManager.prefetch_all(query)` retrieves matching past-session data, wraps in `<memory-context>` fence tags, injects into system turn. `StreamingContextScrubber` prevents tags from leaking to UI mid-stream.
- **Hermes file/module**: `agent/memory_manager.py` (prefetch, sync, streaming scrubber, provider model)
- **LivOS equivalent**: Missing. `RunStore` stores runs but no cross-session retrieval. Phase 75 ROADMAP line 49 defines "Postgres tsvector FTS over conversations" — not yet shipped.
- **Port verdict**: PORT
- **Reason**: High user-visible value. The streaming scrubber pattern maps cleanly onto LivOS's SSE `ChunkType` pipeline. Requires P75 FTS to land first.
- **Estimated effort**: L (depends on P75)

---

**Feature**: Tool guardrail loop detection
- **What it does**: Tracks exact-failure repetition (warn after 2), same-tool failure (halt after 8), idempotent no-progress (warn after 2). Graduated: warn then hard-stop. Mutating vs. idempotent tool classification baked in.
- **Hermes file/module**: `agent/tool_guardrails.py` (thresholds configurable, `hard_stop_enabled` flag)
- **LivOS equivalent**: `liv/packages/core/src/sdk-agent-runner.ts:63` (`MAX_TOOL_OUTPUT` only); watchdog covers silence-timeout only (line 366); no failure counting
- **Port verdict**: PORT
- **Reason**: Agents hitting a wall tool run to `maxTurns=25` burning full token budget. Guardrail can be added to `LivAgentRunner` at the `tool_snapshot` event level — zero changes to sacred file.
- **Estimated effort**: S

---

**Feature**: Dynamic per-turn prompt assembly with cwd context file discovery
- **What it does**: `build_context_files_prompt()` walks to git root looking for `.hermes.md`, `HERMES.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`. Scans for prompt-injection threats (regex + invisible Unicode), truncates to 20k chars, injects into system slot each session.
- **Hermes file/module**: `agent/prompt_builder.py` (security scan, LRU + disk snapshot cache for skills index)
- **LivOS equivalent**: `livos/packages/livinityd/source/modules/computer-use/bytebot-system-prompt.ts` (computer-use augmentation only); no project-context discovery
- **Port verdict**: SKIP
- **Reason**: LivOS is a server OS, not a coding assistant. Users don't work inside a git project directory on the server. Injecting arbitrary host filesystem files into every agent turn is also an injection risk in a multi-user environment.
- **Estimated effort**: N/A

---

**Feature**: Autonomous skill creation and LLM-based curation
- **What it does**: After complex tasks the agent writes SKILL.md files to `~/.hermes/skills/`. At session start `curator.py` spawns a forked auxiliary agent that consolidates narrow microskills into umbrella skills and archives stale ones (30/90-day cutoffs).
- **Hermes file/module**: `agent/curator.py` (lifecycle state machine + LLM consolidation); `agent/prompt_builder.py` (`build_skills_system_prompt()` with two-tier cache)
- **LivOS equivalent**: `liv/packages/core/src/skill-types.ts` (manually authored YAML, no auto-creation); `liv/packages/core/src/prompts.ts` (static phase prompts)
- **Port verdict**: SKIP
- **Reason**: Autonomous filesystem writes with lifecycle management are high-risk on a multi-user server OS. Phase 76 seed-agent marketplace (ROADMAP line 50) covers the reusable-agent-patterns need with a curated admin-controlled approach.
- **Estimated effort**: N/A

---

**Feature**: Platform-specific prompt hints for messaging channels
- **What it does**: `PLATFORM_HINTS` dict injects channel-awareness into system prompt — how to format responses, send media, handle threading per platform (Telegram, Discord, SMS, WhatsApp, etc.).
- **Hermes file/module**: `agent/prompt_builder.py` (per-platform injection conditional on active gateway)
- **LivOS equivalent**: `livos/packages/livinityd/source/modules/ai/index.ts` system prompt — static; no channel-aware variation
- **Port verdict**: PORT
- **Reason**: `SubagentConfig.createdVia` in `subagent-manager.ts:40` already tracks the source channel. Injecting 2-3 line formatting hints would visibly improve response quality on WhatsApp (strips Markdown) vs. Telegram (supports MarkdownV2) vs. Discord (code fences).
- **Estimated effort**: S

---

## 4. Top-3 Recommended Ports

### Rank 1: Tool Guardrail Loop Detection (S effort, high ROI)

**Why**: LivOS agents run up to 25 turns (`sdk-agent-runner.ts:199`). A tool failing identically every turn (wrong path, permission denied, network timeout) currently runs to the turn limit and burns the full token budget with no useful output. This is a frequent failure mode in practice. The pattern is production-proven in hermes.

**What to port**: Add a `Map<string, number>` failure tracker inside `LivAgentRunner` (`liv/packages/core/src/liv-agent-runner.ts`). On each `tool_snapshot` emit with `status: 'error'`, increment the counter keyed on `toolName`. At `sameToolFailureHalt=8` (default, tunable via `LivAgentRunnerOptions`), emit a `ChunkType.error` chunk with a guardrail message and call `sdkRunner.removeAllListeners?.()` to stop the run. Classify tools as mutating vs. idempotent via string-match on tool name. The sacred file (`sdk-agent-runner.ts`) is not touched.

**Integration risks**: `LivAgentRunner` gets tool outcomes via the `'liv:tool_result'` event bridge (documented at `liv-agent-runner.ts:43-59`) — `tool_use_id` is the key there. Failure counting should key on `toolName` (extracted from the matching snapshot) rather than `tool_use_id` to avoid count reset when the agent retries with a fresh tool call ID. Keep `hard_stop_enabled` off by default (warn-only) to avoid false aborts on legitimately retried tools.

---

### Rank 2: LLM-based Context Summarization (M effort, prevents silent task-state loss)

**Why**: `ContextManager` today truncates oldest messages at 75% — this silently drops earlier task context. For long computer-use sessions or multi-step research tasks, the agent loses its own earlier findings and re-does work. Hermes's structured-section approach (Active Task / Completed Actions / Remaining Work) preserves semantic continuity. The interface slot already exists: `SummarizationStrategy` is a typed parameter with a comment explicitly calling LLM summarization a "deferred backlog item" (`context-manager.ts:6-10`).

**What to port**: Implement `'claude-haiku-summary'` branch in `ContextManager.checkAndMaybeSummarize()`. Use the haiku tier via the existing broker subscription path — no API key needed. Adopt hermes's section template and `[CONTEXT COMPACTION — REFERENCE ONLY]` prefix. Lower trigger threshold from 75% to 50%. For re-compression, replace the previous summary section rather than summarizing the summary (hermes's iterative update approach).

**Integration risks**: The broker haiku call adds ~1-3s latency mid-run. The compression fires inside `LivAgentRunner`'s per-iteration hook (Plan 73-03). If the call hangs, the run stalls. Mitigate with a 10s timeout falling back to truncate-oldest. The 4-chars-per-token heuristic (`context-manager.ts:19`) may fire at 50% earlier than the actual model window — expose `contextThresholdPercent` in `LivAgentRunnerOptions` to tune per-tier.

---

### Rank 3: Platform-Specific Prompt Hints (S effort, direct UX win on messaging channels)

**Why**: `SubagentManager` routes LivOS agent responses to WhatsApp, Telegram, Discord, and Slack. All channels currently receive identical formatting. WhatsApp strips Markdown asterisks (renders as literal `*bold*`); Telegram supports MarkdownV2 with escaping rules; Discord uses triple-backtick code fences. Formatting garbling is a friction point that costs user trust on non-web channels. This is a pure string-injection change with zero architectural risk.

**What to port**: Create `liv/packages/core/src/platform-hints.ts` mapping `SubagentConfig['createdVia']` values to 2-3 line hint strings (adapted from hermes's `PLATFORM_HINTS` dict in `agent/prompt_builder.py`). Add optional `platformHint?: string` to `AgentConfig`. In `SdkAgentRunner.run()` at the `contextPrefix` injection point (line 316-317), prepend the platform hint to the task body. Wire from `SubagentManager` dispatch using the stored `createdVia` value.

**Integration risks**: Minimal — the `contextPrefix` injection is already tested and additive. Risk is hint strings becoming stale if platforms change formatting rules. Keep hints short and use a single constant file so they are easy to audit and update.

---

## 5. Out-of-Scope Items

**Multi-provider model switching** (OpenRouter, Bedrock, Gemini, Anthropic raw API): All hermes provider adapters (`agent/anthropic_adapter.py`, `agent/bedrock_adapter.py`, etc.) require raw API keys. LivOS is subscription-only Claude via the broker path. Hard constraint #2 from PROMPT.md — skip entirely.

**Autonomous skill creation and curation**: `agent/curator.py` writes and archives files to the host filesystem autonomously. On a multi-user server OS this creates cross-user filesystem access risks and unpredictable resource usage at session start. Phase 76 seed-agent marketplace already addresses the reusable-agent-patterns need with a safer admin-controlled approach.

**cwd project context file discovery** (`.hermes.md`, `CLAUDE.md`, `.cursorrules`): This is a coder-workflow pattern with no relevance to LivOS's server management use case. Also introduces prompt-injection risk from arbitrary host files in a multi-user context.

**Seven terminal backends** (Singularity, Modal, Daytona, Vercel Sandbox, SSH): LivOS targets a single Mini PC with Docker. Serverless hibernation and remote execution backends are architectural mismatches.

---

## 6. Open Questions for the User

1. **Context summarization model tier**: Should the LLM compression call use the active agent's tier (sonnet) or always fall back to haiku for cost predictability? Haiku is faster and cheaper but may miss nuance in complex multi-step computer-use sessions.

2. **Guardrail hard-stop vs. warn-only**: Should the tool failure guardrail hard-abort the run at threshold (safer for production, prevents runaway spending) or emit a warning and continue (less disruptive but still wastes turns)? Starting warn-only with a config flag seems prudent.

3. **Cross-session memory scope in multi-user**: Should recall be per-user only, or can admin-role sessions see conversation history across all users for server-management purposes? This is both a product and privacy question.

4. **Platform hint string authorship**: LivOS's gateway covers WhatsApp, Telegram, Discord, Slack, and Matrix. Should hints be hardcoded strings (fast, low maintenance) or admin-configurable per-instance via Redis Settings UI (flexible but adds P78 scope)?

5. **Streaming context scrubber priority**: Hermes's `StreamingContextScrubber` prevents `<memory-context>` fence tags from leaking to the UI mid-stream. Is this required for v1 of the memory recall port, or is a simpler SSE-handler regex filter acceptable as a temporary measure?
