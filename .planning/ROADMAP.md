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
- 🚧 **v29.0 Deploy & Update Stability** — Phases 31-35 (in progress)

## Phases

### v29.0 Deploy & Update Stability — ACTIVE

- [ ] **Phase 31: update.sh Build Pipeline Integrity** — Fail-loud build guards + idempotent pnpm-store dist-copy + silent-fail root-cause kill (BUILD-01, BUILD-02, BUILD-03)
- [x] **Phase 32: Pre-Update Sanity & Auto-Rollback** — Disk/write/GitHub pre-flight checks + livinityd 3× crash → previous SHA rollback via systemd OnFailure (REL-01, REL-02) — completed 2026-04-27 (Mini PC verified live, 17/17 must-haves; Server4 deferred → BACKLOG 999.7)
- [ ] **Phase 33: Update Observability Surface** — Structured `update-history/*.log` + Past Deploys list + log viewer modal + sidebar Software Update badge (OBS-01, OBS-02, OBS-03, UX-04)
- [ ] **Phase 34: Update UX Hardening** — `system.update` onError toasts + pending-state guards + httpOnlyPaths for long-running mutations (UX-01, UX-02, UX-03)
- [ ] **Phase 35: GitHub Actions update.sh Smoke Test** — PR-time Docker container boot health check, blocks merge on failure (BUILD-04)

### Past Milestones

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

- [x] Phase 6: WhatsApp Channel Foundation (2/2 plans) — completed 2026-04-03
- [x] Phase 7: WhatsApp QR Code & Settings UI (2/2 plans) — completed 2026-04-03
- [x] Phase 8: WhatsApp Message Routing & Safety (2/2 plans) — completed 2026-04-03
- [x] Phase 9: Cross-Session Conversation Persistence & Search (2/2 plans) — completed 2026-04-03
- [x] Phase 10: Unified Identity & Memory Management UI (2/2 plans) — completed 2026-04-03

</details>

<details>
<summary>v26.0 Device Security & User Isolation (Phases 11-16) — SHIPPED 2026-04-24</summary>

- [x] Phase 11: Device Ownership Foundation (2/2 plans) — completed 2026-04-24
- [x] Phase 12: Device Access Authorization (2/2 plans) — completed 2026-04-24
- [x] Phase 13: Shell Tool Isolation (1/1 plans) — completed 2026-04-24
- [x] Phase 14: Device Session Binding (2/2 plans) — completed 2026-04-24
- [x] Phase 15: Device Audit Log (2/2 plans) — completed 2026-04-24
- [x] Phase 16: Admin Override & Emergency Disconnect (2/2 plans) — completed 2026-04-24

</details>

<details>
<summary>v28.0 Docker Management UI (Dockhand-Style) (Phases 24-30) — SHIPPED 2026-04-26 — archived per-phase details</summary>

See `.planning/milestones/v28.0-ROADMAP.md` for full archive of Phases 24-29.
Phase 30 (Auto-Update Notification, GitHub-aware) added post-archive: see `.planning/milestones/v28.0-PHASE30-ADDENDUM-AUDIT.md` for the standalone audit (passed; 4/4 reqs UPD-01..04; 4 UAT bugs fixed across 3 hot-patch rounds).

**Milestone Goal:** Restructure v27.0's tab-based Server Management page into a standalone Dockhand-style Docker management application (Phases 24-29) plus replace broken Umbrel OTA infra with GitHub-aware auto-update notification (Phase 30).

- [x] **Phase 24: Docker App Skeleton** — `/docker` route, sidebar layout, top status bar (DOC-01..03) — completed 2026-04-25
- [x] **Phase 25: Multi-Environment Dashboard** — env card grid, Top-CPU panel, tag filter chips (DOC-04..06) — completed 2026-04-25
- [x] **Phase 26: Resource Routes** — Containers/Images/Volumes/Networks dedicated routes (DOC-07..10, DOC-20 partial) — completed 2026-04-25
- [x] **Phase 27: Stacks + Schedules Routes** — preserves Graph/AI/Git tabs (DOC-11, DOC-12) — completed 2026-04-25
- [x] **Phase 28: Cross-Container Logs + Activity Timeline** — multiplex log aggregator, global event timeline (DOC-13, DOC-14) — completed 2026-04-25
- [x] **Phase 29: Shell + Registry + Palette + Settings** — exec, AES-256-GCM credential vault, cmd+k (DOC-15..20) — completed 2026-04-25
- [x] **Phase 30: Auto-Update Notification (GitHub-Aware)** — GitHub commits API + bash subprocess + UpdateNotification card + 5 shape-consumer fixes (UPD-01..04) — completed 2026-04-26

</details>

<details>
<summary>v27.0 Docker Management Upgrade (Phases 17-23) — archived per-phase details</summary>

See `.planning/milestones/v27.0-ROADMAP.md` for full archive.

**Milestone Goal:** Elevate Livinity's Docker management to best-in-class self-hosted Docker platform with Dockhand-inspired features (file browser, GitOps stacks, vulnerability scanning, compose graph viewer, multi-host) plus AI-powered diagnostics as Livinity's unique moat.

- [x] **Phase 17: Docker Quick Wins** — completed 2026-04-24
- [x] **Phase 18: Container File Browser** — completed 2026-04-24
- [x] **Phase 19: Compose Graph Viewer + Vulnerability Scanning** — completed 2026-04-24
- [x] **Phase 20: Scheduled Tasks + Container Backup** — completed 2026-04-24
- [x] **Phase 21: GitOps Stack Deployment** — completed 2026-04-25
- [x] **Phase 22: Multi-host Docker Management** — completed 2026-04-25
- [x] **Phase 23: AI-Powered Docker Diagnostics** — completed 2026-04-25

</details>

## Phase Details

### Phase 31: update.sh Build Pipeline Integrity
**Goal**: Kill the recurring "[OK] @livos/config built" silent-success lie — every package's build output is verified non-empty before update.sh proceeds; pnpm-store dist-copy is idempotent across all `@nexus+core*` resolution dirs; root cause behind the original silent fail is identified and removed.
**Depends on**: Nothing (foundation phase of v29.0; unblocks the recurring Phase 30 deploy blocker)
**Requirements**: BUILD-01, BUILD-02, BUILD-03
**Success Criteria** (what must be TRUE):
  1. On a host where one of the build steps (e.g., `pnpm --filter @livos/config build` or nexus core `tsc`) silently produces an empty `dist/`, `update.sh` exits non-zero with a clear "BUILD-FAIL: <package> has empty dist/" line — never logs "[OK] built" while leaving livinityd in a restart loop.
  2. On a host with multiple `@nexus+core*` directories under `node_modules/.pnpm/` (sharp-version drift case), `update.sh` copies the freshly-built nexus core dist into ALL matching dirs and verifies post-copy each target's `dist/index.js` is non-empty; previously, only the first match got the new dist and livinityd kept importing stale code.
  3. After running the patched `update.sh` on Mini PC and Server4 with NO source changes (no-op deploy), exit code is 0, livinityd boots within 30s, and `journalctl -u livos -n 50` shows zero "Cannot find module" / "is not a function" symptoms.
  4. The original root cause (cwd drift / pnpm lock mismatch / env var loss — to be identified during the phase) is patched at its source: re-running update.sh 3× in a row from a fresh repo clone produces 3× successful deploys, no BUILD-01 guard trips required to "save" the run.
**Plans**: 3 plans
- [x] 31-01-PLAN.md — Root-cause investigation → 31-ROOT-CAUSE.md (BUILD-03) ✓ 2026-04-26
- [x] 31-02-PLAN.md — Author idempotent patch script (BUILD-01 verify_build + BUILD-02 multi-dir dist-copy loop + BUILD-03 cleanup) ✓ 2026-04-26
- [ ] 31-03-PLAN.md — SSH-apply patch to Mini PC + Server4, verify livinityd boots clean (HUMAN-VERIFY)
**Patch artifact**: `.planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh` (applied via SSH to both Mini PC and Server4 — Phase 30 precedent)

### Phase 32: Pre-Update Sanity & Auto-Rollback
**Goal**: Make a failed deploy self-heal — `update.sh` refuses to start if the host can't possibly succeed (disk, perms, GitHub reachability), and if livinityd 3× crashes after a successful deploy, the system automatically reverts to the previous known-good SHA without user intervention.
**Depends on**: Phase 31 (reuses the `/opt/livos/.deployed-sha` file pattern + fail-loud exit conventions; rollback assumes update.sh already records SHAs reliably)
**Requirements**: REL-01, REL-02
**Success Criteria** (what must be TRUE):
  1. Running `update.sh` on a host with < 2 GB free disk OR a non-writable `/opt/livos` OR an unreachable `api.github.com` exits non-zero immediately (before any `git clone` / `rsync`) with a single-line actionable error ("PRECHECK-FAIL: disk free 1.4GB < 2GB required"); the `system.update` mutation surfaces this exact message to UX-01's toast in Phase 34.
  2. After update.sh successfully completes but livinityd then crashes 3 times within 5 minutes (systemd `Restart=` cycle), the system automatically rewrites `/opt/livos/.deployed-sha` to the previous SHA, restarts livos.service, and the next boot uses the prior code — verifiable by intentionally pushing a commit that breaks livinityd boot and observing recovery within ~2 minutes.
  3. After an auto-rollback fires, the next successful livinityd boot writes a marker into `/opt/livos/data/update-history/` consumed by Phase 33's Past Deploys UI as `status:rolled-back`; the user sees the rollback event in the browser without needing SSH.
  4. Sanity-check + rollback logic is implemented as a systemd unit-level concern (`OnFailure=` watchdog or sibling oneshot service) — NOT a livinityd in-process concern — so it works even when livinityd itself can't start.
**Plans**: 3 plans
- [x] 32-01-PLAN.md — REL-01 precheck implementation: precheck-block.sh + 3 bash unit tests + vitest test G round-trip
- [x] 32-02-PLAN.md — REL-02 rollback machinery: livos-rollback.sh + livos-rollback.service + auto-rollback.conf + 2 bash unit tests
- [x] 32-03-PLAN.md — Compose phase32-systemd-rollback-patch.sh + SSH-apply on Mini PC verified (Server4 deferred per user → BACKLOG 999.7) + canary-commit doc
**Patch artifact**: `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh` (applies systemd unit drop-in + watchdog script via SSH to both hosts)

### Phase 33: Update Observability Surface
**Goal**: A user diagnoses any update outcome (success / fail / rolled-back) entirely from Settings > Software Update without ever opening SSH — structured per-deploy logs feed a Past Deploys table with click-through full-log viewer; sidebar Software Update row shows a badge when an update is available.
**Depends on**: Phase 31 (logs are emitted by the patched update.sh) — UX-04 sidebar badge has no infra dependency but rides along here because both touch Settings > Software Update
**Requirements**: OBS-01, OBS-02, OBS-03, UX-04
**Success Criteria** (what must be TRUE):
  1. Every `update.sh` invocation writes a single structured log file at `/opt/livos/data/update-history/update-<ISO-timestamp>-<7char-sha>.log` containing per-step lines (precheck / clone / rsync / pnpm-install / build / dist-copy / restart), the final exit code, and total duration in seconds — verifiable by `ls -la /opt/livos/data/update-history/` after a deploy.
  2. Settings > Software Update displays a "Past Deploys" table populated from the last 50 log files, columns SHA + ISO timestamp + status (success/failed/rolled-back) + duration, sorted newest-first; users see this update history without any SSH or tail command.
  3. Clicking a Past Deploys row opens a log viewer modal showing the last 500 lines of that deploy's log with monospace formatting + a "Download full log" button that streams the entire file as `.log` — user can copy/paste into a GitHub issue.
  4. When an update is available (existing GitHub-commits check from Phase 30), the Settings sidebar's "Software Update" row displays a small numeric badge (e.g., "1") next to the label that disappears once the user opens the page or installs the update — verifiable in both light and dark themes.
  5. New `system.listUpdateHistory` and `system.readUpdateLog` tRPC routes ship with adminProcedure RBAC + filename validation (no `..` traversal); they read directly from `/opt/livos/data/update-history/` with no DB writes.
**Plans**: 3 plans
- [x] 33-01-PLAN.md — Backend tRPC routes (system.listUpdateHistory + system.readUpdateLog) + httpOnlyPaths wiring + 3-layer filename guard + 12+ unit tests (OBS-02, OBS-03)
- [x] 33-02-PLAN.md — phase33-update-sh-logging-patch.sh artifact + bash test (4 scenarios) + Mini PC SSH-apply verified (OBS-01)
- [x] 33-03-PLAN.md — Frontend (PastDeploysTable + UpdateLogViewerDialog + MenuItemBadge) + RTL/smoke tests (OBS-02, OBS-03, UX-04)
**Patch artifact**: `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh` (SSH-applied to Mini PC; mirrors Phase 31/32 patch-script architecture)
**UI hint**: yes

### Phase 34: Update UX Hardening
**Goal**: "Install Update tıklandı, hiçbir şey olmadı" silent-fail (BACKLOG 999.6) is impossible — every `system.update` failure surfaces as an actionable toast, the button is disabled while pending, and WS hang-ups during long-running mutations fall back to HTTP transport instead of silently dropping.
**Depends on**: Phase 32 (consumes REL-02's actionable precheck error messages); benefits from Phase 33 (toast can link to the new Past Deploys log row)
**Requirements**: UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. Triggering `system.update` while disk is full / GitHub unreachable / WS disconnected produces a toast within 5 seconds containing the actual error text (e.g., "Disk full — 1.4GB free, 2GB required" or "GitHub unreachable") in EVERY caller of the mutation — verifiable by killing network or filling disk and clicking Install Update from both the Settings page and the UpdateNotification card.
  2. After clicking Install Update, the button is `disabled` (visually grayed + non-clickable) for the entire `mutation.isPending` window; the UpdatingCover modal cannot be dismissed by Escape, backdrop click, or back-button while the update is running — verifiable by attempting all 3 dismissal vectors during a deploy.
  3. `system.update` and `system.checkUpdate` are listed in `livos/packages/ui/src/lib/trpc/common.ts` `httpOnlyPaths`; killing the WebSocket mid-mutation does NOT cause the mutation to silently hang — it completes via HTTP and surfaces success or onError as expected (verifiable via Chrome DevTools Network panel).
  4. Every `useMutation({ mutationKey: ['system.update'] })` (and equivalent for checkUpdate) call in the UI tree has a defined `onError` handler that emits a user-visible toast — verified by `grep -rn "system\.update" livos/packages/ui/src` returning zero callers without an onError binding.
**Plans**: TBD
**UI hint**: yes

### Phase 35: GitHub Actions update.sh Smoke Test
**Goal**: A PR can no longer merge an `update.sh` regression — every PR runs the full `update.sh` inside a fresh Docker container and verifies livinityd actually boots and serves `/health`; failed PRs are blocked at the GitHub merge gate.
**Depends on**: Phase 31 (the patched update.sh is what gets exercised in CI; without Phase 31's fail-loud guards the smoke test could itself silently pass)
**Requirements**: BUILD-04
**Success Criteria** (what must be TRUE):
  1. A new workflow at `.github/workflows/update-sh-smoke.yml` triggers on every PR that touches `update.sh`, the patch artifacts under `.planning/phases/3*/artifacts/`, or any source path that affects livinityd / nexus build outputs.
  2. The workflow boots a fresh Ubuntu 24.04 Docker container with Node 22 + pnpm + system PostgreSQL + Redis, runs the full `update.sh` against the PR's HEAD SHA, then issues `curl -fsS http://localhost:8080/health` and verifies the livinityd process is alive 30 seconds after start — the workflow is the source of truth for "does this PR deploy cleanly?"
  3. A PR that intentionally introduces a build break (e.g., a TypeScript error in nexus/packages/core) FAILS the smoke test workflow and is blocked from merge by the required-status-check gate; a clean PR PASSES within ~10 minutes wall-clock.
  4. Workflow runtime stays under 15 minutes wall-clock to remain practical for PR review cadence; cache strategy (pnpm store / npm cache / Docker layer cache) is in place to keep median runs ~5-8 minutes.
**Plans**: TBD

## Progress

**Execution Order:**
v29.0 phases execute in numeric order: 31 -> 32 -> 33 -> 34 -> 35
- Phase 31 is the foundation (every other phase depends on update.sh emitting reliable signals)
- Phase 32 layers the rollback safety net on top
- Phase 33 (observability) and Phase 35 (CI smoke test) can parallelize after Phase 31 (Phase 33 needs the new log format; Phase 35 needs the patched update.sh)
- Phase 34 (UX hardening) consumes Phase 32's actionable error messages — runs after both 31 and 32

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 31. update.sh Build Pipeline Integrity | v29.0 | 1/3 | In progress | — |
| 32. Pre-Update Sanity & Auto-Rollback | v29.0 | 3/3 | Complete    | 2026-04-27 |
| 33. Update Observability Surface | v29.0 | 0/3 | Planned     | — |
| 34. Update UX Hardening | v29.0 | 0/0 | Not started | — |
| 35. GitHub Actions update.sh Smoke Test | v29.0 | 0/0 | Not started | — |

---

## Previous Milestones

- v28.0 Docker Management UI (Dockhand-Style) (Phases 24-30, Shipped 2026-04-26)
- v27.0 Docker Management Upgrade (Phases 17-23, Shipped 2026-04-25)
- v26.0 Device Security & User Isolation (Phases 11-16, Shipped 2026-04-24)
- v25.0 Memory & WhatsApp Integration (Phases 6-10, Shipped 2026-04-03)
- v24.0 Mobile Responsive UI (Phases 1-5, Shipped 2026-04-01)
- v23.0 Mobile PWA (Phases 37-40, Shipped 2026-04-01)
- v22.0 Livinity AGI Platform (Phases 29-36, Shipped 2026-03-29)
- v21.0 Autonomous Agent Platform (Phases 19-28, Shipped 2026-03-28)
- v20.0 Live Agent UI (Phases 11-18, Shipped 2026-03-27)
- v19.0 Custom Domain Management (Phases 07-10.1, Shipped 2026-03-27)
- v18.0 Remote Desktop Streaming (Phases 04-06, Shipped 2026-03-26)
- v17.0 Precision Computer Use (Shipped 2026-03-25)
- v16.0 Multi-Provider AI (Shipped 2026-03-25)
- v15.0 AI Computer Use (Shipped 2026-03-24)
- v14.1 Agent Installer & Setup UX (Shipped 2026-03-24)
- v14.0 Remote PC Control Agent (Shipped 2026-03-24)
- v11.0 Nexus Agent Fixes (Shipped 2026-03-22)
- v10.0 App Store Platform (Shipped 2026-03-21)
- Earlier milestones: see MILESTONES.md
