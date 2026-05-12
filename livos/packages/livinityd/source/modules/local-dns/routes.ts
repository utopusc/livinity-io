// livos/packages/livinityd/source/modules/local-dns/routes.ts
// Source: 104-PATTERNS.md — mirrors domain/routes.ts shape.
//
// Phase 104 plan 104-03 — three tRPC procedures under the `local.*` namespace:
//   - local.getStatus   (query)     — mode + tld + hostIp + caCertAvailable
//   - local.activate    (mutation)  — write Caddyfile, reload Caddy, set Redis keys
//   - local.getCaCert   (query)     — return PEM of liv-local root CA

import {z} from 'zod'
import {router, privateProcedure} from '../server/trpc/trpc.js'
import {
	generateLocalCaddyfile,
	generateHybridCaddyfile,
	validateLocalTld,
	validateHybridDomain,
	writeCaddyfile,
	reloadCaddy,
	type LocalSubdomainConfig,
} from '../domain/caddy.js'
import {readRootCert} from './pki.js'

const REDIS_LOCAL_MODE = 'livos:domain:local_mode'
const REDIS_LOCAL_TLD = 'livos:domain:local_tld'
const REDIS_HOST_IP = 'livos:domain:host_ip'
// Phase 104 plan 104-04 — hybrid mode Redis keys
const REDIS_HYBRID_SUBDOMAIN = 'livos:domain:hybrid_subdomain'
const REDIS_HYBRID_ZONE_ID = 'livos:domain:hybrid_zone_id'
const REDIS_CF_TOKEN_PATH = 'livos:domain:cf_api_token_secret_ref'

// IPv4 regex — strict (4 octets, each 0-255). Matches install.sh detection output.
const IPV4_RE =
	/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/

const localActivateSchema = z.object({
	tld: z
		.string()
		.min(1)
		.max(253)
		.refine(validateLocalTld, {message: 'Invalid TLD shape'}),
	hostIp: z
		.string()
		.refine((v) => IPV4_RE.test(v), {message: 'Invalid IPv4'}),
	subdomains: z
		.array(z.object({name: z.string(), port: z.number().int().positive()}))
		.optional(),
})

// Phase 104 plan 104-04 — hybrid mode activation schema
const hybridActivateSchema = z.object({
	subdomain: z
		.string()
		.min(1)
		.max(253)
		.refine(validateHybridDomain, {message: 'Invalid hybrid domain shape'}),
	zoneId: z.string().min(1).max(100),
	hostIp: z.string().refine((v) => IPV4_RE.test(v), {message: 'Invalid IPv4'}),
	subdomains: z
		.array(z.object({name: z.string(), port: z.number().int().positive()}))
		.optional(),
})

const local = router({
	getStatus: privateProcedure.query(async ({ctx}) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const redis = (ctx as any).livinityd.ai.redis
		const [mode, tld, hostIp] = await Promise.all([
			redis.get(REDIS_LOCAL_MODE),
			redis.get(REDIS_LOCAL_TLD),
			redis.get(REDIS_HOST_IP),
		])
		// Probe whether the CA cert is readable (best-effort)
		let caCertAvailable = false
		try {
			await readRootCert()
			caCertAvailable = true
		} catch {
			caCertAvailable = false
		}
		return {
			mode: mode ?? null,
			tld: tld ?? null,
			hostIp: hostIp ?? null,
			caCertAvailable,
		}
	}),

	activate: privateProcedure
		.input(localActivateSchema)
		.mutation(async ({ctx, input}) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const redis = (ctx as any).livinityd.ai.redis
			const subdomains: LocalSubdomainConfig[] = input.subdomains ?? []
			const caddyfile = generateLocalCaddyfile(
				input.tld,
				input.hostIp,
				subdomains,
				true, // multiUser default for local-lan
			)
			await writeCaddyfile(caddyfile)
			await reloadCaddy()
			await Promise.all([
				redis.set(REDIS_LOCAL_MODE, 'local-lan'),
				redis.set(REDIS_LOCAL_TLD, input.tld),
				redis.set(REDIS_HOST_IP, input.hostIp),
			])
			return {success: true, mode: 'local-lan' as const, tld: input.tld}
		}),

	getCaCert: privateProcedure.query(async () => {
		const pem = await readRootCert()
		return {pem}
	}),

	// ─── Phase 104 plan 104-04 — hybrid mode procedures ─────────────────

	activateHybrid: privateProcedure
		.input(hybridActivateSchema)
		.mutation(async ({ctx, input}) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const redis = (ctx as any).livinityd.ai.redis
			const subdomains: LocalSubdomainConfig[] = input.subdomains ?? []
			const caddyfile = generateHybridCaddyfile(input.subdomain, subdomains, true)
			await writeCaddyfile(caddyfile)
			await reloadCaddy()
			await Promise.all([
				redis.set(REDIS_LOCAL_MODE, 'hybrid'),
				redis.set(REDIS_HYBRID_SUBDOMAIN, input.subdomain),
				redis.set(REDIS_HYBRID_ZONE_ID, input.zoneId),
				redis.set(REDIS_HOST_IP, input.hostIp),
			])
			return {success: true, mode: 'hybrid' as const, subdomain: input.subdomain}
		}),

	getHybridStatus: privateProcedure.query(async ({ctx}) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const redis = (ctx as any).livinityd.ai.redis
		const [subdomain, zoneId, hostIp, cfTokenPath] = await Promise.all([
			redis.get(REDIS_HYBRID_SUBDOMAIN),
			redis.get(REDIS_HYBRID_ZONE_ID),
			redis.get(REDIS_HOST_IP),
			redis.get(REDIS_CF_TOKEN_PATH),
		])
		// Probe whether the CF token file exists (best-effort; do NOT read it)
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
