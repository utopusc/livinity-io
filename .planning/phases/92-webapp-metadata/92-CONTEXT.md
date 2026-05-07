# Phase 92: WebApp Metadata Extractor — Context

## Goal
Ship a server-side tRPC endpoint `webapp.extractMetadata({url})` that returns `{title, faviconUrl, description, ogImage}` for any public web URL, backed by a 24h Redis cache and a new Postgres `webapps` table for persistence in later phases.

## Why this phase exists
v33 adds a "WebApp" desktop concept: the user pastes a URL and LivOS auto-extracts a title and favicon to render an icon (no manual naming). Without trustworthy server-side metadata, P94's "Add WebApp" dialog would show empty placeholders, and P93's window-discovery title-poll would lack a fallback hostname mapping. This phase is the smallest backend dependency for both Wave 1 (P93 window manager — needs URL→title to match Chrome window titles) and Wave 2 (P94 desktop UI — needs `{title, faviconUrl}` for the icon). It is intentionally pure backend so frontend phases can mock the API surface immediately.

## In-scope
- New module path `livos/packages/livinityd/source/modules/webapps/` with `metadata-extractor.ts` and `trpc-router.ts`.
- tRPC procedure `webapp.extractMetadata({url: string})` returning `{title, faviconUrl, description, ogImage}`.
- HTTP fetch flow: optional HEAD pre-check, then GET HTML with size cap, parse `<title>`, `<link rel="icon">`, `<link rel="apple-touch-icon">`, `<meta property="og:image">`, `<meta name="description">`, `<meta property="og:description">`.
- Favicon resolution chain: explicit `<link rel="icon">` (highest precedence) → `<link rel="apple-touch-icon">` → `<link rel="shortcut icon">` → fallback `/favicon.ico`. All resolved to absolute URLs against the page's final (post-redirect) base URL.
- URL validation: reject non-`http(s):` schemes (`file:`, `javascript:`, `data:`, `chrome:`), reject malformed URLs, reject private intranet IPs (RFC1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`) unless caller is admin (per `ctx.currentUser.role`).
- Redis cache: 24h TTL, key `liv:webapp:meta:<sha256(url)>`, value is JSON-encoded result. Cache hit short-circuits the fetch.
- Postgres migration adding `webapps` table: `id` UUID PK, `user_id` UUID FK→`users(id) ON DELETE CASCADE`, `url` TEXT NOT NULL, `title` TEXT, `favicon_url` TEXT, `position` INTEGER, `created_at` TIMESTAMPTZ DEFAULT NOW(). Index on `(user_id, position)`.
- Migration applied via the project's existing dual-write rule (see `agents-router.ts` precedent): a discrete `.sql` artifact under `database/migrations/` AND idempotent `IF NOT EXISTS` DDL appended to `database/schema.sql`.
- Wire the new router into the root tRPC router (`server/trpc/index.ts`) and add the `webapp.*` namespace to `httpOnlyPaths` in `common.ts`.
- Unit tests for parser + URL validator + favicon resolver. Integration test for the tRPC procedure with cache hit/miss paths.

## Out-of-scope
- Desktop "Add WebApp" right-click menu, dialog UI, icon component → owned by **P94**.
- Chrome window spawn / x11vnc / window discovery → owned by **P93**.
- Stream window UI / VNC client / mode selector → owned by **P95**.
- Teach mode action recording / `webapp_skills` table → owned by **P96**.
- Auto mode bytebot loop with `--window <wid>` scoping → owned by **P97**.
- `webapp_agent_sessions` table (per-WebApp agent session) → introduced in **P95**.
- WebApp CRUD tRPC procedures (`webapps.create`, `list`, `delete`, `update`) → introduced in **P94**. (P92 only ships the read-only metadata extractor + the table schema; insert/select procedures land with the UI in P94.)
- Multi-user Chrome profile isolation → deferred to v34 per D-V33-07.

## Dependencies
- **Code**: existing tRPC scaffolding (`livos/packages/livinityd/source/modules/server/trpc/{index.ts,common.ts,trpc.ts,is-authenticated.ts}`); existing Redis client (ioredis named import); existing Postgres pool (`modules/database/index.ts`); migration dual-write convention (see `2026-05-05-v32-agents.sql` header for the canonical comment style).
- **Data**: Postgres DB `livos` with existing `users` table (FK target). Redis instance reachable via `REDIS_URL`.
- **Phases**: none upstream (P92 is Wave 1 leaf). Downstream: P93 consumes title for window-discovery match, P94 consumes the full payload for the icon dialog.
- **External binaries**: none. Uses Node `fetch` (Node 20+ global) — no `node-fetch` or `axios` dependency added.
- **External packages**: HTML parsing via `node-html-parser` if not already in `package.json`; otherwise reuse whatever the broker/marketplace path uses. Confirm during 92-01.

## Sacred constraints
- **`liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.** Verify before AND after every commit in this phase. P92 has no business in `liv/` at all — this constraint should hold trivially, but verification is non-optional.
- Subscription-only path: no raw `@anthropic-ai/sdk` imports introduced.
- No backwards-compat hacks. New module, new table, new tRPC namespace — all greenfield.
- No emoji unless explicitly authored.
- All new tRPC routes MUST be added to `httpOnlyPaths` in `common.ts` per the tRPC websocket pitfall (otherwise mutations hang).

## Gray areas / open questions
1. **HTML size cap**: how large should the GET response be allowed to grow before we abort the parse? (Provisional default: **2 MB**; abort with `RESPONSE_TOO_LARGE` and return partial metadata if `<title>` was already seen in first chunk.)
2. **Fetch timeout**: total wall-clock budget for HEAD+GET. (Provisional default: **8 seconds total**; 3s connect, 5s read.)
3. **User-Agent**: do we send a real-looking UA, or a `LivOS/1.0 metadata-bot` UA? (Provisional default: **`Mozilla/5.0 (compatible; LivOS-Metadata/1.0; +https://livinity.io/bot)`** — real browsers' parsers are stricter; many sites redirect or 403 a generic bot UA. Pick a UA that gets through Cloudflare's basic challenge.)
4. **Redirect cap**: how many 3xx hops to follow? (Provisional default: **5 hops**, then bail with `TOO_MANY_REDIRECTS`.)
5. **Cache key normalization**: do we hash the URL as the user typed it, or normalize (lowercase host, strip default port, drop trailing slash) first? (Provisional default: **normalize first** — same URL with/without trailing slash should hit the same cache row. Tracking-param stripping (`utm_*`, `fbclid`) **NOT** in scope; preserve query string verbatim after host-normalization.)
6. **Private-IP override for admin**: should we still allow `localhost` extraction for admin users, or block universally? (Provisional default: **admin allowed**, member/guest blocked. Useful for the user testing self-hosted services on the Mini PC.)
7. **Error shape**: tRPC errors as typed `code` enum or plain message? (Provisional default: **`TRPCError` with `code: 'BAD_REQUEST' | 'TIMEOUT' | 'NOT_FOUND'`** and a structured `cause` object for the UI to discriminate.)

## Success criteria
1. `webapp.extractMetadata({url: 'https://github.com'})` returns a result with non-empty `title` and absolute `faviconUrl` within 8 seconds on a clean cache miss.
2. Second call to the same URL returns in <50ms (Redis cache hit).
3. Calls with `file://`, `javascript:`, `chrome:`, `127.0.0.1`, `192.168.1.1`, or malformed URLs reject as `BAD_REQUEST` for non-admin users; admin users may still query private IPs.
4. Postgres `webapps` table exists after `bash /opt/livos/update.sh` runs migrations (verified via `\d webapps`).
5. `webapp.extractMetadata` is reachable over HTTP (not WebSocket) — confirmed by inspecting `httpOnlyPaths` membership and a curl-against-running-livinityd smoke test.
6. Unit test coverage on the parser + favicon resolver + URL validator ≥ 80% lines (matches existing `apps/` and `agents-repo` test density).
7. Sacred SHA verified unchanged at phase open and phase close (`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts`).
