// livos/packages/livinityd/source/modules/local-dns/routes.ts
// Source: 104-PATTERNS.md — mirrors domain/routes.ts shape.
//
// Phase 104 plan 104-03 — three tRPC procedures under the `local.*` namespace:
//   - local.getStatus   (query)     — mode + tld + hostIp + caCertAvailable
//   - local.activate    (mutation)  — write Caddyfile, reload Caddy, set Redis keys
//   - local.getCaCert   (query)     — return PEM of liv-local root CA

import {z} from 'zod'
import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import {
	generateHybridCaddyfile,
	validateHybridDomain,
	writeCaddyfile,
	reloadCaddy,
	type LocalSubdomainConfig,
} from '../domain/caddy.js'
// Phase 142-01 — local-lan retired; generateLocalCaddyfile + validateLocalTld
// dropped from caddy.ts. The legacy `local.activate` + `local.getCaCert`
// procedures (the only callers of those helpers + readRootCert) are removed
// from this router. `local.getStatus` no longer probes the CA cert.
// Phase 104 review fix WIZ-01 + PROVIDE-01: wire UI to the TS provisioner so
// the Cloudflare API token never leaves the LivOS host (was: dead UI + bash-only).
import {provisionHybridSubdomain, ServerSideProvisionUnavailable} from './hybrid-provision.js'

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

// Phase 104 review fix WIZ-01 + PROVIDE-01 — provisionHybrid input schema.
// Wraps provisionHybridSubdomain so the wizard can call Server5 via livinityd
// (which holds the CF token server-side) instead of dead prompt() calls.
const provisionHybridSchema = z.object({
	hostIp: z.string().refine((v) => IPV4_RE.test(v), {message: 'Invalid IPv4'}),
	cloudflareApiToken: z.string().min(1).max(4096),
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
		const redis = ctx.livinityd.ai.redis
		const [mode, tld, hostIp] = await Promise.all([
			redis.get(REDIS_LOCAL_MODE),
			redis.get(REDIS_LOCAL_TLD),
			redis.get(REDIS_HOST_IP),
		])
		// Phase 142-01 — `caCertAvailable` field retained for back-compat
		// with the wizard's existing destructure, but always reports false
		// (local-lan internal-CA path retired, readRootCert no longer wired).
		return {
			mode: mode ?? null,
			tld: tld ?? null,
			hostIp: hostIp ?? null,
			caCertAvailable: false,
		}
	}),

	// Phase 142-01 — `local.activate` (local-lan Caddyfile writer) +
	// `local.getCaCert` (PEM reader) removed. UI no longer offers a local-lan
	// branch; livinityd's local-mode internal-CA path is no longer used.

	// ─── Phase 104 plan 104-04 — hybrid mode procedures ─────────────────

	// Phase 104 review fix WIZ-01 + PROVIDE-01: wire UI ↔ Server5 control-plane
	// through livinityd so the Cloudflare API token never leaves the host. This
	// replaces the dead `prompt()` flow in HybridDnsSetup.tsx and removes the
	// drift risk between the bash provisioner in mode-hybrid.sh and the TS
	// helper in hybrid-provision.ts (which previously had no production caller).
	// PRIV-01: provisioning mutates apex DNS at Server5 + persists a CF token
	// reference path in Redis. Admin-only.
	provisionHybrid: adminProcedure
		.input(provisionHybridSchema)
		.mutation(async ({input}) => {
			try {
				const result = await provisionHybridSubdomain({
					hostIp: input.hostIp,
					cloudflareApiToken: input.cloudflareApiToken,
				})
				return {success: true as const, subdomain: result.subdomain, zoneId: result.zoneId}
			} catch (err) {
				// IMPORTANT: do NOT echo the input back in the error. The
				// underlying helper already strips the CF token from its own
				// messages (hybrid-provision.ts T-104-04-I1); we only need to
				// preserve the recoverable-vs-fatal distinction for the UI.
				if (err instanceof ServerSideProvisionUnavailable) {
					throw new Error(`Server5 control-plane unavailable: ${err.message}`)
				}
				throw err instanceof Error ? err : new Error(String(err))
			}
		}),

	// PRIV-01: same critique as `activate` — system-wide Caddyfile + Redis mutation.
	activateHybrid: adminProcedure
		.input(hybridActivateSchema)
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			const subdomains: LocalSubdomainConfig[] = input.subdomains ?? []
			const caddyfile = generateHybridCaddyfile(input.subdomain, subdomains, true)
			await writeCaddyfile(caddyfile)
			await reloadCaddy()
			// Phase 142-02 — `livos:domain:local_mode` now stores `portal`
			// (formerly `hybrid`). livinityd readers accept both indefinitely
			// for back-compat.
			await Promise.all([
				redis.set(REDIS_LOCAL_MODE, 'portal'),
				redis.set(REDIS_HYBRID_SUBDOMAIN, input.subdomain),
				redis.set(REDIS_HYBRID_ZONE_ID, input.zoneId),
				redis.set(REDIS_HOST_IP, input.hostIp),
			])
			return {success: true, mode: 'portal' as const, subdomain: input.subdomain}
		}),

	getHybridStatus: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
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
