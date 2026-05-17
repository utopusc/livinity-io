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
 * Generate a complete Caddyfile with main domain and all subdomains.
 * In multi-user mode, uses a single wildcard block that routes all subdomains
 * to livinityd's app gateway (port 8080) for dynamic per-user routing.
 * In single-user mode, uses individual per-subdomain blocks (legacy behavior).
 */
export function generateFullCaddyfile(config: CaddyConfig, multiUser = false, tunnel = false, nativeApps: Array<{subdomain: string; port: number; streaming?: boolean}> = []): string {
	const blocks: string[] = []

	if (!config.mainDomain) {
		// No domain configured — minimal :80 fallback. Multi-user / subdomain
		// routing requires a domain.
		blocks.push(`:80 {
	reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
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

	// Main domain block — always routes to livinityd
	blocks.push(`${prefix}${config.mainDomain} {
${apexCacheHeader}	reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
	}
}`)

	// Generate subdomain blocks
	for (const sub of config.subdomains) {
		if (!sub.enabled) continue
		if (!validateSubdomain(sub.subdomain)) continue

		const fullDomain = `${prefix}${sub.subdomain}.${config.mainDomain}`
		if (multiUser) {
			blocks.push(`${fullDomain} {
	reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY}
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

// ─── Phase 104 plan 104-03 — local-lan + hybrid mode generators ─────────

/**
 * Local-mode subdomain shape. Differs from the cloud-mode `SubdomainConfig`
 * (which is keyed on `subdomain` + `appId` + Postgres state) because local-lan
 * mode routes per-user app subdomains without the marketplace appId concept.
 *
 * Deviation note (Rule 3): plan 104-03 referenced `SubdomainConfig` for
 * generateLocalCaddyfile but the existing interface is keyed on
 * `subdomain`/`appId`/`enabled`, not the simple `{name, port}` shape the
 * plan needs. Introducing a sibling type keeps cloud-mode parity
 * (D-104-NO-PROD-IMPACT) without bending the call site.
 */
export interface LocalSubdomainConfig {
	name: string
	port: number
}

/**
 * Validate a local-mode TLD shape. Rejects path-traversal patterns, IPv4 strings,
 * and characters outside the conservative DNS-label set.
 * Source: 104-RESEARCH.md §Security Domain V5.
 */
const LOCAL_TLD_RE =
	/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
const IPV4_RE_CADDY =
	/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/

export function validateLocalTld(tld: string): boolean {
	if (typeof tld !== 'string') return false
	if (tld.length === 0 || tld.length > 253) return false
	if (tld.includes('..') || tld.includes('/')) return false
	if (IPV4_RE_CADDY.test(tld)) return false
	return LOCAL_TLD_RE.test(tld)
}

/**
 * Generate a Caddyfile for local-lan mode.
 * Imports /etc/caddy/pki-global.conf at the top (D-104-CADDY-PKI-IMPORT) so the
 * named CA `liv-local` persists across regenerations (Pitfall 1).
 *
 * IMPORTANT: This function does NOT modify generateFullCaddyfile() — cloud mode
 * remains byte-equivalent to deployed SHA dab261cc (D-104-NO-PROD-IMPACT).
 */
export function generateLocalCaddyfile(
	localDomain: string,
	hostIp: string,
	subdomains: LocalSubdomainConfig[] = [],
	multiUser: boolean = true,
): string {
	const blocks: string[] = []

	// First non-blank line MUST be the import directive (test: AC-104-8)
	blocks.push('import /etc/caddy/pki-global.conf')

	// Wildcard virtual host — covers *.bruce.livinity.local, *.alice.livinity.local, etc.
	blocks.push(`*.${localDomain} {
    tls {
        issuer internal {
            ca liv-local
        }
    }
    reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY_LOCAL}
    }
}`)

	// Bare-domain virtual host
	blocks.push(`${localDomain} {
    tls {
        issuer internal {
            ca liv-local
        }
    }
    reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY_LOCAL}
    }
}`)

	// HTTP-only block for CA root download — listed by both name AND IP so
	// pre-trust clients can fetch the cert without name resolution.
	blocks.push(`http://${localDomain}, http://${hostIp} {
    handle /api/local/ca.crt {
        root * /var/lib/caddy/.local/share/caddy/pki/authorities/liv-local
        rewrite * /root.crt
        file_server
    }
    handle {
        reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY_LOCAL}
        }
    }
}`)

	// Optional per-subdomain custom port routing (multi-user app gateway hint)
	if (multiUser) {
		for (const sub of subdomains) {
			blocks.push(`${sub.name}.${localDomain} {
    tls {
        issuer internal {
            ca liv-local
        }
    }
    reverse_proxy 127.0.0.1:${sub.port} {
${WS_TRANSPORT_BODY_LOCAL}
    }
}`)
		}
	}

	return blocks.join('\n\n') + '\n'
}

// ─── Phase 104 plan 104-04 — hybrid mode generator + validator ─────────

/**
 * Validate a hybrid-mode domain shape. Accepts user-owned domains AND the
 * LivOS-provisioned <random>.home.livinity.io pattern. Rejects:
 *   - .local TLD (caller should route to generateLocalCaddyfile instead)
 *   - IP-shaped strings
 *   - Path-traversal patterns
 *   - Domains shorter than two labels (TLDs alone)
 */
const HYBRID_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

export function validateHybridDomain(domain: string): boolean {
	if (typeof domain !== 'string') return false
	if (domain.length === 0 || domain.length > 253) return false
	if (domain.includes('..') || domain.includes('/')) return false
	if (IPV4_RE_CADDY.test(domain)) return false
	if (domain.endsWith('.local')) return false // hybrid path is NOT for .local
	return HYBRID_DOMAIN_RE.test(domain)
}

/**
 * Generate a Caddyfile for hybrid mode. Uses Cloudflare DNS-01 for Let's Encrypt
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
export function generateHybridCaddyfile(
	hybridDomain: string,
	subdomains: LocalSubdomainConfig[] = [],
	multiUser: boolean = true,
): string {
	const blocks: string[] = []

	// Wildcard virtual host with Cloudflare DNS-01 ACME
	blocks.push(`*.${hybridDomain} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:8080 {
${WS_TRANSPORT_BODY_LOCAL}
    }
}`)

	// Bare apex virtual host (same cert)
	blocks.push(`${hybridDomain} {
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
			blocks.push(`${sub.name}.${hybridDomain} {
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
