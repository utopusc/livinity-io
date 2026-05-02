---
gsd_state_version: 1.0
milestone: v29.5
milestone_name: v29.4 Hot-Patch Recovery + Verification Discipline
status: ready-to-plan
stopped_at: v29.5 ROADMAP.md created 2026-05-02 — 7 phases (49-55) derived, 26/26 reqs mapped 100%. Awaiting `/gsd-plan-phase 49` to start execution. Phase 49 is the mandatory single-batch SSH diagnostic; Phases 50-53 fix A1/A2/A3/A4 in parallel after 49; Phase 54 (B1 verification gate) runs independently; Phase 55 is the new mandatory live-verification milestone close.
last_updated: "2026-05-02T00:00:00Z"
last_activity: 2026-05-02 -- gsd-roadmapper completed. ROADMAP.md written with 7-phase structure, REQUIREMENTS.md traceability filled, STATE.md updated. Next phase to plan = 49.
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v29.5 milestone started)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v29.5 — v29.4 Hot-Patch Recovery + Verification Discipline
**Last shipped milestone:** v29.4 Server Management Tooling + Bug Sweep — 2026-05-01 (local; awaiting deploy + UAT walk in Phase 55)

## Current Position

Phase: 49 (Mini PC Live Diagnostic — single-batch SSH) — Not started
Plan: —
Status: Ready to plan Phase 49
Last activity: 2026-05-02 — Roadmap created (7 phases, 26 reqs mapped)

## Progress

```
[░░░░░░░░░░░░░░░░░░░░] 0% — 0/7 phases · 0/0 plans
```

## v29.5 Roadmap Snapshot

| Phase | Goal | Reqs | Depends on |
|---|---|---|---|
| 49 | Mini PC live diagnostic (single-batch SSH) | FR-A1-01 / FR-A2-01 / FR-A3-04 / FR-A4-01 | — |
| 50 | A1 tool registry built-in seed module | FR-A1-01 / FR-A1-02 | 49 |
| 51 | A2 streaming root-cause fix (D-40-01 ritual if sacred edit) | FR-A2-02 / FR-A2-04 | 49 |
| 52 | A3 Bolt.diy re-seed + MiroFish un-seed (Server5) | FR-A3-01 / FR-A3-02 / FR-A3-04 | 49 |
| 53 | A4 Security panel render fix | FR-A4-02 | 49 |
| 54 | B1 live-verification gate + retroactive v29.4 re-audit | FR-B1-01..05 | — (parallel) |
| 55 | Mandatory live milestone-level verification | FR-A1-03/04 · FR-A2-03 · FR-A3-03 · FR-A4-03/04 · FR-VERIFY-01..05 | 50, 51, 52, 53, 54 |

**Coverage:** 26/26 requirements mapped 100% (no orphans).

## v29.5 Milestone Context

**Why this milestone exists:** User testing immediately after v29.4 deploy revealed 4 critical regressions despite audit returning `passed`. v29.4's audit was insufficient — it accepted `human_needed` UAT deferrals as routine. The fix is BOTH: close the regressions AND change the milestone-completion process so this class of failure cannot repeat.

**Target features (5 categories):**

- **A1 — Tool registry restoration** (`nexus:cap:tool:*` = 0 keys on Mini PC; defensive eager seed of 9 BUILT_IN_TOOL_IDS)
- **A2 — Streaming regression fix** (root-cause unknown; investigate UI build / PWA cache / sacred file surgical edit per D-40-01)
- **A3 — Marketplace state** (re-seed Bolt.diy + un-seed MiroFish on Server5 `platform_apps`)
- **A4 — Fail2ban Security panel render fix** (PWA cache / user_preferences default / sidebar useMemo filter)
- **B1 — Live-verification gate** (`/gsd-complete-milestone` hard-block on `human_needed` UAT count)

**Locked decisions (carry from v29.4):**
- D-NO-NEW-DEPS preserved
- D-NO-SERVER4 preserved (Mini PC + Server5 only)
- D-LIVINITYD-IS-ROOT preserved
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — likely surgical edit needed for A2 (D-40-01 ritual)
- **D-LIVE-VERIFICATION-GATE (NEW)** — milestones cannot close `passed` without on-Mini-PC UAT execution

## Accumulated Context (carried from v29.4)

### Mini PC deployment (the only LivOS deployment that matters)

- `bruce@10.69.31.68` — `/opt/livos/` rsync-deployed (no .git on server)
- systemd: `livos.service` (livinityd via tsx, port 8080), `liv-core.service` (nexus core dist, 3200), `liv-worker.service`, `liv-memory.service`
- Deploy: `bash /opt/livos/update.sh` (clones from utopusc/livinity-io, rsyncs, builds via pnpm + tsc, restarts services)
- pnpm-store quirk: multiple `@nexus+core*` dirs may exist — manually verify dist sync after update
- Redis password: pull from `/opt/livos/.env` REDIS_URL (rotated; legacy `LivRedis2024!` is stale)
- PG password: `/opt/livos/.env` DATABASE_URL (rotated)
- JWT secret: `/opt/livos/data/secrets/jwt`
- Capability registry prefix: **`nexus:cap:*`** (NOT `nexus:capabilities:*`)
- Pre-existing breakage: `liv-memory.service` restart-loops because `update.sh` doesn't build memory package — separate fix

### Diagnostic ground truth (from `.planning/v29.4-REGRESSIONS.md`)

- Redis DBSIZE: 310 keys, `nexus:cap:*` = 126 keys, **`nexus:cap:tool:*` = 0 keys** ← A1 smoking gun
- BUILT_IN_TOOL_IDS lists 9 tools: shell, docker_run/ps/logs/stop, files_read/write/search, web_search
- Phase 47 capabilities.ts uses correct `nexus:cap:` prefix at line 174 ✓
- Phase 47-02 SUMMARY documented `D-WAVE5-SYNCALL-STUB` — production Re-sync writes ZERO keys to `nexus:cap:_pending:*` (no real seed flow)
- 1m 2s deploy duration suspiciously short — vite build alone is ~37s; suggests stale UI bundle (A2/A4 root cause)
- Mini PC fail2ban auto-bans rapid SSH probes — ALL diagnostic SSH calls MUST batch into ONE invocation

### Outstanding UATs to walk in Phase 55

- v29.4: `45-UAT.md` / `46-UAT.md` / `47-UAT.md` / `48-UAT.md`
- v29.3 carry-forward: `40-UAT.md` / `41-UAT.md` / `42-UAT.md` / `43-UAT.md` / `44-UAT.md`

## Next Steps

1. `/gsd-plan-phase 49` — plan the mandatory single-batch SSH diagnostic phase. Phase 49 outputs feed Phases 50-53 root-cause decisions.
2. After Phase 49 ships, plan Phases 50-53 (parallelizable) + Phase 54 (independent gate work).
3. Phase 55 is the milestone-close gate — do NOT skip it.

## Forensic Trail

- 2026-05-02 — `/gsd-new-milestone v29.5` invoked. PROJECT.md updated. STATE.md reset.
- 2026-05-02 — REQUIREMENTS.md filled (26 reqs across 6 categories: A1/A2/A3/A4/B1/VERIFY).
- 2026-05-02 — gsd-roadmapper produced ROADMAP.md (7 phases, 49-55, 100% coverage). REQUIREMENTS.md traceability filled. STATE.md updated to `ready-to-plan`.
