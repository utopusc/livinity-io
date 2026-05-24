---
phase: 203-liv-ai-openclaw-os
hotfix: 205-plugin-load
parent_issue: "Phase 203 § G.2 — Liv AI claw-plugin not loaded"
status: RESOLVED — Fix-A + Fix-B + Fix-C all SHIPPED 2026-05-24
created: 2026-05-24
last_updated: 2026-05-24 (Fix-C addendum)
fix_a_commit: 26444ce0
fix_b_commit: f69525cd
fix_c_commit_1: 08511784
fix_c_commit_2: 2b2c9f73
deployed_sha: 2b2c9f73
deploy_date: 2026-05-23 20:09 PDT (Fix-C Caddy live-patch on Mini PC)
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
---

# Phase 203 Hot-fix: Liv AI claw-plugin load gap — Fix-A (symlink scanner)

> **TL;DR:** Hot-fix Fix-A (this commit) UNBLOCKED openclaw's install-time
> security scanner; the plugin now appears in `installs.json` and in the
> gateway boot line ("8 plugins" vs prior "7 plugins"). HOWEVER two distinct
> downstream issues remain (Fix-B and Fix-C) that prevent the plugin's tools
> from registering AND its workspace UI from serving via Caddy. § G.2 is
> NOT yet fully RESOLVED — moved to PARTIAL with two carry-over sub-items.

## Context — what was broken before this hot-fix

Phase 203 § G.2 reported that the previous deploy (`ff61210901a68f40f12379987b2af4e091ff9c37`) had the openclaw gateway booting with only the **7 stock plugins** (browser, canvas, device-pair, file-transfer, memory-core, phone-control, talk-voice) — the Liv AI `openclaw-os-plugin` was absent. Plan 203-13 commit `eedde743` attempted to fix this by copying `openclaw.plugin.json` into `dist/` + pointing the gateway at the package root.

After that fix was deployed via routine `update.sh`, the plugin STILL didn't load. Live journal from this hot-fix's investigation surfaced the actual root cause:

```
Plugin "openclaw-os-plugin" installation blocked: code safety scan failed
(Error: manifest dependency scan found node_modules symlink target outside
install root at node_modules/esbuild)
```

openclaw 2026.5.20's install-time security scanner traverses `node_modules/*` looking for symlinks. The plugin's `claw-plugin/node_modules/` is populated by pnpm during workspace install with symlinks for **devDependencies** (esbuild, openclaw, shx, typescript, vitest) pointing OUTSIDE the install root via pnpm's content-addressed store:

```
claw-plugin/node_modules/esbuild → ../../../../../node_modules/.pnpm/esbuild@0.25.12/.../esbuild
```

openclaw's policy: refuse to register any plugin whose `node_modules/*` symlinks escape the install root. This is the byte-deterministic block — independent of the manifest fix from `eedde743`.

## Fix-A — strip plugin node_modules + improve install logging (THIS COMMIT)

**File:** `livos/packages/liv-claw-gateway/start.js` (`ensurePluginInstalled()`)

Two changes inside the existing install step:

1. **Strip the plugin's `node_modules` before install.** The plugin is pre-built (`dist/index.js` is bundled by esbuild during the package build); at runtime openclaw needs zero devDependencies. We `fs.rmSync(pluginBundle/node_modules, { recursive: true, force: true })` so the scanner's symlink traversal trivially passes. Idempotent — pnpm regenerates the directory on the next workspace install if a builder needs it, and we re-strip on every gateway boot anyway.

2. **Fix the misleading "already linked; continuing" misclassification.** The original code treated EVERY non-zero exit as "already installed" and continued silently. That mask hid the scan failure for the entire Phase 203 deploy cycle. Replacement:
   - Switch `stdio` from `'inherit'` to `['inherit', 'inherit', 'pipe']` so we can capture stderr.
   - On non-zero exit, mirror stderr to the journal (so the operator sees it).
   - Only treat the SPECIFIC marker `already installed` / `already linked` as tolerable; surface real failures with exit code + first 1KB of stderr.
   - Still don't throw — gateway boots in degraded mode (only stock plugins) so `/health` stays up.

## Live verification on Mini PC (post-deploy)

Deployed via `sudo bash /opt/livos/update.sh` at Mini PC time ~19:17 PDT 2026-05-23 (update.sh recorded `Deployed SHA: 26444ce`).

### What's fixed (Fix-A success)

```
$ sudo cat /opt/livos/data/openclaw/plugins/installs.json | jq .installRecords
{
  "openclaw-os-plugin": {
    "source": "path",
    "sourcePath": "/opt/livos/packages/liv-claw-os/packages/claw-plugin",
    "installPath": "/opt/livos/packages/liv-claw-os/packages/claw-plugin",
    "version": "0.1.5",
    "installedAt": "2026-05-24T02:17:23.259Z"
  }
}
```

```
$ sudo journalctl -u liv-claw-gateway | grep 'http server listening'
[gateway] http server listening (8 plugins: browser, canvas, device-pair,
  file-transfer, memory-core, openclaw-os-plugin, phone-control, talk-voice;
  3.6s)
```

`8 plugins` vs prior `7 plugins`. Plugin registration is unblocked. Zero "scan failed" lines in the post-hotfix journal.

### What's NOT fixed (Fix-B + Fix-C — downstream)

Two distinct issues remain visible in the post-hotfix journal:

**Fix-B — Manifest `contracts.tools` doesn't enumerate runtime tools.** The plugin code registers ~20 tools (9 `luse_*` proxies + 11 built-in: weather, get_current_time, ui_render, app_create, etc.) but `openclaw.plugin.json` only declares 9 tools (artifact CRUD + db_query/execute + app_create/get/update). openclaw rejects every undeclared registration:

```
[gateway] [plugins] plugin must declare contracts.tools for: luse_computer_screenshot
[gateway] [plugins] plugin must declare contracts.tools for: weather
... (×20+)
```

Result: the plugin appears in `installs.json` and the boot line, but NO tools are actually callable by chat sessions. Fix path: append every tool name from `claw-plugin/src/plugin.ts` registration to `openclaw.plugin.json`'s `contracts.tools[]`.

**Fix-C — Workspace UI mount isn't reachable.** The plugin emits the log line:

```
[plugins] [openclaw-os-plugin] workspace UI mounted at http://127.0.0.1:18789/plugins/openclawos/
```

But both:

| URL                                                              | status                                  |
|------------------------------------------------------------------|-----------------------------------------|
| `GET http://127.0.0.1:18789/plugins/openclawos`                  | 404 Not Found (text/plain)              |
| `GET http://127.0.0.1:18789/plugins/openclawos/`                 | 404 Not Found (text/plain)              |
| `GET http://127.0.0.1/liv-ai-app/openclawos/` (via Caddy)        | 200 — BUT serves stock `<title>OpenClaw Control</title>` |

The Caddy `handle /liv-ai-app/*` rewrite strips the prefix to `/openclawos/`, which the openclaw gateway resolves to ITS OWN stock root (because the plugin's actual UI route at `/plugins/openclawos/` 404s). The plugin's `mount()` call is firing but not being honoured by openclaw's router — likely tied to the same `contracts.tools` rejection cascade (openclaw may be aborting plugin activation post-register-fail, even though `installs.json` shows it registered).

Fix paths (need investigation):
1. **Fix-B first** — once tools register correctly, openclaw may complete plugin activation including UI mount.
2. If still 404 after Fix-B: investigate whether the plugin needs `contracts.uiRoutes` or a similar manifest declaration to mount at `/plugins/<id>/`.
3. Alternatively rewrite Caddy `/liv-ai-app/openclawos/*` → `/plugins/openclawos/*` (NOT `/openclawos/*`).

## Operator-visible state after this hot-fix

| Check                                              | Before (`eedde743`) | After (`26444ce0` THIS) | Goal              |
|----------------------------------------------------|---------------------|-------------------------|-------------------|
| `installs.json` has `openclaw-os-plugin`           | NO                  | **YES**                 | YES               |
| Gateway boot line plugin count                     | 7                   | **8**                   | 8                 |
| Gateway "scan failed" lines in journal             | 1+                  | **0**                   | 0                 |
| `/plugins/openclawos` returns 200                  | 404                 | 404                     | 200 (Fix-C)       |
| Caddy serves `<title>Liv AI</title>`               | OpenClaw Control    | OpenClaw Control        | Liv AI (Fix-B/C)  |
| Liv AI plugin tools callable by chat               | NO                  | NO                      | YES (Fix-B)       |

**Half-resolved.** The byte-deterministic install blocker is removed; the plugin is no longer absent from openclaw's runtime view. The remaining gaps are app-layer (manifest declarations + route mount semantics) and require a follow-up hot-fix or a small plan increment.

## Sacred SHA

Hook PASSED on commit `26444ce0`:
```
[sacred-sha] PASS: 20 files verified
```

Files touched: 1 (`livos/packages/liv-claw-gateway/start.js`, +47 / -8). Zero sacred files in the diff. Canonical SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved.

## Carry-overs (added to Phase 203 follow-up backlog)

| ID            | Surface                                                        | Status              |
|---------------|----------------------------------------------------------------|---------------------|
| 205-hotfix-A  | openclaw install scanner blocks pnpm devDep symlinks           | **RESOLVED** (`26444ce0`) |
| 205-hotfix-B  | `contracts.tools` manifest missing 20+ runtime tools           | **RESOLVED** (`f69525cd`) |
| 205-hotfix-C  | `/plugins/openclawos/` workspace UI mount 404s (Caddy + bare)  | **RESOLVED** (`08511784` + `2b2c9f73`) — see Fix-C addendum below |

## Addendum — Fix-B SHIPPED 2026-05-24 19:33 PDT (`f69525cd`)

### What Fix-B changed

`livos/packages/liv-claw-os/packages/claw-plugin/openclaw.plugin.json` — expanded `contracts.tools[]` from 9 → 21 entries:
- 9 inline tools (already declared): artifact CRUD + db_query/execute + app_create/get/update
- 9 luse_* proxies (Phase 203-06 D-203-13): luse_computer_{screenshot,click_mouse,type_text,press_keys,application,drag_mouse,paste_text} + luse_list_windows + luse_get_cursor_position
- 3 unique built-ins (Phase 203-06 D-203-14): weather, get_current_time, ui_render. (The other 8 built-ins overlap with luse-proxy names and de-dupe at registration per the plugin's index.ts comment §867-883.)

Package version bumped 0.1.5 → 0.1.6 to force openclaw's install cache to re-scan. Manifest schema = string-array of tool names, verified against stock openclaw extensions (`browser/openclaw.plugin.json`, `canvas/openclaw.plugin.json`) in `livos/node_modules/.pnpm/openclaw@2026.5.20/.../openclaw/dist/extensions/`.

Build verified locally: `pnpm --filter @openuidev/openclaw-os-plugin build` → PASS (dist/index.js 190.6kb + dist/openclaw.plugin.json matches source).

### Live verification on Mini PC post Fix-B deploy

Deployed via `sudo bash /opt/livos/update.sh` at Mini PC time 19:33 PDT 2026-05-23 (update.sh recorded `Deployed SHA: f69525c`). Gateway log post-deploy:

```
[plugins] [openclaw-os-plugin] register() called — plugin loaded OK
[plugins] [openclaw-os-plugin] workspace UI mounted at http://127.0.0.1:18789/plugins/openclawos/ (root /opt/livos/packages/liv-claw-os/packages/claw-plugin/static)
[plugins] [openclaw-os-plugin] registering tools…
[plugins] [livinityd-tools] registered 9 luse_* proxy tools
[plugins] [livinityd-tools] registered 11 built-in LivOS proxy tools
[plugins] [openclaw-os-plugin] Phase 203-06 — registered 9 luse_* tools + 11 built-in tools (expected 9 + 11)
[plugins] [openclaw-os-plugin] all tools registered
[plugins] [openclaw-os-plugin] gateway RPC methods registered
[gateway] http server listening (8 plugins: browser, canvas, device-pair, file-transfer, memory-core, openclaw-os-plugin, phone-control, talk-voice; 3.9s)
```

**ZERO "must declare contracts.tools" rejection lines** in the journal post-deploy (was 20+ lines per startup before Fix-B). Plugin activation completes fully: tool registration step finishes, gateway RPC methods register, 8-plugin boot line preserved.

### Fix-B did NOT resolve Fix-C — root cause changed

Original Fix-C hypothesis (in this doc, pre-addendum): "tied to Fix-B; openclaw may be aborting plugin activation after tool-register rejection cascade." Post-Fix-B evidence DISPROVES that — activation completes cleanly but `/plugins/openclawos/` still 404s.

Live diagnosis post-Fix-B revealed the real cause:

```
$ ls -la /opt/livos/packages/liv-claw-os/packages/claw-plugin/static/
ls: cannot access '/opt/livos/packages/liv-claw-os/packages/claw-plugin/static/': No such file or directory
```

The plugin's `registerHttpRoute` handler in `src/index.ts:209-266` streams files from `path.resolve(__dirname, "..", "static")`. That directory is populated by the `bundle-ui` npm script in `package.json:34`:
```
"bundle-ui": "cd ../claw-client && pnpm install --frozen-lockfile=false && pnpm build && shx rm -rf ../claw-plugin/static && shx cp -r out ../claw-plugin/static"
```
`bundle-ui` runs ONLY as part of `prepack` (`"prepack": "pnpm bundle-ui && pnpm build"`) — never on plain `pnpm build`, never on `pnpm install`. So:
- `update.sh` runs `pnpm install` + builds packages → never invokes `prepack` → never creates `static/`
- Every file lookup in the route handler misses → response = 404 + `text/plain` "Not Found"
- Caddy `/liv-ai-app/openclawos/*` then falls through to openclaw's gateway core root, which serves the stock claw-control UI hence `<title>OpenClaw Control</title>`

This is INDEPENDENT of Fix-B. Tool registration and static-file serving are orthogonal concerns. Fix-C is its own deploy-pipeline gap.

### Fix-C proposed paths (next hot-fix)

1. **Build-side** — add `bundle-ui` invocation to `build` script (or `build:full` invoked by `update.sh`). Pre-condition: `claw-client` Next.js build is fast/light on Mini PC; verify dep footprint.
2. **Deploy-side** — pre-build `static/` on developer workstation and ship it via git. Tradeoff: ~MBs of static assets in repo.
3. **Update.sh-side (RECOMMENDED)** — add `pnpm --filter @openuidev/openclaw-os-plugin bundle-ui` step in `update.sh` after `pnpm install`. Cleanest separation; keeps repo lean; `bundle-ui` is already idempotent.

Path 3 = next hot-fix.

### Operator-visible state after Fix-B

| Check                                              | Before (`26444ce0` Fix-A) | After (`f69525cd` Fix-B) | Goal              |
|----------------------------------------------------|---------------------------|--------------------------|-------------------|
| `installs.json` has `openclaw-os-plugin`           | YES                       | **YES**                  | YES               |
| Gateway boot line plugin count                     | 8                         | **8**                    | 8                 |
| "must declare contracts.tools" rejection lines     | 20+                       | **0**                    | 0                 |
| Liv AI plugin tools registered + callable          | NO                        | **YES (20 tools)**       | YES               |
| Plugin activation completes ("all tools registered" log) | NO (mid-stream abort) | **YES**                  | YES               |
| `/plugins/openclawos/` returns 200                 | 404                       | 404                      | 200 (Fix-C)       |
| Caddy serves `<title>Liv AI</title>`               | OpenClaw Control          | OpenClaw Control         | Liv AI (Fix-C)    |

**Two-thirds resolved.** Tool surface is fully live. Only the static-bundle deploy gap remains — operator can use Liv AI's tool catalog programmatically (e.g. via `openclaw chat` CLI) but the in-browser workspace UI at `/plugins/openclawos/` still serves the stock OpenClaw root.

### Sacred SHA (Fix-B commit)

Hook PASSED on commit `f69525cd`:
```
[sacred-sha] PASS: 20 files verified
```

Files touched (2): `openclaw.plugin.json` + `package.json` (version bump). Zero sacred files. Canonical SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved.

## Self-Check: PASSED

- File `livos/packages/liv-claw-gateway/start.js` modified (verified via `git diff HEAD~1`).
- Commit `26444ce0` on origin/master (verified via `git log --oneline -2`).
- Mini PC deployed SHA = `26444ce` (verified via update.sh tail).
- Sacred SHA hook PASSED on commit (verified via commit output).
- Plugin install scanner block REMOVED (verified — `installs.json` now has `openclaw-os-plugin`).
- Two remaining issues documented as 205-hotfix-B and 205-hotfix-C carry-overs above.

## Addendum — Fix-C SHIPPED 2026-05-24 20:09 PDT (two commits: `08511784` + `2b2c9f73`)

Fix-C turned out to be TWO independent gaps that both had to be closed before
the operator could see `<title>Liv AI</title>` end-to-end through Caddy:

### Part 1 — update.sh bundle-ui step (`08511784`)

**Root cause:** claw-plugin's `static/` dir was empty/absent on Mini PC because
the `bundle-ui` npm script (which produces `static/` from claw-client's Next.js
export) only runs in `prepack`, NOT `build`. `update.sh` ran `pnpm -r build`
which produced claw-client `out/` but never copied it into claw-plugin/static.
Plugin's `registerHttpRoute` handler at `src/index.ts:209-266` streams files
from `path.resolve(__dirname, "..", "static")` → every file lookup missed →
every request to `/plugins/openclawos` returned 404.

**Patch (`08511784` — update.sh +33 lines):** Added Step 7.3b that runs
`pnpm --filter @openuidev/openclaw-os-plugin bundle-ui` after the recursive
build step. Verifies `static/index.html` exists post-build, warns loudly if
not. Idempotent — the nested `pnpm install --frozen-lockfile=false` and
`next build` are both safe re-runs over an already-installed/built workspace.

**Self-update quirk:** First `update.sh` run after the commit pulled the new
script via the in-line self-update mechanism (Step 2 lines 440-448) but
finished executing the OLD script in memory. Second `update.sh` run picked up
the new Step 7.3b and successfully produced `static/` with `index.html` +
`_next/` subtree. Live verification:
```
$ ls -la /opt/livos/packages/liv-claw-os/packages/claw-plugin/static/
total 136
drwxr-xr-x 6 bruce bruce  4096 May 23 19:55 .
-rw-r--r-- 1 bruce bruce  9385 May 23 19:55 index.html
drwxr-xr-x 6 bruce bruce  4096 May 23 19:55 _next
... (404.html, apps/, favicon.svg, manifest.webmanifest, setup.html, sw.js)

$ curl -sS http://127.0.0.1:18789/plugins/openclawos | grep -oE "<title>[^<]+</title>"
<title>Liv AI</title>
```

### Part 2 — Caddy rewrite target + asset handle (`2b2c9f73`)

After Part 1, the gateway directly served `<title>Liv AI</title>`, but Caddy
edge (`/liv-ai-app/openclawos*`) still returned `<title>OpenClaw Control</title>`
because TWO Caddy gaps remained:

1. **Caddyfile generator drift.** `livos/packages/livinityd/source/modules/domain/caddy.ts:144-149`
   emitted `rewrite * /openclawos{path}` — sending traffic to the gateway's
   stock claw-control root instead of `/plugins/openclawos` where the plugin's
   UI actually lives. Notably the doc-comment 5 lines above ALREADY specified
   `/plugins/openclawos` as the intent + ALL THREE shell-baked install scripts
   (`scripts/install/mode-tunnel.sh`, `mode-cloud.sh`, `deploy-livinityd.sh`)
   used `/plugins/openclawos{path}` correctly. `caddy.ts` was the lone drifted
   generator — landed wrong pre-203-12 and silently masked by the broken
   `static/` situation.

2. **Missing apex asset handle.** The Next.js static export's `basePath` is
   `/plugins/openclawos` (see `livos/packages/liv-claw-os/packages/claw-client/next.config.ts:9`),
   so the rendered HTML references `_next/*` assets as
   `/plugins/openclawos/_next/...`. Browsers would hit those URLs on the apex
   host (`bruce.livinity.io`) which had no Caddy handle for them → falls
   through to the default `handle { reverse_proxy 127.0.0.1:8080 }` (livinityd)
   which doesn't serve them → 404 page = blank UI.

**Patch (`2b2c9f73` — 5 files +69/-6):**
- Corrected rewrite target in `caddy.ts` to `/plugins/openclawos{path}`.
- Added `@openclawosPluginAssets path /plugins/openclawos /plugins/openclawos/*`
  handle block proxying directly to `127.0.0.1:18789` (no rewrite — gateway
  already matches that prefix verbatim).
- Mirrored the asset handle into all three shell-baked install scripts so
  fresh installs across cloud-mode + tunnel-mode + local-LAN inherit the fix.
- Updated `caddy.test.ts`: changed 4 assertions of the old rewrite path,
  retitled the describe block, added new test verifying the asset handle
  emission shape. All 43 caddy tests PASS locally on Windows.

**Mini PC apply path:** Since the live Caddyfile is generated by livinityd's
domain module (`caddy.ts`) — not by `update.sh` — we live-patched it via `sed`
+ `awk` insert, then `caddy validate` + `systemctl reload caddy`. Backup at
`/etc/caddy/Caddyfile.bak-pre-203-hotfix-c-<unix-ts>`. The repo source is now
authoritative for any future `domain.activate` tRPC regeneration.

### Live verification on Mini PC post Fix-C-Part-2 (2026-05-23 20:09 PDT)

| Probe                                                            | Result                                                |
|------------------------------------------------------------------|-------------------------------------------------------|
| `GET :18789/plugins/openclawos` (gateway direct)                 | 200 `text/html` 9385b, `<title>Liv AI</title>`        |
| `GET :18789/plugins/openclawos/` (gateway direct, slash)         | 200 `text/html` 9385b, `<title>Liv AI</title>`        |
| `GET /liv-ai-app/openclawos` via Caddy (Host bruce.livinity.io)  | 200, **`<title>Liv AI</title>`** (was OpenClaw Control) |
| `GET /liv-ai-app/openclawos/` via Caddy (with slash)             | 200, `<title>Liv AI</title>`                          |
| `GET /plugins/openclawos` via Caddy (asset handle)               | 200, `<title>Liv AI</title>`                          |
| `GET /plugins/openclawos/_next/static/chunks/0k21i4ps2l733.js` via Caddy | 200 `application/javascript` 52665b (asset proxied) |
| `POST /openclawos/handshake` via Caddy (regression check)        | 401 `application/json` (livinityd auth required — expected, no JWT cookie sent) |
| `GET /liv-ai-app/agents` via Caddy (regression check)            | 200 `text/html` (Phase 202 dashboard at :3010 — preserved) |

ZERO regressions on adjacent routes (`/openclawos/handshake` still routes to
livinityd, `/liv-ai-app/agents` still routes to the Phase 202 dashboard).

### Operator-visible state after Fix-C (final)

| Check                                              | Before (`f69525cd` Fix-B) | After (`2b2c9f73` Fix-C) | Goal              |
|----------------------------------------------------|---------------------------|--------------------------|-------------------|
| `installs.json` has `openclaw-os-plugin`           | YES                       | **YES**                  | YES               |
| Gateway boot line plugin count                     | 8                         | **8**                    | 8                 |
| "must declare contracts.tools" rejection lines     | 0                         | **0**                    | 0                 |
| Liv AI plugin tools registered + callable          | YES (20 tools)            | **YES (20 tools)**       | YES               |
| `/plugins/openclawos/` returns 200                 | 404                       | **200**                  | 200               |
| Caddy `/liv-ai-app/openclawos` serves `<title>Liv AI</title>` | OpenClaw Control | **Liv AI**          | Liv AI            |
| Caddy `_next/*` assets reachable                   | n/a (HTML 404'd)          | **YES**                  | YES               |
| Operator can open Liv AI dock icon and see chat UI | NO                        | **YES**                  | YES               |

**Fully resolved.** Phase 203 § G.2 carry-over flips PARTIAL → RESOLVED.

### Sacred SHA (Fix-C commits)

Hook PASSED on both Fix-C commits:
```
[sacred-sha] PASS: 20 files verified  (08511784)
[sacred-sha] PASS: 20 files verified  (2b2c9f73)
```

Files touched (combined): `update.sh`, `caddy.ts`, `caddy.test.ts`,
`mode-tunnel.sh`, `mode-cloud.sh`, `deploy-livinityd.sh`. Zero sacred files.
Canonical SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved.

## Self-Check (Fix-C): PASSED

- File `update.sh` patched with bundle-ui Step 7.3b (verified via `git diff 08511784~1 08511784`).
- File `livos/packages/livinityd/source/modules/domain/caddy.ts` rewrite target corrected + asset handle added (verified via `git diff 2b2c9f73~1 2b2c9f73`).
- Caddy unit tests all PASS (43/43) on local Windows pre-push.
- Commits `08511784` + `2b2c9f73` on origin/master (verified via `git push` output).
- Mini PC deployed SHA = `08511784` from update.sh; Caddyfile live-patched on top to incorporate `2b2c9f73`'s rewrite + asset handle (will be naturally regenerated on next livinityd domain.activate).
- Sacred SHA hook PASSED on both commits (verified via commit output).
- Live curl verification confirms `<title>Liv AI</title>` end-to-end via Caddy on apex host.
- Adjacent route regression checks (`/openclawos/handshake`, `/liv-ai-app/agents`) PASS.
