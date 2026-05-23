/**
 * Phase 203-07 — Thin HTTP client to the openclaw gateway (default port
 * 18789).
 *
 * Branch A locked per Plan 203-01 SPIKE — openclaw self-dispatches LLM. This
 * client is therefore a control-plane shim: livinityd asks the gateway to
 * invoke an agent with a prompt, the gateway streams chunks back via SSE,
 * livinityd forwards to the chat-route consumer.
 *
 * Gateway HTTP surface used:
 *   GET  /health                 → liveness probe (no auth)
 *   POST /v1/agents/invoke       → invoke an agent; SSE response
 *   GET  /v1/providers           → enumerate active providers
 *
 * Auth: optional `X-Openclaw-Token` header carrying the short-lived device
 * token minted by `modules/openclawos/device-token.ts`. When the gateway is
 * booted with `--auth none` (dev) the header is omitted.
 *
 * Retry strategy: ONE retry on 5xx for invoke/listProviders. Health probe
 * never retries (callers are health-checks themselves). All errors map to
 * structured Error subclasses so consumers can branch without parsing text.
 *
 * NO openclaw npm dep is taken here — protocol types are inline. Per Plan
 * 203-01 SPIKE notes, the openclaw npm package only exports `plugin-sdk/*`
 * publicly, NOT gateway-protocol types. Plan 203-08 may lift typed schemas
 * from upstream verbatim; this client uses the JSON wire-format directly.
 *
 * Sacred SHA preserved (INV-203-01 — this file is NEW, not on the 20-file list).
 */

import type {AgentRuntimeLogger} from './types.js'

export interface OpenclawClientConfig {
	/**
	 * Base URL of the openclaw gateway. Defaults to `http://127.0.0.1:18789`.
	 * Mini PC binds loopback; the Caddy `/liv-ai-app/*` handle reverse-proxies
	 * external traffic but livinityd talks loopback for control-plane calls.
	 */
	baseUrl?: string
	/**
	 * Token resolver — called per-request so the 5-minute openclaw device
	 * token (Plan 203-05) can rotate without rebuilding the client. Returning
	 * undefined / null omits the auth header (dev mode `--auth none`).
	 */
	getToken?: () => Promise<string | null> | string | null
	logger?: AgentRuntimeLogger
	/**
	 * Per-request timeout in ms. Default 90s (matches the plugin-RPC client
	 * shipped in Plan 203-06).
	 */
	timeoutMs?: number
	/**
	 * Inject a custom fetch implementation (tests). Defaults to globalThis.fetch.
	 */
	fetchImpl?: typeof fetch
}

export interface InvokeRequest {
	agentId: string
	threadId?: string
	resourceId?: string
	message: string
	modelName?: string
	metadata?: Record<string, unknown>
}

export interface InvokeStreamChunk {
	type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done' | 'unknown'
	data: Record<string, unknown>
}

export class OpenclawClientError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly bodySnippet?: string,
	) {
		super(message)
		this.name = 'OpenclawClientError'
	}
}

export class OpenclawClientAuthError extends OpenclawClientError {
	constructor(status: number, bodySnippet?: string) {
		super(
			`openclaw gateway rejected auth (status ${status})`,
			status,
			bodySnippet,
		)
		this.name = 'OpenclawClientAuthError'
	}
}

export class OpenclawClientUnavailableError extends OpenclawClientError {
	constructor(cause: unknown) {
		super(
			`openclaw gateway unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
			0,
		)
		this.name = 'OpenclawClientUnavailableError'
	}
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:18789'
const DEFAULT_TIMEOUT_MS = 90_000

export class OpenclawClient {
	private readonly baseUrl: string
	private readonly timeoutMs: number
	private readonly fetchImpl: typeof fetch
	private readonly getToken?: OpenclawClientConfig['getToken']
	private readonly logger?: AgentRuntimeLogger

	constructor(config: OpenclawClientConfig = {}) {
		this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
		this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
		this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis)
		this.getToken = config.getToken
		this.logger = config.logger
	}

	/**
	 * Liveness probe. Returns `true` on `{"ok":true}` 200 response, `false`
	 * otherwise. NEVER throws — callers (boot wire-up + dock badge) treat
	 * unreachable gateway as "Liv AI offline" without bricking livinityd.
	 */
	async health(): Promise<boolean> {
		try {
			const res = await this.fetchImpl(`${this.baseUrl}/health`)
			if (!res.ok) return false
			const body = (await res.json().catch(() => null)) as
				| {ok?: boolean}
				| null
			return body?.ok === true
		} catch (err) {
			this.logger?.warn(
				'Phase 203-07 OpenclawClient.health probe failed',
				err,
			)
			return false
		}
	}

	/**
	 * List the LLM providers the gateway currently has credentials for. Useful
	 * for the Settings → Models tab to surface the active provider catalog.
	 *
	 * Retries ONCE on 5xx. 4xx (incl. 404 when the gateway has no providers
	 * endpoint configured) returns an empty array so the Models tab degrades
	 * gracefully — the operator can still pick a model by typed name.
	 */
	async listProviders(): Promise<string[]> {
		const res = await this.requestWithRetry('GET', '/v1/providers')
		if (!res) return []
		try {
			const body = (await res.json()) as {providers?: string[]} | null
			return body?.providers ?? []
		} catch {
			return []
		}
	}

	/**
	 * Invoke an agent. Returns the parsed JSON response body for non-streaming
	 * callers (the simpler one-shot surface). For SSE streaming, callers
	 * iterate `streamInvoke()` instead.
	 *
	 * Mirrors Mastra's `agent.generate({...})` shape so chat-route + scheduler
	 * can call this interchangeably during the 203-07/08 coexistence window.
	 */
	async invoke(
		req: InvokeRequest,
	): Promise<{text: string; raw: Record<string, unknown>}> {
		const res = await this.requestWithRetry(
			'POST',
			'/v1/agents/invoke',
			req as unknown as Record<string, unknown>,
		)
		if (!res) {
			throw new OpenclawClientError(
				'openclaw gateway returned no response after retry',
				0,
			)
		}
		const body = (await res.json()) as Record<string, unknown>
		const text = typeof body.text === 'string' ? body.text : ''
		return {text, raw: body}
	}

	/**
	 * Streaming variant — yields parsed SSE chunks. Each `data:` payload is
	 * JSON-parsed and shaped into an `InvokeStreamChunk`. Unknown shapes flow
	 * through with `type: 'unknown'` so the consumer can log + skip rather
	 * than crash the chat stream.
	 *
	 * Tolerant of BOTH `data:` (no space) and `data: ` (with space) per the
	 * SSE quirk shipped in MEMORY.md (Kimi parser pattern).
	 */
	async *streamInvoke(
		req: InvokeRequest,
	): AsyncIterableIterator<InvokeStreamChunk> {
		const headers = await this.buildHeaders('text/event-stream')
		const ctrl = new AbortController()
		const timeoutId = setTimeout(() => ctrl.abort(), this.timeoutMs)
		let res: Response
		try {
			res = await this.fetchImpl(`${this.baseUrl}/v1/agents/invoke`, {
				method: 'POST',
				headers,
				body: JSON.stringify({...req, stream: true}),
				signal: ctrl.signal,
			})
		} catch (err) {
			clearTimeout(timeoutId)
			throw new OpenclawClientUnavailableError(err)
		}
		if (!res.ok) {
			clearTimeout(timeoutId)
			const snippet = await res.text().catch(() => undefined)
			if (res.status === 401 || res.status === 403) {
				throw new OpenclawClientAuthError(res.status, snippet)
			}
			throw new OpenclawClientError(
				`openclaw stream failed (status ${res.status})`,
				res.status,
				snippet,
			)
		}
		if (!res.body) {
			clearTimeout(timeoutId)
			return
		}
		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')
		let buffer = ''
		try {
			while (true) {
				const {done, value} = await reader.read()
				if (done) break
				buffer += decoder.decode(value, {stream: true})
				// SSE event boundary is a blank line; messages may be split.
				let idx: number
				while ((idx = buffer.indexOf('\n\n')) !== -1) {
					const raw = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 2)
					const chunk = parseSseEvent(raw)
					if (chunk) yield chunk
				}
			}
			if (buffer.trim().length > 0) {
				const chunk = parseSseEvent(buffer)
				if (chunk) yield chunk
			}
		} finally {
			clearTimeout(timeoutId)
			try {
				reader.releaseLock()
			} catch {
				// already released by abort path; ignore
			}
		}
	}

	private async buildHeaders(accept: string): Promise<Record<string, string>> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: accept,
		}
		if (this.getToken) {
			const token = await this.getToken()
			if (token) headers['X-Openclaw-Token'] = token
		}
		return headers
	}

	/**
	 * Internal — POST/GET helper with ONE retry on 5xx. Returns `null` when
	 * the gateway is unreachable AFTER the retry (callers branch on null).
	 */
	private async requestWithRetry(
		method: 'GET' | 'POST',
		path: string,
		body?: Record<string, unknown>,
	): Promise<Response | null> {
		for (let attempt = 0; attempt < 2; attempt++) {
			const ctrl = new AbortController()
			const timeoutId = setTimeout(() => ctrl.abort(), this.timeoutMs)
			try {
				const headers = await this.buildHeaders('application/json')
				const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
					method,
					headers,
					body: body ? JSON.stringify(body) : undefined,
					signal: ctrl.signal,
				})
				clearTimeout(timeoutId)
				if (res.status >= 500 && attempt === 0) {
					this.logger?.warn(
						`Phase 203-07 OpenclawClient ${method} ${path} → ${res.status}; retrying once`,
					)
					continue
				}
				if (res.status === 401 || res.status === 403) {
					const snippet = await res.text().catch(() => undefined)
					throw new OpenclawClientAuthError(res.status, snippet)
				}
				if (!res.ok) {
					const snippet = await res.text().catch(() => undefined)
					throw new OpenclawClientError(
						`openclaw ${method} ${path} failed (status ${res.status})`,
						res.status,
						snippet,
					)
				}
				return res
			} catch (err) {
				clearTimeout(timeoutId)
				if (
					err instanceof OpenclawClientError ||
					err instanceof OpenclawClientAuthError
				) {
					throw err
				}
				if (attempt === 0) {
					this.logger?.warn(
						`Phase 203-07 OpenclawClient ${method} ${path} threw; retrying once`,
						err,
					)
					continue
				}
				throw new OpenclawClientUnavailableError(err)
			}
		}
		return null
	}
}

/**
 * Parse one SSE event block (between blank lines) into a structured chunk.
 * Tolerates both `data:` and `data: ` prefixes (MEMORY.md SSE quirk).
 * Returns null on unparseable / non-data lines (e.g. `: heartbeat`).
 */
export function parseSseEvent(raw: string): InvokeStreamChunk | null {
	const lines = raw.split(/\r?\n/)
	let dataLine: string | null = null
	let eventName: string | null = null
	for (const line of lines) {
		if (line.startsWith('data:')) {
			dataLine = line.slice(5).replace(/^ /, '')
		} else if (line.startsWith('event:')) {
			eventName = line.slice(6).trim()
		}
	}
	if (dataLine === null) return null
	let parsed: Record<string, unknown>
	try {
		parsed = JSON.parse(dataLine) as Record<string, unknown>
	} catch {
		// Plain-text payloads (rare) — surface as text chunk.
		return {type: 'text', data: {text: dataLine}}
	}
	const type = inferChunkType(eventName, parsed)
	return {type, data: parsed}
}

function inferChunkType(
	eventName: string | null,
	payload: Record<string, unknown>,
): InvokeStreamChunk['type'] {
	if (eventName === 'done' || payload.done === true) return 'done'
	if (eventName === 'error' || typeof payload.error === 'string') return 'error'
	if (eventName === 'tool_call' || typeof payload.tool_call === 'object') {
		return 'tool_call'
	}
	if (
		eventName === 'tool_result' ||
		typeof payload.tool_result === 'object'
	) {
		return 'tool_result'
	}
	if (typeof payload.text === 'string' || typeof payload.delta === 'string') {
		return 'text'
	}
	return 'unknown'
}
