# AI Marketplace & Orchestration: Repository Research

**Researched:** 2026-03-28
**Researcher:** Technical Researcher Agent
**Purpose:** Design Livinity AI marketplace and orchestration system
**Overall Confidence:** HIGH

---

## Summary

Three foundational repositories were analyzed for their architectural patterns, agent definitions, orchestration models, and reusable components relevant to building a Livinity AI agent marketplace. Together they represent the current state of the art for Claude Code-native AI agent systems.

---

## Repository 1: get-shit-done (GSD)

**Citation:** [1] TÂCHES / gsd-build. "get-shit-done: Meta-prompting, context engineering and spec-driven development system for Claude Code." GitHub, v4.x, 2026. https://github.com/gsd-build/get-shit-done

**Stats:**
- Stars: 44,100 | Forks: 3,600
- License: MIT
- Primary language: TypeScript
- Node.js requirement: >=20.0.0
- SDK dependency: `@anthropic-ai/claude-agent-sdk` v0.2.84

### Architecture

GSD is a meta-prompting orchestration framework that lives entirely inside `.claude/` as markdown command files and agent definitions. It does not run a separate server. Instead, it hooks into Claude Code's native agent execution system via two mechanisms:

1. **Slash commands** (`/gsd:*`): 57 `.md` files in `commands/gsd/` that Claude Code reads and executes as slash command definitions. Each file contains an orchestrator prompt telling Claude Code how to spawn subagents, manage state, and sequence work.

2. **Named agents** (`agents/*.md`): 18 `.md` files that define specialized subagent personas. Claude Code can spawn these by name using the `Task` tool or `Agent` tool. Each file defines the agent's tools, model color (for UI), and detailed behavioral instructions.

3. **Headless SDK** (`sdk/`): A programmatic TypeScript interface wrapping `@anthropic-ai/claude-agent-sdk` for running GSD plans autonomously without human interaction. Entry point: `dist/index.js`.

### Phase Management System

GSD organizes all work into a nested structure: **Workspace** > **Milestone** > **Phase** > **Plan** > **Task**.

Each level has corresponding files:
```
.planning/
  PROJECT.md           # Project vision (always in context)
  REQUIREMENTS.md      # Scoped features per milestone
  ROADMAP.md           # Phase list with status
  STATE.md             # Cross-session decisions and blockers
  config.json          # Workflow toggles and model profile
  research/
    STACK.md           # Technology choices (from researcher)
    FEATURES.md        # Feature landscape (from researcher)
    ARCHITECTURE.md    # System design (from researcher)
    PITFALLS.md        # Known gotchas (from researcher)
    SUMMARY.md         # Synthesized research (from synthesizer)
  phases/
    {N}-{name}/
      {N}-CONTEXT.md   # Locked decisions from discuss phase
      {N}-RESEARCH.md  # Phase-specific research
      {N}-01-PLAN.md   # Executable plan for plan 1
      {N}-01-SUMMARY.md # What was actually built
      {N}-VERIFICATION.md # What was actually verified
```

File sizes are deliberately kept under Claude's quality-degradation threshold. This is explicit design: the system knows that context bloat degrades output quality, so it fragments state into small files that are loaded selectively.

### Multi-Agent Orchestration Model

GSD uses a **thin orchestrator / fat subagents** pattern. The orchestrator (`/gsd:execute-phase`) does minimal work: reads plans, analyzes dependency DAGs, organizes plans into waves, spawns subagents for each plan with fresh 200k-token contexts. It never accumulates context from the work itself.

Wave execution example:
- Wave 1: Plans A and B (independent) execute in parallel
- Wave 2: Plan C (depends on A and B) executes after wave 1 completes
- Wave 3: Plans D and E execute in parallel after wave 2

Each subagent receives a clean context window containing only: the PLAN.md for its assigned plan + relevant context files. This is the core innovation—parallel execution with no shared mutable state between subagents.

The orchestration pipeline per phase:
```
Discuss Phase  -> CONTEXT.md (locked decisions)
     |
Plan Phase     -> gsd-phase-researcher (+ MCP tools: Context7, Firecrawl, Exa)
     |              -> RESEARCH.md
     |           -> gsd-planner (reads RESEARCH.md)
     |              -> {N}-01-PLAN.md, {N}-02-PLAN.md, ...
     |           -> gsd-plan-checker (validates plans meet requirements)
     |              -> loop until passing or max iterations
     |
Execute Phase  -> Dependency analysis
     |           -> Wave grouping
     |           -> gsd-executor (per plan, fresh context)
     |              -> {N}-01-SUMMARY.md
     |
Verify Phase   -> gsd-verifier
     |              -> {N}-VERIFICATION.md (goal-backward, not task-backward)
     |
Ship Phase     -> PR creation
```

### Agent Definitions: File Format

Each agent file in `agents/` uses this structure:
```markdown
---
name: gsd-executor
tools: Read, Write, Edit, Bash, Grep, Glob
color: yellow
permissionMode: acceptEdits
---

[Multi-section behavioral instructions covering:]
- Core Identity (what the agent is and when it's spawned)
- Execution Flow (numbered steps)
- Decision Rules (how to handle deviation from plan)
- Checkpoint Protocol (when to pause for human input)
- Output Format (what files to create, what to return to orchestrator)
- Guardrails (what to avoid)
```

The agent format is pure markdown with YAML frontmatter for metadata. Tool lists are comma-separated strings. No JSON required.

### Key Agents

| Agent | Purpose | Tools | Model Hint |
|-------|---------|-------|------------|
| `gsd-executor` | Implements plan tasks, atomic commits | Read, Write, Edit, Bash, Grep, Glob | Yellow |
| `gsd-planner` | Creates PLAN.md files from research | Read, Write, Bash, Grep, Glob | (default) |
| `gsd-phase-researcher` | Researches implementation patterns | Read, Write, Bash, Grep, Glob, WebSearch, Context7, Firecrawl, Exa | Cyan |
| `gsd-verifier` | Goal-backward verification of delivered work | Read, Write, Bash, Grep, Glob | (default) |
| `gsd-debugger` | Root-cause investigation with scientific method | Read, Write, Edit, Bash, Grep, Glob, WebSearch | (default) |
| `gsd-plan-checker` | Validates plans meet phase requirements | Read, Write | (default) |
| `gsd-research-synthesizer` | Synthesizes 4 parallel research outputs | Read, Write | (default) |
| `gsd-roadmapper` | Creates phased development roadmap | Read, Write | (default) |
| `gsd-codebase-mapper` | Maps existing codebase before planning | Read, Bash, Grep, Glob | (default) |
| `gsd-ui-auditor` | UI/UX design review | Read, Bash, Grep, Glob | (default) |

### Research Parallelism

For `/gsd:new-project`, four researchers run simultaneously:
1. `gsd-advisor-researcher` — Stack research (which technologies, versions)
2. `gsd-phase-researcher` (FEATURES role) — Feature landscape
3. `gsd-phase-researcher` (ARCHITECTURE role) — System architecture patterns
4. `gsd-phase-researcher` (PITFALLS role) — Common gotchas

Then `gsd-research-synthesizer` reads all four outputs and creates SUMMARY.md.

This is directly reusable for a Livinity marketplace agent that researches installation requirements before deploying an agent package.

### Verification Philosophy

The verifier's key principle: **"Do NOT trust SUMMARY.md claims. Verify what actually exists in the code."** This adversarial stance—treating the implementation agent's own reports as unverified—is novel and produces more reliable output than trusting self-reports.

Artifact verification uses four levels:
1. **Exists** — file/function is present
2. **Substantive** — it has real implementation (not empty stub)
3. **Wired** — it's connected to other components
4. **Data-flow** — data actually flows through it end-to-end

### Config System

`.planning/config.json` controls:
- `model_profile`: quality/balanced/budget/inherit
- `workflow.research_agents`: boolean
- `workflow.plan_checking`: boolean
- `workflow.verification_agents`: boolean
- `workflow.auto_advance`: boolean
- `git.strategy`: none/phase/milestone

### Code Quality Assessment

- **Testing:** `vitest` with 70% line coverage gate, unit + integration test split
- **Documentation:** Excellent — multilingual READMEs (5 languages), CHANGELOG, CONTRIBUTING
- **Security:** Path traversal prevention, prompt injection detection, shell argument sanitization
- **Maintenance:** Highly active — 44k stars, commercial backing by TÂCHES

### What GSD Does NOT Have

- No web UI for browsing agents
- No versioning/distribution system for agents
- No marketplace or discovery mechanism
- No dependency management between agents
- No runtime isolation between agent executions
- No multi-user access control

---

## Repository 2: claude-code-templates

**Citation:** [2] davila7. "claude-code-templates: Ready-to-use configurations for Claude Code." GitHub, v1.28.3, 2026. https://github.com/davila7/claude-code-templates | https://aitmpl.com

**Stats:**
- Stars: 23,700 | Forks: 2,300
- License: MIT
- Primary language: Python (46.5%), JavaScript (15.9%)
- 1,019 commits | 67 issues | 19 releases
- Sponsors: Z.AI, Neon, Vercel OSS, Anthropic OSS

### Architecture

claude-code-templates is a **distribution and installation system** for Claude Code components. It solves the discovery and installation problem that GSD does not address. The architecture has three layers:

1. **CLI tool** (`cli-tool/`): Python + Node.js tool that installs components from the repo into a user's local `.claude/` directory. Interactive TUI or targeted `--flag` arguments.

2. **Component registry** (`cli-tool/components/`): Flat-file registry organized by type and category. Each component is a markdown file with YAML frontmatter.

3. **Web interface** (`dashboard/`): Beta web UI at `aitmpl.com` for browsing templates before installing.

### Component Registry Structure

The registry uses a hierarchical path: `{type}/{category}/{component-name}.md`

Types: `agents/`, `commands/`, `mcps/`, `settings/`, `hooks/`, `skills/`

**agents/** — 27 categories, 100+ agent files:
```
agents/
  ai-specialists/           (8 agents: ai-ethics-advisor, llm-architect, etc.)
  development-team/         (18 agents: backend-developer, frontend-developer, etc.)
  development-tools/        (code-reviewer, etc.)
  deep-research-team/       (16 agents: research-orchestrator, fact-checker, etc.)
  security/                 (security-auditor, penetration-tester, etc.)
  devops-infrastructure/    (devops-engineer, etc.)
  blockchain-web3/
  business-marketing/
  data-ai/
  database/
  documentation/
  expert-advisors/
  ffmpeg-clip-team/
  finance/
  game-development/
  git/
  mcp-dev-team/
  modernization/
  obsidian-ops-team/
  ocr-extraction-team/
  performance-testing/
  podcast-creator-team/
  programming-languages/
  realtime/
  ui-analysis/
  web-tools/
```

**mcps/** — 12 categories:
```
mcps/
  audio/
  browser_automation/
  database/
  deepgraph/
  deepresearch/
  devtools/
  filesystem/
  integration/
  marketing/
  productivity/
  web-data/
  web/
```

**skills/** — 26 categories:
```
skills/
  ai-maestro/
  ai-research/
  analytics/
  business-marketing/
  creative-design/
  database/
  design-to-code/
  development/
  document-processing/
  enterprise-communication/
  git/
  marketing/
  media/
  pocketbase/
  productivity/
  railway/
  scientific/
  security/
  sentry/
  sports/
  utilities/
  video/
  web-data/
  web-development/
  workflow-automation/
```

### Agent File Format

The agent file format follows a standard structure:

```markdown
---
name: backend-developer
description: >
  Senior backend developer specializing in Node.js, Python, and Go.
  Use this agent when you need to build APIs, implement database schemas,
  or design microservices. Examples: building REST endpoints, optimizing
  queries, implementing auth flows.
tools: Read, Write, Edit, Bash, Glob, Grep
model: claude-sonnet-4-5
---

[System prompt content]

You are a senior backend developer with expertise in...

## Core Competencies
- [Checklist items for each domain]

## Operational Workflow
### Phase 1: System Analysis
### Phase 2: Service Development
### Phase 3: Production Readiness

## Communication Protocol
Before implementation, query context manager with:
{
  "request": "context",
  "domain": "[specific area]",
  "scope": "[component type]"
}
```

Key frontmatter fields:
- `name`: kebab-case identifier
- `description`: Used by Claude Code's agent selection logic. Must start with "Use this agent when..." to enable automatic invocation.
- `tools`: Comma-separated list
- `model`: Optional model override

The `description` field is critical for the marketplace use case: Claude Code reads this field to decide which agent to invoke automatically based on the task at hand. Well-crafted descriptions with concrete examples enable zero-configuration automatic routing.

### MCP Configuration Format

MCPs are defined as JSON `mcpServers` objects:

```json
{
  "mcpServers": {
    "postgresql": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_URL": "${POSTGRES_URL}",
        "TIMEOUT": "30000"
      }
    }
  }
}
```

The `.mcp.json` in the repo root shows real MCP integrations:
- Linear: `npx -y mcp-remote https://mcp.linear.app/mcp` (remote via HTTP)
- Neon database: `https://mcp.neon.tech/mcp` (direct HTTP endpoint)

This is directly applicable to Livinity: every marketplace agent package could include an `.mcp.json` defining the MCP servers it needs, and the installer would merge these into the user's global MCP config.

### Skill File Format

Skills are distinct from agents. From the documentation: "reusable capabilities with progressive disclosure." Skills are loaded as SKILL.md files (~130 lines max) and read into an agent's context to extend its capabilities without spawning a new agent. GSD's phase researcher explicitly checks for `.claude/skills/` on startup.

Skills represent a third tier: Agent (full system prompt + dedicated context) > Skill (loaded behavior extension) > Command (one-shot instruction).

### Deep Research Team: Multi-Agent Coordination

The `deep-research-team/` directory demonstrates a complete multi-agent workflow packaged as a category:

```
research-orchestrator.md    → Coordinator, runs the 6-phase workflow
query-clarifier.md          → Clarifies ambiguous research queries
research-brief-generator.md → Generates structured research brief
research-analyst.md         → Core analysis
academic-researcher.md      → Academic source specialist
competitive-intelligence-analyst.md → Competitive analysis
fact-checker.md             → Validates claims
search-specialist.md        → Web search and retrieval
data-researcher.md          → Quantitative data
technical-researcher.md     → Technical documentation
report-generator.md         → Final output formatting
research-synthesizer.md     → Cross-source synthesis
data-analyst.md             → Statistical analysis
nia-oracle.md               → Specialized oracle agent
agent-overview.md           → Documentation of the team
```

This is a marketplace pattern: an entire team of coordinated agents is packaged as a single category and installed together. The orchestrator knows which specialist agents exist and coordinates them. Each specialist has a clear, non-overlapping domain.

### Installation Process

```bash
# Interactive TUI
npx claude-code-templates@latest

# Targeted install
npx claude-code-templates@latest --agent development-team/backend-developer --yes

# Install MCP
npx claude-code-templates@latest --mcp database/postgresql-integration --yes

# Health check
npx claude-code-templates@latest --health-check

# Analytics monitoring
npx claude-code-templates@latest --analytics
```

The installer writes files to:
- Agents: `~/.claude/agents/{name}.md` (global) or `.claude/agents/{name}.md` (local)
- Commands: `~/.claude/commands/{name}.md`
- MCPs: Merged into `.mcp.json`
- Skills: `.claude/skills/{name}.md`
- Settings: Merged into `.claude/settings.json`
- Hooks: `.claude/hooks/{name}.sh`

### Multi-Source Attribution System

The project aggregates components from multiple communities with explicit attribution:
- K-Dense-AI: 139 scientific skills (MIT)
- Anthropic Official: 21+ skills
- obra: 14 skills
- alirezarezvani: 36 skills
- wshobson: 48 agents
- hesreallyhim: 21 commands
- mehdi-lamrani: community skills

Each component maintains original license and author attribution. This is the marketplace attribution model: components from external contributors are included with credit preserved.

### Code Quality Assessment

- **Testing:** Jest-based tests in `cli-tool/tests/`
- **Documentation:** Good — docs.aitmpl.com, README, CHANGELOG, CONTRIBUTING
- **Maintenance:** Highly active — 1,019 commits, 19 releases, active sponsorship
- **Analytics:** Real-time session monitoring, health diagnostics, conversation viewer

### What This Project Does NOT Have

- No versioning system for individual components (no semver per-component)
- No dependency declarations between components
- No compatibility metadata (which Claude Code version required)
- No paid/free tier differentiation
- No programmatic API (CLI-only distribution)
- No server-side execution or sandboxing

---

## Repository 3: claude-code-system-prompts

**Citation:** [3] Piebald-AI. "claude-code-system-prompts: All parts of Claude Code's system prompt." GitHub, v2.1.87, 2026-03-28. https://github.com/Piebald-AI/claude-code-system-prompts

**Stats:**
- Stars: 7,000 | Forks: 942
- License: (not specified)
- 248 files in `system-prompts/`
- 136 versions tracked in CHANGELOG
- Updated within minutes of each Claude Code release

### Architecture

This repository is a **reverse-engineered documentation** of Claude Code's internal system prompt architecture. The prompts are extracted from Claude Code's minified JavaScript source. It is not a framework to install—it is a reference for understanding how Claude Code itself works at the prompt level.

The key insight this repo surfaces: Claude Code does not use one system prompt. It uses **110+ distinct strings** that are conditionally assembled based on:
- Current environment (IDE, terminal, OS)
- Active mode (auto, plan, learning, minimal)
- Feature flags
- Available tools
- Session state

### Prompt Categories (248 files total)

**agent-prompts (34 files)** — System prompts for specialized subagents:
```
agent-prompt-agent-creation-architect.md   → Creates new agent definitions
agent-prompt-explore.md                    → Read-only codebase explorer (Haiku)
agent-prompt-plan-mode-enhanced.md         → Plan mode architect (read-only)
agent-prompt-verification-specialist.md   → Adversarial verifier
agent-prompt-worker-fork-execution.md      → Parallel fork worker
agent-prompt-dream-memory-consolidation.md → Memory pruning and merging
agent-prompt-conversation-summarization.md → Summarizes long conversations
agent-prompt-security-monitor-*.md        → Two-part autonomous action guard
agent-prompt-session-memory-update-instructions.md
agent-prompt-determine-which-memory-files-to-attach.md
agent-prompt-prompt-suggestion-generator-v2.md
agent-prompt-quick-git-commit.md
agent-prompt-quick-pr-creation.md
... (20+ more)
```

**system-prompts (100+ files)** — Core behavioral guidelines:
```
Tool usage (file ops, bash, search, git)
Mode specifications (auto, learning, plan, minimal)
Operational guidelines (task execution, error handling)
Output and communication (tone, conciseness)
Context management (memory, tokens, budget)
```

**system-reminders (40+ files)** — Dynamic runtime injections:
```
Plan mode activation variants
Memory file contents
Hook execution results
Token/budget status
Session continuity notifications
Tool invocation tracking
File modification warnings
```

**data files (25 files)** — Embedded reference materials:
```
Claude API references (Python, TypeScript, Go, Java, PHP, Ruby, C#, cURL)
Agent SDK patterns and reference
Tool use concepts
Claude model catalog
Streaming and batches API references
Prompt caching optimization
```

**tools (60+ files)** — Descriptions for 18 builtin tools:
```
Read, Write, Edit, Bash, Glob, Grep
TodoRead, TodoWrite
Task (subagent spawning)
WebSearch, WebFetch
NotebookRead, NotebookEdit
exit_plan_mode
```

### Structural Principles Revealed

**1. Three-tier prompt injection:**
- **Static**: Loaded once at session start (core behavioral rules, tool descriptions)
- **Mode-conditional**: Loaded when mode changes (plan mode instructions, learning mode)
- **Dynamic**: Injected during conversation as state changes (hook results, file changes, token counts)

**2. Agent definitions in Claude Code follow a standard schema:**
```json
{
  "identifier": "kebab-case-name",
  "whenToUse": "Use this agent when... [specific triggering conditions with examples]",
  "systemPrompt": "Complete second-person behavioral manual"
}
```
The `whenToUse` field (not `description`) controls automatic invocation. It must be actionable and start with "Use this agent when..." to activate Claude Code's routing logic.

**3. Fork workers vs subagents:**
Claude Code has two distinct parallel execution models:
- **Subagents** (`Task` tool): Spawn a new Claude instance with a specified system prompt and task. Full context isolation.
- **Fork workers** (`worker-fork-execution`): "Implicit fork that inherits full conversation context." Prohibited from spawning further subagents. Executes directives directly. Returns structured 500-word max report. This is lighter-weight than a full subagent.

**4. Security monitor architecture:**
The security monitor for autonomous agent actions is a two-part system (two separate prompt files) that evaluates every proposed tool use against:
- Prompt injection patterns (content from files/web trying to hijack the agent)
- Scope creep (actions beyond what the user authorized)
- Accidental damage (irreversible actions on shared infrastructure)

Default stance: **allowed**. Block only when specific threat signatures match. This "default allow" approach avoids excessive friction while catching actual attacks.

**5. Memory architecture:**
Three memory layers:
- **Session memory**: Updated by `session-memory-update-instructions.md` agent. Stores domain knowledge, user preferences, and workflow patterns.
- **Memory file selection**: `determine-which-memory-files-to-attach.md` chooses which memory files are relevant to load for the current context.
- **Dream consolidation**: `dream-memory-consolidation.md` performs multi-phase merging and pruning of memory files that have grown too large.

**6. Tool philosophy (directly quotable):**
- "Use Read tool instead of cat"
- "Use Write tool instead of cat heredoc or echo redirection"
- "Use Edit tool for targeted modifications"
- "Reserve Bash for operations requiring system interaction, not file reading"
- "Use Task tool for broader codebase exploration requiring more than 10 file reads"

**7. Plan mode: read-only constraint:**
Plan mode enhanced is strictly read-only. No file creation, modification, deletion, or state-altering commands. The agent can only read, search, and analyze. This separation between "planning agent" and "execution agent" is a hard architectural boundary.

**8. Verification specialist philosophy:**
"Your job is not to confirm the implementation works — it's to try to break it." Adversarial testing. Every check requires actual command execution with observed output. A check without a `Command run` block is counted as a skip, not a pass.

**9. Conditional rendering over monoliths:**
Recent changelog trend: large 2000+ token prompts are split into 40-70 atomic files controlled by feature flags and function variables. This enables fine-grained customization without touching core behavioral rules.

**10. Token count discipline:**
Every prompt file includes a token count. Actual session counts differ by ±20 tokens. This allows budget planning for context windows.

### Agent Creation Architect

The `agent-prompt-agent-creation-architect.md` defines exactly how Claude Code creates new agents. Output must be valid JSON:
```json
{
  "identifier": "test-runner",
  "whenToUse": "Use this agent when running test suites, validating implementations, or checking for regressions after code changes.",
  "systemPrompt": "You are a testing specialist... [full second-person behavioral manual]"
}
```

The architect follows 6 steps:
1. Extract core intent (purpose, responsibilities, success criteria)
2. Design expert persona (domain expertise that builds user confidence)
3. Architect instructions (behavioral boundaries, methodologies, edge cases, output formats)
4. Optimize performance (decision frameworks, quality controls, escalation strategies)
5. Create identifier (lowercase, numbers, hyphens only)
6. Define usage patterns (when and how to deploy)

This is the canonical format for a Livinity marketplace agent definition.

### Code Quality Assessment

- **Testing:** No test infrastructure (reference repo, not a framework)
- **Documentation:** Excellent — CHANGELOG tracking 136 versions
- **Maintenance:** Extremely active — updated within minutes of Claude Code releases
- **Accuracy:** Extracted from compiled source, not guessed

### What This Project Reveals That Others Don't

- The actual internal prompt format Claude Code uses for its own agents
- How conditional prompt assembly works (feature flags, environment detection)
- The security model for autonomous agent execution
- Memory architecture across sessions
- Fork vs subagent execution models
- Token counting methodology

---

## Cross-Repository Technical Insights

### Common Patterns

1. **Markdown-first agent definitions**: All three repos use `.md` files with YAML frontmatter. No code required to define an agent. The file IS the agent.

2. **Orchestrator/worker separation**: GSD, the deep-research-team, and Claude Code's internal agents all use the same pattern — a thin coordinator that delegates to specialized workers and never accumulates the workers' outputs in its own context.

3. **Context budget awareness**: All systems are designed around the constraint of a fixed context window. Files are sized to fit. Work is chunked. Context is protected from accumulation.

4. **Adversarial verification**: GSD's verifier and Claude Code's verification-specialist both refuse to trust self-reports. Both require actual command execution evidence.

5. **Progressive disclosure in skills**: Skills are loaded into context only when needed, rather than always present. This is a context optimization technique applicable to marketplace agents.

6. **MCP as the integration layer**: The universal integration pattern is MCP. All three repos use or reference MCP for connecting agents to external services. MCPs are the plugin system.

7. **Wave-based parallelism**: Independent tasks execute simultaneously; dependent tasks wait. This pattern appears in GSD (explicit waves), the deep-research-team (parallel research threads), and Claude Code's fork workers.

8. **`description`/`whenToUse` as the routing field**: The field that describes when an agent should be invoked is the most important field for automatic routing. Must be written in imperative "Use this agent when..." form.

### Best Practices

1. **Tools list should be minimal**: Security auditor uses `Read, Grep, Glob` only (no write access). Executor uses full toolset. Match tool permissions to agent responsibilities.

2. **Agent identity before instructions**: Every well-designed agent starts with who it is, what it's for, and what spawns it. This context shapes how the LLM interprets subsequent instructions.

3. **Output format must be explicit**: Agents that return results to orchestrators must specify the exact return format (structured JSON, specific file path, specific section headers). Vague "return results" instructions cause coordination failures.

4. **Checkpoint types for human interaction**: GSD uses three types: `human-verify` (90% frequency), `decision` (9%), `human-action` (1%, rare). For automated marketplace agents, `human-action` should be eliminated entirely.

5. **Version research data separately from code**: Research files (STACK.md, RESEARCH.md) are separate from implementation files. This enables re-research without replanning and replanning without re-researching.

6. **Atomic commits per task**: Every task completion triggers a commit. This enables bisection debugging and independent reversion without touching other tasks.

7. **Deviation rules instead of failure modes**: GSD executor has explicit deviation rules (auto-fix up to 3 attempts) rather than just failing. This increases completion rates without human intervention.

### Pitfalls to Avoid

1. **Context accumulation in orchestrators**: If the orchestrator reads all worker outputs, it fills up and degrades. GSD solves this by having the orchestrator only read completion signals, not full outputs.

2. **Trusting self-reports**: "Claude SAID it did X" is not evidence that X was done. All verification must be independent and run actual checks.

3. **Monolithic system prompts**: 2000+ token prompts are harder to maintain and test. Split into atomic files with clear responsibilities.

4. **Implicit tool access**: Agents should have explicitly scoped tool lists. A research agent should not have Write access. A verifier should not have Edit access.

5. **Missing `whenToUse` descriptions**: Without a well-crafted description, Claude Code's automatic routing cannot select the right agent. Manual invocation only.

6. **MCP config drift**: Each agent category may need different MCPs. If MCP configs are not scoped per-agent-package, users may install MCPs they don't need or miss MCPs they do need.

7. **No graceful degradation**: GSD's debug agent has explicit "inconclusive" and "checkpoint reached" states, not just "success" and "fail". Agents need graceful degradation paths.

### Emerging Trends

1. **Headless/programmatic execution**: GSD's SDK wraps `@anthropic-ai/claude-agent-sdk` to enable running agent workflows without human Claude Code sessions. This is the direction for server-side automated agents.

2. **Remote MCPs via HTTP**: Linear and Neon MCPs use `https://mcp.service.com/mcp` endpoints rather than local `npx` processes. This reduces installation complexity significantly.

3. **Agent teams as packages**: The deep-research-team pattern — packaging an entire multi-agent workflow as a single installable category — is more useful than individual agents. Users install "research team", not 16 individual agents.

4. **Conditional prompt assembly**: Claude Code's 110+ atomic prompt strings, assembled conditionally, will be the standard for production agent systems. Static monolithic prompts are a legacy pattern.

5. **Memory consolidation as a service**: Dream consolidation and session memory update as dedicated agents (not just passive storage) is emerging. Memory becomes an active system, not a passive file.

---

## Implementation Recommendations for Livinity AI Marketplace

### Scenario 1: Livinity Agent Package Format

**Recommended Solution**: Adopt the claude-code-templates agent file format with extensions for marketplace metadata.

```markdown
---
# Standard Claude Code agent fields
name: server-diagnostics
description: "Use this agent when diagnosing LivOS server issues, checking system health, analyzing logs, or investigating performance problems. Examples: 'why is my server slow', 'check disk usage', 'investigate failed service'."
tools: Read, Bash, Grep, Glob
model: claude-haiku-4-5

# Livinity marketplace extensions
version: "1.2.0"
author: "livinity-team"
category: "infrastructure"
tags: ["monitoring", "diagnostics", "linux"]
requires_mcps: ["nexus-tools"]
min_livos_version: "v20.0"
license: "MIT"
---

[System prompt]
```

**Rationale**: The base format is already Claude Code-native and works immediately. Extensions add marketplace features (versioning, discovery, compatibility gating) without breaking compatibility.

### Scenario 2: Livinity Orchestration Engine

**Recommended Solution**: Adopt GSD's thin-orchestrator / wave-execution pattern, implemented as a Nexus module.

The orchestration engine should:
1. Parse agent package dependency graphs (which agents depend on which MCPs, which agents call which sub-agents)
2. Build execution waves (independent agents in the same wave, dependent agents in subsequent waves)
3. Spawn agents using `@anthropic-ai/claude-agent-sdk` in headless mode (GSD's SDK pattern)
4. Collect completion signals and structured outputs from each agent
5. Route to next wave or to human checkpoint

The orchestrator runs in Nexus (Node.js server) as a tRPC endpoint. The browser client connects via WebSocket and receives live status updates as agents complete their waves.

**Rationale**: GSD has already solved the hardest problems (context budget management, wave execution, checkpoint handling) in production with 44k users. Adopting the architecture (not the code) avoids re-discovering these constraints.

### Scenario 3: Livinity Marketplace Registry

**Recommended Solution**: Hybrid of claude-code-templates (flat-file registry) and npm-style package metadata.

Registry structure:
```
marketplace/
  index.json              # Complete catalog with metadata for search/filter
  agents/
    {category}/
      {name}/
        agent.md          # The agent definition (Claude Code format)
        manifest.json     # Marketplace metadata (version, deps, compatibility)
        README.md         # Human-readable docs
        preview.png       # Optional screenshot/diagram
  teams/
    {team-name}/
      team.json           # Team composition (list of member agents)
      README.md
  mcps/
    {name}/
      config.json         # MCP server configuration
      manifest.json
```

The `manifest.json` includes:
```json
{
  "version": "1.0.0",
  "author": "livinity-team",
  "license": "MIT",
  "category": "infrastructure",
  "tags": ["monitoring", "diagnostics"],
  "requires": {
    "mcps": ["nexus-tools"],
    "min_livos": "20.0",
    "agents": []
  },
  "stats": {
    "installs": 0,
    "rating": 0
  }
}
```

**Rationale**: claude-code-templates proves that a flat-file registry with a CLI installer scales to 100+ components. Adding `manifest.json` per component (rather than frontmatter in the `.md`) keeps agent files clean while enabling rich marketplace features.

### Scenario 4: Agent Security Model

**Recommended Solution**: Adopt Claude Code's security monitor pattern as a Nexus middleware layer.

Before any marketplace agent executes a tool call on the Livinity server:
1. Classify the action against a block/allow ruleset (prompt injection, scope creep, infrastructure damage)
2. Allow by default — only block when a specific threat signature matches
3. Log all blocked actions with reason code
4. Surface blocked actions to the user in the activity feed

Per-agent tool scoping (from claude-code-templates pattern): the agent's `tools` frontmatter list is the maximum permission set. The Nexus tool registry enforces this — an agent cannot call a tool not in its list, even if the user's account has access.

**Rationale**: Claude Code's two-part security monitor (first part: threat classification, second part: context evaluation) is the production-tested security model for autonomous agent execution. It avoids both the Scylla of blocking everything (friction) and Charybdis of allowing everything (damage).

### Scenario 5: Verification After Agent Execution

**Recommended Solution**: Every marketplace agent execution includes a lightweight verification step using the GSD verifier's goal-backward pattern.

The verifier agent:
- Does NOT trust the executing agent's summary
- Checks observable truths (can the feature be demonstrated?)
- Verifies artifacts (files created, configs written, services started)
- Reports pass/fail/gaps to the orchestrator
- Gaps trigger the orchestrator to spawn a gap-closure run

This should be opt-in at install time: users can choose "verified" (slower, more reliable) vs "fast" (no verification step) execution modes.

**Rationale**: For self-hosted server management, an agent silently failing to configure a firewall rule is worse than a failed installation. Verification adds one agent turn but catches 80% of silent failures.

---

## Directly Reusable Components

The following components from these repositories can be adopted or adapted for Livinity with minimal transformation:

| Component | Source | What to Adopt |
|-----------|--------|---------------|
| Agent file format (.md + YAML frontmatter) | claude-code-templates | Use as the canonical format for all Livinity marketplace agents |
| `description: "Use this agent when..."` pattern | Piebald-AI / claude-code-templates | Use exactly for all agent definitions to enable auto-routing |
| `deep-research-team/` category structure | claude-code-templates | Model the "Research Team" agent package in Livinity marketplace |
| Wave-execution orchestration pattern | GSD | Implement in Nexus as the orchestration engine |
| Thin-orchestrator / fat-subagent pattern | GSD | Never accumulate subagent outputs in the orchestrator's context |
| PLAN.md structure (frontmatter + tasks + must-haves) | GSD | Use for agent job definitions in the orchestration engine |
| Goal-backward verification (4-level artifact check) | GSD | Implement as optional post-execution verification agent |
| `.planning/config.json` toggles | GSD | Model Livinity orchestration configuration |
| `gsd-debugger.md` debug file protocol | GSD | Model the Livinity agent execution log format |
| Security monitor default-allow stance | Piebald-AI | Use as policy for Nexus tool permission enforcement |
| Fork worker vs subagent distinction | Piebald-AI | Use fork workers for lightweight parallel tasks in Nexus |
| Conditional prompt assembly | Piebald-AI | Load agent capabilities as modules, not one monolithic prompt |
| Dream memory consolidation | Piebald-AI | Implement for Livinity agent long-term memory management |
| `manifest.json` per component | claude-code-templates | Extend with Livinity-specific metadata fields |
| Multi-source attribution | claude-code-templates | Track community contributions in the Livinity registry |

---

## Sources

[1] TÂCHES / gsd-build. "get-shit-done: Meta-prompting, context engineering and spec-driven development system." GitHub, MIT, 2026. https://github.com/gsd-build/get-shit-done

[2] davila7. "claude-code-templates: Ready-to-use configurations for Claude Code." GitHub, v1.28.3, MIT, 2026. https://github.com/davila7/claude-code-templates | Documentation: https://docs.aitmpl.com

[3] Piebald-AI. "claude-code-system-prompts: All parts of Claude Code's system prompt." GitHub, v2.1.87, 2026-03-28. https://github.com/Piebald-AI/claude-code-system-prompts

[4] Anthropic. "Claude Agent SDK Documentation." platform.claude.com, 2026. https://platform.claude.com/docs/en/agent-sdk/overview

[5] Anthropic. "Claude Code: Sub-agents." docs.anthropic.com, 2026. https://docs.anthropic.com/en/docs/claude-code/sub-agents
