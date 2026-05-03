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

*This file is updated incrementally as each plan in Phase 56 lands its verdicts. Plans 56-02 through 56-04 will append/expand additional sections.*
