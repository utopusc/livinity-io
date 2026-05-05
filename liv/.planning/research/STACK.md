# Modern ReAct AI Agent Stack Research (2025/2026)

**Research Date:** January 26, 2026
**Purpose:** Understand standard patterns for building ReAct AI agents with modular plugin/skill systems in Node.js/TypeScript

---

## Executive Summary

The 2025/2026 landscape for ReAct agents in TypeScript features mature frameworks with distinct architectural philosophies:

- **Claude Code / Agent SDK**: Meta-tool pattern with progressive disclosure and file-based skills
- **LangGraph.js**: Graph-based state machines with reducer patterns and checkpointing
- **OpenHands**: Event stream abstraction with Python-first architecture
- **CrewAI**: Python-native multi-agent orchestration (limited TypeScript support)
- **Mastra**: TypeScript-native agent framework with workflow graphs
- **Vercel AI SDK**: Production-ready streaming agents with ToolLoopAgent

**Key Trend:** File-based discovery + runtime registration + streaming responses + human-in-the-loop controls are now standard.

---

## 1. Claude Code / Agent SDK

**Language:** TypeScript/JavaScript + Python
**Maturity:** Production (2025-2026)
**Architecture:** Meta-tool pattern with progressive disclosure

### Agent Loop (Observe → Think → Act → Repeat)

Claude Code implements a **progressive disclosure** pattern where:

1. **Initial Context**: Skill descriptions are loaded into context (not full content)
2. **Relevance Detection**: Claude scans metadata to identify relevant skills
3. **Full Loading**: Only matched skills load their complete instructions
4. **Execution**: Claude follows skill instructions or delegates to subagent
5. **Repeat**: Continue until task completion or manual intervention

The agent loop operates until:
- A finish reasoning (other than tool-calls) is returned
- A tool invoked lacks an execute function
- A tool call needs approval
- A stop condition is met

Default maximum: **20 steps** via `stopWhen: stepCountIs(20)`

### Tool/Skills Registration

**Three-Tier Discovery System:**

| Location   | Path                                        | Scope                      |
|:-----------|:--------------------------------------------|:---------------------------|
| Enterprise | Managed settings (admin-configured)         | Organization-wide          |
| Personal   | `~/.claude/skills/<skill-name>/SKILL.md`    | All user projects          |
| Project    | `.claude/skills/<skill-name>/SKILL.md`      | Current project only       |
| Plugin     | `<plugin>/skills/<skill-name>/SKILL.md`     | Where plugin enabled       |

**Automatic Nested Discovery:** When editing files in subdirectories (e.g., `packages/frontend/`), Claude Code discovers skills from nested `.claude/skills/` directories, supporting monorepo structures.

### Skill File Format

```yaml
---
name: explain-code
description: Explains code with visual diagrams and analogies
disable-model-invocation: false  # Can Claude invoke automatically?
user-invocable: true             # Show in / menu?
allowed-tools: Read, Grep, Glob  # Tool restrictions
context: fork                    # Run in subagent?
agent: Explore                   # Which subagent type?
---

Your skill instructions here...

## Supporting Files
- [API reference](reference.md) - loaded on demand
- [Examples](examples.md) - loaded on demand
```

**Key Innovation:** Progressive disclosure keeps `SKILL.md` < 500 lines, with detailed reference docs in separate files loaded only when needed.

### Plugin Loading (Runtime Registration)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Hello",
  options: {
    plugins: [
      { type: "local", path: "./my-plugin" },
      { type: "local", path: "/absolute/path/to/another-plugin" }
    ]
  }
})) {
  // Plugins loaded, skills/commands/agents available
}
```

**Plugin Structure:**
```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Required manifest
├── skills/                  # Agent Skills
│   └── my-skill/
│       └── SKILL.md
├── commands/                # Slash commands
│   └── custom-cmd.md
├── agents/                  # Subagents
│   └── specialist.md
├── hooks/                   # Event handlers
│   └── hooks.json
└── .mcp.json               # MCP server definitions
```

### State Management

**Skill Invocation Context:**

- **Inline Execution** (default): Skill runs in main conversation context with full history
- **Forked Context** (`context: fork`): Skill runs in isolated subagent with no conversation history

**String Substitutions:**
- `$ARGUMENTS` - All arguments passed when invoking the skill
- `${CLAUDE_SESSION_ID}` - Current session ID for logging/correlation

**Dynamic Context Injection:**
```yaml
---
name: pr-summary
description: Summarize pull request changes
context: fork
agent: Explore
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`

Your task: Summarize this PR...
```

The `!`command`` syntax executes shell commands before sending to Claude, enabling live data injection.

### Error Handling & Retry Logic

**Built-in Safeguards:**
- Tool execution errors surface to Claude for adaptive response
- Permission denials halt execution with clear messaging
- Hook failures logged but don't block main workflow

**No Explicit Retry Configuration:** Claude decides whether to retry failed operations based on error context and skill instructions.

### Max Turns / Cost Control

```typescript
// Loop control via stopWhen conditions
stopWhen: [
  stepCountIs(20),              // Max 20 steps (default)
  hasToolCall('finish'),        // Stop when finish tool called
  (step) => step.usage.totalTokens > 100000  // Custom: token limit
]
```

**PrepareStep Callback:**
```typescript
prepareStep: ({ model, stepNumber, steps, messages }) => {
  // Dynamic model switching based on complexity
  if (stepNumber > 5 && !success) {
    return { model: moreCapableModel };
  }

  // Trim context to manage costs
  if (messages.length > 50) {
    return {
      messages: [systemMsg, ...messages.slice(-30)]
    };
  }
}
```

### Code Example: Complete Skill with Supporting Files

**Skill Definition:**
```yaml
---
name: codebase-visualizer
description: Generate interactive tree visualization of codebase
allowed-tools: Bash(python:*)
---

# Codebase Visualizer
Generate interactive HTML showing project structure.

## Usage
```bash
python ~/.claude/skills/codebase-visualizer/scripts/visualize.py .
```

Creates `codebase-map.html` in current directory.
```

**Bundled Script:** Skills can include Python/Node scripts for complex operations (chart generation, PDF creation, etc.)

### Key Strengths

- **Progressive disclosure** keeps context lean
- **File-based discovery** enables version control
- **Meta-tool pattern** unifies skill invocation
- **Dynamic context injection** for live data
- **Subagent delegation** for isolated execution

---

## 2. LangGraph.js

**Language:** JavaScript/TypeScript (also Python)
**Maturity:** Production (LangChain ecosystem)
**Architecture:** Graph-based state machines with message reducers

### Agent Loop (Observe → Think → Act → Repeat)

LangGraph models agents as **directed graphs** where nodes represent operations and edges define flow:

1. **Entry Point**: User query enters via designated start node (typically "agent")
2. **Model Call**: Node invokes LLM with system prompt + message history
3. **Conditional Routing**: Router examines last message for tool calls
4. **Tool Execution**: If tool calls present, execute and append results to state
5. **Cycle**: Return to agent node with updated state
6. **Termination**: Exit when no tool calls in response

```typescript
import { StateGraph, END } from "@langchain/langgraph";

const workflow = new StateGraph(AgentState);
workflow.addNode("agent", callModel);
workflow.addNode("tools", toolNode);
workflow.setEntryPoint("agent");

workflow.addConditionalEdges(
  "agent",
  shouldContinue,
  { "continue": "tools", "end": END }
);
workflow.addEdge("tools", "agent");

const graph = workflow.compile();
```

### Tool/Skills Registration

**Function-Based Tools:**
```typescript
import { tool } from "@langchain/core/tools";

const weatherTool = tool(
  async ({ location }: { location: string }) => {
    // Tool implementation
    return "It's sunny in " + location;
  },
  {
    name: "get_weather",
    description: "Get weather for a location",
    schema: z.object({
      location: z.string().describe("City name"),
    }),
  }
);

const tools = [weatherTool];
const modelWithTools = model.bindTools(tools);
```

**Tool Node Implementation:**
```typescript
function toolNode(state: AgentState) {
  const outputs = [];
  for (const toolCall of state.messages[-1].tool_calls) {
    const toolResult = tools_by_name[toolCall.name].invoke(
      toolCall.args
    );
    outputs.push(new ToolMessage({
      content: JSON.dumps(toolResult),
      name: toolCall.name,
      tool_call_id: toolCall.id,
    }));
  }
  return { messages: outputs };
}
```

### State Management (Reducers)

**State Definition with Annotation:**
```typescript
import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left: BaseMessage[], right: BaseMessage | BaseMessage[]) => {
      if (Array.isArray(right)) {
        return left.concat(right);
      }
      return left.concat([right]);
    },
    default: () => [],
  }),
  sentiment: Annotation<string>(),
});

type AgentState = typeof StateAnnotation.State;
```

**Key Concept:** Reducers define how updates from multiple nodes merge into shared state. The `messages` reducer concatenates new messages to conversation history.

**Multiple Tool Calls:** When multiple tool calls occur in one step, LangGraph interprets this as concurrent operations and returns multiple Commands in a list.

### Checkpointing (Persistence)

```typescript
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });

// Resume from checkpoint
const config = { configurable: { thread_id: "conversation-123" } };
await graph.invoke(input, config);
```

**Production Checkpointers:**
- `MemorySaver` - In-memory (development)
- `SqliteSaver` - SQLite persistence
- `PostgresSaver` - PostgreSQL for production

### Error Handling & Human-in-the-Loop

**Interrupt Pattern (Recommended 2025/2026):**
```typescript
import { interrupt } from "@langchain/langgraph";

function reviewNode(state: AgentState) {
  // Pause execution for human review
  const humanFeedback = interrupt("Please review this action");

  // Resume with feedback
  return { feedback: humanFeedback };
}
```

**Error Storage in Checkpointer:**
As of LangGraph 0.2.31, errors thrown by nodes are stored in the checkpointer:
- Accessible when fetching thread state/history
- Enables debugging and recovery workflows
- Critical for production systems

**Dynamic Breakpoints:**
```typescript
workflow.addConditionalEdges(
  "agent",
  (state) => {
    if (state.needsApproval) {
      return "wait_for_human";
    }
    return "continue";
  }
);
```

### Max Turns / Cost Control

**No Built-in Max Turns:** LangGraph doesn't enforce max iterations by default. Implement via:

```typescript
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({...}),
  turnCount: Annotation<number>({
    reducer: (left, right) => left + right,
    default: () => 0,
  }),
});

function shouldContinue(state: AgentState) {
  if (state.turnCount > 20) {
    return "end";  // Force termination
  }

  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage.tool_calls) {
    return "end";
  }
  return "continue";
}
```

**Cost Tracking:** Implement via custom state fields tracking token usage per turn.

### Code Example: Complete ReAct Agent

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages";
import { z } from "zod";

// Define state
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

// Define tools
const searchTool = tool(
  async ({ query }) => {
    return `Results for: ${query}`;
  },
  {
    name: "search",
    description: "Search the web",
    schema: z.object({ query: z.string() }),
  }
);

const tools = [searchTool];
const model = new ChatOpenAI({ model: "gpt-4" }).bindTools(tools);

// Define nodes
async function callModel(state: typeof StateAnnotation.State) {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

function toolNode(state: typeof StateAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const outputs = [];

  for (const toolCall of lastMessage.tool_calls || []) {
    const toolResult = tools
      .find(t => t.name === toolCall.name)
      ?.invoke(toolCall.args);
    outputs.push(new ToolMessage({
      content: JSON.stringify(toolResult),
      tool_call_id: toolCall.id,
    }));
  }

  return { messages: outputs };
}

// Define routing
function shouldContinue(state: typeof StateAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return "end";
  }
  return "continue";
}

// Build graph
const workflow = new StateGraph(StateAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .setEntryPoint("agent")
  .addConditionalEdges(
    "agent",
    shouldContinue,
    { continue: "tools", end: END }
  )
  .addEdge("tools", "agent");

const graph = workflow.compile();

// Execute
const result = await graph.invoke({
  messages: [new HumanMessage("Search for TypeScript agents")]
});
```

### Key Strengths

- **Explicit graph structure** makes flow visible
- **Reducer pattern** provides predictable state updates
- **Checkpointing** enables pause/resume workflows
- **Human-in-the-loop** via interrupt pattern
- **Framework agnostic** - works with any LLM provider

---

## 3. OpenHands (formerly OpenDevin)

**Language:** Python (TypeScript mentioned but Python-primary)
**Maturity:** Research/Production hybrid (ICLR 2025 paper)
**Architecture:** Event stream abstraction with action-observation loop

### Agent Loop (Observe → Think → Act → Repeat)

OpenHands implements a **perception-action loop** analogous to human developers:

```python
class MinimalAgent:
    def reset(self) -> None:
        self.system_message = "You are a helpful assistant..."

    def step(self, state: State):
        messages = [{'role': 'system', 'content': self.system_message}]

        # Build context from event stream
        for prev_action, obs in state.history:
            messages.append(get_action_message(prev_action))
            messages.append(get_observation_message(obs))

        # LLM generates next action
        response = self.llm.do_completion(messages)
        action = self.parse_response(response)

        # Route to appropriate action type
        if self.is_finish_command(action):
            return AgentFinishAction()
        elif self.is_bash_command(action):
            return CmdRunAction(command=action.command)
        elif self.is_python_code(action):
            return IPythonRunCellAction(code=action.code)
```

**Flow:**
1. **Perception**: Agent examines current state (event stream)
2. **Decision**: LLM processes history and generates response
3. **Parsing**: Response parsed into structured action
4. **Execution**: Runtime executes action in sandboxed environment
5. **Observation**: Results captured as observation event
6. **Append**: Action-observation pair added to event stream
7. **Repeat**: Continue until `AgentFinishAction`

### Event Stream Architecture

**Core Abstraction:** The event stream is a chronological collection of past actions and observations, including the agent's own actions and user interactions (e.g., instructions, feedback).

**State Structure:**
```python
class State:
    history: List[Tuple[Action, Observation]]  # Event stream
    accumulated_cost: float                    # LLM call costs
    delegation_metadata: Dict                  # Multi-agent info
    execution_params: Dict                     # Runtime config
```

**Benefits:**
- **Context reconstruction** at any point in execution
- **Human-in-the-loop** interventions possible
- **Debugging** via event replay
- **Multi-agent** coordination through shared event streams

### Action Space Definitions

OpenHands defines primitive actions based on programming languages:

| Action Type                | Description                                    |
|:---------------------------|:-----------------------------------------------|
| `IPythonRunCellAction`     | Execute arbitrary Python in sandboxed Jupyter |
| `CmdRunAction`             | Run bash commands in sandbox                   |
| `BrowserInteractiveAction` | Interact with web browsers (BrowserGym DSL)    |
| `AgentDelegateAction`      | Delegate subtasks to specialized agents        |
| `MessageAction`            | Send natural language response to user         |
| `FileEditAction`           | Edit files using utility functions             |

**Design Philosophy:** "Actions based on programming languages (PL) is powerful and flexible enough to perform any task with tools in different forms."

### Tool Registration (AgentSkills Library)

**Python Package Approach:**
Rather than pre-defining exhaustive tool lists, OpenHands employs an **AgentSkills library**—a Python package with utility functions automatically imported into the Jupyter IPython environment.

```python
from openhands.agenthub import agentskills

# Tools automatically available in IPython environment
agentskills.edit_file("path/to/file.py", start_line=10, end_line=20, content="...")
agentskills.parse_pdf("document.pdf")
agentskills.parse_image("screenshot.png")
```

**Community Contribution:** Developers can contribute new tools by defining Python functions and submitting PRs.

**Inclusion Criteria:**
- Cannot be easily implemented by LLMs directly
- Requires calling external models (vision, PDF parsing)
- Provides significant utility for common tasks

**Recent SDK (2025-2026):**
```python
from openhands.sdk import LLM, Agent, Conversation, Tool
from openhands.sdk.tools import TerminalTool, FileEditorTool, TaskTrackerTool

agent = Agent(
    llm=LLM(model="gpt-4"),
    tools=[TerminalTool(), FileEditorTool(), TaskTrackerTool()],
)
```

### State Management

**Event Stream as State:**
State is a data structure encapsulating all relevant information for agent execution. The event stream forms the core, enabling:

- **Statefulness**: Full conversation history preserved
- **Resumability**: Can pause and resume from any point
- **Observability**: Every action-observation pair logged
- **Multi-agent**: Agents share and coordinate via event streams

**Execution Context:**
- **Containerization**: Agents run in isolated Docker environments
- **Secure Execution**: Sandbox restricts agent capabilities
- **Modularity**: Composable Python library serves as engine

### Error Handling & Retry Logic

**Runtime Error Handling:**
- Errors captured as observations in event stream
- Agent receives error message and can adapt strategy
- No automatic retries—agent decides next action

**Example Flow:**
```
Action: CmdRunAction(command="npm install")
Observation: Error("Command failed: npm ERR! EACCES: permission denied")
Agent Response: CmdRunAction(command="sudo npm install") # Adaptive retry
```

### Max Turns / Cost Control

**No Built-in Max Turns:** OpenHands focuses on task completion rather than turn limits.

**Cost Tracking:**
```python
class State:
    accumulated_cost: float  # Tracks LLM API costs across turns
```

**Implementation Pattern:**
```python
def step(self, state: State):
    if state.accumulated_cost > MAX_BUDGET:
        return AgentFinishAction(error="Budget exceeded")

    # Continue with action generation
    ...
```

### Code Example: Custom Agent

```python
from openhands.sdk import Agent, LLM, Tool
from openhands.sdk.tools import TerminalTool, FileEditorTool

class CustomResearchAgent(Agent):
    def __init__(self):
        super().__init__(
            llm=LLM(model="gpt-4"),
            tools=[TerminalTool(), FileEditorTool()],
            system_message="You are a research agent. Analyze codebases and provide insights."
        )

    def step(self, state):
        # Custom logic here
        messages = self.build_messages(state.history)
        response = self.llm.complete(messages)
        action = self.parse_action(response)
        return action

# Usage
agent = CustomResearchAgent()
conversation = Conversation()
conversation.run(agent, "Analyze the auth module")
```

### Key Strengths

- **Event stream abstraction** provides clean state model
- **Action-observation pairs** enable clear debugging
- **AgentSkills library** for community tool contribution
- **Containerized execution** for security
- **Research-backed** (ICLR 2025 paper)

**Limitation:** Python-focused architecture; TypeScript support limited compared to other frameworks.

---

## 4. CrewAI

**Language:** Python (unofficial JS/TypeScript SDK exists)
**Maturity:** Production (Python), Community (TypeScript)
**Architecture:** Role-based multi-agent orchestration

### Agent Loop (Multi-Agent Coordination)

CrewAI emphasizes **team-based coordination** where multiple agents collaborate:

```python
from crewai import Agent, Task, Crew

# Define specialized agents
researcher = Agent(
    role="Researcher",
    goal="Research and gather information",
    backstory="Expert at finding relevant information",
    tools=[search_tool, scrape_tool],
)

writer = Agent(
    role="Writer",
    goal="Write compelling content",
    backstory="Skilled at crafting engaging narratives",
    tools=[],
)

# Define tasks with delegation
research_task = Task(
    description="Research AI agents in TypeScript",
    agent=researcher,
)

write_task = Task(
    description="Write article based on research",
    agent=writer,
    context=[research_task],  # Depends on research_task output
)

# Orchestrate crew
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    verbose=True,
)

result = crew.kickoff()
```

**Coordination Flow:**
1. **Task Assignment**: Tasks assigned based on agent capabilities
2. **Sequential/Parallel**: Tasks executed in dependency order
3. **Context Passing**: Output from one task becomes context for next
4. **Autonomous Delegation**: Agents can delegate subtasks to others
5. **Collective Reasoning**: Dynamic inter-agent discussions

### Tool/Skills Registration

**Python Implementation:**
```python
from crewai_tools import BaseTool

class CustomSearchTool(BaseTool):
    name: str = "Search"
    description: str = "Search the web for information"

    def _run(self, query: str) -> str:
        # Tool implementation
        return f"Results for {query}"

# Assign to agent
agent = Agent(
    role="Researcher",
    tools=[CustomSearchTool()],
)
```

**Unofficial TypeScript (CrewAI-JS):**
```typescript
import { Agent, Task, Crew } from "crewai-js";

const researcher = new Agent({
  role: "Researcher",
  goal: "Research topics",
  tools: [searchTool, scrapeTool],
});
```

### State Management

**Task Context Propagation:**
- Each task receives outputs from dependent tasks
- Agents maintain conversation memory
- Crew manages overall execution state

**No Explicit State Graph:** Unlike LangGraph, CrewAI uses implicit state flow through task dependencies.

### Error Handling & Retry Logic

**Python Framework:**
- Tasks can specify retry logic
- Agents adapt based on task failures
- No detailed documentation on retry configuration

**TypeScript (Unofficial):**
Limited documentation on error handling patterns in CrewAI-JS.

### Max Turns / Cost Control

**Task-Level Control:**
```python
task = Task(
    description="Research topic",
    agent=researcher,
    max_iter=10,  # Maximum iterations for this task
)
```

**Crew-Level Configuration:**
```python
crew = Crew(
    agents=[...],
    tasks=[...],
    max_rpm=30,  # Rate limiting: max requests per minute
)
```

### TypeScript Support Status (2026)

**Official Framework:** Python-native (Python >=3.10 <3.14)
- "CrewAI is a lean, lightning-fast Python framework built entirely from scratch—completely independent of LangChain"

**Unofficial SDK (CrewAI-JS):**
- Community project inspired by Python framework
- Brings multi-agent capabilities to JavaScript/TypeScript
- Not production-ready compared to official Python version

**2026 Assessment:** For TypeScript projects, consider LangGraph.js or Mastra over unofficial CrewAI-JS port.

### Key Strengths

- **Role-based coordination** simplifies multi-agent design
- **Task delegation** enables complex workflows
- **Fast execution** (Python implementation)
- **Production-ready** for Python projects

**Limitation for Nexus:** Python-first architecture; TypeScript support immature compared to other options.

---

## 5. Mastra

**Language:** TypeScript/JavaScript (native)
**Maturity:** Beta (v1 releasing January 2026)
**Architecture:** Graph-based workflows with agent nodes

### Agent Loop (Observe → Think → Act → Repeat)

Mastra agents "reason about goals, decide which tools to use, retain conversation memory, and iterate internally until the model emits a final answer or an optional stop condition is met."

**Step-Based Iteration:**
```typescript
const agent = new Agent({
  name: "Research Agent",
  model: "openai/gpt-4",
  instructions: "You are a research assistant",
  tools: { searchTool, scrapeTool },
  maxSteps: 10,  // Maximum reasoning iterations
});

const result = await agent.generate("Research TypeScript agents");
```

**Each Step Includes:**
1. Generate LLM response
2. Execute any tool calls
3. Process tool results
4. Continue or finish based on stopping condition

**Default:** `maxSteps: 1` (single-turn), increase for multi-turn tool interactions.

### Tool/Skills Registration

**Type-Safe Tool Definition:**
```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const weatherTool = createTool({
  id: "get_weather",
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name"),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    condition: z.string(),
  }),
  execute: async ({ context, input }) => {
    // Tool implementation
    const weather = await fetchWeather(input.location);
    return {
      temperature: weather.temp,
      condition: weather.condition,
    };
  },
});

// Register with agent
const agent = new Agent({
  tools: { weatherTool },
});
```

**Integration with Workflows:**
```typescript
const step = createStep({
  id: "research",
  execute: async ({ context, mastra }) => {
    const agent = mastra.getAgent("researchAgent");
    const result = await agent.generate("Research topic");
    return { findings: result.text };
  },
});
```

### Workflow Integration (Graph-Based)

**Intuitive Control Flow:**
```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";

const step1 = createStep({
  id: "analyze",
  execute: async ({ context }) => {
    return { analysis: "..." };
  },
});

const step2 = createStep({
  id: "generate",
  execute: async ({ context }) => {
    return { report: "..." };
  },
});

const workflow = createWorkflow({
  name: "research-workflow",
  retryConfig: { attempts: 3, delay: 1000 },
})
  .then(step1)
  .then(step2)
  .branch({
    if: ({ context }) => context.requiresReview,
    then: reviewStep,
  })
  .parallel([summaryStep, notifyStep])
  .commit();
```

**Workflow Methods:**
- `.then(step)` - Sequential execution
- `.branch({ if, then, else })` - Conditional branching
- `.parallel([steps])` - Concurrent execution
- `.commit()` - Finalize workflow graph

### State Management

**Agent Memory:**
```typescript
const agent = new Agent({
  memory: {
    enabled: true,
    provider: "vector",  // Semantic memory via embeddings
  },
});

// Conversation history automatically retained
await agent.stream("First question");
await agent.stream("Follow-up question");  // Has context from first
```

**Workflow Context:**
```typescript
const step = createStep({
  execute: async ({ context, mastra }) => {
    // Access shared workflow state
    const previousResults = context.getStepOutput("step1");

    // Update context
    context.set("newValue", result);

    return { value: "..." };
  },
});
```

**Human-in-the-Loop:**
```typescript
const approvalStep = createStep({
  execute: async ({ context }) => {
    // Suspend and await user input
    const approval = await context.waitForInput({
      prompt: "Approve this action?",
      schema: z.object({ approved: z.boolean() }),
    });

    return { approved: approval.approved };
  },
});
```

### Error Handling & Retry Logic

**Workflow-Level Retry:**
```typescript
const workflow = createWorkflow({
  retryConfig: {
    attempts: 5,      // Max retry attempts
    delay: 2000,      // Delay between retries (ms)
  },
})
  .then(step1)
  .commit();
```

**Step-Level Retry (Overrides Workflow):**
```typescript
const step = createStep({
  id: "fetch-data",
  execute: async () => {
    const response = await fetch('api-url');
    if (!response.ok) throw new Error('Fetch failed');
    return { data: await response.json() };
  },
  retries: 3,  // Step-specific retry count
});
```

**Best Practices:**
- Implement idempotent operations (steps may retry)
- Limit retry attempts to avoid long-running failures
- Use workflow-level retries for transient failures

**Error Logging:**
```typescript
const workflow = createWorkflow({
  onStepFailure: async ({ error, step, context }) => {
    console.error(`Step ${step.id} failed:`, error);
    await notifyOps(error);
  },
})
  .then(step)
  .commit();
```

### Max Turns / Cost Control

**Agent maxSteps:**
```typescript
const agent = new Agent({
  maxSteps: 15,  // Maximum reasoning iterations
  onStepFinish: ({ stepNumber, usage }) => {
    console.log(`Step ${stepNumber}: ${usage.totalTokens} tokens`);

    // Custom abort logic
    if (usage.totalTokens > 50000) {
      throw new Error("Token limit exceeded");
    }
  },
});
```

**Context-Aware Model Selection:**
```typescript
const agent = new Agent({
  model: ({ requestContext }) => {
    const userTier = requestContext.get("user-tier");
    return userTier === "enterprise"
      ? "openai/gpt-4"
      : "openai/gpt-4-mini";
  },
});
```

**Workflow Timeout:**
```typescript
const workflow = createWorkflow({ timeout: 300000 })  // 5 minutes
  .then(step)
  .commit();
```

### Code Example: Complete Agent with Workflow

```typescript
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agents";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Define tool
const searchTool = createTool({
  id: "search",
  description: "Search the web",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ results: z.array(z.string()) }),
  execute: async ({ input }) => {
    // Implementation
    return { results: ["result1", "result2"] };
  },
});

// Define agent
const researchAgent = new Agent({
  id: "research-agent",
  name: "Research Agent",
  model: "openai/gpt-4",
  instructions: [
    "You are a research assistant",
    "Always cite sources",
    "Provide detailed answers",
  ],
  tools: { searchTool },
  maxSteps: 10,
});

// Create workflow with agent
const researchStep = createStep({
  id: "research",
  execute: async ({ context, mastra }) => {
    const agent = mastra.getAgent("research-agent");
    const result = await agent.generate(
      `Research: ${context.topic}`
    );
    return { findings: result.text };
  },
});

const summaryStep = createStep({
  id: "summarize",
  execute: async ({ context }) => {
    const findings = context.getStepOutput("research");
    return { summary: findings.findings.substring(0, 200) };
  },
});

const workflow = createWorkflow({
  name: "research-workflow",
  retryConfig: { attempts: 3, delay: 1000 },
})
  .then(researchStep)
  .then(summaryStep)
  .commit();

// Initialize Mastra
const mastra = new Mastra({
  agents: { researchAgent },
  workflows: { researchWorkflow: workflow },
});

// Execute workflow
const result = await mastra.getWorkflow("research-workflow").execute({
  topic: "TypeScript AI agents",
});
```

### Key Strengths

- **TypeScript-native** with full type safety
- **Intuitive workflow DSL** (`.then()`, `.branch()`, `.parallel()`)
- **Built-in retry mechanisms** at workflow and step levels
- **Human-in-the-loop** via context suspension
- **Model routing** to 40+ providers
- **Observability** with built-in scorers and logging

**Modern Gatsby Team Pedigree:** Built by creators of Gatsby, bringing mature developer experience to AI agents.

---

## 6. Vercel AI SDK

**Language:** TypeScript/JavaScript
**Maturity:** Production (widely adopted)
**Architecture:** ToolLoopAgent with streaming-first design

### Agent Loop (Observe → Think → Act → Repeat)

The **ToolLoopAgent** class provides production-ready tool execution loop:

```typescript
import { ToolLoopAgent } from "ai";
import { openai } from "@ai-sdk/openai";

const agent = new ToolLoopAgent({
  model: openai("gpt-4"),
  tools: { weatherTool, searchTool },
  system: "You are a helpful assistant",
  stopWhen: [
    stepCountIs(20),           // Max 20 steps (default)
    hasToolCall("finish"),     // Stop when finish tool called
  ],
});

const result = await agent.generate("What's the weather?");
```

**Automatic Orchestration:**
1. **Model Call**: LLM receives prompt + conversation history
2. **Tool Detection**: Response checked for tool calls
3. **Tool Execution**: All tools executed (concurrent if multiple)
4. **Result Append**: Tool results added to conversation
5. **Repeat**: Continue until stop condition met
6. **Return**: Final text response or metadata

"The AI SDK automatically handles orchestration by appending each response to the conversation history, executing tool calls, and triggering additional generations."

### Tool/Skills Registration

**Type-Safe Tool Definition:**
```typescript
import { tool } from "ai";
import { z } from "zod";

const weatherTool = tool({
  description: "Get the weather for a location",
  parameters: z.object({
    location: z.string().describe("City name"),
  }),
  execute: async ({ location }) => {
    // Tool implementation
    return { temperature: 72, condition: "sunny" };
  },
});

const agent = new ToolLoopAgent({
  tools: { weatherTool },
});
```

**Human-in-the-Loop (Single Flag):**
```typescript
const approveTool = tool({
  description: "Approve a critical action",
  parameters: z.object({ action: z.string() }),
  needsApproval: true,  // Pauses execution for human approval
  execute: async ({ action }) => {
    return { approved: true };
  },
});
```

"You get human-in-the-loop control with a single `needsApproval` flag, no custom code required."

### Loop Control (stopWhen & prepareStep)

**Built-in Stop Conditions:**
```typescript
import { stepCountIs, hasToolCall } from "ai";

const agent = new ToolLoopAgent({
  stopWhen: [
    stepCountIs(20),              // Halt after 20 steps
    hasToolCall("finish"),        // Stop when finish tool invoked
  ],
});
```

**Custom Stop Condition:**
```typescript
const agent = new ToolLoopAgent({
  stopWhen: ({ stepNumber, steps, usage }) => {
    // Access full execution history
    const totalTokens = steps.reduce(
      (sum, step) => sum + step.usage.totalTokens,
      0
    );

    return totalTokens > 100000;  // Stop if token limit exceeded
  },
});
```

**Dynamic Configuration (prepareStep):**
```typescript
const agent = new ToolLoopAgent({
  prepareStep: ({ model, stepNumber, steps, messages }) => {
    // Model switching based on complexity
    if (stepNumber > 5) {
      return { model: openai("gpt-4-turbo") };
    }

    // Context trimming for cost control
    if (messages.length > 50) {
      return {
        messages: [
          messages[0],  // Keep system message
          ...messages.slice(-30),  // Last 30 messages
        ],
      };
    }

    // Tool sequencing (restrict tools by phase)
    if (stepNumber < 3) {
      return { tools: { searchTool } };  // Search only initially
    }

    return {};  // No changes
  },
});
```

### Streaming Implementation

**Streaming Architecture:**
The AI SDK uses **Server-Sent Events (SSE)** as standard for streaming data from server to client.

**Stream Method:**
```typescript
const agent = new ToolLoopAgent({
  model: openai("gpt-4"),
  tools: { weatherTool },
});

// Stream tokens in real-time
const stream = await agent.stream("What's the weather?");

for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.textDelta);
  } else if (chunk.type === "tool-call") {
    console.log(`Tool called: ${chunk.toolName}`);
  }
}
```

**Integration with React (UI Streaming):**
```typescript
import { useChat } from "ai/react";

function ChatComponent() {
  const { messages, input, handleSubmit, isLoading } = useChat({
    api: "/api/chat",  // API route with ToolLoopAgent
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} />
      </form>
    </div>
  );
}
```

### State Management

**Type-Safe Call Options:**
```typescript
const agent = new ToolLoopAgent<{ userId: string }>({
  model: openai("gpt-4"),
  tools: { weatherTool },
});

// Pass context to tools
const result = await agent.generate(
  "What's the weather?",
  { userId: "user-123" }
);

// Tools receive typed context
const weatherTool = tool({
  execute: async ({ location }, { userId }) => {
    // userId is type-safe string
    console.log(`Fetching weather for user ${userId}`);
    return { temperature: 72 };
  },
});
```

**No Built-in Memory:** AI SDK doesn't provide built-in conversation memory. Implement via:

```typescript
const conversationHistory: Message[] = [];

async function chat(userMessage: string) {
  conversationHistory.push({ role: "user", content: userMessage });

  const result = await agent.generate(userMessage, {
    messages: conversationHistory,
  });

  conversationHistory.push({ role: "assistant", content: result.text });

  return result.text;
}
```

### Error Handling & Retry Logic

**Tool Execution Errors:**
```typescript
const weatherTool = tool({
  execute: async ({ location }) => {
    try {
      const data = await fetchWeather(location);
      return data;
    } catch (error) {
      // Return error as tool result
      return { error: "Failed to fetch weather" };
    }
  },
});
```

**Agent-Level Error Handling:**
The AI SDK doesn't provide built-in retry logic. Implement externally:

```typescript
async function generateWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await agent.generate(prompt);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

### Max Turns / Cost Control

**Step Count Limit:**
```typescript
const agent = new ToolLoopAgent({
  stopWhen: stepCountIs(20),  // Default maximum
});
```

**Token-Based Limits:**
```typescript
const agent = new ToolLoopAgent({
  stopWhen: ({ steps }) => {
    const totalTokens = steps.reduce(
      (sum, step) => sum + (step.usage?.totalTokens || 0),
      0
    );
    return totalTokens > 50000;
  },
});
```

**Cost Estimation:**
```typescript
const agent = new ToolLoopAgent({
  stopWhen: ({ steps, model }) => {
    const totalCost = steps.reduce((sum, step) => {
      const tokens = step.usage?.totalTokens || 0;
      const costPer1k = model === "gpt-4" ? 0.03 : 0.002;
      return sum + (tokens / 1000) * costPer1k;
    }, 0);

    return totalCost > 1.0;  // Stop if cost exceeds $1
  },
});
```

### Code Example: Complete Streaming Agent

```typescript
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// Define tools
const searchTool = tool({
  description: "Search the web for information",
  parameters: z.object({
    query: z.string().describe("Search query"),
  }),
  execute: async ({ query }) => {
    // Implementation
    return { results: [`Result for ${query}`] };
  },
});

const finishTool = tool({
  description: "Call when task is complete",
  parameters: z.object({
    summary: z.string(),
  }),
  execute: async ({ summary }) => {
    return { done: true, summary };
  },
});

// Create agent
const agent = new ToolLoopAgent({
  model: openai("gpt-4"),
  tools: { searchTool, finishTool },
  system: "You are a research assistant. Use tools to gather information.",
  stopWhen: [
    stepCountIs(15),
    hasToolCall("finishTool"),
  ],
  prepareStep: ({ stepNumber, messages }) => {
    // Switch to faster model after initial research
    if (stepNumber > 5) {
      return { model: openai("gpt-4-turbo") };
    }

    // Trim context for cost control
    if (messages.length > 40) {
      return {
        messages: [messages[0], ...messages.slice(-25)],
      };
    }
  },
});

// Stream execution
async function research(topic: string) {
  console.log(`Researching: ${topic}\n`);

  const stream = await agent.stream(topic);

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text-delta":
        process.stdout.write(chunk.textDelta);
        break;
      case "tool-call":
        console.log(`\n[Tool: ${chunk.toolName}]`);
        break;
      case "tool-result":
        console.log(`[Result: ${JSON.stringify(chunk.result)}]\n`);
        break;
      case "finish":
        console.log(`\n\nUsage: ${JSON.stringify(chunk.usage)}`);
        break;
    }
  }
}

research("TypeScript AI agent frameworks 2026");
```

### Key Strengths

- **Production-ready** ToolLoopAgent with automatic orchestration
- **Streaming-first** design with SSE standard
- **Type safety** end-to-end with TypeScript
- **Simple human-in-the-loop** via `needsApproval` flag
- **Flexible loop control** via `stopWhen` and `prepareStep`
- **React integration** with `useChat` hook
- **Clean architecture** promotes separation of concerns

**Best for:** Production streaming agents with real-time UI updates and cost control.

---

## Comparison Matrix

| Framework       | Language   | Agent Loop          | State Management      | Plugin/Skill System       | Streaming | Human-in-Loop | Max Turns Control |
|:----------------|:-----------|:--------------------|:----------------------|:---------------------------|:----------|:--------------|:------------------|
| **Claude Code** | TS/Py      | Meta-tool dispatch  | Forked/Inline context | File-based discovery       | Yes       | Via tools     | stopWhen (20)     |
| **LangGraph.js**| TS         | Graph state machine | Reducer + checkpoint  | Function registration      | Yes       | interrupt()   | Custom routing    |
| **OpenHands**   | Python     | Event stream        | Action-obs history    | AgentSkills library        | No        | Event inject  | Custom state      |
| **CrewAI**      | Python     | Multi-agent tasks   | Task context prop     | BaseTool classes           | No        | Task config   | max_iter/max_rpm  |
| **Mastra**      | TypeScript | Workflow graphs     | Context + memory      | Type-safe tools            | Yes       | waitForInput  | maxSteps          |
| **Vercel AI**   | TypeScript | ToolLoopAgent       | Messages array        | Type-safe tools            | Yes (SSE) | needsApproval | stepCountIs(20)   |

---

## Recommended Architecture for Nexus

Based on the research, here's the recommended stack for building Nexus (ReAct agent with modular plugin system in TypeScript):

### Primary Framework: **Mastra** + **Vercel AI SDK** Hybrid

**Why This Combination:**

1. **Mastra for Workflow Orchestration**
   - Native TypeScript with full type safety
   - Intuitive workflow DSL (`.then()`, `.branch()`, `.parallel()`)
   - Built-in retry mechanisms
   - Human-in-the-loop via context suspension
   - Releasing v1 in January 2026 (production-ready timing)

2. **Vercel AI SDK for Agent Loop & Streaming**
   - Production-ready ToolLoopAgent
   - Streaming-first architecture (critical for UI responsiveness)
   - Flexible loop control (`stopWhen`, `prepareStep`)
   - Excellent TypeScript support
   - Large community and active development

### Plugin System: **Claude Code-Inspired File-Based Discovery**

**Directory Structure:**
```
nexus/
├── .nexus/
│   ├── skills/                    # Built-in skills
│   │   └── code-explainer/
│   │       ├── SKILL.md           # Skill definition
│   │       └── examples.md        # Supporting docs
│   └── config.json                # Global config
├── plugins/
│   ├── web-research/              # Plugin 1
│   │   ├── .nexus-plugin/
│   │   │   └── plugin.json        # Manifest
│   │   ├── skills/
│   │   │   └── deep-search/
│   │   │       └── SKILL.md
│   │   └── tools/
│   │       └── scraper.ts
│   └── code-analysis/             # Plugin 2
│       ├── .nexus-plugin/
│       │   └── plugin.json
│       └── tools/
│           └── ast-parser.ts
```

**Why File-Based:**
- Version control friendly (commit plugins with project)
- Easy distribution (npm packages or git submodules)
- Progressive disclosure (load metadata first, full content on demand)
- Supports nested discovery (monorepos)
- Clear separation of concerns

### Agent Loop Architecture

**Core Pattern:**
```typescript
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { openai } from "@ai-sdk/openai";

// 1. Define tools from plugins
const pluginTools = await discoverPluginTools("./plugins");

// 2. Create ToolLoopAgent with discovered tools
const agent = new ToolLoopAgent({
  model: openai("gpt-4"),
  tools: pluginTools,
  stopWhen: [
    stepCountIs(20),
    hasToolCall("finish"),
    customCostLimit,
  ],
  prepareStep: dynamicContextManagement,
});

// 3. Wrap in Mastra workflow for complex orchestration
const researchWorkflow = createWorkflow({
  retryConfig: { attempts: 3, delay: 1000 },
})
  .then(createStep({
    id: "research",
    execute: async ({ context }) => {
      const result = await agent.generate(context.query);
      return { findings: result.text };
    },
  }))
  .branch({
    if: ({ context }) => context.requiresApproval,
    then: humanApprovalStep,
  })
  .then(summaryStep)
  .commit();
```

### State Management Strategy

**Multi-Layered Approach:**

1. **Tool Level**: Vercel AI SDK message array
   ```typescript
   const messages: Message[] = [
     { role: "system", content: "..." },
     { role: "user", content: "..." },
     { role: "assistant", content: "..." },
   ];
   ```

2. **Workflow Level**: Mastra context
   ```typescript
   const workflow = createWorkflow()
     .then(createStep({
       execute: async ({ context }) => {
         const previousStepData = context.getStepOutput("step1");
         context.set("newData", result);
       },
     }));
   ```

3. **Persistence**: Optional checkpointing for long-running tasks
   ```typescript
   // Implement via file system or database
   await saveCheckpoint(sessionId, { messages, context, stepNumber });
   ```

### Plugin Discovery & Loading

**Runtime Registration System:**

```typescript
// src/core/plugin-loader.ts
import { readdir, readFile } from "fs/promises";
import { join } from "path";

interface PluginManifest {
  name: string;
  version: string;
  skills: string[];
  tools: string[];
}

async function discoverPlugins(pluginDir: string): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  const entries = await readdir(pluginDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(pluginDir, entry.name, ".nexus-plugin/plugin.json");

    try {
      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest: PluginManifest = JSON.parse(manifestContent);

      // Load skills
      const skills = await loadSkills(pluginDir, entry.name, manifest.skills);

      // Load tools
      const tools = await loadTools(pluginDir, entry.name, manifest.tools);

      plugins.push({
        name: manifest.name,
        version: manifest.version,
        skills,
        tools,
      });
    } catch (error) {
      console.warn(`Failed to load plugin ${entry.name}:`, error);
    }
  }

  return plugins;
}

async function loadTools(pluginDir: string, pluginName: string, toolPaths: string[]) {
  const tools = [];

  for (const toolPath of toolPaths) {
    const fullPath = join(pluginDir, pluginName, "tools", toolPath);
    const toolModule = await import(fullPath);
    tools.push(toolModule.default);
  }

  return tools;
}
```

**Tool Registration Pattern:**

```typescript
// plugins/web-research/tools/scraper.ts
import { tool } from "ai";
import { z } from "zod";

export default tool({
  description: "Scrape content from a webpage",
  parameters: z.object({
    url: z.string().url(),
    selector: z.string().optional(),
  }),
  execute: async ({ url, selector }) => {
    // Implementation
    const content = await scrapeWebpage(url, selector);
    return { content };
  },
});
```

### Error Handling & Retry Logic

**Multi-Level Strategy:**

```typescript
// 1. Tool-level error handling
const resilientTool = tool({
  execute: async ({ url }) => {
    try {
      return await fetchData(url);
    } catch (error) {
      return { error: error.message };
    }
  },
});

// 2. Workflow-level retries
const workflow = createWorkflow({
  retryConfig: {
    attempts: 3,
    delay: 2000,
  },
})
  .then(step)
  .commit();

// 3. Agent-level custom retry logic
async function agentWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await agent.generate(prompt);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await exponentialBackoff(attempt);
    }
  }
}
```

### Cost Control Mechanisms

**Comprehensive Monitoring:**

```typescript
const agent = new ToolLoopAgent({
  stopWhen: [
    stepCountIs(20),  // Hard limit on iterations

    // Token-based limit
    ({ steps }) => {
      const totalTokens = steps.reduce(
        (sum, step) => sum + (step.usage?.totalTokens || 0),
        0
      );
      return totalTokens > 100000;
    },

    // Cost-based limit
    ({ steps }) => {
      const totalCost = calculateCost(steps);
      return totalCost > 5.0;  // $5 limit
    },
  ],

  prepareStep: ({ stepNumber, messages, usage }) => {
    // Switch to cheaper model after initial reasoning
    if (stepNumber > 3) {
      return { model: openai("gpt-4-turbo-mini") };
    }

    // Aggressive context trimming
    if (messages.length > 50) {
      return {
        messages: [
          messages[0],  // System prompt
          ...messages.slice(-20),  // Recent context
        ],
      };
    }
  },

  onStepFinish: ({ stepNumber, usage }) => {
    // Real-time monitoring
    console.log(`Step ${stepNumber}: ${usage.totalTokens} tokens`);
    logToObservability({ stepNumber, usage });
  },
});
```

### Human-in-the-Loop Patterns

**Dual Approach:**

```typescript
// 1. Vercel AI SDK needsApproval flag
const criticalTool = tool({
  description: "Delete production data",
  parameters: z.object({ id: z.string() }),
  needsApproval: true,  // Automatic approval flow
  execute: async ({ id }) => {
    await deleteData(id);
    return { success: true };
  },
});

// 2. Mastra workflow suspension
const approvalStep = createStep({
  id: "approval",
  execute: async ({ context, mastra }) => {
    const decision = await context.waitForInput({
      prompt: "Approve this action?",
      schema: z.object({
        approved: z.boolean(),
        reason: z.string().optional(),
      }),
    });

    if (!decision.approved) {
      throw new Error(`Rejected: ${decision.reason}`);
    }

    return { approved: true };
  },
});
```

### Streaming Architecture

**SSE-Based Real-Time Updates:**

```typescript
// API Route (Next.js example)
import { ToolLoopAgent } from "ai";

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const agent = new ToolLoopAgent({
    model: openai("gpt-4"),
    tools: pluginTools,
  });

  const stream = await agent.stream(prompt);

  // Transform to SSE format
  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    }
  );
}
```

**Client-Side Integration:**

```typescript
// Frontend (React)
import { useChat } from "ai/react";

function NexusChat() {
  const { messages, input, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    onToolCall: ({ toolCall }) => {
      console.log(`Tool: ${toolCall.toolName}`);
    },
  });

  return (
    <div>
      {messages.map(m => (
        <Message key={m.id} content={m.content} role={m.role} />
      ))}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
```

---

## Alternative Architectures Considered

### Option A: Pure LangGraph.js

**Pros:**
- Explicit graph structure (excellent for complex workflows)
- Robust checkpointing
- Human-in-the-loop via interrupt()
- LangChain ecosystem integration

**Cons:**
- More verbose than Mastra
- Heavier dependency graph
- Steeper learning curve
- Checkpointing requires additional setup

**Verdict:** Excellent for complex multi-branch workflows, but overkill for straightforward ReAct patterns.

### Option B: Pure Vercel AI SDK

**Pros:**
- Simplest implementation
- Production-ready out of the box
- Excellent streaming support
- Large community

**Cons:**
- Limited workflow orchestration
- No built-in retry mechanisms
- Manual state management
- Less structured than Mastra/LangGraph

**Verdict:** Perfect for simple agents, but lacks workflow capabilities needed for complex tasks.

### Option C: Claude Code Agent SDK

**Pros:**
- Best-in-class plugin system
- Progressive disclosure pattern
- Subagent delegation
- Dynamic context injection

**Cons:**
- Tightly coupled to Claude API
- Less control over agent loop
- Meta-tool pattern may be limiting
- SDK still maturing

**Verdict:** Excellent patterns to borrow (especially plugin discovery), but too coupled to Anthropic ecosystem.

---

## Implementation Roadmap for Nexus

### Phase 1: Core Agent Loop (Week 1-2)

1. **Setup Vercel AI SDK ToolLoopAgent**
   - Configure basic agent with stopWhen conditions
   - Implement prepareStep for dynamic control
   - Add cost tracking and monitoring

2. **Create Base Tool Interface**
   ```typescript
   interface NexusTool {
     id: string;
     description: string;
     parameters: ZodSchema;
     execute: (params: unknown) => Promise<unknown>;
     needsApproval?: boolean;
   }
   ```

3. **Implement Streaming API**
   - SSE endpoint for real-time updates
   - Tool call/result events
   - Error handling in stream

### Phase 2: Plugin System (Week 3-4)

1. **File-Based Discovery**
   - Scan `.nexus-plugin/` directories
   - Parse plugin.json manifests
   - Load skills and tools dynamically

2. **Plugin Manifest Schema**
   ```typescript
   interface PluginManifest {
     name: string;
     version: string;
     description: string;
     author: string;
     skills: SkillDefinition[];
     tools: string[];  // Paths to tool modules
     dependencies?: Record<string, string>;
   }
   ```

3. **Skill Format (Claude-Inspired)**
   ```markdown
   ---
   name: web-researcher
   description: Research topics using web search
   max-steps: 10
   tools: [search, scrape]
   ---

   # Instructions
   When researching:
   1. Use search tool to find sources
   2. Scrape relevant pages
   3. Synthesize findings
   ```

### Phase 3: Workflow Integration (Week 5-6)

1. **Mastra Workflow Layer**
   - Wrap agents in workflow steps
   - Implement branching logic
   - Add human-in-the-loop gates

2. **State Persistence**
   - File-based checkpointing
   - Session resumption
   - Conversation history management

3. **Error Handling**
   - Workflow-level retries
   - Tool fallbacks
   - Graceful degradation

### Phase 4: Observability & Control (Week 7-8)

1. **Monitoring**
   - Token usage tracking
   - Cost estimation
   - Performance metrics
   - Error logging

2. **Admin Dashboard**
   - Real-time agent status
   - Plugin management
   - Cost controls
   - Usage analytics

3. **Testing Infrastructure**
   - Unit tests for tools
   - Integration tests for workflows
   - E2E tests for agent loops

---

## Key Takeaways

### Standard Patterns (2025/2026)

1. **File-Based Plugin Discovery** is now standard
   - Version control friendly
   - Easy distribution
   - Progressive disclosure

2. **Streaming is Essential**
   - SSE for real-time updates
   - Tool call events
   - Responsive UIs

3. **Type Safety Throughout**
   - Zod schemas for validation
   - TypeScript for tooling
   - End-to-end type safety

4. **Human-in-the-Loop is First-Class**
   - Built-in approval flows
   - Workflow interruption
   - Context preservation

5. **Cost Control is Critical**
   - Token limits
   - Step counting
   - Dynamic model switching
   - Context trimming

### Architectural Principles

1. **Separation of Concerns**
   - Agent loop (Vercel AI SDK)
   - Workflow orchestration (Mastra)
   - Plugin system (Custom)

2. **Progressive Disclosure**
   - Load metadata first
   - Full content on demand
   - Keep context lean

3. **Fail Gracefully**
   - Retry transient failures
   - Return errors as tool results
   - Log everything

4. **Observable by Default**
   - Step-by-step logging
   - Token usage tracking
   - Performance metrics

5. **Extensible Architecture**
   - Plugin-based tools
   - Custom workflows
   - Framework-agnostic tools

---

## Sources

### Claude Code / Agent SDK
- [Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
- [Claude Skills vs Sub-agents: Architecture, Use Cases, and Effective Patterns | Medium](https://medium.com/@SandeepTnvs/claude-skills-vs-sub-agents-architecture-use-cases-and-effective-patterns-3e535c9e0122)
- [Building agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Plugins in the SDK - Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/plugins)

### LangGraph.js
- [How to create a ReAct agent from scratch](https://langchain-ai.github.io/langgraph/how-tos/react-agent-from-scratch/)
- [Build ReAct AI Agents with LangGraph | Medium](https://medium.com/@tahirbalarabe2/build-react-ai-agents-with-langgraph-cb9d28cc6e20)
- [Mastering LangGraph State Management in 2025](https://sparkco.ai/blog/mastering-langgraph-state-management-in-2025)
- [Human-in-the-loop - LangGraph Docs](https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/)
- [Interrupts - Docs by LangChain](https://docs.langchain.com/oss/python/langgraph/interrupts)

### OpenHands
- [OpenHands: An Open Platform for AI Software Developers as Generalist Agents](https://arxiv.org/html/2407.16741v3)
- [GitHub - OpenHands/OpenHands](https://github.com/OpenHands/OpenHands)
- [The OpenHands Software Agent SDK](https://arxiv.org/html/2511.03690v1)

### CrewAI
- [Introduction - CrewAI](https://docs.crewai.com/en/introduction)
- [GitHub - crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)
- [Agent Orchestration 2026: LangGraph, CrewAI & AutoGen Guide | Iterathon](https://iterathon.tech/blog/ai-agent-orchestration-frameworks-2026)

### Mastra
- [GitHub - mastra-ai/mastra](https://github.com/mastra-ai/mastra)
- [About Mastra | Mastra Docs](https://mastra.ai/docs)
- [Using Agents | Mastra Docs](https://mastra.ai/docs/agents/overview)
- [Error Handling | Workflows | Mastra Docs](https://mastra.ai/docs/workflows/error-handling)

### Vercel AI SDK
- [AI SDK 6 - Vercel](https://vercel.com/blog/ai-sdk-6)
- [How to build AI Agents with Vercel and the AI SDK](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk)
- [Agents: Loop Control](https://ai-sdk.dev/docs/agents/loop-control)
- [AI SDK Core: ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)

### Error Handling & Retry Patterns
- [Mastering Retry Logic Agents: A Deep Dive into 2025 Best Practices](https://sparkco.ai/blog/mastering-retry-logic-agents-a-deep-dive-into-2025-best-practices)
- [Interrupts and Commands in LangGraph: Building Human-in-the-Loop Workflows](https://dev.to/jamesbmour/interrupts-and-commands-in-langgraph-building-human-in-the-loop-workflows-4ngl)

---

**End of Research Document**

*Generated: January 26, 2026*
*For: Nexus AI Agent Project*
*Research Scope: Modern ReAct AI Agent Architectures in TypeScript/Node.js (2025/2026)*
