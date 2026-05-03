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

(Pending — written in Task 2.)

---

## Q7: Agent Mode Block-Level Streaming Confirmation

(Pending — written in Task 3.)

---

*This file is updated incrementally as each plan in Phase 56 lands its verdicts. Plans 56-02 through 56-04 will append/expand additional sections.*
