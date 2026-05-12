/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'

import {startHeartbeat} from './heartbeat-sender.js'

// ── Test strategy ────────────────────────────────────────────────────────
// The production heartbeat-sender uses a self-rescheduling setTimeout chain
// (each tick fully resolves before the next is armed). Vitest fake-timers
// interact poorly with this pattern because each tick must yield to the
// microtask queue MULTIPLE times before completing — flake-prone.
//
// Instead, these tests run against REAL timers with a very short interval
// (intervalSec=0.05, i.e. 50ms). After arming the sender we sleep a few
// intervals on the real clock, then stop() and assert. This is slower
// (each test takes ~200-300ms) but eliminates the fake-timer race entirely.
// ─────────────────────────────────────────────────────────────────────────

type CapturedLog = {level: 'info' | 'warn' | 'error' | 'verbose'; msg: string}

function makeLogger(): {logger: any; entries: CapturedLog[]} {
	const entries: CapturedLog[] = []
	return {
		entries,
		logger: {
			info: (msg: string) => entries.push({level: 'info', msg}),
			warn: (msg: string) => entries.push({level: 'warn', msg}),
			error: (msg: string) => entries.push({level: 'error', msg}),
			verbose: (msg: string) => entries.push({level: 'verbose', msg}),
		},
	}
}

function makeRedis(initial: Record<string, string>) {
	const store = new Map(Object.entries(initial))
	return {
		async get(k: string): Promise<string | null> {
			return store.get(k) ?? null
		},
	}
}

function makeFetchMock(
	handler: (
		input: string | URL,
		init?: RequestInit,
	) => Promise<Response> | Response,
): typeof fetch {
	return (async (input: any, init: any) => handler(input, init)) as typeof fetch
}

function jsonResponse(status: number, body: any = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {'Content-Type': 'application/json'},
	})
}

/** Sleep for real wall-clock time (no fake timers). */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// Use a sub-second interval so tests finish quickly while still allowing
// the self-rescheduling setTimeout chain to fire multiple times. 0.05s = 50ms.
const TEST_INTERVAL_SEC = 0.05
const TEST_INTERVAL_MS = TEST_INTERVAL_SEC * 1000

describe('account/heartbeat-sender.ts — Phase 104 plan 104-10', () => {
	let tmpDir: string
	let apiKeyFile: string
	let deviceIdFile: string

	beforeEach(async () => {
		tmpDir = await mkdtemp(path.join(tmpdir(), 'livos-heartbeat-test-'))
		apiKeyFile = path.join(tmpDir, 'api-key')
		deviceIdFile = path.join(tmpDir, 'device-id')
		await writeFile(apiKeyFile, 'liv_k_iCCxIa7vlFgbpOl-fPwd\n', 'utf-8')
	})
	afterEach(async () => {
		await rm(tmpDir, {recursive: true, force: true}).catch(() => {})
	})

	it('happy path: POSTs to url with X-Api-Key header + JSON body containing payload', async () => {
		const capturedRequests: Array<{
			url: string | URL
			init?: RequestInit
		}> = []
		const fetchImpl = makeFetchMock((input, init) => {
			capturedRequests.push({url: input, init})
			return jsonResponse(200, {ok: true})
		})
		const {logger} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		// Allow ~2 intervals to elapse so at least one POST fires
		await sleep(TEST_INTERVAL_MS * 2 + 50)
		stop()
		// Give in-flight POST microtasks one tick to flush onto capturedRequests
		await sleep(20)

		expect(capturedRequests.length).toBeGreaterThanOrEqual(1)
		const req = capturedRequests[0]
		expect(req.url).toBe('https://livinity.io/api/devices/heartbeat')
		expect(req.init?.method).toBe('POST')
		const headers = req.init?.headers as Record<string, string>
		expect(headers['X-Api-Key']).toBe('liv_k_iCCxIa7vlFgbpOl-fPwd')
		expect(headers['Content-Type']).toBe('application/json')
		expect(typeof headers['User-Agent']).toBe('string')
		expect(headers['User-Agent']).toMatch(/^LivOS-heartbeat\//)

		const body = JSON.parse(req.init?.body as string)
		expect(body.mode).toBe('tunnel')
		expect(body.version).toBe('1.5.0')
		expect(typeof body.device_id).toBe('string')
		expect(typeof body.hostname).toBe('string')
		expect(typeof body.uptime).toBe('number')
	})

	it('404 from Server5: logs warn ONCE per restart, keeps retrying silently', async () => {
		let count404 = 0
		const fetchImpl = makeFetchMock(() => {
			count404++
			return new Response('Not Found', {status: 404})
		})
		const {logger, entries} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		// Allow ~4 intervals so we trigger multiple 404s
		await sleep(TEST_INTERVAL_MS * 4 + 50)
		stop()
		await sleep(20)

		expect(count404).toBeGreaterThanOrEqual(2)
		const warn404 = entries.filter(
			(e) => e.level === 'warn' && /404/.test(e.msg),
		)
		expect(warn404.length).toBe(1)
		// Subsequent 404s should be verbose:
		const verbose404 = entries.filter(
			(e) => e.level === 'verbose' && /404/.test(e.msg),
		)
		expect(verbose404.length).toBeGreaterThanOrEqual(1)
	})

	it('401 Unauthorized: logs error and STOPS heartbeat (no further POSTs)', async () => {
		let postCount = 0
		const fetchImpl = makeFetchMock(() => {
			postCount++
			return new Response('Unauthorized', {status: 401})
		})
		const {logger, entries} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		// Wait long enough for several would-be intervals; after 401, no more POSTs:
		await sleep(TEST_INTERVAL_MS * 6 + 50)
		stop()
		await sleep(20)

		expect(postCount).toBe(1)
		const err401 = entries.filter(
			(e) => e.level === 'error' && /401/.test(e.msg),
		)
		expect(err401.length).toBe(1)
	})

	it('5xx: logs warn and keeps retrying', async () => {
		let postCount = 0
		const fetchImpl = makeFetchMock(() => {
			postCount++
			return new Response('Server is down', {status: 503})
		})
		const {logger, entries} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		await sleep(TEST_INTERVAL_MS * 4 + 50)
		stop()
		await sleep(20)

		expect(postCount).toBeGreaterThanOrEqual(2)
		const warn5xx = entries.filter(
			(e) => e.level === 'warn' && /503/.test(e.msg),
		)
		expect(warn5xx.length).toBeGreaterThanOrEqual(1)
	})

	it('429: logs warn and continues (no stop)', async () => {
		let postCount = 0
		const fetchImpl = makeFetchMock(() => {
			postCount++
			return new Response('rate-limited', {status: 429})
		})
		const {logger, entries} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		await sleep(TEST_INTERVAL_MS * 4 + 50)
		stop()
		await sleep(20)
		expect(postCount).toBeGreaterThanOrEqual(2)
		const warn429 = entries.filter(
			(e) => e.level === 'warn' && /429/.test(e.msg),
		)
		expect(warn429.length).toBeGreaterThanOrEqual(1)
	})

	it('network error: logs warn and continues', async () => {
		let postCount = 0
		const fetchImpl = makeFetchMock(() => {
			postCount++
			throw new Error('ECONNREFUSED')
		})
		const {logger, entries} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		await sleep(TEST_INTERVAL_MS * 4 + 50)
		stop()
		await sleep(20)
		expect(postCount).toBeGreaterThanOrEqual(2)
		const warnNet = entries.filter(
			(e) => e.level === 'warn' && /network error/.test(e.msg),
		)
		expect(warnNet.length).toBeGreaterThanOrEqual(1)
	})

	it('missing API key (Redis unset): logs warn once and skips POST', async () => {
		let postCount = 0
		const fetchImpl = makeFetchMock(() => {
			postCount++
			return jsonResponse(200, {ok: true})
		})
		const {logger, entries} = makeLogger()
		// Redis WITHOUT the api_key_path key:
		const redis = makeRedis({
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		await sleep(TEST_INTERVAL_MS * 4 + 50)
		stop()
		await sleep(20)

		expect(postCount).toBe(0)
		const warnKey = entries.filter(
			(e) => e.level === 'warn' && /API key unavailable/.test(e.msg),
		)
		// log-once semantics — exactly 1, not 2+ across multiple ticks:
		expect(warnKey.length).toBe(1)
	})

	it('stop() prevents further POSTs from being scheduled', async () => {
		let postCount = 0
		const fetchImpl = makeFetchMock(() => {
			postCount++
			return jsonResponse(200, {ok: true})
		})
		const {logger} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		// Let one tick fire:
		await sleep(TEST_INTERVAL_MS * 2 + 30)
		const countBeforeStop = postCount
		expect(countBeforeStop).toBeGreaterThanOrEqual(1)

		stop()
		// Wait many intervals — count must NOT increase:
		await sleep(TEST_INTERVAL_MS * 8)
		expect(postCount).toBe(countBeforeStop)
	})

	it('SECURITY: API key value is NEVER logged in plaintext (only redacted preview)', async () => {
		const fetchImpl = makeFetchMock(() => jsonResponse(200, {ok: true}))
		const {logger, entries} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})
		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		await sleep(TEST_INTERVAL_MS * 3 + 50)
		stop()
		await sleep(20)

		const RAW_KEY = 'liv_k_iCCxIa7vlFgbpOl-fPwd'
		// Tail is the secret-bearing portion (everything after liv_k_).
		const SECRET_TAIL = RAW_KEY.slice('liv_k_'.length) // iCCxIa7vlFgbpOl-fPwd
		const TAIL_REGEX = new RegExp(SECRET_TAIL)
		// ALL log entries must NOT contain the secret tail.
		for (const entry of entries) {
			expect(entry.msg).not.toMatch(TAIL_REGEX)
		}
		// Sanity: the redacted form DOES appear (so the test isn't trivially passing
		// because the api-key never made it onto any log line at all).
		const redactedSeen = entries.some((e) => /liv_k_iCCxIa\*\*\*/.test(e.msg))
		expect(redactedSeen).toBe(true)
	})

	it('first tick fires AFTER intervalMs, not immediately on start', async () => {
		let postCount = 0
		const fetchImpl = makeFetchMock(() => {
			postCount++
			return jsonResponse(200, {ok: true})
		})
		const {logger} = makeLogger()
		const redis = makeRedis({
			'livos:account:api_key_path': apiKeyFile,
			'livos:domain:local_mode': 'tunnel',
		})

		const stop = startHeartbeat({
			url: 'https://livinity.io/api/devices/heartbeat',
			intervalSec: TEST_INTERVAL_SEC,
			redis,
			version: '1.5.0',
			logger,
			deviceIdPath: deviceIdFile,
			fetchImpl,
		})
		// 10ms after start: no POST yet (interval is 50ms).
		await sleep(10)
		expect(postCount).toBe(0)
		// After 1 full interval + small jitter buffer: at least 1 POST:
		await sleep(TEST_INTERVAL_MS + 30)
		expect(postCount).toBeGreaterThanOrEqual(1)
		stop()
	})
})
