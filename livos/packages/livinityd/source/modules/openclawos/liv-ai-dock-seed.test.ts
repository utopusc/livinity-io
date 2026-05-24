/**
 * Phase 203 Hot-fix D 2026-05-24 — liv-ai-dock-seed tests.
 *
 * Verifies the seed is idempotent (same UUID on every boot), produces a
 * schema-valid config that survives nativeAppConfigSchema.parse inside
 * upsert, and publishes liv:config:updated so the dock re-renders.
 */

import {beforeEach, describe, expect, it} from 'vitest'

import {
	NativeAppConfigStore,
	nativeAppConfigSchema,
	type RedisLike,
} from '../apps/native-app-config.js'
import {
	LIV_AI_NATIVE_ID,
	LIV_AI_WMCLASS_HINT,
	LIV_AI_ICON_URL,
	seedLivAiDockEntry,
} from './liv-ai-dock-seed.js'

function fakeRedis(): RedisLike & {
	store: Map<string, string>
	publishes: Array<{channel: string; message: string}>
} {
	const store = new Map<string, string>()
	const publishes: Array<{channel: string; message: string}> = []
	return {
		store,
		publishes,
		async set(key, value) {
			store.set(key, value)
			return 'OK'
		},
		async get(key) {
			return store.get(key) ?? null
		},
		async del(key) {
			return store.delete(key) ? 1 : 0
		},
		async keys(pattern) {
			const prefix = pattern.replace(/\*$/, '')
			return Array.from(store.keys()).filter((k) => k.startsWith(prefix))
		},
		async publish(channel, message) {
			publishes.push({channel, message})
			return 0
		},
	}
}

describe('seedLivAiDockEntry — permanent dock entry seed', () => {
	let redis: ReturnType<typeof fakeRedis>
	let store: NativeAppConfigStore

	beforeEach(() => {
		redis = fakeRedis()
		store = new NativeAppConfigStore(redis)
	})

	it('writes a config at the fixed LIV_AI_NATIVE_ID Redis key', async () => {
		await seedLivAiDockEntry(store)
		const persisted = await store.get(LIV_AI_NATIVE_ID)
		expect(persisted).not.toBeNull()
		expect(persisted?.id).toBe(LIV_AI_NATIVE_ID)
		expect(persisted?.name).toBe('Liv AI')
		expect(persisted?.iconUrl).toBe(LIV_AI_ICON_URL)
		expect(persisted?.wmClassHint).toBe(LIV_AI_WMCLASS_HINT)
	})

	it('is idempotent — calling N times produces exactly 1 entry in apps.native.list', async () => {
		await seedLivAiDockEntry(store)
		await seedLivAiDockEntry(store)
		await seedLivAiDockEntry(store)
		const all = await store.list()
		const livAi = all.filter((e) => e.id === LIV_AI_NATIVE_ID)
		expect(livAi).toHaveLength(1)
	})

	it('publishes liv:config:updated so the dock can re-fetch', async () => {
		await seedLivAiDockEntry(store)
		const updates = redis.publishes.filter((p) => p.channel === 'liv:config:updated')
		expect(updates.length).toBeGreaterThanOrEqual(1)
		const last = JSON.parse(updates[updates.length - 1]!.message)
		expect(last.kind).toBe('native-app')
		expect(last.id).toBe(LIV_AI_NATIVE_ID)
		expect(last.op).toBe('upsert')
	})

	it('produces a config that satisfies nativeAppConfigSchema.parse', async () => {
		await seedLivAiDockEntry(store)
		const raw = redis.store.get(`liv:apps:native:${LIV_AI_NATIVE_ID}`)
		expect(raw).toBeDefined()
		// Re-parse must not throw — defends against schema drift breaking the seed.
		expect(() => nativeAppConfigSchema.parse(JSON.parse(raw!))).not.toThrow()
	})

	it('iconUrl is a root-relative path served by the Phase 202 Next.js subapp', () => {
		// Sanity check on the constant exported alongside the seed function —
		// catches accidental rename to an absolute URL or a non-/liv-ai-app path
		// (which would 404 because no Caddy handle serves it).
		expect(LIV_AI_ICON_URL.startsWith('/liv-ai-app/')).toBe(true)
		expect(LIV_AI_ICON_URL).toMatch(/\.(svg|png|webp)$/i)
	})

	it('wmClassHint is the EXACT string "liv-ai" (not a prefix — distinct from liv-openui-)', () => {
		// useLaunchNativeApp short-circuits on exact match; the OpenUI branch
		// uses startsWith('liv-openui-'). Test that the two branches stay
		// disjoint by asserting the exact value here.
		expect(LIV_AI_WMCLASS_HINT).toBe('liv-ai')
		expect(LIV_AI_WMCLASS_HINT.startsWith('liv-openui-')).toBe(false)
	})

	it('LIV_AI_NATIVE_ID is a valid v4-shaped UUID (matches nativeAppConfigSchema.id regex)', () => {
		// Regex from z.string().uuid() — version nibble must be 1-5, variant 8-b.
		const UUID_RE =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		expect(UUID_RE.test(LIV_AI_NATIVE_ID)).toBe(true)
	})
})
