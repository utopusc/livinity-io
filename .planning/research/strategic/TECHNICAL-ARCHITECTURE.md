# LivOS Technical Architecture Research Report

**Document Type:** Strategic Technical Research
**Scope:** Architecture modernization, AI evolution, performance, security, mobile, DX
**Date:** 2026-03-07
**Methodology:** Codebase analysis + active web research across 25+ sources
**Confidence:** HIGH for current stack assessments, MEDIUM-HIGH for forward-looking recommendations

---

## Executive Summary

LivOS sits on a mature, well-chosen stack for its current phase. The core architecture (tRPC + Express + Redis + PostgreSQL + BullMQ + Docker) is sound and does not need replacement. The AI layer (Claude Agent SDK + MCP tools) is state-of-the-art and aligns with where the industry is heading. The primary architectural opportunities are: (1) modular decomposition without microservices overhead, (2) Ollama/multi-model support for cost reduction and offline capability, (3) bundle optimization for the 1.3MB Vite chunk, (4) a formal plugin/extension system replacing the current skill approach, and (5) security hardening for the path toward open-source public release.

Key verdict on major questions:
- **Stay monolithic** (modular monolith pattern, not microservices)
- **Keep tRPC** for internal frontend-backend communication
- **Add REST public API** layer on top for third-party developers
- **Add Ollama** as a local model fallback alongside Claude
- **Valkey over Redis** when Redis 7.x license becomes a concern
- **PWA first** for mobile, React Native only if push notification requirements force it
- **SQLite is viable** for single-node LivOS, but keep PostgreSQL for Nexus due to pgvector

---

## 1. Architecture Modernization

### 1.1 Microservices vs Modular Monolith

**Verdict: Stay modular monolith. Do not split into microservices.**

The 2025-2026 industry consensus has shifted significantly. The modular monolith has been rehabilitated as a serious production pattern, described in multiple 2025 analyses as "a serious competitor to microservices" for small-to-medium teams. The decision framework is clear:

| Condition | Microservices Justified? |
|-----------|--------------------------|
| Team > 50 engineers | Yes |
| Independent deployment requirements | Yes |
| Per-service scaling needs | Yes |
| Single VPS, single user | No |
| Sub-10 person team | No |
| Latency-sensitive (voice pipeline) | No |

LivOS's current architecture is already organized as a modular monolith: `livinityd` (system daemon) and `nexus-core` (AI agent server) are separate processes but not microservices — they share no message bus and communicate via HTTP. This is the correct structure.

**What "modular monolith" means in practice for LivOS:**

```
nexus/
  packages/
    core/         - AI agent engine, channels, WebSocket gateway
    memory/       - Vector search, embedding pipeline (already separate process)
    worker/       - BullMQ consumer (already separate process)
    mcp-server/   - MCP protocol server (already separate process)
livos/
  packages/
    livinityd/    - System daemon (auth, files, Docker, tRPC API)
    ui/           - React frontend
```

The key improvement is to enforce clean module boundaries within each package rather than introducing network hops between them. Each module should have an explicit interface (TypeScript type exports) rather than importing deeply into another module's internals.

**What to avoid:** A "services" split that creates `nexus-voice-service`, `nexus-memory-service`, `nexus-webhook-service` as separate HTTP servers. Each additional network hop adds 5-20ms latency and a new failure mode. For voice specifically, inter-process hops would push total latency above 500ms — unacceptable.

**When to reconsider:** If LivOS grows to multi-user/multi-tenant (not currently planned), or if the memory service needs to scale independently from the agent engine, extract at that point. Build module boundaries now, extract services only when pain is measurable.

### 1.2 API Layer: tRPC vs GraphQL vs REST

**Verdict: Keep tRPC for internal UI↔daemon communication. Add REST (OpenAPI) for public developer API.**

Research across multiple 2025-2026 analyses converges on a clear pattern: production systems use multiple API styles, each for a specific role.

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| UI ↔ livinityd | tRPC 11.x | End-to-end TypeScript types, zero schema duplication, superior DX for internal use |
| UI ↔ nexus-core | REST + SSE (existing `/api/agent/stream`) | Already working; SSE is the right choice for AI streaming in 2025 |
| Third-party developers | REST + OpenAPI 3.1 | Language-agnostic, CLI-friendly, cacheable, industry-standard |
| Service-to-service | Direct function calls (same process) or HTTP | Prefer in-process; HTTP only when processes must be separate |

**Why tRPC remains the right choice for internal use:**
- TypeScript-first teams see "near-zero manual typings and instant feedback during refactorings"
- Near-baseline CPU overhead versus GraphQL's 20-40% higher CPU at scale
- BullMQ (already in use) handles async job patterns that GraphQL subscriptions would otherwise solve
- The monorepo structure (`workspace:*` dependencies) means tRPC's shared types work perfectly

**Why GraphQL is wrong here:**
- No multi-client data requirement (LivOS has exactly one frontend consuming the API)
- Poor caching without significant CDN configuration
- "Poor caching" and "20-40% higher CPU" are real costs with no offsetting benefit for a single-user system

**The public REST API (new work):**
Add a dediated REST API surface (`/api/v1/*`) on top of existing functionality with OpenAPI 3.1 spec. This enables:
- CLI tooling that any language can use
- Third-party integrations (IFTTT, Zapier, custom scripts)
- SDK generation via Swagger Codegen
- Webhook receiver verification (HMAC)

**Implementation approach:**
```typescript
// Route structure (additive, no replacement of existing tRPC)
/api/v1/agent/tasks        POST  - submit task
/api/v1/agent/tasks/:id    GET   - task status
/api/v1/system/stats       GET   - server metrics
/api/v1/apps               GET   - installed apps list
/api/v1/apps/:id/start     POST  - start app
/api/v1/apps/:id/stop      POST  - stop app
/api/v1/channels           GET   - channel status
/api/v1/memory/search      POST  - semantic memory search
```

Authentication via `X-Api-Key` header (existing pattern in nexus). Generate OpenAPI spec from code using `zod-to-openapi` or `@asteasolutions/zod-to-openapi`.

### 1.3 How Competitors Handle Backend Architecture

**CasaOS / ZimaOS:**
Uses a Go microservice architecture: `CasaOS-AppManagement` translates UI clicks to `docker compose up`. Multiple Go services communicate over gRPC internally. The Go choice gives them excellent memory footprint on Raspberry Pi (~50MB per service vs ~100-200MB for Node.js). The lesson for LivOS: Go services are an option for extremely resource-constrained targets, but Node.js is fine for the current VPS-class hardware.

**Umbrel:**
Built primarily in TypeScript/Node.js with a process-per-app model. Uses tramboline scripts to manage Docker containers. Community-driven app store with YAML manifests per app. Key insight: the app manifest format (YAML + Docker Compose) is the right abstraction for LivOS's app store too.

**Cosmos Server:**
Uses Go for the backend, React for frontend. Provides a unified reverse proxy + authentication layer that all apps run behind. Notable for its zero-friction SSL via Let's Encrypt and built-in SSO for all self-hosted apps. LivOS should consider adding a unified SSO layer (Authentik or Authelia integration) so all Docker apps benefit from LivOS's authentication.

### 1.4 Event-Driven Architecture for Home Servers

LivOS already implements a partial event-driven architecture: BullMQ for job queues, Redis Pub/Sub for WebSocket notifications, and the Daemon inbox pattern for message routing. The existing pattern is correct.

**What to add:** Redis Streams for durable event log.

Redis Streams (unlike Pub/Sub) are persistent, replayable, and consumer-group aware. Use Redis Streams for:
- Audit log of all agent actions (immutable, queryable by time range)
- Cross-process event fan-out when memory/worker processes need to react to agent events
- Webhook delivery retry queue (more reliable than BullMQ for short-lived tasks)

```typescript
// Example: Agent action audit stream
await redis.xadd('nexus:events:agent', '*', {
  type: 'tool_call',
  tool: 'bash',
  input: JSON.stringify(input),
  sessionId,
  timestamp: Date.now().toString(),
});
```

**What NOT to add:** NATS, Kafka, or RabbitMQ. These are distributed system solutions solving problems LivOS does not have. Redis Streams handles everything needed.

### 1.5 Database Choices

**Verdict: Keep PostgreSQL for Nexus (pgvector required). Consider SQLite for livinityd config storage.**

| Use Case | Current | Recommendation |
|----------|---------|----------------|
| Vector embeddings (memory) | PostgreSQL + pgvector | Keep — no alternative matches pgvector for this use case |
| Conversation history | Redis (append-only) | Keep — Redis list operations are optimal for this |
| Configuration / settings | Redis strings | Acceptable; SQLite is simpler but Redis is already running |
| Job state (BullMQ) | Redis | Keep — BullMQ requires Redis |
| System audit log | None | Add Redis Streams (see above) |
| livinityd app state | In-memory / Redis | Consider SQLite for persistent state without Redis dependency |

**SQLite consideration for livinityd:**
If LivOS is to run on low-power devices without Redis, `better-sqlite3` (synchronous SQLite) is an excellent choice for livinityd's configuration storage. It has zero server overhead, ACID transactions, and WAL mode for concurrent reads. The single-user constraint means SQLite's write serialization is not a limitation. However, given Redis is already a hard dependency for nexus-core (BullMQ cannot be replaced without significant rework), removing Redis from livinityd only for the SQLite benefit is not worth the migration cost currently.

**Conclusion:** Keep the current database setup. Future work if targeting Raspberry Pi: extract livinityd to be a standalone, SQLite-only binary without Redis dependency.

### 1.6 Is Redis Necessary?

**Short term: Yes. Medium term: Consider Valkey.**

Redis is a hard dependency for BullMQ, which has no drop-in replacement. The pub/sub and streams features are also genuinely best served by Redis. The architecture is correct.

**The license concern:** Redis changed to a BSL/SSPL dual license in March 2024. For self-hosted open-source projects, this is not a direct problem (BSL allows self-hosted use). However, if LivOS builds a SaaS offering in the future, BSL prohibits competing with Redis Inc.

**Valkey** (Linux Foundation fork, AWS/Google/Oracle-backed, BSD-3-Clause):
- 100% API compatible with Redis 7.2.4
- Drop-in replacement: change `redis` to `valkey` in Docker Compose
- BullMQ has tested Valkey compatibility (uses the same protocol)
- Benchmark: 3x throughput improvement over Redis in Valkey 8.x with RDMA support

**Recommendation:** Use Valkey 8.x in new installations. The Docker image is `valkey/valkey:8-alpine`. Code changes: none (ioredis works with Valkey because the protocol is identical).

---

## 2. Plugin / Extension System

### 2.1 How Successful Platforms Implement Plugin Systems

**Home Assistant Integration Pattern:**
Home Assistant's integration system (3,000+ integrations) uses a well-proven architecture:
- Each integration lives in a directory with `manifest.json` (name, version, dependencies, domain)
- Integrations implement a defined interface: `async_setup()`, `async_setup_entry()`, `async_unload_entry()`
- Hot-reload via entry reload: integrations can be reloaded without restarting HA
- Configuration flows via UI (no YAML required for modern integrations)
- Circuit breaker patterns to isolate failures per integration

The key insight: **each integration is isolated by its own exception boundary**. A failing integration does not crash the platform.

**VSCode Extension Pattern:**
- `package.json` manifest with `contributes` section declaring capabilities
- Extensions run in a separate Extension Host process (Node.js worker)
- Communication via message passing to the main process
- Hot-reload by restarting the Extension Host process (not the whole app)
- Activation events: extensions only load when relevant triggers occur

**Obsidian Plugin Pattern:**
- Plugins are JavaScript files loaded via `eval()` in a sandboxed context
- Each plugin registers capabilities via `this.addCommand()`, `this.registerView()`, etc.
- Plugins can access `this.app` for the full Obsidian API
- No inter-plugin communication — all goes through the app API

**n8n Node Pattern:**
n8n has 400+ core nodes and 600+ community nodes. Key patterns:
- Nodes are npm packages with a specific structure (`n8n-nodes-base` or custom)
- Three levels: declarative JSON nodes (simplest), programmatic nodes (full power), function code (inline)
- Hot-install: custom nodes copied to `~/.n8n/custom/` directory then reloaded
- Type safety via generated TypeScript interfaces
- Docker: custom nodes require a custom Docker image

### 2.2 LivOS Plugin Architecture Design

LivOS's current "skill" system (git-based, TypeScript files loaded at runtime) is the foundation. The upgrade path:

**Current skill system gaps:**
- No formal manifest/metadata format
- Skills cannot register UI components
- No dependency declarations between skills
- No versioning beyond git refs
- No sandboxing (skills run in main process)

**Proposed plugin architecture (near-term, pragmatic):**

```typescript
// nexus/skills/my-skill/manifest.json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "author": "username",
  "license": "MIT",
  "triggers": ["keyword1", "keyword2"],  // For intent routing
  "tools": ["tool_name_1", "tool_name_2"],  // MCP tools registered
  "config": {                              // Required config keys
    "MY_API_KEY": { "type": "string", "secret": true }
  },
  "dependencies": {                        // npm packages needed
    "axios": "^1.0.0"
  }
}
```

```typescript
// nexus/skills/my-skill/index.ts
import { SkillContext } from '@nexus/sdk';

export default {
  // Tool registrations
  tools: [
    {
      name: 'my_tool',
      description: 'What this tool does',
      parameters: { /* zod schema */ },
      execute: async (params: unknown, ctx: SkillContext) => {
        // Implementation
      }
    }
  ],
  // Optional: trigger handler
  onMessage: async (message: string, ctx: SkillContext) => {
    // Quick response before agent processing
    return null; // or { response: string }
  }
}
```

**Loading mechanism:**
```typescript
// SkillLoader.ts
class SkillLoader {
  async loadSkill(path: string): Promise<LoadedSkill> {
    const manifest = JSON.parse(await fs.readFile(`${path}/manifest.json`));
    const module = await import(`${path}/index.ts`);

    // Install npm dependencies if needed
    if (manifest.dependencies) {
      await execa('npm', ['install', '--prefix', path]);
    }

    // Register tools with ToolRegistry
    for (const tool of module.default.tools) {
      this.toolRegistry.register(tool);
    }

    return { manifest, module };
  }

  async reloadSkill(name: string): Promise<void> {
    // Hot-reload: unregister tools, clear require cache, reload
    this.unloadSkill(name);
    await this.loadSkill(this.skillPaths.get(name));
  }
}
```

**Hot-reload capability:**
Node.js's `import()` cache can be bypassed via URL query strings (`import(\`./skill.ts?t=${Date.now()}\``). For production hot-reload, use `@parcel/watcher` (already in livinityd's dependencies) to watch skill directories and trigger reload on file changes.

### 2.3 Docker App Store Architecture

The current app store uses a YAML manifest pattern from a git repository (utopusc/livinity-apps). This is the correct approach.

**Recommended manifest schema (aligned with Umbrel/CasaOS):**

```yaml
# apps/my-app/livinity-app.yaml
version: "2.0"
metadata:
  name: "My App"
  id: "my-app"
  tagline: "Short description"
  description: "Full markdown description"
  category: "tools"
  tags: ["productivity", "files"]
  icon: "https://cdn.../icon.png"
  screenshots: []
  author: "Developer Name"
  website: "https://example.com"
  repo: "https://github.com/..."
  license: "MIT"
  versions:
    - version: "2.1.0"
      compose_ref: "docker-compose.yml"

compose: |
  services:
    app:
      image: myapp:2.1.0
      restart: unless-stopped
      volumes:
        - ${APP_DATA_DIR}/data:/data
      ports:
        - ${PORT}:8080
      environment:
        - PUID=1000
        - PGID=1000
```

**App isolation and security:**
- Each app runs in its own Docker network (`livos-{appid}`)
- Apps are NOT on the host network by default
- Port mapping only for explicitly declared ports
- Volume mounts scoped to `${APP_DATA_DIR}/{appid}/` — no host filesystem access
- Apps requiring elevated privileges must declare `privileged: true` (shown with warning in UI)

**Sandbox security considerations (Docker in 2025-2026):**
- CVE-2025-9074 showed that Docker container isolation is NOT absolute — containers can access the Docker socket via default subnet
- Mitigation: never mount `/var/run/docker.sock` in user-installed apps
- Use Docker network isolation + `--no-new-privileges` flag in compose files
- For apps requiring Docker-in-Docker (Portainer, etc.), explicitly warn users
- gVisor is an option for maximum isolation but adds 10-20% performance overhead

### 2.4 Sandboxing and Security for Third-Party Skills

**Current risk:** Skills run directly in the nexus-core process. A malicious skill could access all Redis keys, all secrets, all channels.

**Recommended approach (near-term):**
- Code review requirement for LivHub (official marketplace) skills
- Skill manifest declares required permissions (`redis:read:nexus:config:*`)
- SkillLoader validates declared vs actual Redis key access patterns at install time
- Skills run in a tightly scoped `SkillContext` that proxies Redis access through a key-permission filter

**Long-term (when LivOS goes public):**
- Skills run in `vm.runInNewContext()` (Node.js `vm` module) for soft sandboxing
- Hard sandboxing via `worker_threads` with message-passing for Redis access
- True isolation via separate Docker container per skill (heavy but secure)

For the current phase (single developer, curated skills), the permission-declaration approach is sufficient.

---

## 3. AI Architecture Evolution

### 3.1 MCP Server Ecosystem

**State of ecosystem (March 2026):**
- 5,500+ MCP servers listed on PulseMCP (as of October 2025)
- Downloads grew from 100K (November 2024) to 8M+ (April 2025)
- Remote MCP servers up 4x since mid-2025
- OpenAI, Anthropic, Hugging Face, and LangChain standardized on MCP
- Market projected at $10.4B by 2026 (24.7% CAGR)

**Security concern:** 88% of MCP servers use credentials, but 53% rely on long-lived static secrets and only 8.5% use OAuth. This is a known weakness in the ecosystem.

**LivOS MCP implications:**
1. The existing nexus MCP server (`/packages/mcp-server`) is well-positioned — the ecosystem is growing around the same pattern
2. Add OAuth support to the MCP server endpoint for external clients (Claude Desktop, Cursor, etc.)
3. For the 2026 enterprise path, add audit logging per MCP tool call (Redis Streams)
4. Consider publishing the LivOS MCP server to the MCP registry for discoverability

**Best practices to implement:**
```typescript
// MCP server authentication (upgrade from static key to OAuth)
// nexus/packages/mcp-server/src/auth.ts
const server = new McpServer({
  name: 'livinity-nexus',
  version: '2.0.0',
  auth: {
    type: 'oauth2',
    flows: {
      authorizationCode: {
        authorizationUrl: 'https://your-domain.com/oauth/authorize',
        tokenUrl: 'https://your-domain.com/oauth/token',
        scopes: {
          'tools:read': 'Read tool list',
          'tools:execute': 'Execute tools',
          'memory:read': 'Read memory',
        }
      }
    }
  }
});
```

### 3.2 Multi-Model Support

**Verdict: Add Ollama as first-class local model provider. Keep Claude as default. Add OpenAI-compatible adapter layer.**

**Current state:** LivOS uses Claude (via Claude Agent SDK) as primary with Gemini fallback. The AIProvider interface exists but is not fully abstracted.

**Target architecture (multi-model):**

```typescript
// nexus/packages/core/src/providers/index.ts
interface ModelProvider {
  id: string;
  name: string;
  models: ModelSpec[];
  createCompletion(messages: Message[], options: CompletionOptions): Promise<CompletionResult>;
  createStream(messages: Message[], options: CompletionOptions): AsyncGenerator<CompletionChunk>;
  supportsTools: boolean;
  supportsVision: boolean;
  contextWindow: number;
  costPerMToken: number; // 0 for local
}

// Implementations
class ClaudeProvider implements ModelProvider { /* via Claude Agent SDK */ }
class OllamaProvider implements ModelProvider { /* via OpenAI-compatible API */ }
class OpenAIProvider implements ModelProvider { /* direct OpenAI API */ }
class GeminiProvider implements ModelProvider { /* existing implementation */ }
```

**Ollama integration (near-term priority):**

Ollama now exposes an Anthropic Messages API-compatible endpoint (announced 2025). This means the Claude Agent SDK can actually proxy to Ollama models:

```typescript
// Environment variable approach
ANTHROPIC_BASE_URL=http://localhost:11434/v1/anthropic
// Then Claude Agent SDK hits Ollama instead of Anthropic
```

More robustly, add a dedicated Ollama provider:
```typescript
// For non-SDK agent paths (Gemini-style AgentLoop)
const ollamaProvider = new OllamaProvider({
  baseUrl: 'http://localhost:11434',
  defaultModel: 'llama3.3', // or qwen2.5-coder for code tasks
});
```

**Model selection logic:**
```typescript
// Task-based model routing
function selectModel(task: Task, config: ModelConfig): ModelProvider {
  if (task.requiresTool && config.preferLocal) return ollamaProvider;
  if (task.requiresVision) return claudeProvider; // Ollama vision still maturing
  if (config.budget === 'free') return ollamaProvider;
  return claudeProvider; // default
}
```

**Cost implications:** Llama 3.3 70B on Ollama has near-Claude-Haiku performance on many tasks at $0 API cost. For a self-hosted home server, this is significant — users can run agents continuously without Anthropic billing anxiety.

**Hardware requirements for Ollama:**
- Llama 3.2 3B: 2GB VRAM, runs on most modern GPUs and Apple M-series
- Llama 3.3 70B: 40GB VRAM (or CPU-only mode on 64GB+ RAM, ~3 tokens/sec)
- Qwen2.5-Coder 7B: 5GB VRAM, excellent for code tasks
- For CPU-only servers: 7B models are practical; 70B is too slow for interactive use

### 3.3 Agent Framework Comparison

**Verdict: Stay with custom agent loop + Claude Agent SDK. Mastra is worth monitoring but not adopting yet for Nexus.**

| Framework | Language | Stars | Production Ready | LivOS Fit |
|-----------|----------|-------|-----------------|-----------|
| LangGraph | Python/JS | 47M+ PyPI downloads | Yes (v1.0 late 2025) | Poor — Python-first, JS port is secondary |
| CrewAI | Python | High (growing fastest) | Yes | Poor — Python only |
| AutoGen | Python | High | Entering maintenance | Poor — Microsoft merging into Agent Framework |
| Mastra | TypeScript | 150K weekly npm DL | Beta (YC W25, launched Jan 2025) | Medium — TypeScript-native, but duplicates existing architecture |
| Claude Agent SDK | TypeScript | N/A (internal) | Yes | High — currently in use, powers Claude Code |

**Why Mastra is interesting but not a replacement:**
- TypeScript-native from day one (not a Python port)
- Built-in RAG, memory, evals, observability, and workflow primitives
- 150K weekly downloads for a framework less than a year old shows strong adoption
- Built-in Mastra Studio for debugging agents locally
- However: LivOS already has all these primitives custom-built; migrating to Mastra would be a large refactor with uncertain benefit

**The right Mastra use case for LivOS:** Use Mastra's patterns (not the library) as a reference implementation. The evals pattern and Scorer API from Mastra's August 2025 changelog are worth adopting conceptually.

**Why the custom agent loop is correct:**
The Claude Agent SDK blog post from Anthropic explicitly states: "For orchestration logic, Claude excels at writing code and by letting it express orchestration logic in Python [or TypeScript] rather than through natural language tool invocations, you get more reliable, precise control flow." The custom Daemon → SdkAgentRunner → ToolRegistry loop is exactly this pattern.

**Subagents (new Claude Agent SDK feature):**
The September 2025 rename to "Claude Agent SDK" came with `subagent` support. This is directly applicable to LivOS's multi-agent sessions:

```typescript
// Use the SDK's built-in subagent pattern instead of custom sessions_send tool
import { Agent, SubAgent } from '@anthropic-ai/claude-agent-sdk';

const orchestrator = new Agent({
  systemPrompt: 'You are the orchestrator...',
});

const researcher = new SubAgent(orchestrator, {
  systemPrompt: 'You are a researcher...',
  tools: ['web_search', 'mcp__nexus-tools__fetch'],
});
```

### 3.4 Memory / RAG Architecture

**Current state:** PostgreSQL + pgvector, hybrid memory extraction, temporal scoring, dedup, session binding. This is already a sophisticated implementation.

**What to improve:**

**1. Chunking strategy:**
Current approach (unknown, likely full-document): Switch to recursive chunking at 512 tokens with 10-20% overlap. This is the 2025 best practice baseline before semantic or contextual chunking.

**2. Reranking:**
Add a cross-encoder reranking step after initial vector retrieval:
```typescript
// After pgvector similarity search
const candidates = await vectorSearch(query, { limit: 20 });
const reranked = await crossEncoderRerank(query, candidates, { limit: 5 });
// Use top 5 reranked results in context
```
Options: `@xenova/transformers` (local), Cohere Rerank API (hosted).

**3. Matryoshka embeddings:**
When replacing the embedding model, choose one that supports Matryoshka Representation Learning (MRL). These encode information at multiple granularities — you can truncate a 3072-dimension vector to 256 dimensions and retain most semantic signal. This enables fast initial search + precise reranking in a single model.

**4. Temporal decay:**
Already implemented (temporal scoring). Good.

**5. Memory types architecture (beyond RAG):**
```
Working Memory:    Redis (session context, last N messages)
Episodic Memory:   PostgreSQL + pgvector (conversation summaries, events)
Semantic Memory:   PostgreSQL + pgvector (facts, user preferences, learned info)
Procedural Memory: Skill files (how to perform tasks)
```
This is roughly the current architecture. The improvement is making these layers explicit in the code with typed interfaces.

**6. RAGAS evaluation:**
Add automated memory quality checks using the RAGAS framework:
- Faithfulness: does retrieved context support generated response?
- Answer relevancy: does response address the query?
- Context precision: retrieval noise ratio
- Context recall: are relevant documents being found?

### 3.5 Voice AI Architecture

**Recommended stack for LivOS voice (when implemented):**

| Component | Recommendation | Latency | Notes |
|-----------|---------------|---------|-------|
| STT | Deepgram Nova-3 or Deepgram Flux | 150ms + 260ms EOT | Flux has model-integrated end-of-turn detection |
| LLM | Claude (existing) | ~500ms first token | Cached prompts reduce this |
| TTS | Cartesia Sonic | 40-95ms TTFA | Lowest latency option; 2026 benchmark winner |
| Total round-trip | Target < 800ms | — | Achievable with WebSocket relay pattern |

**Local alternatives (for offline mode):**
- STT: Whisper.cpp (fast-whisper on GPU: ~150ms for 5s audio)
- TTS: Kokoro-82M (82M parameter TTS, real-time on CPU)
- These enable voice without any API costs

**Architecture (matches existing ARCHITECTURE.md plan):**
The existing VoiceGateway design (WebSocket relay in nexus-core) is correct. The only addition is a local STT/TTS fallback path:

```typescript
class VoiceGateway {
  async transcribe(audioBuffer: Buffer): Promise<string> {
    if (this.config.voice.useLocal) {
      return this.whisperLocal.transcribe(audioBuffer);
    }
    return this.deepgramRelay.transcribe(audioBuffer);
  }
}
```

**Deepgram Flux (October 2025):**
Deepgram's Flux model is purpose-built for voice agents with model-integrated end-of-turn detection (~260ms), eliminating the need for separate Voice Activity Detection. This is significant — the VAD step is typically the hardest to tune correctly. Use Flux when available in production.

### 3.6 Claude Agent SDK vs Custom Agent Loop: Definitive Trade-offs

| Aspect | Claude Agent SDK | Custom Agent Loop |
|--------|----------------|-------------------|
| Context management | Built-in (compact on overflow) | Manual implementation required |
| Model flexibility | Claude only | Any provider |
| Deployment | Spawns subprocess (Claude Code CLI) | Pure library, no subprocess |
| Context window | Automatic compaction | Manual compaction needed |
| Permission system | Built-in (dontAsk/bypassPermissions/ask) | Must implement |
| Tool calling | Native MCP protocol | Native Anthropic messages API |
| Cost | Anthropic subscription or API | API cost per call |
| Debugging | SDK manages lifecycle | Full visibility |
| Multi-model | No | Yes (custom router) |
| TypeScript types | Excellent | Excellent (with @anthropic-ai/sdk) |

**Current LivOS decision is correct.** The SDK is used for the primary interactive agent path (Nexus daemon inbox). The custom Gemini AgentLoop is used as a fallback. This hybrid approach extracts maximum value from both.

**When to build a full custom loop:** Only if (a) multi-model routing becomes a core product feature, or (b) Claude SDK's subprocess model creates deployment issues on target hardware (Raspberry Pi with 1GB RAM).

---

## 4. Performance and Scalability

### 4.1 Low-Power Device Optimization

**Target hardware tiers:**

| Tier | Hardware | RAM | CPU | Node.js Memory Budget |
|------|---------|-----|-----|----------------------|
| Minimal | Raspberry Pi 4 4GB | 4GB | ARM Cortex-A72 | 512MB total |
| Standard | Intel N100 mini-PC | 8-16GB | 4-core x86 | 1-2GB total |
| Full | Contabo VPS | 8GB+ | 4+ vCPU | 2-4GB total |

**Current memory footprint estimates:**
- nexus-core: ~200-350MB (Node.js + LLM context + Redis connections)
- livinityd: ~150-250MB (Node.js + Docker SDK + file operations)
- nexus-memory: ~100-150MB (Node.js + PostgreSQL connection + embedding model)
- nexus-worker: ~100-150MB (Node.js + BullMQ)
- Total Node.js: ~550-900MB

**For Raspberry Pi 4 (4GB):** Viable if Redis (100MB) + PostgreSQL (200MB) are also on the same machine. Tight but workable.

**Optimization strategies:**

1. **Node.js heap limits:** Set `--max-old-space-size=512` for nexus-memory and nexus-worker (less memory-intensive). Set `--max-old-space-size=1024` for nexus-core.

2. **Defer embedding model loading:**
```typescript
// Load embedding model lazily (only when first memory query arrives)
let embeddingModel: EmbeddingModel | null = null;
async function getEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = await loadModel('all-MiniLM-L6-v2'); // 80MB
  }
  return embeddingModel;
}
```

3. **Process consolidation for Pi:**
On resource-constrained hardware, merge nexus-memory and nexus-worker into nexus-core as in-process modules rather than separate processes. The process boundary was an architectural choice, not a technical requirement.

4. **Docker container optimization:**
- Use Alpine-based images (`node:22-alpine`) for all services: 50-80MB vs 350MB for standard images
- Add `--memory-reservation=256m --memory=512m` to Docker Compose for each service
- Use `tmpfs` mounts for ephemeral data (logs, temp files) to reduce SD card wear on Pi

5. **SQLite for livinityd on Pi:**
If targeting Pi specifically, swap Redis for SQLite in livinityd (for config storage only). Redis would still be required for nexus, but livinityd could operate in "minimal mode" without Redis.

### 4.2 Frontend Bundle Size Optimization

**Current issue:** 1.3MB main chunk — this is a significant problem for first load over slow connections.

**Diagnosis approach (run immediately):**
```bash
cd livos/packages/ui
pnpm size  # vite-bundle-visualizer is already in package.json scripts
```

**Expected largest contributors based on package.json analysis:**
- `framer-motion` 10.16.4: ~150KB gzipped (old version — v10 is larger than v11)
- `motion` 12.35.0: ~60KB gzipped (duplication! both installed)
- `@xterm/xterm` 5.4.0: ~100KB (terminal emulator, rarely used)
- `photoswipe` 5.4.x: ~30KB (image gallery, used in file manager only)
- `lucide-react` 0.288.0 + `@tabler/icons-react` 3.36.1: ~100KB+ (both icon libraries!)

**Priority fixes:**

1. **Remove the `framer-motion` + `motion` duplication:**
   - `framer-motion` is version 10 (2022-era API)
   - `motion` is version 12 (new API, same library)
   - Choose one: migrate to `motion` v12 fully, remove `framer-motion` v10
   - This saves ~150KB gzipped

2. **Pick one icon library:**
   - Using both `lucide-react` and `@tabler/icons-react` is redundant
   - Tabler is the current direction (based on recent commits for file icons)
   - Migrate all lucide usages to Tabler equivalents, remove `lucide-react`
   - Savings: ~50-80KB gzipped

3. **Route-based code splitting (highest impact, 15 minutes of work):**
```typescript
// src/routes/router.tsx — lazy load all routes
const FilesRoute = lazy(() => import('./files/index'));
const AiChatRoute = lazy(() => import('./ai-chat/index'));
const SettingsRoute = lazy(() => import('./settings/index'));
const TerminalRoute = lazy(() => import('./terminal/index')); // xterm only in this chunk
```

4. **Defer xterm loading:**
   xterm (~100KB) should only load when Terminal window is opened. The route-based split handles this automatically if terminal is its own lazy route.

5. **Dynamic icon imports from Tabler:**
   The current approach copies ALL tabler icons to `public/generated-tabler-icons/`. Instead, use the React components which tree-shake properly:
```typescript
// BAD: imports entire library
import { IconFolder } from '@tabler/icons-react';

// GOOD: direct import for tree-shaking
import IconFolder from '@tabler/icons-react/dist/esm/icons/IconFolder';
```

**Expected results after optimization:** Main chunk should drop from 1.3MB to 400-600KB, with route chunks of 50-150KB each. Target first load under 300KB gzipped for the critical path.

### 4.3 SSR vs CSR for Home Server UIs

**Verdict: Stay with CSR (Vite + React). Do not add SSR.**

The case for SSR (Next.js, or Vite SSR) for a home server management UI is weak:

- **SEO is irrelevant** — the UI is behind auth, not indexed by search engines
- **Initial load performance matters less** than for public sites — users are on the local network or VPN; latency is 1-5ms, not 50-200ms
- **The UI is highly interactive** — dashboards, file managers, terminals, chat interfaces all need client-side JavaScript regardless of SSR
- **Next.js App Router adds significant complexity** — as noted in the project memory, the v4.0 Next.js rewrite was reverted for this reason

The value of SSR for LivOS specifically is minimal. Focus bundle optimization effort on code splitting (CSR improvement) not SSR migration.

**Exception:** If a marketing landing page or public docs site is built in the future, Next.js with SSR is appropriate for that. But that is a separate application from the LivOS management UI.

### 4.4 WebSocket vs SSE for Real-Time Updates

**Current architecture is correct. No changes needed.**

LivOS uses both appropriately:
- SSE: AI response streaming (`/api/agent/stream`) — correct, SSE is the 2025 standard for AI token streaming
- WebSocket (JSON-RPC 2.0): WsGateway for bidirectional control plane — correct when bidirectionality is needed

**2025 consensus:**
- SSE runs on port 80/443 with no special firewall rules — works everywhere HTTP works
- WebSocket has 3ms less latency than SSE but the difference is lost in overall latency
- SSE is having a "glorious comeback in 2025" driven by AI streaming use cases
- Use SSE when server-to-client push only; WebSocket only when client-to-server messages needed outside HTTP request

**Performance benchmarks (from research):**
- SSE: ~48,000 connections per Node.js process before degradation
- WebSocket: ~30,000 connections before degradation (more state per connection)

For LivOS (single-user, handful of concurrent connections), this distinction does not matter. The architecture is already optimal.

### 4.5 Docker Overlay Network Performance

**For single-server deployments, do not use overlay networks.** Overlay networks (Docker Swarm/Kubernetes) add 15-30ms overhead per hop versus bridge networks.

Use Docker bridge networks (`livos-{appid}`) as currently implemented. Each app gets its own bridge network, and services within the same app can communicate by service name. This has essentially zero overhead on a single host.

---

## 5. Security Architecture

### 5.1 Zero-Trust Networking

**Options compared:**

| Solution | Latency Added | Cost | Complexity | Best For |
|---------|--------------|------|------------|---------|
| Caddy (current) | 2-8ms | Free | Low | Already deployed, keep |
| Cloudflare Tunnel | 15-45ms | Free (Cloudflare account) | Low | Exposing to internet without port forwarding |
| Tailscale | 10-80ms | Free (personal) / $6/user/mo | Low | Private mesh VPN, no public exposure |
| Self-hosted VPN (WireGuard) | <5ms | Free | Medium | Full control, no third-party |
| Authentik | Minimal (SSO layer) | Free (self-hosted) | Medium | SSO for all Docker apps |

**Recommendation for LivOS:**

**Primary access:** Keep Caddy as reverse proxy (already deployed, battle-tested, auto-HTTPS).

**Remote access (new recommendation):** Add Tailscale integration as an optional service in the app store. Users who want to access LivOS remotely without port forwarding install Tailscale from the app store, and LivOS is available at `livos.tailscale-hostname.ts.net`. This avoids the 15-45ms Cloudflare latency hit for interactive users.

**SSO for Docker apps (new recommendation):** Add Authentik as a featured app in the store. Authentik deploys as a Docker app and proxies authentication for other installed apps. LivOS can auto-configure Authentik as a middleware in the Caddy config when apps are installed.

**Network isolation rules (enforce in app store):**
```yaml
# In all app compose manifests
networks:
  - livos-app-{id}  # App-specific network
# NOT:
#  - host          # Blocked
#  - livos-system  # Blocked (would expose Redis/Postgres)
```

### 5.2 OAuth2/OIDC for App Authentication

**Current state:** livinityd uses JWT authentication with a secret from `/data/secrets/jwt`. This is functional but creates friction for third-party app integration.

**Recommended upgrade path:**

**Phase 1 (near-term):** Add OAuth2 authorization code flow to livinityd for the public REST API. This allows third-party apps and CLI tools to authenticate without sharing the JWT secret.

```typescript
// livinityd: new endpoints for OAuth
GET  /oauth/authorize     - Authorization endpoint (redirect with code)
POST /oauth/token         - Token exchange endpoint
POST /oauth/revoke        - Token revocation
GET  /.well-known/openid-configuration  - OIDC discovery
```

**Phase 2 (long-term):** Position LivOS as an OIDC provider for all installed Docker apps. Apps can use "Login with LivOS" instead of their own user management. This is the Cosmos Server and Authentik model — one identity, many apps.

**Recommended library:** `oidc-provider` npm package (battle-tested, used by many self-hosted solutions). Configure it within livinityd.

### 5.3 Container Isolation Best Practices

Building on research findings about CVE-2025-9074 and Docker security:

1. **Never mount Docker socket in user apps:** `/var/run/docker.sock` grants container escape. Block this in the app manifest validator.

2. **Read-only root filesystem where possible:**
```yaml
services:
  app:
    read_only: true
    tmpfs:
      - /tmp
      - /var/run
```

3. **No-new-privileges:**
```yaml
security_opt:
  - no-new-privileges:true
```

4. **Drop capabilities:**
```yaml
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE  # only if needed
```

5. **App manifest validation:** The LivOS app installer should parse `docker-compose.yml` and warn/block dangerous configurations before installation.

### 5.4 Secrets Management

**Current approach:** JWT secret from filesystem (`/data/secrets/jwt`), other secrets via `.env` files, API keys in Redis. This is pragmatic and functional.

**Recommended improvement (near-term):**

For the LivOS app store, secrets per app should be stored in a structured way:
```
/opt/livos/data/apps/{app-id}/secrets/
  API_KEY         - plaintext file, mode 600, owned by livos user
  DB_PASSWORD     - same
```

**For the v3.0 public release:** Integrate Infisical (self-hosted, MIT license, PostgreSQL + Redis backend) as an optional secrets manager. Infisical provides:
- Web UI for secret management (no SSH required)
- Environment-aware secrets (dev/staging/prod)
- SDK for injecting secrets into app processes
- Audit log of all secret accesses

Infisical's self-hosting uses PostgreSQL + Redis — the same stack as LivOS — so it can share infrastructure.

**Simpler alternative:** `bitwarden/secrets-manager` (formerly Bitwarden SM) provides a free tier for self-hosted environments with CLI injection of secrets.

### 5.5 Backup and Restore Architecture

**Currently missing from LivOS.** This is a critical gap for production use.

**Recommended architecture:**

```typescript
// nexus/packages/core/src/backup/index.ts
class BackupManager {
  async createBackup(options: BackupOptions): Promise<BackupResult> {
    // 1. Snapshot Redis state
    await this.redis.bgsave();
    const rdbPath = await this.locateRdb();

    // 2. Dump PostgreSQL
    await execa('pg_dump', ['-Fc', '-f', '/tmp/backup-pg.dump', 'livinity']);

    // 3. Zip app data directories
    await tar.create({ gzip: true }, ['/opt/livos/data/apps']);

    // 4. Upload to destination (S3-compatible, local NAS, rsync)
    await this.destination.upload(backupBundle);

    return { size, timestamp, checksum };
  }

  async restore(backupId: string): Promise<void> {
    // Reverse: download, stop services, restore, restart
  }
}
```

**Backup destinations to support:**
- Local (another directory on the same server)
- S3-compatible (Backblaze B2, MinIO, AWS S3)
- SFTP/rsync (NAS, another server)

**Encryption:** Encrypt backups with `age` (a modern, simple encryption tool) before upload. User stores the age public key in LivOS settings; private key stays with user.

### 5.6 End-to-End Encryption for AI Conversations

**Current state:** AI conversations are stored in Redis (session history) and PostgreSQL (memory embeddings) in plaintext. On the LivOS server, all data is accessible to anyone with server access.

**Concern level for typical users:** Low. They own the server. The threat model is external attacker, not the server owner.

**For higher-security users:**

Option 1: **Conversation-level encryption:** Encrypt Redis conversation history with a user-derived key (PBKDF2 from password). Decrypt on read. This prevents database dumps from revealing conversation content but requires the decryption key to be available to the server process.

Option 2: **E2E with browser key management:** The encryption key lives only in the browser (localStorage, WebCrypto API). The server stores encrypted blobs. This is true E2E but makes server-side memory/RAG impossible (the server can't read what it needs to embed).

**Practical recommendation:** Given LivOS is a self-hosted server, conversation encryption is not the highest priority. Implement OS-level disk encryption (LUKS) documentation in the setup guide instead. This protects against physical hardware theft while keeping server-side AI functionality intact.

---

## 6. Mobile and Cross-Platform

### 6.1 PWA vs Native App

**Verdict: Build PWA first. React Native only if iOS push notification requirements force it.**

**PWA strengths for LivOS:**
- Zero app store friction (no Apple/Google approval)
- Single codebase with the existing React app
- Install from browser: "Add to Home Screen"
- Service workers enable offline capability (show cached dashboard without network)
- Push notifications work on Android and desktop Chrome/Firefox/Edge reliably
- iOS 16.4+ added PWA push notifications (but requires app to be installed, and no silent push)

**PWA limitations:**
- iOS push reliability is lower than Android
- No access to some native APIs (Bluetooth, NFC, background geolocation)
- iOS Safari caps PWA storage at 50MB (vs native app's unlimited)

**For LivOS's use case (home server management):**
- The primary need is checking server status, sending tasks to AI, and receiving alerts
- Native hardware access (camera, GPS) is not needed
- Push notification reliability issues on iOS are mitigated by the fact that most home server users are likely Android-dominant or desktop-first

**PWA implementation (what to add to existing Vite/React app):**
```typescript
// vite.config.ts — add PWA plugin
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'LivOS',
        short_name: 'LivOS',
        theme_color: '#ffffff',
        icons: [/* 192x192, 512x512 */],
      },
      workbox: {
        // Cache API responses for offline dashboard
        runtimeCaching: [{
          urlPattern: /\/trpc\/system\./,
          handler: 'NetworkFirst',
          options: { cacheName: 'system-cache', expiration: { maxAgeSeconds: 60 } }
        }]
      }
    })
  ]
});
```

**Push notifications via Web Push API:**
```typescript
// livinityd: web push endpoint
POST /api/push/subscribe   - save PushSubscription to database
POST /api/push/send        - send notification (internal, called by agent on events)
```

### 6.2 Responsive Design for Server Management

**Current gaps (from codebase analysis):** The windowed UI (desktop metaphor) does not translate well to mobile. Windows cannot be dragged on touch, and the grid layout is not touch-friendly.

**Strategy:** Progressive enhancement by viewport:
- Desktop (>1024px): Full windowed desktop experience (current)
- Tablet (768-1024px): Panel-based layout, windows maximized by default, no dragging
- Mobile (<768px): Full-screen app experience, tab-based navigation, no window chrome

Implementation using existing Tailwind breakpoints:
```typescript
// Detect mobile and disable windowing system
const isMobile = useMediaQuery('(max-width: 768px)');

// In window manager: if mobile, force maximize all windows
const windowStyle = isMobile
  ? { position: 'fixed', inset: 0 }
  : { position: 'absolute', left: x, top: y, width, height };
```

### 6.3 Offline-First Considerations

**What should work offline:**
- Cached dashboard with last-known server stats
- Browsing existing conversation history
- Reading saved memory items

**What cannot work offline:**
- Real-time server metrics (requires live connection)
- AI chat (requires API)
- Docker app management (requires server)

Use Service Worker with `NetworkFirst` strategy for dynamic data and `CacheFirst` for static assets. The Workbox library (included in vite-plugin-pwa) handles this configuration.

---

## 7. Developer Experience

### 7.1 CLI Tool Design

**Current state:** `livinity` CLI exists in the nexus/packages/cli directory. The vision (from ARCHITECTURE.md) is a unified onboarding and management CLI.

**2025 best practices for CLI UX:**
- `@inquirer/prompts` (replaces `inquirer` v9, ESM-native, better types)
- `chalk` v5 for colors
- `ora` for spinners
- `commander` for command parsing
- `execa` for shell execution

**Recommended CLI command structure:**
```
livinity                      - Interactive setup wizard (if not configured)
livinity status               - Show all service status
livinity logs [service]       - Stream logs
livinity restart [service]    - Restart a service
livinity backup               - Create a backup
livinity restore [backup-id]  - Restore from backup
livinity update               - Pull latest, rebuild, restart
livinity apps list            - List installed apps
livinity apps install <id>    - Install an app from store
livinity apps remove <id>     - Remove an app
livinity agent "task"         - Submit an agent task from CLI
livinity config set KEY VALUE - Set a configuration value
livinity config get KEY       - Get a configuration value
livinity ssh-key add          - Add SSH public key for access
```

### 7.2 API Documentation Strategy

**Recommended approach:** OpenAPI 3.1 spec generated from code, served as interactive Swagger UI.

```typescript
// Generate OpenAPI spec at build time using zod-to-openapi
import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

const registry = new OpenAPIRegistry();

// Register routes during app startup
registry.registerPath({
  method: 'post',
  path: '/api/v1/agent/tasks',
  summary: 'Submit an agent task',
  request: {
    body: { content: { 'application/json': { schema: TaskSubmitSchema } } }
  },
  responses: {
    200: { description: 'Task created', content: { 'application/json': { schema: TaskResponseSchema } } }
  }
});

// Serve at /api/v1/docs
app.get('/api/v1/openapi.json', (req, res) => {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  res.json(generator.generateDocument({ openapi: '3.1.0', info: { title: 'LivOS API', version: '1.0.0' } }));
});
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerUrl: '/api/v1/openapi.json' }));
```

### 7.3 SDK for Third-Party Integrations

**Recommended approach:** Auto-generate SDK from OpenAPI spec rather than hand-writing.

- Use `openapi-typescript-codegen` or `@hey-api/openapi-ts` to generate a TypeScript SDK
- Publish to npm as `@livinity/sdk`
- SDK consumers get full TypeScript types with zero manual work
- SDK stays in sync automatically when the OpenAPI spec is regenerated

**SDK usage example:**
```typescript
import { LivOSClient } from '@livinity/sdk';

const client = new LivOSClient({
  baseUrl: 'https://my-server.livinity.cloud',
  apiKey: 'lvos_key_...'
});

const task = await client.agent.submitTask({ task: 'restart nginx' });
const result = await client.agent.waitForTask(task.id);
```

### 7.4 Development Environment

**Current:** Run livos and nexus separately with individual npm/pnpm commands. Manual setup of PostgreSQL and Redis.

**Recommended devcontainer setup:**
```json
// .devcontainer/devcontainer.json
{
  "name": "LivOS Dev",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspace",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "22" }
  },
  "postCreateCommand": "pnpm install && npm install --prefix nexus",
  "forwardPorts": [3001, 3200, 3300, 5173]
}
```

```yaml
# .devcontainer/docker-compose.yml
services:
  app:
    image: mcr.microsoft.com/devcontainers/typescript-node:22
    volumes: [".:/workspace"]
    command: sleep infinity
  redis:
    image: valkey/valkey:8-alpine
    ports: ["6379:6379"]
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: livinity
    ports: ["5432:5432"]
```

This enables GitHub Codespaces support and makes local setup for contributors trivial.

### 7.5 Testing Strategy

**Current state:** Vitest configured in livinityd with unit and integration test scripts. No visible E2E tests.

**Recommended testing pyramid:**

| Level | Framework | Scope | Priority |
|-------|-----------|-------|---------|
| Unit | Vitest | Pure functions, utility modules | High |
| Integration | Vitest + test containers | Redis/Postgres interactions | High |
| API | Supertest (existing pattern) | HTTP routes, tRPC endpoints | Medium |
| E2E | Playwright | Critical user flows (login, agent task, app install) | Medium |
| Agent behavior | Custom evals (Mastra Scorer pattern) | AI response quality | Low (emerging) |

**Playwright is already listed in the UI package.json scripts** (`"playwright": "playwright test"`). The E2E infrastructure exists — write the tests.

**Critical paths to E2E test:**
1. Login flow
2. Submit agent task and receive response
3. Install Docker app from store
4. File upload and download
5. Settings save and persist

**Agent evaluation (long-term):**
The Mastra Scorer API (August 2025) and RAGAS framework provide patterns for automated evaluation of agent response quality. Implement a nightly eval run against a fixed set of test tasks with known expected behaviors.

---

## 8. Implementation Priority Matrix

### Immediate (Next 2-3 Sprints)

| Item | Effort | Impact | Category |
|------|--------|--------|---------|
| Bundle optimization (remove framer-motion duplication, pick one icon library) | S | High | Performance |
| Route-based code splitting (lazy load all routes) | S | High | Performance |
| Valkey in Docker Compose (drop-in Redis replacement) | XS | Medium | Infrastructure |
| OpenAPI spec generation for `/api/v1/*` | M | High | DX |
| manifest.json for skill system | S | Medium | Plugin System |
| Devcontainer setup | S | Medium | DX |
| Node.js memory limits in PM2 ecosystem file | XS | Medium | Performance |

### Near-Term (1-3 Months)

| Item | Effort | Impact | Category |
|------|--------|--------|---------|
| Ollama provider integration (OpenAI-compatible API) | M | High | AI |
| PWA manifest + service worker via vite-plugin-pwa | M | High | Mobile |
| Web Push notification infrastructure | M | High | Mobile |
| Redis Streams for agent action audit log | S | Medium | Architecture |
| Plugin permission system (manifest-declared Redis scopes) | M | Medium | Security |
| Public REST API layer (`/api/v1/*`) | L | High | DX |
| Docker app manifest validation (security checks) | M | High | Security |
| Backup/restore infrastructure | L | High | Reliability |
| OAuth2 flow for livinityd | L | Medium | Security |

### Long-Term (3-12 Months)

| Item | Effort | Impact | Category |
|------|--------|--------|---------|
| Voice pipeline (VoiceGateway + Deepgram + Cartesia) | XL | High | AI |
| Mastra-style agent evals framework | L | Medium | AI Quality |
| Multi-model routing with Ollama + Claude + OpenAI | L | High | AI |
| Worker_threads sandboxing for third-party skills | L | Medium | Security |
| Authentik integration as optional SSO app | M | Medium | Security |
| Infisical integration for secrets management | M | Medium | Security |
| React Native app (only if iOS push is critical) | XL | Medium | Mobile |
| LivOS as OIDC provider for Docker apps | XL | High | Security/DX |
| SDK auto-generation and npm publish | M | High | DX |

---

## 9. Synthesis and Strategic Recommendations

### What the Research Confirms About LivOS's Current Choices

1. **tRPC is the right choice** — 2026 analysis confirms tRPC is optimal for TypeScript monorepos with a single frontend client. No migration needed.

2. **The modular multi-process architecture is correct** — The research confirms that for a small team and single-server deployment, the modular monolith pattern (not microservices) is the 2025-2026 industry recommendation.

3. **Claude Agent SDK is the right foundation** — The SDK powers Claude Code and has been hardened at scale. The dontAsk permission mode and built-in context compaction are features that would take significant effort to replicate correctly.

4. **Redis is necessary and correct** — BullMQ requires Redis. No credible alternative exists for the job queue use case. Valkey is a viable drop-in replacement.

5. **CSR + Vite is the right choice** — SSR adds complexity with minimal benefit for an authenticated home server management UI.

### What the Research Identifies as Critical Gaps

1. **No backup/restore system** — The single most dangerous gap. A power failure or corruption event would cause catastrophic data loss. This is priority zero for production viability.

2. **No Ollama/local model support** — Users on restricted budgets or offline environments cannot use LivOS's AI features. Ollama integration is the highest-leverage AI improvement.

3. **Bundle size (1.3MB main chunk)** — Unacceptable for a tool targeting diverse hardware. Route splitting + removing duplicate libraries is a quick win.

4. **No PWA** — The mobile experience is the weakest gap in the product surface. Adding a PWA manifest + vite-plugin-pwa is a one-day task that dramatically improves the mobile story.

5. **No public API** — Makes third-party integrations impossible. The OpenAPI layer is essential for the developer community the project needs to grow.

### Technology Version Pinning Recommendations

| Technology | Current | Recommended | Action |
|-----------|---------|-------------|--------|
| framer-motion | 10.16.4 | Remove | Migrate to `motion` v12 |
| motion | 12.35.0 | 12.x (latest) | Keep, consolidate |
| lucide-react | 0.288.0 | Remove | Migrate to Tabler |
| @tabler/icons-react | 3.36.1 | 3.x (latest) | Keep |
| Valkey (Redis) | Redis 7.x | Valkey 8.x | Upgrade in Docker |
| Node.js | 22.x | 22.x LTS | Keep |
| TypeScript | 5.7-5.8 | 5.8.x | Keep |
| tRPC | 11.1.1 | 11.x latest | Keep |
| @anthropic-ai/claude-agent-sdk | 0.2.0 | Latest | Track actively |

---

## 10. Citations

[1] IceWhale Technology. "CasaOS / ZimaOS Architecture." openalternative.co, 2025-2026. https://openalternative.co/casaos

[2] Virtualization Howto. "I Tested Cosmos Server: Is This the Best Home Server OS Yet?" virtualizationhowto.com, January 2026. https://www.virtualizationhowto.com/2026/01/i-tested-cosmos-server-is-this-the-best-home-server-os-yet/

[3] Pockit Tools. "REST vs GraphQL vs tRPC vs gRPC in 2026: The Definitive Guide." DEV Community, 2026. https://dev.to/pockit_tools/rest-vs-graphql-vs-trpc-vs-grpc-in-2026-the-definitive-guide-to-choosing-your-api-layer-1j8m

[4] DataFormatHub. "REST vs GraphQL vs tRPC: The Ultimate API Design Guide for 2026." DEV Community, 2026. https://dev.to/dataformathub/rest-vs-graphql-vs-trpc-the-ultimate-api-design-guide-for-2026-8n3

[5] WunderGraph. "When to use GraphQL vs Federation vs tRPC vs REST vs gRPC vs AsyncAPI vs WebHooks." wundergraph.com, 2024. https://wundergraph.com/blog/graphql-vs-federation-vs-trpc-vs-rest-vs-grpc-vs-asyncapi-vs-webhooks

[6] CData. "MCP Server Best Practices for 2026." cdata.com, 2026. https://www.cdata.com/blog/mcp-server-best-practices-2026

[7] MCP Manager. "MCP Adoption Statistics 2025." mcpmanager.ai, 2025. https://mcpmanager.ai/blog/mcp-adoption-statistics/

[8] Astrix Security. "State of MCP Server Security 2025: Research Report." astrix.security, 2025. https://astrix.security/learn/blog/state-of-mcp-server-security-2025/

[9] Arsum. "AI Agent Frameworks Compared (2026): LangChain, CrewAI, AutoGen, MetaGPT, OpenDevin + 6 More." arsum.com, 2026. https://arsum.com/blog/posts/ai-agent-frameworks/

[10] OpenAgents. "CrewAI vs LangGraph vs AutoGen vs OpenAgents (2026)." openagents.org, February 2026. https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared

[11] The New Stack. "Mastra empowers web devs to build AI agents in TypeScript." thenewstack.io, 2025. https://thenewstack.io/mastra-empowers-web-devs-to-build-ai-agents-in-typescript/

[12] Mastra. "The TypeScript AI Framework." mastra.ai, 2025. https://mastra.ai/

[13] Cloudx Dev. "Cracking the <1-second Voice Loop: What We Learned After 30+ Stack Benchmarks." DEV Community, 2025. https://dev.to/cloudx/cracking-the-1-second-voice-loop-what-we-learned-after-30-stack-benchmarks-427

[14] Introl. "Voice AI Infrastructure: Building Real-Time Speech Agents." introl.com, 2025. https://introl.com/blog/voice-ai-infrastructure-real-time-speech-agents-asr-tts-guide-2025

[15] Deepgram. "Inside Deepgram's Voice Agent API: Real-Time STT, TTS, and Orchestration in One API." deepgram.com, 2025. https://deepgram.com/learn/voice-agent-api-generally-available

[16] Progressier. "PWA vs Native App — 2026 Comparison Table." progressier.com, 2026. https://progressier.com/pwa-vs-native-app-comparison-table

[17] Airbyte. "SQLite vs PostgreSQL: Key Differences." airbyte.com, 2025. https://airbyte.com/data-engineering-resources/sqlite-vs-postgresql

[18] Markaicode. "SQLite 4.0 as a Production Database: 2025 Benchmarks and Pitfalls." markaicode.com, 2025. https://markaicode.com/sqlite-4-production-database-benchmarks-pitfalls/

[19] Mykola Aleksandrov. "Taming 'Large Chunks' in Vite + React: Why It Happens and How I Shrunk My Main Bundle." mykolaaleksandrov.dev, November 2025. https://www.mykolaaleksandrov.dev/posts/2025/11/taming-large-chunks-vite-react/

[20] PortalZINE. "SSE's Glorious Comeback: Why 2025 is the Year of Server-Sent Events." portalzine.de, 2025. https://portalzine.de/sses-glorious-comeback-why-2025-is-the-year-of-server-sent-events/

[21] Dale John Dunlop. "Building a Zero Trust Home Server with Raspberry Pi, Cloudflare, and Tailscale." dalejohndunlop.com, 2025. https://dalejohndunlop.com/blog/zero-trust-raspberry-pi-home-server

[22] Onidel. "Tailscale Funnel vs Cloudflare Tunnel vs Nginx Reverse Proxy." onidel.com, 2025. https://onidel.com/blog/tailscale-cloudflare-nginx-vps-2025

[23] Anthropic. "Building agents with the Claude Agent SDK." anthropic.com, 2025. https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk

[24] Ksred. "Claude Agent SDK: Subagents, Sessions and Why It's Worth It." ksred.com, 2025. https://www.ksred.com/the-claude-agent-sdk-what-it-is-and-why-its-worth-understanding/

[25] Infisical. "Self-Hosting Infisical: A Guide to Securing Your Homelab." infisical.com, 2025. https://infisical.com/blog/self-hosting-infisical-homelab

[26] Onidel. "Redis vs Valkey vs KeyDB on VPS in 2025." onidel.com, 2025. https://onidel.com/blog/redis-valkey-keydb-vps-2025

[27] OctaByte. "Redis vs Valkey vs KeyDB: Choosing the Best In-Memory Database." blog.octabyte.io, 2025. https://blog.octabyte.io/topics/open-source-databases/redis-vs-valkey-vs-keydb/

[28] Jimmy Song. "n8n Deep Dive (2026): Architecture, Plugin System, and Enterprise Automation." jimmysong.io, 2026. https://jimmysong.io/blog/n8n-deep-dive/

[29] Docker. "Docker Sandboxes: Run Claude Code and More Safely." docker.com, 2025. https://www.docker.com/blog/docker-sandboxes-run-claude-code-and-other-coding-agents-unsupervised-but-safely/

[30] Palo Alto Networks Unit 42. "Making Containers More Isolated: An Overview of Sandboxed Container Technologies." unit42.paloaltonetworks.com, 2025. https://unit42.paloaltonetworks.com/making-containers-more-isolated-an-overview-of-sandboxed-container-technologies/

[31] Anthropic. "Agent SDK overview." platform.claude.com, 2025. https://platform.claude.com/docs/en/agent-sdk/overview

[32] Authentik. "Self-Hosted Identity Provider with SSO, MFA, and LDAP." cloudingenium.com, 2025. https://kx.cloudingenium.com/authentik-self-hosted-identity-provider-sso-mfa-ldap/

[33] Java Code Geeks. "Microservices vs. Modular Monoliths in 2025: When Each Approach Wins." javacodegeeks.com, December 2025. https://www.javacodegeeks.com/2025/12/microservices-vs-modular-monoliths-in-2025-when-each-approach-wins.html

[34] DEV Community. "Retrieval-Augmented Generation (RAG) with Vector Databases: Powering Context-Aware AI in 2025." dev.to, 2025. https://dev.to/nikhilwagh/retrieval-augmented-generation-rag-with-vector-databases-powering-context-aware-ai-in-2025-4930

[35] DEV Community. "Beyond RAG: Building Intelligent Memory Systems for AI Agents." dev.to, 2025. https://dev.to/matteo_tuzi_db01db7df0671/beyond-rag-building-intelligent-memory-systems-for-ai-agents-3kah

[36] Softcery. "How to Choose STT and TTS for Voice Agents: OpenAI, Deepgram, ElevenLabs, and 10 More Compared." softcery.com, 2025. https://softcery.com/lab/how-to-choose-stt-tts-for-ai-voice-agents-in-2025-a-comprehensive-guide

[37] Harness. "Event-Driven Architecture Using Redis Streams." harness.io, 2025. https://www.harness.io/blog/event-driven-architecture-redis-streams

[38] Ollama. "Claude Code integration." docs.ollama.com, 2025. https://docs.ollama.com/integrations/claude-code

[39] Home Assistant. "Architecture overview." developers.home-assistant.io, 2025. https://developers.home-assistant.io/docs/architecture_index/

[40] Model Context Protocol. "Roadmap." modelcontextprotocol.io, 2025. https://modelcontextprotocol.io/development/roadmap
