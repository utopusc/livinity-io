# v29.3 Roadmap — Marketplace AI Broker (Subscription-Only)

**Milestone:** v29.3 Marketplace AI Broker (Subscription-Only)
**Granularity:** fine
**Phase numbering:** Continues from v29.2 (last shipped phase = 38) — v29.3 starts at Phase 39.
**Total phases:** 6
**Coverage:** 17/17 v1 requirements mapped (no orphans)

**Locked decisions enforced across all phases:**
- D-RISK-01 — Phase 39 deletes `claude.ts` OAuth fallback BEFORE any new broker work begins.
- D-TOS-02 + D-NO-BYOK — All broker work routes through `SdkAgentRunner.run()`. Never raw HTTP. Never BYOK / API key prompt.
- D-TOS-01 — No single-subscription fan-out. Every user has their own OAuth.
- D-CONTAINER-01 — Broker hostname is `livinity-broker` on the internal Docker network.
- D-NO-SERVER4 — Mini PC (`bruce@10.69.31.68`) only. Server4 is off-limits.
- **Sacred:** `nexus/packages/core/src/sdk-agent-runner.ts` — broker layer wraps it externally; internals untouched.

---

## Phases

- [ ] **Phase 39: Risk Fix — Close OAuth Fallback** — Delete the raw-SDK + subscription-token code path in `claude.ts` so subscription tokens can never reach `@anthropic-ai/sdk` directly.
- [ ] **Phase 40: Per-User Claude OAuth + HOME Isolation** — Each user runs their own `claude login`, credentials live in their own user HOME, and `SdkAgentRunner` spawns with the calling user's HOME.
- [ ] **Phase 41: Anthropic Messages Broker** — `POST /v1/messages` (sync + SSE streaming) on `livinity-broker`, translates Messages-format requests into `SdkAgentRunner.run()` and resolves the calling container's owner user_id.
- [ ] **Phase 42: OpenAI-Compatible Broker** — `POST /v1/chat/completions` (sync + streaming) with bidirectional OpenAI ↔ Anthropic translation, model-name mapping, and OpenAI-SDK smoke test.
- [ ] **Phase 43: Marketplace Integration (Anchor: MiroFish)** — Manifest `requires_ai_provider: true` flag with auto-injection of `ANTHROPIC_BASE_URL` / `ANTHROPIC_REVERSE_PROXY` / `LLM_BASE_URL` env vars at install time; MiroFish anchor verified end-to-end.
- [ ] **Phase 44: Per-User Usage Dashboard** — Settings > AI Integrations shows per-user token / app / monthly totals; admin sees per-app cross-user view; subscription rate-limit warnings + 429 surfacing.

---

## Phase Details

### Phase 39: Risk Fix — Close OAuth Fallback
**Goal:** Make it structurally impossible for a Claude OAuth subscription token to reach the raw `@anthropic-ai/sdk` HTTP path. After this phase, `ClaudeProvider.getClient()` either uses an explicitly-set API key or throws — there is no third option.
**Depends on:** Nothing (must be first — D-RISK-01)
**Requirements:** FR-RISK-01
**Success Criteria** (what must be TRUE):
  1. `grep -rn "authToken: token" nexus/packages/core/src/providers/claude.ts` returns zero matches that reference `claudeAiOauth`.
  2. When a user with subscription-only auth (no Redis API key) triggers any code path that previously called `ClaudeProvider.getClient()`, the call either routes through `SdkAgentRunner` (the legitimate path) or throws a clear "use Agent SDK / subscription mode" error — never silently falls back to raw HTTP with the OAuth token.
  3. When a user with an explicit Redis-stored API key calls `ClaudeProvider.getClient()`, the existing API-key path continues to work (BYOK regression test passes — even though BYOK is out of scope for new features, the existing path for legacy admins must not break).
  4. `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical to its pre-Phase-39 SHA (sacred file untouched — verified by `git diff` showing no changes inside the file body).
**Plans:** TBD

### Phase 40: Per-User Claude OAuth + HOME Isolation
**Goal:** Multi-user Mini PC supports independent per-user `claude login`. Each user's OAuth credentials live in their own user HOME, and every `SdkAgentRunner` subprocess spawn carries that user's HOME — making cross-user OAuth credential leak impossible.
**Depends on:** Phase 39 (must close raw-SDK fallback before introducing per-user OAuth, otherwise per-user tokens could still leak through the old path)
**Requirements:** FR-AUTH-01, FR-AUTH-02, FR-AUTH-03
**Success Criteria** (what must be TRUE):
  1. User A runs `claude login` from Settings > AI Integrations, completes the OAuth device flow, and sees "Connected" status — without affecting User B's login state. User B's `~/.claude/.credentials.json` remains untouched.
  2. As User A (non-root, multi-user mode), `cat /home/user-b/.claude/.credentials.json` fails with permission denied — file mode + directory ownership enforced.
  3. When User A submits any AI Chat or marketplace-app prompt, `ps -ef` during execution shows the spawned `claude` CLI subprocess with `HOME=/home/user-a` (verified by `/proc/<pid>/environ` snapshot).
  4. Settings > AI Integrations shows per-user login status (connected / not-connected / token-expired) accurate within 5 seconds of state change — using their Claude subscription, no API key entry field shown.
**Plans:** 5 plans
Plans:
- [ ] 40-01-PLAN.md — Codebase audit + integration discovery (read-only AUDIT.md)
- [ ] 40-02-PLAN.md — Sacred file surgical edit (homeOverride) + integrity test re-pin
- [ ] 40-03-PLAN.md — Per-user .claude/ dir module + claude-login backend tRPC routes
- [ ] 40-04-PLAN.md — Per-user-aware Claude card in Settings > AI Configurations
- [ ] 40-05-PLAN.md — Tests + verification + manual UAT checklist
**UI hint**: yes

### Phase 41: Anthropic Messages Broker
**Goal:** A marketplace app inside a Docker container can `POST /v1/messages` to `http://livinity-broker:<port>` using the Anthropic Messages API format and receive a valid response (sync or SSE-streamed) generated by `SdkAgentRunner.run()` running as the container's owner user — never as another user.
**Depends on:** Phase 40 (broker resolves the calling container's owner user_id and spawns `SdkAgentRunner` with that user's HOME — requires per-user OAuth + HOME isolation in place)
**Requirements:** FR-BROKER-A-01, FR-BROKER-A-02, FR-BROKER-A-03, FR-BROKER-A-04
**Success Criteria** (what must be TRUE):
  1. From a Docker container on the Mini PC's internal network, `curl http://livinity-broker:<port>/v1/messages -d '{"model":"claude-sonnet-4-6","messages":[...]}'` returns a valid Anthropic Messages response — using the calling container's owner's Claude subscription, without entering an API key.
  2. The same endpoint with `"stream": true` streams Anthropic-schema SSE chunks (`message_start`, `content_block_delta`, `message_stop`) end-to-end, observable via `curl -N`.
  3. Multi-turn message history with system prompt and tool definitions in the request is correctly translated into `SdkAgentRunner.run(prompt, options)` invocation arguments — verified by integration test asserting the runner sees the full conversation context.
  4. When User A's container calls the broker and User B's container calls the broker concurrently, each request executes under its own user's HOME (verified via audit log showing distinct `HOME=/home/user-a` vs `HOME=/home/user-b` spawns) — cross-user subscription use is impossible.
  5. `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical to its pre-Phase-41 SHA — broker imports + invokes the runner; never modifies it.
**Plans:** 5 plans
Plans:
- [ ] 41-01-PLAN.md — Codebase audit (read-only AUDIT.md for Plans 41-02..05)
- [ ] 41-02-PLAN.md — Broker module skeleton + IP guard + request translator (stub handler)
- [ ] 41-03-PLAN.md — SSE adapter + sync response builder + SdkAgentRunner proxy wiring
- [ ] 41-04-PLAN.md — AI Chat carry-forward (X-LivOS-User-Id header → homeOverride wiring)
- [ ] 41-05-PLAN.md — Tests (33 new) + test:phase41 npm script + 41-UAT.md manual checklist

### Phase 42: OpenAI-Compatible Broker
**Goal:** A marketplace app that speaks OpenAI Chat Completions format (the dominant ecosystem standard, including MiroFish) can `POST /v1/chat/completions` to the broker, get bidirectional OpenAI ↔ Anthropic translation, and reach Claude through the same `SdkAgentRunner` path — with the response validated by feeding it back into the official `openai` Python SDK.
**Depends on:** Phase 41 (reuses the Anthropic-format broker's `SdkAgentRunner` invocation + container→user resolution; OpenAI endpoint is a translation layer on top)
**Requirements:** FR-BROKER-O-01, FR-BROKER-O-02, FR-BROKER-O-03, FR-BROKER-O-04
**Success Criteria** (what must be TRUE):
  1. From a Docker container, `curl http://livinity-broker:<port>/v1/chat/completions -d '{"model":"gpt-4","messages":[...]}'` returns an OpenAI-format Chat Completion response — backed by Claude via `SdkAgentRunner`, using the container owner's Claude subscription, without entering an API key.
  2. The same endpoint with `"stream": true` returns OpenAI-format SSE chunks (`data: {"choices":[{"delta":...}]}`) that match OpenAI streaming spec exactly — feeding the raw stream into the official `openai` Python SDK `OpenAI(...).chat.completions.create(..., stream=True)` smoke test consumes the stream without error.
  3. Model-name aliasing: requests with `"model": "gpt-4"`, `"gpt-4o"`, `"claude-sonnet-4-6"` all resolve to the configured default Anthropic model (`claude-sonnet-4-6`); unknown model names log a warning + fall through to default rather than 4xx-erroring.
  4. Bidirectional translation handles role mapping (`system` / `user` / `assistant`), tool / function-call format conversion, and multi-turn history — verified by an integration test that round-trips an OpenAI tool-calling conversation through the broker and asserts both request translation (in) and response translation (out) preserve semantics.
**Plans:** TBD

### Phase 43: Marketplace Integration (Anchor: MiroFish)
**Goal:** A marketplace app declaring `requires_ai_provider: true` in its manifest gets `ANTHROPIC_BASE_URL`, `ANTHROPIC_REVERSE_PROXY`, and `LLM_BASE_URL` automatically injected into its per-user Docker compose file at install time — and MiroFish, the v29.3 anchor app, is verified to chat with Claude end-to-end using the user's subscription with zero BYOK / API key prompts.
**Depends on:** Phase 42 (marketplace apps need both Anthropic-format and OpenAI-compat broker endpoints already live before manifest auto-injection makes sense)
**Requirements:** FR-MARKET-01, FR-MARKET-02
**Success Criteria** (what must be TRUE):
  1. A marketplace app manifest with `requires_ai_provider: true` produces a per-user compose file that includes the three env vars (`ANTHROPIC_BASE_URL=http://livinity-broker:<port>`, `ANTHROPIC_REVERSE_PROXY=http://livinity-broker:<port>`, `LLM_BASE_URL=http://livinity-broker:<port>/v1`) — verified by inspecting the generated compose YAML at `/opt/livos/data/users/<user>/apps/<app>/docker-compose.yml`.
  2. A manifest with `requires_ai_provider: false` (or omitted) produces a compose file without those env vars — verified by negative test asserting absent keys.
  3. User installs MiroFish from the marketplace, MiroFish container starts with broker env vars wired automatically, user opens MiroFish UI, types a prompt, and sees a Claude response — without entering an API key, using their Claude subscription. Broker access log shows the request transited `livinity-broker` → `SdkAgentRunner` → Anthropic.
  4. MiroFish UI shows zero "enter your API key" prompts to the user during the entire install + first-prompt flow (manual screenshot verification + DOM-grep for "API key" inputs returning none).
**Plans:** TBD
**UI hint**: yes

### Phase 44: Per-User Usage Dashboard
**Goal:** Each user can see their own AI usage (tokens, requests by app, monthly total) in Settings > AI Integrations; admins can see a cross-user per-app breakdown; users get non-blocking warnings as they approach Claude subscription rate limits and a clear UI surface when 429s are returned by Anthropic.
**Depends on:** Phase 43 (need actual marketplace usage flowing through the broker before the dashboard has data to show — also depends on broker writing usage rows per request, which is established in Phases 41 + 42 but consumed here)
**Requirements:** FR-DASH-01, FR-DASH-02, FR-DASH-03
**Success Criteria** (what must be TRUE):
  1. After a user makes marketplace-app requests using their Claude subscription, Settings > AI Integrations shows their cumulative input + output tokens, request count broken down by app, and current-month total — data persisted in PostgreSQL (`broker_usage` table or equivalent), one row per request from Anthropic Messages `usage` object, viewable per-user, without entering an API key.
  2. Admin user, viewing Settings > AI Integrations as admin, sees a multi-user filterable view: per-app usage stats showing which user, which model, request count, and token total — with filter chips for user / app / model.
  3. When a user reaches 80% of their Claude subscription daily rate limit (Pro 200/day or Max 5x equivalent), a non-blocking warning banner appears in the AI Integrations panel showing remaining requests; banner disappears at next day's reset.
  4. When a user's subscription returns HTTP 429 from Anthropic (rate limit hit), the broker propagates the 429 (with `Retry-After` header) back to the calling marketplace app, AND the AI Integrations UI surfaces the rate-limit-reached state to the user — they understand it's their subscription cap, not a Livinity outage.
**Plans:** TBD
**UI hint**: yes

---

## Dependency Graph

```
Phase 39 (Risk Fix — must be first)
    |
    v
Phase 40 (Per-User OAuth + HOME Isolation)
    |
    v
Phase 41 (Anthropic Messages Broker)
    |
    v
Phase 42 (OpenAI-Compat Broker)
    |
    v
Phase 43 (Marketplace Integration — MiroFish anchor)
    |
    v
Phase 44 (Per-User Usage Dashboard)
```

Strictly linear — each phase consumes the prior phase's artifact. No parallelism. Matches `config.json` `parallelization: false`.

---

## Coverage Validation

| Requirement | Phase | Category |
|-------------|-------|----------|
| FR-RISK-01 | Phase 39 | Risk Fix |
| FR-AUTH-01 | Phase 40 | Per-User OAuth |
| FR-AUTH-02 | Phase 40 | Per-User OAuth |
| FR-AUTH-03 | Phase 40 | Per-User OAuth |
| FR-BROKER-A-01 | Phase 41 | Anthropic Broker |
| FR-BROKER-A-02 | Phase 41 | Anthropic Broker |
| FR-BROKER-A-03 | Phase 41 | Anthropic Broker |
| FR-BROKER-A-04 | Phase 41 | Anthropic Broker |
| FR-BROKER-O-01 | Phase 42 | OpenAI Broker |
| FR-BROKER-O-02 | Phase 42 | OpenAI Broker |
| FR-BROKER-O-03 | Phase 42 | OpenAI Broker |
| FR-BROKER-O-04 | Phase 42 | OpenAI Broker |
| FR-MARKET-01 | Phase 43 | Marketplace |
| FR-MARKET-02 | Phase 43 | Marketplace |
| FR-DASH-01 | Phase 44 | Dashboard |
| FR-DASH-02 | Phase 44 | Dashboard |
| FR-DASH-03 | Phase 44 | Dashboard |

**Total mapped:** 17 / 17
**Orphans:** 0
**Duplicates:** 0

(`FR-AUTH-04` from the seed was explicitly removed from REQUIREMENTS.md — single-subscription fan-out is OUT of scope per D-TOS-01.)

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 39. Risk Fix — Close OAuth Fallback | 0/0 | Not started | — |
| 40. Per-User Claude OAuth + HOME Isolation | 0/5 | Planned | — |
| 41. Anthropic Messages Broker | 0/5 | Planned | — |
| 42. OpenAI-Compatible Broker | 0/0 | Not started | — |
| 43. Marketplace Integration (Anchor: MiroFish) | 0/0 | Not started | — |
| 44. Per-User Usage Dashboard | 0/0 | Not started | — |

---

## Project-Level Milestone Index (carry-over from previous ROADMAP.md)

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
- v29.2 Factory Reset (shipped 2026-04-29) — see [milestones/v29.2-ROADMAP.md](milestones/v29.2-ROADMAP.md)
- **v29.3 Marketplace AI Broker (Subscription-Only)** — ACTIVE (this document)
- v30.0 Backup & Restore — DEFINED, paused (8 phases / 47 BAK-* reqs in `.planning/milestones/v30.0-DEFINED/`; resumes with phase renumber after v29.3 ships)

---

*Last updated: 2026-04-29 — v29.3 ROADMAP created by `/gsd-roadmapper`. Awaiting `/gsd-plan-phase 39`.*
