# Phase 22: Agent Interaction & Management - Research

**Researched:** 2026-03-28
**Domain:** React tRPC UI + Express REST API (agent messaging, loop management, agent creation)
**Confidence:** HIGH

## Summary

Phase 22 extends the read-only Agents tab (built in Phase 21) with three interactive capabilities: sending messages to agents, viewing/controlling loop agents, and creating new agents from a compact form. The primary code changes are in `agents-panel.tsx` (frontend) with supporting backend additions in the Nexus API (`api.ts`) and tRPC routes (`routes.ts`).

A critical finding is that the existing `executeSubagent` tRPC mutation does NOT record messages to subagent history and does NOT use the agent's configured tools -- it bypasses the Nexus `executeSubagentTask` pipeline entirely by calling `ctx.livinityd.ai.chat()` directly. This must be replaced with a Nexus REST endpoint that uses `daemon.executeSubagentTask()` to get proper history recording, tool scoping, and memory context. Additionally, no loop management HTTP endpoints or tRPC routes exist -- the LoopRunner is only accessible via the internal `loop_manage` tool. New Nexus REST endpoints and tRPC routes must be created.

**Primary recommendation:** Add 3 Nexus REST endpoints (execute subagent, list loops, manage loops), expose `loopRunner` on the Daemon class, add corresponding tRPC routes, then extend `agents-panel.tsx` with message input, loop controls, and a compact create form.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Agent Messaging: Add message input field in agent detail view; use existing tRPC mutation to send messages; show response in chat history; polling/refetch after send
- Loop Controls: Show loop-specific info (current iteration, last state) in agent detail; add stop/start buttons; loop status from LoopRunner
- Agent Creation: Compact form in Agents tab sidebar (not full page); minimum fields: name, description, model tier, tools (optional); use existing createSubagent tRPC mutation; refresh agent list after creation

### Claude's Discretion
- Form layout and styling details
- Whether loop controls are inline or in a dropdown
- Animation for message send/receive
- Validation UX for create form

### Deferred Ideas (OUT OF SCOPE)
None -- all features are within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGNT-04 | User can send a message to an agent directly from the Agents tab | executeSubagent tRPC mutation exists but needs replacement with Nexus REST endpoint that uses `executeSubagentTask` for proper history recording; AgentDetail component needs message input + send button + refetch |
| AGNT-05 | User can see loop agent details (current iteration, last state) and stop/start controls | LoopRunner has `listActive()`, `getState()`, `start()`, `stopOne()` methods but no HTTP/tRPC exposure; need new REST endpoints + tRPC routes + UI controls in AgentDetail |
| AGNT-06 | User can create a new agent from the Agents tab (compact form) | createSubagent tRPC mutation fully exists with validation; CreateSubagentForm reference in subagents/index.tsx can be adapted to compact sidebar version |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3 | UI framework | Already in project |
| @tanstack/react-query (via tRPC) | 5.x | Data fetching + mutation | Already wired through trpcReact |
| @trpc/react-query | 11.x | tRPC React bindings | Already configured |
| @tabler/icons-react | 3.x | Icons | Already used across all panels |
| tailwindcss | 3.4 | Styling | Project standard |
| zod | 3.x | Input validation (tRPC) | Already used in routes.ts |
| date-fns | 3.x | Time formatting | Already imported in agents-panel.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui (cn utility) | N/A | Class merging | Already imported in agents-panel.tsx |
| express | 4.x | Nexus REST API | Already used in api.ts |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Data Flow Pattern (livinityd tRPC -> Nexus REST -> Redis)

```
UI (agents-panel.tsx)
  |
  | trpcReact.ai.executeSubagent.useMutation()
  v
livinityd routes.ts (tRPC route)
  |
  | fetch(`${nexusUrl}/api/subagents/${id}/execute`)
  v
Nexus api.ts (REST endpoint)
  |
  | daemon.executeSubagentTask(id, message)
  v
Daemon (daemon.ts)
  |
  | subagentManager.addMessage() + agent.run() + recordRun()
  v
Redis (history + config)
```

This pattern is established by Phase 21 for all subagent operations and MUST be followed.

### Pattern 1: tRPC Mutation with Invalidation (Established)
**What:** Use `useMutation` with `onSuccess` that calls `utils.ai.X.invalidate()`
**When to use:** All write operations (send message, create agent, control loops)
**Example:**
```typescript
// Source: livos/packages/ui/src/routes/subagents/index.tsx:25-42
const createMutation = trpcReact.ai.createSubagent.useMutation()
const utils = trpcReact.useUtils()

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  await createMutation.mutateAsync({ ...formData })
  utils.ai.listSubagents.invalidate()
  onClose()
}
```

### Pattern 2: Nexus REST Proxy in tRPC (Established)
**What:** tRPC routes proxy to Nexus REST API via fetch with X-API-Key header
**When to use:** All subagent operations that touch Redis/daemon state
**Example:**
```typescript
// Source: livos/packages/livinityd/source/modules/ai/routes.ts:716-730
listSubagents: privateProcedure.query(async ({ctx}) => {
  try {
    const nexusUrl = getNexusApiUrl()
    const response = await fetch(`${nexusUrl}/api/subagents`, {
      headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
    })
    if (!response.ok) {
      throw new Error(`Nexus API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    ctx.livinityd.logger.error('Failed to list subagents', error)
    return []
  }
})
```

### Pattern 3: Daemon Getter Exposure (Established)
**What:** Private config properties exposed via public getters on Daemon class
**When to use:** When api.ts needs access to daemon internals
**Example:**
```typescript
// Source: nexus/packages/core/src/daemon.ts:124-126
get subagentManager(): SubagentManager {
  return this.config.subagentManager;
}
```

### Anti-Patterns to Avoid
- **Direct ai.chat() for subagent execution:** The current `executeSubagent` tRPC route bypasses history recording and tool scoping. Never call `ctx.livinityd.ai.chat()` for subagent tasks -- always proxy through Nexus REST to `executeSubagentTask`.
- **Unique conversation IDs per call:** The current route uses `subagent-${input.id}-${Date.now()}` which means zero conversation continuity. The proper path through `executeSubagentTask` handles history via `subagentManager.getHistoryContext()`.
- **Modifying auth system:** CRITICAL CONSTRAINT -- do not modify OAuth, JWT, API key, or login flows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Subagent execution with history | Custom chat wrapper in livinityd | Nexus `daemon.executeSubagentTask()` | Handles history recording, tool scoping, memory context, run counting in one atomic operation |
| Agent ID generation | Custom ID sanitizer | Regex from existing form: `name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')` | Already validated by createSubagent zod schema: `/^[a-zA-Z0-9_-]+$/` |
| Loop state polling | Custom interval/timer | `useQuery` with `refetchInterval` | Already used for agent list (5s polling) |
| Form validation | Custom validators | Zod schemas in routes.ts `createSubagent` | Backend already validates; frontend should mirror for UX |

**Key insight:** The Nexus daemon already has complete subagent execution infrastructure (`executeSubagentTask`) that handles history, tools, memory, and run recording. The tRPC `executeSubagent` route needs to be rewired to use this instead of the shortcut `ai.chat()` call.

## Common Pitfalls

### Pitfall 1: executeSubagent Does Not Record History
**What goes wrong:** Messages sent via the current `executeSubagent` tRPC route do not appear in the agent's chat history, because it calls `ctx.livinityd.ai.chat()` directly instead of going through Nexus's `executeSubagentTask`.
**Why it happens:** The tRPC route was a quick implementation that skipped the Nexus daemon pipeline.
**How to avoid:** Replace the implementation to proxy through a new Nexus REST endpoint `POST /api/subagents/:id/execute` that calls `daemon.executeSubagentTask()`.
**Warning signs:** After sending a message, the chat history doesn't show the new message even after refetching.

### Pitfall 2: LoopRunner Has No HTTP/tRPC Exposure
**What goes wrong:** There is no way for the UI to query loop status or control loops -- `LoopRunner` is only accessible internally via the `loop_manage` tool.
**Why it happens:** LoopRunner was designed for AI tool use, not direct UI access.
**How to avoid:** Add a `get loopRunner()` getter on Daemon class, then add REST endpoints in api.ts, then add tRPC routes in routes.ts.
**Warning signs:** Any attempt to call a loop tRPC route results in "route not found".

### Pitfall 3: Nexus Core Requires Rebuild After Changes
**What goes wrong:** Backend changes to nexus-core source files don't take effect because the server runs compiled JS from `dist/`.
**Why it happens:** Nexus-core runs `dist/index.js`, not the TypeScript source directly.
**How to avoid:** After any nexus-core source change, run `npm run build --workspace=packages/core` before testing.
**Warning signs:** Changes to api.ts or daemon.ts have no effect; PM2 restart doesn't help.

### Pitfall 4: tRPC Mutations Via WebSocket Can Hang
**What goes wrong:** Long-running mutations like `executeSubagent` may hang if the WebSocket connection drops during execution.
**Why it happens:** WebSocket transport doesn't have HTTP's request/response semantics for timeout handling.
**How to avoid:** Add `ai.executeSubagent` and `ai.createSubagent` to `httpOnlyPaths` in `common.ts` for reliability. The `executeSubagent` call can take 10+ seconds during agent execution.
**Warning signs:** Mutation appears to hang indefinitely; no error thrown.

### Pitfall 5: Compact Form Field Constraints
**What goes wrong:** The sidebar has limited width (~300px), so full-width forms from the subagents page don't fit.
**Why it happens:** `CreateSubagentForm` in `subagents/index.tsx` uses `grid-cols-2` layout which requires ~600px width.
**How to avoid:** Use single-column layout for the compact form; reduce field count to essentials (name, description, tier).
**Warning signs:** Form elements overflow or get truncated in the sidebar.

## Code Examples

### Existing: executeSubagent tRPC Route (NEEDS REPLACEMENT)
```typescript
// Source: livos/packages/livinityd/source/modules/ai/routes.ts:894-925
// PROBLEM: This bypasses history recording and tool scoping
executeSubagent: privateProcedure
  .input(z.object({
    id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    message: z.string().min(1).max(50000),
  }))
  .mutation(async ({ctx, input}) => {
    // Currently calls ctx.livinityd.ai.chat() -- WRONG
    // Should proxy to Nexus REST: POST /api/subagents/:id/execute
  })
```

### Existing: createSubagent tRPC Route (REUSABLE AS-IS)
```typescript
// Source: livos/packages/livinityd/source/modules/ai/routes.ts:773-818
createSubagent: privateProcedure
  .input(z.object({
    id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    name: z.string().min(1).max(100),
    description: z.string().max(500),
    skills: z.array(z.string()).default(['*']),
    systemPrompt: z.string().max(10000).optional(),
    schedule: z.string().optional(),
    scheduledTask: z.string().max(5000).optional(),
    tier: z.enum(['flash', 'sonnet', 'opus']).default('sonnet'),
    maxTurns: z.number().default(10),
  }))
  .mutation(async ({ctx, input}) => {
    // Proxies to POST /api/subagents -- works correctly
  })
```

### New: Nexus REST Endpoint for Subagent Execution (TO BE CREATED)
```typescript
// Target: nexus/packages/core/src/api.ts (after existing subagent endpoints)
app.post('/api/subagents/:id/execute', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }
    const result = await daemon.executeSubagentTask(req.params.id, message);
    res.json({ content: result });
  } catch (err) {
    res.status(500).json({ error: formatErrorMessage(err) });
  }
});
```

Note: `executeSubagentTask` is currently `private` on the Daemon class. It must be changed to `public` or a public wrapper method must be added.

### New: Daemon loopRunner Getter (TO BE CREATED)
```typescript
// Target: nexus/packages/core/src/daemon.ts (after existing getters)
get loopRunner(): LoopRunner {
  return this.config.loopRunner;
}
```

### New: Loop Management REST Endpoints (TO BE CREATED)
```typescript
// Target: nexus/packages/core/src/api.ts
app.get('/api/loops', async (_req, res) => {
  const loops = daemon.loopRunner.listActive();
  res.json(loops);
});

app.get('/api/loops/:id/status', async (req, res) => {
  const state = await daemon.loopRunner.getState(req.params.id);
  const active = daemon.loopRunner.listActive().find(l => l.subagentId === req.params.id);
  res.json({
    subagentId: req.params.id,
    running: !!active,
    iteration: active?.iteration || 0,
    intervalMs: active?.intervalMs || 0,
    state: state || null,
  });
});

app.post('/api/loops/:id/start', async (req, res) => {
  const config = await daemon.subagentManager.get(req.params.id);
  if (!config) { res.status(404).json({ error: 'Subagent not found' }); return; }
  if (!config.loop) { res.status(400).json({ error: 'No loop config' }); return; }
  await daemon.loopRunner.start(config);
  res.json({ ok: true });
});

app.post('/api/loops/:id/stop', async (req, res) => {
  daemon.loopRunner.stopOne(req.params.id);
  await daemon.subagentManager.update(req.params.id, { status: 'stopped' });
  res.json({ ok: true });
});
```

### New: Loop tRPC Routes (TO BE CREATED)
```typescript
// Target: livos/packages/livinityd/source/modules/ai/routes.ts
getLoopStatus: privateProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const nexusUrl = getNexusApiUrl()
    const response = await fetch(`${nexusUrl}/api/loops/${encodeURIComponent(input.id)}/status`, {
      headers: process.env.LIV_API_KEY ? { 'X-API-Key': process.env.LIV_API_KEY } : {},
    })
    if (!response.ok) return { running: false, iteration: 0, intervalMs: 0, state: null }
    return await response.json()
  }),

startLoop: privateProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const nexusUrl = getNexusApiUrl()
    const response = await fetch(`${nexusUrl}/api/loops/${encodeURIComponent(input.id)}/start`, {
      method: 'POST',
      headers: process.env.LIV_API_KEY ? { 'X-API-Key': process.env.LIV_API_KEY } : {},
    })
    if (!response.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to start loop' })
    return await response.json()
  }),

stopLoop: privateProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const nexusUrl = getNexusApiUrl()
    const response = await fetch(`${nexusUrl}/api/loops/${encodeURIComponent(input.id)}/stop`, {
      method: 'POST',
      headers: process.env.LIV_API_KEY ? { 'X-API-Key': process.env.LIV_API_KEY } : {},
    })
    if (!response.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to stop loop' })
    return await response.json()
  }),
```

### Compact Create Form Reference
```typescript
// Source: livos/packages/ui/src/routes/subagents/index.tsx:13-158
// Key fields from existing form (to be adapted to compact single-column layout):
// - name (required): text input
// - description (required): textarea, 2 rows
// - tier (default 'sonnet'): select with flash/sonnet/opus
// - id: auto-generated from name (name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
// - systemPrompt: optional textarea (can omit from compact form)
// - maxTurns: optional number (default 10, can use default)
// - schedule/scheduledTask: optional (omit from compact form)
```

## Detailed Change Map

### Backend Changes (Nexus)

| File | Change | Type |
|------|--------|------|
| `nexus/packages/core/src/daemon.ts` | Add `get loopRunner()` getter; change `executeSubagentTask` from `private` to `public` | Modify |
| `nexus/packages/core/src/api.ts` | Add `POST /api/subagents/:id/execute`, `GET /api/loops`, `GET /api/loops/:id/status`, `POST /api/loops/:id/start`, `POST /api/loops/:id/stop` | Modify |

### Backend Changes (livinityd)

| File | Change | Type |
|------|--------|------|
| `livos/packages/livinityd/source/modules/ai/routes.ts` | Rewrite `executeSubagent` to proxy through Nexus REST; add `getLoopStatus`, `startLoop`, `stopLoop` tRPC routes | Modify |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | Add `ai.executeSubagent`, `ai.startLoop`, `ai.stopLoop` to `httpOnlyPaths` | Modify |

### Frontend Changes

| File | Change | Type |
|------|--------|------|
| `livos/packages/ui/src/routes/ai-chat/agents-panel.tsx` | Add message input to AgentDetail; add LoopControls component; add compact CreateAgentForm; add "New Agent" button to list header | Modify |

### Total: 5 files modified, 0 new files

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `executeSubagent` via `ai.chat()` | Proxy to Nexus `executeSubagentTask` | Phase 22 | Enables proper history recording, tool use, memory context |
| Loop management via AI tool only | HTTP REST + tRPC routes for UI access | Phase 22 | Enables direct UI control of loops |

## Open Questions

1. **executeSubagentTask is async and can take 10-60 seconds**
   - What we know: The agent runs a full ReAct loop with tool calls, which can be slow.
   - What's unclear: Should the UI show a loading state, or should we consider streaming?
   - Recommendation: Use a simple loading state (isPending from useMutation) with a spinner. Streaming is out of scope for Phase 22. Add `ai.executeSubagent` to `httpOnlyPaths` for reliability.

2. **Should compact create form include tools selection?**
   - What we know: CONTEXT.md says "tools (optional)". The existing form uses `skills: z.array(z.string()).default(['*'])`.
   - What's unclear: How to present tool selection in a compact form.
   - Recommendation: Default to `['*']` (all tools) and omit tool selection from compact form. Advanced configuration can use the full Subagents page.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None -- no project-level test infrastructure exists |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-04 | Send message to agent, see response in history | manual-only | N/A (requires running Nexus + Redis + AI provider) | N/A |
| AGNT-05 | View loop iteration/state, start/stop controls | manual-only | N/A (requires running LoopRunner with active loop) | N/A |
| AGNT-06 | Create agent from compact form, appears in list | manual-only | N/A (requires running Nexus + Redis) | N/A |

### Sampling Rate
- **Per task commit:** Manual verification against running server
- **Per wave merge:** Full manual test of all three interactions
- **Phase gate:** All 3 requirements manually verified with running services

### Wave 0 Gaps
None -- all requirements are manual-only due to requiring running services (Nexus, Redis, AI provider). No automated test infrastructure to create.

## Sources

### Primary (HIGH confidence)
- `livos/packages/ui/src/routes/ai-chat/agents-panel.tsx` -- current AgentDetail component (318 lines, read in full)
- `nexus/packages/core/src/loop-runner.ts` -- LoopRunner class (202 lines, read in full)
- `nexus/packages/core/src/subagent-manager.ts` -- SubagentManager class (218 lines, read in full)
- `nexus/packages/core/src/daemon.ts` -- executeSubagentTask method (lines 3091-3203), loop_manage tool (lines 2080-2133), Daemon class getters (lines 87-170)
- `nexus/packages/core/src/api.ts` -- subagent REST endpoints (lines 1007-1118), ApiDeps interface (lines 39-56)
- `livos/packages/livinityd/source/modules/ai/routes.ts` -- all subagent tRPC routes (lines 716-925)
- `livos/packages/ui/src/routes/subagents/index.tsx` -- CreateSubagentForm reference (288 lines, read in full)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` -- httpOnlyPaths (101 lines, read in full)

### Secondary (MEDIUM confidence)
- Phase 21 verification report -- confirmed all AGNT-01/02/03 requirements satisfied

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- all patterns established by Phase 21, directly verified in codebase
- Pitfalls: HIGH -- discovered critical executeSubagent bypass issue through direct code inspection
- Backend changes: HIGH -- LoopRunner, Daemon, and API patterns verified at source level

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- patterns unlikely to change within milestone)
