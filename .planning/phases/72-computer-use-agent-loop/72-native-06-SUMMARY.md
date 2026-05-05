---
phase: 72-computer-use-agent-loop
plan: native-06
subsystem: computer-use
tags: [computer-use, mcp-config, livinityd-boot, native-arch, bytebot]
requirements: [CU-LOOP-06]
dependency-graph:
  requires:
    - "72-native-05 (bytebot-mcp/server.ts entry-point exists)"
    - "@nexus/core mcp-config-manager.ts (Redis CRUD + Pub/Sub)"
    - "@nexus/core mcp-client-manager.ts ALLOWED_COMMANDS allowlist"
  provides:
    - "registerBytebotMcpServer — boot-time idempotent MCP config installer"
    - "@nexus/core/lib McpConfigManager + types export"
    - "ALLOWED_COMMANDS now permits 'tsx'"
  affects:
    - "livinityd boot lifecycle (mountAgentRunsRoutes path)"
    - "nexus McpClientManager reconcile behaviour (picks up bytebot via Pub/Sub)"
tech-stack:
  added: []
  patterns:
    - "Idempotent register-on-boot with substantive-field comparator"
    - "Default-disabled / opt-in-by-env flag (BYTEBOT_MCP_ENABLED='true')"
    - "Graceful try/catch wrap — registration failure NEVER blocks daemon boot"
    - "Cross-process Redis Pub/Sub coordination (livinityd writes, nexus reconciles)"
key-files:
  created:
    - "livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts (262 LOC)"
    - "livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.test.ts (256 LOC)"
  modified:
    - "livos/packages/livinityd/source/modules/computer-use/index.ts (barrel append)"
    - "livos/packages/livinityd/source/modules/ai/agent-runs.ts (boot-wire + import)"
    - "nexus/packages/core/src/mcp-client-manager.ts (ALLOWED_COMMANDS += 'tsx')"
    - "nexus/packages/core/src/lib.ts (McpConfigManager + McpServerConfig type re-exports)"
decisions:
  - "Boot-wire site = inside mountAgentRunsRoutes immediately after RunStore construction (Rule 3 deviation — livinityd did NOT previously instantiate McpConfigManager; the natural site was here, where livinityd.ai.redis is in scope and the function runs once per daemon boot)"
  - "Idempotency comparator excludes installedAt — that field is a stamp set on every register call, comparing it would prevent any no-op path"
  - "lib.ts re-export of McpConfigManager (Rule 3 deviation) — without it livinityd would have to import from '@nexus/core' which pulls daemon side-effects (dotenv/config, channels/whatsapp.js dynamic import per agent-runs.ts header comment)"
  - "McpServerConfigStored simplified to type alias (was index-signature interface) to satisfy real McpConfigManager.listServers() return-type contract"
  - "Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` confirmed unchanged across 4 task gates"
metrics:
  duration_minutes: ~25
  completed: "2026-05-04"
  tasks_completed: 4
  files_created: 2
  files_modified: 4
  lines_added: ~592
---

# Phase 72 Plan native-06: livinityd-Boot bytebot MCP Config Registration Summary

**One-liner:** Boot-time, default-disabled registration of the bytebot computer-use stdio MCP server in livinityd's existing MCP-config Redis surface, gated by `BYTEBOT_MCP_ENABLED=true` + linux platform + server-file-exists, idempotent across reboots, with `tsx` added to nexus's MCP stdio allowlist so the spawned child process is permitted.

---

## What Shipped

### `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` (262 LOC, NEW)

Final exported signature (binding contract per plan `<interfaces>` block):

```typescript
import {access} from 'node:fs/promises'
import type {Redis} from 'ioredis'

export async function registerBytebotMcpServer(
  redis: Redis,
  env: NodeJS.ProcessEnv,
  configManager: McpConfigManagerLike,
  logger: BytebotMcpConfigLogger = defaultLogger,
): Promise<{registered: boolean; reason?: string}>
```

Module structure:
- **`DEFAULT_BYTEBOT_MCP_SERVER_PATH`** = `/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (Mini PC deploy path; greppable + documented)
- **`McpConfigManagerLike`** — duck-typed interface exposing `installServer / updateServer / listServers` (test stub injectable; the real `@nexus/core/lib` `McpConfigManager` satisfies this contract)
- **`McpServerConfigInput`** — minimal subset of `McpServerConfig` we read+write (name / transport / command / args / env / enabled / installedAt)
- **`McpServerConfigStored = McpServerConfigInput`** — type alias (was originally index-signature interface; simplified for compatibility with real `McpConfigManager.listServers()` return-type)
- **`resolveServerPath(env)`** — `env.BYTEBOT_MCP_SERVER_PATH ?? DEFAULT_BYTEBOT_MCP_SERVER_PATH` (whitespace-only override falls back to default)
- **`checkPreconditions(env)`** — runs the 3 gates: enabled flag, linux platform, file exists via `fs.access`
- **`buildBytebotConfig(env, path)`** — constructs canonical config (`{name:'bytebot', transport:'stdio', command:'tsx', args:[path], env:{DISPLAY, XAUTHORITY}, enabled:true, installedAt:Date.now()}`)
- **`configsMatch(existing, candidate)`** — substantive-field comparator (see "Idempotency Comparator" below)
- **`registerBytebotMcpServer(...)`** — orchestrates: gate → list → match-existing? no-op : update : install. Wraps everything in try/catch for graceful degradation.

### Resolved Server-Path Strategy

```
BYTEBOT_MCP_SERVER_PATH (env, optional)
   ↓ (if unset OR whitespace-only)
DEFAULT_BYTEBOT_MCP_SERVER_PATH = '/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts'
```

Probed via `fs.access(path)`; ENOENT → returns `{registered: false, reason: 'server file not found at <path> (ENOENT)'}`.

### Idempotency Comparator Fields

`configsMatch(existing, candidate)` triggers `updateServer` ONLY when ANY of the following differs:

| Field          | Comparator                            |
| -------------- | ------------------------------------- |
| `name`         | strict equality                       |
| `transport`    | strict equality                       |
| `command`      | strict equality                       |
| `enabled`      | strict equality                       |
| `args[]`       | length + element-wise strict equality |
| `env{}`        | sorted-keys + per-key strict equality |

**Excluded from comparison: `installedAt`** — set on every register call via `Date.now()`; including it would force `updateServer` on every boot (defeats the no-op path that T5 tests).

When all fields match → no-op (`{registered: true, reason: 'no-op (matched existing)'}`).
When any differ → `updateServer('bytebot', partial)` where partial omits `name` (immutable per `McpConfigManager`) and `installedAt` (stamp).
When no existing 'bytebot' entry → `installServer(candidate)`.

### `livos/packages/livinityd/source/modules/ai/agent-runs.ts` boot-wire (call site)

**Lifecycle hook:** `mountAgentRunsRoutes` (lines ~165–185 in the modified file)
**Position:** Immediately after `runStore` construction, BEFORE `factory` resolution + `runQueue` construction. Same lifecycle hook called once per daemon boot from `server/index.ts`.

```typescript
try {
  const bytebotConfigManager = new McpConfigManager(livinityd.ai.redis)
  await registerBytebotMcpServer(
    livinityd.ai.redis,
    process.env,
    bytebotConfigManager,
    {
      log: (msg) => logger.log(msg),
      error: (msg) => logger.error(msg),
    },
  )
} catch (err) {
  // Defensive: bytebot registration must NEVER block agent-runs mount.
  const msg = err instanceof Error ? err.message : String(err)
  logger.error(`[bytebot-mcp-config] mount-time error (non-fatal): ${msg}`)
}
```

### `nexus/packages/core/src/mcp-client-manager.ts` ALLOWED_COMMANDS

Final allowlist (additive — all 8 prior entries preserved, `tsx` appended):

```typescript
const ALLOWED_COMMANDS = new Set([
  'npx', 'node', 'python', 'python3', 'uvx', 'docker', 'deno', 'bun', 'tsx',
]);
```

### `nexus/packages/core/src/lib.ts` MCP exports (Rule 3 deviation — see Deviations)

Adds:
```typescript
export { McpConfigManager } from './mcp-config-manager.js';
export type { McpServerConfig, McpConfig, McpServerStatus } from './mcp-types.js';
```

---

## Test Counts + Results

`bytebot-mcp-config.test.ts` — **8 cases, 8 passing**:

| Case | Description                                                                | Status |
| ---- | -------------------------------------------------------------------------- | ------ |
| T1   | BYTEBOT_MCP_ENABLED unset → registered:false; install NOT called           | PASS   |
| T2   | platform='win32' (mocked) → registered:false; install NOT called           | PASS   |
| T3   | fs.access ENOENT → registered:false; reason includes 'server file not found' | PASS |
| T4   | Happy path (no existing) → installServer called once with documented shape | PASS   |
| T5   | Existing matching shape → no-op; neither installServer nor updateServer called | PASS |
| T6   | Existing differing shape → updateServer('bytebot', partial); install NOT called | PASS |
| T7   | BYTEBOT_MCP_SERVER_PATH override honored → installServer args[0] = custom  | PASS   |
| Defensive | configManager.listServers() throws → registered:false; reason captures error msg | PASS |

`agent-runs.test.ts` — **14/14 passing** (regression check; my edit added imports + a try/catch block, did not change any existing route behaviour).

`@nexus/core build` (tsc) — **clean** (no errors).

`livinityd typecheck` — 358 pre-existing errors in `skills/`, `routes.ts`, `conversation-search.test.ts` (all pre-date this plan). **0 errors in any file modified by this plan.**

---

## Sacred SHA Verified (4 gates)

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Confirmed before Task 1, after Task 1, after Task 2, after Task 3, after Task 4 — unchanged.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `McpConfigManager` not exported from `@nexus/core/lib`**

- **Found during:** Task 3 (boot-wire authoring)
- **Issue:** Plan `<interfaces>` block specified `import type { McpConfigManager } from '@nexus/core/lib'`, but `@nexus/core/lib` did NOT re-export `McpConfigManager` — it was only available via the package main entry, which executes daemon side-effects (`dotenv/config`, channels/whatsapp.js dynamic import) at import time and would explode in livinityd's context (cf. `agent-runs.ts` header comment about why `@nexus/core/lib` is used instead of `@nexus/core`).
- **Fix:** Added `McpConfigManager` runtime re-export and `McpServerConfig` / `McpConfig` / `McpServerStatus` type re-exports to `nexus/packages/core/src/lib.ts` under a documented "MCP Config Manager (Phase 72-native-06)" block. Pure additive — preserves all existing lib.ts exports verbatim. Build clean.
- **Files modified:** `nexus/packages/core/src/lib.ts`
- **Commit:** `8245ed83`

**2. [Rule 3 - Blocking] livinityd did NOT previously instantiate `McpConfigManager`**

- **Found during:** Task 3 (boot-wire authoring)
- **Issue:** Plan said "INVOKE `await registerBytebotMcpServer(redis, process.env, configManager)` AFTER McpConfigManager + McpClientManager are initialized" — but a codebase grep proved livinityd never constructs an `McpConfigManager` (only the running nexus daemon does, in `nexus/packages/core/src/index.ts:168`). livinityd's `mountAgentRunsRoutes` only gets `livinityd.ai.redis` in scope. Architecturally this is correct: nexus owns the MCP runtime; livinityd writes config to the same Redis nexus is reading from, then nexus's `McpClientManager.start()` reconciles via the `nexus:config:updated` Pub/Sub channel that `McpConfigManager.installServer` publishes.
- **Fix:** Inside `mountAgentRunsRoutes`, construct a local `new McpConfigManager(livinityd.ai.redis)` solely for this registration call. The same Redis is used by both processes, so nexus's running `McpClientManager` picks up the bytebot entry on the next reconcile. Documented inline + here.
- **Files modified:** `livos/packages/livinityd/source/modules/ai/agent-runs.ts`
- **Commit:** `f606b7c3`

**3. [Rule 1 - Bug] `McpServerConfigStored` interface broke type-compatibility with real `McpConfigManager`**

- **Found during:** Task 3 typecheck after wiring
- **Issue:** Originally defined `McpServerConfigStored extends McpServerConfigInput { [key: string]: unknown }` to allow extra fields on stored entries — but the index signature broke assignability of real `McpConfigManager.listServers()` return type (`McpServerConfig[]`) to `McpServerConfigStored[]`. TypeScript error: `Index signature for type 'string' is missing in type 'McpServerConfig'.`
- **Fix:** Simplified to `export type McpServerConfigStored = McpServerConfigInput`. The duck-typed interface still works for tests, and the real `McpConfigManager` satisfies it without index-signature shenanigans.
- **Files modified:** `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts`
- **Commit:** `f606b7c3` (rolled into Task 3)

### Architectural changes

None. The plan was implemented as written in spirit; deviations 1 & 2 were forced by the discovery that livinityd's existing layout differs from the plan's `<interfaces>` block assumptions, but the deviations are purely additive and preserve all hard-rule constraints (sacred file unchanged, no new deps, no BYOK, no Server4 touch).

### Auth gates

None — plan executed autonomously.

---

## Boot Path Documentation (for 72-native-07 UAT)

When operator sets `BYTEBOT_MCP_ENABLED=true` in `/opt/livos/.env` on Mini PC and restarts `livos.service`:

1. `Livinityd` boot calls `AiModule.start()` (already shipped, P67-03)
2. `server/index.ts` calls `mountAgentRunsRoutes(app, livinityd, opts)` (already shipped, P67-03)
3. **NEW (P72-native-06):** Inside `mountAgentRunsRoutes`, immediately after `RunStore` construction:
   - `const bytebotConfigManager = new McpConfigManager(livinityd.ai.redis)`
   - `await registerBytebotMcpServer(redis, process.env, bytebotConfigManager, logger)`
   - Function runs the 3 gates → builds config → checks idempotency → calls `installServer` (or `updateServer` or no-op)
   - On success, `McpConfigManager.installServer` publishes `'mcp_config'` to `nexus:config:updated`
4. The running nexus daemon (separate process) — its `McpClientManager` is already subscribed to `nexus:config:updated` (per `mcp-client-manager.ts:75`), receives the message, and reconciles
5. Reconciliation finds the new `bytebot` entry, validates `command='tsx'` against `ALLOWED_COMMANDS` (passes — `tsx` was added in this plan), spawns `tsx /opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` via `StdioClientTransport`
6. `client.listTools()` discovers `mcp_bytebot_*` tools (~12 tools per 72-native-05)
7. `ToolRegistry` registers them; subsequent agent runs include them in the tool list

**Operator verification** (deferred to 72-native-07 UAT, per the plan's `<verification>` block):
- `redis-cli GET nexus:mcp:config` → JSON includes `mcpServers.bytebot`
- `journalctl -u liv-core` shows `McpClientManager: connected to bytebot` (or similar)
- New agent run shows `mcp_bytebot_screenshot` etc. in available tools

---

## Commits

| Hash       | Type | Description                                                        |
| ---------- | ---- | ------------------------------------------------------------------ |
| `8d04a7e1` | feat | add tsx to MCP ALLOWED_COMMANDS allowlist                          |
| `8245ed83` | feat | add registerBytebotMcpServer + tests + lib export                  |
| `f606b7c3` | feat | boot-wire registerBytebotMcpServer in agent-runs.ts                |

---

## Self-Check: PASSED

**Files exist:**
- FOUND: `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` (262 LOC, exceeds min 100)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.test.ts` (256 LOC, exceeds min 130)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/index.ts` (modified — registerBytebotMcpServer export present)
- FOUND: `livos/packages/livinityd/source/modules/ai/agent-runs.ts` (modified — registerBytebotMcpServer call present)
- FOUND: `nexus/packages/core/src/mcp-client-manager.ts` (modified — `'tsx'` in ALLOWED_COMMANDS)
- FOUND: `nexus/packages/core/src/lib.ts` (modified — McpConfigManager re-export, Rule 3 deviation)

**Commits exist:**
- FOUND: `8d04a7e1` Task 1
- FOUND: `8245ed83` Task 2
- FOUND: `f606b7c3` Task 3

**Sacred SHA:**
- FOUND: `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged across all 4 task gates)
