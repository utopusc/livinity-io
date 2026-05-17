# Phase 134 — CF Tunnel as Default Hybrid Transport (CONTEXT)

**Opened:** 2026-05-17
**Driver:** User directive — `--mode hybrid` (the default user-facing mode) shall use Cloudflare Tunnel as its transport. Direct-LAN code is retired. Universal one-liner install preserved across VPS / VDS / Mini PC / home boxes.
**User quote (2026-05-17):** *"ben --tunel modunu --hybrid in icinde istiyorum"* and *"tek install komutuyla kurulacak sekilde yap"*

## Locked decisions (Phase 134 design contract)

| # | Decision | Locked value | Source |
|---|----------|--------------|--------|
| D-134-MODE | Default & primary mode | `hybrid` (name kept) — internally implemented as CF Tunnel | User AskUserQuestion 2026-05-17 |
| D-134-RETIRE-DIRECT-LAN | Direct-LAN (Caddy LE DNS-01 + A-record to LAN IP) path | RETIRED — `_provision_user_owned_domain`, `_provision_hybrid_subdomain`, `_verify_caddy_cloudflare_plugin` deleted from `mode-hybrid.sh` | Option A chosen by user |
| D-134-MODE-ALIAS | `--mode tunnel` flag | Still accepted (backward-compat); aliases to `hybrid` | Avoid breaking existing install scripts / docs |
| D-134-PROVISION | CF Tunnel token acquisition | Server5 wizard auto-creates via Cloudflare API (POST `/accounts/{id}/cfd_tunnel` + public-hostname route + DNS CNAME); operator never touches CF Zero Trust dashboard | User AskUserQuestion 2026-05-17 |
| D-134-MIGRATION | Existing hybrid install migration | Automated script `scripts/install/migrate-to-cf-tunnel.sh` — wipes Caddy LE state, installs cloudflared, restarts services, idempotent on re-run | User AskUserQuestion 2026-05-17 |
| D-134-UNIVERSAL | Single install command | Already exists (`curl -fsSL https://livinity.io/install.sh \| sudo bash -s -- --mode hybrid --domain X --api-key liv_k_X --cf-tunnel-token Y`). Wizard fills `--cf-tunnel-token` for the operator; `--cf-zone-id` no longer required | User directive (VPS+VDS+Mini PC parity) |
| D-134-ZERO-PUBLIC-IP | Public-IP / port-forward requirement | DROPPED — cloudflared dials outbound; CGNAT / no-public-IP / behind-NAT all supported | Direct consequence of D-134-MODE |
| D-134-SACRED-SHA | `liv/packages/core/src/sdk-agent-runner.ts` SHA | MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on every commit | Project-wide invariant (`.husky/pre-commit` enforces) |
| D-134-RELAY-ZERO-DATA-PLANE | Server5 data-plane traffic | UNCHANGED — Server5 control-plane only (wizard mints tunnel + DNS; tunnel data flows CF edge → Mini PC directly) | Inherited from Plan 104-09 |

## Codebase baseline (audited 2026-05-17)

**Local repo:**
- `scripts/install.sh` — entry point, dispatches by `--mode` (cloud / local-lan / hybrid / tunnel); self-bootstrap via curl already works
- `scripts/install/parse-cli.sh` — `MODE="hybrid"` default, whitelist `{cloud, local-lan, hybrid, tunnel}`, gates `--cf-tunnel-token` only valid with `--mode tunnel`, `--cf-zone-id` only required for `--mode hybrid`
- `scripts/install/mode-hybrid.sh` — 304 lines: xcaddy rebuild + CF DNS A-record via user token + Server5 mint fallback. **TO BE GUTTED.**
- `scripts/install/mode-tunnel.sh` — 242 lines, mature, idempotent. cloudflared apt repo + token file + systemd service + minimal Caddy :80. **CANONICAL IMPLEMENTATION.**
- `scripts/install/__tests__/` — bash test fixtures (parse-cli args, mode dispatch)

**Server5 platform (out-of-tree, edited via ssh):**
- `/opt/platform/web/src/app/api/account/api-keys/route.ts` — wizard "Generate API Key" handler. As of Phase 133 also writes `custom_domains` row. Phase 134 extends to also call CF API to provision tunnel.
- `/opt/platform/web/src/lib/cloudflare-api.ts` — existing CF API helper (used for hybrid DNS provisioning today). Phase 134 adds `createTunnel()` + `configureTunnelPublicHostname()` + `createDnsCname()` methods.
- `/opt/landing/livinity.io/dashboard-install.html` — wizard UI. Phase 134: drop `--cf-zone-id` input; simplify to `Domain + Generate` flow. Renders the install one-liner with auto-filled `--cf-tunnel-token`.
- `/opt/platform/web/src/app/install.sh/route.ts` — serves `livinity.io/install.sh` (proxies to repo's `scripts/install.sh`). Untouched by Phase 134.

## Current Mini PC state (verified 2026-05-17)

- Installed via `--mode hybrid --domain bruce.livinity.live --cf-token ... --cf-zone-id e480ff1b...` (direct-LAN path; commit `420e6263`)
- Caddy LE DNS-01 wildcard cert active for `*.bruce.livinity.live`
- A-record `bruce.livinity.live → 192.168.20.33` (LAN IP) — **unreachable from outside LAN due to no public IP**
- Tailscale workaround at `100.112.68.1` works
- Mobile-data access: BROKEN

Phase 134 outcome: same domain, CF Tunnel transport, mobile-data access works.

## What user has on-hand (re-confirmed 2026-05-17)

- CF API token (DNS:Edit + Zone:Read, possibly needs Tunnel:Edit scope ADD): `<REDACTED — stored in operator's password manager; see memory>`
- CF Zone ID (`livinity.live`): `e480ff1ba15eb4c26af72dfd1207698f`
- CF Account ID: needed by wizard to call `/accounts/{id}/cfd_tunnel` — **derivation:** wizard fetches it once via `GET /user/tokens/verify` (returns the token's owner account) and caches in env / Redis.
- LivOS API key (post-wizard): `liv_k_tg8Mdy7GpbTn36jINKfU`
- Mini PC SSH: Tailscale `100.112.68.1`, key `C:/Users/hello/Desktop/Projects/contabo/pem/minipc`, pubkey auth working

## Cloudflare API endpoints used by Phase 134

| Method | Endpoint | Purpose | Token scope needed |
|--------|----------|---------|--------------------|
| GET | `/user/tokens/verify` | Discover Account ID for tunnel creation | Any token |
| POST | `/accounts/{id}/cfd_tunnel` | Create tunnel; response `{result.id, result.token}` | `Account:Cloudflare Tunnel:Edit` |
| PUT | `/accounts/{id}/cfd_tunnel/{tunnel_id}/configurations` | Set public-hostname routing `<domain> → http://localhost:80` | `Account:Cloudflare Tunnel:Edit` |
| POST | `/zones/{zone_id}/dns_records` | Create CNAME `<domain> → <tunnel_id>.cfargotunnel.com` | `Zone:DNS:Edit` |
| GET | `/accounts/{id}/cfd_tunnel?name={name}` | Idempotency: check existing tunnel by name | `Account:Cloudflare Tunnel:Read` |
| DELETE | `/accounts/{id}/cfd_tunnel/{id}` | Migration cleanup if user re-runs wizard | `Account:Cloudflare Tunnel:Edit` |

**Token scope gap:** existing CF token may have `DNS:Edit + Zone:Read` but lack `Cloudflare Tunnel:Edit`. Wizard surfaces a clear error + link to CF dashboard if 403 on `cfd_tunnel` endpoint. Operator updates token scope, retries.

## Out of scope for Phase 134

- `cloud` mode (Server5 relay path) — untouched, still functional for users who prefer it
- `local-lan` mode (livinity.local + mDNS) — untouched
- Multi-user per-subdomain routing (`<user>.<domain>` topology) — already works at livinityd layer (Phase 112); CF Tunnel's wildcard public hostname `*.<domain>` covers it
- Per-app subdomain TLS — same as above (wildcard route handles it)
- Tunnel HA / multi-replica — single-connector deployment OK for v34 scope

## Risk register

| Risk | Probability | Mitigation |
|------|-------------|------------|
| CF API rate limit (1200 req/5min per token) | Low | Wizard creates one tunnel per user; idempotent re-runs check first; well under limit |
| Token scope insufficient | Medium | Clear 403 error UI in wizard → operator dashboard link |
| Migration script breaks existing Mini PC | Medium | Idempotent + dry-run flag (`--check`) + backup of Caddyfile before edit |
| CF edge outage | Low | Industry standard; no in-stack mitigation needed; documented in CONTEXT |
| cloudflared apt repo down at install time | Low | parse-cli.sh already has graceful warn-fail; same behavior here |
| Wildcard hostname routes don't propagate to LivOS subdomains | Low | Mini PC livinityd handles subdomains internally; CF Tunnel just routes `*.<domain>` to `http://localhost:80` |

## Related memories

- `[[project-phase-134-handoff]]` — pre-planning context (this CONTEXT supersedes it)
- `[[project-phase-132-complete]]` + `[[project-phase-133-complete]]` — recent install hardening
- `[[feedback-relay-dependency-minimization]]` — D-134-RELAY-ZERO-DATA-PLANE rationale
- `[[reference-minipc-ssh]]` — Tailscale 100.112.68.1 path for UAT

## Sub-plan summary (detail in 134-PLAN.md)

| # | Sub-plan | Domain | Autonomous |
|---|----------|--------|-----------|
| 134-01 | Refactor install.sh — hybrid uses CF Tunnel transport | Local repo `scripts/install/` | true |
| 134-02 | Server5 wizard CF Tunnel auto-provision | Server5 `/opt/platform/web/` + `/opt/landing/` | true (canonical state on-server) |
| 134-03 | Migration script `migrate-to-cf-tunnel.sh` | Local repo `scripts/install/` | true |
| 134-04 | Tests + parse-cli.sh consolidation | Local repo `scripts/install/__tests__/` | true |
| 134-05 | UAT: Mini PC migration + mobile-data anywhere-access proof | Mini PC ops + git artifacts | true (autonomous SSH walk) |
