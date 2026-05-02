# Phase 56: Research Spike — Passthrough Architecture + Public Endpoint + Auth Patterns — META-Research

**Researched:** 2026-05-02
**Domain:** Meta-research — guides the spike that will produce SPIKE-FINDINGS.md
**Confidence:** HIGH (existing-code refs verified by Read; external sources are URLs the executor will fetch)

## Summary

Phase 56 is itself a research spike. This document is META-research that the planner consumes to write a tasks list whose execution produces `SPIKE-FINDINGS.md` (the canonical answer document for 7 open architectural questions blocking Phase 57+).

For each of the 7 questions, this document inventories: (1) authoritative external sources the executor must fetch; (2) exact file:line references in the existing repo to ground decisions in current behavior; (3) a 2-3-candidate decision framework so the executor produces a verdict, not open exploration; (4) a risk inventory per candidate so the planner can write verification steps.

**Primary recommendation:** Plan ≥7 tasks (one per question) plus 2 cross-cutting tasks (sacred-file SHA stability check; D-NO-NEW-DEPS verdict). Each task is a verdict-producing investigation, not open exploration. Each verdict block in SPIKE-FINDINGS.md must include: chosen path + ≥2 alternatives evaluated + ≥3 rationale reasons + code-level integration point + risk/mitigation pair (per CONTEXT.md decisions).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Research Methodology:**
- **Primary sources:** Anthropic API official docs (docs.anthropic.com), Anthropic TypeScript/Python SDK source on GitHub, Anthropic Messages SSE spec, OpenAI Chat Completions spec, `livinity-broker/` source code in this repo, `nexus/packages/core/src/sdk-agent-runner.ts` (sacred file — read but don't edit), `nexus/packages/core/src/providers/claude.ts`.
- **Secondary sources:** competitor self-host brokers (LiteLLM, OpenRouter), Caddy on-demand TLS docs, Cloudflare Workers docs, Bearer-token patterns from Stripe / OpenAI / Anthropic.
- **Tools:** WebSearch + WebFetch for external; Read + Grep for in-repo.
- **Output discipline:** Each of the 7 questions gets a verdict block in SPIKE-FINDINGS.md with: chosen path, ≥2 alternatives evaluated, rationale (≥3 reasons), code-level integration point named (file path + symbol + behavioral expectation), risk/mitigation pair.

**Sacred File Boundary:**
- MAY read `nexus/packages/core/src/sdk-agent-runner.ts`. MUST NOT modify it. "Should change line N" recommendations go to a deferred D-30-XX decision row, NOT a v30 code edit.
- MUST verify SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` before AND after the spike. Drift = phase blocker. **Verified at start of meta-research: matches.**

**Out-of-Scope:**
- No edits to source files under `livinity-broker/`, `livos/`, `nexus/`, `livinity-io-platform/`.
- No SSH to Mini PC or Server5. Desk-research only.
- No `npm install`. Researcher MAY evaluate whether `@anthropic-ai/sdk` should be adopted, but cannot install.

### Claude's Discretion

- Exact SPIKE-FINDINGS.md ordering and visual format (tables vs prose).
- Choice of ≥2 alternatives per question (researcher selects competing approaches).
- Whether to produce intermediate research notes or fold into one file. Either OK as long as SPIKE-FINDINGS.md is the single canonical answer document.

### Deferred Ideas (OUT OF SCOPE)

- Multi-provider concrete implementations (D2 ships interface stub only; OpenAI/Gemini/Mistral concrete defer).
- Webhook events, embedding API.
- Subscription billing / usage-based quotas.
- Sacred file edits (D-51-03 deferred; if spike concludes a sacred edit is mandatory, it becomes a v30.1 hot-patch — NOT in v30.0).
- Mobile API key management UI.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Passthrough request forwarding | livinityd (Express, port 8080) | — | Broker lives there today; same router gets a new branch |
| Upstream call to Anthropic | livinityd OR `api.anthropic.com` direct | nexus core (only in agent-mode path) | Question 1's verdict picks the tier owner |
| Bearer token validation | livinityd Express middleware | PG `api_keys` table | Phase 59 — auth tier owns it |
| TLS termination + rate-limit perimeter | Server5 Caddy OR Cloudflare Worker | — | Question 4's verdict picks tier |
| SSE token streaming (passthrough) | livinityd (proxy stream pipe) | upstream Anthropic | Question 7 confirms passthrough bypasses sacred file's aggregation |
| Agent mode (legacy) | nexus `sdk-agent-runner.ts` | livinityd HTTP proxy | UNCHANGED — sacred file untouched |

**Why this matters:** Each question maps to a tier decision. Misassignment (e.g., "validate Bearer in nexus core") would break the architectural boundary that v30 establishes.

## Standard Stack (verified in repo)

### Already-present libraries usable for v30 work (no new deps)

| Library | Version | Location | Purpose | Source |
|---------|---------|----------|---------|--------|
| `@anthropic-ai/sdk` | `^0.80.0` | `nexus/packages/core/package.json:34` | Anthropic Messages SDK (already imported by `claude.ts`) | [VERIFIED: package.json] |
| `@anthropic-ai/claude-agent-sdk` | `^0.2.84` | `nexus/packages/core/package.json:33` | The Agent SDK that sacred file uses (Strategy A path) | [VERIFIED: package.json] |
| `express` | `^4.21.0` (nexus) / `^4.18.2` (livinityd) | both package.json | Broker router host | [VERIFIED] |
| `ioredis` | `^5.4.0` | both | Already used for capability registry, broker cache | [VERIFIED] |
| `pg` | `^8.20.0` | livinityd | PostgreSQL — Phase 59 `api_keys` table | [VERIFIED] |
| `node:crypto` | builtin | — | SHA-256 hash + base62 random for `liv_sk_*` | [VERIFIED] |

**Critical implication for D-NO-NEW-DEPS:** `@anthropic-ai/sdk@^0.80.0` is ALREADY a dependency of `@nexus/core`. The "should v30 add it?" question in CONTEXT.md is moot — it is present. The real D-NO-NEW-DEPS question is: does Phase 57 passthrough need any NEW dep? Likely NO — `fetch()` (Node 22 builtin) handles HTTP-proxy strategy; `@anthropic-ai/sdk` handles SDK-direct strategy. Surface this in the SDK-direct-vs-HTTP-proxy verdict (Question 1).

### Verification commands (executor runs these)
```bash
# Confirm current SDK version on registry vs pinned
npm view @anthropic-ai/sdk version
# Confirm Caddy version on Server5 (from memory: v2.11.2)
# Confirm Anthropic API base URL
curl -sI https://api.anthropic.com/v1/messages
```

## Existing-Code Map (executor MUST read these)

### Broker router files
| File | Key lines | What it does | Use in spike |
|------|-----------|--------------|--------------|
| `livos/packages/livinityd/source/modules/livinity-broker/router.ts` | 36-187 | Anthropic Messages route handler — sync (line 118) + SSE (line 88) | Q1 integration point: passthrough branch inserts here |
| `livos/packages/livinityd/source/modules/livinity-broker/router.ts` | 66-70 | D-41-14 warn-and-ignore client `tools[]` | Q2 integration point: passthrough flips to forward |
| `livos/packages/livinityd/source/modules/livinity-broker/router.ts` | 158-185 | UpstreamHttpError 429 + Retry-After forward (Phase 45) | Q6 reference: existing rate-limit forwarding pattern |
| `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` | 71-283 | OpenAI chat/completions handler | Q1+Q2 integration: same passthrough branch needed here |
| `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` | 110-124 | D-42-12 warn-and-ignore client tools / tool_choice / functions | Q2 integration point: passthrough forwards |
| `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` | 64-173 | `createSdkAgentRunnerForUser` — HTTP proxy to `/api/agent/stream` (Strategy B) | Q1 reference: existing HTTP-proxy mechanism to mirror or replace |
| `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` | 92-106 | `fetch()` to nexus → throws `UpstreamHttpError` on non-OK | Q1 pattern to copy for `api.anthropic.com` |
| `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` | 89-177 | OpenAI SSE adapter — Phase 58 rewrites as 1:1 translator | Q7 reference: shows current aggregation pain point |
| `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` | 32-68 | `containerSourceIpGuard` — 401s non-RFC-1918 IPs | Q4 context: Phase 60 removes this when Bearer auth lands |

### Sacred file (read-only — verify SHA before/after)
| File | Key lines | What it does | Use in spike |
|------|-----------|--------------|--------------|
| `nexus/packages/core/src/sdk-agent-runner.ts` | 264-270 | Identity-line prepend (`You are powered by Claude X.Y…`) | Q1 confirms passthrough must NOT call this code path |
| `nexus/packages/core/src/sdk-agent-runner.ts` | 297 | `HOME: this.config.homeOverride || process.env.HOME` | Q1 ref: how subscription auth dir gets selected |
| `nexus/packages/core/src/sdk-agent-runner.ts` | 378-389 | Block-level streaming aggregation site | Q7 confirms why agent-mode aggregates; passthrough bypasses |

### Existing Claude provider (D-NO-BYOK reference)
| File | Key lines | What it does |
|------|-----------|--------------|
| `nexus/packages/core/src/providers/claude.ts` | 6 | `import Anthropic from '@anthropic-ai/sdk'` — already imported |
| `nexus/packages/core/src/providers/claude.ts` | 34-42 | `ClaudeAuthMethodMismatchError` — Phase 39 OAuth-fallback closure |
| `nexus/packages/core/src/providers/claude.ts` | 99-100 | `getClient()` — explicit-API-key path; subscription routes through SdkAgentRunner |

### Caddy + platform infra
| File | What it has | Use in spike |
|------|-------------|--------------|
| `platform/relay/Caddyfile` | Server5 Caddy: on-demand TLS, ask endpoint at `localhost:4000/internal/ask`, wildcards for `*.livinity.io` + `*.*.livinity.io` + on-demand HTTPS catch-all | Q4 reference: where Phase 60 adds `api.livinity.io` block IF Caddy chosen |

### Historical decisions to skim
| File | Why |
|------|-----|
| `.planning/milestones/v29.3-phases/41-anthropic-messages-broker/41-SUMMARY.md` | Strategy B (HTTP proxy to /api/agent/stream) decision rationale — Q1 anti-baseline |
| `.planning/milestones/v29.3-phases/41-anthropic-messages-broker/41-AUDIT.md` | Codebase audit before broker built — Q1 SDK-direct rejection rationale |
| `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-01-SUMMARY.md` | D-51-03 Branch N deferral rationale — feeds the D-51-03 re-evaluation sub-question |

## Source Inventory (per question — what executor fetches)

### Q1: SDK-direct vs HTTP-proxy to api.anthropic.com

**Authoritative external:**
- `https://docs.anthropic.com/en/api/messages` — Messages API spec (request/response shape)
- `https://docs.anthropic.com/en/api/messages-streaming` — SSE event sequence
- `https://github.com/anthropics/anthropic-sdk-typescript` — SDK source; especially `src/resources/messages/messages.ts` (streaming) and `src/index.ts` (auth)
- `https://docs.anthropic.com/en/api/getting-started` — auth header (`x-api-key` vs `Authorization: Bearer`)
- `https://docs.anthropic.com/en/api/client-sdks` — SDK-vs-direct guidance

**In-repo:**
- `nexus/packages/core/src/providers/claude.ts:6,99` — current SDK init pattern
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:64-173` — current HTTP-proxy pattern (Strategy B); copy/adapt for upstream Anthropic

**Decision framework:**
| Candidate | When chosen | Disqualifier |
|-----------|-------------|--------------|
| **A. HTTP-proxy direct to `api.anthropic.com/v1/messages`** | If subscription auth can be implemented via header forwarding from per-user `~/.claude/<id>/.credentials.json` token | If `~/.claude` token cannot be safely extracted by livinityd (root-only file perms, sacred-file-touch needed) |
| **B. SDK-direct (`new Anthropic({...}).messages.stream()`)** | If `@anthropic-ai/sdk` supports passing an explicit access token (not just API key) AND can route via per-user HOME without sacred-file edits | If SDK only supports `apiKey` env (D-NO-BYOK conflict — broker can't accept user's raw key) |
| **C. Hybrid: HTTP-proxy with subscription token extracted by livinityd** | If A blocked AND B blocked, but a per-user token-extraction helper can be written in livinityd (NOT sacred file) | If extraction requires reading `~/.claude/<id>/` files which only the sacred-file's HOME-isolated subprocess has permission for |

**Verdict criteria (in priority order):** (1) D-NO-BYOK preserved; (2) Sacred file untouched; (3) Per-user `homeOverride` pattern preserved; (4) Streaming SSE flows token-by-token without aggregation; (5) Fewest moving parts.

### Q2: External-client `tools[]` — forward or ignore?

**Authoritative external:**
- `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview` — `tools` array shape (name/description/input_schema)
- `https://docs.anthropic.com/en/docs/build-with-claude/computer-use` — confirms `tools` works with subscription auth (test claim before stating)
- `https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools` — OpenAI shape for translation parity

**In-repo:**
- `livinity-broker/router.ts:66-70` — current ignore-warn pattern (D-41-14)
- `livinity-broker/openai-router.ts:110-124` — OpenAI ignore-warn (D-42-12)

**Decision framework:**
| Candidate | When chosen | Disqualifier |
|-----------|-------------|--------------|
| **Forward verbatim in passthrough mode (default)** | If Anthropic API accepts `tools[]` from subscription-auth requests (executor must verify with a doc citation) | If subscription tier rejects tools (would force tier-check + 400 response) |
| **Ignore-warn (status quo)** | If subscription path rejects tools at upstream | If verification shows subscription supports tools |

**Verdict criteria:** Verify by fetching Anthropic docs explicit subscription-vs-API-key tier matrix. If absent, recommend forwarding by default and let upstream reject if applicable (so broker isn't second-guessing user intent).

### Q3: Agent-mode opt-in mechanism

**Authoritative external:**
- `https://docs.anthropic.com/en/api/versioning` — header-based versioning convention (precedent for `X-*` headers)
- HTTP RFC 7231 §5.3 — semantics of custom request headers
- `https://platform.openai.com/docs/api-reference/authentication` — OpenAI uses Bearer + base URL, no opt-in headers (precedent: don't fragment URL)

**In-repo:**
- `livinity-broker/router.ts:36` — current path: `POST /:userId/v1/messages` (URL-path identity)
- `livinity-broker/agent-runner-factory.ts:82` — `X-LivOS-User-Id` header precedent

**Decision framework:**
| Candidate | When chosen | Disqualifier |
|-----------|-------------|--------------|
| **A. Header `X-Livinity-Mode: agent`** | If clients can be configured to send custom headers (Bolt.diy / OpenWebUI both allow this) | If a major target client cannot send custom headers |
| **B. URL path `/u/<id>/agent/v1/messages` vs `/v1/messages`** | If header-customization is non-uniform across target clients | Adds URL fragmentation; clients pointing `base_url` once can't switch |
| **C. Header + path both supported (path overrides header if both)** | If smoothest migration | More surface to test |

**Verdict criteria:** (1) External clients (Bolt.diy / Open WebUI / Continue.dev / Cline) ability to send custom headers — verify with each client's docs; (2) Default behavior with no opt-in = passthrough; (3) Worked example: `curl -H "X-Livinity-Mode: agent"` vs no header → which sacred file path activated.

### Q4: Public endpoint — Server5 Caddy vs Cloudflare Worker

**Authoritative external:**
- `https://caddyserver.com/docs/modules/http.handlers.rate_limit` — Caddy v2 rate-limit handler (third-party `mholt/caddy-ratelimit`)
- `https://caddyserver.com/docs/automatic-https` — on-demand TLS already in `platform/relay/Caddyfile`
- `https://developers.cloudflare.com/workers/platform/pricing/` — Workers pricing + free-tier limits (10ms CPU)
- `https://developers.cloudflare.com/workers/runtime-apis/streams/` — streams support (verify SSE passthrough viable)
- `https://developers.cloudflare.com/workers/configuration/bindings/about-service-bindings/` — service bindings vs HTTP fetch
- `https://developers.cloudflare.com/waf/rate-limiting-rules/` — CF WAF rate-limit rules (separate from Workers)
- `https://developers.cloudflare.com/durable-objects/` — Durable Objects for per-key token-bucket (vs KV which is eventual-consistency)

**In-repo:**
- `platform/relay/Caddyfile` — current Server5 Caddy config (on-demand TLS already running)

**Decision framework:**
| Candidate | When chosen | Disqualifier |
|-----------|-------------|--------------|
| **A. Server5 Caddy + new `api.livinity.io` block** | If existing infra reuse + LE on-demand TLS suffices; rate-limit via `caddy-ratelimit` plugin | Caddy plugin requires custom Caddy build (not the stock binary) |
| **B. Cloudflare Worker** | If edge cache + DO-backed rate-limit are valuable AND CF Workers free-tier handles streaming SSE | Free tier has 10ms CPU cap — verify SSE passthrough is acceptable; CF DNS-only currently (not proxied) — would need DNS posture flip |
| **C. Server5 Caddy with native `caddy.events` + `route` matchers (no plugin)** | If a custom-Caddy build is rejected | Fewer rate-limit primitives; manual implementation required |

**Verdict criteria:** (1) Pair with TLS strategy (LE on-demand vs CF-managed); (2) Pair with rate-limit primitive name; (3) Cold-start latency target (CF Worker ≈ 0ms; Caddy ≈ 0ms after warm); (4) Whether CF DNS posture flip is acceptable (currently DNS-only; CF Worker requires proxied/orange-cloud).

### Q5: API key rotation policy

**Authoritative external:**
- `https://stripe.com/docs/keys#rolling-keys` — Stripe's manual-rotate model with grace period
- `https://platform.openai.com/api-keys` (and docs page) — OpenAI manual-rotate, no auto-rotation
- `https://docs.anthropic.com/en/api/managing-api-keys` — Anthropic's key lifecycle
- OWASP API Security 2023 — credential lifecycle guidance

**In-repo:**
- `nexus/packages/core/src/providers/claude.ts:51-52` — Redis key rotation pattern reference
- REQUIREMENTS.md FR-BROKER-B1-01..05 — `api_keys` table schema + lifecycle expectations

**Decision framework:**
| Candidate | When chosen | Disqualifier |
|-----------|-------------|--------------|
| **A. Manual revoke + recreate (Stripe/OpenAI/Anthropic precedent)** | Standard industry pattern; no scheduler complexity | None — strongest baseline |
| **B. Automatic 90-day rotation with grace overlap** | If compliance posture requires periodic rotation | Adds scheduler + key-overlap complexity for self-hosted single-user reality |
| **C. Default-keyed users (auto-create one key on signup)** | If onboarding UX needs frictionless first-call | Conflicts with "show plaintext once" UX (no place to surface auto-key) |

**Verdict criteria:** Default-keyed vs opt-in is a separate axis. Recommend stating both: rotation policy AND default-keyed-or-not.

### Q6: Rate-limit policy

**Authoritative external:**
- `https://docs.anthropic.com/en/api/rate-limits` — Anthropic's `anthropic-ratelimit-*` headers + 429 + Retry-After
- `https://platform.openai.com/docs/guides/rate-limits` — OpenAI's `x-ratelimit-*` headers
- `https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.3` — Retry-After format spec (delta-seconds OR HTTP-date)
- `https://en.wikipedia.org/wiki/Token_bucket` — algorithm reference for broker-side bucket

**In-repo:**
- `livinity-broker/router.ts:158-185` — existing 429 + Retry-After forwarding (Phase 45 pattern)
- `livinity-broker/agent-runner-factory.ts:99-106` — `UpstreamHttpError` with `retryAfter` capture

**Decision framework:**
| Candidate | When chosen | Disqualifier |
|-----------|-------------|--------------|
| **A. Forward Anthropic upstream rate limits verbatim, no broker-side bucket** | If goal is "transparent broker" (matches Anthropic exactly) | Allows abusive client to consume entire user's subscription quota without per-key cap |
| **B. Broker-side token bucket per `liv_sk_*` key + forward upstream limits when more restrictive** | If per-key fairness or abuse-control matters | Adds Redis-backed bucket complexity (already have ioredis) |
| **C. Server5 Caddy/CF perimeter rate-limit (coarse) + forward verbatim (fine-grained)** | Pairs with Q4 verdict | Two layers may double-429 |

**Verdict criteria:** REQUIREMENTS.md FR-BROKER-B2-02 says baseline "default = the user's Anthropic subscription rate forwarded transparently; broker-side token-bucket TBD pending Phase 56 spike." Verdict resolves the "TBD."

### Q7: Block-level streaming for Agent mode

**Authoritative external:**
- `https://docs.anthropic.com/en/api/messages-streaming` — confirms Anthropic SSE event sequence (`message_start` → `content_block_start` → `content_block_delta` ×N → `content_block_stop` → `message_delta` → `message_stop`)
- `https://github.com/anthropics/claude-agent-sdk` — Agent SDK source: confirm whether it aggregates by design

**In-repo:**
- `nexus/packages/core/src/sdk-agent-runner.ts:378-389` — aggregation site (sacred-file READ ONLY)
- `livinity-broker/openai-sse-adapter.ts:117-149` — adapter consumes already-aggregated chunks

**Decision framework:**
| Candidate | Verdict |
|-----------|---------|
| **A. Confirm: Agent SDK fundamentally aggregates → Agent mode keeps current behavior; passthrough fixes via direct Anthropic SSE** | Most likely outcome — read Agent SDK source to verify |
| **B. Find that Agent SDK can stream token-by-token but sacred file's loop forces aggregation → recommend D-30-XX deferred sacred-edit** | Possible — escalates to D-51-03 reversal |
| **C. Find that Agent SDK streams natively and sacred file aggregation is incidental** | Triggers re-evaluation of Branch N reversal — answers D-51-03 sub-question with "still needed" |

**Verdict criteria:** Agent SDK source examination determines outcome. If A, D-51-03 stays deferred. If B/C, D-51-03 gets a verdict ("v30.1 hot-patch" or "still deferred").

### D-51-03 sub-question: Branch N reversal still needed in v30?

**Verdict criteria:**
- If Q1's passthrough verdict eliminates Nexus-identity-line for external clients → external identity contamination resolved → Branch N reversal NOT needed for external use case.
- Internal LivOS AI Chat still goes through agent mode → identity-line still emitted there.
- Verdict options:
  1. "Not needed in v30 — passthrough handles external; agent mode internal-only and identity-line acceptable there"
  2. "Still needed as v30.1 hot-patch — sacred-edit batched separately"
  3. "Re-evaluate after Phase 63 live verification with internal AI Chat self-identification test"

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anthropic SSE parsing | Custom event-line parser | `@anthropic-ai/sdk@^0.80.0` `messages.stream()` (already in deps) | Spec-correct event boundaries; handles ping events |
| Anthropic API auth header construction | Custom `Authorization` builder | `@anthropic-ai/sdk` client | SDK handles `x-api-key` / `anthropic-version` / Bearer combinations |
| TLS for `api.livinity.io` | Custom cert provisioning | Caddy on-demand TLS (already in `platform/relay/Caddyfile`) OR CF-managed | Existing infra |
| Token bucket per key | Custom counter | Redis `INCR` with TTL or `cell-rate-limiter`-style pattern (no new dep — just ioredis primitives) | Atomic ops free in Redis |
| Random key generation | Math.random / weak entropy | `node:crypto.randomBytes(24)` → base62 encode → 32 chars (~190 bits) | Crypto-grade, no dep |

## Common Pitfalls

### P1: Mistaking `@anthropic-ai/sdk` presence as auto-OK for D-NO-NEW-DEPS
**What goes wrong:** Researcher recommends "use SDK" forgetting `@anthropic-ai/claude-agent-sdk` (a DIFFERENT package) is what `sdk-agent-runner.ts` uses, while `@anthropic-ai/sdk` is what `claude.ts` uses. Confusing them produces wrong integration points.
**How to avoid:** Always cite full package name + which file imports it. The Messages SDK is `@anthropic-ai/sdk`; the Agent SDK is `@anthropic-ai/claude-agent-sdk`. Both already in nexus core deps (lines 33-34 of `nexus/packages/core/package.json`).

### P2: Assuming subscription auth tokens can be forwarded as `Authorization: Bearer`
**What goes wrong:** Reading "Anthropic supports Bearer auth" without distinguishing API-key path (`x-api-key` header) from subscription/OAuth path (Bearer of access_token from `~/.claude/<id>/.credentials.json`). Researcher conflates the two and proposes a passthrough that doesn't match Anthropic's actual auth model.
**How to avoid:** Cite Anthropic docs page that explicitly distinguishes; verify by reading `~/.claude/.credentials.json` schema referenced in `claude.ts` (and don't assume token TTL).

### P3: Recommending sacred-file edits without flagging D-30-XX
**What goes wrong:** Researcher hits a wall and writes "we should change line N of sdk-agent-runner.ts" — violates CONTEXT.md decision boundary.
**How to avoid:** Any sacred-file change recommendation MUST be tagged "D-30-XX deferred decision row" and routed to v30.1 hot-patch consideration, NOT v30 in-scope work.

### P4: Forgetting CF DNS-only posture
**What goes wrong:** Recommending CF Worker for `api.livinity.io` without noting that `*.livinity.io` is currently CF DNS-only (not proxied/orange-cloud per STATE.md). Worker requires proxied — which would change DNS posture for all subdomains.
**How to avoid:** Cite STATE.md "Cloudflare DNS-only → Server5 → Mini PC" and treat the posture flip as a cost in candidate B.

### P5: Confusing "Server4" with "Server5"
**What goes wrong:** Recommending deploys to Server4 — explicitly forbidden by HARD RULE 2026-04-27 in user memory.
**How to avoid:** Verdicts touch ONLY Mini PC (`bruce@10.69.31.68`) + Server5 (`45.137.194.102`).

## Validation Architecture

### How spike conclusions get validated (Phase 56 is research-only — these are the tests in SPIKE-FINDINGS.md, NOT Phase 56 plan tests)

| Verdict | Validation in SPIKE-FINDINGS.md |
|---------|--------------------------------|
| Q1 (SDK-direct vs HTTP-proxy) | Code snippet showing chosen integration into `livinity-broker/router.ts` (file:line) + expected request/response shapes from Anthropic docs |
| Q2 (tools forward vs ignore) | Doc citation from Anthropic showing tools accepted for chosen auth tier + worked request/response example |
| Q3 (header vs path) | Worked `curl` invocation showing opt-in vs default; client-compat matrix (Bolt.diy / Open WebUI / Continue.dev / Cline custom-header support) |
| Q4 (Caddy vs CF Worker) | TLS strategy named + rate-limit primitive named + cold-start measurement-plan named |
| Q5 (rotation policy) | Lifecycle flow diagram referencing `api_keys.revoked_at` column + worked rotation procedure |
| Q6 (rate-limit policy) | Header forwarding wire-fixture + (if broker-side bucket) Redis schema for `bucket:<keyId>` + algorithm constants |
| Q7 (Agent mode block-streaming) | Reference to sacred-file lines 378-389 + Agent SDK source URL confirming aggregation + verdict on whether D-51-03 is reversed |
| Cross-cutting: D-NO-NEW-DEPS | `package.json` diff: zero new deps in any verdict's integration plan; OR explicit "this verdict requires X" callout (forces Phase 57+ to budget the dep) |
| Cross-cutting: Sacred file SHA | Re-run `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` at end of spike → must equal `4f868d318abff71f8c8bfbcf443b2393a553018b` |

### Sampling rate
- Per task: each spike task ends with a verdict block written to SPIKE-FINDINGS.md; no automated test runs
- Phase gate: SHA stability check + verdict-completeness check (no "TBD" rows) before phase closes
- No Wave 0 tests needed — Phase 56 is research-only; the framework "tests" are the verdicts themselves

## Environment Availability

Skipped — Phase 56 is desk-research only. CONTEXT.md prohibits SSH and `npm install`. Tools needed are: WebSearch + WebFetch + Read + Grep — all guaranteed available.

## Security Domain

| ASVS Category | Applies | Standard Control (verdict-relevant) |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer-token validation (Phase 59 — Q5 verdict feeds rotation policy) |
| V3 Session Management | no | Stateless API keys (no sessions) |
| V4 Access Control | yes | per-user `user_id` resolution from key hash (Q5) |
| V5 Input Validation | yes | Anthropic Messages body validation already in `router.ts:43-63`; passthrough preserves it |
| V6 Cryptography | yes | SHA-256 key hash + base62 random — `node:crypto` standard |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bearer key leakage in logs | Information Disclosure | Log only `key_prefix` (first 8 chars) — already pattern in REQUIREMENTS.md FR-BROKER-B1-01 |
| Subscription token leakage via passthrough error message | Information Disclosure | Q1 verdict must specify error sanitization (no `~/.claude/<id>/` paths in 500 bodies) |
| Cross-user key reuse | Spoofing / EoP | Constant-time hash compare (FR-BROKER-B1-02) — `node:crypto.timingSafeEqual` |
| Replay of revoked key | Spoofing | `revoked_at` check on every request — Q5 verdict locks lifecycle |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@anthropic-ai/sdk@^0.80.0` supports `messages.stream()` with both `apiKey` and access-token auth | Standard Stack / Q1 framework | If only `apiKey`, candidate B in Q1 fails; researcher must fall back to A or C |
| A2 | Anthropic API accepts client `tools[]` from subscription-auth requests | Q2 framework | If rejected, Q2 verdict flips to "ignore (status quo)" — passthrough behavior matches D-41-14 |
| A3 | Caddy v2.11.2 on Server5 can use `caddy-ratelimit` plugin without rebuilding from source | Q4 framework | If plugin needs custom build, candidate A in Q4 disqualified or budget includes Caddy rebuild step |
| A4 | Cloudflare DNS posture for `*.livinity.io` is DNS-only (not proxied) | Q4 P4 pitfall | If actually proxied, CF Worker candidate has lower migration cost than stated |
| A5 | Anthropic SDK Python equivalent supports `base_url` override (used in FR-VERIFY-V30-06) | Q1 verdict downstream | Verify before Phase 63 — affects Phase 63 UAT script |

**Action:** Each `[ASSUMED]` claim must be VERIFIED by the executor when the spike runs (Step 3 of execution_flow). The executor either flips to `[VERIFIED: <source>]` or escalates to a discuss-phase question.

## Open Questions (for the executor running the spike)

1. **Anthropic subscription auth — does `~/.claude/<id>/.credentials.json` carry an `access_token` that can be forwarded as `Authorization: Bearer`, or is it tied to a process spawn?** — answers Q1 candidate B viability. Source: read `claude.ts` and Agent SDK source.
2. **Does the Agent SDK's `query()` API expose token-level streaming events, or does it only callback on aggregated assistant turns?** — answers Q7 directly. Source: `@anthropic-ai/claude-agent-sdk` source on GitHub.
3. **Are Bolt.diy / Open WebUI / Continue.dev / Cline configurable to send `X-Livinity-Mode` custom request header?** — answers Q3 candidate A viability. Source: each client's docs.

## Sources

### Primary (HIGH confidence — verified in repo)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` — entire file read
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` — entire file read
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` — entire file read
- `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` — entire file read
- `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` — header read
- `nexus/packages/core/src/sdk-agent-runner.ts` — lines 260-300 + 375-400 read
- `nexus/packages/core/src/providers/claude.ts` — lines 1-100 read
- `nexus/packages/core/package.json` — full read
- `livos/packages/livinityd/package.json` — full read
- `platform/relay/Caddyfile` — full read
- `.planning/phases/56-research-spike/56-CONTEXT.md` — full read
- `.planning/STATE.md` — full read (7 questions verbatim)
- `.planning/REQUIREMENTS.md` — full read (38 reqs)
- `.planning/ROADMAP.md` — full read
- `.planning/PROJECT.md` — full read
- `.planning/milestones/v29.3-phases/41-anthropic-messages-broker/41-SUMMARY.md` — strategy B history
- `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-01-SUMMARY.md` — D-51-03 rationale
- `git hash-object` of sacred file — verified `4f868d318abff71f8c8bfbcf443b2393a553018b`

### Secondary (executor MUST fetch — flagged as URLs only)
- All `https://docs.anthropic.com/...` and `https://platform.openai.com/...` URLs listed under Source Inventory per question
- All `https://caddyserver.com/...` and `https://developers.cloudflare.com/...` URLs listed under Q4
- Stripe/OpenAI/Anthropic key-management docs listed under Q5

### Tertiary (LOW confidence — meta-research's own assumptions)
- See Assumptions Log

## Metadata

**Confidence breakdown:**
- Existing code map: HIGH — verified by Read tool
- Sacred file SHA: HIGH — verified `4f868d318abff71f8c8bfbcf443b2393a553018b` matches at start of meta-research
- Decision frameworks: HIGH structure / MEDIUM content — frameworks are correctly shaped for the questions; concrete content depends on executor fetching external docs
- External source URLs: HIGH — these ARE the canonical Anthropic / Caddy / CF docs; URL stability is the only risk
- Assumptions: LOW (by definition — flagged as `[ASSUMED]`)

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (30 days; if executor runs spike after this date, re-verify Anthropic SDK version + Caddy rate-limit plugin status)
