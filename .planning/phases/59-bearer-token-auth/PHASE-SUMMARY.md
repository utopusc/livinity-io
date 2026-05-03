---
phase: 59-bearer-token-auth
phase_number: 59
phase_name: B1 Per-User Bearer Token Auth (`liv_sk_*`)
status: COMPLETE
shipped: 2026-05-02
plans_completed: 5
plans_total: 5
requirements_completed: [FR-BROKER-B1-01, FR-BROKER-B1-02, FR-BROKER-B1-03, FR-BROKER-B1-04, FR-BROKER-B1-05]
sacred_sha_final: 4f868d318abff71f8c8bfbcf443b2393a553018b
sacred_sha_drift: 0
new_npm_deps: 0
total_commits: 13
total_loc_added: ~3830
api_keys_tests_total: 39
api_keys_tests_passing: 39
---

# Phase 59 — B1 Per-User Bearer Token Auth (`liv_sk_*`) — PHASE SUMMARY

**Per-user `liv_sk_*` Bearer token authentication for the Livinity Broker. New `api_keys` PostgreSQL table, hot-path Bearer middleware (60s positive / 5s negative cache + sync invalidate), 4 tRPC procedures (create / list / revoke / listAll), audit-log REUSE per Phase 46 sentinel pattern. Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` for the entire phase. ZERO new npm packages added.**

## Wave / Plan Map

| Wave | Plan | Title | Commits | Status |
|------|------|-------|---------|--------|
| 0 | 59-01 | Wave 0 RED test scaffolds | 3 | ✅ |
| 1 | 59-02 | api_keys schema migration + PG CRUD | 3 | ✅ |
| 2 | 59-03 | ApiKeyCache + Bearer middleware + mount + dispose hook | 3 | ✅ |
| 3 | 59-04 | tRPC apiKeys router + audit hook + httpOnlyPaths | 3 | ✅ |
| 4 | 59-05 | E2E integration tests + phase gate | 1 | ✅ |
| **TOTAL** | **5 plans** | | **13** | **5/5 SHIPPED** |

## Tests Added Across Phase

| Suite | Wave | Tests | Final Status |
|-------|------|-------|--------------|
| `schema-migration.test.ts` | 0/1 | 4 | 4/4 GREEN |
| `database.test.ts` | 0/1 | 5 | 5/5 GREEN |
| `cache.test.ts` | 0/2 | 5 | 5/5 GREEN |
| `bearer-auth.test.ts` | 0/2 | 8 | 8/8 GREEN |
| `mount-order.test.ts` | 0/2 | 1 | 1/1 GREEN |
| `routes.test.ts` | 0/3 | 7 | 7/7 GREEN |
| `integration.test.ts` (NEW Wave 4) | 4 | 9 | 9/9 GREEN |
| **TOTAL api-keys/** | | **39** | **39/39 GREEN** |
| `server/trpc/common.test.ts` (modified) | 3 | 12 | 12/12 GREEN (Tests 11+12 added by 59-04 for the apiKeys httpOnlyPaths entries) |

The api-keys/ test suite was bootstrapped from zero in Wave 0 (Plan 59-01) — every one of the 39 tests is new in Phase 59. Plan 59-04 also extended `common.test.ts` from 10 → 12 tests for the 4 new httpOnlyPaths entries.

## Requirements Coverage (5/5)

All Phase 59 requirements covered AND verified end-to-end via Wave 4 integration tests.

| Requirement | Description | Verified by | Status |
|-------------|-------------|-------------|--------|
| FR-BROKER-B1-01 | `api_keys` table schema (8 cols, FK CASCADE, UNIQUE key_hash, partial idx) | `schema-migration.test.ts` (4) + `database.test.ts` (5) + integration A1 | ✅ |
| FR-BROKER-B1-02 | `liv_sk_<base64url-32>` token format; SHA-256-of-FULL-plaintext hash; plaintext returned ONCE | `database.test.ts` T1+T4 + integration A1 | ✅ |
| FR-BROKER-B1-03 | Bearer middleware on `/u/:userId/v1`; 60s/5s cache TTL; mount BETWEEN usage capture and broker | `bearer-auth.test.ts` (8) + `cache.test.ts` (5) + `mount-order.test.ts` (1) + integration B1+B2 | ✅ |
| FR-BROKER-B1-04 | tRPC create/list/revoke/listAll; audit-log REUSE via `device_audit_log` sentinel `device_id='api-keys-system'`; httpOnlyPaths | `routes.test.ts` (7) + `common.test.ts` (T11+T12) + integration E1+E2 | ✅ |
| FR-BROKER-B1-05 | Revoked → next bearer request returns Anthropic-spec 401 within 100ms (cache invalidate is sync) | integration C1+C2 | ✅ |

## Sacred SHA History (D-30-07 — UNCHANGED)

The sacred file `nexus/packages/core/src/sdk-agent-runner.ts` was verified at the START and END of every plan (and every task within plans). Result:

```
4f868d318abff71f8c8bfbcf443b2393a553018b   (start of 59-01)
4f868d318abff71f8c8bfbcf443b2393a553018b   (end of 59-01)
4f868d318abff71f8c8bfbcf443b2393a553018b   (end of 59-02)
4f868d318abff71f8c8bfbcf443b2393a553018b   (end of 59-03)
4f868d318abff71f8c8bfbcf443b2393a553018b   (end of 59-04)
4f868d318abff71f8c8bfbcf443b2393a553018b   (end of 59-05 — phase end)
```

**Drift count: 0.** D-30-07 contract preserved verbatim across the entire phase.

The `nexus/packages/core/src/__tests__/sdk-agent-runner-integrity.test.ts` BASELINE_SHA constant required no change.

## D-NO-NEW-DEPS Audit (PRESERVED)

ZERO `package.json` or `pnpm-lock.yaml` mutations across all 5 plans.

Production code uses only:
- `node:crypto` (built-in — `randomBytes`, `createHash`, `timingSafeEqual`, `randomUUID`)
- `node:fs` (built-in — `promises`)
- `node:path` (built-in)
- `node:buffer` (built-in)
- `pg` (already a dep — used via `getPool()`)
- `@trpc/server` (already a dep — `TRPCError`, procedure builders)
- `zod` (already a dep — input validation)
- `express` types (already a dep — type-only)
- `vitest` (already a dep — test only)

D-NO-NEW-DEPS lock from milestone v30.0 preserved. Phase 60+ inherit the same constraint.

## Locked Decisions Honored

- **D-30-05 (Manual revoke + recreate, opt-in keys)** — Implemented as `apiKeys.create` (opt-in) + `apiKeys.revoke` (manual). No automatic rotation, no expiry column. Idempotent revoke via `WHERE revoked_at IS NULL` SQL guard.
- **D-30-07 (Sacred file untouched)** — VERIFIED at every commit boundary.
- **D-NO-NEW-DEPS** — VERIFIED. Phase 59 ships with zero new npm packages.
- **D-NO-BYOK** — Honored. The broker issues its own `liv_sk_*` tokens; user's raw `claude_*` keys never enter Phase 59 surface.

## Architectural Highlights

### Sentinel-based audit log REUSE (no new audit table)

Phase 59 audit events INSERT into the existing `device_audit_log` table (Phase 15) with sentinel `device_id='api-keys-system'`. Mirrors the Phase 46 fail2ban pattern (`device_id='fail2ban-host'`). Future audit-listing routes can filter by this literal to surface only api-keys lifecycle events. Zero schema additions; `computeParamsDigest` REUSED via import (NOT redefined — verified by grep).

### Synchronous cache invalidation closes the 60s revocation lag

`apiKeys.revoke` calls `getSharedApiKeyCache().invalidate(keyHash)` synchronously AFTER the SQL UPDATE returns the just-revoked row's `key_hash` via `RETURNING`. The cache is a process-wide singleton bridged via `setSharedApiKeyCache` (mirrors `getPool()` shape) — the revoke handler invalidates THE SAME cache the bearer middleware reads from. Without this, the 60s positive TTL would mean a leaked-and-revoked key keeps working for up to 60s. Wave 4 integration test C1 measures the round-trip and asserts <100ms.

### Defense-in-depth on the bearer hot path

- `crypto.timingSafeEqual` constant-time hash compare (RESEARCH.md Pattern 2) even though the SQL `WHERE key_hash = $1` already establishes identity — pins the code path to the constant-time primitive against future refactors.
- `key_hash` column EXCLUDED from `SELECT_COLS` at the SQL projection level AND mapped to a public-shape DTO at the route handler level — two-layer defense against accidental hash exposure (T-59-18).
- `listAll` is `adminProcedure`-bound at the router definition site (procedures inlined into the `router({...})` literal) so a future refactor that demotes it is caught by the source-string regex `/listAll:\s*adminProcedure/` at unit-test time.

### `last_used_at` debouncing

In-memory `Map<keyHash, Date>` queue + 30s background flusher + 60s coalescing window means 5 bearer requests within 30s for the same key result in ≤ 1 PG `UPDATE last_used_at`. cli.ts cleanShutdown calls `dispose()` so pending writes survive SIGTERM/SIGINT.

## Final Sacred SHA Gate

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

**MATCH** (locked at D-30-07). Phase-end gate PASSED.

## Hand-off Notes

### → Phase 60 (B2 Public Endpoint — `api.livinity.io`)

Phase 60 depends on Phase 59 shipping the bearer middleware. Phase 60 builds the Server5 Caddy reverse-proxy with `xcaddy` + `caddy-ratelimit` plugin (D-30-09 budget) terminating `api.livinity.io` and forwarding to the Mini PC livinityd `/u/:userId/v1` surface. The bearer middleware mounted in 59-03 will receive the forwarded `Authorization: Bearer liv_sk_*` headers verbatim.

**Phase 60 prerequisites now satisfied by Phase 59:**
- `api_keys` table EXISTS in the live schema (auto-applied at livinityd boot via the schema-migration code path).
- `apiKeys.create` tRPC procedure WORKS — users can mint their first key in-app.
- Bearer middleware at `/u/:userId/v1` validates incoming tokens and resolves `req.userId` BEFORE the broker handler.
- Anthropic-spec 401 envelope `{type:"error", error:{type:"authentication_error", message:"API key invalid"}}` for unknown/revoked keys.

**Phase 60 needs to add:**
- Server5 Caddy config block for `api.livinity.io` with TLS-on-demand + reverse_proxy with `flush_interval -1` (SSE buffering disabled, D-30-09 step 5).
- `caddy-ratelimit` policy at the Caddy edge (D-30-04 verdict).
- Build pipeline: `xcaddy build --with github.com/mholt/caddy-ratelimit@<pinned-sha>` + `apt-mark hold caddy` (D-30-09 budget).
- `Caddyfile validate` step in deploy procedure.

### → Phase 62 (E2 Settings UI — API Keys + Usage tabs)

Phase 62 depends on Phase 59 shipping `apiKeys.list` for the API Keys tab. Phase 62 will:

- Wire the existing `apiKeys.create / list / revoke / listAll` tRPC routes into a Settings UI tab (live tRPC subscriptions optional; HTTP-only paths already gated for the mutations).
- Render the "create key" modal that displays `plaintext` ONCE with a copy-to-clipboard affordance + the `oneTimePlaintextWarning: true` advisory flag from `apiKeys.create`'s response.
- Surface `last_used_at` per key (Phase 59's debouncer keeps this minute-grain accurate per CONTEXT.md).
- Surface `audit.listDeviceEvents WHERE device_id='api-keys-system'` to render the key lifecycle audit trail.

**Phase 62 prerequisites now satisfied by Phase 59:**
- All 4 tRPC routes (`apiKeys.create / list / revoke / listAll`) live and tested.
- `httpOnlyPaths` includes all 4 entries — UI mutations route through HTTP and survive `systemctl restart livos`.
- `device_audit_log` rows tagged with sentinel `device_id='api-keys-system'` are queryable.
- `apiKeys.create` returns the flat shape `{id, plaintext, prefix, name, created_at, oneTimePlaintextWarning: true}` ready for direct UI rendering.

### → Phase 63 (Mandatory Live Verification)

Phase 63 must include UAT walks for Phase 59 against the Mini PC live deployment:
- Mint a `liv_sk_*` key via `apiKeys.create` tRPC mutation.
- Authenticate a curl `Authorization: Bearer liv_sk_*` request to `/u/:userId/v1/messages` and observe successful response.
- Revoke the key and immediately retry — observe Anthropic-spec 401 envelope.
- Confirm `last_used_at` advances within ~1 minute of usage.
- Confirm `device_audit_log` shows the create + revoke rows with `device_id='api-keys-system'`.

These can be exercised via at least one of the 3 external clients (Bolt.diy / Open WebUI / Continue.dev) once Phase 60 ships the public endpoint.

## Forensic Trail

- 2026-05-02 — Plan 59-01 SHIPPED. Wave 0 RED test scaffolds: 6 failing test files (schema-migration, database, cache, bearer-auth, mount-order, routes) totaling 30 RED tests. Sacred SHA verified.
- 2026-05-02 — Plan 59-02 SHIPPED. Wave 1 PG layer: schema.sql append + database.ts (179 LOC, 6 functions) + index.ts barrel. 9/9 Wave 1 tests GREEN. Sacred SHA verified.
- 2026-05-02 — Plan 59-03 SHIPPED. Wave 2 cache + middleware: cache.ts (231 LOC, 60s/5s TTL + 30s flusher + dispose) + bearer-auth.ts (235 LOC) + mount in server/index.ts:1239 + cli.ts dispose hook + Livinityd.apiKeyCache singleton. Wave 0 RED tests for cache + bearer + mount-order all GREEN. Sacred SHA verified.
- 2026-05-02 — Plan 59-04 SHIPPED. Wave 3 routes + audit: events.ts (100 LOC, REUSE pattern) + routes.ts (230 LOC, 4 procedures) + revokeApiKey extension (RETURNING key_hash) + cache singleton bridge + 4 httpOnlyPaths entries + apiKeys namespace mount + common.test.ts Tests 11+12. Wave 0 RED tests for routes all GREEN. Sacred SHA verified.
- 2026-05-02 — Plan 59-05 SHIPPED. Wave 4 integration + phase gate: integration.test.ts (589 LOC, 9 sub-tests across 5 sections) verifying all 4 ROADMAP §Phase 59 success criteria + debouncing + audit REUSE. Total api-keys/: 39/39 GREEN. Sacred SHA verified at phase end. **Phase 59 COMPLETE.**

---

*Phase 59 sealed: 2026-05-02. 5/5 plans shipped. 5/5 requirements satisfied. Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical from start to phase end. Zero new npm packages.*
