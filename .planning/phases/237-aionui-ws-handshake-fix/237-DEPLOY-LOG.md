---
phase: 237-aionui-ws-handshake-fix
plan: 01
task: 2
type: deploy-log
created: 2026-05-27
deployed_sha: f6c784b7b7f1c71c99a582d567150d0e029915d1
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
mini_pc_target: bruce@10.69.31.68
ssh_sessions: 1 (single batched deploy + 11-step verify)
status: shipped
---

# Phase 237 Plan 01 Task 2 — Mini PC Deploy + Verification Log

Hot-fix continuation of Phase 236: WebSocket handshake (RFC 6455) does NOT
send Referer, so Phase 236's combined matcher missed the `wss://.../ws`
upgrade → chat streaming broken until manual page reload. Phase 237 splits
the matcher: `@liv_ws` unconditional + `@liv_api_subresource` referer-gated.

## Sequence

1. Pre-commit hook PASS on commit `f6c784b7` (sacred-sha verified 20 files)
2. `git push origin master` advanced `24c204a0..f6c784b7` (1 commit)
3. Single batched SSH session ran the full deploy + 11-step verification

## STEP 0 — Pre-deploy Caddyfile state

```
@liv_subresource (old, expect >0 from 236):  2
@liv_ws (new, expect 0 pre):                 0
@liv_api_subresource (new, expect 0 pre):    0
@liv path (expect 1 unchanged):              1
```

Delta proof: this deploy will replace the 2 combined Phase 236
`@liv_subresource` blocks with 2 `@liv_ws` + 2 `@liv_api_subresource` blocks.

## STEP 1 — `sudo bash /opt/livos/update.sh` EXIT 0

```
[OK]    liv-assistant.service already byte-identical
[OK]    Restarted livos-app-liv-ai (Next.js :3010)
[OK]    Restarted liv-claw-gateway (openclaw + plugin :18789)
[OK]    Restarted liv-assistant (AionUi WebUI :3020)
[OK]    liv-assistant /api/auth/status = 200/204 OK
[OK]    LivOS service running
[OK]    Liv-core service running
[OK]    liv-assistant service running
[OK]    Deployed SHA recorded: f6c784b
```

`Deployed SHA recorded: f6c784b` matches `origin/master` tip.

## STEP 2 — Post-deploy Caddyfile state

```
@liv_subresource (old, expect 0 post):       0
@liv_ws (new, expect >=2):                   2
@liv_api_subresource (new, expect >=2):      2
@liv path (expect 1 unchanged):              1
```

PRE → POST: Old `@liv_subresource` count 2 → **0** (combined matcher GONE).
New `@liv_ws` count 0 → **2** (apex `bruce.livinity.io` + multi-user
subdomain). New `@liv_api_subresource` count 0 → **2**. `@liv path` count
unchanged (Phase 226-04 baseline preserved).

Generated apex `@liv_ws` block:
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
```

No `header_regexp Referer` in `@liv_ws` (intentional — RFC 6455 browsers
do not send Referer on WS upgrade). `WS_TRANSPORT_BODY` (`flush_interval
-1` + `transport http versions 1.1`) intact for Phase 140-08 / Phase
226-04 WebSocket compatibility.

## STEP 3 — Services active (6/6)

```
caddy           active
livos           active
liv-core        active
liv-worker      active
liv-memory      active
liv-assistant   active
```

No service degradation. Caddy `caddy reload` (triggered inside livinityd
boot when `applyCaddyConfig` fired) succeeded with the new emit.

## STEP 4 — Sacred SHA non-regression

```
$ sudo sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts
62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe
```

Mini PC sha256 of the sacred file MATCHES Phase 235/236 canonical snapshot.
The pre-commit `[sacred-sha] PASS: 20 files verified` hook fired on the
Task 1 commit (`f6c784b7`).

Git SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED.

## STEP 5 — Local WS upgrade (NO Referer — RFC 6455 browser-realistic)

```
HTTP/1.1 101 Switching Protocols
Access-Control-Allow-Origin: *
Connection: upgrade
Sec-WebSocket-Accept: cGm2TjBe8wgJxfP+nRapgz04UKY=
Upgrade: websocket
```

**HTTP 101 Switching Protocols** — the fix proof. Browser-realistic curl
(Origin header only, NO Referer per RFC 6455) successfully upgrades. Phase
236's combined matcher would have failed this exact same request (it required
Referer matching). Chat streaming will now work without page reload.

## STEP 6 — Local /api/* WITH Referer=/liv/ (Phase 236 non-regression)

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
```

`/api/assets/logos/ai-major/claude.svg` with `Referer: https://bruce.livinity.io/liv/`
→ 200 OK. Phase 236 asset-routing preserved by `@liv_api_subresource`.

## STEP 7 — Local /api/* WITHOUT Referer (negative — collateral guard)

```
HTTP/1.1 404 Not Found
```

Same path WITHOUT Referer falls through to the `:8080` livinityd catch-all
(404 — no such route on livinityd). Proves the `@liv_api_subresource`
referer-gate IS still correctly scoped — LivOS-shell apex `/api/*` traffic
is NOT collateral-routed to AionUi.

## STEP 8 — Local /liv-login (Phase 234 non-regression)

```
HTTP/1.1 302 Found
```

Auto-login bridge intact.

## STEP 9 — Local / (LivOS shell)

```
HTTP/1.1 200 OK
```

Shell apex unaffected.

## STEP 10 — Local /liv/api/auth/status (Phase 235 non-regression)

```
HTTP/1.1 200 OK
```

Phase 235 path-rewrite path still works.

## STEP 11 — Deployed SHA

```
f6c784b7b7f1c71c99a582d567150d0e029915d1
```

Matches `origin/master` HEAD post-push.

## External smoke (orchestrator → Cloudflare → Server5 relay → Mini PC tunnel)

| # | Test | Result | Verdict |
|---|------|--------|---------|
| EXT-1 | WS upgrade **WITHOUT Referer** (Origin only) | **HTTP 101 Switching Protocols** + valid `Sec-Websocket-Accept` | **FIXED** (Phase 236 would have 502'd) |
| EXT-2 | `/api/assets/logos/ai-major/claude.svg` (Referer=/liv/) | **HTTP 200** + `image/svg+xml` + 1697 bytes | NO REGRESSION (Phase 236) |
| EXT-3 | `/` (LivOS shell) | **HTTP 200** + `text/html` | NO REGRESSION |
| EXT-4 | `/liv/api/auth/status` | **HTTP 200** + `application/json` | NO REGRESSION (Phase 235) |

EXT-1 is the operator-blocking probe — Phase 236 EXT-4 falsely passed
because it used `-H "Referer: .../liv/"` explicitly. Phase 237 EXT-1
removes the Referer to mirror the actual browser behavior, and now sees
HTTP 101. Operator chat streaming will work on hard-reload.

## Success criteria verdict

| SC | Description | Verdict |
|----|-------------|---------|
| SC-01 | `caddy.ts` emits separated `@liv_ws` + `@liv_api_subresource` matchers in 3 site blocks | **PASS** (2 active in live Caddyfile — null-fallback inactive because mainDomain configured) |
| SC-02 | `caddy.test.ts` new assertions PASS; full suite GREEN | **PASS** (74/74, was 72/72) |
| SC-03 | livinityd typecheck baseline preserved | **PASS** (zero NEW caddy.ts/caddy.test.ts errors; 2 pre-existing baseline errors at lines 696/706 confirmed same as Phase 236) |
| SC-04 | UI build PASS | **PASS** (33.46s clean) |
| SC-05 | Mini PC `update.sh` EXIT 0 + 6/6 services active | **PASS** |
| SC-06 | External WS upgrade (Origin only, no Referer) → HTTP 101 | **PASS** (EXT-1) |
| SC-07 | External `/api/assets/...` (Referer=/liv/) → HTTP 200 | **PASS** (EXT-2) |
| SC-08 | External LivOS shell `/` HTTP 200 | **PASS** (EXT-3) |
| SC-09 | `/liv-login` 302 non-regression | **PASS** (STEP 8) |
| SC-10 | `/liv/api/auth/status` 200 non-regression | **PASS** (STEP 10 + EXT-4) |
| SC-11 | Sacred SHA UNCHANGED | **PASS** (SHA-256 match + git SHA + pre-commit hook) |
| SC-12 | 3 atomic commits pushed to origin/master | **IN PROGRESS** (Task 1 commit `f6c784b7` pushed; Task 2 + Task 3 commits pending this doc) |

**12/12 SCs achievable — all gates GREEN on automated evidence.**

## Deviations

**Zero deviations** — plan executed exactly as written.

One minor cosmetic observation: the in-shell `grep -A 14 '@liv_api_subresource \{'`
sample in STEP 2 emitted "Unmatched \{" (BSD vs GNU regex literal handling
in awk-piped-to-grep). The Caddyfile itself is valid — proven by the `caddy
reload` succeeding (STEP 3 caddy=active) and by EXT-1+EXT-2 returning the
expected responses. Not a deploy issue.

## Rollback procedure

If the split matcher causes unexpected behavior:

1. Revert commit on repo: `git revert f6c784b7`
2. Push: `git push origin master`
3. On Mini PC: `sudo bash /opt/livos/update.sh` — livinityd regenerates
   Caddyfile with Phase 236's combined `@liv_subresource` block; `caddy
   reload` removes the new pair
4. Chat streaming will re-break (since RFC 6455 still applies); operator
   would again need to reload page per response
5. All Phase 234/235/236 non-WS state preserved

## Operator action

**Single step:** Browser hard-reload (Ctrl+F5) on `https://bruce.livinity.io/`,
open Liv AI window. Chat should now stream in real-time (no more "ben
chatden ayrildiktan sonra yazi geliyor").

## Sacred SHA invariant

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical across:
1. Repo pre-push
2. Mini PC SHA-256 (`62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`)
3. Pre-commit hook PASS on `f6c784b7`

D-V42-SACRED invariant HOLDS.

## SSH discipline

ONE batched SSH session for the deploy + 11-step verify protocol (well within
fail2ban tolerance per `feedback_ssh_rate_limit`). Plus orchestrator-local
external curl probes (no additional SSH).
