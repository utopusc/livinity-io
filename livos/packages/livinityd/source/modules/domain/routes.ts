import {z} from 'zod'
import type {Redis} from 'ioredis'
import {router, privateProcedure} from '../server/trpc/trpc.js'
import {getPublicIp, verifyDns} from './dns-check.js'
import {
	applyCaddyConfig,
	removeDomain,
	validateSubdomain,
	MAX_DNS_PER_USER,
	countOwnedSubdomains,
	subdomainOwner,
	type CaddyConfig,
	type SubdomainConfig,
} from './caddy.js'
import platform from '../platform/routes.js'

// ─── Domain & HTTPS tRPC Routes ─────────────────────────────────
// Manages custom domain configuration, DNS verification, and
// Caddy-based HTTPS activation via Let's Encrypt.
// Supports main domain + subdomains for Docker apps.
//
// Redis keys:
//   livos:domain:config - Main domain config
//   livos:domain:subdomains - Array of subdomain configs
// ─────────────────────────────────────────────────────────────────

const REDIS_KEY = 'livos:domain:config'
const REDIS_SUBDOMAINS_KEY = 'livos:domain:subdomains'

interface DomainConfig {
	domain: string
	active: boolean
	activatedAt?: number
}

async function getConfig(redis: Redis): Promise<DomainConfig | null> {
	const raw = await redis.get(REDIS_KEY)
	if (!raw) return null
	return JSON.parse(raw) as DomainConfig
}

async function setConfig(redis: Redis, config: DomainConfig): Promise<void> {
	await redis.set(REDIS_KEY, JSON.stringify(config))
}

async function getSubdomains(redis: Redis): Promise<SubdomainConfig[]> {
	const raw = await redis.get(REDIS_SUBDOMAINS_KEY)
	if (!raw) return []
	return JSON.parse(raw) as SubdomainConfig[]
}

async function setSubdomains(redis: Redis, subdomains: SubdomainConfig[]): Promise<void> {
	await redis.set(REDIS_SUBDOMAINS_KEY, JSON.stringify(subdomains))
}

async function buildCaddyConfig(redis: Redis): Promise<CaddyConfig> {
	const config = await getConfig(redis)
	const subdomains = await getSubdomains(redis)
	return {
		mainDomain: config?.active ? config.domain : null,
		subdomains: subdomains.filter((s) => s.enabled),
	}
}

async function rebuildCaddy(redis: Redis): Promise<{firewallResult: {success: boolean; method: string; message: string}}> {
	const caddyConfig = await buildCaddyConfig(redis)
	// Check if tunnel mode is active — if so, Caddy stays on :80 only
	const config = await getConfig(redis)
	const isTunnel = !!(config as any)?.tunnel
	// Include NativeApp subdomains so domain reconfiguration doesn't erase them
	const {NATIVE_APP_CONFIGS} = await import('../apps/native-app.js')
	const nativeApps = NATIVE_APP_CONFIGS.map((app) => ({
		subdomain: app.subdomain || app.id,
		port: app.proxyPort || app.port,
		streaming: app.id === 'desktop-stream',
	}))
	return await applyCaddyConfig(caddyConfig, isTunnel, nativeApps)
}

const domain = router({
	/**
	 * Get the server's public IP address.
	 * Used to show the user which IP to create an A record for.
	 */
	getPublicIp: privateProcedure.query(async () => {
		const ip = await getPublicIp()
		return {ip}
	}),

	/**
	 * Get current domain configuration status from Redis.
	 */
	getStatus: privateProcedure.query(async ({ctx}) => {
		const config = await getConfig(ctx.livinityd.ai.redis)
		const subdomains = await getSubdomains(ctx.livinityd.ai.redis)
		if (!config) {
			return {configured: false, domain: null, active: false, activatedAt: null, subdomains: []}
		}
		return {
			configured: true,
			domain: config.domain,
			active: config.active,
			activatedAt: config.activatedAt || null,
			subdomains,
		}
	}),

	/**
	 * Save a domain name to Redis (does not activate HTTPS yet).
	 * Called in step 1 of the wizard.
	 */
	setDomain: privateProcedure
		.input(
			z.object({
				domain: z
					.string()
					.min(1)
					.max(253)
					.regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const config: DomainConfig = {
				domain: input.domain.toLowerCase(),
				active: false,
			}
			await setConfig(ctx.livinityd.ai.redis, config)
			return {success: true, domain: config.domain}
		}),

	/**
	 * Verify DNS propagation: checks if the domain's A record
	 * resolves to this server's public IP.
	 */
	verifyDns: privateProcedure.query(async ({ctx}) => {
		const config = await getConfig(ctx.livinityd.ai.redis)
		if (!config?.domain) {
			throw new Error('No domain configured')
		}
		const serverIp = await getPublicIp()
		const result = await verifyDns(config.domain, serverIp)
		return result
	}),

	/**
	 * Verify DNS for a subdomain.
	 *
	 * Phase 219 T4 — closes "DNS PENDING diyor surekli" (operator UAT
	 * 2026-05-26). Two structural fixes:
	 *
	 * 1. Look up the STORED hyphen-pattern host (Phase 140 multi-tenant
	 *    minted `<slug>-<user>.<root>`) instead of constructing the legacy
	 *    dot-pattern `<slug>.<root>`. The dot-pattern record never existed
	 *    on the operator's CF, so the lookup ENOTFOUND'd forever.
	 *
	 * 2. Always run verifyDns in tunnelMode for SUBDOMAIN checks. LivOS
	 *    subdomains always traverse a CF tunnel / Server5 relay, so the
	 *    A record points at the relay's IP — not the Mini PC's — and the
	 *    historical IP-equality test was structurally unreachable.
	 */
	verifySubdomainDns: privateProcedure
		.input(z.object({subdomain: z.string()}))
		.query(async ({ctx, input}) => {
			const config = await getConfig(ctx.livinityd.ai.redis)
			if (!config?.domain) {
				throw new Error('No main domain configured')
			}
			// Phase 219 T4 — prefer stored hyphen-pattern host over the
			// legacy dot-pattern construction.
			const subdomains = await getSubdomains(ctx.livinityd.ai.redis)
			const stored = subdomains.find((s) => s.subdomain === input.subdomain)
			const fullDomain = stored?.host ?? `${input.subdomain}.${config.domain}`
			const serverIp = await getPublicIp()
			const result = await verifyDns(fullDomain, serverIp, true /* tunnelMode */)
			return {...result, fullDomain}
		}),

	/**
	 * Activate HTTPS: ensures firewall ports are open, writes Caddyfile
	 * with the domain, and reloads Caddy.
	 * Caddy will automatically obtain a Let's Encrypt certificate.
	 */
	activate: privateProcedure.mutation(async ({ctx}) => {
		const config = await getConfig(ctx.livinityd.ai.redis)
		if (!config?.domain) {
			throw new Error('No domain configured')
		}

		config.active = true
		config.activatedAt = Date.now()
		await setConfig(ctx.livinityd.ai.redis, config)

		// Rebuild Caddy with main domain + any existing subdomains
		const {firewallResult} = await rebuildCaddy(ctx.livinityd.ai.redis)

		return {
			success: true,
			domain: config.domain,
			firewall: firewallResult,
		}
	}),

	/**
	 * Remove domain and revert to IP-only access.
	 * Reverts Caddyfile to :80 and clears Redis config.
	 */
	remove: privateProcedure.mutation(async ({ctx}) => {
		await removeDomain()
		await ctx.livinityd.ai.redis.del(REDIS_KEY)
		await ctx.livinityd.ai.redis.del(REDIS_SUBDOMAINS_KEY)
		return {success: true}
	}),

	// ─── Subdomain Management ─────────────────────────────────────

	/**
	 * Get all subdomains.
	 */
	listSubdomains: privateProcedure.query(async ({ctx}) => {
		return await getSubdomains(ctx.livinityd.ai.redis)
	}),

	/**
	 * Phase 301 / 302-R2 — the caller's own subdomain quota for the "N/5 DNS
	 * used" counter. `used` counts only the caller's subdomains. `limit` is
	 * ALWAYS MAX_DNS_PER_USER so the counter is VISIBLE to everyone incl.
	 * admins/operators. `enforced` is false for admins (and the no-auth
	 * single-user case) — the UI then shows the count FOR REFERENCE but never
	 * blocks them. Server-side enforcement (setAppSubdomain throw /
	 * registerAppSubdomain skip) stays admin-exempt; this flag is UI-only.
	 */
	getSubdomainQuota: privateProcedure.query(async ({ctx}) => {
		// livinityd is always present for a privateProcedure (the rest of this
		// router dereferences ctx.livinityd.ai.redis the same way); assert here so
		// this query adds zero net-new strict-null (TS18048) noise to baseline.
		const subdomains = await getSubdomains(ctx.livinityd!.ai.redis)
		const me = ctx.currentUser?.id
		return {
			used: me ? countOwnedSubdomains(subdomains, me) : 0,
			limit: MAX_DNS_PER_USER,
			enforced: !!me && ctx.currentUser?.role !== 'admin',
		}
	}),

	/**
	 * Get subdomain config for a specific app.
	 *
	 * Phase 219 T5 — returns `userSlug` so the UI can render the
	 * canonical hyphen-pattern template `<editable>-<userSlug>.<root>`
	 * in the Change subdomain form. Falls back to parsing the user
	 * prefix out of the stored host (e.g. `filebrowser-bruce` → `bruce`)
	 * when the username can't be read from the session — keeps legacy
	 * single-user installs working.
	 */
	getAppSubdomain: privateProcedure
		.input(z.object({appId: z.string()}))
		.query(async ({ctx, input}) => {
			const subdomains = await getSubdomains(ctx.livinityd.ai.redis)
			const config = await getConfig(ctx.livinityd.ai.redis)
			const sub = subdomains.find((s) => s.appId === input.appId)

			// Phase 219 T5 — surface the user slug used to mint the Phase 140
			// hyphen-pattern host. Preference order: live session user (single
			// source of truth) → parsed from stored host → null.
			let userSlug: string | null = ctx.currentUser?.username ?? null
			if (!userSlug && sub?.host) {
				const labels = sub.host.split('.')
				const leftmost = labels[0] ?? ''
				const dash = leftmost.lastIndexOf('-')
				if (dash > 0 && dash < leftmost.length - 1) {
					userSlug = leftmost.slice(dash + 1)
				}
			}

			return {
				subdomain: sub || null,
				mainDomain: config?.domain || null,
				mainDomainActive: config?.active || false,
				userSlug,
			}
		}),

	/**
	 * Add or update a subdomain for an app.
	 */
	setAppSubdomain: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				subdomain: z.string().min(1).max(63),
				port: z.number().min(1).max(65535),
				enabled: z.boolean(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const config = await getConfig(ctx.livinityd.ai.redis)
			if (!config?.active) {
				throw new Error('Main domain must be activated first')
			}

			if (!validateSubdomain(input.subdomain)) {
				throw new Error('Invalid subdomain format')
			}

			const subdomains = await getSubdomains(ctx.livinityd.ai.redis)

			// Check for duplicate subdomain (different app)
			const existing = subdomains.find(
				(s) => s.subdomain === input.subdomain && s.appId !== input.appId,
			)
			if (existing) {
				throw new Error(`Subdomain "${input.subdomain}" is already used by another app`)
			}

			// Phase 141-05: when the subdomain SLUG changes for an existing app,
			// reconcile Cloudflare too — DELETE the old DNS+ingress, POST the new
			// one. Without this the local Caddyfile points at a slug the CF tunnel
			// doesn't ingress, public URL 404s. Server5 calls are best-effort
			// (helpers swallow errors); on Server5 outage the local Caddy still
			// updates and the operator can re-sync later.
			const idx = subdomains.findIndex((s) => s.appId === input.appId)
			const oldSlug = idx >= 0 ? subdomains[idx].subdomain : null
			const newSlug = input.subdomain.toLowerCase()
			const slugChanged = idx < 0 || oldSlug !== newSlug

			// Phase 301 — ownership guard. A member may not modify another user's
			// subdomain; admins/operators bypass; legacy/global entries (no owner)
			// stay editable for back-compat. Closes the privilege-escalation gap
			// where any authenticated caller could overwrite a peer's subdomain by
			// appId (set/toggle/remove were unguarded).
			if (idx >= 0) {
				const owner = subdomainOwner(subdomains[idx])
				// Note: NO `me &&` short-circuit — an owned entry must reject a
				// caller with no identity too (a legacy / no-userId WS token leaves
				// currentUser undefined; without this it would slip past the guard).
				// owner!==undefined is always true, so a no-identity caller is blocked
				// from any OWNED entry; legacy/global (owner null) stay open.
				if (owner && owner !== ctx.currentUser?.id && ctx.currentUser?.role !== 'admin') {
					throw new Error('Not authorized to modify this subdomain')
				}
			}

			// Phase 301 — per-user DNS cap (NEW entries only; editing an existing
			// one never trips it). Members capped at MAX_DNS_PER_USER; admins/
			// operators exempt; single-user/no-auth (no currentUser) uncapped.
			// Enforced BEFORE the Cloudflare round-trip below so a denied create
			// never provisions a record it then rejects.
			if (idx < 0 && ctx.currentUser?.id && ctx.currentUser.role !== 'admin') {
				const owned = countOwnedSubdomains(subdomains, ctx.currentUser.id)
				if (owned >= MAX_DNS_PER_USER) {
					throw new Error(
						`DNS limit reached (${MAX_DNS_PER_USER} per user). Remove an existing subdomain to add a new one.`,
					)
				}
			}

			let provisionedHost: string | undefined
			if (input.enabled && slugChanged && ctx.apps) {
				if (idx >= 0 && oldSlug) {
					await ctx.apps.cfDeprovisionSubdomain(oldSlug)
				}
				const provisioned = await ctx.apps.cfProvisionSubdomain(newSlug, input.port)
				if (provisioned) {
					try {
						provisionedHost = new URL(provisioned.url).hostname || undefined
					} catch {
						provisionedHost = undefined
					}
				}
			}

			// Phase 301 — owner stamp. NEW entries record the creating user; edits
			// PRESERVE the existing owner (an admin editing a member's subdomain
			// must not silently transfer ownership; a legacy entry with no owner
			// stays unowned rather than being claimed by the editor).
			const ownerId = idx >= 0 ? subdomains[idx].userId : ctx.currentUser?.id

			const newSub: SubdomainConfig = {
				subdomain: newSlug,
				appId: input.appId,
				port: input.port,
				enabled: input.enabled,
				...(ownerId ? {userId: ownerId} : {}),
				// Preserve a previously-stored host when no Server5 round-trip
				// happened (slug unchanged, or apps ctx missing). Phase 140
				// hyphen-pattern hosts must survive enable/disable toggles.
				...(provisionedHost
					? {host: provisionedHost.toLowerCase()}
					: idx >= 0 && subdomains[idx].host
						? {host: subdomains[idx].host}
						: {}),
			}

			if (idx >= 0) {
				subdomains[idx] = newSub
			} else {
				subdomains.push(newSub)
			}

			await setSubdomains(ctx.livinityd.ai.redis, subdomains)

			// Rebuild Caddy config
			if (input.enabled) {
				await rebuildCaddy(ctx.livinityd.ai.redis)
			}

			return {
				success: true,
				fullDomain: newSub.host ?? `${newSlug}.${config.domain}`,
			}
		}),

	/**
	 * Enable/disable a subdomain.
	 */
	toggleAppSubdomain: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				enabled: z.boolean(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const subdomains = await getSubdomains(ctx.livinityd.ai.redis)
			const idx = subdomains.findIndex((s) => s.appId === input.appId)

			if (idx < 0) {
				throw new Error('Subdomain not configured for this app')
			}

			// Phase 301 — ownership guard (see setAppSubdomain; no `me &&` so a
			// no-identity caller can't touch an owned entry).
			{
				const owner = subdomainOwner(subdomains[idx])
				if (owner && owner !== ctx.currentUser?.id && ctx.currentUser?.role !== 'admin') {
					throw new Error('Not authorized to modify this subdomain')
				}
			}

			subdomains[idx].enabled = input.enabled
			await setSubdomains(ctx.livinityd.ai.redis, subdomains)

			// Rebuild Caddy
			await rebuildCaddy(ctx.livinityd.ai.redis)

			return {success: true, enabled: input.enabled}
		}),

	/**
	 * Remove subdomain for an app.
	 *
	 * Phase 141-05: also deprovision the Cloudflare DNS + tunnel ingress on
	 * Server5 so the public URL stops resolving when the user removes the
	 * Settings → Public Access entry. Without this, leftover CF resources
	 * accumulate and a re-enable later collides with stale state.
	 */
	removeAppSubdomain: privateProcedure
		.input(z.object({appId: z.string()}))
		.mutation(async ({ctx, input}) => {
			const subdomains = await getSubdomains(ctx.livinityd.ai.redis)
			const existing = subdomains.find((s) => s.appId === input.appId)

			// Phase 301 — ownership guard (see setAppSubdomain). A member may not
			// delete another user's subdomain; admins/operators bypass; legacy
			// entries (no owner) stay removable for back-compat.
			if (existing) {
				const owner = subdomainOwner(existing)
				// No `me &&` — a no-identity caller must not delete an owned entry.
				if (owner && owner !== ctx.currentUser?.id && ctx.currentUser?.role !== 'admin') {
					throw new Error('Not authorized to modify this subdomain')
				}
			}

			const filtered = subdomains.filter((s) => s.appId !== input.appId)

			// Best-effort: helper logs + swallows errors so a Server5 outage
			// doesn't block the local Settings UI removal.
			if (existing && ctx.apps) {
				await ctx.apps.cfDeprovisionSubdomain(existing.subdomain)
			}

			await setSubdomains(ctx.livinityd.ai.redis, filtered)

			// Rebuild Caddy
			await rebuildCaddy(ctx.livinityd.ai.redis)

			return {success: true}
		}),

	// ─── Tunnel Management ───────────────────────────────────────

	tunnel: router({
		getStatus: privateProcedure.query(async () => {
			const {getTunnelStatus} = await import('./tunnel.js')
			return getTunnelStatus()
		}),

		configure: privateProcedure
			.input(
				z.object({
					token: z.string().min(10),
					domain: z.string().min(3),
				}),
			)
			.mutation(async ({input, ctx}) => {
				const {configureTunnel} = await import('./tunnel.js')

				// Save domain to Redis
				const domainConfig = {domain: input.domain, active: true, activatedAt: Date.now(), tunnel: true}
				await ctx.livinityd.ai.redis.set('livos:domain:config', JSON.stringify(domainConfig))

				// Configure and start tunnel
				const result = await configureTunnel(input.token)

				if (result.success) {
					// Write simple Caddy config (tunnel handles HTTPS at edge)
					const {applyCaddyConfigForTunnel} = await import('./caddy.js')
					await applyCaddyConfigForTunnel()
				}

				return result
			}),

		remove: privateProcedure.mutation(async ({ctx}) => {
			const {removeTunnel} = await import('./tunnel.js')
			await removeTunnel()

			// Clear domain config
			await ctx.livinityd.ai.redis.del('livos:domain:config')

			// Revert Caddy to IP-only
			const {revertCaddyToDefault} = await import('./caddy.js')
			await revertCaddyToDefault()

			return {success: true}
		}),
	}),

	platform,
})

export default domain
