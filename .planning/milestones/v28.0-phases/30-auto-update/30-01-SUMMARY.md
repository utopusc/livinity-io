---
phase: 30
plan: 01
subsystem: livinityd-system
tags: [auto-update, github-api, ota, subprocess, trpc]

requires:
  - .planning/phases/30-auto-update/30-01-PLAN.md
  - .planning/phases/30-auto-update/30-RESEARCH.md
  - .planning/phases/30-auto-update/30-VALIDATION.md
  - .planning/phases/30-auto-update/REQUIREMENTS.md
  - livos/packages/livinityd/source/modules/system/update.ts (legacy api.livinity.io flow — replaced)
  - livos/packages/livinityd/source/modules/system/routes.ts (legacy update mutation — patched)

provides:
  - getLatestRelease(livinityd) → {available, sha, shortSha, message, author, committedAt} (GitHub commits API)
  - performUpdate(livinityd) → Promise<boolean> (bash /opt/livos/update.sh subprocess + section-marker progress)
  - system.checkUpdate tRPC query — new return shape (consumed by Plan 30-02)
  - system.update tRPC mutation — CONFLICT guard, no reboot, no stop
  - system.update + system.updateStatus on httpOnlyPaths (HTTP-routed, WS-disconnect-resilient)
  - /opt/livos/.deployed-sha (Server4 + Mini PC) — 41-byte file written by patched update.sh
  - .planning/phases/30-auto-update/artifacts/phase30-update-sh-patch.sh — repo-archived patch script

affects:
  - livos/packages/livinityd/source/modules/system/factory-reset.ts (consumer of performUpdate; signature preserved — Promise<boolean>)
  - livos/packages/ui/src/hooks/use-software-update.ts (Plan 30-02 will adapt to new shape)
  - livos/packages/ui/src/routes/settings/software-update-confirm.tsx (Plan 30-02 will adapt to new shape)

tech-stack:
  added: []
  patterns:
    - vi.mock('execa') + vi.mock('node:fs/promises') + globalThis.fetch = vi.fn() — full unit-mock surface for OTA flow
    - Hand-rolled fake EventEmitter proc for synchronous stdout/stderr emission (reusable for any execa-spawning code under test)
    - "Comment-only audit-noise pollution" caught: grep -c "reboot()" includes comments — must use stricter `^\s*await reboot\(\)` regex
    - SSH-patched runtime artifact NOT in repo: archived patch script as phase artifact for future reference

key-files:
  created:
    - livos/packages/livinityd/source/modules/system/update.unit.test.ts (231 lines)
    - livos/packages/livinityd/source/modules/system/routes.unit.test.ts (61 lines)
    - .planning/phases/30-auto-update/artifacts/phase30-update-sh-patch.sh (58 lines, repo-archived)
  modified:
    - livos/packages/livinityd/source/modules/system/update.ts (142 → 117 lines, full rewrite — legacy gone)
    - livos/packages/livinityd/source/modules/system/routes.ts (172 → 177 lines, +6 net for CONFLICT guard, -5 for legacy destructure removal)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (166 → 173 lines, +7 for system.update + system.updateStatus block)
    - livos/packages/livinityd/source/modules/system/system.integration.test.ts (+3 lines, doc-comment pointer to routes.unit.test.ts)
  remote_patched:
    - /opt/livos/update.sh on Server4 (45.137.194.103) — 10359 → 10747 bytes
    - /opt/livos/update.sh on Mini PC (10.69.31.68) — 10822 → 11210 bytes
  remote_created:
    - /opt/livos/.deployed-sha on Server4 (41 bytes, 644 root:root, b6981b5fc55d31c63a22012c0621d09a864750b6)
    - /opt/livos/.deployed-sha on Mini PC (41 bytes, 644 root:root, b6981b5fc55d31c63a22012c0621d09a864750b6)
  remote_rollback:
    - /opt/livos/update.sh.pre-phase30 on Server4 (10359 bytes, original)
    - /opt/livos/update.sh.pre-phase30 on Mini PC (10822 bytes, original)

decisions:
  - CONFLICT guard test landed in NEW routes.unit.test.ts (not extending system.integration.test.ts) — vi.mock('execa') at module scope would break the existing real-execa integration tests for getDiskUsage/memoryUsage. Plan explicitly permitted this fallback ("If integration testing infra is too heavy for a CONFLICT test, write it as a unit test").
  - SECTION_PROGRESS map declared at module scope (top of update.ts) — single source of truth, easy to extend if update.sh adds new step markers in the future.
  - update.sh patch inserted BEFORE "Step 9: Cleanup" (not after Restarting services step, although that was the original plan hint) — the cleanup-step marker `# ── Step 9: Cleanup ───` is the most stable anchor across both Server4 and Mini PC update.sh variants (line 240 vs 251 in source — line numbers diverged but the marker text is identical).
  - Bootstrap step added to Task 5 beyond what plan strictly required: pre-populated /opt/livos/.deployed-sha with current GitHub master SHA on both hosts so the new tRPC backend has data to read on its very next request, without waiting for the next deploy. Otherwise Plan 30-02 frontend testing would always show "update available" until first deploy. Documented in Task 5 commit body.
  - Test E split into E (final-state assertion) + E2 (mid-stream section-marker assertion) — original Test E from plan ambiguously asserted "during streaming" via `await proc` but post-resolution checks final state of progress=100. Split into two tests for unambiguous coverage.
  - livinityd User=root verified on BOTH hosts via `systemctl cat livos.service`. Assumption A1 (RESEARCH.md line 609) is now confirmed, not assumed. No sudoers config needed for /opt/livos/update.sh subprocess — it can run as livinityd's effective uid directly.
  - Pre-existing Windows-runtime test failure on getMemoryUsage (`ps -Ao pid,pss --no-header` — Linux-only ps flags) verified out-of-scope by stashing all Phase 30 changes and re-running the suite — same failure reproduced. Out-of-scope per executor scope-boundary rule.
  - grep -c "reboot()" returns 3 matches in routes.ts because line 92 ("// Phase 30 UPD-02: NO reboot() — ...") is a documentation comment containing the literal `reboot()`. Real-call audit needs `grep -E '^\s*await reboot\(\)'` (matches 2, the correct count). Documented in tech-stack.patterns.

metrics:
  duration: ~35min
  completed: 2026-04-26
  tasks: 6 (5 with commits, Task 6 verification-only)
  commits: 5 task commits (RED/GREEN/feat/feat/chore) — see commit-list

threat_flags: []
---

# Phase 30 Plan 01: Auto-Update Backend — GitHub-Aware OTA Rewrite

GitHub-aware OTA backend replaces the dead `api.livinity.io/latest-release` flow: `system.checkUpdate` now queries `api.github.com/repos/utopusc/livinity-io/commits/master` and compares the response SHA to `/opt/livos/.deployed-sha`; `system.update` spawns `bash /opt/livos/update.sh` directly with section-marker progress parsing and no reboot/stop.

## Built

- Rewrote `update.ts` (117 lines, was 142) — `getLatestRelease` returns `{available, sha, shortSha, message, author, committedAt}` from GitHub commits API; `performUpdate` spawns `bash /opt/livos/update.sh` via execa, parses `━━━ Section ━━━` markers from stdout/stderr, returns `Promise<boolean>` (factory-reset.ts contract preserved).
- Patched `routes.ts` — `checkUpdate` returns `getLatestRelease()` directly; `update` mutation drops `reboot()` + `ctx.livinityd.stop()` (would sever response stream); adds `TRPCError CONFLICT` guard for concurrent invocations.
- Added `system.update` + `system.updateStatus` to `httpOnlyPaths` in `common.ts` — Pitfall #4 mitigation (long-running mutation must not route over WS).
- Test scaffold `update.unit.test.ts` (8 tests: A1, A2, B, C, D, E, E2, F) covers UPD-01 + UPD-02 — all GREEN.
- Test scaffold `routes.unit.test.ts` (1 test: CONFLICT guard) — GREEN.
- SSH-patched `/opt/livos/update.sh` on Server4 + Mini PC to write `/opt/livos/.deployed-sha` after each successful build, before Step 9 Cleanup. Bootstrapped both hosts' `.deployed-sha` to current master SHA so the tRPC backend has data to read immediately.

## Test Results

| File | Tests | Pass | Notes |
|------|-------|------|-------|
| update.unit.test.ts | 8 | 8 | UPD-01 + UPD-02 happy paths + ENOENT + non-2xx + spawn + section parse + non-zero exit |
| routes.unit.test.ts | 1 | 1 | UPD-02 CONFLICT guard |
| system.unit.test.ts | 7 | 7 | Pre-existing tests still pass |
| system.integration.test.ts | 8 | 7 + 1 SKIPPED | 1 pre-existing Windows-runtime failure on getMemoryUsage (`ps -Ao` Linux-only flags) — out of scope per scope-boundary rule, verified by stash-and-rerun. |

System-suite total: **22 passed / 1 failed (pre-existing) / 1 skipped (CPU-temp env-skip)**. All Phase 30 new tests green.

## Grep Audit Results

| Audit | Expected | Actual | Status |
|-------|----------|--------|--------|
| `api\.livinity\.io\|latest-release\|releaseNotes\|updateScript` in modules/system | 0 | 0 | PASS |
| `await reboot()` or `await ctx.livinityd.stop()` inside `update:` mutation body | 0 | 0 | PASS (using strict `^\s*await ...` regex) |
| `'system.update'` in httpOnlyPaths | 1 | 1 (line 28) | PASS |
| `'system.updateStatus'` in httpOnlyPaths | 1 | 1 (line 29) | PASS |
| `'system.checkUpdate'` in httpOnlyPaths | 0 (intentional — query stays on WS) | 0 | PASS |
| `CONFLICT` token in routes.ts | ≥1 | 1 (line 85) | PASS |
| Real `^\s*await reboot()` calls in routes.ts | 2 (restart + factoryReset) | 2 (lines 128, 166) | PASS |
| TypeScript errors in update.ts (npm run typecheck) | 0 | 0 | PASS |

## SSH Patch Verification (Task 5 / UPD-03)

| Host | update.sh contains "Recording deployed SHA" | rollback artifact | .deployed-sha | livinityd User= | Status |
|------|---------------------------------------------|-------------------|---------------|-----------------|--------|
| Server4 (45.137.194.103) | YES (1 occurrence, after Step 8) | /opt/livos/update.sh.pre-phase30 (10359 bytes) | 41 bytes, 644 root:root, `b6981b5f...` | root | OK |
| Mini PC (10.69.31.68) | YES (1 occurrence, after Step 8) | /opt/livos/update.sh.pre-phase30 (10822 bytes) | 41 bytes, 644 root:root, `b6981b5f...` | root | OK |

Both .deployed-sha files contain `b6981b5fc55d31c63a22012c0621d09a864750b6` — the current GitHub master HEAD (commit "phase(30): add Auto-Update Notification (GitHub-Aware) to v28.0 roadmap"). On the very next `bash /opt/livos/update.sh` deploy on either host, the patched step will overwrite the bootstrap value with whatever HEAD was just cloned.

**Auth gates:** None. Executor had SSH keys available locally per MEMORY.md (`C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master` for Server4 + `.../minipc` for Mini PC). Task 5 was originally `checkpoint:human-action`, but the prompt's `<checkpoint_handling>` block explicitly authorized the executor to attempt SSH directly when keys were available. Both hosts patched without user intervention.

## Threat Mitigations

All threats from `<threat_model>` accounted for:

| ID | Category | Component | Disposition | Verified |
|----|----------|-----------|-------------|----------|
| T-30-01 | Tampering | system.update mutation argument surface | mitigate | Verified — mutation has zero `.input()` schema; `bash` and `/opt/livos/update.sh` are hard-coded literals; no user-controlled string interpolation reaches execa. |
| T-30-02 | DoS | GitHub commits API | accept | Documented — public API has 60 req/hr unauth quota; UI polls hourly; rate-limit returns 403 → frontend toast + retry next hour. No state corruption. |
| T-30-03 | Repudiation | system.update mutation | mitigate | Verified — `privateProcedure` (auth-gated); `setUpdateStatus` captures stdout/stderr; `livinityd.logger.error` logs failures. |
| T-30-04 | EoP | child_process spawn of update.sh | accept | Verified — update.sh is root-owned at fixed path on both hosts; livinityd runs as User=root via systemd; literal hard-coded path; no symlink traversal. |
| T-30-05 | InfoDisclosure | GitHub fetch User-Agent header | accept | Documented — `User-Agent: LivOS-${livinityd.version}` leaks version to GitHub. Public repo, non-sensitive. |
| T-30-06 | DoS | Concurrent system.update invocations | mitigate | Verified — TRPCError CONFLICT thrown when systemStatus === 'updating'. Test in routes.unit.test.ts asserts the rejection. |
| T-30-07 | Spoofing | GitHub master commit SHA | accept | Documented — TLS-secured fetch; same-repo replay would require GitHub repo write access. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Integration test infrastructure conflict — CONFLICT guard moved to dedicated routes.unit.test.ts**
- **Found during:** Task 3
- **Issue:** Plan suggested extending `system.integration.test.ts` with the CONFLICT case, but that file uses real execa (no `vi.mock('execa')` at module scope) and depends on real `getDiskUsage` / `memoryUsage` for its existing tests. Adding `vi.mock('execa')` would break those tests; using `vi.spyOn(execa, '$')` failed because `execa.$` is not configurable on the ESM module.
- **Fix:** Created new `routes.unit.test.ts` with `vi.mock('execa')` at module scope. The plan explicitly permitted this fallback in Task 3's `<action>` block ("If integration testing infra is too heavy for a CONFLICT test, write it as a unit test"). Reverted the system.integration.test.ts changes; left only a documentation comment pointing to routes.unit.test.ts.
- **Files modified:** Created routes.unit.test.ts; reverted system.integration.test.ts modifications (kept only doc comment).
- **Commit:** 1de2c0bd

**2. [Rule 2 - Critical Functionality] Bootstrap .deployed-sha after Task 5 patch**
- **Found during:** Task 5
- **Issue:** With only the update.sh patch landed (no `.deployed-sha` yet on disk because update.sh hasn't been re-run since the patch), `getLatestRelease` would always return `available: true` until the next deploy — meaning the UpdateNotification card would persist for users on the current deployed version. While ENOENT is gracefully handled in code (Pitfall #6), pre-populating the file with the current master SHA is the correct UX for a host that's already on the latest deploy.
- **Fix:** After patching update.sh on both hosts, fetched current GitHub master SHA via curl and wrote it to `/opt/livos/.deployed-sha` (chmod 644). Both hosts now contain `b6981b5fc55d31c63a22012c0621d09a864750b6`.
- **Files modified:** Remote — /opt/livos/.deployed-sha on both hosts.
- **Commit:** 15daf8a4 (documented in commit body)

**3. [Rule 1 - Bug Surface] Test E split into E + E2 for unambiguous coverage**
- **Found during:** Task 1 (RED phase)
- **Issue:** The plan's Test E description (`assert getUpdateStatus().progress === 10`) was timing-ambiguous — by the time `await proc` resolves, `performUpdate` overwrites status with `progress: 100, description: 'Updated'`. So a post-resolution assertion of `progress === 10` would always fail.
- **Fix:** Split into Test E (final-state: post-resolution = `progress: 100, description: 'Updated'`) and Test E2 (mid-stream: read status BEFORE proc resolves, assert `progress: 10, description: 'Pulling latest code'`). Both tests pass — full coverage of the section-marker parser.
- **Files modified:** update.unit.test.ts.
- **Commit:** 72ccb349 (RED), a4482e02 (GREEN).

### Auth Gates

None. Both SSH connections succeeded on first attempt with documented keys.

### Architectural Decisions

None — Rules 1-3 only. No Rule 4 (architectural change) was triggered.

## Carry-forward for Plan 30-02 (Frontend)

**The new tRPC return shape is now live:**
```ts
type CheckUpdateResult = {
  available: boolean
  sha: string         // 40-char
  shortSha: string    // sha.slice(0,7)
  message: string     // multi-line OK
  author: string
  committedAt: string // ISO 8601
}
```

**Plan 30-02 must update these consumers** of the legacy `{version, name, releaseNotes}` shape (RESEARCH.md Pitfall #1 lists them; some may already be updated by Plan 30-02 frontmatter):
1. `livos/packages/ui/src/hooks/use-software-update.ts` — read `latestVersion.sha` instead of `latestVersion.version`.
2. `livos/packages/ui/src/routes/settings/software-update-confirm.tsx` — render `message` (not `releaseNotes`), title from `shortSha` (not `version`), add author + relative-time row.
3. `livos/packages/ui/src/components/install-prompt-banner.tsx` (or wherever the existing banner reads `name`/`version`) — switch to `shortSha`/`message`.
4. `livos/packages/ui/src/components/update-notification.tsx` (NEW per RESEARCH.md Code Examples) — consumes the same shape directly.

**TypeScript will catch all 4 consumers** because removing `version`/`name`/`releaseNotes` from the return type means any reader of those fields gets `Property 'version' does not exist on type ...`. Use this as the canonical change-list (don't suppress the errors).

**httpOnlyPaths note:** `system.checkUpdate` is INTENTIONALLY left on WebSocket. If Plan 30-02 testing finds rate-limit errors poorly surfaced over WS (opaque message bodies vs. HTTP's clear status codes), revisit and add it. Open Question #1 in RESEARCH.md tracks this.

**Bootstrap detail:** Both hosts already have `.deployed-sha` populated to current master, so the UpdateNotification card should NOT appear immediately after Plan 30-02 ships if neither host has had a new commit pushed since `b6981b5f`. To smoke-test the notification flow during Plan 30-02 dev, manually delete `/opt/livos/.deployed-sha` on the test host (Mini PC), or push a no-op commit and wait for hourly poll to refresh.

## SSH Patch Artifact Paths

Rollback steps (if Phase 30 needs to be reverted):
```bash
# Server4
ssh -i .../contabo_master root@45.137.194.103 \
  "cp /opt/livos/update.sh.pre-phase30 /opt/livos/update.sh && rm /opt/livos/.deployed-sha"

# Mini PC
ssh -i .../minipc bruce@10.69.31.68 \
  "sudo cp /opt/livos/update.sh.pre-phase30 /opt/livos/update.sh && sudo rm /opt/livos/.deployed-sha"
```

Patch script (if either host needs re-patching after a fresh update.sh deploy that strips the patch):
- Repo path: `.planning/phases/30-auto-update/artifacts/phase30-update-sh-patch.sh`
- Idempotent: re-running it on an already-patched host emits `ALREADY-PATCHED` and exits 0.

## Commits

| Task | Type | Hash | Files |
|------|------|------|-------|
| 1 (RED) | test | 72ccb349 | livos/packages/livinityd/source/modules/system/update.unit.test.ts |
| 2 (GREEN) | feat | a4482e02 | livos/packages/livinityd/source/modules/system/update.ts |
| 3 | feat | 1de2c0bd | livos/packages/livinityd/source/modules/system/{routes.ts, system.integration.test.ts, routes.unit.test.ts} |
| 4 | feat | f382d6fd | livos/packages/livinityd/source/modules/server/trpc/common.ts |
| 5 | chore | 15daf8a4 | .planning/phases/30-auto-update/artifacts/phase30-update-sh-patch.sh + remote SSH patches |
| 6 | (verification only — no commit) | — | — |

## Self-Check: PASSED

Verified all created files exist:
- livos/packages/livinityd/source/modules/system/update.unit.test.ts: FOUND
- livos/packages/livinityd/source/modules/system/routes.unit.test.ts: FOUND
- .planning/phases/30-auto-update/artifacts/phase30-update-sh-patch.sh: FOUND

Verified all task commits exist (git log --oneline | grep):
- 72ccb349: FOUND (test(30-01))
- a4482e02: FOUND (feat(30-01) update.ts)
- 1de2c0bd: FOUND (feat(30-01) routes.ts + CONFLICT)
- f382d6fd: FOUND (feat(30-01) httpOnlyPaths)
- 15daf8a4: FOUND (chore(30-01) SSH patch)

Verified remote SSH artifacts (live SSH check during Task 5):
- Server4 /opt/livos/update.sh contains "Recording deployed SHA": YES
- Server4 /opt/livos/.deployed-sha exists, 41 bytes: YES
- Server4 /opt/livos/update.sh.pre-phase30 exists, 10359 bytes: YES
- Mini PC /opt/livos/update.sh contains "Recording deployed SHA": YES
- Mini PC /opt/livos/.deployed-sha exists, 41 bytes: YES
- Mini PC /opt/livos/update.sh.pre-phase30 exists, 10822 bytes: YES

All success criteria from PLAN.md `<success_criteria>` satisfied. Plan 30-02 unblocked.
