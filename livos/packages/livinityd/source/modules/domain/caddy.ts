import {writeFile} from 'node:fs/promises'
import {exec} from 'node:child_process'
import {promisify} from 'node:util'
import fse from 'fs-extra'
import {$} from 'execa'
import {ensureFirewallPorts} from './firewall.js'
// Phase 258 WS-A (258-01) — type-only import of the resolved public-access shape.
// `import type` erases at compile time, so caddy.ts gains NO runtime dependency on
// the apps module; it only carries the field shape through SubdomainConfig.
import type {PublicAccessConfig} from '../apps/public-access.js'

const execAsync = promisify(exec)

// ─── Caddy Manager ──────────────────────────────────────────────
// Generates, writes, and reloads Caddyfile configuration.
// Supports main domain + multiple subdomains for Docker apps.
// Each subdomain proxies to a different 127.0.0.1 port.
// Uses 127.0.0.1 instead of localhost to ensure IPv4 connections.
//
// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) — untouched.
//
// Phase 140 plan 140-08: every reverse_proxy emission MUST wrap its target in
// a `{ flush_interval -1; transport http { versions 1.1 } }` block so that
// WebSocket upgrades (wss://.../trpc, etc.) survive transit through Cloudflare
// Tunnel and Caddy's default buffered HTTP/2 transport. Live-discovered on
// Lucy's Mini PC where bare `reverse_proxy 127.0.0.1:8080` 502'd wss traffic
// under tunnel mode. The transport block is harmless in local-lan / TLS-internal
// mode so it's applied uniformly.
// ─────────────────────────────────────────────────────────────────

/**
 * WS-friendly reverse_proxy block contents. Indented with tabs so it composes
 * cleanly into the tab-indented apex/subdomain blocks emitted below.
 * Phase 140 plan 140-08 — see header comment.
 */
const WS_TRANSPORT_BODY = `\t\tflush_interval -1
\t\ttransport http {
\t\t\tversions 1.1
\t\t}`

/**
 * Local-style four-space-indented variant used by generateLocalCaddyfile /
 * generateHybridCaddyfile which adopted four-space indentation as their
 * convention in Phase 104.
 */
const WS_TRANSPORT_BODY_LOCAL = `        flush_interval -1
        transport http {
            versions 1.1
        }`

/**
 * Phase 258 WS-B (258-02) — THE SECURITY SPINE. The mandatory, NON-CONFIGURABLE
 * header strip emitted in EVERY public (login-bypassed) handle block AND in the
 * multi-user app-subdomain block (defense in depth). It deletes any CLIENT-supplied
 * identity headers (Remote-User / Remote-Role — used by forward_auth to convey an
 * authenticated identity upstream) and the high-privilege daemon bearer marker
 * (X-Daemon-Bearer) BEFORE the request reaches the container. This is hard-coded
 * into the carve-out template — it is NOT driven by SubdomainConfig and can never
 * be turned off by a manifest or per-install setting.
 *
 *   T-258B-01 (spoofing/EoP): a public visitor injecting Remote-User/Remote-Role to
 *     impersonate an authed user → stripped here, always.
 *   T-258B-02 (info-disclosure): the daemon bearer leaking onto a public route →
 *     X-Daemon-Bearer stripped here; the bearer `header_up Authorization` is emitted
 *     ONLY inside the gated catch-all, never in a public block.
 *
 * Tab-indented (two tabs) so it composes into the `\thandle … {` public blocks.
 */
const PUBLIC_HEADER_STRIP = `\t\trequest_header -Remote-User
\t\trequest_header -Remote-Role
\t\trequest_header -X-Daemon-Bearer`

const CADDYFILE_PATH = '/etc/caddy/Caddyfile'
const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/
const SUBDOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/

/**
 * Phase 219 hotfix (post-deploy operator incident 2026-05-26) — Cloudflare IP
 * ranges used as `trusted_proxies` in the Caddyfile global options block.
 *
 * Problem class this fixes:
 *   When ANY operator points their LivOS domain at Cloudflare and leaves the
 *   proxy ON (orange cloud) — which is Cloudflare's default for new DNS
 *   records — Cloudflare's SSL/TLS mode often defaults to "Flexible" (CF→
 *   origin in plaintext HTTP). Without `trusted_proxies`, Caddy's auto-HTTPS
 *   sees the request on :80, redirects with 308 to https://..., Cloudflare
 *   forwards the redirect to the user, the user's browser HTTPS request
 *   reaches CF again, CF re-proxies to origin as HTTP, and we get an
 *   infinite 308 loop. The user sees an empty page and "can't login".
 *
 *   This is NOT specific to bruce@10.69.31.68 — every fresh LivOS install
 *   whose operator uses Cloudflare DNS with default settings hits the same
 *   bug. Operator quote 2026-05-26: "baskalarinin bu sorunu yasamasini
 *   istiyorum oyle isse 1 den devam et" — i.e. fix it universally.
 *
 * How `trusted_proxies` fixes it:
 *   When a request from a trusted proxy IP arrives with `X-Forwarded-Proto:
 *   https` (which Cloudflare always sets when proxying), Caddy's auto-HTTPS
 *   sees scheme=https on the request and SKIPS the 308 redirect. The
 *   response body flows through CF as plain HTTP and CF wraps it back in
 *   the user's HTTPS session. No loop, no broken login, and the CF→origin
 *   plaintext hop is still bounded to the CF→Server5 segment (Server5→
 *   Mini PC traversal stays inside the LivOS tunnel either way).
 *
 * Range source: https://www.cloudflare.com/ips/ (stable since 2014; review
 * with `curl -s https://www.cloudflare.com/ips-v4` if CF ever expands).
 *
 * Caddy v2.7+ syntax. Mini PC ships Caddy v2.11.x (per memory file
 * reference_minipc_redis.md neighbour notes), so this is supported.
 */
const CLOUDFLARE_IPV4_RANGES: ReadonlyArray<string> = [
	'173.245.48.0/20',
	'103.21.244.0/22',
	'103.22.200.0/22',
	'103.31.4.0/22',
	'141.101.64.0/18',
	'108.162.192.0/18',
	'190.93.240.0/20',
	'188.114.96.0/20',
	'197.234.240.0/22',
	'198.41.128.0/17',
	'162.158.0.0/15',
	'104.16.0.0/13',
	'104.24.0.0/14',
	'172.64.0.0/13',
	'131.0.72.0/22',
]

const CLOUDFLARE_IPV6_RANGES: ReadonlyArray<string> = [
	'2400:cb00::/32',
	'2606:4700::/32',
	'2803:f800::/32',
	'2405:b500::/32',
	'2405:8100::/32',
	'2a06:98c0::/29',
	'2c0f:f248::/32',
]

/**
 * Phase 219 hotfix — Caddyfile global options block injected at the top of
 * every generated Caddyfile (full, portal, default). Adds CF ranges as
 * trusted_proxies + tells Caddy to read CF-Connecting-IP as the client IP
 * so access logs and rate limits see the real visitor instead of CF.
 *
 * Idempotent: if CF is NOT in front, the trusted_proxies list is harmless —
 * Caddy only honors X-Forwarded-Proto/-For when the request arrives from a
 * listed IP, so direct origin traffic still gets the normal HTTPS redirect.
 */
export const CADDY_GLOBAL_BLOCK = `{
	servers {
		trusted_proxies static ${[...CLOUDFLARE_IPV4_RANGES, ...CLOUDFLARE_IPV6_RANGES].join(' ')}
		client_ip_headers CF-Connecting-IP X-Forwarded-For
	}
}
`

export interface SubdomainConfig {
	subdomain: string
	appId: string
	port: number
	enabled: boolean
	/**
	 * Phase 141-03: optional canonical full FQDN minted by Server5's
	 * `/api/me/app-subdomain` (Phase 140 hyphen-pattern, e.g.
	 * `n8n-socinity.livinity.io`). When set, the Caddy emitter and the UI use
	 * this host directly instead of computing `${subdomain}.${mainDomain}` —
	 * which would otherwise produce the wrong shape (e.g.
	 * `n8n.socinity.livinity.io`, a level Universal SSL doesn't cover on the
	 * Free plan). Absent for pre-Phase-140 entries → legacy compute path kicks
	 * in for backwards compatibility.
	 */
	host?: string
	/**
	 * Optional upstream bearer token for an agent-native app whose bundled web
	 * UI talks to its OWN daemon assuming localhost. When set, the gated
	 * app-subdomain block rewrites three request headers on the way upstream:
	 *   - `Authorization: Bearer <token>` — the UI calls /api WITHOUT a token
	 *     (it relies on a loopback bypass that never fires in a container), so
	 *     Caddy authenticates it.
	 *   - `Host: 127.0.0.1:<port>` and `Origin: http://127.0.0.1:<port>` — the
	 *     daemon has a DNS-rebinding/CSRF guard that 403s any non-loopback Host
	 *     or Origin, so both are rewritten to loopback.
	 * Used by Open Design (OD_API_TOKEN). The daemon stays bound to loopback +
	 * behind the login gate, so the token is never usable off-box.
	 * registerAppSubdomain populates this from the app's compose; it round-trips
	 * through Redis so it survives regen.
	 */
	upstreamBearer?: string
	/**
	 * Phase 258 WS-A — the RESOLVED public-access config for this install. Absent =
	 * fully gated (256-04 forward_auth unchanged, SC5). When present + mode!=='none',
	 * the 258-02 emitter splits the subdomain block into public handle blocks
	 * (header-stripped: -Remote-User -Remote-Role -X-Daemon-Bearer) + a gated
	 * catch-all that keeps forward_auth + daemon-bearer injection. Populated by
	 * registerAppSubdomain (258-03) from the per-install operator setting via
	 * resolvePublicAccess; round-trips through Redis like upstreamBearer.
	 *
	 * 258-01 adds the field ONLY — the emit carve-out that reads it is 258-02.
	 */
	publicAccess?: PublicAccessConfig
}

export interface CaddyConfig {
	mainDomain: string | null
	subdomains: SubdomainConfig[]
}

/**
 * Validate a domain name.
 */
export function validateDomain(domain: string): boolean {
	return DOMAIN_RE.test(domain) && domain.length <= 253
}

/**
 * Validate a subdomain (just the prefix, e.g. "app1" for app1.example.com).
 */
export function validateSubdomain(subdomain: string): boolean {
	return SUBDOMAIN_RE.test(subdomain) && subdomain.length <= 63
}

/**
 * Phase 141-03 — Validate a full FQDN host (e.g. "n8n-socinity.livinity.io")
 * for use as a Caddy block name. Matches each dot-separated label against
 * SUBDOMAIN_RE (so each label is a valid DNS label) and caps total length at
 * 253 chars per RFC 1035. Used by generateFullCaddyfile when a SubdomainConfig
 * carries the Phase 140 hyphen-pattern `host` field.
 */
export function validateHost(host: string): boolean {
	if (!host || host.length > 253) return false
	const labels = host.split('.')
	if (labels.length < 2) return false
	for (const label of labels) {
		if (!validateSubdomain(label)) return false
	}
	return true
}

/**
 * Phase 231 retirement — Liv AI legacy chat-surface routing removed.
 * Previously this constant emitted four handle blocks routing the
 * /liv-ai-app/* family + plugin-asset matcher to the :18789 gateway plus
 * a :3010 catch-all. Phase 233 UAT GREEN gated Phase 231: Liv Assistant
 * (Phase 226-04 + Phase 227) fully replaces the legacy chat surface, so
 * the three gateway-routed blocks are dead. The surviving block routes
 * /liv-ai-app/* to the :3010 Next.js dashboard (Phase 202 agents +
 * settings, Phase 203-10/11 app + icon routes). Phase 234-02 Section G.1
 * removed the in-shell `LivAiContent` consumer (the LIVINITY_liv-ai
 * window-content branch was deleted alongside its apps.tsx entry); the
 * /liv-ai-app/* handle survives because OpenUI app windows (the
 * `OPENUI_<slug>` window-content branch in window-content.tsx) still
 * iframe-target `/liv-ai-app/openclawos/apps/<slug>` via this proxy
 * (T-203-06 trust chain).
 */
const LIV_AI_APP_HANDLE = `\t@livaiSubapp path /liv-ai-app /liv-ai-app/*
\thandle @livaiSubapp {
\t\treverse_proxy 127.0.0.1:3010 {
${WS_TRANSPORT_BODY}
\t}
\t}`

// Phase 231 retirement — legacy handshake-bridge handle constant removed
// (was the outer-auth bridge Phase 203-05 D-203-12). Per DISCOVERY R17 the
// Express mount on :8080 still exists inside livinityd boot wire-up
// (KEEP_SCOPE_EXPANSION) but receives zero traffic post-deploy since this
// handle is no longer emitted into the Caddyfile.

/**
 * Phase 232 — Livinity brand overlay static file handler.
 * Serves /etc/liv-assistant/branding/{livinity-overlay.css,favicon.svg,manifest.json}
 * at https://bruce.livinity.io/liv/branding/* without proxying to the AionUi
 * backend on :3020. Branding assets are installed by scripts/install-liv-assistant.sh
 * (Phase 232 step) from the repo's caddy/branding/ directory.
 *
 * Ordering — emitted IMMEDIATELY BEFORE LIV_ASSISTANT_HANDLE in every emit
 * site. The path matcher `/liv/branding/*` is more specific than @liv's
 * `/liv /liv/*` so Caddy routes branding requests here even if reordered
 * by specificity at parse time.
 *
 * Path strategy — `uri strip_prefix /liv/branding` reduces
 * /liv/branding/livinity-overlay.css → /livinity-overlay.css before
 * file_server resolves it against `root * /etc/liv-assistant/branding`.
 *
 * See caddy/branding/README.md for asset inventory + update flow.
 */
const LIV_BRANDING_HANDLE = `\thandle /liv/branding/* {
\t\turi strip_prefix /liv/branding
\t\troot * /etc/liv-assistant/branding
\t\tfile_server
\t}`

/**
 * Phase 262-01 (LIVOS-041/047/053/054) — the /liv-family forward_auth gate.
 *
 * Mirrors the 256-04 `gatedHandleBody` forward_auth (caddy.ts:~675) but as a
 * module-level constant: module constants have no `config` in scope, so the
 * 401 redirect uses the Caddy `{host}` placeholder to build an ABSOLUTE
 * `https://{host}/login...` URL.
 *
 * ⚠ Phase 262 live-pentest finding (LIVOS-041 incomplete fix): a RELATIVE
 * `redir /login?redirect={uri}` inside `handle_response @bad` does NOT
 * short-circuit `forward_auth` on Caddy v2.11.3 — the request falls through to
 * the backend reverse_proxy (AionUi :3020), leaving the qr-mint endpoints
 * reachable unauthenticated (an attacker could still mint an admin
 * `aionui-session` straight through `@liv` despite the gate being "present").
 * Only an ABSOLUTE redir URL terminates the gate. The 256-04 app-subdomain
 * gate worked because it already used `https://${config.mainDomain}/__livos_sso`.
 * Verified live: relative → unauth mint succeeds; absolute `https://{host}/...`
 * → 302 to /login, mint blocked. DO NOT revert to a relative redir.
 * Emitted as the FIRST
 * directive inside EVERY /liv-family handle (@liv, @liv_ws,
 * @liv_api_subresource, @livos_terminal_ws, @liv_login) so a valid
 * LIVINITY_SESSION is required at the Caddy layer before ANY AionUi traffic —
 * including the qr-mint endpoints (`/liv/api/webui/generate-qr-token`,
 * `/liv/api/auth/qr-login`) that made LIVOS-041 a Critical (an unauthenticated
 * caller could mint an `aionui-session` cookie straight through `@liv`).
 * livinityd's /auth/verify performs full validation (signature + exp + jti
 * revocation + active-user re-check per Phase 262-01 Task 2).
 */
const LIV_GATE_BODY = `\t\tforward_auth 127.0.0.1:8080 {
\t\t\turi /auth/verify
\t\t\t@bad status 401
\t\t\thandle_response @bad {
\t\t\t\tredir https://{host}/login?redirect={scheme}://{host}{uri} 302
\t\t\t}
\t\t}`

/**
 * Phase 226-04 (recovery from 226-03 BLOCKED) — Liv Assistant (AionUi WebUI)
 * `/liv` reverse-proxy handle. Phase 223 shipped liv-assistant.service on
 * 127.0.0.1:3020; Phase 226 makes it reachable at https://bruce.livinity.io/liv/*
 * AND iframe-embeddable from the LivOS shell (Phase 227 mount).
 *
 * History — Plan 226-01 vendored this same directive shape into
 * `caddy/conf.d/liv-assistant.caddy` as a Caddy v2 named snippet, and Plan
 * 226-02 wired an installer that imported it into the live Caddyfile. Plan
 * 226-03 deploy preflight discovered (Findings 1+2+3) that `/etc/caddy/Caddyfile`
 * is dynamically generated by THIS file (3 documented `reloadCaddy()` call
 * sites at 609/622/632 + 2 direct writeFile paths at 643/656), so any in-place
 * edit by the installer would be wiped on the next regen trigger. Plan 226-04
 * moves the emission HERE so it survives every regen.
 *
 * Path strategy — Caddy v2 multi-path pitfall (Phase 218 T1): `handle_path`
 * accepts ONE matcher only. We use the canonical `@name path /a /b` + `handle`
 * + `uri strip_prefix` idiom so both `/liv` (no trailing slash) and `/liv/*`
 * (sub-paths) route together.
 *
 * WebSocket — Caddy v2's `reverse_proxy` auto-handles `Upgrade: websocket`
 * and `Connection: upgrade` headers. We deliberately do NOT set any
 * `header_up Connection` / `header_up Upgrade` directives that would strip
 * the WS upgrade. AionUi uses WS for chat streaming (Phase 222 spike).
 *
 * Iframe / CSP — AionUi upstream may emit `X-Frame-Options: DENY` and its own
 * CSP. We strip both via `header_down -X-Frame-Options` +
 * `header_down -Content-Security-Policy` on the reverse_proxy, then set our
 * own minimal `frame-ancestors 'self' https://bruce.livinity.io` CSP at
 * `handle` scope (AFTER the upstream's was stripped). Phase 227's LivOS
 * shell iframe mount serves bruce.livinity.io, so `'self'` covers it.
 *
 * Ordering — emitted AFTER LIV_AI_APP_HANDLE and BEFORE the catch-all
 * `handle { reverse_proxy 127.0.0.1:8080 ... }`. Caddy v2 evaluates by
 * matcher specificity (not source order) so ordering is cosmetic, but the
 * pattern keeps diff review easy.
 *
 * Phase 232 — Plan 02 DEPLOY-TIME DISCOVERY: the `replace "</head>" ...`
 * directive originally specified for HTML injection was REJECTED by the
 * Mini PC's Caddy v2.11.3 binary, which does NOT ship the
 * `caddyserver/replace-response` module in its standard distribution.
 * `caddy validate` output:
 *   Error: parsing caddyfile tokens for 'handle': unrecognized
 *   directive: replace - are you sure your Caddyfile structure (nesting
 *   and braces) is correct?, at /etc/caddy/Caddyfile:76
 * Result: silent reload failure. Caddy kept running the pre-232 config,
 * making BOTH the static /liv/branding/* handler AND the replace
 * directive ineffective live.
 *
 * Hot-fix (Plan 232-02): drop the `replace` directive line entirely.
 * Static /liv/branding/* handler (LIV_BRANDING_HANDLE constant above)
 * remains — file_server is built into Caddy v2 core, so the static
 * handler does deploy. SC-02 + SC-04 (asset reachability) are achievable
 * with the static handler alone; SC-01 + SC-03 (HTML injection) require
 * a follow-up phase that rebuilds Caddy via xcaddy with the
 * caddyserver/replace-response plugin. Tracked as a Phase 232 follow-up
 * (architectural — Rule 4 escalation).
 *
 * The sibling LIV_BRANDING_HANDLE constant still serves the static
 * assets at /liv/branding/*; the missing piece is browser-side HTML
 * referencing them. Until the follow-up phase ships, the overlay CSS
 * exists on the wire but is never loaded by AionUi's HTML.
 */
// Phase 262-01 (LIVOS-054): the legacy /liv/trpc bridge matcher+handle
// (path /liv/trpc + /liv/trpc/*, strip /liv → :8080) is DELETED. It let the
// same-origin framed AionUi SPA (sandbox `allow-same-origin allow-scripts`)
// drive the FULL LivOS tRPC API with the operator's cookie auto-attached.
// The full origin-split is the deferred WS6 follow-up.
//
// 2026-06-11 (post-262 carve-out — operator ACCEPTED the trade-off): the
// LIVOS-054 deletion also broke the Liv AI "Local Agents" install panel
// (scripts/aionui-patches/local-agents-install-section.js) — its
// cliInstaller.* calls strip-prefixed to /trpc/* and hit AionUi :3020, which
// answered with its SPA index.html → `Unexpected token '<'` in the panel,
// Claude detection permanently "Failed", and no Claude agent ever registered.
// Re-open ONLY the named cliInstaller procedures to :8080. Bounded surface:
// each is adminProcedure (cli-installer-router.ts) + whitelist-bounded to the
// 20 fixed CLI names in install-scripts.ts (the D-239-07 RCE boundary) +
// forward_auth-gated here. Phase 269-01 appends applyAgentChanges +
// hasPendingAgentChanges (the panel's manual-apply calls — both adminProcedure,
// NO untrusted input; applyAgentChanges fires the single user-triggered
// liv-assistant restart, hasPendingAgentChanges gates the Apply button).
//
// ⚠ Matcher is EXACT paths, deliberately NOT `path /liv/trpc/cliInstaller.*`:
// tRPC's HTTP transport accepts comma-batched procedure paths
// (`/trpc/cliInstaller.detect,users.create?batch=1`). A trailing-wildcard
// matcher would match that path (it begins with `cliInstaller.`) and re-open
// the FULL tRPC API through the batch — exactly what LIVOS-054 closed. Exact
// path matching makes a comma-bearing path fall through to @liv (:3020,
// harmless SPA html). caddy.test.ts locks this (no wildcard form allowed).
const LIV_CLI_INSTALLER_HANDLE = `\t@liv_cli_installer path /liv/trpc/cliInstaller.detect /liv/trpc/cliInstaller.install /liv/trpc/cliInstaller.auth /liv/trpc/cliInstaller.applyAgentChanges /liv/trpc/cliInstaller.hasPendingAgentChanges
\thandle @liv_cli_installer {
${LIV_GATE_BODY}
\t\turi strip_prefix /liv
\t\treverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
\t\t}
\t}`

/**
 * Phase 269-03 (WS3) — auth-gated AionUi agent list carve-out.
 *
 * `/liv/api/*` is reverse-proxied to AionUi :3020 by @liv_api_subresource (it
 * lives inside LIV_ASSISTANT_SUBRESOURCE_HANDLE), so `/liv/api/agents` normally
 * hits AionUi directly and livinityd never sees it. AionUi lists EVERY installed
 * CLI regardless of LivOS auth state — unauthed agents show in the picker and
 * then fail in chat. To filter them we must route just this ONE request back to
 * livinityd, where Redis (`liv:cli:auth:<name>`) + CLI_BIN_NAMES live.
 *
 * @liv_agents is an EXACT single-path matcher (`path /liv/api/agents`) — Caddy
 * v2 routes by matcher specificity, so an exact path beats the broader
 * `/liv/api/*`. It is ALSO emitted source-order-BEFORE
 * LIV_ASSISTANT_SUBRESOURCE_HANDLE (which carries @liv_api_subresource) at every
 * emit site for diff clarity + defence in depth. The livinityd overlay route
 * (`GET /api/agents`, server/index.ts) fetches AionUi's real list, joins the
 * auth status, and FILTERS the unauthed ones (fail-OPEN on any error).
 *
 * Gate — carries the SAME LIV_GATE_BODY forward_auth → /auth/verify with the
 * ABSOLUTE `https://{host}/login?...` redir (NEVER a relative redir — LIVOS-041:
 * a relative redir does NOT terminate forward_auth and the request falls through
 * to the backend, leaving the route reachable unauthenticated). This is an HTTP
 * JSON GET, NOT a WS path, so forward_auth is SAFE here — unlike @liv_ws, where
 * the auth subrequest inherits `Upgrade: websocket` and livinityd's
 * server.on('upgrade') hijacks it (the e336afdd 502 regression). We deliberately
 * do NOT add `copy_headers Cookie` here — it would clobber LIVINITY_SESSION (the
 * 386b33e7 regression). EXACT path only — no `/liv/api/agents/*` wildcard.
 * caddy.test.ts locks the exact path + no-wildcard + the gate + the :8080 proxy.
 */
const LIV_AGENTS_HANDLE = `\t@liv_agents path /liv/api/agents
\thandle @liv_agents {
${LIV_GATE_BODY}
\t\turi strip_prefix /liv
\t\treverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
\t\t}
\t}`

const LIV_ASSISTANT_HANDLE = `\t@liv path /liv /liv/*
\thandle @liv {
${LIV_GATE_BODY}
\t\turi strip_prefix /liv
\t\treverse_proxy 127.0.0.1:3020 {
\t\t\theader_down -X-Frame-Options
\t\t\theader_down -Content-Security-Policy
${WS_TRANSPORT_BODY}
\t\t}
\t\theader Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
\t}`

/**
 * Phase 262-01 (LIVOS-041) — Caddy-layer gate for the /liv-login auto-login
 * endpoint. The Express handler (modules/server/liv-login-handler.ts) is ALSO
 * session-gated (defense in depth — Task 2); this handle puts forward_auth in
 * front of it at the Caddy layer so the cookie-minting flow is unreachable
 * without a valid LIVINITY_SESSION even if a future refactor regresses the
 * Express-side check. Emitted immediately after LIV_ASSISTANT_HANDLE at all
 * three emit sites in generateFullCaddyfile.
 */
const LIV_LOGIN_HANDLE = `\t@liv_login path /liv-login
\thandle @liv_login {
${LIV_GATE_BODY}
\t\treverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
\t\t}
\t}`

/**
 * Phase 236 → Phase 237 — split subresource matcher for AionUi.
 *
 * Phase 236 introduced a single `@liv_subresource` matcher that combined
 * a Referer header regexp (`^https?://[^/]+/liv(/|$)`) AND
 * `path /api/* /ws /ws/*`. The intent was to route only iframe-originated
 * subresource fetches to AionUi while leaving LivOS-shell apex `/api/*`
 * traffic on the `:8080` catch-all.
 *
 * Why Phase 237 splits the matcher:
 *   RFC 6455 (WebSocket) browsers do NOT send a `Referer` header on the
 *   WS upgrade handshake — only `Origin`. Phase 236's combined matcher
 *   silently MISSED the `wss://bruce.livinity.io/ws` upgrade because the
 *   AND condition (the Referer regexp) failed. The request fell
 *   through to the `:8080` catch-all (which has no `/ws` route) → 404 /
 *   502 → chat streaming broken (operator had to reload the page to see
 *   each response). Phase 236 EXT-4 falsely passed because the curl
 *   smoke explicitly set `-H "Referer: .../liv/"`; the real browser sets
 *   only Origin and so failed.
 *
 *   Phase 236 EXT-4b ("WITHOUT Referer → 502") was the canary for this
 *   bug but was filed as a "correct" negative control — in reality the
 *   browser is forced into exactly that negative case for WS upgrades,
 *   so it is the OPERATIVE case.
 *
 * Phase 237 fix — two matchers (extended in Phase 245.6 with a third for
 * livinityd's `/ws/stream/*` WebApp RFB streaming endpoint that pre-dated
 * the AionUi WS land-grab):
 *   0. `@webapp_stream_ws` — matched FIRST, routes to :8080 (livinityd).
 *      Originally just `/ws/stream/*` (Phase 100-07 WebApp RFB stream).
 *      EXTENDED 2026-06-08 to also carve out livinityd's OTHER WS endpoints
 *      that the AionUi `/ws/*` land-grab was stealing:
 *        `/ws/docker/*`     — Docker container LOGS streaming
 *        `/ws/docker-exec`  — Docker container SHELL/exec
 *        `/ws/ssh-sessions` — host SSH-session live tail (Security panel)
 *      Without this carve-out the broader `@liv_ws path /ws /ws/*` below
 *      claims them and sends them to :3020 (AionUi) → 500/disconnect. This
 *      is exactly why the Docker Logs/Shell + Security SSH-Sessions panels
 *      worked in dev (Vite proxies /ws straight to :8080) but failed through
 *      the public Caddy path on bruce.livinity.io.
 *   1. `@liv_ws` — UNCONDITIONAL on paths `/ws` and `/ws/*`. AionUi
 *      exclusively owns the `/ws` path on this Caddy host once
 *      `/ws/stream/*` is carved out by matcher (0). Routing every
 *      remaining `/ws*` request to :3020 is safe + consistent and does
 *      not require any header check.
 *      (No Referer/Origin matching needed — and per RFC 6455 browsers do
 *      not send Referer here anyway.)
 *   2. `@liv_api_subresource` — Phase 237 kept a referer-gated pattern for
 *      `/api/*` here; Phase 262-01 (LIVOS-047) REPLACED it with the
 *      path-prefix matcher `path /liv/api/*` + `uri strip_prefix /liv`.
 *      Referer is a client-controlled header — trivially forged by
 *      curl/fetch — and was the SOLE routing boundary in front of the
 *      operator-credentialed agent API. install-liv-assistant.sh already
 *      rewrites quoted `/api/` → `/liv/api/` literals in the AionUi bundle,
 *      so iframe subresource fetches arrive prefixed; LivOS-shell apex
 *      `/api/*` traffic never matches and falls through to the `:8080`
 *      catch-all as designed. The strip_prefix keeps :3020 receiving the
 *      bare `/api/*` it expects.
 *
 * Why a path-rewrite was NOT chosen (carry-over from Phase 236 rationale):
 *   Phase 235's sed pass rewrote QUOTED string-literal `/api/` -> `/liv/api/`
 *   but cannot reach (a) dynamic backtick-template URLs
 *   (`new WebSocket(\`wss://${location.host}/ws\`)` — `/ws` interpolated,
 *   not a quoted literal in source post-minification) nor (b) runtime-
 *   inserted DOM `src` attributes (`<img src="/api/assets/...">` injected
 *   via React render). Extending the sed to AST-level rewriting would
 *   re-break on every AionUi upstream bump. Caddy-layer routing is the
 *   robust place to disambiguate.
 *
 * Caddy v2 named matcher semantics:
 *   `@liv_ws path /ws /ws/*` and `@liv_api_subresource path /liv/api/*` are
 *   single-stanza path matchers (no curly braces needed).
 *
 * WebSocket upgrade — Caddy v2's `reverse_proxy` auto-handles `Upgrade:
 * websocket` + `Connection: upgrade` headers. We deliberately do NOT set
 * any `header_up Connection` / `header_up Upgrade` directives that would
 * strip the upgrade. Mirrors the LIV_ASSISTANT_HANDLE pattern.
 *
 * Header stripping mirrors LIV_ASSISTANT_HANDLE: drop upstream
 * X-Frame-Options + Content-Security-Policy (AionUi emits its own and we
 * iframe-embed), then set our own minimal frame-ancestors CSP at handle
 * scope. Iframe-safety guarantees from Phase 226-04 carry through.
 *
 * Ordering — emitted IMMEDIATELY BEFORE LIV_ASSISTANT_HANDLE in every emit
 * site. Caddy v2 evaluates by matcher specificity (not source order) so
 * source-ordering is cosmetic and kept above @liv for diff review.
 *
 * Threat model — Phase 262-01 (LIVOS-041/047): the old "AionUi enforces its
 * own auth gate so a spoofed Referer grants no escalation" argument collapsed
 * once LIVOS-041 showed the `aionui-session` cookie was freely mintable via
 * the unauthenticated /liv-login flow. The HTTP /liv-family handles
 * (@liv_api_subresource, @liv, @liv_login) carry LIV_GATE_BODY — forward_auth
 * to livinityd's /auth/verify — so a valid LIVINITY_SESSION is required BEFORE
 * any traffic reaches :3020, and the /api routing decision is a path prefix,
 * not a client-forgeable header.
 *
 * NOTE (2026-06-10, LIVOS-041 follow-up): the WS handles @liv_ws (and
 * @livos_terminal_ws) do NOT use forward_auth. Its auth subrequest inherits the
 * `Upgrade: websocket` header and gets hijacked by livinityd's
 * server.on('upgrade') at :8080/auth/verify (the Express route never runs) →
 * socket reset → 502 on EVERY WS upgrade. WS is gated at its own layer instead
 * (AionUi's aionui-session; the pty WS handler), mirroring @webapp_stream_ws
 * (ssh-sessions/docker-exec). @aionui_assets is ungated static logos.
 *
 * Constant name preserved (`LIV_ASSISTANT_SUBRESOURCE_HANDLE`) to avoid
 * touching the 3 emit sites in `generateFullCaddyfile`.
 */
const LIV_ASSISTANT_SUBRESOURCE_HANDLE = `\t# AionUI builds logo URLs as absolute /api/assets/logos/... (no /liv base) so they escape the iframe prefix and hit livinityd -> 404. Route the AionUI asset namespace to :3020 (static public logos; livinityd owns nothing under /api/assets; shell does not use it). 2026-06-10.
\t@aionui_assets path /api/assets/*
\thandle @aionui_assets {
\t\treverse_proxy 127.0.0.1:3020 {
\t\t\theader_down -X-Frame-Options
\t\t\theader_down -Content-Security-Policy
${WS_TRANSPORT_BODY}
\t\t}
\t}
\t@webapp_stream_ws path /ws/stream/* /ws/docker/* /ws/docker-exec /ws/ssh-sessions
\thandle @webapp_stream_ws {
\t\treverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
\t\t}
\t}
\t@liv_ws path /ws /ws/*
\thandle @liv_ws {
\t\t# Phase 262-01 follow-up: NO forward_auth on WS. forward_auth's auth subrequest inherits the Upgrade:websocket header; livinityd's server.on('upgrade') hijacks it at :8080/auth/verify (Express route never runs) -> socket reset -> 502 on every /ws. AionUi self-auths via aionui-session (mintable only through the gated /liv-login + /liv/api/*). Mirrors @webapp_stream_ws (ssh-sessions/docker-exec also gate at the WS handler, not forward_auth).
\t\treverse_proxy 127.0.0.1:3020 {
\t\t\theader_down -X-Frame-Options
\t\t\theader_down -Content-Security-Policy
${WS_TRANSPORT_BODY}
\t\t}
\t}
\t@liv_api_subresource path /liv/api/*
\thandle @liv_api_subresource {
${LIV_GATE_BODY}
\t\turi strip_prefix /liv
\t\treverse_proxy 127.0.0.1:3020 {
\t\t\theader_down -X-Frame-Options
\t\t\theader_down -Content-Security-Policy
${WS_TRANSPORT_BODY}
\t\t}
\t\theader Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
\t}`

/**
 * Phase 243-02 — /livos/terminal/ws (persistent UI terminal endpoint).
 *
 * Unconditional path matcher (mirrors Phase 237 @liv_ws pattern) reverse-
 * proxying to livinityd's :8080 — NOT AionUi's :3020. The next gate after
 * Caddy is the JWT cookie + feature-flag check in the WS handler itself
 * (`livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts`).
 *
 * Why unconditional (no Referer regex):
 *   Per RFC 6455 browsers send only `Origin` (not `Referer`) on the WS
 *   upgrade handshake — Phase 237 hit this same issue with the legacy
 *   @liv_subresource matcher. L-243-C explicitly requires unconditional
 *   path matching for the new terminal endpoint.
 *
 * Why :8080 (NOT :3020):
 *   The PTY backend lives in livinityd (port 8080). AionUi (port 3020) has
 *   no /livos/terminal/* route. Caddy routes the terminal path away from
 *   AionUi to the LivOS shell backend.
 *
 * Header stripping mirrors @liv_ws: drop upstream X-Frame-Options +
 * Content-Security-Policy so the xterm panel can iframe-embed cleanly in
 * the LivOS shell (Phase 243-03).
 *
 * Ordering — emitted IMMEDIATELY AFTER LIV_ASSISTANT_SUBRESOURCE_HANDLE in
 * every emit site (apex + multi-user wildcard). Caddy v2 routes by matcher
 * specificity not source order, but source-order is kept for diff review.
 */
const LIVOS_TERMINAL_WS_HANDLE = `\t@livos_terminal_ws path /livos/terminal/ws
\thandle @livos_terminal_ws {
\t\t# Phase 262-01 follow-up: NO forward_auth on WS (breaks the upgrade — see @liv_ws). Already gated at the pty-sessions WS handler (JWT cookie + feature flag).
\t\treverse_proxy 127.0.0.1:8080 {
\t\t\theader_down -X-Frame-Options
\t\t\theader_down -Content-Security-Policy
${WS_TRANSPORT_BODY}
\t\t}
\t}`

/**
 * Generate a complete Caddyfile with main domain and all subdomains.
 * In multi-user mode, uses a single wildcard block that routes all subdomains
 * to livinityd's app gateway (port 8080) for dynamic per-user routing.
 * In single-user mode, uses individual per-subdomain blocks (legacy behavior).
 */
export function generateFullCaddyfile(config: CaddyConfig, multiUser = false, tunnel = false, nativeApps: Array<{subdomain: string; port: number; streaming?: boolean}> = []): string {
	const blocks: string[] = []

	// WS1 (2026-06-11) — the /liv-family CSP `frame-ancestors` literal was
	// hardcoded to `https://bruce.livinity.io` in the handle constants
	// (LIV_ASSISTANT_HANDLE, LIV_ASSISTANT_SUBRESOURCE_HANDLE). On every
	// non-bruce box that domain is wrong — it worked only because the sibling
	// `'self'` token already covers the same-origin shell iframe. Resolve the
	// embedder domain at emit time from the operator's actual mainDomain so the
	// explicit allow-listed origin is correct per box (and drop the bogus
	// literal entirely when no domain is configured). Single post-process pass:
	// the literal appears ONLY in CSP headers in the emitted output (comments
	// carrying it are not part of the generated file).
	const applyCsp = (out: string): string =>
		out.replaceAll(
			"frame-ancestors 'self' https://bruce.livinity.io",
			config.mainDomain ? `frame-ancestors 'self' https://${config.mainDomain}` : "frame-ancestors 'self'",
		)

	if (!config.mainDomain) {
		// No domain configured — minimal :80 fallback. Multi-user / subdomain
		// routing requires a domain. Phase 231 retirement — legacy openclaw
		// handshake bridge removed; Liv AI subapp (Next.js :3010 dashboard)
		// + Liv Assistant (Phase 226-04 /liv handle) are the surviving Liv
		// surfaces above the catch-all.
		blocks.push(`:80 {
${LIV_AI_APP_HANDLE}
${LIV_BRANDING_HANDLE}
${LIV_AGENTS_HANDLE}
${LIV_ASSISTANT_SUBRESOURCE_HANDLE}
${LIVOS_TERMINAL_WS_HANDLE}
${LIV_CLI_INSTALLER_HANDLE}
${LIV_ASSISTANT_HANDLE}
${LIV_LOGIN_HANDLE}
	handle {
		reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
		}
	}
}`)
		// Phase 219 hotfix — CF global block harmless even without a domain (no
		// auto-HTTPS kicks in on :80-only configs) but keeps the file structure
		// consistent.
		return applyCsp(CADDY_GLOBAL_BLOCK + '\n' + blocks.join('\n\n') + '\n')
	}

	// Phase 134+ — when Cloudflare Tunnel terminates TLS at the edge and forwards
	// plain HTTP to localhost:80, every Caddy block MUST use the `http://` prefix
	// so Caddy does NOT trigger auto-HTTPS-redirect (which loops with CF Tunnel:
	// edge → localhost:80 → 308 → edge → 308 → ...). The bare `host { ... }`
	// form is HTTPS-default and triggers that redirect on tunnel-mode traffic.
	const prefix = tunnel ? 'http://' : ''

	// Phase 140 plan 140-08 — apex block (LivOS dashboard) gets a no-store
	// Cache-Control header in tunnel mode so CF's edge cache never serves stale
	// HTML. Per-app blocks deliberately don't carry this header — app caching
	// behavior is app-specific and should be left to the app itself.
	const apexCacheHeader = tunnel ? `\theader Cache-Control "no-store, must-revalidate"\n` : ''

	// Main domain block — Phase 231 retirement: legacy openclaw handshake
	// bridge removed; Liv AI Next.js subapp (LIV_AI_APP_HANDLE) + Liv
	// Assistant (Phase 226-04) handles emit above the livinityd catch-all.
	blocks.push(`${prefix}${config.mainDomain} {
${apexCacheHeader}${LIV_AI_APP_HANDLE}
${LIV_BRANDING_HANDLE}
${LIV_AGENTS_HANDLE}
${LIV_ASSISTANT_SUBRESOURCE_HANDLE}
${LIVOS_TERMINAL_WS_HANDLE}
${LIV_CLI_INSTALLER_HANDLE}
${LIV_ASSISTANT_HANDLE}
${LIV_LOGIN_HANDLE}
	handle {
		reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
		}
	}
}`)

	// Generate subdomain blocks
	for (const sub of config.subdomains) {
		if (!sub.enabled) continue

		// Phase 141-03: prefer the canonical FQDN minted by Server5 (Phase 140
		// hyphen-pattern, e.g. `n8n-socinity.livinity.io`) when present.
		// Legacy path computes `${sub.subdomain}.${mainDomain}` and validates
		// the short label.
		let host: string
		if (sub.host) {
			if (!validateHost(sub.host)) continue
			host = sub.host
		} else {
			if (!validateSubdomain(sub.subdomain)) continue
			host = `${sub.subdomain}.${config.mainDomain}`
		}
		const fullDomain = `${prefix}${host}`
		if (multiUser) {
			// Phase 258 WS-B (258-02) NOTE-1 — SINGLE-USER-EMIT ASSUMPTION (the one way
			// the 258 spine is silently bypassed): the public-access carve-out (public
			// path / whole-app handles) + the gated forward_auth block live ONLY in the
			// single-user `else` branch below. Under livos:system:multi_user==='true'
			// EVERY app subdomain takes THIS branch — a plain reverse_proxy to the :8080
			// Express gateway with NO forward_auth and NO carve-out — so public-access
			// routing is NOT enforced at Caddy in multi-user mode. The Mini PC is
			// single-user today so the gap is not live, but it MUST be closed at the :8080
			// gateway BEFORE multi-user ships (T-258B-05; documented 258-05 precondition +
			// DEPLOY-LOG follow-up). Defense in depth: we STILL strip the three identity/
			// bearer headers here so a CLIENT-injected Remote-User/Remote-Role/
			// X-Daemon-Bearer can never pass through to :8080 (this branch injects none).
			if (sub.publicAccess && sub.publicAccess.mode !== 'none') {
				// eslint-disable-next-line no-console
				console.warn(
					`[caddy] publicAccess config present under multi_user — carve-out routing is single-user only; app auth/public-access for ${fullDomain} is enforced at the :8080 gateway, NOT here`,
				)
			}
			blocks.push(`${fullDomain} {
${LIV_AI_APP_HANDLE}
${LIV_BRANDING_HANDLE}
${LIV_AGENTS_HANDLE}
${LIV_ASSISTANT_SUBRESOURCE_HANDLE}
${LIVOS_TERMINAL_WS_HANDLE}
${LIV_CLI_INSTALLER_HANDLE}
${LIV_ASSISTANT_HANDLE}
${LIV_LOGIN_HANDLE}
	handle {
		reverse_proxy 127.0.0.1:8080 {
${PUBLIC_HEADER_STRIP}
${WS_TRANSPORT_BODY}
		}
	}
}`)
		} else {
			// Phase 256-04 (LIVOS-008): installed app subdomains are JWT-gated
			// via livinityd's /auth/verify forward_auth endpoint — which VALIDATES
			// the JWT (signature + exp), NOT mere cookie presence. The previous
			// `@notauth { not { header Cookie *LIVINITY_SESSION=* } }` glob admitted
			// any `LIVINITY_SESSION=<garbage>` cookie. forward_auth proxies the
			// request headers (incl. the cookie) to :8080/auth/verify; on a 401 the
			// handle_response branch redirects to /login. The reverse_proxy (with the
			// OpenDesign upstreamBearer + loopback Host/Origin rewrite) now runs ONLY
			// after a positive auth decision, which also closes the LIVOS-037 residual
			// (the pre-auth loopback rewrite no longer fires on forged-cookie requests).
			// Phase 257-06 (LIVOS-035): the upstreamBearer is read verbatim from
			// the app's compose (readAppDaemonToken only trims + unwraps ${VAR:-x}
			// + rejects `${`), so a hostile app could ship a token containing a
			// double-quote + newline + brace and inject ARBITRARY Caddy config
			// here. Validate against a strict charset before interpolation: emit
			// the bearer (and its Host/Origin loopback rewrite) ONLY when the
			// token matches; otherwise omit the line entirely. A malformed/hostile
			// token must NEVER break out into the generated Caddyfile.
			const safeBearer =
				sub.upstreamBearer && /^[A-Za-z0-9._-]+$/.test(sub.upstreamBearer)
					? sub.upstreamBearer
					: undefined
			// Phase 258 WS-B (258-02) — the gated catch-all body, refactored out of the
			// inline emit so it is the SINGLE source of the 256-04 forward_auth gate. Both
			// the `none`/absent path (SC5 byte-equivalence — must stay character-identical
			// to the pre-258 emit, with AND without the 257-06 safeBearer) and the
			// paths-mode carve-out below reuse THIS verbatim. The daemon bearer
			// (`header_up Authorization`) is emitted ONLY here — never in a public block.
			// Phase 259 — on a 401 the gate bounces a (possibly logged-in) operator
			// through the cross-subdomain SSO handshake at the apex instead of straight
			// to /login. The host-only LIVINITY_SESSION cookie never reaches THIS app
			// host, so /auth/verify always 401s for a browser nav; /__livos_sso (which
			// DOES receive the apex cookie) validates the session and bounces back to
			// /__livos_auth here to set a host-scoped cookie. A genuinely logged-out
			// operator falls through /__livos_sso → /login (no loop).
			const gatedHandleBody = `\tforward_auth 127.0.0.1:8080 {
\t\turi /auth/verify
\t\tcopy_headers Cookie
\t\t@bad status 401
\t\thandle_response @bad {
\t\t\tredir https://${config.mainDomain}/__livos_sso?return={scheme}://{host}{uri}
\t\t}
\t}
\treverse_proxy 127.0.0.1:${sub.port} {
${safeBearer ? `\t\theader_up Authorization "Bearer ${safeBearer}"\n\t\theader_up Host 127.0.0.1:${sub.port}\n\t\theader_up Origin http://127.0.0.1:${sub.port}\n` : ''}${WS_TRANSPORT_BODY}
\t}`

			// Phase 259 — the UNGATED SSO landing carve-out. /__livos_auth must reach
			// livinityd (:8080), NOT the app port, and must bypass forward_auth (the
			// browser has no valid cookie yet — that's the whole point). Emitted FIRST
			// (first-match-wins) in every block that still carries a gated catch-all
			// (none + paths modes). Header-stripped like every other carve-out; NO
			// daemon bearer (that is gated-catch-all only). whole-app blocks have no
			// gate so they need no SSO landing.
			const ssoAuthHandle = `\thandle /__livos_auth* {
${PUBLIC_HEADER_STRIP}
\t\treverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
\t\t}
\t}`

			// Phase 258 WS-B (258-02) — PUBLIC-ACCESS CARVE-OUT (SC1/SC2/SC4/SC5). When the
			// operator has activated public access (sub.publicAccess.mode !== 'none'), split
			// the subdomain into mutually-exclusive `handle` blocks. The header strip
			// (PUBLIC_HEADER_STRIP) is NON-CONFIGURABLE and present in EVERY public block;
			// the daemon bearer is GATED-ONLY (lives in gatedHandleBody, never a public
			// block). Caddy is first-match-wins on `handle` blocks → public path handles are
			// emitted BEFORE the gated catch-all (which has no matcher) so a public prefix
			// matches the public block and every other path falls through to the gate.
			// NOTE-1: this routing is enforced ONLY here in the single-user branch; see the
			// multi-user branch above for the bypass caveat.
			const pub = sub.publicAccess
			if (pub && pub.mode === 'whole-app') {
				// whole-app — the app provides its OWN auth. Drop the gated catch-all
				// entirely; emit a SINGLE header-stripped reverse_proxy. No forward_auth,
				// NO daemon bearer (the bearer must never ride a public route).
				blocks.push(`${fullDomain} {
\thandle {
${PUBLIC_HEADER_STRIP}
\t\treverse_proxy 127.0.0.1:${sub.port} {
${WS_TRANSPORT_BODY}
\t\t}
\t}
}`)
			} else if (pub && pub.mode === 'paths' && pub.paths.length > 0) {
				// paths — specific prefixes are public on an otherwise-gated subdomain.
				// Emit one header-stripped public `handle <prefix>*` per prefix FIRST, then
				// the unchanged gated catch-all LAST. Defense in depth (mirrors the 257-06
				// safeBearer charset gate): skip any prefix containing whitespace, brace, or
				// quote so a hostile manifest path can never break out of the Caddyfile.
				const publicBlocks: string[] = []
				for (const prefix of pub.paths) {
					if (/[\s{}"]/.test(prefix)) continue
					publicBlocks.push(`\thandle ${prefix}* {
${PUBLIC_HEADER_STRIP}
\t\treverse_proxy 127.0.0.1:${sub.port} {
${WS_TRANSPORT_BODY}
\t\t}
\t}`)
				}
				blocks.push(`${fullDomain} {
${ssoAuthHandle}
${publicBlocks.join('\n')}
\thandle {
${gatedHandleBody.replace(/^\t/gm, '\t\t')}
\t}
}`)
			} else {
				// 'none' / absent / empty-paths — the 256-04 gated block PLUS the Phase 259
				// SSO landing carve-out. The gated body is wrapped in a matcher-less
				// `handle {}` so /__livos_auth (emitted first) wins on first-match; every
				// other path still falls through to the unchanged forward_auth gate.
				blocks.push(`${fullDomain} {
${ssoAuthHandle}
\thandle {
${gatedHandleBody.replace(/^\t/gm, '\t\t')}
\t}
}`)
			}
		}
	}

	// Native app subdomains — JWT-gated via cookie check.
	// Redirects to login page if no LIVINITY_SESSION cookie is present.
	// Streaming apps get stream_close_delay (survive Caddy reloads) and stream_timeout (max session length).
	for (const nApp of nativeApps) {
		const fullDomain = `${prefix}${nApp.subdomain}.${config.mainDomain}`
		const reverseProxyLine = nApp.streaming
			? `reverse_proxy 127.0.0.1:${nApp.port} {
${WS_TRANSPORT_BODY}
		stream_close_delay 5m
		stream_timeout 24h
	}`
			: `reverse_proxy 127.0.0.1:${nApp.port} {
${WS_TRANSPORT_BODY}
	}`

		// Phase 256-04 (LIVOS-008): native-app subdomains are JWT-gated via the
		// livinityd /auth/verify forward_auth endpoint (validates the JWT, not
		// cookie presence). On a 401 the handle_response branch redirects to /login.
		blocks.push(`${fullDomain} {
	forward_auth 127.0.0.1:8080 {
		uri /auth/verify
		copy_headers Cookie
		@bad status 401
		handle_response @bad {
			redir https://${config.mainDomain}/login?redirect={scheme}://{host}{uri}
		}
	}
	${reverseProxyLine}
}`)
	}

	// Phase 219 hotfix — prepend the CF trusted_proxies global block so
	// every operator running LivOS behind Cloudflare (proxy on, SSL Flexible
	// or even Full) is protected from the 308 redirect loop that breaks the
	// login page. Harmless when CF is not in front.
	return applyCsp(CADDY_GLOBAL_BLOCK + '\n' + blocks.join('\n\n') + '\n')
}

// ─── Phase 104 plan 104-03 — local-lan generator RETIRED in Phase 142-01 ──
// The `generateLocalCaddyfile` + `validateLocalTld` pair backed the dnsmasq
// + Caddy internal-CA mode (--mode local-lan). Phase 142-01 retired both.
// Phase 143-03 finishes the polish: `LocalSubdomainConfig` → `PortalSubdomainConfig`
// (the type's only consumer is the portal generator below, formerly hybrid).

/**
 * Per-subdomain routing hint for the portal Caddyfile generator.
 * Phase 143-03 rename: was `LocalSubdomainConfig` (legacy from local-lan).
 */
export interface PortalSubdomainConfig {
	name: string
	port: number
}

/**
 * @deprecated Phase 143-03 — alias of `PortalSubdomainConfig`. Kept as a
 * type-only export for any external caller still importing the legacy name;
 * delete in Phase 144+ after consumers have migrated.
 */
export type LocalSubdomainConfig = PortalSubdomainConfig

const IPV4_RE_CADDY =
	/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/

// ─── Phase 104 plan 104-04 — portal mode generator + validator ─────────
// Phase 143-03 — renamed from `Hybrid*` to `Portal*` (carries through the
// Phase 142-02 user-facing rename to the API surface).

/**
 * Validate a portal-mode domain shape. Accepts user-owned domains AND the
 * LivOS-provisioned <random>.home.livinity.io pattern. Rejects:
 *   - .local TLD (Phase 142-01: local-lan retired; this guard remains as a
 *     defensive sanity check for any caller that hasn't migrated yet)
 *   - IP-shaped strings
 *   - Path-traversal patterns
 *   - Domains shorter than two labels (TLDs alone)
 */
const PORTAL_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

export function validatePortalDomain(domain: string): boolean {
	if (typeof domain !== 'string') return false
	if (domain.length === 0 || domain.length > 253) return false
	if (domain.includes('..') || domain.includes('/')) return false
	if (IPV4_RE_CADDY.test(domain)) return false
	if (domain.endsWith('.local')) return false // portal path is NOT for .local
	return PORTAL_DOMAIN_RE.test(domain)
}

/**
 * @deprecated Phase 143-03 — alias of `validatePortalDomain`. Kept as a
 * named export so external callers using the legacy name still work; remove
 * in Phase 144+ once consumers have migrated.
 */
export const validateHybridDomain = validatePortalDomain

/**
 * Generate a Caddyfile for portal mode. Uses Cloudflare DNS-01 for Let's Encrypt
 * wildcard cert issuance — no internal PKI, no CA enrollment needed on clients.
 *
 * The `dns cloudflare {env.CLOUDFLARE_API_TOKEN}` directive requires the
 * `caddy-dns/cloudflare` plugin (xcaddy build OR official caddy with cf plugin).
 * Token is loaded via systemd EnvironmentFile=/etc/livos/secrets/cf-token.
 *
 * Per D-104-NO-PROD-IMPACT: this is purely ADDITIVE — generateFullCaddyfile is
 * not modified. Per D-104-RELAY-ZERO-DATA-PLANE: this generator emits ONLY
 * reverse_proxy entries pointing at 127.0.0.1 — data-plane stays LAN-direct.
 * Server5 is touched ONLY for (a) one-time subdomain mint and (b) periodic
 * ACME DNS-01 TXT writes; neither path is in this Caddyfile output.
 */
export function generatePortalCaddyfile(
	portalDomain: string,
	subdomains: PortalSubdomainConfig[] = [],
	multiUser: boolean = true,
): string {
	const blocks: string[] = []

	// Wildcard virtual host with Cloudflare DNS-01 ACME
	blocks.push(`*.${portalDomain} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY_LOCAL}
    }
}`)

	// Bare apex virtual host (same cert)
	blocks.push(`${portalDomain} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY_LOCAL}
    }
}`)

	// Per-subdomain custom port routing (multi-user app gateway hint)
	if (multiUser) {
		for (const sub of subdomains) {
			blocks.push(`${sub.name}.${portalDomain} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:${sub.port} {
${WS_TRANSPORT_BODY_LOCAL}
    }
}`)
		}
	}

	// Phase 219 hotfix — portal mode operators are EVEN more likely to be
	// behind CF (it's the canonical setup), so the global trusted_proxies
	// block matters most here. Same harmless-without-CF property.
	return CADDY_GLOBAL_BLOCK + '\n' + blocks.join('\n\n') + '\n'
}

/**
 * @deprecated Phase 143-03 — alias of `generatePortalCaddyfile`. Kept as a
 * named export so external callers using the legacy name still work; remove
 * in Phase 144+ once consumers have migrated.
 */
export const generateHybridCaddyfile = generatePortalCaddyfile

/**
 * Generate a simple Caddyfile for just the main domain (legacy support).
 */
export function generateCaddyfile(domain: string): string {
	if (!validateDomain(domain)) {
		throw new Error('Invalid domain name')
	}
	return `${CADDY_GLOBAL_BLOCK}
${domain} {
	reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
	}
}
`
}

/**
 * Generate the default IP-only Caddyfile (no HTTPS, port 80 only).
 */
export function generateDefaultCaddyfile(): string {
	return `${CADDY_GLOBAL_BLOCK}
:80 {
	reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
	}
}
`
}

/**
 * Write content to the Caddyfile on disk.
 */
export async function writeCaddyfile(content: string): Promise<void> {
	await writeFile(CADDYFILE_PATH, content, 'utf-8')
}

/**
 * Reload Caddy to pick up Caddyfile changes.
 * Uses `caddy reload` which applies changes without downtime.
 */
export async function reloadCaddy(): Promise<void> {
	await execAsync(`caddy reload --config ${CADDYFILE_PATH}`)
}

/**
 * Apply a full Caddy configuration with main domain and subdomains.
 * Ensures firewall ports are open before applying.
 */
export async function applyCaddyConfig(config: CaddyConfig, tunnel = false, nativeApps: Array<{subdomain: string; port: number; streaming?: boolean}> = []): Promise<{firewallResult: {success: boolean; method: string; message: string}}> {
	const firewallResult = await ensureFirewallPorts()
	const content = generateFullCaddyfile(config, false, tunnel, nativeApps)
	await writeCaddyfile(content)
	await reloadCaddy()
	return {firewallResult}
}

/**
 * Activate a domain: ensures firewall ports are open, writes the
 * domain Caddyfile, and reloads Caddy.
 * After this, Caddy will automatically obtain a Let's Encrypt cert.
 */
export async function activateDomain(domain: string): Promise<{firewallResult: {success: boolean; method: string; message: string}}> {
	const firewallResult = await ensureFirewallPorts()
	const content = generateCaddyfile(domain)
	await writeCaddyfile(content)
	await reloadCaddy()
	return {firewallResult}
}

/**
 * Remove the domain and revert to IP-only access on port 80.
 */
export async function removeDomain(): Promise<void> {
	const content = generateDefaultCaddyfile()
	await writeCaddyfile(content)
	await reloadCaddy()
}

/** Simple Caddy config for tunnel mode — tunnel handles HTTPS, Caddy just reverse proxies */
export async function applyCaddyConfigForTunnel(): Promise<void> {
	const caddyfile = `:80 {
\treverse_proxy localhost:8080 {
${WS_TRANSPORT_BODY}
\t}
}
`
	await fse.writeFile('/etc/caddy/Caddyfile', caddyfile)
	await $({reject: false})`caddy reload --config /etc/caddy/Caddyfile`
}

/** Revert Caddy to default IP-only config */
export async function revertCaddyToDefault(): Promise<void> {
	const caddyfile = `:80 {
\treverse_proxy localhost:8080 {
${WS_TRANSPORT_BODY}
\t}
}
`
	await fse.writeFile('/etc/caddy/Caddyfile', caddyfile)
	await $({reject: false})`caddy reload --config /etc/caddy/Caddyfile`
}
