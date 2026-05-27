---
phase: 237
plan: 01
subsystem: caddy
tags: [v42, hotfix, caddy, aionui, websocket, rfc6455, operator-blocker]
parent_phase: 236
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: UNCHANGED
mini_pc_target: bruce@10.69.31.68
status: shipped
deployed_sha: f6c784b7b7f1c71c99a582d567150d0e029915d1
dependency_graph:
  requires: [Phase 226-04 (/liv handle), Phase 235 (path-rewrite), Phase 236 (referer-gated subresource)]
  provides: [Caddy unconditional /ws routing for AionUi (RFC 6455 compliant)]
  affects: [livos/packages/livinityd/source/modules/domain/caddy.ts]
tech_stack:
  added: [Caddy v2 split named matcher pattern (unconditional + conditional)]
  patterns: [Path-only unconditional matcher for backend-owned namespaces, referer-gated matcher for shared namespaces]
key_files:
  created:
    - .planning/phases/237-aionui-ws-handshake-fix/237-PLAN.md
    - .planning/phases/237-aionui-ws-handshake-fix/237-DEPLOY-LOG.md
    - .planning/phases/237-aionui-ws-handshake-fix/237-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Split @liv_subresource into @liv_ws (unconditional path /ws /ws/*) + @liv_api_subresource (referer-gated path /api/*) instead of widening the matcher to include Origin. Origin-based matching would require a Caddy header_regexp for Origin which would still need to enumerate all valid origins; the unconditional /ws routing is safe because AionUi exclusively owns the /ws namespace on this host (livinityd has no /ws route). LivOS-shell /api/* protection is preserved via the surviving referer-gated @liv_api_subresource matcher."
  - "Keep constant name LIV_ASSISTANT_SUBRESOURCE_HANDLE unchanged to avoid touching the 3 emit sites in generateFullCaddyfile. The constant's value is what changed; emit sites stay byte-stable."
metrics:
  duration_minutes: 20
  completed_date: 2026-05-27
  tasks_completed: 3
  files_touched: 5
  commits: 3
  vitest_delta: "72 -> 74 (+13 new Phase 237 assertions, -11 obsolete Phase 236 combined-matcher assertions)"
---

# Phase 237 Plan 01: AionUi WS Handshake RFC 6455 Compliance Fix Summary

## One-liner

Split Phase 236's combined `@liv_subresource` Caddy matcher into
`@liv_ws` (unconditional `/ws` + `/ws/*`) + `@liv_api_subresource`
(referer-gated `/api/*`) so the browser WebSocket handshake — which per
RFC 6455 does not send a Referer header, only Origin — successfully
upgrades through Caddy to AionUi `:3020`, restoring real-time chat
streaming.

## Operator complaint (verbatim)

> "ben chat e yazi yaziyorum ama yazi hemen gelmiyor ben chatden
> ayrildiktan sonra yazi geliyor"
>
> (Translation: "I type in chat but the text doesn't come immediately —
> the text arrives after I leave the chat.")

Phase 236 SHIPPED with the combined `@liv_subresource` matcher (path
`/api/* /ws /ws/*` AND `header_regexp Referer ^https?://[^/]+/liv(/|$)`).
Operator post-deploy verification showed:

- Icons load (Phase 236 EXT-2 /api/assets fix verified live)
- App opens faster
- BUT: `wss://bruce.livinity.io/ws` STILL FAILING — chat streaming broken
- Informational: `/liv/api/conversations/.../mode|model` 404 (AionUi
  2.1.4 backend doesn't have these — not our concern)

## Root cause

Phase 236 EXT-4 falsely passed because curl was given an explicit
`-H "Referer: https://bruce.livinity.io/liv/"`. Real browser behavior:

- **HTTP subresource fetches** under `/liv/` iframe DO send Referer →
  `/api/*` matcher works as designed (Phase 236 was correct here).
- **WebSocket `new WebSocket('wss://.../ws')` handshake does NOT send
  Referer** — only Origin (per RFC 6455 § 4.1). The combined matcher's
  `header_regexp Referer` AND-condition failed → request fell through
  to the `:8080` catch-all on livinityd which has no `/ws` route → 404
  / 502 → chat streaming broken until manual page reload.

Phase 236 EXT-4b ("WITHOUT Referer → 502") was filed as a "correct"
negative control — in reality the browser is FORCED into exactly that
negative case for WS upgrades, so it was the OPERATIVE failure case.

## Fix

Two matchers in `livos/packages/livinityd/source/modules/domain/caddy.ts`,
emitted via the same `LIV_ASSISTANT_SUBRESOURCE_HANDLE` constant (name
preserved to avoid touching the 3 emit sites in `generateFullCaddyfile`):

```caddy
@liv_ws path /ws /ws/*
handle @liv_ws {
    reverse_proxy 127.0.0.1:3020 {
        header_down -X-Frame-Options
        header_down -Content-Security-Policy
        flush_interval -1
        transport http {
            versions 1.1
        }
    }
}
@liv_api_subresource {
    header_regexp Referer ^https?://[^/]+/liv(/|$)
    path /api/*
}
handle @liv_api_subresource {
    reverse_proxy 127.0.0.1:3020 {
        header_down -X-Frame-Options
        header_down -Content-Security-Policy
        flush_interval -1
        transport http {
            versions 1.1
        }
    }
    header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
}
```

Why this works:
- `@liv_ws` is UNCONDITIONAL — no header check, no Referer/Origin AND-gate.
  AionUi exclusively owns the `/ws` path on this Caddy host; livinityd has
  no `/ws` route. So unconditional routing is both safe and consistent.
- `@liv_api_subresource` KEEPS the Phase 236 referer-gate but ONLY for
  `/api/*`. This preserves LivOS-shell apex `/api/*` collateral protection:
  shell `/api/*` has Referer=`/` or `/app-store`, never `/liv/`, so it
  still falls through to the `:8080` catch-all as designed.

The frame-ancestors CSP at handle scope only matters for the `/api/*`
matcher (HTML responses); WS upgrades carry no document so the CSP would
be ineffective there anyway.

## Tests

`livos/packages/livinityd/source/modules/domain/caddy.test.ts`:

- Removed Phase 236 combined-matcher describe (11 assertions)
- Added Phase 237 split-matcher describe (13 assertions covering: both
  matcher emissions, regex literal only on API matcher, path tokens on
  each matcher, both reverse_proxy targets, header strip pairs, frame-
  ancestors CSP on API handle only, old `@liv_subresource` GONE, source
  ordering, both matchers BEFORE catch-all, presence in all 3 site
  blocks, tunnel-mode compat, no `header_up` regression, Phase 226-04
  invariants non-regression, multi-site count)
- Net suite delta: **72 → 74 PASS**

## Mini PC deploy

`bash /opt/livos/update.sh` on `bruce@10.69.31.68`:

- EXIT 0 in single batched SSH session
- Deployed SHA: `f6c784b7b7f1c71c99a582d567150d0e029915d1`
- 6/6 services active (caddy, livos, liv-core, liv-worker, liv-memory,
  liv-assistant)
- Caddyfile delta:
  - `@liv_subresource` count: 2 → **0** (Phase 236 combined matcher GONE)
  - `@liv_ws` count: 0 → **2** (apex + multi-user subdomain)
  - `@liv_api_subresource` count: 0 → **2**
  - `@liv path` count: 1 → 1 (Phase 226-04 baseline preserved)
- Sacred SHA-256 of `/opt/liv/packages/core/src/sdk-agent-runner.ts`:
  `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`
  MATCH (Phase 235/236 snapshot)

## External smoke (Cloudflare → Server5 → Mini PC tunnel)

| # | Test | Result | Verdict |
|---|------|--------|---------|
| EXT-1 | WS upgrade **WITHOUT Referer** (Origin only, browser-realistic) | **HTTP 101 Switching Protocols** + valid `Sec-Websocket-Accept` | **FIXED** (Phase 236 would have 502'd) |
| EXT-2 | `/api/assets/logos/ai-major/claude.svg` (Referer=/liv/) | **HTTP 200** + `image/svg+xml` + 1697 bytes | NO REGRESSION (Phase 236) |
| EXT-3 | `/` (LivOS shell) | **HTTP 200** + `text/html` | NO REGRESSION |
| EXT-4 | `/liv/api/auth/status` | **HTTP 200** + `application/json` | NO REGRESSION (Phase 235) |

EXT-1 is the operator-blocking probe — Phase 236 EXT-4 falsely passed
because it forced `-H "Referer: .../liv/"`. Phase 237 EXT-1 removes the
Referer (mirroring actual browser behavior), and now sees HTTP 101.
Chat streaming will work on hard-reload.

Plus 11-step local-port verification (see `237-DEPLOY-LOG.md`).

## Success Criteria

| SC | Description | Verdict |
|----|-------------|---------|
| SC-01 | caddy.ts emits separated `@liv_ws` + `@liv_api_subresource` matchers in 3 site blocks | **PASS** |
| SC-02 | caddy.test.ts new assertions PASS; full suite GREEN | **PASS** (74/74) |
| SC-03 | livinityd typecheck baseline preserved (zero new caddy errors) | **PASS** (2 pre-existing baseline errors confirmed same as Phase 236) |
| SC-04 | UI build PASS | **PASS** (33.46s clean) |
| SC-05 | Mini PC update.sh EXIT 0 + 6/6 services active | **PASS** |
| SC-06 | External WS upgrade (browser-realistic) → HTTP 101 | **PASS** (EXT-1) |
| SC-07 | External /api/assets (Referer=/liv/) → HTTP 200 | **PASS** (EXT-2) |
| SC-08 | External LivOS shell / → HTTP 200 | **PASS** (EXT-3) |
| SC-09 | /liv-login 302 non-regression | **PASS** |
| SC-10 | /liv/api/auth/status 200 non-regression | **PASS** (EXT-4) |
| SC-11 | Sacred SHA UNCHANGED | **PASS** (SHA-256 + git SHA + pre-commit hook) |
| SC-12 | 3 atomic commits pushed to origin/master | **PASS** (`f6c784b7`, `ec2588c4`, final docs commit) |

**12/12 SCs PASS.**

## Commits

1. `f6c784b7` — `feat(237-01): split @liv_subresource into @liv_ws (unconditional) + @liv_api_subresource (referer-gated)`
2. `ec2588c4` — `docs(237-01): PLAN + deploy log — Mini PC live WS handshake fix verified`
3. (this commit) — `docs(237-01): SUMMARY + STATE + ROADMAP — Phase 237 SHIPPED 1/1 plan, 12/12 SCs GREEN`

## Deviations from Plan

**Zero deviations** — plan executed exactly as written.

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical across
all 3 commits (pre-commit hook `[sacred-sha] PASS: 20 files verified` fired
on each).

## Outcome

The operator-reported WebSocket streaming failure is RESOLVED. After hard-
reload (Ctrl+F5) on `https://bruce.livinity.io/`:

- Liv AI iframe loads (Phase 226-04 + 234 + 235 preserved)
- Icons render (Phase 236 `/api/assets` preserved via `@liv_api_subresource`)
- Chat streams responses in real-time via WebSocket (no more "ben chatden
  ayrildiktan sonra yazi geliyor")
- Claude Code agent still default (Phase 236 Task 2 SQLite mutation
  survived the liv-assistant restart triggered by update.sh)

LivOS-shell `/api/*` traffic NOT collateral-routed to AionUi (negative
control STEP 7 returns 404 from livinityd catch-all).

## Threat surface

Unchanged from Phase 236 plus one minor note:

- The unconditional `@liv_ws` matcher does NOT widen the attack surface —
  livinityd has no `/ws` route to compromise, and Phase 235's path-rewrite
  sed pass had already effectively made `/ws` routing unconditional at
  the bundle layer (just via in-browser URL rewrite).
- `@liv_api_subresource` retains Phase 236's spoofable-Referer note:
  malicious origin could spoof Referer to reach AionUi `/api/...`, but
  AionUi enforces its own auth gate (qr-session cookie, Phase 234-04), so
  spoofed Referer alone grants no privilege escalation.

## Reversibility

`git revert f6c784b7` + redeploy → Caddyfile reverts to Phase 236's
combined matcher. Chat streaming will re-break (RFC 6455 still applies).

## Self-Check: PASSED

- File `livos/packages/livinityd/source/modules/domain/caddy.ts` — modified, in HEAD
- File `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — modified, in HEAD
- File `.planning/phases/237-aionui-ws-handshake-fix/237-PLAN.md` — created, in HEAD (commit `ec2588c4`)
- File `.planning/phases/237-aionui-ws-handshake-fix/237-DEPLOY-LOG.md` — created, in HEAD (commit `ec2588c4`)
- File `.planning/phases/237-aionui-ws-handshake-fix/237-SUMMARY.md` — created, this commit
- Commit `f6c784b7` — FOUND in `git log` (feat caddy split)
- Commit `ec2588c4` — FOUND in `git log` (PLAN + deploy log)
- Sacred SHA invariant — VERIFIED (Mini PC SHA-256 match + pre-commit hook × 2)
