---
phase: 107
plan: 01
status: complete
completed: 2026-05-13
commits: [62b71946, b44d4ac3, f4917484, 1f243567, 4085fa02, c0d28715]
sacred_sha_preserved: true
scope_growth: "Original plan covered 5 files. During execution, grep audit found 3 additional files with stale references to removed app IDs (window-content.tsx switch cases, window-manager.tsx default sizes, desktop-content.tsx streamAppIds Set) plus a 4th dangling /app-store/ navigation in app-icon.tsx context menu. All folded into Task 5 commit for a clean phase close."
---

# Phase 107-01 SUMMARY — First-Run Polish + Default Apps Cleanup

## Outcome
Fresh-install LivOS dashboard no longer surfaces generic URL-bookmark "web apps" (Facebook/WhatsApp/YouTube as dock shortcuts, Facebook/YouTube/TradingView/Google/Yahoo as systemApps). The default dock now reflects LivOS-specific value: system apps (Home/Files/AppStore/Settings/AI Chat/Docker/etc.) plus Chrome + Gmail as the only pre-pinned URL launchers. Spotlight + cmdk + desktop context-menu search results for App Store apps now open the existing App Store iframe window (`windowManager.openWindow('LIVINITY_app-store', '/app-store', ...)`) instead of the dead native `/app-store/{appId}` route (which was removed when Phase 108 was reverted post-UAT).

## Live Evidence

**Static grep verification (post-execution):**
```bash
$ grep -rE "LIVINITY_(facebook|whatsapp|youtube|tradingview|yahoo)" \
    livos/packages/ui/src/ --include='*.tsx' --include='*.ts' \
    | grep -vE "settings-content\.tsx|memory\.tsx" | wc -l
0    # was 12 (across 3 files) before Task 5 sweep

$ grep -rE "navigate\(\`/app-store/" livos/packages/ui/src/ --include='*.tsx' | wc -l
0    # was 5 (across 3 files) before Phase 107
```

**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 6 Phase 107 commits (verified after each).

**TypeScript pre-existing errors** (NOT regressions — confirmed via `git checkout HEAD~6` build): `cmdk.tsx` line 415 (now 426) `appStateToString` index typing, `app-icon.tsx` line 150 (now 151) `assertUnreachable` arg. Both unchanged in form, only line numbers shifted by added imports.

## Files Modified (8 total)

| File | Change |
|---|---|
| `livos/packages/ui/src/modules/desktop/desktop-content.tsx` | webApps array pruned to just Gmail; streamAppIds Set similarly pruned |
| `livos/packages/ui/src/providers/apps.tsx` | systemApps URL-bookmark entries removed (FB/YT/TV/Google/Yahoo) |
| `livos/packages/ui/src/modules/desktop/dock-item.tsx` | DOCK_LABELS + DOCK_ICONS entries removed + 5 unused icon imports purged |
| `livos/packages/ui/src/components/apple-spotlight.tsx` | 2× navigate('/app-store/...') → windowManager.openWindow(...); useMemo deps updated |
| `livos/packages/ui/src/components/cmdk.tsx` | useWindowManagerOptional import added; 2× navigate replacement same as spotlight |
| `livos/packages/ui/src/modules/window/window-content.tsx` | fullHeightApps Set + switch case fallthrough cleaned |
| `livos/packages/ui/src/providers/window-manager.tsx` | 5 stale default-window-size entries removed |
| `livos/packages/ui/src/modules/desktop/app-icon.tsx` | ContextMenuItemLinkToAppStore now opens iframe window for installed-app store link |

## Commits

| SHA | Subject |
|---|---|
| `62b71946` | docs(107): auto-generated context + plan |
| `b44d4ac3` | feat(107): remove Facebook/WhatsApp/YouTube from default dock — keep Gmail |
| `f4917484` | feat(107): remove URL-bookmark systemApps (FB/YT/TV/Google/Yahoo) — keep Chrome+Gmail |
| `1f243567` | feat(107): remove dock labels/icons for FB/YT/TV/Google/Yahoo + unused icon imports |
| `4085fa02` | feat(107): spotlight + cmdk open App Store iframe window instead of dead /app-store/ route |
| `c0d28715` | feat(107): purge removed app IDs from window-content + window-manager + streamAppIds; fix app-icon context-menu /app-store/ ref |

## Locked Decisions Honored

- **D-107-NO-REGRESSION**: Verified existing apps (Home, Files, App Store, Settings, AI Chat, Docker, Server Mgmt, Devices, Subagents, Schedules, Terminal, Chrome, Gmail, Remote Desktop) all remain in dock-item maps + window-content switch + window-manager sizes.
- **D-107-NO-LIVINITY-AUTH-BYPASS**: Scope was UI-only — no livinityd/auth/Caddy/Redis touched.
- **D-107-SACRED-SHA-UNTOUCHED**: Verified `f3538e1d8...` after every commit.
- **D-107-SPOTLIGHT-CMDK-OPEN-IFRAME**: Search results now use `windowManager?.openWindow('LIVINITY_app-store', '/app-store', 'App Store', icon)` matching the dock's App Store opening pattern (`dock.tsx:149-156`).

## Mainserver Deploy

Not done in this session — UI-only changes will be picked up on the next `bash /opt/livos/update.sh` run on mainserver. Phase 107 is repo-only; no live mainserver/Mini PC mutation.

## Settings-side Preserved (NOT touched, by design)

- `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` — `WhatsAppPanel` (QR-code linking feature, a real LivOS capability — NOT a URL bookmark)
- `livos/packages/ui/src/routes/settings/memory.tsx:38` — WhatsApp entry in AI memory references (likewise a real feature)

## Follow-ups (DEFERRED, out of Phase 107 scope)

- **Drag-arrange dock ordering** for user pref persistence (v34.x)
- **Configurable `--default-apps gmail,chrome` install flag** (v34.x or v35)
- **Real i18n for dock labels** (currently hardcoded English)
- **Mini PC + mainserver UI deploy** to validate dock looks as expected post-change. Operator's call when to trigger next update.sh.
- **Pre-existing TS errors in cmdk + app-icon** — not caused by this phase, but worth a v34.x typing cleanup
