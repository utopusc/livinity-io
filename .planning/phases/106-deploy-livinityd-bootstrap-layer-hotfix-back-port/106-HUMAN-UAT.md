---
status: partial
phase: 106-deploy-livinityd-bootstrap-layer-hotfix-back-port
source: [106-VERIFICATION.md]
started: 2026-05-12
updated: 2026-05-12
---

## Current Test

[awaiting human testing — mainserver 154.53.56.75 re-install UAT walk]

## Tests

### 1. Fresh-VPS install end-to-end (mainserver 154.53.56.75 re-run)

expected: All 5 services active (`livos`, `liv-core`, `liv-worker`, `liv-memory`, `caddy`) + livinityd NRestarts ≤ 3 after install + register/login UI works in browser (green padlock) + combined static tests 168→174+ PASS already verified in repo (190 PASS achieved)

procedure:
1. Pre-flight cleanup on mainserver: stop+disable services, remove systemd units, delete `/opt/livos/` + `/opt/liv/`, drop PG `livos` DB/role, clear Redis requirepass, remove Caddyfile
2. Run: `bash install.sh --mode hybrid --domain test.livinity.live --cf-token <token> --cf-zone-id <zone>`
3. Confirm install exit 0, no `[FAIL]` in install log
4. Verify Bug #7-#12 resolutions:
   - Bug #7: `journalctl -u livos.service | grep "mender ENOENT"` returns empty (mender-client4 installed)
   - Bug #8: `journalctl -u livos.service | grep "smbpasswd ENOENT"` returns empty (samba installed)
   - Bug #9: `command -v google-chrome` returns non-empty path (chrome installed)
   - Bug #10: `id bruce` returns uid=1000, groups contain `sudo,docker` (user created)
   - Bug #11: `wc -c /opt/livos/data/secrets/jwt` returns 64 (no trailing newline)
   - Bug #12: POST `/api/user/register` first-time succeeds (no "user already exists" false-positive)
5. Browser test: `https://test.livinity.live` loads LivOS UI with green padlock
6. livinityd stability: `systemctl status livos` shows `active (running)` with `NRestarts: ≤ 3` after 5 minutes

result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
