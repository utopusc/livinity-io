import http from 'node:http'
import process from 'node:process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {createGzip} from 'node:zlib'
import {pipeline} from 'node:stream/promises'

import {$} from 'execa'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'

import {WebSocketServer, WebSocket} from 'ws'
import {createProxyMiddleware} from 'http-proxy-middleware'

import getOrCreateFile from '../utilities/get-or-create-file.js'
import randomToken from '../utilities/random-token.js'
import {domains} from '@livos/config'

import type Livinityd from '../../index.js'
import * as jwt from '../jwt.js'
import {trpcExpressHandler, trpcWssHandler} from './trpc/index.js'
import createTerminalWebSocketHandler from './terminal-socket.js'

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
					connectSrc: ["'self'"],
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
		const appGatewayProxyCache = new Map<number, ReturnType<typeof createProxyMiddleware>>()

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

				// Check if this is a subdomain request
				if (host === mainDomain || !host.endsWith(`.${mainDomain}`)) return next()

				const subdomain = host.slice(0, -mainDomain.length - 1)
				if (!subdomain || subdomain.includes('.')) return next()

				// Look up subdomain → appId mapping from Redis
				const subdomainsRaw = await this.livinityd.ai.redis.get('livos:domain:subdomains')
				const subdomains: Array<{subdomain: string; appId: string; port: number; enabled: boolean}> =
					subdomainsRaw ? JSON.parse(subdomainsRaw) : []
				const subConfig = subdomains.find((s) => s.subdomain === subdomain && s.enabled)

				if (!subConfig) {
					return response.status(404).send('App not found')
				}

				// Default target: the global app port (single-user mode or shared app)
				let targetPort = subConfig.port

				// Check if multi-user mode is active
				const multiUserEnabled = await this.livinityd.ai.redis.get('livos:system:multi_user')

				if (multiUserEnabled === 'true') {
					// Check user session
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

						// Check if user has access to this app
						const canAccess = await hasAppAccess(payload.userId as string, subConfig.appId)
						if (!canAccess) {
							return response.status(403).send('Access denied')
						}

						// Check for per-user instance
						const userPort = await findAppPortForUser(payload.userId as string, subConfig.appId)
						if (userPort) {
							targetPort = userPort
						}
					}
				}

				// Get or create cached proxy for this port
				let proxy = appGatewayProxyCache.get(targetPort)
				if (!proxy) {
					this.logger.log(`App gateway: creating proxy for port ${targetPort}`)
					proxy = createProxyMiddleware({
						target: `http://127.0.0.1:${targetPort}`,
						changeOrigin: true,
						ws: true,
						logProvider: () => ({
							log: this.logger.verbose,
							debug: this.logger.verbose,
							info: this.logger.verbose,
							warn: this.logger.verbose,
							error: this.logger.error,
						}),
					})
					appGatewayProxyCache.set(targetPort, proxy)
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
						ws: true,
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

								// Check multi-user mode for per-user port
								const multiUserEnabled = await this.livinityd.ai.redis.get('livos:system:multi_user')
								if (multiUserEnabled === 'true') {
									const token = searchParams.get('token') || searchParams.get('LIVINITY_SESSION')
									if (token) {
										const payload = await this.verifyToken(token).catch(() => null)
										if (payload && typeof payload === 'object' && 'userId' in payload && payload.userId) {
											const {findAppPortForUser} = await import('../database/index.js')
											const userPort = await findAppPortForUser(payload.userId as string, subConfig.appId)
											if (userPort) targetPort = userPort
										}
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
			const uiPath = join(currentDirname, '../../../ui')

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

		// Start the server
		const listen = promisify(this.server.listen.bind(this.server)) as (port: number) => Promise<void>
		await listen(this.livinityd.port)
		this.port = (this.server.address() as any).port
		this.logger.log(`Listening on port ${this.port}`)

		return this
	}
}

export default Server
