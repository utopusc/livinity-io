---
phase: 231-openclawos-retirement
plan: 01
artifact: DISCOVERY
generated: 2026-05-27
produced_before: source edits (Task 2-5)
---

# Phase 231-01 Discovery — OpenClawOS Source Enumeration + Disposition

## Purpose

Single grep-derived enumeration of every openclaw* / openClaw* / OpenClaw*
/ OPENCLAWOS_* / LIV_AI_CHAT* path in the repo. Every disposition row drives
exactly one Plan 01 edit (or explicit N/A). No source edit happens without a
row in the table below.

## Verbatim grep evidence

### 1. Top-level filesystem enumeration

```
$ git ls-files | grep -iE 'claw|openclaw' | wc -l
308
```

The 308 lines break down as:

- ~270 lines under `livos/packages/liv-claw-os/**` (the upstream openclaw-os
  fork pinned at SHA 076ae63, vendored under a workspace package via
  pnpm-workspace.yaml).
- ~6 lines under `livos/packages/liv-claw-gateway/**` (thin systemd-deployable
  wrapper around `openclaw` npm).
- 5 lines under `livos/packages/livinityd/source/modules/server/trpc/openclaw*`
  (3 standalone trpc routers + 2 test files).
- 16 lines under `livos/packages/livinityd/source/modules/openclawos/**`
  (handshake / plugin-rpc / approvals / device-token / openclaw-config-store /
  openui-apps-repository / liv-ai-dock-seed / etc.).
- 4 lines under `livos/packages/livinityd/source/modules/openclaw-cli/**`
  (cli-spawner / auth-profiles-store / opencode-bridge).
- 2 lines under `livos/packages/livinityd/source/modules/agent-runtime/openclaw-client.{ts,test.ts}`.
- 3 lines under `scripts/install/{install-openclaw-cli.sh,sudoers.d/livos-claw-gateway,systemd/liv-claw-gateway.service}`.
- ~40+ lines under `.planning/**` (historical artifacts, KEEP).

### 2. trpc/index.ts (Phase 231 in-file excision target)

```
$ grep -nE 'openclaw|openClaw|OpenClaw|OPENCLAWOS_HANDSHAKE' livos/packages/livinityd/source/modules/server/trpc/index.ts
150-160 Phase 203-04 openclawos-router import block
161-172 Phase 205-04 openclawos-gateway-router import block
184-193 Phase 206 openclaw-router import block
247-252 createAppRouter opts: openclawosApps? slot + doc comments
253-258 openclawosGateway? slot + doc comments
266-270 openclawCli? slot + doc comments
378-389 router mount: openclawos: router({apps: ..., gateway: ...})
400-404 router mount: openclaw: opts.openclawCli ?? openclawCliRouter
```

### 3. trpc/common.ts httpOnlyPaths

```
$ grep -nE "'openclaw|'openclawos" livos/packages/livinityd/source/modules/server/trpc/common.ts
382-383 'openclawos.gateway.config.read', '...write'
691-696 'openclawos.apps.list,get,create,update,delete,version'
716-723 'openclawos.gateway.devices.{list,revoke}', 'origins.{list,add,remove}', 'auth.{get,setMode,rotateToken}'
736-743 'openclaw.providers.list', 'openclaw.models.list', 'openclaw.auth.{status,setApiKey,logout}', 'openclaw.config.{setDefaultModel,getDefaultModel}', 'openclaw.profiles.list'
```
Total: 24 string entries.

### 4. domain/caddy.ts emit surfaces

```
$ grep -nE 'OPENCLAWOS_HANDSHAKE|openclawos|@livAiOpenclawos|/plugins/openclawos|/liv-ai-app/openclawos' livos/packages/livinityd/source/modules/domain/caddy.ts
185-243 Doc comment block describing Phase 203-09/10 openclaw routing
260-280 LIV_AI_HANDLE constant — embeds /liv-ai-app/openclawos handle_path block (lines 268-275)
276-280 @openclawosPluginAssets matcher + handle block
290-307 Phase 203-05 doc comment + OPENCLAWOS_HANDSHAKE_HANDLE constant
421 emit site #1 (subdomain block)
453 emit site #2 (apex block, with apexCacheHeader prefix)
483 emit site #3 (null mainDomain :80 block)
```

### 5. domain/caddy.test.ts assertion surfaces

```
$ grep -nE 'openclawos|/openclawos/|@livAiOpenclawos|LIV_AI_CHAT|18789' livos/packages/livinityd/source/modules/domain/caddy.test.ts | wc -l
55
```
Distribution:
- 19-122 `describe('Phase 203-05 — /openclawos/handshake handle ...')` (the 5-test block)
- 126-181 `describe('Phase 203-09 — /liv-ai-app split: openclaw gateway vs Next.js subapp')` (3 tests + the port allow-list assertion at lines 117-120 already lives INSIDE Phase 203-09)
- 182-onwards `describe('Phase 203-10/12/Hot-fix-C — gateway URL rewrite to /plugins/openclawos')` (3+ tests)
- 256-onwards `describe('Phase 203-12 — /liv-ai-app/liv-ai cosmetic handle')` (3 tests, also LIV_AI_CHAT/openclawos-touching)
- 340-347 additional cosmetic ordering assertion — inside a describe block we'll drop
- 788, 813 — comment references inside surviving Phase 226-04 describe (KEEP, just comment text)

### 6. UI surfaces

```
$ grep -n "LIV_AI_CHAT\|openclaw" livos/packages/ui/src/providers/apps.tsx
(zero matches)
$ grep -nE 'LIV_AI_CHAT|openclaw' livos/packages/ui/src/modules/desktop/dock.tsx
222-236 doc comment block (openclaw chat surface, Hot-fix F switches both dock tiles)
263-280 <DockItem appId='LIV_AI_CHAT' ...> wrapped in data-test-dock-item='liv-ai-chat'
281-296 <DockItem appId='LIV_AI_CHAT_SHORTCUT' ...>
$ grep -nE 'LIV_AI_CHAT|openclaw' livos/packages/ui/src/modules/window/window-content.tsx
30-34   doc comment (openclaw claw-client surface iframe)
35      lazy import LivAiChatIframeContent
44-45   LIV_AI_CHAT_APP_ID const
79      fullHeightApps Set entry
146-154 if (appId === LIV_AI_CHAT_APP_ID) branch + comment
$ grep -nE 'LIV_AI_CHAT|openclaw' livos/packages/ui/src/modules/desktop/dock.test.tsx
15      header comment bullet point #4
186-193 Test 4 — Phase 227 coexistence assertion
```

### 7. livinityd production boot wire-up (livos/packages/livinityd/source/index.ts)

```
$ grep -nE 'openclaw|openclawos|createOpenclaw|OpenclawClient|seedLivAiDockEntry|OpenUIAppsRepository|OpenclawConfigStore|/openclawos/' livos/packages/livinityd/source/index.ts | wc -l
102
```

Breakdown:
- Imports (lines 86, 165-179, 203-208): seedLivAiDockEntry, OpenUIAppsRepository,
  OpenclawConfigStore, createOpenclawosAppsRouter, createOpenclawosGatewayRouter,
  createOpenclawCliRouter, OpenclawClient
- Express mounts (lines 1306-1480): POST `/openclawos/handshake`, POST
  `/openclawos/plugin-rpc`, GET `/openclawos/approvals/stream`, POST
  `/openclawos/approvals/respond`
- Agent dispatch wiring (lines 1061-1075): `new OpenclawClient({baseUrl: ...})` attached to LivOSAgent
- mcp-config-router opts.openclawConfigStore (lines 1547-1558 + 1568) — mirrors MCP writes
  to openclaw.json
- tRPC factory wire-up (lines 1620-1789):
  `openclawosAppsRouterProductionInstance`, `openclawosGatewayRouterProductionInstance`,
  `openclawCliRouterProductionInstance` + `OpenUIAppsRepository`, `OpenclawConfigStore`,
  `gatewayConfigStore`
- createAppRouter opts (lines 1855-1858): `openclawosApps`, `openclawosGateway`, `openclawCli`
- Periodic bridge refresher (lines 1802-1817): `startPeriodicBridgeRefresh` from
  modules/openclaw-cli/opencode-bridge.js
- Dock seed (line 86 import + call site): `seedLivAiDockEntry`

### 8. Zero-external-consumer audits (DELETE_FILE candidates)

```
$ grep -rn "from '.*openclawos-router'" livos --include='*.ts' --include='*.tsx'
livos\packages\livinityd\source\modules\server\trpc\openclawos-router.test.ts:29
livos\packages\livinityd\source\modules\server\trpc\index.ts:160
livos\packages\livinityd\source\index.ts:171

$ grep -rn "from '.*openclawos-gateway-router'" livos --include='*.ts' --include='*.tsx'
livos\packages\livinityd\source\index.ts:179
livos\packages\livinityd\source\modules\server\trpc\openclawos-gateway-router.test.ts:36
livos\packages\livinityd\source\modules\server\trpc\index.ts:172

$ grep -rn "from '.*trpc/openclaw-router'" livos --include='*.ts' --include='*.tsx'
livos\packages\livinityd\source\index.ts:208

$ grep -rn "from '.*modules/openclawos/" livos --include='*.ts' --include='*.tsx'
livos\packages\livinityd\source\index.ts:86 (seedLivAiDockEntry)
livos\packages\livinityd\source\index.ts:170 (OpenUIAppsRepository)
livos\packages\livinityd\source\index.ts:178 (OpenclawConfigStore)
livos\packages\livinityd\source\modules\server\trpc\openclaw-router.ts:44,51,55 (cli-spawner, auth-profiles-store, opencode-bridge — all in openclaw-cli/, not openclawos/)

$ grep -rn "from '.*agent-runtime/openclaw-client" livos --include='*.ts' --include='*.tsx'
(no direct imports; module is consumed via agent-runtime/index.ts barrel export)
$ grep -rn "OpenclawClient" livos/packages/livinityd/source --include='*.ts'
livos\packages\livinityd\source\index.ts:1064 (`new OpenclawClient(...)` agent-client attach)
livos\packages\livinityd\source\modules\agent-runtime\index.ts:41 (re-export)
livos\packages\livinityd\source\modules\agent-runtime\livos-agent.test.ts:26
livos\packages\livinityd\source\modules\agent-runtime\openclaw-client.{ts,test.ts}

$ grep -rn "@livos/liv-claw" livos --include='*.json' --include='*.ts' --include='*.tsx'
livos\packages\liv-claw-gateway\start.js — runtime dep on @livos/liv-claw-os plugin
livos\packages\liv-claw-gateway\package.json — workspace dep on @livos/liv-claw-os
livos\packages\liv-claw-os\package.json — name
livos\pnpm-workspace.yaml:11-15 (workspace registration)
livos\pnpm-lock.yaml:185 (`@livos/liv-claw-os`)
```

## Disposition Table

Disposition rules:
- **REMOVE** — in-file line/block excision in KEPT file
- **DELETE_FILE** — `git rm` the file entirely (zero out-of-scope consumers)
- **MV_TO_ATTIC** — `git mv` from active workspace to `attic/`
- **KEEP** — file lives, no edit
- **N/A** — Plan 231 own artifact / historical .planning/ doc
- **KEEP_SCOPE_EXPANSION** — out-of-scope consumer surfaced; survives Plan 01,
  a follow-up phase must address. Documented inline below.

| Row ID | Path | Lines | Disposition | Rationale |
| ------ | ---- | ----- | ----------- | --------- |
| R01 | `livos/packages/livinityd/source/modules/server/trpc/openclawos-router.ts` | (all) | DELETE_FILE | Standalone tRPC router; only consumers are trpc/index.ts:160 + the sibling .test.ts. After R03 edits + R02 file deletion, zero consumers remain. |
| R02 | `livos/packages/livinityd/source/modules/server/trpc/openclawos-router.test.ts` | (all) | DELETE_FILE | Test for R01; co-deleted in the same commit. |
| R03 | `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.ts` | (all) | DELETE_FILE | Same pattern as R01 — only consumers are trpc/index.ts:172 + the sibling .test.ts. |
| R04 | `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.test.ts` | (all) | DELETE_FILE | Test for R03. |
| R05 | `livos/packages/livinityd/source/modules/server/trpc/openclaw-router.ts` | (all) | DELETE_FILE | Phase 206 router; only consumers are trpc/index.ts:193 + livinityd/source/index.ts:208 + this file's own imports from openclaw-cli/. |
| R06 | `livos/packages/livinityd/source/modules/server/trpc/index.ts` | 150-193, 247-270, 378-404 | REMOVE | Excise 3 import blocks, 3 createAppRouter opts fields + their doc comments, and the `openclawos: router({...})` + `openclaw: opts.openclawCli ??` mount sites. Surrounding non-openclaw routes (`provider:`, `skills:`, `mastra:` etc.) unchanged. |
| R07 | `livos/packages/livinityd/source/modules/server/trpc/common.ts` | 382-383, 691-696, 716-723, 736-743 | REMOVE | Delete all 24 `'openclaw.*'` + `'openclawos.*'` string entries from `httpOnlyPaths`. Surrounding entries (mcp.config.*, provider.config.*, agents.*, etc.) untouched. |
| R08 | `livos/packages/livinityd/source/index.ts` | 165-179, 203-208, 1620-1666, 1730-1770, 1772-1789, 1855, 1856, 1858 | REMOVE | Excise the 3 tRPC factory production-instance blocks (`openclawosAppsRouterProductionInstance`, `openclawosGatewayRouterProductionInstance`, `openclawCliRouterProductionInstance`) + their 3 imports (`createOpenclawosAppsRouter`, `createOpenclawosGatewayRouter`, `createOpenclawCliRouter`) + the 3 `createAppRouter({...})` opt fields (`openclawosApps:`, `openclawosGateway:`, `openclawCli:`). Also remove the `OpenUIAppsRepository` (line 170) import — only consumer is `openclawosAppsRouterProductionInstance`. ALSO remove the orphaned `gatewayConfigStore` construction inside the Phase 205-04 block when removing it. KEEP `OpenclawConfigStore` import (line 178) — still used by `mcpConfigOpenclawStore` (R10 scope-expansion). |
| R09 | `livos/packages/livinityd/source/modules/domain/caddy.ts` | 185-307 (block), 421, 453, 483 (emit sites) | REMOVE | Remove `OPENCLAWOS_HANDSHAKE_HANDLE` constant (303-307), the `@livAiOpenclawos` matcher + `handle @livAiOpenclawos` block embedded in `LIV_AI_HANDLE`/`apexBlock` (268-275), the `@openclawosPluginAssets` matcher + handle (276-280), the surrounding doc comment block (185-243, 290-302), and the 3 `${OPENCLAWOS_HANDSHAKE_HANDLE}` interpolation emit sites (421, 453, 483). Replace doc block with a single retirement note. |
| R10 | `livos/packages/livinityd/source/modules/domain/caddy.test.ts` | 19-122 (Phase 203-05 describe), 126-181 (Phase 203-09 describe), 182-onwards (Phase 203-10/12 describe), 256-onwards (Phase 203-12 cosmetic describe), 340-347 (cosmetic ordering assertion inside surviving describe) | REMOVE | Wholesale-delete the 4 describe blocks (Phase 203-05, 203-09, 203-10/12, 203-12 cosmetic). Add 2 new Phase 231 negative-grep tests confirming Caddyfile contains zero `/openclawos/handshake`, `@livAiOpenclawos`, `/plugins/openclawos`, `/liv-ai-app/openclawos`, `127.0.0.1:18789`. Phase 226-04 + survivor describes (LIV_ASSISTANT_HANDLE etc.) untouched. |
| R11 | `livos/packages/ui/src/modules/desktop/dock.tsx` | 215-296 | REMOVE | Drop the Phase 203 Hot-fix F doc comment block (215-231), the wrapping `<div data-test-dock-item='liv-ai-chat'>` + `<DockItem appId='LIV_AI_CHAT' ...>` (263-280), and the standalone `<DockItem appId='LIV_AI_CHAT_SHORTCUT'>` (281-296). KEEP Phase 227-02 Liv Assistant block (232-262) — that's the v42 replacement. |
| R12 | `livos/packages/ui/src/modules/window/window-content.tsx` | 30-35, 44-45, 79 (Set entry), 146-154 | REMOVE | Drop the Phase 203 Hot-fix D doc comments + the `LivAiChatIframeContent` lazy import (35) + the `LIV_AI_CHAT_APP_ID` const (44-45) + the corresponding `fullHeightApps` Set entry (79) + the `if (appId === LIV_AI_CHAT_APP_ID)` branch (146-154). KEEP Phase 227-01 `LIV_ASSISTANT_APP_ID` const + branch (47, 156-161). |
| R13 | `livos/packages/ui/src/modules/desktop/dock.test.tsx` | 15 (comment bullet), 186-193 (Test 4) | REMOVE | Delete the `Test 4 — legacy LIV_AI_CHAT entry remains rendered` describe block (Phase 231 IS the remover) + the matching header-comment bullet. Add 1 new Phase 231 negative-grep test asserting `[data-test-dock-item="liv-ai-chat"]` is null + the `LIV_AI_CHAT`/`LIV_AI_CHAT_SHORTCUT` `appId`-keyed buttons are absent. |
| R14 | `livos/packages/ui/src/providers/apps.tsx` | n/a | N/A | Discovery grep returned ZERO matches for `LIV_AI_CHAT` or `openclaw`. The plan anticipated 2 systemApps entries (id `'LIV_AI_CHAT'`, `'LIV_AI_CHAT_SHORTCUT'`) but they don't exist — the dock launcher's `useLaunchNativeApp` short-circuit at `wmClassHint==='liv-ai'` sets `LIV_AI_CHAT` as appId without a backing systemApps row. No edit needed. |
| R15 | `livos/packages/liv-claw-os/` (~270 files) | (all) | KEEP_SCOPE_EXPANSION | Workspace package consumed by `livos/packages/liv-claw-gateway/` (runtime plugin host). `git mv` to `attic/` would break the gateway service unless we also attic the gateway and drop both from pnpm-workspace.yaml AND from livinityd boot wire-up (express handshake/plugin-rpc/approvals mounts at index.ts:1306-1480, OpenclawClient agent-dispatch at index.ts:1061-1075, seedLivAiDockEntry at index.ts:86). That's a vastly larger architectural surgery than Plan 01's "tRPC routes + Caddy + UI dock" scope. Deferred to a follow-up phase. KEEP in place; Task 5 is N/A. |
| R16 | `livos/packages/liv-claw-gateway/` | (all) | KEEP_SCOPE_EXPANSION | Same as R15. Service is still systemd-managed on Mini PC (`liv-claw-gateway.service`). Plan 02 deploy will regen Caddyfile without `/openclawos/*` handles, so no traffic reaches `:18789` anymore, but the service unit + workspace package live on until a follow-up phase de-orchestrates it. |
| R17 | `livos/packages/livinityd/source/modules/openclawos/` (15 files) | (all) | KEEP_SCOPE_EXPANSION | Consumed by livinityd boot wire-up beyond the tRPC scope: `seedLivAiDockEntry` (dock-seed), `OpenclawConfigStore` (used by `mcpConfigOpenclawStore` in mcp-config-router opts — line 1547-1568), express handshake/plugin-rpc/approvals route mounts. Deleting this dir cascades into removing express mounts + mcp-config-router opts + dock seed wire-up — far outside Plan 01's stated scope. Deferred. |
| R18 | `livos/packages/livinityd/source/modules/openclaw-cli/` (4 files) | (all) | KEEP_SCOPE_EXPANSION | After R05 deletes `trpc/openclaw-router.ts`, the ONLY remaining consumer is `livinityd/source/index.ts:1802-1817` (`startPeriodicBridgeRefresh` periodic timer for xAI opencode→openclaw bridge refresh). Removing the periodic-refresh block is outside the tRPC excision scope. Deferred. |
| R19 | `livos/packages/livinityd/source/modules/agent-runtime/openclaw-client.{ts,test.ts}` | (all) | KEEP_SCOPE_EXPANSION | `OpenclawClient` is the agent-dispatch class attached to LivOSAgent at index.ts:1064. LivOSAgent is the live Liv AI dispatch surface still consumed by `agent-router.ts`, `agent-task-router.ts`, and the entire livinityd Liv AI runtime stack. Removing this would cascade through the agent-runtime layer — vastly outside Plan 01 scope. Deferred. |
| R20 | `scripts/install/install-openclaw-cli.sh` | (all) | KEEP_SCOPE_EXPANSION | Operator install script for the `openclaw` CLI. Referenced by `openclaw-cli/` runtime + the gateway service. Tied to R18 + R16 — moves with them in a follow-up phase. |
| R21 | `scripts/install/sudoers.d/livos-claw-gateway` | (all) | KEEP_SCOPE_EXPANSION | Sudoers grant for livinityd→liv-claw-gateway systemctl restart. Tied to R16. |
| R22 | `scripts/install/systemd/liv-claw-gateway.service` | (all) | KEEP_SCOPE_EXPANSION | systemd unit for liv-claw-gateway. Tied to R16. |
| R23 | `scripts/install/deploy-livinityd.sh` | 1638-1668 (Caddyfile snippet) | KEEP_SCOPE_EXPANSION | Hardcoded Caddyfile snippet inside the deploy script references `/openclawos/handshake`, `/liv-ai-app/openclawos`, `:18789`. Since Plan 02's deploy invokes `bash /opt/livos/update.sh` (which is bash-source-of-truth on Mini PC, NOT this committed deploy script), the snippet here is documentation-only on Mini PC's actual runtime path. Still: leaving it stale risks future copy-paste. Deferred to follow-up phase (low priority — Plan 02 deploy regenerates from caddy.ts, which IS scrubbed in R09). |
| R24 | `.planning/phases/203-liv-ai-openclaw-os/**` (~50 files) | (all) | N/A | Historical planning artifacts. Immutable. |
| R25 | `.planning/phases/209-openclaw-claude-cli-reuse/**` | (all) | N/A | Historical planning artifacts. |
| R26 | `.planning/phases/231-openclawos-retirement/231-01-PLAN.md` + this DISCOVERY.md | (all) | N/A | Plan 01 own artifacts. |
| R27 | `.planning/research/v38_2_hermes_openclaw_findings.md` | (all) | N/A | Historical research. |

## Scope Expansion Summary

Plan 01 scope is **narrower than DISCOVERY.md candidates 7-11 suggested**:

- **In scope (REMOVE/DELETE_FILE):** tRPC standalone routers (R01-R05 + R06-R08 in-file edits) + Caddy emit + tests (R09-R10) + UI dock/window/dock-test (R11-R13).
- **Deferred to follow-up phase (KEEP_SCOPE_EXPANSION):** R15-R23 — the openclaw-cli periodic bridge refresh, the express handshake/plugin-rpc/approvals mounts, the modules/openclawos/* directory still consumed by mcp-config-router + dock-seed, the OpenclawClient agent-dispatch, the liv-claw-os + liv-claw-gateway workspace packages, the systemd unit + sudoers + install script triad, and the deploy-livinityd.sh static Caddyfile snippet.

Rationale: deleting R15-R23 cascades through ~850 lines of livinityd boot wire-up + the entire Liv AI agent-runtime layer (LivOSAgent + agent-router + agent-task-router). That is architectural surgery on the order of Phase 230's backup work — not the "5 atomic commits in one wave" pattern Plan 01 was scoped for. Phase 233 UAT GREEN gated Plan 01 on the basis that **Liv Assistant fully replaces openclaw end-to-end** — which it does at the user-visible surface level (dock tile, window, iframe, Caddy handle). The dead-code carcass of openclaw under the hood remains until a follow-up cleanup phase, but no operator UI invokes it post-Plan 01 + Plan 02 deploy.

Plan 02 deploy will regenerate `/etc/caddy/Caddyfile` from the R09-scrubbed
`caddy.ts`, so the live :18789 reverse-proxy path stops accepting traffic
even though the systemd unit + workspace package + boot-wire-up Express
mounts are still loaded. The deferred surfaces are dead-but-loaded — not
operator-visible.

## Task 5 disposition (workspace mv)

**Task 5 = N/A.** `livos/packages/liv-claw-os/` and `livos/packages/liv-claw-gateway/`
both classify as **KEEP_SCOPE_EXPANSION** (R15, R16). The plan explicitly
permitted Task 5 to be N/A "if directory absent" — by extension, N/A is also
correct when the directory exists but moving it cascades outside the plan's
in-scope surgery. The DEPLOY-LOG.md will record this N/A finding.

## Commit Plan

5 atomic commits (Task 5 collapses to N/A documented in SUMMARY, not its own
commit):

1. **`docs(231-01): discovery + disposition table for OpenClawOS retirement`**
   - Files: `.planning/phases/231-openclawos-retirement/231-01-DISCOVERY.md` (THIS file)
   - Drives: every subsequent commit references row IDs from this table

2. **`feat(231-01): excise openclaw/openclawos tRPC routes + httpOnlyPaths (R01-R08)`**
   - DELETE_FILE: R01-R05 (5 standalone router + test files)
   - REMOVE: R06 (trpc/index.ts imports + opts + mounts), R07 (common.ts httpOnlyPaths entries), R08 (livinityd/source/index.ts factory wire-up + 3 imports + createAppRouter opts)
   - Verify: `pnpm --filter @livos/livinityd typecheck` exits 0; grep returns 0 matches in trpc/index.ts + common.ts for openclaw/openclawos namespaces (R08 retains `OpenclawConfigStore` import line — that's expected, used by mcp-config-router)

3. **`feat(231-01): remove OPENCLAWOS_HANDSHAKE + /liv-ai-app/openclawos handle from caddy.ts + tests (R09, R10)`**
   - REMOVE: R09 (caddy.ts emit surfaces), R10 (caddy.test.ts describe blocks + 2 new Phase 231 negative-grep tests)
   - Verify: vitest PASS for `modules/domain/caddy.test.ts` including new negative tests

4. **`feat(231-01): remove LIV_AI_CHAT dock/window/dock-test entries (R11-R13)`**
   - REMOVE: R11 (dock.tsx tile blocks), R12 (window-content.tsx const + Set entry + branch + lazy import), R13 (dock.test.tsx Test 4 + comment bullet + add 1 new negative-grep test)
   - Verify: vitest PASS for `dock.test.tsx`; `pnpm --filter @livos/ui typecheck` PASS; `pnpm --filter @livos/config build && pnpm --filter ui build` PASS (catches dangling LIV_AI_CHAT imports elsewhere)

5. **(Skipped)** `chore(231-01): mv livos/packages/liv-claw-os → attic/liv-claw-os` — Task 5 = **N/A** per R15+R16. SUMMARY will document the N/A with full rationale.

## Sacred SHA evidence (start of Plan 01)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

✅ Matches expected. Every subsequent commit must preserve this SHA (pre-commit
hook gates it).
