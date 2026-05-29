---
phase: 248
plan: 05
type: uat-checklist
total_items: 9
passed: 0
pending: 9
failed: 0
status: partial
---

# Phase 248 — Display Lifecycle UAT Checklist

**Target:** Mini PC `bruce@10.69.31.68` deployed SHA `49ba196501ae481a337645970d6cef2e2ba71f7d`.
**Sacred AionUi sha256:** `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` (must be unchanged before flipping ROADMAP).
**Operator surface:** Browser → `https://bruce.livinity.io/` → log in → open the Liv AI shell.

This checklist is the **production singleton** path that the 5 automated probes A–E in `248-05-DEPLOY-LOG.md` could not exercise via standalone tsx invocations (per the D-248-01-D per-instance handle-Map limitation documented in Deviation 1). Item E here is what truly proves the X-server SIGTERM chain works end-to-end inside the live MCP child.

---

## Mandatory (7 items)

- [ ] **A. Create Xephyr** — In Liv AI, ask the agent: _"Create a new Xephyr display."_
  - Expected: agent returns `{display:':10'}` (or higher if previous runs left allocator counter advanced) + a NEW Xephyr window appears on the operator's main desktop. Visible nested X-server, not just text.
  - SSH probe (read-only, optional): `redis-cli SCAN luse:display:*` should now show `luse:display::N` with the same N the agent reported.

- [ ] **B. Launch Firefox in the display** — Ask: _"Launch Firefox in display `:N`."_ (use the N from item A)
  - Expected: agent calls `computer_launch_app_in_display({display:':N', app:'firefox'})`. Firefox renders INSIDE the Xephyr window (not on the operator's main desktop, not on `:1`).
  - Result envelope should be `{pid, app_name:'firefox', display:':N', kind:'binary'}` or `kind:'native'` (whichever LivOSAppResolver matches).

- [ ] **C. Scoped screenshot** — Ask: _"Take a screenshot of display `:N` only."_
  - Expected: agent calls `computer_screenshot({display:':N'})`. Returned base64 image shows ONLY the Firefox-in-Xephyr contents, NOT the operator's main desktop or other windows.
  - Quick eyeball check: image bounds should be exactly 1920x1080 (the Xephyr screen geometry), and contain Firefox chrome.

- [ ] **D. List displays mid-flow** — Ask: _"List all displays."_
  - Expected: agent calls `computer_list_displays`, returns an array including the `:N` record. `running_apps` should contain the Firefox PID from item B.
  - Bonus probe: ask the agent to compare `running_apps[0]` against `ps -ef | grep firefox` PID (it should match).

- [ ] **E. Owner-scope kill ALLOWED** — Ask the agent: _"Close display `:N`."_
  - Expected: agent calls `computer_kill_display({display:':N'})` from the same session, returns `{ok:true, killed_apps_count:1}` (1 because Firefox is the one app).
  - **The Xephyr window vanishes from the operator's desktop** — this is the wire-level proof that the production singleton `handles.get(':N')` path works (vs. the standalone-probe limitation in DEPLOY-LOG Deviation 1).
  - SSH probe: `redis-cli SCAN luse:display:*` → empty; `pgrep -af Xephyr` → no `:N` process.

- [ ] **F. Owner-scope kill DENIED** — Open a SECOND Liv AI session (different browser tab/incognito, or different user account if multi-user is enabled). Create a display in session-1, then try to kill it from session-2.
  - Expected: session-2's `computer_kill_display` returns an MCP error with text matching: `not-owner — only the session that called computer_create_display can kill this display (D-V44-DISPLAY-OWNER-SCOPED)`.
  - The X server stays alive; `redis-cli HGETALL luse:display::N` still returns all fields.
  - Then kill it correctly from session-1 to clean up.
  - **Caveat:** per Phase 248-02 D-248-02-A, owner-session is sourced from `options.userId` (LUSE_USER_ID env), which is the MCP child's identity — single-tenant Mini PC has only one MCP child, so this item only fires if you can spawn a second McpBridge child with a different `LUSE_USER_ID`. If multi-user mode is off, this item is N/A and should be marked PASS (drift-locked at vitest Case G in 248-02 + impl tested by 248-01 Case 11). Mark explicitly: `[~] N/A single-tenant — drift-locked by 248-01 Case 11 + 248-02 Case G`.

- [ ] **G. computer_application + display arg** — Ask: _"Open gnome-calculator on a new Xephyr display."_
  - Expected: agent first creates a display `:M`, then calls `computer_application({application:'gnome-calculator', display:':M'})`. Calc appears INSIDE the Xephyr window, not on the operator's main desktop.
  - The agent should then ask to clean up (kill display `:M`).

---

## Optional (2 items)

- [ ] **H. Xvfb headless mode** — Ask: _"Create a headless Xvfb display."_
  - Expected: agent calls `computer_create_display({mode:'xvfb'})`. NO visible window appears on the operator's desktop (Xvfb is headless).
  - SSH probe: `xdpyinfo -display :N` succeeds (proves the headless X server is live), `pgrep -af Xvfb` shows the process.
  - Clean up: agent kills it after the operator confirms.

- [ ] **I. TTL GC (4h idle threshold)** — Long-running check; skip unless operator has 4+ hours.
  - Setup: create a display, do NOT attach any app, wait 4h+1m.
  - Expected: `journalctl -u livos --since '5 minutes ago' | grep 'display-ttl-gc: killed idle display'` shows a line with `{display:':N', idleAgeMs:<>14400000, owner_session:'bruce'}`. Redis key gone. Xephyr process gone (singleton path).
  - Alternative: skip and rely on the 8/8 vitest cases in `display-ttl-gc.test.ts` (248-03 Cases 1-8, drift-locked).

---

## Known limitations (carried forward from probes)

- **Probe E.4 cross-process X-kill** (DEPLOY-LOG Deviation 1) — does NOT affect production MCP usage. Items E + G above directly exercise the singleton path.
- **Single-tenant Mini PC** — Item F may be N/A; rely on the 18/18 + 23/23 vitest drift-locks if you can't spin up a second MCP child.
- **Display allocator monotonic** — re-running tests may use `:11`, `:12`, etc., not always `:10`. SCAN-seed at MCP child restart prevents collision.
- **Owner-scope is `LUSE_USER_ID`-based, not per-tool-call session** — see D-248-02-A.

---

## Sacred SHA gate (must be checked BEFORE flipping ROADMAP)

```bash
# Repo-side (Mini PC):
git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
# Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f

# Binary-side (Mini PC disk):
sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore
# Expected: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
```

If either mismatches → STOP, do NOT flip ROADMAP, escalate to the user.

---

## Source references

- `.planning/phases/248-luse-display-lifecycle/248-01-SUMMARY.md` — backend `createDisplayManager` (15/15 vitest)
- `.planning/phases/248-luse-display-lifecycle/248-02-SUMMARY.md` — 4 MCP tool schemas + handlers (18/18 vitest)
- `.planning/phases/248-luse-display-lifecycle/248-03-SUMMARY.md` — TTL GC 4h idle sweep (8/8 vitest)
- `.planning/phases/248-luse-display-lifecycle/248-04-SUMMARY.md` — canonical docs + 4-shim sync (20 shims idempotent)
- `.planning/phases/248-luse-display-lifecycle/248-05-DEPLOY-LOG.md` — wire-level probe transcripts + sacred-SHA verification

---

## Operator notes (per `feedback_full_autonomous_no_questions.md`)

Once the operator walks A→G (mandatory) and ticks them, they have explicit user-blanket-yes to flip ROADMAP Phase 248 row to `✅ SHIPPED` and commit. If A or E fails:

- A fails → likely Xephyr not on PATH (`which Xephyr` on Mini PC), or `LUSE_REDIS_URL` not seeded in MCP child env (check `journalctl -u livos | grep luse-mcp` for `displayManager=null` — indicates env regression).
- E fails (Xephyr window stays after agent says "closed") → real Rule-1 bug, NOT the DEPLOY-LOG E.4 artifact. Capture MCP child PID, inspect via `strace` or add a logger.info in display-manager.ts kill() to confirm `handles.get` returned non-null. Escalate before flipping ROADMAP.
