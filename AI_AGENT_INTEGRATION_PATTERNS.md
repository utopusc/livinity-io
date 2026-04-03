# AI Agent Integration Patterns for Livinity

## Architecture Patterns for Self-Hosted AI Agents

This document outlines how to integrate AI agent frameworks into Livinity's architecture, leveraging the existing nexus-mcp infrastructure and multi-user system.

---

## Pattern 1: MCP-Based Tool Exposure (RECOMMENDED - Phase 1)

### Overview
Expose each Livinity app capability as an MCP server, allowing Claude Code users to access them.

### Architecture
```
┌─────────────────────────────────────────┐
│  Claude Code / Claude.ai User           │
└──────────────┬──────────────────────────┘
               │
        MCP Connection (Desktop)
               │
┌──────────────▼──────────────────────────┐
│  Livinity MCP Server (nexus-mcp)        │
│                                         │
│  - File MCP server                      │
│  - Task MCP server                      │
│  - App MCP server                       │
│  - Settings MCP server                  │
│  - Calendar MCP server (future)         │
│  - Contact MCP server (future)          │
└──────────────┬──────────────────────────┘
               │
        HTTP/WebSocket
               │
┌──────────────▼──────────────────────────┐
│  Livinity Core (nexus + livos)          │
│  - Multi-user system                    │
│  - App management                       │
│  - Data persistence                     │
└─────────────────────────────────────────┘
```

### Implementation Steps

1. **Expand nexus-mcp servers**
   ```typescript
   // nexus/packages/mcp/src/servers/
   - task-server.ts          // Create, list, update tasks
   - app-server.ts           // List installed apps, launch apps
   - file-server.ts          // Already exists (enhance)
   - notification-server.ts  // Send notifications
   - automation-server.ts    // Trigger workflows
   ```

2. **Create Livinity MCP manifest**
   - Document all available MCP servers
   - Add to Claude Code MCP registry
   - Include example prompts

3. **Example MCP Server (Task Management)**
   ```typescript
   // nexus/packages/mcp/src/servers/task-server.ts

   import { Server } from "@modelcontextprotocol/sdk/server/index.js";
   import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

   const server = new Server({
     name: "livinity-tasks",
     version: "1.0.0",
   });

   server.setRequestHandler(ListResourcesRequestSchema, async () => ({
     resources: [
       {
         uri: "livinity://tasks",
         name: "All Tasks",
         mimeType: "application/json",
       },
     ],
   }));

   server.setRequestHandler(CallToolRequestSchema, async (request) => {
     if (request.params.name === "create_task") {
       const { title, description, dueDate } = request.params.arguments;
       // Call Livinity API to create task
       return {
         content: [{ type: "text", text: `Created task: ${title}` }],
       };
     }
     // Handle other tools...
   });
   ```

4. **Update Claude Code documentation**
   - "Extend Livinity from Claude Code" guide
   - Example: "Ask Claude to create a task and schedule a reminder"

### Benefits
- Zero changes to Livinity core
- Works with any LLM (Claude, GPT, local)
- Users get full power of Claude Code + Livinity apps
- Leverages existing nexus-mcp infrastructure

### Limitations
- Read-only access to most features (until MCP is upgraded)
- Latency (network round-trip for each operation)
- User must run Claude Code locally (or use Claude.ai web + API)

### Timeline: Phase 1 (v7.5)

---

## Pattern 2: Native Langflow Integration (RECOMMENDED - Phase 2)

### Overview
Ship Langflow as a native Livinity app, allowing non-technical users to build visual AI workflows.

### Architecture
```
┌─────────────────────────────────────────┐
│  Livinity User (any skill level)        │
└──────────────┬──────────────────────────┘
               │
      Livinity Dashboard
               │
┌──────────────▼──────────────────────────┐
│  Langflow App (Livinity container)      │
│                                         │
│  - Visual flow builder                  │
│  - Component palette (LLMs, tools, etc) │
│  - Flow execution engine                │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┬──────────┬─────────┐
        │             │          │         │
   ┌────▼──┐   ┌─────▼─┐  ┌────▼──┐  ┌──▼─────┐
   │ Claude │   │ Kimi  │  │ Local │  │ Nexus  │
   │ OpenAI │   │  API  │  │ LLM   │  │ MCP    │
   └────────┘   └───────┘  └───────┘  └────────┘
```

### Implementation Steps

1. **Create Livinity Langflow app**
   ```
   livos/packages/ui/src/routes/langflow-builder/
   - index.tsx              // UI wrapper
   - FlowBuilder.tsx        // Embed Langflow UI
   - FlowExecutor.tsx       // Run flows

   nexus/packages/core/src/routes/
   - langflow-flows.ts      // API: save/load/execute flows
   ```

2. **Langflow Docker container**
   ```dockerfile
   # livos/compose/langflow.yml
   services:
     langflow:
       image: langflowai/langflow:latest
       container_name: livinity-langflow
       ports:
         - "7860:7860"
       environment:
         - LANGFLOW_DATABASE_URL=postgresql://...
         - LANGFLOW_CONFIG_DIR=/app/config
       volumes:
         - langflow-data:/app/data
   ```

3. **Connect to Livinity apps via MCP**
   ```typescript
   // In Langflow flow builder, users can drag "Livinity" component
   // This component connects to nexus-mcp servers

   // Example flow:
   // 1. Get tasks (via MCP) →
   // 2. Summarize with Claude →
   // 3. Create email draft (via MCP) →
   // 4. Send notification (via MCP)
   ```

4. **Persist user flows**
   ```typescript
   // nexus/packages/core/src/routes/langflow-flows.ts
   router.post('/flows', async (req, res) => {
     const { userId, flowName, flowConfig } = req.body;

     // Save flow to database
     await Flow.create({
       userId,
       name: flowName,
       config: flowConfig,
     });

     res.json({ id: flow.id, name: flow.name });
   });

   router.post('/flows/:id/execute', async (req, res) => {
     const flow = await Flow.findById(req.params.id);
     const result = await executeLangflowFlow(flow.config);
     res.json(result);
   });
   ```

### User Experience
```
User opens "Automation Builder" app
  ↓
Sees Langflow UI with:
  - LLM selector (Claude, Kimi, GPT, local)
  - Component palette (Livinity MCP, web tools, data processors)
  - Flow canvas
  ↓
User builds flow:
  - Drag "Get Tasks" MCP component
  - Drag "Summarize with Claude" LLM component
  - Drag "Send Notification" MCP component
  - Connect components
  ↓
User clicks "Save" → Flow stored in Livinity
User clicks "Run" → Flow executes
User sees results in real-time (streaming support)
```

### Benefits
- Non-technical users can build complex workflows
- Full access to all Livinity apps via MCP
- Supports any LLM (Claude, Kimi, GPT, local)
- Flows are portable (can share/export)
- Visual debugging (see data flow between components)

### Limitations
- Adds ~200MB container size
- Requires Python runtime
- UI customization needed to match Livinity design

### Timeline: Phase 2 (v8.0)

---

## Pattern 3: Skyvern RPA Integration (Phase 2-3)

### Overview
Enable users to automate web-based workflows (forms, logins, data extraction) via Skyvern.

### Architecture
```
┌──────────────────────────────────────────┐
│  Livinity User (RPA workflow builder)    │
└──────────────┬─────────────────────────┐
               │                         │
      Livinity Dashboard           MCP Connection
               │                         │
┌──────────────▼─────────────────────────▼─┐
│  Skyvern App (Livinity container)        │
│                                          │
│  - Workflow builder                      │
│  - Browser automation engine             │
│  - Screenshot capture                    │
│  - Vision-based interactions             │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┬──────────┐
        │             │          │
   ┌────▼──┐   ┌─────▼─┐   ┌───▼──┐
   │Claude │   │ Kimi  │   │ GPT  │
   │ API   │   │ API   │   │ API  │
   └───────┘   └───────┘   └──────┘
        │             │          │
        └─────────────┴──────────┘
                  │
        Browser Automation
        (Playwright + Chrome)
                  │
        ┌─────────▼─────────┐
        │  External Websites │
        │  (target of RPA)   │
        └────────────────────┘
```

### Implementation Steps

1. **Deploy Skyvern container**
   ```dockerfile
   # livos/compose/skyvern.yml
   services:
     skyvern:
       image: skyvern-ai/skyvern:latest
       ports:
         - "8080:8080"
       environment:
         - SKYVERN_API_KEY=${SKYVERN_API_KEY}
         - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
         - POSTGRES_URL=postgresql://...
       volumes:
         - skyvern-data:/app/data
   ```

2. **Create Livinity RPA app UI**
   ```
   livos/packages/ui/src/routes/rpa-builder/
   - index.tsx              // RPA dashboard
   - WorkflowBuilder.tsx    // Visual workflow editor
   - RunHistory.tsx         // Past runs + results
   - TaskLibrary.tsx        // Pre-built templates
   ```

3. **Expose Skyvern as MCP**
   ```typescript
   // nexus/packages/mcp/src/servers/rpa-server.ts
   // Allows Langflow + Claude to trigger RPA workflows

   server.setRequestHandler(CallToolRequestSchema, async (request) => {
     if (request.params.name === "trigger_skyvern_task") {
       const { taskId } = request.params.arguments;
       const result = await fetch('http://skyvern:8080/api/tasks', {
         method: 'POST',
         body: JSON.stringify({ task_id: taskId })
       });
       return { content: [{ type: "text", text: JSON.stringify(result) }] };
     }
   });
   ```

4. **Pre-built templates**
   ```typescript
   // nexus/packages/core/src/rpa-templates/
   - invoice-retrieval.json    // Auto-download invoices
   - form-filling.json         // Auto-fill forms with data
   - web-scraping.json         // Extract data from websites
   - account-signup.json       // Automate account creation
   ```

### Example Workflow
```
User: "I need to download all invoices from my bank portal"
  ↓
Livinity RPA Builder:
  1. Navigate to bank website
  2. Login (saved credentials)
  3. Go to invoices page
  4. Filter by date range
  5. Download each invoice
  6. Save to Livinity file storage
  ↓
User can trigger manually or schedule
(Cron: Every month on 1st)
  ↓
Invoices automatically appear in Livinity Files
```

### Benefits
- Automate repetitive web tasks
- Vision-based (survives website changes)
- No coding required
- Works with any website (not just APIs)
- Scheduling capability

### Timeline: Phase 2-3 (v8.0-v8.5)

---

## Pattern 4: CrewAI Multi-Agent Orchestration (Phase 4)

### Overview
Enable advanced multi-agent workflows where agents with different roles collaborate on complex tasks.

### Architecture
```
┌─────────────────────────────────────────┐
│  Livinity User (power user)             │
└──────────────┬──────────────────────────┘
               │
      Livinity Dashboard
               │
┌──────────────▼──────────────────────────┐
│  CrewAI Orchestration Layer             │
│                                         │
│  - Researcher Agent                     │
│  - Analyst Agent                        │
│  - Report Writer Agent                  │
│  - Approver Agent (human-in-loop)       │
│                                         │
│  Task: "Generate monthly sales report"  │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┬──────────┬────────┐
        │             │          │        │
   ┌────▼──┐   ┌─────▼──┐  ┌───▼───┐ ┌─▼──────┐
   │Claude │   │Kimi API│  │LLM    │ │Nexus   │
   │API    │   │        │  │Local  │ │MCP     │
   └────────┘   └────────┘  └───────┘ └────────┘
        │             │          │        │
        └─────────────┴──────────┴────────┘
                  │
        ┌─────────▼──────────┐
        │  Data Sources      │
        │  - Database        │
        │  - APIs            │
        │  - Files           │
        └────────────────────┘
```

### Implementation Steps

1. **Create CrewAI wrapper for Livinity**
   ```python
   # nexus/packages/crewai/livinity_integration.py

   from crewai import Agent, Task, Crew
   from livinity_mcp import LiviniaMCP

   class LiviniaCrew:
       def __init__(self, user_id: str):
           self.user_id = user_id
           self.mcp = LiviniaMCP(user_id)

       def create_sales_report_crew(self):
           # Define agents
           researcher = Agent(
               role="Sales Data Researcher",
               goal="Gather and verify sales data",
               tools=[self.mcp.get_sales_data, self.mcp.web_search]
           )

           analyst = Agent(
               role="Data Analyst",
               goal="Analyze trends and patterns",
               tools=[self.mcp.analyze_data, self.mcp.create_chart]
           )

           writer = Agent(
               role="Report Writer",
               goal="Create professional report",
               tools=[self.mcp.write_document, self.mcp.format_report]
           )

           # Define tasks
           research_task = Task(
               description="Gather Q1 sales metrics",
               agent=researcher
           )

           analysis_task = Task(
               description="Analyze trends",
               agent=analyst,
               depends_on=[research_task]
           )

           report_task = Task(
               description="Write executive summary",
               agent=writer,
               depends_on=[analysis_task]
           )

           # Create crew
           return Crew(
               agents=[researcher, analyst, writer],
               tasks=[research_task, analysis_task, report_task]
           )

       def execute(self):
           crew = self.create_sales_report_crew()
           return crew.kickoff()
   ```

2. **Livinity CrewAI API**
   ```typescript
   // nexus/packages/core/src/routes/crews.ts

   router.post('/crews', async (req, res) => {
     const { userId, name, agentConfig } = req.body;

     // Save crew definition
     const crew = await Crew.create({
       userId,
       name,
       config: agentConfig
     });

     res.json({ id: crew.id, name: crew.name });
   });

   router.post('/crews/:id/execute', async (req, res) => {
     const crew = await Crew.findById(req.params.id);

     // Execute crew in background
     const job = await executeCrewAsync(crew.config);

     res.json({
       jobId: job.id,
       status: 'running',
       statusUrl: `/api/jobs/${job.id}`
     });
   });

   // WebSocket for streaming results
   router.get('/jobs/:id/stream', (req, res) => {
     const job = Job.findById(req.params.id);
     job.on('output', (output) => {
       res.write(`data: ${JSON.stringify(output)}\n\n`);
     });
   });
   ```

3. **CrewAI Studio UI for Livinity**
   ```tsx
   // livos/packages/ui/src/routes/crew-studio/
   - index.tsx              // Crew list + dashboard
   - CrewBuilder.tsx        // Visual agent editor
   - TaskEditor.tsx         // Task definition
   - ExecutionMonitor.tsx   // Real-time execution view
   ```

### Example Use Case
```
Scenario: "Create weekly business intelligence report"

User defines Crew:
  Agent 1: Research (gathers sales, marketing, product data)
  Agent 2: Analyst (identifies trends, risks, opportunities)
  Agent 3: Report Writer (creates polished executive summary)
  Agent 4: Approver (human reviews before sending to CEO)

User schedules: Every Monday 6am

Execution Flow:
  Monday 6am → Researcher gathers data →
  Analyst processes → Report Writer drafts →
  Approver gets notification, reviews, approves →
  Report sent to CEO inbox

All orchestrated autonomously by Livinity
```

### Benefits
- Complex multi-step workflows with role specialization
- Agents collaborate and build on each other's work
- Full transparency (see agent reasoning)
- Supports human-in-the-loop approvals
- Can leverage any LLM (Claude optimal, but flexible)

### Timeline: Phase 4 (v9.0)

---

## Pattern 5: Human-in-the-Loop Governance (Phase 4-5)

### Overview
Add approval gates and cost controls to prevent AI agent runaway and ensure compliance.

### Architecture
```
┌──────────────────────────────────────┐
│  Agent Execution Request             │
└──────────────┬───────────────────────┘
               │
       ┌───────▼────────┐
       │ Cost Check      │
       │ Budget $X/mo?   │
       └───────┬────────┘
               │
         (Budget OK)
               │
       ┌───────▼─────────────┐
       │ Action Preview      │
       │ "Will: Send email   │
       │  To: 1000 people    │
       │  Cost: $50"         │
       └───────┬─────────────┘
               │
     Admin/User Notification
       (Slack/Email/UI)
               │
         (Approval Timeout)
         ┌────────────────┐
         │                │
      Approved        Rejected
         │                │
    ┌────▼──┐        ┌───▼────┐
    │Execute │        │ Abort  │
    │Agent   │        │Action  │
    └────────┘        └────────┘
```

### Implementation Steps

1. **Cost tracking middleware**
   ```typescript
   // nexus/packages/core/src/middleware/cost-tracking.ts

   const costLimits = {
     standard: 50,      // $50/month
     pro: 200,          // $200/month
     enterprise: 5000   // $5000/month
   };

   async function estimateActionCost(action: Action): Promise<number> {
     switch (action.type) {
       case 'llm_call':
         return estimateLLMCost(action.tokens);
       case 'api_call':
         return action.estimatedCost || 0.01;
       case 'email_send':
         return action.recipientCount * 0.0001;
       default:
         return 0;
     }
   }

   async function checkBudget(userId: string, cost: number) {
     const user = await User.findById(userId);
     const monthlySpent = await getMonthlySpent(userId);
     const limit = costLimits[user.tier];

     if (monthlySpent + cost > limit) {
       return {
         allowed: false,
         reason: `Exceeds monthly budget ($${limit})`
       };
     }
     return { allowed: true };
   }
   ```

2. **Action approval system**
   ```typescript
   // nexus/packages/core/src/routes/approvals.ts

   router.post('/agents/:agentId/execute', async (req, res) => {
     const agent = await Agent.findById(req.params.agentId);
     const action = req.body;

     // Estimate cost
     const cost = await estimateActionCost(action);

     // Check budget
     const budgetCheck = await checkBudget(agent.userId, cost);
     if (!budgetCheck.allowed) {
       return res.status(402).json({
         error: budgetCheck.reason
       });
     }

     // Create approval request
     const approval = await Approval.create({
       agentId: agent.id,
       actionPreview: serializeAction(action),
       estimatedCost: cost,
       createdAt: new Date(),
       expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
     });

     // Notify user
     await sendApprovalNotification(agent.userId, approval);

     // Wait for approval (with timeout)
     res.json({
       approvalId: approval.id,
       status: 'pending',
       expiresAt: approval.expiresAt
     });
   });

   router.post('/approvals/:id/approve', async (req, res) => {
     const approval = await Approval.findById(req.params.id);

     if (approval.status !== 'pending') {
       return res.status(400).json({
         error: 'Approval already resolved'
       });
     }

     // Mark as approved
     approval.status = 'approved';
     approval.approvedAt = new Date();
     await approval.save();

     // Execute agent
     const result = await executeAgentAction(approval);

     res.json({
       status: 'approved',
       result
     });
   });
   ```

3. **Audit logging**
   ```typescript
   // nexus/packages/core/src/models/AuditLog.ts

   interface AuditLog {
     id: string;
     userId: string;
     agentId: string;
     action: string;
     actionDetails: object;
     estimatedCost: number;
     actualCost: number;
     approvedBy: string;
     status: 'executed' | 'failed' | 'rejected';
     timestamp: Date;
     result: object;
   }

   // Every action logged for compliance/debugging
   async function logAction(log: AuditLog) {
     await AuditLog.create(log);

     // Also log to external service for compliance
     if (process.env.AUDIT_LOG_ENDPOINT) {
       await fetch(process.env.AUDIT_LOG_ENDPOINT, {
         method: 'POST',
         body: JSON.stringify(log)
       });
     }
   }
   ```

4. **Approval UI in Livinity**
   ```tsx
   // livos/packages/ui/src/routes/approvals/
   - PendingApprovals.tsx   // List pending actions
   - ApprovalDetail.tsx     // Preview + controls
   - AuditLog.tsx           // Historical log

   function PendingApprovals() {
     const [approvals, setApprovals] = useState([]);

     // WebSocket subscription to pending approvals
     useEffect(() => {
       const ws = new WebSocket('wss://...');
       ws.onmessage = (e) => {
         const approval = JSON.parse(e.data);
         setApprovals(prev => [approval, ...prev]);
       };
     }, []);

     return (
       <div>
         {approvals.map(approval => (
           <ApprovalCard
             key={approval.id}
             approval={approval}
             onApprove={() => approveAction(approval.id)}
             onReject={() => rejectAction(approval.id)}
           />
         ))}
       </div>
     );
   }
   ```

### Benefits
- Prevents accidental expensive operations
- Audit trail for compliance/debugging
- User retains control over AI actions
- Slack/email alerts for approvals
- Cost visibility per user/agent

### Timeline: Phase 4-5 (v9.0+)

---

## Integration Complexity Comparison

| Pattern | Complexity | Effort | User Benefit | Timeline |
|---------|-----------|--------|--------------|----------|
| **MCP** | Medium | 20-30h | Access from Claude | v7.5 |
| **Langflow** | Medium | 30-40h | Visual workflow builder | v8.0 |
| **Skyvern** | Low | 20-30h | Web automation | v8.0-8.5 |
| **CrewAI** | High | 60-80h | Multi-agent coordination | v9.0 |
| **Human-in-Loop** | Medium | 30-40h | Cost/approval controls | v9.0+ |

---

## Security Considerations

### MCP Pattern
- ✅ Secure (users authenticate with Livinity)
- ⚠️ Rate-limit external API calls
- ⚠️ Validate MCP server responses

### Langflow Pattern
- ✅ Isolated within Livinity network
- ⚠️ Validate LLM API keys per-user
- ⚠️ Sandbox code components (prevent shell injection)

### Skyvern Pattern
- ✅ Browser runs isolated per task
- ⚠️ Don't store credentials in workflows (use Livinity secrets)
- ⚠️ Limit concurrent browser sessions per user

### CrewAI Pattern
- ✅ Run agents in separate processes
- ⚠️ Implement cost limits
- ⚠️ Require approval for "write" actions
- ⚠️ Audit all agent decisions

### Human-in-Loop Pattern
- ✅ Approval gates prevent runaway
- ✅ Audit logs for compliance
- ⚠️ Notify user of expensive operations
- ⚠️ Implement timeouts (auto-reject after 24h)

---

## Cost Implications

### Infrastructure
- Langflow: +200MB container, Python runtime
- Skyvern: +500MB, Playwright + Chrome, 4GB RAM
- CrewAI: +50MB, Python runtime, minimal overhead
- MCP: Negligible (already running nexus-mcp)

### API Costs (per user, monthly)
- Light usage (MCP only): $5-20
- Medium usage (Langflow + Skyvern): $20-100
- Heavy usage (CrewAI + Skyvern): $50-500+

### Recommendations
- Implement cost tracking early (Phase 1)
- Set default budgets ($50/month for standard users)
- Offer enterprise tier with higher budgets

---

## Rollout Strategy

```
Phase 1 (v7.5): Foundations
  - Expand nexus-mcp coverage
  - Document for power users
  - Early adopter feedback

Phase 2 (v8.0): Accessibility
  - Ship Langflow + Skyvern
  - Visual workflow builders
  - Templates + tutorials

Phase 3 (v8.5): Validation
  - Cost tracking working well
  - User feedback on usability
  - Identify missing integrations

Phase 4 (v9.0): Advanced
  - CrewAI multi-agent
  - Human-in-the-loop governance
  - Agent marketplace concept

Phase 5 (v10.0): Enterprise
  - Audit logging
  - RBAC for agents
  - Voice interface
  - SLA support
```

---

## Risk Mitigation

### Technical Risks
| Risk | Mitigation |
|------|-----------|
| Agent runaway costs | Cost limits + approvals |
| Agent security exploits | Sandboxing + input validation |
| Agent latency | Queue + async execution |
| LLM API failures | Fallback + retry logic |

### Business Risks
| Risk | Mitigation |
|------|-----------|
| User data leakage | Encryption + audit logs |
| IP exposure via LLM | Terms of service + local LLM option |
| Support burden | Clear docs + template library |
| Marketplace liability | Review process for shared agents |

---

## Success Metrics

### Phase 1 (MCP)
- [x] 5+ MCP servers working
- [x] 10+ power users using Claude Code integration
- [x] <100ms MCP latency

### Phase 2 (Langflow + Skyvern)
- [x] 50+ users creating flows
- [x] 10+ RPA automations in production
- [x] <$5 avg cost per user/month

### Phase 4 (CrewAI)
- [x] 5+ multi-agent workflows
- [x] 100+ CrewAI teams created
- [x] Approval gate working for 100% of risky actions

### Phase 5 (Enterprise)
- [x] Audit logs comprehensive
- [x] SLA support for business users
- [x] 50+ shared agents in marketplace

---

## Conclusion

These patterns provide a roadmap for incrementally adding AI agent capabilities to Livinity while maintaining security, usability, and self-hosted philosophy. Start with MCP (minimal changes), progress to visual builders (Langflow + Skyvern), then advance to multi-agent orchestration (CrewAI) with governance (approvals + cost controls).

The modular approach allows each pattern to stand alone or combine seamlessly, giving Livinity users a complete ecosystem for AI automation at home.
