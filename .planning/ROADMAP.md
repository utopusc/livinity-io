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
- ⏳ **v29.2 Factory Reset (mini-milestone)** — Phases 36-38 (in progress)
- 📋 **v30.0 Backup & Restore** — DEFINED, paused (8 phases / 47 BAK-* reqs archived in `.planning/milestones/v30.0-DEFINED/`; resumes after v29.2 with phase renumber)

## Phases

**Active milestone: v29.2 Factory Reset (Phases 36-38)**

- [x] **Phase 36: install.sh Audit & Hardening** — Verify `livinity.io/install.sh` exists, accepts `--api-key`, idempotent, supports stdin/`--api-key-file`, half-deleted-state recovery; document in AUDIT-FINDINGS.md — completed 2026-04-29 (NOT-IDEMPOTENT verdict, argv FAIL, wrapper spec'd, recovery via pre-wipe-snapshot, all 4 D-10 questions answered)
- [ ] **Phase 37: Backend Factory Reset** — `system.factoryReset({preserveApiKey})` tRPC route, idempotent wipe bash (services + scoped Docker + DB drop + filesystem rm), API key stash, install.sh re-execution via cgroup-escape, JSON event row in update-history
- [ ] **Phase 38: UI Factory Reset** — Settings > Advanced "Danger Zone" button, explicit-list confirmation modal, preserve-account-vs-fresh radio, type-FACTORY-RESET-to-confirm, BarePage progress overlay, post-reset login routing, pre-reset blocking checks

## Phase Details

### Phase 36: install.sh Audit & Hardening
**Goal**: De-risk the entire factory-reset chain by proving (or hardening) that `livinity.io/install.sh` exists, accepts an API key without leaking it, runs idempotently on already-installed hosts, and has a recovery story for half-deleted state. The audit's findings gate Phase 37's wipe/reinstall design — without confidence in install.sh's behavior, the wipe step is a one-way trip into a brick.
**Depends on**: Nothing (entry point of v29.2; Audit-only — no production wipes)
**Requirements**: FR-AUDIT-01, FR-AUDIT-02, FR-AUDIT-03, FR-AUDIT-04, FR-AUDIT-05
**Success Criteria** (what must be TRUE):
  1. `phases/36-install-sh-audit/AUDIT-FINDINGS.md` documents the actual fetched contents of `livinity.io/install.sh`, its argument surface, and its idempotency behavior on a host that already has `/opt/livos/`
  2. The findings explicitly state whether install.sh accepts `--api-key-file <path>` (or `--api-key` via stdin) — NEVER argv. If argv-only, the audit produces a hardening patch that adds the safer interface
  3. Half-deleted-state recovery plan documented — either install.sh natively supports `--resume`, OR Phase 37's wipe step takes a pre-wipe `/opt/livos` snapshot to a known recovery directory before unlinking
  4. Server5 outage fallback identified — if relay is down at reset time, the documented path to recovery (cached install.sh, public bootstrap key, alternate URL) exists or is filed as v29.2.1 follow-up
  5. Phase 37 backend planner can read AUDIT-FINDINGS.md alone and design the wipe+reinstall bash without re-running the audit
**Plans**: 3 plans
  - [x] 36-01-snapshot-provenance-PLAN.md — Fetch install.sh, capture headers, scaffold AUDIT-FINDINGS.md (FR-AUDIT-01, FR-AUDIT-05) — completed 2026-04-29 (snapshot SHA-256 c00be0bf...3137, 1604 lines, AUDIT-FINDINGS.md scaffold with 9 sections)
  - [x] 36-02-static-analysis-PLAN.md — Argument surface + idempotency verdict + API key transport (FR-AUDIT-01, FR-AUDIT-02, FR-AUDIT-04) — completed 2026-04-29 (1 flag mapped, 74 commands classified, verdict NOT-IDEMPOTENT, transport argv FR-AUDIT-04 FAIL → Plan 03 wrapper required)
  - [x] 36-03-recovery-server5-hardening-PLAN.md — Recovery model + Server5 fallback + hardening proposals + Phase 37 readiness (FR-AUDIT-03, FR-AUDIT-05) — completed 2026-04-29 (recovery: pre-wipe tar snapshot per D-07; Server5 fallback: cached install.sh on Mini PC per D-09 (a); hardening: livos-install-wrap.sh full source mandatory v29.2 + install.sh env-var diff + ALTER USER diff deferred to v29.2.1; Phase 37 Readiness: all 4 D-10 questions answered with literal bash)
**Research flag**: this phase IS the audit/research; AUDIT-FINDINGS.md is the deliverable

### Phase 37: Backend Factory Reset
**Goal**: A `system.factoryReset({preserveApiKey})` tRPC route triggers an idempotent root-level wipe of LivOS (services + scoped Docker + DB + filesystem) and re-executes install.sh as a detached cgroup-escaped process so it survives killing its own livinityd parent. The wipe stops short of nuking unrelated host state (NOT global `docker volume prune`) and emits a JSON event row matching v29.0 Phase 33 schema with `status: "factory-reset"`.
**Depends on**: Phase 36 (consumes install.sh AUDIT-FINDINGS.md to know exactly what arguments to pass and how to wrap)
**Requirements**: FR-BACKEND-01, FR-BACKEND-02, FR-BACKEND-03, FR-BACKEND-04, FR-BACKEND-05, FR-BACKEND-06, FR-BACKEND-07
**Success Criteria** (what must be TRUE):
  1. `system.factoryReset({preserveApiKey: boolean})` tRPC route exists in `livos/packages/livinityd/source/modules/system/`, returns immediately (detached spawn), and is registered in `httpOnlyPaths` in `common.ts` so the long-running mutation cannot ride the WebSocket — verified by curl-invoking the route and observing a 202-equivalent response within 200ms
  2. Wipe procedure stops `livos liv-core liv-worker liv-memory livos-rollback caddy` (preserves sshd), iterates `user_app_instances` to scope `docker stop`/`docker rm` to LivOS-managed containers ONLY, drops `livos` PG database + user, and removes `/opt/livos /opt/nexus /etc/systemd/system/{livos,liv-core,liv-worker,liv-memory,livos-rollback}.service`. Idempotent — running the wipe twice on the same host produces no errors
  3. `preserveApiKey: true` stashes `LIV_API_KEY` from `/opt/livos/.env` to `/tmp/livos-reset-apikey` (mode 0600) BEFORE the rm step; install.sh receives it via `--api-key-file /tmp/livos-reset-apikey` (per Phase 36 audit); the temp file is removed after install.sh completes (success OR failure). `preserveApiKey: false` skips the stash entirely
  4. The wipe+reinstall bash runs in a transient `systemd-run --scope --collect` cgroup (v29.1 pattern) so `systemctl stop livos` mid-flight does NOT kill the wipe process — verified by triggering reset, killing livos.service mid-wipe, and observing the wipe still completing
  5. JSON event row at `/opt/livos/data/update-history/<ts>-factory-reset.json` records: timestamp, preserveApiKey choice, wipe duration, reinstall duration, install.sh exit code, final status. Schema extends Phase 33 OBS-01 `update-history` shape with `status: "factory-reset"`. After reinstall, the new livinityd's history reader picks it up and surfaces in Phase 38 UI
  6. install.sh failure modes handled: 401 on revoked API key surfaces in JSON event row with `error: "api-key-401"` and the post-reset UI shows "API key invalid — log into livinity.io and re-issue"; transient Server5 5xx triggers up to 3 retries before flagging `error: "server5-unreachable"`
**Plans**: 4 plans
  - [x] 37-01-bash-scripts-PLAN.md — Author factory-reset.sh + livos-install-wrap.sh source files (FR-BACKEND-02, FR-BACKEND-04, FR-BACKEND-05) — completed 2026-04-29 (2 source bash files, both shellcheck-clean exit 0; idempotent wipe + pre-wipe tar snapshot + JSON event lifecycle + EXIT-trap apikey cleanup; v29.2 ships in wrapper-degraded mode)
  - [x] 37-02-trpc-route-PLAN.md — Wire system.factoryReset adminProcedure + httpOnlyPaths + Zod input + pre-flight checks + API key stash (FR-BACKEND-01, FR-BACKEND-03)
  - [x] 37-03-spawn-deploy-PLAN.md — Cgroup-escape spawn via systemd-run + first-call deployment of bash artifacts to /opt/livos/data/ (FR-BACKEND-01, FR-BACKEND-06) — completed 2026-04-29 (deployRuntimeArtifacts + spawnResetScope helpers wired into performFactoryReset; 28/28 unit tests passing including 200ms wall-clock + preflight-gates-spawn invariant; argv matches reference_cgroup_escape.md verbatim)
  - [ ] 37-04-failure-handling-integration-PLAN.md — install.sh failure classification + JSON event schema tests + opt-in destructive integration test (FR-BACKEND-05, FR-BACKEND-07)

### Phase 38: UI Factory Reset
**Goal**: A user can find the Factory Reset button in Settings > Advanced, read an explicit list of what will be deleted, type-to-confirm, choose preserve-account-vs-fresh, and watch the reinstall progress in a BarePage cover (mirroring Phase 30 update overlay). The pre-flight blocks reset if an update or backup is running, the network is unreachable, or the user lacks admin role.
**Depends on**: Phase 37 (UI calls the live tRPC route and reads the live JSON event row for progress)
**Requirements**: FR-UI-01, FR-UI-02, FR-UI-03, FR-UI-04, FR-UI-05, FR-UI-06, FR-UI-07
**Success Criteria** (what must be TRUE):
  1. Settings > Advanced > "Danger Zone" section shows a red destructive Factory Reset button with shield/warning icon; only admin users see it — non-admin users see an explanatory note instead
  2. Click opens a confirmation modal that explicitly enumerates everything being deleted ("All apps, all user accounts, all data, all settings, all sessions, all secrets including JWT and AI keys, all schedules, all Docker volumes managed by LivOS"); the explicit list IS the consent surface, not generic "are you sure?"
  3. Modal includes a radio with two options: "Restore my account" (preserveApiKey=true) and "Start fresh as new user" (preserveApiKey=false); both options have a one-line description so the user understands the post-reset login flow they're choosing
  4. Modal final-confirm requires the user to type literal `FACTORY RESET` (case-sensitive) into a text input before the destructive button enables — verified by typing variants and observing the button stays disabled
  5. On confirm, BarePage progress overlay takes over the screen (Phase 30 pattern reuse), showing "Reinstalling..." + animated progress + estimated 5-10 min countdown. The overlay polls the JSON event row every few seconds and updates state in place
  6. Post-reset: if `preserveApiKey=true` AND reinstall succeeded, redirect to /login (existing creds work). If `preserveApiKey=false` AND reinstall succeeded, redirect to /onboarding wizard. If reinstall failed, show error page with the JSON event row link + "Try again" button + "Manual SSH recovery instructions" link
  7. Pre-reset blocking checks in modal: button disabled (with tooltip explaining why) if update is in progress, OR pre-flight `curl -s -o /dev/null https://livinity.io` returns non-2xx, OR (when v30.0 Backup ships) a backup is in flight per BAK-SCHED-04 lock. v29.2 only checks update-in-progress; backup mutex is forward-compatible
**Plans**: 4 plans (Phase 37 plan list — duplicated here as a hand-off legend; canonical state lives in the Phase 37 entry above)
  - [x] 37-01-bash-scripts-PLAN.md — Author factory-reset.sh + livos-install-wrap.sh source files (FR-BACKEND-02, FR-BACKEND-04, FR-BACKEND-05) — completed 2026-04-29
  - [x] 37-02-trpc-route-PLAN.md — Wire system.factoryReset adminProcedure + httpOnlyPaths + Zod input + pre-flight checks + API key stash (FR-BACKEND-01, FR-BACKEND-03) — completed 2026-04-29
  - [x] 37-03-spawn-deploy-PLAN.md — Cgroup-escape spawn via systemd-run + first-call deployment of bash artifacts to /opt/livos/data/ (FR-BACKEND-01, FR-BACKEND-06) — completed 2026-04-29
  - [ ] 37-04-failure-handling-integration-PLAN.md — install.sh failure classification + JSON event schema tests + opt-in destructive integration test (FR-BACKEND-05, FR-BACKEND-07)
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 36. install.sh Audit & Hardening | 3/3 | Complete | 2026-04-29 |
| 37. Backend Factory Reset | 3/4 | Executing (Plan 04 next) | - |
| 38. UI Factory Reset | 0/? | Not started | - |

## Coverage Summary

**Total v29.2 requirements:** 19
**Mapped:** 19
**Orphaned:** 0
**Duplicated:** 0

| Category | Count | Phase(s) |
|----------|-------|----------|
| FR-AUDIT | 5 | 36 (×5) |
| FR-BACKEND | 7 | 37 (×7) |
| FR-UI | 7 | 38 (×7) |

**Note on v30.0:** v30.0 Backup & Restore was bootstrapped (8 phases / 47 BAK-* reqs) and paused 2026-04-28 in favor of v29.2. Full archived artifacts at `.planning/milestones/v30.0-DEFINED/` (REQUIREMENTS.md + ROADMAP.md + research/{STACK,FEATURES,ARCHITECTURE,PITFALLS,SUMMARY}.md). When resumed, phase numbers re-base to start after v29.2's last phase.

### Past Milestones

<details>
<summary>v29.0 Deploy & Update Stability (Phases 31-35) — SHIPPED 2026-04-27 — archived per-phase details</summary>

See `.planning/milestones/v29.0-ROADMAP.md` for full archive of Phases 31-35.

**Milestone Goal:** Make `update.sh` deploy pipeline self-healing and observable — fail-loud build guards (Phase 31), pre-flight + auto-rollback (Phase 32), Past Deploys UI + log viewer (Phase 33), mutation onError surface (Phase 34), CI smoke test (Phase 35). Production validated live on Mini PC (deploy `1d44d610` Apr 27).

- [x] **Phase 31: update.sh Build Pipeline Integrity** (3/3 plans) — completed 2026-04-26 (BUILD-01..03)
- [x] **Phase 32: Pre-Update Sanity & Auto-Rollback** (3/3 plans) — completed 2026-04-27 (REL-01/02; Mini PC live, 17/17 must-haves)
- [x] **Phase 33: Update Observability Surface** (3/3 plans) — completed 2026-04-27 (OBS-01..03 + UX-04; Mini PC live deploy validated, browser-confirmed UI)
- [x] **Phase 34: Update UX Hardening** (1/1 plans) — completed 2026-04-27 (UX-01..03; emergency fix reconciled + BACKLOG 999.6 regression test)
- [x] **Phase 35: GitHub Actions update.sh Smoke Test** (1/1 plans) — completed 2026-04-27 (BUILD-04; build-smoke v1, boot-smoke v2 deferred)

</details>

<details>
<summary>v19.0 Custom Domain Management (Phases 07-10.1) — SHIPPED 2026-03-27</summary>

- [x] Phase 07: Platform Domain CRUD + DNS Verification (2/2 plans) — completed 2026-03-26
- [x] Phase 08: Relay Integration + Custom Domain Routing (2/2 plans) — completed 2026-03-26
- [x] Phase 09: Tunnel Sync + LivOS Domain Receiver (3/3 plans) — completed 2026-03-26
- [x] Phase 10: LivOS Domains UI + Dashboard Polish (2/2 plans) — completed 2026-03-26
- [x] Phase 10.1: Settings My Domains (1/1 plan) — completed 2026-03-27

</details>

<details>
<summary>v20.0 Live Agent UI (Phases 11-18) — SHIPPED 2026-03-27</summary>

- [x] Phase 11: Agent SDK Backend Integration (1/1 plans) — completed 2026-03-27
- [x] Phase 12: MCP Tool Bridge (1/1 plans) — completed 2026-03-27
- [x] Phase 13: WebSocket Streaming Transport (2/2 plans) — completed 2026-03-27
- [x] Phase 14: Chat UI Foundation (2/2 plans) — completed 2026-03-27
- [x] Phase 15: Live Tool Call Visualization (3/3 plans) — completed 2026-03-27
- [x] Phase 16: Mid-Conversation Interaction (1/1 plans) — completed 2026-03-27
- [x] Phase 17: Session Management + History (2/2 plans) — completed 2026-03-27
- [x] Phase 18: Cost Control + Settings Cleanup (1/1 plans) — completed 2026-03-27

</details>

<details>
<summary>v21.0 Autonomous Agent Platform (Phases 19-28) — SHIPPED 2026-03-28</summary>

- [x] Phase 19: AI Chat Streaming Visibility (1/1 plans) — completed 2026-03-28
- [x] Phase 20: Conversation Persistence & History (1/1 plans) — completed 2026-03-28
- [x] Phase 21: Sidebar Agents Tab (2/2 plans) — completed 2026-03-28
- [x] Phase 22: Agent Interaction & Management (2/2 plans) — completed 2026-03-28
- [x] Phase 23: Slash Command Menu (2/2 plans) — completed 2026-03-28
- [x] Phase 24: Tool Conditional Registration (1/1 plans) — completed 2026-03-28
- [x] Phase 25: Autonomous Skill & Tool Creation (1/1 plans) — completed 2026-03-28
- [x] Phase 26: Autonomous Schedule & Tier Management (1/1 plans) — completed 2026-03-28
- [x] Phase 27: Self-Evaluation & Improvement Loop (1/1 plans) — completed 2026-03-28
- [x] Phase 28: System Prompt Optimization (1/1 plans) — completed 2026-03-28

</details>

<details>
<summary>v22.0 Livinity AGI Platform (Phases 29-36) — SHIPPED 2026-03-29</summary>

- [x] Phase 29: Unified Capability Registry (2/2 plans) — completed 2026-03-29
- [x] Phase 30: Agents Panel Redesign (1/1 plans) — completed 2026-03-29
- [x] Phase 31: Intent Router v2 (1/1 plans) — completed 2026-03-29
- [x] Phase 32: Auto-Provisioning Engine (1/1 plans) — completed 2026-03-29
- [x] Phase 33: Livinity Marketplace MCP (1/1 plans) — completed 2026-03-29
- [x] Phase 34: AI Self-Modification (1/1 plans) — completed 2026-03-29
- [x] Phase 35: Marketplace UI & Auto-Install (2/2 plans) — completed 2026-03-29
- [x] Phase 36: Learning Loop (3/3 plans) — completed 2026-03-29

</details>

<details>
<summary>v23.0 Mobile PWA (Phases 37-40) — SHIPPED 2026-04-01</summary>

- [x] Phase 37: PWA Foundation (2/2 plans) — completed 2026-04-01
- [x] Phase 38: Mobile Navigation Infrastructure (2/2 plans) — completed 2026-04-01
- [x] Phase 39: Mobile Home Screen + App Access (2/2 plans) — completed 2026-04-01
- [x] Phase 40: Polish + iOS Hardening (2/2 plans) — completed 2026-04-01

</details>

<details>
<summary>v24.0 Mobile Responsive UI (Phases 1-5) — SHIPPED 2026-04-01</summary>

- [x] Phase 1: AI Chat Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 2: Settings Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 3: Server Control Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 4: Files Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 5: Terminal Mobile (1/1 plans) — completed 2026-04-01

</details>

<details>
<summary>v25.0 Memory & WhatsApp Integration (Phases 6-10) — SHIPPED 2026-04-03</summary>

See `.planning/milestones/v25.0-phases/` for archived per-phase details.

</details>

<details>
<summary>v26.0 Device Security & User Isolation (Phases 11-16) — SHIPPED 2026-04-24</summary>

See `.planning/milestones/v26.0-phases/` for archived per-phase details.

</details>

<details>
<summary>v27.0 Docker Management Upgrade (Phases 17-23) — SHIPPED 2026-04-25</summary>

See `.planning/milestones/v27.0-ROADMAP.md` for archived details (33/33 requirements satisfied).

</details>

<details>
<summary>v28.0 Docker Management UI (Phases 24-30) — SHIPPED 2026-04-26</summary>

See `.planning/milestones/v28.0-ROADMAP.md` for archived details (20/20 requirements satisfied).

</details>
