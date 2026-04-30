# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- ✅ **v21.0 Autonomous Agent Platform** — Phases 19-28 (shipped 2026-03-28)
- ✅ **v22.0 Livinity AGI Platform** — Phases 29-36 (shipped 2026-03-29)
- ✅ **v23.0 Mobile PWA** — Phases 37-40 (shipped 2026-04-01)
- ✅ **v24.0 Mobile Responsive UI** — Phases 1-5 (shipped 2026-04-01)
- ✅ **v25.0 Memory & WhatsApp Integration** — Phases 6-10 (shipped 2026-04-03)
- ✅ **v26.0 Device Security & User Isolation** — Phases 11-16 (shipped 2026-04-24)
- ✅ **v27.0 Docker Management Upgrade** — Phases 17-23 (shipped 2026-04-25)
- ✅ **v28.0 Docker Management UI (Dockhand-Style)** — Phases 24-30 (shipped 2026-04-26)
- ✅ **v29.0 Deploy & Update Stability** — Phases 31-35 (shipped 2026-04-27)
- ✅ **v29.2 Factory Reset (mini-milestone)** — Phases 36-38 (shipped 2026-04-29) — see [milestones/v29.2-ROADMAP.md](milestones/v29.2-ROADMAP.md)
- 📋 **v30.0 Backup & Restore** — DEFINED, paused (8 phases / 47 BAK-* reqs archived in `.planning/milestones/v30.0-DEFINED/`; resumes next with phase renumber from 39)

## Active Milestone

None. Run `/gsd-new-milestone` to start the next milestone, or unpause v30.0 from `.planning/milestones/v30.0-DEFINED/`.

## Recently Shipped

**v29.2 Factory Reset (mini-milestone)** — 2026-04-29
- Tek tıkla "fabrika ayarlarına dön": Settings > Advanced > Factory Reset
- 3 phases (36 audit + 37 backend + 38 UI), 11 plans, 184/184 tests passing
- Audit: install.sh NOT-IDEMPOTENT, argv-only API key leak → wrapper closes route-spawn window
- Backend: idempotent wipe in systemd-run cgroup-escape scope; pre-wipe tar snapshot recovery; 4-way failure classification
- UI: Danger Zone button + explicit-list modal + type-FACTORY-RESET-to-confirm + BarePage progress overlay + post-reset routing
- v29.2.1 carry-forwards: install.sh env-var fallback patch + ALTER USER patch + update.sh cache populator
- See [v29.2-MILESTONE-AUDIT.md](v29.2-MILESTONE-AUDIT.md) for full audit
