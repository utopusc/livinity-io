/**
 * Phase 203-10 Task 1 — desktop-registrar tests.
 *
 * Verifies the deterministic UUID derivation, wmClassHint sanitization,
 * idempotent registration, and that `NativeAppConfigStore` is called with
 * a schema-valid config that survives the `nativeAppConfigSchema.parse`
 * gate inside `upsert`.
 *
 * Uses a Map-backed RedisLike fake (matches the convention in
 * `native-app-config.test.ts`).
 */

import {describe, expect, it, beforeEach} from 'vitest'

import {
	NativeAppConfigStore,
	type RedisLike,
} from '../apps/native-app-config.js'
import {
	deterministicUuidForSlug,
	registerOpenUiAppAsDesktopIcon,
	unregisterOpenUiApp,
	wmClassHintForSlug,
	OPENUI_ICON_URL,
	OPENUI_PLACEHOLDER_BINARY,
	OPENUI_WMCLASS_PREFIX,
} from './desktop-registrar.js'

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
			// Minimal glob — only supports the `prefix:*` form used by the store.
			const prefix = pattern.replace(/\*$/, '')
			return Array.from(store.keys()).filter((k) => k.startsWith(prefix))
		},
		async publish(channel, message) {
			publishes.push({channel, message})
			return 0
		},
	}
}

describe('deterministicUuidForSlug', () => {
	it('returns a syntactically valid UUID for any slug', () => {
		const id = deterministicUuidForSlug('calculator')
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		)
	})

	it('is deterministic — same slug always returns the same UUID', () => {
		expect(deterministicUuidForSlug('stopwatch')).toBe(
			deterministicUuidForSlug('stopwatch'),
		)
	})

	it('differentiates distinct slugs', () => {
		expect(deterministicUuidForSlug('calc-a')).not.toBe(
			deterministicUuidForSlug('calc-b'),
		)
	})
})

describe('wmClassHintForSlug', () => {
	it('prepends the liv-openui- prefix', () => {
		expect(wmClassHintForSlug('calc')).toBe('liv-openui-calc')
	})

	it('keeps underscores, hyphens, and alphanumerics', () => {
		expect(wmClassHintForSlug('my_app-42')).toBe('liv-openui-my_app-42')
	})

	it('strips invalid characters (path traversal, spaces, dots)', () => {
		expect(wmClassHintForSlug('../etc/passwd')).toBe('liv-openui----etc-passwd')
	})

	it('clamps to 64 chars total', () => {
		const longSlug = 'a'.repeat(200)
		const hint = wmClassHintForSlug(longSlug)
		expect(hint.length).toBeLessThanOrEqual(64)
		expect(hint.startsWith(OPENUI_WMCLASS_PREFIX)).toBe(true)
	})
})

describe('registerOpenUiAppAsDesktopIcon', () => {
	let redis: ReturnType<typeof fakeRedis>
	let store: NativeAppConfigStore

	beforeEach(() => {
		redis = fakeRedis()
		store = new NativeAppConfigStore(redis)
	})

	it('writes a NativeAppConfig with the placeholder binary + icon + wmClassHint', async () => {
		await registerOpenUiAppAsDesktopIcon(store, 'calculator', 'Calculator')

		const all = await store.list()
		expect(all).toHaveLength(1)
		const cfg = all[0]!
		expect(cfg.id).toBe(deterministicUuidForSlug('calculator'))
		expect(cfg.name).toBe('Calculator')
		expect(cfg.iconUrl).toBe(OPENUI_ICON_URL)
		expect(cfg.binaryPath).toBe(OPENUI_PLACEHOLDER_BINARY)
		expect(cfg.wmClassHint).toBe('liv-openui-calculator')
	})

	it('publishes liv:config:updated so the dock re-fetches', async () => {
		await registerOpenUiAppAsDesktopIcon(store, 'calculator', 'Calculator')
		expect(redis.publishes).toHaveLength(1)
		expect(redis.publishes[0]!.channel).toBe('liv:config:updated')
		const payload = JSON.parse(redis.publishes[0]!.message)
		expect(payload.kind).toBe('native-app')
		expect(payload.op).toBe('upsert')
	})

	it('is idempotent — re-registering the same slug stays at 1 entry', async () => {
		await registerOpenUiAppAsDesktopIcon(store, 'calc', 'Calc')
		await registerOpenUiAppAsDesktopIcon(store, 'calc', 'Calc Renamed')

		const all = await store.list()
		expect(all).toHaveLength(1)
		expect(all[0]!.name).toBe('Calc Renamed')
	})

	it('writes a schema-valid config even when slug contains invalid chars', async () => {
		// Slug normalization happens upstream (openclawos-router.SlugSchema),
		// but defensively we should never write a config that fails the spawner's
		// re-parse gate. wmClassHint must satisfy `[\w-]{1,64}`.
		await registerOpenUiAppAsDesktopIcon(store, 'my.dotty/app', 'My App')

		const all = await store.list()
		expect(all).toHaveLength(1)
		expect(all[0]!.wmClassHint).toMatch(/^[\w-]{1,64}$/)
	})
})

describe('unregisterOpenUiApp', () => {
	let redis: ReturnType<typeof fakeRedis>
	let store: NativeAppConfigStore

	beforeEach(() => {
		redis = fakeRedis()
		store = new NativeAppConfigStore(redis)
	})

	it('removes the icon for the matching slug', async () => {
		await registerOpenUiAppAsDesktopIcon(store, 'calc', 'Calc')
		await unregisterOpenUiApp(store, 'calc')

		const all = await store.list()
		expect(all).toHaveLength(0)
	})

	it('is idempotent on missing slug (no error)', async () => {
		await expect(unregisterOpenUiApp(store, 'never-existed')).resolves.toBeUndefined()
	})

	it('publishes a delete event ONLY when a key was actually removed', async () => {
		await registerOpenUiAppAsDesktopIcon(store, 'calc', 'Calc')
		redis.publishes.length = 0 // reset after register

		await unregisterOpenUiApp(store, 'calc')
		expect(redis.publishes).toHaveLength(1)
		expect(redis.publishes[0]!.message).toContain('"op":"delete"')

		redis.publishes.length = 0
		await unregisterOpenUiApp(store, 'calc') // already gone
		expect(redis.publishes).toHaveLength(0)
	})
})
