---
phase: 25-native-chrome-browser
plan: 03
subsystem: ui, apps
tags: [native-app, chrome, mcp, novnc, cdp, trpc, systemd]

requires:
  - phase: 25-native-chrome-browser/01
    provides: NativeApp class, systemd lifecycle, tRPC nativeStart/nativeStop routes
  - phase: 25-native-chrome-browser/02
    provides: Caddy routing, JWT cookie auth, native app entries in apps.list

provides:
  - useLaunchApp auto-starts native apps via nativeStart tRPC mutation before opening URL
  - apps.list response includes native discriminator flag (true/false) for UI detection
  - MCP panel Chrome entry uses direct npx CDP connection instead of Docker exec
  - Chrome setup script provisions CDP on port 9222 for MCP access

affects: [mcp-servers, chrome-management, app-launch]

tech-stack:
  added: []
  patterns:
    - "Native app auto-start: useLaunchApp checks app.native flag, awaits nativeStart before openInTab"
    - "Type discriminator via as const: native: true as const / native: false as const for union type narrowing"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/apps/routes.ts
    - livos/packages/ui/src/hooks/use-launch-app.ts
    - livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx
    - scripts/setup-chrome-native.sh

key-decisions:
  - "Fire-and-forget nativeStart with error catch: continue to open URL even if start fails (stream may already be running)"
  - "No nativeStop on window close: cross-origin tab reference unreliable, 30-min idle timer handles shutdown"
  - "CDP bound to 127.0.0.1 only: security constraint, MCP runs on same server"

patterns-established:
  - "Native app launch: check app.native -> await nativeStart -> open URL"

requirements-completed: [R-CHROME-STREAM, R-CHROME-MANAGE]

duration: 4min
completed: 2026-03-21
---

# Phase 25 Plan 03: Gap Closure Summary

**Fixed useLaunchApp to auto-start native Chrome via nativeStart mutation, replaced Docker MCP entry with direct CDP, added remote-debugging-port to setup script**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T13:04:08Z
- **Completed:** 2026-03-21T13:09:03Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- apps.list response now includes `native: true` for native apps and `native: false` for Docker apps, enabling UI type discrimination
- useLaunchApp hook auto-starts native app streams by calling nativeStart tRPC mutation before opening the browser tab
- MCP panel Chrome entry replaced from broken `docker exec chromium_server_1` to direct `npx @playwright/mcp` with CDP endpoint
- Chrome systemd service now includes `--remote-debugging-port=9222` for CDP access by MCP

## Task Commits

Each task was committed atomically:

1. **Task 1: Add native flag to apps.list and auto-start native apps in useLaunchApp** - `127313d` (feat)
2. **Task 2: Fix MCP panel Chrome entry and add --remote-debugging-port to setup script** - `cbe4392` (fix)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/routes.ts` - Added native: false/true flags to Docker/native app entries in apps.list
- `livos/packages/ui/src/hooks/use-launch-app.ts` - Added nativeStart mutation call before opening native app URLs
- `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx` - Replaced Docker exec Chrome MCP entry with direct npx CDP connection
- `scripts/setup-chrome-native.sh` - Added --remote-debugging-port=9222 and --remote-debugging-address=127.0.0.1 to Chrome launch

## Decisions Made
- Fire-and-forget nativeStart with catch: continue opening URL even on failure (stream may already be running)
- No nativeStop on window close: cross-origin tab references are unreliable, the existing 30-min idle auto-stop timer handles shutdown
- CDP bound to 127.0.0.1 only for security (MCP runs on the same server)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- sed on Windows Git Bash does not interpret \t as tab correctly; used Node.js for precise tab-indented insertions in routes.ts

## User Setup Required
None - no external service configuration required. Note: the setup script change means `setup-chrome-native.sh` must be re-run on Server4 (or the livos-chrome.service file manually updated) for CDP to be available.

## Deployment Notes
- Server4: Re-run `scripts/setup-chrome-native.sh` to update the livos-chrome systemd service with CDP flags
- Server4: Build UI after merge: `cd /opt/livos/livos && pnpm --filter @livos/config build && pnpm --filter ui build`
- Server4: Restart livinityd: `pm2 restart livos`

## Next Phase Readiness
- Phase 25 (native-chrome-browser) is now complete with all 3 plans executed
- Chrome native streaming: setup script, NativeApp class, Caddy routing, JWT auth, UI launch, MCP integration all complete
- Ready for deployment verification on Server4

## Self-Check: PASSED

All files exist, all commits verified (127313d, cbe4392).

---
*Phase: 25-native-chrome-browser*
*Completed: 2026-03-21*
