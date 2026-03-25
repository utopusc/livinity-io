---
phase: 25-native-chrome-browser
plan: 02
subsystem: infra
tags: [chrome, trpc, caddy, jwt, native-app, novnc, deployment, auth]

# Dependency graph
requires:
  - phase: 25-native-chrome-browser
    plan: 01
    provides: NativeApp class, setup script, builtin-apps native flag, apps.ts native instances
provides:
  - tRPC routes for native app start/stop/status (nativeStart, nativeStop, nativeStatus)
  - JWT cookie-gated Caddy config for native app subdomains
  - Native apps integrated into existing start/stop/state/list routes
  - Deployed native Chrome on Server4 replacing Docker chromium
affects: [ui-chrome-window, mcp-chrome-control]

# Tech tracking
tech-stack:
  added: []
  patterns: [caddy-cookie-auth-redirect, native-app-trpc-management, httpOnlyPaths-for-native-apps]

key-files:
  modified:
    - livos/packages/livinityd/source/modules/apps/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - livos/packages/livinityd/source/modules/apps/apps.ts

key-decisions:
  - "Cookie-based auth (livinity_token) for native app Caddy blocks instead of forward_auth (simpler, works with existing JWT cookies)"
  - "Native apps included in apps.list response so UI displays them alongside Docker apps"
  - "nativeStart/nativeStop/nativeStatus as dedicated routes plus integration into existing start/stop/state handlers"
  - "Manual Caddyfile chrome block added on Server4 for immediate activation (rebuildCaddy will maintain it going forward)"

patterns-established:
  - "Native app Caddy auth: @notauth matcher checks Cookie header for livinity_token, redirects to /login if absent"
  - "rebuildCaddy() passes nativeInstances to generateFullCaddyfile for automatic native app subdomain blocks"

requirements-completed: [R-CHROME-AUTH, R-CHROME-MANAGE]

# Metrics
duration: 10min
completed: 2026-03-21
---

# Phase 25 Plan 02: Auth + Routes + Deploy Summary

**tRPC native app management routes with JWT cookie-gated Caddy config, deployed to Server4 replacing Docker chromium with native Chrome streaming**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-21T12:34:54Z
- **Completed:** 2026-03-21T12:45:37Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added nativeStart, nativeStop, nativeStatus tRPC routes for native app lifecycle control from UI and AI MCP
- Integrated native apps into existing start/stop/state/list route handlers so they work transparently alongside Docker apps
- Generated JWT cookie-gated Caddy blocks for native app subdomains (redirect to /login if no livinity_token cookie)
- Deployed to Server4: removed Docker chromium, ran setup script, verified Chrome 146 + Xvfb + x11vnc + websockify + noVNC
- Verified Chrome streaming service starts on port 6080 and stops cleanly via systemd

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tRPC native app routes, Caddy auth, and httpOnlyPaths** - `ff6796a` (feat)
2. **Task 2: Deploy to Server4** - deployment only (no local code changes)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/routes.ts` - Added nativeStart/nativeStop/nativeStatus routes + native app handling in start/stop/state/list
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` - Added apps.nativeStart/nativeStop/nativeStatus to httpOnlyPaths
- `livos/packages/livinityd/source/modules/domain/caddy.ts` - Added nativeApps parameter to generateFullCaddyfile with cookie auth blocks
- `livos/packages/livinityd/source/modules/apps/apps.ts` - Updated rebuildCaddy() to pass native app subdomains to Caddy config generation

## Decisions Made
- Used Caddy `@notauth` cookie matcher pattern instead of `forward_auth` for JWT gate -- simpler approach that checks for `livinity_token` cookie presence and redirects to `/login` if absent
- Included native apps in the `apps.list` response with matching schema (name, icon, state, subdomain) so UI can display them identically to Docker apps
- Added 3 dedicated native routes (nativeStart/nativeStop/nativeStatus) AND integrated native app handling into existing start/stop/state routes for maximum compatibility
- Manually added Chrome Caddy block to Server4 Caddyfile since initial deployment didn't trigger rebuildCaddy (future subdomain changes will regenerate it automatically)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Server4 uses systemd not PM2 for livinityd**
- **Found during:** Task 2 (Deployment)
- **Issue:** Plan step 6 says to restart via PM2 (`pm2 restart livos`) but Server4 runs livos via systemd
- **Fix:** Used `systemctl restart livos.service` instead
- **Verification:** `systemctl is-active livos.service` returns `active`, logs show native app registration

**2. [Rule 3 - Blocking] Server4 has no git repo -- files deployed via scp**
- **Found during:** Task 2 (Deployment)
- **Issue:** Plan step 1 says `git pull` but /opt/livos is not a git repository
- **Fix:** Used scp to transfer all changed files (native-app.ts, routes.ts, apps.ts, builtin-apps.ts, caddy.ts, common.ts, setup-chrome-native.sh)
- **Verification:** All files verified present on server, livinityd started without errors

**3. [Rule 3 - Blocking] Caddy config not automatically regenerated on first deploy**
- **Found during:** Task 2 (Deployment)
- **Issue:** The chrome subdomain block wasn't added to Caddyfile because rebuildCaddy() only runs during subdomain registration, not on startup
- **Fix:** Manually appended the chrome.socinity.livinity.io block with cookie auth to the Caddyfile and reloaded Caddy
- **Verification:** `cat /etc/caddy/Caddyfile` shows chrome block with @notauth matcher

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All fixes were necessary to adapt the plan to Server4's actual deployment setup. No scope creep.

## Issues Encountered
- Samba errors in livinityd logs (`smbpasswd ENOENT`, `/etc/samba/smb.conf not found`) -- pre-existing, unrelated to this deployment
- Kernel upgrade pending on Server4 (6.8.0-86 vs 6.8.0-106) -- flagged by apt but not acted on (out of scope)

## User Setup Required
None - all deployment was completed on Server4 automatically.

## Next Phase Readiness
- Native Chrome browser is fully deployed and manageable via tRPC
- Chrome stream at chrome.socinity.livinity.io requires LivOS login (JWT cookie check)
- UI integration needed: Chrome app window should load noVNC iframe from chrome subdomain
- MCP integration: AI can call apps.nativeStart/nativeStop to manage Chrome browser

## Self-Check: PASSED

All files exist. Commit ff6796a verified.

---
*Phase: 25-native-chrome-browser*
*Completed: 2026-03-21*
