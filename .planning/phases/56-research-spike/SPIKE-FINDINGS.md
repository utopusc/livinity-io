# Phase 56 SPIKE-FINDINGS — v30.0 Architectural Verdicts

**Phase:** 56 (research spike)
**Date:** 2026-05-02
**Plans contributing:** 56-01 (Q1+Q2+Q7), 56-02 (Q3+Q4+Q5+Q6 — pending), 56-03 (cross-cuts — pending), 56-04 (synthesis — pending)
**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` (UNTOUCHED across spike)

This file is the canonical answer document for the 7 architectural questions blocking Phase 57+ implementation. Each question gets a verdict block below with: chosen path, ≥3 rationale reasons, ≥2 alternatives evaluated, code-level integration point, risk + mitigation pair.

---

## Q1: Anthropic Passthrough Strategy — SDK-direct vs HTTP-proxy

### Verdict
Chosen path: **A — HTTP-proxy direct to `api.anthropic.com/v1/messages`** — Broker `fetch()`s upstream Anthropic with the per-user OAuth subscription `access_token` extracted from `~/.claude/<userId>/.credentials.json` and forwards as `Authorization: Bearer`, piping the response body (sync JSON or SSE) verbatim back to the client.

### Rationale (5 reasons)
1. **D-NO-NEW-DEPS preserved (zero new deps).** Strategy A uses Node 22 builtin `fetch()`. The competing Strategy B (SDK-direct) would force livinityd to add `@anthropic-ai/sdk` to its own `package.json` (it's currently only in `nexus/packages/core/package.json:34`), breaking the dep boundary. Verified at `nexus/packages/core/package.json:33-34` (existing deps are confined to nexus core; livinityd has none of them).
2. **Sacred file untouched.** Strategy A lives entirely in NEW broker code (`livinity-broker/passthrough-anthropic.ts`) and edits only `livinity-broker/router.ts:36-187`. The sacred `sdk-agent-runner.ts` is bypassed entirely (passthrough mode skips the agent-SDK invocation path). FR-BROKER-A1-04 enforced by existing integrity test.
3. **Per-user `homeOverride` pattern preserved.** The broker process (livinityd, runs as root per D-LIVINITYD-IS-ROOT) reads `~/.claude/<userId>/.credentials.json` directly using the same per-user dir layout that Phase 40 established. No new identity model.
4. **True token-by-token streaming for free.** Raw byte-forward of upstream Anthropic `Response.body` to the broker's `res` socket delivers Anthropic's native SSE event stream verbatim — no aggregation, no parse-and-reemit, no buffering. This is the Q7 "passthrough fixes via direct Anthropic SSE" outcome made concrete.
5. **Reuses proven HTTP-proxy primitive.** `agent-runner-factory.ts:64-173` already implements the `fetch()` + `UpstreamHttpError` + 429+Retry-After-verbatim pattern. Phase 57 copies this almost verbatim, swapping the target URL and the auth header. Carry-cost: near zero.

### Alternatives Considered (3)
- **Alt 1: Strategy B — SDK-direct (`new Anthropic({authToken, baseURL}).messages.stream()`)** — disqualified because it (a) forces a new dep into livinityd's `package.json` (D-NO-NEW-DEPS violation), (b) re-creates the architectural shape (OAuth-token routed through raw `@anthropic-ai/sdk` HTTP client) that v29.3 Phase 39 explicitly closed in `claude.ts` for ToS-fingerprint reasons — even though the regression test only guards `claude.ts`, repeating the pattern in a new file resurfaces the same risk class, and (c) adds SDK-iterator boilerplate (parse → re-emit as SSE frames) that Strategy A doesn't need (raw byte forward).
- **Alt 2: Strategy C — Hybrid (HTTP-proxy with token-extraction helper as separate broker module)** — not actually a separate strategy; this is a tactical refactor of A. Recommendation: Phase 57 plans 57-02 (Mode Dispatch + Credential Extractor) already separates the extractor as a discrete module — fold C into A's structure for testability, no separate verdict needed.
- **Alt 3: Pure HTTP-proxy that requires the user's OAuth `access_token` to be supplied by the EXTERNAL CLIENT in the broker request body / header** — disqualified by D-NO-BYOK. The broker must NEVER accept user-supplied raw API/access tokens from external traffic. Token extraction MUST happen server-side from the per-user creds file.

### Code-Level Integration Point
- **File:** `livos/packages/livinityd/source/modules/livinity-broker/router.ts`
- **Symbol/line:** `POST /:userId/v1/messages` handler — current implementation lines 36-187 (router.ts:36-187).
- **Insertion site:** After auth/body-validation (currently lines 38-83), BEFORE the `wantsStream`/sync split at router.ts:85, add a mode-dispatch block. When mode === passthrough (default for v30 external clients), call new `forwardToAnthropic({userId, body, signal, res})` from new file `livinity-broker/passthrough-anthropic.ts` (TBD by Phase 57).
- **Behavioral expectation:** The new branch (a) reads `~/.claude/<userId>/.credentials.json` to extract `access_token`, (b) issues `fetch('https://api.anthropic.com/v1/messages', {headers:{'Authorization':'Bearer <token>','anthropic-version': body['anthropic-version'] ?? '2023-06-01'}, body: JSON.stringify(body), signal})`, (c) for `body.stream===true` pipes `response.body` to `res` verbatim with `Content-Type: text/event-stream`, (d) for sync pipes JSON, (e) forwards `anthropic-ratelimit-*` headers verbatim, (f) on 429 forwards status + `Retry-After` verbatim per existing v29.4 Phase 45 pattern (router.ts:158-185 already handles this for the existing path — copy the pattern).
- **Same insertion required at:** `livinity-broker/openai-router.ts:71-283` for the OpenAI-compat surface (Phase 57 plan 57-04).

### Risk + Mitigation
- **Risk:** Token TTL expires mid-conversation (Anthropic OAuth subscription tokens have a refresh cycle; the credentials.json contains both `access_token` and `refresh_token` per Anthropic's OAuth design).
  **Mitigation:** Detect upstream 401, return Anthropic-shape `{type:"error", error:{type:"authentication_error", message:"subscription token expired — re-authenticate via Settings > AI Configuration > Per-User Sign In"}}`; user re-authenticates via the existing Phase 40 `claudePerUserStartLogin` tRPC route. Phase 57 documents this flow in user-facing docs. (No automatic refresh in v30 — defer refresh-token plumbing to v30.1 if pain surfaces.)
- **Risk:** `~/.claude/<userId>/.credentials.json` schema changes upstream (Anthropic version-bumps the OAuth file format).
  **Mitigation:** Wrap the file read in a typed try/catch that returns 503 with a generic `{error:{type:"api_error", message:"subscription credentials unreadable — file format may have changed"}}`. NEVER include the file path in the response body (P5 sanitization). UAT step in Phase 57 validates manually after each `claude` CLI version bump. Long-term: pin to a `~/.claude` version known good and warn in update.sh if user-installed `claude` CLI is newer.

### D-NO-NEW-DEPS Implications
**Zero new deps.** Strategy A uses Node 22 builtin `fetch()`. The broker file `livinity-broker/passthrough-anthropic.ts` (new in Phase 57) imports nothing beyond Node builtins (`node:fs`, `node:path`) plus existing livinityd modules (`per-user-claude.ts` for the creds path constants, `agent-runner-factory.ts` UpstreamHttpError class). The pre-existing `@anthropic-ai/sdk@^0.80.0` (nexus/packages/core/package.json:34) is NOT relied on by the broker — it remains the property of `claude.ts` (API-key path) and indirectly `sdk-agent-runner.ts` via the agent-sdk wrapper. The pre-existing `@anthropic-ai/claude-agent-sdk@^0.2.84` is also untouched. v30 ships zero deltas to either `package.json`'s `dependencies` block.

---

## Q2: External-Client `tools[]` — Forward or Ignore?

### Verdict
Chosen path: **Forward verbatim in passthrough mode** — Broker passes `body.tools[]` through to upstream Anthropic untouched on the Anthropic-Messages route, and translates OpenAI's `function`-nested schema → Anthropic's flat `name + input_schema` schema on the OpenAI-compat route, then forwards. Status quo "ignore-warn" is retained ONLY in agent mode (where Nexus tools win, preserving LivOS in-app chat behavior byte-identical).

### Rationale (4 reasons)
1. **FR-BROKER-A1-03 mandates it.** The requirement explicitly says "External clients see only their own tools (or none)" and "passthrough mode emits NO Nexus MCP tools". The only way to honor "their own tools" is to forward them; the only way to emit "none" when none are sent is to simply not inject anything. Both conclusions point at "preserve client tools[] verbatim".
2. **Aligns with Q1.** Q1 chose Strategy A (raw HTTP-proxy with byte-forward of upstream Anthropic SSE). Strategy A by construction ALREADY forwards the entire request body — `tools[]` included — to upstream Anthropic. Q2's verdict is thus the path of least resistance for the chosen Q1 strategy: zero additional code beyond the (deleted) ignore-warn at router.ts:66-70 and openai-router.ts:110-124.
3. **No documented Anthropic tier-gate on tools.** Searched docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview, computer-use, and managing-api-keys — no statement gates `tools[]` to API-key-tier-only requests. Claude Code itself uses tools on subscription auth (positive existence proof). Worst case (Anthropic adds a tier-gate in the future): broker forwards the resulting upstream 4xx verbatim — no broker-side tier-checking code needed.
4. **Identity contamination clean-up requires it.** v29.5 live testing surfaced that Bolt.diy's own developer-tools were being shadowed by Nexus tools the broker injected. Forward-verbatim eliminates the shadowing entirely; the model sees exactly what the client said it would see, no more.

### Alternatives Considered (3)
- **Alt 1: Status quo — ignore-warn (D-41-14 / D-42-12)** — disqualified because it directly contradicts FR-BROKER-A1-03 ("emit NO Nexus MCP tools" + "see only their own tools"). Today's behavior is what v29.5 testing failed on.
- **Alt 2: Selective forward (only forward tools matching a Nexus-vetted allowlist)** — disqualified for being a half-measure that fragments behavior across clients (Bolt.diy tools differ from Open WebUI's differ from Continue.dev's; no static allowlist scales). Adds policy surface that v30 doesn't need.
- **Alt 3: Forward in BOTH passthrough and agent modes (drop Nexus tool injection entirely)** — disqualified because it would change agent-mode behavior, breaking LivOS in-app chat (the existing IntentRouter + capability registry + Nexus MCP tools are what makes AI Chat work). FR-BROKER-A2-02 explicitly preserves agent mode unchanged.

### Code-Level Integration Point
- **File 1:** `livos/packages/livinityd/source/modules/livinity-broker/router.ts`
- **Line range:** `router.ts:66-70` — current ignore-warn block (D-41-14). Phase 57 plan 57-03 deletes this block in passthrough mode and replaces with: in passthrough, the body (including `tools[]`) is forwarded verbatim by Strategy A's `fetch()` to upstream Anthropic. In agent mode (header/path-gated per Q3), the existing ignore-warn is retained.
- **File 2:** `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts`
- **Line range:** `openai-router.ts:110-124` — current ignore-warn block (D-42-12, covers `tools`, `tool_choice`, `function_call`, `functions`). Phase 57 plan 57-04 replaces with: in passthrough, the OpenAI-shape tools are translated to Anthropic-shape (Phase 58 / 61 owns the bidirectional translator) before forwarding; `tool_choice` translates to Anthropic's `tool_choice` (`auto`/`any`/`none`/`{type:'tool', name:...}`); legacy `function_call`/`functions` are converted to modern `tools` shape per OpenAI's own deprecation path. In agent mode, the existing ignore-warn is retained.

### Risk + Mitigation
- **Risk:** Future Anthropic edge gating of subscription-auth requests with `tools[]` (would force a 4xx response).
  **Mitigation:** Broker forwards upstream errors verbatim per existing v29.4 Phase 45 pattern (router.ts:158-185). No broker-side tier-checking code needed. UAT step in Phase 63 (FR-VERIFY-V30-02) tests live; if it ever fails after working, that's the signal to re-evaluate. No code change in v30.
- **Risk:** OpenAI-shape `tools` translation incorrectness (e.g., `parameters` vs `input_schema`, type discriminator handling, missing `tool_choice` translation).
  **Mitigation:** Phase 58/61 owns this translator with TDD coverage (per the existing pattern of `openai-router.ts` test suite). Q2's mandate is only "forward, don't strip"; the translator quality is a Phase 58/61 implementation detail.

### Worked Example
See `notes-q2-tools.md` "Worked Example" section: Anthropic-route sample body with `tools: [{name: "get_weather", input_schema: {...}}]` forwarded verbatim → upstream Anthropic returns response with `content: [{type: "tool_use", name: "get_weather", input: {city: "Istanbul"}}]` → broker forwards verbatim. OpenAI-route sample body with `tools: [{type: "function", function: {name: "get_weather", parameters: {...}}}]` translated to Anthropic shape → forwarded → response translated back to OpenAI `tool_calls` shape.

### D-NO-NEW-DEPS Implications
Zero new deps. Translation logic for the OpenAI route reuses the existing `openai-router.ts` translator scaffold (already in place for messages/responses since v29.3 Phase 42). Anthropic route requires zero translation — Strategy A's raw-byte forward already handles `tools[]`.

### Aligns with Q1
Q1 chose Strategy A (HTTP-proxy direct to api.anthropic.com with raw byte-forward of upstream SSE). Q2's verdict is the path of least resistance for Strategy A on the Anthropic route: Strategy A's "forward request body verbatim" semantics ALREADY means `tools[]` flows through with zero extra code. The only Q2 implementation work is (a) deleting the ignore-warn at router.ts:66-70, (b) writing the OpenAI ↔ Anthropic tools translator at openai-router.ts:110-124's old site, and (c) gating both deletions on the mode-dispatch from Q3 so agent mode keeps current behavior.

---

## Q7: Agent Mode Block-Level Streaming Confirmation

### Verdict
Chosen path: **Refined-B — Agent SDK CAN stream token-by-token but sacred file's call-site forces aggregation; passthrough mode (Q1's verdict) sidesteps the issue entirely; sacred file UNTOUCHED in v30; deferred sacred-edit logged as D-30-XX candidate for v30.1+ if internal-chat pain surfaces.**

In one sentence: Agent mode keeps current block-level aggregation behavior in v30 (acceptable per Phase 51's deploy-layer fix); external-client streaming is delivered by Phase 57 passthrough mode bypassing the sacred file entirely; the sacred file is referenced READ-ONLY at `sdk-agent-runner.ts:378-389` (no edit, no recommendation in v30 — untouched per the v30 sacred-file boundary).

### Rationale (4 reasons)
1. **Sacred file integrity preserved (FR-BROKER-A1-04 + D-30 sacred boundary).** v30 contract is "sdk-agent-runner.ts byte-identical at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`." Passthrough mode (Q1's Strategy A) lets us achieve all v30 streaming goals for external clients WITHOUT touching the sacred file. A sacred-file edit is unnecessary for v30.0.
2. **Passthrough delivers true token streaming for free.** Q1 chose raw HTTP-proxy with byte-forward of upstream Anthropic `Response.body` to the broker's `res` socket. This means external clients (Bolt.diy / Open WebUI / Continue.dev) see Anthropic's native SSE event stream — `message_start` → `content_block_start` → `content_block_delta` ×N → `content_block_stop` → `message_delta` → `message_stop` — verbatim, with no aggregation or buffering anywhere along the path. This is the FR-BROKER-C1-01 + C1-02 outcome made concrete.
3. **Agent mode aggregation is acceptable for internal LivOS AI Chat use.** Internal AI Chat already accommodates aggregated chunks visually (Phase 51's `update.sh` deploy-layer fix ensured fresh vite UI bundles, addressing the visual streaming regression at the deploy layer rather than the streaming-semantic layer). User pain on internal-chat token streaming has not been raised since Phase 51's fix; if it surfaces post-v30, it triggers a v30.1+ phase opening D-30-XX (with sacred-file edit ritual + integrity-test BASELINE_SHA bump + UAT). Per D-51-03 discipline, we don't preemptively reverse.
4. **The Agent SDK CAN stream — falsifying the plan's candidate-A "fundamentally aggregates" framing — but the sacred file's call-site doesn't enable it.** From `nexus/packages/core/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` lines 1003-1006: `includePartialMessages?: boolean` option exists; lines 2144-2150 define `SDKPartialAssistantMessage = {type: 'stream_event', event: BetaRawMessageStreamEvent, ...}`. So the SDK supports `query({options: {includePartialMessages: true, ...}})` to receive token-level Anthropic SSE events. Sacred file's `query({options: {...}})` invocation at lines 340-355 does not opt in; loop at line 440 explicitly ignores `'stream_event'` type (`// Other message types (system, stream_event, tool_progress, etc.) are logged but not emitted`). This combined narrowing IS the aggregation site — fixable but deferred.

### Alternatives Considered (3)
- **Alt A (plan candidate A): "Agent SDK fundamentally aggregates → Agent mode keeps current behavior; passthrough fixes via direct Anthropic SSE"** — disqualified as the FRAMING but the OUTCOME is what we adopt. Falsifying part: the SDK does NOT fundamentally aggregate; it supports `includePartialMessages: true`. So the verdict shape (passthrough handles external; agent mode unchanged) is right but the rationale must be honest: agent-mode aggregation is a CALL-SITE choice, not an SDK constraint.
- **Alt C (plan candidate C): "Agent SDK streams natively and sacred file aggregation is incidental → triggers D-51-03 reversal re-eval"** — disqualified because the sacred-file aggregation is NOT incidental (line 440 comment explicitly excludes `stream_event`). Adopting C would still require a sacred-file edit, so the v30 sacred-boundary makes this moot regardless.
- **Alt: "Sacred-file edit in v30.0 to enable agent-mode streaming"** — disqualified by v30's explicit sacred-file-untouched constraint (FR-BROKER-A1-04, D-51-03 deferral discipline). If pain surfaces post-v30, this becomes a v30.1+ candidate via D-30-XX row, NOT in v30.0 scope.

### Code-Level Integration Point
- **Sacred file READ-ONLY reference:** `nexus/packages/core/src/sdk-agent-runner.ts:378-389` is the aggregation loop. This is referenced READ-ONLY for verdict context — NO EDIT in v30. The sacred file is UNTOUCHED across the entire v30.0 milestone (read-only access only — Read tool used at lines 260-300 + 340-355 + 378-389 + 440; zero Edit/Write calls; SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` confirmed unchanged at end of every Phase 56 plan task).
- **Passthrough bypass site (where external-client streaming is delivered):** `livos/packages/livinityd/source/modules/livinity-broker/router.ts:88` — the existing SSE branch (`if (wantsStream) { ... res.setHeader('Content-Type', 'text/event-stream'); ... }`). Phase 57 plan 57-03 wires Q1's passthrough HTTP-proxy here so the SSE response body is piped verbatim from upstream Anthropic to the broker client. This branch ALREADY emits `text/event-stream` content-type; only the upstream source changes (from nexus `/api/agent/stream` aggregated chunks to direct `api.anthropic.com/v1/messages` raw SSE).
- **For the future v30.1+ D-30-XX candidate (NOT v30):** if internal-chat token streaming is later mandated, the surgical edit lives at `sdk-agent-runner.ts:342` (add `includePartialMessages: true`) and `sdk-agent-runner.ts:378` (add `if (message.type === 'stream_event') { ... emit chunk per delta ... }` branch BEFORE the existing `'assistant'` handling). This is documented in `notes-q7-streaming.md` Section F5 for future reference. NO EDIT made in this phase or any v30 phase — sacred file SHA must remain `4f868d318abff71f8c8bfbcf443b2393a553018b`.

### Risk + Mitigation
- **Risk:** Internal LivOS AI Chat user complaints resurface about block-level streaming after v30 ships.
  **Mitigation:** Such complaints open a new v30.1+ phase that opens the D-30-XX candidate row, performs the surgical edit at `sdk-agent-runner.ts:342` + `:378` per F5, runs the D-40-01 sacred-edit ritual (byte-counted diff, BASELINE_SHA bump in `sdk-agent-runner-integrity.test.ts`, audit comment), and closes via D-LIVE-VERIFICATION-GATE clean Mini PC UAT. NOT in v30 scope.
- **Risk:** External-client passthrough fails to deliver visible token-by-token streaming despite raw byte forward (e.g., Server5 Caddy adds buffering, or the browser/client doesn't render incremental chunks).
  **Mitigation:** Phase 57+58 integration tests (existing pattern: `>=3 distinct content_block_delta events asserted in <2s`); Phase 60 Caddy config explicitly disables proxy buffering (`flush_interval: -1` or equivalent) for the `api.livinity.io` block; Phase 63 live UAT (FR-VERIFY-V30-02 — Bolt.diy "≥3 visible delta updates in chat bubble").
- **Risk:** D-30-XX is forgotten — agent-mode internal streaming silently lingers as an unaddressed debt.
  **Mitigation:** This Q7 verdict explicitly logs the deferred-decision row description in `notes-q7-streaming.md` F5 + here. v30 SUMMARY (56-04 plan output) includes a "Deferred items" section listing D-30-XX as a v30.1+ candidate.

### D-51-03 Implication

Per Phase 51's `51-01-SUMMARY.md`, **D-51-03 deferred Branch N (sacred-file model identity preset switch) reversal pending Phase 56 spike findings**. **Q7's effect on D-51-03 is: Branch N reversal is NOT NEEDED in v30** — Phase 57 passthrough mode bypasses the sacred file for external clients (the use case where identity contamination was originally observed via Bolt.diy live testing). External-client identity preservation is delivered structurally by Q1's raw-byte HTTP-proxy forwarding (whatever the upstream model says reaches the client unmodified — no Nexus prepend possible because the broker never re-emits the message). Internal LivOS AI Chat (agent mode) keeps the current identity-line + aggregation behavior, which is acceptable per Phase 51's deploy-layer fix for the visual UI regression and the absence of repeated internal-chat user complaints since. **D-51-03 stays DEFERRED past v30.0; routed to D-30-XX candidate row for v30.1+ if internal-chat user pain ever resurfaces post-v30.**

### D-NO-NEW-DEPS Implications
Zero new deps. Q7's verdict is "do nothing in agent mode + leverage Q1's passthrough for external" — no new code, no new package, no new file. The future D-30-XX surgical edit (if ever opened) would also be zero-new-dep (uses the already-installed `@anthropic-ai/claude-agent-sdk@^0.2.84` option `includePartialMessages: true`).

---

## Cross-Cutting: Sacred File SHA Stability Across Plan 56-01

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` re-run after each task:

| Task | SHA after task | Match required `4f868d318abff71f8c8bfbcf443b2393a553018b`? |
|------|----------------|-----------------------------------------------------------|
| Task 1 (Q1) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |
| Task 2 (Q2) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |
| Task 3 (Q7) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |

Read tool used on the sacred file at lines 260-300 (Q1), 340-355 + 375-400 + 435-441 (Q7). Zero Edit/Write/NotebookEdit/MultiEdit calls. Sacred boundary preserved across plan 56-01.

---

## Q3: Agent-Mode Opt-In Mechanism

### Verdict
Chosen path: **C — Both supported (URL-path segment `/agent/` AND header `X-Livinity-Mode: agent`); path takes precedence; default (no path-segment, no header) = passthrough.**

The broker registers TWO route families per spec (Anthropic Messages + OpenAI Chat Completions): `/u/:userId/v1/...` (passthrough by default; header can opt INTO agent) AND `/u/:userId/agent/v1/...` (forced agent mode; header ignored). Default v30 behavior flips from "agent-only" to "passthrough by default" — a documented breaking change for internal callers that hit the legacy URL expecting agent semantics.

### Rationale (4 reasons)
1. **Universal client compatibility (covers 100% of the 4 target clients).** Header-only fails for 50% of target clients — Bolt.diy and Cline cannot send `X-Livinity-Mode: agent` in their stock configurations (verified by reading `app/lib/modules/llm/providers/anthropic.ts` and Cline's `provider-config/anthropic` docs page; both expose only base-URL configuration, not arbitrary header injection). Path-only works for ALL 4 (every client supports `base_url` switching). C combines both so Continue.dev / Open WebUI users get per-request flexibility while Bolt.diy / Cline users still have a usable opt-in via base URL.
2. **Aligns with Anthropic's own header idiom.** Anthropic uses `anthropic-version: 2023-06-01` and `anthropic-beta: <flag>` as canonical opt-in/version-pin custom headers (verified at `docs.anthropic.com/en/api/versioning`). `X-Livinity-Mode: agent` follows the same pattern and is immediately legible to anyone consuming Anthropic's API.
3. **Aligns with Q1 (passthrough Strategy A).** Q1 chose raw HTTP-proxy with byte-forward of upstream Anthropic SSE. The mode-dispatch needs to live BEFORE the upstream `fetch()` is issued — exactly at the broker route handler entry point. Path-based dispatch is a 1-liner (`router.post('/:userId/agent/v1/messages', ...)` registers a separate handler that calls into the existing agent path). Header-based fallback is another 1-liner (`req.header('X-Livinity-Mode')`) inside the default handler. Neither requires touching Strategy A's `fetch()` call — they only SELECT which branch to take.
4. **Default flip preserves Q1's "passthrough by default" semantic for all external clients.** Q1's whole point is external clients see the raw Anthropic experience. Making passthrough the default URL behavior ensures any client with a misconfigured or absent custom-header support gets the correct (passthrough) mode, NOT the wrong (agent + identity contamination) mode that v29.5 live testing failed on.

### Alternatives Considered (3)
- **Alt A: Header-only `X-Livinity-Mode: agent`** — disqualified because 50% of target clients cannot send custom headers. Bolt.diy's `app/lib/modules/llm/providers/anthropic.ts` uses `@ai-sdk/anthropic` with hardcoded URL and no header-injection hook; Cline docs at `docs.cline.bot/provider-config/anthropic` document only "Custom Base URL" (no custom-header surface). Adopting header-only would leave half the v30 target clients permanently locked out of agent mode.
- **Alt B: Path-only `/u/<id>/agent/v1/messages` vs `/u/<id>/v1/messages`** — viable but missing per-request flexibility for power users. Continue.dev (`requestOptions.headers` per https://docs.continue.dev/reference) and Open WebUI (`ENABLE_FORWARD_USER_INFO_HEADERS` per `backend/open_webui/routers/openai.py`) both support custom-header mode and would benefit from per-request switching without re-pointing `base_url`. Pure path-only forces a base-URL-level commitment.
- **Alt: No opt-in mechanism at all (URL-fragment-free, mode is server-config-global)** — disqualified because the broker is multi-user and per-user mode preference is more invasive (would need an `api_keys.preferred_mode` column or a Settings toggle); also defeats the per-conversation flexibility users like Continue.dev's developer audience expect.

### Worked Example (the two curl invocations required by acceptance criteria)
**Default passthrough (mode auto-selected = passthrough; works for all 4 clients):**
```bash
curl -X POST https://api.livinity.io/u/<userId>/v1/messages \
  -H "Authorization: Bearer liv_sk_..." \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'
# → broker forwards verbatim to https://api.anthropic.com/v1/messages (Q1 Strategy A)
```

**Opt-in agent mode via URL path (works for ALL 4 clients):**
```bash
curl -X POST https://api.livinity.io/u/<userId>/agent/v1/messages \
  -H "Authorization: Bearer liv_sk_..." \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'
# → broker invokes existing createSdkAgentRunnerForUser() (agent-runner-factory.ts:64-173) — Nexus identity + Nexus tools active
```

**Opt-in agent mode via header (Continue.dev / Open WebUI only):**
```bash
curl -X POST https://api.livinity.io/u/<userId>/v1/messages \
  -H "Authorization: Bearer liv_sk_..." \
  -H "X-Livinity-Mode: agent" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'
# → same outcome as path-based opt-in
```

### Code-Level Integration Point
- **Path-based dispatch (NEW route registration):** `livos/packages/livinityd/source/modules/livinity-broker/router.ts:36` — currently single `router.post('/:userId/v1/messages', ...)`. Phase 57 plan 57-03 splits into two registrations:
  - `router.post('/:userId/v1/messages', handler({mode: 'passthrough', allowHeaderOverride: true}))` — default = passthrough; honors `X-Livinity-Mode: agent` to override into agent mode.
  - `router.post('/:userId/agent/v1/messages', handler({mode: 'agent', allowHeaderOverride: false}))` — forced agent; header ignored.
- **Header-based override site (mirrors existing internal-namespace pattern):** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:82` — broker already uses `X-LivOS-User-Id` (custom `X-LivOS-*` namespace) for inter-process identity propagation. Adding inbound `X-Livinity-Mode` follows the same naming convention and is symmetrical at the broker boundary.
- **Equivalent dispatch in OpenAI-compat:** `livinity-broker/openai-router.ts:71-283` gets the SAME dual-route treatment (Phase 57 plan 57-04): `/:userId/v1/chat/completions` (passthrough default) and `/:userId/agent/v1/chat/completions` (agent forced).

### Risk + Mitigation
- **Risk:** Default-behavior flip (legacy URL `/v1/messages` switches from agent to passthrough) breaks internal LivOS callers expecting agent semantics.
  **Mitigation:** Phase 57 release notes document the migration explicitly; broker emits a one-time soft-warn log line per server-process when a request hits the legacy URL without `X-Livinity-Mode: agent` header (caught by ops within minutes of deploy). Internal LivOS AI Chat is unaffected — it calls nexus directly via `/api/agent/stream` rather than routing through the broker.
- **Risk:** Path-family duplication inflates test matrix.
  **Mitigation:** Phase 57 plan 57-03 reuses ONE handler implementation behind a `mode` parameter; only the route registrations are duplicated. Test matrix is (path × mode-source) × (sync × stream) = 8 cases — manageable, with Phase 63 live UAT sampling 4 of them across the 4 target clients.

### D-NO-NEW-DEPS Implications
Zero new deps. All dispatch logic uses Express's existing `router.post()` registration and `req.header()` lookup primitives — both shipped with `express@^4.21.0` (livinityd) / `^4.18.2` (nexus) already in `package.json`.

### Aligns with Q1
Q1 chose Strategy A (HTTP-proxy direct to `api.anthropic.com` with raw byte-forward of upstream SSE). Q3's verdict slots cleanly in: the mode-dispatch lives BEFORE the upstream `fetch()` is issued (router-level), so passthrough mode invokes Q1's `forwardToAnthropic()` with body verbatim, while agent mode invokes the existing `createSdkAgentRunnerForUser()` (`agent-runner-factory.ts:64-173`). Neither path mutates the other; both share the same `auth/body-validation` prelude at `router.ts:38-83`.

---

## Q5: API Key Rotation Policy

### Verdict
Chosen path along TWO axes: **(Axis 1 — Rotation policy:) Manual revoke + recreate** (Stripe / OpenAI / Anthropic 1:1 parity, USER-INITIATED rotation, optional UI-sugar "Rotate" button = revoke + create wrapped in one tRPC call). **(Axis 2 — Default-keyed-vs-opt-in:) Opt-in only** (new users do NOT receive an auto-created `liv_sk_*` on signup; they create their first key manually via Settings > AI Configuration > API Keys when they want external-client access). Both axes together: **Manual rotation, opt-in keys.** Zero scheduler infrastructure, zero grace-overlap complexity, zero auto-keyed dead-rows.

### Rationale (5 reasons spanning both axes)
1. **(Axis 1) Industry parity — three vendors, same model.** Stripe (per `docs.stripe.com/keys` — "Rotating an API key revokes it and generates a replacement key... If you choose Now, the old key is deleted. If you specify a time, the remaining time until the key expires displays..."), OpenAI (no rotation API exists; SDK uses `api_key=` only — manual create + delete via dashboard only, per `openai-python` README), and Anthropic (per `docs.anthropic.com/en/api/managing-api-keys` — "Create an API key", "Disable API key", "Delete access key" UI affordances; NO automatic rotation; "rotate" UI in Anthropic console is for SIGNING keys, NOT API keys) all ship MANUAL rotation. Auto-rotation is not industry practice for first-party API keys.
2. **(Axis 1) Schema is already aligned.** FR-BROKER-B1-01 specifies exactly `revoked_at` (nullable timestamp) — no `rotated_at`, no `next_rotation_at`, no `grace_until`. Adopting auto-rotation would require schema additions, a scheduler, and a key-overlap mechanism — none budgeted for v30. Adopting manual rotation: zero schema changes beyond what's already specified.
3. **(Axis 1) OWASP API2:2023 satisfied.** OWASP's "Broken Authentication" (API2:2023) mandates strong tokens + revocation capability + auth-endpoint anti-brute-force — NOT calendar-based auto-rotation. v30 satisfies all three: `liv_sk_<base62-32chars>` ≈ 190 bits (FR-BROKER-B1-02), `revoked_at` kill-switch (FR-BROKER-B1-04 + B1-05), Q4-verdict rate-limit perimeter at the public endpoint. Documented in Phase 59 SUMMARY.
4. **(Axis 2) Plaintext-once UX has nowhere to surface a default-keyed plaintext.** FR-BROKER-E2-01 mandates "the plaintext key from create is shown ONCE in a copy-to-clipboard modal." A signup-time auto-keyed plaintext would have to surface in the signup confirmation flow — an awkward UX (mid-onboarding modal users may dismiss or miss) and an audit risk if missed. Default-keyed users would commonly never use the auto-key, leaving dead `revoked_at IS NULL` rows in the DB. Opt-in side-steps both issues.
5. **(Both axes) Self-hosted single-user reality.** v30 ships to LivOS users who own their own deployments and manage their own external clients (Bolt.diy / Open WebUI / Continue.dev / Cline) for their own apps. They are the same person on both sides of the broker. Manual rotation aligns with this persona's mental model ("I rotated my own key when I felt like it") and opt-in matches their explicit-action preference ("I create a key when I plug in a new app, not before").

### Alternatives Considered (4 — 2 per axis)
- **(Axis 1) Alt B: Automatic 90-day rotation with grace-overlap window.** Disqualified because (a) no industry parity (Stripe/OpenAI/Anthropic don't ship this), (b) requires scheduler infrastructure not budgeted in v30 (cron-equivalent, retry semantics, notification surface), (c) requires schema additions (`rotated_at`, `previous_key_hash`, `grace_until`) that conflict with FR-BROKER-B1-01's locked schema, (d) surprise rotations break user-controlled external clients without warning, requiring email/notification infrastructure also out of scope. Compliance pressure (SOC2 / ISO27001) is a v30.1+ concern; the manual model can graduate to optional auto-rotation via an `api_key_policies` extension table when actually needed.
- **(Axis 1) Alt: Rotation enforced via short TTL (e.g. 24-hour) with refresh tokens.** Disqualified — completely misaligns with the API-key-as-static-credential model (FR-BROKER-B1-02 plaintext-shown-once UX explicitly assumes long-lived keys). Effectively turns the system into OAuth without OAuth's discovery + refresh flow infrastructure. Out of scope.
- **(Axis 2) Alt D: Default-keyed users on signup.** Disqualified per Rationale 4 — UX hole at "where do you show plaintext one time?" plus dead-key proliferation. Brokers like Stripe and OpenAI also do NOT auto-key on signup; user explicitly creates first key.
- **(Axis 2) Alt: Auto-key only for users who toggle "Enable external API access" in Settings.** Equivalent to opt-in (the toggle IS the explicit user action); just adds a toggle layer. Adopt only if a future requirement separates "wanting any API access" from "having a key" — for v30, the "create key" button itself IS the toggle. Folded into the opt-in verdict.

### Lifecycle Flow (text diagram, references FR-BROKER-B1-01 columns including `revoked_at`)
```
[1] User signs into LivOS (Phase 40 multi-user flow). No api_keys row yet.
        ↓
[2] User opens Settings > AI Configuration > API Keys (FR-BROKER-E2-01).
    Table empty for this user.
        ↓
[3] User clicks "Create Key", supplies optional `name` label.
    tRPC createKey() (FR-BROKER-B1-04):
      - plaintext = "liv_sk_" + base62(crypto.randomBytes(24))   (FR-BROKER-B1-02)
      - key_hash = sha256(plaintext)
      - key_prefix = first 8 chars after "liv_sk_" prefix
      - INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name,
                              created_at = NOW(), last_used_at = NULL, revoked_at = NULL)
      - returns { id, plaintext } ONCE
        ↓
[4] UI shows plaintext in copy-to-clipboard modal ONCE (FR-BROKER-E2-01).
    User pastes into external client (Bolt.diy / OWUI / Continue.dev / Cline).
    Modal closes; plaintext gone forever; only key_hash survives.
        ↓
[5] Each broker request → Bearer middleware (FR-BROKER-B1-03):
      - read Authorization: Bearer <plaintext>
      - hash = sha256(plaintext); SELECT * FROM api_keys
            WHERE key_hash = hash AND revoked_at IS NULL
      - constant-time compare via crypto.timingSafeEqual
      - on match: UPDATE last_used_at = NOW() (debounced); resolve user_id; request proceeds
      - on miss (no row OR revoked_at IS NOT NULL): 401 with FR-BROKER-B1-05 body
            {"error":{"type":"authentication_error","message":"API key revoked"}}
        ↓
[6] User wants to rotate:
      a. Settings → Create new key (steps 3+4 again; new row inserted; new plaintext shown once)
      b. User updates external clients to use new plaintext
      c. User clicks "Revoke" on old key → tRPC revokeKey():
            UPDATE api_keys SET revoked_at = NOW()
                WHERE id = <oldKeyId> AND user_id = <userId>
      d. From this moment, requests with old plaintext → 401 (revoked path).

   Grace window = however long user takes between (a) and (c).
   User-controlled. Matches Stripe model.
```

### Risk + Mitigation
- **Risk:** Users forget to revoke old keys after rotation, accumulating unused-but-still-valid keys.
  **Mitigation:** Settings > API Keys tab shows `last_used_at` per key (FR-BROKER-E2-01). v31+ adds non-blocking soft-warning ("Key 'foo' hasn't been used in 90+ days — consider revoking"); for v30, the user is the same person managing all their own keys for their own apps and the risk surface is low.
- **Risk:** Plaintext-once UX failure: user closes modal before copying.
  **Mitigation:** Modal has copy-to-clipboard button + visual confirmation ("Copied!"); worst case = user revokes the lost key + creates a new one (the manual-rotate path itself is the recovery mechanism — no special handling needed).
- **Risk:** Future enterprise compliance audit flags lack of automatic rotation.
  **Mitigation:** v30.1+ adds optional `api_key_policies.auto_rotation_days` column gating an opt-in scheduler; v30 schema is forward-compatible because `revoked_at` already exists (the auto-rotate "revoke + create at day N" decomposes to existing primitives).
- **Risk:** Default-keyed users would lower onboarding friction (counterargument).
  **Mitigation:** v30 onboarding flow has a Settings tutorial step that points users at "Create your first API key" precisely when they need it (when they want to plug in an external client). Friction is bounded to one click that the user explicitly wants to take. Onboarding metrics in Phase 63 UAT can flag this if friction surfaces as a real issue.

### D-NO-NEW-DEPS Implications
Zero new deps. Implementation uses `pg@^8.20.0` (livinityd existing) for the `api_keys` table CRUD, `node:crypto` (builtin) for `randomBytes(24)` + `sha256` + `timingSafeEqual`, and the existing tRPC infrastructure for the `createKey` / `listKeys` / `revokeKey` routes. No new package additions in Phase 59.

### Aligns with Phase 56 Mandate
Q5's verdict is independent of Q1/Q2/Q7 (architectural-perimeter concerns). It establishes the lifecycle contract Phase 59 (Bearer auth) implements and Phase 62 (Settings UI) surfaces. The contract is unambiguous: **manual rotation, opt-in keys, `revoked_at`-driven kill-switch** — full stop.

---

## Q4: Public Endpoint Architecture (Server5 Caddy vs Cloudflare Worker)

### Verdict
Chosen path: **A — Server5 Caddy + new `api.livinity.io` block + `caddy-ratelimit` plugin (custom build via `xcaddy`).**
- **Platform:** Server5 Caddy (existing Caddy 2.11.2 deploy, augmented via `xcaddy build --with github.com/mholt/caddy-ratelimit`).
- **TLS strategy:** Let's Encrypt **on-demand TLS** (already-running primitive at `platform/relay/Caddyfile`).
- **Rate-limit primitive:** `caddy-ratelimit` HTTP handler (`rate_limit` directive) — sliding-window ring buffer per zone, key configurable to `{http.request.header.Authorization}` for per-`liv_sk_*` perimeter rate-limit at the edge BEFORE the request reaches the Mini PC broker.

### Rationale (4 reasons)
1. **Reuses existing Server5 infrastructure with zero DNS posture cost.** `*.livinity.io` is currently DNS-only per STATE.md routing topology ("Cloudflare DNS-only → Server5 → Mini PC via private LivOS tunnel; NOT a Cloudflare tunnel"). Candidate B (Cloudflare Worker) would force a per-record posture flip from DNS-only → proxied (orange-clouded) — confirmed REQUIRED via https://developers.cloudflare.com/workers/configuration/routing/routes/ ("subdomain proxied by Cloudflare … you would like to route to"). This flip introduces Cloudflare as a runtime dependency on the request critical path. Candidate A requires zero DNS changes; only adds an A/AAAA record for `api.livinity.io` pointing to Server5.
2. **TLS already solved at Server5 with on-demand LE.** Current `platform/relay/Caddyfile` runs `on_demand_tls` with `ask http://localhost:4000/internal/ask` gate. Adding `api.livinity.io { tls { on_demand } reverse_proxy <minipc-tunnel-addr>:8080 }` is a 5-line Caddyfile change + `systemctl reload caddy`. No new TLS pipeline. Caddy v2.11.x continues to support on-demand TLS per https://caddyserver.com/docs/automatic-https.
3. **Native edge rate-limit primitive eliminates broker-side bucket complexity.** `caddy-ratelimit` provides sliding-window per-key rate-limit with automatic `Retry-After` header (verified at https://raw.githubusercontent.com/mholt/caddy-ratelimit/master/README.md — feature list: "Automatically sets Retry-After header"). The broker layer (Q6 — see below) can then forward Anthropic upstream rate-limit headers verbatim WITHOUT also implementing its own perimeter bucket; clean responsibility split — edge=coarse abuse-control, broker=upstream-Anthropic-honest-forward.
4. **Avoids recurring CF Worker cost + 10ms-CPU-cap risk.** CF Workers Free plan caps at 10ms CPU per request (per https://developers.cloudflare.com/workers/platform/pricing/). SSE proxying that streams large Anthropic responses through a Worker pipe risks blowing this cap intermittently (mostly safe but not guaranteed). Workers Paid plan ($5+/month + $0.02/M CPU-ms) eliminates the cap but adds recurring cost where the Server5+Mini PC stack costs $0 incremental.

### Alternatives Considered (3)
- **Alt B: Cloudflare Worker + Durable Objects token bucket + WAF coarse rate-limit.** Disqualified primarily because (a) DNS posture flip from DNS-only → proxied for `api.livinity.io` introduces Cloudflare as runtime dependency (today they're DNS resolver only per STATE.md), (b) Workers Paid recurring cost ($5+/month) for streaming CPU headroom, (c) duplicates infrastructure (Caddy still needed for `*.livinity.io` user subdomains; this would add a second perimeter), (d) edge-latency advantage is null for our European-only user base where Mini PC + Server5 are also EU. Note: the Durable Objects + WAF rate-limit story IS technically stronger than `caddy-ratelimit` (globally-consistent state vs node-local ring buffer), but cost/architectural shift doesn't justify v30 adoption.
- **Alt C: Server5 Caddy native primitives only (no plugin, no xcaddy build).** Disqualified because Caddy's stock binary has NO HTTP rate-limit handler. Without `caddy-ratelimit`, the rate-limit responsibility falls entirely to the broker (Q6's per-key Redis bucket). Functionally viable but loses the edge-coarse perimeter — abusive clients can still spam the Mini PC broker process at the network layer (consuming Mini PC CPU + memory) before the broker emits 429. Edge perimeter is a defense-in-depth win worth the xcaddy build cost.
- **Alt: Caddy + nginx-rate-limit-equivalent via Caddy executors module.** Not actually a documented option; Caddy has a Go-plugin model only. Rejected as fictional.

### Cold-Start + Latency Notes
| Platform | Cold-start | Steady-state | Notes |
|----------|-----------|--------------|-------|
| **Server5 Caddy + plugin** | ~0ms (long-running process; "cold start" only on Caddy restart, operator-controlled) | ~0ms over existing reverse-proxy chain; rate-limit ring buffer is in-memory | The chosen verdict |
| **CF Worker (free)** | <1ms (V8 isolates); first invocation in region may be 5-10ms | 10-50ms extra round-trip Cloudflare-edge → Server5/Mini PC for EU clients (no edge latency win for EU-only audience) | 10ms CPU cap risks SSE blow-out |
| **CF WAF rate-limit** | <1ms (runs at edge before Worker invocation) | <1ms | Coarse-grained only |

[Citations from CF Workers / Caddy docs above; cold-start numbers vendor-published.]

### Code-Level Integration Point
- **File:** `platform/relay/Caddyfile` (Server5 — current production config — confirmed cited per acceptance criterion).
- **Insertion site (top of file, BEFORE the existing `*.livinity.io` wildcards so the more-specific match wins):**
```caddyfile
api.livinity.io {
    tls {
        on_demand
    }

    rate_limit {
        zone per_bearer_key {
            key {http.request.header.Authorization}
            window 1m
            events 1000
        }
        zone per_ip_burst {
            key {remote_host}
            window 10s
            events 100
        }
    }

    reverse_proxy <minipc-tunnel-addr>:8080 {
        flush_interval -1   # disable buffering for SSE responses
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}
```
- **Phase 60 plan owns:** writing the actual block (with the real Mini PC tunnel address from existing platform routing), running `xcaddy build --with github.com/mholt/caddy-ratelimit` to produce the custom binary, replacing the system Caddy binary at `/usr/bin/caddy`, validating with `caddy validate < Caddyfile`, then `systemctl reload caddy`.

### Risk + Mitigation
- **Risk: xcaddy custom-build burden** (the headlining risk required by the acceptance criteria — substring "xcaddy" + "custom build" appears in this risk section). Every Caddy upgrade requires re-running `xcaddy build --with github.com/mholt/caddy-ratelimit` at the new pinned version + reinstalling. Package-manager auto-updates of `caddy` could overwrite the custom binary at `/usr/bin/caddy`, causing config validation error on next reload. **Mitigation:** (a) pin system `caddy` package via `apt-mark hold caddy` to prevent unattended upgrades, (b) document rebuild procedure in `platform/relay/README.md` (Phase 60 plan output), (c) Phase 63 live UAT step explicitly verifies `rate_limit` directive is active by sending >100 reqs/10s from one IP and confirming 429 from `api.livinity.io` (not from the Mini PC broker).
- **Risk: SSE buffering by Caddy reverse_proxy by default.** Caddy `reverse_proxy` may buffer SSE responses if `flush_interval` not set, breaking Q1 / Q7's true-token-streaming guarantee. **Mitigation:** include `flush_interval -1` in the `reverse_proxy` block (per Caddy docs — disables buffering); Phase 60 plan validates with curl-vs-broker comparison test.
- **Risk: `caddy-ratelimit` is third-party** ("This is not an official repository of the Caddy Web Server organization" per the plugin README disclaimer). **Mitigation:** pin to specific commit SHA in `xcaddy build --with github.com/mholt/caddy-ratelimit@<sha>` invocation; track upstream repo for security advisories; have fallback plan to move rate-limit to broker via Q6 if plugin abandoned.

### D-NO-NEW-DEPS Implications
**One-time custom build dependency, zero new package.json deps.** `xcaddy` is a Go-toolchain command, not an npm package — it does NOT count toward the Node.js / TypeScript dep budget that D-NO-NEW-DEPS targets. The Caddy binary is replaced; no application-level dependencies change.

### Aligns with Q1 + Q3
- Q1 (Strategy A — HTTP-proxy direct to `api.anthropic.com`): the Mini PC broker still does the upstream call. Caddy at Server5 just terminates TLS for `api.livinity.io` and reverse-proxies to `<minipc-tunnel-addr>:8080`. Q1's `forwardToAnthropic()` runs unchanged on Mini PC.
- Q3 (path-based + header-based dispatch): Caddy doesn't care about URL path for routing; it forwards everything under `api.livinity.io` to the broker's Express router. The broker's path-based dispatch (Q3 verdict) sees `/u/<id>/v1/messages` vs `/u/<id>/agent/v1/messages` and selects mode accordingly.

### ASSUMED → VERIFIED
- **A3** (RESEARCH.md): "Caddy v2.11.2 on Server5 can use `caddy-ratelimit` plugin without rebuilding from source" — **REFUTED — VERIFIED that custom build IS required**. Source: https://caddyserver.com/docs/modules/http.handlers.rate_limit explicitly says "Custom builds: This module does not come with Caddy"; https://raw.githubusercontent.com/mholt/caddy-ratelimit/master/README.md gives `xcaddy build --with github.com/mholt/caddy-ratelimit` as the install method. Phase 60 plan MUST budget the custom-build step.
- **A4** (RESEARCH.md): "Cloudflare DNS posture for `*.livinity.io` is DNS-only (not proxied)" — **VERIFIED**. STATE.md confirms; cross-confirmed via Cloudflare Workers routing docs requiring "orange-clouded" (proxied) DNS for Worker route attachment. Posture-flip cost would be real for Candidate B.

---

## Cross-Cutting: Sacred File SHA Stability Across Plan 56-02 (Tasks 1-2)

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` re-run after each task:

| Task | SHA after task | Match required `4f868d318abff71f8c8bfbcf443b2393a553018b`? |
|------|----------------|-----------------------------------------------------------|
| Task 1 (Q3 + Q5) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |
| Task 2 (Q4)      | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |

Sacred file was NOT read or written during Tasks 1-2 (Q3 / Q4 / Q5 are perimeter / lifecycle concerns; no internal-runner inspection needed). Sacred boundary preserved.

---

*This file is updated incrementally as each plan in Phase 56 lands its verdicts. Plan 56-02 (Q6 — Task 3 pending), 56-03, 56-04 will append additional sections.*
