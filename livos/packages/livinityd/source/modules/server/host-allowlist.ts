/**
 * Phase 263-02 (L-073 Critical, architectural root) — Fail-closed Host-allowlist
 * middleware factory.
 *
 * Why this exists: the apex session gate (index.ts) is fail-OPEN for any Host
 * that is not the exact apex — `if (request.hostname !== domainConfig.domain)
 * return next()`. That means a forged/loopback Host (`127.0.0.1`,
 * `evil.example.com`, …) fell straight through the apex gate ungated and could
 * reach daemon routes directly on :8080. Live-confirmed pre-fix:
 *   curl -H 'Host: evil.example.com' http://127.0.0.1:8080/api/chrome/status -> 200
 * an information leak (real Chrome state). Today Caddy is an effective Host
 * allowlist (12 named blocks, no catch-all), but the daemon ships to cloud user
 * PCs whose ingress LivOS does not control, and :8080 is reachable directly from
 * any local process/container. The daemon MUST self-defend.
 *
 * This middleware is registered BEFORE the app-gateway middleware (index.ts) so
 * it runs first on the :8080 chain. It resolves the request Host against
 *   {apex ∪ enabled registered subdomains ∪ native-app subdomains ∪ approved
 *    custom domains}
 * and 403s (or 302 -> /login for text/html GET) any Host NOT in that set —
 * NEVER next(). Dev / no-domain-config boxes are a no-op (next()).
 *
 * Extracted into a factory (mirrors liv-login-handler.ts / chrome-launch.ts) so
 * the fail-closed branches are unit-testable in isolation — string-level Caddy
 * tests cannot catch a fail-open OR a fail-closed-too-hard regression (the
 * LIVOS-041 lesson). Live verification of the full :8080 chain is in plan
 * 263-06.
 *
 * Sacred SHA note: this is a NEW file in livinityd, NOT in liv/packages/core/.
 */
import type {Request, Response, NextFunction} from 'express'

/** A registered subdomain row as stored in `livos:domain:subdomains`. */
interface SubdomainRow {
	subdomain: string
	enabled: boolean
	/** Phase-140 hyphen pattern: a full FQDN that may not be `<subdomain>.<domain>`. */
	host?: string
}

/**
 * Minimal Redis surface this middleware depends on (RedisLike convention used
 * elsewhere in this package). Production passes the ioredis instance; tests pass
 * a Map-backed fake.
 */
export interface HostAllowlistDeps {
	redis: {get(key: string): Promise<string | null>}
	/**
	 * Subdomain labels (prefixes) of currently-registered native apps
	 * (e.g. ['pc'] for desktop streaming). Pulled lazily from
	 * `this.livinityd.apps.nativeInstances` at the mount.
	 */
	getNativeSubdomains: () => string[]
	/**
	 * Existence check: does `host` resolve to an APPROVED custom-domain mapping
	 * (DOM-06) WITHOUT performing the proxy? Reads the SAME source
	 * `routeCustomDomain` consults (`livos:custom_domain:<host>` + parent-domain
	 * fallback) and excludes `status === 'dns_changed'`.
	 */
	isApprovedCustomDomain: (host: string) => Promise<boolean>
	/** Structured error logger (wired to Server.logger.error). */
	logError: (message: string, error: unknown) => void
}

/**
 * Build the fail-closed Host-allowlist Express middleware. See the module
 * doc-comment and Plan 263-02 Task 1 for the full behavior contract.
 */
export function makeHostAllowlistMiddleware(deps: HostAllowlistDeps) {
	return async function hostAllowlist(
		request: Request,
		response: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const domainConfigRaw = await deps.redis.get('livos:domain:config')
			if (!domainConfigRaw) return next() // dev / no-domain box: unchanged
			const domainConfig = JSON.parse(domainConfigRaw)
			if (!domainConfig.active || !domainConfig.domain) return next()
			const mainDomain: string = domainConfig.domain

			const host = request.hostname
			if (!host) {
				response.status(403).json({error: 'forbidden host'})
				return
			}

			// Apex is always allowed (the apex session gate downstream does the
			// per-route auth).
			let allowed = host === mainDomain

			// Registered, ENABLED subdomains (host field OR <subdomain>.<domain>
			// reconstruction — mirrors the Phase-140 hyphen `host` pattern).
			if (!allowed) {
				const subsRaw = await deps.redis.get('livos:domain:subdomains')
				const subs: SubdomainRow[] = subsRaw ? JSON.parse(subsRaw) : []
				allowed = subs.some(
					(s) => s.enabled && (s.host === host || `${s.subdomain}.${mainDomain}` === host),
				)
			}

			// Native-app subdomains (e.g. "pc" for desktop streaming) — keep them
			// reachable. Only single-label subdomains of the apex qualify.
			if (!allowed) {
				const sub = host.endsWith(`.${mainDomain}`) ? host.slice(0, -mainDomain.length - 1) : ''
				if (sub && !sub.includes('.')) {
					allowed = deps.getNativeSubdomains().some((s) => s === sub)
				}
			}

			// Approved custom domains (DOM-06) — existence check without proxying.
			if (!allowed) {
				allowed = await deps.isApprovedCustomDomain(host).catch(() => false)
			}

			if (!allowed) {
				// FAIL-CLOSED — never next() for an unknown Host on a
				// domain-configured box.
				const accept = String(request.headers.accept ?? '')
				if (request.method === 'GET' && accept.includes('text/html')) {
					response.redirect(302, `https://${mainDomain}/login`)
					return
				}
				response.status(403).json({error: 'forbidden host'})
				return
			}
			return next()
		} catch (error) {
			// FAIL-CLOSED on internal error (mirror the apex gate's catch ->
			// never admit).
			deps.logError('Host allowlist middleware error (failing closed)', error)
			if (!response.headersSent) {
				response.status(403).json({error: 'forbidden host'})
			}
			return
		}
	}
}
