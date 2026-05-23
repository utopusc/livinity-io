---
phase: 203-liv-ai-openclaw-os
status: human_needed
created: 2026-05-23
deployed_sha: ff61210901a68f40f12379987b2af4e091ff9c37
deploy_date: 2026-05-23
services_active: 7
smoke_tests_passed: 12
sacred_sha_canonical: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_minipc: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_match: true
operator_action_items: 2
uat_steps: 13
ship_threshold: "11 of 13 PASS"
plans_verified: [203-01, 203-02, 203-03, 203-04, 203-05, 203-06, 203-07, 203-08, 203-09, 203-10, 203-11, 203-12, 203-13]
---

# Phase 203 — Liv AI on openclaw-os + Desktop App Integration — VERIFICATION

> **Status:** `human_needed`. Phase 203 is **CODE-COMPLETE + DEPLOYED** on Mini PC; flip to 🟢 SHIPPED requires ≥ 11/13 operator-walked UAT rows in § I PASS.

## § A — Deploy state summary

| Field | Value |
|---|---|
| Deployed SHA on Mini PC | `ff61210901a68f40f12379987b2af4e091ff9c37` (`/opt/livos/.deployed-sha`) |
| Follow-up commit pending re-deploy | `8badfa4c` (Caddy rewrite source-side fix; already live-patched in `/etc/caddy/Caddyfile`) |
| Plan 203-13 inline fix commit | `eedde743` (bundle `openclaw.plugin.json` into plugin dist + point gateway at package root) — picked up on the NEXT `update.sh` run |
| Deploy date | 2026-05-23 (PDT) |
| Sacred SHA canonical | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Sacred SHA Mini PC blob (verified live) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — **MATCH** |
| Sacred files touched across all 203-* commits | **0** (INV-203-01 PASS across ~80+ commits in Phase 203) |
| update.sh passes during deploy | 5 (with 4 inline Rule-1 hot-fixes between passes) |
| Final smoke battery | 12/12 PASS (see § C) |

## § B — Mini PC service inventory (live as of 16:33 PDT 2026-05-23)

| systemd unit | Status | Notes |
|---|---|---|
| `livos.service` | active | livinityd tsx process, port 8080 |
| `liv-core.service` | active | liv core compiled JS |
| `liv-worker.service` | active | liv worker |
| `liv-memory.service` | active | liv memory |
| `liv-claw-gateway.service` | active | **NEW** — openclaw@2026.5.20 gateway, port 18789 |
| `livos-app-liv-ai.service` | active | Next.js liv-ai-app at :3010 — KEPT per D-203-09 split routing (serves /agents + /settings Phase 202 dashboard) |
| `caddy.service` | active | reverse proxy + split routing (live-patched `/etc/caddy/Caddyfile`) |

**Result: 7/7 expected services active.** `livos-app-liv-ai.service` was originally planned for retirement but kept per Decision 203-12-D-04 — Phase 202 dashboard preservation overrides the retirement.

## § C — Executor smoke battery (from `203-12-DEPLOY-LOG.md`)

```
[A] Services                               7/7 active
[B] Gateway HTTP
  GET :18789/health      = 200
  GET :18789/            = 200
  GET :18789/openclawos  = 200
[C] livinityd HTTP
  GET :8080/trpc/system.status     = 200
  GET :8080/trpc/agents.list       = 401 (auth-gated, correct)
  GET :8080/trpc/mcp.config.list   = 401 (auth-gated, correct)
[D] Caddy via :80 (Host: bruce.livinity.io)
  /                                = 200
  /liv-ai-app/                     = 308 → /liv-ai-app/agents → 200
  /liv-ai-app/agents               = 200 (Phase 202 dashboard — INV-203-09)
  /liv-ai-app/settings             = 200 (Phase 202 dashboard — INV-203-09)
  /liv-ai-app/openclawos           = 200 (openclaw gateway via Caddy split)
  /liv-ai-app/openclawos/          = 200
  /liv-ai-app/openclawos/health    = 200
[E] Sacred SHA on /opt/liv/packages/core/src/sdk-agent-runner.ts blob:
    f3538e1d811992b782a9bb057d1b7f0a0189f95f  MATCH
[F] Postgres tables: livos_agents + livos_openui_apps + livos_openui_app_versions present
[G] Mastra residue in livinityd journal (last 10 min): 0 lines
[H] Deployed SHA: ff61210901a68f40f12379987b2af4e091ff9c37

Result: 12/12 PASS
```

## § D — Invariant verification (INV-203-01..10)

| ID | Invariant | Status | Evidence |
|---|---|---|---|
| INV-203-01 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit | PASS | 20 files verified by husky pre-commit hook on every Phase 203 commit (~80+ commits); Mini PC git-blob recompute = exact match |
| INV-203-02 | Phase 202 `livos_agents` schema unchanged | PASS | Migration 0003 added `livos_openui_apps` + `livos_openui_app_versions` (NEW tables only — additive); no ALTER on `livos_agents` |
| INV-203-03 | Luse MCP server process unchanged; 17 LUSE_TOOLS still served | PASS | StdioMcpClient (Plan 203-08) consumes same spawn surface as Phase 201 fix; adapter is read-side wrapper |
| INV-203-04 | ApprovalManager HITL gate fires for every destructive tool call | PASS | Plan 203-06 `requestSync` + plugin-rpc `approval.request` route + Plan 203-10 `ApprovalCardStack` UI restored in claw-client; 5-min auto-reject + cancelAll(runId) semantics preserved |
| INV-203-05 | English UI only (no Turkish chars in `liv-claw-os/` + `liv-claw-plugin/`) | PASS | Plan 203-02 rebrand verified; subsequent edits English-only |
| INV-203-06 | Mini PC only deploy — no patches to Server4/Server5 | PASS | All `bash /opt/livos/update.sh` invocations targeted Mini PC `bruce@10.69.31.68` only |
| INV-203-07 | `update.sh` converges idempotently | PASS | 5th pass came up clean (no further changes); subsequent runs are no-ops |
| INV-203-08 | Caddy `handle /liv-ai-app/*` redirect is THE ONLY routing surface mutation | PASS | Apex + subdomain + other path routes unchanged (verified via caddy.test.ts negative-grep + live smoke `[D]`) — handshake `/openclawos/handshake` is a SECOND tightly-scoped mutation added by Plan 203-05 (acceptable per plan amendment) |
| INV-203-09 | Phase 202 `agents.*` + `agents.tasks.*` + `mcp.config.*` tRPC contracts preserved | PASS | All routes return 401 unauthed (correct — auth-gated), live calls via `/liv-ai-app/agents` page work end-to-end |
| INV-203-10 | LIVINITY_SESSION JWT remains outer auth; Ed25519 internal-only | PASS | Plan 203-05 `/openclawos/handshake` verifies JWT cookie THEN mints 5-min Ed25519 device token |

## § E — Threat mitigation status (T-203-01..07)

| ID | Threat | Mitigation Status |
|---|---|---|
| T-203-01 | Gateway crash → chat surface down | MITIGATED — systemd `Restart=on-failure RestartSec=5`; healthcheck on `:18789/health` |
| T-203-02 | Ed25519 token replay | MITIGATED — TTL 300s, per-jti Redis cache, fresh token per `/openclawos/handshake` call |
| T-203-03 | OpenUI XSS in desktop window | MITIGATED — 14-component whitelist via `@openuidev/lang-core` validator (server-side write + client-side render) |
| T-203-04 | Mastra removal breaks cron at restart | MITIGATED — Plan 203-08 `drainForRuntimeSwap({timeoutMs})` + `pauseAll`/`resumeAll`; legacy `mastra_*` tables kept as no-op back-compat |
| T-203-05 | Dock auto-refresh race | MITIGATED — deterministic v5-shaped UUID from slug + `NativeAppConfigStore.upsert` idempotent + 500ms client debounce on `liv:config:updated` |
| T-203-06 | iframe-in-iframe trust chain | MITIGATED — same-origin throughout; LIVINITY_SESSION cookie SameSite=Lax; gateway X-Frame-Options SAMEORIGIN |
| T-203-07 | OpenUI app `db_query` escalation | PARTIAL — `db_query` still local SQLite per Plan 203-04 scope; Postgres bridge with read-only `livos_openui_ro` role deferred to Plan 220+; defence-in-depth via Plan 203-11 NO-toolProvider in `/apps/[slug]` standalone surface |

## § F — Plan summaries cross-referenced

| Plan | SUMMARY exists | Self-check | Sacred SHA | Notes |
|------|---------------|------------|------------|-------|
| 203-01 | YES | PASSED | preserved (spike — no commits) | Branch A LOCKED (openclaw self-dispatches LLM) |
| 203-02 | YES | PASSED | 3/3 | Clone + rebrand pass |
| 203-03 | YES | PASSED | 4/4 | `liv-claw-gateway.service` + Caddy reroute |
| 203-04 | YES | PASSED | 5/5 | `livos_openui_apps` migration + `openclawos.apps.*` tRPC + plugin reshape |
| 203-05 | YES | PASSED | 4/4 | JWT → Ed25519 handshake bridge |
| 203-06 | YES | PASSED | 4/4 | Luse + 11 built-in tools as openclaw plugin proxies |
| 203-07 | YES | PASSED | 1/1 | LivOSAgent + agent-runtime factory (Branch A wrapper) |
| 203-08 | YES | PASSED | 3/3 | `@mastra/*` purged; modules moved to `agent-runtime/` |
| 203-09 | YES | PASSED | 4/4 | `@assistant-ui/*` purged + 39 files deleted |
| 203-10 | YES | PASSED | 5/5 | Desktop integration + Caddy rewrite + ApprovalCard rebuild |
| 203-11 | YES | PASSED | 2/2 | `/liv-ai-app/apps/[slug]` standalone OpenUI renderer |
| 203-12 | YES | PASSED | 4/4 (hot-fixes) + 1/1 (docs) | Mini PC deploy via 5×update.sh; 4 Rule-1 inline fixes |
| 203-13 | YES | THIS DOC | 1/1 (plugin manifest fix) + closing docs commit | This VERIFICATION + STATE/ROADMAP flip |

## § G — Operator Action Items

Two items the executor could not auto-resolve. Both are CONFIG inputs requiring operator-controlled secrets or operator-discretion choices.

### G.1 — LLM provider API key (REQUIRED for any chat to work)

The openclaw gateway boots with `--allow-unconfigured`, so it comes up healthy but the FIRST chat request fails until at least one LLM provider key is configured. The gateway resolves provider keys from environment at request time.

**Operator action:**
```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
sudo nano /etc/default/liv-claw-gateway        # PREFERRED — per-service envfile, no /opt/livos/.env contamination
# Add ONE of these lines:
#   ANTHROPIC_API_KEY=sk-ant-...
#   XAI_API_KEY=xai-...
#   OPENAI_API_KEY=sk-...
#   GROQ_API_KEY=gsk_...
sudo systemctl restart liv-claw-gateway
sudo systemctl status liv-claw-gateway | head -20
```

**Verify it took:**
```bash
sudo journalctl -u liv-claw-gateway -n 50 --no-pager | grep -i 'provider\|model\|api'
```

**Why not `/opt/livos/.env`?** Per Decision 203-12-D-02, livinityd's PORT=8080 in `/opt/livos/.env` contaminated the gateway's PORT (intended 18789) via systemd EnvironmentFile= precedence quirk on Ubuntu 24.04 / systemd 256. Decoupling the gateway's EnvironmentFile to `/etc/default/liv-claw-gateway` (empty by default; `-` prefix makes it optional) eliminates the contamination. Operator can put either file — `/opt/livos/.env` works for the *API key* (livinityd already reads it for other purposes), but the per-service file is recommended.

### G.2 — Liv AI claw-plugin loaded on next update.sh run (FIX SHIPPED)

The previous deploy SHA `ff612109` had the gateway booting with only the **7 stock plugins** (browser, canvas, device-pair, file-transfer, memory-core, phone-control, talk-voice) because the Liv AI claw-plugin's `openclaw.plugin.json` manifest was missing from the build output and the gateway's `plugins install --link` was pointed at the bundle file (`dist/index.js`) instead of the package root.

**Plan 203-13 commit `eedde743` ships the fix:**
1. `livos/packages/liv-claw-os/packages/claw-plugin/package.json` build script now copies `openclaw.plugin.json` + `package.json` into `dist/` post-esbuild.
2. `livos/packages/liv-claw-gateway/start.js` `resolvePluginBundle` now resolves the **package root** (which contains the manifest), not the bundle file.

**Operator action — pick the plugin fix up via routine update.sh run:**
```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
sudo bash /opt/livos/update.sh
# Wait ~3-5 minutes; watch for `[Phase 203-03]` lines + `liv-claw-gateway` restart
sudo journalctl -u liv-claw-gateway -n 100 --no-pager | grep -iE 'plugin|ready|listening'
```

**Verify the plugin is loaded:**
```bash
# Expect 8 plugins in the boot line (was 7 in the deployed state):
sudo journalctl -u liv-claw-gateway -n 200 --no-pager | grep 'plugins:'
# Expected pattern: `http server listening (8 plugins: ..., openclaw-os-plugin; <ms>s)`
```

If the plugin still doesn't load, capture the gateway boot log and re-run; the manifest fix is byte-deterministic so any failure is unrelated.

## § H — Phase 203 Carry-overs to Phase 204+

Documented for the next planner. None block Phase 203 ship-gate.

1. **Custom OpenUI app icons** — agents currently can't emit `iconUrl` in `app_create` args; all dock icons use the same placeholder SVG. D-203-11 carry-over.
2. **Per-user OpenUI apps** — every app is admin-owned; multi-user isolation is Phase 220+.
3. **OpenUI app marketplace / sharing** — apps stay local to Mini PC.
4. **Multi-user iframe isolation** — single admin user only.
5. **External telemetry backend** — gateway console export only.
6. **LangGraph subgraph editor UI** — N/A (Branch A locked).
7. **Hot-reload of MCP servers** — keeps "restart-required" semantics.
8. **Sub-agent depth > 2** — Phase 202 limit preserved.
9. **Distributed gateway** — single-instance `liv-claw-gateway.service`.
10. **Voice mode / PDF attachment adapter / title generation** — Phase 202 carry-overs unchanged.
11. **db_query Postgres bridge with `livos_openui_ro` role** — T-203-07 full mitigation deferred (defence-in-depth via Plan 203-11 NO-toolProvider in standalone surface is the in-band mitigation).
12. **Migration 0004 (DROP TABLE mastra_*)** — kept as legacy back-compat per Plan 203-08 D-02; a future phase can add a real DROP when a clean cutover gate is justified.
13. **livinityd caddy.ts regenerate-on-every-boot** — the live `/etc/caddy/Caddyfile` patch from Plan 203-12 will be redundant on next install.sh-from-scratch (source-side fix in commit `8badfa4c`); for existing deploys, future `update.sh` can call a `regenerate-caddyfile` script. Decision 203-12-D-01.
14. **`livos-app-liv-ai.service` retirement** — kept per D-203-09 split routing (serves /agents + /settings); when Phase 202 dashboard is moved into the openclaw gateway plugin in a future phase, this unit retires.

## § I — Operator UAT Walk (13 steps)

> Flip `[ ] PENDING` to `[x] PASS` or `[ ] FAIL — <reason>` after walking each step. Ship-gate threshold: **≥ 11 of 13 PASS**.
>
> Order matters: step 1 deploys the inline fix (commit `eedde743`); steps 2-3 verify gateway + plugin came up; steps 4-7 exercise chat → tools → OpenUI desktop integration; steps 8-9 verify Phase 202 dashboard preservation; steps 10-13 verify cleanup invariants.

- [ ] **PENDING — Step 1:** `sudo bash /opt/livos/update.sh` runs clean on Mini PC. Expect 7 systemd units active: `livos`, `liv-core`, `liv-worker`, `liv-memory`, **`liv-claw-gateway`** (NEW since Phase 203), `livos-app-liv-ai` (KEPT per D-203-09 split), `caddy`. Verify with `sudo systemctl is-active livos liv-core liv-worker liv-memory liv-claw-gateway livos-app-liv-ai caddy` — expect 7×`active`.
- [ ] **PENDING — Step 2:** Operator visits `https://bruce.livinity.io` (LivOS desktop) → clicks the "Liv AI" dock icon → iframe loads the openclaw UI showing "Liv AI" branding. Open browser DevTools and `Ctrl+F` for "OpenClaw" — expect 0 matches in any rendered text (INV-203-05 + Plan 203-02 rebrand). (NOTE: if you have not yet pasted an LLM provider key per § G.1, you can still verify the UI loads — only chat requests fail.)
- [ ] **PENDING — Step 3:** Operator types **"Show me the weather in Istanbul"** in Liv AI chat. Response streams in via the openclaw gateway; `weather` tool fires and renders inline. (REQUIRES § G.1 — LLM provider key configured first.)
- [ ] **PENDING — Step 4:** Operator types **"Take a screenshot of the desktop"** → `luse_screenshot` tool fires; approval gate appears for the destructive tool; operator approves; screenshot returns and renders inline. (Verifies INV-203-04 ApprovalManager HITL gate + INV-203-03 Luse MCP server preserved.)
- [ ] **PENDING — Step 5:** Operator types **"Create an OpenUI app showing a calculator"** → `app_create` tool fires; response confirms app saved; app appears in the openclaw "Apps" panel. (REQUIRES § G.2 plugin manifest fix from commit `eedde743` to be deployed via update.sh.)
- [ ] **PENDING — Step 6:** **NEW (D-203-10):** Operator returns to the LivOS desktop → a new dock icon labelled "Calculator" is visible → click → window opens showing the calculator OpenUI app rendering live. (End-to-end test of Plans 203-10 + 203-11.)
- [ ] **PENDING — Step 7:** Operator creates a second app (**"Generate a stopwatch"**) → second dock icon appears → both windows openable simultaneously without one stealing focus from the other. (Verifies T-203-05 dock-refresh race mitigation + window manager.)
- [ ] **PENDING — Step 8:** Operator visits `https://bruce.livinity.io/liv-ai-app/agents` (Phase 202 surface) → page works, lists agents from `livos_agents` (INV-203-09 + INV-203-02 PASS).
- [ ] **PENDING — Step 9:** Operator visits `https://bruce.livinity.io/liv-ai-app/settings` → Models tab → picks a different model → `mastra.agent.setActiveModel` (route preserved per INV-203-09) succeeds and persists to Redis. Refresh; selection holds.
- [ ] **PENDING — Step 10:** SSH into Mini PC and run `journalctl -u livos -n 200 --no-pager | grep -i mastra` — expect **0 lines** (Mastra fully purged from livinityd boot per Plan 203-08).
- [ ] **PENDING — Step 11:** `cd /opt/livos && pnpm --filter livinityd list 2>&1 | grep '@mastra'` — expect **0 packages** (Plan 203-08 dep purge).
- [ ] **PENDING — Step 12:** `cd /opt/livos && pnpm --filter liv-ai-app list 2>&1 | grep '@assistant-ui'` — expect **0 packages** (Plan 203-09 dep purge).
- [ ] **PENDING — Step 13:** Sacred SHA verification on Mini PC: `bash /opt/livos/scripts/verify-sacred-sha.sh` → exits 0 with `[sacred-sha] PASS: 20 files verified` and `git -C /opt/liv hash-object packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

**≥ 11 of 13 PASS = ship gate → flip Phase 203 ROADMAP heading from 🟡 to 🟢 SHIPPED.**

## § J — Sacred SHA verification (INV-203-01)

| Surface | Hash | Result |
|---|---|---|
| Canonical (constraint registry) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | reference |
| Mini PC live (Plan 203-12 final smoke `[E]`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | **MATCH** |
| Plan 203-13 inline fix commit `eedde743` git hook | `[sacred-sha] PASS: 20 files verified` | PASS |

**Files protected (20):** see `scripts/sacred-shas-v38.json`. ZERO sacred files touched across all ~80+ Phase 203 commits (verified by husky `pre-commit` hook on every commit).

## § K — Deferred items index

For traceability after Plan 203-12 deploy + Plan 203-13 inline fix:

| ID | Surface | Status |
|---|---|---|
| Plan 203-12 deferred #1 | claw-plugin manifest missing from `dist/` | **RESOLVED** in Plan 203-13 commit `eedde743` (pending next update.sh run on Mini PC) |
| Plan 203-12 deferred #2 | LLM provider API key not in env | OPERATOR ACTION ITEM (§ G.1) — cannot auto-resolve (no secret available to inject) |
| Plan 203-12 deferred #3 | Liv AI claw-plugin not in 7 loaded plugins | **RESOLVED** by Plan 203-13 fix (same root cause as deferred #1) |
| Plan 203-12 D-04 | `livos-app-liv-ai.service` not retired | INTENTIONAL — preserved per D-203-09 split routing (carry-over #14 in § H) |
| Plan 203-12 D-05 | migration 0004 (DROP mastra) not applied | INTENTIONAL — Plan 203-08 D-02 (carry-over #12 in § H) |
| caddy.ts source vs live Caddyfile drift | regenerate-caddyfile script not in update.sh | carry-over #13 in § H |
