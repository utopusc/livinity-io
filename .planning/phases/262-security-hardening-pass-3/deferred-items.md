# Phase 262 — Deferred Items (out-of-scope discoveries)

## From 262-03 (WS3 sudoers, 2026-06-09)

### 1. test-deploy-livinityd.sh — 7 PRE-EXISTING baseline failures (suite drift)
Present at baseline BEFORE any 262-03 edit (157 PASS / 7 FAIL), unchanged after.
All unrelated to LIVOS-043 — assertions that drifted behind the evolved deploy script:
- `--skip-deploy did not set SKIP_DEPLOY=1` + `default should keep SKIP_DEPLOY=0` (install.sh probe parse)
- `104-09 test-mode-tunnel-args.sh FAILED — D-104-NO-PROD-IMPACT regression` (sibling script)
- `pnpm install MISSING --config.dangerously-allow-all-builds=true`
- `Bug #7: mender-client4 NOT in _dld_install_system_packages body`
- `Bug #10: D-104-NO-PROD-IMPACT broken — _DLD_LIVOS_USER:-root default lost` (stale assertion — UAT 252 G7 DELIBERATELY changed the default to the desktop user; the test still locks the pre-252 invariant)
- `Phase 219 T1: helper missing __LIVOS_REDIS_URL__ / HSET liv:mcp:config ...`
Per scope boundary these were NOT fixed in 262-03. A test-suite reconciliation pass is needed.

### 2. fail2ban-admin/integration.test.ts — pre-existing initDatabase mock failure (this host)
Fails at its FIRST step (`initDatabase with mocked pg.Pool should succeed`, line 127) on the
Windows dev host, at baseline and after 262-03 (identical failure point — never reaches the argv
tests). The 262-03 sudo-prefix argv updates in that file are correct by construction and the same
shapes are fully covered by client.test.ts (14/14 green via tsx). Re-verify integration.test.ts on
a host where the pg mock initializes.

### 3. system/update.ts — "Update LivOS" rides the blanket grant (BREAKS after WS6 removal)
`livos/packages/livinityd/source/modules/system/update.ts:211` runs
`sudo -n bash /opt/livos/update.sh`; the comment at :209 explicitly relies on the 99-bruce
NOPASSWD:ALL drop-in. After the operator removes `/etc/sudoers.d/99-bruce` (WS6), the in-app
update button will fail (`sudo: a password is required`).
**Do NOT naively add a Cmnd_Alias for it**: `/opt/livos/update.sh` is bruce-WRITABLE (UAT 252 G7
chown), so a NOPASSWD grant on it would be blanket-root in disguise (bruce edits the script →
root). Needs a root-owned wrapper (e.g. root:root 0755 `/usr/local/sbin/livos-update` that execs
a vetted copy) + scoped alias — separate plan. The :209 comment is also stale post-262-03.

### 4. Other sudo consumers NOT covered by the scoped fragment — verify on the WS6 walk
`sudo -n -l` as bruce after 99-bruce removal must be checked against ALL livinityd spawn sites:
- `webapps/fluxbox-wm.ts:96` — `sudo -n -u bruce fluxbox ...` → NO LIVINITYD_FLUXBOX alias exists
- `provider/restart-hook.ts:58` — configurable sudoBinary spawn
- `server/terminal-socket.ts:111` — sudo spawn
- Covered: chrome/Xvfb/x11vnc/xdotool/timedatectl (sudoers.d/livinityd), apt paths
  (sudoers.d/livos-native), fail2ban (262-03 LIVINITYD_FAIL2BAN)

### 5. fail2ban-admin/client.ts AUTH_LOG_PATH comment stale
`:41` says "livinityd is root → readable" — false since Phase 192 (runs as bruce);
`/var/log/auth.log` is syslog:adm. `readAuthLogForLastUser` degrades silently to null without
adm group membership. Not sudo-related; cosmetic/feature follow-up.
