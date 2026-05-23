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
 * Phase 201-06 → Phase 203-03 (D-203-05) — Liv AI claw gateway listens on
 * 127.0.0.1:18789 and serves the rebranded openclaw claw-client at
 * `/plugins/openclawos` (plugin HTTP route — see @livos/liv-claw-os
 * packages/claw-plugin/src/index.ts ROUTE_PREFIX).
 *
 * For the Liv AI dock icon iframe to load the claw-client, every per-user
 * vhost (apex + multiUser subdomain blocks) must first match BOTH
 * `/liv-ai-app` (the bare prefix the iframe src uses) AND `/liv-ai-app/*`
 * (every asset / WS path) and route them to :18789 BEFORE falling through to
 * the livinityd app gateway on :8080.
 *
 * History — pre-203-03 this routed to the legacy Phase 201 Next.js subapp
 * (livos-app-liv-ai.service) on :3010. Phase 203-12 (Mini PC deploy walk)
 * retires that unit; this routing change is the single Caddy mutation that
 * flips the Liv AI surface to the openclaw runtime (INV-203-08).
 *
 * Caddy `handle` only accepts a single path matcher inline, so we declare a
 * named matcher `@livai` covering both shapes and use it with
 * `handle @livai`. First-match-wins ordering means the default
 * `handle { reverse_proxy 127.0.0.1:8080 ... }` placed after still catches
 * everything else (Phase 201 hotfix 2026-05-23 — bare prefix was leaking to
 * livinityd UI, IframeChecker self-protection then refused to mount the
 * iframe with "LivOS cannot be embedded in an iframe.").
 */
const LIV_AI_APP_HANDLE = `\t@livai path /liv-ai-app /liv-ai-app/*
\thandle @livai {
\t\treverse_proxy 127.0.0.1:18789 {
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
	handle {
		reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
		}
	}
}`)
		return blocks.join('\n\n') + '\n'
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

	return blocks.join('\n\n') + '\n'
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

	return blocks.join('\n\n') + '\n'
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
	return `${domain} {
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
	return `:80 {
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
