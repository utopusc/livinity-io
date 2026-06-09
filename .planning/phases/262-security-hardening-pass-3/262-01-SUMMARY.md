---
phase: 262-security-hardening-pass-3
plan: "01"
subsystem: auth
tags: [caddy, forward_auth, jwt, jti-revocation, express, aionui, systemd, vitest]

# Dependency graph
requires:
  - phase: 256-security-hardening-contained-autonomy
    provides: "256-04 forward_auth gate pattern (gatedHandleBody) + /auth/verify endpoint + fail-closed auth posture"
  - phase: 257-security-hardening-pass-2
    provides: "257-04 jti session-revocation DAO (isSessionRevoked/createSession) + is-authenticated revocation pattern"
  - phase: 259
    provides: "/__livos_sso + /__livos_auth cross-subdomain SSO bounce these endpoints harden"
provides:
  - "forward_auth gate (LIV_GATE_BODY) over the ENTIRE /liv Caddy family: @liv, @liv_ws, @liv_api_subresource, @livos_terminal_ws, @liv_login"
  - "/liv/trpc -> :8080 Caddy bridge REMOVED (LIVOS-054 load-bearing mitigation)"
  - "path-prefix @liv_api_subresource matcher (path /liv/api/* + strip) replacing the spoofable Referer regexp (LIVOS-047)"
  - "Server.verifySessionFull — jti revocation + active-user re-check for HTTP auth surfaces (mirrors tRPC isAuthenticated)"
  - "session-gated GET /liv-login (401 + zero qr-mint traffic without a verified LIVINITY_SESSION) (LIVOS-041)"
  - "revocation-checked /auth/verify + /__livos_sso; /__livos_auth sessions recorded via createSession (revocable)"
  - "apexSessionGate — fail-closed apex middleware with explicit APEX_PUBLIC_PREFIXES allowlist (LIVOS-053)"
  - "systemd liv-assistant: AIONUI_ALLOW_REMOTE=0 loopback pin + ExecStartPost non-loopback :3020 fail-stop (LIVOS-049)"
affects: [262-02, 262-03, 262-04, 262-05, liv-assistant, caddy, sso, multi-user]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LIV_GATE_BODY: module-level forward_auth constant with Caddy placeholders (relative /login redirect) for config-less handles"
    - "verifySessionFull: single full-validation choke point for every HTTP auth surface (forward_auth target, SSO, apex gate)"
    - "apex fail-closed: explicit allowlist + catch->401, never next() on error"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts
    - livos/packages/livinityd/source/modules/server/liv-login-handler.ts
    - livos/packages/livinityd/source/modules/server/liv-login-handler.test.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/source/index.ts
    - systemd/liv-assistant.service

key-decisions:
  - "AIONUI_ALLOW_REMOTE=0 chosen as the DIRECT :3020 bind control: upstream probe (iOfficeAI/AionUi web-cli/web-host source) shows NO --host flag exists; bind is `allowRemote ? '0.0.0.0' : '127.0.0.1'` and AIONUI_ALLOW_REMOTE short-circuits before AIONUI_REMOTE"
  - "/api/webhooks/ added to APEX_PUBLIC_PREFIXES (deviation Rule 2): the GitOps webhook's HMAC-SHA256 signature IS its auth; GitHub POSTs carry no session cookie"
  - "/api/gmail deliberately NOT allowlisted: the Google OAuth callback rides the operator's browser, which carries the apex LIVINITY_SESSION cookie"
  - "verifySessionFull skips the active-user lookup when getPool() is null (single-user no-DB path holds only legacy no-userId tokens), and rejects ONLY explicitly-revoked jti rows (257-04.1 no-false-revoke invariant via isSessionRevoked)"

patterns-established:
  - "LIV_GATE_BODY: emit forward_auth as the FIRST directive inside every /liv-family handle; LivOS-owned @webapp_stream_ws carve-out stays ungated"
  - "APEX_PUBLIC_PREFIXES: every allowlist entry carries an in-comment justification (LIVOS-053 residual-risk discipline)"

requirements-completed: [LIVOS-041, LIVOS-047, LIVOS-049, LIVOS-053, LIVOS-054]

# Metrics
duration: 19min
completed: 2026-06-09
---

# Phase 262 Plan 01: Close the /liv AionUi Unauthenticated Front Door Summary

**forward_auth over the whole /liv Caddy family + session-gated /liv-login + jti-revocation at every HTTP auth surface + apex fail-closed gate + aionui-web loopback pin — LIVOS-041/047/049/053/054 closed at code level**

## Performance

- **Duration:** 19 min
- **Started:** 2026-06-09T20:50:58Z
- **Completed:** 2026-06-09T21:10:06Z
- **Tasks:** 3 (Task 2 TDD: RED + GREEN commits)
- **Files modified:** 7

## Accomplishments

- **LIVOS-041 (Critical) closed with two stacked gates:** Caddy-layer `LIV_GATE_BODY` forward_auth (-> livinityd `/auth/verify`) emitted FIRST inside `@liv`, `@liv_ws`, `@liv_api_subresource`, `@livos_terminal_ws`, and the NEW `@liv_login` handle at all three emit sites; PLUS an Express-side session gate in `makeLivLoginHandler` that 401s (zero qr-mint fetches, zero Set-Cookie, zero redirect) without a `LIVINITY_SESSION` that passes full validation. The AionUi qr-mint endpoints are no longer reachable unauthenticated through any path.
- **LIVOS-054:** the `@liv_trpc` `/liv/trpc/* -> :8080` bridge is DELETED — the framed same-origin AionUi SPA can no longer drive LivOS tRPC with the operator cookie auto-attached.
- **LIVOS-047:** the client-spoofable `header_regexp Referer` matcher is gone; `@liv_api_subresource` is now `path /liv/api/*` + `uri strip_prefix /liv` (and rides forward_auth like every sibling).
- **Cross-surface revocation gap:** new `Server.verifySessionFull` replicates the tRPC `isAuthenticated` jti-revocation + active-user re-check for `/auth/verify` (the single forward_auth choke point — transitively hardens ALL 256-04 app/native gates + the new /liv gates) and `/__livos_sso`; `/__livos_auth` now records its minted jti via `createSession` so the 30-day SSO cookie is revocable.
- **LIVOS-053:** `apexSessionGate` middleware — apex host requests are fail-closed behind the explicit `APEX_PUBLIC_PREFIXES` allowlist (each entry justified in-comment; `/liv-login` + `/liv` deliberately absent); GET+text/html gets `302 /login?redirect=...`, everything else `401`; internal errors respond 401, never `next()`.
- **LIVOS-049 (code portion):** `AIONUI_ALLOW_REMOTE=0` pinned in the systemd unit (probe-backed direct bind control) + `ExecStartPost` assertion that fail-stops `liv-assistant` if `:3020` ever binds non-loopback.
- **Tests:** caddy.test.ts 114/114 (incl. new Phase 262-01 suite: gate-inside-handle order assertions, bridge/Referer negative greps, ungated `@webapp_stream_ws` carve-out check); liv-login-handler.test.ts 9/9 (3 new RED->GREEN gate tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: caddy.ts forward_auth family gate + bridge/Referer removal** - `b3267493` (feat)
2. **Task 2 RED: failing session-gate tests for /liv-login** - `8fb779e0` (test)
3. **Task 2 GREEN: gated handler + verifySessionFull + revocation-checked endpoints** - `8eb76653` (feat)
4. **Task 3: apex fail-closed gate + aionui-web loopback pin** - `782f1a96` (feat)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/domain/caddy.ts` - LIV_GATE_BODY + LIV_LOGIN_HANDLE constants; gated @liv/@liv_ws/@liv_api_subresource/@livos_terminal_ws; @liv_trpc bridge + Referer matcher removed; threat-model comments updated
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` - Phase 237 assertions updated to the path-prefix matcher; new Phase 262-01 describe (12 tests)
- `livos/packages/livinityd/source/modules/server/liv-login-handler.ts` - factory takes `verifySession`; 401 path BEFORE the try body so the catch-all /liv/ redirect never fires unauthenticated
- `livos/packages/livinityd/source/modules/server/liv-login-handler.test.ts` - RED->GREEN gate tests (7-9) + auth-stubbed existing tests (1-6)
- `livos/packages/livinityd/source/modules/server/index.ts` - `verifySessionFull` method; `/auth/verify` + `/__livos_sso` upgraded; `/__livos_auth` createSession; `APEX_PUBLIC_PREFIXES` + `apexSessionGate` middleware
- `livos/packages/livinityd/source/index.ts` - /liv-login mount wires `verifySessionFull` into the handler
- `systemd/liv-assistant.service` - `AIONUI_ALLOW_REMOTE=0` (after EnvironmentFile so it wins over env drift) + ExecStartPost non-loopback fail-stop

## Decisions Made

- **:3020 bind probe result (Task 3, evidence-backed):** upstream `iOfficeAI/AionUi` `packages/web-cli/src/index.ts` + `packages/web-host/src/static-server.ts` (fetched 2026-06-09) show the CLI has **no `--host` flag**; the bind is binary — `host = allowRemote ? '0.0.0.0' : '127.0.0.1'` where `allowRemote` comes from `--remote` (absent from our ExecStart) or `AIONUI_ALLOW_REMOTE`/`AIONUI_REMOTE` env. So the DIRECT control is `Environment="AIONUI_ALLOW_REMOTE=0"` placed AFTER `EnvironmentFile=-/opt/livos/.env` (systemd later-wins; `resolveAllowRemote` short-circuits on `AIONUI_ALLOW_REMOTE` before consulting `AIONUI_REMOTE`). The live verifier note (`ss` shows `127.0.0.1:3020`) corroborates the compiled default; the ExecStartPost assertion is the drift backstop for future AionUi bumps.
- **verifySessionFull pool semantics:** active-user lookup runs only when `getPool()` is non-null (the single-user no-DB path only ever holds legacy no-userId tokens, mirroring is-authenticated's pool-guard); revocation rejects ONLY an explicitly-revoked row (`isSessionRevoked` — a missing row admits, per the 257-04.1 false-revoke-lockout invariant); any internal error returns null (fail closed).
- **`/api/gmail` NOT allowlisted on the apex:** the Google OAuth callback arrives via the operator's browser, which carries the apex session cookie; a logged-out callback now bounces to /login — acceptable, the connect flow starts logged-in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `/api/webhooks/` added to APEX_PUBLIC_PREFIXES**
- **Found during:** Task 3 (apex fail-closed gate)
- **Issue:** The plan's allowlist omitted the GitOps webhook (`POST /api/webhooks/git/:stackName`). GitHub POSTs carry no session cookie; the gate would have silently broken deploy-on-push. The route is self-authenticating (HMAC-SHA256 `X-Hub-Signature-256` verified with `crypto.timingSafeEqual` — "Security model IS the HMAC" per the route's own comment), making it the exact same allowlist class as the plan's `/api/mcp` (own LIVINITY_PROXY_TOKEN check).
- **Fix:** Added `'/api/webhooks/'` with an in-comment justification.
- **Files modified:** `livos/packages/livinityd/source/modules/server/index.ts`
- **Verification:** tests green; entry documented in the allowlist comment block
- **Committed in:** `782f1a96` (Task 3 commit)

**2. [Plan-sanctioned] `@liv_trpc`-token scrub in the removal comment**
- **Found during:** Task 1 acceptance check (`grep -c '@liv_trpc' caddy.ts` must be 0)
- **Issue:** my first removal comment itself contained the literal token.
- **Fix:** reworded the comment ("the legacy /liv/trpc bridge matcher+handle").
- **Committed in:** `b3267493`

---

**Total deviations:** 1 auto-fixed (Rule 2) + 1 cosmetic comment scrub
**Impact on plan:** The webhook allowlist entry preserves existing HMAC-authenticated functionality without weakening the gate. No scope creep.

## Expected Breakage (LOCKED bridge-removal decision)

In-repo consumers of the removed `/liv/trpc/*` bridge (Task 3 sanity-grep; per the LOCKED decision these are **expected breakage**, the bridge was NOT re-added):
- `scripts/aionui-patches/local-agents-install-section.js:81` — `TRPC_BASE = '/liv/trpc/cliInstaller'` (the AionUi-bundle Local Agents install section's detect/install/auth calls now 404 at Caddy). The framed SPA losing tRPC reach is the point of LIVOS-054.
- `scripts/install/mode-tunnel.sh:356-359` — the STATIC installer Caddyfile emits its own `@liv_trpc` block. Out of this plan's `files_modified` (installer scripts are not WS1-owned); livinityd's first `reloadCaddy()` regen overwrites the static file with the hardened emit, but a fresh tunnel-mode install carries the bridge until that first regen. **Cross-plan note for 262-05/verifier:** consider scrubbing the static block in the plan that owns `scripts/install/`.
- `scripts/install-liv-assistant.sh:341` — comment-only reference (no functional consumer).
- `livos/packages/ui/src` — zero hits.

## Issues Encountered

None beyond the above. Pre-existing tsc baseline confirmed unchanged: livinityd `npx tsc --noEmit` total 399 errors before and after Task 3; zero errors in any edited region (the 2 `caddy.test.ts(696/706)` TS2345s sit in the untouched Phase 231 fixtures block, verified identical to commit `22695c98`).

## User Setup Required

None in-repo. Operator (WS6, out-of-band per CONTEXT Deferred): deploy via `update.sh`, UFW-deny 3020, live walk of the WS1 success criteria (curl /liv-login unauthenticated -> 401, /liv | /ws | /liv/api/* -> 401/redirect, revoked session rejected at /auth/verify).

## Next Phase Readiness

- WS1 complete at code level; 262-02 (native installer), 262-03, 262-04, 262-05 are unblocked (no shared-file contention with this plan's edits except `apps/routes.ts`-adjacent plans, which this plan did not touch).
- The `apexSessionGate` + `verifySessionFull` are now the reference patterns for any future HTTP auth surface.
- Working tree carries pre-execution plan-checker amendments to `262-03-PLAN.md`/`262-04-PLAN.md` (left uncommitted — owned by those plans' executors).

---
*Phase: 262-security-hardening-pass-3*
*Completed: 2026-06-09*

## Self-Check: PASSED

All 7 modified files + SUMMARY exist on disk; all 4 task commits (b3267493, 8fb779e0, 8eb76653, 782f1a96) present in git log. Acceptance greps: header_regexp Referer = 0, @liv_trpc = 0 in caddy.ts. Tests 123/123 green; tsc baseline unchanged (399 pre/post, zero errors in edited regions).
