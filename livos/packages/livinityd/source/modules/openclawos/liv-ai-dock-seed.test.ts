/**
 * Phase 203 Hot-fix D 2026-05-24 — original test (covered the seed flow).
 * Phase 203 Hot-fix E 2026-05-24 — extended for the Liv+Chat pair seed.
 * Phase 203 Hot-fix F 2026-05-24 — INVERTED. The function now DELETES the
 *   Hot-fix D/E entries from NativeAppConfigStore because that store feeds
 *   the DESKTOP grid (not the dock). The dock tiles moved to the hardcoded
 *   `modules/desktop/dock.tsx` (LIV_AI_CHAT + LIV_AI_CHAT_SHORTCUT). These
 *   tests now verify the cleanup semantics: stale rows are deleted, cold
 *   installs are no-ops, and delete events publish so the desktop grid
 *   drops the rows in real time.
 */

import {beforeEach, describe, expect, it} from 'vitest'

import {
	NativeAppConfigStore,
	nativeAppConfigSchema,
	type NativeAppConfig,
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

/** Helper — pre-populate the store with the Hot-fix D/E entries Hot-fix F sweeps. */
async function seedLegacy(store: NativeAppConfigStore): Promise<void> {
	const liv: NativeAppConfig = {
		id: LIV_AI_NATIVE_ID,
		name: 'Liv',
		iconUrl: LIV_AI_ICON_URL,
		binaryPath: '/usr/bin/true',
		wmClassHint: LIV_AI_WMCLASS_HINT,
	}
	const chat: NativeAppConfig = {
		id: LIV_AI_CHAT_NATIVE_ID,
		name: 'Chat',
		iconUrl: LIV_AI_ICON_URL,
		binaryPath: '/usr/bin/true',
		wmClassHint: LIV_AI_WMCLASS_HINT,
	}
	await store.upsert(liv)
	await store.upsert(chat)
}

describe('Hot-fix F — seedLivAiDockEntry now DELETES the legacy desktop entries', () => {
	let redis: ReturnType<typeof fakeRedis>
	let store: NativeAppConfigStore

	beforeEach(() => {
		redis = fakeRedis()
		store = new NativeAppConfigStore(redis)
	})

	it('removes the legacy Liv entry from NativeAppConfigStore after boot', async () => {
		await seedLegacy(store)
		expect(await store.get(LIV_AI_NATIVE_ID)).not.toBeNull()

		await seedLivAiDockEntry(store)

		expect(await store.get(LIV_AI_NATIVE_ID)).toBeNull()
	})

	it('removes the legacy Chat entry from NativeAppConfigStore after boot', async () => {
		await seedLegacy(store)
		expect(await store.get(LIV_AI_CHAT_NATIVE_ID)).not.toBeNull()

		await seedLivAiDockEntry(store)

		expect(await store.get(LIV_AI_CHAT_NATIVE_ID)).toBeNull()
	})

	it('leaves apps.native.list empty when both legacy entries were present', async () => {
		await seedLegacy(store)
		expect(await store.list()).toHaveLength(2)

		await seedLivAiDockEntry(store)

		expect(await store.list()).toHaveLength(0)
	})

	it('is idempotent — cold installs (no legacy rows) are a no-op', async () => {
		// No legacy seed first — store is empty.
		expect(await store.list()).toHaveLength(0)

		await seedLivAiDockEntry(store)
		await seedLivAiDockEntry(store)
		await seedLivAiDockEntry(store)

		expect(await store.list()).toHaveLength(0)
	})

	it('publishes liv:config:updated delete events when legacy rows existed', async () => {
		await seedLegacy(store)
		// Reset the publish log so we only see Hot-fix F's events
		redis.publishes.length = 0

		await seedLivAiDockEntry(store)

		const deletes = redis.publishes
			.filter((p) => p.channel === 'liv:config:updated')
			.map((p) => JSON.parse(p.message))
			.filter((m) => m.kind === 'native-app' && m.op === 'delete')
		const deletedIds = deletes.map((m) => m.id)
		expect(deletedIds).toContain(LIV_AI_NATIVE_ID)
		expect(deletedIds).toContain(LIV_AI_CHAT_NATIVE_ID)
	})

	it('publishes nothing when there is nothing to delete (clean cold install)', async () => {
		await seedLivAiDockEntry(store)

		const deletes = redis.publishes
			.filter((p) => p.channel === 'liv:config:updated')
			.map((p) => JSON.parse(p.message))
			.filter((m) => m.kind === 'native-app' && m.op === 'delete')
		expect(deletes).toHaveLength(0)
	})

	it('does NOT recreate the legacy rows (defends against accidental re-seed regressions)', async () => {
		await seedLivAiDockEntry(store)
		// Inspect the underlying Redis fake — no liv:apps:native:* keys
		// should have been WRITTEN by Hot-fix F's flow.
		const keys = Array.from(redis.store.keys()).filter((k) =>
			k.startsWith('liv:apps:native:'),
		)
		expect(keys).toHaveLength(0)
	})
})

describe('Hot-fix F — exported constants remain stable for back-compat', () => {
	// These constants are kept exported so any external consumer (tests,
	// debug scripts, future cleanup tasks) can still reference the legacy
	// UUIDs symbolically. The values themselves MUST NOT change — operator
	// installs may still hold the matching Redis keys until next boot.

	it('LIV_AI_NATIVE_ID + LIV_AI_CHAT_NATIVE_ID are valid v4-shaped UUIDs', () => {
		const UUID_RE =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		expect(UUID_RE.test(LIV_AI_NATIVE_ID)).toBe(true)
		expect(UUID_RE.test(LIV_AI_CHAT_NATIVE_ID)).toBe(true)
	})

	it('wmClassHint is the EXACT string "liv-ai" (distinct from liv-openui- prefix)', () => {
		expect(LIV_AI_WMCLASS_HINT).toBe('liv-ai')
		expect(LIV_AI_WMCLASS_HINT.startsWith('liv-openui-')).toBe(false)
	})

	it('LIV_AI_ICON_URL is a root-relative path under /liv-ai-app/', () => {
		expect(LIV_AI_ICON_URL.startsWith('/liv-ai-app/')).toBe(true)
		expect(LIV_AI_ICON_URL).toMatch(/\.(svg|png|webp)$/i)
	})

	it('legacy seed shape (rebuilt in seedLegacy helper) still satisfies nativeAppConfigSchema.parse', () => {
		// Defensive check — proves the helper used by these tests creates
		// objects schema-compatible with what livinityd seeds in production.
		const liv: NativeAppConfig = {
			id: LIV_AI_NATIVE_ID,
			name: 'Liv',
			iconUrl: LIV_AI_ICON_URL,
			binaryPath: '/usr/bin/true',
			wmClassHint: LIV_AI_WMCLASS_HINT,
		}
		expect(() => nativeAppConfigSchema.parse(liv)).not.toThrow()
	})
})
