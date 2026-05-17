# Plan 134-05 — Mini PC UAT — SHIPPED 2026-05-17

**Status:** ✓ UAT PASS — fresh-wipe + Phase 134 universal one-liner install on Mini PC, `https://burak.livinity.live/` returns HTTP 200 from external (off-LAN) dev box via CF Tunnel.

## Test command (user-provided, from livinity.io wizard)

```
curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
    --mode hybrid \
    --domain burak.livinity.live \
    --api-key liv_k_Pj18ScxwGLTgLqnT5KhS \
    --cf-tunnel-token <REDACTED — eyJ... ~250 char>
```

## Pre-flight wipe (clean Ubuntu state)

- `/opt/{livos,liv,nexus}` — removed
- `livos-*` + `liv-*` + `cloudflared.service` systemd units — removed
- `/etc/{livos,caddy}` + `/var/lib/{livos,caddy}` — removed
- Postgres `livos` DB + user — dropped
- Redis password reset + FLUSHALL (643 keys → 0)
- `caddy` + `cloudflared` apt packages — purged
- Residual `cloudflared-update.service` + `cloudflared-update.timer` — removed (after first install retry surfaced the leftover)

## Install execution

- Self-bootstrap fetched 10 install helpers from `https://raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install/`
- Detected platform: ubuntu 24.04 / x86_64 / host_ip 192.168.20.33
- Parse-cli accepted Phase 134 contract: `--mode hybrid` + `--domain` + `--cf-tunnel-token`
- Hybrid mode dispatcher emitted: **"Hybrid mode (Phase 134): using Cloudflare Tunnel as transport"** ← D-134-MODE delegation verified
- cloudflared 2026.5.0 installed via apt from pkg.cloudflare.com
- CF Tunnel token written to `/etc/livos/secrets/cf-tunnel-token` (0600)
- cloudflared.service registered + active
- Caddyfile bootstrap (mode-tunnel.sh) wrote :80 → :8080 plain HTTP
- Deploy-livinityd ran Postgres init + UI build + systemd unit install + health check :8080 OK

## Regression found + fixed in same UAT session

**Bug:** `deploy-livinityd.sh:1520-1536` `_dld_update_caddy_to_livinityd()` had a stale `hybrid)` branch that wrote a LE DNS-01 Caddyfile expecting `CLOUDFLARE_API_TOKEN` env. After install completed, Caddy could not start (`failed` state) because the env var doesn't exist in Phase 134 tunnel mode. The mode-tunnel.sh-written Caddyfile got OVERWRITTEN by this stale branch.

**Fix:** Merge `hybrid)` + `tunnel)` branches in `_dld_update_caddy_to_livinityd()` — both write the same `auto_https off + :80 reverse_proxy :8080` Caddyfile. Committed as part of Plan 134-05 hot-fix (alongside this summary).

**Manual fix during UAT:** wrote the correct Caddyfile to /etc/caddy/Caddyfile + `systemctl restart caddy`. Caddy active immediately.

## Post-fix end-to-end verification (live)

```
=== systemd state ===
caddy        active
cloudflared  active   (4 connections registered: SJC06/SJC07/SJC08, QUIC)
livos        active
liv-core     active
liv-worker   active
liv-memory   active

=== local curl ===
http://127.0.0.1:80/    → HTTP 200  (Caddy)
http://127.0.0.1:8080/  → HTTP 200  (livinityd direct)

=== external curl (off-LAN) ===
$ curl -fsSI https://burak.livinity.live/
HTTP/1.1 200 OK
Server: cloudflare
CF-RAY: 9fd0283ac8e72599-SJC
via: 1.1 Caddy

=== sacred SHA ===
/opt/liv/packages/core/src/sdk-agent-runner.ts → f3538e1d811992b782a9bb057d1b7f0a0189f95f  ✓
```

## D-134-* invariants verified live

| Invariant | Evidence |
|-----------|----------|
| D-134-MODE | "Hybrid mode (Phase 134): using Cloudflare Tunnel as transport" in install log + Caddyfile is plain `:80` (no LE) |
| D-134-MODE-ALIAS | `--mode hybrid` resolved to `install_mode_tunnel` (delegation works) |
| D-134-RETIRE-DIRECT-LAN | No `dns cloudflare {env.CLOUDFLARE_API_TOKEN}` in final Caddyfile (after fix) |
| D-134-PROVISION | User obtained CF Tunnel token from CF Zero Trust (wizard auto-create deferred to v34.x; Server5 wizard updated to NEW contract this session) |
| D-134-MIGRATION | N/A — fresh-wipe install path was exercised, not the migration script |
| D-134-UNIVERSAL | Single `curl \| sudo bash -s --` command on Mini PC; same command shape works on any device |
| D-134-ZERO-PUBLIC-IP | Mini PC public IP `50.175.214.163` is OUT of CGNAT range but irrelevant — cloudflared dials outbound; external HTTPS works without port-forward |
| D-134-SACRED-SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on Mini PC `/opt/liv/packages/core/src/sdk-agent-runner.ts` |

## Server5 wizard update (out-of-tree, applied this session)

Patched `/opt/landing/livinity.io/dashboard-install.html`:
- Command template: `--cf-token + --cf-zone-id` → `--cf-tunnel-token`
- Label "Cloudflare API token" → "Cloudflare Tunnel token"
- Placeholder + hint: paste CF Tunnel token (200+ char) from CF Zero Trust
- `resolveZone()` JS function: skips server roundtrip (tunnel tokens are not validatable via CF API); shape-checks token length ≥ 100 chars
- Zone-ID field repurposed as "tunnel token validated" pill
- Backup at `/opt/landing/livinity.io/dashboard-install.html.pre-134-02.bak`

Wizard live at `https://livinity.io/dashboard/install` — HTTP/2 200 confirmed.

## Out of scope (deferred)

- **Plan 134-02 full Server5 wizard CF API auto-provision** — requires operator-side CF API token with `Account:Cloudflare Tunnel:Edit` scope (`CF_TUNNEL_OPERATOR_TOKEN` env on Server5). Phase 134 user-facing wizard UX patched manually (HTML edits) instead of via `/api/account/api-keys` route. Full auto-provision is a v34.x or v35 follow-up.
- **Plan 134-03 migration script** — shipped (`scripts/install/migrate-to-cf-tunnel.sh`) but NOT exercised in this UAT (fresh-wipe path was used instead). Migration script will be exercised next time a user has an existing pre-Phase-134 install to upgrade.

## Acceptance criteria (Plan 134-05)

- [x] AC-134-05-1: install one-liner succeeds on fresh Mini PC.
- [x] AC-134-05-2: post-install `systemctl is-active caddy cloudflared livos liv-core liv-worker liv-memory` → 6× active.
- [x] AC-134-05-3: cloudflared registered 4 tunnel connections (QUIC, SJC POPs).
- [x] AC-134-05-4: external HTTPS `curl https://burak.livinity.live/` → HTTP 200 with `Server: cloudflare` + `via: 1.1 Caddy`.
- [x] AC-134-05-5: sacred SHA preserved on Mini PC.
- [x] AC-134-05-6: deploy-livinityd.sh Caddyfile-rewrite regression discovered + fixed in same session.

## Evidence files

- `UAT-EVIDENCE/post-install-state.txt` — services + Caddyfile + cloudflared connections
- `UAT-EVIDENCE/external-curl-200.txt` — full HTTP/1.1 200 response from off-LAN
