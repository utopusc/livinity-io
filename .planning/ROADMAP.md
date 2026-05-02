# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01 with `gaps_found` accepted; MiroFish dropped) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01, status `passed`, 18/18 reqs) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- 📋 **v29.5 (TBD)** — not yet defined
- ⏸ **v30.0 Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes after v29.5 with phase renumber)

## Phases

<details>
<summary>✅ v29.4 Server Management Tooling + Bug Sweep (Phases 45-48) — SHIPPED LOCAL 2026-05-01</summary>

- [x] Phase 45: Carry-Forward Sweep (FR-CF-01..04) — completed 2026-05-01
- [x] Phase 46: Fail2ban Admin Panel (FR-F2B-01..06) — completed 2026-05-01
- [x] Phase 47: AI Diagnostics — Registry + Identity + Probe (FR-TOOL/MODEL/PROBE — Branch N taken) — completed 2026-05-01
- [x] Phase 48: Live SSH Session Viewer (FR-SSH-01..02) — completed 2026-05-01

Full archive: `milestones/v29.4-ROADMAP.md` · Audit: `milestones/v29.4-MILESTONE-AUDIT.md` · Integration: `milestones/v29.4-INTEGRATION-CHECK.md`

</details>

<details>
<summary>✅ v29.3 Marketplace AI Broker (Phases 39-44) — SHIPPED LOCAL 2026-05-01</summary>

- [x] Phase 39: Risk Fix — Close OAuth Fallback (FR-RISK-01)
- [x] Phase 40: Per-User Claude OAuth + HOME Isolation (FR-AUTH-01..03)
- [x] Phase 41: Anthropic Messages Broker (FR-BROKER-A-01..04)
- [x] Phase 42: OpenAI-Compatible Broker (FR-BROKER-O-01..04)
- [x] Phase 43: Marketplace Integration (FR-MARKET-01 satisfied · FR-MARKET-02 dropped)
- [x] Phase 44: Per-User Usage Dashboard (FR-DASH-01..02 · FR-DASH-03 partial)

Full archive: `milestones/v29.3-ROADMAP.md`

</details>

### 📋 v29.5 (queued)

Not yet defined. Run `/gsd-new-milestone v29.5` when ready.

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
- **v29.4 Server Management Tooling + Bug Sweep** (shipped local 2026-05-01)
- v29.5 — TBD
- v30.0 Backup & Restore — PAUSED (8 phases defined; resumes after v29.5)

---

*Last updated: 2026-05-01 — v29.4 milestone closed by `/gsd-complete-milestone v29.4`. Awaiting `/gsd-new-milestone v29.5`.*
