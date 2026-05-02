---
gsd_state_version: 1.0
milestone: v30.0
milestone_name: Livinity Broker Professionalization
status: roadmap-defined
last_updated: "2026-05-02T20:00:00Z"
last_activity: "2026-05-02 — v30.0 ROADMAP.md created; 8 phases (56-63), 38/38 reqs mapped"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v30.0 milestone started)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v30.0 — Livinity Broker Professionalization (Real API Endpoint Mode)
**Last shipped milestone:** v29.5 v29.4 Hot-Patch Recovery + Verification Discipline — 2026-05-02 (closed via `--accept-debt`)

## Current Position

Phase: Not started (roadmap defined; awaiting `/gsd-discuss-phase 56`)
Plan: —
Status: Roadmap defined — 8 phases (56-63), 38/38 reqs mapped, Phase 56 mandatory spike, Phase 63 mandatory live verification
Last activity: 2026-05-02 — `gsd-roadmapper` produced ROADMAP.md and filled Phase Traceability

## v30.0 Roadmap Snapshot

| Phase | Goal                                                                | Reqs                              | Depends on            |
|-------|---------------------------------------------------------------------|-----------------------------------|-----------------------|
| 56    | Research Spike — answer 7 open Qs (passthrough / endpoint / auth)   | (research-only, 0 reqs)           | —                     |
| 57    | A1+A2 Passthrough Mode + Agent Mode Opt-In                          | A1-01..04, A2-01..02 (6)          | 56                    |
| 58    | C1+C2 True Token Streaming (Anthropic + OpenAI)                     | C1-01..02, C2-01..03 (5)          | 57                    |
| 59    | B1 Per-User Bearer Token Auth (`liv_sk_*`)                          | B1-01..05 (5)                     | — (parallel)          |
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
- D-51-03 (Branch N reversal) deferred to Phase 56 spike resolution
- v30.0 slot now claimed by Broker Professionalization; old "v30.0 Backup & Restore" definition (in `milestones/v30.0-DEFINED/`) deferred to a future milestone

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

1. **`/gsd-discuss-phase 56`** — gather Phase 56 spike context. Phase 56 is research-heavy and must answer the 7 open questions above before Phase 57 (passthrough mode) can plan.
2. **Phase 56 produces `SPIKE-FINDINGS.md`** with concrete decisions for each of the 7 questions — these unblock Phases 57-62 implementation planning.
3. **Phases 57 + 59 can begin in parallel** once Phase 56 ships (57 needs the SDK-direct-vs-HTTP-proxy verdict; 59 is independent of Phase 56's outputs and can start as soon as PG migration tooling is ready).

## Forensic Trail

- 2026-05-02T19:35Z — `/gsd-complete-milestone v29.5 --accept-debt` executed. v29.5 closed; phases archived; tag `v29.5` created.
- 2026-05-02T19:40Z — `/gsd-new-milestone v30.0` invoked. STATE.md reset. MILESTONE-CONTEXT.md will be deleted after consumption.
- 2026-05-02T20:00Z — `gsd-roadmapper` produced `.planning/ROADMAP.md` (8 phases 56-63), filled `.planning/REQUIREMENTS.md` Phase Traceability (38/38 mapped), updated this STATE.md with v30.0 Roadmap Snapshot. Status transitioned `defining-requirements` → `roadmap-defined`.
