# Phase 205: Liv AI UI Carry-Over Bundle — Research

**Researched:** 2026-05-24
**Domain:** claw-client React shell + livinityd tRPC layer + openclaw JSON-config and device-pairing surfaces
**Confidence:** HIGH (everything below is grounded in files in this repo; nothing extrapolated from training data)

## Summary

The phase is well-scoped by SPEC + CONTEXT; nearly every needed primitive already exists. The interesting surprises are: (1) `ConnectionStatus.tsx` is **dead code** — the real bottom-sidebar tile is inlined in `AppSidebar.tsx:753-790` and already calls `onSettingsClick`; (2) `SettingsDialog.tsx` has **no tab strip yet** and is a `<dialog>` element, not a tabbed shell; (3) `SegmentedTabs.tsx` already exists as a reusable horizontal pill-tab component that fits the requirement; (4) `mcp-bridge.ts` only spawns Luse — there is **no external-MCP-config consumer** today; the live-reload work is greenfield, not "add a listener to an existing watcher"; (5) `openclawos.apps.get` already proves the broken-batch envelope works for **queries** despite McpTab's bug claim — the bug is specific to **mutations** through a particular client path.

**Primary recommendation:** Slice exactly as D-205-22 suggests (entry-point → MCP tab + bridge → Gateway tab + router + self-lock). For the new claw-client → livinityd HTTP calls, copy the bare-POST `fetch-openui-app.ts` envelope shape (proven on Mini PC) and POST tRPC v11 `{json:...}` (non-batch) — **avoid** McpTab's `?batch=1` mutation envelope which has the production hang.

## User Constraints (from CONTEXT.md)

### Locked Decisions

D-205-01..D-205-22 as captured in `.planning/phases/205-liv-ai-ui-carryovers/205-CONTEXT.md`. Highlights the planner must honor verbatim:

- **D-205-02:** Tab order: Connection → MCP Servers → Gateway (additive, no SettingsDialog shell rewrite — `feedback_v36_no_bold_redesigns`).
- **D-205-06:** Port `callMutation` from `ProvidersTab.tsx`, NOT the batch envelope from `McpTab.tsx`.
- **D-205-07/08:** Redis channel `liv:mcp:updated`; McpBridge opens a **second ioredis connection** for subscribe (ioredis blocks the connection in subscribe mode — duplicate channel pattern).
- **D-205-12:** Atomic tmp+rename writes for `openclaw.json` reusing the `env-file-writer.ts:defaultFs.writeAtomic` pattern, chmod 0600 preserved.
- **D-205-13:** Revoke = delete row from `paired.json` AND poison `liv:openclaw:devicetoken:<jti>` Redis slot — do not invent a new revoke mechanism.
- **D-205-14:** Self-lock guard compares `payload.deviceId === input.deviceId` (fallback `payload.jti === devices[input.deviceId].jti`); throw `FORBIDDEN / CANNOT_REVOKE_SELF` **before any state mutation**.
- **D-205-19:** New `openclawos.gateway.*` paths MUST be appended to `httpOnlyPaths` in `common.ts`.
- **D-205-20:** Every Phase 205 commit MUST pass `[sacred-sha] PASS: 20 files verified`. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

### Claude's Discretion

- Tab order may be swapped if research surfaces a stronger UX pattern (NOT recommended — leave as Connection → MCP → Gateway).
- Toast / error-display component choice.
- Card styling for GatewayTab sections (collapsible vs always-open).
- Whether `auth.setMode` triggers a soft-restart of the gateway.

### Deferred Ideas (OUT OF SCOPE)

Per-chat MCP allow/deny lists; Plugin enable/disable UI; Mobile responsive pass; "Type DELETE" confirmation; revoke audit log; auto-push rotated token; backward-compat shim for liv-ai-app MCP tab; per-chat provider picker (205-01 dropped).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R1 | Settings entry-point swap | **Already 80% done.** `AppSidebar.tsx:753-790` is the real bottom-tile button; it already calls `onSettingsClick` which opens `SettingsDialog`. Phase 205 just needs to (a) reduce the pill to a gear-icon look AND (b) ensure the connection state still surfaces inside the dialog (it does — the dialog renders a status banner block at lines 229-243). |
| R2 | MCP Servers tab | New `McpServersTab.tsx`. Consumes existing `mcp.config.{list,add,delete,toggle}` tRPC namespace (`mcp-config-router.ts`). No backend contract changes — INV-203-09 preserved. |
| R3 | MCP propagation (restart-free) | `mcp-bridge.ts` currently has ZERO external-MCP consumption — only Luse stdio. Live reload is greenfield: (a) `mcp-config-router.ts` MUST be patched to `redis.publish('liv:mcp:updated', {...})` on add/delete/toggle/update; (b) `mcp-bridge.ts` MUST add a subscribe loop on a duplicated ioredis connection that reads the hash via `redis.hgetall('liv:mcp:config')` and reconciles a spawned-client map (spawn new, disconnect removed). |
| R4 | Gateway tab | New `GatewayTab.tsx` + new `openclawos-gateway-router.ts` (sibling of `openclawos-router.ts`). Backend reads/writes `/opt/livos/data/openclaw/openclaw.json` directly (no plugin RPC required for static-config slice; only device list/revoke needs `device-auto-approver` integration). |
| R5 | Self-lock guard on device revoke | tRPC mutation uses `ctx.server.verifyToken(token)` to decode the bearer (same path as `handshake-route.ts:134`). Compare `payload.deviceId` to input. Note: Hot-fix F2 master-token path returns `sessionId: 'master:${userId}'` — those callers have **no jti and no deviceId**; treat any caller bearing a master token as ineligible to revoke anything (defense-in-depth) OR derive deviceId from a separate header. Plan must address. |
| R6 | Sacred SHA preserved | None of the touched files are in the 20-blob registry. Verify with the pre-commit hook. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Settings dialog + tab strip | Browser / claw-client (Next.js `output:"export"`) | — | Pure SPA; no SSR. Reuses `<dialog>` element. |
| MCP CRUD wire calls | Browser → livinityd tRPC | — | claw-client iframe served same-origin under Caddy `/liv-ai-app/*`; cookies + X-Api-Key flow over `/trpc/*`. |
| MCP live propagation (writer) | livinityd `mcp-config-router` (Redis publish) | — | Single source of truth at Redis hash `liv:mcp:config`. |
| MCP live propagation (consumer) | livinityd `mcp-bridge` (Redis subscribe) | — | Same process as the gateway client; reconcile-and-respawn map locally. **NOT** the gateway service — McpBridge is consumed by liv-ai/agent runtime in livinityd. |
| openclaw.json read/write | livinityd `openclawos-gateway-router` | filesystem `/opt/livos/data/openclaw/openclaw.json` | Atomic tmp+rename; chmod 0600. |
| Paired-device store | filesystem `/opt/livos/data/openclaw/devices/{paired,pending}.json` | Redis `liv:openclaw:devicetoken:*` poisoning | Both surfaces inverted on revoke. |
| Self-lock guard | livinityd tRPC procedure | JWT verify | Same primitive as `handshake-route.ts`. |

## Standard Stack

### Core (already in tree — no installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@trpc/server` | 10/11 hybrid (see envelope notes below) | tRPC router for new `openclawos.gateway.*` | Already powers `openclawos-router.ts` + `mcp-config-router.ts`. [VERIFIED: imports in router files] |
| `zod` | (workspace pin) | Input schema validation on every mutation | Mirrors T-204-04 pattern. [VERIFIED: ServerBodySchema in `mcp-config-router.ts:111`] |
| `ioredis` | (workspace pin) | Pub/sub + hash storage | Already used by `NativeAppConfigStore` (`native-app-config.ts:127`). [VERIFIED] |
| `lucide-react` | (workspace pin) | Icons (Settings, Trash2, ShieldAlert, etc.) | Already in `SettingsDialog.tsx`, `ConnectionStatus.tsx`. [VERIFIED] |
| Native `node:crypto` | Node ≥16 | `randomBytes(32).toString('hex')` for token rotation | D-205-17. Zero new deps. [VERIFIED: same pattern in `device-auto-approver.ts:217`] |
| Native `node:fs` | Node ≥16 | Atomic tmp+rename JSON writes | Same as `device-auto-approver.ts:writeJsonAtomic` AND `env-file-writer.ts:defaultFs.writeAtomic`. [VERIFIED] |

**Don't install anything new.** Every primitive is already in the tree.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Redis pub/sub for MCP propagation | `fs.watch` on `liv:mcp:config` Redis-snapshot file | Redis pub is the established pattern (`native-app-config.ts:127`). fs.watch is unnecessary indirection. |
| Direct `openclaw.json` read/write | `/openclawos/plugin-rpc` proxy through the gateway plugin | Direct file I/O is simpler for static config (allowedOrigins, auth.token, auth.mode). Plugin RPC needed ONLY if we wanted live runtime config push to the gateway — D-205-22 says "no restart on MCP" but allows brief touch for token rotation. |

## Architecture Patterns

### System Architecture Diagram (conceptual data flow)

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser: claw-client (Next.js static export, same-origin iframe)│
│                                                                  │
│  AppSidebar (footer button) ──────► SettingsDialog              │
│         (already calls onSettingsClick — R1 is mostly done)      │
│                                  │                               │
│                ┌─────────────────┼─────────────────┐             │
│         Connection tab     MCP Servers tab    Gateway tab        │
│         (existing body)    (new)              (new)              │
│                                  │                               │
│                       fetch('/trpc/...', {                       │
│                         credentials:'include',                   │
│                         headers:{'X-Api-Key': $LIV_API_KEY}      │
│                       })                                          │
└──────────────────────────────────┼──────────────────────────────┘
                                   ▼  same-origin via Caddy /trpc/*
┌─────────────────────────────────────────────────────────────────┐
│ livinityd :8080                                                  │
│  is-authenticated middleware ─── F5 X-Api-Key shortcut          │
│         │                                                        │
│         ├─► mcp.config.{list,add,delete,toggle,update}          │
│         │      └─► Redis HSET/HDEL on `liv:mcp:config`           │
│         │      └─► Redis PUBLISH on `liv:mcp:updated`  ◄── NEW   │
│         │                                                        │
│         └─► openclawos.gateway.{...}  ◄── NEW namespace         │
│                ├─ devices.{list,revoke}                          │
│                │    └─► read paired.json / pending.json          │
│                │    └─► delete + Redis poison on revoke          │
│                ├─ origins.{list,add,remove}                      │
│                │    └─► read/write openclaw.json                 │
│                ├─ auth.{get,setMode,rotateToken}                 │
│                │    └─► read/write openclaw.json                 │
│                                                                  │
│  McpBridge (agent runtime)                                       │
│   └── subscribe loop on `liv:mcp:updated` (ioredis duplicate)   │
│         └─► hgetall `liv:mcp:config` → reconcile spawn map      │
│             (new servers spawn, removed ones disconnect())       │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
livos/packages/liv-claw-os/packages/claw-client/src/components/settings/
├── SettingsDialog.tsx          # existing — wrap body in tab strip
├── ConnectionStatus.tsx        # existing (dead code today) — OK to leave or extract content
├── PreferencesPanel.tsx        # existing
├── ConnectionTab.tsx           # new — extracts the existing dialog body
├── McpServersTab.tsx           # new — D-205-04
├── GatewayTab.tsx              # new — D-205-10
└── lib/
    └── livinityd-client.ts     # new — bare-POST helper, mirrors fetch-openui-app.ts

livos/packages/livinityd/source/modules/server/trpc/
├── openclawos-router.ts                 # existing (sibling)
├── openclawos-gateway-router.ts         # new — D-205-11
├── openclawos-gateway-router.test.ts    # new — D-205-15 (2+ self-lock cases)
└── mcp-config-router.ts                 # MODIFY: add `redis.publish('liv:mcp:updated', ...)` on add/delete/toggle/update

livos/packages/livinityd/source/modules/agent-runtime/
└── mcp-bridge.ts               # MODIFY: add subscribe loop + reconcile spawn map

livos/packages/livinityd/source/modules/openclawos/
└── openclaw-config-store.ts    # new — atomic read/write of /opt/livos/data/openclaw/openclaw.json
```

### Pattern 1: Tab strip wrapping existing dialog

`SegmentedTabs.tsx` (already exists in claw-client) is the natural fit. Usage:

```tsx
// In SettingsDialog.tsx — wrap the body
const [activeTab, setActiveTab] = useState<'connection' | 'mcp' | 'gateway'>('connection');

<SegmentedTabs
  value={activeTab}
  onChange={setActiveTab}
  options={[
    { value: 'connection', label: 'Connection' },
    { value: 'mcp', label: 'MCP Servers' },
    { value: 'gateway', label: 'Gateway' },
  ]}
  ariaLabel="Settings sections"
/>
{activeTab === 'connection' && <ConnectionTab .../>}
{activeTab === 'mcp' && <McpServersTab .../>}
{activeTab === 'gateway' && <GatewayTab .../>}
```

### Pattern 2: tRPC factory-DI router (sibling of `openclawos-router.ts`)

```typescript
// openclawos-gateway-router.ts
export interface OpenclawosGatewayRouterDeps {
  configPath: string;            // default '/opt/livos/data/openclaw/openclaw.json'
  devicesDir: string;            // default '/opt/livos/data/openclaw/devices'
  redis: { del(key: string): Promise<number> };  // for device-token poison
  verifyToken: (token: string) => Promise<{deviceId?: string; jti?: string; userId?: string}>;
  logger: { info: (msg: string) => void; warn: (msg: string, err?: unknown) => void };
}

export function createOpenclawosGatewayRouter(deps: OpenclawosGatewayRouterDeps) {
  return router({
    devices: router({
      list: adminProcedure.query(async () => { /* read paired.json */ }),
      revoke: adminProcedure.input(z.object({deviceId: z.string()})).mutation(async ({ctx, input}) => {
        // Self-lock guard — extract token same way is-authenticated does
        const token = ctx.request?.headers.authorization?.split(' ')[1] ?? ctx.request?.cookies?.LIVINITY_SESSION;
        if (token) {
          try {
            const payload = await deps.verifyToken(token);
            if (payload?.deviceId === input.deviceId) {
              throw new TRPCError({code:'FORBIDDEN', message:'CANNOT_REVOKE_SELF'});
            }
            // jti fallback if deviceId absent
          } catch (err) { if (err instanceof TRPCError) throw err; /* else proceed */ }
        }
        // Delete row + poison Redis device-token slot
      }),
    }),
    origins: router({ list, add, remove }),
    auth: router({ get, setMode, rotateToken }),
  });
}
```

### Anti-Patterns to Avoid

- **`?batch=1` mutation envelope.** `McpTab.tsx:45-50` uses `body: JSON.stringify({"0":{"json":{name,enabled}}})` with `?batch=1` — confirmed broken in production per D-205-06. Use bare non-batch POST. Note: `fetch-openui-app.ts` proves `?batch=1` works for **GET queries** — the bug is on the POST/mutation side, not the wire format in general.
- **Single shared ioredis connection.** ioredis blocks the connection in subscribe mode. McpBridge MUST `redis.duplicate()` for its subscribe loop (D-205-08).
- **Synchronous file writes without tmp+rename.** A power loss mid-write corrupts `openclaw.json`. Reuse `device-auto-approver.ts:writeJsonAtomic` (lines 149-154).
- **Touching the 20-blob sacred registry.** Pre-commit hook will block; verify before submitting any commit.
- **Adding new tRPC paths without registering in `httpOnlyPaths`.** Mutations silently hang on WS per memory pitfall B-12.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic JSON file write | Custom write-to-tmp logic | `device-auto-approver.ts:writeJsonAtomic` pattern (verbatim) | Already tested. Same chmod semantics. |
| Tab strip UI | shadcn Radix Tabs / new component | `SegmentedTabs.tsx` (already in `claw-client/src/components/ui/`) | Tested, matches design system, role=tablist a11y baked in. |
| Token format for rotation | UUIDs, JWT, etc. | `crypto.randomBytes(32).toString('hex')` | Matches openclaw's documented gateway.auth.token format (Hot-fix J memory `MASTER_TOKEN_HEX64 = /^[0-9a-f]{64}$/i`). |
| JWT verify in tRPC | Re-decode jsonwebtoken | `ctx.server.verifyToken(token)` | Already wired (`is-authenticated.ts:67`, `handshake-route.ts:134`). |
| Redis pub/sub envelope | Custom event bus | `redis.publish('liv:mcp:updated', JSON.stringify({op, name, ts}))` matching `native-app-config.ts:144-147` | Operationally identical to existing `liv:config:updated` listeners. |
| Device-token revoke | New invalidation channel | Delete row from `paired.json` + `redis.del('liv:openclaw:devicetoken:' + jti)` | D-205-13 — existing path; F3 already proves the data shape. |

## Runtime State Inventory

Not strictly a rename/refactor phase, but the gateway-tab work touches runtime state worth enumerating:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `paired.json` + `pending.json` under `/opt/livos/data/openclaw/devices/` (live on Mini PC); Redis hash `liv:mcp:config`; Redis keys `liv:openclaw:devicetoken:<jti>` (5-min TTL — `device-token.ts:42`) | Read/write via new router + bridge subscribe; poison on revoke. |
| Live service config | `/opt/livos/data/openclaw/openclaw.json` — `gateway.controlUi.allowedOrigins[]`, `gateway.auth.{token,mode}`, `plugins.entries`. **Verified live on Mini PC by SPEC:** 6 allowedOrigins, `auth.mode='token'`. | Direct atomic write from new router. |
| OS-registered state | None — phase does not touch systemd / Task Scheduler / pm2. | None. |
| Secrets / env vars | `LIV_API_KEY` (read by `is-authenticated.ts:37`, written into gateway env by `env-file-writer.ts:229-232`). No rename — claw-client → livinityd auth header path. | None — F5 already propagated. |
| Build artifacts | None — `output:"export"` next.config means claw-client is static-built; livinityd runs `tsx` (no compile step). | None. |

## MCP Propagation Mechanism (Step 2 deep-dive)

**Current state — `mcp-bridge.ts`:**

- Reads ONLY `liv:mcp:luse:enabled` Redis key (line 306). No knowledge of `liv:mcp:config`.
- Spawns Luse stdio once at construction (line 369-372 — `mcpClientFactory({id, servers:{luse:{command,args}}})`).
- No subscribe loop. No reconciliation. `destroy()` is a one-shot teardown.

**Required patch (smallest viable):**

1. Inside `createMcpBridge`, after the Luse spawn, ALSO load every entry from `liv:mcp:config` via `redis.hgetall('liv:mcp:config')`, parse each (reuse `parseEntry` from `mcp-config-router.ts:129`), and for each `enabled: true` entry spawn a client and namespace its tools as `<name>_<tool>`.
2. Keep a `Map<string, McpClient>` of spawned clients keyed by server `name`.
3. Open `const sub = redis.duplicate()` (ioredis), `sub.subscribe('liv:mcp:updated')`. On message: re-`hgetall`, diff against the current map — spawn the new entries, `disconnect()` the deleted/disabled ones.
4. Patch `mcp-config-router.ts:add/update/delete/toggle` mutations to call `redis.publish('liv:mcp:updated', JSON.stringify({op, name, ts}))` after the HSET/HDEL (same pattern as `native-app-config.ts:144`). The `McpConfigRedisClient` interface (line 63) needs a `publish` method added.

**Acceptance check (per R3):** within 10 seconds of an `mcp.config.add` mutation, the agent's `listTools()` returns a tool prefixed with the new server's name — without a `systemctl restart liv-claw-gateway` line in `journalctl`. Implementation note: `listTools()` is called on every agent turn, so propagation is observed at the next message — no extra invalidation needed.

**Race condition warning:** If Redis pub fires twice in rapid succession (e.g. operator clicks Add, then immediately Delete), the subscribe loop must serialize reconciliation. Recommend a simple `let reconciling = false; let pending = false;` lock OR an in-flight Promise chain. The diff is idempotent so out-of-order delivery is safe — duplicate pubs just cause a re-diff with no-ops.

## openclaw.json Read/Write Path

**Existing readers (verified):**

- `handshake-route.ts:84-94 — readOpenclawMasterToken()` does a `readFileSync` + `JSON.parse` of `/opt/livos/data/openclaw/openclaw.json`, extracting `gateway.auth.token`. Best-effort, returns undefined on any failure.
- No existing writer module.

**Recommendation:** Create `livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.ts` with:

```typescript
interface OpenclawConfig {
  gateway?: {
    controlUi?: { allowedOrigins?: string[] };
    auth?: { token?: string; mode?: 'token' | 'master' };
  };
  plugins?: { entries?: unknown[] };
  [k: string]: unknown;  // preserve unknown keys on write
}

export class OpenclawConfigStore {
  constructor(private readonly path: string) {}
  read(): OpenclawConfig { /* readFileSync + JSON.parse, throw on missing */ }
  write(cfg: OpenclawConfig): void {
    // atomic tmp+rename, chmod 0600
    const tmp = `${this.path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
  patch(mut: (cfg: OpenclawConfig) => void): void {
    const cur = this.read();
    mut(cur);
    this.write(cur);
  }
}
```

**Critical:** `read() → mutate → write()` MUST preserve unknown top-level keys (openclaw upstream may add fields livinityd doesn't recognize). Use spread + spot-mutate, not field-by-field assembly.

**Token re-read mechanics:** openclaw's WS handler reads `gateway.auth.token` at connect time (per Hot-fix F2 commentary). On token rotation, **existing** WS connections survive (the master token was already verified at handshake), but **new** connections must use the new token. claw-client's `Settings.token` is independent of `openclaw.json:gateway.auth.token` for already-paired devices — they have their own per-device tokens minted in `paired.json[did].tokens.operator.token` (`device-auto-approver.ts:233-235`). So rotation only affects fresh pairings.

**Open question for plan-phase:** Does `auth.mode: token ↔ master` swap require a gateway reload, or does openclaw re-read per-request? **Defer to live test** — easiest is to set the mode via the new router, watch `journalctl -u liv-claw-gateway` for a re-read log line, and if none, do a `kill -HUP` of the gateway pid (which is gentler than a full systemctl restart). D-205 leaves this to plan-phase discretion (CONTEXT.md line 99).

## Device Revoke Mechanism (Step 4 walk-through)

**F3 pairing flow** (forward direction, in `device-auto-approver.ts:autoApproveDevice`):

1. Read `pending.json` — find entry matching deviceId or requestId.
2. Mint `token = randomBytes(32).toString('base64url')`.
3. Build `PairedEntry` with `tokens.operator = {token, role, scopes, createdAtMs}`.
4. Write to `paired.json[deviceId]`.
5. Delete from `pending.json[requestId]`.
6. Atomic write both files (`writeJsonAtomic`).

**Inverse (revoke):**

1. Read `paired.json` — find entry by `input.deviceId`.
2. If not found → NOT_FOUND `DEVICE_NOT_PAIRED`.
3. Extract `entry.tokens.operator.token` (the master-token-like opaque string) — note: the operator token is NOT a JWT, so there's no jti to poison. **But** the per-device JWT that livinityd minted (in `device-token.ts:mintToken`) WOULD have a jti in `liv:openclaw:device-token:<jti>` Redis (5-min TTL). The Phase 203 F2 master-token path means this Redis cache is mostly empty — most live devices ride the master token.
4. Delete `paired.json[deviceId]`.
5. Atomic write `paired.json`.
6. If a `liv:openclaw:device-token:<jti>` Redis slot exists for this device's tokens, `redis.del()` it for defense-in-depth.

**Reality check:** Because the F2 master-token path bypasses livinityd's mint-and-cache, the **only** durable state for an authenticated device is `paired.json[deviceId]`. Deleting the row is the entire revocation. The Redis poison is belt-and-suspenders and is mostly a no-op in production today.

**`pending.json` cleanup:** F4's `sweepPendingRequests` auto-promotes pending entries on every handshake (`handshake-route.ts:172`). If a revoked device tries to re-pair, the sweep would re-add it. To prevent this, revoke should ALSO delete any matching `pending.json` entries for the same deviceId. Otherwise a revoke is reversed within seconds.

## JWT deviceId/jti Extraction Pattern

**Same primitive as `handshake-route.ts:118-138`:**

```typescript
let token = ctx.request?.headers.authorization?.split(' ')[1];
if (!token) token = ctx.request?.cookies?.LIVINITY_SESSION;
if (!token) throw new TRPCError({code: 'UNAUTHORIZED', message: 'NO_TOKEN'});

let payload: unknown;
try {
  payload = await ctx.server.verifyToken(token);   // same helper as is-authenticated.ts:67
} catch {
  throw new TRPCError({code: 'UNAUTHORIZED', message: 'INVALID_TOKEN'});
}

const p = payload as Record<string, unknown>;
const callerDeviceId = typeof p.deviceId === 'string' ? p.deviceId : undefined;
const callerJti = typeof p.jti === 'string' ? p.jti : undefined;
```

**Important caveat — VERIFY DURING PLAN-PHASE:** Inspect a live JWT on Mini PC to confirm `payload.deviceId` is actually populated. The legacy single-user JWT shape is just `{loggedIn: true}` (`handshake-route.ts:104` defaults `userId='admin'`). The multi-user JWT has `userId`, but `deviceId` / `jti` are **not** guaranteed — neither `jwt.ts` (livinityd's signer) nor any seen issuer puts them in. **The self-lock guard may need a different identifier — e.g. compare `payload.userId` AND require the input to include a "caller-known deviceId" header.** This is the **highest-risk** unknown in the phase.

Recommend a Wave 0 spike: `ssh bruce@10.69.31.68 'curl -s -H "Cookie: LIVINITY_SESSION=$(cat /tmp/session_cookie)" http://127.0.0.1:8080/trpc/user.isLoggedIn'` and decode the payload to confirm what fields are present.

## httpOnlyPaths Registration

In `common.ts`, append after line 673 (`provider.config.delete`):

```typescript
// Phase 205 — openclawos.gateway.* CRUD over /opt/livos/data/openclaw/openclaw.json
// + paired-device list/revoke. Mutations would silently hang on a half-broken
// WS after `systemctl restart livos` (memory pitfall B-12 / X-04 — same cluster
// as openclawos.apps.* line ~660 and provider.config.* line ~671). All 8 paths
// route via HTTP.
'openclawos.gateway.devices.list',
'openclawos.gateway.devices.revoke',
'openclawos.gateway.origins.list',
'openclawos.gateway.origins.add',
'openclawos.gateway.origins.remove',
'openclawos.gateway.auth.get',
'openclawos.gateway.auth.setMode',
'openclawos.gateway.auth.rotateToken',
```

## claw-client tRPC HTTP Client

**Existing helper:** `fetch-openui-app.ts` (lines 47-111) — bare `fetch()` with `credentials: 'include'`, tRPC v10/v11 batch envelope for queries. Uses `window.location.origin` as base (or override via `options.baseUrl`).

**Required for Phase 205:** Mutations + Auth-via-`X-Api-Key`-instead-of-cookie. Recommended new helper:

```typescript
// claw-client/src/lib/livinityd-client.ts
const BASE = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8080';

async function callMutation<I, O>(path: string, input: I, apiKey?: string): Promise<O> {
  // Mirror ProvidersTab.callMutation. Non-batch envelope: tRPC v11 unwrapped POST.
  const res = await fetch(`${BASE}/trpc/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? {'X-Api-Key': apiKey} : {}),
    },
    body: JSON.stringify({json: input}),  // tRPC v11 non-batch shape — NOT {"0":{json:...}}?batch=1
  });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  const env = await res.json() as { result?: { data?: { json?: O } | O }; error?: { data?: { code: string; message: string } } };
  if (env.error) throw new Error(env.error.data?.message ?? env.error.data?.code ?? 'tRPC error');
  const raw = env.result?.data;
  return ((raw as { json?: O })?.json ?? raw) as O;
}
async function callQuery<I, O>(path: string, input: I, apiKey?: string): Promise<O> { /* GET with ?input=... */ }
```

**Auth header source:** Per D-205-18, claw-client reads `LIV_API_KEY` from the openclaw gateway env (already populated by F5.2 `env-file-writer.ts:229`). claw-client is served by the same gateway process and has access to the env. However: **the env is on the Node side; the browser bundle does not see it.** A claw-client running in the browser CANNOT read `process.env.LIV_API_KEY`. Options:

1. **Recommended:** Rely on the `LIVINITY_SESSION` cookie that already flows same-origin (Caddy serves both `/liv-ai-app/*` and `/trpc/*` from `bruce.livinity.io`). `credentials: 'include'` carries it. The Hot-fix F5 X-Api-Key path is for **server-to-server** (openclaw plugin → livinityd), not browser-to-livinityd.
2. **Alternative:** Have the openclaw gateway inject the LIV_API_KEY into a runtime config endpoint at `/openclawos/runtime-config` which claw-client fetches at boot, then attaches as a header.

**This is a clarification needed from CONTEXT.md** — D-205-18 says "claw-client reads the key from the openclaw gateway env (already populated by env-file-writer post-F5)" but does NOT specify the browser-injection mechanism. Recommend the plan-phase resolves to option 1 (cookie reuse), with the X-Api-Key path reserved for server-side callers (the planner / plan-checker may already implicitly assume this). If option 1 holds, omit the `X-Api-Key` header entirely from claw-client → livinityd and rely on `credentials: 'include'`.

## Token Rotation Mechanics

`gateway.auth.token` is read on every fresh openclaw WS handshake (see `handshake-route.ts:84-94 — readOpenclawMasterToken` reads it on every POST). Rotation behaviors:

- **Existing claw-client sessions:** Already authenticated WS frames are not re-verified per-message, so rotation does NOT kick out existing sessions.
- **New device pairings:** Use the NEW token immediately (any handshake POST reads from disk).
- **Per-paired-device operator tokens** (`paired.json[did].tokens.operator.token`): Independent of `gateway.auth.token`. Rotation does NOT invalidate these.

**Conclusion:** Token rotation is safe at runtime with no restart. Just write `openclaw.json` and the next handshake reads the new value. Per D-205-22 carry-over: "no restart for MCP must also be no-restart" — yes, token rotation is no-restart too.

**Operator-displayed token mechanic per D-205-17:** Show the freshly-generated token once in a banner with a Copy button; never display again. Implementation: rotate mutation returns `{token, generatedAt}`; UI puts it in component state; clears on tab change or dialog close.

## Common Pitfalls

### Pitfall 1: `?batch=1` mutation envelope hangs silently

**What goes wrong:** Mutations sent as `{"0":{"json":...}}?batch=1` get accepted by livinityd but the response shape McpTab expects (`data?.[0]?.error?.json?.message`) does not match what livinityd returns under non-batch tRPC v11 routing.
**Why it happens:** McpTab was written against an older tRPC version envelope shape. Phase 204 fixed this for ProvidersTab.
**How to avoid:** Use the non-batch shape `body: JSON.stringify({json: input})` and read `env.result.data.json` (or fall through to `env.result.data` for v10). See `fetch-openui-app.ts:96-102` for the parsing pattern.

### Pitfall 2: ioredis blocks on subscribe

**What goes wrong:** Calling `redis.subscribe()` on the main shared connection prevents any further commands. McpBridge would lose access to `redis.hgetall`.
**How to avoid:** `const sub = redis.duplicate(); await sub.subscribe('liv:mcp:updated'); sub.on('message', ...)`. Standard ioredis pattern.

### Pitfall 3: Race between revoke and pending-sweep

**What goes wrong:** Revoke deletes `paired.json[did]`. Within milliseconds, F4 sweep on the next handshake re-promotes the device from `pending.json`.
**How to avoid:** Revoke must ALSO scan `pending.json` for any entry with matching `deviceId` and delete it. Alternatively (cleaner): add a `revoked.json` deny-list and have `autoApproveDevice` / `sweepPendingRequests` consult it.

### Pitfall 4: Self-lock guard fails open when JWT lacks deviceId

**What goes wrong:** Legacy single-user JWT `{loggedIn: true}` has no deviceId. Operator-in-master-mode bearer (Hot-fix F2 `sessionId: 'master:${userId}'`) has no deviceId. The naive `payload.deviceId === input.deviceId` check returns false → revoke proceeds → operator locks themselves out.
**How to avoid:** Plan-phase MUST do a live JWT-shape spike on Mini PC. If `deviceId` is not consistently in the payload, the guard needs a different mechanism (e.g. browser sends `X-Claw-Device-Id` header reading from its `getSettings().deviceToken`).

### Pitfall 5: Tab strip overflow on narrow viewports

**What goes wrong:** Three tabs ("Connection", "MCP Servers", "Gateway") fit in `max-w-lg` (32rem) at default font but a longer translated label or denser styling could overflow.
**How to avoid:** `SegmentedTabs` already uses `grid-template-columns: repeat(N, minmax(0, 1fr))` with `truncate` — it will not overflow horizontally but labels may ellipsize. English-only (INV-203-05) keeps labels short.

### Pitfall 6: Sacred SHA hook trips on stale build artifacts

**What goes wrong:** Reading `f3538e1d811992b782a9bb057d1b7f0a0189f95f` blob — the 20-file list is canonicalized; modifying any file in that list breaks the pre-commit check.
**How to avoid:** Phase 205 work is in `claw-client/src/components/settings/` (new files), `livinityd/source/modules/server/trpc/` (new + 1 modified router), `livinityd/source/modules/agent-runtime/mcp-bridge.ts`, `livinityd/source/modules/openclawos/` (new file). None of these are on the 20-blob list. If a commit triggers the hook, the most likely cause is accidentally re-formatting a sacred file (e.g. via auto-formatter on save) — narrow the commit scope with `git add -p`.

## Code Examples

### Adding `publish` to McpConfigRedisClient

```typescript
// mcp-config-router.ts:63 — extend the interface
export interface McpConfigRedisClient {
  hgetall(key: string): Promise<Record<string, string>>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hdel(key: string, field: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<number>;  // NEW
}

// Inside add/update/delete/toggle mutations, after the hset/hdel:
await deps.redis.publish(
  'liv:mcp:updated',
  JSON.stringify({op: 'set', name: input.name, ts: new Date().toISOString()}),
);
```

### Atomic openclaw.json patch (matches `device-auto-approver.ts:writeJsonAtomic`)

```typescript
// openclaw-config-store.ts
import {existsSync, readFileSync, writeFileSync, renameSync, chmodSync} from 'node:fs';
import {join, dirname} from 'node:path';

export class OpenclawConfigStore {
  constructor(private readonly path: string) {}

  read(): OpenclawConfig {
    if (!existsSync(this.path)) throw new Error('OPENCLAW_CONFIG_MISSING');
    return JSON.parse(readFileSync(this.path, 'utf8'));
  }

  patch(mut: (cfg: OpenclawConfig) => void): OpenclawConfig {
    const cfg = this.read();
    mut(cfg);
    const tmp = `${this.path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(cfg, null, 2), {mode: 0o600});
    try { chmodSync(tmp, 0o600); } catch { /* swallow */ }
    renameSync(tmp, this.path);
    return cfg;
  }
}
```

## State of the Art

No "old approach" to call out. Everything below was already established in Phase 203/204:

- tRPC factory-DI with empty-injection stub (precedent: `openclawos-router.ts:312`, `mcp-config-router.ts:303`).
- Redis pub/sub for cross-process invalidation (`native-app-config.ts:127`).
- Atomic tmp+rename JSON write (`device-auto-approver.ts:149`).
- Zod-validated mutation input (Phase 204 T-204-04 pattern; `mcp-config-router.ts:96-123`).
- X-Api-Key service-token shortcut (`is-authenticated.ts:38-58`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `payload.deviceId` is present on Phase 203/204 multi-user JWTs | Self-Lock Guard | **HIGH** — self-lock guard fails open. Plan-phase MUST spike. |
| A2 | claw-client browser bundle CANNOT read `process.env.LIV_API_KEY` | claw-client tRPC HTTP Client | LOW — if wrong, simpler implementation (just attach the header). |
| A3 | openclaw gateway re-reads `gateway.auth.token` on every fresh handshake (no restart needed) | Token Rotation Mechanics | MEDIUM — if wrong, rotation requires a gateway reload (use `kill -HUP` first). |
| A4 | Deleting a row from `paired.json` is the sole revocation primitive (the per-device-token Redis poison is mostly cosmetic given the F2 master-token path) | Device Revoke Mechanism | LOW — defense-in-depth wins either way. |
| A5 | F4 `sweepPendingRequests` would re-promote a revoked device on the next handshake unless `pending.json` is also scrubbed | Device Revoke Mechanism | **HIGH** — without scrubbing pending.json, revoke is reversed within seconds. Plan-phase must include the scrub OR add a deny-list. |
| A6 | `ConnectionStatus.tsx` is dead code; the live bottom-tile is `AppSidebar.tsx:753-790` | R1 / Summary | LOW — grep confirmed zero `import ConnectionStatus` matches. If wrong, the swap is in a different file. |

## Open Questions

1. **Browser auth header for claw-client → livinityd:** Cookie (LIVINITY_SESSION, same-origin auto-flow) vs `X-Api-Key`-via-runtime-config-endpoint vs server-side proxy via openclaw plugin. Recommend cookie.
2. **JWT shape — does `payload.deviceId` exist?** Live spike required.
3. **`auth.setMode` (`token` ↔ `master`) — does openclaw re-read modes per-request or require a reload?** Live test recommended in plan-phase.
4. **Visual delta for R1:** The bottom-tile button ALREADY exists and opens settings (`AppSidebar.tsx:772-774`). Does the operator want the labeled pill replaced with a bare gear icon, or is the existing pill acceptable? Recommend asking; until then, deliver the smallest atomic patch — keep the existing button shape, just ensure the dialog inside picks up the new tabs (per `feedback_v36_no_bold_redesigns`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥16 | All livinityd code | ✓ | Mini PC `/opt/livos` runs `tsx` (TypeScript directly) | — |
| ioredis | Pub/sub + hash store | ✓ | Workspace pin; already used | — |
| `/opt/livos/data/openclaw/openclaw.json` | Gateway tab JSON-config CRUD | ✓ on Mini PC | 6 allowedOrigins, `auth.mode='token'` (verified by SPEC) | — |
| `/opt/livos/data/openclaw/devices/{paired,pending}.json` | Devices list/revoke | ✓ on Mini PC | — | — |
| `LIV_API_KEY` env var | Service-token auth path | ✓ | In `/opt/livos/.env` post-F5 | Cookie path also works |
| `vitest` | Test suites (D-205-15) | ✓ | Workspace pin | — |
| `pnpm` | Workspace install / build | ✓ | Mini PC `bash /opt/livos/update.sh` calls pnpm | — |

No missing dependencies. No fallbacks needed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (workspace pin, used by `mcp-config-router.test.ts`, `device-auto-approver.test.ts`, `handshake-route.test.ts`) |
| Config file | `vitest.config.ts` in each package |
| Quick run command | `pnpm --filter livinityd vitest run source/modules/server/trpc/openclawos-gateway-router.test.ts` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R2 | MCP add/list/delete round-trip | unit | `pnpm vitest run source/modules/server/trpc/mcp-config-router.test.ts` | ✅ (extend) |
| R3 | McpBridge spawns new MCP within 1s of `liv:mcp:updated` pub | unit | `pnpm vitest run source/modules/agent-runtime/mcp-bridge.live-reload.test.ts` | ❌ Wave 0 |
| R3 | journalctl absence + tool visibility within 10s | smoke (live Mini PC) | manual: `ssh bruce@10.69.31.68 'journalctl -u liv-claw-gateway -n 20'` | manual-only — falsifiable per SPEC |
| R4 | Gateway tab adds allowedOrigin → openclaw.json reflects within 5s | integration | `pnpm vitest run source/modules/openclawos/openclaw-config-store.test.ts` | ❌ Wave 0 |
| R5 | Revoke-self → FORBIDDEN/CANNOT_REVOKE_SELF | unit | `pnpm vitest run source/modules/server/trpc/openclawos-gateway-router.test.ts` | ❌ Wave 0 (D-205-15) |
| R5 | Revoke-other → succeeds, paired.json row removed | unit | (same file) | ❌ Wave 0 |
| R6 | Sacred SHA hook PASS on every commit | precommit | `git commit -m ...` (hook auto-runs) | ✅ (existing) |

### Sampling Rate

- **Per task commit:** `pnpm --filter livinityd vitest run source/modules/server/trpc/openclawos-gateway-router.test.ts` (single file, <5s)
- **Per wave merge:** `pnpm vitest run` (full livinityd + claw-client suites)
- **Phase gate:** Full suite green + Mini PC smoke (R3 acceptance per SPEC, R4 file diff cross-check) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.test.ts` — covers R5 self-lock + R4 origins/auth CRUD
- [ ] `livos/packages/livinityd/source/modules/openclawos/openclaw-config-store.test.ts` — covers atomic write semantics
- [ ] `livos/packages/livinityd/source/modules/agent-runtime/mcp-bridge.live-reload.test.ts` — covers R3 spawn-on-pub behavior with fake redis + factory injection
- [ ] `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/McpServersTab.test.tsx` — covers R2 add/list/delete UI states
- [ ] `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/GatewayTab.test.tsx` — covers R4 + R5 toast-on-FORBIDDEN UI state

No new framework install needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | F5 `X-Api-Key` shortcut + JWT verify (cookie / Bearer). No new auth surface added. |
| V3 Session Management | yes | Self-lock guard prevents accidental self-revoke; `paired.json` is the sole pairing-state authority. |
| V4 Access Control | yes | `adminProcedure` on all new mutations; revoke targets restricted to non-self by D-205-14 guard. |
| V5 Input Validation | yes | `zod` schemas on every mutation — `deviceId` regex, URL regex for allowedOrigins, `auth.mode` enum (literal `'token' | 'master'`). |
| V6 Cryptography | yes | `crypto.randomBytes(32).toString('hex')` for token rotation — never hand-roll. |

### Known Threat Patterns for the new surfaces

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Lock-out (operator revokes their own device) | DoS (against self) | D-205-14 self-lock guard (FORBIDDEN before mutation). |
| Stale pending entry → revoked device auto-re-pairs (F4 sweep) | EoP | Revoke MUST scrub matching `pending.json` rows OR add a `revoked.json` deny-list consulted by `sweepPendingRequests`. |
| Token rotation race (rotate-then-rollback) | Tampering / DoS | Atomic write of `openclaw.json` prevents partial-state. Document rotation is operator-initiated only — not exposed to non-admins. |
| Origin spoofing via Gateway tab `origins.add` | EoP | URL regex in zod; reject non-`http(s)?://` schemes; cap length to 2048. |
| MCP env-var leak in `mcp.config.list` response | Information disclosure | Redact on read — adopt `redactKey` pattern from `key-store.ts` for any env-vars in the list response. |
| MCP child-process injection via crafted `command`/`args` | Tampering / EoP | Reuse `native-app-config.ts:nativeAppConfigSchema` shell-metachar regex pattern for MCP `command` + `args` validation. Currently `mcp-config-router.ts` allows ANY string in `command` (length-only); harden by adding `ABSOLUTE_PATH_RE` / `SHELL_METACHAR_RE` checks. |

## Sources

### Primary (HIGH confidence — file contents read in this session)

- `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/SettingsDialog.tsx` (336 lines, read in full)
- `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/ConnectionStatus.tsx` (53 lines — confirmed dead code via grep)
- `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/PreferencesPanel.tsx`
- `livos/packages/liv-claw-os/packages/claw-client/src/components/ui/SegmentedTabs.tsx`
- `livos/packages/liv-claw-os/packages/claw-client/src/components/layout/AppSidebar.tsx` (lines 753-790 — real bottom-tile)
- `livos/packages/liv-claw-os/packages/claw-client/src/components/ChatApp.tsx` (lines 1160-1190 — mount point)
- `livos/packages/liv-claw-os/packages/claw-client/src/lib/fetch-openui-app.ts` (HTTP client template)
- `livos/packages/liv-claw-os/packages/claw-client/src/lib/storage.ts` (Settings shape)
- `livos/packages/liv-ai-app/components/settings/McpTab.tsx` (broken batch envelope — anti-pattern)
- `livos/packages/liv-ai-app/components/settings/ProvidersTab.tsx` (working `callMutation` pattern)
- `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts` (existing CRUD)
- `livos/packages/livinityd/source/modules/server/trpc/openclawos-router.ts` (sibling pattern)
- `livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts` (F5 auth path)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (httpOnlyPaths)
- `livos/packages/livinityd/source/modules/agent-runtime/mcp-bridge.ts` (greenfield extension target)
- `livos/packages/livinityd/source/modules/apps/native-app-config.ts` (Redis pub template)
- `livos/packages/livinityd/source/modules/provider/env-file-writer.ts` (atomic write + F5.2)
- `livos/packages/livinityd/source/modules/openclawos/device-auto-approver.ts` (F3/F4 pairing — inverse target)
- `livos/packages/livinityd/source/modules/openclawos/handshake-route.ts` (JWT verify pattern)
- `livos/packages/livinityd/source/modules/openclawos/device-token.ts` (token lifecycle, jti Redis cache)

### Secondary (MEDIUM confidence — referenced indirectly)

- `.planning/phases/205-liv-ai-ui-carryovers/205-SPEC.md` (locked requirements)
- `.planning/phases/205-liv-ai-ui-carryovers/205-CONTEXT.md` (locked decisions)
- MEMORY.md (sacred SHA, deploy paths, B-12 pitfall, F5 commit hash)

### Tertiary (LOW confidence — would benefit from live verification)

- Exact shape of multi-user JWT payload on Mini PC (A1)
- openclaw gateway behavior on `gateway.auth.mode` swap without restart (A3)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every primitive verified in tree
- Architecture: HIGH — patterns mirror Phase 203/204 precedent
- Pitfalls: HIGH — derived from real files; pitfalls 4 (JWT) and 5 (pending.json race) are NOT speculation but observations from reading the F3/F4 flow
- Self-lock guard implementability: **MEDIUM** — depends on JWT payload shape (A1)
- claw-client → livinityd auth header path: **MEDIUM** — D-205-18 implies browser X-Api-Key but that is implausible; cookie path is recommended

**Research date:** 2026-05-24
**Valid until:** 2026-06-07 (14 days — Mini PC live state may drift, but code references are stable)

## RESEARCH COMPLETE

Phase 205 is plannable today with one Wave 0 spike (live JWT shape on Mini PC to confirm `payload.deviceId` exists for the self-lock guard) and one clarification (browser auth header path: cookie vs `X-Api-Key`) — every other primitive (atomic JSON writer, Redis pub/sub, `SegmentedTabs`, factory-DI router, F3/F4 inverse) already exists in tree and can be composed without new dependencies.

