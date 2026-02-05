# Requirements: Nexus Agent Framework

**Defined:** 2026-01-26
**Core Value:** Gemini autonomously solves complex multi-step tasks via ReAct loop, with modular skills loaded from files.

## v1 Requirements

### Tool Registry

- [x] **TOOL-01**: Existing handlers (shell, docker, pm2, sysinfo, files, docker-exec, docker-manage) auto-registered as tools with JSON schema
- [x] **TOOL-02**: Tool interface defines name, description, parameters (JSON schema), and execute function
- [x] **TOOL-03**: Tools discoverable by agent — agent receives tool list with descriptions in system prompt
- [x] **TOOL-04**: Tool execution returns structured result (success, output, error) that feeds back into agent loop
- [x] **TOOL-05**: Skills can register custom tools at load time

### Agent Loop

- [x] **AGENT-01**: ReAct loop implementation (Observe → Think → Act → Check → Repeat)
- [x] **AGENT-02**: Gemini receives conversation history + tool results as context each turn
- [x] **AGENT-03**: Agent decides between: call a tool, delegate to subagent, or return final answer
- [x] **AGENT-04**: Max turns limit (configurable, default 10) prevents infinite loops
- [x] **AGENT-05**: Token budget tracking — agent knows remaining budget
- [x] **AGENT-06**: Agent scratchpad/working memory persists across turns within a task
- [x] **AGENT-07**: Error observation — agent sees tool errors and can adjust approach
- [x] **AGENT-08**: Final answer extraction — agent signals completion with structured response

### Skill System

- [x] **SKILL-01**: Skills loaded from `skills/` directory at startup
- [x] **SKILL-02**: Skill file format: YAML frontmatter + TypeScript/JavaScript handler
- [x] **SKILL-03**: Frontmatter fields: name, description, tools (granted), triggers (patterns/keywords), model_tier
- [x] **SKILL-04**: Skill handler receives context (intent, params, agent tools) and returns result
- [x] **SKILL-05**: Skills can define custom tools that register into the tool registry
- [x] **SKILL-06**: Skill auto-discovery — new files in skills/ detected and loaded
- [x] **SKILL-07**: Skill triggers — pattern matching routes messages to specific skills before AI classification

### Subagent System

- [x] **SUB-01**: Main agent can spawn focused subagents for subtasks
- [x] **SUB-02**: Subagent has its own ReAct loop with scoped tool access
- [x] **SUB-03**: Subagent result returns to parent agent as observation
- [x] **SUB-04**: Subagent inherits parent's Redis context but has isolated scratchpad

### Integration

- [x] **INT-01**: Existing MCP tools continue working (backward compatible)
- [x] **INT-02**: Existing WhatsApp bot continues working
- [x] **INT-03**: Router falls through to agent loop when no direct handler matches
- [x] **INT-04**: MCP tools can trigger agent mode for complex tasks
- [x] **INT-05**: Agent results stored in Redis for MCP polling (existing pattern)

### Safety

- [x] **SAFE-01**: Max turns enforced per agent invocation
- [x] **SAFE-02**: Token budget per task (configurable)
- [x] **SAFE-03**: Tool permission system — skills declare which tools they need
- [x] **SAFE-04**: Shell command blocklist enforced within agent loop
- [x] **SAFE-05**: Agent loop timeout (max wall-clock time per task)

## v2 Requirements — Autonomous Evolution

### Persistent SubAgent Registry (Phase 7)

- [ ] **PSUB-01**: SubAgent data model — id, name, purpose, tools, skills, schedule, status, config, state
- [ ] **PSUB-02**: Redis-backed persistence — subagents survive daemon restarts (Hash: `nexus:subagent:{id}`)
- [ ] **PSUB-03**: CRUD operations — create, read, update, delete subagents via API and tools
- [ ] **PSUB-04**: `subagent_create` tool — AI programmatically creates subagents with purpose + tool scope
- [ ] **PSUB-05**: `subagent_list` / `subagent_manage` tools — list, start, stop, pause, delete subagents
- [ ] **PSUB-06**: Each subagent gets scoped AgentLoop with custom system prompt derived from purpose

### Advanced Scheduler & Loop Engine (Phase 8)

- [ ] **SCHED-01**: Cron expression support — standard 5-field cron + human-friendly parsing
- [ ] **SCHED-02**: BullMQ repeatable jobs linked to subagent IDs with timezone support
- [ ] **SCHED-03**: Schedule management tools — add, modify, remove, pause/resume via WhatsApp
- [ ] **SCHED-04**: Loop mode — skills run continuously with configurable interval and stop conditions
- [ ] **SCHED-05**: Failed run handling — retry with backoff, alert user, auto-pause after N failures
- [ ] **SCHED-06**: Run history — last N runs per subagent with result summary and token usage

### Agent Communication (Phase 9)

- [ ] **COMM-01**: WhatsApp routing — `!agent:name <message>` routes to specific subagent
- [ ] **COMM-02**: Default routing preserved — `!message` goes to main agent
- [ ] **COMM-03**: Agent-to-agent messaging via Redis — agents can send tasks to each other
- [ ] **COMM-04**: Subagent responses tagged with `[agent-name]` prefix in WhatsApp
- [ ] **COMM-05**: Per-subagent conversation history — each subagent maintains its own context

### Dynamic Skill Generation (Phase 10)

- [ ] **SKILLGEN-01**: Skill template system — parameterized templates for common skill patterns
- [ ] **SKILLGEN-02**: `skill_generate` tool — AI writes new skill file from user description
- [ ] **SKILLGEN-03**: Skill validation — frontmatter parse, handler export check, tool reference verify
- [ ] **SKILLGEN-04**: Auto-save + hot-reload — generated skills saved to `skills/` and loaded via fs.watch
- [ ] **SKILLGEN-05**: Safety — generated skills can only use registered tools, no arbitrary code execution

### Professional Memory System (Phase 11)

- [ ] **MEM-01**: Structured memory types — episodic (events), semantic (facts), procedural (how-to)
- [ ] **MEM-02**: Enhanced Cognee API — graph queries, relationship extraction, category filtering
- [ ] **MEM-03**: Memory consolidation — periodic summarization of old episodic memories
- [ ] **MEM-04**: Memory-guided decisions — agent checks memory BEFORE acting (enforced in prompts)
- [ ] **MEM-05**: Self-updating purpose — agent reviews conversation history periodically, updates goals
- [ ] **MEM-06**: Memory decay — access-frequency-based ranking, unused memories deprioritized
- [ ] **MEM-07**: Structured tag system — `approach:`, `preference:`, `fact:`, `skill:` prefixes

### Research & Performance Optimization (Phase 12)

- [ ] **PERF-01**: Container sandbox — agent spawns Docker containers for risky/isolated execution
- [ ] **PERF-02**: Parallel research — concurrent web_search + scrape operations
- [ ] **PERF-03**: Research cache — Redis-based, 1h TTL, deduplication of identical queries
- [ ] **PERF-04**: Prompt optimization — reduce redundancy, merge similar prompts, minimize token waste
- [ ] **PERF-05**: Fast path — simple queries bypass full agent loop, answered in <2s
- [ ] **PERF-06**: Container tools — agent can start/use Docker containers (Node REPL, Python sandbox)

### GitHub Release (Phase 13)

- [ ] **GH-01**: README.md with architecture diagram, quick start, full feature list
- [ ] **GH-02**: Docker Compose one-command setup + .env.example + setup wizard
- [ ] **GH-03**: Docs — contributing guide, skill development tutorial, API reference

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web UI / Dashboard | WhatsApp + CLI + MCP sufficient |
| npm-based skill packages | File-based loading is the design choice |
| Multi-server orchestration | Single server scope |
| Paid skill marketplace | Open source first |
| Kubernetes integration | Docker + PM2 sufficient |
| Visual workflow builder | Code-first approach |
| Multi-LLM support | Gemini-only for v2, abstract in v3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOOL-01 — TOOL-05 | Phase 1, 3 | Done |
| AGENT-01 — AGENT-08 | Phase 2 | Done |
| SKILL-01 — SKILL-07 | Phase 3 | Done |
| SUB-01 — SUB-04 | Phase 4 | Done |
| INT-01 — INT-05 | Phase 5 | Done |
| SAFE-01 — SAFE-05 | Phase 6 | Done |
| PSUB-01 — PSUB-06 | Phase 7 | Pending |
| SCHED-01 — SCHED-06 | Phase 8 | Pending |
| COMM-01 — COMM-05 | Phase 9 | Pending |
| SKILLGEN-01 — SKILLGEN-05 | Phase 10 | Pending |
| MEM-01 — MEM-07 | Phase 11 | Pending |
| PERF-01 — PERF-06 | Phase 12 | Pending |
| GH-01 — GH-03 | Phase 13 | Pending |

**Coverage:**
- v1 requirements: 33 total → 33 Done ✓
- v2 requirements: 38 total → 0 Done
- Total: 71 requirements

---
*Requirements defined: 2026-01-26*
*v2 requirements added: 2026-01-26*
