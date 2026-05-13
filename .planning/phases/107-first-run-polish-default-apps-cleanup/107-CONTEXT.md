# Phase 107: First-Run Polish + Default Apps Cleanup - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped per workflow.skip_discuss)

<domain>
## Phase Boundary

Clean up LivOS dashboard for fresh installs: remove generic URL-bookmark "web app" shortcuts that don't reflect LivOS's value (Facebook/WhatsApp/YouTube as dock icons, Google/Yahoo/TradingView as system apps). Keep Chrome + Gmail (productivity / launcher utilities). Also fix Spotlight + cmdk dangling references to `/app-store/{appId}` which 404s after Phase 108 was reverted — replace with `windowManager.openWindow('LIVINITY_app-store', '/app-store', ...)` so users can discover apps via the existing App Store iframe.

</domain>

<decisions>
## Implementation Decisions

### Files to modify (5)
1. `livos/packages/ui/src/modules/desktop/desktop-content.tsx` — remove Facebook/WhatsApp/YouTube from hardcoded `webApps` array (lines ~407-412). KEEP Gmail.
2. `livos/packages/ui/src/providers/apps.tsx` — remove Facebook/YouTube/TradingView/Google/Yahoo from `systemApps` (lines ~146-187). KEEP Chrome + Gmail + Remote Desktop + all system-app entries (home, files, settings, etc.).
3. `livos/packages/ui/src/modules/desktop/dock-item.tsx` — remove `LIVINITY_facebook`, `LIVINITY_youtube`, `LIVINITY_tradingview`, `LIVINITY_google`, `LIVINITY_yahoo` from `DOCK_LABELS` + `DOCK_ICONS`. Remove now-unused icon imports (`TbBrandFacebook`, `TbBrandYoutube`, `TbChartLine`, `TbSearch`, `TbNews`).
4. `livos/packages/ui/src/components/apple-spotlight.tsx` — replace 2× `navigate('/app-store/${app.id}')` (lines 545, 563) with `windowManager?.openWindow('LIVINITY_app-store', '/app-store', 'App Store', systemAppsKeyed['LIVINITY_app-store'].icon)`. `useWindowManagerOptional` already imported (line 18).
5. `livos/packages/ui/src/components/cmdk.tsx` — same fix as 4 (lines 239, 254). Add `useWindowManagerOptional` import.

### NOT in scope
- Settings → WhatsAppPanel (`settings-content.tsx`) — this is the WhatsApp QR-code linking feature, a real LivOS capability. NOT touched.
- AI Chat memory's WhatsApp entry (`settings/memory.tsx:38`) — likewise a real feature reference.
- User-installed apps via App Store — fully preserved (we're only touching hardcoded shortcuts).

### Locked Constraints
- **D-107-NO-REGRESSION**: Existing apps (Gmail, Chrome, system apps like Home/Files/Settings/AI Chat) continue to render correctly in dock + spotlight + cmdk.
- **D-107-NO-LIVINITY-AUTH-BYPASS**: scope is UI-only, no auth changes.
- **D-107-SACRED-SHA-UNTOUCHED**: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` not in scope.
- **D-107-SPOTLIGHT-CMDK-OPEN-IFRAME**: replaced navigation must open existing App Store iframe window (not native /app-store route which was reverted in Phase 108).

</decisions>

<code_context>
## Existing Code Insights

**App Store window opens via** `windowManager.openWindow('LIVINITY_app-store', '/app-store', 'App Store', icon, originRect)` — verified in `dock.tsx:149-156`.

**windowManager hook:** `useWindowManagerOptional` from `@/providers/window-manager` — already imported in apple-spotlight.tsx, needs to be added to cmdk.tsx.

**systemAppsKeyed** is already imported in both spotlight + cmdk — use `systemAppsKeyed['LIVINITY_app-store'].icon` for the icon param.

</code_context>

<specifics>
## Specific Ideas

**Verification approach (UI-only phase):**
- Static: `grep "LIVINITY_facebook\|LIVINITY_youtube\|LIVINITY_tradingview\|LIVINITY_yahoo" livos/packages/ui/src/` should return 0 matches in non-Settings files
- Static: `grep "navigate('/app-store/'" livos/packages/ui/src/` should return 0 matches  
- Build: `pnpm --filter ui build` must complete with 0 errors (proves no broken imports after icon removal)
- Manual: dev server + browser smoke test (dock shows clean defaults, App Store opens via spotlight search)

**No mainserver deploy required** — UI-only phase, will be picked up on next regular update.sh run.

</specifics>

<deferred>
## Deferred Ideas

- Drag-arrange dock ordering for user pref persistence (separate concern, v34.x)
- Configurable "default apps" pinning at install-time via `--default-apps gmail,chrome` flag (v34.x or v35)
- Real localization for app labels (currently hardcoded English in `dock-item.tsx`)

</deferred>
