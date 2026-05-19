/**
 * Phase 165-01 Task 1 — idle-reaper.test.ts
 *
 * Vitest suite locking the IdleSessionReaper contract per Plan 165-01
 * <behavior> block (Tests 1-10). Reaper accesses session state ONLY
 * through the injected SessionActivityProvider interface; no liv-core
 * imports, no agent-session.ts touch.
 *
 * Test infrastructure: in-memory fake Redis (Map-backed) mirroring the
 * pattern from autonomous-scheduler/budget-gate.test.ts (D-NO-NEW-DEPS).
 * Reaper poll loop uses vitest fake timers — NEVER waits real wall-clock.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

import {
	IdleSessionReaper,
	type SessionActivityProvider,
	type SessionSnapshot,
} from './idle-reaper.js'

// ─── Fake Redis (Map-backed; only `get` is needed by idle-reaper) ──────

function makeFakeRedis(initial: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(initial))
	const calls: Array<{op: string; key: string}> = []
	let throwOnNextGet = false
	return {
		store,
		calls,
		setThrowOnNextGet(): void {
			throwOnNextGet = true
		},
		get: vi.fn(async (key: string): Promise<string | null> => {
			calls.push({op: 'get', key})
			if (throwOnNextGet) {
				throwOnNextGet = false
				throw new Error('fake redis: simulated failure')
			}
			return store.get(key) ?? null
		}),
	} as any
}

// ─── Helpers ───────────────────────────────────────────────────────────

interface ProviderState {
	sessions: SessionSnapshot[]
	abortCalls: string[]
	abortShouldThrowOnKey?: string
}

function makeProvider(state: ProviderState): SessionActivityProvider {
	return {
		listSessions: () => state.sessions,
		abort: (sessionKey: string) => {
			state.abortCalls.push(sessionKey)
			if (state.abortShouldThrowOnKey === sessionKey) {
				// One-shot: only throws first time
				state.abortShouldThrowOnKey = undefined
				throw new Error(`provider.abort threw for ${sessionKey}`)
			}
		},
	}
}

function makeLogger() {
	return {
		log: vi.fn(),
		error: vi.fn(),
	}
}

const NOW = 1_700_000_000_000 // fixed epoch ms baseline
const MIN = 60_000

// ─── Tests ─────────────────────────────────────────────────────────────

describe('IdleSessionReaper', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('Test 1: reap fires past threshold (default 30min)', async () => {
		const state: ProviderState = {
			sessions: [{sessionKey: 'admin:webapp:abc:conn01', lastMessageAt: NOW - 31 * MIN}],
			abortCalls: [],
		}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			nowMs: () => NOW,
		})
		await reaper.tick()
		expect(state.abortCalls).toEqual(['admin:webapp:abc:conn01'])
	})

	it('Test 2: no reap below threshold (default 30min)', async () => {
		const state: ProviderState = {
			sessions: [{sessionKey: 'admin:main:default:conn01', lastMessageAt: NOW - 29 * MIN}],
			abortCalls: [],
		}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			nowMs: () => NOW,
		})
		await reaper.tick()
		expect(state.abortCalls).toEqual([])
	})

	it('Test 3: Redis override (liv:config:idle_reap_min=5)', async () => {
		const redis = makeFakeRedis({'liv:config:idle_reap_min': '5'})
		const logger = makeLogger()
		// 6 min idle → should reap (≥ 5min threshold)
		const stateOver: ProviderState = {
			sessions: [{sessionKey: 'admin:webapp:over:conn', lastMessageAt: NOW - 6 * MIN}],
			abortCalls: [],
		}
		const reaperOver = new IdleSessionReaper({
			redis,
			provider: makeProvider(stateOver),
			logger,
			nowMs: () => NOW,
		})
		await reaperOver.tick()
		expect(stateOver.abortCalls).toEqual(['admin:webapp:over:conn'])

		// 4 min idle → should NOT reap
		const stateUnder: ProviderState = {
			sessions: [{sessionKey: 'admin:webapp:under:conn', lastMessageAt: NOW - 4 * MIN}],
			abortCalls: [],
		}
		const reaperUnder = new IdleSessionReaper({
			redis,
			provider: makeProvider(stateUnder),
			logger,
			nowMs: () => NOW,
		})
		await reaperUnder.tick()
		expect(stateUnder.abortCalls).toEqual([])
	})

	it('Test 4: non-numeric Redis value falls back to default 30min', async () => {
		const redis = makeFakeRedis({'liv:config:idle_reap_min': 'foo'})
		const logger = makeLogger()
		// 31 min idle → MUST reap (default 30min wins after fallback)
		const state31: ProviderState = {
			sessions: [{sessionKey: 'admin:over30:conn', lastMessageAt: NOW - 31 * MIN}],
			abortCalls: [],
		}
		const reaper31 = new IdleSessionReaper({
			redis,
			provider: makeProvider(state31),
			logger,
			nowMs: () => NOW,
		})
		await reaper31.tick()
		expect(state31.abortCalls).toEqual(['admin:over30:conn'])

		// 29 min idle → MUST NOT reap (still under default)
		const state29: ProviderState = {
			sessions: [{sessionKey: 'admin:under30:conn', lastMessageAt: NOW - 29 * MIN}],
			abortCalls: [],
		}
		const reaper29 = new IdleSessionReaper({
			redis,
			provider: makeProvider(state29),
			logger,
			nowMs: () => NOW,
		})
		await reaper29.tick()
		expect(state29.abortCalls).toEqual([])
	})

	it('Test 5: start() is idempotent — two calls register ONE setInterval', () => {
		const state: ProviderState = {sessions: [], abortCalls: []}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			nowMs: () => NOW,
			pollIntervalMs: 1_000, // 1s for test speed
		})
		const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
		reaper.start()
		reaper.start()
		reaper.start()
		expect(setIntervalSpy).toHaveBeenCalledTimes(1)
		reaper.stop()
		setIntervalSpy.mockRestore()
	})

	it('Test 6: stop() clears the interval — no further abort after stop', async () => {
		const state: ProviderState = {
			sessions: [{sessionKey: 'admin:idle:conn', lastMessageAt: NOW - 60 * MIN}],
			abortCalls: [],
		}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			nowMs: () => NOW,
			pollIntervalMs: 1_000,
		})
		reaper.start()
		reaper.stop()
		// Advance fake timers by 60 min — interval should be cleared, abort NEVER called
		await vi.advanceTimersByTimeAsync(60 * MIN)
		expect(state.abortCalls).toEqual([])
	})

	it('Test 7: multi-session reap — only past-threshold sessions are aborted', async () => {
		const state: ProviderState = {
			sessions: [
				{sessionKey: 's1:idle31', lastMessageAt: NOW - 31 * MIN},
				{sessionKey: 's2:idle10', lastMessageAt: NOW - 10 * MIN},
				{sessionKey: 's3:idle45', lastMessageAt: NOW - 45 * MIN},
			],
			abortCalls: [],
		}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			nowMs: () => NOW,
		})
		await reaper.tick()
		// Exactly two aborts; order doesn't matter
		expect(state.abortCalls.sort()).toEqual(['s1:idle31', 's3:idle45'])
	})

	it('Test 8: provider.abort throw is swallowed — logged + tick completes', async () => {
		const state: ProviderState = {
			sessions: [
				{sessionKey: 's-throws', lastMessageAt: NOW - 31 * MIN},
				{sessionKey: 's-ok', lastMessageAt: NOW - 45 * MIN},
			],
			abortCalls: [],
			abortShouldThrowOnKey: 's-throws',
		}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			nowMs: () => NOW,
		})
		// Must NOT throw — provider's throw is swallowed
		await expect(reaper.tick()).resolves.toBeUndefined()
		// Both aborts were attempted
		expect(state.abortCalls.sort()).toEqual(['s-ok', 's-throws'])
		// Error logger fired for the throwing one
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('s-throws'),
			expect.any(Error),
		)
	})

	it('Test 9: nowMs injection — Date.now is default', async () => {
		// Default behaviour: when nowMs is NOT injected, Date.now is used.
		// Verify by mocking the system clock to a known epoch and observing
		// reap based on the mock.
		vi.setSystemTime(new Date(NOW))
		const state: ProviderState = {
			sessions: [{sessionKey: 's-default-now', lastMessageAt: NOW - 31 * MIN}],
			abortCalls: [],
		}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			// nowMs intentionally omitted — defaults to Date.now
		})
		await reaper.tick()
		expect(state.abortCalls).toEqual(['s-default-now'])
	})

	it('Test 10: source never imports @liv/core nor agent-session module', async () => {
		// Read the source file as text and grep-assert architectural boundary.
		// The literal word "agent-session" is allowed inside COMMENTS (the file
		// documents that agent-session.ts is intentionally UNCHANGED). The
		// guard checks for actual `import` / `from '<path>'` lines pulling in
		// liv-core or any agent-session module — that is the architectural
		// boundary the SessionActivityProvider interface exists to enforce.
		const here = fileURLToPath(import.meta.url)
		const sourcePath = path.resolve(path.dirname(here), 'idle-reaper.ts')
		const src = await readFile(sourcePath, 'utf8')
		expect(src).not.toMatch(/from ['"]@liv\/core(?:['"]|\/)/)
		expect(src).not.toMatch(/from ['"][^'"]*agent-session[^'"]*['"]/)
		expect(src).not.toMatch(/import\s+[^'"]*['"][^'"]*agent-session/)
	})

	it('Bonus: Redis error in resolveThresholdMin falls back to default 30min', async () => {
		// Defensive: when redis.get throws, threshold should fall back to 30
		const state: ProviderState = {
			sessions: [{sessionKey: 's-redis-error', lastMessageAt: NOW - 31 * MIN}],
			abortCalls: [],
		}
		const provider = makeProvider(state)
		const redis = makeFakeRedis()
		redis.setThrowOnNextGet()
		const logger = makeLogger()
		const reaper = new IdleSessionReaper({
			redis,
			provider,
			logger,
			nowMs: () => NOW,
		})
		await reaper.tick()
		expect(state.abortCalls).toEqual(['s-redis-error'])
	})

	it('Bonus: zero / negative Redis override falls back to default 30min', async () => {
		const redis = makeFakeRedis({'liv:config:idle_reap_min': '-5'})
		const logger = makeLogger()
		// 29 min < default 30 → should NOT reap (proves we used default, not -5)
		const state: ProviderState = {
			sessions: [{sessionKey: 's-neg-override', lastMessageAt: NOW - 29 * MIN}],
			abortCalls: [],
		}
		const reaper = new IdleSessionReaper({
			redis,
			provider: makeProvider(state),
			logger,
			nowMs: () => NOW,
		})
		await reaper.tick()
		expect(state.abortCalls).toEqual([])
	})
})
