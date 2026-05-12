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
	validateLocalTld,
	writeCaddyfile,
	reloadCaddy,
	type LocalSubdomainConfig,
} from '../domain/caddy.js'
import {readRootCert} from './pki.js'

const REDIS_LOCAL_MODE = 'livos:domain:local_mode'
const REDIS_LOCAL_TLD = 'livos:domain:local_tld'
const REDIS_HOST_IP = 'livos:domain:host_ip'

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
})

export default local
