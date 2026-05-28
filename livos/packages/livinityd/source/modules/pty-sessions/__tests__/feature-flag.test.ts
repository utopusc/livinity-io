/**
 * Phase 243-02 Task 1 — feature-flag.test.ts (RED→GREEN)
 *
 * Drift-locks the Redis key string for the terminal-panel feature gate
 * (L-243-D) and enforces default-OFF semantics: only the literal string
 * `'true'` opens the gate. Missing key, `'false'`, `'1'`, `'TRUE'`,
 * `'yes'`, etc — all closed.
 *
 * Test surface deliberately tiny — the module under test is ~8 lines.
 * The value of the tests is in pinning the contract so the WS handler
 * (Task 2) cannot drift from the gate semantics agreed in 243-CONTEXT.
 */

import {describe, expect, test, vi} from 'vitest'

import {
	isTerminalPanelEnabled,
	TERMINAL_PANEL_REDIS_KEY,
} from '../feature-flag.js'

function makeFakeRedis(value: string | null) {
	return {
		get: vi.fn().mockResolvedValue(value),
	}
}

describe('TERMINAL_PANEL_REDIS_KEY — drift-lock (L-243-D)', () => {
	test('exact literal === "livos:v43:terminal_panel"', () => {
		expect(TERMINAL_PANEL_REDIS_KEY).toBe('livos:v43:terminal_panel')
	})
})

describe('isTerminalPanelEnabled', () => {
	test('returns false when redis.get → null (key missing — default OFF)', async () => {
		const redis = makeFakeRedis(null)
		await expect(isTerminalPanelEnabled(redis)).resolves.toBe(false)
		expect(redis.get).toHaveBeenCalledWith('livos:v43:terminal_panel')
	})

	test("returns false when redis.get → 'false' (explicit OFF)", async () => {
		const redis = makeFakeRedis('false')
		await expect(isTerminalPanelEnabled(redis)).resolves.toBe(false)
	})

	test("returns true ONLY when redis.get → 'true' (strict literal match)", async () => {
		const redis = makeFakeRedis('true')
		await expect(isTerminalPanelEnabled(redis)).resolves.toBe(true)
	})
})
