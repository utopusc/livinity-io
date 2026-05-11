/**
 * Phase 101-01 Task 3 — bootstrapChrome unit tests.
 *
 * Coverage:
 *   1. resolves with {pid, child} when fetchFn returns 200 for /json/version
 *   2. retries fetch until success (no rejection on transient ECONNREFUSED)
 *   3. rejects with ChromeBootstrapTimeoutError after readyTimeoutMs
 *   4. Chrome spawned with required argv (port + 127.0.0.1 bind + user-data-dir
 *      + no-first-run + no-default-browser-check + no-sandbox + new-window=about:blank)
 *   5. spawn env contains DISPLAY=:1 (or override)
 *   6. stderr tail captures last 50 lines and is logged on non-zero exit
 *   7. on timeout, child.kill('SIGKILL') is invoked
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {EventEmitter} from 'node:events'

import {
	bootstrapChrome,
	ChromeBootstrapTimeoutError,
} from './bootstrap.js'

class FakeStderr extends EventEmitter {}

class FakeChild extends EventEmitter {
	stderr = new FakeStderr()
	pid = 1234
	kill = vi.fn()
	unref = vi.fn()
}

function makeFetch200() {
	return vi.fn(async () => ({ok: true, status: 200} as any))
}

function makeFetchSequence(
	pattern: Array<'reject' | 'reject-200' | 'ok'>,
): {fn: ReturnType<typeof vi.fn>; nextIndex: () => number} {
	let i = 0
	const fn = vi.fn(async () => {
		const step = pattern[Math.min(i, pattern.length - 1)]
		i++
		if (step === 'reject') throw new Error('ECONNREFUSED')
		if (step === 'reject-200') return {ok: false, status: 503} as any
		return {ok: true, status: 200} as any
	})
	return {fn, nextIndex: () => i}
}

function makeLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		verbose: vi.fn(),
	}
}

describe('bootstrapChrome', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})

	it('resolves with {pid, child} when fetchFn returns 200', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn(() => child as any)
		const fetchFn = makeFetch200()
		const logger = makeLogger()
		const handle = await bootstrapChrome({
			spawnFn,
			fetchFn,
			logger,
			pollIntervalMs: 10,
			readyTimeoutMs: 500,
		})
		expect(handle.pid).toBe(1234)
		expect(handle.child).toBe(child)
		expect(logger.info).toHaveBeenCalledWith(
			expect.stringContaining('chrome-cdp: ready'),
		)
	})

	it('retries fetch until success', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn(() => child as any)
		const {fn: fetchFn, nextIndex} = makeFetchSequence([
			'reject',
			'reject',
			'reject-200',
			'ok',
		])
		const handle = await bootstrapChrome({
			spawnFn,
			fetchFn,
			pollIntervalMs: 5,
			readyTimeoutMs: 2000,
		})
		expect(handle.pid).toBe(1234)
		// At least 4 calls to fetchFn — 3 failures + 1 success.
		expect(nextIndex()).toBeGreaterThanOrEqual(4)
	})

	it('rejects with ChromeBootstrapTimeoutError after readyTimeoutMs', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn(() => child as any)
		const fetchFn = vi.fn(async () => {
			throw new Error('ECONNREFUSED')
		})
		const logger = makeLogger()
		await expect(
			bootstrapChrome({
				spawnFn,
				fetchFn,
				logger,
				pollIntervalMs: 10,
				readyTimeoutMs: 60,
			}),
		).rejects.toBeInstanceOf(ChromeBootstrapTimeoutError)
	})

	it('Chrome spawned with required argv (T-101-01 mitigation included)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn(() => child as any)
		const fetchFn = makeFetch200()
		await bootstrapChrome({
			spawnFn,
			fetchFn,
			pollIntervalMs: 5,
			readyTimeoutMs: 500,
		})
		expect(spawnFn).toHaveBeenCalledTimes(1)
		const [, args] = spawnFn.mock.calls[0]
		expect(args).toContain('--remote-debugging-port=9222')
		// T-101-01 mitigation: bind CDP socket to loopback only.
		expect(args).toContain('--remote-debugging-address=127.0.0.1')
		expect(args).toContain('--user-data-dir=/home/bruce/.config/livos-chrome')
		expect(args).toContain('--no-first-run')
		expect(args).toContain('--no-default-browser-check')
		expect(args).toContain('--no-sandbox')
		expect(args).toContain('--new-window=about:blank')
	})

	it('spawn env contains DISPLAY=:1 by default and honors override', async () => {
		const child1 = new FakeChild()
		const child2 = new FakeChild()
		const spawnFn = vi
			.fn()
			.mockReturnValueOnce(child1 as any)
			.mockReturnValueOnce(child2 as any)
		const fetchFn = makeFetch200()
		await bootstrapChrome({
			spawnFn,
			fetchFn,
			pollIntervalMs: 5,
			readyTimeoutMs: 500,
		})
		const opts1 = spawnFn.mock.calls[0][2] as {env: Record<string, string>}
		expect(opts1.env.DISPLAY).toBe(':1')

		await bootstrapChrome({
			display: ':42',
			spawnFn,
			fetchFn,
			pollIntervalMs: 5,
			readyTimeoutMs: 500,
		})
		const opts2 = spawnFn.mock.calls[1][2] as {env: Record<string, string>}
		expect(opts2.env.DISPLAY).toBe(':42')
	})

	it('stderr tail captures lines and is logged on non-zero exit', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn(() => child as any)
		// Start the bootstrap, then trigger stderr + non-zero exit BEFORE
		// fetchFn returns OK. We sequence by making fetchFn await a deferred
		// promise we resolve once the exit event has fired.
		let resolveFetch: () => void = () => {}
		const gate = new Promise<void>((r) => {
			resolveFetch = r
		})
		const fetchFn = vi.fn(async () => {
			await gate
			return {ok: true, status: 200} as any
		})
		const logger = makeLogger()

		const promise = bootstrapChrome({
			spawnFn,
			fetchFn,
			logger,
			pollIntervalMs: 10,
			readyTimeoutMs: 2000,
		})
		// Let the spawn + listener registration complete.
		await new Promise((r) => setTimeout(r, 20))
		// Emit 52 stderr lines (overflow the 50-line cap).
		for (let i = 0; i < 52; i++) {
			child.stderr.emit('data', Buffer.from(`line-${i}\n`, 'utf-8'))
		}
		// Emit non-zero exit so the error handler fires.
		child.emit('exit', 5, null)
		// Unblock fetch so bootstrap returns.
		resolveFetch()
		await promise
		// logger.error called once with a payload containing the LAST line +
		// not the FIRST line (rotated out by the 50-line cap).
		expect(logger.error).toHaveBeenCalledTimes(1)
		const msg = (logger.error.mock.calls[0][0] as string)
		expect(msg).toContain('line-51')
		expect(msg).not.toContain('line-0')
		expect(msg).toContain('code=5')
	})

	it('on timeout, child.kill(SIGKILL) is invoked', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn(() => child as any)
		const fetchFn = vi.fn(async () => {
			throw new Error('ECONNREFUSED')
		})
		await expect(
			bootstrapChrome({
				spawnFn,
				fetchFn,
				pollIntervalMs: 10,
				readyTimeoutMs: 30,
			}),
		).rejects.toBeInstanceOf(ChromeBootstrapTimeoutError)
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})
})
