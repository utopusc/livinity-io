/**
 * Desktop subdomain gateway — Phase 71-05 (CU-FOUND-02 / CU-FOUND-04).
 *
 * Intercepts requests to `desktop.{user}.{mainDomain}` and:
 *   1. Filters paths to ONLY: /computer-use*, /websockify*, /screenshot*, /health*
 *   2. Validates JWT (cookie OR ?token= for websockify cross-origin)
 *   3. Verifies an ACTIVE computer_use_tasks row exists (else 403) for protected
 *      paths — /health is exempt so health probes always succeed when the
 *      container is up.
 *   4. Bumps last_activity (D-09) — fire-and-forget so failures never block.
 *   5. Proxies to 127.0.0.1:{userPort}.
 *
 * Privileged container exposure mitigation (D-20 T-PRIVILEGED-CONTAINER):
 * the path filter is the security perimeter. Combined with single-user
 * Mini PC + LAN-only port bind, this acceptably contains the surface.
 *
 * Wave dependency: this file references a `ContainerManagerLike` SHAPE rather
 * than importing the concrete `ComputerUseContainerManager` from 71-04. This
 * keeps 71-05 typecheck-clean independent of 71-04 ship order, and 71-04's
 * class structurally satisfies this shape (per its plan must-haves).
 */
import type {Express, Request, Response, NextFunction} from 'express'
import type {Server} from 'node:http'
import {createProxyMiddleware} from 'http-proxy-middleware'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────

const ALLOWED_PREFIXES = ['/computer-use', '/websockify', '/screenshot', '/health'] as const
const ACTIVE_TASK_REQUIRED_PREFIXES = ['/computer-use', '/websockify', '/screenshot'] as const

function matchesPrefix(pathname: string, prefix: string): boolean {
	// Exact match OR prefix-with-slash. Excludes prefix-collision like
	// "/computer-useless" matching "/computer-use".
	return pathname === prefix || pathname.startsWith(prefix + '/')
}

// T-71-05-01 mitigation — reject any path segment containing '..' even though
// Express normalizes req.path. Belt-and-suspenders: the path filter is the
// security perimeter; a defensive check at the helper layer protects callers
// who feed raw input (tests, future direct callers).
function containsTraversal(pathname: string): boolean {
	return pathname.split('/').some((segment) => segment === '..')
}

export function isAllowedDesktopPath(pathname: string): boolean {
	if (containsTraversal(pathname)) return false
	return ALLOWED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

export function pathRequiresActiveTask(pathname: string): boolean {
	return ACTIVE_TASK_REQUIRED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

export function extractWebsockifyToken(req: {query?: Record<string, unknown>}): string | null {
	const t = req.query?.token
	if (typeof t !== 'string' || t.length === 0) return null
	return t // already URL-decoded by Express query parser
}

// ─────────────────────────────────────────────────────────────────────
// Container manager shape (structural type — see header comment)
// ─────────────────────────────────────────────────────────────────────

// Local alias used by ContainerManagerLike. The canonical `ContainerStatus`
// type is exported from `./container-manager.js` (71-04) and the structural
// shape matches: ContainerManagerLike intentionally widens to the union so
// the concrete ComputerUseContainerManager satisfies it without an explicit
// `implements`. Avoids a barrel re-export collision (D-72-01-01).
type GatewayContainerStatus = 'running' | 'idle' | 'stopped' | 'absent'

export interface ContainerManagerLike {
	ensureContainer(userId: string): Promise<{taskId: string; containerId: string; port: number; subdomain: string}>
	stopContainer(userId: string): Promise<void>
	getStatus(userId: string): Promise<GatewayContainerStatus>
	bumpActivity(userId: string): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────

export type GatewayLogger = {
	log: (msg: string) => void
	error: (msg: string, err?: unknown) => void
	verbose: (msg: string) => void
}

export type MountDesktopGatewayDeps = {
	app: Express
	server: Server
	manager: ContainerManagerLike
	getMainDomain: () => Promise<string | null>
	getMultiUserMode: () => Promise<boolean>
	verifyToken: (token: string) => Promise<unknown>
	logger: GatewayLogger
}

const proxyCache = new Map<number, ReturnType<typeof createProxyMiddleware>>()

function getOrCreateProxy(port: number, logger: GatewayLogger) {
	let proxy = proxyCache.get(port)
	if (!proxy) {
		proxy = createProxyMiddleware({
			target: `http://127.0.0.1:${port}`,
			changeOrigin: true,
			ws: true,
			logProvider: () => ({
				log: logger.verbose,
				debug: logger.verbose,
				info: logger.verbose,
				warn: logger.verbose,
				error: logger.error,
			}),
		})
		proxyCache.set(port, proxy)
	}
	return proxy
}

function pathCannotRedirect(pathname: string): boolean {
	// /websockify is WS upgrade (no HTML body); /screenshot is API-style binary.
	// Both must return raw 401 instead of redirecting to /login.
	return pathname.startsWith('/websockify') || pathname.startsWith('/screenshot')
}

export function mountDesktopGateway(deps: MountDesktopGatewayDeps): void {
	const {app, manager, getMainDomain, getMultiUserMode, verifyToken, logger} = deps

	app.use(async (req: Request, res: Response, next: NextFunction) => {
		try {
			const host = req.hostname
			if (!host) return next()

			const mainDomain = await getMainDomain()
			if (!mainDomain) return next()
			if (host === mainDomain) return next()
			if (!host.endsWith(`.${mainDomain}`)) return next()

			const subdomainChain = host.slice(0, -mainDomain.length - 1)
			// host is `desktop.{user}.{mainDomain}` → subdomainChain is `desktop.{user}`.
			// Accept ANY chain whose LEFTMOST segment is 'desktop'.
			if (subdomainChain !== 'desktop' && !subdomainChain.startsWith('desktop.')) {
				return next()
			}

			// 1. Path filter (security perimeter — T-71-05-01 mitigation)
			if (!isAllowedDesktopPath(req.path)) {
				return res.status(404).end()
			}

			// 2. Auth — JWT from cookie OR ?token= (websockify can't carry headers
			//    cross-origin; D-11)
			const multiUserEnabled = await getMultiUserMode()
			const cookieToken = (req.cookies as Record<string, string> | undefined)?.LIVINITY_SESSION
			const queryToken = extractWebsockifyToken(req as any)
			const token = cookieToken || queryToken

			if (!token) {
				if (pathCannotRedirect(req.path)) {
					return res.status(401).end()
				}
				return res.redirect(`https://${mainDomain}/login`)
			}

			let payload: any
			try {
				payload = await verifyToken(token)
			} catch {
				if (pathCannotRedirect(req.path)) {
					return res.status(401).end()
				}
				return res.redirect(`https://${mainDomain}/login`)
			}

			const userId: string | undefined = payload?.userId
			if (!userId && multiUserEnabled) {
				// Multi-user requires a per-user token (legacy single-user tokens
				// have no userId; reject them here). T-71-05-02 mitigation.
				if (pathCannotRedirect(req.path)) {
					return res.status(401).end()
				}
				return res.redirect(`https://${mainDomain}/login`)
			}

			// 3. Active-task gate (T-71-05-03 mitigation). /health is exempt.
			if (userId && pathRequiresActiveTask(req.path)) {
				const status = await manager.getStatus(userId)
				if (status === 'absent') {
					return res.status(403).send('No active computer-use task')
				}
			}

			// 4. Activity bump (D-09) — fire-and-forget; failures never block proxy.
			if (userId) {
				manager.bumpActivity(userId).catch((e) => logger.error(`bumpActivity failed for ${userId}`, e))
			}

			// 5. Resolve port + proxy. Read back the per-user app instance from the
			//    database (existing function — same as the generic app gateway).
			const {getUserAppInstance} = await import('../database/index.js')
			const instance = userId ? await getUserAppInstance(userId, 'bytebot-desktop') : null
			if (!instance) {
				return res.status(503).send('Container instance not found')
			}
			const proxy = getOrCreateProxy(instance.port, logger)
			logger.verbose(`Desktop gateway: ${host}${req.path} -> 127.0.0.1:${instance.port}`)
			return proxy(req, res, next)
		} catch (err) {
			logger.error('Desktop gateway error', err)
			return next()
		}
	})
}

/**
 * Register a `server.on('upgrade', ...)` handler for raw WebSocket upgrades
 * to the desktop subdomain. websockify sometimes opens WS first (no prior
 * HTTP fetch warming the cache), so we need a dedicated upgrade path.
 *
 * Phase 71-05 ships this as a stub because in the standalone /computer flow
 * (71-06) the browser first does an HTTP fetch for the page, which warms the
 * proxy cache via `mountDesktopGateway`. http-proxy-middleware's `ws:true`
 * option then proxies the subsequent upgrade automatically.
 *
 * If end-to-end smoke (71-06 checkpoint) reveals a WS first-frame race,
 * lift the existing upgrade handler pattern from server/index.ts:531-560
 * and gate by `desktop.*` host. Documented as a deferred lift-point in
 * 71-05-SUMMARY.md.
 */
export function mountDesktopWsUpgrade(_deps: {
	server: Server
	manager: ContainerManagerLike
	getMainDomain: () => Promise<string | null>
	getMultiUserMode: () => Promise<boolean>
	verifyToken: (token: string) => Promise<unknown>
	logger: GatewayLogger
}): void {
	return
}
