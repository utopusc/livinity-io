# 64-QUICK-TASK-TRIAGE — 3 v28.0 hot-patch quick-tasks

**Phase:** 64-v30-5-final-cleanup-at-v31-entry
**Plan:** 64-05
**Generated:** 2026-05-04
**Decision rule:** Per CONTEXT.md D-13/D-14 — resolve trivially or backlog with PLAN.md context preserved.

## Triage table

| Task ID    | Short name              | Original target                                                                                                       | Decision         | Rationale (one line)                                                                                          |
| ---------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| 260425-sfg | bundle/tailwind/sync/bg | container-create-form.tsx, server-control/index.tsx, /opt/livos/update.sh                                             | already-resolved | SUMMARY says completed 2026-04-25 with commits c58ff4d1 + 17e85ddd; bg-surface-base grep returns 0 in current master. |
| 260425-v1s | activity overflow       | activity-section.tsx, status-bar.tsx, status-footer.tsx (NEW), server-control (-3594 lines), settings, images/volumes | already-resolved | SUMMARY says completed 2026-04-26 with 10 commits 77a40a39..76b1ec06; status-footer.tsx + docker-app-icon.png present, all 10 hashes in git log.|
| 260425-x6q | window-only nav         | dock-item.tsx, dock.tsx, layouts/desktop.tsx, settings, modules/wifi/, utils/wifi.ts, activity-row.tsx                | already-resolved | SUMMARY says completed 2026-04-26 with 4 commits d45deb07,59d3e8fb,64edd418,620bf072; modules/wifi + utils/wifi.ts deleted; break-all=3 in activity-row.tsx. |

## Per-task evidence

### 260425-sfg — v28.0 hot-patch bundle (tailwind sync + bg)

**Source:** `.planning/quick/260425-sfg-v28-0-hot-patch-bundle-tailwind-sync-bg-/`
**Original PLAN.md objective:** "v28.0 hot-patch bundle: 5 ordered, atomic fixes (each = 1 commit, except deploy-side SSH ops which produce no commit) plus a 6th integration verification task. … Restore visual fidelity (sidebar bg, opaque create form), surface a container-detail row click, declutter the actions cell into a dropdown, and fix two update.sh deploy-side bugs (tailwind config sync omits .ts extensions, memory package never gets built)."
**SUMMARY.md state:** Existed (`status: completed`, `completed_at: 2026-04-25`). Documents 2 functional commits (`c58ff4d1` Task 2 bg-white, `17e85ddd` Task 3 dropdown), Task 4 (row-click) already wired by prior commit `04e2ccb7`/`e6349238`, Task 5 (memory build) already in update.sh. Self-Check: PASSED.
**Code-state check:**
- `Grep bg-surface-base livos/packages/ui/src/routes/docker/resources/container-create-form.tsx` → 0 matches (Task 2 fix in master).
- `git log --oneline | grep c58ff4d1` → present.
- `git log --oneline | grep 17e85ddd` → present.
- Note: server-control/index.tsx no longer contains `DropdownMenu` because v1s commit `42955da9` later removed the entire Docker management surface from server-control (-3594 lines), superseding sfg's Task 3 dropdown by structural deletion. The user-visible goal (declutter container row actions) was achieved either way — sfg made the dropdown, v1s removed the redundant surface entirely.
**Decision:** **already-resolved**
**Evidence:**
- Spot-check grep `bg-surface-base` in container-create-form.tsx: 0 matches → Task 2 fix verified present in master.
- Both commits `c58ff4d1` and `17e85ddd` confirmed in `git log --oneline --all`.
- SUMMARY documents Tasks 4 & 5 as no-op (work was already on disk before plan ran).

### 260425-v1s — v28.0 hot-patch round 2 (activity overflow + 9 more)

**Source:** `.planning/quick/260425-v1s-v28-0-hot-patch-round-2-activity-overflo/`
**Original PLAN.md objective:** "Round 2 hot-patch bundle for v28.0 Docker Management UI — 10 sıralı UI/yapısal fix covering Activity overflow, desktop icon swap, Server Management Docker-strip, Settings menu cleanup, StatusBar split (top/bottom), WS indicator audit, Shell empty-state contrast, and Images/Volumes table overflow + light-theme regressions."
**SUMMARY.md state:** Existed (`status: completed`, `completed_at: 2026-04-26T06:05:35Z`). Lists 10 atomic commits (`77a40a39..76b1ec06`), 16 files modified, all 4 Mini PC services active. Browser smoke verification deferred to user (chrome-devtools MCP not available). Self-Check: PASSED.
**Code-state check:**
- `ls livos/packages/ui/src/routes/docker/status-footer.tsx` → present (NEW file from Task 5).
- `ls livos/packages/ui/public/figma-exports/docker-app-icon.png` → present (NEW asset from Task 2).
- All 10 commit hashes (`77a40a39, 9f46e04a, 42955da9, bccea446, af5c54ee, 278dec16, e216bd46, 4deb2afc, 413af7ef, 76b1ec06`) confirmed in `git log --oneline --all`.
**Decision:** **already-resolved**
**Evidence:**
- 10/10 commits present in master.
- 2 NEW artifact files present (status-footer.tsx, docker-app-icon.png).
- 1 file deletion confirmed (use-trpc-connection.ts no longer in tree per SUMMARY frontmatter — not re-grepped here, but the SUMMARY's git log diff-filter D was already cited).
- Browser smoke verification still officially deferred to user — but acceptance criteria for this triage plan are satisfied by code-state evidence + commits in master, not by browser walks (those belong in 64-UAT-MATRIX work).

### 260425-x6q — v28.0 hot-patch round 3 (window-only nav, Wi-Fi removal, Activity wrap, dock prune)

**Source:** `.planning/quick/260425-x6q-v28-0-hot-patch-round-3-window-only-nav-/`
**Original PLAN.md objective:** "Round 3 hot-patch bundle for v28.0 Docker Management UI: 1) Window-only nav … 2) Total Wi-Fi UI removal — purge every Wi-Fi UI surface … 3) Activity event horizontal overflow fix … 4) Dock prune — remove Docker, Agents, Schedules DockItem entries."
**SUMMARY.md state:** Existed (`status: complete`, `completed: 2026-04-26T07:17Z`). Lists 4 atomic commits (`d45deb07, 59d3e8fb, 64edd418, 620bf072`), 9 modified + 8 deleted files, 716+ lines deleted, all 4 Mini PC services active (incl. liv-memory now active per update.sh patch). Self-Check: PASSED.
**Code-state check:**
- `ls livos/packages/ui/src/modules/wifi` → "No such file or directory" (Task 2 directory deletion confirmed).
- `ls livos/packages/ui/src/utils/wifi.ts` → "No such file or directory" (Task 2 file deletion confirmed).
- `Grep break-all livos/packages/ui/src/routes/docker/activity/activity-row.tsx` → 3 matches (Task 3 swap from `truncate` to `break-all` confirmed; the 3rd match is from the explanatory comment).
- All 4 commit hashes (`d45deb07, 59d3e8fb, 64edd418, 620bf072`) confirmed in `git log --oneline --all`.
**Decision:** **already-resolved**
**Evidence:**
- 4/4 commits present in master.
- Wi-Fi UI dir + utility deletions verified by `ls` returning ENOENT.
- Activity row `break-all` verified by grep count.

## Summary counts

- already-resolved: **3**
- resolved (this plan): **0**
- backlogged: **0**
- **Total:** 3

## BACKLOG.md changes

None. No quick-tasks were backlogged — all 3 had completed SUMMARYs with commits in master, and spot-checks confirmed the fixes are still present in current code.

## Sacred file SHA

Sacred file SHA: `4f868d318abff71f8c8bfbcf443b2393a553018b`
Source: `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` (run 2026-05-04 during this plan execution).
This plan made zero edits to that file — the SHA is a baseline snapshot to confirm sanctity at this plan's exit.

## Closure of `.planning/quick/` v28.0 directory

All 3 v28.0 quick-tasks (`260425-sfg`, `260425-v1s`, `260425-x6q`) are accounted for as `already-resolved`. The `.planning/quick/` directory has no unactioned v28.0 items at v31 entry. CARRY-05 satisfied. Phase 64 success criterion #5 satisfied.
