import {z} from 'zod'
import type {Redis} from 'ioredis'
import {router, privateProcedure} from '../server/trpc/trpc.js'
import {getPublicIp, verifyDns} from './dns-check.js'
import {
	applyCaddyConfig,
	removeDomain,
	validateSubdomain,
	type CaddyConfig,
	type SubdomainConfig,
} from './caddy.js'

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
	return await applyCaddyConfig(caddyConfig)
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
	 */
	verifySubdomainDns: privateProcedure
		.input(z.object({subdomain: z.string()}))
		.query(async ({ctx, input}) => {
			const config = await getConfig(ctx.livinityd.ai.redis)
			if (!config?.domain) {
				throw new Error('No main domain configured')
			}
			const fullDomain = `${input.subdomain}.${config.domain}`
			const serverIp = await getPublicIp()
			const result = await verifyDns(fullDomain, serverIp)
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
	 * Get subdomain config for a specific app.
	 */
	getAppSubdomain: privateProcedure
		.input(z.object({appId: z.string()}))
		.query(async ({ctx, input}) => {
			const subdomains = await getSubdomains(ctx.livinityd.ai.redis)
			const config = await getConfig(ctx.livinityd.ai.redis)
			const sub = subdomains.find((s) => s.appId === input.appId)
			return {
				subdomain: sub || null,
				mainDomain: config?.domain || null,
				mainDomainActive: config?.active || false,
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

			// Update or add
			const idx = subdomains.findIndex((s) => s.appId === input.appId)
			const newSub: SubdomainConfig = {
				subdomain: input.subdomain.toLowerCase(),
				appId: input.appId,
				port: input.port,
				enabled: input.enabled,
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
				fullDomain: `${input.subdomain}.${config.domain}`,
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

			subdomains[idx].enabled = input.enabled
			await setSubdomains(ctx.livinityd.ai.redis, subdomains)

			// Rebuild Caddy
			await rebuildCaddy(ctx.livinityd.ai.redis)

			return {success: true, enabled: input.enabled}
		}),

	/**
	 * Remove subdomain for an app.
	 */
	removeAppSubdomain: privateProcedure
		.input(z.object({appId: z.string()}))
		.mutation(async ({ctx, input}) => {
			const subdomains = await getSubdomains(ctx.livinityd.ai.redis)
			const filtered = subdomains.filter((s) => s.appId !== input.appId)
			await setSubdomains(ctx.livinityd.ai.redis, filtered)

			// Rebuild Caddy
			await rebuildCaddy(ctx.livinityd.ai.redis)

			return {success: true}
		}),
})

export default domain
