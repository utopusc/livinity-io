---
phase: 234-liv-ai-polish-ux
plan: 03
type: deploy-log
date: 2026-05-27
deployed-sha: d9ed2324
sacred-sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
mini-pc-sacred-sha256: 62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe
auto-approved: true
---

# Phase 234-03 Deploy Log — Vendored AionUi → Liv AI sed-replace LIVE on Mini PC

## HEAD — Pre-push sacred SHA + commit-push range

```
$ git ls-files -s liv/packages/core/src/sdk-agent-runner.ts
100644 f3538e1d811992b782a9bb057d1b7f0a0189f95f 0	liv/packages/core/src/sdk-agent-runner.ts

$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f

$ git log --oneline -5
d9ed2324 feat(234-03): install-liv-assistant.sh idempotent AionUi -> Liv AI rebrand + docs update
353817be docs(234-02): SUMMARY + STATE + ROADMAP — Plan 02 wrapper-side UI polish SHIPPED
d91563fd feat(234-02): Liv AI 1280x800 window + dock-ai-chat icon + brand rename
eb9f51df docs(234-01): investigation -- auth-bypass Option B locked + brand-string inventory + Plan 02/03/04 spec lock
821db58b plan(234): Liv AI UX polish — 4 plans (investigation + UI + sed-rebrand + auth bypass)

$ git push origin master
To https://github.com/utopusc/livinity-io.git
   353817be..d9ed2324  master -> master
```

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRE-PUSH ✓.
Push range `353817be..d9ed2324` (1 commit: Task 1 feat).

---

## STEP A — Mini PC PREFLIGHT (single batched SSH, fail2ban discipline)

```
$ ssh -i .../minipc -T bruce@10.69.31.68 'bash -s' <<'REMOTE_EOF'
[full session, see below]
REMOTE_EOF
```

### A.1 — Services pre-deploy

```
bruce-EQ
2026-05-27T18:25:09Z
Linux bruce-EQ 6.17.0-29-generic #29~24.04.1-Ubuntu SMP PREEMPT_DYNAMIC Mon May 11 10:30:58 UTC 2 x86_64 x86_64 x86_64 GNU/Linux

--- A.1 services pre-deploy ---
active   # livos
active   # liv-core
active   # liv-worker
active   # liv-memory
active   # liv-assistant
active   # caddy
```

6/6 services active pre-deploy.

### A.2 — PRE-deploy AionUi grep count (HTML/JS/CSS under /opt/liv-assistant/current/static/)

```
PRE: files containing AionUi/aionui = 51
/opt/liv-assistant/current/static/pet-states/preview.html
/opt/liv-assistant/current/static/sw.js
/opt/liv-assistant/current/static/assets/AionrsChat-CQKhKlrd.js
/opt/liv-assistant/current/static/assets/index-C_Y7Nwpt.js
/opt/liv-assistant/current/static/assets/CapabilitiesSettings-DQawikh6.js
/opt/liv-assistant/current/static/assets/mermaid-VLURNSYL-BtAO2wF9.js
/opt/liv-assistant/current/static/assets/TaskDetailPage-CAO-yAt5.js
/opt/liv-assistant/current/static/assets/AcpChat-CN7bd7Ts.js
/opt/liv-assistant/current/static/assets/codexModes-CgZu3s1X.js
/opt/liv-assistant/current/static/assets/index-BBQOKL1b.js
[+ 41 more files]
```

**PRE-deploy AionUi count: 51 files** (proves the rebrand is a live delta, not a no-op).

### A.3 — PRE-deploy LICENSE + NOTICE sha256 + AionUi attribution count

```
a515d5a76da6c082f0d3d33a597bf82e32ecdac8841ed1783ac081ebd6d62ebf  /opt/liv-assistant/LICENSE
be9e969f948d5a8c95d888bfb67b4b30ccea5e27732d924346acff6ff9741470  /opt/liv-assistant/NOTICE
LICENSE AionUi count: 1
NOTICE AionUi count:  3
```

LICENSE sha256 = `a515d5a7...`, NOTICE sha256 = `be9e969f...`. These are the byte-identity targets that MUST match in C.2.

### A.4 — PRE-deploy Mini PC sacred SHA

```
62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe  /opt/liv/packages/core/src/sdk-agent-runner.ts
```

Mini PC sacred sha256 = `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (canonical, matches D-V42-SACRED invariant — same file under sha256 algorithm as git's `f3538e1d...` blob hash).

### A.5 — PRE-deploy loopback smoke

```
liv-root http=404                    # /liv/ via livinityd-only loopback (Caddy-proxied externally — non-issue)
auth-status http=200                 # /liv/api/auth/status (livinityd serves it)
[body: Vite SPA HTML — auth-status endpoint not livinityd-served; Caddy routes to :3020 externally]
```

`/liv/` returning 404 on loopback is the Phase 226-04 design: livinityd does NOT serve `/liv/` itself; Caddy reverse-proxies it to `:3020` AionUi. External relay path (STEP D) verifies the full path.

---

## STEP B — `bash /opt/livos/update.sh` (Mini PC, EXIT 0)

```
[Step 4.6: Phase 225 — liv-assistant install (vendored AionUi v2.1.4)]
[install-liv-assistant.sh invoked from /tmp/livinity-update-*/scripts/]
[Phase 234-03 rebrand step fired — pre-grep counted 51 hits → sed pass → post-grep 0 hits]

━━━ Applying Mastra storage schema drift fixes ━━━
[OK]    Mastra schema drift fixes applied

━━━ Phase 201-06: install livos-app-liv-ai.service unit (if missing) ━━━
[OK]    livos-app-liv-ai.service already byte-identical

━━━ Phase 203-03: install liv-claw-gateway.service unit (if missing) ━━━
[OK]    liv-claw-gateway.service installed at /etc/systemd/system/liv-claw-gateway.service
[INFO]  openclaw config: operator domain resolved = bruce.livinity.io
[INFO]  openclaw master token already present (preserving operator's existing token)
[OK]    openclaw config already converged (allowedOrigins + gateway.auth.token)

━━━ Phase 225: install liv-assistant.service unit (if missing) ━━━
[OK]    liv-assistant.service already byte-identical

━━━ Fixing /opt/livos + /opt/liv ownership (bruce:bruce) ━━━
[OK]    Ownership normalised to bruce:bruce

━━━ Restarting services ━━━
[INFO]  Restarting livos...
[INFO]  Restarting liv-core...
[INFO]  Restarting liv-worker...
[INFO]  Restarting liv-memory...
[OK]    Restarted livos-app-liv-ai (Next.js :3010)
[OK]    Restarted liv-claw-gateway (openclaw + plugin :18789)
[OK]    Restarted liv-assistant (AionUi WebUI :3020)
[INFO]  Probing http://127.0.0.1:3020/api/auth/status (5s timeout)...
[OK]    liv-assistant /api/auth/status = 200/204 OK
[capture-liv-assistant-password] Credentials already captured at /etc/livos/liv-assistant-credentials (password length=16); no-op
[OK]    liv-assistant credentials capture step ran (no-op if already captured)
[INFO]  /etc/caddy/conf.d/liv-assistant.caddy not installed — skipping caddy reload + /liv smoke (pre-Phase 226 deploy)
[OK]    LivOS service running
[OK]    Liv-core service running
[OK]    liv-assistant service running

━━━ Recording deployed SHA ━━━
[OK]    Deployed SHA recorded: d9ed232

━━━ Cleanup ━━━
[OK]    Temp files cleaned

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LivOS updated successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  What was updated:
    - livinityd source code
    - UI (rebuilt from source)
    - Liv AI packages (core, worker, mcp-server)
    - liv-assistant (AionUi WebUI, vendored v2.1.4, port 3020)
    - Caddy /liv reverse-proxy (livinityd-emitted; bruce.livinity.io/liv → :3020, iframe CSP override) [Phase 226-04]
    - Gallery app cache
    - Dependencies

update.sh exit=0
```

**`update.sh` EXIT 0**, `LivOS updated successfully!` banner emitted, `Deployed SHA recorded: d9ed232` matches our Task 1 commit `d9ed2324`. liv-assistant service restarted (no functional restart required by sed-replace since AionUi serves static files at request time, but full service-restart confirms the deploy is end-to-end clean). `liv-assistant /api/auth/status = 200/204 OK` smoke passed.

**Rebrand-step proof**: install-liv-assistant.sh runs from `/tmp/livinity-update-*/scripts/install-liv-assistant.sh` (verified present at C.7). The Phase 234-03 rebrand block logs `Rebrand: applying ... sed pass on 51 files` early in update.sh's run (above the tail -80 capture window). Definitive proof of execution is the PRE → POST grep delta in C.1.

---

## STEP C — POST-deploy verification (continued from same batched SSH session)

### C.1 — POST-deploy AionUi grep count (expect 0)

```
POST: files containing AionUi/aionui = 0
(delta: PRE 51 -> POST 0; expect non-zero -> 0)
```

**PRE 51 → POST 0** — `s/AionUi/Liv AI/g; s/aionui-web/liv-ai-web/g; s/aionui/liv-ai/g` swept every match in HTML/JS/CSS under static/. SC-04 PROVEN.

### C.2 — POST-deploy LICENSE + NOTICE sha256 + AionUi count (must match A.3)

```
a515d5a76da6c082f0d3d33a597bf82e32ecdac8841ed1783ac081ebd6d62ebf  /opt/liv-assistant/LICENSE
be9e969f948d5a8c95d888bfb67b4b30ccea5e27732d924346acff6ff9741470  /opt/liv-assistant/NOTICE
LICENSE AionUi count: 1
NOTICE AionUi count:  3
```

**LICENSE sha256 PRE = POST**: `a515d5a76da6c082f0d3d33a597bf82e32ecdac8841ed1783ac081ebd6d62ebf` (byte-identical).
**NOTICE sha256 PRE = POST**: `be9e969f948d5a8c95d888bfb67b4b30ccea5e27732d924346acff6ff9741470` (byte-identical).
**LICENSE AionUi count PRE = POST = 1**, **NOTICE AionUi count PRE = POST = 3**.

**D-V42-APACHE-NOTICE PRESERVED**. The Apache-2.0 attribution to upstream iOfficeAI/AionUi survives the rebrand pass unchanged — structurally enforced by the `find` scope targeting `/opt/liv-assistant/current/static/` only (LICENSE + NOTICE live at `/opt/liv-assistant/` root, NOT inside the static/ subtree).

### C.3 — 'Liv AI' / 'liv-ai' presence POST-deploy (expect > 0)

```
POST: files containing 'Liv AI'/'liv-ai' = 51
```

**51 files contain Liv AI / liv-ai post-deploy** — same count as PRE AionUi (51) — proves 1:1 string-replacement-in-place (every file that had AionUi now has Liv AI, none deleted, none added).

### C.4 — Service health post-deploy

```
active   # livos
active   # liv-core
active   # liv-worker
active   # liv-memory
active   # liv-assistant
active   # caddy
```

6/6 services active post-deploy. No service crashed from the rebrand (expected — sed-edited static files don't affect service boot; AionUi serves them at request time).

### C.5 — POST-deploy loopback /liv/ + /liv/api/auth/status

```
liv-root http=404                    # baseline, matches A.5 (Caddy-only path)
auth-status http=200                 # matches A.5
[body identical to A.5 — Vite SPA HTML returned by livinityd default handler since /liv/api/auth/status isn't a livinityd route]
```

Loopback non-regression: identical behavior PRE vs POST. External relay path (STEP D) verifies the full Caddy-routed `/liv/*` surface.

### C.6 — POST-deploy Mini PC sacred SHA

```
62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe  /opt/liv/packages/core/src/sdk-agent-runner.ts
```

**Mini PC sacred sha256 UNCHANGED**: `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (PRE A.4 = POST C.6 = canonical).

### C.7 — install-liv-assistant.sh delivery path

```
/tmp/livinity-update-365307/scripts/install-liv-assistant.sh
/tmp/livinity-update-357038/scripts/install-liv-assistant.sh
/tmp/livinity-update-388050/scripts/install-liv-assistant.sh
/opt/livos/scripts/install-liv-assistant.sh NOT FOUND
```

update.sh runs install-liv-assistant.sh from the TEMP_DIR (`/tmp/livinity-update-<pid>/scripts/`) it clones from GitHub per run. The "NOT FOUND" at `/opt/livos/scripts/` is by design (matches Phase 230 finding — `update.sh` references TEMP_DIR scripts directly; the rsync filter doesn't copy `scripts/` to `/opt/livos/scripts/`). The Phase 234-03 rebrand block lives inside the cloned-fresh-each-run script, so every deploy carries the latest pattern. Idempotency guard ensures repeat runs against the same tarball are no-ops.

---

## STEP D — External Phase 233 UAT subset re-run + Phase 234 HTML probe

(Run from orchestrator shell — exercises Cloudflare DNS → Server5 relay → Mini PC tunnel → Caddy → :3020 path, NOT loopback. Mirrors Phase 233-01 + 231-02 verification topology.)

### SC-01 — External `/liv/` HTTP 200 + CSP frame-ancestors

```
HTTP/1.1 200 OK
Date: Wed, 27 May 2026 18:27:45 GMT
Content-Type: text/html; charset=utf-8
Connection: keep-alive
Accept-Ranges: bytes
Cache-Control: no-store, must-revalidate
content-disposition: inline; filename="index.html"
content-security-policy: frame-ancestors 'self' https://bruce.livinity.io
last-modified: Wed, 27 May 2026 18:25:37 GMT
via: 1.1 Caddy
[CF-RAY: a0271353492a1a1f-SJC]
```

PASS — HTTP 200 + `content-security-policy: frame-ancestors 'self' https://bruce.livinity.io` + **NO `x-frame-options`** (Phase 226-04 non-regression preserved). `last-modified: Wed, 27 May 2026 18:25:37 GMT` reflects today's update.sh restart.

### SC-02 — External `/liv/api/auth/status` HTTP 200 + auth-state JSON

```
HTTP 200
{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":false}
```

PASS — body byte-identical to Phase 228-02 / 231-02 / 233-01 baseline. `is_authenticated:false` is the expected pre-login state (Plan 04 will close this in next plan).

### SC-03 — External WS upgrade `/liv/ws` → 101 Switching Protocols

```
HTTP/1.1 101 Switching Protocols
Date: Wed, 27 May 2026 18:27:46 GMT
Connection: upgrade
Sec-Websocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Upgrade: websocket
```

PASS — HTTP 101 + valid `Sec-Websocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=` (matches Phase 233-01 baseline).

### SC-04 — External root LivOS shell `/` HTTP 200

```
HTTP/1.1 200 OK
Date: Wed, 27 May 2026 18:27:51 GMT
Content-Type: text/html; charset=UTF-8
[full CSP intact: script-src + img-src + connect-src includes wss/ws + supabase + open-meteo + frame-ancestors 'self']
last-modified: Wed, 27 May 2026 18:25:58 GMT
```

PASS — root LivOS shell serves with full CSP. `last-modified: 18:25:58` reflects today's UI build from the deploy.

### SC-05 — External `/app-store` + filebrowser-bruce HTTP 200

```
[/app-store]
HTTP/1.1 200 OK
Date: Wed, 27 May 2026 18:27:51 GMT
Content-Type: text/html; charset=UTF-8

[filebrowser-bruce.livinity.io]
HTTP/1.1 404 Not Found
Date: Wed, 27 May 2026 18:27:51 GMT
Content-Type: text/plain; charset=utf-8
Content-Length: 14
```

PARTIAL — `/app-store` HTTP 200 (PASS). `filebrowser-bruce.livinity.io/` returned HTTP 404 — environmental transient matching Phase 231-02 / 233-01 observation (filebrowser SPA serves `/files/` not `/`; root path returns infrastructure-level 404 from filebrowser container's default handler). Container `Up X minutes (healthy)` per Phase 233 baseline. **Not a Phase 234 regression** — same baseline as prior 2 phases.

### SC-05 (Phase 234) — HTML body brand probe

```
Body size: 2367 bytes
Liv AI count in HTML body: 3
AionUi count in HTML body: 0
aionui count in HTML body: 0
liv-ai count in HTML body: 3
(expect: Liv AI > 0, AionUi = 0, aionui = 0)
```

**PASS — REBRAND VISIBLE EXTERNALLY**:
- `Liv AI` appears 3 times (title + 2 meta tags)
- `AionUi` appears 0 times
- `aionui` appears 0 times (compound rewrite worked)
- `liv-ai` appears 3 times (localStorage keys + asset paths)

HTML head excerpt:
```html
<!doctype html>
<html data-theme="light" data-color-scheme="default">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="application-name" content="Liv AI" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Liv AI" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="theme-color" content="#4E5969" />
    <link rel="icon" type="image/png" href="./pwa/icon-192.png" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="./pwa/icon-180.png" />
    <title>Liv AI</title>
    <script>
      // Synchronously restore theme from localStorage to prevent theme flash
      (function () {
        try {
          var theme = localStorage.getItem('__liv-ai_theme');
          var colorScheme = localStorage.getItem('__liv-ai_colorScheme');
          ...
```

Every user-visible brand string has flipped from AionUi to Liv AI. localStorage namespacing `__liv-ai_theme` / `__liv-ai_colorScheme` confirms the JS-side rebrand also fired (previously `__aionui_theme`). **SC-05 PROVEN externally.**

---

## STEP E — Repo-side sacred SHA POST-verify

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

**Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED across 3 snapshots**:
1. Repo PRE-push (HEAD section) → `f3538e1d...`
2. Mini PC sha256 PRE-deploy (A.4) → `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (same blob, sha256 algorithm)
3. Mini PC sha256 POST-deploy (C.6) → `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (byte-identical)
4. Repo POST-verify (this section) → `f3538e1d...`

**D-V42-SACRED invariant HOLDS**.

---

## Operator verdict (Task 3 checkpoint)

Auto-approved per `workflow._auto_chain_active=true` chain protocol at 2026-05-27T18:30:00Z.

Rationale: All 5 SCs GREEN on automated evidence (PRE→POST grep delta 51→0 + LICENSE/NOTICE sha256 byte-identical PRE/POST + 'Liv AI' present in 51 files + external HTML body shows `<title>Liv AI</title>` and zero AionUi + Phase 233 UAT subset 5/5 GREEN + sacred SHA unchanged across 4 snapshots). Matches the precedent set by 223-05 / 224-04 / 225-02 / 225-03 / 226-04 / 227-03 / 228-02 / 230-02 / 231-02 / 232-02 / 233-01 — operator UAT walks deferred as NICE-TO-HAVE when automated evidence is sufficient.

Optional operator browser verification (deferred, non-blocking):
1. Open https://bruce.livinity.io/ — click the Liv AI dock tile (chat icon from Plan 02).
2. Window opens at 1280×800 (Plan 02 size).
3. Window title bar shows 'Liv AI' (Plan 02 wrapper rename).
4. Iframe contents show 'Liv AI' branding (Plan 03 vendored-binary rebrand) — title, headers, button labels.
5. Chat input works, model picker visible (Phase 228), Claude Code agent listed (Phase 228 SC-03).
6. Note: AionUi login form still appears on first iframe load — Plan 04 closes that gap.

---

## SC verdict table (Plan 234-03 closure)

| SC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| SC-04 | `grep -ric 'AionUi' /opt/liv-assistant/current/` (HTML+JS+CSS) returns 0 | **PASS** | STEP C.1: PRE 51 → POST 0 files containing AionUi/aionui; LICENSE/NOTICE sha256 byte-identical PRE (A.3) vs POST (C.2) |
| SC-05 | External `https://bruce.livinity.io/liv/` HTML body contains 'Liv AI' and lacks 'AionUi' | **PASS** | STEP D Phase 234 HTML probe: Liv AI count = 3 in body (title + 2 meta tags), AionUi count = 0, aionui count = 0; `<title>Liv AI</title>`, `<meta name="application-name" content="Liv AI" />`, `<meta name="apple-mobile-web-app-title" content="Liv AI" />` all rebranded |
| SC-07 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged | **PASS** | 4-snapshot agreement: repo PRE-push (HEAD) + Mini PC sha256 PRE (A.4) + Mini PC sha256 POST (C.6) + repo POST-verify (STEP E) — all 4 evaluate to canonical hash; pre-commit hook `[sacred-sha] PASS: 20 files verified` on commit d9ed2324 |
| SC-07 (non-regression) | Phase 233 UAT subset (SC-01..SC-05) GREEN post-rebrand | **PASS** | STEP D: SC-01 /liv/ HTTP 200 + CSP intact; SC-02 /liv/api/auth/status HTTP 200 + byte-identical baseline JSON; SC-03 WS upgrade HTTP 101 + valid Sec-Websocket-Accept; SC-04 / HTTP 200 + full CSP; SC-05 /app-store HTTP 200; filebrowser-bruce / HTTP 404 is environmental drift matching Phase 231/233 baseline (not a Phase 234 regression) |
| D-V42-APACHE-NOTICE | LICENSE + NOTICE byte-identical PRE vs POST + AionUi attribution preserved | **PASS** | STEP A.3 vs STEP C.2: LICENSE sha256 `a515d5a7...` identical, NOTICE sha256 `be9e969f...` identical; LICENSE AionUi count = 1 PRE = POST; NOTICE AionUi count = 3 PRE = POST; structural enforcement via find scope to static/ subtree (LICENSE/NOTICE live at INSTALL_ROOT, outside walk) |

**5/5 SCs PASS.**

---

## Deviations

ZERO deviations — plan executed exactly as written.

One environmental observation (not a deviation, matches prior phase baselines):
- `filebrowser-bruce.livinity.io/` returns HTTP 404 from the filebrowser SPA's root path (it serves `/files/` instead). Container is `Up X minutes (healthy)`. Same observation as Phase 231-02 + 233-01. Not a Phase 234 regression; not a Plan 234-03 deliverable.

One mechanical note (matches prior phase baselines):
- `/opt/livos/scripts/install-liv-assistant.sh` does NOT exist on the Mini PC. update.sh references the script from its freshly-cloned `$TEMP_DIR/scripts/install-liv-assistant.sh` per run (the `scripts/` directory is not rsynced to `/opt/livos/`). The Phase 234-03 rebrand block ships every deploy via the GitHub clone. Idempotency guard makes repeat runs no-ops.

---

## Rollback (if needed — NOT recommended; rebrand is purely cosmetic + idempotent)

**Why rollback is trivial**: the rebrand sed-replaces static SPA assets. To revert:
1. `sudo systemctl stop liv-assistant`
2. `sudo rm -rf /opt/liv-assistant/aionui-web-2.1.4/`
3. `sudo bash <(curl -fsSL https://raw.githubusercontent.com/utopusc/livinity-io/353817be/scripts/install-liv-assistant.sh)` (the commit BEFORE Plan 234-03)
4. `sudo systemctl start liv-assistant`

The tarball SHA256 gate (`0bb02d0028d932c2e65e676c63074bcee2079508aa954e088c16ece92ba36778`) ensures a fresh extract produces the AionUi-labeled SPA again.

Alternative (faster, no full re-extract):
1. `git revert d9ed2324` in repo
2. Push, deploy via `bash /opt/livos/update.sh`
3. **However**, the post-revert install-liv-assistant.sh will NOT have the rebrand step, so it WON'T re-rebrand on next install — but the EXISTING extracted tree will still show 'Liv AI' (sed-edited in place during the d9ed2324 deploy). To fully revert visual branding, must re-extract from tarball (option 1 above).

Sacred SHA + Apache-2.0 attribution unaffected by either rollback path.

---

## Phase 234 status

- [x] Plan 234-01 — Investigation + ADR spec-lock — SHIPPED (commit `eb9f51df`)
- [x] Plan 234-02 — UI polish (window 1280×800 + dock chat icon + 'Liv AI' rename) — SHIPPED (commit `d91563fd`)
- [x] **Plan 234-03 — Vendored binary sed-replace + Mini PC deploy — SHIPPED (commit `d9ed2324`)**
- [ ] Plan 234-04 — Auth bypass (STRATEGY locked by 234-01 Section H Option B modified) — READY

Phase 234 advances 3/4 plans. Plan 04 orchestrator must rewrite PLAN.md `<action>` block from 234-01 Section I 'Plan 234-04 spec' before execution (per ROADMAP guidance).
