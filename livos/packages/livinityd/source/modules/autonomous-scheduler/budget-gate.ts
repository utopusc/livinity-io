// Phase 164-02 Task 1 — Atomic Redis budget-gate helpers for the autonomous
// scheduler.
//
// Two independent gates are enforced before every autonomous spawn:
//
//   1. CONCURRENT CAP — `liv:autonomous:active_count` must stay ≤
//      `liv:config:autonomous_max_concurrent` (default 3). Enforced via
//      Redis MULTI/EXEC INCR + GET; on overflow we DECR-rollback so the
//      counter is byte-identical to the pre-call value.
//
//      Why MULTI/EXEC and not GET-then-INCR? Two cron ticks racing the
//      naive check both see active=2, both proceed, both INCR to 4 → cap
//      bypassed. INCR-then-check inside a single MULTI/EXEC is atomic
//      because Redis is single-threaded — only one writer can land the
//      newCount==cap+1 result, and that writer rolls back via DECR.
//
//   2. DAILY SPEND CAP — `liv:autonomous:daily_spend_cents:<YYYY-MM-DD>`
//      must stay < `liv:config:autonomous_daily_budget` (default 5000c =
//      $50). This is a pure GET-vs-GET comparison (no Redis writes) so it
//      can race-free — a stale read at the moment of check just means one
//      more agent slips through before the next cron tick reads the
//      incremented value. Cost-bounded, acceptable per
//      T-164-02-02 mitigation.
//
// `decrementConcurrent` uses a single-key Lua eval to FLOOR-AT-ZERO,
// defending against a double-decrement bug elsewhere in scheduler.ts (a
// try/finally + a manual decrement after error would otherwise drive
// active_count into the negatives, breaking the cap check forever).
//
// `incrementDailySpend` always re-applies the 48h TTL so the key cannot
// outlive its date window even if a long-running boot mutates it across
// midnight UTC.
//
// All helpers are pure Redis + arithmetic — no SDK imports, no node-cron,
// no inbox writeback. They're the lowest-level primitive in the autonomous
// stack and are unit-tested in budget-gate.test.ts.

import type {Redis} from 'ioredis'

// ─── Constants ────────────────────────────────────────────────────────────

const REDIS_KEY_ACTIVE = 'liv:autonomous:active_count'
const REDIS_KEY_CONCURRENT_CAP = 'liv:config:autonomous_max_concurrent'
const REDIS_KEY_DAILY_BUDGET_CAP = 'liv:config:autonomous_daily_budget'
const DAILY_SPEND_KEY_PREFIX = 'liv:autonomous:daily_spend_cents:'

// Defaults per ROADMAP defaults block (164-CONTEXT.md decisions D-V34-G).
const DEFAULT_CONCURRENT_CAP = 3
const DEFAULT_DAILY_BUDGET_CENTS = 5000
const DAILY_SPEND_TTL_SECONDS = 86_400 * 2 // 48h — survives a missed midnight rollover

// ─── Public types ────────────────────────────────────────────────────────

export interface ConcurrentGateResult {
	allowed: boolean
	reason?: string
	currentCount?: number
	cap?: number
}

export interface DailyBudgetGateResult {
	allowed: boolean
	currentCents: number
	capCents: number
	reason?: string
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Atomically attempt to take one slot in the autonomous concurrent pool.
 *
 * Implementation: a single MULTI/EXEC batches `INCR active_count` and
 * `GET cap_key`. If `newCount > cap` we DECR-rollback and return
 * `{allowed: false}`. Because Redis executes the MULTI/EXEC block
 * atomically, two concurrent ticks cannot both observe `newCount <= cap`
 * and both proceed.
 *
 * Defaults: cap = `DEFAULT_CONCURRENT_CAP` (3) when the config key is
 * unset.
 */
export async function checkAndIncrementConcurrent(
	redis: Redis,
): Promise<ConcurrentGateResult> {
	const results = await redis
		.multi()
		.incr(REDIS_KEY_ACTIVE)
		.get(REDIS_KEY_CONCURRENT_CAP)
		.exec()

	// results: Array<[Error|null, any]> — narrow defensively because
	// `redis.multi().exec()` can technically return null if the
	// transaction is discarded (WATCH conflict). We treat that as a
	// fail-closed gate to be safe.
	if (!results) {
		return {
			allowed: false,
			reason: 'redis multi/exec returned null (transaction discarded)',
		}
	}

	const newCount = Number((results[0]?.[1] as any) ?? 0)
	const capStr = (results[1]?.[1] as any) as string | null
	const cap = Number(capStr ?? DEFAULT_CONCURRENT_CAP)

	if (newCount > cap) {
		// Rollback — restore the counter to its pre-INCR value so a
		// subsequent legitimate tick can still take its slot.
		await redis.decr(REDIS_KEY_ACTIVE)
		return {
			allowed: false,
			reason: `concurrent cap ${cap} exceeded`,
			currentCount: cap,
			cap,
		}
	}

	return {allowed: true, currentCount: newCount, cap}
}

/**
 * Release a slot in the autonomous concurrent pool. Uses a Lua eval to
 * FLOOR-AT-ZERO so a buggy double-call cannot drive the counter into the
 * negatives (which would otherwise mask the cap check forever after).
 *
 * Safe to call from a try/finally block; safe to call when the counter
 * is already 0 (no-op).
 */
export async function decrementConcurrent(redis: Redis): Promise<void> {
	// Floor-at-zero via Lua eval to defend against double-decrement and to
	// keep the decrement atomic on the Redis side (no read-then-write race
	// window).
	const script = `
		local v = tonumber(redis.call('get', KEYS[1]) or '0')
		if v <= 0 then
			redis.call('set', KEYS[1], '0')
			return 0
		end
		return redis.call('decr', KEYS[1])
	`
	await redis.eval(script, 1, REDIS_KEY_ACTIVE)
}

/**
 * Read the daily spend counter and compare against the configured cap.
 * Pure GET-vs-GET — never writes. Returns the snapshot the caller can
 * forward to logs / inbox writeback diagnostics.
 *
 * Defaults: cap = `DEFAULT_DAILY_BUDGET_CENTS` (5000 = $50) when the
 * config key is unset.
 */
export async function checkDailyBudget(
	redis: Redis,
	dateKey: string,
): Promise<DailyBudgetGateResult> {
	const [currentStr, capStr] = await Promise.all([
		redis.get(`${DAILY_SPEND_KEY_PREFIX}${dateKey}`),
		redis.get(REDIS_KEY_DAILY_BUDGET_CAP),
	])
	const currentCents = Number(currentStr ?? 0)
	const capCents = Number(capStr ?? DEFAULT_DAILY_BUDGET_CENTS)
	if (currentCents >= capCents) {
		return {
			allowed: false,
			currentCents,
			capCents,
			reason: `daily budget cap ${capCents}c reached (current=${currentCents}c)`,
		}
	}
	return {allowed: true, currentCents, capCents}
}

/**
 * Add to the daily spend counter and (re-)apply the 48h TTL.
 *
 * `amountCents` is rounded to the nearest integer because Redis INCRBY
 * does not accept fractions and the SDK reports cost in dollars (float)
 * which we convert via `Math.round(usd * 100)` at the call site.
 *
 * Both INCRBY and EXPIRE are batched inside a single MULTI/EXEC so a
 * partial write cannot leave the counter incremented without its TTL
 * (which would otherwise allow the key to leak past its date window
 * forever).
 */
export async function incrementDailySpend(
	redis: Redis,
	dateKey: string,
	amountCents: number,
): Promise<void> {
	const key = `${DAILY_SPEND_KEY_PREFIX}${dateKey}`
	await redis
		.multi()
		.incrby(key, Math.round(amountCents))
		.expire(key, DAILY_SPEND_TTL_SECONDS)
		.exec()
}

/**
 * Derive the daily-spend-counter date key for a Date in UTC. UTC is
 * deliberate — autonomous runs span timezones and we want the spend
 * window to align with the cron expression, which is also evaluated in
 * UTC by node-cron.
 *
 * Returns `YYYY-MM-DD`, e.g. `2026-05-20`.
 */
export function dateKeyForUtc(d: Date): string {
	return d.toISOString().slice(0, 10)
}
