---
mode: quick
type: hot-patch
phase: 260425-x6q
plan: 01
title: "v28.0 hot-patch round 3 — window-only nav, Wi-Fi removal, Activity wrap, dock prune"
status: complete
completed: 2026-04-26T07:17Z
deploy_target: bruce.livinity.io (Mini PC, 10.69.31.68)
commits:
  - hash: d45deb07
    type: fix
    msg: "fix(ui/dock): prevent route navigation on window-opening dock click"
  - hash: 59d3e8fb
    type: feat
    breaking: true
    msg: "feat(ui)!: remove all Wi-Fi UI surfaces (backend routes preserved)"
  - hash: 64edd418
    type: fix
    msg: "fix(ui/docker/activity): wrap long event text instead of truncating"
  - hash: 620bf072
    type: refactor
    msg: "refactor(ui/dock): remove Docker, Agents, Schedules from dock (still in registry/desktop/spotlight/mobile)"
push:
  remote: origin/master
  range: f62d441a..620bf072
  fast_forward: true
files_modified:
  - livos/packages/ui/src/modules/desktop/dock-item.tsx
  - livos/packages/ui/src/modules/desktop/dock.tsx
  - livos/packages/ui/src/components/apple-spotlight.tsx
  - livos/packages/ui/src/components/cmdk.tsx
  - livos/packages/ui/src/layouts/desktop.tsx
  - livos/packages/ui/src/routes/settings/index.tsx
  - livos/packages/ui/src/routes/settings/_components/settings-content-mobile.tsx
  - livos/packages/ui/src/providers/prefetch.tsx
  - livos/packages/ui/src/routes/docker/activity/activity-row.tsx
files_deleted:
  - livos/packages/ui/src/routes/settings/wifi.tsx
  - livos/packages/ui/src/routes/settings/wifi-unsupported.tsx
  - livos/packages/ui/src/modules/wifi/desktop-wifi-button-connected.tsx
  - livos/packages/ui/src/modules/wifi/icon.tsx
  - livos/packages/ui/src/modules/wifi/wifi-drawer-or-dialog.tsx
  - livos/packages/ui/src/modules/wifi/wifi-item-content.tsx
  - livos/packages/ui/src/modules/wifi/wifi-list-row-connected-description.tsx
  - livos/packages/ui/src/utils/wifi.ts
metrics:
  total_files_changed: 17 (9 modified + 8 deleted)
  total_lines_deleted: 716+
  source_commits: 4
  build_time_local_seconds: 39
  deploy_time_seconds: ~80
mini_pc:
  services_active:
    livos: active
    liv-core: active
    liv-worker: active
    liv-memory: active   # NOTE: previously broken per MEMORY.md, now active — update.sh has been patched to build nexus/packages/memory
  http_status: 200
  served_bundle_hash: index-a0ddfc61.js
deferred:
  - "Browser smoke verification deferred to user — chrome-devtools MCP tools not available in this executor session (consistent with Round 2 SUMMARY)."
---

# v28.0 Hot-Patch Round 3 — window-only nav, Wi-Fi removal, Activity wrap, dock prune

Round 3 cleanup of three usability paper-cuts that survived Rounds 1+2, plus a user-requested Wi-Fi UI retraction. Four atomic source commits, fast-forwarded to `origin/master`, deployed via `update.sh`. All four Mini PC services healthy.

## Fixes Delivered

### Fix 1 — Window-only nav (`d45deb07`)
**File:** `livos/packages/ui/src/modules/desktop/dock-item.tsx`

Dock items with `onOpenWindow` were leaking URL changes on click — clicking the Settings dock icon would open a window AND mutate the URL bar to `/settings` (because the parent `<Link>`/router-driven mechanics elsewhere were still firing). Hardened the inner overlay `<button>` with:

- `type='button'` (defensive — never form submit)
- `e.preventDefault()` before invoking `onOpenWindow` (kills any default nav)
- `e.stopPropagation()` so the bubble to the outer `motion.div` `onClick` (which fires `props.onClick?.(e)`) does not double-trigger any prop-supplied navigation handler. Currently only `RecentAppsDock` passes a prop `onClick` (calls `launchApp(appId)`), and that uses the `<Link>` else-branch anyway, so this is purely defensive.

The `<Link>` else-branch (no `windowManager` — preview dock) is unchanged and continues to work for `DockPreview`.

### Fix 2 — Total Wi-Fi UI removal (`59d3e8fb`, breaking)
**14 files changed, 716 deletions.**

Per user request: Wi-Fi configuration is now handled by the host OS, not LivOS. Stripped every UI surface that referenced Wi-Fi:

| Surface | Action |
|---|---|
| Mobile settings sidebar entry | Removed `<ListRowMobile icon={TbWifi} ...>` block + `TbWifi` import + `WifiListRowConnectedDescription` import + `wifiQ` query |
| `/settings/wifi` + `/settings/wifi-unsupported` routes | Removed `<Route>` JSX + lazy imports in `routes/settings/index.tsx` |
| `wifi.tsx` + `wifi-unsupported.tsx` page files | `git rm` |
| Desktop top-right Wi-Fi button | Removed `DesktopWifiButtonConnected` import + JSX in `layouts/desktop.tsx`. Also removed orphaned `topRightPositionerClass` const and `tw` import |
| Spotlight Wi-Fi search hit | Removed `t('wifi')` entry from `systemItems` array in `apple-spotlight.tsx` |
| Cmdk Wi-Fi item | Removed `<SettingsSearchItem value='wifi' ...>` block in `cmdk.tsx` |
| Prefetch primer | Removed `utils.wifi.supported` and `utils.wifi.connected` from `prefetch.tsx` |
| `modules/wifi/` directory | `git rm -r` (5 files: desktop-wifi-button-connected, icon, wifi-drawer-or-dialog, wifi-item-content, wifi-list-row-connected-description) |
| `utils/wifi.ts` | `git rm` |

**Intentionally preserved (per spec):**
- Backend tRPC `wifi.*` routes in livinityd (UI-only removal)
- `trpc.ts` re-exports of `WifiNetwork` / `WifiStatus` types (typed by backend router output)
- i18n strings `wifi`, `wifi-description`, `wifi-unsupported-device-description` (1-line waste vs. risky removal)
- `environment-selector.tsx` IconWifi/IconWifiOff (used for Docker engine connection status — NOT wireless)

**Verification:** `grep -rn "DesktopWifiButtonConnected\|WifiListRowConnectedDescription\|WifiDrawerOrDialog\|from '@/modules/wifi\|from '@/utils/wifi'" livos/packages/ui/src` → 0. Deployed bundle grep on Mini PC for `DesktopWifiButtonConnected\|wifi-list-row-connected` → 0.

### Fix 3 — Activity event text wraps (`64edd418`)
**File:** `livos/packages/ui/src/routes/docker/activity/activity-row.tsx`

User wanted to read full event content (`exec_create:/bin/sh -c wget -q --spider http://localhost:5678/healthz`) without horizontal-overflow ellipsis clipping. Swapped `truncate` (`text-overflow:ellipsis; white-space:nowrap; overflow:hidden`) for `break-all` (`word-break:break-all`) on the title and body spans. `break-all` chosen over `break-words` because exec payloads contain long unbroken tokens (URLs, paths, flags) with no natural word boundaries.

Subtype pill and relTime span keep `shrink-0` (short tokens, single line). Parent `min-w-0 flex-1` left intact (enables shrink in the flex row). Native `title` attribute preserved (still useful as multi-line tooltip). Stale header comment "(truncated)" updated to "(wrapped via break-all)".

### Fix 4 — Dock prune (`620bf072`)
**File:** `livos/packages/ui/src/modules/desktop/dock.tsx` (49 lines deleted)

Removed three `<DockItem>` blocks: `LIVINITY_docker` (with the "Phase 24-01" comment above it), `LIVINITY_subagents`, `LIVINITY_schedules`.

Docker / Agents / Schedules are still launchable from:
- Desktop tile (Round 2 whale icon for Docker)
- Spotlight (Cmd-K → "Docker" / "Agents" / "Schedules")
- Mobile bottom tab bar (Round 1 Docker tab)
- Apps registry / window manager `openWindow()` programmatic launch

Kept untouched: `DOCK_LABELS` / `DOCK_ICONS` maps in `dock-item.tsx` (still used by recent-apps, desktop tile, spotlight, mobile tab to look up icons/labels), `apps.tsx` registry, `desktop-content.tsx` Docker tile, `apple-spotlight.tsx` Docker shortcut, `mobile-tab-bar.tsx` Docker tab.

## Build, Push, Deploy

| Step | Command | Result |
|---|---|---|
| Local build | `pnpm --filter @livos/config build && pnpm --filter ui build` | green (39.26s for UI) |
| Push | `git push origin worktree-agent-...:master` | fast-forward `f62d441a..620bf072` |
| Deploy | `ssh ... 'sudo bash /opt/livos/update.sh'` | "LivOS updated successfully!" banner, ~80s |
| Service health | `systemctl is-active livos liv-core liv-worker liv-memory` | all 4 = `active` |
| HTTP probe | `curl -I https://bruce.livinity.io/` | 200 |
| Bundle hash served | (HTML inspection) | `index-a0ddfc61.js` (fresh) |
| Bundle wifi grep on Mini PC | `grep "DesktopWifiButtonConnected\|wifi-list-row-connected" /opt/livos/packages/ui/dist/assets/*.js` | 0 matches |

**Note on liv-memory:** Previously documented in `MEMORY.md` as broken because `update.sh` didn't compile `nexus/packages/memory/dist/index.js`. This run, the deploy log shows `Building Nexus memory...` and `[OK] Nexus memory built` followed by `liv-memory` service ending up `active`. The `update.sh` script has been patched at some point to include memory in its build loop. No action needed.

## Deviations from Plan

### Auto-fixes (Rules 1-3)

**1. [Rule 3 — blocking] Worktree had no `node_modules` installed**
- **Found during:** Task 5a (local build)
- **Issue:** `pnpm --filter @livos/config build` failed with `'tsc' is not recognized` — the worktree was freshly cut from `f62d441a` and never had `pnpm install` run.
- **Fix:** Ran `pnpm install` in `livos/`. The post-install `mkdir -p public/generated-tabler-icons` failed under Windows shell (`The syntax of the command is incorrect`) but pnpm itself completed dependency placement correctly, and the subsequent build run succeeded (the missing tabler icons are also generated/copied during `vite build` indirectly). Build green on retry.
- **Files modified:** none (transient dep install)
- **Commit:** none (out-of-band setup, not a source change)

**2. [Rule 3 — blocking] `tw` import in `layouts/desktop.tsx` became orphaned**
- **Found during:** Task 2a
- **Issue:** After removing `topRightPositionerClass` (the only consumer of `tw` in that file), the `tw` import would have become unused (TS6133 / lint warning).
- **Fix:** Removed the `tw` import from `layouts/desktop.tsx` along with `topRightPositionerClass` itself. Used `Write` to fully replace the file with the cleaned version.
- **Files modified:** `livos/packages/ui/src/layouts/desktop.tsx` (already in Task 2 commit)
- **Commit:** `59d3e8fb` (folded into Wi-Fi removal commit)

**3. [Rule 1 — bug] Stale comment in `activity-row.tsx`**
- **Found during:** Task 3
- **Issue:** Header comment line 4 said "[title + body (truncated)]" — describing pre-fix behavior.
- **Fix:** Updated comment to "[title + body (wrapped via break-all)]" so future readers don't assume the row truncates.
- **Files modified:** `livos/packages/ui/src/routes/docker/activity/activity-row.tsx`
- **Commit:** `64edd418` (folded into Activity wrap commit)

### Push routing
The plan said `git push origin master`, but the executor was running inside a worktree on branch `worktree-agent-a4f58f0330c86c192`. Used `git push origin worktree-agent-...:master` to fast-forward `origin/master` directly. `origin/master` was at the same base as the worktree (`f62d441a`), so this was a clean fast-forward. No deviation in intent — the same 4 commits land on master.

### No `Rule 4` architectural deviations
All edits were file-local. No new tables, schemas, libraries, services.

## Browser Smoke Tests — DEFERRED to user

`mcp__chrome-devtools__*` tools are NOT available in this executor session (consistent with Round 2 SUMMARY: this is a recurring environment limitation). The Mini PC bundle has been verified to no longer contain Wi-Fi UI references (server-side grep returned 0), but visual UX checks must be run manually.

**To verify, open `https://bruce.livinity.io` in Chrome and:**

1. **SW + cache reset** — DevTools Console:
   ```js
   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
   caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
   location.reload(true);
   ```

2. **Fix 1 — window-only nav.** Click Settings dock item. URL bar must stay `/`. A Settings window must open. Repeat for Files, AI Chat, App Store, Live Usage, Server Management, Devices, Terminal — none should change URL.

3. **Fix 2 — Wi-Fi UI gone:**
   - Open Settings window → sidebar must NOT contain any Wi-Fi entry
   - Navigate to `https://bruce.livinity.io/settings/wifi` → falls through to no-match (blank `Routes` children) since the route is removed
   - Desktop top-right corner → no Wi-Fi button visible
   - `Cmd-K` → search "wifi" → zero results
   - Spotlight (search bar at top of desktop) → search "wifi" → zero system results

4. **Fix 3 — Activity text wraps.** Open Docker app → Activity tab. If no long events visible, generate one (start/stop n8n container so a `exec_create:/bin/sh -c wget -q --spider http://localhost:5678/healthz` event fires). Verify event row text wraps over 2-3 lines and does NOT produce a horizontal scrollbar inside the activity section.

5. **Fix 4 — dock pruned.** Count visible dock items left of recents. Must NOT include Docker/Agents/Schedules. Must include: Files, Settings, Live Usage, App Store, AI Chat, Server Management, Devices, Terminal (8 items). Then verify Docker still launches via:
   - Desktop tile (whale icon)
   - Spotlight (`Cmd-K` → "Docker")
   - On mobile viewport: bottom tab bar

6. **Console** — no new errors during the above flows. (Pre-existing memory.dist warning is gone now.)

## Self-Check: PASSED

- ✅ All 4 commits exist in `git log`: `d45deb07`, `59d3e8fb`, `64edd418`, `620bf072`
- ✅ All 4 commits have `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer
- ✅ All 4 commits pushed to `origin/master` (fast-forward `f62d441a..620bf072`)
- ✅ Local UI build green (vite ✓ built in 39.26s, 193 PWA precache entries)
- ✅ Mini PC `update.sh` succeeded with "LivOS updated successfully!" banner
- ✅ Mini PC `livos`, `liv-core`, `liv-worker`, `liv-memory` services all `active`
- ✅ `https://bruce.livinity.io/` responds 200
- ✅ Mini PC deployed bundle (`/opt/livos/packages/ui/dist/assets/*.js`) contains 0 references to `DesktopWifiButtonConnected` / `wifi-list-row-connected`
- ✅ Deferred items: browser MCP smoke tests (env limitation, manual instructions provided)
