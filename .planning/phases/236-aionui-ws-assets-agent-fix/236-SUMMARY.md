---
phase: 236
plan: 01
subsystem: caddy + aionui-runtime
tags: [v42, hotfix, caddy, aionui, websocket, operator-blocker, default-agent]
parent_phase: 235
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: UNCHANGED
mini_pc_target: bruce@10.69.31.68
status: shipped
deployed_sha: c76cdc6b
dependency_graph:
  requires: [Phase 226-04 (/liv handle), Phase 235 (path-rewrite)]
  provides: [Caddy Referer-gated subresource routing for AionUi]
  affects: [livos/packages/livinityd/source/modules/domain/caddy.ts]
tech_stack:
  added: [Caddy v2 header_regexp named matcher]
  patterns: [Referer-gated routing, side-channel disambiguation by header]
key_files:
  created:
    - .planning/phases/236-aionui-ws-assets-agent-fix/236-PLAN.md
    - .planning/phases/236-aionui-ws-assets-agent-fix/236-AGENT-FINDINGS.md
    - .planning/phases/236-aionui-ws-assets-agent-fix/236-DEPLOY-LOG.md
    - .planning/phases/236-aionui-ws-assets-agent-fix/236-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts
decisions:
  - "Use Caddy v2 header_regexp Referer matcher rather than extending the Phase 235 sed pass: dynamic backtick-template URLs and runtime-inserted DOM src attributes cannot be reliably rewritten at the bundled-JS layer. Routing the fall-throughs at Caddy is lossless because the iframe origin (`/liv/`) and the LivOS shell origin (`/`) are losslessly distinguishable via Referer."
  - "Mutate AionUi default agent via PUT /api/settings/client {guid.lastSelectedAgent} — server-side merge semantics preserve all sibling keys (theme, customCss, acp.config). No fork/patch of AionUi binary needed; reverse-engineered via 1 SSH probe session."
metrics:
  duration_minutes: 30
  completed_date: 2026-05-27
  tasks_completed: 3
  files_touched: 6
  commits: 3
  vitest_delta: "60 → 72 (+12 new Phase 236 assertions)"
---

# Phase 236 Plan 01: AionUi WebSocket + Assets + Agent Default Hot-Fix Summary

## One-liner

Caddy `header_regexp Referer` named matcher routes root-relative `/api/*`
and `/ws[/*]` fall-throughs (dynamic-URL victims of Phase 235's static
sed pass) to AionUi backend at `:3020`, plus LIVE flip of AionUi default
agent from Aion CLI to Claude Code via discovered `PUT /api/settings/client`
endpoint — all 3 operator-reported browser errors RESOLVED.

## Operator complaint (verbatim)

> "giris yapti ama cok fazla hata var iconlar yuklenmiyor! Ben Cogu Seyde
> Auth kullanmak istiyorum API degil! Butun ozellikler aktif mi? Not: Şu
> anda yalnızca Aion CLI özel modelleri destekliyor. Claude code a
> yaziyorum ama donus yok sayfayi yeniledigimde cevabi alabiliyorum! Cok
> fazla hata var"

Concrete browser console errors observed:
- `wss://bruce.livinity.io/ws` repeatedly fails (chat streaming broken)
- `/api/assets/logos/brand/aion.svg` 404
- `/api/assets/logos/ai-major/claude.svg` 404
- `/api/assets/logos/tools/coding/opencode-light.svg` 404
- `/liv/api/conversations/<id>/mode` 404
- `/liv/api/conversations/<id>/model` 404
- AionUi banner: "Şu anda yalnızca Aion CLI özel modelleri destekliyor"

## Root cause

Phase 235 sed-replaced QUOTED `/api/` → `/liv/api/` in the vendored
AionUi JS bundle. That covered string-literal API calls but missed:

1. **Dynamic backtick-template URLs**: `new WebSocket(\`wss://${location.host}/ws\`)`
   — `/ws` is interpolated at runtime, not a quoted literal in source post-
   minification. sed could not touch it. Browser issued `wss://bruce.livinity.io/ws`
   which bypassed the `@liv` matcher and hit the LivOS shell catch-all on
   :8080 (404). Chat streaming broken; manual reload required to see each
   response.

2. **Runtime-inserted DOM `src` attributes**: `<img src="/api/assets/...">`
   injected via React render, not present as a literal in the bundled source.
   Asset 404s broke AionUi's icon set (Aion/Claude/OpenCode logos blank).

3. **Wrong default agent**: AionUi per-user setting
   `client_settings.guid.lastSelectedAgent` was `"aionrs"` (Aion CLI).
   Operator wanted Claude Code (subscription path). Claude Code agent was
   always present + enabled + available — just not auto-selected.

## Solution

### Caddy patch

Added new `LIV_ASSISTANT_SUBRESOURCE_HANDLE` constant in
`livos/packages/livinityd/source/modules/domain/caddy.ts`:

```caddy
@liv_subresource {
    header_regexp Referer ^https?://[^/]+/liv(/|$)
    path /api/* /ws /ws/*
}
handle @liv_subresource {
    reverse_proxy 127.0.0.1:3020 {
        header_down -X-Frame-Options
        header_down -Content-Security-Policy
        flush_interval -1
        transport http { versions 1.1 }
    }
    header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
}
```

Caddy v2 named matcher with `{ }` block ANDs the two stanzas — only routes
when **both** Referer pattern matches AND path is one of `/api/*` `/ws` `/ws/*`.

Emitted in all 3 site blocks (null mainDomain :80 fallback, apex, multi-user
subdomain), immediately BEFORE `LIV_ASSISTANT_HANDLE` for diff-review
ordering.

### Default agent flip

Discovered via reverse-engineering (2 batched SSH sessions on Mini PC):
- Mutation endpoint: `PUT /api/settings/client {key:value}` (200 OK, JSON merge)
- `PATCH`/`POST` rejected with 405; `/api/agents/default` 404
- Server-side field-level merge preserves sibling keys
- Executed: `PUT {"guid.lastSelectedAgent":"2d23ff1c"}` → 200 OK
- Verified: post-PUT `acp.config`, `theme`, `customCss`, `css.activeThemeId` intact
- SQLite `/opt/liv-assistant/data/aionui-backend.db` persists across restart

## What changed (with commits)

| Task | Change | Commit | Files |
|------|--------|--------|-------|
| 1 | Caddy `@liv_subresource` handle + 12 vitest assertions | `37a86aed` | caddy.ts (+85), caddy.test.ts (+184) |
| 2 | AionUi investigation + LIVE default-agent flip + PLAN | `c76cdc6b` | 236-PLAN.md (+205), 236-AGENT-FINDINGS.md (+195) |
| 3 | DEPLOY-LOG + SUMMARY + STATE + ROADMAP | (this commit) | 236-DEPLOY-LOG.md, 236-SUMMARY.md, STATE.md, ROADMAP.md |

## Verification (external relay path)

All probes via `https://bruce.livinity.io/...` (orchestrator → Cloudflare →
Server5 → tunnel → Mini PC). See `236-DEPLOY-LOG.md` for full table.

| Test | Before | After | Status |
|------|--------|-------|--------|
| `/api/assets/logos/ai-major/claude.svg` (Referer=/liv/) | 404 | **200** + svg | **FIXED** |
| `/api/settings/client` (Referer=/liv/) | 404 | **200** + JSON | **FIXED** |
| `/ws` upgrade (Referer=/liv/) | hang/fail | **101 Switching Protocols** | **FIXED** |
| `/` (LivOS shell, no /liv/ Referer) | 200 | 200 | NO REGRESSION |
| `/app-store` | 200 | 200 | NO REGRESSION |
| `/liv/api/auth/status` (Phase 235) | 200 | 200 | NO REGRESSION |
| `/liv/` iframe HTML (Phase 226-04) | 200 | 200 | NO REGRESSION |
| `/api/auth/status` WITHOUT /liv/ Referer (negative) | n/a | **404** | CORRECT (Referer-gate scoping) |
| `/ws` WITHOUT /liv/ Referer (negative) | n/a | **502** | CORRECT (Referer-gate scoping) |

## Tests

```
$ npx vitest run source/modules/domain/caddy.test.ts
Test Files  1 passed (1)
     Tests  72 passed (72)
```

60 baseline (post-Phase 232) → **72 PASS** (+12 new Phase 236 assertions:
matcher emission, regex literal, path tokens, reverse_proxy target, header
strip pair, frame-ancestors CSP, source ordering above `@liv`, presence in
all 3 sites, tunnel-mode compat, no `header_up` regression, Phase 226-04
invariants non-regression, multi-site count).

Typecheck: zero new errors. 2 pre-existing `as const` errors at
caddy.test.ts:696/706 (Phase 231 fixture loop) baseline-confirmed via
`git stash` + `tsc --noEmit` round-trip.

## Sacred SHA invariant

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical:
1. Pre-commit hook `[sacred-sha] PASS: 20 files verified` on each commit
2. Mini PC SHA-256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`
3. Post-deploy `git ls-files -s` UNCHANGED

D-V42-SACRED holds.

## Deviations

**Zero deviations.** Plan executed exactly as written. Implementation
narrative is the Plan narrative. One nuance: the null-mainDomain `:80`
fallback emit site is not active in Mini PC runtime Caddyfile (mainDomain
IS configured), so live `@liv_subresource` count is 2 (apex + multi-user
subdomain) rather than 3 — all 3 emit sites covered in source + vitest.

## Auth gates encountered

None — all probes used loopback `127.0.0.1:3020` direct or external
unauthenticated HTTP. The `PUT /api/settings/client` mutation succeeded
without auth (likely because loopback origin is implicitly trusted by
AionUi's auth gate; same trust model Phase 234-04 used for the qr-token
mint flow).

## Operator action

**Single step:** Browser hard-reload (Ctrl+F5) on `https://bruce.livinity.io/`.

Expected post-reload state:
- Liv AI dock tile opens iframe
- Claude Code agent pre-selected (no "Aion CLI özel modelleri" banner)
- AionUi icons render (claude.svg, aion.svg, opencode-light.svg)
- Chat streams real-time over WebSocket (no manual reload needed)
- `wss://.../ws` succeeds (101 upgrade)
- `/api/conversations/.../mode|model` reachable

## Threat surface scan

Mitigation: Referer header is client-controlled and trivially spoofable.
A hostile origin could craft `Referer: https://attacker.com/liv/` and
reach `/api/auth/*` on AionUi backend. AionUi enforces its own auth gate
(qr-session cookie, Phase 234-04), so spoofed Referer alone grants no
privilege escalation — only routes traffic to a different backend
(AionUi vs livinityd). No new vector vs. the pre-236 state where
`/liv/api/*` was always reachable.

## Self-Check: PASSED

- [x] caddy.ts modified — `@liv_subresource` constant + 3 emit sites
- [x] caddy.test.ts modified — +12 Phase 236 assertions
- [x] 236-PLAN.md exists
- [x] 236-AGENT-FINDINGS.md exists
- [x] 236-DEPLOY-LOG.md exists
- [x] 236-SUMMARY.md exists (this file)
- [x] Commit `37a86aed` exists (feat caddy)
- [x] Commit `c76cdc6b` exists (docs investigation)
- [x] Pushed to origin/master
- [x] Mini PC deploy EXIT 0 + 6 services active
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED
- [x] External smoke 9/9 (or 10/10 with negative controls) GREEN
