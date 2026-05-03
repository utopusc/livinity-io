# Milestone v30.0 Requirements — Livinity Broker Professionalization

**Milestone:** v30.0
**Started:** 2026-05-02
**Goal:** Transform Livinity Broker into a "real-API-key" experience for external/open-source apps. Bearer-token-authed, public-endpoint, true-token-streaming, rate-limit-aware, multi-spec-compliant. Each external client (Bolt.diy, Open WebUI, Continue.dev, Cline, …) must be able to use its own system prompt and its own tools without identity contamination from Nexus.

**Source context:**
- `.planning/MILESTONE-CONTEXT.md` (consumed by this scaffold) — captured architectural diagnosis from v29.5 live testing with Bolt.diy
- `.planning/PROJECT.md` — Current Milestone block
- `.planning/STATE.md` — locked decisions, Mini PC + Server5 ground truth, sacred file constraint, 7 open questions for Phase 56 spike

**Locked decisions carried in:** D-NO-NEW-DEPS (Anthropic SDK addition pending Phase 56 verdict), D-NO-SERVER4, D-LIVINITYD-IS-ROOT, D-NO-BYOK, D-LIVE-VERIFICATION-GATE, D-51-03 (Branch N reversal deferred), Sacred file `sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNTOUCHED in v30.

---

## Active Requirements

### A — Architectural Refactor (Passthrough vs Agent Mode)

The broker today routes ALL traffic through Nexus's `SdkAgentRunner` via `/api/agent/stream`, which prepends Nexus identity, injects Nexus MCP tools, and aggregates streaming. External clients need a different path.

- [ ] **FR-BROKER-A1-01** — A passthrough mode is the DEFAULT for broker requests on `/v1/messages` and `/v1/chat/completions`. Passthrough mode forwards the request directly to the Anthropic API (SDK direct call OR HTTP proxy — Phase 56 spike decides), preserving the client's `system` prompt verbatim and forwarding the client's `tools[]` array if present.
- [ ] **FR-BROKER-A1-02** — Passthrough mode emits NO Nexus identity injection. The "You are powered by Claude X.Y…" line from sacred file `sdk-agent-runner.ts:264-270` does NOT appear in passthrough responses.
- [ ] **FR-BROKER-A1-03** — Passthrough mode emits NO Nexus MCP tools (`mcpServers['nexus-tools']`). External clients see only their own tools (or none).
- [x] **FR-BROKER-A1-04
** — Sacred file `sdk-agent-runner.ts` is byte-identical at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` after all v30 phases ship. The integrity test (`sdk-agent-runner-integrity.test.ts`) BASELINE_SHA pin remains unchanged.
- [x] **FR-BROKER-A2-01
** — Agent mode is opt-in via either an `X-Livinity-Mode: agent` header OR a separate URL path (`/u/<id>/agent/v1/...`). Phase 56 spike picks ONE mechanism. Default behavior when neither is present = passthrough.
- [ ] **FR-BROKER-A2-02** — Agent mode preserves the current Nexus-tooled behavior end-to-end (identity injection, MCP tools, IntentRouter, capability registry) so LivOS in-app chat remains unchanged.

### B — Auth & Public Surface

External API consumers expect `Authorization: Bearer <key>` and a public endpoint, not URL-path identity + container IP guard.

- [ ] **FR-BROKER-B1-01** — A new PostgreSQL `api_keys` table stores per-user API keys: `id`, `user_id`, `key_hash` (SHA-256), `key_prefix` (first 8 chars of the secret for display), `name` (user-supplied label), `created_at`, `last_used_at`, `revoked_at`.
- [ ] **FR-BROKER-B1-02** — Generated keys follow the `liv_sk_<base62-32chars>` format. The plaintext key is shown ONCE at creation time and never stored in plaintext. Verification uses constant-time SHA-256 hash comparison.
- [ ] **FR-BROKER-B1-03** — Bearer token middleware validates `Authorization: Bearer liv_sk_*` on broker routes BEFORE the existing per-user URL-path identity logic. A valid token resolves to its `user_id`; the URL-path `:userId` becomes optional (Bearer is the source of identity when present).
- [ ] **FR-BROKER-B1-04** — A user-facing tRPC route allows admins/users to: create a key (returns plaintext once + key id), list their own keys (no plaintext), and revoke a key (sets `revoked_at`).
- [ ] **FR-BROKER-B1-05** — Revoked keys return `401 Unauthorized` with body `{"error": {"type": "authentication_error", "message": "API key revoked"}}` (Anthropic-spec error shape).
- [ ] **FR-BROKER-B2-01** — A public endpoint `api.livinity.io` is reachable from the open internet via Server5. TLS terminates at Server5 (Caddy or CF Worker — Phase 56 spike picks). Container IP guard is REMOVED from broker (Bearer auth replaces it).
- [ ] **FR-BROKER-B2-02** — A rate-limit perimeter at Server5 enforces a baseline limit (default = the user's Anthropic subscription rate forwarded transparently; broker-side token-bucket TBD pending Phase 56 spike). 429s use Anthropic-compat error shape.

### C — Spec Compliance (True Token Streaming + Rate Limit Headers)

External clients depend on byte-level spec compliance for streaming and rate-limit headers. Today the broker emits 1-2 aggregate chunks; clients see "non-streaming" or 504.

- [ ] **FR-BROKER-C1-01** — Anthropic Messages broker (`/v1/messages`) in passthrough mode emits the full Anthropic SSE event sequence verbatim from the upstream Anthropic API: `event: message_start`, `event: content_block_start`, `event: content_block_delta` (one per delta token group), `event: content_block_stop`, `event: message_delta`, `event: message_stop`. No payload mutation.
- [ ] **FR-BROKER-C1-02** — A token-streaming integration test asserts the broker emits ≥3 distinct `content_block_delta` events for any prompt expected to take longer than 2 seconds (chunked output, NOT a single aggregate chunk).
- [ ] **FR-BROKER-C2-01** — OpenAI Chat Completions broker (`/v1/chat/completions`) translates Anthropic SSE → OpenAI `chat.completion.chunk` events 1:1 as deltas arrive. Each Anthropic `content_block_delta` produces exactly one OpenAI delta chunk; final `message_delta` produces the `finish_reason` chunk; `message_stop` produces `data: [DONE]\n\n`.
- [ ] **FR-BROKER-C2-02** — OpenAI streaming emits a `usage` object on the FINAL chunk (before `[DONE]`) with non-zero `prompt_tokens`, `completion_tokens`, `total_tokens`. Builds on v29.5 commit `2518cf91` plumbing.
- [ ] **FR-BROKER-C2-03** — OpenAI sync (non-streaming) `/v1/chat/completions` returns a complete OpenAI response shape with `id` formatted as `chatcmpl-<base62-29>`, `object: "chat.completion"`, `choices`, and non-zero `usage` fields.
- [ ] **FR-BROKER-C3-01** — Anthropic rate-limit headers (`anthropic-ratelimit-requests-limit/remaining/reset`, `anthropic-ratelimit-tokens-limit/remaining/reset`) are forwarded verbatim from upstream Anthropic API to the broker response.
- [ ] **FR-BROKER-C3-02** — OpenAI clients receive the equivalent headers translated to OpenAI namespace (`x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests`, `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-tokens`) on every response.
- [ ] **FR-BROKER-C3-03** — `Retry-After` header is preserved on 429 responses (continues v29.4 Phase 45 C1 work) for both Anthropic and OpenAI broker paths.

### D — Model Strategy (Friendly Aliases + Multi-Provider Stub)

External clients send model names like `gpt-4o` or `claude-3-opus`. Broker should resolve to the current Claude family without per-client awareness of model versioning.

- [ ] **FR-BROKER-D1-01** — A model-alias resolution table maps friendly aliases (`opus`, `sonnet`, `haiku`, `claude-sonnet-4-6`, `claude-opus-4-7`, plus OpenAI aliases `gpt-4`, `gpt-4o`, `gpt-3.5-turbo`) to current Claude family model IDs. Unknown models warn-and-fall-through to a default model (continues v29.3 Phase 42 pattern).
- [ ] **FR-BROKER-D1-02** — The alias table is config-driven (Redis-backed or file-based — implementation choice during phase planning) so new Claude models can be added without code changes. A documented update procedure exists.
- [ ] **FR-BROKER-D2-01** — A pluggable provider interface (`BrokerProvider` TypeScript type) defines `request()`, `streamRequest()`, `translateUsage()` methods. v30 implements ONLY the Anthropic provider; an OpenAI/Gemini/Mistral stub interface is shipped to make future providers a code-drop-in change.
- [ ] **FR-BROKER-D2-02** — The Anthropic provider implementation is the default and ships in v30. Multi-provider routing (e.g., `model: "openai/gpt-4o"` routes to OpenAI provider) is OUT OF SCOPE for v30 (interface-only; concrete providers ship later).

### E — Observability (Per-Token Usage Tracking + Settings UI)

`broker_usage` exists from v29.3 Phase 44 but produces zero rows for OpenAI streaming and now needs per-API-key dimension for the new auth model.

- [ ] **FR-BROKER-E1-01** — `broker_usage` table gains a nullable `api_key_id` column referencing `api_keys(id)` so usage rows distinguish "key X used N tokens" from per-user totals. Backward-compat: legacy rows where Bearer was not used carry `api_key_id = NULL`.
- [ ] **FR-BROKER-E1-02** — Both Anthropic Messages and OpenAI Chat Completions broker paths write `broker_usage` rows on EVERY successful streaming and non-streaming completion. Token counts come from the upstream Anthropic `usage` object (or the OpenAI `usage` final chunk for non-streaming).
- [ ] **FR-BROKER-E1-03** — A streaming integration test against the OpenAI route asserts a `broker_usage` row is written with non-zero `prompt_tokens` + `completion_tokens` after a complete SSE stream (closes v29.3 C4 carry-forward to its full conclusion).
- [ ] **FR-BROKER-E2-01** — A new "API Keys" tab inside `Settings > AI Configuration` lists the user's keys (key id, label, prefix preview, created_at, last_used_at, revoked_at) with "Create Key" + "Revoke" buttons. The plaintext key from create is shown ONCE in a copy-to-clipboard modal.
- [ ] **FR-BROKER-E2-02** — The existing "Usage" subsection (v29.3 Phase 44) is enhanced: a per-key filter dropdown lets users see usage broken down by individual API key. Admin filter view (v29.3 `usage.getAll`) gains an `api_key_id` filter.

### VERIFY — Mandatory Live Verification (D-LIVE-VERIFICATION-GATE)

v30 Phase 63 closes ALL outstanding live-verification debt (v29.5 Phase 55 deferred + v29.4 carry + v29.3 carry) AND validates the new broker architecture works end-to-end with at least 3 external clients. This is the FIRST milestone the live-verification gate (introduced in v29.5 Phase 54) must pass cleanly without `--accept-debt`.

- [ ] **FR-VERIFY-V30-01** — Mini PC has been deployed via `bash /opt/livos/update.sh` with all v30 source. `Past Deploys` panel shows a `<ts>-success.json` row for the v30 SHA. All four services (`livos`, `liv-core`, `liv-worker`, `liv-memory`) report `active`.
- [ ] **FR-VERIFY-V30-02** — Bolt.diy live test: User installs Bolt.diy from marketplace, opens the app, sends a chat prompt. Response shows TOKEN-BY-TOKEN streaming (≥3 visible delta updates in the chat bubble); the model self-identifies as "Bolt" (NOT "Nexus") when asked; `broker_usage` table has a fresh row with non-zero token counts after the chat completes.
- [ ] **FR-VERIFY-V30-03** — Open WebUI live test: User connects Open WebUI to `api.livinity.io` with a `liv_sk_*` Bearer token, sends a chat prompt. Token streaming visible; the model honors Open WebUI's system prompt; `broker_usage` row written.
- [ ] **FR-VERIFY-V30-04** — Continue.dev live test: User configures Continue.dev with `api.livinity.io` and a `liv_sk_*` token. Code-completion request returns within Continue's 5s timeout; the model honors Continue's tool-use protocol if invoked.
- [ ] **FR-VERIFY-V30-05** — Raw curl smoke test: A direct `curl -H "Authorization: Bearer liv_sk_*" https://api.livinity.io/v1/messages` request from outside Mini PC's network (e.g., from Server5 itself or an external host) returns a streamed Anthropic-shape response.
- [ ] **FR-VERIFY-V30-06** — Anthropic Python SDK smoke test: `client = Anthropic(api_key='liv_sk_*', base_url='https://api.livinity.io')`; `client.messages.create(...)` returns a complete response. (Mirrors v29.3 Phase 42 UAT pattern.)
- [ ] **FR-VERIFY-V30-07** — All 14 carry-forward UATs are walked on Mini PC and recorded in `.planning/phases/63-live-verification/63-UAT-RESULTS.md`: 4 v29.5 (49/50/51/52/53/54), 4 v29.4 (45-48), 6 v29.3 (39-44). Each row: step ID | description | result (PASS/FAIL/BLOCKED) | evidence | timestamp.
- [ ] **FR-VERIFY-V30-08** — `/gsd-complete-milestone v30.0` returns audit `passed` (NOT `human_needed`) on its first invocation — i.e., the live-verification gate clears WITHOUT `--accept-debt`. This is the gate's first real-world clean pass.

---

## Out of Scope (v30.0)

Explicit exclusions per MILESTONE-CONTEXT.md "NOT in v30.0" plus what surfaced during requirement scoping:

- **Multi-provider concrete implementations** — D2 ships only the interface stub. Real OpenAI/Gemini/Mistral provider implementations defer to v30+. Reasoning: scope explosion; one provider (Anthropic) is enough to validate the architecture.
- **Mobile API key management UI** — desktop-only in v30. Mobile UI defers because the API-key flow is admin-heavy and the on-mobile use case (revoke a leaked key) is rare.
- **Webhook events (`api.livinity.io/webhooks`)** — defer. Out of scope for the broker professionalization narrative.
- **Embedding API (`/v1/embeddings`)** — Anthropic doesn't ship native embeddings; OpenAI-compat embedding requires a separate model layer; defer to v31+.
- **Vision/multimodal request handling spec compliance edge cases** — default behavior must work (image inputs forward unchanged), but exhaustive multimodal edge-case test sweep is v31+.
- **Subscription billing / quotas based on usage** — broker enforces only Anthropic upstream rate limits + a baseline token-bucket; per-user quotas tied to subscription tiers defer to a future "monetization" milestone.
- **Sacred file edits** — D-51-03 deferred Branch N reversal; if Phase 56 spike concludes the sacred file MUST change, it becomes a v30.1 hot-patch, NOT in-scope for v30.0 itself.
- **Backup & Restore (47 BAK-* reqs in `milestones/v30.0-DEFINED/`)** — superseded as the v30.0 milestone slot. Will renumber to a future milestone slot when broker work ships.

---

## Phase Traceability

Every requirement above maps to exactly one phase. Coverage: 38/38 (100%).

| Requirement       | Phase |
|-------------------|-------|
| FR-BROKER-A1-01   | 57    |
| FR-BROKER-A1-02   | 57    |
| FR-BROKER-A1-03   | 57    |
| FR-BROKER-A1-04   | 57    |
| FR-BROKER-A2-01   | 57    |
| FR-BROKER-A2-02   | 57    |
| FR-BROKER-B1-01   | 59    |
| FR-BROKER-B1-02   | 59    |
| FR-BROKER-B1-03   | 59    |
| FR-BROKER-B1-04   | 59    |
| FR-BROKER-B1-05   | 59    |
| FR-BROKER-B2-01   | 60    |
| FR-BROKER-B2-02   | 60    |
| FR-BROKER-C1-01   | 58    |
| FR-BROKER-C1-02   | 58    |
| FR-BROKER-C2-01   | 58    |
| FR-BROKER-C2-02   | 58    |
| FR-BROKER-C2-03   | 58    |
| FR-BROKER-C3-01   | 61    |
| FR-BROKER-C3-02   | 61    |
| FR-BROKER-C3-03   | 61    |
| FR-BROKER-D1-01   | 61    |
| FR-BROKER-D1-02   | 61    |
| FR-BROKER-D2-01   | 61    |
| FR-BROKER-D2-02   | 61    |
| FR-BROKER-E1-01   | 62    |
| FR-BROKER-E1-02   | 62    |
| FR-BROKER-E1-03   | 62    |
| FR-BROKER-E2-01   | 62    |
| FR-BROKER-E2-02   | 62    |
| FR-VERIFY-V30-01  | 63    |
| FR-VERIFY-V30-02  | 63    |
| FR-VERIFY-V30-03  | 63    |
| FR-VERIFY-V30-04  | 63    |
| FR-VERIFY-V30-05  | 63    |
| FR-VERIFY-V30-06  | 63    |
| FR-VERIFY-V30-07  | 63    |
| FR-VERIFY-V30-08  | 63    |

**Coverage:** 38/38 requirements mapped (100%).

**Phase 56 (research spike) holds zero requirements** — it is a research-only phase that produces architectural decisions consumed by Phases 57-62. The 7 open questions in `STATE.md` "Critical Open Questions for Phase 56 Research Spike" become 7 success criteria entries in the eventual `56-SPIKE-FINDINGS.md`.

**Phase counts at a glance:**

| Phase | Goal                                                | Reqs |
|-------|-----------------------------------------------------|------|
| 56    | Research Spike (passthrough + endpoint + auth)      | 0    |
| 57    | A1+A2 Passthrough Mode + Agent Mode Opt-In          | 6    |
| 58    | C1+C2 True Token Streaming                          | 5    |
| 59    | B1 Per-User Bearer Token Auth                       | 5    |
| 60    | B2 Public Endpoint + Rate-Limit Perimeter           | 2    |
| 61    | C3+D1+D2 Headers + Aliases + Provider Stub          | 7    |
| 62    | E1+E2 Usage Tracking + Settings UI                  | 5    |
| 63    | Mandatory Live Verification (D-LIVE-VERIFICATION)   | 8    |

**Note on requirement count:** the original `/gsd-new-milestone v30.0` handoff prompt referenced "31 requirements" — the actual file enumerates 38 individual checkbox items (4+2+5+2+2+3+3+2+2+3+2+8 across A1/A2/B1/B2/C1/C2/C3/D1/D2/E1/E2/VERIFY). The 38-row Phase Traceability table above is authoritative; the 31 figure was a prompt-side miscount. 100% coverage means 38/38, and that is what the table asserts.

---

*Last updated: 2026-05-02 — Phase Traceability filled by `gsd-roadmapper`. 38/38 requirements mapped to Phases 57-63 (Phase 56 research-only). Phase 63 closes D-LIVE-VERIFICATION-GATE.*
