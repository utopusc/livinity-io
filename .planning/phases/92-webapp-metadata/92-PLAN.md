# Phase 92: WebApp Metadata Extractor — Plan

## Plan summary
Stand up a thin, well-tested backend slice that turns a URL into `{title, faviconUrl, description, ogImage}`. Work proceeds bottom-up: schema + migration first (so downstream phases can plan their queries), then the pure-function parser/validator/favicon-resolver (unit-testable without network), then the HTTP fetch wrapper (with size cap, timeout, redirect cap), then the Redis cache layer, then the tRPC procedure that composes them all and registers in the root router + `httpOnlyPaths`. Closes with an integration test (cache miss + hit) and a smoke curl. No UI work. Sacred SHA is checked at start and end. Total effort: S — 1-2 days.

## Task breakdown

### 92-01 — Module scaffold + dependency audit
- **Description**: Create the `webapps/` module directory under `livos/packages/livinityd/source/modules/`. Confirm whether `node-html-parser` is already a dependency (check `livos/packages/livinityd/package.json`); if not, add it. Sketch the empty file shells for `metadata-extractor.ts`, `trpc-router.ts`, `webapps-repository.ts` (table CRUD helper, even if only the schema is exported in P92), and `index.ts` (barrel re-export). Verify sacred SHA at phase open.
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/webapps/index.ts`
  - CREATE `livos/packages/livinityd/source/modules/webapps/metadata-extractor.ts` (stub)
  - CREATE `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` (stub)
  - CREATE `livos/packages/livinityd/source/modules/webapps/webapps-repository.ts` (stub)
  - EDIT `livos/packages/livinityd/package.json` (only if `node-html-parser` missing)
- **Acceptance criteria**:
  - `pnpm --filter livinityd typecheck` passes with empty stubs.
  - Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged.
- **Effort**: 30min
- **Depends on**: none

### 92-02 — Postgres `webapps` table migration (dual-write)
- **Description**: Author the migration SQL using the project's dual-write convention (discrete dated `.sql` artifact + idempotent `IF NOT EXISTS` block appended to `schema.sql`). Mirror the comment header style from `2026-05-05-v32-agents.sql`. Columns per CONTEXT: `id UUID PK DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id) ON DELETE CASCADE`, `url TEXT NOT NULL`, `title TEXT`, `favicon_url TEXT`, `position INTEGER NOT NULL DEFAULT 0`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Index `webapps_user_position_idx` on `(user_id, position)`.
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/database/migrations/2026-05-07-p92-webapps.sql`
  - EDIT `livos/packages/livinityd/source/modules/database/schema.sql` (append idempotent table block + index)
- **Acceptance criteria**:
  - `psql -d livos -f schema.sql` runs cleanly twice in a row (idempotency check).
  - `\d webapps` shows all 7 columns + the FK + the index.
- **Effort**: 30min
- **Depends on**: 92-01

### 92-03 — URL validator
- **Description**: Pure function `validateUrl(url: string, opts: {isAdmin: boolean}): { ok: true, normalized: URL } | { ok: false, code, reason }`. Rejects non-`http(s):` schemes, malformed URLs, and private IPs (RFC1918 + `127.0.0.0/8` + `169.254.0.0/16` + IPv6 loopback + `fc00::/7`) for non-admins. Normalizes: lowercase host, strip default port (`:80`/`:443`), drop trailing slash on path-only-`/`. Preserves query string verbatim.
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/webapps/url-validator.ts`
  - CREATE `livos/packages/livinityd/source/modules/webapps/url-validator.test.ts`
- **Acceptance criteria**:
  - Test matrix covers: 6 reject schemes, 4 private-IP categories, admin-bypass path, normalization round-trip.
  - All tests pass; ≥ 90% line coverage on `url-validator.ts`.
- **Effort**: 1h
- **Depends on**: 92-01

### 92-04 — HTML parser (title / description / og:image / favicon links)
- **Description**: Pure function `parseMetadata(html: string, baseUrl: URL): { title?, description?, ogImage?, faviconCandidates: { rel, href, sizes? }[] }`. Uses `node-html-parser`. Extracts `<title>`, `<meta name="description">`, `<meta property="og:description">` (description fallback), `<meta property="og:image">`, all `<link rel="icon|shortcut icon|apple-touch-icon">` with their `href` and optional `sizes`. Does NOT resolve to absolute URL — that's the next task's job (separation lets us unit-test parsing without URL resolution noise).
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/webapps/html-parser.ts`
  - CREATE `livos/packages/livinityd/source/modules/webapps/html-parser.test.ts`
  - CREATE `livos/packages/livinityd/source/modules/webapps/__fixtures__/github.html` (trimmed real-world fixture)
  - CREATE `livos/packages/livinityd/source/modules/webapps/__fixtures__/minimal.html` (`<title>` only)
  - CREATE `livos/packages/livinityd/source/modules/webapps/__fixtures__/no-meta.html` (empty body, no head metadata)
- **Acceptance criteria**:
  - 3 fixture-driven tests pass (rich, minimal, empty).
  - og:description used as fallback when `<meta name=description>` absent.
- **Effort**: 1h
- **Depends on**: 92-01

### 92-05 — Favicon resolver (chain → absolute URL)
- **Description**: Pure function `resolveFavicon(candidates, baseUrl): string`. Implements the precedence chain from CONTEXT: `<link rel="icon">` → `<link rel="apple-touch-icon">` → `<link rel="shortcut icon">` → fallback `<baseUrl.origin>/favicon.ico`. Within a tier, prefer the largest declared `sizes` (e.g. `192x192` > `32x32`). Resolves relative `href` against `baseUrl` (post-redirect URL).
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/webapps/favicon-resolver.ts`
  - CREATE `livos/packages/livinityd/source/modules/webapps/favicon-resolver.test.ts`
- **Acceptance criteria**:
  - Tests cover: explicit `rel=icon`, fallback to apple-touch, fallback to `/favicon.ico`, relative href resolution, sizes tie-breaker.
  - Returns absolute URL with scheme + host + path.
- **Effort**: 45min
- **Depends on**: 92-04

### 92-06 — HTTP fetch wrapper (size cap, timeout, redirect cap)
- **Description**: `fetchHtml(url: URL): Promise<{ finalUrl: URL, html: string, contentType: string }>`. Uses Node global `fetch`. Enforces: total 8s wall-clock timeout (`AbortController` + `setTimeout`), max 5 redirects (manual follow because Node fetch's `redirect: 'follow'` doesn't expose the chain length cleanly), 2MB response size cap (stream the body, abort on overflow), reject non-`text/html` content types. UA per CONTEXT default. Emits structured errors: `TIMEOUT`, `TOO_MANY_REDIRECTS`, `RESPONSE_TOO_LARGE`, `NOT_HTML`, `NETWORK_ERROR`.
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/webapps/fetch-html.ts`
  - CREATE `livos/packages/livinityd/source/modules/webapps/fetch-html.test.ts` (uses an in-process http server fixture)
- **Acceptance criteria**:
  - Test cases: happy path returns `finalUrl` post-redirect, timeout aborts at 8s, 6th redirect rejects, 3MB body aborts before parse, non-HTML rejects.
  - No `node-fetch` or `axios` added — Node 20 global only.
- **Effort**: 2h
- **Depends on**: 92-03

### 92-07 — Redis cache wrapper (24h TTL, sha256 key)
- **Description**: `metadataCache.get(url) / .set(url, value)`. Key is `liv:webapp:meta:<sha256(normalizedUrl)>`. Value is JSON-stringified `{title, faviconUrl, description, ogImage}`. TTL 86400s. sha256 via Node `crypto.createHash`. Uses the existing ioredis instance (named import). Cache miss returns `null`.
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/webapps/metadata-cache.ts`
  - CREATE `livos/packages/livinityd/source/modules/webapps/metadata-cache.test.ts` (mock ioredis or use the existing test util)
- **Acceptance criteria**:
  - `set` then `get` returns the same payload.
  - `get` for unknown URL returns `null`.
  - Key format matches `liv:webapp:meta:<64-hex-chars>`.
- **Effort**: 30min
- **Depends on**: 92-01, 92-03

### 92-08 — Compose `extractMetadata` orchestrator
- **Description**: `extractMetadata({url, isAdmin}): Promise<MetadataResult>` wires everything: validate → cache lookup → fetch → parse → resolve favicon → cache store → return. Maps internal errors to TRPC-shaped error codes per CONTEXT gray area #7. Logs slow extractions (>3s) at `info` level for ops visibility.
- **Files**:
  - EDIT `livos/packages/livinityd/source/modules/webapps/metadata-extractor.ts` (replace stub with full implementation)
  - CREATE `livos/packages/livinityd/source/modules/webapps/metadata-extractor.test.ts` (orchestration test with all collaborators stubbed)
- **Acceptance criteria**:
  - Cache miss path: validator → fetch → parse → resolve → cache.set called in order.
  - Cache hit path: validator → cache.get returns; fetch is NOT called.
  - Validator failure short-circuits with `BAD_REQUEST` before fetch.
- **Effort**: 1h
- **Depends on**: 92-03, 92-04, 92-05, 92-06, 92-07

### 92-09 — tRPC router + register in root + `httpOnlyPaths`
- **Description**: Define `webappRouter` with one procedure `extractMetadata` (input zod schema `{url: z.string().url()}`, output schema, `protectedProcedure`). Resolver passes `ctx.currentUser.role === 'admin'` as `isAdmin`. Register under namespace `webapp` in the root tRPC router. Add `webapp.extractMetadata` to `httpOnlyPaths` in `server/trpc/common.ts` (per the documented websocket pitfall).
- **Files**:
  - EDIT `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` (replace stub)
  - EDIT `livos/packages/livinityd/source/modules/server/trpc/index.ts` (mount `webapp` namespace)
  - EDIT `livos/packages/livinityd/source/modules/server/trpc/common.ts` (append to `httpOnlyPaths`)
- **Acceptance criteria**:
  - `pnpm --filter livinityd typecheck` passes.
  - `httpOnlyPaths.includes('webapp.extractMetadata')` is true (verified by a unit assertion in `common.test.ts`).
- **Effort**: 45min
- **Depends on**: 92-08

### 92-10 — Integration test + manual smoke curl
- **Description**: One end-to-end integration test that boots an in-process tRPC client, calls `webapp.extractMetadata` against a fixture HTTP server, asserts cache hit on second call. Document the manual smoke curl (`POST /trpc/webapp.extractMetadata`) in the phase summary so the executor can run it against the dev livinityd before commit.
- **Files**:
  - CREATE `livos/packages/livinityd/source/modules/webapps/metadata-extractor.integration.test.ts`
- **Acceptance criteria**:
  - Integration test passes.
  - Documented curl returns 200 with the expected JSON shape against `https://example.com`.
- **Effort**: 1h
- **Depends on**: 92-09

### 92-11 — Sacred SHA verify + commit + phase summary
- **Description**: Run `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` and confirm it equals `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Run full `pnpm --filter livinityd test` + `typecheck`. Write `92-SUMMARY.md` covering: what shipped, deviations from plan, test results, sacred SHA before/after.
- **Files**:
  - CREATE `.planning/phases/92-webapp-metadata/92-SUMMARY.md`
- **Acceptance criteria**:
  - Sacred SHA verified unchanged.
  - All tests green.
  - Summary committed.
- **Effort**: 15min
- **Depends on**: 92-10

## Test strategy

**Unit (per-module, no network, no Redis, no Postgres)**
- `url-validator.test.ts` — scheme rejection, private-IP rejection, admin bypass, normalization.
- `html-parser.test.ts` — three fixture HTML files (rich, minimal, empty); meta and og:image extraction.
- `favicon-resolver.test.ts` — precedence chain, sizes tie-breaker, relative-href resolution.
- `metadata-extractor.test.ts` — orchestration with all collaborators stubbed (cache miss path, cache hit path, validator-fail short-circuit).

**Integration (in-process, real Redis if available, fixture HTTP server)**
- `fetch-html.test.ts` — spins up an `http.createServer` returning controlled responses; tests timeout, redirect cap, size cap, content-type rejection.
- `metadata-cache.test.ts` — round-trips through ioredis (or the project's standard ioredis test mock).
- `metadata-extractor.integration.test.ts` — full tRPC procedure call against a fixture page; second call asserts cache hit (fetch fixture server's request count stays at 1).

**Manual UAT**
- Boot livinityd locally (`pnpm --filter livinityd dev`) and curl `POST /trpc/webapp.extractMetadata` with `{"url":"https://github.com"}` — expect `{title: "GitHub: ..."}` and an absolute favicon URL within 8s.
- Repeat the curl — expect <50ms response (cache hit).
- Curl with `{"url":"file:///etc/passwd"}` — expect `BAD_REQUEST`.
- Curl with `{"url":"http://192.168.1.1"}` as a non-admin token — expect `BAD_REQUEST`; as admin, expect a real attempt.
- After deploy: `psql -d livos -c '\d webapps'` shows the table.

## Risks
1. **`node-html-parser` not in deps** — adds a new dependency line and a `pnpm install` cycle. Mitigation: 92-01 audits up front; if a parser is already vendored elsewhere (broker uses one), reuse instead of adding.
2. **Cloudflare/anti-bot 403 on extraction** — many sites block generic UAs. Mitigation: gray-area #3 picks a UA designed to pass basic challenges; document the limitation in the summary; fallback for hard-blocked sites is to return `{title: hostname, faviconUrl: <hostname>/favicon.ico}` (graceful degradation rather than hard error).
3. **Redirect-loop or slow servers exhaust the 8s budget on a real network** — the timeout aborts cleanly, but the user's first cache-miss may feel slow. Mitigation: log slow extractions; consider lowering to 5s in P94 UAT once we have field data.
4. **Migration drift between `schema.sql` and `migrations/*.sql`** — the dual-write convention is footgun-prone (mismatched columns silently). Mitigation: 92-02 includes the idempotency-twice-in-a-row check; reviewer diffs both files side-by-side.
5. **`httpOnlyPaths` forgotten** — without this, mutations would hang per the documented tRPC websocket pitfall. P92 only ships a query (which routes over WS too, but slower), so the symptom would be slowness, not a hang — easy to miss. Mitigation: 92-09 adds an assertion in `common.test.ts`.
6. **SSRF surface** — even with private-IP blocks, DNS rebinding could resolve a public hostname to an internal IP at fetch time. Mitigation: out of scope for P92 hardening (the validator runs on the host the user types, not on the post-DNS IP). Document as a known limitation; revisit in a security pass before v33 ships.

## Sacred SHA verification points
- **At phase open (start of 92-01)**: `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` must equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Abort phase if mismatch.
- **Before each commit**: same check. If any task accidentally touches `liv/`, revert before commit.
- **At phase close (92-11)**: same check. Record the verified SHA in `92-SUMMARY.md`.

## Estimated effort total
**S — 1-2 days** (matches DRAFT). Sum of task efforts: 30 + 30 + 60 + 60 + 45 + 120 + 30 + 60 + 45 + 60 + 15 = **9h 35min** of focused work, which fits a 1.5-day window at the project's typical 4-6h/day cadence.
