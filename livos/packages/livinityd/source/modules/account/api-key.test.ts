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
			expect(exports).toEqual(
				['REDIS_KEY_API_KEY_PATH', 'readApiKey', 'redactedPreview'].sort(),
			)
		})
	})
})
