---
mode: quick
type: hot-patch
phase: 260425-v1s
plan: 01
status: completed
completed_at: "2026-04-26T06:05:35Z"
deployed_to: "bruce.livinity.io (Mini PC, 10.69.31.68)"
commits:
  - {hash: 77a40a39, type: fix, scope: ui, message: "contain Activity Recent events list scroll within docker window"}
  - {hash: 9f46e04a, type: fix, scope: ui, message: "use docker whale icon for desktop tile only (dock/spotlight unchanged)"}
  - {hash: 42955da9, type: refactor, scope: server-control, message: "remove Docker management tabs (now only in Docker app)"}
  - {hash: bccea446, type: fix, scope: settings, message: "remove standalone Environments menu entry (still in Docker app settings)"}
  - {hash: af5c54ee, type: refactor, scope: docker, message: "split StatusBar into minimal top header + sticky StatusFooter"}
  - {hash: 278dec16, type: fix, scope: docker, message: "make StatusFooter Live indicator truthful via engineInfo freshness"}
  - {hash: e216bd46, type: fix, scope: ui, message: "make Shell empty state text and icon white"}
  - {hash: 4deb2afc, type: fix, scope: docker/images, message: "sticky Actions column + truncated Repository:Tag with tooltip"}
  - {hash: 413af7ef, type: fix, scope: docker/images, message: "light theme for Layer history + Vulnerabilities panels"}
  - {hash: 76b1ec06, type: fix, scope: docker/volumes, message: "sticky Actions column + truncated Mount Point/ID with tooltip"}
files_modified:
  - livos/packages/ui/public/figma-exports/docker-app-icon.png  # NEW (160KB whale)
  - livos/packages/ui/src/routes/docker/activity/activity-section.tsx
  - livos/packages/ui/src/modules/desktop/desktop-content.tsx
  - livos/packages/ui/src/routes/server-control/index.tsx  # 4793 -> 1199 lines
  - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
  - livos/packages/ui/src/routes/docker/status-bar.tsx  # 143 -> 30 lines
  - livos/packages/ui/src/routes/docker/status-footer.tsx  # NEW
  - livos/packages/ui/src/routes/docker/docker-app.tsx
  - livos/packages/ui/src/routes/docker/use-trpc-connection.ts  # DELETED
  - livos/packages/ui/src/hooks/use-engine-info.ts
  - livos/packages/ui/src/routes/docker/shell/shell-section.tsx
  - livos/packages/ui/src/routes/docker/resources/image-section.tsx
  - livos/packages/ui/src/routes/docker/resources/image-history-panel.tsx
  - livos/packages/ui/src/routes/docker/resources/scan-result-panel.tsx
  - livos/packages/ui/src/routes/docker/resources/volume-section.tsx
  - livos/packages/ui/src/routes/docker/resources/volume-usage-panel.tsx
---

# Quick Task 260425-v1s: v28.0 Hot-Patch Round 2 (Activity Overflow Bundle) Summary

Round 2 hot-patch bundle for v28.0 Docker Management UI: 10 atomic fixes covering
Activity overflow, desktop icon swap, Server Management Docker-strip, Settings
menu cleanup, StatusBar split (top/bottom), Live indicator truth-fix, Shell
empty-state contrast, Images/Volumes table sticky-Actions + truncate-with-tooltip,
and detail-panel light-theme regressions. All 10 commits deployed to
bruce.livinity.io; all 4 services healthy after restart.

## Tasks Executed

| Task | Name | Commit | Status | Files |
|------|------|--------|--------|-------|
| 1 | Activity Recent events overflow fix | 77a40a39 | done | activity-section.tsx |
| 2 | Desktop Docker tile uses whale icon | 9f46e04a | done | docker-app-icon.png + desktop-content.tsx |
| 3 | Strip Docker management tabs from Server Management | 42955da9 | done | server-control/index.tsx (-3594 lines) |
| 4 | Remove Environments entry from Settings sidebar | bccea446 | done | settings-content.tsx |
| 5 | Split DockerApp StatusBar into top + sticky bottom StatusFooter | af5c54ee | done | status-bar.tsx, status-footer.tsx (NEW), docker-app.tsx |
| 6 | Investigate + fix Docker WS "Offline" indicator | 278dec16 | done (Case ii) | use-engine-info.ts, status-footer.tsx, use-trpc-connection.ts (DELETED) |
| 7 | Shell empty-state white text + icon | e216bd46 | done | shell-section.tsx |
| 8 | Images table sticky Actions + truncated Repository:Tag | 4deb2afc | done | image-section.tsx |
| 9 | Image detail panels light theme | 413af7ef | done | image-history-panel.tsx, scan-result-panel.tsx |
| 10 | Volumes table sticky Actions + truncated Mount Point | 76b1ec06 | done | volume-section.tsx, volume-usage-panel.tsx |
| 11 | Build, push, deploy, verify | (no source commits) | done | — |

## Deploy Verification

- Local build: `pnpm --filter @livos/config build && pnpm --filter ui build` — both exited 0.
- Push: `git push origin HEAD:master` — fast-forward `bd355055..76b1ec06`.
- Deploy: `ssh bruce@10.69.31.68 'sudo bash /opt/livos/update.sh'` — completed
  with success banner, all build steps green (UI vite, Nexus core/memory/worker/mcp-server).
- Service health: `systemctl is-active livos liv-core liv-worker liv-memory` →
  4 × `active`.
- Asset probe: `curl https://bruce.livinity.io/figma-exports/docker-app-icon.png`
  returned the 160930-byte PNG (matches local copy from `C:/Users/hello/Downloads/docker.png`).

## Browser Verification

Chrome DevTools MCP (`mcp__chrome-devtools__*`) tools were NOT available in this
executor's tool inventory, so the per-fix browser smoke checks listed in the plan
(activity scroll, desktop icon, server-management 4-tab, settings menu, status-bar
split, live indicator green, shell empty-state, images sticky+truncate+light,
volumes sticky+truncate) MUST be performed manually by the user against
https://bruce.livinity.io.

Suggested verification flow (from PLAN.md Task 11 step 5):

1. Hard reload bruce.livinity.io (Ctrl+Shift+R after clearing service worker
   + cache from DevTools Application tab).
2. **Fix 1 — Activity:** Open Docker app → Activity tab. Generate activity
   (start/stop a container). Confirm events list scrolls inside the section,
   does NOT overflow into dock area.
3. **Fix 2 — Desktop icon:** On desktop, the Docker tile shows the whale logo
   (not the legacy server.svg). Dock + spotlight + mobile-tab still show the
   legacy icon.
4. **Fix 3 — Server Management:** Open Server Management. Only 4 tabs:
   Overview, PM2, Monitoring, Domains. No Containers/Images/Volumes/Networks/
   Stacks/Events. Engine Info card still on Overview.
5. **Fix 4 — Settings menu:** Open Settings sidebar. Verify NO "Environments"
   item under admin-only section. Open Docker app → Settings tab → still
   shows EnvironmentsSection (per task spec).
6. **Fix 5 — StatusBar split:** Docker app top bar shows ONLY EnvSelector +
   Search + AlertsBell. Bottom of pane shows sticky footer with all 8 stat
   pills (Docker version, socket, cores, RAM, free disk, uptime, time,
   Live/Stale).
7. **Fix 6 — Live indicator:** Watch StatusFooter Live pill for ~30s. Should
   show green "Live" while engineInfo is fresh (within 90s). Never shows
   red "Offline" while data is loading. Falls back to gray "Stale" only
   if engineInfo hasn't refreshed in >90s.
8. **Fix 7 — Shell empty state:** Docker app → Shell tab with no sessions
   open. Empty-state IconTerminal2 + "Click a container in the sidebar..."
   text appear in white on the dark xterm pane.
9. **Fix 8 — Images table:** Docker app → Images, narrow window to ~800px.
   Actions column stays at right edge (sticky). Long Repository:Tag values
   truncate with `…`; hover shows tooltip with full string. No horizontal
   table overflow past section bounds.
10. **Fix 9 — Image detail panels:** Click an image to expand. Layer history
    tab + Vulnerabilities tab both render with white backgrounds + dark
    legible text (no inverted/dim sections).
11. **Fix 10 — Volumes table:** Docker app → Volumes, narrow window. Actions
    column sticks right. Long volume names + mount points truncate; hover
    tooltip shows full string.
12. Console: no new errors during the above flows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Worktree missing PLAN.md and node_modules**
- **Found during:** Pre-execution context load.
- **Issue:** Worktree was based on `bd35505538` which predates the
  `.planning/quick/260425-v1s-...` directory creation in main repo. Also,
  worktree had no `node_modules` (live in main repo only).
- **Fix:** (a) Copied PLAN.md from main repo's `.planning/quick/...` into the
  worktree's matching path. (b) Created Windows junctions for `livos/node_modules`,
  `livos/packages/ui/node_modules`, and `livos/packages/config/node_modules` →
  main repo's installed `node_modules` so build + tsc could run from the worktree.
- **Files modified:** None tracked. Junctions are not committed.

**2. [Rule 3 - Blocker] Dead `formatUptime` reference in PM2 detail panel after Task 3**
- **Found during:** Task 3 (server-control deletion).
- **Issue:** `formatUptime(ms)` was a file-local helper at the bottom of
  the deleted region. PM2DetailPanel still referenced it.
- **Fix:** Restored the local `formatUptime(ms: number): string` helper just
  before `PM2StatusBadge`, preserving the original `ms`-based semantics
  (different from `docker/format.ts`'s seconds-based variant).
- **Commit:** Folded into `42955da9`.

**3. [Rule 3 - Blocker] `useContainers` / `useRef` / `Fragment` import drops**
- **Found during:** Task 3 import cleanup.
- **Issue:** Initial import-pruning removed `useRef` (used by PM2DetailPanel),
  `Fragment` (used by PM2Tab process expansion), and `useContainers` (used by
  OverviewTab summary).
- **Fix:** Restored the three imports; build went green. `IconLock` was also
  restored after a similar miss during the icon-prune pass.
- **Commit:** Folded into `42955da9`.

### Task 6 Decision (per plan's diagnostic decision tree)

- Diagnosis: **Case (i) + (ii) hybrid.** Investigation of
  `livos/packages/livinityd/source/modules/server/trpc/common.ts` revealed the
  `httpOnlyPaths` array routes ALL Docker mutations
  (manageContainer, createContainer, removeImage, pullImage, scanImage,
  deployStack, etc.) over HTTP. Only some queries (engineInfo, listContainers)
  traverse WS. So `wsClient.getConnection()` IS sometimes a real WS, but most
  mutations the user invokes don't use it — making the "WebSocket connected"
  label misleading even when correct.
- Implementation: **Case (ii)** — replaced LivePill with a "freshness" pill
  driven by `useEngineInfo().dataUpdatedAt`. Connected = engineInfo arrived
  within last 90s (one tRPC stale-time cycle + margin). Pill labels are now
  "Live" / "Stale" with neutral zinc colors for stale (not red), since stale
  data isn't an error.
- Cleanup: Deleted `livos/packages/ui/src/routes/docker/use-trpc-connection.ts`
  (no remaining consumers).

### Out-of-Scope Discoveries (not fixed, per scope-boundary rule)

- The `livos/packages/ui/src/routes/server-control/index.tsx` file has many
  pre-existing TS errors related to `@tabler/icons-react` ForwardRefExoticComponent
  vs ComponentType<{size?: number}> mismatches and tRPC context typing
  (".docker does not exist on type ..."). These predate this task and are
  unaffected by the changes; vite builds green via esbuild transpilation.
- Pre-existing build warning: `chunks larger than 500 kB after minification`
  (1423 kB index chunk). Unrelated to this hot-patch; deferred to a separate
  bundle-splitting task.

## Authentication Gates

None encountered. SSH key auth to Mini PC (NOPASS sudo) worked for the
deploy step.

## TDD Gate Compliance

N/A — this is a `mode: quick / type: hot-patch` task, not a `type: tdd` plan.
No RED/GREEN/REFACTOR gates required.

## Self-Check: PASSED

- [x] FOUND: livos/packages/ui/public/figma-exports/docker-app-icon.png (160930 bytes)
- [x] FOUND: livos/packages/ui/src/routes/docker/status-footer.tsx (NEW file)
- [x] DELETED: livos/packages/ui/src/routes/docker/use-trpc-connection.ts (`git log --diff-filter=D` confirms)
- [x] FOUND: 77a40a39 — `git log --oneline | grep 77a40a39`
- [x] FOUND: 9f46e04a
- [x] FOUND: 42955da9
- [x] FOUND: bccea446
- [x] FOUND: af5c54ee
- [x] FOUND: 278dec16
- [x] FOUND: e216bd46
- [x] FOUND: 4deb2afc
- [x] FOUND: 413af7ef
- [x] FOUND: 76b1ec06
- [x] DEPLOY: `update.sh` finished with success banner; 4/4 services active.
- [x] ASSET: `curl https://bruce.livinity.io/figma-exports/docker-app-icon.png` returned 160930-byte PNG (matches source).
- [x] PUSH: `bd355055..76b1ec06` fast-forwarded to `origin/master`.
