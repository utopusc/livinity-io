# External Client Compatibility Matrix

**Status:** Phase 64 deliverable (v31.0 entry — CARRY-04)
**Last verified:** 2026-05-03 (live curl tests against `https://api.livinity.io` — see references)
**Owner:** Livinity Broker team
**Doc location:** `.planning/docs/external-client-compat.md`

---

## Constraint reminder (D-NO-BYOK)

All external clients route through the **Livinity Broker** (`api.livinity.io`) over the
**subscription path**. No client may use a raw `@anthropic-ai/sdk` API key, raw OpenAI
key, or any bring-your-own-key (BYOK) flow. The user's Claude Max subscription is
the *only* upstream credential, and it lives at `/root/.claude/.credentials.json` on
the Mini PC under the `BROKER_FORCE_ROOT_HOME=true` envelope. Clients authenticate
to the broker with a per-client `liv_sk_...` key (broker-issued) and the broker then
translates onto the subscription path. Never raw API keys, never BYOK — this is the
sacred D-NO-BYOK constraint (origin: memory `feedback_subscription_only.md`).

The broker exposes two protocols, both of which are token-translated through the
same subscription auth chain:

- **Anthropic-style:** `POST https://api.livinity.io/v1/messages`
  - Code: `livos/packages/livinityd/source/modules/livinity-broker/router.ts`
  - Default mode: `passthrough` (tools[] forwarded verbatim)
- **OpenAI-style:** `POST https://api.livinity.io/v1/chat/completions`
  - Code: `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts`
  - Default mode: `passthrough` (tools[] translated via `buildAnthropicBodyFromOpenAI`
    on the way in, `translateToolUseToOpenAI` on the way out)

Both routes also exist under the per-user mount `POST /u/:userId/v1/messages` and
`POST /u/:userId/v1/chat/completions` for multi-user routing.

---

## Compat matrix

| Client | Auth mode | Endpoint | Streaming | Tool calls | Verified status | Known quirks | Reference |
|---|---|---|---|---|---|---|---|
| **Bolt.diy** | livinity broker key (`liv_sk_*` via OpenAI-compatible client config) | `/v1/chat/completions` | SSE (`stream:true`) | **broken at client** — Bolt does NOT send `tools[]` in the upstream request, so the broker has nothing to translate; the visible "plain text instead of tool calls" symptom is therefore a **Bolt-side bug**, not a broker bug | partial — chat completions work, tool calling does not | Bolt's `OpenAILike` provider was designed for code-completion models without function calling: it injects a system prompt asking for markdown code blocks and parses those blocks itself. Mitigation paths: (a) configure Bolt as `Anthropic` provider with custom base URL `https://api.livinity.io` if Bolt supports it, (b) test agentic loop with a tool-native client first (Cline / Continue.dev), (c) fork Bolt's `OpenAILike` provider to inject `tools[]`. See P74 carryover note below — **NOT** in P74 scope. | memory `reference_broker_protocols_verified.md` (2026-05-03 live curl proves broker tool routing works when client sends `tools[]`); memory `project_v30_5_resume.md` (Suna pattern using broker injection) |
| **Cursor** | livinity broker key (Bearer or `x-api-key`) | `/v1/messages` (Anthropic-style) | SSE (`stream:true`) | works — broker forwards `tools[]` verbatim under passthrough mode; `tool_use` blocks return cleanly | **verified (live, 2026-05-03)** — broker test returned `tool_use(file_write, …)` end-to-end | Configure Cursor in **Anthropic-protocol mode** with custom base URL `https://api.livinity.io`. Sends `anthropic-version: 2023-06-01` header (broker accepts and forwards). Token-cadence preference (block-aggregated vs token-by-token) → see F2 in P74. | memory `reference_broker_protocols_verified.md` (Anthropic `/v1/messages` curl PASSED); v30.0 milestone summaries (Phase 63 R-series broker professionalization) |
| **Cline** | livinity broker key (Bearer or `x-api-key`) | `/v1/messages` (Anthropic-style) | SSE (`stream:true`) | works — multi-tool agentic loops verified | **verified (live, 2026-05-03)** | Cline reads `anthropic-version` header — broker forwards `2023-06-01` correctly. Multi-turn `tool_result` content has subtle protocol-shape differences between `/v1/messages` and `/v1/chat/completions` → see F3 in P74. Cline relies on `/v1/messages` so it is the *less* affected of the two. | memory `reference_broker_protocols_verified.md`; memory `project_v30_5_resume.md` (Cline among the F6-LIVE clients reaching broker via x-api-key, commit `4a7c7932`) |
| **Continue.dev** | livinity broker key (Bearer) | `/v1/chat/completions` (OpenAI-style) | SSE (`stream:true`) | works — `tools[{type:"function", function:{...}}]` round-trip verified, returns `tool_calls[]` with `finish_reason:"tool_calls"` | **verified (live, 2026-05-03)** | Configure with `apiBase: https://api.livinity.io/v1` and OpenAI-style provider. Translation path: OpenAI in → `buildAnthropicBodyFromOpenAI` → Anthropic upstream → `translateToolUseToOpenAI` → OpenAI out (see `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts:419,514`). Token cadence preference → F2 in P74. | memory `reference_broker_protocols_verified.md` (OpenAI `/v1/chat/completions` curl PASSED) |
| **Open WebUI** | livinity broker key (Bearer) | `/v1/chat/completions` (OpenAI-style) | SSE (`stream:true`) | works for chat completions; tool calling depends on Open WebUI's own pipeline configuration (broker correctly translates `tools[]` when Open WebUI sends them) | **verified (live, 2026-05-03)** for chat; tool routing inferred from `/v1/chat/completions` curl PASS | Open WebUI auto-detects model list via `GET /v1/models` — confirm broker exposes that route (or configure Open WebUI with an explicit model list pointing at the broker's advertised models). Long agentic sessions may hit Caddy idle-timeout → see F4 in P74. Per-user identity preservation across turns → see F5 in P74. | memory `reference_broker_protocols_verified.md`; v30.0 phase summaries (Phase 63 broker hardening) |

---

## Open carryovers (scheduled to P74 — Phase 74 "F2-F5 Carryover from v30.5")

The following broker work items affect cross-client behavior and are tracked in
**Phase 74 (P74)** in `.planning/ROADMAP.md` (line 47, 222). They are **NOT failures**
— they are scheduled work explicitly deferred from v30.5 close (see memory
`project_v30_5_resume.md` lines 93-95):

- **F2 — Token-cadence streaming.** Some clients (notably Cursor and Continue.dev)
  prefer token-by-token SSE cadence rather than block-aggregated. The broker
  currently ships block-aggregated for both protocols. P74 reconciles. Affects:
  Cursor, Continue.dev, Open WebUI.
- **F3 — Multi-turn `tool_result` protocol.** When a client sends a follow-up
  message including `tool_result` content blocks (Anthropic-style) or `tool` role
  messages (OpenAI-style), broker forwarding semantics differ subtly between
  `/v1/messages` and `/v1/chat/completions`. P74 unifies. Affects: Cline (less),
  Continue.dev (more), Open WebUI (more).
- **F4 — Caddy timeout.** Long-running streaming responses can hit upstream Caddy
  idle-timeout when the broker is fronted by Caddy at the edge (`api.livinity.io`).
  Mitigation in P74. Affects: any client running long agentic sessions, especially
  Cline and Open WebUI.
- **F5 — Identity preservation across turns.** Per-user OAuth identity passthrough
  in multi-turn flows; relevant when broker is behind multi-user routing
  (`/u/:userId/v1/messages`). Tracked under P74. Affects: all clients in
  multi-user deployments.

The **Bolt.diy "plain-text instead of tool calls"** symptom is **NOT** in this list
— it is a **Bolt-side bug** (Bolt does not include `tools[]` in upstream requests
despite the user enabling tools in Bolt's UI). It will close naturally once Bolt
upstream fixes the issue or once we ship a Bolt-specific shim. **No P74 work
needed** for the Bolt symptom; the broker is already correct (verified by curl
2026-05-03 — passing `tools[]` through `/v1/chat/completions` returns proper
`tool_calls[]` with `finish_reason:"tool_calls"`).

---

## References

- Memory: `reference_broker_protocols_verified.md` — 2026-05-03 live curl proofs
  for both `/v1/messages` and `/v1/chat/completions` end-to-end tool routing;
  Bolt root-cause attribution.
- Memory: `feedback_subscription_only.md` — D-NO-BYOK constraint origin (user
  statement 2026-04-29: subscription only, never API key).
- Memory: `project_v30_5_resume.md` — v30.5 close state, F2-F5 disposition,
  F6 (external client compat / x-api-key) shipped LIVE in commit `4a7c7932`.
- Code: `livos/packages/livinityd/source/modules/livinity-broker/router.ts` —
  Anthropic-style `/v1/messages` route, default mode `passthrough`.
- Code: `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` —
  OpenAI-style `/v1/chat/completions` route, default mode `passthrough`.
- Code: `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts`
  — `buildAnthropicBodyFromOpenAI` (line 419) and `passthroughOpenAIChatCompletions`
  (line 514) implement the OpenAI ↔ Anthropic translation.
- Code: `livos/packages/livinityd/source/modules/livinity-broker/index.ts` —
  per-user mount at `/u/:userId/v1/messages` (line 16) and `/u/:userId/v1/chat/completions`.
- Roadmap: `.planning/ROADMAP.md` Phase 74 (`F2-F5 Carryover from v30.5`,
  BROKER-CARRY-01..05).
- Phase context: `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-CONTEXT.md`
  decisions D-09, D-10, D-11, D-12.
