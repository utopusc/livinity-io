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
// ─────────────────────────────────────────────────────────────────

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
export function generateFullCaddyfile(config: CaddyConfig, multiUser = false, tunnel = false, nativeApps: Array<{subdomain: string; port: number}> = []): string {
	const blocks: string[] = []

	if (!config.mainDomain || tunnel) {
		// No domain configured OR tunnel mode — Caddy just reverse proxies on :80
		// When using Cloudflare Tunnel, HTTPS is terminated at the Cloudflare edge.
		// Caddy must NOT use domain blocks (they trigger automatic HTTPS + redirects).
		blocks.push(`:80 {
	reverse_proxy 127.0.0.1:8080
}`)
		return blocks.join('\n\n') + '\n'
	}

	// Main domain block — always routes to livinityd
	blocks.push(`${config.mainDomain} {
	reverse_proxy 127.0.0.1:8080
}`)

	// Generate subdomain blocks
	for (const sub of config.subdomains) {
		if (!sub.enabled) continue
		if (!validateSubdomain(sub.subdomain)) continue

		const fullDomain = `${sub.subdomain}.${config.mainDomain}`
		if (multiUser) {
			blocks.push(`${fullDomain} {
	reverse_proxy 127.0.0.1:8080
}`)
		} else {
			blocks.push(`${fullDomain} {
	reverse_proxy 127.0.0.1:${sub.port}
}`)
		}
	}

	// Native app subdomains — JWT-gated via cookie check
	// Redirects to login page if no livinity_token cookie is present
	for (const nApp of nativeApps) {
		if (!config.mainDomain) continue
		const fullDomain = `${nApp.subdomain}.${config.mainDomain}`
		blocks.push(`${fullDomain} {
	@notauth {
		not {
			header Cookie *livinity_token=*
		}
	}
	handle @notauth {
		redir https://${config.mainDomain}/login?redirect={scheme}://{host}{uri}
	}
	reverse_proxy 127.0.0.1:${nApp.port}
}`)
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
	reverse_proxy 127.0.0.1:8080
}
`
}

/**
 * Generate the default IP-only Caddyfile (no HTTPS, port 80 only).
 */
export function generateDefaultCaddyfile(): string {
	return `:80 {
	reverse_proxy 127.0.0.1:8080
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
export async function applyCaddyConfig(config: CaddyConfig, tunnel = false): Promise<{firewallResult: {success: boolean; method: string; message: string}}> {
	const firewallResult = await ensureFirewallPorts()
	const content = generateFullCaddyfile(config, false, tunnel)
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
\treverse_proxy localhost:8080
}
`
	await fse.writeFile('/etc/caddy/Caddyfile', caddyfile)
	await $({reject: false})`caddy reload --config /etc/caddy/Caddyfile`
}

/** Revert Caddy to default IP-only config */
export async function revertCaddyToDefault(): Promise<void> {
	const caddyfile = `:80 {
\treverse_proxy localhost:8080
}
`
	await fse.writeFile('/etc/caddy/Caddyfile', caddyfile)
	await $({reject: false})`caddy reload --config /etc/caddy/Caddyfile`
}
