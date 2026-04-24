import http from 'node:http'
import process from 'node:process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {createGzip} from 'node:zlib'
import {pipeline} from 'node:stream/promises'
import {createConnection} from 'node:net'

import {$} from 'execa'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import Busboy from 'busboy'

import {WebSocketServer, WebSocket} from 'ws'
import {createProxyMiddleware} from 'http-proxy-middleware'

import getOrCreateFile from '../utilities/get-or-create-file.js'
import randomToken from '../utilities/random-token.js'
import {domains} from '@livos/config'

import type Livinityd from '../../index.js'
import * as jwt from '../jwt.js'
import {trpcExpressHandler, trpcWssHandler} from './trpc/index.js'
import createTerminalWebSocketHandler from './terminal-socket.js'
import createDockerExecHandler from '../docker/docker-exec-socket.js'
import createDockerLogsHandler from '../docker/docker-logs-socket.js'
import {
	downloadArchive as downloadContainerArchive,
	writeFile as writeContainerFile,
} from '../docker/container-files.js'
import {createAgentWebSocketHandler} from './ws-agent.js'

import fileApi from '../files/api.js'

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

	constructor({livinityd}: ServerOptions) {
		this.livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
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

	async verifyProxyToken(token: string) {
		return jwt.verifyProxyToken(token, await this.getJwtSecret())
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
			const container = containers.find(
				(c) =>
					c.Names.some((n) => n === `/${appSlug}` || n === appSlug) ||
					c.Names.some((n) => n.replace('/', '').includes(appSlug)),
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
					connectSrc: ["'self'", 'wss:', 'ws:', 'https://*.livinity.io'],
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
				const subdomains: Array<{subdomain: string; appId: string; port: number; enabled: boolean}> =
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
										const cdContainer = cdContainers.find(
											(c) =>
												c.Names.some((n) => n === `/${appSlug}` || n === appSlug) ||
												c.Names.some((n) => n.replace('/', '').includes(appSlug)),
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

		// Handle agent streaming WebSocket routes
		this.mountWebSocketServer('/ws/agent', (wss) => {
			const logger = this.logger.createChildLogger('ws-agent')
			const handler = createAgentWebSocketHandler({livinityd: this.livinityd, logger})
			wss.on('connection', handler)
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
				const url = request.body?.url || ''

				// Check if MCP-ready Chrome is already running
				const {exitCode: portCheck} = await $({shell: true, reject: false})`curl -s -o /dev/null -w '' http://127.0.0.1:9222/json/version`
				if (portCheck === 0) {
					// Chrome running — open URL via CDP if requested
					if (url) {
						await $({shell: true, reject: false})`curl -s -X PUT "http://127.0.0.1:9222/json/new?${url}"`
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

				const urlArg = url ? `"${url}"` : ''

				// Launch Chrome via the livos-launch-chrome script (installed by install.sh)
				// Uses sudo -u to run as desktop user (livos service user can sudo without password)
				await $({shell: true, reject: false})`sudo -u ${desktopUser} nohup /usr/local/bin/livos-launch-chrome ${urlArg} &>/dev/null &`

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

		this.app.post('/api/chrome/kill', async (_request, response) => {
			await $({shell: true, reject: false})`killall -9 google-chrome-stable chrome 2>/dev/null`
			response.json({success: true})
		})

		this.app.get('/api/chrome/status', async (_request, response) => {
			const {exitCode} = await $({shell: true, reject: false})`curl -s -o /dev/null http://127.0.0.1:9222/json/version`
			response.json({running: exitCode === 0, debugging_port: exitCode === 0 ? 9222 : null})
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
			this.app.use('*', express.static(`${uiPath}/index.html`, staticOptions))
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
		await new Promise<void>((resolve, reject) => {
			let attempts = 0
			const maxAttempts = 30
			const tryListen = () => {
				this.server.listen(targetPort, () => {
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
