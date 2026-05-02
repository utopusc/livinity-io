# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01 with `gaps_found` accepted; MiroFish dropped) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01, status `passed`, 18/18 reqs) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- ✅ **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-54 (shipped local 2026-05-02 via `--accept-debt`; Phase 55 carry-forward; new architectural issues surfaced → v30.0) — see [milestones/v29.5-ROADMAP.md](milestones/v29.5-ROADMAP.md)
- 🟢 **v30.0 Livinity Broker Professionalization** — Phases 56-63 (proposed; consumes [MILESTONE-CONTEXT.md](MILESTONE-CONTEXT.md) on `/gsd-new-milestone v30.0`)
- ⏸ **(deferred) Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes as a future milestone with phase renumber; the v30.0 slot is now claimed by Broker Professionalization)

---

## Phases

<details>
<summary>✅ v29.5 v29.4 Hot-Patch Recovery + Verification Discipline (Phases 49-54) — SHIPPED 2026-05-02</summary>

- [x] Phase 49: Mini PC Live Diagnostic (4/4 plans) — Server5 batched fixture captured; Mini PC SSH banned, fallback per D-49-02 used `v29.4-REGRESSIONS.md` as fixture; 4 verdict blocks synthesized.
- [x] Phase 50: A1 Tool Registry Built-in Seed (1/1 plan) — `seed-builtin-tools.ts` (90 LOC) writes 9 BUILT_IN_TOOL_IDS to `nexus:cap:tool:*` idempotently on livinityd boot; 4/4 integration tests passing.
- [x] Phase 51: A2 Streaming Regression Fix (1/1 plan, deploy-layer) — `update.sh` fresh-build hardening (rm -rf dist + reordered verify_build); sacred file UNTOUCHED; Branch N reversal DEFERRED per D-51-03.
- [x] Phase 52: A3 Marketplace State Correction — MiroFish DELETED from livinityd `builtin-apps.ts` + Server5 `apps` table archived; Bolt.diy hot-patches landed (wrangler-install + OPENAI_LIKE_API_KEY).
- [x] Phase 53: A4 Fail2ban Security Panel Render — no-op; root cause was collapsed sidebar (UI density), not code; Phase 51 fresh-build was the actual remediation.
- [x] Phase 54: B1 Live-Verification Gate (gsd toolkit) — `/gsd-complete-milestone` hard-blocks `passed` audit when `human_needed` count > 0; `--accept-debt` flag with forensic trail; first real-world invocation = this very close.
- [⚠] Phase 55: Mandatory Live Milestone-Level Verification — **NOT EXECUTED**. 14 formal UATs (4 v29.5 + 4 v29.4 + 6 v29.3 carry) deferred to v30.0 Phase 63. Closed via `--accept-debt`.

</details>

### 🟢 v30.0 Livinity Broker Professionalization (Proposed Phases 56-63)

Proposed phases (consumed by `/gsd-new-milestone v30.0` from [MILESTONE-CONTEXT.md](MILESTONE-CONTEXT.md)):

- [ ] Phase 56: Research spike — Anthropic SDK direct passthrough viability + Agent SDK boundaries + model selection landscape + public endpoint architecture (Caddy vs CF Workers) + Bearer token auth patterns
- [ ] Phase 57: A1 Passthrough mode — broker `/v1/messages` direct-to-anthropic.com, Agent SDK bypass, identity injection removed (depends on 56)
- [ ] Phase 58: C1+C2 True token streaming — Anthropic native SSE + OpenAI translation adapter rewrite (depends on 57)
- [ ] Phase 59: B1 Per-user Bearer token auth — `liv_sk_*` PG `api_keys` table + middleware + revocation (parallel)
- [ ] Phase 60: B2 Public endpoint — Server5 `api.livinity.io` reverse proxy + TLS + rate-limit perimeter (depends on 59)
- [ ] Phase 61: C3 Rate-limit headers + D1 model alias resolution + D2 provider interface stub (depends on 57, 58)
- [ ] Phase 62: E1+E2 Usage tracking accuracy + Settings UI (API Keys + Usage tabs) (depends on 59)
- [ ] Phase 63: **Mandatory live verification** — Bolt.diy + Open WebUI + Continue.dev + raw curl + Anthropic Python SDK end-to-end smoke tests on Mini PC + 14 carry-forward UATs from v29.x (depends on 57-62)

**Architectural Constraints (carry into v30.0):**

- D-NO-NEW-DEPS preserved (Anthropic SDK addition pending Phase 56 verdict)
- D-NO-SERVER4 preserved
- D-LIVINITYD-IS-ROOT preserved
- Sacred file `sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNTOUCHED in v30 (passthrough mode bypasses it; agent mode keeps current behavior)
- D-LIVE-VERIFICATION-GATE — Phase 63 is the first real-world test the gate must pass cleanly (not `--accept-debt`)
- D-NO-BYOK — broker issues its own `liv_sk_*` Bearer tokens; user's raw `claude_*` keys never enter the broker

## Progress

| Phase                                | Milestone | Plans Complete | Status      | Completed  |
|--------------------------------------|-----------|----------------|-------------|------------|
| 49. Mini PC Live Diagnostic          | v29.5     | 4/4            | Complete    | 2026-05-02 |
| 50. A1 Tool Registry Seed            | v29.5     | 1/1            | Complete    | 2026-05-02 |
| 51. A2 Streaming Fix                 | v29.5     | 1/1            | Complete    | 2026-05-02 |
| 52. A3 Marketplace State             | v29.5     | 0/0            | Complete    | 2026-05-02 |
| 53. A4 Security Panel Render         | v29.5     | 0/0            | Complete    | 2026-05-02 |
| 54. B1 Verification Gate             | v29.5     | 0/0            | Complete    | 2026-05-02 |
| 55. Live Milestone Verification      | v29.5     | 0/0            | DEFERRED    | →v30 P63   |
| 56. Research Spike (passthrough)     | v30.0     | 0/0            | Proposed    | -          |
| 57. A1 Passthrough mode              | v30.0     | 0/0            | Proposed    | -          |
| 58. C1+C2 True token streaming       | v30.0     | 0/0            | Proposed    | -          |
| 59. B1 Bearer token auth             | v30.0     | 0/0            | Proposed    | -          |
| 60. B2 Public endpoint               | v30.0     | 0/0            | Proposed    | -          |
| 61. C3+D1+D2 Spec compliance         | v30.0     | 0/0            | Proposed    | -          |
| 62. E1+E2 Usage tracking + UI        | v30.0     | 0/0            | Proposed    | -          |
| 63. Mandatory live verification      | v30.0     | 0/0            | Proposed    | -          |

---

## Project-Level Milestone Index (carry-over)

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
- v29.2 Factory Reset (shipped 2026-04-29)
- v29.3 Marketplace AI Broker (Subscription-Only) (shipped local 2026-05-01)
- v29.4 Server Management Tooling + Bug Sweep (shipped local 2026-05-01)
- v29.5 v29.4 Hot-Patch Recovery + Verification Discipline (shipped local 2026-05-02 via `--accept-debt`)
- **v30.0 Livinity Broker Professionalization** (proposed, awaiting `/gsd-new-milestone v30.0`)
- (deferred) Backup & Restore — 8 phases defined in `milestones/v30.0-DEFINED/`, renumbered to a future slot

---

*Last updated: 2026-05-02 — v29.5 closed via `--accept-debt`. ROADMAP.md collapsed; Phases 49-54 archived to `milestones/v29.5-phases/`. v30.0 Backup & Restore renamed (deferred); v30.0 slot now points to Livinity Broker Professionalization (consumes MILESTONE-CONTEXT.md).*
