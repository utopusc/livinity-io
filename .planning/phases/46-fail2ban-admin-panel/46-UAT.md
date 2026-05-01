# Phase 46 UAT — Fail2ban Admin Panel (Manual)

**Status:** un-executed (deferred to next Mini PC deploy per v29.3 UAT pattern)
**Host:** bruce@10.69.31.68 — Mini PC ONLY (D-NO-SERVER4 — Server4/Server5 OFF-LIMITS)
**Time budget:** ~25-35 min walkthrough
**Pre-requirement:** test:phase46 npm gate green; pnpm --filter ui build clean
**SSH command (per project memory):**

```
/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
```

## Pre-flight (5 min)

1. Deploy Phase 46 to Mini PC: `bash /opt/livos/update.sh` (NOT pm2 reset).
2. Verify all four services running: `systemctl status livos liv-core liv-worker liv-memory --no-pager` — note `liv-memory` may already be in restart loop (pre-existing v29.3 issue, NOT a Phase 46 regression).
3. Verify fail2ban running: `systemctl status fail2ban --no-pager`.
4. Verify Phase 45 carry-forwards still green: `cd /opt/livos/livos/livinityd && npm run test:phase45 || true` (or run on local clone — test:phase45 chain).
5. Open https://bruce.livinity.io/ in browser logged in as admin user.

## Section 1 — FR-F2B-01: Sidebar registration + jail discovery (5 min)

**Maps to:** FR-F2B-01, ROADMAP §46 success #1, sub-issue #1 (UI under routes/docker/security/), pitfalls W-03 (auto-discover jails) + W-04 (binary-detection states)

Steps:

1. Open Server Management → expect "Security" entry as the 13th sidebar item, between "Activity" and "Schedules".
2. Click "Security" → section renders without errors.
3. Verify discovered jails appear as tabs (NOT hardcoded `sshd`). For Mini PC default install, expected: `sshd`, `recidive` (or whatever was captured in `46-01-DIAGNOSTIC.md`).
4. Watch the network tab — `fail2ban.listJails` query fires every ~5s.
5. Click "Refresh" button → `listJails` + `getJailStatus` invalidated and re-fetched immediately.

PASS: 13th sidebar item visible, jails discovered, 5s polling observed, manual Refresh works.

## Section 2 — FR-F2B-01 + B-04 + W-04: Three service-state banners (5 min)

**Maps to:** ROADMAP §46 success #6, pitfall W-04 (anti-fragile fail2ban-client missing detection)

Sub-test 2a — service-inactive:

1. SSH to Mini PC. Run `sudo systemctl stop fail2ban`.
2. Wait 6s. Refresh UI.
3. Expect yellow banner: "Fail2ban service is stopped."
4. SSH: `sudo systemctl start fail2ban`. Refresh. Expect banner clears.

Sub-test 2b — binary-missing simulation:

1. SSH: `sudo mv /usr/bin/fail2ban-client /usr/bin/fail2ban-client.bak` (ALSO run `sudo systemctl stop fail2ban` to ensure no zombie process).
2. Refresh UI. Expect red banner: "Fail2ban not installed..."
3. SSH: `sudo mv /usr/bin/fail2ban-client.bak /usr/bin/fail2ban-client && sudo systemctl start fail2ban`. Refresh. Expect banner clears.

Sub-test 2c — no-jails-configured (skip if Mini PC has multiple jails configured — synthesize via temp config swap if curious):

1. Optional: SSH and `mv /etc/fail2ban/jail.local /etc/fail2ban/jail.local.bak; systemctl restart fail2ban`. Wait 6s. Refresh.
2. Expect yellow banner: "Fail2ban running but no jails configured."
3. Restore: `mv /etc/fail2ban/jail.local.bak /etc/fail2ban/jail.local; systemctl restart fail2ban`.

PASS: All 3 banner states render with correct copy + correct color.

## Section 3 — FR-F2B-02 + B-01: Unban + whitelist (5 min)

**Maps to:** FR-F2B-02, ROADMAP §46 success #2, pitfall B-01 (action-targeted unban prevents re-cycle)

Steps:

1. SSH to Mini PC. Manually ban a fake IP: `sudo fail2ban-client set sshd banip 192.0.2.99`.
2. UI: Security → sshd jail → expect 192.0.2.99 in banned list within 5s.
3. Click "Unban" on the row → modal opens with title "Unban 192.0.2.99 from sshd".
4. Verify modal contains the inline note: "After unban, fail2ban may re-ban this IP if connection attempts continue with bad credentials. Verify your SSH key is correct first."
5. Verify "Add to ignoreip whitelist" checkbox is UNCHECKED by default.
6. Click "Unban" without checking whitelist. Button greys out for ~5s (W-01 debounce).
7. SSH: `sudo fail2ban-client status sshd | grep "Banned IP list"` → 192.0.2.99 should NOT appear.
8. SSH: `sudo fail2ban-client get sshd ignoreip` → 192.0.2.99 should NOT be in ignore list (because whitelist box was unchecked).
9. Re-ban: `sudo fail2ban-client set sshd banip 192.0.2.100`.
10. UI: Click Unban on .100 → CHECK "Add to ignoreip whitelist" → confirm.
11. SSH: `sudo fail2ban-client get sshd ignoreip` → 192.0.2.100 SHOULD appear.

PASS: Unban removes IP from banned list; whitelist checkbox extends with addignoreip when checked.

## Section 4 — FR-F2B-03 + B-02 + B-03: Manual ban + self-ban gate (4 min)

**Maps to:** FR-F2B-03, ROADMAP §46 success #3, pitfalls B-02 (LOCK ME OUT gate) + B-03 (CIDR rejection)

Sub-test 4a — Normal ban:

1. UI: Security → "Ban an IP" button → modal opens.
2. Type IP `198.51.100.42` (TEST-NET-2 — guaranteed not your real IP). Select jail `sshd`. Confirm.
3. SSH: `sudo fail2ban-client status sshd` → 198.51.100.42 in banned list.
4. Cleanup: `sudo fail2ban-client set sshd unbanip 198.51.100.42`.

Sub-test 4b — Self-ban gate (B-02):

1. SSH and run `who -u` → note your active SSH source IP (e.g. 203.0.113.5).
2. UI: "Ban an IP" → type that exact IP → Confirm.
3. Expect modal Stage 2: "WARNING: 203.0.113.5 is YOUR CURRENT CONNECTION IP." + Input field requiring `LOCK ME OUT`.
4. Type `lock me out` (lowercase) → Confirm button stays disabled (literal-string strict equality).
5. Type `LOCK ME OUT` (exact) → Confirm enabled. Click Confirm. (DO NOT actually confirm — Cancel instead — to avoid actually banning yourself.)

Sub-test 4c — CIDR rejection (B-03):

1. UI: "Ban an IP" → type `0.0.0.0/0` → Confirm.
2. Expect: client-side error "IPv4 dotted-quad only — no CIDR allowed" — mutation does NOT fire (network tab confirms).
3. Type `1.2.3.4/8` → same rejection.

PASS: Normal ban works; self-ban triggers Stage 2 modal; CIDR rejected before mutation fires.

## Section 5 — FR-F2B-04: Audit log immutability (3 min)

**Maps to:** FR-F2B-04, ROADMAP §46 success #4, REUSE of device_audit_log (NO new table)

Steps:

1. UI: Security → Audit Log tab → expect rows from Sections 3+4 (unban, whitelist, ban events).
2. Verify columns: When (relative time), Action (ban/unban/whitelist Badge), Jail, IP, Admin (your username), Result.
3. SSH to Mini PC: `psql -U livos -d livos -c "SELECT device_id, tool_name, params_digest FROM device_audit_log WHERE device_id = 'fail2ban-host' ORDER BY timestamp DESC LIMIT 5"`.
4. Verify rows have `device_id='fail2ban-host'` (sentinel), `tool_name IN ('unban_ip','ban_ip','whitelist_ip')`, `params_digest` is 64-char hex SHA-256.
5. Try to UPDATE: `UPDATE device_audit_log SET tool_name='tampered' WHERE device_id='fail2ban-host'` → expect trigger error (immutability — v22.0 Phase 15 trigger).
6. Verify JSON belt-and-suspenders: `ls -la /opt/livos/data/security-events/ | head -10` → recent JSON files match Section 3+4 events.

PASS: Audit rows present in PG; immutability trigger blocks UPDATE; JSON files written; sentinel device_id correct; NO new table created (verify via `\dt` — only `device_audit_log` exists, no `fail2ban_audit_log`).

## Section 6 — FR-F2B-05 + B-19: Mobile cellular toggle (3 min)

**Maps to:** FR-F2B-05, ROADMAP §46 success #5, pitfall B-19 (CGNAT mismatch)

Steps:

1. Open https://bruce.livinity.io on a phone connected via cellular (4G/5G — NOT WiFi).
2. Login as admin. Open Security section.
3. Verify "I'm on cellular" toggle is visible and OFF by default.
4. Toggle ON.
5. Click "Ban an IP" → type your phone's WiFi router IP (which is NOT your current cellular IP).
6. Confirm — should succeed without Stage 2 self-ban gate (cellular bypass suppressed the check).
7. Cleanup: unban that IP via UI.
8. Toggle cellular OFF → repeat ban with same IP → still no self-ban gate (because the IP doesn't match your CURRENT IP — cellular CGNAT IP).
9. Now type your CURRENT cellular IP (visible via `curl ifconfig.me` from a terminal app on the phone OR check upstream session logs).
10. With cellular OFF, expect Stage 2 self-ban gate. With cellular ON, expect no gate (B-19 bypass suppresses the check).

PASS: Cellular toggle suppresses self-ban detection; non-cellular admin still gets the gate.

## Section 7 — FR-F2B-06: Settings backout toggle (2 min)

**Maps to:** FR-F2B-06, ROADMAP §46 success #7, sub-issue #4 (non-destructive backout)

Steps:

1. UI: Settings → Advanced → find "Security panel" toggle row.
2. Verify toggle is ON by default.
3. Click toggle OFF.
4. Navigate to Server Management → Sidebar → "Security" entry should DISAPPEAR (no auto-redirect — sub-issue #4).
5. Open Network tab — confirm fail2ban itself is NOT uninstalled (`fail2ban` package still on Mini PC; `systemctl status fail2ban` still active).
6. Refresh. Sidebar still hides Security.
7. Toggle back ON. Sidebar entry returns.
8. SSH to Mini PC: `psql -U livos -d livos -c "SELECT * FROM user_preferences WHERE key='security_panel_visible'"` → expect row with bool value matching current state.

PASS: Toggle hides UI; fail2ban still running on Mini PC; preference persisted.

## Section 8 — ROADMAP §46.8 + B-12 + X-04: httpOnlyPaths restart-livinityd-mid-session (5 min)

**Maps to:** ROADMAP §46 success #8, pitfalls B-12 + X-04 (WS hang under reconnect)

Steps:

1. UI: Open Security panel + open browser DevTools Network tab.
2. SSH to Mini PC: `sudo systemctl restart livos`.
3. UI immediately (within 1s): click "Ban an IP" → type a fake IP → Confirm.
4. Watch network tab — POST to `/api/trpc/fail2ban.banIp` should fire (HTTP transport, NOT WS frame).
5. Mutation completes within ~2s of livinityd restart finishing.
6. Repeat with Unban: SSH banip a fake IP, refresh UI, restart livos again, immediately click Unban → mutation completes.

PASS: Both mutations resolve under WS reconnect; HTTP transport visible in network tab (httpOnlyPaths working).

## Section 9 — End-to-End SSH Lockout Recovery (5 min)

**Maps to:** Phase 46's headline value proposition — operator goes from "I'm SSH-locked-out" to "I'm back in" via UI alone.

Steps:

1. (Optional dry-run — skip if you only have one admin account):
2. SSH to Mini PC. Force a self-ban: `sudo fail2ban-client set sshd banip <YOUR-WORK-LAPTOP-IP>` (use a different machine's IP than the one you're connecting from).
3. From the BANNED machine, attempt `ssh bruce@10.69.31.68` → expect connection refused.
4. From your SSH-connected admin device (different IP, NOT banned), open https://bruce.livinity.io.
5. Login as admin. Open Security. Click Unban on the banned IP. CHECK "Add to ignoreip whitelist".
6. From the formerly-banned machine, retry `ssh bruce@10.69.31.68` → expect successful connection.
7. Verify whitelist persists: `sudo fail2ban-client get sshd ignoreip` shows the IP.

PASS: Operator recovered SSH access via UI without console/physical access to Mini PC.

## Closing checklist

- [ ] All 9 sections passed.
- [ ] No regressions in earlier-phase functionality (`test:phase45` chain still green).
- [ ] sacred file `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical (`git diff --shortstat` empty).
- [ ] D-NO-SERVER4 honored throughout — Server4/Server5 NEVER touched.
- [ ] Mark `46-UAT.md` as `Status: COMPLETE` in the header and stamp the run date.

## Deferred from this UAT (not blockers)

- Containerized integration test for fail2ban (W-20 mitigation strategy 2 chosen — UAT is the integration coverage).
- geo-IP / ASN enrichment for SSH viewer (FR-SSH-future-01 — Phase 48 + v30+).
- Bulk unban (FR-F2B-future-01 — anti-feature per research).
