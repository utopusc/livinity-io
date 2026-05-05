# ReAct Agent Systems & Modular Skill/Plugin Architectures: Feature Research

Research compiled: 2026-01-26

## Executive Summary

This document analyzes modern ReAct agent systems and modular skill/plugin architectures based on real-world implementations. It identifies table stakes features, differentiators, and anti-patterns to guide architectural decisions for agent frameworks.

Key finding: The most successful systems (Claude Code, LangGraph, AgentForge) emphasize **progressive disclosure**, **minimal abstraction**, and **declarative configuration** over complex dependency injection and framework lock-in.

---

## Table Stakes (Must-Have Features)

### 1. Agent Loop with Observation

**ReAct Loop Structure:**
- **Thought**: Agent expresses internal reasoning
- **Action**: Agent selects tool to use
- **Action Input**: Arguments formatted as strict JSON
- **Observation**: Raw output from tool execution

The framework operates through an interleaved reasoning-acting loop where reasoning traces help induce, track, and update action plans while actions interface with external sources to gather additional information.

**Implementation Details:**
- Loop repeats iteratively until completion condition met
- Reasoning component handles induction, tracking, and updating of action plans
- Acting component interfaces with external sources (knowledge bases, APIs, filesystems)
- Minimal prompting: achieves strong results with 1-2 in-context examples

**Sources:**
- [ReAct: Synergizing Reasoning and Acting (arXiv)](https://arxiv.org/abs/2210.03629)
- [What is a ReAct Agent? (IBM)](https://www.ibm.com/think/topics/react-agent)
- [ReAct Prompting Guide](https://www.promptingguide.ai/techniques/react)

---

### 2. Tool/Function Calling

**Standard Implementation:**
- Tools exposed as callable functions with strict JSON schemas
- Agent receives tool definitions in system prompt or via API
- Tool responses returned as observations in the loop
- Tool calling integrated natively in modern LLM APIs (Claude, GPT-4, etc.)

**Best Practices:**
- Well-defined input/output contracts for each tool
- Error responses that guide agent recovery
- Tool metadata (name, description, parameters) for autonomous selection

**Sources:**
- [Claude API Docs - Agent Skills](https://platform.claude.com/docs/en/agent-sdk/skills)
- [LangChain ReAct Implementation](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langchain-setup-tools-agents-memory/langchain-react-agent-complete-implementation-guide-working-examples-2025)

---

### 3. Skill/Plugin Loading from Files

**Claude Code's Approach (Industry Leading):**

**Structure:**
```
.claude/skills/
├── skill-name/
│   ├── SKILL.md          # Required: YAML frontmatter + instructions
│   ├── reference.md      # Optional: detailed docs loaded on-demand
│   ├── examples.md       # Optional: usage examples
│   └── scripts/
│       └── helper.py     # Optional: executable tools
```

**YAML Frontmatter Pattern:**
```yaml
---
name: skill-name
description: What this skill does and when to use it
disable-model-invocation: true  # Only user can invoke
user-invocable: false          # Only agent can invoke
allowed-tools: Read, Grep      # Tool restrictions
context: fork                  # Run in subagent
agent: Explore                 # Which subagent type
---

Your skill instructions here...
```

**Discovery Mechanism:**
- Skills discovered at startup from configured directories
- Metadata (name/description) loaded into context initially
- Full SKILL.md content loaded when skill is invoked
- Supporting files loaded on-demand when referenced
- Hot-reload: changes to `~/.claude/skills` or `.claude/skills` available immediately without restart

**Progressive Disclosure Design:**
> "Like a well-organized manual that starts with a table of contents, then specific chapters, and finally a detailed appendix, skills let Claude load information only as needed."

**Scope Control:**
- **Project skills**: `.claude/skills/` - committed to version control
- **User skills**: `~/.claude/skills/` - personal across all projects
- **Plugin skills**: `<plugin>/skills/` - bundled with plugins
- **Enterprise skills**: Deployed via managed settings organization-wide

**Sources:**
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Inside Claude Code Skills (Mikhail Shilkov)](https://mikhail.io/2025/10/claude-code-skills/)
- [Agent Skills Engineering Blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

---

### 4. Error Handling and Retry

**Current Industry Practices:**

**Max Iterations:**
- Default: 15 iterations (tool calls) before stopping
- Configurable based on task complexity
- "Agent stopped due to max iterations" indicates looping or unclear objectives

**Retry Mechanisms:**
```python
agent = create_react_agent(
    handle_parsing_errors=True,
    max_retries=2,
    timeout=120  # seconds
)
```

**Error Handling Patterns:**
- `handle_reasoning_failure_fn`: Custom error recovery logic
- Timeout for individual tools and overall agent execution
- Graceful degradation: agent adjusts strategy on tool failures
- Error messages guide agent toward alternative approaches

**Advanced Approaches:**
- Pre-planning: agent creates bounded plan (n steps) before execution
- "You have no more tries left" message forces completion
- Early stopping with partial results rather than hard failure

**Common Failure Modes:**
- Looping on same tool repeatedly
- Ambiguous prompts without clear success criteria
- Missing information preventing task completion
- Tool permissions blocking required actions

**Sources:**
- [Max Iterations Issue (LlamaIndex)](https://github.com/run-llama/llama_index/issues/14843)
- [Agent Max Iterations Fix Guide](https://inforsome.com/agent-max-iterations-fix-2/)
- [LangChain Max Iterations](https://python.langchain.com/v0.1/docs/modules/agents/how_to/max_iterations/)

---

### 5. Max Turns / Token Budget

**Budget Control Mechanisms:**

**Turn Limits:**
- Max iterations (turns): 15-30 typical range
- Max execution time: 60-120 seconds recommended
- Early exit conditions when goals achieved

**Token Budget Management:**
- Context window tracking across iterations
- Skill description character budget (Claude Code: 15,000 chars default)
- `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable for adjustment
- Progressive disclosure to stay within limits

**Budget Exhaustion Handling:**
- Warning when approaching limits
- Skill exclusions when budget exceeded
- Context compression strategies (summarization)
- Conversation forking to reset context

**Sources:**
- [Claude Code Skills Troubleshooting](https://code.claude.com/docs/en/skills#troubleshooting)
- [ReAct Agent Max Iterations](https://docs.nvidia.com/aiqtoolkit/latest/workflows/about/react-agent.html)

---

### 6. Structured Output from Agents

**Output Patterns:**

**Typed Responses:**
```typescript
interface AgentResult {
  success: boolean;
  result: string;
  reasoning: string[];
  toolCalls: ToolCall[];
  metadata: {
    iterations: number;
    tokensUsed: number;
    duration: number;
  };
}
```

**Streaming Structure:**
```typescript
type StreamEvent =
  | { type: "thought", content: string }
  | { type: "tool_call_start", tool: string, args: any }
  | { type: "tool_call_end", tool: string, result: any }
  | { type: "observation", content: string }
  | { type: "final_answer", content: string };
```

**Claude Agent SDK Pattern:**
```python
async for message in query(prompt="Task", options=options):
    # Structured message events
    print(message)
```

**Sources:**
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Streaming AI Agents with SSE](https://akanuragkumar.medium.com/streaming-ai-agents-responses-with-server-sent-events-sse-a-technical-case-study-f3ac855d0755)

---

### 7. Logging and Observability

**Industry Standard Tools:**

**LangSmith:**
- Automatic tracing for LangChain/LangGraph agents
- Zero measurable overhead (ideal for production)
- Traces every step: user input → tool calls → model interactions → final response
- Real-time monitoring with alerting
- Works with any framework via environment variable

**AgentOps:**
- Multi-agent collaboration tracking
- 12% overhead (reasonable trade-off)
- Tracks 400+ LLMs with cost optimization
- Claims 25x reduction in fine-tuning costs

**Essential Observability Features:**
- **Tracing**: Complete execution path recording
- **Tool call visibility**: Parameters, timing, results
- **Cost tracking**: Token usage and API costs per run
- **Performance metrics**: Latency, success rates
- **Decision tracking**: Why agent chose specific actions
- **Error logging**: Failures with stack traces and context

**Integration Pattern:**
```python
# LangSmith via environment variable
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "..."

# AgentOps integration
import agentops
agentops.init(api_key="...")
```

**Comparative Landscape (2026):**
- 20+ observability platforms examined
- Key players: LangSmith, AgentOps, Langfuse, LangWatch, Phoenix, Helicone
- Focus on real-time visibility into performance, cost, reliability, behavioral patterns

**Sources:**
- [LangSmith Observability](https://www.langchain.com/langsmith/observability)
- [15 AI Agent Observability Tools](https://research.aimultiple.com/agentic-monitoring/)
- [Top 5 AI Agent Observability Platforms](https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide)
- [LLM Observability Explained](https://www.langflow.org/blog/llm-observability-explained-feat-langfuse-langsmith-and-langwatch)

---

## Differentiators (Nice-to-Have)

### 1. Hot-Reload Skills Without Restart

**Claude Code Implementation (Industry Leading):**

**Claude Code CLI 2.1.0 Changelog:**
> "Added automatic skill hot-reload - skills created or modified in `~/.claude/skills` or `.claude/skills` are now immediately available without restarting the session"

**Benefits:**
- Create/modify skills during active session
- Instant testing and iteration
- Agents can potentially create skills for themselves on the fly
- No workflow interruption for skill updates

**AnythingLLM Approach:**
- Hot loading of custom agent skills
- Changes visible without restarting agent or instance

**Implementation Pattern:**
- File system watcher monitors skill directories
- Config cache invalidation on changes
- Skill registry updates automatically
- New skills appear in available tools list immediately

**Sources:**
- [Claude Code Changelog (Twitter)](https://x.com/claudecodelog/status/2009019708989739438)
- [AnythingLLM Custom Agent Skills](https://docs.anythingllm.com/agent/custom/developer-guide)
- [Feature Request: Hot-reload agents](https://github.com/anomalyco/opencode/issues/8751)

---

### 2. Skill Dependencies and Composition

**Compositional Patterns:**

**Sequential Composition (Assembly Line):**
```yaml
---
name: full-analysis
composition: sequential
skills:
  - data-extraction
  - statistical-analysis
  - report-generation
---
```

**Parallel Composition:**
```yaml
---
name: multi-source-research
composition: parallel
skills:
  - web-search
  - database-query
  - document-scan
merge-strategy: combine
---
```

**Skill Referencing:**
```markdown
## Additional resources

For data processing, invoke the [csv-analyzer](csv-analyzer) skill.
For visualization, see [chart-generator](chart-generator).
```

**AgentForge's DAG Approach:**
- Skill composition mechanism represents any directed acyclic graph
- Sequential and parallel skill combination
- Independent testing and versioning of skills
- Formally defined input-output contracts

**Implementation Strategies:**
- Skills can reference other skills in their instructions
- Subagents can be preloaded with multiple skills as "knowledge base"
- Dynamic skill loading based on task requirements
- Dependency resolution at invocation time

**Sources:**
- [Agent Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [AgentForge Architecture (arXiv)](https://arxiv.org/html/2601.13383)

---

### 3. Agent Memory (Scratchpad, Conversation History)

**Memory Architecture Types:**

**1. Working Memory (Scratchpad):**
- Transient storage for current task
- Captures key information and conclusions from recent interactions
- Functions as mental workspace for active problem-solving
- FIFO message buffer for recent conversational turns

**2. Short-Term Memory (STM):**
- Maintains context during current session
- Conversation history with full detail
- Scratchpad states and intermediate reasoning
- Working plans and task progress

**3. Long-Term Memory:**
- **Episodic**: Records of specific events and interactions
- **Semantic**: Organized knowledge repository (facts, concepts, relationships)
- **Procedural**: Workflows and skills for complex multi-step processes

**Advanced Memory Patterns (2026):**

**Semantic RAG for History:**
- Index past conversation turns
- Retrieve only relevant context for current task
- Vector embeddings of historical interactions

**Externalized State:**
- Persistent scratchpad file outside context window
- Survives context resets and session boundaries
- Agents read/write to shared memory files

**Multi-Agent Memory:**
- Local memory per agent (local scratchpad, cache, long-term store)
- Shared memory via synchronization
- Memory hierarchies for agent teams

**CLAUDE.md Pattern:**
Claude Code uses persistent `CLAUDE.md` files:
- Project-level memory: `.claude/CLAUDE.md`
- User-level memory: `~/.claude/CLAUDE.md`
- Automatically loaded into every session
- Manual management or agent-written context

**RAISE Architecture:**
> "Incorporates a dual-component memory system, analogous to the human brain's short-term and long-term memory functions."

**Sources:**
- [What Is Agent Memory? (MongoDB)](https://www.mongodb.com/resources/basics/artificial-intelligence/agent-memory)
- [Context Engineering with Agent Memory Patterns](https://medium.com/@gopikwork/building-agentic-memory-patterns-with-strands-and-langgraph-3cc8389b350d)
- [Agent Chat History and Memory (Microsoft)](https://learn.microsoft.com/en-us/agent-framework/user-guide/agents/agent-memory)
- [Escaping Context Amnesia (Hadi Javeed)](https://www.hadijaveed.me/2025/11/26/escaping-context-amnesia-ai-agents/)

---

### 4. Multi-Agent Delegation

**Orchestration Patterns:**

**1. Supervisor/Hierarchical Pattern:**
- Central orchestrator coordinates all interactions
- Receives user request → decomposes into subtasks → delegates
- Monitors progress, validates outputs, synthesizes final response
- Simple to implement but creates single point of failure

**2. Handoff/Routing Pattern:**
- Dynamic delegation between specialized agents
- Each agent assesses task and decides: handle directly or transfer
- Based on expertise and context
- More flexible than hierarchical

**3. Adaptive Agent Network:**
- Eliminates centralized control
- Agents collaborate and transfer tasks peer-to-peer
- Optimized for low-latency, high-interactivity (chat, support)
- More resilient but harder to debug

**4. Sequential/Assembly Line:**
- Agent A completes task → hands to Agent B
- Linear, deterministic, easy to debug
- Know exactly where data came from

**Coordination Approaches:**
- **Centralized**: Manager agent controls all others
- **Decentralized**: Peer-to-peer agent communication
- **Hybrid**: High-level planner + independent specialists

**Claude Code Subagent Pattern:**
```yaml
---
name: deep-research
context: fork
agent: Explore
---

Research $ARGUMENTS thoroughly:
1. Find relevant files
2. Analyze code
3. Summarize findings
```

**Framework Support:**
- **LangGraph**: Graph-based with supervisor nodes
- **CrewAI**: Role-based task delegation
- **Google ADK**: Sequential and loop agents
- **OpenAI Agents SDK**: Orchestration via LLM or code

**Industry Prediction:**
> "2026 is when these patterns are going to come out of the lab and into real life" - IBM's Kate Blair

**Sources:**
- [Choosing the Right Orchestration Pattern](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)
- [AI Agent Orchestration Patterns (Azure)](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Multi-Agent Orchestration on AWS](https://aws.amazon.com/solutions/guidance/multi-agent-orchestration-on-aws/)
- [Developer's Guide to Multi-Agent Patterns (Google)](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)

---

### 5. Streaming Output During Execution

**Server-Sent Events (SSE) Architecture:**

**Event Types:**
```typescript
type AgentEvent =
  | { type: "tool-call-start", tool: string, args: any }
  | { type: "tool-call-end", tool: string, result: any }
  | { type: "node-execute-before", node: string }
  | { type: "node-execute-after", node: string, output: any }
  | { type: "thought", content: string }
  | { type: "chunk", content: string };
```

**Implementation Pattern:**
```python
# FastAPI streaming endpoint
@app.get("/agent/stream")
async def stream_agent(task: str):
    async def event_generator():
        async for event in agent.run_stream(task):
            yield f"data: {json.dumps(event)}\n\n"
    return EventSourceResponse(event_generator())
```

**Real-Time Capabilities:**
- Tool call visibility as they happen
- Incremental text generation (LLM streaming)
- Progress updates for long-running operations
- Transparent reasoning process
- Task status changes

**AG-UI Protocol:**
- Standardized event-driven protocol for agent→UI streaming
- Structured event streams via SSE
- Incremental agent outputs, task statuses, tool invocations, state changes

**Benefits:**
- Reduces latency (data arrives as generated)
- User sees agent "thinking" in real-time
- Can cancel long operations early
- Better user experience for slow tasks
- Debugging aid for developers

**Framework Support:**
- n8n: Stream AI agent tool calls via SSE
- LangGraph: Event streaming infrastructure with resumability
- Mastra: Streaming architecture with SSE support

**Sources:**
- [Streaming AI Agents with SSE](https://akanuragkumar.medium.com/streaming-ai-agents-responses-with-server-sent-events-sse-a-technical-case-study-f3ac855d0755)
- [n8n Stream AI Agent Tool Calls](https://github.com/n8n-io/n8n/pull/20499)
- [LangGraph Event Streaming](https://deepwiki.com/langchain-ai/langgraphjs/7.1-streaming-and-real-time-output)
- [Why SSE is King](https://medium.com/@FrankGoortani/sse-is-the-king-0559dcb0cb3d)

---

### 6. Permission System for Dangerous Tools

**Claude Code's Approach (Industry Leading):**

**Sandboxing Architecture:**

**Filesystem Isolation:**
- Default: Read/write in CWD and subdirectories only
- Read access to entire computer except denied directories
- Cannot modify files outside CWD without permission
- Configurable allowed/denied paths

**Network Isolation:**
- Proxy server controls domain access
- Only approved domains accessible
- New domain requests trigger user confirmation
- Custom proxy support for HTTPS inspection
- Restrictions apply to all scripts and subprocesses

**OS-Level Enforcement:**
- **macOS**: Seatbelt framework (built-in)
- **Linux/WSL2**: bubblewrap + socat
- Child processes inherit same boundaries
- Hardware-enforced isolation

**Permission Modes:**

**Auto-Allow Mode:**
- Sandboxed commands run automatically without approval
- Commands needing external access fall back to permission flow
- Reduces approval fatigue while maintaining security

**Regular Permissions Mode:**
- All bash commands require explicit permission
- More control but more approvals

**Escape Hatch:**
- `dangerouslyDisableSandbox` parameter for incompatible tools
- Goes through normal permission flow
- Can be disabled via `allowUnsandboxedCommands: false`

**Tool-Level Permissions:**
```yaml
---
name: safe-reader
allowed-tools: Read, Grep, Glob  # No Write, Edit, Bash
---
```

**Permission Rules:**
```
# Allow specific skills
Skill(commit)
Skill(review-pr:*)

# Deny dangerous skills
Skill(deploy:*)

# Deny tool entirely
Bash
```

**Security Benefits Against Prompt Injection:**
- Cannot modify `~/.bashrc` or `/bin/` files
- Cannot exfiltrate data to unauthorized servers
- Cannot download malicious scripts
- All attempts blocked at OS level with notifications

**OWASP Top 10 for Agentic Applications (2026):**
> Major risks include Tool Misuse, where agents use legitimate tools unsafely due to ambiguous prompts or manipulated input, potentially leading to data loss or exfiltration.

**Zero-Trust Tooling Model:**
- Treat every tool call as high-risk operation
- Strict, granular, just-in-time permissions
- Rigorous validation against strict schema
- Never blindly pass LLM output to tools

**Security Limitations to Consider:**
- Network filtering doesn't inspect traffic content
- Domain fronting bypass possibility
- Unix socket permissions can enable escalation
- Broad filesystem write permissions enable privilege escalation
- Weaker nested sandbox mode for Docker (use sparingly)

**Sources:**
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Open-Source Agent Sandbox (Kubernetes)](https://www.infoq.com/news/2025/12/agent-sandbox-kubernetes/)
- [OWASP Top 10 for Agentic Applications](https://www.aikido.dev/blog/owasp-top-10-agentic-applications)
- [Complete Guide to Sandboxing Agents](https://www.ikangai.com/the-complete-guide-to-sandboxing-autonomous-agents-tools-frameworks-and-safety-essentials/)

---

### 7. YAML/Declarative Skill Metadata (Claude Code Pattern)

**Comprehensive Frontmatter Fields:**

```yaml
---
# Identity
name: my-skill                    # Skill identifier (becomes /slash-command)
description: When to use this     # Guides agent's selection logic

# Invocation Control
disable-model-invocation: true    # Only user can invoke
user-invocable: false             # Only agent can invoke (hidden from menu)
argument-hint: "[issue-number]"   # Autocomplete hint for users

# Execution Environment
context: fork                     # Run in isolated subagent context
agent: Explore                    # Which subagent type (Explore, Plan, general-purpose, custom)
model: claude-opus-4-5            # Override default model for this skill

# Security & Tools
allowed-tools: Read, Grep, Glob   # Restrict tool access for this skill

# Lifecycle
hooks:                            # Skill-scoped hooks
  after-tool:
    - command: validate.sh
---

Skill instructions here...
```

**String Substitutions:**
```yaml
$ARGUMENTS              # User-provided arguments
${CLAUDE_SESSION_ID}    # Current session ID for logging
```

**Dynamic Context Injection:**
```yaml
---
name: pr-summary
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`

## Your task
Summarize this PR...
```

The `!`command`` syntax executes shell commands before skill content is sent to Claude, enabling live data injection.

**Benefits of YAML Frontmatter Pattern:**
- **Declarative**: Configuration over code
- **Discoverable**: Agents can inspect metadata
- **Version-controllable**: Skills in git with diff-friendly format
- **Self-documenting**: Frontmatter explains behavior
- **Interoperable**: Agent Skills open standard (works across tools)
- **Low barrier**: No programming required for simple skills

**Agent Skills Open Standard:**
> Claude Code skills follow the Agent Skills open standard, which works across multiple AI tools. Claude Code extends the standard with additional features like invocation control, subagent execution, and dynamic context injection.

**Comparison to Alternatives:**
- **Python-based**: Requires programming, harder for non-devs
- **JSON schema**: Less human-readable, no markdown richness
- **Code-first DSL**: Framework lock-in, more abstraction

**Sources:**
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

---

## Anti-Features (Avoid)

### 1. Over-Abstracted Plugin APIs

**The Problem:**

From AgentForge research:
> "Current agent development typically follows one of two suboptimal paradigms: (1) direct API integration resulting in monolithic codebases with limited reusability; or (2) adoption of comprehensive frameworks such as LangChain, AutoGPT, or CrewAI, which introduce substantial complexity and architectural constraints."

**AgentForge's alternative:**
> "Unlike comprehensive frameworks such as LangChain, AgentForge deliberately prioritizes comprehensibility and rapid modification over feature completeness."

**Signs of Over-Abstraction:**
- Multiple layers of wrapper classes
- Plugin lifecycle with 10+ hooks
- Abstract base classes requiring inheritance
- Builder patterns for simple configurations
- "Magic" behavior hidden in framework internals

**Better Approach:**
```python
# Bad: Over-abstracted
class MyPlugin(BasePlugin):
    def on_init(self): ...
    def on_before_invoke(self): ...
    def on_after_invoke(self): ...
    def on_error(self): ...
    def on_cleanup(self): ...

# Good: Simple, explicit
def my_tool(arg: str) -> str:
    """Tool description for agent."""
    return process(arg)

agent.register_tool(my_tool)
```

**Sources:**
- [AgentForge Architecture (arXiv)](https://arxiv.org/html/2601.13383)
- [Top AI Agent Frameworks Comparison](https://www.ideas2it.com/blogs/ai-agent-frameworks)

---

### 2. Complex Dependency Injection

**Anti-Patterns Identified:**

**Control Freak Pattern:**
- Classes create dependencies using `new` keyword
- Hard-codes dependencies, difficult to test
- Prevents substitution and mocking

**Service Locator Pattern:**
- Classes directly reference DI container
- `container.Resolve<T>()` scattered throughout codebase
- "Service locator anti-pattern in disguise"

**Constructor Over-Injection (Fat Class):**
- Many dependencies where most unused in methods
- Indicates poor class design
- Hard to understand and test

**Over-Abstraction via DI:**
> "Dependency injection can complicate things a lot and obscure what's really going on through unnecessary abstraction, and can also be very hard to debug and significantly complicate your application."

**Better Approach:**

**Composition Root:**
> "Define a composition root – a single place where all object graphs are composed, and your application will execute without ever contacting the container again."

**Make Dependencies Explicit:**
- Constructor injection for required dependencies
- Optional parameters for optional dependencies
- Avoid service locator pattern

**Context Matters:**
> "In small or simple applications where the overhead of creating abstractions might not be justified, directly using concrete classes can be more straightforward and less over-engineered."

**Key Insight:**
> "A service container is a tool; Dependency Injection is a mindset. Treating DI as an architectural principle instead of a framework trick makes systems more resilient, scalable, and test-friendly."

**Sources:**
- [Cataloging DI Anti-Patterns](https://www.sciencedirect.com/science/article/pii/S0164121221002223)
- [DI Anti-Patterns (Abilian)](https://lab.abilian.com/Tech/Architecture%20&%20Software%20Design/Dependency%20Inversion/DI%20anti-patterns/)
- [DI Containers Are Code Polluters](https://www.yegor256.com/2014/10/03/di-containers-are-evil.html)

---

### 3. Framework Lock-In

**The Problem:**

From multi-agent research:
> "The agent ecosystem is now 'fragmented.' An agent built in LangGraph cannot easily communicate with an agent built in AutoGPT, and this fragmentation 'hinders the scalability and composability' of the entire agentic ecosystem."

**Causes:**
- Framework-specific agent definitions
- Proprietary skill/plugin formats
- Tight coupling to framework APIs
- Custom orchestration primitives
- Non-standard tool schemas

**Token Efficiency Comparison:**
- AgentForge: 8-15% fewer tokens than LangChain
- AutoGPT: 45-60% more tokens than baseline
- Reason: Framework overhead in prompts and orchestration

**Agent Skills Open Standard:**
> "Claude Code skills follow the Agent Skills open standard, which works across multiple AI tools."

**How to Avoid Lock-In:**

**Use Open Standards:**
- Agent Skills specification
- OpenAPI for tool definitions
- Standard LLM APIs (Anthropic, OpenAI)
- Interoperable data formats (JSON, YAML)

**Keep Core Logic Framework-Agnostic:**
```python
# Core logic independent of framework
def analyze_code(file_path: str) -> Analysis:
    return Analysis(...)

# Thin framework adapter
@agent.skill
def analyze_wrapper(args):
    return analyze_code(args["file_path"])
```

**Configuration Over Code:**
> "Common agent setups are expressible through declarative specifications rather than imperative programming." - AgentForge

**Backend Abstraction:**
> "AgentForge unifies heterogeneous LLM providers through a single interface supporting cloud APIs (OpenAI, Groq) and local inference (HuggingFace). This eliminates vendor lock-in."

**Sources:**
- [Multi-Agent Systems Guide](https://www.multimodal.dev/post/best-multi-agent-ai-frameworks)
- [AgentForge Architecture](https://arxiv.org/html/2601.13383)
- [Agent Skills Open Standard](https://agentskills.io)

---

### 4. Excessive Configuration

**The Problem:**

**Config Sprawl:**
- 100+ configuration options
- Multiple config file formats
- Unclear option precedence
- No sensible defaults
- Configuration programming language (e.g., Lua in Neovim)

**Analysis Paralysis:**
- Must read docs to configure basic behavior
- Breaking changes require config updates
- Hard to know what options do without trying
- Copy-paste configs without understanding

**Better Approach:**

**Convention Over Configuration:**
- Sensible defaults for 90% use cases
- Zero-config startup for basic usage
- Progressive configuration disclosure

**Claude Code Example:**
```bash
# Works immediately, no config required
claude "explain this code"

# Advanced config optional
~/.claude/skills/  # Auto-discovered
.claude/CLAUDE.md  # Auto-loaded
settings.json      # Only for customization
```

**Configuration Hierarchy (Claude Code):**
1. Managed (enterprise) - highest priority
2. Personal (`~/.claude/`)
3. Project (`.claude/`)
4. Defaults - lowest priority

**Only Configure What Matters:**
- Model selection
- Tool permissions
- Sandbox boundaries
- Memory/budget limits
- Observability endpoints

**Avoid:**
- Prompt template configuration (keep in skills)
- Complex routing logic (use simple conditions)
- Micro-optimizations (logging levels, retry backoff curves)
- Feature flags (minimize surface area)

**AgentForge Principle:**
> "Configuration over Code: Common agent setups are expressible through declarative specifications rather than imperative programming."

But not: "Configuration over common sense."

**Sources:**
- [Claude Code Settings](https://code.claude.com/docs/en/settings)
- [AgentForge Design Principles](https://arxiv.org/html/2601.13383)

---

## Recommendations

### Architecture Principles

**1. Progressive Disclosure (Claude Code's Core Design)**
- Load metadata initially, full content on-demand
- Keep context window lean
- Support deep resources without upfront cost

**2. Minimal Abstraction (AgentForge's Philosophy)**
- Explicit control flow over implicit magic
- Comprehensibility over feature completeness
- Enable rapid modification

**3. Modularity with Loose Coupling**
- Skills as independent units
- Well-defined input/output contracts
- Substitutable components

**4. Configuration Over Code (But Not Excess)**
- Declarative specifications for common cases
- Sensible defaults
- Progressive configuration disclosure

**5. Open Standards Over Proprietary**
- Agent Skills specification
- Portable skill definitions
- Interoperable across tools

### Feature Priority Matrix

**Immediate (Table Stakes):**
- ✅ ReAct loop with observation
- ✅ Tool/function calling
- ✅ File-based skill loading
- ✅ Error handling + retry
- ✅ Max turns/budget limits
- ✅ Structured output
- ✅ Basic logging

**High Value (Differentiators):**
- ⭐ Hot-reload skills
- ⭐ YAML/declarative metadata
- ⭐ Permission system + sandboxing
- ⭐ Agent memory (scratchpad)
- ⭐ Streaming output (SSE)

**Medium Value:**
- Skill composition
- Multi-agent delegation
- Advanced observability (LangSmith integration)

**Low Priority (Complex, Avoid Over-Engineering):**
- Complex DI containers
- Heavy framework abstractions
- Excessive configuration options
- Custom DSLs

### Implementation Guidance

**Skill System:**
- Follow Claude Code's YAML frontmatter pattern
- Support progressive disclosure (metadata → full content → supporting files)
- Implement hot-reload via file watchers
- Keep skill invocation simple (tool call + file read)

**Security:**
- Start with basic permission prompts
- Add sandboxing for production use
- Separate tool permissions from execution environment
- OS-level isolation for dangerous operations

**Observability:**
- Structured events for streaming
- Integration points for LangSmith/AgentOps
- Keep overhead minimal (<5%)
- Essential: tool calls, iterations, tokens, costs

**Memory:**
- CLAUDE.md-style persistent files
- Optional vector-based semantic retrieval
- Simple scratchpad in working memory
- Don't over-engineer until needed

**Multi-Agent:**
- Start with simple subagent forking (context isolation)
- Add supervisor pattern if needed
- Avoid complex orchestration initially
- Keep delegation explicit, not magical

---

## References

### Core Papers & Specifications
- [ReAct: Synergizing Reasoning and Acting in Language Models (arXiv)](https://arxiv.org/abs/2210.03629)
- [AgentForge: Lightweight Modular Framework (arXiv)](https://arxiv.org/html/2601.13383)
- [Agent Skills Specification](https://agentskills.io)

### Claude Code Documentation
- [Extend Claude with Skills](https://code.claude.com/docs/en/skills)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Agent Skills Engineering Blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

### Framework Comparisons
- [Top AI Agent Frameworks in 2025](https://www.ideas2it.com/blogs/ai-agent-frameworks)
- [Top 7 Free AI Agent Frameworks](https://botpress.com/blog/ai-agent-frameworks)
- [8 Best Multi-Agent AI Frameworks](https://www.multimodal.dev/post/best-multi-agent-ai-frameworks)

### Observability & Monitoring
- [LangSmith Observability](https://www.langchain.com/langsmith/observability)
- [15 AI Agent Observability Tools](https://research.aimultiple.com/agentic-monitoring/)
- [LLM Observability Explained](https://www.langflow.org/blog/llm-observability-explained-feat-langfuse-langsmith-and-langwatch)

### Memory & Context Management
- [What Is Agent Memory? (MongoDB)](https://www.mongodb.com/resources/basics/artificial-intelligence/agent-memory)
- [Building Agentic Memory Patterns](https://medium.com/@gopikwork/building-agentic-memory-patterns-with-strands-and-langgraph-3cc8389b350d)
- [Escaping Context Amnesia](https://www.hadijaveed.me/2025/11/26/escaping-context-amnesia-ai-agents/)

### Multi-Agent Systems
- [AI Agent Orchestration Patterns (Azure)](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Multi-Agent Orchestration on AWS](https://aws.amazon.com/solutions/guidance/multi-agent-orchestration-on-aws/)
- [Developer's Guide to Multi-Agent Patterns (Google)](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)

### Streaming & Real-Time
- [Streaming AI Agents with SSE](https://akanuragkumar.medium.com/streaming-ai-agents-responses-with-server-sent-events-sse-a-technical-case-study-f3ac855d0755)
- [LangGraph Event Streaming](https://deepwiki.com/langchain-ai/langgraphjs/7.1-streaming-and-real-time-output)
- [Why SSE is King](https://medium.com/@FrankGoortani/sse-is-the-king-0559dcb0cb3d)

### Security & Sandboxing
- [OWASP Top 10 for Agentic Applications](https://www.aikido.dev/blog/owasp-top-10-agentic-applications)
- [Complete Guide to Sandboxing Agents](https://www.ikangai.com/the-complete-guide-to-sandboxing-autonomous-agents-tools-frameworks-and-safety-essentials/)
- [Open-Source Agent Sandbox (Kubernetes)](https://www.infoq.com/news/2025/12/agent-sandbox-kubernetes/)

### Anti-Patterns & Best Practices
- [Cataloging DI Anti-Patterns](https://www.sciencedirect.com/science/article/pii/S0164121221002223)
- [DI Anti-Patterns](https://lab.abilian.com/Tech/Architecture%20&%20Software%20Design/Dependency%20Inversion/DI%20anti-patterns/)
- [Agent Max Iterations Fix](https://inforsome.com/agent-max-iterations-fix/)

---

## Conclusion

The most successful agent systems in 2026 share common traits:

1. **Simplicity over sophistication**: Claude Code's SKILL.md beats complex plugin APIs
2. **Progressive disclosure**: Load only what's needed, when it's needed
3. **Security by default**: Sandboxing and permissions built-in, not bolted-on
4. **Open standards**: Agent Skills specification enables portability
5. **Developer experience**: Hot-reload, streaming, and observability reduce friction

**The Golden Rule**: "Make simple things easy, complex things possible, and dangerous things explicit."

Build the minimal viable agent loop first. Add differentiators based on actual user needs, not anticipated ones. Avoid over-engineering through excessive abstraction, DI containers, and configuration sprawl.

The research shows that lightweight, modular, declarative approaches (Claude Code, AgentForge) outperform heavyweight frameworks (LangChain, AutoGPT) in comprehensibility, token efficiency, and developer velocity.
