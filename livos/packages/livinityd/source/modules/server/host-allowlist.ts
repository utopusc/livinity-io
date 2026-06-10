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
 * Loopback carve-out (CR-01 / T-263-073-NEW): a genuine on-box loopback caller
 * (loopback Host AND loopback TCP peer AND no x-forwarded-for) is admitted —
 * this restores PRE-263 reachability for first-party internal callers (the
 * Nexus device-tool callback, the luse /trpc resolver) WITHOUT re-opening the
 * fail-open hole, because a forged loopback Host from a non-loopback peer (a
 * container at 172.17.x.x, or a proxied external request) still 403s. See the
 * inline carve-out comment for the full rationale.
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

			// ── Loopback carve-out (CR-01, threat-model row T-263-073-NEW
			// "fail-closed TOO hard" realized) ─────────────────────────────────
			//
			// L-073 closed a fail-OPEN apex gate: a forged Host arriving via Caddy
			// (`Host: evil.example.com`) must 403. But the SAME fail-closed branch
			// also 403s LEGITIMATE first-party on-box callers that reach the
			// loopback-bound :8080 directly using `Host: localhost`/`127.0.0.1` —
			// and these ran fine pre-263 (the old apex gate `next()`d non-apex
			// hosts). The two real callers (CR-01):
			//   1. Nexus device-tool callback — device-bridge.ts:190 defaults
			//      `callbackBaseUrl = 'http://localhost:8080'`; :251 POSTs
			//      `${callbackBaseUrl}/internal/device-tool-execute` → Host:
			//      localhost → 403 before the route runs → device tools break
			//      with NO fallback.
			//   2. luse MCP resolver — computer-use/mcp/server.ts (~:279) fetches
			//      `http://127.0.0.1:8080/trpc/...` → Host: 127.0.0.1 → 403 → the
			//      app resolver silently degrades to its static map.
			//
			// We admit ONLY a genuine on-box loopback caller, NOT a forged
			// loopback Host arriving over the network. ALL THREE must hold:
			//   (a) Host is a loopback literal (Express strips the port; handle
			//       the bracketed IPv6 form too).
			//   (b) The TCP PEER is loopback — the load-bearing condition.
			//       Containers reach :8080 from docker-bridge IPs (172.17.x.x)
			//       and LAN/tunnel traffic from LAN IPs, so a FORGED loopback
			//       Host from a non-loopback peer stays 403. Never trust the Host
			//       header alone.
			//   (c) The request is NOT proxied — no `x-forwarded-for` header.
			//       Caddy ALWAYS adds XFF when proxying; a direct on-box fetch
			//       never does. This stops any local reverse proxy from
			//       laundering an external request into the carve-out.
			//
			// This is strictly NARROWER than the old fail-open (which admitted any
			// non-apex Host regardless of peer): it restores PRE-263 reachability
			// for genuine on-box callers ONLY. The downstream per-route gates from
			// 263-01 (chrome session gate) / 263-03 (docker RBAC) / the
			// `/internal/*` ownership check / per-procedure /trpc auth still apply
			// — this only declines to Host-gate the loopback class.
			const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
			const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
			const peer = request.socket?.remoteAddress ?? ''
			const isProxied = request.headers['x-forwarded-for'] != null
			if (LOOPBACK_HOSTS.has(host) && LOOPBACK_PEERS.has(peer) && !isProxied) {
				return next()
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
