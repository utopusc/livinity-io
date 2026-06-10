import http from 'node:http'
import process from 'node:process'
import crypto from 'node:crypto'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {createGzip} from 'node:zlib'
import {pipeline} from 'node:stream/promises'
import {createConnection} from 'node:net'
import {spawn} from 'node:child_process'

import {$} from 'execa'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import Busboy from 'busboy'

import {WebSocketServer, WebSocket} from 'ws'
import {createProxyMiddleware} from 'http-proxy-middleware'

import getOrCreateFile from '../utilities/get-or-create-file.js'
import {resolveBindHost} from './bind-host.js'
import randomToken from '../utilities/random-token.js'
import {domains} from '@livos/config'

import type Livinityd from '../../index.js'
import * as jwt from '../jwt.js'
// Phase 262-01 (WS1 revocation gap): the jti revocation + active-user re-check
// previously lived ONLY in the tRPC isAuthenticated middleware. verifySessionFull
// below replicates it for the HTTP auth surfaces (/auth/verify forward_auth
// target, /__livos_sso bounce, apex session gate); /__livos_auth records its
// minted sessions via createSession so they are revocable.
import {findUserById, getPool} from '../database/index.js'
import {createSession, isSessionRevoked} from '../database/sessions.js'
import {parseSsoReturnTarget, sanitizeSsoPath} from './sso-handshake.js'
// Phase 263-01 (LIVOS-064 Critical) — pure security helpers for /api/chrome/*:
// the unauth 401 gate + the two no-shell url sinks (URL-encoded CDP fetch +
// argv spawn). See chrome-launch.ts for the threat rationale.
import {chromeSessionGate, buildCdpNewTabUrl, buildChromeLaunchArgv} from './chrome-launch.js'
import {attachVncBridge} from '../streaming/vnc-bridge.js'
import {trpcExpressHandler, trpcWssHandler} from './trpc/index.js'
import createTerminalWebSocketHandler from './terminal-socket.js'
import createDockerExecHandler from '../docker/docker-exec-socket.js'
import createDockerLogsHandler from '../docker/docker-logs-socket.js'
import {createSshSessionsWsHandler} from '../ssh-sessions/index.js'
import {createPtyTerminalWsHandler, SessionManager, createTtlGc, type IdleSweep} from '../pty-sessions/index.js'
import {
	downloadArchive as downloadContainerArchive,
	writeFile as writeContainerFile,
} from '../docker/container-files.js'
import {createAgentWsHandler, startAgentRevocationSubscriber} from './agent-socket.js'
import {
	getGitStack,
	updateGitStackSyncSha,
	controlStack,
	type GitStackRow,
} from '../docker/stacks.js'
import {syncRepo, copyComposeToStackDir} from '../docker/git-deploy.js'

import fileApi from '../files/api.js'
import {mountUsageCaptureMiddleware} from '../usage-tracking/index.js'
import {mountBearerAuthMiddleware} from '../api-keys/bearer-auth.js'
// Phase 169-05 — Vault Graph routes mount. Reuses livinityd.server.verifyToken
// (same JWT verifier as mountAgentRunsRoutes). vaultRoot is config-locked at
// mount time from `process.env.VAULT_ROOT` (or '/home/bruce/livinity-vault/'
// default on Mini PC; or `${cwd}/test-vault` under NODE_ENV=test).
import {mountVaultGraphRoutes} from '../vault-graph/routes.js'

export type ServerOptions = {livinityd: Livinityd}

export type ApiOptions = {
	publicApi: express.Router
	privateApi: express.Router
	livinityd: Livinityd
}

// Safely wrapps async request handlers in logic to catch errors and pass them to the errror handling middleware
const asyncHandler = (
	handler: (request: express.Request, response: express.Response, next: express.NextFunction) => Promise<any>,
) =>
	function asyncHandlerWrapper(request: express.Request, response: express.Response, next: express.NextFunction) {
		return Promise.resolve(handler(request, response, next)).catch(next)
	}

// Phase 262-01 (LIVOS-053) — the apex fail-closed gate's EXPLICIT allowlist.
// The apex host (`bruce.livinity.io`) previously had NO server-side auth gate:
// the app-gateway middleware bails with next() for host===mainDomain and the
// apex Caddy block is a bare reverse_proxy to :8080, so any route that forgot
// its own per-route check was exposed unauthenticated by default (the
// structural reason LIVOS-041 was reachable). The apexSessionGate middleware
// below inverts that posture: everything is session-gated UNLESS its path
// prefix is listed here. Allowlist construction is the dangerous part (per the
// LIVOS-053 residual-risk note) — keep entries minimal and justify each:
//   /login, /__livos_sso, /__livos_auth — the pre-auth login + SSO surfaces
//   /auth/                              — /auth/verify (forward_auth target;
//                                         validates the token itself)
//   /trpc                               — per-procedure auth enforced by the
//                                         tRPC isAuthenticated middleware
//   /api/auth                           — pre-auth auth API namespace
//   /api/mcp                            — own LIVINITY_PROXY_TOKEN check
//   /api/webhooks/                      — GitOps webhook: HMAC-SHA256
//                                         signature IS the auth (GitHub POSTs
//                                         carry no session cookie; gating it
//                                         would silently break deploy-on-push)
//   /assets/ /icons/ /fonts/ /favicon /manifest /sw.js /registerSW.js
//   /workbox-                           — SPA shell + PWA statics the /login
//                                         page needs pre-auth
// DELIBERATELY NOT LISTED: /liv-login and /liv (LIVOS-041 — they are the
// gated surfaces), /api/gmail (operator browser carries the apex cookie).
const APEX_PUBLIC_PREFIXES = [
	'/login',
	'/auth/',
	'/__livos_sso',
	'/__livos_auth',
	'/trpc',
	'/api/auth',
	'/api/mcp',
	'/api/webhooks/',
	'/assets/',
	'/icons/',
	'/fonts/',
	'/favicon',
	'/manifest',
	'/sw.js',
	'/registerSW.js',
	'/workbox-',
]

// Pre-auth static assets (login wallpaper, hashed bundle chunks, fonts the
// regexless prefixes above don't cover). GET-only — see apexSessionGate.
const APEX_STATIC_ASSET_RE = /\.(js|css|map|svg|png|jpg|ico|woff2?|webmanifest)$/

// Iterate over all routes and wrap them in an async handler
const wrapHandlersWithAsyncHandler = (router: express.Router) => {
	// Loop over each layer of the router stack
	for (const layer of router.stack) {
		// If we have a nested router, recursively wrap its handlers
		if (layer.name === 'router') wrapHandlersWithAsyncHandler(layer.handle)
		// If we have a route, wrap its handlers
		else if (layer.route) {
			for (const routeLayer of layer.route.stack) routeLayer.handle = asyncHandler(routeLayer.handle)
		}
	}
}

class Server {
	livinityd: Livinityd
	logger: Livinityd['logger']
	port: number | undefined
	app?: express.Express
	server?: http.Server
	webSocketRouter = new Map<string, WebSocketServer>()
	private appGatewayProxyCache = new Map<number, ReturnType<typeof createProxyMiddleware>>()
	// Phase 246-03 — single SessionManager instance per livinityd process.
	// Shared between the /livos/terminal/ws handler (create/attach) and the
	// `ptySessions.*` admin tRPC sub-router (list/kill). Exposed as a public
	// field so livinityd boot can pass it to createAppRouter via
	// `createPtySessionsAdminRouter({sessionManager: this.server.ptySessionManager})`.
	readonly ptySessionManager: SessionManager = new SessionManager()
	// Phase 246-05 — TTL GC singleton (24h idle / 1h sweep). Bounded cleanup
	// for stale PTYs after 246-03 broke the ws.close → kill semantic. Wired
	// in the constructor (needs `this.logger`); started at the tail of start()
	// after the WS endpoint is mounted. Audit trail goes through the child
	// logger 'pty-ttl-gc'; journalctl captures every kill (T-246-05-03 mit).
	private readonly ptyTtlGc: IdleSweep

	constructor({livinityd}: ServerOptions) {
		this.livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
		// Livinityd's logger surface is {log, verbose, error, createChildLogger}.
		// TtlGcDeps wants `info(msg, ctx)` — wrap the child logger's `log` to
		// preserve the audit trail (T-246-05-03 journalctl mit) without
		// reshaping the parent logger contract.
		const ttlGcChild = this.logger.createChildLogger('pty-ttl-gc')
		this.ptyTtlGc = createTtlGc({
			sessionManager: this.ptySessionManager,
			logger: {
				info: (msg, ctx) =>
					ttlGcChild.log(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg),
			},
		})
	}

	async getJwtSecret() {
		const jwtSecretPath = `${this.livinityd.dataDirectory}/secrets/jwt`
		return getOrCreateFile(jwtSecretPath, randomToken(256))
	}

	/**
	 * Sign a legacy token (no userId). Used for backward compat.
	 */
	async signToken() {
		return jwt.sign(await this.getJwtSecret())
	}

	/**
	 * Sign a new multi-user token with userId and role.
	 */
	async signUserToken(userId: string, role: string) {
		return jwt.signUserToken(await this.getJwtSecret(), userId, role)
	}

	async signProxyToken() {
		return jwt.signProxyToken(await this.getJwtSecret())
	}

	/**
	 * Verify a token and return the full payload (supports both legacy and new tokens).
	 */
	async verifyToken(token: string) {
		return jwt.verify(token, await this.getJwtSecret())
	}

	/**
	 * Phase 262-01 (WS1 revocation gap) — FULL session validation for HTTP auth
	 * surfaces. Mirrors the tRPC isAuthenticated middleware
	 * (server/trpc/is-authenticated.ts:80-100) exactly:
	 *   1. signature + exp via verifyToken (invalid → null);
	 *   2. userId-bearing tokens must resolve to an ACTIVE user (missing or
	 *      deactivated → null; fail closed). Skipped when no PG pool — the
	 *      single-user no-DB path only ever holds legacy no-userId tokens;
	 *   3. jti revocation: reject ONLY an EXPLICITLY revoked row. A MISSING
	 *      session row must NOT reject (257-04.1: tokens minted before
	 *      session-tracking carry a jti but no row — a false-revoke would lock
	 *      out every existing session). isSessionRevoked implements this.
	 * Any internal error → null (fail closed), matching the middleware's
	 * catch → UNAUTHORIZED behavior.
	 */
	async verifySessionFull(token: string): Promise<jwt.VerifiedJwtPayload | null> {
		try {
			const payload = await this.verifyToken(token).catch(() => null)
			if (!payload) return null
			if (payload.userId && getPool()) {
				const dbUser = await findUserById(payload.userId)
				if (!dbUser || !dbUser.isActive) return null
			}
			if (payload.jti && getPool()) {
				const revoked = await isSessionRevoked(payload.jti)
				if (revoked) return null
			}
			return payload
		} catch {
			return null
		}
	}

	async verifyProxyToken(token: string) {
		return jwt.verifyProxyToken(token, await this.getJwtSecret())
	}

	/** Phase 259 — mint a short-lived cross-subdomain SSO bounce token. */
	async signSsoToken(opts: {targetHost: string; userId?: string; role?: string; legacy?: boolean}) {
		return jwt.signSsoToken(await this.getJwtSecret(), opts)
	}

	/** Phase 259 — verify an SSO bounce token (audience-bound, throws on failure). */
	async verifySsoToken(token: string) {
		return jwt.verifySsoToken(token, await this.getJwtSecret())
	}

	/**
	 * Phase 259 — the operator's active main domain (`bruce.livinity.io`) or null
	 * when no domain is configured. The SSO bounce uses it to (a) validate that a
	 * return target is one of THIS operator's own app subdomains and (b) build the
	 * `/__livos_sso` host the gated app block redirects to.
	 */
	async getActiveMainDomain(): Promise<string | null> {
		try {
			const raw = await this.livinityd.ai.redis.get('livos:domain:config')
			if (!raw) return null
			const cfg = JSON.parse(raw)
			return cfg?.active && cfg?.domain ? String(cfg.domain) : null
		} catch {
			return null
		}
	}

	/**
	 * Route a request to a Docker container based on custom domain mapping.
	 * Returns true if the request was handled, false if not a custom domain.
	 * Custom domain traffic is public-facing — no LivOS auth required.
	 */
	private async routeCustomDomain(
		request: express.Request,
		response: express.Response,
		hostname: string,
	): Promise<boolean> {
		// Try exact hostname lookup first
		let domainInfoRaw = await this.livinityd.ai.redis.get(`livos:custom_domain:${hostname}`)
		let domainInfo: {domain: string; appMapping: Record<string, string>; status: string} | null = null
		let subPrefix = 'root'

		if (domainInfoRaw) {
			domainInfo = JSON.parse(domainInfoRaw)
		} else {
			// Try parent domain (e.g., blog.mysite.com -> mysite.com)
			const parts = hostname.split('.')
			if (parts.length > 2) {
				const parentDomain = parts.slice(1).join('.')
				domainInfoRaw = await this.livinityd.ai.redis.get(`livos:custom_domain:${parentDomain}`)
				if (domainInfoRaw) {
					domainInfo = JSON.parse(domainInfoRaw)
					subPrefix = parts[0] // e.g., "blog"
				}
			}
		}

		if (!domainInfo || domainInfo.status === 'dns_changed') return false

		const appSlug = domainInfo.appMapping[subPrefix]
		if (!appSlug) {
			// Domain matched but no app mapped for this prefix
			response.status(503).send('No app configured for this domain')
			return true
		}

		// Resolve appSlug to a port — try Docker container first, then fall back to subdomain config
		let targetPort: number | null = null

		// Strategy 1: Look up Docker container by name and get its published host port
		try {
			const containers = await this.livinityd.apps.docker.listContainers({all: false})
			// Phase 257-06 (LIVOS-036): EXACT container-name match only. The prior
			// `.includes(appSlug)` substring fallback could cross-route custom-domain
			// traffic to an unintended container (e.g. slug `web` matching
			// `webhook-admin`), exposing it publicly with no LivOS auth. An unknown or
			// colliding slug now resolves to no container, so the not-found 503 below
			// fires instead of proxying to the wrong port.
			const container = containers.find((c) =>
				c.Names.some((n) => n === `/${appSlug}` || n === appSlug),
			)
			if (container) {
				const portBinding = container.Ports.find((p) => p.PublicPort && p.Type === 'tcp')
				if (portBinding) targetPort = portBinding.PublicPort
			}
		} catch {
			// Docker lookup failed, fall back to subdomain config
		}

		// Strategy 2: Fall back to old subdomain config in Redis
		if (!targetPort) {
			const subdomainsRaw = await this.livinityd.ai.redis.get('livos:domain:subdomains')
			const subdomains: Array<{subdomain: string; appId: string; port: number; enabled: boolean}> =
				subdomainsRaw ? JSON.parse(subdomainsRaw) : []
			const subConfig = subdomains.find((s) => (s.appId === appSlug || s.subdomain === appSlug) && s.enabled)
			if (subConfig) targetPort = subConfig.port
		}

		if (!targetPort) {
			response.status(503).send(`App "${appSlug}" is not installed or not running`)
			return true
		}

		// Get or create cached proxy for this port
		let proxy = this.appGatewayProxyCache.get(targetPort)
		if (!proxy) {
			this.logger.log(`Custom domain gateway: creating proxy for ${appSlug} port ${targetPort}`)
			proxy = createProxyMiddleware({
				target: `http://127.0.0.1:${targetPort}`,
				changeOrigin: true,
				logProvider: () => ({
					log: this.logger.verbose,
					debug: this.logger.verbose,
					info: this.logger.verbose,
					warn: this.logger.verbose,
					error: this.logger.error,
				}),
			})
			this.appGatewayProxyCache.set(targetPort, proxy)
		}

		this.logger.verbose(`Custom domain: ${hostname} -> ${appSlug} port ${targetPort}`)
		return new Promise<boolean>((resolve) => {
			proxy!(request, response, () => resolve(false))
			response.on('finish', () => resolve(true))
		})
	}

	// Creates an isolated WebSocket server and mounts it at a specific path
	// All WebSocket servers require a valid auth token to connect
	mountWebSocketServer(path: string, setupHandler: (wss: WebSocketServer) => void) {
		// Create the WebSocket server
		const wss = new WebSocketServer({noServer: true})

		// Pass the WebSocket server to the setup handler so it can do whatever it needs
		setupHandler(wss)

		// Add the WebSocket server to the router
		this.webSocketRouter.set(path, wss)
	}

	async start() {
		// Ensure the JWT secret exists
		await this.getJwtSecret()

		// Create the handler and server
		this.app = express()
		this.server = http.createServer(this.app)

		// Don't timeout for slow uploads/downloads
		// TODO: Ideally we'd only remove timeout for authed upload/download
		// requests not globally to better protect against potential DoS attacks.
		// However Node.js only allows us to set the timeout globally. Risk is also
		// very low since this server is not exposed publically.
		// Looks like Bun supports per request timeout so if we move we could lock this
		// down a little tighter: https://bun.sh/docs/api/http#server-timeout-request-seconds-custom-request-timeouts
		this.server.requestTimeout = 0

		// Setup cookie parser
		this.app.use(cookieParser())

		// Security hardening, CSP
		this.app.use(
			helmet.contentSecurityPolicy({
				directives: {
					// Allow inline scripts for dev (vite) and canvas iframe (Babel transpilation)
					// CDN domains needed for Live Canvas srcdoc iframe (React, Recharts, Mermaid, Tailwind, Babel)
					scriptSrc: [
						"'self'",
						"'unsafe-inline'",
						"'unsafe-eval'",
						'https://unpkg.com',
						'https://cdn.tailwindcss.com',
						'https://cdn.jsdelivr.net',
					],
					// Allow 3rd party app images (remove this if we serve them locally in the future)
					// Also allow blob: URLs for images being uploaded in Files (since their thumbnails don't exist yet)
					// Also allow data: URLs for base64 images (e.g., WhatsApp QR code)
					imgSrc: ['*', 'blob:', 'data:'],
					// Allow fetching data from our apps API (e.g., for Discover page in App Store)
					// + Supabase auth/data endpoints used by self-hosted apps (Suna kortix-frontend
					// reaches the user's external Supabase Cloud project for auth + realtime)
					// + Phase 141-06: curated allowlist of trusted public APIs that bundled
					//   widgets call (currently weather widget uses open-meteo for geocoding +
					//   forecast). Origins go through a code review before being added — this
					//   list is the single source of truth, NOT widget-manifest-driven, so an
					//   untrusted third-party widget cannot whitelist arbitrary origins for
					//   itself. Add new origins here when adding a widget that needs them.
					connectSrc: [
						"'self'",
						'wss:',
						'ws:',
						'https://*.livinity.io',
						'https://*.supabase.co',
						'wss://*.supabase.co',
						'https://*.open-meteo.com',
					],
					// Allow iframes from marketplace and self
					frameSrc: ["'self'", `https://${domains.marketplace}`, `https://*.${domains.primary}`],
					// Allow CDN stylesheets for canvas iframe
					styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://fonts.googleapis.com'],
					// Allow CDN fonts + Google Fonts
					fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'],
					// Allow plain text access over the local network
					upgradeInsecureRequests: null,
				},
			}),
		)
		this.app.use(helmet.referrerPolicy({policy: 'no-referrer'}))
		this.app.disable('x-powered-by')

		// Attach the livinityd and logger instances so they're accessible to routes
		this.app.set('livinityd', this.livinityd)
		this.app.set('logger', this.logger)

		// Log requests
		this.app.use((request, response, next) => {
			this.logger.verbose(`${request.method} ${request.path}`)
			next()
		})

		// ── App Gateway ──────────────────────────────────────────────────────
		// Dynamic per-user subdomain routing for multi-user mode.
		// When Caddy wildcards all subdomains to livinityd, this middleware
		// intercepts subdomain requests and proxies to the correct container
		// based on the logged-in user's session.
		// Also handles custom domain routing (DOM-06) for public-facing traffic.

		this.app.use(async (request, response, next) => {
			try {
				const host = request.hostname
				if (!host) return next()

				// Get main domain config from Redis
				const domainConfigRaw = await this.livinityd.ai.redis.get('livos:domain:config')
				if (!domainConfigRaw) return next()
				const domainConfig = JSON.parse(domainConfigRaw)
				if (!domainConfig.active || !domainConfig.domain) return next()

				const mainDomain: string = domainConfig.domain

				// Main domain itself — fall through to normal routes
				if (host === mainDomain) return next()

				// Not a subdomain of mainDomain — check custom domains (DOM-06)
				if (!host.endsWith(`.${mainDomain}`)) {
					const customDomainResult = await this.routeCustomDomain(request, response, host)
					if (customDomainResult) return // Handled by custom domain routing
					return next() // Not a custom domain either, fall through
				}

				const subdomain = host.slice(0, -mainDomain.length - 1)
				if (!subdomain || subdomain.includes('.')) return next()

				// Look up subdomain → appId mapping from Redis
				const subdomainsRaw = await this.livinityd.ai.redis.get('livos:domain:subdomains')
				const subdomains: Array<{subdomain: string; appId: string; port: number; enabled: boolean; public?: boolean}> =
					subdomainsRaw ? JSON.parse(subdomainsRaw) : []
				const subConfig = subdomains.find((s) => s.subdomain === subdomain && s.enabled)

				// Skip NativeApp subdomains (e.g., "pc" for desktop streaming)
				// They're handled by dedicated Express routes below, not the app gateway
				if (!subConfig) {
					const isNative = this.livinityd.apps.nativeInstances.some(
						(app) => app.subdomain === subdomain
					)
					if (isNative) return next()
				}

				if (!subConfig) {
					return response.status(404).send('App not found')
				}

				// Default target: the global app port (single-user mode or shared app)
				let targetPort = subConfig.port

				// v30.5 — Public subdomain bypass for app backend APIs that handle
				// their own auth (e.g. Suna's kortix-api uses Supabase JWT). Without
				// this flag, the LivOS auth gate redirects to /login and breaks the
				// frontend↔backend browser flow because the browser doesn't carry
				// a LIVINITY_SESSION cookie.
				if (subConfig.public === true) {
					// Skip auth, jump straight to proxy
					let proxy = this.appGatewayProxyCache.get(targetPort)
					if (!proxy) {
						this.logger.log(`App gateway (public): creating proxy for port ${targetPort}`)
						proxy = createProxyMiddleware({
							target: `http://127.0.0.1:${targetPort}`,
							changeOrigin: true,
							logProvider: () => ({
								log: this.logger.verbose,
								debug: this.logger.verbose,
								info: this.logger.verbose,
								warn: this.logger.verbose,
								error: this.logger.error,
							}),
						})
						this.appGatewayProxyCache.set(targetPort, proxy)
					}
					return proxy(request, response, next)
				}

				// Auth: require valid session for app subdomain access.
				// In multi-user mode: LIVINITY_SESSION cookie with RBAC checks.
				// In single-user mode: LIVINITY_PROXY_TOKEN or LIVINITY_SESSION cookie.
				const multiUserEnabled = await this.livinityd.ai.redis.get('livos:system:multi_user')

				if (multiUserEnabled === 'true') {
					// Multi-user: check session cookie
					const sessionToken = request.cookies?.LIVINITY_SESSION
					if (!sessionToken) {
						return response.redirect(`https://${mainDomain}/login`)
					}

					const payload = await this.verifyToken(sessionToken).catch(() => null)
					if (!payload || typeof payload !== 'object' || !('loggedIn' in payload) || !payload.loggedIn) {
						return response.redirect(`https://${mainDomain}/login`)
					}

					// Look up per-user container port if userId is available
					if ('userId' in payload && payload.userId) {
						const {findAppPortForUser, hasAppAccess} = await import('../database/index.js')
						const isAdmin = 'role' in payload && payload.role === 'admin'

						const baseAppId = subConfig.appId.includes(':user:') ? subConfig.appId.split(':user:')[0] : subConfig.appId

						if (!isAdmin) {
							const canAccess = await hasAppAccess(payload.userId as string, baseAppId)
							if (!canAccess) {
								return response.status(403).send('Access denied')
							}
						}

						const userPort = await findAppPortForUser(payload.userId as string, baseAppId)
						if (userPort) {
							targetPort = userPort
						}
					}
				} else {
					// Single-user: require proxy token or session cookie
					const proxyToken = request.cookies?.LIVINITY_PROXY_TOKEN
					const sessionToken = request.cookies?.LIVINITY_SESSION
					const token = proxyToken || sessionToken
					if (!token) {
						return response.redirect(`https://${mainDomain}/login`)
					}
					// Verify whichever token is available
					const isValid = proxyToken
						? await this.verifyProxyToken(proxyToken).catch(() => false)
						: await this.verifyToken(sessionToken!).catch(() => false)
					if (!isValid) {
						return response.redirect(`https://${mainDomain}/login`)
					}
				}

				// Get or create cached proxy for this port
				let proxy = this.appGatewayProxyCache.get(targetPort)
				if (!proxy) {
					this.logger.log(`App gateway: creating proxy for port ${targetPort}`)
					proxy = createProxyMiddleware({
						target: `http://127.0.0.1:${targetPort}`,
						changeOrigin: true,
						// ws disabled — WS upgrades handled manually in upgrade handler
						logProvider: () => ({
							log: this.logger.verbose,
							debug: this.logger.verbose,
							info: this.logger.verbose,
							warn: this.logger.verbose,
							error: this.logger.error,
						}),
					})
					this.appGatewayProxyCache.set(targetPort, proxy)
				}

				this.logger.verbose(`App gateway: ${subdomain}.${mainDomain} -> 127.0.0.1:${targetPort}`)
				return proxy(request, response, next)
			} catch (error) {
				this.logger.error('App gateway error:', error)
				return next()
			}
		})

		// ── Apex Session Gate (Phase 262-01, LIVOS-053) ─────────────────────
		// FAIL-CLOSED auth gate for the apex host. Registered immediately AFTER
		// the app-gateway middleware so subdomain/custom-domain routing is
		// untouched; only requests whose hostname IS the active main domain are
		// gated. Dev / no-domain boxes are unaffected (no active domain config
		// → next()). Everything not on the explicit APEX_PUBLIC_PREFIXES
		// allowlist (or the GET static-asset shapes the /login SPA shell needs)
		// requires a session that passes verifySessionFull (signature + exp +
		// jti revocation + active-user re-check). On internal error: 401 —
		// NEVER next() — the inverse of the fail-open posture LIVOS-053 flags.
		this.app.use(async (request, response, next) => {
			try {
				// Same domain-config resolution as the app-gateway middleware.
				const domainConfigRaw = await this.livinityd.ai.redis.get('livos:domain:config')
				if (!domainConfigRaw) return next()
				const domainConfig = JSON.parse(domainConfigRaw)
				if (!domainConfig.active || !domainConfig.domain) return next()
				if (request.hostname !== domainConfig.domain) return next()

				const path = request.path ?? ''
				// The SPA shell itself (serves the /login route pre-auth).
				if (path === '/') return next()
				for (const prefix of APEX_PUBLIC_PREFIXES) {
					if (path.startsWith(prefix)) return next()
				}
				// Hashed bundle chunks / wallpapers / fonts — GET-only.
				if (request.method === 'GET' && APEX_STATIC_ASSET_RE.test(path)) return next()

				// Token resolution mirrors /auth/verify: Bearer header first,
				// then the LIVINITY_SESSION cookie.
				let token = request.headers.authorization?.split(' ')[1]
				if (!token) token = request.cookies?.LIVINITY_SESSION
				const session = token ? await this.verifySessionFull(token) : null
				if (session) return next()

				// Logged-out browser navigation keeps the deep-link UX.
				const accept = String(request.headers.accept ?? '')
				if (request.method === 'GET' && accept.includes('text/html')) {
					return response.redirect(
						302,
						`/login?redirect=${encodeURIComponent(request.originalUrl ?? '/')}`,
					)
				}
				return response.status(401).json({error: 'unauthorized'})
			} catch (error) {
				// FAIL-CLOSED: an internal error must never admit the request.
				this.logger.error('Apex session gate error (failing closed)', error)
				if (!response.headersSent) {
					response.status(401).json({error: 'unauthorized'})
				}
				return
			}
		})

		// App proxy - routes /app/<appId>/* to the app's port
		// This allows accessing apps without port numbers: http://localhost/app/tailscale
		const appProxyCache = new Map<string, ReturnType<typeof createProxyMiddleware>>()

		this.app.use('/app/:appId', async (request, response, next) => {
			const appId = request.params.appId

			try {
				// Get the app from installed apps
				const apps = this.livinityd.apps.instances
				const app = apps.find((a: {id: string}) => a.id === appId)

				if (!app) {
					this.logger.verbose(`App proxy: App ${appId} not found`)
					return response.status(404).send(`App "${appId}" not found`)
				}

				// Read manifest to get port
				const manifest = await app.readManifest()
				if (!manifest.port) {
					this.logger.verbose(`App proxy: App ${appId} has no port configured`)
					return response.status(404).send(`App "${appId}" has no port configured`)
				}

				// Get or create cached proxy for this app
				let proxy = appProxyCache.get(appId)
				if (!proxy) {
					this.logger.log(`App proxy: Creating proxy for ${appId} -> port ${manifest.port}`)
					proxy = createProxyMiddleware({
						target: `http://localhost:${manifest.port}`,
						changeOrigin: true,
						// ws disabled — WS upgrades handled manually in upgrade handler
						pathRewrite: (path) => path.replace(`/app/${appId}`, '') || '/',
						logProvider: () => ({
							log: this.logger.verbose,
							debug: this.logger.verbose,
							info: this.logger.verbose,
							warn: this.logger.verbose,
							error: this.logger.error,
						}),
					})
					appProxyCache.set(appId, proxy)
				}

				this.logger.verbose(`App proxy: Routing /app/${appId} to port ${manifest.port}`)
				return proxy(request, response, next)
			} catch (error) {
				this.logger.error(`App proxy error for ${appId}:`, error)
				return next(error)
			}
		})

		// Handle WebSocket upgrade requests
		// We add a single upgrade handler for all WebSocket servers and check
		// for their existence in a router so we can be sure we destroy the socket
		// immediately if a match isn't found instead of keeping it open. This prevents
		// slowloris style DoS attacks.
		this.server?.on('upgrade', async (request, socket, head) => {
			try {
				// Grab the path and search params from the request
				const {pathname, searchParams} = new URL(`https://localhost${request.url}`)

				// ── Subdomain WebSocket Proxy ──────────────────────────────
				// When using multi-user mode, subdomain WebSocket upgrades
				// need to be proxied to the correct container port.
				const upgradeHost = request.headers.host?.split(':')[0] || ''
				const domainConfigRaw = await this.livinityd.ai.redis.get('livos:domain:config').catch(() => null)
				if (domainConfigRaw) {
					const domainConfig = JSON.parse(domainConfigRaw)
					if (domainConfig.active && domainConfig.domain && upgradeHost.endsWith(`.${domainConfig.domain}`)) {
						const subdomain = upgradeHost.slice(0, -domainConfig.domain.length - 1)
						if (subdomain && !subdomain.includes('.')) {
							const subdomainsRaw = await this.livinityd.ai.redis.get('livos:domain:subdomains')
							const subdomains: Array<{subdomain: string; appId: string; port: number; enabled: boolean}> =
								subdomainsRaw ? JSON.parse(subdomainsRaw) : []
							const subConfig = subdomains.find((s) => s.subdomain === subdomain && s.enabled)

							if (subConfig) {
								let targetPort = subConfig.port

								// Auth: require valid session for WebSocket subdomain access
								const multiUserEnabled = await this.livinityd.ai.redis.get('livos:system:multi_user')

								// Extract token from query params or cookies
								const cookieHeader = request.headers.cookie || ''
								let token = searchParams.get('token') || searchParams.get('LIVINITY_SESSION')
								if (!token) {
									const sessionMatch = cookieHeader.match(/LIVINITY_SESSION=([^;]+)/)
									if (sessionMatch) token = sessionMatch[1]
								}

								if (multiUserEnabled === 'true') {
									// Multi-user: require session token
									if (!token) {
										socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
										socket.destroy()
										return
									}
									const payload = await this.verifyToken(token).catch(() => null)
									if (!payload || typeof payload !== 'object' || !('loggedIn' in payload) || !payload.loggedIn) {
										socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
										socket.destroy()
										return
									}
									if ('userId' in payload && payload.userId) {
										const {findAppPortForUser, hasAppAccess} = await import('../database/index.js')
										const baseAppId = subConfig.appId.includes(':user:') ? subConfig.appId.split(':user:')[0] : subConfig.appId
										const isAdmin = 'role' in payload && payload.role === 'admin'
										if (!isAdmin) {
											const canAccess = await hasAppAccess(payload.userId as string, baseAppId)
											if (!canAccess) {
												socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
												socket.destroy()
												return
											}
										}
										const userPort = await findAppPortForUser(payload.userId as string, baseAppId)
										if (userPort) targetPort = userPort
									}
								} else {
									// Single-user: require proxy token or session cookie
									let proxyToken: string | null = null
									const proxyMatch = cookieHeader.match(/LIVINITY_PROXY_TOKEN=([^;]+)/)
									if (proxyMatch) proxyToken = proxyMatch[1]

									const authToken = token || proxyToken
									if (!authToken) {
										socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
										socket.destroy()
										return
									}
									const isValid = proxyToken
										? await this.verifyProxyToken(proxyToken).catch(() => false)
										: await this.verifyToken(authToken).catch(() => false)
									if (!isValid) {
										socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
										socket.destroy()
										return
									}
								}

								// Create proxy WebSocket connection to app container
								const upstream = new WebSocket(`ws://127.0.0.1:${targetPort}${pathname}${request.url?.includes('?') ? '?' + request.url.split('?')[1] : ''}`)
								const proxyWss = new WebSocketServer({noServer: true})

								upstream.on('open', () => {
									proxyWss.handleUpgrade(request, socket, head, (clientWs) => {
										proxyWss.close()
										clientWs.on('message', (data, isBinary) => {
											if (upstream.readyState === WebSocket.OPEN) upstream.send(data, {binary: isBinary})
										})
										upstream.on('message', (data, isBinary) => {
											if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, {binary: isBinary})
										})
										clientWs.on('close', () => upstream.close())
										upstream.on('close', () => clientWs.close())
										clientWs.on('error', () => upstream.close())
										upstream.on('error', () => clientWs.close())
									})
								})
								upstream.on('error', () => {
									proxyWss.close()
									socket.destroy()
								})
								return
							}
						}
					}
				}

				// ── Custom Domain WebSocket Proxy (DOM-06) ──────────────────
				// Route WebSocket upgrades for custom domains to correct container.
				// No auth required — custom domain traffic is public-facing.
				if (domainConfigRaw) {
					const domainConfig = JSON.parse(domainConfigRaw)
					if (domainConfig.active && domainConfig.domain) {
						// Only check if host is NOT a subdomain of mainDomain (those are handled above)
						if (upgradeHost !== domainConfig.domain && !upgradeHost.endsWith(`.${domainConfig.domain}`)) {
							let cdInfoRaw = await this.livinityd.ai.redis.get(`livos:custom_domain:${upgradeHost}`)
							let cdInfo: {domain: string; appMapping: Record<string, string>; status: string} | null = null
							let cdSubPrefix = 'root'

							if (cdInfoRaw) {
								cdInfo = JSON.parse(cdInfoRaw)
							} else {
								const parts = upgradeHost.split('.')
								if (parts.length > 2) {
									const parentDomain = parts.slice(1).join('.')
									cdInfoRaw = await this.livinityd.ai.redis.get(`livos:custom_domain:${parentDomain}`)
									if (cdInfoRaw) {
										cdInfo = JSON.parse(cdInfoRaw)
										cdSubPrefix = parts[0]
									}
								}
							}

							if (cdInfo && cdInfo.status !== 'dns_changed') {
								const appSlug = cdInfo.appMapping[cdSubPrefix]
								if (appSlug) {
									// Resolve port: Docker container first, then subdomain config
									let cdTargetPort: number | null = null
									try {
										const cdContainers = await this.livinityd.apps.docker.listContainers({all: false})
										// Phase 257-06 (LIVOS-036): EXACT container-name match only (no
										// substring fallback) — see the routeCustomDomain note above.
										const cdContainer = cdContainers.find((c) =>
											c.Names.some((n) => n === `/${appSlug}` || n === appSlug),
										)
										if (cdContainer) {
											const cdPortBinding = cdContainer.Ports.find((p) => p.PublicPort && p.Type === 'tcp')
											if (cdPortBinding) cdTargetPort = cdPortBinding.PublicPort
										}
									} catch { /* fall back */ }
									if (!cdTargetPort) {
										const cdSubdomainsRaw = await this.livinityd.ai.redis.get('livos:domain:subdomains')
										const cdSubdomains: Array<{subdomain: string; appId: string; port: number; enabled: boolean}> =
											cdSubdomainsRaw ? JSON.parse(cdSubdomainsRaw) : []
										const cdSubConfig = cdSubdomains.find((s) => (s.appId === appSlug || s.subdomain === appSlug) && s.enabled)
										if (cdSubConfig) cdTargetPort = cdSubConfig.port
									}

									if (cdTargetPort) {
										const upstream = new WebSocket(
											`ws://127.0.0.1:${cdTargetPort}${pathname}${request.url?.includes('?') ? '?' + request.url.split('?')[1] : ''}`,
										)
										const proxyWss = new WebSocketServer({noServer: true})

										upstream.on('open', () => {
											proxyWss.handleUpgrade(request, socket, head, (clientWs) => {
												proxyWss.close()
												clientWs.on('message', (data, isBinary) => {
													if (upstream.readyState === WebSocket.OPEN) upstream.send(data, {binary: isBinary})
												})
												upstream.on('message', (data, isBinary) => {
													if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, {binary: isBinary})
												})
												clientWs.on('close', () => upstream.close())
												upstream.on('close', () => clientWs.close())
												clientWs.on('error', () => upstream.close())
												upstream.on('error', () => clientWs.close())
											})
										})
										upstream.on('error', () => {
											proxyWss.close()
											socket.destroy()
										})
										return
									}
								}
							}
						}
					}
				}

				// ── Outbound Docker Agent WebSocket (Phase 22 MH-04) ───────
				// /agent/connect accepts the docker-agent's per-token auth via
				// the FIRST `register` message (NOT a query-string JWT — agents
				// don't have JWTs). We branch BEFORE the generic webSocketRouter
				// lookup so the agent token gate is the only auth on this path.
				if (pathname === '/agent/connect') {
					const agentWss = new WebSocketServer({noServer: true})
					agentWss.handleUpgrade(request, socket, head, (ws) => {
						agentWss.close() // single-use; the connection is now owned by the handler
						const agentLogger = this.logger.createChildLogger('agent-socket')
						const handler = createAgentWsHandler({logger: agentLogger})
						handler(ws, request).catch((err) => agentLogger.error('handler failed', err))
					})
					return
				}

				// ── Voice WebSocket Proxy ──────────────────────────────────
				// /ws/voice lives on nexus-core (port 3200), not livinityd.
				// We proxy the upgrade directly to nexus-core, forwarding the
				// original JWT token which both services share.
				if (pathname === '/ws/voice') {
					const token = searchParams.get('token')
					if (!token) {
						this.logger.verbose(`WS voice proxy rejected: no token`)
						socket.destroy()
						return
					}

					const isValid = await this.verifyToken(token)
					if (!isValid) {
						this.logger.verbose(`WS voice proxy rejected: invalid token`)
						socket.destroy()
						return
					}

					this.logger.verbose(`WS voice proxy: connecting to nexus-core`)

					// Create upstream WebSocket to nexus-core
					// Use API key auth (JWT won't work because nexus-core reads
					// /data/secrets/jwt which may differ from livinityd's data dir)
					const wsOpts: {headers?: Record<string, string>} = {}
					if (process.env.LIV_API_KEY) {
						wsOpts.headers = {'X-API-Key': process.env.LIV_API_KEY}
					}
					const upstream = new WebSocket('ws://localhost:3200/ws/voice', wsOpts)
					const proxyWss = new WebSocketServer({noServer: true})

					// Wait for upstream to be ready before upgrading the client
					upstream.on('open', () => {
						this.logger.verbose(`WS voice proxy: upstream connected`)

						proxyWss.handleUpgrade(request, socket, head, (clientWs) => {
							// Cleanup: proxyWss only needed for the upgrade
							proxyWss.close()

							// Bidirectional frame relay
							clientWs.on('message', (data, isBinary) => {
								if (upstream.readyState === WebSocket.OPEN) {
									upstream.send(data, {binary: isBinary})
								}
							})

							upstream.on('message', (data, isBinary) => {
								if (clientWs.readyState === WebSocket.OPEN) {
									clientWs.send(data, {binary: isBinary})
								}
							})

							clientWs.on('close', () => upstream.close())
							upstream.on('close', () => clientWs.close())
							clientWs.on('error', () => upstream.close())
							upstream.on('error', () => clientWs.close())
						})
					})

					// If upstream fails before upgrade, destroy the raw socket
					upstream.on('error', (err) => {
						this.logger.error(`WS voice proxy: upstream error`, err)
						proxyWss.close()
						socket.destroy()
					})

					return
				}

				// ── Desktop Stream WebSocket-to-TCP Proxy ──────────────────
				// /ws/desktop bridges browser WebSocket connections to x11vnc's
				// VNC TCP socket on localhost:5900. Binary frames flow bidirectionally.
				if (pathname === '/ws/desktop') {
					// 1. Origin validation
					const origin = request.headers.origin
					if (origin) {
						const domainCfgRaw = await this.livinityd.ai.redis.get('livos:domain:config').catch(() => null)
						let allowedDomain = ''
						if (domainCfgRaw) {
							const dc = JSON.parse(domainCfgRaw)
							if (dc.active && dc.domain) allowedDomain = dc.domain
						}
						if (allowedDomain) {
							const originUrl = new URL(origin)
							const originHost = originUrl.hostname
							if (originHost !== allowedDomain && !originHost.endsWith('.' + allowedDomain)) {
								this.logger.verbose('WS desktop rejected: origin mismatch', origin)
								socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
								socket.destroy()
								return
							}
						}
					}

					// 2. JWT auth (token from query param or LIVINITY_SESSION cookie)
					let desktopToken = searchParams.get('token')
					if (!desktopToken) {
						const cookieHeader = request.headers.cookie || ''
						const sessionMatch = cookieHeader.match(/LIVINITY_SESSION=([^;]+)/)
						if (sessionMatch) desktopToken = sessionMatch[1]
					}
					if (!desktopToken) {
						this.logger.verbose('WS desktop rejected: no token')
						socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
						socket.destroy()
						return
					}
					const desktopAuthValid = await this.verifyToken(desktopToken).catch(() => false)
					if (!desktopAuthValid) {
						this.logger.verbose('WS desktop rejected: invalid token')
						socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
						socket.destroy()
						return
					}

					// 3. NativeApp auto-start
					const hasGui = await this.livinityd.ai.redis.get('livos:desktop:has_gui').catch(() => null)
					if (hasGui !== 'true') {
						this.logger.verbose('WS desktop rejected: no GUI available')
						socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
						socket.destroy()
						return
					}
					const desktopApp = this.livinityd.apps.getNativeApp('desktop-stream')
					if (!desktopApp) {
						this.logger.verbose('WS desktop rejected: desktop-stream app not registered')
						socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
						socket.destroy()
						return
					}
					if (desktopApp.state !== 'ready') {
						try {
							await desktopApp.start()
						} catch (err) {
							this.logger.error('WS desktop: failed to start x11vnc', err)
							socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
							socket.destroy()
							return
						}
					}
					desktopApp.resetIdleTimer()

					// 4. Create TCP connection to x11vnc
					const vnc = createConnection({host: '127.0.0.1', port: 5900})
					const desktopWss = new WebSocketServer({noServer: true})

					vnc.on('connect', () => {
						this.logger.verbose('WS desktop: VNC TCP connected, upgrading client')
						desktopWss.handleUpgrade(request, socket, head, (ws) => {
							desktopWss.close()
							ws.binaryType = 'nodebuffer'

							// Reset idle timer periodically while connection is active (every 5 min)
							const idleResetInterval = setInterval(() => {
								desktopApp.resetIdleTimer()
							}, 5 * 60 * 1000)

							// Bidirectional binary relay
							ws.on('message', (data) => {
								if (vnc.writable) vnc.write(Buffer.from(data as ArrayBuffer))
							})

							// Throttled idle timer reset on VNC data activity (max once per 60s)
							let lastIdleReset = Date.now()
							vnc.on('data', (data) => {
								if (ws.readyState === 1) ws.send(data)
								const now = Date.now()
								if (now - lastIdleReset > 60_000) {
									desktopApp.resetIdleTimer()
									lastIdleReset = now
								}
							})

							// Cleanup: close one side when the other disconnects
							ws.on('close', () => {
								clearInterval(idleResetInterval)
								vnc.destroy()
							})
							vnc.on('close', () => ws.close())
							vnc.on('error', (err) => {
								this.logger.error('WS desktop: VNC TCP error', err)
								ws.close(1011, 'VNC connection error')
							})
							ws.on('error', () => {
								clearInterval(idleResetInterval)
								vnc.destroy()
							})
						})
					})

					vnc.on('error', (err) => {
						this.logger.error('WS desktop: VNC TCP connect error', err)
						desktopWss.close()
						socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
						socket.destroy()
					})

					return
				}

				// ── Phase 93 — Streaming Subsystem WS Endpoint ────────────
				// /ws/stream/<streamId> attaches a browser to the StreamManager's
				// per-stream Fmp4Fanout. JWT-from-query auth (LIVINITY_SESSION
				// cookie fallback) per D-93-06. Ownership check: stream's owning
				// userId must match the verified token's user. 404 (NOT 403) on
				// foreign stream-id lookups to avoid existence leak (STRIDE I).
				if (pathname.startsWith('/ws/stream/')) {
					// 1. Extract streamId from path
					const streamIdMatch = pathname.match(/^\/ws\/stream\/([0-9a-f-]+)$/i)
					if (!streamIdMatch) {
						this.logger.verbose('WS stream rejected: malformed streamId in path')
						socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
						socket.destroy()
						return
					}
					const streamId = streamIdMatch[1]

					// 2. JWT auth (token from query param or LIVINITY_SESSION cookie)
					let streamToken = searchParams.get('token')
					if (!streamToken) {
						const cookieHeader = request.headers.cookie || ''
						const sessionMatch = cookieHeader.match(/LIVINITY_SESSION=([^;]+)/)
						if (sessionMatch) streamToken = sessionMatch[1]
					}
					if (!streamToken) {
						this.logger.verbose(`WS stream ${streamId} rejected: no token`)
						socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
						socket.destroy()
						return
					}
					const streamPayload = await this.verifyToken(streamToken).catch(() => null)
					if (!streamPayload) {
						this.logger.verbose(`WS stream ${streamId} rejected: invalid token`)
						socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
						socket.destroy()
						return
					}
					// Legacy single-user JWT shape: {loggedIn:true} → maps to admin.
					// Multi-user shape: {userId, role, sessionId}.
					const streamUserId =
						(streamPayload as {userId?: string}).userId ?? 'admin'

					// 3. Stream lookup via StreamManager
					const streamManager = this.livinityd.streamManager
					if (!streamManager) {
						this.logger.verbose(`WS stream ${streamId} rejected: StreamManager not available`)
						socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
						socket.destroy()
						return
					}
					const ownedStreams = streamManager.listStreams({userId: streamUserId})
					const ownedStream = ownedStreams.find((s) => s.streamId === streamId)
					if (!ownedStream) {
						this.logger.verbose(`WS stream ${streamId} rejected: not found for user ${streamUserId}`)
						socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
						socket.destroy()
						return
					}

					// Phase 99-04: dispatch on session.kind. Auth + ownership already
					// verified above (D-99-02 — auth gate stays in livinityd, NOT in
					// websockify). The vnc branch byte-pipes RFB frames between the
					// browser's noVNC client and a per-window x11vnc TCP rfbport. The
					// fmp4 branch preserves the existing Fmp4Fanout subscriber path
					// for mode:'desktop' (D-99-04).
					const session = streamManager.getSession(streamId)
					if (!session) {
						this.logger.verbose(`WS stream ${streamId} rejected: getSession returned null (race?)`)
						socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
						socket.destroy()
						return
					}

					// 4. Upgrade to WS and dispatch on kind
					const streamWss = new WebSocketServer({noServer: true})
					streamWss.handleUpgrade(request, socket, head, (ws) => {
						streamWss.close()
						ws.binaryType = 'nodebuffer'
						if (session.kind === 'vnc') {
							// Phase 99 VNC bridge — pure-Node WS↔TCP byte pipe to x11vnc.
							// Handles close propagation, 4 MB backpressure drop, and
							// 3×100ms ECONNREFUSED retry (Pitfall 4).
							attachVncBridge(ws as never, {
								host: '127.0.0.1',
								port: session.rfbPort,
								logger: this.logger,
							})
							return
						}
						// fmp4 path (existing — D-99-04 preserved for mode:'desktop')
						const ok = streamManager.addSubscriber(streamId, ws)
						if (!ok) {
							this.logger.warn(`WS stream ${streamId}: addSubscriber returned false (race?)`)
							ws.close(1011, 'stream gone')
							return
						}
						ws.on('close', () => {
							const fanout = streamManager.getFanout(streamId)
							if (fanout) fanout.removeSubscriber(ws)
						})
						ws.on('error', (err) => {
							this.logger.warn(`WS stream ${streamId}: client error`, err)
							const fanout = streamManager.getFanout(streamId)
							if (fanout) fanout.removeSubscriber(ws)
						})
					})

					return
				}

				// ── Phase 246 — Persistent terminal WS cookie auth ────────────
				// /livos/terminal/ws authenticates via the LIVINITY_PROXY_TOKEN
				// cookie INSIDE the pty-terminal ws-handler (Gate 1), NOT via the
				// ?token= query the generic dispatcher below requires. The browser
				// terminal panel (use-terminal-ws.ts) deliberately sends no ?token=
				// (RFC 6455 forbids custom WS headers; the cookie travels with the
				// upgrade automatically). Route straight to handleUpgrade so the
				// handler's own verifyProxyToken + feature-flag gates run. Without
				// this branch the generic "no token → socket.destroy()" gate below
				// kills the connection before the handler can authenticate it,
				// surfacing as a 502 through Caddy / failed WS in the browser.
				if (pathname === '/livos/terminal/ws') {
					const terminalWss = this.webSocketRouter.get(pathname)
					if (!terminalWss) {
						if (this.livinityd.developmentMode) return
						socket.destroy()
						return
					}
					terminalWss.handleUpgrade(request, socket, head, (ws) =>
						terminalWss.emit('connection', ws, request),
					)
					return
				}

				// See if we have a WebSocket server for this path in our router
				const wss = this.webSocketRouter.get(pathname)

				// If this path isn't in the router stop and destroy the socket to prevent
				// DoS attacks.
				if (!wss) {
					// However we don't destroy the socket in development mode because
					// we want to allow WebSocket connections to be proxied through to
					// the vite HMR client.
					if (this.livinityd.developmentMode) return

					throw new Error(`No WebSocket server mounted for ${pathname}`)
				}

				// Verify the auth token before doing anything
				// We require passing the token like this because it's unsafe to rely on cookies
				// since they get leaked to other apps running on different ports on the same hostname
				// due to relaxed browser sandboxing.
				// We can't set custom headers because that not allowed by the WebSocket browser spec.
				const token = searchParams.get('token')
				if (!token) {
					this.logger.verbose(`WS upgrade rejected: no token provided for ${pathname}`)
					socket.destroy()
					return
				}

				const isValid = await this.verifyToken(token)
				if (isValid) {
					this.logger.verbose(`WS upgrade for ${pathname}`)
					// Upgrade connection to WebSocket and fire the connection handler
					wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request))
				} else {
					this.logger.verbose(`WS upgrade rejected: invalid token for ${pathname}`)
					socket.destroy()
				}
			} catch (error) {
				this.logger.error(`Error upgrading websocket`, error)
				socket.destroy()
			}
		})

		// This is needed for legacy reasons when 0.5.x users OTA update to 1.0.
		// 0.5.x polls this endpoint during update to know when it's completed.
		this.app.get('/manager-api/v1/system/update-status', (request, response) => {
			response.json({state: 'success', progress: 100, description: '', updateTo: ''})
		})

		// Phase 104 plan 104-03 — Local-mode CA root certificate.
		// PUBLIC (unauthenticated) by design (V13): devices need this BEFORE they can
		// trust HTTPS from livinityd. Mode-gated by Redis flag — 404s in cloud/hybrid.
		// Path is intentionally exact-match (not a prefix) to prevent leaking other
		// endpoints (research §V13 security pitfall).
		// Phase 142-01 + 143-04 — local-lan mode retired; the readRootCert helper
		// (pki.ts) is deleted. Keep this Express route handler in place so old
		// QR codes that still reference /api/local/ca.crt get a clean 410 Gone
		// instead of a 500 (the URL was public-facing). Any future caller is
		// looking for a feature that no longer exists.
		this.app.get('/api/local/ca.crt', (_request, response) => {
			response.status(410).json({
				error: 'local-lan mode retired (Phase 142-01)',
				hint: 'Use --mode portal (Phase 142-02) — Cloudflare-issued cert at the edge',
			})
		})

		// Phase 256-04 (LIVOS-008) — forward_auth target for the Caddy subdomain
		// login gate. Caddy proxies the gated request's headers here; we return
		// 200 ONLY when a valid JWT is present, else 401. This replaces the old
		// cookie-PRESENCE-only Caddy glob (which any LIVINITY_SESSION=<garbage>
		// cookie satisfied) with real JWT validation.
		// Phase 262-01 (WS1 revocation gap): upgraded from bare verifyToken to
		// verifySessionFull — a revoked or deactivated-user session now 401s
		// here, which transitively hardens EVERY forward_auth consumer: the
		// 256-04 app/native subdomain gates AND the new /liv-family gates
		// (@liv, @liv_ws, @liv_api_subresource, @livos_terminal_ws, @liv_login).
		// Reachable on the livinityd :8080 listener for ALL hosts — it is NOT
		// itself gated by the subdomain logic.
		this.app.get('/auth/verify', async (request, response) => {
			try {
				// Prefer the Authorization: Bearer header, fall back to the
				// LIVINITY_SESSION cookie (cookieParser already mounted).
				let token = request.headers.authorization?.split(' ')[1]
				if (!token) token = request.cookies?.LIVINITY_SESSION
				if (!token) {
					return response.status(401).json({error: 'unauthorized'})
				}
				const payload = await this.verifySessionFull(token)
				if (!payload) {
					return response.status(401).json({error: 'unauthorized'})
				}
				return response.status(200).end()
			} catch {
				return response.status(401).json({error: 'unauthorized'})
			}
		})

		// Phase 259 — cross-subdomain SSO bounce. STEP 1 (runs on the operator's
		// apex `<user>.<base>`, where the host-only LIVINITY_SESSION cookie IS sent):
		// validate the parent session, then mint a 30s single-use token bound to the
		// target app host and redirect to that host's /__livos_auth. A truly logged-
		// out caller falls through to the real /login. The gated app block (caddy.ts)
		// 401-redirects here instead of straight to /login so a logged-in operator is
		// transparently admitted to the app subdomain WITHOUT re-widening the cookie.
		this.app.get('/__livos_sso', async (request, response) => {
			try {
				const ret = typeof request.query.return === 'string' ? request.query.return : ''
				const mainDomain = await this.getActiveMainDomain()
				if (!mainDomain) return response.status(404).send('no domain configured')
				const target = parseSsoReturnTarget(ret, mainDomain)
				// Bad / foreign / non-app return target → never redirect to it (open-redirect guard).
				if (!target) return response.status(400).send('invalid return target')

				// Phase 262-01 (WS1 revocation gap): verifySessionFull — a revoked
				// or deactivated-user session must not get an SSO bounce token.
				const sessionToken = request.cookies?.LIVINITY_SESSION
				const payload = sessionToken ? await this.verifySessionFull(sessionToken) : null
				if (!payload) {
					// Genuinely unauthenticated — send to the real login, preserving the return.
					return response.redirect(
						`https://${mainDomain}/login?redirect=${encodeURIComponent(ret)}`,
					)
				}

				const {token, jti} = await this.signSsoToken({
					targetHost: target.host,
					userId: payload.userId,
					role: payload.role,
					legacy: !payload.userId,
				})
				// Single-use: record the jti (consumed via GETDEL at /__livos_auth). TTL a
				// hair above the token TTL so an expired token can't find a live jti.
				await this.livinityd.ai.redis.set(`livos:sso:jti:${jti}`, '1', 'EX', 35)

				return response.redirect(
					`https://${target.host}/__livos_auth?t=${encodeURIComponent(token)}&r=${encodeURIComponent(target.path)}`,
				)
			} catch (err) {
				this.logger.error('[sso] /__livos_sso failed', err)
				return response.status(500).send('sso error')
			}
		})

		// Phase 259 — cross-subdomain SSO bounce. STEP 2 (runs ON the app subdomain
		// `<app>-<user>.<base>` — Caddy routes /__livos_auth here, bypassing the gate):
		// verify the single-use token, confirm it was minted for THIS host, then set a
		// HOST-SCOPED session cookie (no `domain` attr → bound to this app host only,
		// no cross-tenant leak) and redirect to the original path. The forward_auth
		// gate now sees a valid cookie on the next request.
		this.app.get('/__livos_auth', async (request, response) => {
			try {
				const t = typeof request.query.t === 'string' ? request.query.t : ''
				const r = sanitizeSsoPath(typeof request.query.r === 'string' ? request.query.r : '/')
				// The host the browser asked for (Caddy preserves it; prefer XFH behind the proxy).
				const host = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '')
					.split(',')[0]
					.trim()
					.split(':')[0]
					.toLowerCase()
				if (!host) return response.status(400).send('no host')

				const claims = await this.verifySsoToken(t).catch(() => null)
				if (!claims) return response.status(401).send('invalid sso token')
				// Host binding — a token minted for app A can never authenticate app B.
				if (claims.targetHost.toLowerCase() !== host) return response.status(401).send('host mismatch')
				// Single-use consume — replay (token reused / left in history) is rejected.
				const consumed = await this.livinityd.ai.redis.getdel(`livos:sso:jti:${claims.jti}`)
				if (!consumed) return response.status(401).send('sso token already used or expired')

				// Mint a real session token for this user and set it HOST-ONLY on this app
				// subdomain (no domain attr → the browser scopes it to exactly this host).
				const sessionToken = claims.userId
					? await this.signUserToken(claims.userId, claims.role ?? 'member')
					: await this.signToken()

				// Phase 262-01 (WS1 revocation gap): record the minted session's jti
				// so it is REVOCABLE — previously /__livos_auth minted a 30-day
				// cookie via signUserToken but never wrote a sessions row, so a
				// password change / deactivation could not kill it. Mirrors the
				// login call-site (user/routes.ts:191-202): recover the jti via
				// verifyToken, write via createSession, non-fatal on failure (a
				// failed session record must not block the SSO landing). Legacy
				// signToken() path skips — no userId, no jti, no user row.
				if (claims.userId) {
					try {
						const minted = await this.verifyToken(sessionToken).catch(() => null)
						if (minted?.jti) {
							await createSession({
								userId: claims.userId,
								jti: minted.jti,
								expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
							})
						}
					} catch (error) {
						this.logger.error('Failed to record SSO session for revocation tracking', error)
					}
				}

				response.cookie('LIVINITY_SESSION', sessionToken, {
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 30 * 24 * 60 * 60 * 1000,
				})
				return response.redirect(`https://${host}${r}`)
			} catch (err) {
				this.logger.error('[sso] /__livos_auth failed', err)
				return response.status(500).send('sso error')
			}
		})

		// Proxy MCP API requests to liv-core (Nexus) on port 3200
		this.app.use('/api/mcp', async (request, response, next) => {
			try {
				const token = request?.cookies?.LIVINITY_PROXY_TOKEN
				const isValid = await this.verifyProxyToken(token).catch(() => false)
				if (!isValid) return response.status(401).json({error: 'unauthorized'})
				next()
			} catch (error) {
				return response.status(401).json({error: 'unauthorized'})
			}
		}, createProxyMiddleware({
			target: 'http://localhost:3200',
			changeOrigin: true,
			onProxyReq: (proxyReq) => {
				if (process.env.LIV_API_KEY) {
					proxyReq.setHeader('X-API-Key', process.env.LIV_API_KEY)
				}
			},
			logProvider: () => ({
				log: this.logger.verbose,
				debug: this.logger.verbose,
				info: this.logger.verbose,
				warn: this.logger.verbose,
				error: this.logger.error,
			}),
		}))

		// Proxy Gmail OAuth callback to nexus-core (public — Google redirects browser here)
		this.app.use('/api/gmail', createProxyMiddleware({
			target: 'http://localhost:3200',
			changeOrigin: true,
			logProvider: () => ({
				log: this.logger.verbose,
				debug: this.logger.verbose,
				info: this.logger.verbose,
				warn: this.logger.verbose,
				error: this.logger.error,
			}),
		}))

		// Internal endpoint for Nexus proxy tool callbacks (device tool execution).
		// Phase 12 AUTHZ-01/03: expectedUserId is passed via query string (set by
		// DeviceBridge.onDeviceConnected at proxy tool registration time) and is
		// forwarded to executeOnDevice which calls authorizeDeviceAccess before any
		// tunnel activity. Defense-in-depth: even if a rogue Nexus build or internal
		// caller POSTs directly, the ownership check still fires.
		this.app.post('/internal/device-tool-execute', express.json(), async (req, res) => {
			try {
				const {tool, params} = req.body
				if (!tool) {
					return res.status(400).json({success: false, output: '', error: 'Missing tool name'})
				}
				const bridge = this.livinityd.deviceBridge
				if (!bridge) {
					return res.status(503).json({success: false, output: '', error: 'DeviceBridge not initialized'})
				}

				// Phase 12 AUTHZ-03: expectedUserId MUST be supplied by the proxy-tool
				// callback URL (set in onDeviceConnected). Missing userId is a hard fail —
				// never silently accept anonymous device tool execution in v26.0.
				const expectedUserId = typeof req.query.expectedUserId === 'string' ? req.query.expectedUserId : ''

				const result = await bridge.executeOnDevice(tool, params, expectedUserId)

				// Map executeOnDevice error codes to HTTP statuses for defense-in-depth.
				// `executeOnDevice` already called recordAuthFailure for auth errors, so we
				// only need to set the HTTP status here (no duplicate audit write).
				if (result.error === 'device_not_owned' || result.error === 'missing_user') {
					return res.status(403).json({...result, code: result.error})
				}
				if (result.error === 'device_not_found') {
					return res.status(404).json({...result, code: 'device_not_found'})
				}
				res.json(result)
			} catch (err: any) {
				res.json({success: false, output: '', error: err.message})
			}
		})

		// ── GitOps Webhook (Phase 21 GIT-03) ───────────────────────────────
		// POST /api/webhooks/git/:stackName
		// GitHub-style HMAC-SHA256 signature in X-Hub-Signature-256: sha256=<hex>.
		// Body MUST be raw bytes (express.raw) so the signature matches what the
		// sender computed. Verification uses crypto.timingSafeEqual.
		// Security model IS the HMAC — no cookie/JWT auth applied to this route.
		// On valid signature: respond 202 immediately, redeploy in background to
		// stay under GitHub's 10s webhook timeout.
		this.app.post(
			'/api/webhooks/git/:stackName',
			express.raw({type: '*/*', limit: '5mb'}),
			async (request, response) => {
				const stackName = request.params.stackName
				const sigHeader = request.header('x-hub-signature-256') || ''

				// Validate stack name shape (defense in depth)
				if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(stackName)) {
					return response.status(400).json({error: 'invalid stack name'})
				}

				// Look up stack
				let stack: GitStackRow | null
				try {
					stack = await getGitStack(stackName)
				} catch (err: any) {
					this.logger.error(`webhook: db error looking up stack ${stackName}`, err)
					return response.status(500).json({error: 'internal'})
				}
				if (!stack) return response.status(404).json({error: 'stack not found'})

				// Verify HMAC-SHA256
				if (!sigHeader.startsWith('sha256=')) {
					return response.status(401).json({error: 'missing signature'})
				}
				const provided = sigHeader.slice('sha256='.length)
				const body = request.body as Buffer // express.raw produces a Buffer
				if (!Buffer.isBuffer(body)) {
					return response.status(400).json({error: 'body must be raw bytes'})
				}
				const expected = crypto
					.createHmac('sha256', stack.webhookSecret)
					.update(body)
					.digest('hex')

				let providedBuf: Buffer
				let expectedBuf: Buffer
				try {
					providedBuf = Buffer.from(provided, 'hex')
					expectedBuf = Buffer.from(expected, 'hex')
				} catch {
					return response.status(401).json({error: 'invalid signature encoding'})
				}
				// Length-check first: timingSafeEqual throws on different-length buffers
				if (
					providedBuf.length !== expectedBuf.length ||
					!crypto.timingSafeEqual(providedBuf, expectedBuf)
				) {
					return response.status(401).json({error: 'invalid signature'})
				}

				// Valid — respond 202 and redeploy in background.
				response.status(202).json({ok: true, message: 'redeploy queued'})

				// Fire-and-forget redeploy. Errors only logged, never thrown to GitHub.
				;(async () => {
					try {
						const sync = await syncRepo(
							stackName,
							{
								url: stack!.gitUrl,
								branch: stack!.gitBranch,
								credentialId: stack!.gitCredentialId,
								composePath: stack!.composePath,
							},
							stack!.lastSyncedSha,
						)
						if (!sync.changed) {
							this.logger.log(
								`[webhook/${stackName}] HEAD unchanged (${sync.newSha.slice(0, 8)}), skipping redeploy`,
							)
							await updateGitStackSyncSha(stackName, sync.newSha)
							return
						}
						await copyComposeToStackDir(stackName, stack!.composePath)
						await controlStack(stackName, 'pull-and-up')
						await updateGitStackSyncSha(stackName, sync.newSha)
						this.logger.log(
							`[webhook/${stackName}] redeployed ${sync.oldSha?.slice(0, 8) || 'init'} -> ${sync.newSha.slice(0, 8)}`,
						)
					} catch (err: any) {
						this.logger.error(`[webhook/${stackName}] redeploy failed`, err)
					}
				})()
			},
		)

		// Handle tRPC routes
		this.app.use('/trpc', trpcExpressHandler)
		this.mountWebSocketServer('/trpc', (wss) => {
			trpcWssHandler({wss, livinityd: this.livinityd, logger: this.logger})
		})

		// Handle terminal WebSocket routes
		this.mountWebSocketServer('/terminal', (wss) => {
			const logger = this.logger.createChildLogger('terminal')
			wss.on('connection', createTerminalWebSocketHandler({livinityd: this.livinityd, logger}))
		})

		// Handle Docker exec WebSocket routes (container console)
		this.mountWebSocketServer('/ws/docker-exec', (wss) => {
			const logger = this.logger.createChildLogger('docker-exec')
			wss.on('connection', createDockerExecHandler({logger}))
		})

		// Handle Docker logs WebSocket routes (real-time log streaming — QW-01)
		this.mountWebSocketServer('/ws/docker/logs', (wss) => {
			const logger = this.logger.createChildLogger('docker-logs')
			wss.on('connection', createDockerLogsHandler({logger}))
		})

		// /ws/agent removed — AI Chat feature torn out.

		// Phase 48 — Live SSH session viewer (FR-SSH-01). journalctl-tailed
		// ssh.service events broadcast to admin clients. RBAC enforced inside
		// the handler (close 4403 for non-admin, 4404 for missing journalctl
		// binary). Per D-NO-NEW-DEPS — no maxmind / no GeoIP enrichment.
		this.mountWebSocketServer('/ws/ssh-sessions', (wss) => {
			const logger = this.logger.createChildLogger('ssh-sessions')
			const handler = createSshSessionsWsHandler({livinityd: this.livinityd, logger})
			wss.on('connection', handler)
		})

		// Phase 243-02 — Persistent UI terminal WS endpoint.
		// Feature-flag gated (livos:v43:terminal_panel === 'true'); cookie-auth
		// via LIVINITY_PROXY_TOKEN; bruce-only PTY (defense-in-depth backing
		// 243-01's PtySession.start guard). Caddy emits @livos_terminal_ws
		// matcher unconditionally per L-243-C (RFC 6455 — no Referer on WS
		// upgrade) reverse-proxying /livos/terminal/ws → :8080.
		this.mountWebSocketServer('/livos/terminal/ws', (wss) => {
			const logger = this.logger.createChildLogger('pty-terminal')
			const handler = createPtyTerminalWsHandler({
				livinityd: this.livinityd as never,
				logger,
				redis: this.livinityd.ai.redis as never,
				// Phase 246-03 — inject the shared per-livinityd-process
				// SessionManager singleton so create/attach + admin kill
				// operate on the same in-memory Map.
				sessionManager: this.ptySessionManager,
			})
			wss.on('connection', handler)
		})

		// Phase 246-05 — kick off the idle PTY session sweeper. Runs every 1h,
		// kills any session whose lastAttachAt is > 24h ago. Bounds the worst
		// case of the 246-03 ws.close-no-kill semantic. No-op until the first
		// /livos/terminal/ws CREATE/ATTACH populates SessionManager.
		this.ptyTtlGc.start()

		// Phase 22 MH-05 — Subscribe to docker-agent token revocations on Redis.
		// Any livinityd instance receiving the message disconnects the live agent
		// WS within 5s (publish→subscribe is sub-second; close + cleanup adds <1s).
		startAgentRevocationSubscriber({
			redis: this.livinityd.ai.redis,
			logger: this.logger.createChildLogger('agent-revocation'),
		})

		// Handle API routes
		const createApi = (registerApi: ({publicApi, privateApi, livinityd}: ApiOptions) => void) => {
			// Create public and private routers
			const publicApi = express.Router()
			const privateApi = express.Router()
			privateApi.use(async (request, response, next) => {
				const token = request?.cookies?.LIVINITY_PROXY_TOKEN
				const isValid = await this.verifyProxyToken(token).catch(() => false)
				if (!isValid) return response.status(401).json({error: 'unauthorized'})

				// Extract user info from LIVINITY_SESSION JWT for per-user file isolation
				try {
					const sessionToken = request?.cookies?.LIVINITY_SESSION
					if (sessionToken) {
						const payload = await this.verifyToken(sessionToken)
						if (payload && typeof payload === 'object' && 'userId' in payload) {
							const {findUserById} = await import('../database/index.js')
							const user = await findUserById(payload.userId as string)
							if (user) {
								;(request as any).currentUser = {
									id: user.id,
									username: user.username,
									role: user.role,
								}
							}
						}
					}
				} catch {
					// Non-fatal: legacy tokens without userId still work
				}

				next()
			})

			// Register API handlers
			registerApi({publicApi, privateApi, livinityd: this.livinityd})

			// Mount the public and private on a single router
			const api = express.Router()
			api.use(publicApi)
			api.use(privateApi)

			return api
		}
		this.app.use('/api/files', createApi(fileApi))

		// ── Usage Capture Middleware (Phase 44 — wraps /u/:userId/v1/* OUTSIDE broker) ──
		// Per Phase 44 D-44-04..06: capture lives in usage-tracking/, NOT in livinity-broker.
		// Express middleware ordering means this runs BEFORE the broker handler on the
		// shared /u/:userId/v1 prefix. Captures usage from res.json (sync) and
		// res.write/res.end (SSE) without touching broker source (Phase 41/42 frozen).
		mountUsageCaptureMiddleware(this.app, this.livinityd)

		// ── Livinity Bearer Auth Middleware (Phase 59 FR-BROKER-B1-03) ──
		// Mounts BETWEEN usage capture (so 401s are still recorded as
		// broker_usage rows by the wrapper above) and the broker handler (so
		// req.userId is set before the per-user URL-path resolver runs).
		// Missing or non `Bearer liv_sk_*` Authorization headers fall through
		// to the legacy URL-path resolver inside mountBrokerRoutes — Bearer is
		// the new primary identity surface; URL-path remains for back-compat.
		// Mount order asserted by mount-order.test.ts.
		mountBearerAuthMiddleware(this.app, this.livinityd, this.livinityd.apiKeyCache)

		// ── Phase 169-05 — Vault Graph routes (additive) ─────────────────────
		// GET /api/vault/graph — walks vaultRoot (capped at 2000 files), builds
		// the wikilink graph, returns {nodes, edges, truncated, totalFiles}.
		// GET /api/vault/file?path=… — serves a single .md file's text content
		// (capped at 1 MiB), returns {path, content}. Both routes are JWT-authed
		// via livinityd.server.verifyToken (same verifier as mountAgentRunsRoutes
		// — Phase 67-03). vaultRoot is config-locked at mount time and never
		// derived from request input (D-V35-I + threat T-169-05-01).
		// vaultGraphRouter named here for grep visibility (sacred guard 169-05).
		const vaultGraphRouter = mountVaultGraphRoutes(this.app, this.livinityd)
		void vaultGraphRouter // suppress unused-var lint (mount side effect is the contract)

		// Handle log file downloads
		this.app.get('/logs/', async (request, response) => {
			// Check the user is logged in
			try {
				// We shouldn't really use the proxy token for this but it's
				// fine until we have subdomains and refactor to session cookies
				await this.verifyProxyToken(request?.cookies?.LIVINITY_PROXY_TOKEN)
			} catch (error) {
				return response.status(401).send('Unauthorized')
			}

			try {
				// Force the browser to treat the request as a file download
				response.set('Content-Disposition', `attachment;filename=livinity-${Date.now()}.log.gz`)
				const journal = $`journalctl`
				await pipeline(journal.stdout!, createGzip(), response)
			} catch (error) {
				this.logger.error(`Error streaming logs`, error)
			}
		})

		// ── noVNC Static Files ─────────────────────────────────────────────
		// Serve the vendored noVNC ESM source files for the desktop viewer.
		// Maps /novnc/* to the novnc-vendor/ directory alongside this file.
		const novncVendorPath = join(dirname(fileURLToPath(import.meta.url)), 'novnc-vendor')
		this.app.use('/novnc', express.static(novncVendorPath))

		// ── Desktop Viewer (same-origin route) ─────────────────────────────
		// Serves the desktop viewer from /desktop-viewer so it can be embedded
		// in LivOS UI iframe without cross-origin subdomain issues
		this.app.get('/desktop-viewer', async (_request, response) => {
			const viewerPath = join(dirname(fileURLToPath(import.meta.url)), 'desktop-viewer.html')
			response.sendFile(viewerPath)
		})

		// ── Desktop Viewer Page (subdomain) ─────────────────────────────────
		// Serves the standalone noVNC desktop viewer when accessing pc.{domain}
		this.app.get('*', async (request, response, next) => {
			const host = request.hostname
			if (!host) return next()

			const domainConfigRaw = await this.livinityd.ai.redis.get('livos:domain:config').catch(() => null)
			if (!domainConfigRaw) return next()
			const domainConfig = JSON.parse(domainConfigRaw)
			if (!domainConfig.active || !domainConfig.domain) return next()

			const mainDomain: string = domainConfig.domain
			if (host === mainDomain || !host.endsWith(`.${mainDomain}`)) return next()

			const subdomain = host.slice(0, -mainDomain.length - 1)
			const desktopApp = this.livinityd.apps.nativeInstances.find(
				(app) => app.subdomain === subdomain && app.id === 'desktop-stream'
			)
			if (!desktopApp) return next()

			// Serve the desktop viewer HTML page
			const viewerPath = join(dirname(fileURLToPath(import.meta.url)), 'desktop-viewer.html')
			response.sendFile(viewerPath)
		})

		// ── Desktop Resolution Resize ────────────────────────────────────────
		// POST /api/desktop/resize — adjusts server display resolution via xrandr
		// Called by the desktop viewer when the browser viewport changes
		this.app.post('/api/desktop/resize', express.json(), async (request, response) => {
			try {
				// Auth check: require valid session token
				const sessionToken = request?.cookies?.LIVINITY_SESSION
				if (!sessionToken) return response.status(401).json({error: 'unauthorized'})
				const isValid = await this.verifyToken(sessionToken).catch(() => false)
				if (!isValid) return response.status(401).json({error: 'unauthorized'})

				const {width, height} = request.body
				if (!width || !height || typeof width !== 'number' || typeof height !== 'number') {
					return response.status(400).json({error: 'width and height required as numbers'})
				}

				// Clamp to reasonable bounds
				const w = Math.max(640, Math.min(3840, Math.round(width)))
				const h = Math.max(480, Math.min(2160, Math.round(height)))
				const modeName = `${w}x${h}`

				// Try to set the resolution via xrandr
				// First try setting existing mode, then create new mode if needed
				try {
					const output = (await $({shell: true})`xrandr | grep ' connected' | head -1 | awk '{print $1}'`).stdout.trim()
					await $`xrandr --output ${output} --mode ${modeName}`
					this.logger.verbose(`Desktop resize: set ${modeName}`)
					return response.json({success: true, width: w, height: h})
				} catch {
					// Mode doesn't exist — create it via cvt + xrandr --newmode + --addmode
					try {
						const cvtResult = await $`cvt ${w} ${h} 60`
						// Parse modeline from cvt output: "Modeline "1920x1080_60.00" 173.00 ..."
						const modeline = cvtResult.stdout.split('\n').find((l: string) => l.startsWith('Modeline'))
						if (!modeline) throw new Error('cvt produced no modeline')
						// Extract mode name and params from: Modeline "name" params...
						const parts = modeline.replace('Modeline ', '').trim()
						const modeNameQuoted = parts.match(/"([^"]+)"/)
						if (!modeNameQuoted) throw new Error('Failed to parse cvt modeline')
						const cvtModeName = modeNameQuoted[1]
						const modeParams = parts.slice(parts.indexOf('"', parts.indexOf('"') + 1) + 1).trim()

						const output = (await $({shell: true})`xrandr | grep ' connected' | head -1 | awk '{print $1}'`).stdout.trim()

						// Add the new mode
						await $({shell: true})`xrandr --newmode "${cvtModeName}" ${modeParams}`
						await $`xrandr --addmode ${output} ${cvtModeName}`
						await $`xrandr --output ${output} --mode ${cvtModeName}`
						this.logger.verbose(`Desktop resize: created and set ${cvtModeName}`)
						return response.json({success: true, width: w, height: h})
					} catch (err: any) {
						this.logger.error('Desktop resize: xrandr failed', err)
						return response.status(500).json({error: 'Failed to resize display', detail: err.message})
					}
				}
			} catch (err: any) {
				this.logger.error('Desktop resize error:', err)
				return response.status(500).json({error: err.message})
			}
		})

		// ── Container File Download (CFB-02) ─────────────────────────────────
		// GET /api/docker/container/:name/file?path=/abs/path
		// Returns a raw tar stream (application/x-tar) produced by
		// docker.getArchive — binary-safe, streamed directly to the response
		// without buffering in memory. Auth: LIVINITY_SESSION cookie.
		this.app.get('/api/docker/container/:name/file', async (request, response) => {
			try {
				const sessionToken = request?.cookies?.LIVINITY_SESSION
				if (!sessionToken) return response.status(401).json({error: 'unauthorized'})
				const isValid = await this.verifyToken(sessionToken).catch(() => false)
				if (!isValid) return response.status(401).json({error: 'unauthorized'})

				const name = request.params.name
				const path = typeof request.query.path === 'string' ? request.query.path : ''
				if (!name || !path.startsWith('/')) {
					return response.status(400).json({error: 'name required and path must be absolute'})
				}

				let stream: NodeJS.ReadableStream
				try {
					stream = await downloadContainerArchive(name, path)
				} catch (err: any) {
					if (err.message?.includes('[not-found]')) {
						return response.status(404).json({error: err.message.replace('[not-found] ', '')})
					}
					if (err.message?.includes('[bad-path]')) {
						return response.status(400).json({error: err.message.replace('[bad-path] ', '')})
					}
					throw err
				}

				// Filename hint for the browser's "Save As" dialog (container basename + .tar).
				const pathBase = path.split('/').filter(Boolean).pop() || 'archive'
				response.setHeader('Content-Type', 'application/x-tar')
				response.setHeader('Content-Disposition', `attachment; filename="${pathBase}.tar"`)
				;(stream as unknown as NodeJS.ReadableStream).pipe(response as any)
				stream.on('error', (err: Error) => {
					this.logger.error(`Container download stream error for ${name}:${path}`, err)
					if (!response.headersSent) response.status(500).end()
					else response.end()
				})
			} catch (err: any) {
				this.logger.error(`Container download error`, err)
				if (!response.headersSent) response.status(500).json({error: err.message})
			}
		})

		// ── Container File Upload (CFB-03) ───────────────────────────────────
		// POST /api/docker/container/:name/file?path=/abs/dir
		// multipart/form-data body with a single "file" field; 110MB cap.
		// Auth: LIVINITY_SESSION cookie.
		this.app.post('/api/docker/container/:name/file', async (request, response) => {
			try {
				const sessionToken = request?.cookies?.LIVINITY_SESSION
				if (!sessionToken) return response.status(401).json({error: 'unauthorized'})
				const isValid = await this.verifyToken(sessionToken).catch(() => false)
				if (!isValid) return response.status(401).json({error: 'unauthorized'})

				const name = request.params.name
				const dirPath = typeof request.query.path === 'string' ? request.query.path : ''
				if (!name || !dirPath.startsWith('/')) {
					return response.status(400).json({error: 'name required and path must be absolute directory'})
				}

				const contentType = request.headers['content-type'] || ''
				if (!contentType.startsWith('multipart/form-data')) {
					return response.status(400).json({error: 'Content-Type must be multipart/form-data'})
				}

				const MAX_UPLOAD_BYTES = 110 * 1024 * 1024
				const bb = Busboy({headers: request.headers, limits: {files: 1, fileSize: MAX_UPLOAD_BYTES}})
				let fileBuffer: Buffer | null = null
				let fileName: string | null = null
				let truncated = false

				const finished = new Promise<void>((resolve, reject) => {
					bb.on('file', (_fieldName, stream, info) => {
						fileName = info.filename
						const chunks: Buffer[] = []
						stream.on('data', (c: Buffer) => chunks.push(c))
						stream.on('limit', () => {
							truncated = true
						})
						stream.on('end', () => {
							fileBuffer = Buffer.concat(chunks as unknown as Uint8Array[])
						})
						stream.on('error', reject)
					})
					bb.on('finish', () => resolve())
					bb.on('error', reject)
				})

				request.pipe(bb as unknown as NodeJS.WritableStream)
				await finished

				if (truncated) {
					return response.status(413).json({error: `file exceeds ${MAX_UPLOAD_BYTES} bytes`})
				}
				if (!fileBuffer || !fileName) {
					return response.status(400).json({error: 'no file in upload'})
				}

				// Sanitize filename — prevent path traversal (../../etc/passwd).
				const safeName = (fileName as string).replace(/[\\/]/g, '_')
				const targetPath = dirPath.endsWith('/')
					? `${dirPath}${safeName}`
					: `${dirPath}/${safeName}`

				try {
					await writeContainerFile(name, targetPath, fileBuffer)
				} catch (err: any) {
					if (err.message?.includes('[not-found]')) {
						return response.status(404).json({error: err.message.replace('[not-found] ', '')})
					}
					if (err.message?.includes('[dir-not-found]')) {
						return response.status(404).json({error: err.message.replace('[dir-not-found] ', '')})
					}
					if (err.message?.includes('[bad-path]')) {
						return response.status(400).json({error: err.message.replace('[bad-path] ', '')})
					}
					throw err
				}

				return response.json({
					success: true,
					path: targetPath,
					bytes: (fileBuffer as Buffer).length,
				})
			} catch (err: any) {
				this.logger.error(`Container upload error`, err)
				if (!response.headersSent) response.status(500).json({error: err.message})
			}
		})

		// ── Chrome Launch/Kill ───────────────────────────────────────────────
		// Single Chrome instance: visible on X11 display :0, debugging on port 9222.
		// Both UI (Remote Desktop stream) and AI (Chrome MCP) use the same Chrome.
		this.app.post('/api/chrome/launch', express.json(), async (request, response) => {
			try {
				// Phase 263-01 (LIVOS-064) — session gate BEFORE any shell-out.
				const gate = await chromeSessionGate(request?.cookies, t => this.verifySessionFull(t))
				if (!gate.ok) return response.status(gate.status).json(gate.body)

				const url = request.body?.url || ''

				// Check if MCP-ready Chrome is already running
				const {exitCode: portCheck} = await $({shell: true, reject: false})`curl -s -o /dev/null -w '' http://127.0.0.1:9222/json/version`
				if (portCheck === 0) {
					// Chrome running — open URL via CDP if requested
					if (url) {
						// Phase 263-01 (LIVOS-064 SINK 1) — URL-encoded fetch, NO shell.
						await fetch(buildCdpNewTabUrl(url), {method: 'PUT'}).catch(() => {})
						this.logger.log(`Chrome CDP: opened ${url} in new tab`)
					}
					return response.json({success: true, already_running: true, debugging_port: 9222})
				}

				// Kill ALL Chrome/Chromium — fresh start with debugging port
				await $({shell: true, reject: false})`killall -9 google-chrome-stable chrome chromium-browser 2>/dev/null`
				await new Promise(r => setTimeout(r, 1500))

				// Resolve desktop user + Xauthority
				const desktopUser = (await this.livinityd.ai.redis.get('livos:desktop:user').catch(() => null)) || 'bruce'
				const {stdout: uidStr} = await $({shell: true, reject: false})`id -u ${desktopUser}`
				const uid = uidStr.trim() || '1000'
				const xauth = (await $({shell: true, reject: false})`find /run/user/${uid}/gdm -name 'Xauthority' 2>/dev/null | head -1`).stdout.trim()
					|| `/home/${desktopUser}/.Xauthority`

				// Launch Chrome via the livos-launch-chrome script (installed by install.sh)
				// Uses sudo -u to run as desktop user (livos service user can sudo without password)
				// Phase 263-01 (LIVOS-064 SINK 2) — argv spawn, NO shell: `url` is a
				// single argv element (when present) and can never be a shell token.
				const child = spawn('sudo', buildChromeLaunchArgv(desktopUser, url), {
					detached: true,
					stdio: 'ignore',
				})
				child.unref()

				// Wait for debugging port to become available (max 10s)
				let ready = false
				for (let i = 0; i < 20; i++) {
					await new Promise(r => setTimeout(r, 500))
					const {exitCode} = await $({shell: true, reject: false})`curl -s -o /dev/null http://127.0.0.1:9222/json/version`
					if (exitCode === 0) { ready = true; break }
				}

				if (ready) {
					this.logger.log(`Chrome launched on display :0 for ${desktopUser} (port 9222 ready)`)
					return response.json({success: true, already_running: false, debugging_port: 9222})
				} else {
					this.logger.error('Chrome launched but port 9222 not available after 10s')
					return response.status(500).json({error: 'Chrome started but debugging port not responding'})
				}
			} catch (err: any) {
				this.logger.error('Chrome launch error:', err)
				return response.status(500).json({error: err.message})
			}
		})

		this.app.post('/api/chrome/kill', async (request, response) => {
			// Phase 263-01 (LIVOS-064) — session gate BEFORE any shell-out.
			const gate = await chromeSessionGate(request?.cookies, t => this.verifySessionFull(t))
			if (!gate.ok) return response.status(gate.status).json(gate.body)
			await $({shell: true, reject: false})`killall -9 google-chrome-stable chrome 2>/dev/null`
			response.json({success: true})
		})

		this.app.get('/api/chrome/status', async (request, response) => {
			// Phase 263-01 (LIVOS-064) — session gate BEFORE any shell-out.
			const gate = await chromeSessionGate(request?.cookies, t => this.verifySessionFull(t))
			if (!gate.ok) return response.status(gate.status).json(gate.body)
			const {exitCode} = await $({shell: true, reject: false})`curl -s -o /dev/null http://127.0.0.1:9222/json/version`
			response.json({running: exitCode === 0, debugging_port: exitCode === 0 ? 9222 : null})
		})

		// ── Phase 96-06 — Teach-mode skill frame stream ─────────────────────
		// GET /api/webapp-skills/:sessionId/:filename
		//   - Auth: LIVINITY_SESSION cookie. userId sourced from token.
		//   - sessionId: UUID v4 (path-traversal-safe via UUID_RE check).
		//   - filename: <ts>.jpg or <ts>.thumb.jpg (regex enforced).
		//   - Streams the JPEG bytes from
		//     $LIV_DATA_ROOT/webapp-skills/<userId>/<sessionId>/<filename>,
		//     where $LIV_DATA_ROOT is the env-rooted data dir (default
		//     /opt/livos/data) resolved in webapps/skills-storage.ts:dataRoot().
		//     Phase 252-06 (R14) — reconciled the dangling placeholder to the
		//     concrete env var the project actually ships.
		// Lower friction than a tRPC frameUrl procedure: the scrubber's
		// <img src> tags can hit this endpoint directly with credentials,
		// no base64 round-trip, no extra round-trip for cache headers.
		this.app.get('/api/webapp-skills/:sessionId/:filename', async (request, response) => {
			try {
				const sessionToken = request.cookies?.LIVINITY_SESSION
				if (!sessionToken) return response.status(401).json({error: 'unauthorized'})
				const payload = await this.verifyToken(sessionToken).catch(() => null)
				if (!payload || typeof payload !== 'object' || !('loggedIn' in payload) || !payload.loggedIn) {
					return response.status(401).json({error: 'unauthorized'})
				}
				const userId =
					'userId' in payload && typeof payload.userId === 'string' && payload.userId
						? (payload.userId as string)
						: null
				if (!userId) return response.status(401).json({error: 'unauthorized'})

				const sessionId = request.params.sessionId
				const filename = request.params.filename
				const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
				const FRAME_RE = /^([0-9]+)(\.thumb)?\.jpg$/
				if (!UUID_RE.test(sessionId)) return response.status(400).json({error: 'bad sessionId'})
				const m = filename.match(FRAME_RE)
				if (!m) return response.status(400).json({error: 'bad filename'})
				const ts = m[1]
				const variant = m[2] === '.thumb' ? 'thumb' : 'full'

				const {loadFrame} = await import('../webapps/skills-storage.js')
				const bytes = await loadFrame({userId, sessionId, ts, variant: variant as 'thumb' | 'full'})
				if (!bytes) return response.status(404).json({error: 'not found'})
				response.setHeader('Content-Type', 'image/jpeg')
				response.setHeader('Cache-Control', 'private, max-age=3600')
				response.send(bytes)
			} catch (err: any) {
				this.logger.error(`webapp-skills frame error`, err)
				if (!response.headersSent) response.status(500).json({error: err.message})
			}
		})

		// If we have no API route hits then serve the ui at the root.
		// We proxy through to the ui dev server during development with
		// process.env.LIVINITY_UI_PROXY otherwise in production we
		// statically serve the built ui.
		if (process.env.LIVINITY_UI_PROXY) {
			this.app.use(
				'/',
				createProxyMiddleware({
					target: process.env.LIVINITY_UI_PROXY,
					ws: true,
					logProvider: () => ({
						log: this.logger.verbose,
						debug: this.logger.verbose,
						info: this.logger.verbose,
						warn: this.logger.verbose,
						error: this.logger.error,
					}),
				}),
			)
		} else {
			const currentFilename = fileURLToPath(import.meta.url)
			const currentDirname = dirname(currentFilename)
			// Resolve UI dist path: source/modules/server → 4 levels up → packages/ui/dist
			// Works with both tsx (source) and compiled JS (dist) since depth is the same
			const uiPath = join(currentDirname, '../../../../ui/dist')

			// Built assets include a hash of the contents in the filename and
			// wallpapers do not ever change, so we can cache these aggressively
			const cacheAggressively: express.RequestHandler = (_, response, next) => {
				const approximatelyOneYearInSeconds = 365 * 24 * 60 * 60 // RFC 2616, 14.21
				response.set('Cache-Control', `public, max-age=${approximatelyOneYearInSeconds}, immutable`)
				next()
			}
			this.app.get('/assets/*', cacheAggressively)
			this.app.get('/wallpapers/*', cacheAggressively)

			// Other files without a hash in their filename should revalidate based on
			// ETag and Last-Modified instead to force the browser to automatically
			// refresh their contents after an OTA update for example.
			const staticOptions = {cacheControl: true, etag: true, lastModified: true, maxAge: 0}
			this.app.use('/', express.static(uiPath, staticOptions))
			// HOT-FIX (P202.1-B1): Path-aware SPA fallback. API-shaped paths
			// (SSE, tRPC, /api/*, /chat/*, /agents/* dynamic routes) MUST 404
			// when no specific handler is mounted yet, so the browser does NOT
			// receive a 200 + text/html SPA shell where it expects JSON/SSE.
			// Without this guard, late-mounted routes (e.g. /agents/status/stream
			// wired in livinityd.start() AFTER server.start()) get shadowed by
			// the catch-all and EventSource fails with "MIME type text/html".
			const spaFallback = express.static(`${uiPath}/index.html`, staticOptions)
			const apiPathPrefixes = [
				'/agents/status/',
				'/agents/',
				'/api/',
				'/trpc/',
				'/chat/',
				// Phase 207 R5 — `/openclawos/*` was missing from this list, so
				// `/openclawos/approvals/stream` (SSE), `/openclawos/handshake`,
				// `/openclawos/plugin-rpc`, and `/openclawos/approvals/respond`
				// were all shadowed by the SPA index.html catch-all. Browsers'
				// EventSource then saw `Content-Type: text/html` and aborted
				// with the MIME mismatch operator UAT reported on 2026-05-24.
				// These routes are mounted late (in livinityd.start() after
				// server.start()), so the catch-all wildcard ran first.
				'/openclawos/',
				// `/ws/` was already covered by the WebSocket upgrade path
				// short-circuiting before Express, so listing it here is
				// defense-in-depth only.
				'/ws/',
				// Phase 234-04 — `/liv-login` is mounted in livinityd.start()
				// AFTER server.start() runs, so without this entry the SPA
				// catch-all would shadow the handler and the browser would
				// receive a 200 + text/html shell instead of the 302 +
				// Set-Cookie auto-login response. Same root cause as the
				// 207 R5 fix for `/openclawos/*` above. Exact-prefix match;
				// `/liv-login` is the only path on the namespace.
				'/liv-login',
			]
			this.app.use('*', (request, response, next) => {
				const path = request.originalUrl?.split('?')[0] ?? request.path ?? ''
				for (const prefix of apiPathPrefixes) {
					if (path.startsWith(prefix)) {
						return next()
					}
				}
				return spaFallback(request, response, next)
			})
		}

		// All errors should be handled by their own middleware but if they aren't we'll catch
		// them here and log them.
		this.app.use(
			(error: Error, request: express.Request, response: express.Response, next: express.NextFunction): void => {
				this.logger.error(`${request.method} ${request.path}`, error)
				if (response.headersSent) return
				response.status(500).json({error: true})
			},
		)

		// Wrap all request handlers with a safe async handler
		// TODO: We can remove this if we move to express 5
		wrapHandlersWithAsyncHandler(this.app._router)

		// Start the server with retry — handles EADDRINUSE during PM2 restarts
		const targetPort = this.livinityd.port
		// Phase 257-02 (WS-C, LIVOS-015): bind the loopback interface by default so
		// the admin daemon is NOT reachable from the LAN. Caddy already
		// reverse-proxies to 127.0.0.1:<port> (the public front door) and liv-core
		// talks to livinityd over loopback, so this does not break the public path.
		// LIVOS_BIND_HOST opts into a non-loopback bind for a legitimate overlay
		// (ZeroTier/Tailscale) without re-exposing the LAN.
		const bindHost = resolveBindHost()
		await new Promise<void>((resolve, reject) => {
			let attempts = 0
			const maxAttempts = 30
			const tryListen = () => {
				this.server.listen(targetPort, bindHost, () => {
					this.port = (this.server.address() as any).port
					this.logger.log(`Listening on port ${this.port}`)
					resolve()
				})
				this.server.once('error', (err: NodeJS.ErrnoException) => {
					if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
						attempts++
						this.logger.log(`Port ${targetPort} in use, retrying in 1s... (${attempts}/${maxAttempts})`)
						this.server.close()
						setTimeout(tryListen, 1000)
					} else {
						reject(err)
					}
				})
			}
			tryListen()
		})

		return this
	}
}

export default Server
