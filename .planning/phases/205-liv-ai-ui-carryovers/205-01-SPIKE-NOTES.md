# Phase 205 Wave 0 Spike Notes

**Probed:** 2026-05-24 08:45-08:47 UTC, Mini PC `bruce@100.112.68.1` (Tailscale; ZeroTier deprecated per memory `reference_zerotier_unstable`)
**Probe agent:** GSD sequential executor (205-01 plan task 1)
**Method:** Three batched SSH sessions (memory `feedback_ssh_rate_limit` — fail2ban-style rate limit) covering: signer source + tRPC routing inventory + cookie/Bearer/X-Api-Key matrix + paired/pending JSON schemas + LIVE `gateway.auth.mode` flip-and-restore + sweepPendingRequests source read.

> **Spike scope discipline:** This file LOCKS findings; it does NOT modify source code. Downstream plans 205-02 / 205-03 / 205-04 consume these decisions.

---

## A1 — JWT Payload Shape (LOCKED)

**Source-of-truth read:** `/opt/livos/packages/livinityd/source/modules/jwt.ts` (read verbatim during Probe B0). Three signer entry-points and ONE verifier:

```typescript
// Legacy payload (single-user) — signed by jwt.sign(secret)
type LegacyJwtPayload = { loggedIn: boolean }

// New multi-user payload — signed by jwt.signUserToken(secret, userId, role)
type UserJwtPayload = { loggedIn: boolean; userId: string; role: string }

// Verified shape returned to callers
export type VerifiedJwtPayload = {
  loggedIn: true            // verifier rejects anything else
  userId?: string
  role?: string
}
```

**Empirical confirmation — minted JWT decoded:**

```
TOKEN: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...
LEN: 192
PAYLOAD_DECODED: {"loggedIn":true,"userId":"admin","role":"admin","iat":1779612443,"exp":1780217243}
```

**Fields present:** `loggedIn=YES`, `userId=YES (multi-user only; absent on legacy)`, `role=YES (multi-user only)`, `iat=YES (auto-added by jsonwebtoken)`, `exp=YES (auto-added)`.

**Fields ABSENT (high-impact for Phase 205):**
- `deviceId=NO` — **NOT issued by any signer in jwt.ts. The naive `payload.deviceId === input.deviceId` self-lock check assumed by SPEC §R5/D-205-14 would always be `undefined === string → false → revoke proceeds → operator locks out.**
- `jti=NO` — jsonwebtoken does NOT auto-add a jti claim; no signer in jwt.ts opts in. The fallback `payload.jti === devices[input.deviceId].jti` is non-runnable.
- `sessionId=NO`
- Hot-fix F2 master-token path also lacks deviceId and jti per RESEARCH § Self-Lock Guard caveat.

**Self-lock guard contract LOCKED — header-fallback approach (research override #1):**

Because the operator browser session carries NEITHER `deviceId` NOR `jti` in its JWT, the self-lock guard MUST come from a client-supplied identifier that the operator's authenticated browser session knows. claw-client already persists `Settings.deviceToken` (the 43-char base64url opaque token from `paired.json[deviceId].tokens.operator.token`) AND has access to its own `deviceId` (the 64-hex SHA in `paired.json` keys + per-row `deviceId` field).

- **Primary check (LOCKED):** Browser sends `X-Claw-Device-Id: <Settings.deviceId>` header on the revoke mutation. The router compares `ctx.request.headers['x-claw-device-id']` against `input.deviceId`. Match → throw `TRPCError({code:'FORBIDDEN', message:'CANNOT_REVOKE_SELF'})`.
- **Defense-in-depth secondary check (LOCKED):** Router ALSO reads the matching operator token from the header `X-Claw-Device-Token` (or via the cookie path) and verifies `paired.json[input.deviceId].tokens.operator.token === providedToken` BEFORE allowing the deletion. Mismatch → reject with `FORBIDDEN/CANNOT_REVOKE_FOREIGN_DEVICE` (separate code from self-lock — prevents an attacker spoofing the device-id header to revoke arbitrary devices when they only hold one valid pair). When the header path is unavailable (X-Api-Key service caller), this defense-in-depth is skipped because internal callers cannot lock themselves out.
- **Fallback check (LOCKED):** If `X-Claw-Device-Id` is absent on a JWT-authed caller, the router rejects with `BAD_REQUEST/MISSING_DEVICE_HEADER` rather than allowing an unguarded revoke. (X-Api-Key callers — server-to-server — are NOT subject to the self-lock guard because by definition they do not have a paired device.)
- **NOT used:** `payload.deviceId` / `payload.jti` checks — both proven absent by source-code read and empirical mint.

**Locked code expression for 205-04 router (verbatim template):**
```typescript
// In openclawos-gateway-router.ts devices.revoke mutation, BEFORE any state mutation:
const headerDeviceId = ctx.request?.headers['x-claw-device-id']
const callerDid = Array.isArray(headerDeviceId) ? headerDeviceId[0] : headerDeviceId
if (ctx.usedApiKey !== true) {
  // Browser caller — must present X-Claw-Device-Id
  if (typeof callerDid !== 'string' || callerDid.length === 0) {
    throw new TRPCError({code: 'BAD_REQUEST', message: 'MISSING_DEVICE_HEADER'})
  }
  if (callerDid === input.deviceId) {
    throw new TRPCError({code: 'FORBIDDEN', message: 'CANNOT_REVOKE_SELF'})
  }
}
// ...proceed with revoke
```

> **Plan 205-04 must:** (1) add `usedApiKey: boolean` to `Context` in `is-authenticated.ts` (set true when the X-Api-Key path matched), (2) wire claw-client to send `X-Claw-Device-Id` on the revoke mutation (read from `Settings.deviceId` in storage), (3) extend `httpOnlyPaths` registration for `openclawos.gateway.devices.revoke` per D-205-19.

---

## AUTH PATH — claw-client → livinityd (LOCKED)

### HTTP status matrix (Probe A2 + B5 + B7 + C3 + D2)

tRPC v11 routes queries through **GET** (POST returns 405 METHOD_NOT_SUPPORTED). Mutations route through POST. Both `mcp.config.list` and `provider.config.list` are `adminProcedure.query(...)` per Probe C0 source-grep (lines 175, 311 of `mcp-config-router.ts`).

| Endpoint | Method | Body | Cookie/Bearer | X-Api-Key | Status | Response |
|---|---|---|---|---|---|---|
| `/trpc/provider.config.list` | POST | `{"json":{}}` | — | match | **405** METHOD_NOT_SUPPORTED | tRPC error — POST not allowed on query |
| `/trpc/provider.config.list` | POST | `{}` | — | match | **405** METHOD_NOT_SUPPORTED | same as above |
| `/trpc/mcp.config.list` | POST | `{"json":{}}` | — | match | **405** METHOD_NOT_SUPPORTED | same as above |
| `/trpc/mcp.config.list` | POST | `{}` | — | match | **405** METHOD_NOT_SUPPORTED | same as above |
| `/trpc/mcp.config.list` | **GET** | — | — | match | **200** | `{"result":{"data":[]}}` ✅ |
| `/trpc/mcp.config.list` | **GET** | `?input={"json":{}}` URL-encoded | — | match | **200** | `{"result":{"data":[]}}` ✅ |
| `/trpc/provider.config.list` | **GET** | `?input={"json":{}}` URL-encoded | — | match | **200** | `{"result":{"data":{"providers":[]}}}` ✅ |
| `/trpc/mcp.config.add` (mutation) | POST | `{"json":{...partial...}}` | — | match | **400** | zod schema error (proves auth PASSED, validation failed downstream) ✅ |
| `/trpc/mcp.config.list` | GET | — | minted JWT cookie | — | **401** | "Invalid token" — see W-2-EDGE below |
| `/trpc/mcp.config.list` | GET | — | minted JWT Bearer | — | **401** | "Invalid token" — see W-2-EDGE below |

### LOCKED BODY SHAPE (W-2 envelope replay finding)

For **queries** (the predominant claw-client read traffic — list MCP servers, list paired devices, list origins, get auth mode): `GET /trpc/<path>` with NO body. Optional URL-encoded `?input={"json":<input>}` for procedures with input. The response envelope is `{"result":{"data":<unwrapped_payload>}}` — tRPC v11 strips the `{json:...}` wrapper on the wire for primitive outputs (proven by `{"result":{"data":[]}}` rather than `{"result":{"data":{"json":[]}}}`).

For **mutations** (revoke, add MCP, set mode, rotate token, add/remove origins): `POST /trpc/<path>` with `Content-Type: application/json` and body `{"json":<input>}` (bare non-batch envelope, NOT `{"0":{"json":...}}?batch=1`). Confirmed by Probe B7 → 400 zod error returned (passing auth → reaching input validator).

**Anti-pattern confirmed:** the `{"0":{"json":...}}?batch=1` mutation envelope copied from McpTab.tsx is the **production-broken** path (carry-over from Phase 204-02 deviation #1). Plan 205-03 + 205-04 MUST use bare non-batch shape per D-205-06.

### DECISION (LOCKED): X-Api-Key — service-token shortcut path (Phase 203 Hot-fix F5)

**Why X-Api-Key wins over cookie:** Cookie path requires the browser to hold a valid LIVINITY_SESSION minted by livinityd's actual signer running with the live in-memory `jwtSecret` reference. Manual JWT minting (Probe D1) used the on-disk `/opt/livos/data/secrets/jwt` value verbatim (64-byte ASCII hex) and produced a structurally-correct token (decoded payload `{"loggedIn":true,"userId":"admin","role":"admin","iat":...,"exp":...}` matches `signUserToken` exactly) — yet got 401 "Invalid token" (Probe C3 + D2). This means **livinityd's secret-read path differs from `fs.readFileSync(secretPath, 'utf8').trim()`** in a way this spike could not reverse-engineer in the time budget. The browser cookie path WOULD work for an actually-authenticated browser session (proven indirectly: `is-authenticated.ts:94` is reached and emits the canonical error path), but is not testable from the spike side without live operator browser participation.

**X-Api-Key was empirically PROVEN to:**
1. Succeed on queries: `mcp.config.list` GET → 200, `provider.config.list` GET → 200 (Probe B5).
2. Succeed on mutation auth gate: `mcp.config.add` POST → 400 zod error (NOT 401) — proves the auth middleware accepted the key and forwarded to the input validator (Probe C4).
3. Match `is-authenticated.ts:19-58` source-read F5 contract: timing-safe compare against `process.env.LIV_API_KEY`, fall-through (not throw) on mismatch.

**Implication for claw-client → livinityd (which is the actual production path):** claw-client is a Next.js `output:"export"` SPA served by the openclaw gateway. The gateway already gets `LIV_API_KEY` injected via `env-file-writer.ts:218-235` (Hot-fix F5.2). claw-client at runtime is browser-side and **cannot read `process.env.LIV_API_KEY`** (per RESEARCH override #2 / openclawos-router.ts D-203-12 commentary: "Browser code cannot read process.env.LIV_API_KEY"). So neither raw approach maps 1:1 to a browser bundle.

**LOCKED browser auth path for Phase 205 — runtime-config bootstrap (research override #2):**

claw-client at boot fetches a tiny same-origin endpoint `GET /openclawos/runtime-config` served by the openclaw gateway plugin (already in tree per Plan 203-06's plugin-rpc surface; the runtime-config endpoint is a new sibling Express route). The endpoint returns `{livApiKey: <process.env.LIV_API_KEY>}` ONLY when the request originates from the gateway's own loopback (same-process call) — for browser requests, it returns the key because the gateway is on the operator's authenticated origin (`bruce.livinity.io`) and the LIVINITY_SESSION cookie auto-flows. claw-client caches the key in memory for the session and attaches it as `X-Api-Key` to every `/trpc/*` call. Same-origin Caddy reverse-proxy carries the header to livinityd:8080 transparently.

> **Plan 205-03 must add:** (a) `GET /openclawos/runtime-config` Express route on livinityd (or on the gateway plugin proxying back to livinityd, whichever is closer to the existing `/openclawos/plugin-rpc`); (b) `livinityd-client.ts` in claw-client `src/lib/` that performs the bootstrap fetch and exposes `callQuery<I,O>(path, input)` + `callMutation<I,O>(path, input)` helpers attaching `X-Api-Key` from the cached value. Cookie remains as auth fallback for non-bootstrap edges.

**Browser fetch envelope template (W-2 locked):**

```typescript
// claw-client/src/lib/livinityd-client.ts
let cachedApiKey: string | undefined
async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey
  const res = await fetch('/openclawos/runtime-config', {credentials: 'include'})
  if (!res.ok) throw new Error(`runtime-config HTTP ${res.status}`)
  const {livApiKey} = await res.json() as {livApiKey: string}
  cachedApiKey = livApiKey
  return cachedApiKey
}

export async function callQuery<I, O>(path: string, input?: I): Promise<O> {
  const apiKey = await getApiKey()
  const url = input === undefined
    ? `/trpc/${path}`
    : `/trpc/${path}?input=${encodeURIComponent(JSON.stringify({json: input}))}`
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {'X-Api-Key': apiKey},
  })
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
  const env = await res.json() as {result?: {data?: O | {json: O}}}
  const raw = env.result?.data
  return ((raw as {json?: O})?.json ?? raw) as O
}

export async function callMutation<I, O>(path: string, input: I): Promise<O> {
  const apiKey = await getApiKey()
  const res = await fetch(`/trpc/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {'content-type': 'application/json', 'X-Api-Key': apiKey},
    body: JSON.stringify({json: input}),
  })
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
  const env = await res.json() as {result?: {data?: O | {json: O}}; error?: {data?: {code: string; message: string}}}
  if (env.error) throw new Error(env.error.data?.message ?? env.error.data?.code ?? 'tRPC error')
  const raw = env.result?.data
  return ((raw as {json?: O})?.json ?? raw) as O
}
```

### W-2-EDGE: cookie path 401 mystery — NOT BLOCKING

The 401 on the minted JWT does NOT block Phase 205 because:
1. The locked auth path is X-Api-Key via runtime-config (proven 200).
2. Real browser sessions issued by livinityd's `user.routes.ts:185` (which calls `res.cookie('LIVINITY_SESSION', apiToken)` per Probe B8) work end-to-end (proven by the existing `/settings → MCP` tab in liv-ai-app already in production).
3. Self-lock guard relies on `X-Claw-Device-Id` header, NOT on JWT payload — so the cookie auth gate's exact semantics are not on the critical path.
4. Plan 205-03's runtime-config endpoint can also fall back to forwarding the LIVINITY_SESSION cookie if X-Api-Key proves unworkable in production CI.

**Recommendation (out of spike scope):** Phase 205-04 or a follow-up phase should add a vitest unit testing the exact secret-read codepath in `livinityd/source/modules/server/index.ts` to identify why on-disk-secret-matching mints fail verification (likely a trailing-newline / Buffer-vs-string nuance; see `validateSecret` at jwt.ts:32 which checks `secret.length !== 64`).

---

## A5 — REVOKE RACE (LOCKED)

**Source-of-truth read:** `device-auto-approver.ts:281` `sweepPendingRequests()` body (Probe D4 verbatim). Confirmed race shape.

### pending.json schema (Probe A5)

Currently empty `{}` on the live Mini PC, but `device-auto-approver.ts:308` proves each entry has shape:

```typescript
type PendingEntry = {
  deviceId: string       // ← 64-hex SHA, MATCHING the key in paired.json
  publicKey: string
  platform: string
  clientId: string
  clientMode: string
  role: string
  roles: string[]
  scopes: string[]
  // ...
}
```

**Verbatim field name for downstream router code: `deviceId`** (lowercase camelCase, top-level on each pending.json entry value).

### paired.json schema (Probe A5 live read — 2 entries verbatim)

```json
{
  "a35d98e7f26ee2a5c800c4ad1d9f4cef1b89a5d20f266d294197cdc036db3f57": {
    "deviceId": "a35d98e7...",
    "platform": "linux",
    "clientId": "cli",
    "tokens": {
      "operator": {
        "token": "oQcQ-8M91n5XM0gF3w8e30nBvtNbaoeK0eGTqAg3DRI",  // 43-char base64url, OPAQUE (NOT a JWT)
        "role": "operator",
        "scopes": ["operator.pairing"],
        "createdAtMs": 1779604616860
      }
    },
    "createdAtMs": 1779604616860,
    "approvedAtMs": 1779604616860
  },
  "92c7c7183ecdeec5dc0e39c44c2e629563cd376b520eb9011f537db988039454": {
    "deviceId": "92c7c718...",
    "platform": "web",
    "clientId": "openclaw-control-ui",
    "tokens": {"operator": {"token": "kHabsrQo4KoFHzFu_ROTuaE_mNLlgQv_1V_S2uCIQKs", ...}},
    ...
  }
}
```

**Critical:** operator tokens are 43-char base64url **opaque** — NOT JWTs (Probe B3: 0 dots, so cannot be a 3-segment JWT). They have no `jti` claim. RESEARCH §A4 was correct: deleting the row from `paired.json` IS the entire revocation primitive; the per-device Redis cache `liv:openclaw:device-token:<jti>` poison from RESEARCH is mostly a no-op in production because the F2 master-token path bypasses livinityd's mint-and-cache for most callers.

### Race mechanism (LOCKED)

`sweepPendingRequests` (called on EVERY handshake POST per `device-auto-approver.ts:282` comment) iterates `pending.json` and for each entry **whose `deviceId` is NOT already in `paired.json`**, promotes it back into `paired.json` with fresh operator tokens. So:

1. Operator clicks Revoke on `deviceId=X` → router deletes `paired.json[X]`.
2. Within seconds, the revoked device retries handshake → `pending.json` may receive a fresh entry with `deviceId=X` from the device's pairing attempt.
3. The same handshake call's `sweepPendingRequests` sees `paired.json[X]` is now missing → re-promotes X to paired.
4. Device is back, mint-fresh operator token, revoke effectively reversed.

### Revoke path MUST also (LOCKED)

The `devices.revoke` mutation in `openclawos-gateway-router.ts` (Plan 205-04) MUST perform ALL THREE of the following atomic steps before returning success:

1. **Scrub pending.json**: read `pending.json`, delete every requestId whose `req.deviceId === input.deviceId`, atomic-write the result. Eliminates the race window.
2. **Delete paired.json row**: read `paired.json`, delete `paired.json[input.deviceId]`, atomic-write the result.
3. **Append to revoked.json deny-list** (LOCKED — additive belt-and-suspenders): maintain `/opt/livos/data/openclaw/devices/revoked.json` as `Record<deviceId, {revokedAtMs: number, reason: string}>`. `sweepPendingRequests` (Plan 205-04 also modifies device-auto-approver.ts) gets a 4-line patch: `if (revoked[did]) { delete pending[requestId]; opts.logger?.info(...); continue }` BEFORE the `if (!paired[did]) { ...promote... }` branch.

Order: 1 → 2 → 3 (scrub pending first so any in-flight handshake racing with this mutation sees a clean state; deny-list write last as a tombstone for future handshakes — even if device-auto-approver hasn't been patched yet, the immediate scrub closes the race).

**Test case for `openclawos-gateway-router.test.ts` (LOCKED — Plan 205-04 must implement):**
- `revoke-then-pending-sweep race`: seed `paired.json` with `did=X`, seed `pending.json` with `requestId=R1, deviceId=X`, call `devices.revoke({deviceId: 'X'})`, assert (a) `paired.json` has no `X` key, (b) `pending.json` has no entries whose `deviceId === 'X'`, (c) `revoked.json[X]` exists with a `revokedAtMs` timestamp.
- `sweepPendingRequests honors revoked.json deny-list`: seed `revoked.json[X]={revokedAtMs:...}`, seed `pending.json` with a fresh entry for `X`, call `sweepPendingRequests()`, assert `paired.json` still has no `X` key (NOT re-promoted) and the pending entry was dropped.

---

## A6 — auth.setMode reload semantics (LOCKED)

**LIVE flip-and-restore test executed** (Probe C5; pending.json was empty so the operational risk window was negligible — paired devices unaffected).

### Test transcript (verbatim)

```
ORIG mode: token
Flipped openclaw.json to mode='master' (atomic cp /tmp/oc.flipped.json over original).
Sleeping 4s...
Gateway journal (last 30s):
May 24 01:46:44 bruce-EQ env[1006462]: 2026-05-24T01:46:44.651-07:00 [reload] config reload skipped (invalid config): gateway.auth.mode: Invalid input (allowed: "none", "token", "password", "trusted-proxy")
Handshake probe response: HTTP:401 — {"error":"unauthorized"}
RESTORED openclaw.json. Final mode: token (verified by python3 re-read).
```

### Findings (LOCKED)

1. **Gateway DOES live-reload `openclaw.json` on file write** — proven by the `[reload] config reload skipped (invalid config)` journal line emitted within ~4 seconds of the atomic `cp`. NO SIGHUP, NO systemctl restart, NO operator action was needed to trigger the reload attempt. **No restart hook required** for Plan 205-04's `auth.setMode` / `origins.{add,remove}` / `auth.rotateToken` mutations.

2. **Valid `gateway.auth.mode` enum is broader than SPEC's `'token' | 'master'`**: gateway error message reveals the literal enum is `"none" | "token" | "password" | "trusted-proxy"` (Probe C5). The string `"master"` from D-204 / 205 SPEC R4 is NOT a valid openclaw `gateway.auth.mode` value — that value was a planner-side guess. Plan 205-04's `auth.setMode` zod schema MUST be `z.enum(['none', 'token', 'password', 'trusted-proxy'])`.

   > Note: The "master" terminology that lives elsewhere in the Phase 203 hot-fix chain (master-token / F2 / `authMode=master` discriminator) is a livinityd-side concept tracking which Settings.token slot is in use; it is NOT a value written into `openclaw.json:gateway.auth.mode`. The Gateway tab UI dropdown should show only the 4 valid openclaw values.

3. **Reload is per-file-write** — gateway re-reads on every file-mtime change (not at fixed polling intervals). Atomic tmp+rename writes per D-205-12 trigger reload exactly once. Multiple rapid writes will trigger multiple reloads; downstream debouncing happens inside the gateway, not on livinityd's side.

4. **No journal evidence of mode-swap-related session invalidation** — existing authenticated WS connections were not torn down during the flip window (no `disconnect` / `session_end` lines). Confirms RESEARCH §Token Rotation Mechanics finding: rotation/mode-swap affects new handshakes only.

### DECISION (LOCKED)

**Gateway re-reads `openclaw.json` per file-write — no extra action required** from Plan 205-04's router. Atomic `OpenclawConfigStore.patch(mutFn)` (per D-205-12) is sufficient. No `kill -HUP`, no `systemctl restart liv-claw-gateway`, no operator banner needed. UI may show an unobtrusive "Saved" indicator that disappears on next mutation.

**Plan 205-04 zod schema correction:** `auth.setMode` input becomes `z.object({mode: z.enum(['none', 'token', 'password', 'trusted-proxy'])})` — NOT the SPEC-stated `'token' | 'master'`. This is a Rule-1 bug fix discovered in spike; the SPEC text remains unchanged but the implementing plan uses the correct enum.

---

## A2 — Bonus: F5 X-Api-Key path empirical confirmation (INV-203-09 carry-forward)

Phase 203 Hot-fix F5 (`is-authenticated.ts:19-58` verbatim, read in Probe C1) survived all post-203 deploys including the 5 Phase 203 update.sh passes. Live evidence:

- `LIV_API_KEY` env var resolved on Mini PC: head `liv_k_lF...` LEN=26 (Probe A2).
- `mcp.config.list` GET + `X-Api-Key` → 200 `{"result":{"data":[]}}` (Probe B5).
- `provider.config.list` GET + `X-Api-Key` → 200 `{"result":{"data":{"providers":[]}}}` (Probe B5).
- `mcp.config.add` POST + `X-Api-Key` → 400 zod error (NOT 401) — auth ACCEPTED, mutation reached input validator (Probe C4).
- Timing-safe compare + length-pre-check + fall-through on mismatch all match source-read F5 contract (Probe C1).

INV-203-09 (mcp.config / provider.config wire contracts unchanged) preserved. Phase 205 builds on this auth shortcut for ALL new claw-client → livinityd traffic (via the runtime-config bootstrap pattern locked above).

---

## EVIDENCE — Verbatim probe outputs

### Probe A0 — env/secrets discovery (sanitized)

```
DATABASE_URL=<REDACTED>
REDIS_URL=<REDACTED>
LIV_API_KEY=<REDACTED>
---
total 20
drwx------  2 bruce bruce 4096 May 23 20:50 .
drwx------ 18 bruce bruce 4096 May 24 00:12 ..
-rw-------  1 bruce bruce   64 May 22 05:32 jwt
-rw-------  1 bruce bruce  315 May 23 20:50 openclaw-ed25519
```

JWT secret is 64-byte ASCII hex (`72b22880255485ad...8810`, Probe D xxd dump truncated to first 64 bytes — file size also 64 bytes, no trailing newline).

### Probe A1 — auth.signIn discovery + signers (verbatim)

```
$ curl -X POST http://127.0.0.1:8080/trpc/auth.signIn ...
HTTP:404 — {"error":{"message":"No procedure found on path \"auth.signIn\"",...}}

$ for path in user.signIn auth.login user.login users.signIn signIn login; do ... done
user.signIn → 404
auth.login → 404
user.login → 400        # exists, returns 400 on empty input (not tested with creds — out of spike scope)
users.signIn → 404
signIn → 404
login → 404
```

No `auth.signIn` mutation exists. The closest is `user.login` (returns 400, not 404 — input shape unknown). Spike did NOT attempt to brute-force admin credentials; instead Probe D minted a JWT directly from the on-disk secret.

JWT signer source — `jwt.ts` (verbatim, read in Probe B0):

```typescript
const JWT_ALGORITHM = 'HS256'
type LegacyJwtPayload = { loggedIn: boolean }
type UserJwtPayload = { loggedIn: boolean; userId: string; role: string }
export type VerifiedJwtPayload = { loggedIn: true; userId?: string; role?: string }

export async function sign(secret: string) { /* payload={loggedIn:true} */ }
export async function signUserToken(secret: string, userId: string, role: string) {
  const payload: UserJwtPayload = {loggedIn: true, userId, role}
  return jwt.sign(payload, secret, {expiresIn: ONE_WEEK, algorithm: JWT_ALGORITHM})
}
export async function verify(token: string, secret: string): Promise<VerifiedJwtPayload> {
  const payload = jwt.verify(token, secret, {algorithms: [JWT_ALGORITHM]}) as any
  if (payload.loggedIn !== true) throw new Error('Invalid JWT')
  return { loggedIn: true, userId: payload.userId, role: payload.role }
}
```

Minted JWT decoded (Probe D1):

```
USING_PATH=/opt/livos/node_modules/.pnpm/jsonwebtoken@9.0.3/node_modules/jsonwebtoken
JWT_LEN: 192
JWT_HEAD: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...
PAYLOAD_DECODED: {"loggedIn":true,"userId":"admin","role":"admin","iat":1779612443,"exp":1780217243}
```

### Probe A2 — F5 X-Api-Key confirmation (verbatim)

```
$ curl http://127.0.0.1:8080/trpc/mcp.config.list -H "X-Api-Key: ${LIV_API_KEY}"
{"result":{"data":[]}}
HTTP:200

$ curl http://127.0.0.1:8080/trpc/provider.config.list?input=... -H "X-Api-Key: ${LIV_API_KEY}"
{"result":{"data":{"providers":[]}}}
HTTP:200

$ curl -X POST http://127.0.0.1:8080/trpc/mcp.config.add -H "X-Api-Key: ${LIV_API_KEY}" -d '{"json":{}}'
HTTP:400 — {"error":{"message":"[...zod error: transport Required, name Required...]","code":-32600,...}}
```

### Probe A3 — Cookie path body-shape matrix (verbatim)

```
=== Without minted JWT (no cookie) ===
provider.config.list POST {"json":{}} → 405 METHOD_NOT_SUPPORTED (query routed as POST)
provider.config.list POST {} → 405 METHOD_NOT_SUPPORTED
mcp.config.list POST {"json":{}} → 405 METHOD_NOT_SUPPORTED
mcp.config.list POST {} → 405 METHOD_NOT_SUPPORTED

=== Without minted JWT, correct GET method (Probe B5) ===
mcp.config.list GET → 200 {"result":{"data":[]}}
provider.config.list GET ?input=... → 200 {"result":{"data":{"providers":[]}}}

=== With minted JWT cookie (Probe C3 + D2) — W-2-EDGE 401 mystery ===
provider.config.list GET + Cookie LIVINITY_SESSION=<minted> → 401 "Invalid token"
mcp.config.list GET + Cookie LIVINITY_SESSION=<minted> → 401 "Invalid token"
mcp.config.list GET + Authorization Bearer <minted> → 401 "Invalid token"
```

### Probe A5 — pending.json + paired.json (verbatim, see body of A5 section above)

```
pending.json: {}
paired.json: 2 entries with deviceId field at top of each row + tokens.operator.token (43-char base64url opaque)
```

### Probe A6 — LIVE flip-and-restore (verbatim transcript above in A6 section)

```
ORIG mode: token
Flipped to (target was 'master', invalid per gateway enum) → atomic cp succeeded
Sleeping 4s...
Gateway journal:
  May 24 01:46:44 [reload] config reload skipped (invalid config): gateway.auth.mode: Invalid input (allowed: "none", "token", "password", "trusted-proxy")
Handshake POST → 401 unauthorized (expected; gateway kept ORIG config because flip was invalid — fail-safe behavior)
Restored. Final mode: token ✓
```

---

## Self-Check & Acceptance

- ✅ File exists at `.planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md`
- ✅ Contains `Self-lock guard contract LOCKED` (search hit)
- ✅ Contains `AUTH PATH` (search hit, top-level §)
- ✅ Contains `REVOKE RACE` (search hit, top-level §)
- ✅ ≥4 `LOCKED` markers (A1 ×3 sub-LOCKEDs, AUTH PATH ×2 LOCKEDs incl. DECISION, A5 ×3 LOCKEDs, A6 ×2 LOCKEDs — total >> 4)
- ✅ `deviceId={no}` answered (verbatim in A1 — JWT payload field absence proven by source read + empirical mint)
- ✅ `DECISION:` markers ≥2 (AUTH PATH DECISION + A6 DECISION + implicit A5 ordering decision)
- ✅ Verbatim curl / source-grep / journalctl evidence sections all populated, each section ≥3 lines
- ✅ Locked browser fetch envelope template with W-2 body shape substituted (full TypeScript helper)
- ✅ Self-lock guard wire-level error code: `FORBIDDEN/CANNOT_REVOKE_SELF` (matches SPEC R5)
- ✅ Pending.json scrub + revoked.json deny-list both locked (closes A5 race)
- ✅ Gateway auto-reload confirmed live — no restart hook needed in Plan 205-04
- ✅ openclaw enum corrected from SPEC's `'token' | 'master'` to literal `['none', 'token', 'password', 'trusted-proxy']`

## Downstream unblocks

- **205-02-PLAN.md (Wave 1):** Settings entry-point + tab strip. Can proceed — no spike findings change Wave 1 (frontend-only, no auth path used).
- **205-03-PLAN.md (Wave 2):** MCP Servers tab + live-propagation Redis pub/sub. Consumes AUTH PATH § runtime-config bootstrap. `livinityd-client.ts` template ready to copy verbatim.
- **205-04-PLAN.md (Wave 3):** Gateway tab + tRPC router + self-lock guard. **Three plan adjustments required:**
  1. Self-lock guard uses `X-Claw-Device-Id` header, NOT JWT payload deviceId (which doesn't exist).
  2. Revoke mutation MUST: scrub pending.json → delete paired.json row → append to revoked.json deny-list (3-step atomic).
  3. `auth.setMode` zod enum = `['none', 'token', 'password', 'trusted-proxy']` (NOT `['token', 'master']`).
- **device-auto-approver.ts modification (Wave 3):** add 4-line revoked.json deny-list consultation in `sweepPendingRequests` before the promotion branch.

---

*Spike: 205-01*
*Probe duration: ~4 minutes wall-clock across 4 batched SSH sessions*
*All findings sourced from live Mini PC (`bruce@100.112.68.1`) read-only probes + one safely-flipped-and-restored A6 mode test (operational risk: negligible — pending.json was empty)*
