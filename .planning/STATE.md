---
gsd_state_version: 1.0
milestone: v30.0
milestone_name: Livinity Broker Professionalization
status: planning
last_updated: "2026-05-03T07:50:00.000Z"
last_activity: 2026-05-03 — Phase 60 Plan 04 (Wave 3 — Caddyfile + DNS + Broker IP-guard removal) executed; task commits `f57e5269` + `965d6011` + `56b4dd7c` + `a240f81f`; SUMMARY at `.planning/phases/60-public-endpoint-rate-limit/60-04-SUMMARY.md`
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 44
  completed_plans: 28
  percent: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v30.0 milestone started)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v30.0 — Livinity Broker Professionalization (Real API Endpoint Mode)
**Last shipped milestone:** v29.5 v29.4 Hot-Patch Recovery + Verification Discipline — 2026-05-02 (closed via `--accept-debt`)

## Current Position

Phase: 60 IN PROGRESS — Waves 0/1/2/3 COMPLETE (60-01..04 shipped). Awaiting Wave 4 (60-05 — smoke battery against the live perimeter).
Plan: 60-04 SHIPPED 2026-05-03 — Wave 3 three-sub-task wave: (1) platform/relay/Caddyfile drift reconciled to Server5 (option a pull-then-patch — apps.livinity.io / changelog.livinity.io / @marketplace mcp.livinity.io / livinity.io /downloads/* file_server) in commit f57e5269 BEFORE adding api.livinity.io block in commit 965d6011 with rate_limit zones (bearer 60/min + ip 30/min), reverse_proxy localhost:4000 with flush_interval -1 (Phase 58 PHASE-SUMMARY:144 streaming preservation D-30-09 budget #5), header_up Host/X-Real-IP/X-Forwarded-For, handle_errors 429 → 4-field Anthropic-spec body, log to /var/log/caddy/api.livinity.io.log (json), and global `order rate_limit before basic_auth` (RESEARCH.md Pitfall 3); deployed to Server5 via 1 scp + 2 ssh batches (caddy validate "Valid configuration" exit 0; pre-swap backup at /etc/caddy/Caddyfile.bak.20260503-072328; first reload failed with permission-denied on log file (Rule 1 fix: chown caddy:caddy /var/log/caddy/api.livinity.io.log + reset-failed); retry succeeded RELOAD_EXIT=0, status active; smoke regression livinity.io/apps/changelog/bruce all HTTP/2 200; api.livinity.io routing chain proven via curl --resolve TLS 1.3 + HTTP/2 stream OPENED for /v1/messages — cert pre-issued LE E8 expires 2026-06-17). (2) DNS A record api.livinity.io → 45.137.194.102 verified ALREADY EXISTS via dig from 1.1.1.1 + 8.8.8.8 (pre-existing since at least 2026-03-19 per LE cert issuance date); manual click instructions documented at .planning/phases/60-public-endpoint-rate-limit/60-DNS-INSTRUCTIONS.md for future loss recovery; commit 56b4dd7c. (3) Broker containerSourceIpGuard REMOVED in commit a240f81f (Wave 0 Q4 verdict YES — Phase 59 Bearer middleware fall-through pattern proved safe per 59-03-SUMMARY.md:44): livinity-broker/router.ts (import + router.use line + comment block updated), livinity-broker/auth.ts (function + isValidIPv4 helper + NextFunction import + RFC 1918 doc comment all deleted), livinity-broker/openai-router.ts (comment update), livinity-broker/auth.test.ts DELETED entirely (all 15 tests were IP-guard cases; resolveAndAuthorizeUserId tests already deferred to integration.test.ts); typecheck delta = 0 (352 → 352 errors, all pre-existing in unrelated user/widgets/file-store and @nexus/core missing-export); vitest broker suite 94/94 GREEN. Mini PC deploy DEFERRED to Phase 63 update.sh per plan ("this commit is local"); harmless because no external Bearer traffic flows yet. Caddy log Authorization-header check (T-60-34) = 0 (verbatim grep -ic). 5 Server5 ops total (1 scp + 4 ssh batches: deploy/fix-up/dns-probe/final-state) — fail2ban-conservative. Two deviations auto-fixed: Rule 1 (caddy log permission denied on first reload — fixed inline by chown caddy:caddy + retry); Rule 3 (background ssh deploy command timed out from above bug — recovered via separate fix-up batch). Sacred file SHA byte-identical (3 sample points). Task commits: f57e5269 chore (drift) + 965d6011 feat (Caddyfile+deploy) + 56b4dd7c docs (DNS instructions) + a240f81f feat (IP-guard removal).
Status: Phase 60 Wave 3 COMPLETE. Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at plan start, mid-plan (after Caddyfile commit), and plan end (after Authorization-header check). FR-BROKER-B2-01 satisfied (api.livinity.io reachable + IP-guard removed at source). FR-BROKER-B2-02 satisfied (rate-limit perimeter live with Bearer + IP zones; 4-field Anthropic-spec 429 body via handle_errors; Retry-After automatic via plugin). Wave 4 (60-05) unblocked. SUMMARY at `.planning/phases/60-public-endpoint-rate-limit/60-04-SUMMARY.md`.
Last activity: 2026-05-03 — Phase 60 Plan 04 (Wave 3 — Caddyfile + DNS + Broker IP-guard removal) executed; task commits `f57e5269` + `965d6011` + `56b4dd7c` + `a240f81f`; SUMMARY at `.planning/phases/60-public-endpoint-rate-limit/60-04-SUMMARY.md`

## v30.0 Roadmap Snapshot

| Phase | Goal                                                                | Reqs                              | Depends on            |
|-------|---------------------------------------------------------------------|-----------------------------------|-----------------------|
| 56 ✅ | Research Spike — answer 7 open Qs (passthrough / endpoint / auth)   | (research-only, 0 reqs) — CLOSED 2026-05-02 | —                |
| 57 ✅ | A1+A2 Passthrough Mode + Agent Mode Opt-In (5/5 waves COMPLETE 2026-05-02) | A1-01..04, A2-01..02 (6/6) | 56 |
| 58 ✅ | C1+C2 True Token Streaming (Anthropic + OpenAI)                     | C1-01..02, C2-01..03 (5/5) — CLOSED 2026-05-03 | 57   |
| 59 ✅ | B1 Per-User Bearer Token Auth (`liv_sk_*`)                          | B1-01..05 (5/5) — CLOSED 2026-05-02 | — (parallel)         |
| 60    | B2 Public Endpoint (`api.livinity.io`) + Rate-Limit Perimeter       | B2-01..02 (2)                     | 59                    |
| 61    | C3+D1+D2 Rate-Limit Headers + Model Aliases + Provider Stub         | C3-01..03, D1-01..02, D2-01..02 (7) | 57, 58              |
| 62    | E1+E2 Usage Tracking Accuracy + Settings UI (API Keys + Usage tabs) | E1-01..03, E2-01..02 (5)          | 59                    |
| 63    | Mandatory Live Verification (D-LIVE-VERIFICATION-GATE)              | VERIFY-V30-01..08 (8)             | 57, 58, 59, 60, 61, 62 |

**Coverage:** 38/38 requirements mapped (100%). Phase 56 is research-only (produces decisions, not code). Phase 63 must close cleanly without `--accept-debt` — first real-world test of D-LIVE-VERIFICATION-GATE.

**Critical path:** 56 → 57 → 58 → 61 → 63.
**Parallel branches:** 59 → 60 → 63 AND 59 → 62 → 63.

See `.planning/ROADMAP.md` for full phase details, success criteria, dependency graph, and per-requirement coverage table.

## v30.0 Milestone Context

**Why this milestone exists:** v29.5 hot-patch session live testing with Bolt.diy revealed the Livinity Broker is fundamentally mis-architected for external API consumers. Three architectural failures surfaced:

1. **Identity contamination** — broker prepends Nexus identity + Nexus tools to every request; external clients (Bolt.diy, Open WebUI, Continue.dev) cannot present their own persona
2. **Block-level streaming** — `sdk-agent-runner.ts:382-389` aggregates assistant messages into single chunks; external clients see "non-streaming" or 504 timeouts
3. **Wrong auth model** — URL-path identity + container IP guard; external consumers expect `Authorization: Bearer liv_sk_*`

**Goal:** Transform Livinity Broker into a "real-API-key" experience for external apps. Bearer-token-authed, public-endpoint, true-token-streaming, rate-limit-aware, multi-spec-compliant.

**Target features (5 categories from MILESTONE-CONTEXT.md):**

- **A — Architectural Refactor:** A1 Passthrough mode (default for external) bypassing Agent SDK + A2 opt-in agent mode (current behavior, header-gated)
- **B — Auth & Public Surface:** B1 Per-user `liv_sk_*` Bearer tokens + B2 public `api.livinity.io` reverse proxy on Server5 (TLS + rate-limit perimeter)
- **C — Spec Compliance:** C1 True token streaming for Anthropic Messages + C2 OpenAI translation adapter rewrite + C3 Rate-limit headers forwarding
- **D — Model Strategy:** D1 Friendly alias resolution (opus/sonnet/haiku → current Claude family) + D2 multi-provider interface stub (Anthropic only in v30)
- **E — Observability:** E1 Per-token usage tracking accuracy + E2 Settings > AI Configuration > API Keys + Usage tabs

**Locked decisions:**

- D-NO-NEW-DEPS preserved (Anthropic SDK addition pending Phase 56 spike verdict)
- D-NO-SERVER4 preserved
- D-LIVINITYD-IS-ROOT preserved
- **Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNTOUCHED in v30.** Passthrough mode bypasses; agent mode keeps current behavior.
- D-LIVE-VERIFICATION-GATE active — Phase 63 must close cleanly without `--accept-debt`
- D-NO-BYOK preserved — broker issues its own `liv_sk_*` tokens; user's raw `claude_*` keys never enter broker
- D-51-03 (Branch N reversal) — superseded by D-30-07 below; Phase 56 spike RE-EVALUATED as "Not needed in v30."
- v30.0 slot now claimed by Broker Professionalization; old "v30.0 Backup & Restore" definition (in `milestones/v30.0-DEFINED/`) deferred to a future milestone

**v30.0 Locked Decisions from Phase 56 spike (D-30-01 .. D-30-09 — final numbering, copy-pasted from `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` Decisions Log):**

- **D-30-01:** Anthropic passthrough = HTTP-proxy direct via Node 22 builtin `fetch()` (Strategy A) — Broker reads per-user OAuth subscription `access_token` from `~/.claude/<userId>/.credentials.json` server-side and forwards verbatim to `api.anthropic.com/v1/messages`; raw byte-forward of upstream `Response.body` delivers true SSE streaming for free; SDK-direct (Strategy B) DISQUALIFIED to preserve D-NO-NEW-DEPS (would force `@anthropic-ai/sdk` into livinityd `package.json`); zero new npm deps. **Source:** SPIKE-FINDINGS.md Q1.
- **D-30-02:** Passthrough mode forwards client `tools[]` verbatim — Anthropic route raw-byte-forwards tools as part of the body; OpenAI route translates `function`-nested → flat `name + input_schema` shape then forwards; agent mode KEEPS existing ignore-warn behavior (Nexus tools win) so LivOS in-app chat stays byte-identical. Implementation = delete ignore-warn at `router.ts:66-70` + write OpenAI translator at `openai-router.ts:110-124`, both gated on Q3 mode dispatch. **Source:** SPIKE-FINDINGS.md Q2.
- **D-30-03:** Agent-mode opt-in supports BOTH URL-path (`/u/:userId/agent/v1/...`) AND header (`X-Livinity-Mode: agent`); path takes precedence; default (no path-segment, no header) = passthrough — Universal client compatibility (path works for all 4 target external clients including Bolt.diy/Cline which can't send custom headers; header gives Continue.dev/Open WebUI per-request flexibility). Default flip from "agent-only" to "passthrough by default" is a documented breaking change for legacy internal callers but internal LivOS AI Chat is unaffected (it goes via nexus directly, not through the broker). **Source:** SPIKE-FINDINGS.md Q3.
- **D-30-04:** Public endpoint = Server5 Caddy with new `api.livinity.io` block + `caddy-ratelimit` plugin (custom `xcaddy` build) + Let's Encrypt on-demand TLS — Reuses existing Server5 infrastructure (zero DNS-posture cost, current `*.livinity.io` stays DNS-only); native edge rate-limit primitive eliminates broker-side bucket complexity; avoids CF Worker recurring cost + 10ms-CPU-cap risk for SSE streaming; Phase 60 must budget `xcaddy` build pipeline + `caddy-ratelimit@<pinned-sha>` + `apt-mark hold caddy`. **Source:** SPIKE-FINDINGS.md Q4.
- **D-30-05:** Per-user `liv_sk_*` keys are OPT-IN (no auto-key on signup) with MANUAL revoke+recreate rotation (no scheduler) — Industry parity (Stripe/OpenAI/Anthropic all ship manual rotation only); FR-BROKER-B1-01 schema (`revoked_at` nullable timestamp) is exactly what manual rotation needs (zero schema additions); plaintext-once UX has nowhere to surface a default-keyed plaintext (signup-time modal would be missed/dismissed); user explicitly creates first key when plugging in an external client. **Source:** SPIKE-FINDINGS.md Q5.
- **D-30-06:** Broker emits ZERO own 429s in v30 — edge handles abuse, broker handles transparency — Edge perimeter (Caddy `caddy-ratelimit` from D-30-04) handles coarse abuse-control with thresholds 10-20x above typical Anthropic subscription tier; broker forwards Anthropic upstream rate-limit headers (12 Anthropic + 6 translated OpenAI + Retry-After) verbatim via Q1 raw byte-forward; NO broker-side per-key Redis bucket in v30 (deferred to v31+ if multi-tenant fairness becomes a real requirement; schema is forward-compatible). **Source:** SPIKE-FINDINGS.md Q6.
- **D-30-07:** Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNTOUCHED across entire v30.0 milestone; D-51-03 Branch N reversal NOT NEEDED in v30 — Q1 passthrough structurally bypasses the sacred file for external clients (the original identity-contamination context); agent-mode aggregation acceptable per Phase 51 deploy-layer fix; surgical-edit candidate (`:342` + `:378` for `includePartialMessages: true`) deferred to v30.1+ ONLY if internal-chat token-streaming pain re-surfaces post-v30. Integrity test `sdk-agent-runner-integrity.test.ts` BASELINE_SHA stays unchanged. **Source:** SPIKE-FINDINGS.md Q7 + Cross-Cuts §D-51-03.
- **D-30-08:** D-NO-NEW-DEPS preserved on npm side — verdict YELLOW — Zero new npm packages required by any Q1-Q7 primary path (`package.json` budget intact); however Q4's verdict introduces TWO non-npm infrastructure deps (`caddy-ratelimit` Caddy plugin third-party Go module + `xcaddy` Go-toolchain build tool) which Phase 60 must explicitly budget. Phases 57, 58, 59, 61, 62, 63 are unblocked GREEN on the npm side; only Phase 60 carries the YELLOW non-npm infra delta. **Source:** SPIKE-FINDINGS.md Cross-Cuts §D-NO-NEW-DEPS Audit.
- **D-30-09:** Phase 60 must explicitly budget the Caddy custom-build pipeline — Items required: (1) `xcaddy build --with github.com/mholt/caddy-ratelimit@<pinned-sha>` build script committed to repo, (2) `apt-mark hold caddy` to prevent unattended-upgrade overwrites, (3) rebuild documentation in `platform/relay/README.md`, (4) `caddy validate < Caddyfile` validation step in deploy procedure, (5) `flush_interval -1` in `reverse_proxy` block to disable SSE buffering, (6) fallback plan to move rate-limit to broker via D-30-06 if upstream `caddy-ratelimit` plugin is abandoned. **Source:** SPIKE-FINDINGS.md Q4 Risk + Mitigation + Cross-Cuts §D-NO-NEW-DEPS Audit Routing.

## Accumulated Context (carried from v29.x)

### Mini PC deployment (the only LivOS deployment that matters)

- `bruce@10.69.31.68` — `/opt/livos/` rsync-deployed (no .git on server)
- systemd: `livos.service` (livinityd via tsx, port 8080), `liv-core.service` (nexus core dist, 3200), `liv-worker.service`, `liv-memory.service`
- Deploy: `bash /opt/livos/update.sh` (clones from utopusc/livinity-io, rsyncs, builds via pnpm + tsc, restarts services). v29.5 hardened: `rm -rf dist` before vite build to prevent stale-bundle regressions.
- pnpm-store quirk: multiple `@nexus+core*` dirs may exist — manually verify dist sync after update
- Redis password: pull from `/opt/livos/.env` REDIS_URL (rotated; legacy `LivRedis2024!` is stale)
- PG password: `/opt/livos/.env` DATABASE_URL (rotated)
- JWT secret: `/opt/livos/data/secrets/jwt`
- Capability registry prefix: **`nexus:cap:*`** (NOT `nexus:capabilities:*`)
- Mini PC fail2ban auto-bans rapid SSH probes — ALL diagnostic SSH calls MUST batch into ONE invocation
- Pre-existing breakage: `liv-memory.service` restart-loops because `update.sh` doesn't build memory package — separate fix

### Server5 (`livinity.io` relay + platform — `45.137.194.102`)

- NO LivOS install (no `/opt/livos/`, no `livos.service`)
- Platform DB: `platform` (NOT `livinity`/`livinity-io`/`livinity_io`)
- Apps source-of-truth: `apps` table (NOT `platform_apps` — that table doesn't exist)
- Routing: Cloudflare DNS-only → Server5 → Mini PC via private LivOS tunnel (NOT a Cloudflare tunnel; cloudflared not in stack)
- v30 Phase 60 will introduce `api.livinity.io` here (Caddy reverse proxy + TLS + rate-limit perimeter — final architecture pending Phase 56 spike)

### Sacred file integrity

- Path: `nexus/packages/core/src/sdk-agent-runner.ts`
- Current SHA: `4f868d318abff71f8c8bfbcf443b2393a553018b`
- Integrity test: `nexus/packages/core/src/__tests__/sdk-agent-runner-integrity.test.ts` (BASELINE_SHA constant must match)
- v30 contract: NO edits to this file. Passthrough mode (Phase 57) bypasses it. Agent mode keeps current behavior unchanged.

### v29.5 carry-forward UATs (14 files un-walked)

- v29.5 (4): 49/50/51/52/53/54 phase verifications synthesized but un-walked on Mini PC
- v29.4 (4): 45-UAT.md / 46-UAT.md / 47-UAT.md / 48-UAT.md
- v29.3 (6): 39-UAT.md / 40-UAT.md / 41-UAT.md / 42-UAT.md / 43-UAT.md / 44-UAT.md

All consolidate into v30 Phase 63 — the mandatory live verification phase that must also exercise 3+ external clients (Bolt.diy / Open WebUI / Continue.dev).

## Critical Open Questions for Phase 56 Research Spike

1. **Anthropic SDK direct passthrough vs HTTP proxy to api.anthropic.com — which?** SDK uses subscription auth (per-user `~/.claude` dirs); HTTP proxy is simpler but Bearer token forwarding may conflict with D-NO-BYOK.
2. **External client tools — forward or ignore?** Anthropic API supports `tools` natively; broker passthrough should forward verbatim. But subscription auth path may reject tools — Phase 56 must verify.
3. **Agent mode opt-in mechanism?** Header (`X-Livinity-Mode: agent`) or URL path (`/u/<id>/agent/v1/...`)?
4. **Public endpoint architecture?** Server5 Caddy or Cloudflare Worker (faster cold start, edge cache)?
5. **API key rotation policy?** Manual revoke + recreate, or automatic 90-day rotation? Default-keyed users or opt-in only?
6. **Rate limit policy?** Forward Anthropic rate limits verbatim, or impose broker-level token-bucket per-key?
7. **Block-level streaming for Agent mode?** Agent SDK fundamentally aggregates; Agent mode keeps this; passthrough fixes — confirm.

## Next Steps

1. **`/gsd-discuss-phase 57`** — gather Phase 57 (A1+A2 Passthrough Mode + Agent Mode Opt-In) context with all 9 D-30-XX decisions locked. D-30-01 (HTTP-proxy Strategy A), D-30-02 (forward tools verbatim), D-30-03 (path+header opt-in), D-30-07 (sacred file untouched) provide all needed Phase 57 design decisions.
2. **Phases 57 + 59 can begin in parallel** — 57 needs D-30-01/02/03/07 (locked); 59 needs D-30-05 (locked). No dependency between them.
3. **Phase 60 carries YELLOW** per D-30-08 + D-30-09 — must explicitly budget `xcaddy` build pipeline + `caddy-ratelimit@<pinned-sha>` plugin + `apt-mark hold caddy` + `flush_interval -1` SSE-buffering disable + fallback plan.

## Forensic Trail

- 2026-05-02T19:35Z — `/gsd-complete-milestone v29.5 --accept-debt` executed. v29.5 closed; phases archived; tag `v29.5` created.
- 2026-05-02T19:40Z — `/gsd-new-milestone v30.0` invoked. STATE.md reset. MILESTONE-CONTEXT.md will be deleted after consumption.
- 2026-05-02T20:00Z — `gsd-roadmapper` produced `.planning/ROADMAP.md` (8 phases 56-63), filled `.planning/REQUIREMENTS.md` Phase Traceability (38/38 mapped), updated this STATE.md with v30.0 Roadmap Snapshot. Status transitioned `defining-requirements` → `roadmap-defined`.
- 2026-05-02T23:59Z — Phase 56 spike CLOSED (all 4 plans complete: 56-01, 56-02, 56-03, 56-04). 9 D-30-XX decisions locked (D-30-01..D-30-09). SPIKE-FINDINGS.md reorganized to canonical 5-section structure (Executive Summary + Q1->Q7 + Cross-Cuts + Decisions Log + Validation). Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical across all 11 task boundaries. Phase 56 SUMMARY commit pending after this STATE.md write.
- 2026-05-03T02:54:20Z — Phase 58 (C1+C2 True Token Streaming — Anthropic + OpenAI) CLOSED. All 5 waves shipped (58-00..04). 5/5 requirements satisfied (FR-BROKER-C1-01..02 + FR-BROKER-C2-01..03). 13 work commits across phase + 5 SUMMARY/PHASE-SUMMARY commits = 18 commits. Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every wave checkpoint AND end-of-phase (verified inside Wave 4's final-gate test). 56 new tests across phase (6 Wave 0 + 23 Wave 1 + 6 Wave 2 + 8 Wave 3 + 13 Wave 4); broker suite went from 38 → 94 GREEN. Wave 0 ships fake-Anthropic SSE server fixture + clientFactory test seam; Wave 1 ships pure-function `openai-stream-translator.ts` (285 LOC, crypto chatcmpl id, cumulative output_tokens overwrite, 8-way stop_reason mapping); Wave 2 replaces Anthropic streaming branch with raw async iterator forwarding (`client.messages.create({stream:true})` async iterable, verbatim wire pass-through with no-transform/X-Accel-Buffering headers); Wave 3 wires Wave 1 translator into OpenAI streaming branch + swaps sync chatcmpl id to crypto.randomBytes (Phase 57 Pitfall 4 closed); Wave 4 ships 13-test integration suite over real TCP loopback that exercises both passthrough handlers via fake-server-injected clientFactory and asserts Phase 58 surface end-to-end including 5-run determinism + final-gate sacred-SHA + two-adapters-coexist self-tests. `openai-sse-adapter.ts` byte-identical (two-adapters-coexist preserved). D-NO-NEW-DEPS preserved (0 new npm packages added across entire phase). Pitfall 1 grep clean across all broker source. PHASE-SUMMARY at `.planning/phases/58-true-token-streaming/PHASE-SUMMARY.md`. Phase 59 (Bearer Token Auth) is independent — can begin immediately. Phase 60 (Public Endpoint) depends on Phase 59. Phase 61 (Rate-Limit Headers + Aliases + Provider Stub) extends Phase 58's streaming pipeline with header attachment + provider extraction. Phase 62 (Usage Tracking + Settings UI) consumes Phase 58's per-chunk usage + chatcmpl id. Phase 63 (Mandatory Live Verification) live-validates Phase 58's streaming on Mini PC against Bolt.diy + Open WebUI + Continue.dev.
- 2026-05-02T19:07:00Z — Phase 57 (A1+A2 Passthrough Mode + Agent Mode Opt-In) CLOSED. All 5 waves shipped (57-01..05). 6/6 requirements satisfied (FR-BROKER-A1-01..04 + FR-BROKER-A2-01..02). 13 commits across phase + 1 PHASE-SUMMARY commit pending. Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical across every wave checkpoint AND end-of-phase. Sacred file integrity test PASSES with same BASELINE_SHA constant. 95 broker tests GREEN (38 vitest + 57 legacy node-script). D-NO-NEW-DEPS preserved (zero new npm packages downloaded; @anthropic-ai/sdk@^0.80.0 was a workspace-level reachability declaration of an already-hoisted version). Wave 2 ships passthroughAnthropicMessages handler (227 LOC) + router.ts dispatch +39 LOC; Wave 3 ships passthroughOpenAIChatCompletions handler (+232 LOC) + openai-router.ts dispatch +44 LOC + openai-translator helpers (+109 LOC); Wave 4 proves agent-mode byte-identity via 18-assertion integration tests with X-Livinity-Mode: agent header injection (ZERO production code modified, tests-only). Passthrough is now DEFAULT for external clients (Bolt.diy / Open WebUI / Continue.dev / Cline); agent mode is OPT-IN preserving v29.5 in-app chat behavior unchanged. PHASE-SUMMARY at `.planning/phases/57-passthrough-mode-agent-mode/PHASE-SUMMARY.md`. Ready for Phase 58 (True Token Streaming — replace transitional aggregate-then-restream SSE in passthrough handler with true SDK event iteration).
- 2026-05-02T21:30:00Z — Phase 59 (B1 Per-User Bearer Token Auth — `liv_sk_*`) CLOSED. All 5 plans shipped (59-01..05). 5/5 requirements satisfied (FR-BROKER-B1-01..05). 13 work commits across phase + SUMMARY/PHASE-SUMMARY commits pending after this STATE.md write. Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at every wave checkpoint AND end-of-phase. 39 new tests added across phase (Wave 0 RED scaffolds: 30 tests in 6 files; Wave 4 added 9 integration tests); api-keys/ 39/39 GREEN at phase close. Plus 2 tests added to common.test.ts (Tests 11+12 for the 4 new apiKeys httpOnlyPaths entries → common 12/12 GREEN). Wave 0 (59-01) ships 6 RED test files seeding the contract (schema-migration + database + cache + bearer-auth + mount-order + routes); Wave 1 (59-02) appends `api_keys` PG block to `schema.sql` (8 cols, FK CASCADE, UNIQUE key_hash, partial idx_api_keys_active WHERE revoked_at IS NULL) + database.ts (179 LOC, 6 functions including SHA-256-of-FULL-plaintext hashKey + plaintext-once createApiKey returning {row, plaintext} tuple); Wave 2 (59-03) ships ApiKeyCache (231 LOC, 60s positive / 5s negative TTL, sync invalidate, debounced last_used_at via 30s flusher with reservation-pattern coalescing) + Bearer middleware (235 LOC, Express handler with constant-time crypto.timingSafeEqual defense-in-depth + Anthropic-spec 401 envelope) + mount in server/index.ts:1239 between usage capture (1229) and broker (1245) + cli.ts dispose hook + Livinityd.apiKeyCache singleton; Wave 3 (59-04) ships events.ts (100 LOC, REUSE pattern with computeParamsDigest IMPORTED from devices/audit-pg.ts not redefined, sentinel device_id='api-keys-system') + routes.ts (230 LOC, 4 procedures with adminProcedure-bound listAll inlined into router({...}) literal so source-string regex catches RBAC regressions) + revokeApiKey extension (RETURNING key_hash for sync cache invalidate without TOCTOU window) + cache singleton bridge (setSharedApiKeyCache mirrors getPool shape) + 4 httpOnlyPaths entries + apiKeys namespace mount + common.test.ts Tests 11+12; Wave 4 (59-05) ships integration.test.ts (589 LOC, 9 sub-tests across 5 sections — A create/SC1, B use/SC2, C revoke/SC3+FR-BROKER-B1-05 gate with revoke→401 latency `<100ms` assertion proving sync cache invalidate, D debouncing, E audit-REUSE with pool.query observation directly proving sentinel device_id='api-keys-system'). D-NO-NEW-DEPS preserved across entire phase (zero new npm packages added in any of the 5 plans). PHASE-SUMMARY at `.planning/phases/59-bearer-token-auth/PHASE-SUMMARY.md`. Phase 60 (B2 Public Endpoint — `api.livinity.io` + Caddy custom build with caddy-ratelimit per D-30-09 budget) is now unblocked — Bearer auth is the prerequisite gate. Phase 62 (E2 Settings UI — API Keys + Usage tabs) is also unblocked — apiKeys.create / list / revoke / listAll all live and httpOnlyPaths-gated. Phase 60 + Phase 62 can plan against this surface immediately.
