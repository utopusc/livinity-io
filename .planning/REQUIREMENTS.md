# Milestone v29.3 Requirements — Marketplace AI Broker (Subscription-Only)

**Goal:** Marketplace AI uygulamaları kullanıcının mevcut Claude OAuth subscription'ını kullanarak, BYOK/API key olmadan, ToS-uyumlu per-user multi-user desteğiyle Claude'a erişebilsin. Mevcut çalışan `SdkAgentRunner` akışı bozulmadan.

**Locked decisions** (PROJECT.md'den miras — discuss-phase'de revize edilemez):
- D-TOS-01: Tek admin aboneliği fan-out YASAK
- D-TOS-02: Broker raw HTTP forward yapmayacak — daima Agent SDK `query()` üzerinden
- D-RISK-01: claude.ts OAuth fallback Phase 39'da SİLİNECEK (refactor değil)
- D-NO-BYOK: BYOK/API key path yok — sadece subscription
- D-CONTAINER-01: Marketplace app'leri Docker container'larda; broker hostname `livinity-broker` internal DNS
- D-NO-SERVER4: Server4 OFF-LIMITS

**Sacred:** `nexus/packages/core/src/sdk-agent-runner.ts` — yapısal değişiklik yapılmayacak. Broker dışarıdan çağıracak.

---

## v29.3 Requirements

### Risk Fix (FR-RISK)

- [ ] **FR-RISK-01**: User confirms `claude.ts:99-115` OAuth-fallback-with-raw-SDK code path is removed. After Phase 39, `ClaudeProvider.getClient()` either (a) returns API-key-based client only when API key is explicitly set in Redis, or (b) throws if subscription token would be the only auth source. Subscription tokens never reach raw `@anthropic-ai/sdk`. Verified by grep: zero `authToken: token` constructions referencing `claudeAiOauth`.

### Per-User OAuth Isolation (FR-AUTH)

- [ ] **FR-AUTH-01**: User in multi-user mode can run `claude login` independently from other users. Each user's `~/.claude/.credentials.json` lives in their own user HOME. Cross-user credential read attempts fail with permission denied.
- [ ] **FR-AUTH-02**: User sees a "Connect my Claude account" button in Settings > AI Integrations (per-user). Login status (connected / not-connected / token-expired) is visible per user.
- [ ] **FR-AUTH-03**: When SdkAgentRunner spawns the `claude` CLI subprocess for a user request, the subprocess `HOME` env var is set to that user's home directory. Cross-user OAuth credential leak is impossible.

### Anthropic-format Broker (FR-BROKER-A)

- [ ] **FR-BROKER-A-01**: Marketplace app can `POST /v1/messages` to `http://livinity-broker:<port>` with Anthropic Messages API format and receive a valid response. Endpoint reachable from container network.
- [ ] **FR-BROKER-A-02**: Same endpoint streams responses (SSE) with Anthropic Messages streaming schema. Streaming chunks observable end-to-end.
- [ ] **FR-BROKER-A-03**: Broker translates incoming Anthropic Messages format request into `SdkAgentRunner.run()` invocation (Agent SDK `prompt` + `options`). Translation handles multi-turn message history, system prompts, and tool definitions.
- [ ] **FR-BROKER-A-04**: Broker resolves the calling container's owner user_id (via existing app gateway middleware pattern from `livos/packages/livinityd/source/server/index.ts`) and spawns SdkAgentRunner with that user's HOME. Cross-user request cannot use another user's subscription.

### OpenAI-compat Broker (FR-BROKER-O)

- [ ] **FR-BROKER-O-01**: Marketplace app can `POST /v1/chat/completions` with OpenAI Chat Completions format and receive a valid response. Endpoint reachable from container network.
- [ ] **FR-BROKER-O-02**: Broker translates OpenAI ↔ Anthropic format bidirectionally: message history (role mapping), tool calls (function call format), streaming (chunk schema). Implementation strategy (sidecar LiteLLM container vs in-process translation) deferred to Phase 42 discuss-phase.
- [ ] **FR-BROKER-O-03**: Model name in OpenAI request (e.g., `gpt-4`, `claude-sonnet-4-6`) is mapped to a single Anthropic model (`claude-sonnet-4-6` default; configurable per LivOS deployment). Unknown models fall through to default with logged warning.
- [ ] **FR-BROKER-O-04**: Output format (chat completion vs streaming chunks) matches OpenAI spec exactly — verified by feeding response into the official `openai` Python SDK as a smoke test.

### Marketplace Integration (FR-MARKET) — Anchor: MiroFish

- [ ] **FR-MARKET-01**: Marketplace app manifest supports `requires_ai_provider: true` flag. When true, the app install pipeline auto-injects `ANTHROPIC_BASE_URL`, `ANTHROPIC_REVERSE_PROXY`, `LLM_BASE_URL` env vars pointing to `http://livinity-broker:<port>` into the per-user compose file. No user action required.
- [ ] **FR-MARKET-02**: User can install MiroFish from marketplace, the app starts with broker env vars wired automatically, and the user can chat with MiroFish using their Claude subscription end-to-end. Verified: zero BYOK prompt to user, broker sees the request, response shown in MiroFish UI.

### Per-User Usage Dashboard (FR-DASH)

- [ ] **FR-DASH-01**: User sees per-user usage stats in Settings > AI Integrations: cumulative input + output tokens, request count by app, current month total. Data persisted (PostgreSQL table; broker writes a row per request from Anthropic Messages API `usage` object).
- [ ] **FR-DASH-02**: Admin sees per-app usage stats: which user, which model, request count, token total. Multi-user filterable view.
- [ ] **FR-DASH-03**: User sees subscription rate limit visibility (Pro 200/day; Max 5x). When user is within 80% of daily limit, a non-blocking warning banner appears in AI Integrations panel. When 100% reached, broker returns HTTP 429 with retry-after; UI surfaces this.

---

## Future Requirements (Deferred to later milestones)

- **FR-MARKET-future-01** — Dify marketplace app integration (admin UI base_url override + container start automation). Defer until Dify becomes priority anchor.
- **FR-MARKET-future-02** — RAGFlow marketplace app integration. Same pattern as Dify.
- **FR-MARKET-future-03** — CrewAI agent template (not a marketplace app; would need to author a CrewAI template that auto-uses broker). Defer until template authoring becomes scope.
- **FR-DASH-future-01** — Cost forecasting (predict end-of-month usage based on current trajectory).
- **FR-OBS-future-01** — Per-request audit trail (full message logging) for compliance — currently only token counts are stored.

---

## Out of Scope (Explicit exclusions with reasoning)

- **Single-subscription fan-out (admin opt-in)** — Anthropic ToS yasağı (Nisan 2026 OpenClaw banı). D-TOS-01 LOCKED. Per-user OAuth tek meşru pattern.
- **BYOK / per-app API key** — User explicitly chose subscription-only path 2026-04-29. D-NO-BYOK LOCKED. No `byok` mode flag, no API key fallback.
- **Non-Anthropic LLM forwarding** — Broker sadece Claude'a forward eder. OpenAI-compat endpoint marketplace app uyumluluğu içindir; çıkışta Claude'a gider. OpenAI-API-real-OpenAI provider deferred to a future milestone (no current need).
- **Anthropic enterprise partnership / Bedrock / Vertex routing** — Sales conversation, not engineering. Defer indefinitely.
- **Modifying `SdkAgentRunner` internals** — Sacred. Broker wraps externally; runner behavior preserved.
- **Per-conversation provider switching in marketplace apps** — Apps use broker as their single provider. Switching happens at LivOS level, not per-app.
- **MiroFish UI customization in v29.3** — App is consumed as-is; we provide broker, not UI changes inside the marketplace container.
- **Server4 deployment of broker** — D-NO-SERVER4 LOCKED. Mini PC only.
- **Lu invite bug** — Pre-existing multi-user bug, separate fix. Not in v29.3 scope.
- **v29.2 Phase 38 manual UI verification** — Tech debt from previous milestone.
- **v30.0 Backup unfreeze** — After v29.3 ships.

---

## Traceability

Phase ↔ requirement mapping (filled by `/gsd-roadmapper` 2026-04-29). Every v1 requirement maps to exactly one phase. Coverage = 17 / 17.

| Requirement | Phase | Category | Status |
|-------------|-------|----------|--------|
| FR-RISK-01 | Phase 39 | Risk Fix | Pending |
| FR-AUTH-01 | Phase 40 | Per-User OAuth | Pending |
| FR-AUTH-02 | Phase 40 | Per-User OAuth | Pending |
| FR-AUTH-03 | Phase 40 | Per-User OAuth | Pending |
| FR-BROKER-A-01 | Phase 41 | Anthropic Broker | Pending |
| FR-BROKER-A-02 | Phase 41 | Anthropic Broker | Pending |
| FR-BROKER-A-03 | Phase 41 | Anthropic Broker | Pending |
| FR-BROKER-A-04 | Phase 41 | Anthropic Broker | Pending |
| FR-BROKER-O-01 | Phase 42 | OpenAI Broker | Pending |
| FR-BROKER-O-02 | Phase 42 | OpenAI Broker | Pending |
| FR-BROKER-O-03 | Phase 42 | OpenAI Broker | Pending |
| FR-BROKER-O-04 | Phase 42 | OpenAI Broker | Pending |
| FR-MARKET-01 | Phase 43 | Marketplace | Pending |
| FR-MARKET-02 | Phase 43 | Marketplace | Pending |
| FR-DASH-01 | Phase 44 | Dashboard | Pending |
| FR-DASH-02 | Phase 44 | Dashboard | Pending |
| FR-DASH-03 | Phase 44 | Dashboard | Pending |

**Mapped:** 17 / 17
**Orphans:** 0
**Duplicates:** 0
**Removed from seed:** FR-AUTH-04 (admin single-subscription fan-out opt-in) — explicitly OUT of scope per D-TOS-01.

---

*Last updated: 2026-04-29 — Traceability filled by `/gsd-roadmapper`. Initial requirements drafted from seed + user subscription-only constraint 2026-04-29.*
