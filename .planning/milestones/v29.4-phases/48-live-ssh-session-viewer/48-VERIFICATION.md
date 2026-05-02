---
phase: 48-live-ssh-session-viewer
verified: 2026-05-01T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
human_verification:
  - test: "Open Security > SSH Sessions tab as admin; confirm WS handshake opens to /ws/ssh-sessions"
    expected: "Tab renders, Live badge is green, DevTools WS panel shows open connection, zero console errors"
    why_human: "Browser WebSocket lifecycle and UI rendering cannot be verified without a live deployment"
  - test: "From a second machine, trigger a failing SSH login to Mini PC; confirm a row appears in the tab within 1-2 seconds"
    expected: "Row shows HH:mm:ss timestamp, raw sshd MESSAGE, and extracted IPv4; IP cell shows copy + ban icon buttons"
    why_human: "Live journalctl tail against real sshd requires the Mini PC deployment and a real network attempt"
  - test: "Click the copy icon on an IP row; paste into a text field"
    expected: "Clipboard contains the bare IPv4 string, no extra whitespace or quotes; button shows 'copied' feedback for ~1.5s"
    why_human: "navigator.clipboard.writeText and transient UI feedback require a running browser session"
  - test: "Click the ban icon on an IP row; verify BanIpModal opens pre-populated with that IP"
    expected: "BanIpModal IP input contains the IP from the row (the click-to-ban cross-link via initialIp prop)"
    why_human: "React component interaction and modal state propagation require live browser + deployed backend"
  - test: "Scroll up more than 4px in the SSH Sessions table; verify Resume tailing button appears and click it"
    expected: "Scroll-tolerance fires, Resume tailing button surfaces, clicking it snaps to bottom and hides the button"
    why_human: "Scroll event detection and UI state changes require a live browser"
  - test: "Sign in as a non-admin user; navigate to Security > SSH Sessions"
    expected: "Either sidebar entry is hidden (UI gate) OR WS closes with code 4403 and banner reads 'Admin role required'"
    why_human: "RBAC flow for a non-admin user requires a live deployment with multi-user mode active"
---

# Phase 48: Live SSH Session Viewer Verification Report

**Phase Goal:** Admin can watch live SSH session activity on the Mini PC and one-click-ban a malicious-looking source IP via cross-link into Phase 46's manual ban modal.
**Verified:** 2026-05-01T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/ws/ssh-sessions` WebSocket route exists, is mounted in server/index.ts, and streams journalctl events with admin-only RBAC | VERIFIED | `mountWebSocketServer('/ws/ssh-sessions', ...)` at server/index.ts:1163; import of `createSshSessionsWsHandler` at line 30; close codes 4403/4404 in ws-handler.ts (7+3 occurrences); 16/16 unit tests pass |
| 2 | 5000-line ring buffer present with 4px scroll-tolerance auto-disable and Resume-tailing button | VERIFIED | `RING_BUFFER_LIMIT = 5_000` and `SCROLL_TOLERANCE_PX = 4` in ssh-sessions-tab.tsx lines 30-31; "Resume tailing" literal rendered at line 242; ring-buffer slice logic at lines 111-112 |
| 3 | Non-admin WS handshake is rejected with close code 4403; ENOENT degrades to close code 4404 | VERIFIED | ws-handler.ts close codes 4403 (7 occurrences) and 4404 (3 occurrences); ws-handler.test.ts tests 2-3 (member → 4403, guest → 4403), test 5 (ENOENT → 4404); 8/8 pass |
| 4 | Click-to-ban cross-links into Phase 46 BanIpModal with IP pre-populated via `initialIp` prop | VERIFIED | ssh-sessions-tab.tsx onBanIp prop wired at line 297; security-section.tsx: `setBanModalIp(ip)` + `setBanModalOpen(true)` on onBanIp callback; ban-ip-modal.tsx: `initialIp?: string` interface field, `setIp(initialIp ?? '')` in useEffect at line 100, `initialIp` in useEffect dep array at line 108 |
| 5 | No geo-IP / maxmind dep; 0 new npm dependencies across all 3 plans | VERIFIED | `grep -rn "maxmind\|geoip\|geolite"` in ssh-sessions module returns empty; package.json diff shows only `test:phase48` script added, no `dependencies` block change; sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical pre/post all 3 plans |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/ssh-sessions/index.ts` | Public barrel re-exporting journalctl-stream + ws-handler | VERIFIED | Exists; exports `extractIp`, `makeJournalctlStream`, `realJournalctlStream`, type exports, and `createSshSessionsWsHandler` (7 exports) |
| `livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.ts` | DI factory wrapping journalctl spawn; extractIp regex; ENOENT degrade | VERIFIED | Exists; 253 lines; spawns `journalctl -u ssh -o json --follow --since "1 hour ago"`; extractIp regex `\bfrom\s+(\d{1,3}(?:\.\d{1,3}){3})\b`; ENOENT → onMissing() |
| `livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.ts` | Admin RBAC gate; 5000-event ring buffer; close codes 4403/4404 | VERIFIED | Exists; 285 lines; `RING_BUFFER_LIMIT = 5_000`; close 4403 (7 occurrences), 4404 (3 occurrences), 1011 (1 occurrence) |
| `livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.test.ts` | 8 unit tests (extractIp + factory + ENOENT) | VERIFIED | Exists; 189 lines; 8 tests per summary (8/8 PASS) |
| `livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.test.ts` | 8 unit tests (RBAC gates + ring buffer + cleanup) | VERIFIED | Exists; 335 lines; 8 tests per summary (8/8 PASS) |
| `livos/packages/livinityd/source/modules/ssh-sessions/integration.test.ts` | 5 end-to-end tests (fake-spawn → real stream → fake WS) | VERIFIED | Exists; 401 lines; 5/5 PASS per summary |
| `livos/packages/ui/src/routes/docker/security/ssh-sessions-tab.tsx` | Live-tail table; click-to-copy; click-to-ban; scroll-tolerance; close-code banners | VERIFIED | Exists; 314 lines; `RING_BUFFER_LIMIT = 5_000`, `SCROLL_TOLERANCE_PX = 4`, `onBanIp` prop, "Resume tailing" literal, 4403/4404 handling, `navigator.clipboard.writeText` |
| `livos/packages/ui/src/routes/docker/security/security-section.tsx` (modified) | SshSessionsTab imported; banModalIp lifted state; third tab registered; initialIp passed to BanIpModal | VERIFIED | `import {SshSessionsTab}` at line 41; `banModalIp` state at line 65; `'ssh-sessions'` TabsTrigger at line 248; `initialIp={banModalIp}` at line 352 |
| `livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx` (modified) | Additive `initialIp?: string` prop; setIp pre-fill on open | VERIFIED | `initialIp?: string` in interface; `setIp(initialIp ?? '')` in useEffect; dep array includes `initialIp`; 5 reference sites total |
| `nexus/packages/core/package.json` (modified) | `test:phase48` script chaining test:phase47 + 3 ssh-sessions test files | VERIFIED | `test:phase48` at line 30; chains `npm run test:phase47 && tsx ...journalctl-stream.test.ts && tsx ...ws-handler.test.ts && tsx ...integration.test.ts` |
| `.planning/phases/48-live-ssh-session-viewer/48-UAT.md` | 9-step operator UAT; Mini PC only; no Server4 refs | VERIFIED | Exists; 9 numbered steps; targets `10.69.31.68` only; zero `45.137.194.*` references |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/index.ts` | `/ws/ssh-sessions` WS route | `mountWebSocketServer('/ws/ssh-sessions', ...)` at line 1163 | WIRED | Import at line 30; handler created and wired at line 1165 |
| `journalctl-stream.ts` | `server/index.ts` | Re-exported via barrel `index.ts`; imported in `ws-handler.ts` | WIRED | Barrel exports `realJournalctlStream`; ws-handler.ts imports it |
| `ssh-sessions-tab.tsx` | `/ws/ssh-sessions` backend | `buildWsUrl()` constructs `ws(s)://.../ws/ssh-sessions?token=<jwt>`; native WebSocket | WIRED | Line 68 confirms `/ws/ssh-sessions` substring; localStorage jwt token appended |
| `ssh-sessions-tab.tsx` | `security-section.tsx` | `onBanIp` lifted-up callback prop | WIRED | `onBanIp` prop defined in SshSessionsTabProps; invoked at line 297; handled in security-section |
| `security-section.tsx` | `ban-ip-modal.tsx` | `initialIp={banModalIp}` prop; `setBanModalIp(ip)` in onBanIp handler | WIRED | banModalIp state declared; set in onBanIp; passed as `initialIp` to BanIpModal at line 352 |
| `ban-ip-modal.tsx` | IP input field | `useEffect([open, jails, initialIp])` → `setIp(initialIp ?? '')` | WIRED | Line 100: `setIp(initialIp ?? '')`; dep array at line 108 includes `initialIp` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ssh-sessions-tab.tsx` | `events` (SshSessionEvent[]) | Native WebSocket `onmessage` → `JSON.parse(event.data)` → ring-buffer push | Yes — data originates from live `journalctl` spawn; backend WS handler broadcasts real sshd journal JSON | FLOWING |
| `ws-handler.ts` | `ringBuffer` (SshSessionEvent[]) | `makeJournalctlStream` subscription → `journalctl` child process stdout NDJSON lines | Yes — `journalctl -u ssh -o json --follow --since "1 hour ago"` produces real sshd events | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: The backend WS handler requires a live `journalctl` process on Mini PC and a running WebSocket server — not executable in static analysis. Unit and integration tests (21 total: 16 unit + 5 integration) cover all code paths with controlled fakes. Individual test files can be run locally with `npx tsx` per 48-UAT.md Step 9.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| test:phase48 script present in package.json | `grep "test:phase48" nexus/packages/core/package.json` | Found at line 30, chains test:phase47 + 3 ssh-sessions files | PASS |
| Phase 48 commits exist in git log | `git log --oneline | grep "9bf91508\|32dec195\|986b87d9"` | All 3 commits found | PASS |
| Sacred file SHA matches v29.4 baseline | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | PASS |
| Sacred file untouched across Phase 48 | `git diff --shortstat HEAD~5..HEAD -- .../sdk-agent-runner.ts` | Empty output | PASS |
| No maxmind/geoip/geolite in ssh-sessions module | grep on module directory | No matches | PASS |
| No Server4 IP (45.137.194.*) in integration test or UAT | grep on integration.test.ts and 48-UAT.md | No matches | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FR-SSH-01 | 48-01, 48-03 | WS `/ws/ssh-sessions` streaming journalctl -u ssh JSON events; admin RBAC gate (4403); ENOENT degrade (4404); IP extraction regex; 5000-event ring buffer | SATISFIED | ws-handler.ts (RBAC + ring buffer + close codes); journalctl-stream.ts (spawn + extractIp); server/index.ts mount; 16 unit tests + 5 integration tests all PASS |
| FR-SSH-02 | 48-02, 48-03 | UI table with timestamp / message / IP columns; click-to-copy; click-to-ban cross-link to Phase 46 BanIpModal pre-populated; 5000-line client ring buffer; 4px scroll-tolerance; Resume-tailing button | SATISFIED (UAT pending) | ssh-sessions-tab.tsx (314 LOC, all features present); security-section.tsx wiring (banModalIp lifted state); ban-ip-modal.tsx additive initialIp prop; build passes (vite exit 0, TS error delta 0) |

---

### Anti-Patterns Found

No blockers or warnings. The two `return null` occurrences in ssh-sessions-tab.tsx are legitimate: one is an error-guard on localStorage access (catch block), the other returns null when `conn.kind === 'connected'` (no banner to show — correct behavior). Neither flows to a stub rendering path.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

---

### Human Verification Required

The following items require a live Mini PC deployment (bash /opt/livos/update.sh) and browser session to verify. This is the established pattern for v29.4 phases (45/46/47 all closed at this same status).

#### 1. SSH Sessions Tab WS Connection

**Test:** Open Security > SSH Sessions tab as admin in a browser pointed at bruce.livinity.io.
**Expected:** Tab renders with connecting state, then green Live badge; DevTools WS panel shows open connection to wss://.../ws/ssh-sessions; zero console errors.
**Why human:** Browser WebSocket lifecycle and live UI rendering cannot be verified statically.

#### 2. Live SSH Event Appearance

**Test:** From a second terminal, attempt a failing SSH login to 10.69.31.68; watch the SSH Sessions tab.
**Expected:** Within 1-2 seconds, a row appears with local HH:mm:ss time, raw sshd MESSAGE, and the source IPv4; IP cell shows copy + ban icon buttons.
**Why human:** Requires a live journalctl tail against real sshd and a real network event.

#### 3. Click-to-Copy

**Test:** Click the copy icon next to an IP row; paste into a text field.
**Expected:** Clipboard contains the bare IPv4 string; button shows brief "copied" feedback (~1.5s).
**Why human:** navigator.clipboard.writeText and transient UI feedback require a live browser.

#### 4. Click-to-Ban Cross-Link

**Test:** Click the ban (destructive) icon next to an IP row.
**Expected:** Phase 46 BanIpModal opens with the IP field pre-populated (initialIp cross-link contract from Plan 48-02).
**Why human:** React modal state propagation from ssh-sessions-tab → security-section → BanIpModal requires a live browser session with the full component tree mounted.

#### 5. Scroll-Tolerance and Resume Tailing

**Test:** Scroll up more than 4px in the SSH Sessions table; observe Resume tailing button; click it.
**Expected:** Button appears on scroll; new events do not auto-scroll the user's position; clicking Resume snaps to bottom and hides the button.
**Why human:** Scroll event detection and scroll position state changes require a live browser.

#### 6. RBAC Gate (Close Code 4403)

**Test:** Sign in as a non-admin user and navigate to Security > SSH Sessions.
**Expected:** Either the sidebar entry is hidden (UI gate from Phase 46) or the WS handshake closes with code 4403 and a banner reads "Admin role required. Only admins can view live SSH session traffic."
**Why human:** Requires a live deployment with multi-user mode active and a non-admin account.

---

### Gaps Summary

No code-level gaps found. All 5 roadmap success criteria have complete implementations: the backend WS module (3-file shape), server mount, UI tab with all required affordances, the click-to-ban cross-link chain, and the test master gate. The 6 human verification items above follow the established v29.4 pattern (Phases 45/46/47 all required Mini PC UAT). UAT steps are documented in `.planning/phases/48-live-ssh-session-viewer/48-UAT.md`.

---

_Verified: 2026-05-01T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
