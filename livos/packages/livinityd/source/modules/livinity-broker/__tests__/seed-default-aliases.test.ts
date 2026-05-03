// Phase 61 Plan 03 Wave 0 — RED tests for boot-time default alias seeder.
//
// Covers (per 61-03-PLAN.md must_haves.truths):
//   - all 10 default aliases written on empty Redis
//   - SETNX preserves admin runtime edits across reboot (FR-BROKER-D1-02)
//   - sentinel key (_meta:lastSeedAt) overwritten unconditionally
//   - get-then-set fallback when ioredis lacks setnx (legacy mocks)
//   - gpt-4 → claude-sonnet-4-6 mapping per RESEARCH.md A2 override
//
// Initially RED — imports `../seed-default-aliases.js` which doesn't exist until Task 2.

import {describe, expect, it} from 'vitest'

import {DEFAULT_ALIASES, seedDefaultAliases} from '../seed-default-aliases.js'

interface FakeRedisOptions {
	withSetnx?: boolean
}

interface FakeRedis {
	store: Map<string, string>
	get(key: string): Promise<string | null>
	set(key: string, value: string): Promise<unknown>
	setnx?(key: string, value: string): Promise<number>
}

function makeFakeRedis(opts: FakeRedisOptions = {withSetnx: true}): FakeRedis {
	const store = new Map<string, string>()
	const r: FakeRedis = {
		store,
		async get(k: string): Promise<string | null> {
			return store.has(k) ? store.get(k)! : null
		},
		async set(k: string, v: string): Promise<unknown> {
			store.set(k, v)
			return 'OK'
		},
	}
	if (opts.withSetnx) {
		r.setnx = async (k: string, v: string): Promise<number> => {
			if (store.has(k)) return 0
			store.set(k, v)
			return 1
		}
	}
	return r
}

describe('seedDefaultAliases (Phase 61 Plan 03)', () => {
	it('writes all 10 default aliases on empty Redis', async () => {
		const r = makeFakeRedis()
		await seedDefaultAliases(r)
		// Sanity floor: at least 10 alias entries plus the sentinel.
		expect(Object.keys(DEFAULT_ALIASES).length).toBeGreaterThanOrEqual(10)
		for (const [alias, target] of Object.entries(DEFAULT_ALIASES)) {
			expect(r.store.get(`livinity:broker:alias:${alias}`)).toBe(target)
		}
	})

	it('gpt-4 maps to claude-sonnet-4-6 (NOT claude-opus-4-7) — RESEARCH.md A2 override', () => {
		// CONTEXT.md said gpt-4 → claude-opus-4-7 (3-5x cost upgrade).
		// RESEARCH.md A2 + planning_context override defaults to Sonnet to
		// preserve existing openai-translator.ts:60-67 behaviour. Admin can
		// opt into Opus via `redis-cli SET livinity:broker:alias:gpt-4 claude-opus-4-7`.
		expect(DEFAULT_ALIASES['gpt-4']).toBe('claude-sonnet-4-6')
	})

	it('SETNX preserves admin runtime edits (existing key NOT overwritten)', async () => {
		const r = makeFakeRedis()
		r.store.set('livinity:broker:alias:opus', 'claude-opus-4-CUSTOM-ADMIN')
		await seedDefaultAliases(r)
		// The admin-edited key MUST be preserved.
		expect(r.store.get('livinity:broker:alias:opus')).toBe('claude-opus-4-CUSTOM-ADMIN')
		// Other (non-pre-populated) keys ARE seeded.
		expect(r.store.get('livinity:broker:alias:sonnet')).toBe('claude-sonnet-4-6')
	})

	it('sentinel key is overwritten on every seed (always SET, not SETNX)', async () => {
		const r = makeFakeRedis()
		r.store.set('livinity:broker:alias:_meta:lastSeedAt', '2020-01-01T00:00:00.000Z')
		const before = Date.now()
		await seedDefaultAliases(r)
		const after = Date.now()
		const sentinel = r.store.get('livinity:broker:alias:_meta:lastSeedAt')
		expect(sentinel).toBeDefined()
		const ts = Date.parse(sentinel!)
		expect(ts).toBeGreaterThanOrEqual(before)
		// Allow 1s slack for clock skew on slow CI.
		expect(ts).toBeLessThanOrEqual(after + 1_000)
	})

	it('falls back to get-then-set when setnx is unavailable (legacy redis client)', async () => {
		const r = makeFakeRedis({withSetnx: false})
		r.store.set('livinity:broker:alias:opus', 'claude-opus-4-CUSTOM')
		await seedDefaultAliases(r)
		// Existing key still preserved via the get-then-set-if-null fallback path.
		expect(r.store.get('livinity:broker:alias:opus')).toBe('claude-opus-4-CUSTOM')
		// Newly-seeded key still landed.
		expect(r.store.get('livinity:broker:alias:sonnet')).toBe('claude-sonnet-4-6')
	})
})
