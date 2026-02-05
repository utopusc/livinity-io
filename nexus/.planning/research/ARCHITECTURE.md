# ReAct Agent Architecture Research

**Research Date:** 2026-01-26
**Target:** Nexus system evolution from single-step dispatcher to ReAct agent loop
**Focus:** Node.js/TypeScript with existing daemon, Redis, and Gemini integration

---

## Executive Summary

ReAct (Reasoning + Acting) agents operate through an iterative **Observe → Think → Act** cycle, continuously refining their approach based on environmental feedback. This research documents how to integrate ReAct patterns into Nexus's existing Router → Handler architecture without disruption, transforming current handlers into tools while preserving all functionality.

**Key Finding:** Nexus already has the foundational infrastructure. The evolution requires:
1. Tool Registry wrapping existing handlers
2. Agent Loop coordinating multi-step execution
3. State Manager persisting conversation/task context in Redis
4. Observation Parser feeding results back into the loop

---

## 1. Core Components

### 1.1 Agent Loop (Observe-Think-Act Cycle)

#### How It Works

The agent loop is a **while loop** that continues until the objective is fulfilled:

```
LOOP START
  ↓
[OBSERVE] → Review current state + last action results
  ↓
[THINK] → LLM reasons about next step (internal dialogue)
  ↓
[ACT] → Execute tool / produce final answer
  ↓
[CHECK] → Objective complete? → YES: END / NO: LOOP
```

**Implementation Pattern (TypeScript):**

```typescript
interface AgentState {
  messages: Message[];  // Conversation history
  objective: string;
  iterations: number;
  maxIterations: number;
}

async function agentLoop(state: AgentState): Promise<string> {
  while (state.iterations < state.maxIterations) {
    // OBSERVE: Build context from history
    const context = buildContext(state.messages);

    // THINK: LLM decides next action
    const decision = await llm.generateContent({
      prompt: `Objective: ${state.objective}\n\nHistory:\n${context}\n\nWhat's your next step?`,
      systemPrompt: REACT_SYSTEM_PROMPT
    });

    // ACT: Execute tool or return answer
    const result = await executeAction(decision);
    state.messages.push({ role: 'assistant', content: decision });
    state.messages.push({ role: 'tool', content: result });

    // CHECK: Are we done?
    if (decision.type === 'final_answer') {
      return decision.answer;
    }

    state.iterations++;
  }

  throw new Error('Max iterations reached');
}
```

**Conditional Router Pattern:**

The `should_continue()` function determines routing:
- If LLM output contains `tool_calls` → route to tool execution
- Otherwise → terminate with final answer

**Source:** LangGraph uses StateGraph with conditional edges for this pattern.

---

### 1.2 Tool Registry

#### Purpose

Centralize tool discovery, validation, and invocation. Enable dynamic loading of tools from handlers/plugins without hardcoding.

#### Pattern (Registry Pattern)

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: Record<string, any>) => Promise<any>;
}

interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
}

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    logger.info(`Tool registered: ${tool.name}`);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  // For LLM function calling
  toFunctionSchemas(): Array<{name: string, description: string, parameters: object}> {
    return this.getAll().map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters,
        required: Object.keys(t.parameters).filter(k => t.parameters[k].required)
      }
    }));
  }

  async invoke(toolCall: {name: string, args: Record<string, any>}): Promise<any> {
    const tool = this.get(toolCall.name);
    if (!tool) throw new Error(`Tool not found: ${toolCall.name}`);

    // Validation
    this.validateArgs(tool, toolCall.args);

    // Execute
    return await tool.execute(toolCall.args);
  }

  private validateArgs(tool: Tool, args: Record<string, any>): void {
    for (const [key, param] of Object.entries(tool.parameters)) {
      if (param.required && !(key in args)) {
        throw new Error(`Missing required parameter: ${key}`);
      }
      if (param.enum && !param.enum.includes(args[key])) {
        throw new Error(`Invalid enum value for ${key}: ${args[key]}`);
      }
    }
  }
}
```

**Integration with Gemini Function Calling:**

Gemini's `functionDeclarations` expects this schema format:

```typescript
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-pro',
  tools: [{
    functionDeclarations: toolRegistry.toFunctionSchemas()
  }]
});

const result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
});

// Parse function calls from result
const functionCall = result.response.functionCalls()?.[0];
if (functionCall) {
  const output = await toolRegistry.invoke({
    name: functionCall.name,
    args: functionCall.args
  });
}
```

---

### 1.3 Skill Loader (Plugin System)

#### Purpose

Load tools/handlers dynamically from the filesystem, enabling hot-reloading and plugin architecture.

#### Pattern

```typescript
interface SkillManifest {
  name: string;
  version: string;
  tools: Tool[];
  dependencies?: string[];
}

class SkillLoader {
  private skillsDir: string;
  private registry: ToolRegistry;

  constructor(skillsDir: string, registry: ToolRegistry) {
    this.skillsDir = skillsDir;
    this.registry = registry;
  }

  async loadAll(): Promise<void> {
    const skillDirs = await fs.readdir(this.skillsDir, { withFileTypes: true });

    for (const dir of skillDirs.filter(d => d.isDirectory())) {
      await this.loadSkill(path.join(this.skillsDir, dir.name));
    }
  }

  async loadSkill(skillPath: string): Promise<void> {
    const manifestPath = path.join(skillPath, 'skill.json');
    const manifest: SkillManifest = JSON.parse(
      await fs.readFile(manifestPath, 'utf-8')
    );

    // Load main module
    const skillModule = await import(path.join(skillPath, 'index.js'));

    // Register tools
    for (const toolDef of manifest.tools) {
      const tool: Tool = {
        ...toolDef,
        execute: skillModule[toolDef.name] // Function exported from module
      };
      this.registry.register(tool);
    }

    logger.info(`Skill loaded: ${manifest.name} (${manifest.tools.length} tools)`);
  }

  async reload(skillName: string): Promise<void> {
    // Remove old tools
    // Re-import module (bust require cache)
    // Re-register
  }
}
```

**Directory Structure:**

```
nexus/skills/
├── docker/
│   ├── skill.json
│   └── index.ts
├── pm2/
│   ├── skill.json
│   └── index.ts
└── files/
    ├── skill.json
    └── index.ts
```

**Example skill.json:**

```json
{
  "name": "docker",
  "version": "1.0.0",
  "tools": [
    {
      "name": "docker_start",
      "description": "Start a Docker container",
      "parameters": {
        "container": {
          "type": "string",
          "description": "Container name or ID",
          "required": true
        }
      }
    }
  ]
}
```

---

### 1.4 State Manager

#### Purpose

Persist agent state (conversation history, task progress, memory) across turns and daemon restarts using Redis.

#### Redis Storage Patterns

**Short-term Memory (Conversation History):**

```typescript
interface ConversationState {
  threadId: string;
  messages: Message[];
  objective: string;
  iterations: number;
  lastUpdated: number;
}

class StateManager {
  private redis: Redis;

  async saveState(threadId: string, state: ConversationState): Promise<void> {
    await this.redis.set(
      `nexus:state:${threadId}`,
      JSON.stringify(state),
      'EX',
      3600 // 1 hour TTL
    );
  }

  async loadState(threadId: string): Promise<ConversationState | null> {
    const data = await this.redis.get(`nexus:state:${threadId}`);
    return data ? JSON.parse(data) : null;
  }

  async appendMessage(threadId: string, message: Message): Promise<void> {
    const state = await this.loadState(threadId);
    if (!state) throw new Error('State not found');

    state.messages.push(message);
    state.lastUpdated = Date.now();
    await this.saveState(threadId, state);
  }
}
```

**Long-term Memory (Semantic Knowledge):**

Uses Redis vector search (RedisVL) for semantic retrieval:

```typescript
// Store memories with embeddings
await redis.call('FT.CREATE', 'idx:memories',
  'ON', 'JSON',
  'SCHEMA',
  '$.embedding', 'VECTOR', 'FLAT', '6', 'DIM', '768', 'TYPE', 'FLOAT32'
);

// Store memory
await redis.json.set(`memory:${id}`, '$', {
  content: "User prefers concise responses",
  embedding: await getEmbedding("User prefers concise responses"),
  timestamp: Date.now()
});

// Retrieve relevant memories
const results = await redis.call('FT.SEARCH', 'idx:memories',
  '*=>[KNN 3 @embedding $query_vec]',
  'PARAMS', '2', 'query_vec', queryEmbedding
);
```

**Persistence Configuration:**

Redis supports two persistence modes:
- **RDB:** Point-in-time snapshots (fast, less durable)
- **AOF:** Append-only log (slower, more durable)

For agent state, use **AOF** with `appendfsync everysec` for balance between performance and durability.

---

### 1.5 Observation Parser

#### Purpose

Transform action results (tool outputs, errors) into structured observations that feed back into the LLM's context.

#### Pattern

```typescript
interface Observation {
  type: 'success' | 'error' | 'partial';
  toolName: string;
  output: any;
  formatted: string; // Human-readable summary for LLM
  metadata?: {
    executionTime?: number;
    retryCount?: number;
  };
}

class ObservationParser {
  parse(toolName: string, result: any, error?: Error): Observation {
    if (error) {
      return {
        type: 'error',
        toolName,
        output: null,
        formatted: `Tool "${toolName}" failed: ${error.message}`
      };
    }

    // Success - format based on output type
    let formatted = '';
    if (typeof result === 'string') {
      formatted = this.truncate(result, 1000);
    } else if (typeof result === 'object') {
      formatted = JSON.stringify(result, null, 2);
    } else {
      formatted = String(result);
    }

    return {
      type: 'success',
      toolName,
      output: result,
      formatted: `Tool "${toolName}" completed:\n${formatted}`
    };
  }

  formatForLLM(observations: Observation[]): string {
    return observations
      .map(o => `[${o.type.toUpperCase()}] ${o.formatted}`)
      .join('\n\n');
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '\n...[truncated]';
  }
}
```

**Integration with Agent Loop:**

```typescript
const parser = new ObservationParser();

// After tool execution
try {
  const result = await toolRegistry.invoke(toolCall);
  const observation = parser.parse(toolCall.name, result);

  // Add to state for next iteration
  state.messages.push({
    role: 'tool',
    name: toolCall.name,
    content: observation.formatted
  });
} catch (error) {
  const observation = parser.parse(toolCall.name, null, error);
  state.messages.push({
    role: 'tool',
    name: toolCall.name,
    content: observation.formatted
  });
}
```

---

## 2. Data Flow

### 2.1 End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. TASK ENTRY                                                       │
│    • MCP call / WhatsApp message / webhook                          │
│    • Daemon.addToInbox(message, source, requestId)                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. TASK ASSIGNMENT                                                  │
│    • Daemon.cycle() processes inbox                                 │
│    • Create AgentState { objective, messages: [], threadId }        │
│    • StateManager.saveState(threadId, state)                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. AGENT LOOP                                                       │
│    ┌─────────────────────────────────────────────────────────┐     │
│    │ ITERATION N:                                            │     │
│    │                                                          │     │
│    │  [OBSERVE]                                              │     │
│    │  • Load state from Redis                                │     │
│    │  • Build context: objective + message history           │     │
│    │                                                          │     │
│    │  [THINK]                                                │     │
│    │  • LLM.generateContent(context + tool schemas)          │     │
│    │  • Parse response: tool_call or final_answer            │     │
│    │                                                          │     │
│    │  [ACT]                                                  │     │
│    │  • IF tool_call:                                        │     │
│    │      → ToolRegistry.invoke(name, args)                  │     │
│    │      → ObservationParser.parse(result)                  │     │
│    │      → Append to state.messages                         │     │
│    │      → StateManager.saveState()                         │     │
│    │      → LOOP (next iteration)                            │     │
│    │  • IF final_answer:                                     │     │
│    │      → BREAK (exit loop)                                │     │
│    └─────────────────────────────────────────────────────────┘     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. RESULT RETURNED                                                  │
│    • Extract final_answer from last LLM response                    │
│    • Store in Redis: nexus:answer:{requestId}                       │
│    • Clean up state (or archive for learning)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Tool Invocation Methods

#### Method 1: Function Calling (Recommended for Gemini)

**Structured approach using Gemini's native function calling:**

```typescript
// Define tools as function declarations
const tools = [{
  functionDeclarations: toolRegistry.toFunctionSchemas()
}];

// LLM call with tools
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro', tools });
const chat = model.startChat({ history: state.messages });
const result = await chat.sendMessage(userPrompt);

// Check for function calls
const functionCalls = result.response.functionCalls();
if (functionCalls && functionCalls.length > 0) {
  for (const fc of functionCalls) {
    const output = await toolRegistry.invoke({ name: fc.name, args: fc.args });

    // Send function response back to LLM
    const followUp = await chat.sendMessage([{
      functionResponse: {
        name: fc.name,
        response: { result: output }
      }
    }]);
  }
}
```

**Advantages:**
- Gemini handles parsing (no regex/JSON extraction needed)
- Type-safe schemas enforced at API level
- Automatic retry on malformed calls
- Native support for multi-turn function calling

**Disadvantages:**
- Requires Gemini 1.5+ (not compatible with older models)
- Vendor lock-in to Gemini's function calling format

---

#### Method 2: Text Parsing (ReAct-style)

**Text-based approach using prompt engineering:**

```typescript
const systemPrompt = `
You have access to these tools:
${toolRegistry.getAll().map(t => `- ${t.name}: ${t.description}`).join('\n')}

Use this format for each step:
Thought: <your reasoning>
Action: <tool_name>
Action Input: <JSON args>
`;

const result = await llm.generateContent({ prompt: userPrompt, systemPrompt });

// Parse output
const thoughtMatch = result.match(/Thought: (.+)/);
const actionMatch = result.match(/Action: (\w+)/);
const inputMatch = result.match(/Action Input: ({.+})/s);

if (actionMatch && inputMatch) {
  const toolCall = {
    name: actionMatch[1],
    args: JSON.parse(inputMatch[1])
  };
  const output = await toolRegistry.invoke(toolCall);

  // Append observation
  state.messages.push({
    role: 'assistant',
    content: `Thought: ${thoughtMatch?.[1]}\nAction: ${toolCall.name}\nAction Input: ${JSON.stringify(toolCall.args)}`
  });
  state.messages.push({
    role: 'user',
    content: `Observation: ${output}`
  });
}
```

**Advantages:**
- Model-agnostic (works with any LLM)
- Full control over prompt format
- Easier debugging (human-readable thoughts)

**Disadvantages:**
- Unreliable parsing (LLM may deviate from format)
- Token overhead (verbose prompt template)
- Manual validation required

**Recommendation:** Use **Function Calling** for Nexus (already using Gemini).

---

### 2.3 Error Propagation & Retry Logic

#### Error Handling Strategy

```typescript
interface ToolExecutionResult {
  success: boolean;
  output?: any;
  error?: {
    type: 'validation' | 'execution' | 'timeout' | 'unknown';
    message: string;
    recoverable: boolean;
  };
}

async function executeToolWithRetry(
  toolCall: {name: string, args: any},
  maxRetries = 3
): Promise<ToolExecutionResult> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      const output = await toolRegistry.invoke(toolCall);
      return { success: true, output };
    } catch (error) {
      lastError = error as Error;
      attempt++;

      // Categorize error
      const errorType = categorizeError(error);

      // Non-recoverable errors: fail immediately
      if (['validation', 'not_found'].includes(errorType)) {
        return {
          success: false,
          error: {
            type: errorType as any,
            message: error.message,
            recoverable: false
          }
        };
      }

      // Recoverable errors: retry with backoff
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
        await sleep(backoff);
        logger.warn(`Retrying tool ${toolCall.name} (attempt ${attempt + 1}/${maxRetries})`);
      }
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: {
      type: 'execution',
      message: lastError?.message || 'Unknown error',
      recoverable: false
    }
  };
}

function categorizeError(error: Error): string {
  if (error.message.includes('required parameter')) return 'validation';
  if (error.message.includes('not found')) return 'not_found';
  if (error.message.includes('timeout')) return 'timeout';
  if (error.message.includes('ECONNREFUSED')) return 'connection';
  return 'unknown';
}
```

#### Propagation to Agent Loop

```typescript
// In agent loop
const result = await executeToolWithRetry(toolCall, 3);

if (!result.success) {
  // Add error observation
  state.messages.push({
    role: 'tool',
    name: toolCall.name,
    content: `ERROR: ${result.error!.message}${result.error!.recoverable ? ' (recoverable)' : ''}`
  });

  // Let LLM decide next step
  if (result.error!.recoverable) {
    // LLM might retry with different params or choose alternative approach
    continue; // Next iteration
  } else {
    // Non-recoverable: suggest LLM provide final answer acknowledging failure
    systemNote = "The last tool failed permanently. Provide a final answer explaining the issue.";
  }
}
```

---

## 3. Integration Pattern for Nexus

### 3.1 Current Architecture

```
Daemon (daemon.ts)
  ↓
  → addToInbox(message, source, requestId)
  ↓
  → cycle() → process inbox
      ↓
      Router.classify(message) → Intent
      ↓
      Router.route(intent) → Handler
      ↓
      Handler executes → TaskResult
      ↓
      Store result in Redis → MCP polls
```

**Key Files:**
- `daemon.ts`: Main loop, inbox queue, handler registration
- `router.ts`: Intent classification (rule-based + AI fallback), routing to handlers
- `brain.ts`: Gemini integration, tier selection

**Current Handlers:**
- `status`: Daemon health check
- `logs`: Read log file
- `docker`/`docker-manage`/`docker-exec`: Docker operations
- `pm2`: PM2 process management
- `shell`: Shell command execution
- `sysinfo`: System monitoring
- `files`: File operations
- `cron`: Scheduling
- `scrape`, `research`, `leadgen`: Job dispatching

---

### 3.2 Evolution Strategy (Non-Breaking)

#### Phase 1: Tool Registry Layer (Wrapper)

**Goal:** Wrap existing handlers as tools without changing Router/Daemon.

```typescript
// tools/registry.ts
class ToolRegistry {
  // ... (as defined in section 1.2)
}

// tools/adapters.ts
function handlerToTool(
  name: string,
  description: string,
  handler: Handler,
  paramsSchema: Record<string, ToolParameter>
): Tool {
  return {
    name,
    description,
    parameters: paramsSchema,
    execute: async (params) => {
      const intent: Intent = {
        type: 'tool_call',
        action: name,
        params,
        source: 'agent',
        raw: `Tool: ${name}`
      };
      const result = await handler(intent);
      if (!result.success) throw new Error(result.message);
      return result.data ?? result.message;
    }
  };
}

// In Daemon.registerHandlers():
const toolRegistry = new ToolRegistry();

// Convert handlers to tools
toolRegistry.register(handlerToTool(
  'docker_start',
  'Start a Docker container',
  async (intent) => dockerManager.startContainer(intent.params.name),
  {
    container: { type: 'string', description: 'Container name', required: true }
  }
));

// ... repeat for all handlers
```

**Impact:** Zero breaking changes. Handlers remain registered in Router for existing flows.

---

#### Phase 2: Agent Loop Module (Opt-In)

**Goal:** Add agent loop as a new Router action, callable via `agent: <task>` prefix.

```typescript
// agent/loop.ts
class AgentLoop {
  constructor(
    private toolRegistry: ToolRegistry,
    private brain: Brain,
    private stateManager: StateManager
  ) {}

  async run(objective: string, source: Intent['source']): Promise<string> {
    const threadId = `agent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const state: AgentState = {
      threadId,
      objective,
      messages: [],
      iterations: 0,
      maxIterations: 10
    };

    await this.stateManager.saveState(threadId, state);

    while (state.iterations < state.maxIterations) {
      // OBSERVE
      const context = this.buildContext(state);

      // THINK
      const decision = await this.think(context);
      state.messages.push({ role: 'assistant', content: decision.raw });

      // ACT
      if (decision.type === 'final_answer') {
        return decision.answer;
      }

      const result = await this.executeToolWithRetry(decision.toolCall);
      const observation = new ObservationParser().parse(
        decision.toolCall.name,
        result.success ? result.output : null,
        result.error ? new Error(result.error.message) : undefined
      );

      state.messages.push({ role: 'tool', content: observation.formatted });
      state.iterations++;
      await this.stateManager.saveState(threadId, state);
    }

    throw new Error('Max iterations reached');
  }

  private async think(context: string) {
    const tools = this.toolRegistry.toFunctionSchemas();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      tools: [{ functionDeclarations: tools }],
      systemInstruction: REACT_SYSTEM_PROMPT
    });

    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: context }] }] });

    const functionCalls = result.response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      return {
        type: 'tool_call',
        toolCall: { name: functionCalls[0].name, args: functionCalls[0].args },
        raw: result.response.text()
      };
    }

    return {
      type: 'final_answer',
      answer: result.response.text(),
      raw: result.response.text()
    };
  }
}

// In Daemon.registerHandlers():
const agentLoop = new AgentLoop(toolRegistry, brain, stateManager);

router.register('agent', async (intent) => {
  const objective = intent.params.task || intent.raw;
  try {
    const answer = await agentLoop.run(objective, intent.source);
    return { success: true, message: answer };
  } catch (err) {
    return { success: false, message: `Agent error: ${(err as Error).message}` };
  }
});
```

**Usage:**

```
MCP: "agent: restart nginx container and check if it's healthy"
→ Router classifies as action: 'agent'
→ Agent loop executes:
   Iteration 1: Call docker_restart(nginx)
   Iteration 2: Call docker_inspect(nginx)
   Iteration 3: Final answer: "Container restarted successfully. Status: running, health: healthy"
```

**Impact:** Existing single-step flows unchanged. Multi-step tasks now possible via `agent:` prefix.

---

#### Phase 3: Skill Loader (Plugin System)

**Goal:** Load tools from `nexus/skills/` directory for extensibility.

```typescript
// In Daemon.start():
const skillLoader = new SkillLoader('./skills', toolRegistry);
await skillLoader.loadAll();
```

**Migration Path:**

1. Move handler logic to `skills/core/index.ts`
2. Create `skills/core/skill.json`
3. Daemon loads from skills instead of inline registration
4. Third-party skills can be added by users

**Impact:** Handlers decouple from Daemon. Easier testing and hot-reload.

---

#### Phase 4: Default Agent Mode (Optional)

**Goal:** Make agent loop the default for complex queries, falling back to single-step for simple ones.

```typescript
// In Router.route():
async route(intent: Intent): Promise<TaskResult> {
  const handler = this.handlers.get(intent.action);

  // Simple actions: use handler directly
  const simpleActions = ['status', 'logs', 'docker'];
  if (simpleActions.includes(intent.action) && handler) {
    return handler(intent);
  }

  // Complex actions: route to agent loop
  if (this.isComplexTask(intent)) {
    const agentHandler = this.handlers.get('agent')!;
    return agentHandler(intent);
  }

  // Fallback
  return handler ? handler(intent) : this.fallbackToBrain(intent);
}

private isComplexTask(intent: Intent): boolean {
  // Multi-step indicators
  if (intent.raw.includes(' and ') || intent.raw.includes(' then ')) return true;
  if (intent.params.steps && intent.params.steps > 1) return true;
  if (['research', 'debug', 'analyze'].includes(intent.action)) return true;
  return false;
}
```

**Impact:** Transparent upgrade. Users don't need to prefix `agent:`, system decides automatically.

---

### 3.3 Where Agent Loop Sits Relative to Router

```
                    ┌─────────────────────────────────┐
                    │         Daemon.cycle()          │
                    │  (inbox processing, scheduling) │
                    └────────────┬────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────────────┐
                    │      Router.classify()          │
                    │   (rule-based + AI fallback)    │
                    └────────────┬────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────────────┐
                    │        Router.route()           │
                    │   (lookup handler by action)    │
                    └────────┬───────────┬────────────┘
                             │           │
                 ┌───────────┘           └───────────┐
                 │                                   │
                 ▼                                   ▼
    ┌────────────────────────┐          ┌────────────────────────┐
    │  Direct Handler        │          │   Agent Loop Handler   │
    │  (single-step)         │          │   (multi-step)         │
    │                        │          │                        │
    │  • status              │          │  • Iterate:            │
    │  • logs                │          │     - OBSERVE state    │
    │  • docker (simple)     │          │     - THINK (LLM)      │
    │  • shell               │          │     - ACT (tool call)  │
    │  • files               │          │  • Use ToolRegistry    │
    │  • sysinfo             │          │  • Persist in Redis    │
    └────────────────────────┘          └────────────────────────┘
                 │                                   │
                 └───────────┬───────────────────────┘
                             ▼
                    ┌─────────────────────────────────┐
                    │       TaskResult                │
                    │   (stored in Redis for MCP)     │
                    └─────────────────────────────────┘
```

**Key Insight:** Agent loop is **a handler**, not a replacement for Router. Router decides which handler to invoke based on task complexity.

---

### 3.4 How Existing Handlers Become Tools

**Transformation Pattern:**

```typescript
// BEFORE (Handler in Daemon):
router.register('shell', async (intent) => {
  const cmd = intent.params.cmd;
  const result = await shell.execute(cmd);
  return {
    success: result.code === 0,
    message: result.stdout || result.stderr
  };
});

// AFTER (Tool in Registry):
toolRegistry.register({
  name: 'shell_exec',
  description: 'Execute a shell command on the server',
  parameters: {
    command: {
      type: 'string',
      description: 'The shell command to run',
      required: true
    },
    timeout: {
      type: 'number',
      description: 'Timeout in milliseconds',
      required: false
    }
  },
  execute: async (params) => {
    const result = await shell.execute(params.command, params.timeout || 10000);
    if (result.code !== 0) throw new Error(result.stderr || 'Command failed');
    return result.stdout;
  }
});

// Handler still exists for backward compatibility
router.register('shell', async (intent) => {
  try {
    const output = await toolRegistry.invoke({
      name: 'shell_exec',
      args: intent.params
    });
    return { success: true, message: output };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
});
```

**Benefits:**
1. Handlers remain callable via Router (single-step)
2. Tools callable via Agent Loop (multi-step)
3. Single implementation, dual interface

---

## 4. Build Order

### 4.1 Recommended Sequence

#### Milestone 1: Foundation (No Breaking Changes)

**Week 1-2:**

1. **Create Tool Registry** (`tools/registry.ts`)
   - Implement `ToolRegistry` class
   - Add `toFunctionSchemas()` for Gemini integration
   - Unit tests

2. **Create Tool Adapters** (`tools/adapters.ts`)
   - Implement `handlerToTool()` converter
   - Wrap 2-3 existing handlers (shell, docker, files) as proof-of-concept
   - Integration tests

3. **Create Observation Parser** (`agent/observation.ts`)
   - Implement result formatting logic
   - Handle errors gracefully
   - Truncation for large outputs

**Validation:** Run existing MCP calls, verify no regression.

---

#### Milestone 2: Agent Loop (Opt-In)

**Week 3-4:**

4. **Create State Manager** (`agent/state.ts`)
   - Implement Redis persistence for `AgentState`
   - Add TTL management
   - State recovery after daemon restart

5. **Create Agent Loop** (`agent/loop.ts`)
   - Implement `AgentLoop` class with OBSERVE-THINK-ACT cycle
   - Integrate Gemini function calling
   - Add retry logic and error handling
   - Max iteration guard

6. **Register as Handler** (modify `daemon.ts`)
   - Add `router.register('agent', ...)`
   - Test with multi-step tasks

**Validation:** Test query: "agent: check nginx status, if down, restart it and verify it's running"

---

#### Milestone 3: Tool Migration

**Week 5:**

7. **Migrate Handlers to Tools**
   - Convert all existing handlers to tools
   - Maintain backward-compatible handler wrappers
   - Update Router with tool-based handlers

8. **Skill Loader** (`tools/loader.ts`)
   - Implement filesystem scanning
   - Load from `skills/` directory
   - Hot-reload support (optional)

**Validation:** Load a custom skill from `skills/custom/`, invoke via agent loop.

---

#### Milestone 4: Intelligence Upgrade (Optional)

**Week 6+:**

9. **Smart Routing** (modify `router.ts`)
   - Add `isComplexTask()` heuristic
   - Default to agent loop for multi-step queries

10. **Memory Integration**
    - Add RedisVL for semantic memory
    - Extract facts from conversations
    - Retrieve context before THINK step

11. **Monitoring & Observability**
    - Log agent loop iterations
    - Track token usage per task
    - Alert on max iterations hit

---

### 4.2 Component Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                         BUILD ORDER                             │
└─────────────────────────────────────────────────────────────────┘

1. Tool Registry ──────────────┐
                               │
2. Tool Adapters ──────────────┤
   (depends on Registry)       │
                               ├──→ 5. Agent Loop
3. Observation Parser ─────────┤      (depends on all)
                               │
4. State Manager ──────────────┘
   (independent)

6. Skill Loader ───────────────→ Enhances Registry
   (depends on Registry)

7. Smart Routing ──────────────→ Enhances Router
   (depends on Agent Loop)
```

**Critical Path:** 1 → 2 → 3 → 4 → 5

**Parallel Work:**
- `Observation Parser` and `State Manager` can be built in parallel
- `Skill Loader` can be built after Registry, in parallel with Agent Loop

---

### 4.3 Incremental Migration Path

#### Step 1: Proof of Concept (1 week)

- Build minimal `ToolRegistry`
- Wrap `shell` handler as tool
- Manually test Gemini function calling with 1 tool

**Success Criteria:** Gemini calls `shell_exec` tool correctly.

---

#### Step 2: Full Tool Coverage (1 week)

- Migrate all handlers to tools
- Keep handlers as wrappers
- Run integration tests

**Success Criteria:** All existing MCP tests pass, no regressions.

---

#### Step 3: Agent Loop Alpha (1 week)

- Build `AgentLoop` with hardcoded 3 tools
- Add to Router as `agent` action
- Test 5 multi-step scenarios

**Success Criteria:** Agent loop completes multi-step task without manual intervention.

---

#### Step 4: Production Hardening (1 week)

- Add retry logic, error handling
- Implement state persistence
- Monitor token usage

**Success Criteria:** Agent loop handles failures gracefully, state survives daemon restart.

---

#### Step 5: Default Upgrade (Optional)

- Add smart routing to Router
- Enable for non-critical tasks first
- Monitor for 1 week

**Success Criteria:** 90%+ success rate, no user complaints.

---

## 5. Key Architectural Decisions

### 5.1 Function Calling vs. Text Parsing

**Decision:** Use **Gemini Function Calling**.

**Rationale:**
- Nexus already uses Gemini exclusively
- Native schema validation reduces errors
- Lower token overhead
- Future-proof (Gemini improving function calling)

**Trade-off:** Vendor lock-in to Gemini (acceptable for Nexus).

---

### 5.2 State Persistence Strategy

**Decision:** Use **Redis with AOF** for state, **RDB for snapshots**.

**Rationale:**
- Sub-millisecond read/write (critical for agent loop)
- Already integrated in Nexus
- AOF prevents state loss during crashes
- RDB for periodic backups

**Configuration:**

```conf
# redis.conf
appendonly yes
appendfsync everysec
save 900 1
save 300 10
```

---

### 5.3 Error Handling Philosophy

**Decision:** **Graceful degradation with retry**.

**Rationale:**
- Network issues are transient (retries help)
- Agent loop can recover from partial failures
- User gets partial results instead of total failure

**Pattern:**
1. Retry recoverable errors 3 times (exponential backoff)
2. Report non-recoverable errors to LLM (let it decide next step)
3. Max iterations guard prevents infinite loops

---

### 5.4 Tool Isolation

**Decision:** **Keep handlers and tools separate** (dual interface).

**Rationale:**
- Backward compatibility (existing flows unchanged)
- Single-step tasks don't pay agent loop overhead
- Easier testing (handlers tested independently)

**Pattern:**
- Tool = core logic
- Handler = wrapper calling tool
- Agent loop calls tools directly

---

### 5.5 Migration Philosophy

**Decision:** **Strangler Fig Pattern** (incremental, non-breaking).

**Rationale:**
- Nexus is already running in production (avoid downtime)
- Users don't need to change behavior
- Rollback is trivial (disable agent handler)

**Quote from research:**
> "Do not build a nested loop system on day one. Start with a sequential chain, debug it, and then add complexity."

---

## 6. Production Considerations

### 6.1 Token Budget & Cost Management

**Challenge:** Agent loops consume more tokens than single-step handlers.

**Mitigation:**

1. **Context Window Management:**
   - Summarize conversation history after N turns
   - Keep only last 5 messages in full detail
   - Use cheaper model (flash) for summarization

2. **Tier Selection:**
   - Simple tools: flash (cheap)
   - Complex reasoning: pro (expensive)
   - Dynamic tier switching based on task complexity

3. **Caching:**
   - Cache tool schemas (don't regenerate every call)
   - Cache common tool results (e.g., `docker list` for 30s)

**Implementation:**

```typescript
class AgentLoop {
  private maxContextTokens = 4000; // ~$0.01 per request

  private async pruneContext(state: AgentState) {
    const tokenCount = estimateTokens(state.messages);
    if (tokenCount > this.maxContextTokens) {
      // Summarize old messages
      const summary = await this.brain.think({
        prompt: `Summarize this conversation:\n${JSON.stringify(state.messages.slice(0, -5))}`,
        tier: 'flash'
      });
      state.messages = [
        { role: 'system', content: `Previous context: ${summary}` },
        ...state.messages.slice(-5)
      ];
    }
  }
}
```

---

### 6.2 Monitoring & Observability

**Metrics to Track:**

1. **Agent Loop Performance:**
   - Iterations per task (avg, p95, p99)
   - Success rate (tasks completed vs. max iterations hit)
   - Execution time per iteration

2. **Tool Usage:**
   - Call frequency per tool
   - Error rate per tool
   - Retry count per tool

3. **Cost Tracking:**
   - Tokens consumed per task
   - Cost per task (by tier)
   - Daily/monthly spend

**Implementation:**

```typescript
// In AgentLoop:
logger.info('Agent loop completed', {
  threadId: state.threadId,
  iterations: state.iterations,
  toolsCalled: state.messages.filter(m => m.role === 'tool').length,
  tokensUsed: estimateTokens(state.messages),
  durationMs: Date.now() - startTime
});
```

**Dashboard:** Export to Grafana via Redis counters.

---

### 6.3 Security Considerations

**Risks:**

1. **Prompt Injection:** User crafts input to manipulate agent behavior
2. **Tool Abuse:** Agent calls destructive tools unintentionally
3. **Data Leakage:** Agent exposes sensitive info via observations

**Mitigations:**

1. **Input Sanitization:**
   ```typescript
   function sanitizeInput(raw: string): string {
     // Strip system prompt injection attempts
     return raw.replace(/<\|.*?\|>/g, '').slice(0, 1000);
   }
   ```

2. **Tool Allowlisting:**
   ```typescript
   const RESTRICTED_TOOLS = ['shell_exec', 'file_delete'];

   if (RESTRICTED_TOOLS.includes(toolCall.name)) {
     // Require confirmation or restrict to safe patterns
     if (!isSafeCommand(toolCall.args.command)) {
       throw new Error('Restricted command');
     }
   }
   ```

3. **Observation Redaction:**
   ```typescript
   class ObservationParser {
     private redactSecrets(text: string): string {
       return text
         .replace(/password[=:]\s*\S+/gi, 'password=***')
         .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=***');
     }
   }
   ```

---

### 6.4 Scalability

**Current Limitation:** Daemon runs on single process (Node.js event loop).

**Future Scaling:**

1. **Horizontal Scaling:**
   - Run multiple Daemon instances
   - Use Redis as shared inbox (pub/sub)
   - Load balance via Redis queue

2. **Agent Isolation:**
   - Each agent loop in separate worker thread
   - Prevents one long-running task blocking others

3. **Tool Execution Offloading:**
   - Heavy tools (shell, docker) run in child processes
   - Timeout enforcement at OS level

**Implementation (Phase 2):**

```typescript
import { Worker } from 'worker_threads';

class AgentExecutor {
  async run(objective: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./agent-worker.js', {
        workerData: { objective, tools: this.toolRegistry.getAll() }
      });
      worker.on('message', resolve);
      worker.on('error', reject);
      setTimeout(() => worker.terminate(), 60000); // 1min timeout
    });
  }
}
```

---

## 7. References & Sources

### Primary Research Sources

1. **ReAct Architecture:**
   - [Intuitive-Systems/react-agent-ts](https://github.com/Intuitive-Systems/react-agent-ts) - TypeScript implementation with dual dialogue streams
   - [LangGraph: How to create a ReAct agent from scratch](https://langchain-ai.github.io/langgraph/how-tos/react-agent-from-scratch/) - StateGraph pattern, conditional routing
   - [Hugging Face: Agent Thought-Action-Observation Cycle](https://huggingface.co/learn/agents-course/unit1/agent-steps-and-structure) - Core loop mechanics

2. **Tool Registry & State Management:**
   - [LangChain Agents Documentation](https://docs.langchain.com/oss/javascript/langchain/agents) - Tool registry patterns
   - [Redis: Agent Memory with LangGraph](https://redis.io/learn/what-is-agent-memory-example-using-lang-graph-and-redis) - State persistence, RedisSaver
   - [GeeksforGeeks: Registry Pattern](https://www.geeksforgeeks.org/system-design/registry-pattern/) - Design pattern fundamentals

3. **Function Calling vs. Text Parsing:**
   - [Prompt Engineering Guide: Function Calling](https://www.promptingguide.ai/applications/function_calling) - LLM function calling mechanics
   - [Martin Fowler: Function Calling with LLMs](https://martinfowler.com/articles/function-call-LLM.html) - Security, best practices
   - [PromptLayer: Tool Calling vs. Agents](https://blog.promptlayer.com/llm-agents-vs-function-calling/) - Comparison, use cases

4. **Error Handling & Retry Logic:**
   - [TypeScript Retry Logic Guide](https://www.webdevtutor.net/blog/typescript-retry) - Exponential backoff patterns
   - [Node.js Advanced Patterns: Retry Logic](https://v-checha.medium.com/advanced-node-js-patterns-implementing-robust-retry-logic-656cf70f8ee9) - Production patterns

5. **Incremental Migration:**
   - [Google Developers: Multi-Agent Patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) - Loop patterns, migration advice
   - [AWS: Strangler Fig Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html) - Incremental modernization
   - [Azure: AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) - Agent architectures

6. **State Management Patterns:**
   - [Redis: Session Management](https://redis.io/solutions/session-management/) - Persistence strategies
   - [Redis: AI Agent Orchestration](https://redis.io/blog/ai-agent-orchestration/) - Production agent systems
   - [DEV: State Management for Long-Running Agents](https://dev.to/inboryn_99399f96579fcd705/state-management-patterns-for-long-running-ai-agents-redis-vs-statefulsets-vs-external-databases-39c5) - Redis vs. alternatives

7. **Agent Reasoning Patterns:**
   - [IBM: What is a ReAct Agent?](https://www.ibm.com/think/topics/react-agent) - Industry definition
   - [Agentic Reasoning Patterns](https://servicesground.com/blog/agentic-reasoning-patterns/) - ReAct, ReWOO, LATS
   - [Controlling Agents with Think-Act-Observe](https://medium.com/collaborne-engineering/controlling-llm-agents-with-think-act-observe-717d614b2fe1) - Loop control strategies

---

## 8. Next Steps

### Immediate Actions (This Week)

1. **Review with Team:**
   - Validate architecture decisions
   - Discuss migration timeline
   - Assign ownership

2. **Prototype:**
   - Build `ToolRegistry` class
   - Wrap 1 handler (`shell`) as tool
   - Test Gemini function calling

3. **Environment Setup:**
   - Configure Redis AOF persistence
   - Set up monitoring (token tracking)

### Phase 1 Kickoff (Next Week)

1. **Create Project Structure:**
   ```
   nexus/packages/core/src/
   ├── agent/
   │   ├── loop.ts
   │   ├── state.ts
   │   └── observation.ts
   └── tools/
       ├── registry.ts
       ├── adapters.ts
       └── loader.ts
   ```

2. **Write Tests:**
   - Unit tests for ToolRegistry
   - Integration tests for tool adapters

3. **Documentation:**
   - Add JSDoc to all new classes
   - Update README with agent usage examples

---

## Appendix A: System Prompts

### ReAct System Prompt (for Agent Loop)

```
You are Nexus, an autonomous server management agent with access to tools for system operations.

Your goal: {OBJECTIVE}

INSTRUCTIONS:
1. Think step-by-step before acting
2. Use tools to gather information or make changes
3. After each tool call, reflect on the result before deciding next step
4. When objective is complete, provide a final answer

AVAILABLE TOOLS:
{TOOL_SCHEMAS}

RULES:
- Only call tools that exist in the list above
- Provide tool arguments in valid JSON format
- If a tool fails, analyze the error and try an alternative approach
- If task is impossible, explain why in your final answer
- Be concise in your reasoning
- Do not repeat failed actions

FORMAT:
When you need to use a tool, the system will invoke it automatically based on your function call.
When you're ready to answer, just provide your response without calling any tools.
```

### Tool Schema Example (Gemini Format)

```json
{
  "name": "shell_exec",
  "description": "Execute a shell command on the server. Use for system operations like checking logs, running scripts, or system administration tasks.",
  "parameters": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "The shell command to execute (e.g., 'ls -la /var/log')"
      },
      "timeout": {
        "type": "number",
        "description": "Optional timeout in milliseconds (default: 10000)"
      }
    },
    "required": ["command"]
  }
}
```

---

## Appendix B: Example Agent Loop Execution

### Scenario: "Check if nginx is running, if not, start it"

**Input:**
```
User: "make sure nginx is running"
Source: mcp
```

**Execution Trace:**

```
════════════════════════════════════════════════════════════════
ITERATION 1
════════════════════════════════════════════════════════════════

[OBSERVE]
Objective: make sure nginx is running
Messages: []

[THINK]
LLM reasoning: "I need to check if nginx is currently running. I'll use the
docker_inspect tool to check the status of the nginx container."

Function Call: docker_inspect
Arguments: { "container": "nginx" }

[ACT]
Invoking tool: docker_inspect

[RESULT]
Output: {
  "State": {
    "Status": "exited",
    "Running": false,
    "ExitCode": 0
  }
}

[OBSERVATION]
Tool "docker_inspect" completed:
{
  "State": {
    "Status": "exited",
    "Running": false,
    "ExitCode": 0
  }
}

════════════════════════════════════════════════════════════════
ITERATION 2
════════════════════════════════════════════════════════════════

[OBSERVE]
Objective: make sure nginx is running
Messages: [
  { role: 'assistant', content: 'Checking nginx status...' },
  { role: 'tool', content: 'Container is exited, not running' }
]

[THINK]
LLM reasoning: "The container is stopped. I need to start it using docker_start."

Function Call: docker_start
Arguments: { "container": "nginx" }

[ACT]
Invoking tool: docker_start

[RESULT]
Output: "Container nginx started successfully"

[OBSERVATION]
Tool "docker_start" completed:
Container nginx started successfully

════════════════════════════════════════════════════════════════
ITERATION 3
════════════════════════════════════════════════════════════════

[OBSERVE]
Objective: make sure nginx is running
Messages: [
  { role: 'assistant', content: 'Checking nginx status...' },
  { role: 'tool', content: 'Container is exited, not running' },
  { role: 'assistant', content: 'Starting container...' },
  { role: 'tool', content: 'Container nginx started successfully' }
]

[THINK]
LLM reasoning: "Container started successfully. I should verify it's actually
running now before reporting success."

Function Call: docker_inspect
Arguments: { "container": "nginx" }

[ACT]
Invoking tool: docker_inspect

[RESULT]
Output: {
  "State": {
    "Status": "running",
    "Running": true
  }
}

[OBSERVATION]
Tool "docker_inspect" completed:
{
  "State": {
    "Status": "running",
    "Running": true
  }
}

════════════════════════════════════════════════════════════════
ITERATION 4
════════════════════════════════════════════════════════════════

[OBSERVE]
Objective: make sure nginx is running
Messages: [... previous messages ...]

[THINK]
LLM reasoning: "Confirmed: nginx is now running. Objective complete."

Final Answer: "nginx is now running. The container was previously stopped and
has been successfully started. Current status: running."

[AGENT LOOP COMPLETE]
════════════════════════════════════════════════════════════════

Final Result:
{
  success: true,
  message: "nginx is now running. The container was previously stopped and has been successfully started. Current status: running.",
  iterations: 4,
  toolsCalled: ['docker_inspect', 'docker_start', 'docker_inspect']
}
```

---

## Appendix C: Comparison Matrix

### Single-Step Handler vs. Agent Loop

| Aspect | Single-Step Handler | Agent Loop |
|--------|-------------------|-----------|
| **Execution** | One LLM call → one action | Multiple iterations (observe-think-act) |
| **Use Case** | Simple, well-defined tasks | Complex, multi-step tasks |
| **Token Cost** | Low (1 call) | Higher (3-10 calls typically) |
| **Latency** | Fast (~1-2s) | Slower (~5-15s) |
| **Error Handling** | Return error immediately | Can retry with alternative approach |
| **Flexibility** | Fixed workflow | Adaptive strategy |
| **State Management** | Stateless | Stateful (Redis persistence) |
| **Examples** | "show docker containers"<br>"read /var/log/nginx.log"<br>"restart pm2 app" | "debug why nginx is slow"<br>"migrate app to new container"<br>"analyze and fix disk space issue" |

---

**End of Document**

*Last Updated: 2026-01-26*
*Author: Claude (Sonnet 4.5) - Project Research Agent*
