---
phase: 236-aionui-ws-assets-agent-fix
plan: 01
task: 3
type: deploy-log
created: 2026-05-27
deployed_sha: c76cdc6b
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
mini_pc_target: bruce@10.69.31.68
ssh_sessions: 1 (single batched deploy+verify, fail2ban discipline)
status: shipped
---

# Phase 236 Plan 01 Task 3 — Mini PC Deploy + Verification Log

Operator hot-fix shipped LIVE in response to live-browser console errors
post-Phase 235 deploy.

## Sequence

1. Pre-commit hook PASS on commits `37a86aed` (feat caddy) + `c76cdc6b` (docs)
2. `git push origin master` advanced `5ba2a568..c76cdc6b` (2 commits)
3. Single batched SSH session ran the full deploy + verification protocol

## STEP 1 — Pre-deploy Caddyfile state

```
@liv_subresource count pre:  0
@liv path count pre:         1
```

Phase 235 Caddyfile had ZERO `@liv_subresource` blocks (the new constant
this phase adds) and exactly ONE `@liv path` block (Phase 226-04 baseline).
Delta proof: this deploy is NOT a no-op.

## STEP 2 — `sudo bash /opt/livos/update.sh` EXIT 0

Key output lines:
```
[OK]    liv-assistant.service already byte-identical
[OK]    Restarted livos-app-liv-ai (Next.js :3010)
[OK]    Restarted liv-claw-gateway (openclaw + plugin :18789)
[OK]    Restarted liv-assistant (AionUi WebUI :3020)
[INFO]  Probing http://127.0.0.1:3020/api/auth/status (5s timeout)...
[OK]    liv-assistant /api/auth/status = 200/204 OK
[OK]    liv-assistant credentials capture step ran (no-op if already captured)
[OK]    LivOS service running
[OK]    Liv-core service running
[OK]    liv-assistant service running

━━━ Recording deployed SHA ━━━
[OK]    Deployed SHA recorded: c76cdc6
━━━ Cleanup ━━━
[OK]    Temp files cleaned
  LivOS updated successfully!
```

`Deployed SHA recorded: c76cdc6` matches `origin/master` tip.

Note: liv-claw-gateway was restarted by update.sh even though Phase 231
masked the service — restart is a no-op because the systemd mask is a
`/dev/null` symlink. Not a regression.

## STEP 3 — Post-deploy Caddyfile state

```
@liv_subresource count post: 2
@liv path count post:        1
```

PRE → POST: `@liv_subresource` 0 → **2** (apex `bruce.livinity.io` block +
multi-user subdomain block; null-mainDomain :80 fallback is NOT emitted
because mainDomain IS configured). `@liv path` count unchanged (1 — Phase
226-04 invariant preserved). Delta proves Plan 01 patch is LIVE.

Generated block sample (apex `bruce.livinity.io`):
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
		transport http {
			versions 1.1
		}
		}
		…
```

`flush_interval -1` + `transport http versions 1.1` came from
`WS_TRANSPORT_BODY` (Phase 140-08 + Phase 226-04 WebSocket pattern).
Header strip + frame-ancestors CSP intact.

## STEP 4 — Services active (6/6)

```
caddy                active
livos                active
liv-core             active
liv-worker           active
liv-memory           active
liv-assistant        active
```

No service degradation. Caddy `caddy reload` (triggered inside livinityd
boot when applyCaddyConfig fired) succeeded with the new emit.

## STEP 5 — Sacred SHA non-regression

```
$ sudo sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts
62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe
```

Mini PC sha256 of the sacred file MATCHES the canonical pre/post Phase 235
snapshot. The pre-commit `[sacred-sha] PASS: 20 files verified` hook fired
on both Task 1 + Task 2 commits.

Git SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (the SHA
here is the SHA-1 git blob hash; STEP 5 captures the SHA-256 of the same
file content — both verify D-V42-SACRED).

## STEP 6 — Default-agent setting persisted (Task 2 carry-over)

```
guid.lastSelectedAgent = '2d23ff1c'
```

The `PUT /api/settings/client` mutation from Task 2 (Claude Code default)
SURVIVED the liv-assistant restart triggered by update.sh. The SQLite
write to `/opt/liv-assistant/data/aionui-backend.db` persisted across the
process bounce. Operator's next browser load WILL land on Claude Code.

## External smoke (orchestrator → Cloudflare → Server5 relay → Mini PC tunnel)

| # | Test | Result | Verdict |
|---|------|--------|---------|
| EXT-1 | `GET /api/assets/logos/ai-major/claude.svg` (Referer=`/liv/`) | **HTTP 200** + `image/svg+xml` + 1697 bytes | **FIXED** (was 404) |
| EXT-2 | `GET /api/settings/client` (Referer=`/liv/`) | **HTTP 200** + `application/json` + 4711 bytes + `frame-ancestors` CSP | **FIXED** (was 404) |
| EXT-3 | `GET /api/auth/status` (Referer=`/liv/`) | **HTTP 200** + JSON 76 bytes | **WORKS** |
| EXT-4 | `Upgrade: websocket` `/ws` (Referer=`/liv/`) | **HTTP 101 Switching Protocols** + valid `Sec-Websocket-Accept` | **FIXED** (was hanging fail) |
| EXT-5 | `GET /` (no Referer; LivOS shell apex) | **HTTP 200** + `text/html` | NO REGRESSION |
| EXT-6 | `GET /app-store` | **HTTP 200** + `text/html` | NO REGRESSION |
| EXT-7 | `GET /liv/api/auth/status` (Phase 235 path-rewrite verify) | **HTTP 200** | NO REGRESSION (Phase 235) |
| EXT-8 | `GET /liv/` (iframe HTML, Phase 226-04 verify) | **HTTP 200** + `text/html` + `frame-ancestors 'self' https://bruce.livinity.io` CSP | NO REGRESSION (Phase 226-04) |
| EXT-9 | `GET /api/auth/status` **WITHOUT** `/liv/` Referer (negative control) | **HTTP 404** (catch-all on livinityd :8080; AionUi route NOT reached) | **CORRECT** (Referer-gate working) |
| EXT-4b | `/ws` **WITHOUT** `/liv/` Referer (negative control) | **HTTP 502** (livinityd has no `/ws` route) | **CORRECT** (Referer-gate working) |

EXT-1 + EXT-2 + EXT-4 prove all 3 operator-reported browser console errors
are FIXED. EXT-9 + EXT-4b prove the Referer-gated matcher is correctly
scoped — root-relative LivOS-shell `/api/*` traffic is NOT diverted to
AionUi (preserving livinityd's own routes).

EXT-4 detail (101 response headers):
```
HTTP/1.1 101 Switching Protocols
Connection: upgrade
Sec-Websocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Upgrade: websocket
Content-Security-Policy: frame-ancestors 'self' https://bruce.livinity.io
```

The CF-injected `X-Frame-Options: DENY` in the 101 response is upstream
CF edge metadata for WS upgrades and is irrelevant to iframe document
load (XFO only applies to HTML responses; EXT-8 confirms our XFO strip
is intact on the actual iframe HTML).

## Success criteria verdict

| SC | Description | Verdict |
|----|-------------|---------|
| SC-01 | `caddy.ts` emits `@liv_subresource` in 3 site blocks | **PASS** (2 active on Mini PC; null-fallback only fires when no mainDomain — not applicable here) |
| SC-02 | `caddy.test.ts` new assertions PASS; full suite GREEN | **PASS** (72/72, was 60/60) |
| SC-03 | livinityd typecheck baseline preserved | **PASS** (zero new errors; 2 pre-existing errors at test.ts:696/706 baseline-confirmed via stash-pop) |
| SC-04 | update.sh EXIT 0 + 6/6 services active | **PASS** |
| SC-05 | External WS upgrade (Referer=/liv/) → HTTP 101 | **PASS** (EXT-4) |
| SC-06 | External `/api/assets/...` (Referer=/liv/) → HTTP 200 | **PASS** (EXT-1) |
| SC-07 | External LivOS shell `/` + `/app-store` HTTP 200 | **PASS** (EXT-5+EXT-6) |
| SC-08 | External `/liv/api/auth/status` HTTP 200 | **PASS** (EXT-7 Phase 235 non-regression) |
| SC-09 | Sacred SHA UNCHANGED | **PASS** (SHA-256 + SHA-1 + pre-commit hook × 2) |
| SC-10 | AGENT-FINDINGS documents Claude Code default approach | **PASS** + LIVE flip executed |
| SC-11 | DEPLOY-LOG + SUMMARY + STATE + ROADMAP committed | **IN PROGRESS** (this doc + SUMMARY pending) |
| SC-12 | Pushed to origin/master | **PASS** (5ba2a568..c76cdc6b) |

**12/12 SCs achievable — all gates GREEN on automated evidence.**

## Deviations

**Zero deviations** — plan executed exactly as written. The only nuance
is that the null-mainDomain `:80` fallback block (one of the 3 emit sites
in source) is NOT active in Mini PC's runtime Caddyfile because mainDomain
IS configured (`bruce.livinity.io`). All 3 site blocks ARE asserted in
the vitest suite, but live Caddyfile shows only 2 (apex + multi-user
subdomain) — the source emit covers all 3, the runtime active subset is 2.

## Rollback procedure

If the Referer-gated handle causes any unexpected behavior (e.g.
overly-broad path matching, malicious Referer-spoofing concerns surface):

1. Revert commit on repo: `git revert 37a86aed` (Caddy patch)
2. Push: `git push origin master`
3. On Mini PC: `sudo bash /opt/livos/update.sh` — livinityd regenerates
   Caddyfile WITHOUT the `@liv_subresource` block; `caddy reload` removes
   the rule
4. Phase 235 path-rewrite remains intact (different commit lineage)
5. The default-agent flip persists (Task 2 PUT was a data-plane mutation,
   independent of Caddy)

To rollback ONLY the default-agent flip:
```
ssh -i pem/minipc bruce@10.69.31.68 \
  'curl -s -X PUT -H "Content-Type: application/json" \
   -d "{\"guid.lastSelectedAgent\":\"aionrs\"}" \
   http://127.0.0.1:3020/api/settings/client'
```

## Operator action

**Single step:** Browser hard-reload (Ctrl+F5) on `https://bruce.livinity.io/`.

Expected post-reload state:
- Liv AI dock tile clickable
- Iframe loads with Claude Code agent pre-selected
- AionUi icons visible (Aion, Claude, OpenCode logos no longer blank)
- Chat streams responses in real-time via WebSocket (no more "must reload to see")
- AionUi "Şu anda yalnızca Aion CLI" banner GONE

## Sacred SHA invariant

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical across:
1. Repo pre-push (`git ls-files -s liv/packages/core/src/sdk-agent-runner.ts`)
2. Mini PC SHA-256 (`62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`)
3. Pre-commit hook PASS × 2 commits (`37a86aed`, `c76cdc6b`)
4. Post-deploy repo verify (same as #1)

D-V42-SACRED invariant HOLDS.

## SSH discipline

ONE batched SSH session for the deploy + verify protocol (well within
fail2ban tolerance per `feedback_ssh_rate_limit`). Plus the Task 2
two prior batched sessions (probe inventory + write probe). Total Phase
236 SSH session count: **3**.

## HARD RULE 2026-04-27 compliance

Mini PC ONLY (`bruce@10.69.31.68`). Server4 NOT contacted. Server5
contacted ONLY as the unavoidable relay path for external curls
(`bruce.livinity.io` DNS → CF → Server5 → tunnel → Mini PC). No direct
Server5 SSH, no Server5-side file mutation.
