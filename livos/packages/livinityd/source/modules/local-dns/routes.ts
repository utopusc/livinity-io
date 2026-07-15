// livos/packages/livinityd/source/modules/local-dns/routes.ts
// Source: 104-PATTERNS.md — mirrors domain/routes.ts shape.
//
// Phase 104 plan 104-03 — `local.*` tRPC namespace.
// Phase 142-01 — `local.activate` (local-lan Caddyfile writer) + `local.getCaCert`
//   (PEM reader) removed alongside the dropped local-lan mode.
// Phase 143-01 — wire-level rename:
//   - `local.provisionHybrid` → `local.provisionPortal`
//   - `local.activateHybrid`   → `local.activatePortal`
//   - `local.getHybridStatus`  → `local.getPortalStatus`
//   Legacy procedure names are kept as back-compat aliases — same handlers,
//   different keys on the router. Lets a Mini PC that updated livinityd but
//   has a stale UI bundle in the browser cache survive the mid-flight gap.
//   Aliases removed in Phase 144+ once we're confident every cached client
//   has refreshed.

import {z} from 'zod'
import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import {
	generatePortalCaddyfile,
	validatePortalDomain,
	writeCaddyfile,
	reloadCaddy,
	type PortalSubdomainConfig,
} from '../domain/caddy.js'
// Phase 325-03 (NET-03, D-13/D-14) — vendor mint endpoint DEFERRED; the portal
// provision path now uses the BYO own-CF-zone flow. `writeCfTokenSecret` persists
// the operator's token; `provisionPortalDnsRecord` writes the LAN-direct A-record
// on their own zone (reuses the free-tier cf-local own-zone primitive).
import {writeCfTokenSecret, HYBRID_TOKEN_SECRET_PATH} from './hybrid-provision.js'
import {provisionPortalDnsRecord} from '../apps/cf-local.js'

const REDIS_LOCAL_MODE = 'livos:domain:local_mode'
const REDIS_LOCAL_TLD = 'livos:domain:local_tld'
const REDIS_HOST_IP = 'livos:domain:host_ip'
// Phase 104 plan 104-04 — portal mode Redis keys (legacy names kept on the
// keys themselves; renaming the Redis namespace would orphan every deployed
// box's state. The variable names below are local-only.)
const REDIS_PORTAL_SUBDOMAIN = 'livos:domain:hybrid_subdomain'
const REDIS_PORTAL_ZONE_ID = 'livos:domain:hybrid_zone_id'
const REDIS_CF_TOKEN_PATH = 'livos:domain:cf_api_token_secret_ref'

// IPv4 regex — strict (4 octets, each 0-255). Matches install.sh detection output.
const IPV4_RE =
	/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/

// Phase 104 review fix WIZ-01 + PROVIDE-01 — provisionPortal input schema.
// Phase 325-03 (NET-03, D-13/D-14) — extended for the BYO own-CF-zone flow:
// the operator supplies their own zone id + portal domain (in addition to the
// API token + LAN IP). The token is a SECRET — never logged, never returned.
const provisionPortalSchema = z.object({
	hostIp: z.string().refine((v) => IPV4_RE.test(v), {message: 'Invalid IPv4'}),
	cloudflareApiToken: z.string().min(1).max(4096),
	zoneId: z.string().min(1).max(100),
	portalDomain: z
		.string()
		.min(1)
		.max(253)
		.refine(validatePortalDomain, {message: 'Invalid portal domain shape'}),
})

// Phase 104 plan 104-04 — portal mode activation schema
const portalActivateSchema = z.object({
	subdomain: z
		.string()
		.min(1)
		.max(253)
		.refine(validatePortalDomain, {message: 'Invalid portal domain shape'}),
	zoneId: z.string().min(1).max(100),
	hostIp: z.string().refine((v) => IPV4_RE.test(v), {message: 'Invalid IPv4'}),
	subdomains: z
		.array(z.object({name: z.string(), port: z.number().int().positive()}))
		.optional(),
})

// Phase 143-01 — inline handler bodies (duplicated for the legacy + canonical
// procedure names). DRY-by-extraction was attempted but tRPC v11's ctx typing
// is hard to reproduce in a free-standing helper signature; pragmatic choice
// is to duplicate the 5-line body and rely on the alias guard test in
// routes.test.ts to keep behavior identical.

const local = router({
	getStatus: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const [mode, tld, hostIp] = await Promise.all([
			redis.get(REDIS_LOCAL_MODE),
			redis.get(REDIS_LOCAL_TLD),
			redis.get(REDIS_HOST_IP),
		])
		// Phase 142-01 — `caCertAvailable` field retained for back-compat with
		// the wizard's existing destructure, but always reports false.
		return {
			mode: mode ?? null,
			tld: tld ?? null,
			hostIp: hostIp ?? null,
			caCertAvailable: false,
		}
	}),

	// ─── Phase 143-01 — Portal-renamed procedures (canonical) ───────────

	provisionPortal: adminProcedure
		.input(provisionPortalSchema)
		.mutation(async ({ctx, input}) => {
			// Phase 325-03 (NET-03, D-13/D-14) — BYO own-CF-zone flow. Replaces the
			// DEFERRED vendor mint endpoint: persist the operator's token as a 0600
			// EnvironmentFile secret, write an UNPROXIED A-record for the portal name
			// on THEIR own zone (LAN-direct), and record state in Redis. The token is
			// never logged or returned (T-325-08).
			const redis = ctx.livinityd?.ai.redis
			if (!redis) throw new Error('livinityd context unavailable')
			await writeCfTokenSecret(input.cloudflareApiToken, HYBRID_TOKEN_SECRET_PATH)
			await provisionPortalDnsRecord({
				apiToken: input.cloudflareApiToken,
				zoneId: input.zoneId,
				name: input.portalDomain,
				ip: input.hostIp,
			})
			await Promise.all([
				redis.set(REDIS_PORTAL_SUBDOMAIN, input.portalDomain),
				redis.set(REDIS_PORTAL_ZONE_ID, input.zoneId),
				redis.set(REDIS_HOST_IP, input.hostIp),
				redis.set(REDIS_CF_TOKEN_PATH, HYBRID_TOKEN_SECRET_PATH),
			])
			return {success: true as const, subdomain: input.portalDomain, zoneId: input.zoneId}
		}),

	activatePortal: adminProcedure
		.input(portalActivateSchema)
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			const subdomains: PortalSubdomainConfig[] = input.subdomains ?? []
			const caddyfile = generatePortalCaddyfile(input.subdomain, subdomains, true)
			await writeCaddyfile(caddyfile)
			await reloadCaddy()
			await Promise.all([
				redis.set(REDIS_LOCAL_MODE, 'portal'),
				redis.set(REDIS_PORTAL_SUBDOMAIN, input.subdomain),
				redis.set(REDIS_PORTAL_ZONE_ID, input.zoneId),
				redis.set(REDIS_HOST_IP, input.hostIp),
			])
			return {success: true, mode: 'portal' as const, subdomain: input.subdomain}
		}),

	getPortalStatus: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const [subdomain, zoneId, hostIp, cfTokenPath] = await Promise.all([
			redis.get(REDIS_PORTAL_SUBDOMAIN),
			redis.get(REDIS_PORTAL_ZONE_ID),
			redis.get(REDIS_HOST_IP),
			redis.get(REDIS_CF_TOKEN_PATH),
		])
		let cfTokenAvailable = false
		if (cfTokenPath) {
			try {
				const {stat} = await import('node:fs/promises')
				await stat(cfTokenPath)
				cfTokenAvailable = true
			} catch {
				cfTokenAvailable = false
			}
		}
		return {
			subdomain: subdomain ?? null,
			zoneId: zoneId ?? null,
			hostIp: hostIp ?? null,
			cfTokenAvailable,
		}
	}),

	// ─── Phase 143-01 — Legacy procedure-name aliases ───────────────────
	// Duplicate of the canonical bodies above. Lets cached UI bundles + any
	// external automation keep working through the rename. Schedule for
	// removal in Phase 144+ once cached clients have refreshed.

	provisionHybrid: adminProcedure
		.input(provisionPortalSchema)
		.mutation(async ({ctx, input}) => {
			// Phase 325-03 — legacy alias, same BYO own-CF-zone body as provisionPortal
			// (duplicated per the tRPC-ctx-typing note above). Token never logged.
			const redis = ctx.livinityd?.ai.redis
			if (!redis) throw new Error('livinityd context unavailable')
			await writeCfTokenSecret(input.cloudflareApiToken, HYBRID_TOKEN_SECRET_PATH)
			await provisionPortalDnsRecord({
				apiToken: input.cloudflareApiToken,
				zoneId: input.zoneId,
				name: input.portalDomain,
				ip: input.hostIp,
			})
			await Promise.all([
				redis.set(REDIS_PORTAL_SUBDOMAIN, input.portalDomain),
				redis.set(REDIS_PORTAL_ZONE_ID, input.zoneId),
				redis.set(REDIS_HOST_IP, input.hostIp),
				redis.set(REDIS_CF_TOKEN_PATH, HYBRID_TOKEN_SECRET_PATH),
			])
			return {success: true as const, subdomain: input.portalDomain, zoneId: input.zoneId}
		}),

	activateHybrid: adminProcedure
		.input(portalActivateSchema)
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			const subdomains: PortalSubdomainConfig[] = input.subdomains ?? []
			const caddyfile = generatePortalCaddyfile(input.subdomain, subdomains, true)
			await writeCaddyfile(caddyfile)
			await reloadCaddy()
			await Promise.all([
				redis.set(REDIS_LOCAL_MODE, 'portal'),
				redis.set(REDIS_PORTAL_SUBDOMAIN, input.subdomain),
				redis.set(REDIS_PORTAL_ZONE_ID, input.zoneId),
				redis.set(REDIS_HOST_IP, input.hostIp),
			])
			return {success: true, mode: 'portal' as const, subdomain: input.subdomain}
		}),

	getHybridStatus: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const [subdomain, zoneId, hostIp, cfTokenPath] = await Promise.all([
			redis.get(REDIS_PORTAL_SUBDOMAIN),
			redis.get(REDIS_PORTAL_ZONE_ID),
			redis.get(REDIS_HOST_IP),
			redis.get(REDIS_CF_TOKEN_PATH),
		])
		let cfTokenAvailable = false
		if (cfTokenPath) {
			try {
				const {stat} = await import('node:fs/promises')
				await stat(cfTokenPath)
				cfTokenAvailable = true
			} catch {
				cfTokenAvailable = false
			}
		}
		return {
			subdomain: subdomain ?? null,
			zoneId: zoneId ?? null,
			hostIp: hostIp ?? null,
			cfTokenAvailable,
		}
	}),
})

export default local
