---
phase: 30
slug: auto-update
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Mapped from RESEARCH.md Validation Architecture section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend framework** | vitest 2.x (livinityd) — `npm run test` |
| **Frontend framework** | vitest 2.1.9 (ui) — `pnpm exec vitest run` |
| **Backend config** | `livos/packages/livinityd/vitest.config.ts` |
| **Frontend config** | none — auto-discovers `*.unit.test.ts` |
| **Quick run (backend)** | `cd livos/packages/livinityd && npm run test -- system/update` |
| **Quick run (frontend)** | `cd livos/packages/ui && pnpm exec vitest run src/components/update-notification` |
| **Full suite** | `cd livos && pnpm -r test` |
| **Estimated runtime** | ~30s quick / ~2m full |

---

## Sampling Rate

- **After every task commit:** Run the touched unit test file (`vitest run <path>`)
- **After every plan wave:** Full per-package suite (livinityd `npm run test`, ui `pnpm exec vitest run`)
- **Before `/gsd-verify-work`:** Full suite green + manual SSH/browser smoke checks
- **Max feedback latency:** 30 seconds for unit tests

---

## Validation-Map → PLAN.md Task Mapping

VALIDATION.md uses letter-suffix IDs (30-01-A..I, 30-02-A..F) for sampling-rate granularity. PLAN.md uses Task 1..N. Mapping:

| VALIDATION row | PLAN file | PLAN task | Notes |
|----------------|-----------|-----------|-------|
| 30-01-W0, A, B, C, D, E, F | 30-01-PLAN.md | Task 1 (create stubs), Task 2 (rewrite update.ts to make stubs green) | All run `update.unit.test.ts` |
| 30-01-G | 30-01-PLAN.md | Task 3 (CONFLICT guard in routes.ts) | Extends `system.integration.test.ts` |
| 30-01-H | 30-01-PLAN.md | Task 5 (SSH `update.sh` patch — manual checkpoint) | Manual SSH validation |
| 30-01-I | 30-01-PLAN.md | Task 4 (`httpOnlyPaths` add) | Grep assertion |
| 30-02-W0, A, B, C, D | 30-02-PLAN.md | Task 1 (create stubs), Task 2 (UpdateNotification component) | All run `update-notification.unit.test.ts` |
| 30-02-E | 30-02-PLAN.md | Task 3 (`useSoftwareUpdate` patch) | Optional shape regression |
| 30-02-F | 30-02-PLAN.md | Task 7 (browser E2E — manual checkpoint) | chrome-devtools MCP |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-W0 | 01 | 0 | UPD-01,02 | — | N/A | unit (stubs) | `cd livos/packages/livinityd && npm run test -- system/update` | ❌ create `system/update.unit.test.ts` | ⬜ pending |
| 30-01-A | 01 | 1 | UPD-01 | — | reject non-2xx GitHub responses | unit (mocked fetch) | `cd livos/packages/livinityd && npm run test -- system/update` | ❌ W0 | ⬜ pending |
| 30-01-B | 01 | 1 | UPD-01 | — | handle ENOENT for `.deployed-sha` (first run) | unit (mocked fs throws) | (same) | ❌ W0 | ⬜ pending |
| 30-01-C | 01 | 1 | UPD-01 | — | `available: true` only when SHAs differ | unit (mocked fs+fetch) | (same) | ❌ W0 | ⬜ pending |
| 30-01-D | 01 | 1 | UPD-02 | — | `performUpdate` spawns `bash /opt/livos/update.sh` via execa | unit (mocked execa) | (same) | ❌ W0 | ⬜ pending |
| 30-01-E | 01 | 1 | UPD-02 | — | parse `━━━ Section ━━━` markers → progress | unit (mock stdout stream) | (same) | ❌ W0 | ⬜ pending |
| 30-01-F | 01 | 1 | UPD-02 | — | non-zero exit returns false + sets error | unit (mocked rejects) | (same) | ❌ W0 | ⬜ pending |
| 30-01-G | 01 | 1 | UPD-02 | — | `system.update` throws CONFLICT when status=updating | integration (TRPC caller) | `cd livos/packages/livinityd && npm run test:integration -- system` | ⚠ extend `system.integration.test.ts` | ⬜ pending |
| 30-01-H | 01 | 1 | UPD-03 | — | `update.sh` writes `/opt/livos/.deployed-sha` after build | manual SSH | `ssh root@minipc "bash /opt/livos/update.sh && cat /opt/livos/.deployed-sha"` | manual-only | ⬜ pending |
| 30-01-I | 01 | 1 | UPD-01,02 | — | `httpOnlyPaths` includes `system.update` + `system.updateStatus` | unit (assertion) | `grep -E "system\.(update\|updateStatus)" livos/packages/livinityd/source/modules/server/trpc/common.ts` | n/a | ⬜ pending |
| 30-02-W0 | 02 | 0 | UPD-04 | — | N/A | unit (stubs) | `cd livos/packages/ui && pnpm exec vitest run src/components/update-notification` | ❌ create `update-notification.unit.test.ts` | ⬜ pending |
| 30-02-A | 02 | 2 | UPD-04 | — | renders when `state === 'update-available'` & SHA not dismissed | unit (RTL+jsdom) | (same) | ❌ W0 | ⬜ pending |
| 30-02-B | 02 | 2 | UPD-04 | — | "Later" writes SHA to `livos:update-notification:dismissed-sha` | unit | (same) | ❌ W0 | ⬜ pending |
| 30-02-C | 02 | 2 | UPD-04 | — | re-shows when `latestVersion.sha` changes after dismissal | unit (rerender) | (same) | ❌ W0 | ⬜ pending |
| 30-02-D | 02 | 2 | UPD-04 | — | mobile (`useIsMobile() === true`) hides card | unit (mock hook) | (same) | ❌ W0 | ⬜ pending |
| 30-02-E | 02 | 2 | UPD-04 | — | `useSoftwareUpdate` returns `latestVersion.sha` (shape regression) | unit | `cd livos/packages/ui && pnpm exec vitest run src/hooks/use-software-update` | optional ❌ W0 | ⬜ pending |
| 30-02-F | 02 | 2 | UPD-04 | — | E2E: GitHub mock → notification → click "Update" → confirm dialog opens | manual browser | chrome-devtools MCP smoke | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `livos/packages/livinityd/source/modules/system/update.unit.test.ts` — stubs for UPD-01, UPD-02; `vi.mock('node:fs/promises')`, `vi.mock('execa')`, `globalThis.fetch = vi.fn()`.
- [ ] `livos/packages/ui/src/components/update-notification.unit.test.ts` — render + dismiss + re-show + mobile-hide cases for UPD-04.
- [ ] (Optional) `livos/packages/ui/src/hooks/use-software-update.unit.test.ts` — shape regression for `latestVersion.sha`. Skip if TS catches it.
- [ ] Extend `livos/packages/livinityd/source/modules/system/system.integration.test.ts` — add `system.update` CONFLICT + happy-path cases.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `update.sh` writes `.deployed-sha` after a real build | UPD-03 | Bash subprocess + git clone + filesystem on remote host — cannot unit-test from Windows dev box | `ssh -i .../contabo_master root@45.137.194.103 "bash /opt/livos/update.sh && cat /opt/livos/.deployed-sha"` then verify SHA matches `git -C /opt/livos rev-parse HEAD` |
| Full E2E browser flow | UPD-04 | GitHub API + React render + framer-motion animation + dialog open + dev-tools verification | Mock GitHub commits API to return a NEW SHA → load desktop → assert UpdateNotification appears bottom-right → click Update → assert `/settings/software-update/confirm` opens. Use chrome-devtools MCP. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
