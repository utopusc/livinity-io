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
				this.logger.log(`[tunnel] WebSocket upgrade request received (stub - implemented in Plan 04)`)
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
				// Stub for Plan 04
				break
			case 'ws_close':
				// Stub for Plan 04
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
		// Replace host with local target
		requestHeaders['host'] = '127.0.0.1:8080'
		// Add forwarding headers
		requestHeaders['x-forwarded-proto'] = 'https'
		if (!requestHeaders['x-forwarded-for']) {
			requestHeaders['x-forwarded-for'] = '127.0.0.1'
		}

		const options: http.RequestOptions = {
			hostname: '127.0.0.1',
			port: 8080,
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
