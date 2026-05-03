// Phase 61 Plan 03 D1 — Boot-time seed for default broker model aliases.
//
// Mirrors Phase 50's seed-builtin-tools.ts pattern but uses SETNX
// (set-if-not-exists) so admin runtime updates via `redis-cli SET` survive
// livinityd restart (FR-BROKER-D1-02). Sentinel key uses unconditional SET
// because it's purely diagnostic.
//
// gpt-4 → claude-sonnet-4-6 mapping (NOT Opus) is intentional — preserves
// existing openai-translator.ts:60-67 behaviour and avoids a 3-5x cost
// regression on existing Bolt.diy/Open WebUI traffic. CONTEXT.md suggested
// Opus; RESEARCH.md A2 flagged this as a behavioral change; planner override
// per phase_specific_guidance defaults to Sonnet. Admin can opt into Opus via:
//   redis-cli SET livinity:broker:alias:gpt-4 claude-opus-4-7

/**
 * Minimal Redis interface for the seeder. `setnx` is optional — when absent,
 * the seeder falls back to a get-then-set-if-null path (preserves the
 * "don't overwrite admin edits" semantic without requiring SETNX support).
 */
export interface SeedRedisLike {
	get(key: string): Promise<string | null>
	set(key: string, value: string): Promise<unknown>
	setnx?(key: string, value: string): Promise<number>
}

const ALIAS_PREFIX = 'livinity:broker:alias:'
const SENTINEL_KEY = `${ALIAS_PREFIX}_meta:lastSeedAt`

/**
 * Default alias table — seeded once on first boot via SETNX. Admin can
 * runtime-edit any entry via `redis-cli SET livinity:broker:alias:<alias> <model>`
 * and the change survives reboot.
 *
 * Verified Claude family model IDs (RESEARCH.md):
 *   - claude-opus-4-7              (alias-only, no dated form)
 *   - claude-sonnet-4-6            (alias-only)
 *   - claude-haiku-4-5-20251001    (canonical dated form per RESEARCH.md)
 */
export const DEFAULT_ALIASES: Record<string, string> = {
	// Friendly short aliases (Phase 42.2 → Phase 61 carry-forward)
	opus: 'claude-opus-4-7',
	sonnet: 'claude-sonnet-4-6',
	haiku: 'claude-haiku-4-5-20251001',
	// Legacy claude-3-* compatibility
	'claude-3-opus': 'claude-opus-4-7',
	'claude-3-sonnet': 'claude-sonnet-4-6',
	'claude-3-haiku': 'claude-haiku-4-5-20251001',
	// OpenAI tier mapping — RESEARCH.md A2 override: ALL gpt-* → Sonnet
	// (preserves existing openai-translator.ts:60-67 behaviour; avoids 3-5x
	// cost regression on existing gpt-4 traffic).
	'gpt-4': 'claude-sonnet-4-6',
	'gpt-4o': 'claude-sonnet-4-6',
	'gpt-3.5-turbo': 'claude-haiku-4-5-20251001',
	// Fallback default — resolver returns this for unknown models.
	default: 'claude-sonnet-4-6',
}

/**
 * Boot-time seed. Idempotent across restarts:
 *   - Each alias key uses SETNX (or get-then-set-if-null fallback) so admin
 *     runtime edits via `redis-cli SET` are preserved across livinityd reboot.
 *   - Sentinel key uses unconditional SET — purely diagnostic timestamp of
 *     the most recent seed attempt.
 *
 * Non-throwing on individual key failure — caller (livinityd index.ts)
 * already wraps the entire call in try/catch with non-fatal log.
 */
export async function seedDefaultAliases(redis: SeedRedisLike): Promise<void> {
	for (const [alias, target] of Object.entries(DEFAULT_ALIASES)) {
		const key = `${ALIAS_PREFIX}${alias}`
		if (typeof redis.setnx === 'function') {
			// Atomic set-if-not-exists; preserves admin runtime edits.
			await redis.setnx(key, target)
		} else {
			// Fallback when ioredis lacks setnx (legacy mocks / non-ioredis clients).
			const existing = await redis.get(key)
			if (existing === null) await redis.set(key, target)
		}
	}
	// Sentinel always overwrites — diagnostic only.
	await redis.set(SENTINEL_KEY, new Date().toISOString())
}
