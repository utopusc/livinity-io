/**
 * Phase 195 Plan 05 Task 1 — OpenAI-compatible xAI client.
 *
 * Wraps api.x.ai with:
 *   - Token plumbing (always reads via credsService.getToken() at request time
 *     — never caches on the client; xai-credentials owns refresh single-flight)
 *   - 401 → refresh + retry once → throw XaiUnauthorizedError(attempts=2)
 *   - Voice methods throw XaiVoiceNotSupportedError (documented absence per
 *     live test evidence 2026-05-22: speech=403, transcriptions=404)
 *   - OpenAI-compatible function-calling pass-through (tools[] unchanged)
 *
 * Threat refs:
 *   - T-195-05-01: Authorization header ONLY — bearer token never in URL/query;
 *     logger receives only status/duration metadata, never the bearer
 *   - T-195-05-03: 401 retry budget is exactly ONE — second 401 throws
 *     XaiUnauthorizedError(attempts=2), no recursion
 *
 * Downstream consumers (Phase 196 LangGraph agent, Phase 197 lean broker)
 * import via the barrel `./index.js` and inject a XaiCredentialsService
 * instance (already wired in livinityd boot per Plan 195-03).
 *
 * NO new npm deps — uses global `fetch` (Node 18+). Do NOT add `openai`.
 */

import {
	XaiNotConnectedError,
	XaiUnauthorizedError,
	XaiVoiceNotSupportedError,
	XaiRateLimitedError,
	XaiModelNotFoundError,
	XaiNetworkError,
} from './errors.js'
import type {XaiCredentialsService} from '../xai-credentials/index.js'
import type {
	XaiChatRequest,
	XaiChatResponse,
	XaiClient,
	XaiImageRequest,
	XaiImageResponse,
	XaiModelListResponse,
	XaiVideoRequest,
	XaiVideoResponse,
} from './types.js'

const DEFAULT_BASE = 'https://api.x.ai'

export interface XaiClientLogger {
	info?: (msg: string, meta?: Record<string, unknown>) => void
	warn?: (msg: string, meta?: Record<string, unknown>) => void
	error?: (msg: string, meta?: Record<string, unknown>) => void
}

export interface XaiClientOpts {
	baseUrl?: string
	fetchFn?: typeof fetch
	logger?: XaiClientLogger
}

/**
 * Construct an xAI client bound to a credentials service.
 *
 * The credsService is read at *request time* on every call — there is NO
 * in-client caching of the bearer token. Refresh single-flight is owned by
 * the credentials service (Plan 195-02).
 *
 * @param credsService — single source of truth for xAI OAuth tokens
 * @param opts.baseUrl — defaults to https://api.x.ai (test seam)
 * @param opts.fetchFn — defaults to globalThis.fetch (test seam)
 * @param opts.logger — optional structured logger; bearer NEVER passed
 */
export function createXaiClient(
	credsService: XaiCredentialsService,
	opts: XaiClientOpts = {},
): XaiClient {
	const baseUrl = opts.baseUrl ?? DEFAULT_BASE
	const fetchFn = opts.fetchFn ?? globalThis.fetch
	const logger = opts.logger

	if (typeof fetchFn !== 'function') {
		throw new XaiNetworkError(
			'global fetch is unavailable — Node 18+ required, or pass opts.fetchFn',
		)
	}

	/**
	 * Single request helper. Handles auth, 401 refresh+retry, and typed error
	 * translation. T-195-05-01: bearer ONLY in Authorization header.
	 */
	async function request<T>(
		method: string,
		urlPath: string,
		body?: unknown,
	): Promise<T> {
		// Step 1: read current token from credsService (request-time, not cached).
		let token: string
		try {
			token = await credsService.getToken()
		} catch (err: unknown) {
			const code = (err as {code?: string} | null)?.code
			if (code === 'XAI_NOT_CONNECTED') {
				throw new XaiNotConnectedError(
					'No xAI credentials — run onboarding (Settings > Connect AI)',
				)
			}
			throw err
		}

		// Step 2: build & execute the request. Bearer is always in the header.
		const doFetch = async (bearer: string): Promise<Response> => {
			return fetchFn(`${baseUrl}${urlPath}`, {
				method,
				headers: {
					Authorization: `Bearer ${bearer}`,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: body == null ? undefined : JSON.stringify(body),
			})
		}

		const startedAt = Date.now()
		let res: Response
		try {
			res = await doFetch(token)
		} catch (err: unknown) {
			const msg = (err as Error | null)?.message ?? 'unknown'
			throw new XaiNetworkError(`Network error: ${msg}`, err)
		}

		// Step 3: handle 401 — single refresh+retry per T-195-05-03.
		if (res.status === 401) {
			logger?.warn?.('xai: 401 on first attempt — refreshing + retrying once', {
				method,
				path: urlPath,
				durationMs: Date.now() - startedAt,
			})
			// Force credsService to re-read auth.json. If the disk token was rotated
			// by an external `opencode auth login`, this picks it up. The service's
			// internal expiry check + single-flight refresh handles the in-flight
			// concurrency case.
			let retryToken: string
			try {
				retryToken = await credsService.getToken()
			} catch (err: unknown) {
				const code = (err as {code?: string} | null)?.code
				if (code === 'XAI_NOT_CONNECTED') {
					throw new XaiNotConnectedError(
						'xAI token revoked after 401 — re-run onboarding',
					)
				}
				throw err
			}

			try {
				res = await doFetch(retryToken)
			} catch (err: unknown) {
				const msg = (err as Error | null)?.message ?? 'unknown'
				throw new XaiNetworkError(`Retry network error: ${msg}`, err)
			}

			if (res.status === 401) {
				// T-195-05-03: budget exhausted — surface typed error, no recursion.
				throw new XaiUnauthorizedError(
					'xAI rejected token after refresh+retry',
					2,
				)
			}
		}

		// Step 4: translate other notable status codes.
		if (res.status === 404) {
			// Heuristic: model-not-found is the most common 404 on /v1/chat/completions.
			// xAI returns 404 for unknown model IDs. For other 404s (e.g. unsupported
			// endpoints like /v1/audio/transcriptions which we explicitly DON'T call),
			// we still wrap as ModelNotFound to keep the public error surface narrow.
			const model = (body as {model?: string} | null)?.model ?? 'unknown'
			throw new XaiModelNotFoundError(model)
		}

		if (res.status === 429) {
			const retryAfter = res.headers.get('Retry-After')
			const retryAfterMs = retryAfter
				? Number.parseInt(retryAfter, 10) * 1000
				: undefined
			throw new XaiRateLimitedError(
				'xAI rate limited',
				Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
			)
		}

		if (!res.ok) {
			const bodyText = await res.text().catch(() => '<no body>')
			throw new XaiNetworkError(`xAI ${res.status}: ${bodyText}`)
		}

		logger?.info?.('xai: ok', {
			method,
			path: urlPath,
			status: res.status,
			durationMs: Date.now() - startedAt,
		})

		return (await res.json()) as T
	}

	return {
		chatCompletions: (req: XaiChatRequest) =>
			request<XaiChatResponse>('POST', '/v1/chat/completions', req),

		models: () => request<XaiModelListResponse>('GET', '/v1/models'),

		imageGenerate: (req: XaiImageRequest) =>
			request<XaiImageResponse>('POST', '/v1/images/generations', req),

		videoGenerate: (req: XaiVideoRequest) =>
			request<XaiVideoResponse>('POST', '/v1/videos/generations', req),

		audioSpeech: async () => {
			// Documented absence — verified 2026-05-22: xAI tier 1 → 403 on this endpoint.
			throw new XaiVoiceNotSupportedError('audio.speech')
		},

		audioTranscriptions: async () => {
			// Documented absence — verified 2026-05-22: xAI tier 1 → 404 on this endpoint.
			throw new XaiVoiceNotSupportedError('audio.transcriptions')
		},
	}
}
