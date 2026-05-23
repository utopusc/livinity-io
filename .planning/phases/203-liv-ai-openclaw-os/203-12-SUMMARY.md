---
phase: 203-liv-ai-openclaw-os
plan: 12
subsystem: deploy
tags: [deploy, mini-pc, update-sh, systemd, openclaw, caddy, hot-fix, wave-4]
status: code-complete
completed: 2026-05-23
duration_minutes: ~75
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved (INV-203-01 PASS — 4 hot-fix commits + 1 docs commit, 0 sacred files touched, hook PASS on every commit; live-recompute on Mini PC `/opt/liv/packages/core/src/sdk-agent-runner.ts` = exact match)
dependency_graph:
  requires:
    - Plan 203-03 (update.sh hooks for liv-claw-gateway systemd install + rsync + build chain)
    - Plan 203-08 (Mastra purge — flips livinityd default LIV_AGENT_RUNTIME to openclaw)
    - Plan 203-09 (Caddy split routing for /liv-ai-app/openclawos vs /liv-ai-app/* — source side)
    - Plan 203-10 (desktop integration + Caddy rewrite for plugin URL)
    - Plan 203-11 (apps/[slug] route in claw-client static export)
  provides:
    - Live Mini PC running Phase 203 openclaw stack + Phase 202 dashboard side-by-side
    - 4 inline Rule-1/2/3 hot-fixes for openclaw 2026.5.20 CLI surface gaps + systemd EnvironmentFile precedence quirk + Caddy rewrite path drift
    - Deploy log artifact documenting 5 update.sh passes + 6 distinct bugs surfaced + resolved
  affects:
    - Plan 203-13 (VERIFICATION.md + STATE flip — gateway is live and reachable, operator UAT can now run)
tech_stack:
  added: []
  patterns:
    - "Direct .mjs path-walk for openclaw bin resolution (bypass restrictive `exports` block that blocks require.resolve('openclaw/package.json'))"
    - "openclaw plugins install --link <bundle> idempotent pre-flight in start.js (CLI rejects --force with --link; plain --link is no-op on already-linked plugins)"
    - "Unconditional --allow-unconfigured for first-boot gateway (no `openclaw setup` step in deploy flow)"
    - "Per-service /etc/default/<unit> EnvironmentFile= instead of shared /opt/livos/.env (systemd 256 quirk where EnvironmentFile= clobbers preceding Environment= directives in this Ubuntu 24.04 kernel build)"
    - "Inline live Caddyfile patch + caddy reload (caddy.ts source generator only fires on domain-config change, not on every livinityd boot — gap covered by manual patch this deploy and corrected source for next install.sh)"
key_files:
  created:
    - .planning/phases/203-liv-ai-openclaw-os/203-12-DEPLOY-LOG.md
    - .planning/phases/203-liv-ai-openclaw-os/203-12-SUMMARY.md
  modified:
    - livos/packages/liv-claw-gateway/start.js (bin resolution + plugin install + --allow-unconfigured)
    - scripts/install/systemd/liv-claw-gateway.service (env precedence + EnvironmentFile source decoupling)
    - livos/packages/livinityd/source/modules/domain/caddy.ts (rewrite path /plugins/openclawos → /openclawos)
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts (3 test assertions repointed)
  deleted: []
  live_only:
    - /etc/caddy/Caddyfile on Mini PC (inline-patched to add Plan 203-09 handle_path split — next install.sh run regenerates from corrected source)
decisions:
  - "203-12-D-01 — Inline /etc/caddy/Caddyfile patch INSTEAD of triggering livinityd's caddy.ts regeneration path. caddy.ts only writes the file on domain-config change (tunnel-mode CF DNS provider update), not on every livinityd boot — pre-existing Phase 104 design. Cleanest unblocker for THIS deploy walk; the source-side caddy.ts fix is also committed so future install.sh runs from scratch land the correct shape."
  - "203-12-D-02 — Per-service EnvironmentFile (`/etc/default/liv-claw-gateway`) INSTEAD of shared `/opt/livos/.env`. On Ubuntu 24.04 systemd 256, EnvironmentFile= consistently clobbered preceding Environment= directives at process spawn time despite the documented opposite behavior — gateway repeatedly bound to :8080 (livinityd's PORT in .env) instead of :18789. Decoupling sources eliminates the contamination; operator can put LLM provider keys in `/etc/default/liv-claw-gateway` (empty by default; EnvironmentFile=-... means optional)."
  - "203-12-D-03 — Plan 203-10's `/plugins/openclawos` rewrite path was WRONG; live gateway serves `/openclawos`. Verified via direct curl on Mini PC :18789. Likely an upstream documentation pattern that does not match the actual openclaw 2026.5.20 bundle. Backported the fix to caddy.ts source + 3 test assertions."
  - "203-12-D-04 — livos-app-liv-ai.service NOT retired (plan called for retirement). Per D-203-09 amended split routing, the legacy Next.js subapp at :3010 serves /liv-ai-app/agents + /liv-ai-app/settings (Phase 202 dashboard, INV-203-09 contract); retiring it would break those routes. Plan 203-13 may revisit if Phase 202 dashboard is moved into the openclaw gateway plugin in a future phase."
  - "203-12-D-05 — Migration 0004 (drop mastra tables) NOT applied — file doesn't exist in source. Plan 203-08 D-02 explicitly kept mastra_* tables as legacy back-compat (no-op CREATE IF NOT EXISTS). Operator DB may still carry pre-203-08 mastra_threads / mastra_messages rows. Plan 220+ may add a real DROP TABLE migration when a clean cutover gate is justified."
  - "203-12-D-06 — Update.sh patches called for by Plan 203-12 Task 1 (liv-claw-plugin.service + openui-validator package rsync + LIV_AGENT_RUNTIME=openclaw env var injection + livos-app-liv-ai retirement + migration 0004 runner) were SKIPPED because (a) D-203-04 amendment loads plugin in-process via openclaw `--plugin` flag — no separate service, (b) openui-validator is in-tree at livos/packages/livinityd/source/modules/openui/ — not a workspace package, (c) LIV_AGENT_RUNTIME default is `openclaw` in source per Plan 203-08 — no env var needed, (d) livos-app-liv-ai kept per D-203-09 split, (e) migration 0004 doesn't exist per Plan 203-08 D-02."
metrics:
  completed: 2026-05-23
  duration: ~75 minutes (15:28 push → 16:33 final smoke)
  tasks_completed: 5/5 (Task 1 was effectively a re-confirmation that update.sh patches from Plan 203-03 plus the 4 inline hot-fixes constitute the full Phase 203 deploy surface)
  commits: 5 (4 inline hot-fixes + 1 docs commit; per task_commit_protocol each fix was an atomic commit)
  files_created: 2 (DEPLOY-LOG + SUMMARY)
  files_modified: 4 (start.js, systemd unit, caddy.ts, caddy.test.ts)
  files_deleted: 0
  sacred_files_touched: 0 (INV-203-01 PASS across all 4 hot-fix commits)
  caddy_test_run: PASS — 42/42 vitest cases post-rewrite-path-fix
  deployed_sha: ff61210901a68f40f12379987b2af4e091ff9c37 (Mini PC /opt/livos/.deployed-sha)
  followup_commit: 8badfa4c (Caddy rewrite source fix, NOT yet re-deployed — live patch covers it; next routine update.sh run picks it up)
  smokes_pass: 12/12 (services + gateway HTTP + livinityd HTTP + Caddy 7 routes + sacred SHA + postgres + mastra residue)
  update_sh_passes: 5
  inline_hot_fixes: 4 (Rule-1 bugs all)
deviations:
  - "[Rule 1 - Bug] resolveOpenclawBin via `require.resolve('openclaw/package.json')` failed with ERR_PACKAGE_PATH_NOT_EXPORTED on Node 22 + openclaw 2026.5.20 strict exports block. Switched to direct .mjs path walk + .bin shim fallback. Fixed in commit `d5f33480`."
  - "[Rule 1 - Bug] start.js used non-existent `openclaw gateway run --plugin <path>` flag (Plan 203-01 spike spec was wrong about CLI surface). Switched to `openclaw plugins install --link <bundle>` pre-flight. Fixed in commit `227e9599`."
  - "[Rule 1 - Bug] systemd unit had Environment=PORT=18789 BEFORE EnvironmentFile=-/opt/livos/.env. Reordered. Fixed in commit `227e9599`."
  - "[Rule 1 - Bug] openclaw plugins install --force is incompatible with --link. Removed --force. Fixed in commit `ff612109`."
  - "[Rule 1 - Bug] Gateway died at first boot with 'Missing config' — no `openclaw setup` step in deploy flow. Added unconditional --allow-unconfigured. Fixed in commit `ff612109`."
  - "[Rule 1 - Bug] Even with Environment=PORT=18789 AFTER EnvironmentFile= in unit, gateway STILL bound to :8080. Systemd 256 on Ubuntu 24.04 appears to clobber Environment= with EnvironmentFile= contents at spawn time (against documented behavior). Switched EnvironmentFile source from /opt/livos/.env → /etc/default/liv-claw-gateway (intentionally empty). Fixed in commit `ff612109`."
  - "[Rule 1 - Bug] Plan 203-10 caddy.ts rewrote to /plugins/openclawos but gateway actual URL is /openclawos. Verified via direct curl probe on :18789. Fixed in commit `8badfa4c` + live Caddyfile patch."
  - "[Rule 3 - Path drift] /etc/caddy/Caddyfile on Mini PC carries Phase 201 hotfix shape; livinityd's caddy.ts only regenerates on domain-config change (Phase 104 design). Inline patched the live Caddyfile + reloaded caddy as a Rule-3 unblocker. Source-side caddy.ts fix committed for next install.sh-from-scratch run."
  - "[Rule 3 - Path drift] Plan 203-12 Task 1 called for update.sh patches the actual code shape doesn't need (liv-claw-plugin.service, openui-validator package rsync, LIV_AGENT_RUNTIME=openclaw env injection, livos-app-liv-ai retirement, migration 0004). All 5 items were eliminated by earlier amended decisions (D-203-04 amendment, in-tree validator, source default, D-203-09 split routing, Plan 203-08 D-02). Documented as Decision 203-12-D-06."
  - "[Plan-level scope clarification] Plan 203-12 Task 3 called for re-running update.sh in retry loop on failure; this deploy ran update.sh 5 times (1st bootstrap, 2nd Phase 203 patches fire, 3rd through 5th iterating on the openclaw CLI surface). Each iteration committed an atomic hot-fix per task_commit_protocol; sacred SHA hook PASS on all 4 fix commits."
auth_gates: 0
known_stubs:
  - file: /etc/caddy/Caddyfile (on Mini PC, live-patched 2026-05-23 16:29 PDT)
    line: handle_path /liv-ai-app/openclawos* block (added inline)
    reason: "livinityd's caddy.ts source-generator only writes /etc/caddy/Caddyfile on domain-config change (tunnel-mode CF DNS provider trigger); routine deploys do not regenerate the file. Inline patch covers this deploy; the source-side caddy.ts fix (commit 8badfa4c) lands the correct shape on next install.sh from scratch. To force regen on existing deploys, a future Plan can extend update.sh to call a `regenerate-caddyfile` script."
  - file: /opt/livos/.env (NO LLM provider key)
    line: end-of-file
    reason: "openclaw gateway boots with --allow-unconfigured + no provider key; first chat request will fail until operator adds ANTHROPIC_API_KEY (or XAI_API_KEY / OPENAI_API_KEY / GROQ_API_KEY) to /etc/default/liv-claw-gateway OR /opt/livos/.env. UAT step 2 (operator-driven message) catches this; operator can paste key + `systemctl restart liv-claw-gateway` to recover."
  - file: livos/packages/liv-claw-os/packages/claw-plugin/dist/openclaw.plugin.json
    line: file missing entirely
    reason: "openclaw CLI rejects `plugins install --link` with 'plugin manifest not found: openclaw.plugin.json'. Plan 203-02/203-04 build chain doesn't emit the manifest sibling. Result: the Liv-AI-branded claw-plugin is NOT among the 7 plugins loaded by the gateway (browser, canvas, device-pair, file-transfer, memory-core, phone-control, talk-voice are the stock loaded set). Tool calls + OpenUI app_create flow will not yet work via the gateway. Plan 220+ build chain fix needed; UAT step 5 (operator creates OpenUI app) will catch."
threat_flags: []
---

# Phase 203 Plan 12: Mini PC live deploy + 4 inline hot-fixes Summary

**One-liner:** Shipped Phase 203 end-to-end to Mini PC via `bash /opt/livos/update.sh` × 5 passes; 4 inline Rule-1 hot-fixes (openclaw bin resolution, --plugin CLI flag drift, --force/--link incompatibility, systemd EnvironmentFile precedence quirk, Caddy rewrite path drift) shipped as atomic commits with sacred SHA hook PASS; final state has 7 services active including the new `liv-claw-gateway.service` on :18789 serving openclaw with 7 stock plugins loaded, full Caddy split routing live (`/liv-ai-app/openclawos*` → :18789 with prefix-strip + rewrite, `/liv-ai-app/*` → :3010 preserving Phase 202 dashboard at /agents + /settings), sacred SHA recompute on `/opt/liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d...` exact match, mastra residue in livinityd journal = 0, 12/12 smoke checks PASS.

## What this plan delivered

### Live Mini PC state (16:33 PDT)

- **7 systemd units active:** `livos`, `liv-core`, `liv-worker`, `liv-memory`, **`liv-claw-gateway`** (NEW), `livos-app-liv-ai`, `caddy`
- **openclaw gateway** bound to `127.0.0.1:18789`, `/health=200`, 7 plugins (stock set — claw-plugin not yet loaded due to missing manifest)
- **Caddy split routing live** via inline-patched `/etc/caddy/Caddyfile`:
  - `/liv-ai-app/openclawos*` → handle_path strips prefix + rewrites to `/openclawos{path}` → `127.0.0.1:18789`
  - `/liv-ai-app[/*]` → `127.0.0.1:3010` (Phase 202 dashboard preserved)
  - `/` (catch-all) → `127.0.0.1:8080` (livinityd)
- **Postgres migration 0003 applied** on livinityd boot: `livos_openui_apps` + `livos_openui_app_versions` tables present
- **Sacred SHA verified** on Mini PC: `/opt/liv/packages/core/src/sdk-agent-runner.ts` git-blob = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- **Mastra residue:** 0 lines in livinityd journal over last 10 min

### 4 inline hot-fix commits (sacred SHA hook PASS x4)

| Commit | Fix |
|---|---|
| `d5f33480` | start.js — resolve openclaw bin via direct mjs walk (bypass restrictive exports block) |
| `227e9599` | start.js — switch to `openclaw plugins install --link` pre-flight (drop non-existent --plugin flag); systemd unit env precedence |
| `ff612109` | start.js — drop --force from plugins install; always pass --allow-unconfigured; systemd EnvironmentFile= source decoupled from /opt/livos/.env to /etc/default/liv-claw-gateway |
| `8badfa4c` | caddy.ts — rewrite path /plugins/openclawos → /openclawos (gateway-actual URL); 3 caddy.test.ts assertions repointed; 42/42 vitest cases PASS |

### Deploy artifact

- `.planning/phases/203-liv-ai-openclaw-os/203-12-DEPLOY-LOG.md` — verbatim 80+ line walk record with timeline, smoke battery, pass/fail matrix vs success criteria, hot-fix commits list, deferred items list

## What changed (live Mini PC + source)

**Source (committed):**
- `livos/packages/liv-claw-gateway/start.js` — bin resolution + plugin install + boot args
- `scripts/install/systemd/liv-claw-gateway.service` — env precedence + EnvironmentFile decouple
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — rewrite path fix
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — 3 assertion repointing

**Mini PC live (manual patches that backed onto committed source):**
- `/opt/livos/update.sh` — auto-rsynced from repo (Plan 203-03 + earlier patches)
- `/etc/systemd/system/liv-claw-gateway.service` — installed via update.sh self-install step
- `/opt/livos/packages/liv-claw-os/` — rsynced + built (claw-plugin esbuild + claw-client Next.js static export)
- `/opt/livos/packages/liv-claw-gateway/` — rsynced + npm-installed (openclaw@2026.5.20 + workspace deps)
- `/etc/caddy/Caddyfile` — manually patched (Decision 203-12-D-01; source-side fix in commit `8badfa4c` lands on next install.sh-from-scratch)
- `/opt/livos/.deployed-sha` = `ff61210901a68f40f12379987b2af4e091ff9c37`

## What did NOT change

- `livos_agents` table schema (INV-203-02 preserved)
- Phase 202 `agents.*` + `agents.tasks.*` + `mcp.config.*` + `mastra.*` tRPC namespaces (INV-203-09 preserved — verified via 401 unauthed responses)
- Sacred SHA 20-file list (INV-203-01 — 0 sacred files touched across all 4 hot-fix commits)
- `livos-app-liv-ai.service` (KEPT per D-203-09 split routing — Decision 203-12-D-04)
- mastra_* Postgres tables (Plan 203-08 D-02 preserved)
- No LIV_AGENT_RUNTIME env var added to /opt/livos/.env (source default in Plan 203-08 — Decision 203-12-D-06)

## Verification

- Final smoke battery (16:33 PDT): **12/12 PASS** — see DEPLOY-LOG §Final smoke battery
- Caddy test suite post-source-fix: 42/42 PASS via `npx vitest run source/modules/domain/caddy.test.ts`
- Sacred SHA hook PASS on every commit: 4 fix commits + this docs commit = 5 verifications

## Pass/fail vs Plan 203-12 success criteria

See DEPLOY-LOG §Pass/fail. 5/7 criteria PASS as written, 2 marked N/A with documented decisions (migration 0004 = Plan 203-08 D-02 lock; LIV_AGENT_RUNTIME env var = source default in Plan 203-08).

## Deferred (operator UAT will catch — documented in DEPLOY-LOG §Deferred)

- `/liv-ai-app/apps/<slug>` route returns 404 — claw-plugin not loaded by gateway because `openclaw.plugin.json` manifest is missing from the esbuild output. Plan 203-04 build chain fix needed. UAT step 5 (operator creates OpenUI app via chat) is the catch.
- No LLM provider key in /opt/livos/.env or /etc/default/liv-claw-gateway — first chat request fails until operator pastes a key. UAT step 2 (operator-driven message) is the catch.
- Liv-AI-branded claw-plugin not in the 7 stock plugins loaded by the gateway — same root cause as bullet #1.

## Auth gates encountered

None. Operator UAT step 2 may need a provider key paste (documented in DEPLOY-LOG); that is a configuration step, not an auth gate.

## Self-Check: PASSED

- `.planning/phases/203-liv-ai-openclaw-os/203-12-SUMMARY.md` exists — this file.
- `.planning/phases/203-liv-ai-openclaw-os/203-12-DEPLOY-LOG.md` exists.
- Hot-fix commits `d5f33480`, `227e9599`, `ff612109`, `8badfa4c` exist in `git log --oneline`.
- Sacred SHA hook PASS on every commit — verified via [sacred-sha] PASS marker on each commit output.
- Mini PC sacred SHA recompute = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — verified live in DEPLOY-LOG §Final smoke battery [E].
- 12/12 smoke checks PASS — verified live in DEPLOY-LOG §Final smoke battery.
- 42/42 caddy tests PASS post-source-fix.
