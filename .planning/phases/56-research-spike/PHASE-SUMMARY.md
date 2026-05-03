---
phase: 56-research-spike
milestone: v30.0
milestone_name: Livinity Broker Professionalization
status: COMPLETE
plans:
  - "56-01: Architectural Verdicts (Q1 + Q2 + Q7)"
  - "56-02: Auth & Public Endpoint Verdicts (Q3 + Q4 + Q5 + Q6)"
  - "56-03: Cross-Cut Audits (D-NO-NEW-DEPS + Sacred SHA Stability + D-51-03 Re-Evaluation)"
  - "56-04: Synthesis (Executive Summary + Decisions Log + Validation)"
plans_total: 4
plans_complete: 4
requirements_completed: []  # Phase 56 is research-only — produces decisions, not code
sacred_file_sha_start: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_file_sha_end: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_file_sha_match: true
duration_total: ~3.5 hours across 4 plans on 2026-05-02
completed: 2026-05-02
unblocks: [phase-57, phase-58, phase-59, phase-60, phase-61, phase-62, phase-63]
---

# Phase 56: Research Spike — Passthrough Architecture + Public Endpoint + Auth Patterns Summary

**Phase 56 closed cleanly: 7 architectural questions answered with concrete verdicts (HTTP-proxy passthrough, tools-forward, dual opt-in, Server5 Caddy, manual opt-in keys, edge-handles-abuse, sacred file untouched); 3 cross-cut audits PASS/YELLOW; sacred file SHA byte-identical at start and end; Phases 57-63 unblocked with 9 D-30-XX locked decisions.**

## What Phase 56 Was

A research-only spike (zero code, zero source-file edits, zero deployment) producing one canonical answer document — `SPIKE-FINDINGS.md` — answering the 7 open architectural questions from MILESTONE-CONTEXT.md that were blocking Phase 57+ implementation planning.

## Phase Outcome

**SPIKE-FINDINGS.md** at `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` — single canonical answer document with 5 sections in this order:

1. **Executive Summary** — single-table snapshot of all 7 verdicts + 3 cross-cut verdicts; Phase 57+ planners read this first.
2. **Q1-Q7 Verdict Blocks** — sequential numerical order; each block has chosen path + ≥3 rationale reasons + ≥2 alternatives evaluated + code-level integration point + risk/mitigation pair.
3. **Cross-Cuts** — D-NO-NEW-DEPS Audit (YELLOW), Sacred File SHA Stability (PASS, per-task log table), D-51-03 Re-Evaluation (Not needed in v30).
4. **Decisions Log** — 9 D-30-XX entries (D-30-01 through D-30-09) ready for direct copy into STATE.md Locked Decisions; each entry self-contained.
5. **Validation** — table cross-referencing each Q1-Q7 to evidence (file:line code reference + external source URL + ≥2 alternatives considered); all 7 rows PASS.

## The 9 Locked Decisions (D-30-01 .. D-30-09)

Verbatim from SPIKE-FINDINGS.md Decisions Log section:

- **D-30-01:** Anthropic passthrough = HTTP-proxy direct via Node 22 builtin `fetch()` (Strategy A). Broker reads per-user OAuth subscription `access_token` from `~/.claude/<userId>/.credentials.json` server-side and forwards verbatim to `api.anthropic.com/v1/messages`; raw byte-forward of upstream `Response.body` delivers true SSE streaming for free; SDK-direct (Strategy B) DISQUALIFIED to preserve D-NO-NEW-DEPS; zero new npm deps. **Source:** Q1.
- **D-30-02:** Passthrough mode forwards client `tools[]` verbatim. Anthropic route raw-byte-forwards tools as part of body; OpenAI route translates `function`-nested → flat `name + input_schema` shape; agent mode KEEPS existing ignore-warn (Nexus tools win). Implementation = delete ignore-warn at `router.ts:66-70` + write OpenAI translator at `openai-router.ts:110-124`, both gated on Q3 mode dispatch. **Source:** Q2.
- **D-30-03:** Agent-mode opt-in supports BOTH URL-path (`/u/:userId/agent/v1/...`) AND header (`X-Livinity-Mode: agent`); path takes precedence; default = passthrough. Universal client compatibility: path works for all 4 target external clients (including Bolt.diy/Cline which can't send custom headers); header gives Continue.dev/Open WebUI per-request flexibility. Documented breaking change for legacy internal callers (internal LivOS AI Chat is unaffected — uses nexus directly, not the broker). **Source:** Q3.
- **D-30-04:** Public endpoint = Server5 Caddy with new `api.livinity.io` block + `caddy-ratelimit` plugin (custom `xcaddy` build) + Let's Encrypt on-demand TLS. Reuses existing Server5 infrastructure (zero DNS-posture cost); native edge rate-limit primitive eliminates broker-side bucket complexity; avoids CF Worker recurring cost + 10ms-CPU-cap risk for SSE streaming. **Source:** Q4.
- **D-30-05:** Per-user `liv_sk_*` keys are OPT-IN (no auto-key on signup) with MANUAL revoke+recreate rotation (no scheduler). Industry parity (Stripe/OpenAI/Anthropic all manual); FR-BROKER-B1-01 schema (`revoked_at` nullable timestamp) is exactly what manual rotation needs (zero schema additions); plaintext-once UX has nowhere to surface a default-keyed plaintext; user explicitly creates first key when plugging in an external client. **Source:** Q5.
- **D-30-06:** Broker emits ZERO own 429s in v30 — edge handles abuse, broker handles transparency. Edge perimeter (Caddy `caddy-ratelimit` from D-30-04) handles coarse abuse-control with thresholds 10-20x above Anthropic typical tier; broker forwards Anthropic upstream rate-limit headers (12 Anthropic + 6 translated OpenAI + Retry-After) verbatim via Q1 raw byte-forward; NO broker-side per-key Redis bucket in v30 (deferred to v31+ if multi-tenant fairness becomes a real requirement). **Source:** Q6.
- **D-30-07:** Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNTOUCHED across entire v30.0 milestone; D-51-03 Branch N reversal NOT NEEDED in v30. Q1 passthrough structurally bypasses sacred file for external clients (the original identity-contamination context); agent-mode aggregation acceptable per Phase 51 deploy-layer fix; surgical-edit candidate (`:342` + `:378` for `includePartialMessages: true`) deferred to v30.1+ ONLY if internal-chat token-streaming pain re-surfaces. Integrity test BASELINE_SHA stays unchanged. **Source:** Q7 + Cross-Cuts §D-51-03.
- **D-30-08:** D-NO-NEW-DEPS preserved on npm side — verdict YELLOW. Zero new npm packages required by any Q1-Q7 primary path (`package.json` budget intact); however Q4 introduces TWO non-npm infrastructure deps (`caddy-ratelimit` plugin third-party Go module + `xcaddy` Go-toolchain build tool) which Phase 60 must explicitly budget. Phases 57, 58, 59, 61, 62, 63 unblocked GREEN on the npm side; only Phase 60 carries the YELLOW non-npm infra delta. **Source:** Cross-Cuts §D-NO-NEW-DEPS Audit.
- **D-30-09:** Phase 60 must explicitly budget the Caddy custom-build pipeline. Items required: (1) `xcaddy build --with github.com/mholt/caddy-ratelimit@<pinned-sha>` build script committed to repo, (2) `apt-mark hold caddy` to prevent unattended-upgrade overwrites, (3) rebuild documentation in `platform/relay/README.md`, (4) `caddy validate < Caddyfile` validation step in deploy procedure, (5) `flush_interval -1` in `reverse_proxy` block to disable SSE buffering, (6) fallback plan to move rate-limit to broker via D-30-06 if upstream `caddy-ratelimit` plugin abandoned. **Source:** Q4 Risk + Mitigation + Cross-Cuts §D-NO-NEW-DEPS Audit Routing.

## Cross-Cut Verdicts

- **D-NO-NEW-DEPS:** **YELLOW** — npm-side GREEN (zero new packages); two non-npm Caddy/Go infra deps (`caddy-ratelimit` plugin + `xcaddy` build tool) flagged for Phase 60 explicit budget per D-30-09.
- **Sacred File SHA Stability:** **PASS** — `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical across all 11 task boundaries (4 plans × ~3 tasks each). Zero Edit/Write calls to sacred file across entire spike.
- **D-51-03 Re-Evaluation:** **Not needed in v30** — Q1 passthrough structurally eliminates external-client identity contamination; Q7 confirms agent-mode acceptable per Phase 51 fix; safety-net D-30-XX candidate retained for v30.1+ if internal-chat pain re-surfaces post-v30.

## Plan-by-Plan Recap

| Plan | Goal | Status | Key Output |
|------|------|--------|------------|
| 56-01 | Q1 SDK-direct vs HTTP-proxy + Q2 tools forwarding + Q7 agent-mode streaming | SHIPPED 2026-05-02 (`2aaf6d2c`) | 3 verdict blocks: Q1=Strategy A HTTP-proxy, Q2=forward verbatim, Q7=sacred-untouched |
| 56-02 | Q3 agent-mode opt-in + Q4 Caddy vs CF Worker + Q5 key rotation + Q6 rate-limit | SHIPPED 2026-05-02 (`4f452bd0`, `3919271a`, `f4eb0e4f`) | 4 verdict blocks: Q3=path+header, Q4=Server5 Caddy+caddy-ratelimit, Q5=manual+opt-in, Q6=edge-handles-abuse |
| 56-03 | D-NO-NEW-DEPS audit + Sacred SHA stability + D-51-03 re-evaluation | SHIPPED 2026-05-02 (`60d4b202`) | Cross-Cuts section: YELLOW + PASS + Not-needed-in-v30 |
| 56-04 | Synthesis (Executive Summary + Decisions Log + Validation) | SHIPPED 2026-05-02 (`c77b2b1d`) | SPIKE-FINDINGS.md reorganized to 5 canonical sections; 9 D-30-XX entries; validation table all PASS |

## Sacred File SHA Stability Across Phase 56

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` returned `4f868d318abff71f8c8bfbcf443b2393a553018b` at every measured boundary across all 4 plans (11 task boundaries total). Zero Edit/Write calls. Sacred file UNTOUCHED.

## What Phase 56 Did NOT Do

- No source-file edits (livinity-broker, livos, nexus, livinity-io-platform all untouched).
- No deployment (no SSH to Mini PC or Server5).
- No package additions (no `npm install`).
- No `STATE.md` writes from within plans (only the synthesis pass updates STATE.md).
- No production traffic generated against `api.anthropic.com` (verdict-supporting facts came from docs and existing repo code).

## What Unblocks With Phase 56 Closed

- **Phase 57 (A1+A2 Passthrough Mode + Agent Mode Opt-In)** — All Phase 57 design questions answered (D-30-01, D-30-02, D-30-03, D-30-07).
- **Phase 58 (C1+C2 True Token Streaming)** — Pattern is determined by Q1 + Q7 (raw byte-forward + Caddy `flush_interval -1` from D-30-04 + D-30-09 + D-30-07).
- **Phase 59 (B1 Per-User Bearer Token Auth)** — Lifecycle contract determined by D-30-05.
- **Phase 60 (B2 Public Endpoint + Rate-Limit Perimeter)** — Architecture + budget items determined by D-30-04 + D-30-06 + D-30-08 + D-30-09.
- **Phase 61 (C3+D1+D2 Rate-Limit Headers + Aliases + Provider Stub)** — Header forwarding list (12 Anthropic + 6 OpenAI + Retry-After) + translator semantics from Q6.
- **Phase 62 (E1+E2 Usage Tracking + Settings UI)** — Surface contract from Q5 (plaintext-once modal + last_used_at column visibility).
- **Phase 63 (Mandatory Live Verification)** — Verifies all of the above; D-LIVE-VERIFICATION-GATE will be the first real-world test.

## What Was DEFERRED to v30.1+ or v31+

- **D-30-XX surgical edit to sacred file** for internal-chat token streaming (`:342` + `:378` for `includePartialMessages: true`) — only opens IF internal-chat user pain re-surfaces post-v30.
- **Broker-side per-key Redis token bucket** (D-30-06 Alt B) — only if multi-tenant fairness becomes a real requirement; v30 schema is forward-compatible.
- **Auto-rotation scheduler for `liv_sk_*` keys** (D-30-05 Alt B) — only if SOC2/ISO27001 compliance pressure surfaces; v30 schema is forward-compatible (`api_key_policies.auto_rotation_days` add as needed).
- **Refresh-token plumbing** for Anthropic OAuth subscription tokens (Q1 Risk + Mitigation) — v30 ships re-authenticate-on-401 UX; auto-refresh is v30.1 candidate.
- **Per-user `api_keys.preferred_mode` column** for default-mode preference (Q3 alternatives) — v30 ships per-request opt-in only.

## Key Files

- **Created:**
  - `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` (canonical answer document, 5 sections, ~600 lines)
  - `.planning/phases/56-research-spike/56-01-SUMMARY.md`, `56-02-SUMMARY.md`, `56-03-SUMMARY.md`, `56-04-SUMMARY.md` (per-plan summaries)
  - `.planning/phases/56-research-spike/notes-q1-passthrough.md`, `notes-q2-tools.md`, `notes-q3-agent-mode.md`, `notes-q4-public-endpoint.md`, `notes-q5-key-rotation.md`, `notes-q6-rate-limit.md`, `notes-q7-streaming.md`, `notes-cross-cuts.md` (research notes per Q + cross-cuts)
  - `.planning/phases/56-research-spike/PHASE-SUMMARY.md` (this file)
- **Modified:** `.planning/STATE.md` (Phase 56 marked complete; 9 D-30-XX entries appended to Locked Decisions; Current Position bumped to "awaiting `/gsd-discuss-phase 57`").
- **Untouched (and SHA-confirmed stable):** `nexus/packages/core/src/sdk-agent-runner.ts` at `4f868d318abff71f8c8bfbcf443b2393a553018b`.

## Next Step

`/gsd-discuss-phase 57` — gather Phase 57 (A1+A2 Passthrough Mode + Agent Mode Opt-In) context with all 9 D-30-XX decisions locked.

---
*Phase 56 — COMPLETE — 2026-05-02*
*Sacred file SHA: 4f868d318abff71f8c8bfbcf443b2393a553018b (UNTOUCHED across entire spike)*
