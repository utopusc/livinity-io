# Phase 57: A1+A2 Passthrough Mode + Agent Mode Opt-In - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous); Phase 56 spike DEFERRED — research absorbed inline by Phase 57 planner

<domain>
## Phase Boundary

Phase 57 implements the broker's **dual-mode dispatch**:

- **Passthrough mode (DEFAULT):** External clients hitting `/v1/messages` and `/v1/chat/completions` are forwarded directly to the upstream Anthropic API with their `system` prompt verbatim and their `tools[]` honored. NO Nexus identity injection, NO Nexus MCP tools.
- **Agent mode (OPT-IN):** Header-gated (`X-Livinity-Mode: agent`) — keeps the existing Agent-SDK-tooled behavior byte-identical for LivOS in-app chat.

What's IN scope for Phase 57:
- New `livinity-broker/passthrough-router.ts` (or routing branch in existing `router.ts`) that bypasses nexus `/api/agent/stream` for external requests.
- Mode dispatcher reading `X-Livinity-Mode` header — agent mode → existing Strategy B; passthrough mode → direct Anthropic API call.
- Per-user subscription auth flow for passthrough (reads `~/.claude/<userId>/.credentials.json` OR uses `homeOverride` pattern from Phase 40 — implementation choice during planning, informed by inline research).
- Forwarding client `tools[]` verbatim in passthrough mode (reverses D-42-12 warn-and-ignore for the passthrough branch only; agent mode keeps current behavior).
- Removing Nexus identity injection from passthrough path (no `sdk-agent-runner.ts` edit — passthrough doesn't go through it).

What's OUT of scope (deferred to later phases):
- True token streaming (Phase 58 — Phase 57 may emit aggregate-then-restream as transitional, OR pass through native Anthropic SSE if SDK-direct path).
- Bearer token auth (Phase 59 — Phase 57 keeps existing per-user URL-path identity for now).
- Public `api.livinity.io` endpoint (Phase 60 — Phase 57 only updates internal broker).
- Rate-limit headers (Phase 61).

</domain>

<decisions>
## Implementation Decisions

### Phase 56 Spike Status — DEFERRED

The Phase 56 research spike was scaffolded (CONTEXT.md, RESEARCH.md, 4 PLANs in `.planning/phases/56-research-spike/`) but **NOT executed**. User explicitly chose `/gsd-autonomous --from 57` to skip Phase 56 execution and proceed with Phase 57 planning.

**Implication for Phase 57 planner:** The 7 architectural questions Phase 56 was supposed to answer must be **resolved during Phase 57's planning** by the gsd-phase-researcher agent. Specifically:

1. **Q1 — Anthropic SDK direct vs HTTP proxy** → Phase 57 planner researches inline. Uses Phase 56's RESEARCH.md as the source URL inventory + decision framework. Picks ONE candidate during planning, documents in PLAN.md `<decisions>` block.
2. **Q2 — Tools forwarding** → Phase 57 plans MUST forward client tools (per FR-BROKER-A1-01). Researcher verifies the chosen passthrough mechanism (SDK-direct OR HTTP-proxy) supports tools forwarding without modification.
3. **Q3 — Agent mode opt-in mechanism** → Phase 57 plans default to **header-based** (`X-Livinity-Mode: agent`) per CONTEXT.md guidance below. URL-path alternative (`/u/<id>/agent/v1/...`) is the fallback if header conflicts surface during planning.
4. **Q7 — Block-level streaming for Agent mode** → Phase 57 confirms Agent mode keeps current behavior (sacred file untouched, aggregation preserved). Passthrough mode emits whatever the upstream provides (Phase 58 ensures it's true token streaming).

The remaining Phase 56 questions (Q4 public endpoint, Q5 key rotation, Q6 rate-limit) are NOT blocking for Phase 57 — they belong to Phases 60, 59, 61 respectively and will be researched there.

### Mode Dispatch — Default Header-Based Opt-In

- **Header:** `X-Livinity-Mode: agent` (case-insensitive). Default behavior (header absent OR any other value): **passthrough mode**.
- **Why header over URL path:**
  - URL path (`/u/<id>/agent/v1/...`) requires every Nexus chat client (livinityd's in-app chat, broker integration tests, future internal callers) to update their endpoint URL — high blast radius, cross-cuts existing v29.x code.
  - Header is additive: existing callers default to passthrough only if they DON'T already send `X-Livinity-Mode`. To preserve LivOS in-app chat (FR-BROKER-A2-02 byte-identical behavior), the in-app chat client MUST add `X-Livinity-Mode: agent` to its requests.
- **Migration order:** First land header-detection in broker (passthrough remains gated until in-app chat is updated). Then update in-app chat to set the agent header. Then remove the gating to make passthrough the default. Wave structure in PLAN.md should reflect this.

### Sacred File Boundary — UNTOUCHED

- `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` MUST be byte-identical at end of Phase 57.
- `sdk-agent-runner-integrity.test.ts` BASELINE_SHA constant unchanged.
- Passthrough mode does NOT call `SdkAgentRunner`. Agent mode keeps current Strategy B HTTP proxy to nexus `/api/agent/stream` (which uses sacred file unchanged).
- Every PLAN.md task that reads sacred file MUST have acceptance criterion: "no Edit/Write tool calls were made to `nexus/packages/core/src/sdk-agent-runner.ts`; `git hash-object` matches `4f868d31...`".

### Anthropic SDK Already Available — Reuse

- `@anthropic-ai/sdk@^0.80.0` is already a dep of `nexus/packages/core/package.json` (per Phase 56 RESEARCH.md). D-NO-NEW-DEPS verdict: **OK to reuse from broker** — broker can `import { Anthropic } from '@anthropic-ai/sdk'` if planner picks SDK-direct candidate for Q1.
- Distinct from `@anthropic-ai/claude-agent-sdk@^0.2.84` (the package the sacred file uses for agent mode). Two different packages. Phase 57 only adds passthrough usage of the FIRST; sacred file's relationship to the SECOND is unchanged.

### Existing Broker Code — Extension, Not Replacement

- Phase 57 extends `livinity-broker/router.ts` and `livinity-broker/openai-router.ts` — does NOT replace them.
- Existing v29.3 Strategy B (HTTP proxy to nexus `/api/agent/stream`) becomes the **agent-mode branch**. New passthrough-mode branch added alongside.
- `livinity-broker/openai-sse-adapter.ts` exists but Phase 58 rewrites it for true streaming. Phase 57 may emit aggregate chunks via existing adapter as transitional.

### Auth Surface — Unchanged in Phase 57

- Phase 57 does NOT change auth model. Existing per-user URL-path identity (`/u/:userId/v1/...`) + container IP guard remain.
- Bearer token auth (`liv_sk_*`) is Phase 59. Public endpoint is Phase 60.
- For passthrough subscription auth: planner picks between (a) reading `~/.claude/<userId>/.credentials.json` and forwarding `Authorization: Bearer <subscription_token>` to api.anthropic.com, OR (b) using SDK with `homeOverride` pattern (Phase 40) so SDK reads credentials from the per-user dir. Planner researches which works.

### Claude's Discretion

- Exact file structure inside `livinity-broker/` for the new passthrough router (single file vs multiple files).
- Whether to use single `dispatch.ts` or branching in existing routers — choose what minimizes diff.
- Test structure for passthrough mode — unit tests for header detection logic + integration tests for end-to-end forward (with mocked Anthropic API).
- Logging format for passthrough requests (planner picks).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livinity-broker/router.ts` — existing Anthropic Messages broker, Strategy B HTTP proxy. Phase 57 adds mode dispatch at request entry.
- `livinity-broker/openai-router.ts:110-124` — D-42-12 warn-and-ignore client `tools[]` site. Passthrough branch flips to forward.
- `livinity-broker/openai-sse-adapter.ts` — existing OpenAI SSE adapter (rewritten in Phase 58). Phase 57 may use as-is for transitional aggregate chunks.
- `livinity-broker/agent-runner-factory.ts:64-173` — existing fetch() + UpstreamHttpError + Retry-After capture pattern. Reusable structure for the passthrough fetch to api.anthropic.com.
- `nexus/packages/core/src/providers/claude.ts` — existing Claude provider with `@anthropic-ai/sdk` import. Reference for: how SDK is initialized, subscription auth flow.
- `@anthropic-ai/sdk@^0.80.0` (nexus dep) — usable from broker if SDK-direct path is chosen.
- Phase 40 `homeOverride` pattern — per-user `~/.claude/<userId>/` synthetic dirs. Already wired in nexus; broker may reuse via env var injection or SDK config.

### Established Patterns
- HTTP-proxy strategy (Phase 41) — fetch() with header forwarding + error mapping. Passthrough mode uses same pattern but target is `api.anthropic.com` instead of `localhost:3200`.
- v29.3 Phase 42 OpenAI translation — synchronous Anthropic→OpenAI shape mapping. Phase 57 reuses for sync (non-streaming) responses; Phase 58 extends to streaming.
- v29.4 Phase 45 — broker 429 + Retry-After preservation. Phase 57 inherits via reused HTTP-proxy structure.
- `broker_usage` middleware (Phase 44) — mounted BEFORE broker on `/u/:userId/v1`. Continues to capture usage for both modes; Phase 62 enhances.

### Integration Points
- `livinity-broker/router.ts` request entry — mode dispatcher reads `X-Livinity-Mode` header here, branches to agent OR passthrough handler.
- `livinity-broker/openai-router.ts:110-124` — flip warn-and-ignore to forward in passthrough branch only; agent branch keeps D-42-12.
- `livos/packages/livinityd/source/server/index.ts` — Express middleware mount (broker_usage capture, etc.). Phase 57 doesn't touch the mount order.
- LivOS in-app chat client (likely under `livos/packages/ui/source/...` — planner researches exact path) — must add `X-Livinity-Mode: agent` header to its requests post-Phase 57.

</code_context>

<specifics>
## Specific Ideas

- **Bolt.diy live test (validation in Phase 63):** Configure Bolt.diy with system prompt "You are Bolt, a developer-focused assistant", ask "Who are you?". Response MUST self-identify as Bolt — proves passthrough preserves system prompt + removes Nexus identity injection.
- **Tools forward verification:** A request with `tools: [...]` from passthrough mode produces a response that invokes ONLY the client-supplied tools (no Nexus MCP tool invocations like `shell` or `files_read`).
- **Agent mode preservation:** LivOS in-app chat invokes capability discovery, tool execution, IntentRouter, conversation persistence — ALL must work byte-for-byte identical to v29.5 post-Phase 57. Concrete check: re-run any v29.x integration test that exercised in-app chat flows; should pass unchanged.
- **Sacred file integrity:** Final commit of Phase 57 must show `git diff 4f868d31...HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` empty. Test `sdk-agent-runner-integrity.test.ts` passes with `BASELINE_SHA = "4f868d31..."`.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 56 spike full execution** — its 4 PLAN.md files remain in `.planning/phases/56-research-spike/`. If the user chooses to execute Phase 56 later, it will produce SPIKE-FINDINGS.md retrospectively documenting the architectural decisions Phase 57 made inline.
- **True token streaming** — Phase 58. Phase 57 may emit aggregate chunks as transitional.
- **Bearer token auth** — Phase 59.
- **Public api.livinity.io endpoint** — Phase 60.
- **Rate-limit headers** — Phase 61.
- **Per-API-key usage tracking** — Phase 62.

</deferred>
