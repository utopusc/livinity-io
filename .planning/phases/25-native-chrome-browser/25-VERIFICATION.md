---
phase: 25-native-chrome-browser
verified: 2026-03-21T13:00:00Z
status: gaps_found
score: 6/8 must-haves verified
gaps:
  - truth: "Opening Chrome app in LivOS triggers stream start; closing triggers stream stop"
    status: failed
    reason: "useLaunchApp hook opens chrome.{domain} URL in a new tab without calling apps.nativeStart. No UI code calls nativeStart on open or nativeStop on window close. Stream must be started manually via tRPC or will not start when the user clicks the app icon."
    artifacts:
      - path: "livos/packages/ui/src/hooks/use-launch-app.ts"
        issue: "Opens URL with window.open() — does not call apps.nativeStart before navigating. Native app stream will not auto-start when user clicks Chrome."
    missing:
      - "useLaunchApp must detect native apps (e.g., via app.nativePort or a flag from apps.list) and call apps.nativeStart before opening the URL"
      - "A window-close / beforeunload / visibility handler must call apps.nativeStop (or the idle timer is the only stop mechanism)"
  - truth: "Native Chrome is deployed and streaming on Server4 after Docker chromium is removed"
    status: partial
    reason: "Deployment steps were executed on Server4 (documented in 25-02-SUMMARY.md deviations). Cannot verify server-side state from codebase alone — requires human confirmation that google-chrome-stable, livos-chrome.service, and /opt/noVNC are present on the server. Also, the MCP panel UI still hardcodes the old Docker container name chromium_server_1 for the Chrome MCP config."
    artifacts:
      - path: "livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx"
        issue: "Line 240: customArgs references chromium_server_1 Docker container (the old container), which no longer exists after migration to native Chrome. AI MCP Chrome control points at a dead container."
    missing:
      - "mcp-panel.tsx Chrome entry customCommand/customArgs must be updated to use the native Chrome CDP endpoint (google-chrome-stable runs with --remote-debugging-port or similar) rather than docker exec into the removed chromium_server_1 container"
      - "Human verification needed: confirm google-chrome-stable is installed on Server4, livos-chrome.service exists, /opt/noVNC/vnc.html exists"
human_verification:
  - test: "Chrome stream starts on click"
    expected: "Clicking Chrome app icon in LivOS opens the noVNC browser stream and Chrome becomes visible in the browser tab"
    why_human: "useLaunchApp has no nativeStart call — this only works if Chrome stream is already running. Need human to confirm whether clicking the Chrome app triggers stream start or shows a non-responsive page."
  - test: "Server4 native Chrome deployment"
    expected: "google-chrome-stable --version returns a version, systemctl cat livos-chrome.service succeeds, /opt/noVNC/vnc.html exists, no Docker chromium containers running"
    why_human: "Server-side state cannot be verified from the local codebase. Summary documents the deployment but server state may have changed."
  - test: "Chrome stream auth gate"
    expected: "Visiting chrome.{domain} without a livinity_token cookie redirects to /login"
    why_human: "Caddy config logic verified in code, but live behavior on Server4 (manual Caddyfile edit noted in summary) requires browser test to confirm."
---

# Phase 25: Native Chrome Browser Verification Report

**Phase Goal:** Install Google Chrome natively on server (no Docker), stream on-demand via noVNC when user opens the app, auth-gated behind LivOS JWT, manageable from UI and AI MCP. Stream starts on click, stops on window close/idle. Chrome session persists across restarts.
**Verified:** 2026-03-21T13:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A setup script exists that installs google-chrome-stable, Xvfb, x11vnc, websockify, and noVNC on the server | VERIFIED | `scripts/setup-chrome-native.sh` exists, starts with `set -euo pipefail`, installs all five deps, creates systemd service |
| 2 | A systemd service livos-chrome.service starts Xvfb + Chrome + x11vnc + websockify as a chain, stops cleanly | VERIFIED | Service embedded in setup script at `/etc/systemd/system/livos-chrome.service`, Type=forking, RemainAfterExit=yes, Restart=no, ExecStop kills all four processes |
| 3 | livinityd can start and stop the Chrome native app via systemctl without touching Docker | VERIFIED | `native-app.ts` NativeApp class uses `$\`systemctl start ${this.serviceName}\`` and `$\`systemctl stop ${this.serviceName}\`` |
| 4 | The Chrome entry in builtin-apps.ts is flagged as native type, not Docker | VERIFIED | `builtin-apps.ts` line 485-486: `native: true`, `nativePort: 6080`, `docker: { image: 'native' }` placeholder |
| 5 | Chrome streaming endpoint at chrome.{domain} requires valid LivOS JWT to access | VERIFIED | `caddy.ts` generateFullCaddyfile: `@notauth` matcher checks `Cookie *livinity_token=*`, redirects to `/login` if absent |
| 6 | tRPC routes exist for starting, stopping, and querying native Chrome app status | VERIFIED | `routes.ts` lines 542-571: `nativeStart`, `nativeStop`, `nativeStatus` all exist, wired to `getNativeApp()`, in `httpOnlyPaths` |
| 7 | Opening Chrome app in LivOS triggers stream start; closing triggers stream stop | FAILED | `useLaunchApp` calls `window.open()` directly with no `nativeStart` call. The stream never auto-starts on click. No window-close handler calls `nativeStop`. |
| 8 | Native Chrome is deployed and streaming on Server4 after Docker chromium is removed | PARTIAL | Code changes are correct and committed. SUMMARY documents successful deployment. MCP panel still references removed `chromium_server_1` Docker container. Server-side state requires human verification. |

**Score:** 6/8 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/setup-chrome-native.sh` | Server setup script for Chrome + streaming deps | VERIFIED | 99 lines, `set -euo pipefail`, installs google-chrome-stable + Xvfb + x11vnc + websockify + noVNC, embeds systemd service unit |
| `livos/packages/livinityd/source/modules/apps/native-app.ts` | NativeApp class with systemctl lifecycle | VERIFIED | 123 lines, exports `NativeApp` class and `NATIVE_APP_CONFIGS`, has start/stop/restart/getStatus/resetIdleTimer/clearIdleTimer |
| `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` | Chrome entry with native: true flag | VERIFIED | Lines 479-501: `native: true`, `nativePort: 6080`, port 6080, website `google.com/chrome` |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/apps/routes.ts` | tRPC routes for native app start/stop/status | VERIFIED | `nativeStart` (line 542), `nativeStop` (line 552), `nativeStatus` (line 562) all present and calling `getNativeApp()` |
| `livos/packages/livinityd/source/modules/domain/caddy.ts` | JWT-gated Caddy config for native app subdomains | VERIFIED | `generateFullCaddyfile` signature updated with `nativeApps` param (line 53), `@notauth` cookie block (lines 90-103) |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | httpOnlyPaths updated with native app routes | VERIFIED | Lines 50-52: `apps.nativeStart`, `apps.nativeStop`, `apps.nativeStatus` present |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `native-app.ts` | systemctl | execa $ subprocess | WIRED | Line 37: `` $`systemctl start ${this.serviceName}` ``, line 63: `` $`systemctl stop ${this.serviceName}` `` |
| `builtin-apps.ts` | `native-app.ts` | native flag checked in apps.ts | WIRED | `apps.ts` line 342: `if (this.isNativeApp(appId))` short-circuits Docker install; `NATIVE_APP_CONFIGS` registered in `apps.ts` start() |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `routes.ts` | `native-app.ts` | getNativeApp() then start()/stop() | WIRED | `routes.ts` lines 545, 555, 565 call `ctx.apps.getNativeApp(input.appId)` then `.start()`, `.stop()`, `.getStatus()` |
| `caddy.ts` | JWT verification | Cookie check redirect to /login | WIRED | `@notauth` matcher with `header Cookie *livinity_token=*`, handle block redirects to `https://${config.mainDomain}/login` |
| `routes.ts nativeStart` | `common.ts httpOnlyPaths` | tRPC HTTP routing | WIRED | `common.ts` lines 50-52 list all three native routes |
| `apps.ts rebuildCaddy` | `caddy.ts generateFullCaddyfile` | nativeInstances mapped to subdomains | WIRED | `apps.ts` lines 741-749: nativeInstances mapped to subdomain+port objects, passed as 4th arg to `generateFullCaddyfile` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| R-CHROME-NATIVE | 25-01 | Chrome installed natively with setup script for Xvfb + x11vnc + websockify + noVNC | SATISFIED | `setup-chrome-native.sh` installs all deps, `builtin-apps.ts` has `native: true`, `apps.ts` install short-circuits Docker |
| R-CHROME-STREAM | 25-01 | Chrome streams on-demand via noVNC — starts on user click, stops on window close or 30-min idle | PARTIAL | 30-min idle auto-stop timer is implemented in NativeApp. tRPC routes exist for manual start/stop. However, UI `useLaunchApp` does NOT call `nativeStart` on click, and no window-close handler calls `nativeStop`. "Starts on user click" is not implemented. |
| R-CHROME-AUTH | 25-02 | chrome.{domain} requires valid LivOS JWT cookie | SATISFIED | `caddy.ts` @notauth cookie check implemented and wired through `rebuildCaddy()` |
| R-CHROME-MANAGE | 25-02 | tRPC routes apps.nativeStart, apps.nativeStop, apps.nativeStatus exist | SATISFIED | All three routes exist in `routes.ts`, in `httpOnlyPaths`, call `getNativeApp()` correctly |

**Note:** REQUIREMENTS.md tracking table still shows all four R-CHROME requirements as "In Progress" — this should be updated to reflect completion status.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx` | 240 | `chromium_server_1` Docker container reference | Blocker | AI MCP Chrome control is broken — references a removed Docker container. `docker exec -i chromium_server_1` will fail because the container no longer exists after native Chrome migration. |
| `livos/packages/ui/src/hooks/use-launch-app.ts` | 35-38 | `window.open(target, '_blank')` without nativeStart call | Blocker | Chrome stream is never started when user clicks the app. noVNC page at chrome.{domain} will be unreachable or show an error because the streaming service is stopped. |

---

## Human Verification Required

### 1. Chrome Stream Starts on Click

**Test:** Click the Chrome app icon on the LivOS desktop or open it from the App Store. The Chrome app should open in a new tab showing the noVNC interface with Google Chrome running.
**Expected:** noVNC loads, Chrome browser is visible and interactive in the browser tab within ~5 seconds.
**Why human:** The backend `nativeStart` route exists but is not called from `useLaunchApp`. A human needs to confirm whether clicking Chrome starts the stream or shows a blank/error page. If the stream is already running (e.g., started manually), the experience might appear to work.

### 2. Server4 Native Chrome Deployment State

**Test:** SSH to Server4 and run: `google-chrome-stable --version && systemctl cat livos-chrome.service && ls /opt/noVNC/vnc.html && ls /opt/livos/data/chrome-profile && docker ps | grep -i chrom`
**Expected:** Chrome version prints, service unit exists, noVNC files present, chrome-profile directory exists, no Docker chromium containers running.
**Why human:** Server-side state changed during deployment (documented in 25-02-SUMMARY deviations section — files deployed via scp, not git pull). Cannot verify from local codebase.

### 3. Chrome Auth Gate Live Test

**Test:** Open an incognito browser tab and navigate to `https://chrome.socinity.livinity.io` without being logged in to LivOS.
**Expected:** Browser redirects to `https://socinity.livinity.io/login?redirect=...`.
**Why human:** Caddy code is correct, but the chrome block was manually added to the Caddyfile (25-02 deviation #3). Need to confirm the live Caddyfile has the correct block.

---

## Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — UI does not start stream on click (R-CHROME-STREAM partial)**

The phase goal requires "Stream starts on click." The entire lifecycle management backend is implemented correctly (NativeApp class, systemd service, tRPC routes). However, `useLaunchApp` — the universal hook called when any app icon is clicked — opens the app URL in a new tab without first calling `apps.nativeStart`. The Chrome noVNC page will be unreachable because `livos-chrome.service` will be stopped (Restart=no means it never auto-starts).

Fix: `useLaunchApp` must detect native apps from the app metadata (the `nativePort` field or similar signal from `apps.list`) and call `trpcReact.apps.nativeStart.mutate({appId})` before opening the URL.

**Gap 2 — MCP panel still references removed Docker container**

The AI MCP Chrome control in `mcp-panel.tsx` line 240 still uses `docker exec -i chromium_server_1` which references the Docker container that was removed in Plan 02. The "manageable from AI MCP" part of the phase goal is broken for the MCP browser control feature.

Fix: Update the Chrome MCP entry in `mcp-panel.tsx` to use a method compatible with native Chrome (e.g., CDP endpoint on the running Chrome process, or remove until native Chrome CDP support is wired).

Both gaps share the root cause that the UI layer was not updated to integrate with the new native app system.

---

_Verified: 2026-03-21T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
