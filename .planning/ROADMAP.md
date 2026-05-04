# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01 with `gaps_found` accepted; MiroFish dropped) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01, status `passed`, 18/18 reqs) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- ✅ **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-54 (shipped local 2026-05-02 via `--accept-debt`; Phase 55 carry-forward; new architectural issues surfaced → v30.0) — see [milestones/v29.5-ROADMAP.md](milestones/v29.5-ROADMAP.md)
- ✅ **v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope)** — Phases 56-63 (shipped local 2026-05-04 via `--accept-debt`; F7 Suna sandbox + F2-F5 carry to v31) — see [milestones/v30.0-ROADMAP.md](milestones/v30.0-ROADMAP.md)
- 📋 **v31.0 Liv Agent Reborn** — Phases 64-76 (PLANNED — Nexus → Liv rename + Suna-only UI overhaul + Bytebot computer use; draft at `.planning/v31-DRAFT.md`, awaiting `/gsd-new-milestone` formal intake)
- ⏸ **(deferred) Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes as future milestone slot, e.g. v32.0)

---

## Phases

<details>
<summary>✅ v30.0 Livinity Broker Professionalization (Phases 56-63) — SHIPPED 2026-05-04 via --accept-debt</summary>

- [x] Phase 56: Research Spike (4/4 plans) — 9 D-30-XX decisions locked; SPIKE-FINDINGS.md
- [x] Phase 57: A1+A2 Passthrough Mode + Agent Mode Opt-In (5/5 plans, 6/6 reqs) — sacred file byte-identical; 95 tests GREEN
- [x] Phase 58: C1+C2 True Token Streaming (5/5 plans, 5/5 reqs) — Anthropic verbatim SSE forward + OpenAI 1:1 translation; 56 new tests
- [x] Phase 59: B1 Per-User Bearer Token Auth (5/5 plans, 5/5 reqs) — `liv_sk_*` Bearer middleware + 4 tRPC procs + audit reuse
- [⚠] Phase 60: B2 Public Endpoint + Rate-Limit (5/5 plans, 2/2 reqs) — Server5 Caddy custom build + api.livinity.io block; **VERIFICATION human_needed** (live UAT walk waived per --accept-debt)
- [x] Phase 61: C3+D1+D2 Spec Compliance + Aliases + Provider Stub (4/4 plans, 7/7 reqs) — alias-resolver + 4 BrokerProvider stubs; 53 new tests
- [⚠] Phase 62: E1+E2 Usage Tracking + Settings UI (5/5 plans, 5/5 reqs) — broker_usage.api_key_id FK + Settings API Keys CRUD + filter dropdown; **VERIFICATION human_needed** (live UAT walk waived per --accept-debt)
- [⚠] Phase 63: Mandatory Live Verification (1/11 plans formal walkthrough) — R1-R3.11 hot-patches live-verified end-to-end during Bolt.diy debug sessions (subscription auth /root creds breakthrough at R3.8, dynamic client-tools MCP at R3.9, full disallowedTools at R3.11). Formal walkthrough waived per --accept-debt; 14 carryforward UATs + Phase 63's own 11 plan walks lifted into v31 P64 (v30.5 final cleanup at v31 entry).

**v30.5 informal scope (folded into v30.0 close):**
- F1 Built-in tool isolation (R3.11 disallowedTools) — done
- F6 External client compat (Bearer + x-api-key dual accept) — done; live-verified via curl
- F8 Multi-subdomain LivOS support (80%) — manual Redis insert pattern works; needs `additionalServices` field for portability
- F2/F3/F4/F5 + F7 Suna sandbox network → v31 carryover (P74 + P71 respectively)

**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` — current SHA `9f1562be...` after 25 normal feature commits since v22 era. Old "UNTOUCHED" rule was stale memory; file actively developed and stable throughout v29-v30.

**Stats:** 8 phases / 44 plans (41 summaries) / 166 commits since v30.0 seed (`d59b1b51`) / 0 new top-level npm deps.

</details>

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
- **v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope)** (shipped local 2026-05-04 via `--accept-debt`)
- **v31.0 Liv Agent Reborn** (PLANNED — Nexus → Liv rename + Suna UI overhaul + Bytebot computer use)
- (deferred) Backup & Restore — 8 phases defined in `milestones/v30.0-DEFINED/`, renumbered to future slot (likely v32.0)

---

*Last updated: 2026-05-04 — v30.0 closed via --accept-debt; v31 awaits `/gsd-new-milestone` intake using `.planning/v31-DRAFT.md` as input*
