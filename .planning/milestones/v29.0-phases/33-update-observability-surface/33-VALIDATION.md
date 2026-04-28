---
phase: 33
slug: update-observability-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 33 — Validation Strategy

> Per-phase validation contract. Sources: 33-RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend framework** | vitest (livinityd) — already used for `update.unit.test.ts`, `routes.unit.test.ts` |
| **Frontend framework** | vitest (UI) — already used for `update-notification.unit.test.ts` |
| **Backend config** | `livos/packages/livinityd/package.json` (vitest inline) |
| **Frontend config** | `livos/packages/ui/vitest.config.ts` (verify in plan-phase) |
| **Quick run command** | `npx vitest run source/modules/system/` (run from `livos/packages/livinityd/`) |
| **Full suite command** | `pnpm --filter livinityd test:unit -- --run && pnpm --filter ui test -- --run` |
| **Bash artifact lint** | `bash -n .planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh` |
| **Bash test (OBS-01)** | `bash .planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` |
| **End-to-end (manual)** | SSH apply phase33 patch on Mini PC + run `sudo bash /opt/livos/update.sh` + assert log + JSON + UI table renders |

---

## Sampling Rate

- **After every task commit:** Backend tests + `bash -n` on bash artifacts.
- **After every plan wave:** Full backend suite + UI suite + bash format test.
- **Before `/gsd-verify-work`:** Full suite must be green AND patch script syntax-check passes AND filesystem fixtures exist.
- **Max feedback latency:** 60 seconds (vitest single-file ≈ 5–10s; bash test ≈ 0.5s).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|
| 33-01-XX | 01 | 1 | OBS-02 | listUpdateHistory returns array sorted desc by timestamp | unit (vitest) | `npx vitest run source/modules/system/system.unit.test.ts -t listUpdateHistory` | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-02 | listUpdateHistory returns [] when dir doesn't exist (ENOENT) | unit (vitest) | same file, ENOENT mock | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-02 | listUpdateHistory skips corrupt JSON entries instead of crashing | unit (vitest) | same file, mocked fs.readFile returning 'invalid json{' | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-03 | readUpdateLog rejects '../etc/passwd' with BAD_REQUEST | unit (vitest) | same file | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-03 | readUpdateLog rejects '/etc/passwd' with BAD_REQUEST | unit (vitest) | same file | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-03 | readUpdateLog rejects 'evil/path.log' with BAD_REQUEST | unit (vitest) | same file | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-03 | readUpdateLog rejects '..hidden.log' with BAD_REQUEST | unit (vitest) | same file | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-03 | readUpdateLog returns last 500 lines + truncated:true on > 500 line file | unit (vitest) | same file, mocked 1000-line content | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-03 | readUpdateLog with full:true returns entire content + truncated:false | unit (vitest) | same file | ❌ W0 |
| 33-01-XX | 01 | 1 | OBS-02/03 | Both routes registered in `httpOnlyPaths` (else WS hangs in post-deploy diagnose flow) | unit (grep) | `grep -F "system.listUpdateHistory" livos/packages/livinityd/source/modules/server/trpc/common.ts && grep -F "system.readUpdateLog" .../common.ts` | ❌ W0 (extend) |
| 33-02-XX | 02 | 1 | OBS-01 | log file `update-<ts>-<7sha>.log` lands; last line matches `[PHASE33-SUMMARY]` regex | unit (bash) | `bash artifacts/tests/log-format.sh` (exit-0 case) | ❌ W0 |
| 33-02-XX | 02 | 1 | OBS-01 | `<ts>-success.json` written on exit 0 with status, from_sha, to_sha, duration_ms, log_path | unit (bash) | same script, exit-0 case | ❌ W0 |
| 33-02-XX | 02 | 1 | OBS-01 | `<ts>-failed.json` written on exit non-zero with status:"failed" + reason | unit (bash) | same script, exit-1 case | ❌ W0 |
| 33-02-XX | 02 | 1 | OBS-01 | Phase 32 precheck-fail does NOT cause Phase 33 trap to ALSO write a duplicate failed row | unit (bash) | same script, simulated precheck-fail case | ❌ W0 |
| 33-02-XX | 02 | 2 | OBS-01 | Patch script `bash -n` clean + idempotent (re-run produces ALL `ALREADY-PATCHED`, ZERO `PATCH-OK`) | integration (SSH) | `ssh bruce@10.69.31.68 'sudo bash -s' < phase33-update-sh-logging-patch.sh` (run twice) | ❌ W0 (in plan-02 SSH-apply task) |
| 33-03-XX | 03 | 3 | OBS-02 | UI table renders 50 rows from a mocked listUpdateHistory query | unit (vitest+RTL) | `npx vitest run packages/ui/.../past-deploys-table.unit.test.tsx` | ❌ W0 |
| 33-03-XX | 03 | 3 | OBS-03 | Dialog opens, calls readUpdateLog, renders <pre> with content; Download button calls full-fetch + triggers Blob | unit (vitest+RTL) | new `update-log-viewer-dialog.unit.test.tsx` | ❌ W0 |
| 33-03-XX | 03 | 3 | UX-04 | Sidebar shows brand-color dot when state=update-available AND activeSection !== software-update | unit (vitest+RTL) | extends `settings-content.unit.test.tsx` | ❌ W0 (extend or create) |
| 33-03-XX | 03 | 3 | UX-04 | Badge disappears when state becomes at-latest | unit (vitest+RTL) | same file | ❌ W0 |
| 33-03-XX | 03 | 3 | UX-04 | Badge disappears when activeSection === software-update | unit (vitest+RTL) | same file | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` — bash test exercising the OBS-01 trap output across success/failed/precheck-fail-skip cases
- [ ] Extend `livos/packages/livinityd/source/modules/system/system.unit.test.ts` (or `routes.unit.test.ts` if that's the naming) with the OBS-02 + OBS-03 backend cases (5+ tests)
- [ ] `livos/packages/ui/src/routes/settings/_components/past-deploys-table.unit.test.tsx` — table render + click → modal open assertions
- [ ] `livos/packages/ui/src/components/update-log-viewer-dialog.unit.test.tsx` — dialog open + tail-load + download click
- [ ] `livos/packages/ui/src/routes/settings/_components/menu-item-badge.unit.test.tsx` (or extend settings-content.unit.test.tsx) — badge presence/absence per state
- [ ] `httpOnlyPaths` array in `livos/packages/livinityd/source/modules/server/trpc/common.ts` extended with both new route paths

*Vitest already installed in both packages — no install step needed. shadcn Dialog/Table/Badge already used elsewhere in the repo (verified via research).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real deploy on Mini PC produces correct log file + JSON row + UI table updates | OBS-01/02 end-to-end | Requires actually running `sudo bash /opt/livos/update.sh` on the host post-patch | After SSH-applying phase33 patch on Mini PC: run `sudo bash /opt/livos/update.sh`. Assert `/opt/livos/data/update-history/update-*.log` exists with `[PHASE33-SUMMARY]` line; assert `/opt/livos/data/update-history/*-success.json` exists with right schema; open browser → Settings > Software Update → Past Deploys table shows the new row. |
| Log viewer modal renders correctly + download button works | OBS-03 visual | Requires browser interaction (dialog open, scroll, click download) | Click any Past Deploys row → modal opens → text is monospace + scrollable → click "Download full log" → browser downloads `<filename>.log` |
| Sidebar badge appears + disappears correctly in both themes | UX-04 visual | Requires browser theme toggle | When an update is staged: assert badge dot visible on Settings sidebar > Software Update row in light theme. Toggle to dark theme: assert dot still visible (different shade). Click row → assert dot disappears immediately. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (1 bash test + ~9 vitest tests)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 lands)

**Approval:** pending
