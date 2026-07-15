/**
 * Box-side Cloudflare client for the FREE (bring-your-own-domain) tier.
 *
 * PARITY WITH PRO: this is a faithful port of the per-app subdomain provisioning
 * in `platform/web/src/lib/cf-saas.ts` — same CF API calls (create CNAME + push
 * tunnel ingress), same per-tunnel read-modify-full-replace lock + verify-and-
 * repair (Reliability B1: without it, two concurrent installs silently erase each
 * other's ingress). The ONLY difference is the credential source: instead of the
 * platform's single env-held token minting `<app>-<user>.livinity.io`, the box
 * uses the OPERATOR's own CF API token to mint `<app>-<user>.<theirdomain>` on
 * THEIR own zone.
 *
 * cf-saas.ts cannot be imported (different npm workspace, `makeClient` un-exported)
 * — hence this ~self-contained port. No Bottleneck dependency: a single box makes
 * far fewer CF calls than the multi-tenant platform, and the per-tunnel lock plus
 * the retry policy below are sufficient.
 *
 * tunnel_id + account_id are NOT stored separately — they are decoded from the
 * operator's `--cf-tunnel-token` (the cloudflared connector blob is base64 JSON
 * `{a: accountTag, t: tunnelID, s: secret}`), so a free box needs only two
 * operator inputs: the tunnel token (connectivity) + the API token (DNS/ingress).
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const PER_CALL_TIMEOUT_MS = 8000
const MAX_RETRIES = 3
const BACKOFF_BASE_MS = [200, 800, 3200] as const

export interface CfIngress {
	hostname?: string
	service: string
	originRequest?: Record<string, unknown>
	path?: string
}

export interface LocalCfConfig {
	/** The operator's CF API token (Zone:DNS:Edit). */
	apiToken: string
	/** CF account tag/id, decoded from the tunnel connector token. */
	accountId: string
	/** CF Tunnel id, decoded from the tunnel connector token. */
	tunnelId: string
	/** The DNS zone id for the operator's registrable domain. */
	zoneId: string
	/** The box's apex FQDN, e.g. `bruce.bruceoz.com`. Per-app hosts prepend `<app>-`. */
	apex: string
}

export class CfLocalError extends Error {
	readonly status: number
	readonly endpoint: string
	constructor(message: string, status: number, endpoint: string) {
		super(message)
		this.name = 'CfLocalError'
		this.status = status
		this.endpoint = endpoint
	}
}

interface CfEnvelope<T> {
	success: boolean
	errors: Array<{code: number; message: string}>
	result: T
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitter(ms: number): number {
	const delta = ms * 0.25
	return Math.round(ms + (Math.random() * 2 - 1) * delta)
}

function shouldRetry(status: number, errCode?: string): boolean {
	if (errCode === 'ECONNRESET' || errCode === 'ETIMEDOUT' || errCode === 'UND_ERR_CONNECT_TIMEOUT') return true
	if (status === 429) return true
	if (status >= 500 && status <= 599) return true
	return false
}

async function callCf<T>(
	token: string,
	opts: {method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown},
): Promise<T> {
	const url = `${CF_API_BASE}${opts.path}`
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
	}

	let lastError: unknown = null
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS)
		try {
			const res = await fetch(url, {
				method: opts.method,
				headers,
				body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
				signal: controller.signal,
			})
			clearTimeout(timer)

			const text = await res.text()
			let json: CfEnvelope<T> | null = null
			if (text.length > 0) {
				try {
					json = JSON.parse(text) as CfEnvelope<T>
				} catch {
					json = null
				}
			}

			if (!res.ok) {
				if (shouldRetry(res.status) && attempt < MAX_RETRIES) {
					await sleep(jitter(BACKOFF_BASE_MS[attempt]))
					continue
				}
				const cfError = json?.errors?.[0]
				throw new CfLocalError(
					`CF ${opts.method} ${opts.path} failed: ${res.status} ${cfError?.message ?? text.slice(0, 200)}`,
					res.status,
					`${opts.method} ${opts.path}`,
				)
			}
			if (!json) return undefined as T
			if (!json.success) {
				const cfError = json.errors?.[0]
				throw new CfLocalError(
					`CF ${opts.method} ${opts.path} success=false: ${cfError?.message ?? 'unknown'}`,
					res.status,
					`${opts.method} ${opts.path}`,
				)
			}
			return json.result
		} catch (err) {
			clearTimeout(timer)
			lastError = err
			if (err instanceof CfLocalError) throw err
			const e = err as NodeJS.ErrnoException & {name?: string}
			const errCode = e?.code ?? (e?.name === 'AbortError' ? 'ETIMEDOUT' : undefined)
			if (shouldRetry(0, errCode) && attempt < MAX_RETRIES) {
				await sleep(jitter(BACKOFF_BASE_MS[attempt]))
				continue
			}
			throw new CfLocalError(
				`CF ${opts.method} ${opts.path} failed: ${e?.message ?? String(err)}`,
				0,
				`${opts.method} ${opts.path}`,
			)
		}
	}
	throw new CfLocalError(
		`CF ${opts.method} ${opts.path} exhausted retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
		0,
		`${opts.method} ${opts.path}`,
	)
}

// ─── Pure helpers (unit-tested) ────────────────────────────────────────────

/**
 * Decode a cloudflared connector token into its account tag + tunnel id.
 * The token is base64(JSON `{"a": accountTag, "t": tunnelID, "s": secret}`).
 * Returns null on any malformed input (caller falls back to the platform path).
 */
export function decodeTunnelToken(token: string): {accountId: string; tunnelId: string} | null {
	try {
		const trimmed = token.trim()
		if (!trimmed) return null
		const json = Buffer.from(trimmed, 'base64').toString('utf8')
		const parsed = JSON.parse(json) as {a?: unknown; t?: unknown}
		if (typeof parsed.a !== 'string' || typeof parsed.t !== 'string') return null
		if (!parsed.a || !parsed.t) return null
		return {accountId: parsed.a, tunnelId: parsed.t}
	} catch {
		return null
	}
}

/**
 * Parse the CF API token out of the on-disk secret. writeCfTokenSecret (and the
 * install script) write env-file format `CLOUDFLARE_API_TOKEN=<token>`; tolerate
 * a bare token too.
 */
export function parseCfApiTokenSecret(raw: string): string | null {
	const text = raw.trim()
	if (!text) return null
	const m = text.match(/^\s*(?:export\s+)?CLOUDFLARE_API_TOKEN\s*=\s*(.+?)\s*$/m)
	if (m) return m[1].replace(/^["']|["']$/g, '').trim() || null
	// Bare token (no env-file wrapper): accept the first non-empty line.
	const firstLine = text.split('\n')[0].trim()
	return firstLine || null
}

/** Per-app host under the operator's apex: `<app>-<apex>` (hyphen scheme parity with Pro). */
export function deriveAppHost(apex: string, appSlug: string): string {
	return `${appSlug}-${apex.replace(/^\.+/, '')}`
}

/**
 * Candidate zone names to probe for a given apex, longest-suffix first is wrong —
 * we want the registrable domain, so walk from the FULL apex DOWN to the 2-label
 * suffix (`bruce.bruceoz.com` → `bruce.bruceoz.com`, `bruceoz.com`), stopping
 * before the bare TLD. The first that CF returns as a zone is the operator's.
 */
export function candidateZoneNames(apex: string): string[] {
	const labels = apex.replace(/^\.+|\.+$/g, '').split('.').filter(Boolean)
	const out: string[] = []
	// From full apex down to the 2-label registrable candidate (skip bare TLD).
	for (let i = 0; i <= labels.length - 2; i++) {
		out.push(labels.slice(i).join('.'))
	}
	return out
}

// ─── CF API primitives ─────────────────────────────────────────────────────

interface CfZone {
	id: string
	name: string
}
interface CfDnsRecord {
	id: string
	name: string
	type: string
	content: string
}

/** Discover the zone id for the operator's apex by probing registrable-domain candidates. */
export async function discoverZoneId(apiToken: string, apex: string): Promise<string | null> {
	for (const name of candidateZoneNames(apex)) {
		try {
			const zones = await callCf<CfZone[]>(apiToken, {
				method: 'GET',
				path: `/zones?name=${encodeURIComponent(name)}&status=active`,
			})
			if (Array.isArray(zones) && zones.length > 0) return zones[0].id
		} catch {
			// Try the next candidate.
		}
	}
	return null
}

async function getTunnelIngress(cfg: LocalCfConfig): Promise<CfIngress[]> {
	const result = await callCf<{config?: {ingress?: CfIngress[]}}>(cfg.apiToken, {
		method: 'GET',
		path: `/accounts/${cfg.accountId}/cfd_tunnel/${cfg.tunnelId}/configurations`,
	})
	return result?.config?.ingress ?? []
}

async function pushTunnelIngress(cfg: LocalCfConfig, ingress: CfIngress[]): Promise<void> {
	// CF requires a catch-all http_status:404 at the tail.
	const filtered = ingress.filter((i) => i.service !== 'http_status:404' || i.hostname)
	const finalIngress = [...filtered, {service: 'http_status:404'}]
	await callCf<unknown>(cfg.apiToken, {
		method: 'PUT',
		path: `/accounts/${cfg.accountId}/cfd_tunnel/${cfg.tunnelId}/configurations`,
		body: {config: {ingress: finalIngress}},
	})
}

async function createDnsCname(cfg: LocalCfConfig, name: string): Promise<string> {
	const result = await callCf<{id: string}>(cfg.apiToken, {
		method: 'POST',
		path: `/zones/${cfg.zoneId}/dns_records`,
		body: {type: 'CNAME', name, content: `${cfg.tunnelId}.cfargotunnel.com`, proxied: true, ttl: 1},
	})
	return result.id
}

async function listDnsByName(cfg: LocalCfConfig, name: string): Promise<CfDnsRecord[]> {
	const result = await callCf<CfDnsRecord[]>(cfg.apiToken, {
		method: 'GET',
		path: `/zones/${cfg.zoneId}/dns_records?name=${encodeURIComponent(name)}`,
	})
	return result ?? []
}

async function deleteDnsRecord(cfg: LocalCfConfig, id: string): Promise<void> {
	await callCf<unknown>(cfg.apiToken, {method: 'DELETE', path: `/zones/${cfg.zoneId}/dns_records/${id}`})
}

// ─── Per-tunnel ingress lock (Reliability B1 parity) ───────────────────────

const ingressLocks = new Map<string, Promise<unknown>>()

async function withTunnelIngressLock<T>(tunnelId: string, fn: () => Promise<T>): Promise<T> {
	const prev = ingressLocks.get(tunnelId) ?? Promise.resolve()
	const run = prev.catch(() => {}).then(fn)
	const settled = run.catch(() => {})
	ingressLocks.set(tunnelId, settled)
	void settled.then(() => {
		if (ingressLocks.get(tunnelId) === settled) ingressLocks.delete(tunnelId)
	})
	return run
}

// ─── High-level orchestrators (mirror cf-saas provision/deprovisionAppSubdomain) ──

const APP_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/

/**
 * Provision a per-app subdomain on the operator's OWN Cloudflare zone + tunnel.
 * Mirror of cf-saas `provisionAppSubdomain`, incl. the RMW lock + verify-and-repair.
 */
export async function provisionAppSubdomainLocal(
	cfg: LocalCfConfig,
	appSlug: string,
): Promise<{subdomain: string; url: string; dnsRecordId: string; host: string}> {
	if (!APP_SLUG_RE.test(appSlug)) {
		throw new CfLocalError(`Invalid app slug "${appSlug}"`, 400, 'provisionAppSubdomainLocal')
	}
	const host = deriveAppHost(cfg.apex, appSlug)

	// Step 1: ingress RMW — serialized per tunnel + post-push verify-and-repair.
	await withTunnelIngressLock(cfg.tunnelId, async () => {
		const pushOnce = async () => {
			const current = await getTunnelIngress(cfg)
			const withoutCatchAll = current.filter((i) => !(i.service === 'http_status:404' && !i.hostname))
			const dedup = withoutCatchAll.filter((i) => i.hostname !== host)
			await pushTunnelIngress(cfg, [...dedup, {hostname: host, service: 'http://localhost:80'}])
		}
		await pushOnce()
		for (let attempt = 0; attempt < 2; attempt++) {
			const after = await getTunnelIngress(cfg)
			if (after.some((i) => i.hostname === host)) return
			await pushOnce()
		}
	})

	// Step 2: replace any stale CNAME, then create a fresh one.
	const stale = await listDnsByName(cfg, host).catch(() => [] as CfDnsRecord[])
	for (const rec of stale) {
		await deleteDnsRecord(cfg, rec.id).catch(() => {})
	}
	const dnsRecordId = await createDnsCname(cfg, host)

	return {subdomain: `${appSlug}-${cfg.apex.split('.')[0]}`, url: `https://${host}`, dnsRecordId, host}
}

/**
 * Remove a per-app subdomain from the operator's OWN zone + tunnel. Best-effort:
 * every step is attempted; the first error is re-thrown. Mirror of cf-saas
 * `deprovisionAppSubdomain` incl. the deprovision host-build (cf-saas :753).
 */
export async function deprovisionAppSubdomainLocal(cfg: LocalCfConfig, appSlug: string): Promise<void> {
	const host = deriveAppHost(cfg.apex, appSlug)
	const errors: Error[] = []

	try {
		await withTunnelIngressLock(cfg.tunnelId, async () => {
			const current = await getTunnelIngress(cfg)
			await pushTunnelIngress(
				cfg,
				current.filter((i) => i.hostname !== host),
			)
		})
	} catch (err) {
		errors.push(err instanceof Error ? err : new Error(String(err)))
	}

	try {
		const recs = await listDnsByName(cfg, host)
		for (const rec of recs) {
			await deleteDnsRecord(cfg, rec.id).catch((e) => {
				if (!(e instanceof CfLocalError && e.status === 404)) {
					errors.push(e instanceof Error ? e : new Error(String(e)))
				}
			})
		}
	} catch (err) {
		errors.push(err instanceof Error ? err : new Error(String(err)))
	}

	if (errors.length > 0) throw errors[0]
}

// ─── Portal (LAN-HTTPS) BYO-zone A-record primitive ────────────────────────
// Phase 325-03 (NET-03, D-13/D-14): the portal-mode LAN-HTTPS flow reuses the
// SAME own-CF-zone credential shape as the free tier (operator's API token +
// their zone id), but instead of a proxied CNAME into a tunnel it writes an
// UNPROXIED A-record pointing the portal name at the box's LAN IP. Portal mode
// is LAN-direct: clients must resolve the REAL LAN IP, and stock-Caddy ACME
// (HTTP-01/TLS-ALPN-01) needs the box reachable at that IP — a proxied
// (orange-cloud) record would hide the LAN IP behind Cloudflare and break both.

const PORTAL_IPV4_RE =
	/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/

export interface PortalDnsRecordInput {
	/** The operator's CF API token (Zone:DNS:Edit) — a secret; never logged. */
	apiToken: string
	/** DNS zone id for the operator's registrable domain. */
	zoneId: string
	/** Fully-qualified portal name the A-record is created for, e.g. `box.bruceoz.com`. */
	name: string
	/** Box LAN IPv4 the A-record points at, e.g. `192.168.1.20`. */
	ip: string
}

/**
 * Create (idempotently replace) an UNPROXIED A-record for the portal name on the
 * operator's OWN Cloudflare zone. Mirrors the free-tier own-zone pattern but for
 * a LAN-direct A-record rather than a tunnel CNAME. Reuses the module `callCf`
 * (timeout + retry + envelope handling). Never logs/returns the token.
 */
export async function provisionPortalDnsRecord(
	input: PortalDnsRecordInput,
): Promise<{dnsRecordId: string; name: string}> {
	if (!PORTAL_IPV4_RE.test(input.ip)) {
		throw new CfLocalError(`Invalid LAN IPv4 "${input.ip}"`, 400, 'provisionPortalDnsRecord')
	}
	if (!input.zoneId) {
		throw new CfLocalError('Missing CF zone id', 400, 'provisionPortalDnsRecord')
	}
	// Replace any stale record of this exact name first (idempotent re-provision).
	const stale = await callCf<CfDnsRecord[]>(input.apiToken, {
		method: 'GET',
		path: `/zones/${input.zoneId}/dns_records?name=${encodeURIComponent(input.name)}`,
	}).catch(() => [] as CfDnsRecord[])
	for (const rec of stale ?? []) {
		await callCf<unknown>(input.apiToken, {
			method: 'DELETE',
			path: `/zones/${input.zoneId}/dns_records/${rec.id}`,
		}).catch(() => {})
	}
	const created = await callCf<{id: string}>(input.apiToken, {
		method: 'POST',
		path: `/zones/${input.zoneId}/dns_records`,
		// UNPROXIED (proxied:false, grey-cloud) — LAN-direct + ACME reachability.
		body: {type: 'A', name: input.name, content: input.ip, proxied: false, ttl: 120},
	})
	return {dnsRecordId: created.id, name: input.name}
}
