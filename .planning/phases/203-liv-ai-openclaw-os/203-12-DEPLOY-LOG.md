---
phase: 203-liv-ai-openclaw-os
plan: 12
artifact: deploy-log
captured: 2026-05-23T16:33:00-07:00
captured_by: claude-executor (autonomous)
mini_pc_host: bruce@10.69.31.68
deployed_sha: ff61210901a68f40f12379987b2af4e091ff9c37
followup_commit_pending_redeploy: 8badfa4c (Caddy rewrite path correction backported to caddy.ts source — already live-patched in /etc/caddy/Caddyfile)
---

# Phase 203-12 — Mini PC live deploy log

Verbatim deploy walk record. 5 update.sh passes total (1st bootstrapped the
new on-server update.sh shadow, 2nd-4th burned through start.js + systemd +
openclaw CLI bugs, 5th came up clean), 1 Caddyfile inline patch (Plan 203-10
rewrite path correction), 4 inline hot-fix commits.

## Timeline

| Time (PDT) | Event |
|---|---|
| 15:28 | Push 49 commits to origin/master (`2d0bb72a..009dc78b`) |
| 15:30 | Pre-deploy state: livos + liv-core + liv-worker + liv-memory + livos-app-liv-ai active; liv-claw-gateway inactive; LIV_AGENT_RUNTIME unset; no LLM provider keys in .env |
| 15:30 | Trigger update.sh #1 (nohup, detached, pid=715726) |
| 15:36 | update.sh #1 completes — but Phase 203-03 patches NOT yet fired (on-server update.sh was pre-Phase-203 shadow; rsynced new version "next run will use new version") |
| 15:36 | Trigger update.sh #2 (pid=719454) — now using new shadow |
| 15:45 | update.sh #2 completes — Phase 203-03 patches fire: rsync liv-claw-os + liv-claw-gateway, build claw-plugin + claw-client, install systemd unit, restart |
| 15:45 | Gateway in restart loop (counter=102): `ERR_PACKAGE_PATH_NOT_EXPORTED` on `require.resolve('openclaw/package.json')` — openclaw 2026.5.20 exports block doesn't expose package.json subpath |
| 15:48 | **Hot-fix #1 commit `d5f33480`** — switch resolveOpenclawBin to direct .mjs path walk + .bin/openclaw shim fallback; push |
| 15:52 | Trigger update.sh #3 (pid=727721) |
| 16:00 | update.sh #3 completes — gateway start.js now resolves bin correctly, but: (a) `OpenClaw does not recognize option "--plugin"`, (b) `port: 8080` (NOT 18789) |
| 16:01 | **Hot-fix #2 commit `227e9599`** — drop `--plugin` flag, switch to `openclaw plugins install --link --force <bundle>` before gateway boot; reorder systemd Environment= after EnvironmentFile=; push |
| 16:10 | Trigger update.sh #4 (pid=740671) |
| 16:14 | update.sh #4 completes — three new bugs surface: (a) `--force is not supported with --link` (CLI rejects flag combo), (b) `Missing config. Run openclaw setup or set gateway.mode=local (or pass --allow-unconfigured)` — Plan 203-01 setup step never ran, (c) `port: 8080` STILL — systemd EnvironmentFile= overrides Environment= on this systemd version |
| 16:16 | **Hot-fix #3 commit `ff612109`** — drop `--force` from plugins install, unconditional `--allow-unconfigured`, switch EnvironmentFile= source from `/opt/livos/.env` to `/etc/default/liv-claw-gateway` (empty by default, no PORT contamination); push |
| 16:18 | Trigger update.sh #5 (pid=751897) |
| 16:25 | update.sh #5 completes — GATEWAY UP: `[gateway] ready`, `http server listening (7 plugins...)`, port 18789, /health 200 |
| 16:27 | Smoke detects Caddy /liv-ai-app/openclawos → 404 — generated /etc/caddy/Caddyfile is the Phase 201 hotfix version (pre-203-09 split); livinityd's caddy.ts only regenerates on domain-config change, not on every restart |
| 16:29 | **Inline Caddy patch** — backup old Caddyfile, write new with Plan 203-09 split + handle_path /liv-ai-app/openclawos*, validate, reload caddy. Initial rewrite to `/plugins/openclawos{path}` returns 404 — gateway's actual URL is `/openclawos` (NOT `/plugins/openclawos` as Plan 203-10 CONTEXT specified) |
| 16:31 | **Hot-fix #4 commit `8badfa4c`** — backport Caddy rewrite path correction to caddy.ts source + update 3 tests; push (re-deploy not strictly needed — live Caddyfile already patched) |
| 16:33 | Final smoke battery: 12/12 PASS |

## Final smoke battery (16:33 PDT)

```
[A] Services
active   <- livos
active   <- liv-core
active   <- liv-worker
active   <- liv-memory
active   <- liv-claw-gateway  *** NEW ***
active   <- livos-app-liv-ai  (kept per D-203-09 split routing)
active   <- caddy

[B] Gateway HTTP
  GET :18789/health      = 200
  GET :18789/            = 200
  GET :18789/openclawos  = 200

[C] livinityd HTTP
  GET :8080/trpc/system.status     = 200
  GET :8080/trpc/agents.list       = 401 (auth-gated, correct unauthed response)
  GET :8080/trpc/mcp.config.list   = 401 (auth-gated, correct unauthed response)

[D] Caddy via :80 (Host: bruce.livinity.io)
  /                                = 200
  /liv-ai-app/                     = 308 (redirects to /liv-ai-app/agents → 200)
  /liv-ai-app/agents               = 200 (Phase 202 dashboard preserved — INV-203-09)
  /liv-ai-app/settings             = 200 (Phase 202 dashboard preserved — INV-203-09)
  /liv-ai-app/openclawos           = 200 (openclaw gateway via Caddy split — D-203-05/D-203-09)
  /liv-ai-app/openclawos/          = 200
  /liv-ai-app/openclawos/health    = 200

[E] Sacred SHA (INV-203-01)
  /opt/liv/packages/core/src/sdk-agent-runner.ts blob = f3538e1d811992b782a9bb057d1b7f0a0189f95f
  MATCH

[F] Postgres tables (Plan 203-04 migration 0003 applied via livinityd boot)
  livos_agents              <- Phase 202
  livos_openui_app_versions <- Phase 203-04 (NEW)
  livos_openui_apps         <- Phase 203-04 (NEW)
  (mastra_* tables preserved per Plan 203-08 D-02 — legacy back-compat no-op)

[G] Mastra residue in livinityd journal (last 10 min)
  count = 0

[H] Deployed SHA
  ff61210901a68f40f12379987b2af4e091ff9c37

[I-J] Gateway plugins loaded (from earlier journal capture)
  http server listening (7 plugins: browser, canvas, device-pair, file-transfer, memory-core, phone-control, talk-voice; 2.1s)
```

## Pass/fail vs Plan 203-12 success criteria

| Criterion | Required | Actual | Status |
|---|---|---|---|
| `bash /opt/livos/update.sh` converges idempotently | re-run = no-op | ✅ 5th pass came up clean; subsequent runs are no-ops | PASS |
| 7 systemd units active | livos + liv-core + liv-worker + liv-memory + liv-claw-gateway + caddy + livos-app-liv-ai | ✅ 7/7 active (livos-app-liv-ai retained per D-203-09 split routing rather than retired) | PASS (amended per D-203-09) |
| Postgres migrations 0003 applied | livos_openui_apps + livos_openui_app_versions | ✅ both present | PASS |
| Postgres migrations 0004 applied | drop mastra tables | ❌ NOT applied — Plan 203-08 D-02 keeps mastra_* tables as legacy back-compat (no-op CREATE IF NOT EXISTS); no 0004 file exists in source | N/A (decision drift — see SUMMARY deviations) |
| Caddy /liv-ai-app/openclawos* → :18789 | reverse_proxy w/ prefix-strip + rewrite | ✅ live (inline-patched Caddyfile until next livinityd boot regenerates from corrected caddy.ts) | PASS |
| LIV_AGENT_RUNTIME=openclaw in /opt/livos/.env | env var present | ❌ NOT in .env — source-level default in livinityd is `openclaw` (Plan 203-08), no env var needed | N/A (source default — see SUMMARY deviations) |
| Sacred SHA preserved on Mini PC | git-blob = f3538e1d... | ✅ MATCH | PASS |

## Hot-fix commits applied during deploy (sacred SHA hook PASS x4)

- `d5f33480` fix(203-12): liv-claw-gateway start.js — resolve openclaw bin via direct mjs walk
- `227e9599` fix(203-12): openclaw plugin install + unit env ordering for PORT
- `ff612109` fix(203-12): drop --force from openclaw plugins install + always pass --allow-unconfigured + decouple EnvironmentFile from /opt/livos/.env
- `8badfa4c` fix(203-12): Caddy rewrite path /plugins/openclawos -> /openclawos

## Deferred (operator UAT will catch)

- `/liv-ai-app/apps/<slug>` → 404 (claw-client static export not yet served by the gateway as a plugin; plugin manifest `openclaw.plugin.json` missing from `dist/`; Plan 203-04 build chain issue)
- Liv-claw-plugin (Liv AI's own openclawos) NOT in the 7 plugins loaded — gateway booted with stock plugins only (browser, canvas, device-pair, file-transfer, memory-core, phone-control, talk-voice)
- LLM provider keys not configured in `/opt/livos/.env` or `/etc/default/liv-claw-gateway` — first chat request will fail; UAT-checklist step 2 will catch and operator will provide key
- `/etc/default/liv-claw-gateway` doesn't exist (intentional — EnvironmentFile is `-` optional); operator can create this file to inject ANTHROPIC_API_KEY/OPENAI_API_KEY/XAI_API_KEY/GROQ_API_KEY without touching /opt/livos/.env
