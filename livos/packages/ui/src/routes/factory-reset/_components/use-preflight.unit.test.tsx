// @vitest-environment jsdom
//
// Phase 38 Plan 03 — usePreflight hook tests.
//
// `@testing-library/react` is NOT installed. The hook is a thin wrapper around
// `preflightFetchLivinity` (Plan 01) — the substantive behavior (5s timeout,
// AbortController, fetch-error vs timeout) is already covered by Plan 01's
// tests. This file ships the smoke import + a re-verification at the lib
// boundary the hook depends on so D-PF-02's 5s timeout cannot drift silently.
//
// Deferred RTL tests (uncomment when @testing-library/react lands):
//   UP1 (mounts -> inFlight=true initially, settles to inFlight=false +
//        result.reachable=true when fetchImpl resolves with HEAD 200)
//   UP2 (re-mount triggers a fresh fetch — same fetchImpl spy called twice
//        across two mount/unmount cycles)
//   UP3 (enabled=false -> never fetches; inFlight stays at the initial value
//        and result stays null)
//   UP4 (timeout — fetchImpl that hangs >5s causes result.reason='timeout')

import {describe, expect, it, vi} from 'vitest'

import {
	DEFAULT_PREFLIGHT_TIMEOUT_MS,
	preflightFetchLivinity,
} from '@/features/factory-reset/lib/network-preflight'

describe('usePreflight smoke', () => {
	it('module exports usePreflight', async () => {
		const mod = await import('./use-preflight')
		expect(typeof mod.usePreflight).toBe('function')
	})
})

describe('preflight 5s AbortController timeout (re-verified at lib boundary the hook calls)', () => {
	it('hangs >timeoutMs -> reason=timeout (re-verifies AbortController firing)', async () => {
		const fetchImpl = vi.fn((_url: string, init: {signal: AbortSignal}) => {
			return new Promise((_resolve, reject) => {
				init.signal.addEventListener('abort', () => {
					const e = new Error('aborted') as Error & {name: string}
					e.name = 'AbortError'
					reject(e)
				})
			})
		})
		const res = await preflightFetchLivinity({
			fetchImpl: fetchImpl as unknown as typeof fetch,
			timeoutMs: 25,
		})
		expect(res.reachable).toBe(false)
		expect(res.reason).toBe('timeout')
	})

	it('default timeout is 5000ms (D-PF-02)', () => {
		expect(DEFAULT_PREFLIGHT_TIMEOUT_MS).toBe(5_000)
	})
})
