/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {redactedPreview, REDIS_KEY_API_KEY_PATH} from './api-key.js'

function makeFakeRedis(initial: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(initial))
	return {
		async get(k: string) {
			return store.get(k) ?? null
		},
		async set(k: string, v: string) {
			store.set(k, v)
			return 'OK'
		},
	}
}

describe('account/api-key.ts — Phase 104 plan 104-10', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	describe('redactedPreview', () => {
		it('returns prefix + first 6 chars after liv_k_ + ***', () => {
			expect(redactedPreview('liv_k_iCCxIa7vlFgbpOl-fPwd')).toBe('liv_k_iCCxIa***')
		})
		it('flags malformed keys without leaking content', () => {
			expect(redactedPreview('sk-evil-AKIA-12345')).toBe('<malformed>')
		})
		it('never returns more than 6 chars of the secret tail', () => {
			const preview = redactedPreview('liv_k_AAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
			// "liv_k_" (6) + "AAAAAA" (6) + "***" (3) = 15
			expect(preview.length).toBeLessThanOrEqual(15)
		})
	})

	describe('REDIS_KEY_API_KEY_PATH', () => {
		it('is the 104-09-installed Redis key name', () => {
			expect(REDIS_KEY_API_KEY_PATH).toBe('livos:account:api_key_path')
		})
	})

	describe('readApiKey — happy path', () => {
		it('returns {apiKey, path} when Redis points at a valid file', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn().mockResolvedValue('liv_k_iCCxIa7vlFgbpOl-fPwd\n'),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({
				'livos:account:api_key_path': '/etc/livos/secrets/api-key',
			})
			const result = await mod.readApiKey(redis)
			expect(result).not.toBeNull()
			expect(result!.apiKey).toBe('liv_k_iCCxIa7vlFgbpOl-fPwd')
			expect(result!.path).toBe('/etc/livos/secrets/api-key')
		})

		it('trims trailing whitespace/newlines off the file content', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi
					.fn()
					.mockResolvedValue('  liv_k_AAAAAA  \r\n'),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({
				'livos:account:api_key_path': '/etc/livos/secrets/api-key',
			})
			const result = await mod.readApiKey(redis)
			expect(result!.apiKey).toBe('liv_k_AAAAAA')
		})
	})

	describe('readApiKey — null returns', () => {
		it('returns null when Redis key is unset (operator did not pass --api-key)', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn(),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({})
			const result = await mod.readApiKey(redis)
			expect(result).toBeNull()
		})

		it('returns null when the file is missing (ENOENT)', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({
				'livos:account:api_key_path': '/etc/livos/secrets/api-key',
			})
			const result = await mod.readApiKey(redis)
			expect(result).toBeNull()
		})

		it('returns null when the file is empty / whitespace-only', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn().mockResolvedValue('   \n\t\n'),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({
				'livos:account:api_key_path': '/etc/livos/secrets/api-key',
			})
			const result = await mod.readApiKey(redis)
			expect(result).toBeNull()
		})

		it('returns null when the content does NOT start with liv_k_ (malformed)', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn().mockResolvedValue('sk-anthropic-AKIA-12345\n'),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({
				'livos:account:api_key_path': '/etc/livos/secrets/api-key',
			})
			const result = await mod.readApiKey(redis)
			expect(result).toBeNull()
		})

		it('returns null when Redis.get throws (transient error)', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn(),
			}))
			const mod = await import('./api-key.js')
			const flakyRedis: any = {
				get: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
			}
			const result = await mod.readApiKey(flakyRedis)
			expect(result).toBeNull()
		})
	})

	describe('readApiKey — security', () => {
		it('does NOT log the raw key value (redactedPreview is the only public read-side surface)', async () => {
			// The module API never returns "log-format" strings — callers must
			// explicitly call redactedPreview() before logging. This test is a
			// guardrail: assert that the only safe-for-logs export is the
			// preview helper.
			const mod = await import('./api-key.js')
			// Public exports from api-key.ts: readApiKey, redactedPreview,
			// REDIS_KEY_API_KEY_PATH. No raw-key serializer.
			const exports = Object.keys(mod).sort()
			// REDIS_KEY_SOURCE (368.8-19) is a constant SOURCE LABEL, not a key
			// value — it names where a key came from so a log line can say so.
			expect(exports).toEqual(
				['REDIS_KEY_API_KEY_PATH', 'REDIS_KEY_SOURCE', 'readApiKey', 'redactedPreview'].sort(),
			)
		})
	})

	// ───────────────────────────────────────────────────────────────────────
	// Phase 368.8-19 — the heartbeat was dead on any box whose run-user cannot
	// read the key file.
	//
	// Measured on the operator's box: `/etc/livos/secrets/api-key` is root:root
	// 0600 while livinityd runs as `everything` (uid 1001), so `test -r` → NO.
	// The log said "file missing/empty/malformed"; the file was none of those,
	// it was unreadable — and the key was sitting in Redis the whole time
	// (sha256 of both matched exactly).
	// ───────────────────────────────────────────────────────────────────────
	describe('readApiKey — Redis fallback (368.8-19)', () => {
		it('falls back to the Redis key when the file cannot be read', async () => {
			vi.doMock('node:fs/promises', () => ({
				// EACCES is the real failure on the box — not ENOENT.
				readFile: vi.fn().mockRejectedValue(Object.assign(new Error('EACCES'), {code: 'EACCES'})),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({
				'livos:account:api_key_path': '/etc/livos/secrets/api-key',
				'livos:platform:api_key': 'liv_k_iCCxIa7vlFgbpOl-fPwd',
			})
			const result = await mod.readApiKey(redis)
			expect(result).not.toBeNull()
			expect(result!.apiKey).toBe('liv_k_iCCxIa7vlFgbpOl-fPwd')
			// Reports which source answered, so this is diagnosable in the field.
			expect(result!.path).toBe('redis:livos:platform:api_key')
		})

		it('falls back when the path key is unset entirely', async () => {
			vi.doMock('node:fs/promises', () => ({readFile: vi.fn()}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({'livos:platform:api_key': 'liv_k_iCCxIa7vlFgbpOl-fPwd'})
			const result = await mod.readApiKey(redis)
			expect(result!.apiKey).toBe('liv_k_iCCxIa7vlFgbpOl-fPwd')
		})

		it('prefers the file when it IS readable — the fallback never shadows the real source', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn().mockResolvedValue('liv_k_fromTheFileAAAAAAAAA\n'),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({
				'livos:account:api_key_path': '/etc/livos/secrets/api-key',
				'livos:platform:api_key': 'liv_k_fromRedisBBBBBBBBBB',
			})
			const result = await mod.readApiKey(redis)
			expect(result!.apiKey).toBe('liv_k_fromTheFileAAAAAAAAA')
			expect(result!.path).toBe('/etc/livos/secrets/api-key')
		})

		it('refuses a malformed Redis value rather than sending it', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn().mockRejectedValue(new Error('EACCES')),
			}))
			const mod = await import('./api-key.js')
			const redis = makeFakeRedis({'livos:platform:api_key': 'sk-evil-AKIA-12345'})
			expect(await mod.readApiKey(redis)).toBeNull()
		})

		it('returns null when neither source has anything', async () => {
			vi.doMock('node:fs/promises', () => ({
				readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
			}))
			const mod = await import('./api-key.js')
			expect(await mod.readApiKey(makeFakeRedis({}))).toBeNull()
		})
	})
})
