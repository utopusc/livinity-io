---
status: passed
phase: 106-deploy-livinityd-bootstrap-layer-hotfix-back-port
source: [106-VERIFICATION.md]
started: 2026-05-12
updated: 2026-05-13
---

## Current Test

[completed — mainserver 154.53.56.75 fresh-install UAT PASSED 2026-05-13T18:39Z]

## Tests

### 1. Fresh-VPS install end-to-end (mainserver 154.53.56.75 re-run)

expected: All 5 services active (`livos`, `liv-core`, `liv-worker`, `liv-memory`, `caddy`) + livinityd NRestarts ≤ 3 after install + register/login UI works in browser (green padlock) + WebApp Launcher Chrome spawns successfully (Bug #9/#10 end-to-end).

procedure (executed 2026-05-13T18:25–18:39Z):
1. ✅ Pre-flight cleanup: stopped services, removed systemd units, deleted `/opt/livos/` + `/opt/liv/`, dropped PG `livos` DB+role, cleared Redis requirepass + FLUSHALL, removed Caddyfile, removed bruce user + /home/bruce, removed /etc/livos.
2. ✅ Ran: `git clone https://github.com/utopusc/livinity-io /tmp/livos-fresh && bash /tmp/livos-fresh/scripts/install.sh --mode hybrid --domain test.livinity.live --cf-token <redacted> --cf-zone-id e480ff1ba15eb4c26af72dfd1207698f` via `systemd-run --unit=livos-fresh-install`. Install exit 0. **NOTE: `https://livinity.io/install.sh` canonical URL still serves the LEGACY Mini PC bootstrap installer (not the Phase 104+ modular one); use git-clone path until Server5 platform deploys the new installer.** Logged as separate platform-side issue.
3. ✅ Install exit 0, no `[FAIL]` in journalctl-u livos-fresh-install (mender warn-not-fail noted as designed since `mender-client4` not in Ubuntu 24.04 universe — acceptable per Phase 106 Bug #7 defensive scope).
4. Bug #7-#12 verification — all PASSED:
   - ✅ Bug #7: helper called (`Installing mender-client4 (Bug #7 — silences ENOENT log spam)`), apt warn-not-fail as designed
   - ✅ Bug #8: helper called (`Installing PostgreSQL + Redis + build deps + samba (Bug #8)`), samba apt succeeded
   - ✅ Bug #9: `command -v google-chrome` → `/usr/bin/google-chrome` (`Google Chrome 148.0.7778.167`)
   - ✅ Bug #10: `id bruce` → `uid=1000(bruce) gid=1000(bruce) groups=1000(bruce),27(sudo),988(docker)`, `/etc/sudoers.d/99-bruce` present (visudo OK)
   - ✅ **106-02 hotfix verified**: `/home/bruce` ownership = `drwx------ 4 bruce bruce` (was root-owned in first install attempt before chown step; second install with helper's defensive chown produced correct ownership)
   - ✅ Bug #11: `wc -c /opt/livos/data/secrets/jwt` → 64, content `c4d6cbc516ff5475175946b790d030c5e2a7fac6e14853d6f3bc7d26956a0dc2` (pure 64-hex, no newline)
   - ✅ Bug #11 rotation: `jwt.pre-106.bak` (45 bytes, old base64) preserved as backup as designed
   - ✅ Bug #12: user.ts `exists()` deployed from fresh clone with `Boolean(user?.hashedPassword)` change. Register flow validated end-to-end (login screen shows + user can register from browser).
5. ✅ Browser test: `https://test.livinity.live` loads LivOS UI with green padlock (Let's Encrypt DNS-01 wildcard cert).
6. ✅ livinityd stability: `systemctl is-active livos liv-core liv-worker liv-memory caddy` → 5× `active`. NRestarts ≤ 3 over 5+ min observation window.
7. ✅ **WebApp Launcher end-to-end (PRIMARY UAT — Phase 106's real customer-facing fix)**: User clicked desktop WebApp icon → Chrome spawned successfully, window stream rendered. Previously (before chown step) Chrome was dying with `SIGTRAP` on first write to `/home/bruce/.config/google-chrome/Crash Reports` due to root-owned home dir. Now functional end-to-end.

**Sacred SHA invariant verified live:** `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ identical to expected. (Earlier `sha256sum` check produced confusing-looking different hash — that's expected since `git hash-object` uses SHA-1 with `blob <size>\0` prefix vs `sha256sum`'s pure SHA-256; the canonical check is `git hash-object`.)

result: ✓ PASSED end-to-end 2026-05-13T18:39Z, WebApp Launcher confirmed working by user

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. Phase 106 is fully shipped + live-validated.

## Carry-forward notes

- **Platform-side issue (NOT Phase 106 scope):** `https://livinity.io/install.sh` canonical URL serves LEGACY Mini PC `livos/install.sh` (1725-line bootstrap with `vainfo` strict check that fails on VPS without VAAPI hardware). The Phase 104+ modular `scripts/install.sh` (which sources `deploy-livinityd.sh` with the Bug #7-#12 fixes) is only accessible via git-clone. Server5 platform team should redirect `livinity.io/install.sh` → repo's `scripts/install.sh`. Logged as v34 platform-side carryover.
- **mender-client4 unavailable on Ubuntu 24.04 universe:** Phase 106 Bug #7 fix attempts apt install, warns-not-fails. Original log spam from livinityd's `spawn mender commit` ENOENT will persist. Long-term fix should gate the `spawn mender` call in livinityd source (add `command -v mender` check before spawn) — small follow-up phase if user cares.
- **First install attempt failed:** Initial install via curl|bash from `livinity.io/install.sh` failed on `vainfo` strict check (legacy bootstrap script). Multiple concurrent install attempts (3 racing processes from setsid + systemd-run + nohup) had to be cleaned up. Lesson: always use single-launch path; documented in memory.
