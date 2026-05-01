# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01 with `gaps_found` accepted as v29.4 carry-forward; MiroFish dropped) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- 🟡 **v29.4 Server Management Tooling + Bug Sweep** — Phases 45+ (queued; see `MILESTONE-CONTEXT.md`)
- ⏸ **v30.0 Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes after v29.4 with phase renumber)

## Phases

<details>
<summary>✅ v29.3 Marketplace AI Broker (Phases 39-44) — SHIPPED LOCAL 2026-05-01</summary>

- [x] Phase 39: Risk Fix — Close OAuth Fallback (FR-RISK-01) — completed 2026-04-29
- [x] Phase 40: Per-User Claude OAuth + HOME Isolation (FR-AUTH-01..03) — completed 2026-04-30
- [x] Phase 41: Anthropic Messages Broker (FR-BROKER-A-01..04) — completed 2026-04-30
- [x] Phase 42: OpenAI-Compatible Broker (FR-BROKER-O-01..04) — completed 2026-04-30
- [x] Phase 43: Marketplace Integration (FR-MARKET-01 satisfied · FR-MARKET-02 dropped 2026-05-01) — completed 2026-04-30
- [x] Phase 44: Per-User Usage Dashboard (FR-DASH-01..02 satisfied · FR-DASH-03 partial, debt accepted) — completed 2026-04-30

Full archive: `milestones/v29.3-ROADMAP.md` · Audit: `milestones/v29.3-MILESTONE-AUDIT.md` · Integration: `milestones/v29.3-INTEGRATION-CHECK.md`

</details>

### 🟡 v29.4 Server Management Tooling + Bug Sweep (queued)

Roadmap not yet generated — `/gsd-new-milestone v29.4` next.
Source: `.planning/MILESTONE-CONTEXT.md` (8 candidate features across 3 buckets: A bug fixes from live testing · B new Server Management features · C v29.3 carry-forward sweep).

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
- **v29.3 Marketplace AI Broker (Subscription-Only)** (shipped local 2026-05-01)
- v29.4 Server Management Tooling + Bug Sweep — QUEUED
- v30.0 Backup & Restore — PAUSED (8 phases defined; resumes after v29.4)

---

*Last updated: 2026-05-01 — v29.3 milestone closed by `/gsd-complete-milestone v29.3`. Awaiting `/gsd-new-milestone v29.4`.*
