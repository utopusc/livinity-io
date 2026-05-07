# Phase 92 — WebApp Metadata Extractor — Summary

## Status
SHIPPED — 11/11 tasks complete, all acceptance criteria met locally. UAT
deferred to Mini PC deploy (`bash /opt/livos/update.sh`) per the standard
v33 phase exit cadence.

## Sacred SHA verification
- **At phase open (start of 92-01):** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- **Before each commit (92-01..92-11):** verified `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. No commit accidentally touched `liv/`.
- **At phase close:** `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` AND `git hash-object liv/packages/core/src/sdk-agent-runner.ts` BOTH return `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Sacred constraint preserved.

## What shipped

### Schema (92-02)
- `webapps` table: 7 columns (`id UUID PK`, `user_id UUID FK→users(id) ON DELETE CASCADE`, `url TEXT NOT NULL`, `title TEXT`, `favicon_url TEXT`, `position INTEGER NOT NULL DEFAULT 0`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).
- Index `webapps_user_position_idx` on `(user_id, position)`.
- Dual-write convention honored: discrete artifact `migrations/2026-05-07-p92-webapps.sql` AND idempotent `IF NOT EXISTS` block in `schema.sql`.

### Module (92-01, 92-03..92-08)
- `livos/packages/livinityd/source/modules/webapps/`:
  - `index.ts` — barrel re-export (`extractMetadata`, `MetadataResult`, `webappRouter`).
  - `url-validator.ts` + `.test.ts` (36 tests) — scheme allow-list, RFC1918 + 127/8 + 169.254/16 + IPv6 ::1 + fc00::/7 + `localhost` private-host gate, admin bypass, normalization (lowercase host, default-port strip, trailing-slash drop, fragment strip, query preserved).
  - `html-parser.ts` + `.test.ts` (8 tests) — node-html-parser-backed `parseMetadata` extracts title, description (with og:description fallback), og:image, every `<link rel="icon|shortcut icon|apple-touch-icon">` candidate.
  - `__fixtures__/{github.html, minimal.html, no-meta.html}` — three fixture-driven HTML test inputs.
  - `favicon-resolver.ts` + `.test.ts` (15 tests) — precedence chain (icon > apple-touch > shortcut > /favicon.ico fallback), sizes tie-breaker (numeric + `any` + space-separated list), relative-href resolution against post-redirect base.
  - `fetch-html.ts` + `.test.ts` (10 tests) — Node global fetch with 8s AbortController timeout, max-5 manual redirect follow (so we surface finalUrl), 2 MB streamed body cap, text/html + application/xhtml+xml allowlist; structured `FetchError` with code `TIMEOUT | TOO_MANY_REDIRECTS | RESPONSE_TOO_LARGE | NOT_HTML | BAD_STATUS | NETWORK_ERROR`.
  - `metadata-cache.ts` + `.test.ts` (8 tests) — `liv:webapp:meta:<sha256(normalizedUrl)>` Redis key, 24h TTL, JSON-encoded `MetadataResult` payload, lazy ioredis singleton with DI surface for tests.
  - `metadata-extractor.ts` + `.test.ts` (13 tests) — orchestrator: validate → cache.get → fetch → parse → resolve → cache.set → log-if-slow. `ExtractionError` with code mapped to TRPCError.
  - `metadata-extractor.integration.test.ts` (2 tests) — full pipeline against in-process http server, cache hit assertion (request count stays at 1).
  - `webapps-repository.ts` — placeholder (CRUD lands in P94 with the desktop UI dialog).
  - `trpc-router.ts` — single `extractMetadata` procedure (privateProcedure query) wired into root router as `webapp` namespace.

### Wire-up (92-09)
- `server/trpc/index.ts` mounts `webapp: webappRouter`.
- `server/trpc/common.ts` adds `webapp.extractMetadata` to `httpOnlyPaths` with rationale comment (8s fetch budget makes the query mutation-shaped; HTTP transport prevents WS-reconnect drop after deploy/restart per pitfall B-12 / X-04).
- `server/trpc/common.test.ts` gains Tests 13/14 — presence assertion + bare-name footgun guard.

### Dependency
- `node-html-parser` ^7.0.1 added to `livos/packages/livinityd/package.json`. No alternative in-tree HTML parser found during 92-01 audit.

## Test results
- **Webapps suite:** 7 files, **92 tests**, all green (~750ms total).
  - `url-validator.test.ts` 36 / 36
  - `html-parser.test.ts` 8 / 8
  - `favicon-resolver.test.ts` 15 / 15
  - `fetch-html.test.ts` 10 / 10
  - `metadata-cache.test.ts` 8 / 8
  - `metadata-extractor.test.ts` 13 / 13
  - `metadata-extractor.integration.test.ts` 2 / 2
- **`server/trpc/common.test.ts`:** 14 / 14 (12 pre-existing + 2 new from 92-09).
- **Typecheck:** `pnpm --filter livinityd typecheck` reports 359 errors before AND after Phase 92 — no new errors introduced. The 359 pre-existing errors are all in unrelated files (`user/routes.ts`, `user/user.ts`, `utilities/file-store.ts`, `widgets/routes.ts`).

## Manual smoke curl (defer to Mini PC UAT)
Documented in `metadata-extractor.integration.test.ts` header. Once deployed:

```bash
curl -sS -H 'content-type: application/json' \
  -H "authorization: Bearer $LIV_API_KEY" \
  -X POST http://localhost:3001/trpc/webapp.extractMetadata \
  -d '{"url":"https://github.com"}' | jq
```

Expected: 200 with `{result:{data:{title,faviconUrl,description,ogImage}}}`; second call <50ms (cache hit). Reject `file:///etc/passwd`, `http://192.168.1.1/` (non-admin) with `BAD_REQUEST`.

## Live `psql -d livos -f schema.sql` idempotency check
Deferred to Mini PC deploy (no psql available in the dev env). Both the migration artifact and the schema.sql append use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so re-application is a no-op by static lint.

## Deviations from plan
None. Every task completed exactly as scoped:
- 92-01: confirmed `node-html-parser` was missing in deps, added it (the planned EDIT scope).
- 92-04: parser separation respected — favicon resolution is intentionally NOT wired here; it's the next task's job.
- 92-09: TRPCError code mapping followed CONTEXT gray-area #7 verbatim with the ExtractionError attached as `cause`.

## Carryovers / known limitations
- DNS rebinding SSRF is out of scope (RISK #6 in 92-PLAN.md). The validator gates the user-typed host but does not re-check the post-DNS IP at fetch time. Revisit before v33 ships per planned security pass.
- Cache evict on URL update is not implemented — P94 CRUD will need to call `cache.set(url, freshResult)` after re-extracting in the dialog. Stub `webapps-repository.ts` left in place to make the P94 wiring a single-file extension.
- Cloudflare/anti-bot 403 graceful fallback (CONTEXT RISK #2 mitigation — `{title: hostname, faviconUrl: <hostname>/favicon.ico}`) is NOT implemented in this phase. Currently a hard 403 surfaces as `BAD_STATUS`. Defer to P94 UAT signal — if real-world sites hit it often we'll wire the fallback there alongside the dialog UX.

## Commits
See `git log --oneline f3538e1d811992b782a9bb057d1b7f0a0189f95f^..HEAD` (or scope to `livos/packages/livinityd/source/modules/webapps`).

Total: 11 commits across the 11 atomic tasks.
