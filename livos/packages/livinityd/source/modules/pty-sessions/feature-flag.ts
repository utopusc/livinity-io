/**
 * Phase 243-02 Task 1 — terminal-panel feature flag (L-243-D).
 *
 * Redis key `livos:v43:terminal_panel` is the single gate that opens the
 * /livos/terminal/ws endpoint. Default-OFF: only the literal string
 * `'true'` returns enabled. Any other value (including null / missing key
 * / 'false' / '1' / 'TRUE' / 'yes') closes the gate.
 *
 * Drift-lock: `feature-flag.test.ts` case 1 anchors the key string —
 * never change without bumping a Redis migration.
 */

/**
 * Narrow Redis surface — only `get(key)` is used. ioredis satisfies this
 * structurally; tests inject a `{get: vi.fn()}` fake.
 */
export interface TerminalFlagRedisClient {
	get(key: string): Promise<string | null>
}

/** Redis key drift-locked by `feature-flag.test.ts` case 1. */
export const TERMINAL_PANEL_REDIS_KEY = 'livos:v43:terminal_panel' as const

/**
 * Returns `true` ONLY when the Redis key equals the literal string `'true'`.
 * Every other value (missing key, 'false', empty, anything) returns `false`.
 */
export async function isTerminalPanelEnabled(
	redis: TerminalFlagRedisClient,
): Promise<boolean> {
	const value = await redis.get(TERMINAL_PANEL_REDIS_KEY)
	return value === 'true'
}
