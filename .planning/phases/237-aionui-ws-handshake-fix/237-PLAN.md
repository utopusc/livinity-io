---
phase: 237-aionui-ws-handshake-fix
plan: 01
type: hotfix
autonomous: true
wave: 1
depends_on: [Phase 236]
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
mini_pc_target: bruce@10.69.31.68
created: 2026-05-27
---

# Phase 237 Plan 01 — AionUi WS handshake Referer-gate fix

## Objective

Split the Phase 236 `LIV_ASSISTANT_SUBRESOURCE_HANDLE` constant into TWO
Caddy named matchers so the WebSocket handshake to `wss://bruce.livinity.io/ws`
succeeds. Per RFC 6455 the browser does NOT send a `Referer` header on a
WebSocket upgrade (only `Origin`), so Phase 236's referer-gated matcher
silently MISSES the WS handshake. Result: chat streaming broken — operator
must reload the page to see each response.

## Root cause (NEW vs Phase 236)

Phase 236 assumed Referer-based disambiguation worked for both `/api/*` and
`/ws[/...]`. EXT-4 in the Phase 236 deploy log passed because curl was given
an explicit `-H "Referer: https://bruce.livinity.io/liv/"` flag. Real browser
behavior:

- HTTP subresource fetches under `/liv/` iframe DO send Referer → `/api/*`
  matcher works as designed.
- WebSocket `new WebSocket('wss://.../ws')` handshake does NOT send Referer
  (per spec, only Origin) → `@liv_subresource` matcher fails the
  `header_regexp Referer` AND condition → request falls through to the
  `:8080` catch-all on livinityd which has no `/ws` route → 404 (or 502
  per Phase 236 EXT-4b "WITHOUT Referer" negative control which proved
  exactly this fall-through).

## Fix

Split into two matchers in `livos/packages/livinityd/source/modules/domain/caddy.ts`:

1. `@liv_ws` — **UNCONDITIONAL** match on `/ws` and `/ws/*` paths only.
   AionUi exclusively owns the `/ws` path on this Caddy host; livinityd has
   no `/ws` route. Therefore unconditional routing is safe and consistent.
   No Referer/Origin check needed (and per RFC 6455 browsers do not send
   Referer here anyway).

2. `@liv_api_subresource` — KEEP the Referer-gated pattern, but for `/api/*`
   ONLY. This preserves Phase 236's protection of LivOS-shell apex `/api/*`
   traffic from being collateral-routed to AionUi.

Both proxy to `127.0.0.1:3020` with the identical body (header strip,
WS_TRANSPORT_BODY, frame-ancestors CSP at handle scope).

## Tasks

### Task 1 — Patch `caddy.ts` + extend `caddy.test.ts`

**type=auto**

- Replace the body of the `LIV_ASSISTANT_SUBRESOURCE_HANDLE` constant with
  the new two-matcher shape (constant name preserved to avoid touching the
  3 emit sites in `generateFullCaddyfile`).
- Header comment block updated to document the RFC 6455 reason for the
  split.
- Extend the Phase 236 vitest describe block in `caddy.test.ts` with new
  assertions for both matchers:
  - `@liv_ws path /ws /ws/*` present
  - `@liv_ws` block does NOT contain `header_regexp Referer` (absence)
  - `@liv_api_subresource` block contains `header_regexp Referer ^https?://[^/]+/liv(/|$)`
  - `@liv_api_subresource` block contains `path /api/*` only (NOT /ws)
  - Two `handle` blocks emit (`handle @liv_ws { ... }` + `handle @liv_api_subresource { ... }`)
  - Both proxy to `127.0.0.1:3020`
- Mark obsolete Phase 236 assertions referencing the old combined matcher
  shape as deprecated — keep the test file passing without removing the
  Phase 236 describe block (history record).
- Run `pnpm --filter livinityd typecheck` AND `pnpm --filter livinityd test -- caddy`.
- Run UI build sanity (`pnpm --filter ui build`) — caddy.ts is consumed by
  livinityd not UI but the Phase 236 pattern includes UI build for parity.

**Done criteria:**

- typecheck PASS (no new errors vs baseline)
- caddy vitest GREEN
- UI build PASS

**Commit:**

```
feat(237-01): split @liv_subresource into @liv_ws (unconditional) + @liv_api_subresource (referer-gated)

WebSocket handshake (RFC 6455) does NOT send Referer — only Origin. Phase
236's combined matcher missed the /ws upgrade; AionUi chat streaming was
broken. Split into:
- @liv_ws: unconditional path /ws /ws/* (AionUi owns the path)
- @liv_api_subresource: referer-gated path /api/* (preserves LivOS-shell
  /api/* protection from Phase 236)

Both proxy to 127.0.0.1:3020 with identical header-strip + WS transport.
```

### Task 2 — Mini PC deploy + verify

**type=auto**

- `git push origin master`
- Single batched SSH session (`bash /opt/livos/update.sh` + verify):
  - `bash /opt/livos/update.sh` EXIT 0
  - `grep -c '@liv_ws' /etc/caddy/Caddyfile` ≥ 2 (apex + multi-user subdomain)
  - `grep -c '@liv_api_subresource' /etc/caddy/Caddyfile` ≥ 2
  - `grep -c '@liv_subresource' /etc/caddy/Caddyfile` == 0 (old shape gone)
  - WS smoke from orchestrator (NO Referer — browser-realistic):
    `curl -i -N -H "Origin: https://bruce.livinity.io" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $(echo -n test | base64)" -H "Sec-WebSocket-Version: 13" https://bruce.livinity.io/ws --max-time 5`
    → expect `HTTP/1.1 101 Switching Protocols`
  - Asset non-regression (Phase 236): `curl -fsSI -H "Referer: https://bruce.livinity.io/liv/" https://bruce.livinity.io/api/assets/logos/ai-major/claude.svg` → 200
  - LivOS shell non-regression: `curl -fsSI https://bruce.livinity.io/` → 200
  - `/liv-login` 302 non-regression (Phase 234)
  - `/liv/api/auth/status` 200 non-regression (Phase 235)
  - Sacred SHA-256 of `/opt/liv/packages/core/src/sdk-agent-runner.ts`
    == `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`
  - 6/6 services active

**Done criteria:**

- All external probes PASS
- Sacred SHA UNCHANGED
- Caddyfile delta proves the new matcher shape is live

**Commit:**

```
docs(237-01): deploy log — Mini PC live WS handshake fix verified

External browser-realistic WS upgrade (NO Referer, Origin only) returns
HTTP 101. Phase 236 /api referer-gate still works. Phase 234 / 235
non-regressed.
```

### Task 3 — SUMMARY + STATE + ROADMAP

**type=auto**

- Write `237-SUMMARY.md` with the standard summary template (frontmatter +
  one-liner + root cause + fix + SCs + deviations + outcome).
- Hand-port Phase 237 row into top-level `.planning/ROADMAP.md` ABOVE the
  Phase 236 row.
- Update `.planning/STATE.md` Current Position to v42 Phase 237 ✅ SHIPPED.

**Commit:**

```
docs(237-01): SUMMARY + STATE + ROADMAP — Phase 237 SHIPPED 1/1 plan, X/X SCs GREEN

WS handshake spec compliance fix — chat streaming WORKS without page
reload. Single-phase hot-fix continuation of Phase 236.
```

## Success Criteria

- [ ] SC-01: `caddy.ts` emits separated `@liv_ws` (unconditional) + `@liv_api_subresource` (referer-gated) matchers in all 3 site blocks (fallback :80, apex, multi-user subdomain)
- [ ] SC-02: `caddy.test.ts` new assertions PASS; full suite GREEN (no Phase 236 regressions broken)
- [ ] SC-03: livinityd typecheck baseline preserved (zero new errors)
- [ ] SC-04: UI build PASS (parity with Phase 236 deploy precedent)
- [ ] SC-05: Mini PC `update.sh` EXIT 0 + 6/6 services active
- [ ] SC-06: External WS upgrade (browser-realistic — Origin only, no Referer) → HTTP 101 Switching Protocols
- [ ] SC-07: External `/api/assets/...` (Referer=/liv/) → HTTP 200 (Phase 236 non-regression)
- [ ] SC-08: External LivOS shell `/` HTTP 200 (no regression)
- [ ] SC-09: `/liv-login` 302 (Phase 234 non-regression)
- [ ] SC-10: `/liv/api/auth/status` 200 (Phase 235 non-regression)
- [ ] SC-11: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (git SHA + Mini PC SHA-256)
- [ ] SC-12: 3 atomic commits pushed to `origin/master`

## Critical Invariants

- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical pre/post
- Mini PC ONLY (HARD RULE 2026-04-27 — Server4 off-limits)
- LivOS shell `/api/*` traffic NOT collateral-routed to AionUi (preserved via
  Referer-gated `/api/*` matcher)
- Phase 234-04 `/liv-login` auth bypass NOT affected
- WebSocket spec compliance — Origin-or-no-header matching, not Referer
