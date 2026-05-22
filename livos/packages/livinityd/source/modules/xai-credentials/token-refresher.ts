/**
 * Phase 195 Plan 02 Task 1 — token-refresher.ts
 *
 * Stateless primitive that POSTs an xAI OAuth refresh request and returns
 * the new access + refresh + expiresAt tuple. Callers (credentials-service)
 * compose this with file IO + single-flight semantics.
 *
 * Spec:
 *   POST https://auth.x.ai/oauth2/token
 *   Content-Type: application/x-www-form-urlencoded
 *   body: grant_type=refresh_token&refresh_token=...&client_id=...
 *
 *   200 → { access_token, refresh_token, expires_in (seconds) }
 *   401 → refresh token revoked → RefreshFailedError(httpStatus=401)
 *   other non-2xx → RefreshFailedError(httpStatus=N)
 *
 * Security:
 *   - NEVER logs request body or response body (T-195-02-01).
 *     Callers may log status code + duration only.
 *   - fetchFn injection for tests; default = global fetch.
 */

const XAI_TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token'

export class RefreshFailedError extends Error {
	readonly code = 'XAI_REFRESH_FAILED' as const
	readonly httpStatus?: number
	constructor(message: string, httpStatus?: number) {
		super(message)
		this.name = 'RefreshFailedError'
		this.httpStatus = httpStatus
	}
}

export interface RefreshXaiTokenOpts {
	refreshToken: string
	clientId: string
	/** Test seam — defaults to global fetch. */
	fetchFn?: typeof fetch
	/** Optional endpoint override for tests. */
	endpoint?: string
}

export interface RefreshXaiTokenResult {
	access: string
	refresh: string
	/** ms epoch */
	expiresAt: number
}

export async function refreshXaiToken(
	opts: RefreshXaiTokenOpts,
): Promise<RefreshXaiTokenResult> {
	const fetchFn = opts.fetchFn ?? fetch
	const endpoint = opts.endpoint ?? XAI_TOKEN_ENDPOINT

	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: opts.refreshToken,
		client_id: opts.clientId,
	}).toString()

	const response = await fetchFn(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
		},
		body,
	})

	if (response.status !== 200) {
		throw new RefreshFailedError(
			`xAI token refresh failed: HTTP ${response.status}`,
			response.status,
		)
	}

	let data: unknown
	try {
		data = await response.json()
	} catch (err) {
		throw new RefreshFailedError(
			`xAI token refresh: response not valid JSON: ${(err as Error).message}`,
			200,
		)
	}

	if (!data || typeof data !== 'object') {
		throw new RefreshFailedError('xAI token refresh: response not an object', 200)
	}

	const obj = data as Record<string, unknown>
	const accessToken = obj.access_token
	const refreshToken = obj.refresh_token
	const expiresIn = obj.expires_in

	if (typeof accessToken !== 'string' || accessToken.length === 0) {
		throw new RefreshFailedError(
			'xAI token refresh: missing access_token in response',
			200,
		)
	}
	if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
		throw new RefreshFailedError(
			'xAI token refresh: missing refresh_token in response',
			200,
		)
	}
	if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
		throw new RefreshFailedError(
			'xAI token refresh: missing or non-numeric expires_in in response',
			200,
		)
	}

	return {
		access: accessToken,
		refresh: refreshToken,
		expiresAt: Date.now() + expiresIn * 1000,
	}
}
