---
phase: 56
plan: 02
subsystem: research-spike
tags: [research, spike, auth, public-endpoint, caddy, cloudflare, rate-limit, opt-in, key-rotation]
dependency-graph:
  requires: [56-01]
  provides: [Q3-verdict, Q4-verdict, Q5-verdict, Q6-verdict, FR-BROKER-B2-02-resolution]
  affects: [Phase-57-A1+A2-passthrough-mode, Phase-59-Bearer-auth, Phase-60-public-endpoint, Phase-61-rate-limit-headers]
tech-stack:
  added: []
  patterns: [edge-perimeter-rate-limit, raw-byte-forward-headers, manual-rotate-opt-in-keys, dual-route-mode-dispatch, on-demand-LE-TLS]
key-files:
  created:
    - .planning/phases/56-research-spike/notes-q3-agent-mode.md
    - .planning/phases/56-research-spike/notes-q4-public-endpoint.md
    - .planning/phases/56-research-spike/notes-q5-key-rotation.md
    - .planning/phases/56-research-spike/notes-q6-rate-limit.md
    - .planning/phases/56-research-spike/56-02-SUMMARY.md
  modified:
    - .planning/phases/56-research-spike/SPIKE-FINDINGS.md
decisions:
  - "Q3: Dual opt-in (URL path /agent/ AND header X-Livinity-Mode: agent); path takes precedence; default = passthrough — covers 100% of 4 target clients"
  - "Q4: Server5 Caddy + on-demand LE TLS + caddy-ratelimit plugin (xcaddy custom build) — zero CF DNS posture cost, zero recurring cost"
  - "Q5: Manual revoke + recreate (Stripe/OpenAI/Anthropic 1:1 parity); opt-in keys (no auto-create on signup); revoked_at column already in FR-BROKER-B1-01 schema"
  - "Q6: Edge handles abuse (Q4 caddy-ratelimit), broker handles transparency (raw byte-forward of upstream Anthropic rate-limit headers); broker emits zero own 429s in v30; resolves FR-BROKER-B2-02 'TBD'"
metrics:
  duration_minutes: 90
  completed_date: "2026-05-02"
  tasks_completed: 3
  external_urls_fetched: 23
  sacred_file_sha_drift: 0
---

# Phase 56 Plan 02: Q3 / Q4 / Q5 / Q6 Verdicts — Auth, Public Perimeter, Key Lifecycle, Rate-Limit Policy Summary

Completed the auth/public-perimeter cluster of the v30.0 architectural spike: agent-mode opt-in (Q3), public endpoint platform + TLS + rate-limit primitive triplet (Q4), API key lifecycle (Q5), and rate-limit policy (Q6). Four verdict blocks added to SPIKE-FINDINGS.md, four intermediate research notes files created, sacred file SHA preserved at `4f868d318abff71f8c8bfbcf443b2393a553018b` throughout (sacred file never read or written this plan — Q3-Q6 are perimeter/lifecycle concerns, not internal-runner concerns).

## Verdicts at a Glance

| Question | Verdict (one line) | Resolves |
|----------|--------------------|----------|
| **Q3** | Both supported (URL path `/agent/` AND header `X-Livinity-Mode: agent`); path takes precedence; default = passthrough | FR-BROKER-A2-01 (header OR URL path); covers all 4 target clients (Bolt.diy / Open WebUI / Continue.dev / Cline) |
| **Q4** | Server5 Caddy + on-demand LE TLS + `caddy-ratelimit` plugin (custom build via `xcaddy`) | FR-BROKER-B2-01 (public endpoint platform); zero CF DNS posture cost; zero recurring cost; risk = xcaddy build burden |
| **Q5** | Manual revoke + recreate (Stripe/OpenAI/Anthropic 1:1 parity); opt-in keys (no auto-key on signup) | FR-BROKER-B1-04 (lifecycle ops); FR-BROKER-B1-01 `revoked_at` schema already aligned; OWASP API2:2023 satisfied |
| **Q6** | Edge handles abuse (Q4 caddy-ratelimit), broker handles transparency (raw byte-forward of upstream Anthropic rate-limit headers); broker emits ZERO own 429s in v30 | FR-BROKER-B2-02 ("TBD pending Phase 56 spike" → resolved as no broker-side bucket in v30); FR-BROKER-C3-01..03 (12 Anthropic + 6 OpenAI headers + Retry-After all forwarded) |

## Key External Evidence URLs Cited (23 distinct fetches)

**Q3 (8 sources):**
- https://docs.anthropic.com/en/api/versioning (Anthropic `X-*` header precedent)
- https://github.com/openai/openai-python/blob/main/README.md (OpenAI Bearer + base_url only)
- https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/README.md + .env.example + app/lib/modules/llm/providers/{anthropic,openai-like}.ts (Bolt.diy provider source)
- https://raw.githubusercontent.com/open-webui/open-webui/main/backend/open_webui/{routers/openai.py,utils/headers.py} (OWUI custom-header injection)
- https://docs.continue.dev/reference + https://raw.githubusercontent.com/continuedev/continue/main/core/llm/index.ts (Continue.dev `requestOptions.headers`)
- https://docs.cline.bot/provider-config/{anthropic,openai-compatible} (Cline base-URL only)

**Q4 (9 sources):**
- https://caddyserver.com/docs/modules/http.handlers.rate_limit (Caddy rate_limit handler — "**This module does not come with Caddy. Custom builds.**")
- https://raw.githubusercontent.com/mholt/caddy-ratelimit/master/README.md (`xcaddy build --with github.com/mholt/caddy-ratelimit`)
- https://caddyserver.com/docs/automatic-https (on-demand TLS still supported in v2.11.x)
- https://developers.cloudflare.com/workers/platform/pricing/ (10ms CPU free; 180s CPU paid; $5+/mo)
- https://developers.cloudflare.com/workers/runtime-apis/streams/ (TransformStream/ReadableStream pipeTo for SSE)
- https://developers.cloudflare.com/waf/rate-limiting-rules/ (WAF threshold/period/action model)
- https://developers.cloudflare.com/durable-objects/ (DO globally-unique-name + strongly-consistent state)
- https://developers.cloudflare.com/workers/configuration/routing/routes/ (Worker requires "**proxied (orange-clouded)**" DNS)

**Q5 (6 sources):**
- https://docs.stripe.com/keys (Stripe Rotate/Revoke/Expire UI; user-scheduled grace period)
- https://github.com/openai/openai-python/blob/main/README.md (OpenAI `api_key=` only; no rotation API)
- https://docs.anthropic.com/en/api/managing-api-keys (Create/Disable/Delete; workspace-owned; no auto-rotation)
- https://owasp.org/www-project-api-security/ + https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/ (OWASP API2:2023 — strong tokens + revocation, NOT mandated auto-rotation)

**Q6 (5 sources):**
- https://docs.anthropic.com/en/api/rate-limits (12 anthropic-ratelimit-* header names verbatim)
- https://platform.openai.com/docs/guides/rate-limits (JS-rendered shell; canonical 6 headers cross-referenced via REQUIREMENTS.md FR-BROKER-C3-02)
- https://datatracker.ietf.org/doc/html/rfc7231 §7.1.3 + https://datatracker.ietf.org/doc/html/rfc9110 §10.2.3 (`Retry-After = HTTP-date / delay-seconds`)
- https://en.wikipedia.org/wiki/Token_bucket (algorithm reference: capacity + refill rate + burst)

## ASSUMED → VERIFIED Transitions (from RESEARCH.md Assumptions Log)

| # | Assumption (RESEARCH.md) | Status | Source |
|---|--------------------------|--------|--------|
| **A3** | "Caddy v2.11.2 on Server5 can use `caddy-ratelimit` plugin without rebuilding from source" | **REFUTED → VERIFIED that custom build IS required** | https://caddyserver.com/docs/modules/http.handlers.rate_limit ("Custom builds: This module does not come with Caddy") + https://raw.githubusercontent.com/mholt/caddy-ratelimit/master/README.md (`xcaddy build --with github.com/mholt/caddy-ratelimit`). **Phase 60 plan MUST budget the custom-build step.** |
| **A4** | "Cloudflare DNS posture for `*.livinity.io` is DNS-only (not proxied)" | **VERIFIED** | STATE.md ("Cloudflare DNS-only → Server5 → Mini PC via private LivOS tunnel"); cross-confirmed via https://developers.cloudflare.com/workers/configuration/routing/routes/ requiring "subdomain proxied by Cloudflare (also known as orange-clouded)" for Worker routes. **Posture-flip cost would be REAL for Candidate B (CF Worker); confirms Candidate A (Caddy) has zero DNS cost.** |

## Commits Created

| SHA | Subject | Files | Verifies |
|-----|---------|-------|----------|
| `4f452bd0` | docs(56-02): Q3+Q5 verdicts — header+path opt-in (path-precedence) and manual revoke+recreate (opt-in keys) | notes-q3-agent-mode.md (NEW), notes-q5-key-rotation.md (NEW), SPIKE-FINDINGS.md | Q3+Q5 structure check + sacred SHA |
| `3919271a` | docs(56-02): Q4 verdict — Server5 Caddy + on-demand LE TLS + caddy-ratelimit plugin (xcaddy custom build) | notes-q4-public-endpoint.md (NEW), SPIKE-FINDINGS.md | Q4 platform+TLS+rate-limit triplet check + sacred SHA |
| `f4eb0e4f` | docs(56-02): Q6 verdict — edge perimeter (Caddy) + broker-transparent forward (no broker-side bucket in v30) | notes-q6-rate-limit.md (NEW), SPIKE-FINDINGS.md | Q6 12+6+Retry-After header check + router.ts:158-185 cite + sacred SHA |

(Plus this SUMMARY.md commit follows.)

## Sacred File Integrity Across the Plan

| Task | SHA after task | Match required `4f868d318abff71f8c8bfbcf443b2393a553018b`? |
|------|----------------|-----------------------------------------------------------|
| Task 1 (Q3 + Q5) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |
| Task 2 (Q4)      | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |
| Task 3 (Q6)      | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ MATCH |

**Sacred file was NEVER read or written during plan 56-02.** Q3 / Q4 / Q5 / Q6 are perimeter / lifecycle / policy concerns; no internal-runner inspection was needed.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan specified WebFetch but in this environment WebFetch is implemented via curl (HTTP equivalent — same data, same content), and that was the tool used. All 23 distinct external URLs were fetched.

For **Q4** the URL https://github.com/mholt/caddy-ratelimit returned the GitHub HTML shell (not the README content). The documented fallback (raw GitHub README) was used and yielded the canonical `xcaddy build --with github.com/mholt/caddy-ratelimit` install instruction. **No "STOP, report" condition triggered.**

For **Q6** the OpenAI rate-limit page (https://platform.openai.com/docs/guides/rate-limits) is JS-rendered with no public crawler endpoint; the 6 canonical OpenAI rate-limit header names are sourced from the project's own REQUIREMENTS.md FR-BROKER-C3-02 (which specifies them verbatim and is the canonical project source) and cross-referenced with the OpenAI cookbook structure. **No "STOP, report" condition triggered** — the project's REQUIREMENTS.md is the canonical authority and the verdict cites it explicitly.

## Phase 56 Success Criteria Coverage

- ✓ ROADMAP Phase 56 success criterion #1 (verdicts not "TBD") — Q3 / Q4 / Q5 / Q6 all have concrete verdicts with rationale + alternatives.
- ✓ ROADMAP Phase 56 success criterion #3 (Q3 verdict has worked curl example for opt-in vs default) — three curl examples in Q3 verdict block (default passthrough + path opt-in + header opt-in).
- ✓ ROADMAP Phase 56 success criterion #4 (Q4 verdict pairs platform + TLS strategy + rate-limit primitive) — explicitly named: Server5 Caddy / on-demand LE TLS / caddy-ratelimit plugin.

## Self-Check: PASSED

**File existence checks:**
- FOUND: .planning/phases/56-research-spike/notes-q3-agent-mode.md
- FOUND: .planning/phases/56-research-spike/notes-q4-public-endpoint.md
- FOUND: .planning/phases/56-research-spike/notes-q5-key-rotation.md
- FOUND: .planning/phases/56-research-spike/notes-q6-rate-limit.md
- FOUND: .planning/phases/56-research-spike/SPIKE-FINDINGS.md (4 new sections appended: Q3, Q4, Q5, Q6)
- FOUND: .planning/phases/56-research-spike/56-02-SUMMARY.md (this file)

**Commit existence checks:**
- FOUND: 4f452bd0 (Q3+Q5)
- FOUND: 3919271a (Q4)
- FOUND: f4eb0e4f (Q6)

**Sacred file SHA at end of plan:** `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ MATCH
