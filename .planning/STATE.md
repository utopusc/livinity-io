---
gsd_state_version: 1.0
milestone: v29.5
milestone_name: v29.4 Hot-Patch Recovery + Verification Discipline
status: defining-requirements
stopped_at: v29.5 milestone bootstrapped 2026-05-02 from MILESTONE-CONTEXT.md. Closing 4 user-reported v29.4 regressions (A1 tool registry / A2 streaming / A3 marketplace state / A4 Fail2ban panel) + B1 live-verification gate. Phases continue from 49.
last_updated: "2026-05-02T00:00:00Z"
last_activity: 2026-05-02 -- /gsd-new-milestone v29.5 invoked. MILESTONE-CONTEXT.md consumed (deleted). PROJECT.md updated with Current Milestone block (v29.5). STATE.md reset for new milestone. Awaiting requirements + roadmap creation.
progress:
  total_phases: 0
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

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-02 — Milestone v29.5 started

## v29.5 Milestone Context

**Why this milestone exists:** User testing immediately after v29.4 deploy revealed 4 critical regressions despite audit returning `passed`. v29.4's audit was insufficient — it accepted `human_needed` UAT deferrals as routine. The fix is BOTH: close the regressions AND change the milestone-completion process so this class of failure cannot repeat.

**Target features (5 categories):**

- **A1 — Tool registry restoration** (`nexus:cap:tool:*` = 0 keys on Mini PC; defensive eager seed of 9 BUILT_IN_TOOL_IDS)
- **A2 — Streaming regression fix** (root-cause unknown; investigate UI build / PWA cache / sacred file surgical edit per D-40-01)
- **A3 — Marketplace state** (re-seed Bolt.diy + un-seed MiroFish on Server5 `platform_apps`)
- **A4 — Fail2ban Security panel render fix** (PWA cache / user_preferences default / sidebar useMemo filter)
- **B1 — Live-verification gate** (`/gsd-complete-milestone` hard-block on `human_needed` UAT count)

**Suggested phase breakdown (roadmapper will refine):**

| Phase | Goal | Deps |
|---|---|---|
| 49 | Mini PC live diagnostic + force-rebuild update.sh check (read-only, single SSH session) | — |
| 50 | A1 tool registry built-in seed module + livinityd boot wire-up + integration test | 49 |
| 51 | A2 streaming root-cause investigation + fix (UI build / sacred file / preset) | 49 |
| 52 | A3 Bolt.diy re-seed + MiroFish un-seed on Server5 platform DB | 49 |
| 53 | A4 Security panel render investigation + fix | 49 |
| 54 | B1 Live-verification gate added to /gsd-complete-milestone workflow | — |
| 55 | Mandatory milestone-level live verification: deploy + walk all UATs on Mini PC | 50, 51, 52, 53, 54 |

**Locked decisions (carry from v29.4):**
- D-NO-NEW-DEPS preserved
- D-NO-SERVER4 preserved (Mini PC + Server5 only)
- D-LIVINITYD-IS-ROOT preserved
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d31...` — likely surgical edit needed for A2 (D-40-01 ritual)
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

1. Decide on research (Step 8 — recommend SKIP since `v29.4-REGRESSIONS.md` already has root-cause + recommendations)
2. Define REQUIREMENTS.md with FR-A1 / FR-A2 / FR-A3 / FR-A4 / FR-B1 categories
3. Spawn gsd-roadmapper for ROADMAP.md (continue numbering from 49)
4. After approval, `/gsd-discuss-phase 49` to start execution
