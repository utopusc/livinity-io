# Phase 205: Liv AI UI Carry-Overs — Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 4 new + 5 modifications
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `claw-client/src/components/settings/McpServersTab.tsx` | component (form+list) | CRUD via tRPC | `liv-ai-app/components/settings/McpTab.tsx` + `ProvidersTab.tsx` (callMutation helper) | hybrid (port shell from McpTab, copy fetch envelope from ProvidersTab) |
| `claw-client/src/components/settings/GatewayTab.tsx` | component (3-section card layout) | CRUD via tRPC | `liv-ai-app/components/settings/ProvidersTab.tsx` | role-match |
| `livinityd/source/modules/server/trpc/openclawos-gateway-router.ts` | tRPC router (factory-DI) | request-response | `livinityd/source/modules/server/trpc/openclawos-router.ts` | exact (sibling) |
| `livinityd/source/modules/server/trpc/openclawos-gateway-router.test.ts` | test | unit | `openclawos-router.test.ts` | exact (sibling) |
| **MOD** `SettingsDialog.tsx` | component | UI shell | self — add tab strip around existing body | n/a |
| **MOD** `ConnectionStatus.tsx` | component | UI button | self — drop status text, render Settings gear | n/a |
| **MOD** `mcp-bridge.ts` | service | event-driven (Redis sub) | `native-app-config.ts:127` publish + new duplicate-connection subscribe | role-match |
| **MOD** `common.ts` | config | list-append | self — append `'openclawos.gateway.*'` paths | n/a |
| **MOD** livinityd `index.ts` boot | wire-up | DI composition | sibling `createOpenclawosAppsRouter` registration call | exact |

## Pattern Assignments

### `McpServersTab.tsx` (component, CRUD)

**Two analogs.** Copy `McpTab.tsx` for the visual surface (sections, row component, redacted display). Copy `ProvidersTab.tsx` + `use-providers.ts` `callMutation` for the wire envelope. **Do NOT** copy McpTab's `?batch=1` envelope — it's the broken one.

**Hook + fetch envelope (from `use-providers.ts:141-192`):**
```typescript
// NON-BATCH envelope — bare {...input} POST, no ?batch=1
async function callMutation<T>(
  path: string,
  input: Record<string, unknown>,
): Promise<{ok: true; data: T} | {ok: false; error: string}> {
  const res = await fetch(`/trpc/${path}`, {
    method: "POST",
    credentials: "include",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(input),
  });
  const text = await res.text();
  const obj = JSON.parse(text) as {
    result?: {data?: T | {json?: T}};
    error?: {message?: string; json?: {message?: string}};
  };
  if (obj.error) {
    return {ok: false, error: obj.error.json?.message ?? obj.error.message ?? "Server error"};
  }
  const direct = obj.result?.data;
  if (direct && typeof direct === "object" && "json" in (direct as Record<string, unknown>)) {
    return {ok: true, data: (direct as {json: T}).json};
  }
  return {ok: true, data: (direct as T) ?? ({} as T)};
}
```

**Auth note:** claw-client lives behind Caddy on a different host than liv-ai-app — it must add the `X-Api-Key: <LIV_API_KEY>` header (Hot-fix F5 path, see `is-authenticated.ts:35-58`). Read the key from `import.meta.env.VITE_LIV_API_KEY` (or whatever claw-client's env shape is — researcher confirms).

**Tab body layout (from `McpTab.tsx:106-241`):** copy verbatim the two-section structure (External MCP servers section + AddMcpServerDialog mount) and the `McpServerRow` sub-component. Drop the "Built-in tools" section AND the restart-required banner (Phase 205 R3 makes restart unnecessary). Drop the per-row "Enabled" checkbox — out of scope; keep Add + Delete only.

**State / hooks pattern (from `ProvidersTab.tsx:52-90`):**
```typescript
const [pendingProvider, setPendingProvider] = useState<ProviderName | "">("");
const [pendingKey, setPendingKey] = useState<string>("");
const [saving, setSaving] = useState<boolean>(false);
const [deletingProvider, setDeletingProvider] = useState<ProviderName | null>(null);
```
Mirror this with `pendingName / pendingTransport / pendingCommand / pendingUrl / pendingEnv` for the Add form.

---

### `GatewayTab.tsx` (component, 3-section CRUD)

**Analog:** `ProvidersTab.tsx`. Use it as the layout template (section header + helper paragraph + bordered list + Add form).

**Section structure (from `ProvidersTab.tsx:178-319`):**
```typescript
return (
  <div className="space-y-8">
    {/* Section 1 */}
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-medium">Paired devices ({devices.length})</h2>
        <p className="text-xs text-muted-foreground/80">…</p>
      </div>
      {error ? <p role="alert" className="…border-destructive/40…">{error}</p> : null}
      {isLoading ? <p>Loading…</p>
        : devices.length === 0 ? <p className="…border-dashed…">No paired devices.</p>
        : <ul className="divide-y divide-border/60 rounded-md border border-border/60">{…rows…}</ul>}
    </section>

    {/* Section 2 — Allowed Origins (same shape) */}
    {/* Section 3 — Authentication (dropdown + Rotate Token button) */}
  </div>
);
```

**Self-lock toast handling (from `ProvidersTab.tsx:120-148`):** wrap the revoke call so a TRPCError with `code: 'FORBIDDEN'` / `message: 'CANNOT_REVOKE_SELF'` flips `banner` to `{kind: "error", message: "Cannot revoke the device you are currently signed in with."}`. The row stays.

**Token-rotation one-time banner:** mirror the `restart_required` banner state from `ProvidersTab.tsx:397-423` — a sticky amber card with a `<pre>` showing the new token + a Copy button.

---

### `openclawos-gateway-router.ts` (tRPC router, factory-DI)

**Analog:** `openclawos-router.ts` — exact sibling. Same factory shape, same `adminProcedure`, same dep-injection bundle, same `TRPCError` mapper.

**Imports + factory signature (mirror `openclawos-router.ts:42-70`):**
```typescript
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'

export interface OpenclawosGatewayRouterDeps {
  /** Read/write /opt/livos/data/openclaw/openclaw.json */
  openclawConfigPath: string
  /** Read paired.json + pending.json; write paired.json on revoke */
  devicesDir: string
  /** Redis client used to poison device-token slots on revoke */
  redis: { del(key: string): Promise<number> }
  /** Mints/verifies LIVINITY_SESSION JWT (re-use ctx.server.verifyToken) */
  verifyToken?: (token: string) => Promise<{deviceId?: string; jti?: string}>
  logger: {
    info: (msg: string) => void
    warn: (msg: string, error?: unknown) => void
  }
}
```

**Zod input schemas (mirror `openclawos-router.ts:72-92`):**
```typescript
const DeviceIdSchema = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'INVALID_DEVICE_ID')
const OriginSchema = z.string().url('INVALID_ORIGIN').max(512)
const AuthModeSchema = z.enum(['token', 'master'])
```

**Factory + routes (mirror `openclawos-router.ts:193-300`):**
```typescript
export function createOpenclawosGatewayRouter(deps: OpenclawosGatewayRouterDeps) {
  return router({
    devices: router({
      list: adminProcedure.query(async () => { /* read paired.json + pending.json */ }),
      revoke: adminProcedure
        .input(z.object({deviceId: DeviceIdSchema}))
        .mutation(async ({ctx, input}) => {
          // Self-lock guard — extract caller's deviceId/jti from JWT
          const token = ctx.request?.headers.authorization?.split(' ')[1]
            ?? ctx.request?.cookies?.LIVINITY_SESSION
          if (token) {
            const payload = await ctx.server.verifyToken(token)
            const callerId = payload.deviceId ?? payload.jti
            if (callerId && callerId === input.deviceId) {
              throw new TRPCError({code: 'FORBIDDEN', message: 'CANNOT_REVOKE_SELF'})
            }
          }
          // Delete from paired.json + Redis-poison the device-token slot
          // (same F3 invalidation surface — `liv:openclaw:devicetoken:<jti>`)
          await deps.redis.del(`liv:openclaw:devicetoken:${input.deviceId}`)
          /* tmp+rename write of paired.json */
          return {ok: true as const}
        }),
    }),
    origins: router({ /* list / add / remove */ }),
    auth: router({ /* get / setMode / rotateToken */ }),
  })
}

export type OpenclawosGatewayRouter = ReturnType<typeof createOpenclawosGatewayRouter>
```

**Empty-injection stub** (mirror `openclawos-router.ts:312-330`) — same `PRECONDITION_FAILED + OPENCLAW_GATEWAY_UNAVAILABLE` stub so production boot can register a placeholder before disk paths are resolved.

**Atomic JSON write** — reuse `env-file-writer.ts:defaultFs.writeAtomic` (tmp + `fs.renameSync`) for `openclaw.json` writes. Preserve `chmod 0600` after rename.

---

### `openclawos-gateway-router.test.ts` (vitest)

**Analog:** `openclawos-router.test.ts` — exact sibling.

**Admin context factory + first test (from `openclawos-router.test.ts:37-66`):**
```typescript
function makeAdminCtx(extra: Partial<{request: any; server: any}> = {}) {
  return {
    livinityd: {} as never,
    logger: {info: () => undefined, warn: () => undefined, error: () => undefined, /*…*/ },
    server: extra.server ?? ({verifyToken: async () => ({deviceId: 'self-device'})} as never),
    request: extra.request ?? ({headers: {authorization: 'Bearer fake'}, cookies: {}} as never),
    user: {} as never,
    dangerouslyBypassAuthentication: true,
    currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
    transport: 'express' as const,
  }
}

describe('openclawosGatewayRouter — self-lock guard', () => {
  test('revoke-self rejects with FORBIDDEN + CANNOT_REVOKE_SELF', async () => {
    const router = createOpenclawosGatewayRouter({/* fake deps */})
    const caller = router.createCaller(makeAdminCtx() as never)
    await expect(caller.devices.revoke({deviceId: 'self-device'})).rejects.toMatchObject({
      code: 'FORBIDDEN', message: 'CANNOT_REVOKE_SELF',
    })
  })

  test('revoke-other succeeds', async () => {
    const caller = createOpenclawosGatewayRouter({/* fake deps */}).createCaller(makeAdminCtx() as never)
    await expect(caller.devices.revoke({deviceId: 'other-device'})).resolves.toEqual({ok: true})
  })
})
```

---

### MOD `SettingsDialog.tsx`

**Current state (lines 208-244):** the dialog renders a single status banner + a single form. To make it tab-host friendly, wrap the body in a tab strip **without** removing the existing form (per D-205-02 "additive — shell + PreferencesPanel stay; new tabs nest inside").

**Pattern to add** (above line 245 `<div className="min-h-0">`):
```tsx
<div className="mb-ml flex gap-xs border-b border-border-default">
  {[
    {id: 'connection', label: 'Connection'},
    {id: 'mcp',        label: 'MCP Servers'},
    {id: 'gateway',    label: 'Gateway'},
  ].map(t => (
    <button
      key={t.id}
      type="button"
      onClick={() => setActiveTab(t.id)}
      className={`px-m py-s text-md font-medium ${
        activeTab === t.id
          ? 'border-b-2 border-border-interactive-emphasis text-text-neutral-primary'
          : 'text-text-neutral-tertiary'
      }`}
    >{t.label}</button>
  ))}
</div>
{activeTab === 'connection' && <ConnectionTabBody /* existing form */ />}
{activeTab === 'mcp'        && <McpServersTab />}
{activeTab === 'gateway'    && <GatewayTab />}
```
The existing status-banner block (lines 229-243) belongs INSIDE the Connection tab body.

---

### MOD `ConnectionStatus.tsx`

**Current (lines 38-52):** entire component is a status pill with label + dot. Per D-205-01 the pill becomes a Settings gear button; status moves into the dialog.

**Replacement pattern:**
```tsx
export function ConnectionStatus({ state, onSettingsClick }: Props) {
  return (
    <button
      onClick={onSettingsClick}
      title="Open settings"
      aria-label="Open settings"
      className="fixed bottom-4 right-4 z-50 inline-flex items-center justify-center rounded-full p-2 bg-background/90 backdrop-blur border border-border-default shadow-sm hover:shadow-md transition-shadow"
    >
      <Settings className="h-4 w-4 text-text-neutral-secondary" />
    </button>
  );
}
```
The `state` prop stays in the signature (callers unchanged) but is no longer rendered here — `SettingsDialog`'s Connection tab consumes it now.

---

### MOD `mcp-bridge.ts` (live-reload subscribe loop)

**Analog (publisher):** `native-app-config.ts:127, 144-145`:
```typescript
const REDIS_CHANNEL = 'liv:config:updated'
// …
await this.redis.publish(
  REDIS_CHANNEL,
  JSON.stringify({kind: 'native-app', id: parsed.id, op: 'upsert'}),
)
```

**Pattern for new channel `liv:mcp:updated`** — add identical publish call inside `mcp-config-router.ts` `set` and `delete` mutations, payload `{op: 'set' | 'delete', name: string, ts: <ISO-8601>}`.

**Subscribe loop to add to `mcp-bridge.ts`** (open a duplicate ioredis connection because subscribe-mode blocks the connection):
```typescript
// At construction time, alongside the existing stdio MCP client setup
const sub = (this.redis as Redis).duplicate()
await sub.subscribe('liv:mcp:updated')
sub.on('message', async (_channel, _payload) => {
  // diff current spawned-server map against listServers() from mcp-config-router
  // spawn / disconnect as needed; no service restart
  await this.reconcileServers()
})
```

**Boot wire-up:** the existing McpBridge constructor site (in livinityd `index.ts` where the bridge is built) needs a `redis` dep so it can `.duplicate()`. No new top-level service.

---

### MOD `common.ts` (httpOnlyPaths)

**Append** (after the Phase 204 `provider.config.*` block at line ~673):
```typescript
// Phase 205 — openclawos.gateway.* admin namespace for the in-chat Gateway
// tab. All 8 paths route via HTTP for the standard WS-reconnect-survival
// reason (memory pitfall B-12 / X-04 — same cluster as provider.config.*
// directly above). devices.revoke / origins.add / origins.remove /
// auth.setMode / auth.rotateToken are admin mutations called immediately
// after operator clicks Save / Revoke / Rotate; a half-broken WS after
// `systemctl restart livos` would silently drop them.
'openclawos.gateway.devices.list',
'openclawos.gateway.devices.revoke',
'openclawos.gateway.origins.list',
'openclawos.gateway.origins.add',
'openclawos.gateway.origins.remove',
'openclawos.gateway.auth.get',
'openclawos.gateway.auth.setMode',
'openclawos.gateway.auth.rotateToken',
```

---

## Shared Patterns

### Authentication (Hot-fix F5 `X-Api-Key` service-token)

**Source:** `livinityd/source/modules/server/trpc/is-authenticated.ts:21-58`

**Apply to:** every claw-client → livinityd fetch call (both `McpServersTab` and `GatewayTab`).

```typescript
// Server side already exists — claw-client just needs to send:
headers: {
  "content-type": "application/json",
  "X-Api-Key": LIV_API_KEY,  // read from claw-client env (Caddy-injected)
}
```
This shortcut maps the call to admin user via `getAdminUser()`. **No JWT cookie is required** from the claw-client browser context.

### Zod-validated input + TRPCError mapping

**Source:** `openclawos-router.ts:72-147`

**Apply to:** all new mutations in `openclawos-gateway-router.ts`. Every input is `z.object({...})` with regex bounds; every catch path goes through a `mapRepoError(err)` helper that converts low-level filesystem / Redis errors to canonical `TRPCError` codes (`BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_SERVER_ERROR`).

### Atomic tmp+rename JSON write

**Source:** `provider/env-file-writer.ts:defaultFs.writeAtomic` (referenced by D-205-12)

**Apply to:** every write to `/opt/livos/data/openclaw/openclaw.json` and `paired.json`. Preserve `chmod 0600` post-rename. Same pattern the device-auto-approver already uses (`device-auto-approver.ts` imports `renameSync` for the same reason).

### Redact-on-read for secrets

**Source:** `provider/key-store.ts` `redactKey()` (Phase 204 INV-204-04 template)

**Apply to:** `McpServersTab` env-var display. The list row must never show raw env values — only `KEY=********` style preview. (`mcp.config.list` already returns the full config; redaction is client-side for display only.)

### Sacred SHA pre-commit

**Source:** project root `.git/hooks/pre-commit` (sacred-sha hook)

**Apply to:** every Phase 205 commit. The 4 new files + 5 modifications touch zero of the 20 protected blobs (verified — none of these paths appear in the registry).

## No Analog Found

None. All target files have strong analogs already in the codebase.

## Metadata

**Analog search scope:**
- `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/`
- `livos/packages/liv-ai-app/components/settings/` + `src/lib/settings/`
- `livos/packages/livinityd/source/modules/server/trpc/`
- `livos/packages/livinityd/source/modules/openclawos/`
- `livos/packages/livinityd/source/modules/apps/`
- `livos/packages/livinityd/source/modules/agent-runtime/`

**Files read (excerpts extracted):** 9 (`McpTab.tsx`, `ProvidersTab.tsx`, `use-providers.ts`, `SettingsDialog.tsx`, `ConnectionStatus.tsx`, `openclawos-router.ts`, `openclawos-router.test.ts`, `mcp-config-router.ts`, `native-app-config.ts`, `is-authenticated.ts`, `mcp-bridge.ts`, `device-auto-approver.ts`, `common.ts`).

**Pattern extraction date:** 2026-05-24

## PATTERN MAPPING COMPLETE

Every Phase 205 file has a concrete analog with line-anchored excerpts: McpServersTab merges `McpTab.tsx` (visual shell) with `use-providers.ts:141-192` (non-batch `callMutation`), GatewayTab mirrors `ProvidersTab.tsx`'s 3-section layout + restart-banner state, `openclawos-gateway-router.ts` + its vitest sibling clone the `openclawos-router.ts` factory-DI shape (+ JWT-decode self-lock guard rooted in `handshake-route.ts`'s `ctx.server.verifyToken`), `mcp-bridge.ts` reuses `native-app-config.ts:127-148`'s Redis publish convention via an ioredis `.duplicate()` subscribe loop, and `common.ts` gets 8 new `openclawos.gateway.*` `httpOnlyPaths` entries appended to the Phase 204 cluster.
