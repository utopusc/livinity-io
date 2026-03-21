// Protocol types duplicated from platform/relay/src/protocol.ts -- keep in sync.

// Relay -> Client messages
interface TunnelRequest {
	type: 'http_request'
	id: string
	method: string
	path: string
	headers: Record<string, string | string[]>
	body: string | null
	targetApp?: string
}

interface TunnelWsUpgrade {
	type: 'ws_upgrade'
	id: string
	path: string
	headers: Record<string, string | string[]>
	targetApp?: string
}

interface TunnelPing {
	type: 'ping'
	ts: number
}

interface TunnelRelayShutdown {
	type: 'relay_shutdown'
}

interface TunnelConnected {
	type: 'connected'
	sessionId: string
	assignedUrl: string
}

interface TunnelAuthError {
	type: 'auth_error'
	error: string
}

interface TunnelQuotaExceeded {
	type: 'quota_exceeded'
	usedBytes: number
	limitBytes: number
	resetsAt: string
}

// Client -> Relay messages
interface TunnelAuth {
	type: 'auth'
	apiKey: string
	sessionId?: string
}

interface TunnelResponse {
	type: 'http_response'
	id: string
	status: number
	headers: Record<string, string | string[]>
	body: string
}

interface TunnelWsReady {
	type: 'ws_ready'
	id: string
}

interface TunnelWsError {
	type: 'ws_error'
	id: string
	error: string
}

interface TunnelPong {
	type: 'pong'
	ts: number
}

// Bidirectional messages
interface TunnelWsFrame {
	type: 'ws_frame'
	id: string
	data: string
	binary: boolean
}

interface TunnelWsClose {
	type: 'ws_close'
	id: string
	code?: number
	reason?: string
}

type RelayToClientMessage =
	| TunnelRequest
	| TunnelWsUpgrade
	| TunnelPing
	| TunnelRelayShutdown
	| TunnelConnected
	| TunnelAuthError
	| TunnelQuotaExceeded

type BidirectionalMessage = TunnelWsFrame | TunnelWsClose

type IncomingMessage = RelayToClientMessage | BidirectionalMessage

// ---------------------------------------------------------------------------
// Reconnection manager with exponential backoff + jitter
// ---------------------------------------------------------------------------

class ReconnectionManager {
	private attempt = 0
	private readonly baseDelay = 1000
	private readonly maxDelay = 60_000
	private readonly maxJitter = 1000

	getNextDelay(): number {
		const exponentialDelay = Math.min(this.baseDelay * 2 ** this.attempt, this.maxDelay)
		const jitter = Math.random() * Math.min(this.maxJitter, exponentialDelay)
		this.attempt++
		return exponentialDelay + jitter
	}

	reset(): void {
		this.attempt = 0
	}

	get consecutiveFailures(): number {
		return this.attempt
	}
}

// ---------------------------------------------------------------------------
// TunnelClient
// ---------------------------------------------------------------------------

import http from 'node:http'
import WebSocket from 'ws'
import type {Redis} from 'ioredis'

const REDIS_PREFIX = 'livos:platform:'

export interface TunnelClientOptions {
	redis: Redis
	relayUrl?: string
	logger?: {log: (...args: any[]) => void; error: (...args: any[]) => void}
}

export default class TunnelClient {
	private ws: WebSocket | null = null
	private sessionId: string | null = null
	private assignedUrl: string | null = null
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private reconnection = new ReconnectionManager()
	private status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' = 'idle'
	private localWsSockets = new Map<string, WebSocket>()

	private redis: Redis
	private relayUrl: string
	private logger: {log: (...args: any[]) => void; error: (...args: any[]) => void}

	constructor({redis, relayUrl, logger}: TunnelClientOptions) {
		this.redis = redis
		this.relayUrl = relayUrl ?? 'wss://relay.livinity.io'
		this.logger = logger ?? {log: console.log, error: console.error}
	}

	// ─── Lifecycle ─────────────────────────────────────────────────

	async start(): Promise<void> {
		const apiKey = await this.redis.get(`${REDIS_PREFIX}api_key`)
		if (!apiKey) {
			this.status = 'idle'
			await this.updateRedisStatus()
			this.logger.log('[tunnel] No API key configured, staying idle')
			return
		}
		await this.connect()
	}

	async connect(): Promise<void> {
		const apiKey = await this.redis.get(`${REDIS_PREFIX}api_key`)
		if (!apiKey) return

		this.status = 'connecting'
		await this.updateRedisStatus()

		const storedSessionId = await this.redis.get(`${REDIS_PREFIX}session_id`)

		const wsUrl = `${this.relayUrl}/tunnel/connect`
		this.logger.log(`[tunnel] Connecting to ${wsUrl}`)

		try {
			this.ws = new WebSocket(wsUrl)
		} catch (err) {
			this.logger.error('[tunnel] WebSocket creation failed:', err)
			this.scheduleReconnect()
			return
		}

		this.ws.on('open', () => {
			const authMsg: TunnelAuth = {
				type: 'auth',
				apiKey,
				...(storedSessionId ? {sessionId: storedSessionId} : {}),
			}
			this.ws!.send(JSON.stringify(authMsg))
			this.logger.log('[tunnel] Auth message sent')
		})

		this.ws.on('message', (data) => {
			try {
				const msg = JSON.parse(data.toString()) as IncomingMessage
				this.handleMessage(msg)
			} catch (err) {
				this.logger.error('[tunnel] Failed to parse message:', err)
			}
		})

		this.ws.on('close', () => {
			this.logger.log(`[tunnel] Connection closed (was ${this.status})`)
			if (this.status === 'connected' || this.status === 'connecting') {
				this.status = 'disconnected'
				this.updateRedisStatus()
				this.scheduleReconnect()
			}
		})

		this.ws.on('error', (err) => {
			this.logger.error('[tunnel] WebSocket error:', err)
			// The close handler will fire next and trigger reconnect
		})
	}

	async disconnect(): Promise<void> {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}

		if (this.ws) {
			this.ws.removeAllListeners()
			if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
				this.ws.close()
			}
			this.ws = null
		}

		this.status = 'idle'
		this.sessionId = null
		this.assignedUrl = null

		await this.redis.del(`${REDIS_PREFIX}status`)
		await this.redis.del(`${REDIS_PREFIX}session_id`)
		await this.redis.del(`${REDIS_PREFIX}url`)
	}

	async stop(): Promise<void> {
		await this.disconnect()
	}

	getStatus(): {status: string; url: string | null; sessionId: string | null} {
		return {
			status: this.status,
			url: this.assignedUrl,
			sessionId: this.sessionId,
		}
	}

	// ─── Message routing ──────────────────────────────────────────

	private handleMessage(msg: IncomingMessage): void {
		switch (msg.type) {
			case 'connected':
				this.handleConnected(msg)
				break
			case 'auth_error':
				this.handleAuthError(msg)
				break
			case 'http_request':
				this.handleHttpRequest(msg)
				break
			case 'ws_upgrade':
				this.handleWsUpgrade(msg)
				break
			case 'ping':
				this.sendMessage({type: 'pong', ts: msg.ts})
				break
			case 'relay_shutdown':
				this.logger.log('[tunnel] Relay is shutting down, expecting reconnect')
				break
			case 'quota_exceeded':
				this.logger.log(`[tunnel] Quota exceeded: ${msg.usedBytes}/${msg.limitBytes} bytes`)
				this.redis.set(`${REDIS_PREFIX}status`, 'quota_exceeded')
				break
			case 'ws_frame':
				this.handleWsFrame(msg)
				break
			case 'ws_close':
				this.handleWsClose(msg)
				break
		}
	}

	private async handleConnected(msg: TunnelConnected): Promise<void> {
		this.sessionId = msg.sessionId
		this.assignedUrl = msg.assignedUrl
		this.status = 'connected'
		this.reconnection.reset()

		await this.redis.set(`${REDIS_PREFIX}session_id`, msg.sessionId)
		await this.redis.set(`${REDIS_PREFIX}url`, msg.assignedUrl)
		await this.updateRedisStatus()

		// Auto-configure domain for LivOS when connected via Livinity tunnel
		// This makes App Store, subdomain routing, and domain-dependent features work
		try {
			const domain = msg.assignedUrl.replace('https://', '').replace('http://', '')
			const existingConfig = await this.redis.get('livos:domain:config')
			const existing = existingConfig ? JSON.parse(existingConfig) : null
			// Only set if no domain configured or domain changed
			if (!existing || !existing.active || existing.domain !== domain) {
				const domainConfig = {
					domain,
					active: true,
					activatedAt: new Date().toISOString(),
					source: 'livinity-tunnel',
				}
				await this.redis.set('livos:domain:config', JSON.stringify(domainConfig))
				this.logger.log(`[tunnel] Domain auto-configured: ${domain}`)
			}
		} catch (err) {
			this.logger.error(`[tunnel] Failed to auto-configure domain: ${err}`)
		}

		this.logger.log(`[tunnel] Connected! Session: ${msg.sessionId}, URL: ${msg.assignedUrl}`)
	}

	private async handleAuthError(msg: TunnelAuthError): Promise<void> {
		this.status = 'error'
		await this.updateRedisStatus()
		this.logger.error(`[tunnel] Authentication error: ${msg.error}`)
		// Do NOT reconnect -- the API key is invalid
	}

	private async handleHttpRequest(msg: TunnelRequest): Promise<void> {
		const requestHeaders: Record<string, string> = {}
		for (const [key, value] of Object.entries(msg.headers)) {
			requestHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
		}

		// Always proxy through LivOS (port 8080) so the app gateway middleware
		// can enforce auth (session cookies, multi-user access checks).
		// For app subdomain requests, preserve the original Host header so LivOS
		// can detect the subdomain and route to the correct container.
		const targetPort = 8080
		if (!msg.targetApp) {
			requestHeaders['host'] = `127.0.0.1:${targetPort}`
		}
		// else: keep original Host (e.g., chrome.bruce.livinity.io)
		requestHeaders['x-forwarded-proto'] = 'https'
		if (!requestHeaders['x-forwarded-for']) {
			requestHeaders['x-forwarded-for'] = '127.0.0.1'
		}

		const options: http.RequestOptions = {
			hostname: '127.0.0.1',
			port: targetPort,
			path: msg.path,
			method: msg.method,
			headers: requestHeaders,
		}

		try {
			const response = await new Promise<{status: number; headers: Record<string, string | string[]>; body: Buffer}>(
				(resolve, reject) => {
					const req = http.request(options, (res) => {
						const chunks: Buffer[] = []
						res.on('data', (chunk: Buffer) => chunks.push(chunk))
						res.on('end', () => {
							const responseHeaders: Record<string, string | string[]> = {}
							for (const [key, value] of Object.entries(res.headers)) {
								if (value !== undefined) {
									responseHeaders[key] = value as string | string[]
								}
							}
							resolve({
								status: res.statusCode ?? 502,
								headers: responseHeaders,
								body: Buffer.concat(chunks),
							})
						})
						res.on('error', reject)
					})

					req.on('error', reject)

					if (msg.body) {
						req.write(Buffer.from(msg.body, 'base64'))
					}
					req.end()
				},
			)

			const tunnelResponse: TunnelResponse = {
				type: 'http_response',
				id: msg.id,
				status: response.status,
				headers: response.headers,
				body: response.body.toString('base64'),
			}
			this.sendMessage(tunnelResponse)
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err)
			this.logger.error(`[tunnel] Local request failed for ${msg.method} ${msg.path}: ${errorMsg}`)

			const errorResponse: TunnelResponse = {
				type: 'http_response',
				id: msg.id,
				status: 502,
				headers: {'content-type': 'text/plain'},
				body: Buffer.from(`Local server error: ${errorMsg}`).toString('base64'),
			}
			this.sendMessage(errorResponse)
		}
	}

	// ─── WebSocket forwarding ─────────────────────────────────────

	private async handleWsUpgrade(msg: TunnelWsUpgrade): Promise<void> {
		// Always proxy through LivOS (port 8080) so the WebSocket upgrade handler
		// can enforce auth. For app subdomain requests, preserve the original Host
		// header so LivOS can detect the subdomain and route to the correct container.
		const targetPort = 8080
		const targetUrl = `ws://127.0.0.1:${targetPort}${msg.path}`
		const targetLabel = `${msg.targetApp ?? 'livos'}:${targetPort}${msg.path}`

		// Build clean headers — remove WebSocket handshake headers that the ws
		// library generates itself to avoid duplicate/conflicting header values.
		// Extract subprotocols separately for proper negotiation via ws constructor.
		const forwardHeaders: Record<string, string> = {}
		let subprotocols: string[] | undefined
		const skipHeaders = new Set([
			'upgrade', 'connection',
			'sec-websocket-key', 'sec-websocket-version',
			'sec-websocket-extensions', 'sec-websocket-protocol',
			'host',
		])
		for (const [key, value] of Object.entries(msg.headers)) {
			const lk = key.toLowerCase()
			if (skipHeaders.has(lk)) {
				if (lk === 'sec-websocket-protocol') {
					const val = Array.isArray(value) ? value.join(', ') : value
					subprotocols = val.split(',').map(s => s.trim()).filter(Boolean)
				}
				continue
			}
			forwardHeaders[lk] = Array.isArray(value) ? value.join(', ') : value
		}
		if (!msg.targetApp) {
			forwardHeaders['host'] = `127.0.0.1:${targetPort}`
		}
		// else: keep original Host from browser (e.g., chrome.bruce.livinity.io)
		forwardHeaders['x-forwarded-proto'] = 'https'

		let localWs: WebSocket
		try {
			localWs = new WebSocket(targetUrl, subprotocols, {headers: forwardHeaders})
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err)
			this.logger.error(`[tunnel] Local WS creation failed for ${targetLabel}: ${errorMsg}`)
			this.sendMessage({type: 'ws_error', id: msg.id, error: errorMsg})
			return
		}

		localWs.on('open', () => {
			this.localWsSockets.set(msg.id, localWs)
			this.sendMessage({type: 'ws_ready', id: msg.id})
		})

		localWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
			const frame: TunnelWsFrame = {
				type: 'ws_frame',
				id: msg.id,
				data: Buffer.from(data as Buffer).toString('base64'),
				binary: isBinary,
			}
			this.sendMessage(frame)
		})

		localWs.on('close', (code: number, reason: Buffer) => {
			const closeMsg: TunnelWsClose = {
				type: 'ws_close',
				id: msg.id,
				code,
				reason: reason.toString(),
			}
			this.sendMessage(closeMsg)
			this.localWsSockets.delete(msg.id)
		})

		localWs.on('error', (err: Error) => {
			this.logger.error(`[tunnel] Local WS error for ${targetLabel} [${msg.id}]: ${err.message}`)
			this.sendMessage({type: 'ws_error', id: msg.id, error: err.message})
			this.localWsSockets.delete(msg.id)
		})
	}

	private handleWsFrame(msg: TunnelWsFrame): void {
		const localWs = this.localWsSockets.get(msg.id)
		if (!localWs || localWs.readyState !== WebSocket.OPEN) return

		const decoded = Buffer.from(msg.data, 'base64')
		localWs.send(decoded, {binary: msg.binary})
	}

	private handleWsClose(msg: TunnelWsClose): void {
		const localWs = this.localWsSockets.get(msg.id)
		if (localWs) {
			localWs.close(msg.code ?? 1000, msg.reason ?? '')
		}
		this.localWsSockets.delete(msg.id)
	}

	private closeAllLocalWsSockets(): void {
		for (const [id, localWs] of this.localWsSockets) {
			try {
				localWs.close(1001, 'tunnel disconnected')
			} catch {
				// Already closed -- ignore
			}
		}
		this.localWsSockets.clear()
	}

	// ─── Reconnection ─────────────────────────────────────────────

	private scheduleReconnect(): void {
		// Do not reconnect if the API key was bad
		if (this.status === 'error') return

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
		}

		const delay = this.reconnection.getNextDelay()
		this.logger.log(`[tunnel] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnection.consecutiveFailures})`)
		this.reconnectTimer = setTimeout(() => this.connect(), delay)
	}

	// ─── Helpers ──────────────────────────────────────────────────

	private sendMessage(msg: Record<string, unknown>): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg))
		}
	}

	private async updateRedisStatus(): Promise<void> {
		await this.redis.set(`${REDIS_PREFIX}status`, this.status)
	}
}
