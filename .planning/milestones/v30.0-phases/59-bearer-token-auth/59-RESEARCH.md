# Phase 59: B1 Per-User Bearer Token Auth (`liv_sk_*`) - Research

**Researched:** 2026-05-02
**Domain:** PostgreSQL-backed Bearer token auth + Express middleware insertion + tRPC CRUD
**Confidence:** HIGH

## Summary

Phase 59 has a near-perfect twin already living in this codebase: `docker_agents` (Phase 22 MH-04/05) does *exactly* the same thing — `token_hash` + `revoked_at`, cleartext returned ONCE on create, SHA-256 lookup, hash-only verification. The plan should be a direct copy-by-shape exercise. The `broker_usage` capture middleware (Phase 44) is the other key precedent: it documents the exact mount path and order Phase 59 must integrate with.

There is ZERO new dependency surface — Node `crypto` is already in heavy use (`createHash`, `randomBytes`, `timingSafeEqual` all present), `pg` Pool is the only DB client (no ORM), and the schema is applied via a single idempotent `schema.sql` run at boot (no migration tooling needed). The `device_audit_log` REUSE pattern from Phase 46 (`fail2ban-admin/events.ts`) is a 1:1 template for the api-keys audit hook.

**Primary recommendation:** Mirror `livos/packages/livinityd/source/modules/docker/agents.ts` for the data layer, mirror `livos/packages/livinityd/source/modules/usage-tracking/routes.ts` (`getMine`/`getAll` split) for the tRPC layer, and mirror `livos/packages/livinityd/source/modules/fail2ban-admin/events.ts` for the audit hook. The Bearer middleware mounts in `server/index.ts` between line 1228 (`mountUsageCaptureMiddleware`) and line 1234 (`mountBrokerRoutes`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Phase 56 Q5 verdict:** No automatic rotation in v30 — manual revoke + recreate. Default-keyed = OFF (opt-in). No expiry on keys (`expires_at` deferred to v30+).
- **Key format:** `liv_sk_<base62-32>` (39 chars total). Generated via `crypto.randomBytes(24).toString('base64url').slice(0, 32)`. Base64url is acceptable in lieu of strict base62 (charset is `[A-Za-z0-9_-]`).
- **Storage:** SHA-256 hash of full plaintext key (NOT just body) → 64 hex chars in `key_hash`. First 8 chars of plaintext go in `key_prefix`.
- **Verification:** Bearer middleware extracts `liv_sk_*` from `Authorization` header, computes SHA-256, looks up by hash with `revoked_at IS NULL`. Constant-time comparison via `crypto.timingSafeEqual`.
- **Schema:** Exactly as documented in CONTEXT.md (UUID id + FK to users + key_hash CHAR(64) UNIQUE + key_prefix VARCHAR(16) + name VARCHAR(64) + created_at + last_used_at + revoked_at; partial index on `key_hash WHERE revoked_at IS NULL`).
- **Mount order:** CORS → broker_usage capture → **Bearer middleware (NEW)** → mode dispatch (Phase 57) → URL-path resolver (legacy) → broker handler.
- **Middleware behavior:** Bearer present + valid → `req.userId = <resolved>`, `req.authMethod = 'bearer'`. Bearer present + invalid → 401 immediately, NO fall-through. Bearer absent → pass without setting `req.userId`; legacy URL-path resolver runs.
- **Error body shape (Anthropic-spec):** `{"error": {"type": "authentication_error", "message": "API key revoked"|"API key invalid"}}`, 401, `Content-Type: application/json`.
- **last_used_at debouncing:** In-memory `Map<key_hash, last_seen_timestamp>`; skip PG write if last seen <1 min ago; background flusher every 30s; flush on graceful shutdown.
- **tRPC routes:** `apiKeys.create` (privateProcedure, returns plaintext ONCE), `apiKeys.list` (privateProcedure, no plaintext/hash), `apiKeys.revoke` (privateProcedure, idempotent), `apiKeys.listAll` (adminProcedure, mirrors `usage.getAll`).
- **httpOnlyPaths additions:** `apiKeys.create`, `apiKeys.revoke`, `apiKeys.list`, `apiKeys.listAll`.
- **Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNTOUCHED.
- **Negative cache TTL = 5s** for unknown/revoked keys (mitigate brute-force probing); positive cache 60s.
- **Audit hook:** `device_audit_log` REUSE with `device_id='api-keys-system'` sentinel for create/revoke events.

### Claude's Discretion
- File structure for the middleware (`bearer-auth.ts` standalone module — recommended, see Architecture below — vs folding into existing `livinity-broker/auth.ts`).
- Test fixture format (in-memory PG via testcontainers vs mock pg client). **Recommended:** mock `getPool()` (matches existing pattern; no real PG in unit tests — see `usage-tracking/database.test.ts`).
- Logging detail for auth failures (default redacted prefix only; never log full plaintext).
- `apiKeys.create` response shape — `{plaintext, prefix, ...}` flat OR `{plaintext, key: {prefix, ...}}` nested.

### Deferred Ideas (OUT OF SCOPE)
- Settings UI for API Keys → Phase 62.
- `broker_usage.api_key_id` column → Phase 62.
- Public endpoint exposure (`api.livinity.io`) → Phase 60.
- Automatic rotation / expiration → v30+.
- Per-key rate limits → Phase 61.
- OAuth/OIDC alternative auth → out (D-NO-BYOK).
- Key scopes / permissions matrix → out (v30 keys are full per-user access).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-BROKER-B1-01 | `api_keys` table: `id`, `user_id`, `key_hash` (SHA-256), `key_prefix` (8 chars), `name`, `created_at`, `last_used_at`, `revoked_at` | Schema slot identified in `database/schema.sql`; idempotent `CREATE TABLE IF NOT EXISTS` pattern is the migration mechanism. `gen_random_uuid()` already used 14× in this file → no `pgcrypto` line needed. Twin: `docker_agents` (line 276). |
| FR-BROKER-B1-02 | Format `liv_sk_<base62-32>`; plaintext shown ONCE; SHA-256 hash + constant-time compare | Twin pattern: `docker/agents.ts:62-63` — `randomBytes(32).toString('hex')` → `createHash('sha256').update(token).digest('hex')`. `timingSafeEqual` already used in `server/index.ts:1087` for HMAC sig check. |
| FR-BROKER-B1-03 | Bearer middleware on broker BEFORE per-user URL-path identity logic | Mount slot: `server/index.ts` between line 1228 (`mountUsageCaptureMiddleware`) and line 1234 (`mountBrokerRoutes`). Express middleware order is insertion order. |
| FR-BROKER-B1-04 | tRPC `apiKeys.{create,list,revoke}` (+ admin `listAll`) | Twin pattern: `usage-tracking/routes.ts` (`getMineProc`/`getAllProc` split via `privateProcedure`/`adminProcedure`). Procedures defined in `server/trpc/trpc.ts:29-35`. Router mounted in `server/trpc/index.ts:40` namespace block. |
| FR-BROKER-B1-05 | Revoked → 401 with Anthropic-spec error body | Anthropic-spec body shape already used in broker auth path: `livinity-broker/auth.ts:62-67` — `{type: 'error', error: {type: 'authentication_error', message: '...'}}`. Mirror exactly. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `api_keys` table DDL | Database | — | All persistent state goes through PG; schema lives in `schema.sql` |
| Plaintext generation + hashing | API/Backend (livinityd) | — | `crypto.randomBytes` + `crypto.createHash` server-side only; UI never sees raw entropy source |
| Bearer header parsing + lookup | API/Backend (Express middleware) | — | Per-request validation must run on every broker call; cannot live elsewhere |
| `last_used_at` debounce cache | API/Backend (in-memory) | — | livinityd is single-process; in-memory `Map` is sufficient (no Redis cross-process needed) |
| `apiKeys.{create,list,revoke}` tRPC | API/Backend | Frontend (Phase 62 only) | Phase 59 ships routes only; Settings UI defers to Phase 62 |
| Audit hook (create/revoke events) | API/Backend (PG `device_audit_log`) | Filesystem (`/opt/livos/data/security-events/`) | REUSE Phase 46 fail2ban pattern: PG primary + JSON belt-and-suspenders fallback |
| Plaintext display "show once" UX | Frontend (Phase 62) | API/Backend (one-shot response) | Phase 59 returns plaintext in tRPC response; UI render defers to Phase 62 |

## Standard Stack

### Core (already in repo — NO NEW DEPENDENCIES per D-NO-NEW-DEPS)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` | (pinned in `livos/packages/livinityd/package.json`) | PostgreSQL driver | Already the only DB client; `getPool()` from `database/index.ts:43` is the universal entry [VERIFIED: codebase grep] |
| `node:crypto` | Node built-in | `randomBytes`, `createHash`, `timingSafeEqual` | Already used 20+ files; no third-party crypto deps in repo [VERIFIED: grep results] |
| `@trpc/server` | (pinned) | tRPC procedure types | Procedures defined in `server/trpc/trpc.ts:12-35` [VERIFIED] |
| `zod` | (pinned) | Input schema validation | Used in every existing router (e.g., `usage-tracking/routes.ts:28`) [VERIFIED] |
| `express` | (pinned) | Bearer middleware host | `server/index.ts` is the Express app; middleware mount via `app.use()` [VERIFIED] |
| `vitest` | (pinned) | Test framework | `livos/packages/livinityd/package.json` script: `vitest --testTimeout 180000 --hookTimeout 180000 --maxConcurrency 1 --poolOptions.threads.singleThread true --reporter verbose` [VERIFIED] |

**Verification command:** `grep '"pg"' livos/packages/livinityd/package.json` — pg is the canonical client; `pg.Pool` is what `getPool()` returns. [VERIFIED]

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Random key bytes | Custom RNG | `crypto.randomBytes(24)` | OS-CSPRNG; already pattern in `docker/agents.ts:62` [VERIFIED] |
| SHA-256 hashing | Custom hash | `crypto.createHash('sha256').update(x).digest('hex')` | Already pattern in `docker/agents.ts:46` [VERIFIED] |
| Constant-time compare | `if (a === b)` | `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` | Timing attack prevention; already pattern in `server/index.ts:1087` [VERIFIED] |
| UUID generation | Custom | `gen_random_uuid()` (PG side) or `randomUUID()` (Node side) | Already used 14× in schema.sql; `randomUUID` from `node:crypto` used in `fail2ban-admin/events.ts:27` [VERIFIED] |
| Migration framework | knex/prisma/sequelize migration | Append to `schema.sql` with `IF NOT EXISTS` guards | Project pattern: idempotent schema applied at boot in `database/index.ts:68`. No standalone migration tool exists. [VERIFIED] |
| Audit log table | New `api_keys_audit` table | REUSE `device_audit_log` with `device_id='api-keys-system'` | Phase 46 set the precedent; `device_id` column is `TEXT NOT NULL` (schema.sql:112) — accepts arbitrary string sentinels [VERIFIED] |

## Architecture Patterns

### System Architecture Diagram

```
                  ┌─────────────────────────────────────────────┐
                  │  External client (Bolt.diy / curl / SDK)    │
                  │  Authorization: Bearer liv_sk_xxxxx...      │
                  └─────────────────────────┬───────────────────┘
                                            │
                                            ▼
              ┌─────────────────────────────────────────────────────────┐
              │  livinityd Express app (server/index.ts)                │
              │                                                         │
              │  Mount order on /u/:userId/v1/* (line numbers):         │
              │   1. CORS / helmet / cookieParser  (lines 255-296)      │
              │   2. mountUsageCaptureMiddleware    (line 1228)         │
              │      └─→ broker_usage row capture (Phase 44)            │
              │   3. ★ Bearer middleware NEW       (line ~1230 NEW)     │
              │      ├─→ no Authorization header     → next()           │
              │      ├─→ Bearer + valid (cache or PG) → req.userId set, │
              │      │                                  req.authMethod  │
              │      │                                  = 'bearer'      │
              │      └─→ Bearer + invalid/revoked    → 401 Anthropic    │
              │                                          shape          │
              │   4. mountBrokerRoutes              (line 1234)         │
              │      └─→ createBrokerRouter (router.ts)                 │
              │          ├─→ containerSourceIpGuard (legacy)            │
              │          ├─→ resolveAndAuthorizeUserId (URL-path)       │
              │          │   (skipped if req.userId already set)        │
              │          └─→ broker handler                             │
              └─────────────────────────────────────────────────────────┘
                                            │
                                            ▼
              ┌─────────────────────────────────────────────────────────┐
              │  Bearer middleware internals (NEW — bearer-auth.ts)     │
              │                                                         │
              │  parse "Bearer liv_sk_*" → SHA-256 hash                 │
              │     ├─ positive cache hit (60s TTL) → return user_id    │
              │     ├─ negative cache hit (5s TTL)  → return 401        │
              │     └─ cache miss → SELECT user_id FROM api_keys        │
              │                       WHERE key_hash=$1                 │
              │                       AND revoked_at IS NULL            │
              │           ├─ row found → cache + last_used debounce     │
              │           │              + audit not needed (use IS     │
              │           │              not auditable; only mgmt is)   │
              │           └─ no row → cache 5s + 401                    │
              │                                                         │
              │  In-memory Map<key_hash, {user_id, expiresAt}>          │
              │  Background flusher (setInterval 30s) writes batched    │
              │  UPDATE api_keys SET last_used_at = $ts WHERE id IN…    │
              └─────────────────────────────────────────────────────────┘
                                            │
                                            ▼
              ┌─────────────────────────────────────────────────────────┐
              │  tRPC layer (server/trpc/index.ts namespace 'apiKeys')  │
              │                                                         │
              │  privateProcedure  apiKeys.create   → plaintext ONCE    │
              │  privateProcedure  apiKeys.list     → user's own keys   │
              │  privateProcedure  apiKeys.revoke   → idempotent        │
              │  adminProcedure    apiKeys.listAll  → cross-user view   │
              │                                                         │
              │  Each mutation → recordApiKeyEvent() (REUSE             │
              │     device_audit_log; sentinel device_id =              │
              │     'api-keys-system'; tool_name = 'create_key' |       │
              │     'revoke_key')                                       │
              └─────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
livos/packages/livinityd/source/modules/
├── api-keys/                            # NEW — Phase 59
│   ├── index.ts                          # exports public surface (createKey, findKeyByHash, revokeKey, listKeysForUser, listAllKeys)
│   ├── database.ts                       # PG layer (mirrors docker/agents.ts shape)
│   ├── bearer-auth.ts                    # Express middleware
│   ├── cache.ts                          # in-memory Map + flusher
│   ├── events.ts                         # device_audit_log REUSE (mirrors fail2ban-admin/events.ts)
│   ├── routes.ts                         # tRPC router (mirrors usage-tracking/routes.ts)
│   ├── database.test.ts
│   ├── bearer-auth.test.ts
│   ├── cache.test.ts
│   ├── routes.test.ts
│   └── integration.test.ts               # full create→use→revoke flow
└── database/
    └── schema.sql                        # APPEND new api_keys block at end (line 339+)

livos/packages/livinityd/source/modules/server/
├── trpc/
│   ├── common.ts                         # APPEND apiKeys.{create,list,revoke,listAll} to httpOnlyPaths
│   ├── common.test.ts                    # APPEND tests for new entries
│   └── index.ts                          # APPEND `apiKeys` namespace + import
└── index.ts                              # INSERT mountBearerMiddleware between 1228 and 1234
```

### Pattern 1: Token Hash + Lookup (`docker/agents.ts` twin)

```typescript
// Source: livos/packages/livinityd/source/modules/docker/agents.ts:11-77
import {createHash, randomBytes} from 'node:crypto'
import {getPool} from '../database/index.js'

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf-8').digest('hex')
}

export async function createApiKey(opts: {userId: string; name: string}): Promise<{
  row: ApiKeyRow
  plaintext: string
}> {
  const pool = getPool()
  if (!pool) throw new Error('Database not initialized')
  // 24 random bytes -> base64url -> 32 char body. Full key is 'liv_sk_' + body.
  const body = randomBytes(24).toString('base64url').slice(0, 32)
  const plaintext = `liv_sk_${body}`
  const keyHash = hashKey(plaintext)
  const keyPrefix = plaintext.slice(0, 8)  // 'liv_sk_' + first body char (8 chars)
  const {rows} = await pool.query(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, key_prefix, name, created_at, last_used_at, revoked_at`,
    [opts.userId, keyHash, keyPrefix, opts.name],
  )
  return {row: rowToApiKey(rows[0]), plaintext}
}

export async function findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
  const pool = getPool()
  if (!pool) return null
  const {rows} = await pool.query(
    `SELECT id, user_id, key_prefix, name, created_at, last_used_at, revoked_at
     FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash],
  )
  if (rows.length === 0) return null
  return rowToApiKey(rows[0])
}

export async function revokeApiKey(opts: {id: string; userId: string}): Promise<void> {
  const pool = getPool()
  if (!pool) throw new Error('Database not initialized')
  // user-scoped + idempotent (only sets revoked_at on first revoke)
  await pool.query(
    `UPDATE api_keys SET revoked_at = NOW()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [opts.id, opts.userId],
  )
}
```

### Pattern 2: Constant-Time Comparison

The `findApiKeyByHash` SELECT comparison happens in PG using a btree index lookup, which is NOT timing-safe at the application layer. **However**, the threat model is timing of plaintext-key guesses, not hash-of-key guesses. Once the plaintext is hashed (constant-time-ish via `createHash`), the PG lookup is on the hash — an attacker would need a SHA-256 preimage to leverage timing on the index lookup, which is computationally infeasible.

Per CONTEXT.md decision, the constant-time compare is for **defense-in-depth** against any future code path that compares hashes directly. Use:

```typescript
// Source: livos/packages/livinityd/source/modules/server/index.ts:1086-1087
const a = Buffer.from(presentedHash, 'hex')
const b = Buffer.from(rowHash, 'hex')
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  return reject()
}
```

This belt-and-suspenders pattern matches the GitHub webhook HMAC verification already in the repo. Bearer middleware should compare `presentedKeyHash` against the PG-returned `key_hash` value with `timingSafeEqual` (NOT just rely on the `WHERE key_hash = $1` match).

### Pattern 3: Express Bearer Middleware (NEW)

```typescript
// File: livos/packages/livinityd/source/modules/api-keys/bearer-auth.ts
import type {Request, Response, NextFunction, Application} from 'express'
import type Livinityd from '../../index.js'
import {findApiKeyByHash, hashKey} from './database.js'
import {ApiKeyCache} from './cache.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
      authMethod?: 'bearer' | 'url-path'
      apiKeyId?: string
    }
  }
}

const ANTHROPIC_AUTH_ERROR = (message: string) => ({
  type: 'error' as const,
  error: {type: 'authentication_error' as const, message},
})

export function createBearerMiddleware(livinityd: Livinityd, cache: ApiKeyCache) {
  return async function bearerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer liv_sk_')) {
      // No Bearer → fall through to legacy URL-path resolver
      next()
      return
    }
    const plaintext = auth.slice('Bearer '.length)
    const keyHash = hashKey(plaintext)

    // Check cache (positive 60s, negative 5s)
    const cached = cache.get(keyHash)
    if (cached?.kind === 'invalid') {
      res.status(401).json(ANTHROPIC_AUTH_ERROR('API key invalid'))
      return
    }
    if (cached?.kind === 'valid') {
      req.userId = cached.userId
      req.authMethod = 'bearer'
      req.apiKeyId = cached.id
      cache.touchLastUsed(keyHash)
      next()
      return
    }

    // Cache miss → PG lookup
    const row = await findApiKeyByHash(keyHash).catch(() => null)
    if (!row) {
      cache.setInvalid(keyHash)  // 5s TTL
      res.status(401).json(ANTHROPIC_AUTH_ERROR('API key invalid'))
      return
    }
    cache.setValid(keyHash, {userId: row.userId, id: row.id})  // 60s TTL
    cache.touchLastUsed(keyHash)
    req.userId = row.userId
    req.authMethod = 'bearer'
    req.apiKeyId = row.id
    next()
  }
}

export function mountBearerMiddleware(app: Application, livinityd: Livinityd, cache: ApiKeyCache): void {
  app.use('/u/:userId/v1', createBearerMiddleware(livinityd, cache))
  // Future Phase 60: also mount on '/v1' for public endpoint
  livinityd.logger.log('[api-keys] Bearer middleware mounted at /u/:userId/v1 (after usage capture, before broker)')
}
```

### Pattern 4: tRPC Routes (`usage-tracking/routes.ts` twin)

```typescript
// Source pattern: livos/packages/livinityd/source/modules/usage-tracking/routes.ts:30-92
import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {privateProcedure, adminProcedure, router} from '../server/trpc/trpc.js'
import {createApiKey, listApiKeysForUser, listAllApiKeys, revokeApiKey} from './database.js'
import {recordApiKeyEvent} from './events.js'

const apiKeysRouter = router({
  create: privateProcedure
    .input(z.object({name: z.string().min(1).max(64)}))
    .mutation(async ({ctx, input}) => {
      if (!ctx.currentUser) throw new TRPCError({code: 'UNAUTHORIZED'})
      const {row, plaintext} = await createApiKey({userId: ctx.currentUser.id, name: input.name})
      void recordApiKeyEvent({
        action: 'create_key',
        keyId: row.id,
        userId: ctx.currentUser.id,
        username: ctx.currentUser.username,
        success: true,
      })
      return {
        id: row.id,
        plaintext,                     // ← ONE AND ONLY TIME
        prefix: row.keyPrefix,
        name: row.name,
        created_at: row.createdAt,
        oneTimePlaintextWarning: true, // advisory flag for future UI
      }
    }),

  list: privateProcedure.query(async ({ctx}) => {
    if (!ctx.currentUser) return []
    return listApiKeysForUser(ctx.currentUser.id)  // SELECT id, key_prefix, name, created_at, last_used_at, revoked_at
  }),

  revoke: privateProcedure
    .input(z.object({id: z.string().uuid()}))
    .mutation(async ({ctx, input}) => {
      if (!ctx.currentUser) throw new TRPCError({code: 'UNAUTHORIZED'})
      await revokeApiKey({id: input.id, userId: ctx.currentUser.id})
      void recordApiKeyEvent({
        action: 'revoke_key',
        keyId: input.id,
        userId: ctx.currentUser.id,
        username: ctx.currentUser.username,
        success: true,
      })
      return {id: input.id, revoked_at: new Date()}
    }),

  listAll: adminProcedure
    .input(z.object({user_id: z.string().uuid().optional()}).optional())
    .query(async ({input}) => listAllApiKeys({userId: input?.user_id})),
})

export default apiKeysRouter
```

### Anti-Patterns to Avoid

- **Don't compare plaintext keys directly** — always hash first, then compare hashes via `timingSafeEqual`. The DB lookup `WHERE key_hash = $1` is acceptable because the input is the SHA-256 of the presented plaintext (not the plaintext itself).
- **Don't log plaintext keys** — even at debug level. Only `key_prefix` may be logged.
- **Don't add `expires_at` column now** — defer to v30+ per CONTEXT.md. Adding columns later is trivial via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` wrapped in a `DO $$ … $$` block (precedent: schema.sql:261-264 for `environments.tags`).
- **Don't import from `livinity-broker/*` in api-keys/** — keeps the broker boundary clean (mirrors Phase 44 D-44-04..06).
- **Don't bypass cache invalidation on revoke** — when `apiKeys.revoke` runs, immediately call `cache.invalidate(keyHash)` so subsequent requests don't get a stale 60s cached "valid" response. Otherwise, revocation has up to 60s lag instead of the documented "immediate" behavior.

## Runtime State Inventory

(N/A — Phase 59 is greenfield additions. New table, new module, new tRPC routes. No existing data to migrate, no string-rename audit needed. CONTEXT.md confirms scope is additive.)

## Common Pitfalls

### Pitfall 1: Forgetting cache invalidation on revoke
**What goes wrong:** User revokes a key; next request still succeeds for up to 60s.
**Why it happens:** Positive cache TTL is 60s; revoke only updates PG.
**How to avoid:** In `revokeApiKey`, after the UPDATE succeeds, call `cache.invalidate(keyHash)`. The cache key is the hash; `database.ts` already knows the hash from the row lookup pre-revoke.
**Warning signs:** Integration test (Wave 4) "create → use (200) → revoke → use (still 200 within 60s)" — must fail without invalidation.

### Pitfall 2: `last_used_at` lost on shutdown
**What goes wrong:** livinityd restarts; pending in-memory `last_used_at` updates never flushed.
**Why it happens:** Background flusher only fires every 30s.
**How to avoid:** Add SIGTERM/SIGINT handler that calls `cache.flush()` synchronously. Pattern: search `livos/packages/livinityd/source` for existing `process.on('SIGTERM')` handlers and chain into them.
**Warning signs:** Test asserting `last_used_at` is non-null after a restart-mid-flight scenario.

### Pitfall 3: Bearer middleware order regression
**What goes wrong:** Bearer middleware runs AFTER broker handler, so `req.userId` is never available downstream.
**Why it happens:** Express middleware ordering is insertion order; new code added in wrong block.
**How to avoid:** Wave 0 test — read `server/index.ts`, find `mountBearerMiddleware` call, assert it precedes `mountBrokerRoutes` in the source text. Same trick `usage-tracking` uses for its capture-before-broker invariant.
**Warning signs:** Bearer keys silently rejected as 404 (URL path resolver runs first and 404s on unknown user).

### Pitfall 4: `key_prefix` collision/disambiguation
**What goes wrong:** UI shows `liv_sk_a` for two distinct keys (only 8-char prefix visible).
**Why it happens:** First 8 chars of any `liv_sk_<base62>` key are `liv_sk_X` — only 1 char of variance per prefix.
**How to avoid:** CONTEXT.md says `key_prefix VARCHAR(16)`. Store ALL 8 chars (full `liv_sk_X`); UI shows full prefix (no truncation). For better disambiguation, consider 12 chars (`liv_sk_Xaaaa`) — but that's a Phase 62 UX call, not a Phase 59 schema decision. Keep as 8-char for now (CONTEXT.md is locked).
**Warning signs:** User says "I can't tell my keys apart" — escalate to Phase 62.

### Pitfall 5: Forgetting `httpOnlyPaths` namespacing
**What goes wrong:** Test passes for bare `'create'` but tRPC client routes to WS, mutation drops on reconnect.
**Why it happens:** `httpOnlyPaths` requires `<router>.<route>` shape (see `common.test.ts:62-78`).
**How to avoid:** Add `'apiKeys.create'`, `'apiKeys.revoke'`, `'apiKeys.list'`, `'apiKeys.listAll'` (all 4) to the array in `common.ts`. Add 4 corresponding tests in `common.test.ts` mirroring the existing pattern. Add bare-name guards (e.g., assert `!httpOnlyPaths.includes('create')`).
**Warning signs:** `apiKeys.create` mutation silently hangs after `systemctl restart livos`.

### Pitfall 6: pgcrypto extension assumption
**What goes wrong:** Migration includes `CREATE EXTENSION IF NOT EXISTS pgcrypto` and fails on PG instances where the role lacks SUPERUSER.
**Why it happens:** CONTEXT.md says `gen_random_uuid()` requires pgcrypto; but in the existing `schema.sql`, `gen_random_uuid()` is used 14× without ANY `CREATE EXTENSION` line — meaning either (a) the Mini PC PG has pgcrypto already enabled, or (b) PG version is 13+ where `gen_random_uuid()` is built into core (NO extension needed). [VERIFIED via grep — no CREATE EXTENSION lines in schema.sql]
**How to avoid:** **Do NOT add `CREATE EXTENSION pgcrypto`** to the new `api_keys` block. Match the existing convention; if it works for 14 other tables, it works for the 15th. If pgcrypto is somehow needed, add it as a separate diagnostic Wave 0 task, not coupled to the api_keys migration. (CONTEXT.md says "Migration MUST CREATE EXTENSION" — this contradicts the codebase reality. Flag for plan-checker; recommend dropping that line.)
**Warning signs:** Mini PC update.sh fails with "permission denied to create extension".

## Code Examples

### `device_audit_log` REUSE Pattern (Phase 59 audit hook)

```typescript
// File: livos/packages/livinityd/source/modules/api-keys/events.ts
// Source pattern: livos/packages/livinityd/source/modules/fail2ban-admin/events.ts:73-113
import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import {getPool} from '../database/index.js'
import {computeParamsDigest} from '../devices/audit-pg.js'  // REUSE — DO NOT redefine

const SECURITY_EVENTS_DIR = '/opt/livos/data/security-events'
const SENTINEL_DEVICE_ID = 'api-keys-system'

export interface ApiKeyAuditEvent {
  action: 'create_key' | 'revoke_key'
  keyId: string
  userId: string
  username: string
  success: boolean
  error?: string
}

export async function recordApiKeyEvent(event: ApiKeyAuditEvent, logger = console): Promise<void> {
  const paramsDigest = computeParamsDigest({keyId: event.keyId})
  const pool = getPool()
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO device_audit_log
           (user_id, device_id, tool_name, params_digest, success, error)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.userId, SENTINEL_DEVICE_ID, event.action, paramsDigest, event.success, event.error ?? null],
      )
    } catch (err) {
      logger.error('[api-keys-events] PG INSERT failed:', err)
    }
  }
  // Belt-and-suspenders JSON write (mirror Phase 46 events.ts:103-111)
  try {
    const ts = Date.now()
    const id = randomUUID().slice(0, 8)
    const file = path.join(SECURITY_EVENTS_DIR, `${ts}-${id}-${event.action}.json`)
    await fs.mkdir(SECURITY_EVENTS_DIR, {recursive: true})
    await fs.writeFile(file, JSON.stringify({ts, ...event}, null, 2), 'utf8')
  } catch (err) {
    logger.warn('[api-keys-events] JSON write failed (non-fatal):', err)
  }
}
```

**Note:** `device_audit_log.user_id` is `UUID NOT NULL` (schema.sql:111). The `api_keys` `user_id` is also `UUID NOT NULL REFERENCES users(id)` — same type, no coercion needed. `device_id` is `TEXT NOT NULL` (schema.sql:112) — accepts `'api-keys-system'` literal. [VERIFIED]

### Schema Append (the entire migration)

```sql
-- =========================================================================
-- API Keys (Phase 59 FR-BROKER-B1-01..05) — Per-user `liv_sk_*` Bearer tokens
-- Cleartext returned ONCE on create. SHA-256 hash stored. Revocation is
-- soft (revoked_at NOT NULL). Mirrors docker_agents shape (Phase 22).
-- =========================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      CHAR(64) NOT NULL UNIQUE,        -- SHA-256 hex digest
  key_prefix    VARCHAR(16) NOT NULL,             -- first 8 chars of plaintext (e.g. 'liv_sk_X')
  name          VARCHAR(64) NOT NULL,             -- user-supplied label
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,                      -- nullable; updated debounced
  revoked_at    TIMESTAMPTZ                       -- nullable; presence = revoked
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active  ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

Append at the end of `livos/packages/livinityd/source/modules/database/schema.sql` (current line 338 is the last `CREATE INDEX` for `broker_usage`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bcrypt` for API keys | SHA-256 (key_hash) | n/a | API keys are high-entropy random; bcrypt's slowness gives no security benefit and adds 100ms per auth request. SHA-256 is industry standard for token storage (Stripe, OpenAI both use SHA-256-class hashes). [VERIFIED: Phase 56 RESEARCH covers this; cited.] |
| URL-path identity (`/u/:userId`) | Bearer header | Phase 59 (this) | Bearer is what every external API client expects (Anthropic, OpenAI, Stripe). URL-path stays for back-compat. |
| In-band audit table | `device_audit_log` REUSE | Phase 46 | Single audit table simplifies admin queries; sentinel `device_id` distinguishes event sources. [VERIFIED: fail2ban-admin/events.ts] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mini PC PG version is 13+ (where `gen_random_uuid()` is built into core, no pgcrypto extension needed) — inferred from schema.sql using `gen_random_uuid()` 14× without `CREATE EXTENSION` | Pitfall 6 | If PG is <13 AND pgcrypto is somehow already enabled, fine. If PG is <13 AND pgcrypto NOT enabled, every existing UUID-defaulted table would already be broken — strong evidence one of the first two is true. **Risk: very low.** Recommend planner adds Wave 0 SSH check: `ssh bruce@10.69.31.68 'sudo -u postgres psql -d livos -c "SELECT version();"'` to lock this down. [ASSUMED] |
| A2 | `crypto.timingSafeEqual` is available in the Node version livinityd runs on | Pattern 2 | All Node versions ≥6.6.0 have it; livinityd uses tsx + recent Node. Already used in `server/index.ts:1087`. **Risk: zero.** [VERIFIED via grep] |
| A3 | livinityd is single-process (no cluster/worker_threads) — in-memory cache is sufficient for revoke-invalidation | CONTEXT.md Specific Idea | Verified via grep: no `cluster.fork()`, no `worker_threads`, no PM2 instances >1. Mini PC project memory confirms livinityd runs as a single tsx process under `livos.service`. **Risk: zero.** [VERIFIED via grep + project memory] |
| A4 | `device_audit_log.user_id` (UUID NOT NULL) accepts api_keys' user_id directly without conversion | Code Examples — events.ts | Same UUID type; no coercion. Phase 46 already does this with `users.id`. **Risk: zero.** [VERIFIED via schema inspection] |

## Open Questions

1. **Should the migration include `CREATE EXTENSION IF NOT EXISTS pgcrypto`?**
   - What we know: CONTEXT.md says yes; schema.sql (14 existing UUID tables) says no — they all work without it.
   - What's unclear: Whether Mini PC PG has pgcrypto pre-enabled OR runs PG 13+ where the function is core.
   - Recommendation: **Drop the `CREATE EXTENSION` line.** Match the existing convention. Add a Wave 0 ssh diagnostic to confirm `SELECT gen_random_uuid()` works against the live `api_keys` migration on Mini PC.

2. **Should `apiKeys.list` return revoked keys, or only active?**
   - What we know: CONTEXT.md says response includes `revoked_at` (nullable) — so it returns both, with revoked keys distinguished by `revoked_at !== null`.
   - What's unclear: UX preference. Phase 62 may add a filter.
   - Recommendation: Return ALL keys ordered `created_at DESC`; let Phase 62 add a filter dropdown.

3. **Cache invalidation on revoke — synchronous or eventual?**
   - What we know: CONTEXT.md "Specific Ideas" allows EITHER 5-second worst-case (eventual via TTL) OR explicit invalidation (synchronous).
   - What's unclear: Acceptance criterion text.
   - Recommendation: **Implement explicit invalidation in `apiKeys.revoke`** — it's a few lines, keeps the "immediate" property literal, and the Wave 4 integration test validates it. Falls back to 5s TTL only if invalidation fails (defensive).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (Mini PC) | `api_keys` table; existing `getPool()` | ✓ | (per /opt/livos/.env DATABASE_URL — rotated) | — |
| Node `crypto` (built-in) | `randomBytes`, `createHash`, `timingSafeEqual` | ✓ | Node ≥18 | — |
| `pg` package | DB client | ✓ | (pinned in `livos/packages/livinityd/package.json`) | — |
| `vitest` | Test framework | ✓ | (pinned) | — |
| `@trpc/server` | tRPC routers | ✓ | (pinned) | — |
| `zod` | Input schemas | ✓ | (pinned) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (pinned in livinityd package.json) |
| Config file | `livos/packages/livinityd/package.json` (script: `vitest --testTimeout 180000 --hookTimeout 180000 --maxConcurrency 1 --poolOptions.threads.singleThread true --reporter verbose`) [VERIFIED] |
| Quick run command | `pnpm --filter @livos/livinityd test livos/packages/livinityd/source/modules/api-keys/` |
| Full suite command | `pnpm --filter @livos/livinityd test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-BROKER-B1-01 | `api_keys` schema exists, has all columns, indexes, FK CASCADE | unit (string assert on schema.sql) | `pnpm test livos/packages/livinityd/source/modules/api-keys/schema-migration.test.ts` | ❌ Wave 0 |
| FR-BROKER-B1-02 | Generated key matches `liv_sk_<32-char-base64url>`; SHA-256 hash stored; cleartext NOT in DB | unit | `pnpm test livos/packages/livinityd/source/modules/api-keys/database.test.ts` | ❌ Wave 0 |
| FR-BROKER-B1-03 | Bearer middleware: valid key → `req.userId`; invalid → 401 (no fall-through); absent → next() | unit + integration | `pnpm test livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts` | ❌ Wave 0 |
| FR-BROKER-B1-04 | tRPC create returns plaintext once; list excludes plaintext+hash; revoke is idempotent | unit | `pnpm test livos/packages/livinityd/source/modules/api-keys/routes.test.ts` | ❌ Wave 0 |
| FR-BROKER-B1-05 | Revoked key → 401 + Anthropic error body shape | integration | `pnpm test livos/packages/livinityd/source/modules/api-keys/integration.test.ts` | ❌ Wave 0 |
| (cross-cutting) | `httpOnlyPaths` includes 4 new entries with namespace prefix | unit (extends common.test.ts) | `pnpm test livos/packages/livinityd/source/modules/server/trpc/common.test.ts` | ✅ extend |
| (cross-cutting) | Mount order in `server/index.ts`: usage-capture → bearer → broker | unit (string assert on server/index.ts source) | `pnpm test livos/packages/livinityd/source/modules/api-keys/mount-order.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @livos/livinityd test livos/packages/livinityd/source/modules/api-keys/`
- **Per wave merge:** `pnpm --filter @livos/livinityd test livos/packages/livinityd/source/modules/api-keys/ livos/packages/livinityd/source/modules/server/trpc/common.test.ts`
- **Phase gate:** Full suite green: `pnpm --filter @livos/livinityd test`

### Wave 0 Gaps

- [ ] `livos/packages/livinityd/source/modules/api-keys/database.test.ts` — covers FR-BROKER-B1-02
- [ ] `livos/packages/livinityd/source/modules/api-keys/bearer-auth.test.ts` — covers FR-BROKER-B1-03
- [ ] `livos/packages/livinityd/source/modules/api-keys/cache.test.ts` — covers cache TTL + invalidation
- [ ] `livos/packages/livinityd/source/modules/api-keys/routes.test.ts` — covers FR-BROKER-B1-04
- [ ] `livos/packages/livinityd/source/modules/api-keys/schema-migration.test.ts` — covers FR-BROKER-B1-01 (mirror `usage-tracking/schema-migration.test.ts`)
- [ ] `livos/packages/livinityd/source/modules/api-keys/mount-order.test.ts` — string assert on `server/index.ts` ordering
- [ ] `livos/packages/livinityd/source/modules/api-keys/integration.test.ts` — full e2e create→use→revoke→401 flow (mocks `getPool` to in-memory; mirrors `usage-tracking/integration.test.ts`)
- [ ] EXTEND `livos/packages/livinityd/source/modules/server/trpc/common.test.ts` with 4 new entries + bare-name guards

Framework install: NOT NEEDED — vitest is already configured. Test runner: `pnpm --filter @livos/livinityd test`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer token over TLS (Phase 60); cleartext shown ONCE; SHA-256 hash storage with constant-time compare (`crypto.timingSafeEqual`) |
| V3 Session Management | partial | Stateless Bearer (no session); revocation via `revoked_at` column with cache invalidation |
| V4 Access Control | yes | tRPC `privateProcedure` enforces user owns the key; `adminProcedure` for `listAll`; user-scoped UPDATE in revoke |
| V5 Input Validation | yes | zod schemas on all tRPC inputs; `name.min(1).max(64)`; `id.uuid()` |
| V6 Cryptography | yes | Node `crypto` ONLY — no third-party crypto deps; `randomBytes(24)` for OS-CSPRNG; SHA-256 (industry standard for high-entropy token hashing per Stripe/OpenAI precedent) |

### Known Threat Patterns for Bearer-Token Auth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Timing attack on key comparison | I (Information disclosure) | `crypto.timingSafeEqual` for hash comparison; SHA-256 input hashing happens in constant-time-ish via Node's hash impl |
| Brute-force key guessing | S (Spoofing) | 39-char keys with ~190 bits entropy → infeasible. Negative cache TTL 5s prevents PG saturation under sustained probing. |
| Key leakage through logs | I | Never log full plaintext; only `key_prefix` (first 8 chars) acceptable; `req.headers.authorization` MUST be redacted in any debug dump |
| Stolen key replay | S | Manual revoke (Phase 59); rotation deferred. Mitigation: short-lived in environments where rotation matters → defer to v30+ |
| Hash collision | T (Tampering) | SHA-256 collisions infeasible (>2^128 work); UNIQUE constraint on `key_hash` provides DB-level enforcement |
| Revocation lag (cache staleness) | T | Explicit cache invalidation on revoke (Open Question 3 recommendation); 60s positive TTL bounded worst case |
| FK CASCADE on user delete | T | `ON DELETE CASCADE` on `user_id` ensures orphan keys are removed when a user is deleted (consistent with `sessions`, `docker_agents`) |
| Key in Authorization header logged by reverse proxy | I (Phase 60 concern) | Caddy/Server5 must not log Authorization header (Phase 60 deliverable; flag for Phase 60 handoff) |

## Sources

### Primary (HIGH confidence)
- `livos/packages/livinityd/source/modules/database/schema.sql` (full read) — schema conventions, idempotent migration pattern, `device_audit_log` shape
- `livos/packages/livinityd/source/modules/database/index.ts:51-76` — `initDatabase` runs `schema.sql` on every boot
- `livos/packages/livinityd/source/modules/docker/agents.ts` (full read) — twin pattern: token_hash + revoked_at + cleartext-once
- `livos/packages/livinityd/source/modules/usage-tracking/routes.ts` (full read) — twin pattern: privateProcedure/adminProcedure split
- `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts` (full read) — middleware mount on `/u/:userId/v1`
- `livos/packages/livinityd/source/modules/usage-tracking/schema-migration.test.ts` (full read) — schema-test pattern to mirror
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts:1-60` — broker middleware order; Anthropic-spec error body shape (`auth.ts:62-67`)
- `livos/packages/livinityd/source/modules/server/index.ts:1220-1235` — exact mount-point line numbers
- `livos/packages/livinityd/source/modules/server/trpc/trpc.ts` (full read) — `privateProcedure` / `adminProcedure` definitions
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (full read) — `httpOnlyPaths` array shape
- `livos/packages/livinityd/source/modules/server/trpc/common.test.ts` (full read) — pattern for asserting new entries
- `livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts` (full read) — `ctx.currentUser` resolution; `requireRole`
- `livos/packages/livinityd/source/modules/fail2ban-admin/events.ts` (full read) — `device_audit_log` REUSE pattern
- `livos/packages/livinityd/source/modules/devices/audit-pg.ts:1-50` — `computeParamsDigest` REUSE
- `livos/packages/livinityd/source/modules/server/index.ts:1080-1090` — `crypto.timingSafeEqual` precedent (HMAC sig)
- `.planning/phases/59-bearer-token-auth/59-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` (lines 33-37) — FR-BROKER-B1-01..05 verbatim
- Project memory: livinityd runs as single tsx process under `livos.service` (single-process invariant)

### Secondary (MEDIUM confidence)
- `node:crypto` API surface (Node ≥18 docs) — `randomBytes`, `createHash`, `timingSafeEqual`, `randomUUID` are all stable [CITED: nodejs.org/api/crypto]
- PG 13+ has built-in `gen_random_uuid()` (no pgcrypto needed) [CITED: postgresql.org/docs/13/functions-uuid.html]

### Tertiary (LOW confidence)
- (none — every claim is grounded in verified codebase content)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dep already in repo, verified by grep
- Architecture: HIGH — exact twin patterns (`docker_agents`, `broker_usage`, `device_audit_log`) inspected
- Pitfalls: HIGH — derived from real existing code (mount-order test, namespacing test) + project memory (rate-limit / multi-process / pgcrypto)
- Security: MEDIUM — Phase 60 perimeter (TLS, rate-limit) is upstream concern; Phase 59 controls are limited to in-process auth

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days — codebase is stable, locked decisions in CONTEXT.md fix the design)
