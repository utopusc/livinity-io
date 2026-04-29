// Phase 38 Plan 01 — D-PF-02 network preflight tests.
//
// Three required cases (and a few helpers): success → reachable, fetch
// rejection → reachable:false reason=fetch-error, slow fetch (>timeoutMs) →
// reachable:false reason=timeout via AbortController. Tests inject `fetchImpl`
// + tight `timeoutMs` so no real network is needed and no test hangs longer
// than ~50 ms.

import {describe, expect, it, vi} from 'vitest'

import {
	DEFAULT_PREFLIGHT_TIMEOUT_MS,
	PREFLIGHT_URL,
	preflightFetchLivinity,
} from './network-preflight'

describe('preflightFetchLivinity (D-PF-02)', () => {
	it('returns reachable:true on HEAD 200', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 200})
		const res = await preflightFetchLivinity({fetchImpl: fetchImpl as unknown as typeof fetch})
		expect(res.reachable).toBe(true)
		expect(res.status).toBe(200)
	})

	it('uses HEAD method against https://livinity.io by default', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 200})
		await preflightFetchLivinity({fetchImpl: fetchImpl as unknown as typeof fetch})
		expect(fetchImpl).toHaveBeenCalledWith(
			PREFLIGHT_URL,
			expect.objectContaining({method: 'HEAD'}),
		)
	})

	it('returns reachable:false reason=http-error on 503', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ok: false, status: 503})
		const res = await preflightFetchLivinity({fetchImpl: fetchImpl as unknown as typeof fetch})
		expect(res.reachable).toBe(false)
		expect(res.reason).toBe('http-error')
		expect(res.status).toBe(503)
	})

	it('returns reachable:false reason=fetch-error on TypeError (network failure)', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
		const res = await preflightFetchLivinity({fetchImpl: fetchImpl as unknown as typeof fetch})
		expect(res.reachable).toBe(false)
		expect(res.reason).toBe('fetch-error')
	})

	it('returns reachable:false reason=timeout when fetch hangs >timeoutMs (AbortController-driven)', async () => {
		// fetchImpl: never resolves on its own; rejects only when signal fires.
		const fetchImpl = vi.fn((_url: string, init: {signal: AbortSignal}) => {
			return new Promise((_resolve, reject) => {
				init.signal.addEventListener('abort', () => {
					const e = new Error('aborted')
					;(e as Error & {name: string}).name = 'AbortError'
					reject(e)
				})
			})
		})
		const res = await preflightFetchLivinity({
			fetchImpl: fetchImpl as unknown as typeof fetch,
			timeoutMs: 50,
		})
		expect(res.reachable).toBe(false)
		expect(res.reason).toBe('timeout')
	})

	it('passes an AbortSignal into fetch', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 200})
		await preflightFetchLivinity({fetchImpl: fetchImpl as unknown as typeof fetch})
		const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
			signal: AbortSignal
		}
		expect(init.signal).toBeDefined()
		expect(typeof init.signal.aborted).toBe('boolean')
	})

	it('default timeout is 5000ms (D-PF-02)', () => {
		expect(DEFAULT_PREFLIGHT_TIMEOUT_MS).toBe(5_000)
	})

	it('default URL is https://livinity.io', () => {
		expect(PREFLIGHT_URL).toBe('https://livinity.io')
	})

	it('custom url override is honoured', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 200})
		await preflightFetchLivinity({
			fetchImpl: fetchImpl as unknown as typeof fetch,
			url: 'https://example.test/health',
		})
		expect(fetchImpl).toHaveBeenCalledWith(
			'https://example.test/health',
			expect.objectContaining({method: 'HEAD'}),
		)
	})
})
