/**
 * Phase 195 Plan 02 Task 1 — token-refresher.test.ts (RED → GREEN).
 *
 * Vitest suite for refreshXaiToken().
 *
 * Coverage:
 *   - 200 → returns {access, refresh, expiresAt} with expiresAt = now + expires_in*1000
 *   - 401 → throws RefreshFailedError with httpStatus=401
 *   - body is form-urlencoded with grant_type=refresh_token + refresh_token + client_id
 */

import {describe, expect, test, vi} from 'vitest'

import {RefreshFailedError, refreshXaiToken} from './token-refresher.js'

function makeFakeFetch(opts: {status: number; body?: unknown}): {
	fetchFn: typeof fetch
	calls: Array<{url: string; init?: RequestInit}>
} {
	const calls: Array<{url: string; init?: RequestInit}> = []
	const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({url: String(url), init})
		return {
			status: opts.status,
			json: async () => opts.body,
		} as Response
	}) as unknown as typeof fetch
	return {fetchFn, calls}
}

describe('refreshXaiToken', () => {
	test('on HTTP 200 returns {access, refresh, expiresAt} with correct expiry', async () => {
		const {fetchFn, calls} = makeFakeFetch({
			status: 200,
			body: {
				access_token: 'new-access-token-xyz',
				refresh_token: 'new-refresh-token-abc',
				expires_in: 21600, // 6 hours
			},
		})
		const before = Date.now()
		const result = await refreshXaiToken({
			refreshToken: 'old-refresh',
			clientId: 'opencode-client-id-uuid',
			fetchFn,
		})
		const after = Date.now()

		expect(result.access).toBe('new-access-token-xyz')
		expect(result.refresh).toBe('new-refresh-token-abc')
		expect(result.expiresAt).toBeGreaterThanOrEqual(before + 21600 * 1000)
		expect(result.expiresAt).toBeLessThanOrEqual(after + 21600 * 1000)

		// Body must be form-urlencoded with the 3 required fields.
		expect(calls).toHaveLength(1)
		const init = calls[0]!.init
		expect(init?.method).toBe('POST')
		const headers = init?.headers as Record<string, string>
		expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
		expect(typeof init?.body).toBe('string')
		const bodyStr = init!.body as string
		expect(bodyStr).toContain('grant_type=refresh_token')
		expect(bodyStr).toContain('refresh_token=old-refresh')
		expect(bodyStr).toContain('client_id=opencode-client-id-uuid')
	})

	test('on HTTP 401 throws RefreshFailedError with httpStatus=401', async () => {
		const {fetchFn} = makeFakeFetch({
			status: 401,
			body: {error: 'invalid_grant'},
		})
		await expect(
			refreshXaiToken({
				refreshToken: 'revoked',
				clientId: 'client-id',
				fetchFn,
			}),
		).rejects.toMatchObject({
			code: 'XAI_REFRESH_FAILED',
			httpStatus: 401,
		})
	})

	test('on HTTP 500 throws RefreshFailedError with httpStatus=500', async () => {
		const {fetchFn} = makeFakeFetch({
			status: 500,
			body: {error: 'server_error'},
		})
		await expect(
			refreshXaiToken({
				refreshToken: 'whatever',
				clientId: 'client-id',
				fetchFn,
			}),
		).rejects.toBeInstanceOf(RefreshFailedError)
	})

	test('on 200 with missing access_token throws RefreshFailedError', async () => {
		const {fetchFn} = makeFakeFetch({
			status: 200,
			body: {refresh_token: 'r', expires_in: 3600},
		})
		await expect(
			refreshXaiToken({
				refreshToken: 'old',
				clientId: 'client-id',
				fetchFn,
			}),
		).rejects.toBeInstanceOf(RefreshFailedError)
	})

	test('endpoint defaults to https://auth.x.ai/oauth2/token', async () => {
		const {fetchFn, calls} = makeFakeFetch({
			status: 200,
			body: {
				access_token: 'a',
				refresh_token: 'r',
				expires_in: 100,
			},
		})
		await refreshXaiToken({
			refreshToken: 'x',
			clientId: 'c',
			fetchFn,
		})
		expect(calls[0]!.url).toBe('https://auth.x.ai/oauth2/token')
	})
})
