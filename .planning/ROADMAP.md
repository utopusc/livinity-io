# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01 with `gaps_found` accepted; MiroFish dropped) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01, status `passed`, 18/18 reqs) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- ✅ **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-54 (shipped local 2026-05-02 via `--accept-debt`; Phase 55 carry-forward; new architectural issues surfaced → v30.0) — see [milestones/v29.5-ROADMAP.md](milestones/v29.5-ROADMAP.md)
- 🟢 **v30.0 Livinity Broker Professionalization** — Phases 56-63 (active; consumes [REQUIREMENTS.md](REQUIREMENTS.md))
- ⏸ **(deferred) Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes as a future milestone with phase renumber; the v30.0 slot is now claimed by Broker Professionalization)

---

## Phases

<details>
<summary>✅ v29.5 v29.4 Hot-Patch Recovery + Verification Discipline (Phases 49-54) — SHIPPED 2026-05-02</summary>

- [x] Phase 49: Mini PC Live Diagnostic (4/4 plans) — Server5 batched fixture captured; Mini PC SSH banned, fallback per D-49-02 used `v29.4-REGRESSIONS.md` as fixture; 4 verdict blocks synthesized.
- [x] Phase 50: A1 Tool Registry Built-in Seed (1/1 plan) — `seed-builtin-tools.ts` (90 LOC) writes 9 BUILT_IN_TOOL_IDS to `nexus:cap:tool:*` idempotently on livinityd boot; 4/4 integration tests passing.
- [x] Phase 51: A2 Streaming Regression Fix (1/1 plan, deploy-layer) — `update.sh` fresh-build hardening (rm -rf dist + reordered verify_build); sacred file UNTOUCHED; Branch N reversal DEFERRED per D-51-03.
- [x] Phase 52: A3 Marketplace State Correction — MiroFish DELETED from livinityd `builtin-apps.ts` + Server5 `apps` table archived; Bolt.diy hot-patches landed (wrangler-install + OPENAI_LIKE_API_KEY).
- [x] Phase 53: A4 Fail2ban Security Panel Render — no-op; root cause was collapsed sidebar (UI density), not code; Phase 51 fresh-build was the actual remediation.
- [x] Phase 54: B1 Live-Verification Gate (gsd toolkit) — `/gsd-complete-milestone` hard-blocks `passed` audit when `human_needed` count > 0; `--accept-debt` flag with forensic trail; first real-world invocation = this very close.
- [⚠] Phase 55: Mandatory Live Milestone-Level Verification — **NOT EXECUTED**. 14 formal UATs (4 v29.5 + 4 v29.4 + 6 v29.3 carry) deferred to v30.0 Phase 63. Closed via `--accept-debt`.

</details>

### 🟢 v30.0 Livinity Broker Professionalization (Active — Phases 56-63)

**Goal:** Transform Livinity Broker into a "real-API-key" experience for external/open-source apps (Bolt.diy, Open WebUI, Continue.dev, Cline). Bearer-token-authed, public-endpoint, true-token-streaming, rate-limit-aware, multi-spec-compliant. Each external client must be able to use its own system prompt and its own tools without identity contamination from Nexus.

**Architectural Constraints (carry into v30.0):**

- **D-NO-NEW-DEPS** preserved (Anthropic SDK addition pending Phase 56 verdict).
- **D-NO-SERVER4** preserved — Mini PC + Server5 are the only deploy targets.
- **D-LIVINITYD-IS-ROOT** preserved.
- **Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNTOUCHED in v30.** Passthrough mode (Phase 57) bypasses it; agent mode keeps current behavior byte-identical. FR-BROKER-A1-04 enforces this with the existing integrity test.
- **D-LIVE-VERIFICATION-GATE** active — Phase 63 is the FIRST milestone close where the gate must pass cleanly without `--accept-debt`.
- **D-NO-BYOK** preserved — broker issues its own `liv_sk_*` Bearer tokens; user's raw `claude_*` keys never enter the broker.
- **D-51-03** — Branch N reversal still deferred; re-evaluate during Phase 56 spike (one of the 7 open questions).
- **Phase numbering continuity** — phases continue from v29.5's last (54). Phase 55 is intentionally skipped as a historical record (deferred live-verification phase from v29.5; its work is absorbed into Phase 63). v30 starts at 56.

**Phase summary:**

- [x] **Phase 56: Research Spike (Passthrough Architecture + Public Endpoint + Auth Patterns)** — SHIPPED 2026-05-02. 4/4 plans complete. 9 D-30-XX decisions locked. SPIKE-FINDINGS.md canonical answer document at `.planning/phases/56-research-spike/SPIKE-FINDINGS.md`; phase summary at `PHASE-SUMMARY.md`. Sacred SHA stable.
- [x] **Phase 57: A1+A2 Passthrough Mode + Agent Mode Opt-In** — SHIPPED 2026-05-02. 5/5 plans complete (57-01..05). 6/6 requirements satisfied (FR-BROKER-A1-01..04 + FR-BROKER-A2-01..02). Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every wave + end-of-phase. 95 broker tests GREEN. PHASE-SUMMARY at `.planning/phases/57-passthrough-mode-agent-mode/PHASE-SUMMARY.md`.
- [x] **Phase 58: C1+C2 True Token Streaming (Anthropic + OpenAI)** — SHIPPED 2026-05-03. 5/5 plans complete (58-00..04). 5/5 requirements satisfied (FR-BROKER-C1-01..02 + FR-BROKER-C2-01..03). Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every wave + end-of-phase (asserted from inside Wave 4's final-gate test). `openai-sse-adapter.ts` byte-identical (two-adapters-coexist preserved). D-NO-NEW-DEPS preserved across entire phase. Anthropic SSE now forwarded verbatim via `client.messages.create({stream:true})` async iterator (Wave 2); OpenAI translated 1:1 with `usage` on final chunk + crypto chatcmpl id (Wave 1 + Wave 3). 56 new tests added; broker suite 94/94 GREEN. PHASE-SUMMARY at `.planning/phases/58-true-token-streaming/PHASE-SUMMARY.md`.
- [x] **Phase 59: B1 Per-User Bearer Token Auth (`liv_sk_*`)** — SHIPPED 2026-05-02. 5/5 plans complete (59-01..05). 5/5 requirements satisfied (FR-BROKER-B1-01..05). Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every wave + end-of-phase. New `api_keys` PG table (8 cols + FK CASCADE + UNIQUE key_hash + 2 indexes); `liv_sk_<base64url-32>` token format with SHA-256-of-FULL-plaintext hash; Bearer middleware on `/u/:userId/v1` with 60s positive / 5s negative TTL cache + sync `invalidate()` from `apiKeys.revoke` (closes 60s revocation lag); 4 tRPC procedures (create / list / revoke / listAll); `device_audit_log` REUSE per Phase 46 sentinel pattern (`device_id='api-keys-system'`); httpOnlyPaths gates 4 entries; `last_used_at` debounced ≤1 PG write/min/key. 39 new api-keys/ tests + 2 added to common.test.ts; api-keys/ 39/39 GREEN. D-NO-NEW-DEPS preserved (zero new npm packages across all 5 plans). PHASE-SUMMARY at `.planning/phases/59-bearer-token-auth/PHASE-SUMMARY.md`.
- [ ] **Phase 60: B2 Public Endpoint (`api.livinity.io`) + Rate-Limit Perimeter** — Server5 reverse proxy + TLS + rate-limit perimeter.
- [ ] **Phase 61: C3+D1+D2 Rate-Limit Headers + Model Aliases + Provider Interface Stub** — Anthropic + OpenAI rate-limit header forwarding/translation; friendly model alias resolution; pluggable `BrokerProvider` interface (Anthropic-only concrete impl).
- [ ] **Phase 62: E1+E2 Usage Tracking Accuracy + Settings UI** — `broker_usage.api_key_id` column; OpenAI streaming usage rows; "API Keys" + enhanced "Usage" tabs in Settings > AI Configuration.
- [ ] **Phase 63: Mandatory Live Verification (D-LIVE-VERIFICATION-GATE)** — Mini PC deploy; Bolt.diy + Open WebUI + Continue.dev + raw curl + Anthropic Python SDK live tests; 14 carry-forward UATs walked; gate clears WITHOUT `--accept-debt`.

---

## Phase Details

### Phase 56: Research Spike — Passthrough Architecture + Public Endpoint + Auth Patterns
**Goal**: Resolve the 7 open architectural questions blocking implementation (Anthropic SDK direct vs HTTP proxy, tools forwarding behavior, agent-mode opt-in mechanism, public endpoint platform Caddy vs CF Worker, key rotation policy, rate-limit policy, Agent mode block-streaming retention) so Phases 57-62 can plan with concrete decisions.
**Depends on**: Nothing (first phase of v30.0).
**Requirements**: (none — research-only phase; produces decisions consumed by 57+)
**Success Criteria** (what must be TRUE):
  1. A reader of `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` can answer each of the 7 open questions with a chosen path AND the rationale (no "TBD" rows).
  2. The chosen passthrough path (SDK-direct vs HTTP-proxy to api.anthropic.com) names the exact code-level integration point Phase 57 will modify.
  3. The chosen agent-mode opt-in mechanism (header vs URL path) is selected with a worked example of an external client request that triggers it vs falls through to passthrough.
  4. The chosen public endpoint platform (Server5 Caddy vs Cloudflare Worker) is paired with a TLS strategy (LE on-demand vs CF-managed) and a rate-limit primitive (Caddy `rate_limit` plugin vs CF Worker WAF rule).
  5. D-51-03 (Branch N sacred-file reversal) is re-evaluated with a verdict: either "not needed in v30 — passthrough handles external identity, agent mode untouched" OR "still needed as v30.1 hot-patch out of scope here."
**Plans**: 4 plans

Plans:
- [x] 56-01-PLAN.md — Architectural Verdicts (Q1 SDK-direct vs HTTP-proxy + Q2 tools forwarding + Q7 agent-mode streaming) — SHIPPED 2026-05-02 (commit `2aaf6d2c`)
- [x] 56-02-PLAN.md — Auth & Public Endpoint Verdicts (Q3 agent-mode opt-in + Q4 Caddy vs CF Worker + Q5 key rotation + Q6 rate-limit) — SHIPPED 2026-05-02 (commits `4f452bd0` Q3+Q5, `3919271a` Q4, `f4eb0e4f` Q6)
- [x] 56-03-PLAN.md — Cross-Cut Audits (D-NO-NEW-DEPS + Sacred SHA stability + D-51-03 re-evaluation) — SHIPPED 2026-05-02 (commit `60d4b202`); D-NO-NEW-DEPS YELLOW (npm-clean; Caddy/xcaddy non-npm infra delta flagged for Phase 60); sacred SHA stable; D-51-03 verdict "Not needed in v30"
- [x] 56-04-PLAN.md — SPIKE-FINDINGS.md synthesis (Executive Summary + Decisions Log + Validation) — SHIPPED 2026-05-02 (commit `c77b2b1d`); 9 D-30-XX decisions logged; validation table all 7 PASS; sacred SHA stable

### Phase 57: A1+A2 Passthrough Mode + Agent Mode Opt-In
**Goal**: External clients hitting `/v1/messages` and `/v1/chat/completions` get a transparent forward to the upstream Anthropic API with their own `system` prompt and their own `tools[]` preserved verbatim — no Nexus identity, no Nexus MCP tools. LivOS in-app chat keeps the existing Agent-SDK-tooled experience by opting into agent mode.
**Depends on**: Phase 56.
**Requirements**: FR-BROKER-A1-01, FR-BROKER-A1-02, FR-BROKER-A1-03, FR-BROKER-A1-04, FR-BROKER-A2-01, FR-BROKER-A2-02
**Success Criteria** (what must be TRUE):
  1. A user sends a chat from Bolt.diy with system prompt "You are Bolt, a developer-focused assistant" and asks "Who are you?" — the response self-identifies as "Bolt", not as "Nexus" or "Claude powered by Livinity".
  2. A user sends a request with a `tools: [...]` array via the broker — the upstream model invokes ONLY the client-supplied tools; Nexus MCP tools (filesystem, shell, etc.) are not visible or invokable.
  3. A user opens LivOS AI Chat (in-app) — every existing capability still works (capability discovery, tool execution, IntentRouter, system prompt, conversation persistence) byte-for-byte identical to v29.5.
  4. A developer running `git diff 4f868d31...HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` sees an empty diff after Phase 57 ships; the integrity test (`sdk-agent-runner-integrity.test.ts`) passes with the same `BASELINE_SHA`.
**Plans**: 5 plans

Plans:
- [x] 57-01-PLAN.md - Wave 0 Test Scaffolding + README + SDK reachability audit (SHIPPED 2026-05-02; commits 340ff587, d3dfb52f; 26 RED tests)
- [x] 57-02-PLAN.md - Wave 1 Mode Dispatch + Credential Extractor + Risk-A1 smoke gate (SHIPPED 2026-05-03; commits 8af8dc9e, 04a87846; 19/19 GREEN; Risk-A1 GATE PASSED)
- [x] 57-03-PLAN.md - Wave 2 Anthropic Messages Passthrough Handler + router.ts dispatch (SHIPPED 2026-05-02; commits 364a723b, f48f6827; passthrough-handler.ts 227 LOC + router.ts +39 LOC; 27/27 GREEN; sacred SHA byte-identical)
- [x] 57-04-PLAN.md - Wave 3 OpenAI Chat Completions Passthrough + openai-router.ts dispatch (SHIPPED 2026-05-02; commits a563672d, 5fccc0e6; passthrough-handler.ts +232 LOC + openai-translator.ts +109 LOC + openai-router.ts +44 LOC; 38/38 vitest GREEN; sacred SHA byte-identical)
- [x] 57-05-PLAN.md - Wave 4 Agent Mode Byte-Identity Proof + Sacred File Final Verification (SHIPPED 2026-05-02; commit 4fc964f8; integration.test.ts +17/-10 + openai-integration.test.ts +19/-8; 18/18 v29.5 assertions GREEN with X-Livinity-Mode: agent header; ZERO production code modified; sacred SHA byte-identical pre/post; sacred file integrity test PASS)

### Phase 58: C1+C2 True Token Streaming (Anthropic + OpenAI)
**Goal**: External clients see token-by-token streaming as text generates, not single aggregate chunks at the end. Both Anthropic Messages and OpenAI Chat Completions streaming paths emit spec-compliant byte-level event sequences.
**Depends on**: Phase 57.
**Requirements**: FR-BROKER-C1-01, FR-BROKER-C1-02, FR-BROKER-C2-01, FR-BROKER-C2-02, FR-BROKER-C2-03
**Success Criteria** (what must be TRUE):
  1. A user watches a Bolt.diy chat bubble fill in word-by-word as the response generates — at least 3 visibly distinct delta updates appear before the response is complete (no 504 timeout, no single-shot reveal).
  2. A user pointing Open WebUI at the broker's `/v1/chat/completions` endpoint sees streaming output appear progressively in the UI; the final SSE chunk includes a non-zero `usage.prompt_tokens` + `usage.completion_tokens` shown in Open WebUI's per-message stats.
  3. A user calling `/v1/chat/completions` with `stream: false` (the synchronous OpenAI sync path) gets a single complete OpenAI-shaped JSON response with `id` matching `chatcmpl-<base62-29>`, `object: "chat.completion"`, and non-zero usage fields — no broken JSON, no timeout.
  4. A developer running the streaming integration test (`>3 distinct content_block_delta events`) against any prompt expected to take longer than 2 seconds sees the test pass deterministically across 5 consecutive runs.
**Plans**: 5 plans

Plans:
- [x] 58-00-PLAN.md - Wave 0 Test Infrastructure (fake-Anthropic SSE server + clientFactory test seam + compression audit) — SHIPPED 2026-05-03 (commits `070f862e` test, `8da22b8d` feat, `280fa4c4` docs)
- [x] 58-01-PLAN.md - Wave 1 OpenAI Stream Translator Core (TDD: RED + GREEN; cumulative output_tokens + crypto chatcmpl id + stop_reason mapping) — SHIPPED 2026-05-02 (commits `ff066e85` RED, `62121ccd` GREEN, `e97b62ab` docs); 23/23 unit tests GREEN
- [x] 58-02-PLAN.md - Wave 2 Anthropic Passthrough True Streaming (raw async iterator forwarding) — SHIPPED 2026-05-02 (commits `554f0373` RED, `b4e85f58` GREEN, `8f941d96` docs); 6 new TDD tests GREEN; FR-BROKER-C1-01 closed at unit level
- [x] 58-03-PLAN.md - Wave 3 OpenAI Passthrough Streaming Integration (translator wiring + chatcmpl id hardening) — SHIPPED 2026-05-02 (commits `949412e2` RED, `745aac42` GREEN, `63a727bf` docs); 8 new tests GREEN; FR-BROKER-C2-01..03 closed at unit level; Phase 57 Pitfall 4 closed
- [x] 58-04-PLAN.md - Wave 4 Integration Tests + Final Phase Gate (5-run determinism + sacred file SHA) — SHIPPED 2026-05-03 (commit `5733eb7a` test); 13/13 integration tests GREEN; sacred SHA + two-adapters-coexist asserted from inside the suite; 5-run determinism PASSED; broker suite 94/94 GREEN

### Phase 59: B1 Per-User Bearer Token Auth (`liv_sk_*`)
**Goal**: External API consumers authenticate with a standard `Authorization: Bearer liv_sk_*` token instead of URL-path identity + container IP guard. Users can mint, list, and revoke their own keys; revoked keys return Anthropic-spec 401 errors.
**Depends on**: Nothing (parallel to 56-58 implementation).
**Requirements**: FR-BROKER-B1-01, FR-BROKER-B1-02, FR-BROKER-B1-03, FR-BROKER-B1-04, FR-BROKER-B1-05
**Success Criteria** (what must be TRUE):
  1. A user creates a new API key from the eventual Settings UI (or via the underlying tRPC route) and the response shows the plaintext `liv_sk_<base62-32>` value exactly once with a copy-to-clipboard affordance; reloading the list shows only the prefix preview.
  2. A user invokes `curl -H "Authorization: Bearer liv_sk_..."` against the broker and the request reaches their per-user broker context — the response carries their content, not another user's.
  3. A user revokes a key from the list and immediately retries the same Bearer token via curl — the response is HTTP 401 with body `{"error": {"type": "authentication_error", "message": "API key revoked"}}` (Anthropic-spec shape).
  4. A user with a leaked Bearer token can audit `last_used_at` to see exactly when it was last presented to the broker, confirming the audit trail.
**Plans**: 5 plans

Plans:
- [x] 59-01-PLAN.md — Wave 0 Test Infrastructure + Schema Convention Pre-Flight (6 failing tests + grep guards) — SHIPPED 2026-05-02 (commits `34858a8c` + `d07f78f2`; SUMMARY at `.planning/phases/59-bearer-token-auth/59-01-SUMMARY.md`)
- [x] 59-02-PLAN.md — Wave 1 PG Schema Append + database.ts CRUD Layer (twin of docker_agents) — SHIPPED 2026-05-02 (commits `8c4305d3` schema + `bcf41817` database.ts; 9/9 Wave 1 tests GREEN; SUMMARY at `.planning/phases/59-bearer-token-auth/59-02-SUMMARY.md`)
- [x] 59-03-PLAN.md — Wave 2 Bearer Middleware + In-Memory Cache + server/index.ts Mount + cli.ts dispose — SHIPPED 2026-05-02 (commits `3108da7c` cache + `c26d45fe` mount; bearer-auth + cache + mount-order tests 14/14 GREEN; SUMMARY at `.planning/phases/59-bearer-token-auth/59-03-SUMMARY.md`)
- [x] 59-04-PLAN.md — Wave 3 tRPC Routes (create/list/revoke/listAll) + Audit Hook REUSE + httpOnlyPaths — SHIPPED 2026-05-02 (commits `f29128a6` events.ts+routes.ts + `c3091d1f` mount; routes 7/7 + common 12/12 GREEN; SUMMARY at `.planning/phases/59-bearer-token-auth/59-04-SUMMARY.md`)
- [x] 59-05-PLAN.md — Wave 4 Integration Tests + Final Phase Gate (sacred file SHA) — SHIPPED 2026-05-02 (commit `14b5784d`; integration 9/9 GREEN; api-keys total 39/39 GREEN; sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNCHANGED at phase end; SUMMARY at `.planning/phases/59-bearer-token-auth/59-05-SUMMARY.md`; PHASE-SUMMARY at `.planning/phases/59-bearer-token-auth/PHASE-SUMMARY.md`)

### Phase 60: B2 Public Endpoint (`api.livinity.io`) + Rate-Limit Perimeter
**Goal**: External clients can reach the broker over the open internet at `https://api.livinity.io` using their `liv_sk_*` Bearer token, without the request having to traverse Mini-PC-internal subdomain routing or container IP allowlists.
**Depends on**: Phase 59 (Bearer auth must exist before public exposure removes the IP guard).
**Requirements**: FR-BROKER-B2-01, FR-BROKER-B2-02
**Success Criteria** (what must be TRUE):
  1. A user runs `curl https://api.livinity.io/v1/messages` from any internet host (e.g., a laptop on a coffee-shop wifi) with a valid `liv_sk_*` Bearer token and gets a streamed Anthropic-shape response.
  2. A user from outside the Mini PC LAN connects Open WebUI to `api.livinity.io` with their `liv_sk_*` token and successfully completes a chat round trip — no container-IP-guard rejection, no DNS-only-CDN error.
  3. A user (or a misbehaving client) blasting `api.livinity.io` faster than the configured baseline rate gets HTTP 429 with an Anthropic-compat error body and a `Retry-After` header — they are not silently throttled or 502'd.
  4. A user observes that `api.livinity.io` presents a valid TLS certificate (no "self-signed" warning, no expired-cert warning) when opened in any modern browser.
**Plans**: 5 plans

Plans:
- [x] 60-01-PLAN.md — Wave 0 Server5 ground-truth diagnostic (single-batched ssh) + 5-Q verdict table — SHIPPED 2026-05-03 (commit `59ceeb16`; FIXTURE 312 lines; 5/5 verdicts)
- [x] 60-02-PLAN.md — Wave 1 xcaddy build + binary swap (`/usr/bin/caddy` → custom build with `caddy-ratelimit`) — SHIPPED 2026-05-03 (commit `262ac9df`; Caddy v2.11.2 + mholt/caddy-ratelimit + caddy-dns/cloudflare; backup `/usr/bin/caddy.bak.20260503-070012`; DELETION_COUNT=0; smoke regression PASS; sacred SHA byte-identical; FR-BROKER-B2-02 satisfied)
- [ ] 60-03-PLAN.md — Wave 2 Relay code extension for `api.livinity.io` → admin tunnel routing (TDD)
- [ ] 60-04-PLAN.md — Wave 3 Caddyfile addition + DNS A record + broker IP-guard removal
- [ ] 60-05-PLAN.md — Wave 4 phase-60-smoke.sh + 60-SMOKE-RESULTS.md + sacred file final gate

### Phase 61: C3+D1+D2 Rate-Limit Headers + Model Aliases + Provider Interface Stub
**Goal**: Spec-compliant rate-limit headers reach external clients; friendly model aliases (`opus` / `sonnet` / `haiku` / `gpt-4o`) resolve to the current Claude family without per-client awareness of model versioning; a pluggable `BrokerProvider` interface lets future providers (OpenAI / Gemini / Mistral) be code-drop-ins.
**Depends on**: Phase 57 (passthrough exists), Phase 58 (streaming path exists to attach headers/usage).
**Requirements**: FR-BROKER-C3-01, FR-BROKER-C3-02, FR-BROKER-C3-03, FR-BROKER-D1-01, FR-BROKER-D1-02, FR-BROKER-D2-01, FR-BROKER-D2-02
**Success Criteria** (what must be TRUE):
  1. A user inspecting response headers from the Anthropic broker route (e.g., via `curl -I` or DevTools) sees `anthropic-ratelimit-requests-remaining` and `anthropic-ratelimit-tokens-remaining` with sensible non-zero values, and on a 429 response the `Retry-After` header is present and parsable.
  2. A user inspecting response headers from the OpenAI broker route sees the OpenAI-namespaced equivalents (`x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, etc.) on every successful response.
  3. A user sends `model: "opus"` or `model: "gpt-4o"` from any client without any version-specific awareness — the request resolves to the current Claude family model and returns a normal response (no "model not found" error); unknown models log a warn and fall through to the default model.
  4. An admin updates the alias table (Redis or file, per Phase 56's choice) without a code change or service restart and sees the new alias take effect on the next request — the documented update procedure works as written.
  5. A future engineer reading `BrokerProvider` TypeScript interface can clearly identify the three pluggable methods (`request`, `streamRequest`, `translateUsage`) and the existing Anthropic implementation is the reference example; OpenAI/Gemini stub interfaces compile without concrete bodies.
**Plans**: 4 plans
- [ ] 61-01-PLAN.md — Wave 1 BrokerProvider interface + AnthropicProvider extraction + passthrough-handler refactor (D2-01, D2-02)
- [ ] 61-02-PLAN.md — Wave 2 OpenAI/Gemini/Mistral provider stubs + grep-guard test (D2-01, D2-02)
- [ ] 61-03-PLAN.md — Wave 3 Redis-backed alias resolver + SETNX boot seed + Anthropic route bug-fix (D1-01, D1-02)
- [ ] 61-04-PLAN.md — Wave 4 Rate-limit header forward (Anthropic) + translate (OpenAI, duration string) + final phase gate (C3-01, C3-02, C3-03)

### Phase 62: E1+E2 Usage Tracking Accuracy + Settings UI (API Keys + Usage tabs)
**Goal**: Every successful broker completion (Anthropic + OpenAI, streaming + sync) writes a `broker_usage` row attributable to the specific API key used; users have a Settings UI to manage keys and inspect per-key usage breakdowns.
**Depends on**: Phase 59 (`api_keys` table must exist for the FK column).
**Requirements**: FR-BROKER-E1-01, FR-BROKER-E1-02, FR-BROKER-E1-03, FR-BROKER-E2-01, FR-BROKER-E2-02
**Success Criteria** (what must be TRUE):
  1. A user sends an Anthropic streaming request, an Anthropic sync request, an OpenAI streaming request, and an OpenAI sync request through the broker — afterward the Settings > AI Configuration > Usage view shows 4 fresh rows with non-zero `prompt_tokens` + `completion_tokens` for each request type (closes v29.3 C4 carry-forward to its full conclusion).
  2. A user opens Settings > AI Configuration > "API Keys" tab, sees their existing keys with id / label / prefix / created_at / last_used_at / revoked_at columns, and can click "Create Key" to spawn a new one (with the plaintext shown ONCE in a copy-to-clipboard modal) or "Revoke" to retire one.
  3. A user filters the Usage subsection by a specific API key from a dropdown and sees only the rows attributable to that key — totals on the per-app table and the 30-day chart update accordingly.
  4. An admin filtering the cross-user Usage view by `api_key_id` sees only that key's traffic across all users, confirming the admin filter dimension wired through end-to-end.
**Plans**: 5 plans
**UI hint**: yes

Plans:
- [ ] 62-01-PLAN.md — Wave 1 Backend test scaffolds + schema migration + database.ts 8-param refactor (FR-BROKER-E1-01)
- [ ] 62-02-PLAN.md — Wave 2 Capture middleware reads req.apiKeyId at response time (FR-BROKER-E1-02)
- [ ] 62-03-PLAN.md — Wave 2 tRPC routes accept apiKeyId filter input (FR-BROKER-E2-02 backend)
- [ ] 62-04-PLAN.md — Wave 2 ApiKeysSection + Create/Revoke modals + ai-config.tsx FLAT insertion (FR-BROKER-E2-01)
- [ ] 62-05-PLAN.md — Wave 3 Usage filter dropdown + admin filter + FR-BROKER-E1-03 integration test + final phase gate

### Phase 63: Mandatory Live Verification (D-LIVE-VERIFICATION-GATE)
**Goal**: Validate v30.0's broker architecture works end-to-end with real external clients on real Mini PC hardware AND close ALL outstanding live-verification debt (v29.5 Phase 55 deferred + v29.4 carry + v29.3 carry — 14 UATs total). This is the FIRST milestone close where the live-verification gate must pass cleanly without `--accept-debt`.
**Depends on**: Phases 57, 58, 59, 60, 61, 62 (entire v30 implementation must be deployable).
**Requirements**: FR-VERIFY-V30-01, FR-VERIFY-V30-02, FR-VERIFY-V30-03, FR-VERIFY-V30-04, FR-VERIFY-V30-05, FR-VERIFY-V30-06, FR-VERIFY-V30-07, FR-VERIFY-V30-08
**Success Criteria** (what must be TRUE):
  1. A human walks the Mini PC deploy (`bash /opt/livos/update.sh`) start to finish, sees a `<ts>-success.json` row appear in the Past Deploys panel for the v30 SHA, and confirms all four services (`livos`, `liv-core`, `liv-worker`, `liv-memory`) report `active` in `systemctl status`.
  2. A human installs Bolt.diy from the marketplace, opens the app, sends a chat, and visibly observes token-by-token streaming (≥3 visible delta updates in the chat bubble); when asked "Who are you?" the model self-identifies as "Bolt" (NOT "Nexus") and `psql ... -c "SELECT * FROM broker_usage ORDER BY created_at DESC LIMIT 1"` shows a fresh row with non-zero token counts.
  3. A human connects Open WebUI to `api.livinity.io` with a freshly-minted `liv_sk_*` Bearer token, sends a chat, sees streaming output, the model honors Open WebUI's system prompt verbatim, and a `broker_usage` row is written attributable to that key.
  4. A human configures Continue.dev with `api.livinity.io` + `liv_sk_*`, requests a code completion, and sees the response return within Continue's 5-second timeout; if Continue invokes a tool, the model honors Continue's tool-use protocol (no Nexus tool injection).
  5. A human runs raw `curl -H "Authorization: Bearer liv_sk_*" https://api.livinity.io/v1/messages` from outside Mini PC's LAN AND a Python `Anthropic(api_key='liv_sk_*', base_url='https://api.livinity.io').messages.create(...)` call — both return spec-compliant streaming Anthropic-shape responses.
  6. A human walks all 14 carry-forward UATs (4 v29.5: 49/50/51/52/53/54; 4 v29.4: 45-48; 6 v29.3: 39-44) on Mini PC and `.planning/phases/63-live-verification/63-UAT-RESULTS.md` exists with one row per step (step ID | description | result PASS/FAIL/BLOCKED | evidence | timestamp) — zero BLOCKED rows allowed for milestone close.
  7. `/gsd-complete-milestone v30.0` returns audit `passed` (NOT `human_needed`) on its first invocation and the gate closes WITHOUT `--accept-debt` — this is the gate's first real-world clean pass and the forensic-trail table in MILESTONES.md gains NO new override row for v30.0.
**Plans**: 11 plans

Plans:
- [ ] 63-01-PLAN.md -- Wave 0 Pre-flight gate (Phases 56-62 EXECUTED + SSH + DNS + TLS + alias seed + UI tab)
- [ ] 63-02-PLAN.md -- Wave 1 Mini PC deploy via update.sh + 4-services + Past Deploys panel
- [ ] 63-03-PLAN.md -- Wave 2 Raw protocol smokes (curl + Anthropic Python SDK; FR-VERIFY-V30-05 + 06)
- [ ] 63-04-PLAN.md -- Wave 3a Bolt.diy live test (identity + streaming + broker_usage; FR-VERIFY-V30-02)
- [ ] 63-05-PLAN.md -- Wave 3b Open WebUI live test (system-prompt-honor + token counts; FR-VERIFY-V30-03)
- [ ] 63-06-PLAN.md -- Wave 3c Continue.dev live test (5s code completion + tool-cleanliness; FR-VERIFY-V30-04)
- [ ] 63-07-PLAN.md -- Wave 4a UAT walks v29.5 batch (Phases 49/50/51/52/53/54)
- [ ] 63-08-PLAN.md -- Wave 4b UAT walks v29.4 batch (Phases 45/46/47/48)
- [ ] 63-09-PLAN.md -- Wave 4c UAT walks v29.3 part 1 (Phases 39/40/41)
- [ ] 63-10-PLAN.md -- Wave 4d UAT walks v29.3 part 2 (Phases 42/43/44 + Phase 43 OBSOLETE handling)
- [ ] 63-11-PLAN.md -- Wave 5 Sacred SHA gate + cleanup + /gsd-complete-milestone v30.0 clean-close (FR-VERIFY-V30-08)

---

## Progress

| Phase                                | Milestone | Plans Complete | Status      | Completed  |
|--------------------------------------|-----------|----------------|-------------|------------|
| 49. Mini PC Live Diagnostic          | v29.5     | 4/4            | Complete    | 2026-05-02 |
| 50. A1 Tool Registry Seed            | v29.5     | 1/1            | Complete    | 2026-05-02 |
| 51. A2 Streaming Fix                 | v29.5     | 1/1            | Complete    | 2026-05-02 |
| 52. A3 Marketplace State             | v29.5     | 0/0            | Complete    | 2026-05-02 |
| 53. A4 Security Panel Render         | v29.5     | 0/0            | Complete    | 2026-05-02 |
| 54. B1 Verification Gate             | v29.5     | 0/0            | Complete    | 2026-05-02 |
| 55. Live Milestone Verification      | v29.5     | 0/0            | DEFERRED    | →v30 P63   |
| 56. Research Spike                   | v30.0     | 4/4            | Complete    | 2026-05-02 |
| 57. A1+A2 Passthrough + Agent Mode   | v30.0     | 5/5            | Complete    | 2026-05-02 |
| 58. C1+C2 True Token Streaming       | v30.0     | 5/5            | Complete    | 2026-05-03 |
| 59. B1 Bearer Token Auth             | v30.0     | 0/0            | Not started | -          |
| 60. B2 Public Endpoint               | v30.0     | 2/5            | In progress | -          |
| 61. C3+D1+D2 Spec Compliance         | v30.0     | 0/0            | Not started | -          |
| 62. E1+E2 Usage + Settings UI        | v30.0     | 0/5            | Not started | -          |
| 63. Mandatory Live Verification      | v30.0     | 0/11           | Not started | -          |

---

## Dependency Graph

```
                          ┌──────────────────────────┐
                          │  56  Research Spike       │  (no reqs; produces decisions)
                          └─────────────┬────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────┐         ┌──────────────────────┐
                          │  57  Passthrough + Agent │         │  59  Bearer Token    │  (parallel — independent)
                          └─────────────┬────────────┘         └──────────┬───────────┘
                                        │                                 │
                                        ▼                                 ▼
                          ┌──────────────────────────┐         ┌──────────────────────┐
                          │  58  Token Streaming     │         │  60  Public Endpoint │
                          └─────────────┬────────────┘         └──────────┬───────────┘
                                        │                                 │
                                        ▼                                 │
                          ┌──────────────────────────┐                    │
                          │  61  Headers+Aliases+    │                    │
                          │      Provider Stub       │                    │
                          └─────────────┬────────────┘                    │
                                        │                                 │
                                        │       ┌─────────────────────────┘
                                        │       │
                                        │       ▼
                                        │  ┌──────────────────────┐
                                        │  │  62  Usage + UI      │  (depends on 59 for FK)
                                        │  └──────────┬───────────┘
                                        │             │
                                        ▼             ▼
                                ┌─────────────────────────────────┐
                                │  63  Mandatory Live Verification │  (depends on 57, 58, 59, 60, 61, 62)
                                │       D-LIVE-VERIFICATION-GATE   │
                                └─────────────────────────────────┘
```

**Critical path:** 56 → 57 → 58 → 61 → 63 (5-deep).
**Parallel branch:** 59 → 60 → 63 AND 59 → 62 → 63.
**Phase 63 depends on:** 57 (passthrough deployed), 58 (streaming deployed), 59 (Bearer auth deployed), 60 (public endpoint live), 61 (headers/aliases live), 62 (usage UI live).

---

## Coverage

Every v30 requirement maps to exactly one phase. Coverage: 38/38 (100%).

| REQ-ID                  | Phase | Phase Name                                         |
|-------------------------|-------|----------------------------------------------------|
| FR-BROKER-A1-01         | 57    | A1+A2 Passthrough + Agent Mode                     |
| FR-BROKER-A1-02         | 57    | A1+A2 Passthrough + Agent Mode                     |
| FR-BROKER-A1-03         | 57    | A1+A2 Passthrough + Agent Mode                     |
| FR-BROKER-A1-04         | 57    | A1+A2 Passthrough + Agent Mode                     |
| FR-BROKER-A2-01         | 57    | A1+A2 Passthrough + Agent Mode                     |
| FR-BROKER-A2-02         | 57    | A1+A2 Passthrough + Agent Mode                     |
| FR-BROKER-B1-01         | 59    | B1 Per-User Bearer Token Auth                      |
| FR-BROKER-B1-02         | 59    | B1 Per-User Bearer Token Auth                      |
| FR-BROKER-B1-03         | 59    | B1 Per-User Bearer Token Auth                      |
| FR-BROKER-B1-04         | 59    | B1 Per-User Bearer Token Auth                      |
| FR-BROKER-B1-05         | 59    | B1 Per-User Bearer Token Auth                      |
| FR-BROKER-B2-01         | 60    | B2 Public Endpoint + Rate-Limit Perimeter          |
| FR-BROKER-B2-02         | 60    | B2 Public Endpoint + Rate-Limit Perimeter          |
| FR-BROKER-C1-01         | 58    | C1+C2 True Token Streaming                         |
| FR-BROKER-C1-02         | 58    | C1+C2 True Token Streaming                         |
| FR-BROKER-C2-01         | 58    | C1+C2 True Token Streaming                         |
| FR-BROKER-C2-02         | 58    | C1+C2 True Token Streaming                         |
| FR-BROKER-C2-03         | 58    | C1+C2 True Token Streaming                         |
| FR-BROKER-C3-01         | 61    | C3+D1+D2 Headers + Aliases + Provider Stub         |
| FR-BROKER-C3-02         | 61    | C3+D1+D2 Headers + Aliases + Provider Stub         |
| FR-BROKER-C3-03         | 61    | C3+D1+D2 Headers + Aliases + Provider Stub         |
| FR-BROKER-D1-01         | 61    | C3+D1+D2 Headers + Aliases + Provider Stub         |
| FR-BROKER-D1-02         | 61    | C3+D1+D2 Headers + Aliases + Provider Stub         |
| FR-BROKER-D2-01         | 61    | C3+D1+D2 Headers + Aliases + Provider Stub         |
| FR-BROKER-D2-02         | 61    | C3+D1+D2 Headers + Aliases + Provider Stub         |
| FR-BROKER-E1-01         | 62    | E1+E2 Usage Tracking + Settings UI                 |
| FR-BROKER-E1-02         | 62    | E1+E2 Usage Tracking + Settings UI                 |
| FR-BROKER-E1-03         | 62    | E1+E2 Usage Tracking + Settings UI                 |
| FR-BROKER-E2-01         | 62    | E1+E2 Usage Tracking + Settings UI                 |
| FR-BROKER-E2-02         | 62    | E1+E2 Usage Tracking + Settings UI                 |
| FR-VERIFY-V30-01        | 63    | Mandatory Live Verification                        |
| FR-VERIFY-V30-02        | 63    | Mandatory Live Verification                        |
| FR-VERIFY-V30-03        | 63    | Mandatory Live Verification                        |
| FR-VERIFY-V30-04        | 63    | Mandatory Live Verification                        |
| FR-VERIFY-V30-05        | 63    | Mandatory Live Verification                        |
| FR-VERIFY-V30-06        | 63    | Mandatory Live Verification                        |
| FR-VERIFY-V30-07        | 63    | Mandatory Live Verification                        |
| FR-VERIFY-V30-08        | 63    | Mandatory Live Verification                        |

**Per-phase requirement counts:**

| Phase | Reqs | Notes                                                                   |
|-------|------|-------------------------------------------------------------------------|
| 56    | 0    | Research-only — produces decisions, not code                            |
| 57    | 6    | A1 (4) + A2 (2)                                                          |
| 58    | 5    | C1 (2) + C2 (3)                                                          |
| 59    | 5    | B1 (5)                                                                   |
| 60    | 2    | B2 (2)                                                                   |
| 61    | 7    | C3 (3) + D1 (2) + D2 (2)                                                |
| 62    | 5    | E1 (3) + E2 (2)                                                          |
| 63    | 8    | VERIFY-V30 (8)                                                           |
| **Total** | **38** | All v30 requirements mapped exactly once. No orphans, no duplicates. |

---

## Notes

**Deviations from the suggested breakdown in MILESTONE-CONTEXT.md:** None. The suggested 8-phase partition (56 spike → 57 A1+A2 → 58 C1+C2 → 59 B1 → 60 B2 → 61 C3+D1+D2 → 62 E1+E2 → 63 VERIFY) is faithful to the architectural-coupling reality (A1 passthrough and A2 agent mode are the same surgical broker code path branching on a single mode flag; C3 rate-limit headers attach during the same upstream-response handler that C2 already touches; D1 alias resolution and D2 provider interface stub naturally co-locate with the spec-compliance work). No phase splits or merges were warranted.

**Requirement count clarification:** The handoff prompt referenced "31 requirements" but the actual `.planning/REQUIREMENTS.md` enumerates **38 individual checkbox requirements** across A1/A2/B1/B2/C1/C2/C3/D1/D2/E1/E2/VERIFY. All 38 are mapped above; the count discrepancy is a prompt artifact, not a coverage gap. The "31 mapped (100%)" target in the prompt's verification gate is reinterpreted as "100% coverage of whatever requirements REQUIREMENTS.md actually contains" — satisfied at 38/38.

**Phase 56 design constraint:** Phase 56 deliberately holds zero requirements — it is a research spike whose output is decisions, not code. The 7 open questions (STATE.md "Critical Open Questions for Phase 56 Research Spike") become 7 success criteria entries in `56-SPIKE-FINDINGS.md`. Phases 57-62 cannot enter `/gsd-plan-phase` without those decisions resolved.

**Phase 63 design constraint:** Phase 63 is the FIRST milestone close where `D-LIVE-VERIFICATION-GATE` (introduced v29.5 Phase 54) must pass cleanly. FR-VERIFY-V30-08 explicitly requires `passed` (NOT `human_needed`) WITHOUT `--accept-debt`. Plan execution must walk:
- 1 deploy verification (FR-VERIFY-V30-01)
- 3 external client live tests (FR-VERIFY-V30-02 Bolt.diy, FR-VERIFY-V30-03 Open WebUI, FR-VERIFY-V30-04 Continue.dev)
- 2 raw protocol smoke tests (FR-VERIFY-V30-05 curl, FR-VERIFY-V30-06 Anthropic Python SDK)
- 14 carry-forward UATs (FR-VERIFY-V30-07: 4 v29.5 + 4 v29.4 + 6 v29.3)
- 1 milestone gate clean-close (FR-VERIFY-V30-08)

**Out-of-scope reminders:**
- Multi-provider concrete implementations (D2 ships interface only; OpenAI/Gemini/Mistral concrete impls deferred).
- Mobile API key management UI (desktop-only in v30).
- Webhook events, embedding API, vision multimodal edge sweep, subscription billing — all explicitly out per REQUIREMENTS.md "Out of Scope (v30.0)".
- Sacred file edits — D-51-03 keeps Branch N reversal deferred; if Phase 56 spike concludes a sacred-file edit is mandatory, it becomes a v30.1 hot-patch outside this milestone.

---

## Project-Level Milestone Index (carry-over)

- v19.0 Custom Domain Management (shipped 2026-03-27)
- v20.0 Live Agent UI (shipped 2026-03-27)
- v21.0 Autonomous Agent Platform (shipped 2026-03-28)
- v22.0 Livinity AGI Platform (shipped 2026-03-29)
- v23.0 Mobile PWA (shipped 2026-04-01)
- v24.0 Mobile Responsive UI (shipped 2026-04-01)
- v25.0 Memory & WhatsApp Integration (shipped 2026-04-03)
- v26.0 Device Security & User Isolation (shipped 2026-04-24)
- v27.0 Docker Management Upgrade (shipped 2026-04-25)
- v28.0 Docker Management UI (Dockhand-Style) (shipped 2026-04-26)
- v29.0 Deploy & Update Stability (shipped 2026-04-27)
- v29.2 Factory Reset (shipped 2026-04-29)
- v29.3 Marketplace AI Broker (Subscription-Only) (shipped local 2026-05-01)
- v29.4 Server Management Tooling + Bug Sweep (shipped local 2026-05-01)
- v29.5 v29.4 Hot-Patch Recovery + Verification Discipline (shipped local 2026-05-02 via `--accept-debt`)
- **v30.0 Livinity Broker Professionalization** (active — Phases 56-63)
- (deferred) Backup & Restore — 8 phases defined in `milestones/v30.0-DEFINED/`, renumbered to a future slot

---

*Last updated: 2026-05-02 — v30.0 Livinity Broker Professionalization roadmap defined; 8 phases (56-63), 38/38 requirements mapped (100% coverage), Phase 56 mandatory research spike, Phase 63 mandatory live verification under D-LIVE-VERIFICATION-GATE.*
