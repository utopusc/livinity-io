/**
 * Phase 203 Hot-fix D 2026-05-24 — liv-ai-dock-seed tests.
 * Phase 203 Hot-fix E 2026-05-24 — extended to cover the "Liv" rename +
 *   "Chat" second-entry pair.
 *
 * Verifies the seed is idempotent (same UUIDs on every boot), produces
 * schema-valid configs that survive nativeAppConfigSchema.parse inside
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
	LIV_AI_CHAT_NATIVE_ID,
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

describe('seedLivAiDockEntry — permanent dock entry seed (Hot-fix E pair)', () => {
	let redis: ReturnType<typeof fakeRedis>
	let store: NativeAppConfigStore

	beforeEach(() => {
		redis = fakeRedis()
		store = new NativeAppConfigStore(redis)
	})

	it('writes the Liv entry at the fixed LIV_AI_NATIVE_ID Redis key (renamed from "Liv AI")', async () => {
		await seedLivAiDockEntry(store)
		const persisted = await store.get(LIV_AI_NATIVE_ID)
		expect(persisted).not.toBeNull()
		expect(persisted?.id).toBe(LIV_AI_NATIVE_ID)
		// Hot-fix E rename: name is now "Liv" (was "Liv AI" in Hot-fix D)
		expect(persisted?.name).toBe('Liv')
		expect(persisted?.iconUrl).toBe(LIV_AI_ICON_URL)
		expect(persisted?.wmClassHint).toBe(LIV_AI_WMCLASS_HINT)
	})

	it('Hot-fix E — writes the Chat entry at the fixed LIV_AI_CHAT_NATIVE_ID Redis key', async () => {
		await seedLivAiDockEntry(store)
		const persisted = await store.get(LIV_AI_CHAT_NATIVE_ID)
		expect(persisted).not.toBeNull()
		expect(persisted?.id).toBe(LIV_AI_CHAT_NATIVE_ID)
		expect(persisted?.name).toBe('Chat')
		expect(persisted?.iconUrl).toBe(LIV_AI_ICON_URL)
		// Same wmClassHint — both open the same chat surface
		expect(persisted?.wmClassHint).toBe(LIV_AI_WMCLASS_HINT)
	})

	it('Hot-fix E — Liv and Chat are at DIFFERENT Redis keys (distinct UUIDs)', async () => {
		await seedLivAiDockEntry(store)
		expect(LIV_AI_NATIVE_ID).not.toBe(LIV_AI_CHAT_NATIVE_ID)
		const liv = await store.get(LIV_AI_NATIVE_ID)
		const chat = await store.get(LIV_AI_CHAT_NATIVE_ID)
		expect(liv).not.toBeNull()
		expect(chat).not.toBeNull()
	})

	it('is idempotent — calling N times produces exactly 2 entries (Liv + Chat) in apps.native.list', async () => {
		await seedLivAiDockEntry(store)
		await seedLivAiDockEntry(store)
		await seedLivAiDockEntry(store)
		const all = await store.list()
		// Hot-fix E — now 2 entries (was 1 in Hot-fix D)
		expect(all).toHaveLength(2)
		const livs = all.filter((e) => e.id === LIV_AI_NATIVE_ID)
		const chats = all.filter((e) => e.id === LIV_AI_CHAT_NATIVE_ID)
		expect(livs).toHaveLength(1)
		expect(chats).toHaveLength(1)
		expect(livs[0]!.name).toBe('Liv')
		expect(chats[0]!.name).toBe('Chat')
	})

	it('publishes liv:config:updated for BOTH entries so the dock can re-fetch each', async () => {
		await seedLivAiDockEntry(store)
		const updates = redis.publishes.filter((p) => p.channel === 'liv:config:updated')
		// Hot-fix E — 2 publishes (one per upsert), not 1
		expect(updates.length).toBeGreaterThanOrEqual(2)
		const ids = updates
			.map((p) => JSON.parse(p.message))
			.filter((m) => m.kind === 'native-app' && m.op === 'upsert')
			.map((m) => m.id)
		expect(ids).toContain(LIV_AI_NATIVE_ID)
		expect(ids).toContain(LIV_AI_CHAT_NATIVE_ID)
	})

	it('produces configs that satisfy nativeAppConfigSchema.parse (both entries)', async () => {
		await seedLivAiDockEntry(store)
		for (const id of [LIV_AI_NATIVE_ID, LIV_AI_CHAT_NATIVE_ID]) {
			const raw = redis.store.get(`liv:apps:native:${id}`)
			expect(raw).toBeDefined()
			expect(() => nativeAppConfigSchema.parse(JSON.parse(raw!))).not.toThrow()
		}
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

	it('LIV_AI_NATIVE_ID + LIV_AI_CHAT_NATIVE_ID are valid v4-shaped UUIDs (match nativeAppConfigSchema.id regex)', () => {
		// Regex from z.string().uuid() — version nibble must be 1-5, variant 8-b.
		const UUID_RE =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		expect(UUID_RE.test(LIV_AI_NATIVE_ID)).toBe(true)
		expect(UUID_RE.test(LIV_AI_CHAT_NATIVE_ID)).toBe(true)
	})
})
