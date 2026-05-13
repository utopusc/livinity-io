---
phase: 107
status: passed
verified: 2026-05-13
score: 6/6 must-haves verified
sacred_sha_preserved: true
---

# Phase 107 VERIFICATION — First-Run Polish + Default Apps Cleanup

## Status: PASSED

All 6 must-haves verified via static grep, file inspection, and git log audit. No source-tree regressions.

## Must-Haves Checklist

| # | Must-Have | Status | Evidence |
|---|---|---|---|
| 1 | Fresh-install LivOS dock no longer shows Facebook/WhatsApp/YouTube | ✅ | `desktop-content.tsx:407-410` — webApps array reduced from 4 entries to 1 (`LIVINITY_gmail` only). Commit `b44d4ac3`. |
| 2 | systemApps no longer contains URL-bookmark entries for FB/YT/TradingView/Google/Yahoo | ✅ | `apps.tsx:146-162` — 5 entries removed, Chrome + Gmail + Remote Desktop preserved. Commit `f4917484`. |
| 3 | Spotlight + cmdk open App Store iframe window (not dead /app-store/) | ✅ | `apple-spotlight.tsx:540-577` + `cmdk.tsx:232-262` — 4 instances of `navigate('/app-store/...')` replaced with `windowManager?.openWindow('LIVINITY_app-store', ...)`. Commit `4085fa02`. |
| 4 | No regression: existing dock apps render correctly | ✅ | `dock-item.tsx` DOCK_LABELS + DOCK_ICONS retain all preserved entries (Home/Files/AppStore/Settings/LiveUsage/AIChat/Docker/ServerControl/MyDevices/Subagents/Schedules/Terminal/Chrome/Gmail). Verified via `git diff --stat HEAD~6 HEAD livos/packages/ui/src/modules/desktop/dock-item.tsx` showing only deletions, no preserved-entry mutations. |
| 5 | Sacred SHA preserved across all commits | ✅ | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` confirmed after each of 6 commits (62b71946, b44d4ac3, f4917484, 1f243567, 4085fa02, c0d28715). Pre-commit hook gated every one. |
| 6 | No broken imports after icon removal | ✅ | TypeScript build (`tsc --noEmit`) shows only 2 pre-existing errors (cmdk:426 + app-icon:151) that existed at HEAD~6 (proven via `git checkout HEAD~6 -- <files> && tsc`). No new errors. Touched files free of any TS errors. |

## D-107-* Locked Decisions Verification

| Decision | Status | How verified |
|---|---|---|
| D-107-NO-REGRESSION | ✅ | All 14 preserved app IDs still present in dock-item DOCK_LABELS + DOCK_ICONS + apps.tsx systemApps. Window-content switch retains all non-removed cases. Window-manager sizes preserved for non-removed apps. |
| D-107-NO-LIVINITY-AUTH-BYPASS | ✅ | `git diff HEAD~6 HEAD livos/packages/livinityd/` shows zero diff. No backend/server changes. |
| D-107-SACRED-SHA-UNTOUCHED | ✅ | 6× `git hash-object liv/packages/core/src/sdk-agent-runner.ts` checks, all returning the canonical SHA. |
| D-107-SPOTLIGHT-CMDK-OPEN-IFRAME | ✅ | All 5 (originally 4 from plan + 1 in app-icon discovered during Task 5) `/app-store/<id>` navigations replaced with `windowManager?.openWindow('LIVINITY_app-store', '/app-store', 'App Store', icon)` matching dock pattern at `dock.tsx:149-156`. |

## Scope Growth (Recorded, Not a Gap)

Original plan covered 5 files. During execution, comprehensive grep audit found:
- `window-content.tsx` — fullHeightApps Set + 6 switch case fallthroughs referenced removed apps
- `window-manager.tsx` — 5 default-window-size entries for removed apps
- `desktop-content.tsx` (additional usage) — streamAppIds Set referenced removed apps
- `app-icon.tsx` (4th dangling /app-store/ navigation) — context-menu "Go to store page" handler

All folded into commit `c0d28715` (Task 5) for clean phase close. This is a legitimate scope refinement per Rule 1+3 (same objective, broader file list discovered through verification), not a gap.

## Deferred Follow-ups (NOT verification gaps)

- Mini PC + mainserver UI deploy (operator's call when to trigger `update.sh`)
- Drag-arrange dock ordering (v34.x)
- `--default-apps` install-time flag (v35)
- Real i18n for dock labels (v34.x)
- Pre-existing TS errors in cmdk + app-icon (separate phase, not Phase 107 scope)

## Commit Chain

```
62b71946 docs(107): auto-generated context + plan
b44d4ac3 feat(107): remove Facebook/WhatsApp/YouTube from default dock — keep Gmail
f4917484 feat(107): remove URL-bookmark systemApps (FB/YT/TV/Google/Yahoo) — keep Chrome+Gmail
1f243567 feat(107): remove dock labels/icons for FB/YT/TV/Google/Yahoo + unused icon imports
4085fa02 feat(107): spotlight + cmdk open App Store iframe window instead of dead /app-store/ route
c0d28715 feat(107): purge removed app IDs from window-content + window-manager + streamAppIds; fix app-icon context-menu /app-store/ ref
```

Phase 107 ✅ SHIPPED.
