/**
 * Phase 101-03 Task 1 — Zod schema + Redis CRUD for native-app configs.
 *
 * RED phase: tests below are written first against the not-yet-existing
 * `nativeAppConfigSchema` and `NativeAppConfigStore`. GREEN phase implements
 * just enough of `native-app-config.ts` to flip every test from FAIL → PASS.
 *
 * Coverage (9 cases):
 *   Schema (5):
 *     - rejects relative binaryPath (e.g. "google-chrome")
 *     - rejects binaryPath with semicolon or backtick
 *     - rejects env containing LD_PRELOAD
 *     - rejects env containing DYLD_INSERT_LIBRARIES
 *     - accepts a minimal valid config
 *   Store (4):
 *     - upsert writes to liv:apps:native:<id>
 *     - list returns all configs in namespace
 *     - get returns null for missing id
 *     - delete removes the key and publishes liv:config:updated
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi} from 'vitest'
import {randomUUID} from 'node:crypto'

import {
	nativeAppConfigSchema,
	NativeAppConfigStore,
	type NativeAppConfig,
} from './native-app-config.js'

// ─── Map-backed fake Redis (mirrors seed-builtin-tools.test.ts pattern) ─────
// Implements the minimum surface NativeAppConfigStore needs: get/set/del/
// keys/publish. Tracks publishes so tests can assert the channel + payload.
function makeFakeRedis() {
	const store = new Map<string, string>()
	const publishes: Array<{channel: string; message: string}> = []
	const redis = {
		async set(key: string, value: string) {
			store.set(key, value)
			return 'OK'
		},
		async get(key: string) {
			return store.get(key) ?? null
		},
		async del(key: string) {
			const had = store.has(key)
			store.delete(key)
			return had ? 1 : 0
		},
		async keys(pattern: string) {
			// Lightweight glob: only the trailing `*` form is used by the store.
			if (pattern.endsWith('*')) {
				const prefix = pattern.slice(0, -1)
				return [...store.keys()].filter((k) => k.startsWith(prefix))
			}
			return store.has(pattern) ? [pattern] : []
		},
		async publish(channel: string, message: string) {
			publishes.push({channel, message})
			return 0
		},
	}
	return {redis: redis as any, store, publishes}
}

function makeValidConfig(overrides: Partial<NativeAppConfig> = {}): NativeAppConfig {
	return {
		id: randomUUID(),
		name: 'Antigravity IDE',
		binaryPath: '/usr/bin/antigravity',
		...overrides,
	}
}

describe('nativeAppConfigSchema (T-101-02 mitigation)', () => {
	it('rejects relative binaryPath (e.g. "google-chrome")', () => {
		const cfg = {...makeValidConfig(), binaryPath: 'google-chrome'}
		const result = nativeAppConfigSchema.safeParse(cfg)
		expect(result.success).toBe(false)
		if (!result.success) {
			const msgs = result.error.issues.map((i) => i.message).join('\n')
			expect(msgs).toMatch(/absolute path/i)
		}
	})

	it('rejects binaryPath with semicolon or backtick', () => {
		const semi = nativeAppConfigSchema.safeParse({
			...makeValidConfig(),
			binaryPath: '/usr/bin/foo; rm -rf /',
		})
		expect(semi.success).toBe(false)
		const tick = nativeAppConfigSchema.safeParse({
			...makeValidConfig(),
			binaryPath: '/usr/bin/`whoami`',
		})
		expect(tick.success).toBe(false)
	})

	it('rejects env containing LD_PRELOAD', () => {
		const cfg = {
			...makeValidConfig(),
			env: {LD_PRELOAD: '/tmp/evil.so'},
		}
		const result = nativeAppConfigSchema.safeParse(cfg)
		expect(result.success).toBe(false)
		if (!result.success) {
			const msgs = result.error.issues.map((i) => i.message).join('\n')
			expect(msgs).toMatch(/LD_|DYLD_/)
		}
	})

	it('rejects env containing DYLD_INSERT_LIBRARIES', () => {
		const cfg = {
			...makeValidConfig(),
			env: {DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib'},
		}
		const result = nativeAppConfigSchema.safeParse(cfg)
		expect(result.success).toBe(false)
	})

	it('accepts a minimal valid config', () => {
		const cfg = makeValidConfig()
		const result = nativeAppConfigSchema.safeParse(cfg)
		expect(result.success).toBe(true)
	})

	it('accepts a fully-populated valid config (with safe args + env)', () => {
		const cfg: NativeAppConfig = {
			id: randomUUID(),
			name: 'VSCode',
			iconUrl: 'https://example.com/icon.svg',
			binaryPath: '/usr/bin/code',
			args: ['--new-window', '--disable-gpu'],
			env: {NODE_ENV: 'production'},
			wmClassHint: 'Code',
		}
		const result = nativeAppConfigSchema.safeParse(cfg)
		expect(result.success).toBe(true)
	})

	it('rejects shell-metachar args (defense in depth on argv vector)', () => {
		const cfg = {
			...makeValidConfig(),
			args: ['--file', '/etc/passwd; cat /etc/shadow'],
		}
		const result = nativeAppConfigSchema.safeParse(cfg)
		expect(result.success).toBe(false)
	})
})

describe('NativeAppConfigStore (Redis CRUD at liv:apps:native:<id>)', () => {
	it('upsert writes to liv:apps:native:<id>', async () => {
		const {redis, store} = makeFakeRedis()
		const repo = new NativeAppConfigStore(redis)
		const cfg = makeValidConfig()
		await repo.upsert(cfg)
		expect(store.has(`liv:apps:native:${cfg.id}`)).toBe(true)
		const raw = store.get(`liv:apps:native:${cfg.id}`)!
		const parsed = JSON.parse(raw)
		expect(parsed.id).toBe(cfg.id)
		expect(parsed.binaryPath).toBe(cfg.binaryPath)
	})

	it('upsert publishes liv:config:updated on write', async () => {
		const {redis, publishes} = makeFakeRedis()
		const repo = new NativeAppConfigStore(redis)
		const cfg = makeValidConfig()
		await repo.upsert(cfg)
		const upsertPub = publishes.find((p) => p.channel === 'liv:config:updated')
		expect(upsertPub).toBeDefined()
		const payload = JSON.parse(upsertPub!.message)
		expect(payload.kind).toBe('native-app')
		expect(payload.id).toBe(cfg.id)
		expect(payload.op).toBe('upsert')
	})

	it('list returns all configs in namespace', async () => {
		const {redis} = makeFakeRedis()
		const repo = new NativeAppConfigStore(redis)
		const a = makeValidConfig({name: 'A'})
		const b = makeValidConfig({name: 'B'})
		await repo.upsert(a)
		await repo.upsert(b)
		const list = await repo.list()
		expect(list).toHaveLength(2)
		const names = list.map((c) => c.name).sort()
		expect(names).toEqual(['A', 'B'])
	})

	it('get returns null for missing id', async () => {
		const {redis} = makeFakeRedis()
		const repo = new NativeAppConfigStore(redis)
		const result = await repo.get(randomUUID())
		expect(result).toBeNull()
	})

	it('get returns the stored config for a known id', async () => {
		const {redis} = makeFakeRedis()
		const repo = new NativeAppConfigStore(redis)
		const cfg = makeValidConfig()
		await repo.upsert(cfg)
		const fetched = await repo.get(cfg.id)
		expect(fetched).not.toBeNull()
		expect(fetched!.binaryPath).toBe(cfg.binaryPath)
		expect(fetched!.name).toBe(cfg.name)
	})

	it('delete removes the key and publishes liv:config:updated', async () => {
		const {redis, store, publishes} = makeFakeRedis()
		const repo = new NativeAppConfigStore(redis)
		const cfg = makeValidConfig()
		await repo.upsert(cfg)
		expect(store.has(`liv:apps:native:${cfg.id}`)).toBe(true)
		const ok = await repo.delete(cfg.id)
		expect(ok).toBe(true)
		expect(store.has(`liv:apps:native:${cfg.id}`)).toBe(false)
		const deletePubs = publishes.filter(
			(p) => p.channel === 'liv:config:updated' && JSON.parse(p.message).op === 'delete',
		)
		expect(deletePubs).toHaveLength(1)
		const payload = JSON.parse(deletePubs[0].message)
		expect(payload.kind).toBe('native-app')
		expect(payload.id).toBe(cfg.id)
	})

	it('delete returns false (and does NOT publish) for an absent id', async () => {
		const {redis, publishes} = makeFakeRedis()
		const repo = new NativeAppConfigStore(redis)
		const ok = await repo.delete(randomUUID())
		expect(ok).toBe(false)
		expect(publishes).toHaveLength(0)
	})
})
