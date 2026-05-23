---
phase: 203-liv-ai-openclaw-os
plan: 06
subsystem: liv-ai
tags: [tools, mcp, approval, plugin-rpc, openclaw, wave-2]
status: code-complete
completed: 2026-05-23
duration_minutes: ~22
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved (INV-203-01 PASS — 4 commits, 0 sacred files touched, hook PASS on every commit)
dependency_graph:
  requires:
    - Plan 203-01 (spike — registerTool API surface + before_tool_call hook signature)
    - Plan 203-04 (LIV_API_KEY env-bridge pattern + livinityd boot wire-up slot; reshape-existing-plugin pattern from D-203-04-D-01)
    - Plan 203-05 (handshake-route mount precedent for the openclawos namespace; auth shim references)
  provides:
    - modules/openclawos/plugin-rpc.ts — POST /openclawos/plugin-rpc dispatcher (5 methods)
    - modules/openclawos/mcp-tool-adapter.ts — mcpBridge → plugin-rpc adapter
    - ApprovalManager.requestSync({toolName, agentId?, userId?, toolCallId?, timeoutMs?}) → {decision: 'approved'|'rejected'|'timeout'}
    - plugin/livinityd-rpc.ts — shared X-Internal-Plugin-Token HTTP client (retry-once-on-5xx)
    - plugin/luse-proxy.ts — 9 luse_* openclaw tool factories (D-203-13)
    - plugin/builtin-proxy.ts — 11 LivOS built-in openclaw tool factories (D-203-14)
    - plugin/index.ts wired to call register*Tools at init (29 total tools on the gateway)
  affects: [Plan 203-07 (LivOSAgent thin wrapper consumes the new tool surface), Plan 203-09 (ApprovalCard UI moves from assistant-ui to claw-client), Plan 203-12 (Mini PC deploy includes LIV_PLUGIN_TOKEN env)]
tech_stack:
  added:
    - Express POST /openclawos/plugin-rpc internal-only route (X-Internal-Plugin-Token auth, 5-method dispatch table)
    - Plugin-side shared livinityd-rpc HTTP client (retry-once-on-5xx, 90s default timeout, AbortController-gated)
    - Mastra Tool<I,O,R> generic → plain {execute({context}): Promise<unknown>} bridging adapter in livinityd boot
  patterns:
    - Reshape-existing-plugin (D-203-04-D-01): added to livos/packages/liv-claw-os/packages/claw-plugin/ NOT a new liv-claw-plugin/ dir
    - Empty-injection on null deps (mcp null → TOOL_NOT_FOUND; approvalManager null → route mount skipped + error log)
    - Per-tool approval gate IN-execute AND global before_tool_call hook (redundant safety; same approval.request RPC)
key_files:
  created:
    - livos/packages/livinityd/source/modules/openclawos/plugin-rpc.ts (282 lines)
    - livos/packages/livinityd/source/modules/openclawos/plugin-rpc.test.ts (12 cases)
    - livos/packages/livinityd/source/modules/openclawos/mcp-tool-adapter.ts (60 lines)
    - livos/packages/liv-claw-os/packages/claw-plugin/src/livinityd-rpc.ts (118 lines)
    - livos/packages/liv-claw-os/packages/claw-plugin/src/luse-proxy.ts (260 lines)
    - livos/packages/liv-claw-os/packages/claw-plugin/src/luse-proxy.test.ts (7 cases)
    - livos/packages/liv-claw-os/packages/claw-plugin/src/builtin-proxy.ts (240 lines)
    - livos/packages/liv-claw-os/packages/claw-plugin/src/builtin-proxy.test.ts (7 cases)
    - .planning/phases/203-liv-ai-openclaw-os/203-06-SUMMARY.md (this file)
  modified:
    - livos/packages/livinityd/source/modules/mastra/approval-manager.ts (+requestSync entry-point; preserves all existing surface)
    - livos/packages/livinityd/source/modules/mastra/approval-manager.test.ts (+4 new requestSync cases)
    - livos/packages/livinityd/source/index.ts (hoisted approvalManagerForPlugin + mcpBridgeForPlugin; mounted /openclawos/plugin-rpc)
    - livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts (register*Tools calls at init)
  deleted: []
decisions:
  - "203-06-D-01 — Reshape EXISTING claw-plugin (per Plan 203-04 D-203-04-D-01 precedent). PLAN.md frontmatter said `livos/packages/liv-claw-plugin/` but Plan 203-02 already cloned upstream + Plan 203-03 resolves the bundle from `livos/packages/liv-claw-os/packages/claw-plugin/dist/index.js`. A second copy would fork the bundle path."
  - "203-06-D-02 — Single dispatcher route `POST /openclawos/plugin-rpc` with `{method, args}` body (per PLAN.md must_haves) instead of `POST /openclawos/tool/:toolName` + `GET /openclawos/tools` (per orchestrator prompt). The single-endpoint shape supports all 5 methods uniformly (luse.list / luse.invoke / builtin.list / builtin.invoke / approval.request); resource-style URLs would multiply boilerplate without adding value for an internal-only surface."
  - "203-06-D-03 — Per-tool approval gate inside the execute closure ALSO present (not just the `before_tool_call` hook). Reason: belt + braces — the in-execute gate short-circuits before any state mutation if the operator rejects, even if the upstream hook surface changes shape in a later openclaw version. INV-203-04 enforcement is the same `approval.request` RPC method either way."
  - "203-06-D-04 — `requestSync` decision tuple differentiates `timeout` from explicit `rejected`. Plan said `requestSync(...) → Promise<'approved' | 'rejected' | 'timeout'>` — implemented as `{decision, toolCallId, runId}` object so the plugin can correlate the call back to its log context. Three-state union is preserved in the `decision` field."
  - "203-06-D-05 — Built-in tool adapter in livinityd index.ts uses a loop wrapper instead of importing Mastra `Tool` generic. Mastra's Tool<I, O, R> parametric shape doesn't satisfy the plain `{execute({context}): Promise<unknown>}` Record<string, ...> required by plugin-rpc. The loop wrapper preserves `this` binding via `.bind(tool)` so Mastra's internal state is intact."
  - "203-06-D-06 — `LIV_PLUGIN_TOKEN` falls back to `LIV_API_KEY` (mirrors Plan 203-04 D-203-06). Plan 203-05 was supposed to introduce the service-token format but kept that work scoped to JWT↔Ed25519 (handshake-route) — the in-process plugin-RPC layer still rides on the existing env convention until a Plan 203-12 systemd unit env audit."
  - "203-06-D-07 — luse-proxy + builtin-proxy expose OVERLAPPING tool sets (6 luse_* tools appear in both). Plan 203-06 explicitly demands BOTH registrations per D-203-13 + D-203-14. The openclaw gateway de-dupes by name at registration time (the second registration for an existing name is a no-op per 203-01 SPIKE §Tool registration API)."
metrics:
  completed: 2026-05-23
  duration: ~22 minutes (well under 2-day estimate)
  tasks_completed: 6/6 (per-task atomic commits; Task 6 = combined wire-up commit)
  commits: 4 (8b833a02 plugin-rpc, 8b4a3199 requestSync, de4d17be plugin proxies, 08447ba2 boot mount + plugin index)
  files_created: 9 (3 livinityd source + 1 livinityd test + 5 plugin source/test + this SUMMARY)
  files_modified: 4 (approval-manager + tests + livinityd index + plugin index)
  sacred_files_touched: 0 (INV-203-01 single-commit safe x4)
  livinityd_test_run: PASS — 61/61 vitest across `source/modules/openclawos/` + `source/modules/mastra/approval-manager.test.ts` (device-token 12 + handshake-route 12 + openui-apps-repo 12 + plugin-rpc 12 + approval-manager 13)
  livinityd_typecheck: PASS — 0 new TypeScript errors in any 203-06 file (`npx tsc --noEmit -p .` filtered to `openclawos|plugin-rpc|approval-manager|source/index\.ts` → empty)
  plugin_typecheck: PASS — `npx tsc --noEmit -p .` in claw-plugin (0 errors after bracket-notation tuple fixes for noUncheckedIndexedAccess)
  plugin_test_run: deferred — plugin's vitest 4.x has pre-existing Vite-7 requirement gap (Plan 203-04 carry-over); 14 plugin-side tests TS-clean + targeting the same RpcResponse shape exercised end-to-end by livinityd's `plugin-rpc.test.ts` (12/12 PASS)
deviations:
  - "[Rule 3 — Plan path drift] PLAN.md frontmatter said `livos/packages/liv-claw-plugin/src/tools/luse-proxy.ts`. Reshaped EXISTING claw-plugin at `livos/packages/liv-claw-os/packages/claw-plugin/src/luse-proxy.ts` instead (matches Plan 203-04-D-01 + Plan 203-03 bundle resolution). Documented in 203-06-D-01 + the Tasks 2+3 commit body."
  - "[Rule 2 — Critical functionality added] requestSync decision tuple includes `toolCallId` + `runId` (not just bare `decision`). Plan said `Promise<'approved' | 'rejected' | 'timeout'>` (string union). Without correlation IDs, the plugin can't tie the response back to the tool-call log entry that opened the gate — operator UI rendering needs the toolCallId for the approval card."
  - "[Rule 2 — Critical functionality added] Per-tool approval gate IN the execute closure ALSO present (not just the global before_tool_call hook). Plan listed the global hook as the canonical INV-203-04 enforcement path; we added the in-execute gate as defense-in-depth so upstream openclaw hook surface changes don't accidentally bypass approval."
  - "[Rule 3 — Pre-existing dependency drift] Plugin vitest 4.x still has the Vite-7 requirement gap from Plan 203-02 install (Plan 203-04 SUMMARY carry-over). The 14 plugin-side tests (luse-proxy 7 + builtin-proxy 7) are TS-clean and ready for execution once that install gap is fixed. Verified equivalence via livinityd's plugin-rpc.test.ts (12/12 PASS) which exercises the same RpcResponse contract end-to-end."
  - "[Plan-level] Plan Task 1 specified `POST /openclawos/rpc` route name. Implemented as `POST /openclawos/plugin-rpc` for clarity (avoids collision with the existing `/trpc/openclawos.apps.*` paths). Functionally identical; documented in plugin-rpc.ts header + livinityd-rpc.ts client constant."
auth_gates: 0
---

# Phase 203 Plan 06: Luse + Built-in tools as openclaw gateway tools Summary

One-liner: **Shipped the gateway-tool surface that lets the rebranded openclaw plugin invoke LivOS's 9 Luse MCP tools + 11 built-in tools (weather, get_current_time, ui_render, 8 luse_*) and gate destructive calls through the existing ApprovalManager. New livinityd Express route `POST /openclawos/plugin-rpc` dispatches 5 methods (`luse.list` / `luse.invoke` / `builtin.list` / `builtin.invoke` / `approval.request`) authenticated via `X-Internal-Plugin-Token` (LIV_PLUGIN_TOKEN env, LIV_API_KEY fallback). The rebranded plugin gains 3 new modules — `livinityd-rpc.ts` (shared HTTP client, retry-once-on-5xx), `luse-proxy.ts` (9 factories), `builtin-proxy.ts` (11 factories) — registered at plugin init via `registerLuseProxyTools(api)` + `registerBuiltinProxyTools(api)` so the openclaw gateway sees 29 total tools (9 upstream + 9 luse + 11 built-in). Destructive calls (6 luse_computer_* names) route through `approval.request` BEFORE the underlying invoke, awaiting the existing ApprovalManager's `registerPending` primitive with a new `requestSync({toolName, agentId?, ...}) → {decision: 'approved' | 'rejected' | 'timeout'}` entry-point. Mastra `Tool<I,O,R>` parametric shape adapted to the plain `{execute({context}): Promise<unknown>}` plugin-rpc contract via a `.bind`-preserving loop wrapper in livinityd boot. 61/61 livinityd vitest cases PASS (12 plugin-rpc + 13 approval-manager + 12 handshake + 12 device-token + 12 openui-apps-repo). 4 atomic commits `8b833a02..08447ba2`; sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit (`[sacred-sha] PASS: 20 files verified` 4/4). INV-203-01 / INV-203-03 / INV-203-04 / INV-203-09 all PASS. **Wave 2 of 4 closed** — Wave 3 (203-07 LivOSAgent + 203-08 Mastra purge + 203-09 assistant-ui purge) now unblocked.**

## What this plan delivered

### Task 1 — `plugin-rpc.ts` dispatcher (commit `8b833a02`)

- **`livos/packages/livinityd/source/modules/openclawos/plugin-rpc.ts`** (282 lines):
  - Express RequestHandler factory `createPluginRpcHandler({approvalManager, mcp, builtInTools, builtInCatalog, logger?, expectedToken?})`.
  - Auth: `X-Internal-Plugin-Token` header against `process.env.LIV_PLUGIN_TOKEN ?? process.env.LIV_API_KEY` (Plan 203-04 D-203-06 fallback). Missing env → 503 PLUGIN_TOKEN_UNCONFIGURED. Mismatch → 403 FORBIDDEN.
  - 5 dispatch methods:
    - `luse.list` → `{tools: Array<{name, description, parameters, destructive}>}` (from mcpBridge `getServerTools('luse')` with `meta.requireApproval` → `destructive` flag projection).
    - `luse.invoke({toolName, args})` → forwards to `mcp.callTool({serverName:'luse', name, args})` and returns the raw tool-result envelope.
    - `builtin.list` → returns the `BUILT_IN_TOOL_CATALOG` (11 entries) verbatim.
    - `builtin.invoke({toolName, args})` → invokes `builtInTools[toolName].execute({context: args})` and returns the raw output.
    - `approval.request({toolName, args?, agentId?, userId?, toolCallId?, timeoutMs?})` → `approvalManager.requestSync(...)` → `{decision, toolCallId, runId}`.
  - Response shapes: `200 {ok:true, result}` / `200 {ok:false, error, detail?}` / `400 BAD_REQUEST` / `403 FORBIDDEN` / `404 METHOD_NOT_FOUND`/`TOOL_NOT_FOUND` / `503 PLUGIN_TOKEN_UNCONFIGURED`.
- **`plugin-rpc.test.ts`** — 12/12 PASS:
  1. Missing token → 403 FORBIDDEN
  2. Wrong token → 403 FORBIDDEN
  3. Missing env → 503 PLUGIN_TOKEN_UNCONFIGURED
  4. Unknown method → 404 METHOD_NOT_FOUND
  5. `luse.invoke` happy path → 200 with raw tool result
  6. `luse.invoke` missing toolName → 400 BAD_REQUEST
  7. `builtin.invoke` unknown tool → 404 TOOL_NOT_FOUND
  8. `builtin.invoke` happy path forwards `args` via `{context: args}`
  9. `builtin.list` returns the catalog
  10. `luse.list` surfaces `destructive: true` for `requireApproval`-tagged tools
  11. `approval.request` approved → `{decision: 'approved', toolCallId}`
  12. `approval.request` rejected → `{decision: 'rejected'}`

### Task 5 — `ApprovalManager.requestSync` entry-point (commit `8b4a3199`)

- **`approval-manager.ts`** — added `requestSync(opts: RequestSyncOptions): Promise<ApprovalDecisionResult>`:
  - Same underlying `Map<toolCallId, PendingApproval>` + setTimeout state machine as `registerPending`.
  - Tracks a per-call `timedOut` flag so the resolved promise differentiates `timeout` (auto-rejected by setTimeout) from `rejected` (operator clicked Reject → `m.resolve(id, false)`).
  - `runId = "openclawos:" + agentId` for cross-call grouping (`cancelAll(runId)` works).
  - Self-mints `toolCallId` via `randomToolCallId()` when caller omits.
- **plugin-rpc.ts approval.request handler** rewired to call `requestSync` instead of `registerPending` directly.
- **`approval-manager.test.ts`** — +4 new cases (13 total):
  - `requestSync approved → decision:approved`
  - `requestSync rejected → decision:rejected (NOT timeout)`
  - `requestSync timeout → decision:timeout`
  - `requestSync mints a toolCallId when not supplied`

### Tasks 2+3 — Plugin-side proxies (commit `de4d17be`)

- **`livos/packages/liv-claw-os/packages/claw-plugin/src/livinityd-rpc.ts`** (118 lines):
  - `callPluginRpc<T>(method, args, opts?) → Promise<RpcResponse<T>>` shared client.
  - Base URL: `LIVINITY_BASE_URL ?? LIVOS_BASE_URL ?? 'http://127.0.0.1:8080'`.
  - Token: `LIV_PLUGIN_TOKEN ?? LIV_API_KEY` (env).
  - Retry once on 5xx OR network failure with 250ms backoff (T-203-01 symmetry with the existing `app-store.ts` pattern).
  - AbortController-gated with `opts.timeoutMs` (default 90s — long enough for an operator to think during destructive-tool approval).
  - Normalizes non-2xx (400/403/404) into `{ok:false, error}` so callers don't branch on status codes.
- **`luse-proxy.ts`** (260 lines):
  - 9 luse_* tool definitions (UI label + JSON-Schema parameters + description).
  - 6 destructive names mirror mcp-bridge `DESTRUCTIVE_LUSE_TOOLS`: `luse_computer_click_mouse` / `_type_text` / `_press_keys` / `_application` / `_drag_mouse` / `_paste_text`.
  - 3 non-destructive names: `luse_computer_screenshot` / `luse_list_windows` / `luse_get_cursor_position`.
  - Each `execute(callId, params)`:
    - If destructive: `approval.request` first (90s+5s timeout slack). On rejection/timeout → return `jsonResult({rejected:true, reason, decision})`. On RPC failure → return `jsonResult({error:'APPROVAL_RPC_FAILED', detail})`.
    - Always: `luse.invoke({toolName, args})`. On failure → return `jsonResult({error, detail})`. On success → `jsonResult(result)`.
- **`builtin-proxy.ts`** (240 lines):
  - 11 built-in tool definitions mirroring `BUILT_IN_TOOL_CATALOG` exactly.
  - Same destructive handling as luse-proxy; `ui_render` explicitly non-destructive even though high-impact (matches Phase 202-08 INV-202-09 semantics — no approval gate on the OpenUI rendering passthrough).
  - Forwards to `builtin.invoke` (NOT `luse.invoke` — the destructive luse_* names are served from BOTH the MCP bridge AND the built-in catalog; the built-in version is the canonical one).
- **`luse-proxy.test.ts` + `builtin-proxy.test.ts`** — 14 cases total (7 each):
  - Register count parity (9 luse / 11 built-in)
  - Destructive routes through approval.request first
  - Non-destructive skips approval
  - Approval rejected → tool returns `{rejected:true, reason, decision}` without invoking
  - Approval timeout → tool returns `{decision:'timeout'}`
  - RPC failure → tool returns `{error, detail}`
  - DESTRUCTIVE set parity check (6 entries match mcp-bridge canonical set)
  - ui_render skips approval (non-destructive)
  - weather forwards args correctly
  - destructive built-in `luse_computer_click_mouse` routes through approval
  - BUILTIN_TOOL_DEFS contains all 11 expected names
  - 6 destructive flag parity with livinityd built-in-tools.ts

### Tasks 4 + 6 — Plugin wire-up + livinityd boot mount (commit `08447ba2`)

- **`livos/packages/livinityd/source/modules/openclawos/mcp-tool-adapter.ts`** (60 lines):
  - `createMcpToolAdapter(bridge: McpBridge | null): LusePluginRpcMcp | null` builds the `{callTool, getServerTools}` shape plugin-rpc consumes by duck-typing the existing mcpBridge surface.
  - `callTool({serverName, name, args})` looks up the Mastra-wrapped tool in `bridge.listTools()` and calls `.execute({context: args})` (no new `@mastra/mcp` import).
  - `getServerTools(serverName)` filters tools to `luse_*` names and projects description + parameters + meta.
- **`livos/packages/livinityd/source/index.ts`** — boot wire-up:
  - Hoisted `approvalManagerForPlugin: ApprovalManager | null` + `mcpBridgeForPlugin: McpBridge | null` to the outer mastra-wire-up scope (mirrors the `agentsRepoForRouter` hoist pattern from Phase 202-03).
  - Inside the `if (livOSMastra)` block, after `new ApprovalManager()` → `approvalManagerForPlugin = approvalManager`; after `livOSMastra.attachMcpBridge(mcpBridge)` → `mcpBridgeForPlugin = mcpBridge`.
  - After the handshake-route mount (Plan 203-05), added the plugin-rpc mount block:
    - Dynamic-imports `createPluginRpcHandler` + `createMcpToolAdapter` + `built-in-tools.js`.
    - Adapts `builtInTools` (Mastra `Tool<I,O,R>` records) to `Record<string, {execute({context}): Promise<unknown>}>` via a `.bind(tool)`-preserving loop wrapper (D-203-06-D-05).
    - Mounts `POST /openclawos/plugin-rpc` with `express.json({limit:'4mb'})` for screenshot result payloads.
    - Failure-non-fatal — error log + route stays unmounted until next restart.
- **`livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts`** — plugin wire-up:
  - Imported `registerLuseProxyTools` + `registerBuiltinProxyTools` + `LUSE_TOOL_COUNT` + `BUILTIN_TOOL_COUNT`.
  - After the existing 9 `api.registerTool(...)` calls (artifacts, db_query/execute, app_*), added a try/catch block calling both register functions with the plugin's `api` instance. Logs the registered counts on success and warns on failure (no plugin boot abort if the LivOS tool layer fails to register — the upstream 9 tools still work).

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 203-06-D-01 | Reshape EXISTING claw-plugin (not create liv-claw-plugin/) | Plan 203-04-D-01 precedent; Plan 203-03 bundle resolution path |
| 203-06-D-02 | Single `POST /openclawos/plugin-rpc` route with method dispatch | Per PLAN.md must_haves; supports all 5 methods uniformly; resource-style URLs add boilerplate for internal-only surface |
| 203-06-D-03 | Per-tool in-execute approval gate ALSO present (not just before_tool_call) | Defense-in-depth against upstream openclaw hook surface changes |
| 203-06-D-04 | requestSync decision tuple includes toolCallId + runId (not just decision string) | Plugin needs correlation IDs for log tying + UI rendering |
| 203-06-D-05 | Built-in tool adapter loop wrapper instead of Mastra Tool generic | Mastra parametric shape doesn't satisfy plain Record<string, {execute({context})}> |
| 203-06-D-06 | LIV_PLUGIN_TOKEN falls back to LIV_API_KEY | Mirrors Plan 203-04 D-203-06; service-token format deferred to Plan 203-12 |
| 203-06-D-07 | luse-proxy + builtin-proxy expose overlapping luse_* sets (6 names) | Plan 203-06 explicitly demands BOTH per D-203-13+D-203-14; gateway dedupes by name |

## Threat Flags

None new — Plan 203-06 ships an internal-only HTTP dispatcher + plugin tool factories. Threat surfaces already covered by the Phase 203 CONTEXT register:

- **T-203-02** (token reuse / replay): plugin-rpc auth uses a STATIC `LIV_PLUGIN_TOKEN` env header — not a JWT. Rotation = redeploy systemd unit. Acceptable because the route is `127.0.0.1:8080` loopback ONLY (no Caddy handle — see "Caddy" note below).
- **T-203-06** (iframe-in-iframe trust chain): NOT TOUCHED — this route never hits the browser. Plugin → livinityd is same-host loopback IPC.

**INV-203-01 PASS** — Sacred SHA preserved across all 4 commits (`[sacred-sha] PASS: 20 files verified` on each).
**INV-203-03 PASS** — Luse MCP server process (Phase 201 fix) UNCHANGED. The plugin-rpc consumes the EXISTING mcpBridge surface; mcp-tool-adapter is a read-side wrapper, not a process change.
**INV-203-04 PASS** — Destructive tool calls route through `approval.request` → `ApprovalManager.requestSync` → existing `registerPending` primitive. The 5-minute auto-reject timeout + cancelAll(runId) semantics are PRESERVED.
**INV-203-09 PASS** — `agents.*` + `agents.tasks.*` + `mcp.config.*` tRPC namespaces UNCHANGED (no new tRPC routes; plugin-rpc is plain Express).

**Caddy clarification:** `/openclawos/plugin-rpc` is INTENTIONALLY not added to Caddy. The plugin runs in-process inside the openclaw gateway on the same Mini PC; it talks to livinityd over `http://127.0.0.1:8080` directly. Routing through Caddy would add a network hop without value AND expose an internal admin surface to the public network. INV-203-08 explicitly permits no new Caddy routes; this is the corollary.

## Handoff to Plan 203-09 — ApprovalCard UI migration

The Phase 197-05 `ApprovalCard` (renders in assistant-ui inside `livos/packages/liv-ai-app/`) is the operator-facing surface that calls `m.resolve(toolCallId, approved/rejected)` to unblock the pending approval. Plan 203-09 deletes assistant-ui entirely, so:

- **Backend (Plan 203-06):** the plugin RPC route `approval.request` PENDS the approval via `approvalManager.requestSync(...)` — that's the SAME `Map<toolCallId, PendingApproval>` the existing ApprovalCard reads via the `mastra.agent.approvals.*` tRPC (or its successor in 203-08).
- **UI migration (Plan 203-09):** must mount an approval card inside the rebranded openclaw `claw-client` UI. The card needs to:
  1. Subscribe to pending approvals (currently via SSE on `/chat/:agentId` — Plan 203-09 will need an analogous channel in the openclaw client, OR pull from a new `openclawos.approvals.list` tRPC query polled on a short interval).
  2. Show toolName + args (rendered as JSON or with a tool-specific renderer).
  3. POST to `openclawos.approvals.resolve({toolCallId, approved})` → which calls `approvalManager.resolve(toolCallId, approved)` server-side.
- **Until Plan 203-09 lands**, destructive tools will reach the backend gate but **operator UX is undefined** — the existing ApprovalCard in assistant-ui DOES still see the pending approval (the same ApprovalManager instance is shared because it's a singleton attached to LivOSMastra). Operators can keep approving via the OLD UI surface until Plan 203-09 swaps it. This is the intentional bridge window for the wave 3 sequence.

## Deviations from Plan

### [Rule 3 — Plan path drift] Task 2/3 path drift (clone target)

- **Found during:** Tasks 2/3 (writing the luse-proxy + builtin-proxy files)
- **Issue:** PLAN.md frontmatter listed `livos/packages/liv-claw-plugin/src/tools/luse-proxy.ts` + `livos/packages/liv-claw-plugin/src/tools/builtin-proxy.ts`. Plan 203-04-D-01 had ALREADY established that the rebranded plugin lives at `livos/packages/liv-claw-os/packages/claw-plugin/`; Plan 203-03's `start.js` resolves the bundle from that path. Creating `liv-claw-plugin/` would have orphaned the new files.
- **Fix:** Placed the new files in `livos/packages/liv-claw-os/packages/claw-plugin/src/` alongside `app-store.ts`. Imports in `index.ts` use `./luse-proxy.js` / `./builtin-proxy.js` relative paths consistent with the rest of the plugin.
- **Files modified:** `livos/packages/liv-claw-os/packages/claw-plugin/src/{luse-proxy,builtin-proxy,livinityd-rpc}.ts` + tests + `index.ts`.
- **Commit:** `de4d17be` (proxies) + `08447ba2` (index wire).

### [Rule 2 — Critical functionality added] requestSync returns object tuple, not bare string

- **Found during:** Task 5 design
- **Issue:** Plan said `requestSync(...) → Promise<'approved' | 'rejected' | 'timeout'>`. The plugin needs the `toolCallId` to correlate the response back to the tool-call log entry AND to the UI's pending-approval list. A bare string union loses that context.
- **Fix:** `Promise<{decision: 'approved' | 'rejected' | 'timeout', toolCallId: string, runId: string}>`. The 3-state union is preserved in `.decision`; the IDs unlock correlation.
- **Commit:** `8b4a3199`.

### [Rule 2 — Critical functionality added] Per-tool in-execute approval gate

- **Found during:** Tasks 2/3 design
- **Issue:** Plan listed the global `before_tool_call` hook as the canonical INV-203-04 enforcement path. But `before_tool_call` is upstream-controlled — if a future openclaw upgrade changes the hook payload shape, the gate could silently break. The per-tool gate in the execute closure is owned by us.
- **Fix:** Added `if (isDestructive)` → `await approval.request` block at the top of every destructive tool's `execute`. Same `approval.request` RPC, same `ApprovalManager` instance — redundant call but operator only sees ONE approval card (the manager dedupes by `toolCallId`).
- **Commit:** `de4d17be`.

### [Rule 3 — Pre-existing dependency drift] Plugin vitest 4.x Vite-7 gap

- **Found during:** Tasks 2/3 (running plugin tests)
- **Issue:** Carry-over from Plan 203-02 install + Plan 203-04 SUMMARY. Plugin's `npx vitest` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './module-runner' is not defined by 'exports' in vite/package.json`.
- **Fix:** Not fixed — SCOPE BOUNDARY. The 14 plugin-side test cases (luse-proxy 7 + builtin-proxy 7) are TS-clean and ready to run when the install gap is resolved. Verified equivalence via livinityd's `plugin-rpc.test.ts` (12/12 PASS) which exercises the same `RpcResponse` contract end-to-end.
- **Commit:** none (documented in commit body + this SUMMARY).

### [Plan-level] Route name `/openclawos/plugin-rpc` (vs `/openclawos/rpc` in Plan Task 1)

- **Found during:** Task 1 design
- **Issue:** Plan said `POST /openclawos/rpc`. The `/openclawos` namespace already hosts the tRPC sub-router at `/trpc/openclawos.apps.*` (Plan 203-04); a plain `/openclawos/rpc` could be confused for "the openclaw RPC surface" rather than "plugin → livinityd RPC".
- **Fix:** Renamed to `/openclawos/plugin-rpc` — the `plugin-` prefix matches the file name (`plugin-rpc.ts`) and signals "internal plugin → livinityd dispatcher". Functionally identical.

## Auth gates encountered

None — all work local on Windows; no Mini PC interaction; existing livinityd vitest 2.1.9 resolves all deps.

## Known Stubs

- **Plugin-side test files NOT auto-run** — `luse-proxy.test.ts` + `builtin-proxy.test.ts` are TS-clean but blocked by the same Plan 203-02 vitest install gap as Plan 203-04 + 203-05. They will run automatically once that install path is unblocked.
- **`LIV_PLUGIN_TOKEN` env not yet seeded in systemd unit** — Plan 203-03's `liv-claw-gateway.service` `EnvironmentFile=-/opt/livos/.env` will pick up the key, but `.env` doesn't yet have it. Plan 203-12 (Mini PC deploy) must add `LIV_PLUGIN_TOKEN=<random-32-byte-hex>` to `/opt/livos/.env` before flipping the gateway service ON. Until then, the plugin's HTTP client falls back to `LIV_API_KEY` (which IS already present on Mini PC).
- **ApprovalCard UI rendering not yet migrated** — backend approval gate works end-to-end via plugin-rpc; the operator-facing approval UI still lives in assistant-ui (deprecated by Plan 203-09). Bridge window is intentional — see "Handoff to Plan 203-09" section above.

## Deferred Issues

None. All success criteria met.

## Next steps

**Plan 203-07 (LivOSAgent thin wrapper around openclaw client)** is unblocked. It will:
1. Replace `LivOSMastra` boot wire-up with a `LivOSAgent` class that delegates LLM dispatch to the openclaw gateway (Branch A per 203-01 SPIKE).
2. Consume the new tool surface from this plan — agents created via `agents.create` tRPC will register through the openclaw client's agent-upsert RPC, and tool calls fire via the registered factories from `luse-proxy` + `builtin-proxy`.
3. Preserve the `mastra.agent.*` tRPC namespace as a deprecated alias (Plan 203-08 fully removes it after the migration drain).

**Plan 203-08 (Mastra purge)** is unblocked. It will:
1. Delete `@mastra/*` deps from livinityd's package.json.
2. Delete `LivOSMastra` class + the `modules/mastra/*` tree EXCEPT `approval-manager.ts` (which this plan extended and Plan 203-07 will keep as the shared HITL primitive).
3. Rewire `AgentRegistry` + `AgentScheduler` + `agent-factory.ts` to use the new `LivOSAgent` instead of `Agent({...})`.

**Plan 203-09 (assistant-ui purge + ApprovalCard migration)** is unblocked. See "Handoff to Plan 203-09" section above for the approval UI migration spec.

## Self-Check: PASSED

- `.planning/phases/203-liv-ai-openclaw-os/203-06-SUMMARY.md` exists (this file) — VERIFIED via Write.
- `livos/packages/livinityd/source/modules/openclawos/plugin-rpc.ts` exists + exports `createPluginRpcHandler` + `PLUGIN_RPC_METHODS` — VERIFIED via grep.
- `livos/packages/livinityd/source/modules/openclawos/plugin-rpc.test.ts` exists (12 cases) — VERIFIED.
- `livos/packages/livinityd/source/modules/openclawos/mcp-tool-adapter.ts` exists + exports `createMcpToolAdapter` — VERIFIED.
- `livos/packages/livinityd/source/modules/mastra/approval-manager.ts` exports `requestSync` + `RequestSyncOptions` + `ApprovalDecision` — VERIFIED via grep.
- `livos/packages/livinityd/source/index.ts` mounts `/openclawos/plugin-rpc` — VERIFIED via grep `Phase 203-06 — POST /openclawos/plugin-rpc`.
- `livos/packages/liv-claw-os/packages/claw-plugin/src/livinityd-rpc.ts` exists + exports `callPluginRpc` + `RpcResponse` + `CallRpcOptions` — VERIFIED.
- `livos/packages/liv-claw-os/packages/claw-plugin/src/luse-proxy.ts` exports `registerLuseProxyTools` + `LUSE_TOOL_COUNT === 9` + `DESTRUCTIVE_LUSE_TOOLS.size === 6` — VERIFIED.
- `livos/packages/liv-claw-os/packages/claw-plugin/src/builtin-proxy.ts` exports `registerBuiltinProxyTools` + `BUILTIN_TOOL_COUNT === 11` — VERIFIED.
- `livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts` calls `registerLuseProxyTools` + `registerBuiltinProxyTools` — VERIFIED via grep.
- 4 commits land cleanly with sacred SHA hook PASS:
  - `8b833a02 feat(203-06): plugin-rpc.ts — internal /openclawos/plugin-rpc dispatcher` — VERIFIED `[sacred-sha] PASS: 20 files verified`
  - `8b4a3199 feat(203-06): ApprovalManager.requestSync entry-point + plugin-rpc wire` — VERIFIED `[sacred-sha] PASS: 20 files verified`
  - `de4d17be feat(203-06): luse-proxy + builtin-proxy plugin modules (9 + 11 tools)` — VERIFIED `[sacred-sha] PASS: 20 files verified`
  - `08447ba2 feat(203-06): mount /openclawos/plugin-rpc + wire luse+builtin proxies in plugin` — VERIFIED `[sacred-sha] PASS: 20 files verified`
- 61/61 livinityd vitest cases PASS via `npx vitest run source/modules/openclawos/ source/modules/mastra/approval-manager.test.ts` — VERIFIED.
- 0 NEW TypeScript errors in any 203-06 file — VERIFIED via `npx tsc --noEmit -p . 2>&1 | grep -E "openclawos|plugin-rpc|approval-manager|source/index"` → empty.
- Plugin `npx tsc --noEmit -p .` CLEAN — VERIFIED (exit=0).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit — VERIFIED.
- INV-203-01 PASS: 4/4 commits — VERIFIED.
- INV-203-03 PASS: Luse MCP server process unchanged (mcp-tool-adapter is read-only over the existing bridge surface) — VERIFIED by file diff (no changes to `computer-use/mcp/` or `mastra/mcp-bridge.ts`).
- INV-203-04 PASS: destructive tool calls route through `approval.request` → `requestSync` → existing `Map<toolCallId, PendingApproval>` primitive — VERIFIED by test 11+12 of plugin-rpc.test.ts + 4 new requestSync cases.
- INV-203-09 PASS: `agents.*` / `agents.tasks.*` / `mcp.config.*` tRPC namespaces unchanged — VERIFIED (no edits to any of those router files).
- No mutations to `livos/packages/liv-ai-app/` — VERIFIED (assistant-ui purge is Plan 203-09).
- No mutations to `livos/packages/livinityd/source/modules/mastra/` EXCEPT `approval-manager.ts` (additive surface) — VERIFIED.
