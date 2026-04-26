---
phase: 32
slug: pre-update-sanity-auto-rollback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Sources: 32-RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (livinityd) — already used for `update.unit.test.ts` and `routes.unit.test.ts` |
| **Config file** | `livos/packages/livinityd/package.json` (vitest config inline) + bash tests under `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/` |
| **Quick run command** | `pnpm --filter livinityd test:unit -- --run system/` |
| **Full suite command** | `pnpm --filter livinityd test:unit -- --run && bash .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/run-all.sh` |
| **Estimated runtime** | ~30 seconds (vitest ~10s + 5 bash unit tests ~20s combined) |
| **Bash script lint** | `bash -n` on every artifact `.sh` |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter livinityd test:unit -- --run system/` plus `bash -n` on any modified `.sh` artifact.
- **After every plan wave:** Run full suite (vitest + bash tests).
- **Before `/gsd-verify-work`:** Full suite must be green AND patch script syntax-check (`bash -n phase32-systemd-rollback-patch.sh`) must pass.
- **Max feedback latency:** 60 seconds (vitest single-file watch ≈ 5s; bash test ≈ 0.5s each).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-XX | 01 | 1 | REL-01 | — | precheck blocks update.sh on insufficient disk | unit (bash) | `bash artifacts/tests/precheck-disk.sh` | ❌ W0 | ⬜ pending |
| 32-01-XX | 01 | 1 | REL-01 | — | precheck blocks on read-only /opt/livos | unit (bash) | `bash artifacts/tests/precheck-write.sh` | ❌ W0 | ⬜ pending |
| 32-01-XX | 01 | 1 | REL-01 | — | precheck blocks on GitHub unreachable | unit (bash) | `bash artifacts/tests/precheck-net.sh` | ❌ W0 | ⬜ pending |
| 32-01-XX | 01 | 1 | REL-01 | — | PRECHECK-FAIL string round-trips through `system.update` mutation `error` field | unit (vitest) | extend `update.unit.test.ts`: mock execa rejection with `PRECHECK-FAIL: ...` stderr, assert `getUpdateStatus().error` carries it verbatim | ❌ W0 (extend existing file) | ⬜ pending |
| 32-02-XX | 02 | 1 | REL-02 | — | rollback aborts cleanly when `.deployed-sha.previous` missing | unit (bash) | `bash artifacts/tests/rollback-no-prev-sha.sh` | ❌ W0 | ⬜ pending |
| 32-02-XX | 02 | 1 | REL-02 | — | rollback aborts cleanly when `.rollback-attempted` lock exists | unit (bash) | `bash artifacts/tests/rollback-loop-guard.sh` | ❌ W0 | ⬜ pending |
| 32-03-XX | 03 | 2 | REL-02 | — | systemd drop-in installs cleanly + `systemctl show` confirms RestartMode/OnFailure/StartLimit values | integration (SSH) | `ssh bruce@10.69.31.68 'systemctl show livos.service \| grep -E "^(RestartMode\|OnFailure\|StartLimitBurst\|StartLimitIntervalUSec)="'` post-apply | ❌ W0 (in plan-03 patch-apply task) | ⬜ pending |
| 32-03-XX | 03 | 2 | REL-02 | — | end-to-end: synthetic trigger via `systemctl start livos-rollback.service` against known-good prev SHA produces `<ts>-rollback.json` and reverts `.deployed-sha` | integration (SSH) | scripted in plan-03 SSH-apply task: set `.deployed-sha.previous` to current HEAD~3, `systemctl start livos-rollback.service`, assert exit + JSON + `.deployed-sha` flip | ❌ W0 (synthetic trigger documented in plan-03) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `artifacts/tests/precheck-disk.sh` — bash test, PATH-injected `df` stub, asserts `PRECHECK-FAIL: insufficient disk space` on stderr + exit 1
- [ ] `artifacts/tests/precheck-write.sh` — bash test, tmp dir chmod 555, asserts `PRECHECK-FAIL: not writable`
- [ ] `artifacts/tests/precheck-net.sh` — bash test, PATH-injected `curl` stub returning exit 7, asserts `PRECHECK-FAIL: GitHub unreachable`
- [ ] `artifacts/tests/rollback-no-prev-sha.sh` — bash test, `.deployed-sha.previous` absent, asserts exit 1 + `[ROLLBACK-ABORT] first deploy ever` log
- [ ] `artifacts/tests/rollback-loop-guard.sh` — bash test, `.rollback-attempted` present, asserts exit 1 + `[ROLLBACK-ABORT] $LOCK exists`
- [ ] `artifacts/tests/run-all.sh` — invokes the 5 above with shared cleanup
- [ ] Extend `livos/packages/livinityd/source/modules/system/update.unit.test.ts` with PRECHECK round-trip test (no new file — additive within existing suite)
- [ ] `artifacts/test-canary-commit.md` — manual canary procedure documentation (not CI-executable; opt-in only)

*Vitest framework already installed for livinityd — no install step needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real 3-crash → rollback fires within 2 min on Mini PC | REL-02 success criterion #2 | Requires actually crashing livinityd; synthetic trigger covers ~95% of the chain but doesn't exercise the systemd `OnFailure=` trigger itself | Push canary commit (`process.exit(1)` at top of livinityd `index.ts`) to `phase32-rollback-canary` branch. Set `/opt/livos/.deployed-sha.previous` to current good SHA. Run `update.sh` with `REPO_URL` overridden to canary branch. Watch `journalctl -fu livos.service livos-rollback.service`. Assert: 3 crashes within 5 min → rollback fires → `.deployed-sha` reverts → services back up within 2 min. **DO NOT execute without explicit user opt-in (touches production).** |
| Phase 33 history-dir consumption | REL-02 success criterion #3 | Phase 33 doesn't exist yet; can't auto-test the UI consumption | After this phase ships and Phase 33 lands, manually trigger a rollback (synthetic), then load Settings > Software Update in the browser, assert the rolled-back row renders with `status: rolled-back` styling. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 bash tests + 1 vitest extension + run-all.sh)
- [ ] No watch-mode flags (all tests use `--run`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 lands)

**Approval:** pending
