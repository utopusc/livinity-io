/**
 * Phase 241-02 — ready-poll.test.ts
 *
 * Unit tests for waitForAionUiReady — D-241-06 readiness loop with 2s
 * intervals, 60s total deadline, 1.5s per-attempt abort. Uses fake timers
 * + global fetch mock so no real network I/O happens.
 *
 * Reference contracts:
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-CONTEXT.md D-241-06
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §HTTP Polling Idiom
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §Pitfall 5
 *     (layered probe — settings/client can be 200 before mcp routes are mounted)
 */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {waitForAionUiReady} from '../ready-poll.js'
import type {SeedLogger} from '../types.js'

const BASE_URL = 'http://127.0.0.1:3020'

function makeCapturingLogger(): {
	logger: SeedLogger
	infos: string[]
	warns: string[]
	errors: string[]
} {
	const infos: string[] = []
	const warns: string[] = []
	const errors: string[] = []
	const logger: SeedLogger = {
		info: (m) => infos.push(m),
		warn: (m) => warns.push(m),
		error: (m) => errors.push(m),
	}
	return {logger, infos, warns, errors}
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {'Content-Type': 'application/json'},
	})
}

describe('waitForAionUiReady', () => {
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	test('Test 1 — 200 on first attempt returns true + logs ready', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({success: true, data: {}}))
		const {logger, infos} = makeCapturingLogger()

		const ok = await waitForAionUiReady(BASE_URL, logger)
		expect(ok).toBe(true)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/api/settings/client`)
		expect(infos.some((m) => /AionUi ready after 1 attempt/.test(m))).toBe(true)
	})

	test('Test 2 — first 2 attempts ECONNREFUSED, 3rd succeeds (returns true)', async () => {
		const econn = (): Error => {
			const e = new Error('ECONNREFUSED')
			;(e as Error & {code: string}).code = 'ECONNREFUSED'
			return e
		}
		fetchMock
			.mockRejectedValueOnce(econn())
			.mockRejectedValueOnce(econn())
			.mockResolvedValueOnce(jsonResponse({success: true, data: {}}))

		vi.useFakeTimers({shouldAdvanceTime: false})
		const {logger, infos} = makeCapturingLogger()
		const promise = waitForAionUiReady(BASE_URL, logger)

		// Drain all pending microtasks + timers — between attempts the code
		// sleeps for pollIntervalMs (2000ms). Advance enough to cover all 3
		// attempts + 2 sleeps + per-attempt timers.
		await vi.advanceTimersByTimeAsync(10_000)

		const ok = await promise
		expect(ok).toBe(true)
		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(infos.some((m) => /AionUi ready after 3 attempt/.test(m))).toBe(true)
	})

	test('Test 3 — always failing → returns false after 60s deadline + warn', async () => {
		fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

		vi.useFakeTimers({shouldAdvanceTime: false})
		const {logger, warns} = makeCapturingLogger()
		const promise = waitForAionUiReady(BASE_URL, logger)

		// Burn the entire 60s budget.
		await vi.advanceTimersByTimeAsync(65_000)

		const ok = await promise
		expect(ok).toBe(false)
		expect(warns.length).toBeGreaterThanOrEqual(1)
	})

	test('Test 4 — per-attempt abort: fetch hangs forever, abort fires at 1500ms', async () => {
		let abortFired = false
		fetchMock.mockImplementation((_url, init: RequestInit) => {
			return new Promise((_resolve, reject) => {
				const signal = init.signal
				if (signal) {
					signal.addEventListener('abort', () => {
						abortFired = true
						const err = new Error('aborted')
						;(err as Error & {name: string}).name = 'AbortError'
						reject(err)
					})
				}
			})
		})

		vi.useFakeTimers({shouldAdvanceTime: false})
		const {logger} = makeCapturingLogger()
		const promise = waitForAionUiReady(BASE_URL, logger, {
			totalTimeoutMs: 5_000,
			pollIntervalMs: 2_000,
			perAttemptTimeoutMs: 1_500,
		})

		// 1500ms — first attempt should abort. 2000ms sleep then second attempt.
		await vi.advanceTimersByTimeAsync(6_000)

		await promise
		expect(abortFired).toBe(true)
	})

	test('Test 5 — Pitfall 5 layered probe: settings OK but mcp/servers 503×3 then 200', async () => {
		// Order: settings/client=200, mcp/servers=503, mcp/servers=503, mcp/servers=503, mcp/servers=200
		// Implementation will sleep 1000ms between mcp sub-probes; we advance through that.
		fetchMock.mockImplementation((url: string) => {
			if (url.endsWith('/api/settings/client')) {
				return Promise.resolve(jsonResponse({success: true, data: {}}))
			}
			if (url.endsWith('/api/mcp/servers')) {
				const callCount = fetchMock.mock.calls.filter((c) =>
					(c[0] as string).endsWith('/api/mcp/servers'),
				).length
				if (callCount < 4) {
					return Promise.resolve(jsonResponse({error: 'not ready'}, 503))
				}
				return Promise.resolve(jsonResponse({success: true, data: []}))
			}
			return Promise.reject(new Error(`unexpected URL ${url}`))
		})

		vi.useFakeTimers({shouldAdvanceTime: false})
		const {logger} = makeCapturingLogger()
		const promise = waitForAionUiReady(BASE_URL, logger, {mcpServersProbe: true})

		// settings probe + 3 mcp probes each sleep 1s between = ~3s; then loop poll 2s; then settings+mcp(200).
		await vi.advanceTimersByTimeAsync(15_000)

		const ok = await promise
		expect(ok).toBe(true)
		// Confirm we hit /api/mcp/servers at least 4 times.
		const mcpCalls = fetchMock.mock.calls.filter((c) =>
			(c[0] as string).endsWith('/api/mcp/servers'),
		)
		expect(mcpCalls.length).toBeGreaterThanOrEqual(4)
	})
})
