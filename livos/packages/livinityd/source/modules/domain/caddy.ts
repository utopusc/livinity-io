import {writeFile} from 'node:fs/promises'
import {exec} from 'node:child_process'
import {promisify} from 'node:util'
import fse from 'fs-extra'
import {$} from 'execa'
import {ensureFirewallPorts} from './firewall.js'

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
 * Phase 201-06 → Phase 203-03 (D-203-05) → Phase 203-09 → Phase 203-10 — Liv
 * AI surface routing. Two co-existing surfaces share the `/liv-ai-app/*` URL
 * prefix:
 *
 *   1. Openclaw claw-gateway at 127.0.0.1:18789 owns the desktop-style chat
 *      experience under `/liv-ai-app/openclawos[/*]`. The gateway's in-process
 *      plugin (livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts)
 *      registers its static-file route at the upstream-canonical
 *      `/plugins/openclawos` path (matching upstream openclaw-os). Caddy uses
 *      `handle_path` to strip the external `/liv-ai-app/openclawos` prefix +
 *      a `rewrite` directive to prepend `/plugins/openclawos` so the gateway
 *      receives the URL shape its plugin already matches. Phase 203-09
 *      handoff note: pre-203-10 the gateway received bare `/` paths and
 *      404'd; the rewrite below closes that gap.
 *
 *   2. Next.js Phase 202 subapp at 127.0.0.1:3010 owns the agents +
 *      settings dashboard at `/liv-ai-app/agents[/...]` and
 *      `/liv-ai-app/settings[/...]`, PLUS the new Phase 203-10/11 routes
 *      `/liv-ai-app/icons/*` (placeholder SVG) and `/liv-ai-app/apps/<slug>`
 *      (standalone OpenUI app page). Per Phase 203-09 the `@assistant-ui`
 *      chat surface that previously lived at `/` is GONE; the subapp now
 *      only serves the Phase 202+203-10/11 routes (plus a `/` → `/agents`
 *      redirect stub for dev port-direct access).
 *
 * Ordering — Caddy evaluates `handle` blocks by path-matcher specificity,
 * not source order, so emitting the openclawos handle alongside the bare
 * `/liv-ai-app/*` handle is safe: the longer-prefix matcher wins for
 * openclawos paths and the shorter matcher catches the rest. We still emit
 * the openclawos handle FIRST for readability and so a future maintainer
 * sees the two are paired.
 *
 * History — pre-203-03 routed the bare prefix to a vanished Next.js subapp
 * (livos-app-liv-ai.service). Phase 203-03 unified everything onto :18789.
 * Phase 203-09 splits it again because the Phase 202 dashboard (kept by
 * INV-203-09 contract) lives on the Next.js subapp and would otherwise be
 * shadowed by the gateway. Phase 203-10 adds the `/plugins/openclawos`
 * rewrite for the gateway path so the gateway's plugin URL match succeeds.
 */
// Phase 203 Hot-fix C addendum 2026-05-24: rewrite target corrected to
// `/plugins/openclawos{path}` (was `/openclawos{path}`). Plan 203-10 inline
// comment above already specified the correct intent; the code emitted the
// wrong path which caused the gateway to serve its stock `/openclawos` root
// (claw-control UI, `<title>OpenClaw Control</title>`) instead of the plugin's
// rebranded `/plugins/openclawos` static export (`<title>Liv AI</title>`).
//
// Companion `handle /plugins/openclawos*` block proxies Next.js static export
// asset requests: the export's basePath is `/plugins/openclawos`, so the HTML
// references `_next/`/asset URLs as `/plugins/openclawos/_next/...`. Browsers
// would hit that path on the apex host (bruce.livinity.io) which has no other
// handle for it — the additional handle steers those asset hits to :18789
// where the plugin's `registerHttpRoute` already serves them.
// Phase 203 Hot-fix D 2026-05-24 — operator-facing URL rename. The internal
// gateway plugin path is `/plugins/openclawos` (openclaw's immutable plugin
// id). Operator sees `/liv-ai-app/liv-ai` instead of the legacy
// `/liv-ai-app/openclawos` so the URL bar reads "Liv AI" rather than the
// upstream codename. Both prefixes coexist (back-compat for any persisted
// bookmark, deep link, or in-flight iframe src) — they rewrite to the same
// upstream `/plugins/openclawos{path}` so a single gateway-side route serves
// them both.
//
// Ordering note (handle vs handle_path): Caddy evaluates by matcher
// specificity, NOT source order. The two `handle_path` blocks are disjoint
// (different external prefix matchers), so emit order is purely cosmetic
// — putting `/liv-ai-app/liv-ai` first reads top-to-bottom matching what
// operators type into the URL bar.
// Phase 218 T1 follow-up — `handle_path` in Caddy v2 only accepts a SINGLE
// path matcher. The original two-arg form (`handle_path /a /a/* { ... }`)
// silently never reached production because the static install.sh Caddyfile
// was never overwritten by livinityd's dynamic regen path. Phase 218 T1+T5
// made the regen actually deploy, surfacing the parse error
//   `wrong argument count or unexpected line ending after '/liv-ai-app/liv-ai/*'`
// Fix: switch to a named `path` matcher (which DOES accept multiple values)
// + `handle` + an explicit `uri strip_prefix` to recreate handle_path's
// prefix-stripping behavior.
const LIV_AI_APP_HANDLE = `\t@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*
\thandle @livAiLivAi {
\t\turi strip_prefix /liv-ai-app/liv-ai
\t\trewrite * /plugins/openclawos{path}
\t\treverse_proxy 127.0.0.1:18789 {
${WS_TRANSPORT_BODY}
\t}
\t}
\t@livAiOpenclawos path /liv-ai-app/openclawos /liv-ai-app/openclawos/*
\thandle @livAiOpenclawos {
\t\turi strip_prefix /liv-ai-app/openclawos
\t\trewrite * /plugins/openclawos{path}
\t\treverse_proxy 127.0.0.1:18789 {
${WS_TRANSPORT_BODY}
\t}
\t}
\t@openclawosPluginAssets path /plugins/openclawos /plugins/openclawos/*
\thandle @openclawosPluginAssets {
\t\treverse_proxy 127.0.0.1:18789 {
${WS_TRANSPORT_BODY}
\t}
\t}
\t@livaiSubapp path /liv-ai-app /liv-ai-app/*
\thandle @livaiSubapp {
\t\treverse_proxy 127.0.0.1:3010 {
${WS_TRANSPORT_BODY}
\t}
\t}`

/**
 * Phase 203-05 (D-203-12 / INV-203-10) — `/openclawos/handshake` is the
 * outer-auth bridge: parent UI (LIVINITY_SESSION JWT cookie) POSTs here, and
 * livinityd on :8080 mints a 5-minute Ed25519 openclaw device token that the
 * iframe forwards to the openclaw gateway WebSocket handshake.
 *
 * This handle MUST emit BEFORE `LIV_AI_APP_HANDLE` so Caddy's first-match-wins
 * matcher steers the handshake POST to livinityd (:8080) instead of the
 * gateway (:18789). The gateway has no idea what LIVINITY_SESSION means; only
 * livinityd can verify it.
 *
 * INV-203-08 PASS — this is the ONLY second routing surface added in Phase 203.
 * Apex + subdomain + every other path stays unchanged.
 */
const OPENCLAWOS_HANDSHAKE_HANDLE = `\thandle /openclawos/handshake {
\t\treverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
\t}
\t}`

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
const LIV_ASSISTANT_HANDLE = `\t@liv path /liv /liv/*
\thandle @liv {
\t\turi strip_prefix /liv
\t\treverse_proxy 127.0.0.1:3020 {
\t\t\theader_down -X-Frame-Options
\t\t\theader_down -Content-Security-Policy
${WS_TRANSPORT_BODY}
\t\t}
\t\theader Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
\t}`

/**
 * Generate a complete Caddyfile with main domain and all subdomains.
 * In multi-user mode, uses a single wildcard block that routes all subdomains
 * to livinityd's app gateway (port 8080) for dynamic per-user routing.
 * In single-user mode, uses individual per-subdomain blocks (legacy behavior).
 */
export function generateFullCaddyfile(config: CaddyConfig, multiUser = false, tunnel = false, nativeApps: Array<{subdomain: string; port: number; streaming?: boolean}> = []): string {
	const blocks: string[] = []

	if (!config.mainDomain) {
		// No domain configured — minimal :80 fallback. Multi-user / subdomain
		// routing requires a domain. Liv AI claw-gateway handle still goes
		// ABOVE the catch-all so dev/IP-only operators can also reach :18789.
		blocks.push(`:80 {
${OPENCLAWOS_HANDSHAKE_HANDLE}
${LIV_AI_APP_HANDLE}
${LIV_BRANDING_HANDLE}
${LIV_ASSISTANT_HANDLE}
	handle {
		reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
		}
	}
}`)
		// Phase 219 hotfix — CF global block harmless even without a domain (no
		// auto-HTTPS kicks in on :80-only configs) but keeps the file structure
		// consistent.
		return CADDY_GLOBAL_BLOCK + '\n' + blocks.join('\n\n') + '\n'
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

	// Main domain block — openclaw handshake bridge first (Phase 203-05),
	// then Liv AI subapp handle, then livinityd catch-all.
	blocks.push(`${prefix}${config.mainDomain} {
${apexCacheHeader}${OPENCLAWOS_HANDSHAKE_HANDLE}
${LIV_AI_APP_HANDLE}
${LIV_BRANDING_HANDLE}
${LIV_ASSISTANT_HANDLE}
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
			blocks.push(`${fullDomain} {
${OPENCLAWOS_HANDSHAKE_HANDLE}
${LIV_AI_APP_HANDLE}
${LIV_BRANDING_HANDLE}
${LIV_ASSISTANT_HANDLE}
	handle {
		reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
		}
	}
}`)
		} else {
			blocks.push(`${fullDomain} {
	reverse_proxy 127.0.0.1:${sub.port} {
${WS_TRANSPORT_BODY}
	}
}`)
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

		blocks.push(`${fullDomain} {
	@notauth {
		not {
			header Cookie *LIVINITY_SESSION=*
		}
	}
	handle @notauth {
		redir https://${config.mainDomain}/login?redirect={scheme}://{host}{uri}
	}
	${reverseProxyLine}
}`)
	}

	// Phase 219 hotfix — prepend the CF trusted_proxies global block so
	// every operator running LivOS behind Cloudflare (proxy on, SSL Flexible
	// or even Full) is protected from the 308 redirect loop that breaks the
	// login page. Harmless when CF is not in front.
	return CADDY_GLOBAL_BLOCK + '\n' + blocks.join('\n\n') + '\n'
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
