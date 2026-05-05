# Roadmap: Nexus Agent Framework

**Created:** 2026-01-26
**Milestone:** v2 — Autonomous Evolution
**Phases:** 13 (v1: 1-6 COMPLETE, v2: 7-13)
**Total Requirements:** 33 (v1) + 38 (v2) = 71

---

## v1 — Agent Foundation (COMPLETE)

### Phase 1: Tool Registry ✓
### Phase 2: Agent Loop (ReAct) ✓
### Phase 3: Skill System ✓
### Phase 4: Subagent System ✓
### Phase 5: Integration ✓
### Phase 6: Safety & Hardening ✓

---

## v2 — Autonomous Evolution

### Phase 7: Persistent SubAgent Registry

**Goal:** Main agent can CREATE, MANAGE, and DESTROY persistent subagents that survive restarts, each with their own purpose, tools, skills, and schedule.

**Requirements:** PSUB-01, PSUB-02, PSUB-03, PSUB-04, PSUB-05, PSUB-06

**Success Criteria:**
1. SubAgent model with: id, name, purpose, tools, skills, schedule, status, config, state
2. Redis-backed persistence — subagents survive daemon restarts
3. CRUD operations: create, read, update, delete subagents
4. `subagent_create` tool — AI can create subagents programmatically
5. `subagent_list` tool — list all registered subagents with status
6. `subagent_manage` tool — start, stop, pause, resume, delete subagents
7. Each subagent gets its own scoped AgentLoop with custom system prompt
8. WhatsApp commands: `!agent create`, `!agent list`, `!agent delete`

**Files likely modified:**
- `packages/core/src/subagent-registry.ts` (NEW — SubAgent model + CRUD)
- `packages/core/src/daemon.ts` (register subagent tools, load registry at startup)
- `packages/core/src/skill-types.ts` (add subagent context to SkillContext)

---

### Phase 8: Advanced Scheduler & Loop Engine

**Goal:** SubAgents can run on cron schedules (daily, hourly, weekly) and in continuous loops. The scheduler is the engine that drives recurring autonomous work.

**Requirements:** SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05, SCHED-06

**Success Criteria:**
1. Cron expression support: `"0 9 * * *"` (daily at 9am), `"*/6 * * *"` (every 6h), `"0 9 * * 1"` (weekly Monday)
2. Human-friendly schedule parsing: "every day at 9am", "every 6 hours", "weekly on Monday"
3. BullMQ repeatable jobs linked to subagent IDs
4. Schedule management: add, modify, remove, pause/resume schedules
5. Loop mode: skills that run continuously with configurable interval and stop conditions
6. Failed run handling: retry with backoff, alert user after N failures, auto-pause
7. Run history: last N runs stored with result summary and token usage
8. WhatsApp: `!schedule leadgen daily at 9am`, `!schedule list`, `!schedule pause leadgen`

**Files likely modified:**
- `packages/core/src/scheduler.ts` (REWRITE — advanced cron, subagent integration)
- `packages/core/src/loop-engine.ts` (NEW — continuous loop execution)
- `packages/core/src/daemon.ts` (schedule tools, loop startup)

---

### Phase 9: Agent Communication & WhatsApp Routing

**Goal:** Users can chat directly with specific subagents via WhatsApp. Agents can communicate with each other. Messages are routed to the right agent based on context.

**Requirements:** COMM-01, COMM-02, COMM-03, COMM-04, COMM-05

**Success Criteria:**
1. WhatsApp routing: `!agent:leadgen <message>` routes to leadgen subagent
2. Default routing: `!<message>` goes to main agent (existing behavior preserved)
3. Agent-to-agent messaging via Redis: agent A can send task to agent B
4. Subagent responses tagged with agent name in WhatsApp
5. Conversation context per subagent — each subagent has its own history
6. Main agent can delegate work to subagents mid-conversation

**Files likely modified:**
- `packages/whatsapp/src/index.ts` (agent routing prefix parsing)
- `packages/core/src/daemon.ts` (route to specific subagent)
- `packages/core/src/subagent-registry.ts` (add messaging capabilities)

---

### Phase 10: Dynamic Skill Generation

**Goal:** The AI can analyze a user request, realize it needs a new skill, write the skill code, validate it, save it to disk, and hot-reload it — fully autonomous skill creation.

**Requirements:** SKILLGEN-01, SKILLGEN-02, SKILLGEN-03, SKILLGEN-04, SKILLGEN-05

**Success Criteria:**
1. Skill template system with placeholders for name, description, triggers, tools, handler logic
2. `skill_generate` tool — AI writes a new skill based on user description
3. Skill validation: parse YAML frontmatter, check handler export, verify tool references
4. Generated skills saved to `skills/` directory and hot-reloaded automatically
5. Skill versioning: skill files include version in frontmatter, upgrades preserve data
6. Safety: generated skills can ONLY use tools from the existing registry (no arbitrary code)
7. User approval flow via WhatsApp before activating generated skill

**Files likely modified:**
- `packages/core/src/skill-generator.ts` (NEW — template + generation + validation)
- `packages/core/src/daemon.ts` (register skill_generate tool)
- `skills/_templates/` (enhanced templates for generation)

---

### Phase 11: Professional Memory System

**Goal:** Transform basic Cognee add/search into a structured, categorized, self-consolidating memory system that makes the agent genuinely smarter over time.

**Requirements:** MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06, MEM-07

**Success Criteria:**
1. Structured memory types: episodic (events), semantic (facts), procedural (how-to)
2. Enhanced Cognee API: graph queries, relationship extraction, category filtering
3. Memory consolidation: periodic summarization of old episodic memories
4. Memory-guided decisions: agent checks memory BEFORE acting (enforced in prompts)
5. Self-updating agent purpose: agent reviews conversation history periodically, updates its own goals and user preferences in memory
6. Memory decay: old, unused memories ranked lower; frequently-accessed memories boosted
7. Structured tags: `approach:deploy`, `preference:user`, `fact:server`, `skill:learned`

**Files likely modified:**
- `packages/memory/src/server.py` (ENHANCE — new endpoints, structured types)
- `packages/core/src/daemon.ts` (enhanced memory tools)
- `packages/core/src/prompts.ts` (memory-first patterns in system prompts)
- `packages/core/src/agent.ts` (memory check before execution)

---

### Phase 12: Research & Performance Optimization

**Goal:** Faster, smarter research with container-based sandboxing. Leaner prompts. Parallel execution. Remove bloat.

**Requirements:** PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06

**Success Criteria:**
1. Container-based sandboxed execution: agent spawns Docker containers for risky commands
2. Parallel web research: multiple searches/scrapes run concurrently
3. Research caching: identical queries return cached results (Redis, 1h TTL)
4. Prompt optimization: remove redundant instructions, merge similar prompts, reduce token waste
5. Response speed: simple queries answered in <2s (fast path optimization)
6. Agent can start/use Docker containers as tools (e.g., spin up a Node REPL, Python sandbox)

**Files likely modified:**
- `packages/core/src/container-sandbox.ts` (NEW — Docker-based sandbox)
- `packages/core/src/prompts.ts` (optimize all prompts)
- `packages/core/src/daemon.ts` (parallel research, caching, container tools)
- `packages/core/src/agent.ts` (fast path for simple queries)

---

### Phase 13: GitHub Release Preparation

**Goal:** Make Nexus a professional, well-documented open-source project ready for GitHub publication.

**Requirements:** GH-01, GH-02, GH-03

**Success Criteria:**
1. Comprehensive README.md with architecture diagram, quick start, feature list
2. Docker Compose one-command setup: `docker compose up` starts everything
3. Interactive setup wizard: `npx nexus setup` configures API keys, Redis, services
4. Example skills with documentation
5. Contributing guide and skill development tutorial
6. Environment template (.env.example) with all configurable options
7. CI/CD: GitHub Actions for build, lint, test
8. License (MIT)

**Files likely modified:**
- `README.md` (NEW — comprehensive documentation)
- `docker-compose.yml` (NEW — full stack compose)
- `setup.ts` (ENHANCE — interactive wizard)
- `docs/` (NEW — guides, tutorials, API reference)
- `.github/workflows/` (NEW — CI/CD)
- `.env.example` (NEW)

---

## v2 Build Order & Dependencies

```
Phase 7 (SubAgent Registry) ← Foundation for v2
    ↓
Phase 8 (Scheduler + Loops) ← Depends on SubAgent Registry
    ↓
Phase 9 (Communication) ← Depends on SubAgent Registry
    ↓
Phase 10 (Skill Generation) ← Depends on Skill System (v1)
    ↓
Phase 11 (Memory System) ← Depends on existing Memory service
    ↓
Phase 12 (Optimization) ← Depends on everything above
    ↓
Phase 13 (GitHub Release) ← Final, depends on all phases
```

Phases 8, 9, 10 can run in parallel after Phase 7.
Phase 11 can run in parallel with 8-10.
Phase 12 depends on 7-11.
Phase 13 is always last.

**Recommended execution order:** 7 → 8 → 9 → 10 → 11 → 12 → 13

---
*Roadmap created: 2026-01-26*
*v2 milestone added: 2026-01-26*
