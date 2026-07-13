// Phase 310 review-fix (HIGH-01) — real HTTP transport redirect-refusal tests.
//
// The SSRF guard validates ONLY the initial URL; `fetch` defaults to following
// redirects, which would chase a 3xx Location to an unvetted host past the guard.
// The fix sets `redirect: 'manual'` and treats any 3xx as a delivery failure.
//
// These tests mock the SSRF guard to a no-op (its own behaviour is covered by
// ssrf-guard.unit.test.ts) and stub `fetch` so no real network is touched.

import {afterEach, describe, expect, test, vi} from 'vitest'

// The guard is exercised separately; here we only assert the redirect handling,
// so make it a no-op and drive `fetch` directly.
vi.mock('./ssrf-guard.js', () => ({
	assertResolvedHostSafe: vi.fn().mockResolvedValue(undefined),
}))

import {defaultTransport} from './dispatch.js'

// Minimal Response-shaped stub. The transport only reads `.type`, `.status`,
// `.ok`, `.text()`. Typed as the resolve type of the global `fetch` (undici's
// Response, per @types/node) so it satisfies `mockResolvedValue` without pulling
// in the DOM-lib Response the `new Response()` global would produce.
type FetchResult = Awaited<ReturnType<typeof fetch>>
function res(init: {status: number; type?: string; ok?: boolean}): FetchResult {
	const status = init.status
	return {
		status,
		type: init.type ?? 'basic',
		ok: init.ok ?? (status >= 200 && status < 300),
		text: async () => '',
	} as unknown as FetchResult
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('notifications/dispatch defaultTransport — HIGH-01 redirect refusal', () => {
	test('sendWebhook: a 3xx response is treated as a FAILURE, and fetch is called with redirect:manual (not followed)', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({status: 302}))

		await expect(
			defaultTransport.sendWebhook('https://hook.example.com/x', 'hi', 'critical', 'disk-critical'),
		).rejects.toThrow(/refusing to follow/)

		// The request must have been made with redirect:'manual' so undici never
		// chases the Location itself.
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://hook.example.com/x',
			expect.objectContaining({redirect: 'manual'}),
		)
	})

	test('sendNtfy: a 3xx response is treated as a FAILURE (redirect not followed)', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({status: 301}))

		await expect(
			defaultTransport.sendNtfy('https://ntfy.example.com/topic', 'hi', 'warning', undefined),
		).rejects.toThrow(/refusing to follow/)

		expect(fetchSpy).toHaveBeenCalledWith(
			'https://ntfy.example.com/topic',
			expect.objectContaining({redirect: 'manual'}),
		)
	})

	test('sendWebhook: an opaque-redirect response (status 0) is also refused', async () => {
		// Simulate the fetch-spec opaqueredirect filtered response some undici
		// versions surface for redirect:'manual'.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			res({status: 0, type: 'opaqueredirect', ok: false}),
		)

		await expect(
			defaultTransport.sendWebhook('https://hook.example.com/x', 'hi', 'info', 'update-failed'),
		).rejects.toThrow(/refusing to follow/)
	})

	test('sendWebhook: a normal 200 response resolves (no false-positive redirect)', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({status: 200}))

		await expect(
			defaultTransport.sendWebhook('https://hook.example.com/x', 'hi', 'info', 'update-failed'),
		).resolves.toBeUndefined()
	})
})
