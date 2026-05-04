# Phase 59: B1 Per-User Bearer Token Auth (`liv_sk_*`) - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous); parallel branch — no dependency on Phases 56-58

<domain>
## Phase Boundary

Phase 59 introduces standard Bearer token auth for the broker. External API consumers authenticate with `Authorization: Bearer liv_sk_*` instead of URL-path identity + container IP guard.

What's IN scope for Phase 59:
- New PostgreSQL `api_keys` table — schema migration with reversible up/down.
- Key generation: `liv_sk_<base62-32>` format. Plaintext shown ONCE at creation; stored as SHA-256 hash + 8-char prefix preview.
- Bearer token middleware on broker routes — validates `Authorization: Bearer liv_sk_*` BEFORE existing per-user URL-path identity logic. When Bearer is present and valid, it's the source of identity; URL-path `:userId` becomes optional (Bearer-resolved `user_id` wins).
- tRPC routes: `apiKeys.create` (returns plaintext once + key id), `apiKeys.list` (no plaintext, no hash — only id/prefix/name/created_at/last_used_at/revoked_at), `apiKeys.revoke` (sets `revoked_at`).
- Revoked / unknown keys return HTTP 401 with Anthropic-spec error body: `{"error": {"type": "authentication_error", "message": "API key revoked|invalid"}}`.
- `last_used_at` updated on every successful auth (debounced to ≤1 write/min per key to avoid hot-path PG load).

What's OUT of scope (deferred):
- UI tabs for API Keys + Usage (Phase 62 — both Settings UI work).
- Per-API-key usage attribution column on `broker_usage` (Phase 62).
- Public endpoint exposure (Phase 60 — Phase 59 keeps existing internal-only access; Bearer auth wired but reachable only via per-user URL-path Mini PC routes).
- Rotation policies / automatic expiration (defer to v30+ unless Phase 56 spike resolution surfaces a hard requirement).

</domain>

<decisions>
## Implementation Decisions

### Phase 56 Q5 Verdict — Manual Revoke + Recreate (Default-Keyed Off)

Phase 56's spike was deferred. Reasonable defaults for Phase 59:

- **No automatic rotation in v30** — manual revoke + recreate. Rationale: rotation policy is a security UX decision better made after observing real usage patterns; v30 ships the primitives (revoke is fast).
- **Default-keyed = OFF** — users opt-in to creating their first key. Marketplace apps that need broker access trigger key creation as part of install flow (Phase 62 Settings UI surfaces this; Phase 59 keeps it API-only via tRPC).
- **No expiry on keys** — keys are valid until explicitly revoked. v30+ can add `expires_at` column nullable in a future migration.

### Key Format

- **Plaintext format:** `liv_sk_<base62-32>` — total length 39 chars (`liv_sk_` prefix is 7 chars + 32-char base62 body).
- **Base62 charset:** `[A-Za-z0-9]` (no ambiguous chars exclusion — 62² >> sufficient entropy at 32 chars; usability trumps charset trimming for a copy-once flow).
- **Generation:** `crypto.randomBytes(24).toString('base64url').slice(0, 32)` — 32 base64url chars (note: base64url charset is `[A-Za-z0-9_-]`, slightly broader than base62; acceptable per pragmatic choice). If strict base62 is required, use rejection sampling with `crypto.randomBytes` and a 62-char alphabet.
- **Storage:** SHA-256 hash of the full plaintext key (NOT just the body) → 64 hex chars in `key_hash` column. Plus first 8 chars of plaintext (e.g., `liv_sk_7g`) in `key_prefix` for display.
- **Verification:** Bearer middleware extracts `liv_sk_*` from `Authorization` header, computes SHA-256, looks up by hash with `revoked_at IS NULL`. Constant-time hash comparison via Node.js `crypto.timingSafeEqual` against the candidate row.

### `api_keys` Table Schema

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash CHAR(64) NOT NULL UNIQUE,        -- SHA-256 hex digest
  key_prefix VARCHAR(16) NOT NULL,          -- first 8 chars of plaintext (e.g. 'liv_sk_7')
  name VARCHAR(64) NOT NULL,                -- user-supplied label
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,                 -- nullable; updated debounced
  revoked_at TIMESTAMPTZ                    -- nullable; presence = revoked
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

The `idx_api_keys_active` partial index means hot-path lookups (`SELECT user_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`) hit a small index covering only active keys.

`gen_random_uuid()` requires `pgcrypto` extension. Migration MUST `CREATE EXTENSION IF NOT EXISTS pgcrypto`.

### Bearer Middleware — Mount Order

Middleware order on broker routes (`/u/:userId/v1/messages`, `/u/:userId/v1/chat/completions`, future `/v1/messages`, `/v1/chat/completions`):

1. **CORS** (existing)
2. **`broker_usage` capture** (existing — Phase 44; mounts BEFORE broker so it captures all responses including 401s)
3. **Bearer auth middleware** (NEW — Phase 59)
4. **Mode dispatch** (Phase 57's `mode-dispatch.ts`)
5. **Existing per-user URL-path resolver** (legacy — kept for back-compat; Bearer-resolved `user_id` wins if both present)
6. **Broker handler** (passthrough or agent mode)

Bearer middleware behavior:
- If `Authorization: Bearer liv_sk_*` present AND valid → set `req.userId = <resolved>`; mark `req.authMethod = 'bearer'`; pass.
- If `Authorization: Bearer liv_sk_*` present BUT invalid (unknown / revoked) → respond 401 immediately with Anthropic-spec error body. Do NOT fall through to URL-path identity.
- If `Authorization` header absent OR not `Bearer liv_sk_*` → pass without setting `req.userId`; URL-path resolver handles legacy access.

This order means: Bearer is the new primary identity surface; URL-path identity remains for back-compat with existing internal/marketplace traffic that doesn't yet pass Bearer. After v30+ migration, URL-path can be deprecated.

### Anthropic-Spec Error Body Shape

```json
{
  "error": {
    "type": "authentication_error",
    "message": "API key revoked"
  }
}
```

Or `"message": "API key invalid"` for unknown keys. Status 401. `Content-Type: application/json`. No SSE for auth failures (auth fails before stream starts).

### `last_used_at` Update Debouncing

Updating `last_used_at` on every request would PG-saturate hot paths. Debounce strategy:

- In-memory cache of `Map<key_hash, last_seen_timestamp>` per livinityd process.
- On each successful auth: check cache; if last seen <1 min ago, skip PG write. Otherwise queue an UPDATE.
- Background flusher writes queued updates every 30s in a single batch UPDATE.
- On graceful shutdown, flush pending queue.

Trade-off: ~1-min staleness on `last_used_at`. Acceptable for audit visibility per FR-BROKER-B1 success criterion 4 ("user can audit last_used_at" — minute-grain is sufficient).

### tRPC Routes (in `livos/packages/livinityd/source/modules/trpc/routers/api-keys.ts`)

```typescript
export const apiKeysRouter = router({
  create: privateProcedure
    .input(z.object({ name: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      // generate plaintext, compute hash, insert row
      // return { id, plaintext, prefix, name, created_at }
      //   plaintext is the ONE-AND-ONLY-TIME the full key is exposed
    }),

  list: privateProcedure
    .query(async ({ ctx }) => {
      // SELECT id, key_prefix, name, created_at, last_used_at, revoked_at
      //   WHERE user_id = ctx.userId  (NOT key_hash, NOT plaintext)
    }),

  revoke: privateProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // UPDATE api_keys SET revoked_at = NOW()
      //   WHERE id = $1 AND user_id = ctx.userId AND revoked_at IS NULL
      // returns { id, revoked_at } if successful, errors with NOT_FOUND otherwise
    }),
});
```

Plus `apiKeys.listAll` (admin-only, mirrors `usage.getAll` pattern from v29.3 Phase 44) — admin can see all users' active+revoked keys for incident response. Out of scope to deeply spec — v30 has it as a thin admin route; deeper UX in Phase 62.

### `httpOnlyPaths` Update

Per v29.3 Phase 41 pattern (Phase 41-04, the `httpOnlyPaths` array in `livos/packages/livinityd/source/modules/trpc/common.ts`), the new tRPC routes that perform mutations or return sensitive content should be added:
- `apiKeys.create` (mutation; returns plaintext) — MUST be HTTP-only
- `apiKeys.revoke` (mutation) — MUST be HTTP-only
- `apiKeys.list` and `apiKeys.listAll` (query) — defensive HTTP-only (Phase 41 pattern was query+sub mutations; pragmatic to add list too)

### Sacred File — UNTOUCHED

Phase 59 only touches `livos/packages/livinityd/source/modules/{database,trpc,middleware,…}/`. No edits to `nexus/packages/core/src/sdk-agent-runner.ts`. Acceptance criterion in every task: SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.

### Claude's Discretion

- File structure for the middleware (`bearer-auth.ts` standalone OR fold into existing auth middleware).
- Test fixture format (in-memory PG via testcontainers, OR mock PG client).
- Logging detail for auth failures (default: redacted prefix only; never log full plaintext; debug flag opt-in).
- Whether `apiKeys.create` returns `{plaintext, prefix, ...}` or `{plaintext, key: {prefix, ...}}` — pure shape choice.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/livinityd/source/modules/database/schema.sql` — main schema. Migration adds `api_keys` table here.
- `livos/packages/livinityd/source/modules/database/migrations/` — migration files dir (researcher confirms exact path).
- `livos/packages/livinityd/source/modules/trpc/common.ts` — `httpOnlyPaths` array + middleware definitions.
- `livos/packages/livinityd/source/modules/trpc/routers/` — existing routers (e.g., `usage.ts` from v29.3 Phase 44 — mirror its admin/private split pattern).
- `livos/packages/livinityd/source/server/index.ts` — Express middleware mount point.
- v29.3 Phase 44 `broker_usage` table — same migration pattern + admin-vs-private route split. Strong precedent.
- v29.4 Phase 46 `device_audit_log` REUSE pattern — Phase 59 may emit audit events on key create/revoke for the same audit log.
- v26.0 multi-user `users` table — `api_keys.user_id` FK targets this.
- `crypto` Node built-in — `randomBytes`, `createHash`, `timingSafeEqual`. No new deps.

### Established Patterns
- v29.3 Phase 41 — `httpOnlyPaths` array in tRPC common.ts. Add Phase 59 routes here.
- v29.3 Phase 44 — `usage.getMine` (private) + `usage.getAll` (admin). Mirror for `apiKeys.list` + `apiKeys.listAll`.
- v29.4 Phase 46 — `ignoreip` whitelist + audit log REUSE via `device_id='fail2ban-host'` sentinel. Phase 59 may add audit events under `device_id='api-keys-system'` sentinel for create/revoke.
- v22.0+ Express middleware mount order — auth middleware insertion at the right level.

### Integration Points
- `livos/packages/livinityd/source/server/index.ts` — broker routes mount; Bearer middleware inserts BEFORE broker handler, AFTER `broker_usage` capture.
- `livinity-broker/router.ts` + `openai-router.ts` — handlers don't change; middleware is upstream and sets `req.userId`.
- `livos/packages/livinityd/source/modules/trpc/_app.ts` — main tRPC app; `apiKeysRouter` mounted under `apiKeys`.
- `livos/packages/livinityd/source/modules/trpc/common.ts` `httpOnlyPaths` — add new mutation paths.
- `livos/packages/livinityd/source/modules/database/schema.sql` — DDL added; migration runs at livinityd boot if missing.
- LivOS in-app uses tRPC for `apiKeys.{create,list,revoke}`. Phase 62 wires Settings UI to these routes.

</code_context>

<specifics>
## Specific Ideas

- **Plaintext-once UX:** Create response includes plaintext + a clear "this is your only chance to copy this" admonition (Phase 62 surfaces this). Phase 59's tRPC route response shape: `{id, plaintext, prefix, name, created_at, oneTimePlaintextWarning: true}` — last field is purely advisory but lets future UI render the warning consistently.
- **Bearer middleware fast-path:** Most requests will be Bearer-authed in v30+. Optimize for that — single index lookup + cache (in-memory `Map<hash, {user_id, revoked}>`) with 5-second TTL on negative results to mitigate brute-force probing.
- **Negative cache TTL = 5s:** prevents key-guessing attacks from generating PG load. Positive results cached for 60s (matches debounced `last_used_at` flush).
- **Revoke is immediate:** Revoked keys must fail auth on next request. The negative cache TTL of 5s means revocation propagates within 5s in worst case. Acceptable per FR-BROKER-B1 success criterion 3 ("immediately retries... 401").
  - If stricter is needed (zero-second propagation), invalidate the in-memory cache on revoke. Researcher confirms whether livinityd is single-process (cache invalidation trivial) or multi-process (needs Redis pub/sub for cross-process invalidation — adds complexity).
- **Audit log:** key create/revoke events should record to `device_audit_log` (REUSE per v29.4 Phase 46 pattern) with `device_id='api-keys-system'`. Lets admins see "user X created/revoked key Y at time Z" without a new audit table.

</specifics>

<deferred>
## Deferred Ideas

- **Settings UI for API Keys** — Phase 62.
- **`broker_usage.api_key_id` column** — Phase 62.
- **Public endpoint exposure (`api.livinity.io`)** — Phase 60.
- **Automatic rotation / expiration** — v30+ (manual revoke is sufficient for v30).
- **Per-key rate limits** — Phase 61 may revisit; Phase 59 enforces only auth (no rate logic).
- **OAuth / OIDC alternative auth** — out of scope (D-NO-BYOK; broker-issued tokens only).
- **Key scopes / permissions matrix** — out of scope (v30 keys are full-access per user).

</deferred>
