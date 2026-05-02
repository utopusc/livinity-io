# Phase 48 UAT — Live SSH Session Viewer

**Scope:** FR-SSH-01 + FR-SSH-02 — manual operator verification on Mini PC.
**Hardware:** Mini PC `bruce@10.69.31.68` ONLY (D-NO-SERVER4 hard-wall — Server4 + Server5 are off-limits for LivOS work).
**Pre-requisites:** Phase 46 UAT passed (Security section + BanIpModal already shipped). Phase 48 deployed via `bash /opt/livos/update.sh`.
**Estimated time:** 10-15 minutes.
**Branch shipped:** Phase 48 = 3 plans (48-01 backend WS + 48-02 UI tab + 48-03 master gate / this UAT). Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` MUST remain at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical through every Phase 48 plan.

---

## Prep

1. SSH to Mini PC (per project memory — minipc key, NOT contabo_master):

   ```
   /c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc \
     -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68
   ```

2. Confirm services healthy:

   ```
   sudo systemctl status livos liv-core --no-pager
   ```

   Both must be `active (running)`. (`liv-memory` may already be in restart loop — pre-existing v29.3 issue, NOT a Phase 48 regression.)

3. Confirm `journalctl` reads the ssh.service unit:

   ```
   sudo journalctl -u ssh -o json --since "5 minutes ago" --no-pager | head -3
   ```

   At least 1 JSON line should appear (any sshd activity counts — login attempts, session opens, key exchanges).

4. Confirm fail2ban is running (the click-to-ban flow at Step 4 depends on it):

   ```
   sudo systemctl status fail2ban --no-pager
   ```

---

## Step 1 — UI loads SSH Sessions tab

1. Open `https://bruce.livinity.io` (Mini PC's relay-routed front door via Server5 → Mini PC tunnel) in a browser logged in as the admin user.
2. Open the desktop app shell, click `LIVINITY_docker` → `Security` (sidebar entry, IconShieldLock — 13th SECTION_IDS entry shipped in Phase 46).
3. Click the `SSH Sessions` tab (third tab, alongside `Jails` and `Audit log` — shipped in Plan 48-02).

**Expected:**

- The tab body shows a "Listening for SSH events…" or empty-state message until the first event arrives.
- The Live badge (top-right of the tab body) is green / says `Live`.
- Browser DevTools → Network → WS panel shows an open WebSocket connection to `wss://bruce.livinity.io/ws/ssh-sessions?token=...`.
- DevTools → Console: zero errors related to the WS handshake.

---

## Step 2 — Trigger an SSH attempt; verify it appears

From a SECOND machine (or another terminal on your laptop), trigger an authentication attempt against the Mini PC's sshd. Pick an external machine so the source IP differs from the Mini PC's loopback:

```
ssh fakeuser@10.69.31.68 -o ConnectTimeout=3 -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o PasswordAuthentication=no \
  -o BatchMode=yes 2>&1 | head -3
```

(The connection will fail because no password auth is offered; sshd logs the attempt with `from <YOUR-IP>`.)

**Expected:**

- Within 1-2 seconds, a NEW row appears at the bottom of the SSH Sessions tab.
- Row columns:
  - `Time` — local HH:mm:ss; full ISO date in tooltip on hover.
  - `Message` — raw sshd MESSAGE, e.g., `Failed password for ... from <YOUR-IP> port ... ssh2` or similar.
  - `IP` — `<YOUR-IP>` extracted by the regex `\bfrom\s+(\d{1,3}(?:\.\d{1,3}){3})\b`.
- The IP cell shows two icons: copy + ban (destructive variant from the design system).

---

## Step 3 — Click-to-copy

1. Click the copy icon next to the IP from Step 2.
2. Paste into the URL bar / a text field (Ctrl+V).

**Expected:**

- Clipboard contains the literal IP string (e.g., `192.0.2.5`) — no extra whitespace, no quotes.
- The button briefly shows `copied` for ~1.5s before reverting.

---

## Step 4 — Click-to-ban (the killer feature: cross-link into Phase 46 BanIpModal)

1. Click the ban (destructive) icon next to the same IP row.
2. The Phase 46 BanIpModal opens with `initialIp` pre-populated — this is the click-to-ban cross-link contract shipped in Plan 48-02 via the additive `initialIp?: string` prop.

**Expected:**

- The IP input field is **pre-populated** with the IP from Step 2 (read-only or pre-filled but editable, depending on `BanIpModal` UX).
- The Jail dropdown defaults to the first discovered jail (likely `sshd` on Mini PC).
- Cancel out of the modal without confirming. (We don't actually ban our own test IP — UAT verifies the wiring, not the ban.)

**Optional advanced sub-test** — actually ban a TEST IP and unban afterward:

Use a non-routable IP from RFC 5737 documentation range — safe to ban as it's never legitimately on the public internet:

1. From a third terminal, run `sudo fail2ban-client set sshd banip 203.0.113.99` directly on the Mini PC to insert a synthetic ban (so a row appears in the SSH Sessions tab when sshd later sees an attempt — OR use `journalctl-cat` to inject a synthetic line if you don't have a way to trigger 203.0.113.99 traffic).
2. In the SSH Sessions tab, locate a row with that IP. Click ban → confirm in modal → confirm bans.
3. Switch to the `Jails` tab → confirm `203.0.113.99` appears in the banned list.
4. Click Unban on that row → modal opens → Unban → row disappears within 5s.

---

## Step 5 — Scroll-tolerance + Resume tailing (FR-SSH-02 W-12 invariant)

The 4-pixel scroll-tolerance threshold is encoded as `SCROLL_TOLERANCE_PX = 4` in `ssh-sessions-tab.tsx`.

1. Scroll up in the SSH Sessions table by more than 4 pixels (trackpad scroll up, OR drag the scrollbar handle up).
2. Watch the Live badge / button area at the top of the panel.

**Expected:**

- The "Resume tailing" primary button appears at the top-right.
- When new events arrive (trigger another SSH attempt), the row count increases but the visible scroll position does NOT jump — the user's scroll context is preserved.

3. Click "Resume tailing".

**Expected:**

- The table snaps to the bottom and the Resume button disappears.
- New events again auto-scroll into view.

---

## Step 6 — RBAC gate (close 4403 — admin role required)

1. Sign out of the admin user. Sign in as a non-admin user (member or guest role).
2. Open the desktop, navigate to `LIVINITY_docker` → `Security`.

**Expected behaviour A** — the Security sidebar entry is admin-gated UI-side (Phase 46 contract):

- Either the Security sidebar entry is hidden entirely, OR the section renders but the SSH Sessions tab is not present (depending on which sub-routes Phase 46 guarded).

**Expected behaviour B** — backend gate is the source of truth:

- If the non-admin user somehow reaches the SSH Sessions tab (e.g., via direct URL), the WS handshake closes with code 4403.
- Browser DevTools → Network → WS shows the connection closed with code 4403.
- A banner reads: `Admin role required. Only admins can view live SSH session traffic.`
- No event rows render.

3. Sign back in as the admin user.

**Pass:** Either UI-side gate (entry hidden) OR backend gate (4403 close + banner) — both are valid; backend is the authoritative gate per Plan 48-01 contract.

---

## Step 7 — Backout / no-impact verification

1. Toggle Settings → "Show Security panel" OFF (Phase 46 P05 wired this into AdvancedSection).
2. The Security sidebar entry disappears.
3. Toggle back ON; Security entry reappears.
4. Open the SSH Sessions tab again — WS connection re-establishes.

**Expected:**

- No errors in DevTools console.
- sshd remains running on Mini PC: `systemctl status ssh` (`active (running)`).
- fail2ban remains running on Mini PC: `systemctl status fail2ban` (`active (running)`).
- livinityd untouched: `systemctl status livos` shows the same PID as before the toggle (the WS-handler factory does NOT restart the daemon).

---

## Step 8 — Sacred file integrity gate (D-D-40-01-RITUAL)

From the repo (any dev machine):

```
git diff --shortstat HEAD~5..HEAD -- nexus/packages/core/src/sdk-agent-runner.ts
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
```

**Expected:**

- First command — empty output (the file was NOT modified through any of the last 5 commits, which span all of Phase 48).
- Second command — outputs `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical to the v29.4 baseline (recorded in STATE.md and 47-05-SUMMARY.md).

**Pass:** Sacred file untouched through Phase 48 — the v29.4 invariant holds.

---

## Step 9 — Test-chain master gate (`test:phase48`)

From the repo `nexus/packages/core/`:

```
cd nexus/packages/core
npm run test:phase48
```

**Expected:**

- Exit code 0.
- All chained Phase 39 → 47 tests pass + 3 ssh-sessions tests (`journalctl-stream.test.ts` 8/8, `ws-handler.test.ts` 8/8, `integration.test.ts` 5/5) — ALL green.
- The output ends with `All ssh-sessions integration.test.ts tests passed (5/5)`.

**Note (Windows local-dev):** On a Windows host, the chained `npm run` sub-shell can drop `tsx` from PATH (a documented pre-existing local-dev quirk surfaced in 47-05-SUMMARY.md — NOT introduced by Phase 48). The chain works correctly on the Mini PC (Linux). If running on Windows, also verify the 3 ssh-sessions test files individually:

```
cd <repo-root>
npx tsx livos/packages/livinityd/source/modules/ssh-sessions/journalctl-stream.test.ts
npx tsx livos/packages/livinityd/source/modules/ssh-sessions/ws-handler.test.ts
npx tsx livos/packages/livinityd/source/modules/ssh-sessions/integration.test.ts
```

Each must exit 0 with the appropriate "All <file> tests passed (N/N)" line.

---

## Rollback

If any UAT step fails irrecoverably:

1. On Mini PC source: `cd /opt/livos && git log --oneline -10` → find the v29.4 Phase 48 commits (search for `feat(48-`).
2. `git revert <sha>` for each Phase 48 commit (in reverse order: 48-03 → 48-02 → 48-01).
3. Re-run `bash /opt/livos/update.sh` to redeploy the reverted source.
4. The Phase 46 Security sidebar entry, jails-card, audit-log-tab, and BanIpModal all remain functional. Only the SSH Sessions sub-tab disappears.
5. fail2ban + sshd are NOT touched by Phase 48 source — no service-level rollback needed.

---

## Acceptance summary

| UAT step | FR mapping | Status |
|----------|------------|--------|
| 1 — UI loads SSH Sessions tab | FR-SSH-02 (UI panel + WS connect) | ☐ |
| 2 — SSH attempt appears live | FR-SSH-01 (WS stream + IP extraction) | ☐ |
| 3 — Click-to-copy | FR-SSH-02 (copy affordance) | ☐ |
| 4 — Click-to-ban cross-link | FR-SSH-02 (cross-link to Phase 46 BanIpModal via initialIp prop) | ☐ |
| 5 — Scroll-tolerance + Resume tailing | FR-SSH-02 (4px tolerance + Resume UX) | ☐ |
| 6 — RBAC gate close 4403 | FR-SSH-01 (adminProcedure / admin-gate at WS handshake) | ☐ |
| 7 — Backout no-impact | D-NO-NEW-DEPS / non-destructive | ☐ |
| 8 — Sacred file untouched | D-TOS-02 / D-D-40-01-RITUAL | ☐ |
| 9 — `test:phase48` master gate | All FR-SSH (FR-SSH-01 + FR-SSH-02) | ☐ |

Operator records date/time + name above. UAT closes Phase 48. Phase 48 is the final phase of the v29.4 milestone — closing this UAT closes the milestone.

---

## Cross-reference

- Plan 48-01 SUMMARY (backend WS handler + journalctl-stream + 16 unit tests): `.planning/phases/48-live-ssh-session-viewer/48-01-SUMMARY.md`
- Plan 48-02 SUMMARY (UI tab + lifted state + additive BanIpModal prop): `.planning/phases/48-live-ssh-session-viewer/48-02-SUMMARY.md`
- Plan 48-03 SUMMARY (this UAT + test:phase48 master gate): `.planning/phases/48-live-ssh-session-viewer/48-03-SUMMARY.md`
- Phase 47 UAT (analog walkthrough — diagnostics surface): `.planning/phases/47-ai-diagnostics/47-UAT.md`
- Phase 46 UAT (analog walkthrough — fail2ban admin panel): `.planning/phases/46-fail2ban-admin-panel/46-UAT.md`
