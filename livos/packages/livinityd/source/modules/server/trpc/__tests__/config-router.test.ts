/**
 * Phase 243-03 Task 1 — config-router tests.
 *
 * Coverage:
 *   T1 — Drift-lock: TERMINAL_PANEL_REDIS_KEY === 'livos:v43:terminal_panel'
 *   T2 — getTerminalPanelEnabled returns {enabled:false} when redis.get → null
 *   T3 — getTerminalPanelEnabled returns {enabled:false} when redis.get → 'false'
 *   T4 — getTerminalPanelEnabled returns {enabled:false} when redis.get → '1' (any non-literal-'true')
 *   T5 — getTerminalPanelEnabled returns {enabled:true} ONLY when redis.get → 'true'
 *
 * Also preserves the Phase 224 v42-migration contract by exercising
 * `getV42MigrationActive` against the same fake-redis surface so a future
 * refactor that touches the shared `createConfigRouter` factory cannot
 * silently regress either flag.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	createConfigRouter,
	TERMINAL_PANEL_REDIS_KEY,
	V42_MIGRATION_REDIS_KEY,
} from '../config-router.js'

function makePublicCtx() {
	return {
		livinityd: {} as any,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			verbose: () => {},
			log: () => {},
			debug: () => {},
		},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: false,
		currentUser: null,
		transport: 'express' as const,
	}
}

function makeFakeRedis(seed: Record<string, string | null> = {}) {
	const store = new Map<string, string | null>(Object.entries(seed))
	return {
		get: vi.fn(async (key: string): Promise<string | null> => {
			if (!store.has(key)) return null
			const v = store.get(key)
			return v ?? null
		}),
		_set(key: string, value: string | null) {
			store.set(key, value)
		},
	}
}

describe('config-router — Phase 243-03 drift-locks', () => {
	test('T1 — TERMINAL_PANEL_REDIS_KEY literal is exactly "livos:v43:terminal_panel"', () => {
		expect(TERMINAL_PANEL_REDIS_KEY).toBe('livos:v43:terminal_panel')
	})

	test('T1b — V42_MIGRATION_REDIS_KEY preserved unchanged by Phase 243-03', () => {
		// Defensive co-assertion: 243-03 added a sibling const so verify the
		// neighboring v42 literal wasn't accidentally edited.
		expect(V42_MIGRATION_REDIS_KEY).toBe('liv:config:liv_v42_migration_active')
	})
})

describe('config-router — getTerminalPanelEnabled (default-OFF, literal-true only)', () => {
	let redis: ReturnType<typeof makeFakeRedis>

	beforeEach(() => {
		redis = makeFakeRedis()
	})

	test('T2 — returns {enabled:false} when redis.get returns null (key missing)', async () => {
		const r = createConfigRouter({redis})
		const caller = r.createCaller(makePublicCtx() as any)
		const result = await caller.getTerminalPanelEnabled()
		expect(result).toEqual({enabled: false})
		expect(redis.get).toHaveBeenCalledWith('livos:v43:terminal_panel')
	})

	test('T3 — returns {enabled:false} when redis.get returns "false"', async () => {
		redis._set('livos:v43:terminal_panel', 'false')
		const r = createConfigRouter({redis})
		const caller = r.createCaller(makePublicCtx() as any)
		const result = await caller.getTerminalPanelEnabled()
		expect(result).toEqual({enabled: false})
	})

	test('T4 — returns {enabled:false} when redis.get returns "1" (any non-literal-"true")', async () => {
		redis._set('livos:v43:terminal_panel', '1')
		const r = createConfigRouter({redis})
		const caller = r.createCaller(makePublicCtx() as any)
		const result = await caller.getTerminalPanelEnabled()
		expect(result).toEqual({enabled: false})
	})

	test('T5 — returns {enabled:true} ONLY when redis.get returns the literal string "true"', async () => {
		redis._set('livos:v43:terminal_panel', 'true')
		const r = createConfigRouter({redis})
		const caller = r.createCaller(makePublicCtx() as any)
		const result = await caller.getTerminalPanelEnabled()
		expect(result).toEqual({enabled: true})
	})
})

describe('config-router — getV42MigrationActive (preserved Phase 224 contract)', () => {
	test('default-ON: redis.get returns null → {active:true}', async () => {
		const redis = makeFakeRedis()
		const r = createConfigRouter({redis})
		const caller = r.createCaller(makePublicCtx() as any)
		const result = await caller.getV42MigrationActive()
		expect(result).toEqual({active: true})
	})

	test('rollback: redis.get returns "false" → {active:false}', async () => {
		const redis = makeFakeRedis()
		redis._set('liv:config:liv_v42_migration_active', 'false')
		const r = createConfigRouter({redis})
		const caller = r.createCaller(makePublicCtx() as any)
		const result = await caller.getV42MigrationActive()
		expect(result).toEqual({active: false})
	})
})
