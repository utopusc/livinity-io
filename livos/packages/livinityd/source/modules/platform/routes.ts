import {z} from 'zod'
import {router, privateProcedure} from '../server/trpc/trpc.js'
import {getPool} from '../database/index.js'
import {applyCaddyConfig} from '../domain/caddy.js'

const REDIS_PREFIX = 'livos:platform:'
const DOMAIN_PREFIX = 'livos:custom_domain:'

const platform = router({
	getStatus: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const [status, url, apiKey] = await Promise.all([
			redis.get(`${REDIS_PREFIX}status`),
			redis.get(`${REDIS_PREFIX}url`),
			redis.get(`${REDIS_PREFIX}api_key`),
		])
		return {
			status: status ?? 'idle',
			url: url ?? null,
			hasApiKey: !!apiKey,
			apiKeyPrefix: apiKey ? apiKey.substring(0, 14) : null,
		}
	}),

	setApiKey: privateProcedure
		.input(z.object({apiKey: z.string().min(10)}))
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			await redis.set(`${REDIS_PREFIX}api_key`, input.apiKey)
			await redis.set(`${REDIS_PREFIX}enabled`, '1')
			await ctx.livinityd.tunnelClient.connect()
			return {success: true, status: 'connecting'}
		}),

	disconnect: privateProcedure.mutation(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		await ctx.livinityd.tunnelClient.disconnect()
		await redis.del(`${REDIS_PREFIX}api_key`)
		await redis.del(`${REDIS_PREFIX}enabled`)
		await redis.del(`${REDIS_PREFIX}status`)
		await redis.del(`${REDIS_PREFIX}url`)
		await redis.del(`${REDIS_PREFIX}session_id`)
		return {success: true}
	}),

	getConnectionInfo: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const [status, url, sessionId] = await Promise.all([
			redis.get(`${REDIS_PREFIX}status`),
			redis.get(`${REDIS_PREFIX}url`),
			redis.get(`${REDIS_PREFIX}session_id`),
		])
		return {status: status ?? 'idle', url: url ?? null, sessionId: sessionId ?? null}
	}),

	getApiKey: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const apiKey = await redis.get(`${REDIS_PREFIX}api_key`)
		return {apiKey: apiKey ?? null}
	}),

	// ─── Custom Domain Management ────────────────────────────────

	listCustomDomains: privateProcedure.query(async ({ctx}) => {
		const pool = getPool()
		if (pool) {
			const result = await pool.query(
				'SELECT id, domain, app_mapping, status, synced_at, created_at FROM custom_domains ORDER BY created_at ASC'
			)
			return result.rows.map((row: any) => ({
				id: row.id,
				domain: row.domain,
				appMapping: typeof row.app_mapping === 'string' ? JSON.parse(row.app_mapping) : row.app_mapping,
				status: row.status,
				syncedAt: row.synced_at,
				createdAt: row.created_at,
			}))
		}
		// Fallback to Redis if PG is unavailable
		const redis = ctx.livinityd.ai.redis
		const cached = await redis.get('livos:custom_domains')
		if (!cached) return []
		try {
			const domains = JSON.parse(cached) as Array<{domain: string; appMapping: Record<string, string>; status: string}>
			return domains.map((d) => ({
				id: null,
				domain: d.domain,
				appMapping: d.appMapping ?? {},
				status: d.status ?? 'active',
				syncedAt: null,
				createdAt: null,
			}))
		} catch {
			return []
		}
	}),

	updateAppMapping: privateProcedure
		.input(z.object({domain: z.string(), prefix: z.string(), appSlug: z.string().nullable()}))
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			const {domain, prefix, appSlug} = input

			// Read current mapping from Redis
			const raw = await redis.get(`${DOMAIN_PREFIX}${domain}`)
			if (!raw) throw new Error(`Domain not found: ${domain}`)
			const domainInfo = JSON.parse(raw) as {domain: string; appMapping: Record<string, string>; status: string}

			// Update the mapping
			if (appSlug === null) {
				delete domainInfo.appMapping[prefix]
			} else {
				domainInfo.appMapping[prefix] = appSlug
			}

			// Write back to Redis per-domain key
			await redis.set(`${DOMAIN_PREFIX}${domain}`, JSON.stringify(domainInfo))

			// Rebuild the full domain list cache
			const keys = await redis.keys(`${DOMAIN_PREFIX}*`)
			const domains: Array<{domain: string; appMapping: Record<string, string>; status: string}> = []
			if (keys.length > 0) {
				const values = await redis.mget(...keys)
				for (const val of values) {
					if (val) {
						try { domains.push(JSON.parse(val)) } catch {}
					}
				}
			}
			await redis.set('livos:custom_domains', JSON.stringify(domains))

			// Persist to PostgreSQL
			const pool = getPool()
			if (pool) {
				try {
					await pool.query(
						'UPDATE custom_domains SET app_mapping = $2 WHERE domain = $1',
						[domain, JSON.stringify(domainInfo.appMapping)]
					)
				} catch (pgErr) {
					console.error(`[platform] PG update app_mapping failed for ${domain}: ${pgErr}`)
				}
			}

			// Notify platform via tunnel
			ctx.livinityd.tunnelClient.sendDeviceMessage({
				type: 'domain_sync',
				action: 'update',
				domain,
				appMapping: domainInfo.appMapping,
				status: domainInfo.status,
			})

			// Conditionally apply Caddy config for custom domains
			// In tunnel mode, the relay handles TLS for custom domains — Caddy stays on :80
			// In direct mode (no tunnel), Caddy must serve custom domains with auto-SSL
			const tunnelStatus = await redis.get('livos:platform:status')
			const isTunnelConnected = tunnelStatus === 'connected'
			if (!isTunnelConnected) {
				try {
					// Build Caddy config using main domain + native apps (same pattern as domain/routes.ts rebuildCaddy)
					const allDomainsRaw = await redis.get('livos:custom_domains')
					const allDomains = allDomainsRaw ? JSON.parse(allDomainsRaw) as Array<{domain: string; appMapping: Record<string, string>}> : []

					const {NATIVE_APP_CONFIGS} = await import('../apps/native-app.js')
					const nativeApps = NATIVE_APP_CONFIGS.map((app) => ({
						subdomain: app.subdomain || app.id,
						port: app.proxyPort || app.port,
						streaming: app.id === 'desktop-stream',
					}))

					// Read main domain config for base Caddy config
					const mainConfigRaw = await redis.get('livos:domain:config')
					const mainConfig = mainConfigRaw ? JSON.parse(mainConfigRaw) : null
					const subdomainsRaw = await redis.get('livos:domain:subdomains')
					const subdomains = subdomainsRaw ? JSON.parse(subdomainsRaw) : []

					if (mainConfig?.domain && mainConfig?.active) {
						const caddyConfig = {
							mainDomain: mainConfig.domain,
							subdomains: subdomains.filter((s: any) => s.enabled),
						}
						await applyCaddyConfig(caddyConfig, false, nativeApps)
						console.log(`[platform] Caddy updated for custom domain mapping (direct mode)`)
					}
				} catch (caddyErr) {
					// Log but don't fail the mutation — mapping itself succeeded
					console.error(`[platform] Caddy update failed (non-fatal): ${caddyErr}`)
				}
			}

			return {success: true, appMapping: domainInfo.appMapping}
		}),

	removeCustomDomain: privateProcedure
		.input(z.object({domain: z.string()}))
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			const {domain} = input

			// Delete from Redis
			await redis.del(`${DOMAIN_PREFIX}${domain}`)

			// Rebuild domain list cache
			const keys = await redis.keys(`${DOMAIN_PREFIX}*`)
			const domains: Array<{domain: string; appMapping: Record<string, string>; status: string}> = []
			if (keys.length > 0) {
				const values = await redis.mget(...keys)
				for (const val of values) {
					if (val) {
						try { domains.push(JSON.parse(val)) } catch {}
					}
				}
			}
			await redis.set('livos:custom_domains', JSON.stringify(domains))

			// Delete from PostgreSQL
			const pool = getPool()
			if (pool) {
				try {
					await pool.query('DELETE FROM custom_domains WHERE domain = $1', [domain])
				} catch (pgErr) {
					console.error(`[platform] PG delete failed for ${domain}: ${pgErr}`)
				}
			}

			// Notify platform via tunnel
			ctx.livinityd.tunnelClient.sendDeviceMessage({
				type: 'domain_sync',
				action: 'remove',
				domain,
			})

			return {success: true}
		}),
})

export default platform
