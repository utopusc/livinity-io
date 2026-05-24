---
phase: 203-liv-ai-openclaw-os
hotfix: 205-plugin-load
parent_issue: "Phase 203 § G.2 — Liv AI claw-plugin not loaded"
status: PARTIAL — Fix-A SHIPPED, Fix-B follow-up required
created: 2026-05-24
commit: 26444ce0
deployed_sha: 26444ce0
deploy_date: 2026-05-23 (PDT, late evening, Mini PC time 19:17 PDT)
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
| 205-hotfix-A  | openclaw install scanner blocks pnpm devDep symlinks           | **RESOLVED** (this) |
| 205-hotfix-B  | `contracts.tools` manifest missing 20+ runtime tools           | OPEN — next hot-fix |
| 205-hotfix-C  | `/plugins/openclawos/` workspace UI mount 404s (Caddy + bare)  | OPEN — depends on B |

## Self-Check: PASSED

- File `livos/packages/liv-claw-gateway/start.js` modified (verified via `git diff HEAD~1`).
- Commit `26444ce0` on origin/master (verified via `git log --oneline -2`).
- Mini PC deployed SHA = `26444ce` (verified via update.sh tail).
- Sacred SHA hook PASSED on commit (verified via commit output).
- Plugin install scanner block REMOVED (verified — `installs.json` now has `openclaw-os-plugin`).
- Two remaining issues documented as 205-hotfix-B and 205-hotfix-C carry-overs above.
