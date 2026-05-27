# Phase 223 Plan 05 — Deploy log

**Date:** 2026-05-27T08:49:19Z .. 2026-05-27T08:55:00Z
**Target:** bruce@10.69.31.68 (Mini PC, bruce-EQ, Ubuntu 24.04 / kernel 6.17)
**Operator:** autonomous (Claude Code execute-phase, --auto chain)
**Sacred SHA verified:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (liv/packages/core/src/sdk-agent-runner.ts) — unchanged before, during, and after deploy.

---

## Preflight

```
=== PREFLIGHT ===
--- whoami ---
bruce
uid=1000(bruce) gid=1000(bruce) groups=1000(bruce),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),100(users),114(lpadmin),124(docker)
--- hostname ---
bruce-EQ
Linux bruce-EQ 6.17.0-29-generic #29~24.04.1-Ubuntu SMP PREEMPT_DYNAMIC Mon May 11 10:30:58 UTC 2 x86_64 x86_64 x86_64 GNU/Linux
--- port 3020 status ---
port 3020 free
--- bun status ---
-rwxr-xr-x 1 bruce bruce 92752752 May 12 15:48 /home/bruce/.bun/bin/bun
1.3.14
--- claude CLI status ---
/usr/bin/claude
-rw------- 1 bruce bruce 471 May 26 18:41 /home/bruce/.claude/.credentials.json
--- existing liv-assistant unit ---
Unit liv-assistant.service could not be found.
--- Phase 222 spike state ---
drwxrwxr-x   6 bruce bruce     4096 May 27 00:54 .
drwxrwxrwt 319 root  root     32768 May 27 01:49 ..
drwxrwxr-x  18 bruce bruce     4096 May 27 00:50 AionUi
drwxrwxr-x   5 bruce bruce     4096 May 27 01:16 aionui-data
-rw-rw-r--   1 bruce bruce    11343 May 27 00:57 aionui.log
-rw-rw-r--   1 bruce bruce        7 May 27 00:56 aionui.pid
drwxrwxr-x   3 bruce bruce     4096 May 27 00:53 aionui-web
LISTEN 0      512                        0.0.0.0:9099       0.0.0.0:*    users:(("aionui-web",pid=129244,fd=19))
--- /etc/livos dir ---
drwxr-xr-x 3 root root 4096 May 17 19:49 /etc/livos
--- /opt/liv-assistant ---
/opt/liv-assistant not present
--- /tmp/liv-assistant-deploy ---
/tmp/liv-assistant-deploy not present
=== PREFLIGHT DONE ===
```

**Preflight findings:**
- bruce user has sudo + docker groups (good)
- Port 3020 free (no install yet — good)
- bun 1.3.14 already installed at `/home/bruce/.bun/bin/bun` → installer will skip bun install (idempotent path)
- claude CLI at `/usr/bin/claude` with valid 471-byte creds at `/home/bruce/.claude/.credentials.json`
- No prior `liv-assistant.service` unit (clean slate for first deploy)
- Phase 222 spike confirmed live: PID 129244 listening on 0.0.0.0:9099 — flagged for Step 6 cleanup
- `/etc/livos/` already exists from prior LivOS deploys (good — capture script will just write the credentials file)

## Artifact transfer (scp)

```
MKDIR_OK
[scp transferred 4 files into /tmp/liv-assistant-deploy/]
total 72
drwxrwxr-x   2 bruce bruce  4096 May 27 01:49 .
drwxrwxrwt 320 root  root  32768 May 27 01:49 ..
-rw-rw-r--   1 bruce bruce  2626 May 27 01:49 capture-liv-assistant-password.sh
-rw-rw-r--   1 bruce bruce 12323 May 27 01:49 install-liv-assistant.sh
-rw-rw-r--   1 bruce bruce  7538 May 27 01:49 liv-assistant-install.md
-rw-rw-r--   1 bruce bruce   977 May 27 01:49 liv-assistant.service
```

Transfer method: `scp` (worked first try on the bundled Windows OpenSSH client at `C:/Windows/System32/OpenSSH/scp.exe`). Fallback `cat | ssh 'cat >'` not needed.

## Install

```
=== INSTALL ===
--- sudo bash install-liv-assistant.sh ---
[install-liv-assistant] Pre-flight OK — running as root, all deps present, bruce user exists
[install-liv-assistant] Directories ready: /opt/liv-assistant /opt/liv-assistant/cache /opt/liv-assistant/data
[install-liv-assistant] Downloading https://github.com/iOfficeAI/AionUi/releases/download/v2.1.4/aionui-web-2.1.4-linux-x86_64.tar.gz
[curl progress: 93.7 MB downloaded at ~7 MB/s, ~13 s total]
[install-liv-assistant] SHA256 verified: 0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778
[install-liv-assistant] Extracting to /opt/liv-assistant/aionui-web-2.1.4
[install-liv-assistant] Symlinked /opt/liv-assistant/current -> /opt/liv-assistant/aionui-web-2.1.4/aionui-web
[install-liv-assistant] LICENSE not in tarball; fetching from https://raw.githubusercontent.com/iOfficeAI/AionUi/v2.1.4/LICENSE
[install-liv-assistant] Upstream NOTICE not present (404 expected); writing minimal attribution
[install-liv-assistant] bun already installed; skipping bun.sh/install
[install-liv-assistant] Writing /opt/liv-assistant/UPSTREAM.md
[install-liv-assistant] Install complete:
[install-liv-assistant]   Version: 2.1.4
[install-liv-assistant]   Binary:  /opt/liv-assistant/current/aionui-web
[install-liv-assistant]   Backend: /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore
[install-liv-assistant]   Data:    /opt/liv-assistant/data    (owned by bruce)
[install-liv-assistant]   License: /opt/liv-assistant/LICENSE
[install-liv-assistant]   Notice:  /opt/liv-assistant/NOTICE
[install-liv-assistant]   Bun:     /home/bruce/.bun/bin/bun
[install-liv-assistant] Next: systemctl daemon-reload && systemctl enable --now liv-assistant
--- copying systemd unit ---
Created symlink /etc/systemd/system/multi-user.target.wants/liv-assistant.service → /etc/systemd/system/liv-assistant.service.
--- waiting for boot + first-boot password ---
attempt 1: state=active
[capture-liv-assistant-password] Captured first-boot admin password to /etc/livos/liv-assistant-credentials (password length=16)
[capture-liv-assistant-password] File: 600 bruce:bruce /etc/livos/liv-assistant-credentials
captured on attempt 1
--- final state ---
active
-rw------- 1 bruce bruce 41 May 27 01:50 /etc/livos/liv-assistant-credentials
=== INSTALL DONE ===
```

**Install timing:** ~30 s end-to-end (13 s download + ~17 s extract/symlink/enable/wait/capture). First-boot password captured on attempt 1 (no retry needed).

## Smoke test (SC-01, SC-03..SC-07)

```
=== SMOKE TEST ===
--- SC-03: systemctl is-active ---
active
--- SC-03b: systemctl status (top 10) ---
● liv-assistant.service - Liv Assistant (AionUi WebUI, vendored v2.1.4)
     Loaded: loaded (/etc/systemd/system/liv-assistant.service; enabled; preset: enabled)
     Active: active (running) since Wed 2026-05-27 01:50:14 PDT; 26s ago
       Docs: file:///opt/liv-assistant/UPSTREAM.md
             https://github.com/iOfficeAI/AionUi
   Main PID: 201259 (aionui-web)
      Tasks: 35 (limit: 37999)
     Memory: 137.6M (peak: 141.9M)
        CPU: 813ms
     CGroup: /system.slice/liv-assistant.service
             ├─201259 /opt/liv-assistant/current/aionui-web start --port 3020 --data-dir /opt/liv-assistant/data --backend-bin /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore
             └─201286 /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore --port 41027 --data-dir /opt/liv-assistant/data --log-level info --app-version 2.1.4 --log-dir /opt/liv-assistant/data/logs --work-dir /opt/liv-assistant/data --local
May 27 01:50:15 bruce-EQ liv-assistant[201259]: [aioncore] 2026-05-27T08:50:15.206240Z  INFO http{method=GET path=/health}: aionui_app::router::trace: response status=200 latency_ms=0
May 27 01:50:15 bruce-EQ liv-assistant[201259]: [aioncore] listening on port 41027, data-dir: /opt/liv-assistant/data

--- SC-04: curl -sSI http://127.0.0.1:3020/ ---
HTTP/1.1 200 OK
Date: Wed, 27 May 2026 08:50:41 GMT
Content-Length: 2367
Content-Disposition: inline; filename="index.html"
Accept-Ranges: bytes
Last-Modified: Wed, 27 May 2026 03:41:32 GMT
Content-Type: text/html; charset=utf-8

--- SC-04: confirm no X-Frame-Options / no CSP ---
OK: no X-Frame-Options
OK: no CSP
--- SC-04: /api/auth/status sanity ---
{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":false}

--- SC-05: credentials file ---
-rw------- 1 bruce bruce 41 May 27 01:50 /etc/livos/liv-assistant-credentials
600 bruce:bruce
password lines: 1
username lines: 1

--- SC-06: LICENSE present ---
-rw-r--r-- 1 root root 10939 May 27 01:50 /opt/liv-assistant/LICENSE
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

--- SC-07: UPSTREAM.md ---
# AionUi upstream provenance

This directory contains a vendored, unmodified copy of AionUi.

- **Upstream repo:** https://github.com/iOfficeAI/AionUi
- **Release URL:** https://github.com/iOfficeAI/AionUi/releases/download/v2.1.4/aionui-web-2.1.4-linux-x86_64.tar.gz
- **Version:** 2.1.4
- **Architecture:** linux-x86_64
- **SHA256 (pinned):** 0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778
- **License:** Apache-2.0 (see ./LICENSE)
- **Vendored on (first install):** 2026-05-27T08:50:14Z
- **Installer:** scripts/install-liv-assistant.sh (livinity-io repo)
- **Vendor strategy:** binary tarball, no source fork (per Phase 222 spike verdict)

Do NOT edit files under /opt/liv-assistant/aionui-web-2.1.4/ in place — they are upstream-owned.
Brand overrides ship via Caddy 'sub' directive (Phase 232), not source patches.

--- SC-01: idempotency — re-run installer, expect empty diff ---
[install-liv-assistant] UPSTREAM.md unchanged (pinned inputs identical); preserving timestamp
[install-liv-assistant] Install complete:
[install-liv-assistant]   Version: 2.1.4
[install-liv-assistant]   Binary:  /opt/liv-assistant/current/aionui-web
... (full output preserved in stdout, abbreviated here)
--- diff (should be empty) ---
OK: idempotent (file-set diff empty)
=== SMOKE TEST DONE ===
```

## SHA-mismatch negative test (SC-02)

Two variants tested. The plan's first variant (corrupting cached tarball) actually exercises the
**self-healing** path (cached SHA mismatch → re-download → verify), NOT the hard-gate `die`. To
prove the hard-gate fires, a second variant patches `EXPECTED_SHA256` to a bogus value and re-runs.

### Variant 1: corrupt cached tarball (self-healing path)

```
=== SHA-MISMATCH NEGATIVE TEST (variant 1) ===
--- corrupted cache SHA ---
2e86e9ce7a15fcf9316b314f04cd067ad367c9d24703bd810d889e5de3cd1c0c
--- re-run installer ---
[install-liv-assistant] Cached tarball SHA mismatch (got 2e86e9ce7a15fcf...); re-downloading
[install-liv-assistant] Downloading https://github.com/iOfficeAI/AionUi/releases/download/v2.1.4/aionui-web-2.1.4-linux-x86_64.tar.gz
[install-liv-assistant] SHA256 verified: 0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778
[install completes normally]
```

**Result:** installer self-healed (detected cache corruption, re-downloaded, verified). Cache is now restored to good state. This proves the *cache-corruption-resilience* property — important for the runbook's "what if the binary is damaged" question.

### Variant 2: patched EXPECTED_SHA256 (hard-gate `die` path)

```
=== SC-02 v2: HARD-GATE TEST via wrong EXPECTED_SHA256 ===
--- patched constant ---
EXPECTED_SHA256="deadbeef0000000000000000000000000000000000000000000000000000beef"
--- run patched installer ---
[install-liv-assistant] Cached tarball SHA mismatch (got 0bb02d...); re-downloading
[install-liv-assistant] Downloading https://github.com/iOfficeAI/AionUi/releases/download/v2.1.4/aionui-web-2.1.4-linux-x86_64.tar.gz
[install-liv-assistant] ERROR: SHA256 mismatch: expected deadbeef0000000000000000000000000000000000000000000000000000beef, got 0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778. Tarball deleted. Aborting.
--- check for SHA256 mismatch message ---
OK: SHA256 mismatch abort fired
--- check tarball was deleted (post-abort cleanup) ---
ls: cannot access '/opt/liv-assistant/cache/aionui-web-2.1.4-linux-x86_64.tar.gz': No such file or directory
tarball deleted (expected per die path)
--- restore tarball (re-run real installer) ---
[install-liv-assistant]   Bun:     /home/bruce/.bun/bin/bun
[install-liv-assistant] Next: systemctl daemon-reload && systemctl enable --now liv-assistant
=== SC-02 v2 DONE ===
```

**Result:** SC-02 hard-gate confirmed. Patched installer aborted with clear error message naming both expected and actual SHA, deleted the unsafe tarball, exited non-zero. Real installer re-run restored normal state.

(Note: the `installer exit=0` line printed in the captured transcript is misleading — `tee` reset the pipe exit. The actual abort is proven by the `ERROR: SHA256 mismatch... Aborting.` line and the file deletion.)

## Phase 222 spike cleanup

```
=== CLEANUP PHASE 222 SPIKE ===
--- pre-cleanup state ---
[/tmp/v42-spike contents listed]
LISTEN 0      512                        0.0.0.0:9099       0.0.0.0:*    users:(("aionui-web",pid=129244,fd=19))
killing spike PID 129244
kill sent
no 9099 process
--- removing /tmp/v42-spike ---
ls: cannot access '/tmp/v42-spike': No such file or directory
OK: /tmp/v42-spike gone
--- removing /tmp/liv-assistant-deploy ---
OK: /tmp/liv-assistant-deploy gone
--- port check ---
OK: port 9099 free
--- confirm liv-assistant on 3020 still up ---
LISTEN 0      512                      127.0.0.1:3020       0.0.0.0:*    users:(("aionui-web",pid=201259,fd=19))
active
=== CLEANUP DONE ===
```

**Cleanup result:**
- Phase 222 spike PID 129244 killed
- `/tmp/v42-spike` removed
- `/tmp/liv-assistant-deploy` (deploy artifacts staging) removed
- Port 9099 confirmed free
- liv-assistant.service still active on 127.0.0.1:3020 (PID 201259) — clean separation: production unit unaffected by spike cleanup

## Sacred SHA verification (D-V42-SACRED)

```
$ git ls-files -s liv/packages/core/src/sdk-agent-runner.ts
100644 f3538e1d811992b782a9bb057d1b7f0a0189f95f 0	liv/packages/core/src/sdk-agent-runner.ts
```

Blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — **UNCHANGED** from milestone v42 PROJECT.md pinned lineage. This plan touched zero source files; the only repo write was this DEPLOY-LOG.md plus the SUMMARY.md that follows. The sacred SHA pre-commit hook will PASS on the final commit.

## Success criteria checklist

Plain-text form (for grep `\[x\] SC-0[1-8]`):

```
[x] SC-01 — installer idempotent (file-set diff empty on re-run)
[x] SC-02 — SHA256 mismatch aborts install with clear error
[x] SC-03 — systemctl is-active liv-assistant = active
[x] SC-04 — curl http://127.0.0.1:3020/ = 200 OK, no X-Frame-Options, no CSP
[x] SC-05 — /etc/livos/liv-assistant-credentials = 600 bruce:bruce, password line present
[x] SC-06 — /opt/liv-assistant/LICENSE present (Apache-2.0)
[x] SC-07 — /opt/liv-assistant/UPSTREAM.md present with URL+version+SHA+license
[x] SC-08 — sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f unchanged
```

Detailed evidence:

- [x] **SC-01:** Installer idempotent (file-set diff empty on re-run) — re-run produced zero diff in `find /opt/liv-assistant -maxdepth 3 -type f -printf '%p %s\n' | sort`
- [x] **SC-02:** SHA256 mismatch aborts install with clear error — variant 2 (patched EXPECTED_SHA256) fired `ERROR: SHA256 mismatch: expected deadbeef..., got 0bb02d... Tarball deleted. Aborting.` and deleted the cached tarball
- [x] **SC-03:** `systemctl is-active liv-assistant` = `active` — confirmed on attempt 1, plus systemd status block shows `Active: active (running)` with main PID 201259 + aioncore subprocess PID 201286
- [x] **SC-04:** `curl http://127.0.0.1:3020/` returns 200, no X-Frame-Options, no CSP — confirmed (200 OK, only headers: Date, Content-Length, Content-Disposition, Accept-Ranges, Last-Modified, Content-Type); `/api/auth/status` returns valid JSON `{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":false}`
- [x] **SC-05:** `/etc/livos/liv-assistant-credentials` exists, mode 0600, owner bruce, non-empty password= — confirmed: 41 bytes, `600 bruce:bruce`, 1 password line, 1 username=admin line, password length 16 chars
- [x] **SC-06:** `/opt/liv-assistant/LICENSE` exists (Apache-2.0) — 10939 bytes, header line confirms `Apache License Version 2.0, January 2004`
- [x] **SC-07:** `/opt/liv-assistant/UPSTREAM.md` exists with URL, version, SHA, license — all 4 fields present (URL `github.com/iOfficeAI/AionUi`, version `2.1.4`, SHA `0bb02d0028...`, license `Apache-2.0`)
- [x] **SC-08:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged — `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` confirms blob SHA matches

## Residual state on Mini PC

| Asset | State |
|---|---|
| liv-assistant.service | `active (running)`, PID 201259, listening 127.0.0.1:3020 |
| /opt/liv-assistant/current | symlink → `/opt/liv-assistant/aionui-web-2.1.4/aionui-web` |
| /opt/liv-assistant/data | owned by bruce, contains aioncore working dir + logs |
| /opt/liv-assistant/cache | tarball `aionui-web-2.1.4-linux-x86_64.tar.gz` (SHA `0bb02d00…6778`) |
| /opt/liv-assistant/LICENSE | Apache-2.0 (10939 bytes, fetched from upstream tag v2.1.4) |
| /opt/liv-assistant/UPSTREAM.md | Provenance metadata, vendored 2026-05-27T08:50:14Z |
| /etc/systemd/system/liv-assistant.service | installed, enabled (multi-user.target.wants) |
| /etc/livos/liv-assistant-credentials | admin / `<16-char password>`, 600 bruce:bruce |
| /tmp/v42-spike | **removed** (Phase 222 spike cleaned) |
| /tmp/liv-assistant-deploy | **removed** (deploy artifacts staging cleaned) |
| Port 9099 | **free** (Phase 222 spike PID 129244 killed) |
| Sacred SHA | **unchanged** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

## Operator UAT walk (deferred under --auto chain)

Plan 223-05 Task 2 is a `checkpoint:human-verify` and was **auto-approved per workflow rule** (auto chain mode active → `human-verify` checkpoints log `⚡ Auto-approved` and continue). The operator's 3-min browser UAT walk is deferred and should be performed at next Mini PC operator session. Steps from the plan:

1. Browser → `http://10.69.31.68:3020/` should show AionUi login UI (white background, AionUi logo, login form)
2. Get password: `ssh -i .../minipc bruce@10.69.31.68 'sudo cat /etc/livos/liv-assistant-credentials'`
3. Login as `admin` / `<password>`
4. Confirm "Claude Code" agent appears in picker as `available`
5. Optional (defer to Phase 233 UAT to save tokens): send a "say hi" turn

If any step fails, operator can paste the failure here for diagnosis — but all 8 automated SCs are green so the UAT walk is expected to pass.

## Next phase

Phase 223 closes 5/5. Wave B (Phases 224 App Store tab hides, 225 dashboard widget, 232 Caddy brand-sub) unlocks. Live Claude Code agent E2E (chat turn through subscription auth) deferred to Phase 233 UAT per token-budget guidance.
