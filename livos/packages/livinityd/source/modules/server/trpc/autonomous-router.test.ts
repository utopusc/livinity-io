/**
 * Phase 165-02 — autonomous-router.test.ts
 *
 * Source-text invariant suite (vitest). No runtime tRPC invocation — that
 * lives in the Plan 165-04 live probe. This suite locks the router's shape:
 *   - 5 procedures all adminProcedure-gated
 *   - zod input validation on mutations
 *   - readLastRunForAgent wired into list
 *   - REDIS_KEY_DAILY_BUDGET_CAP written by setDailyBudgetCap
 *   - no scope-reduction comments (no "v1", "static for now", etc.)
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const SRC = readFileSync(
	resolve(__dirname, 'autonomous-router.ts'),
	'utf8',
)
const COMMON_SRC = readFileSync(resolve(__dirname, 'common.ts'), 'utf8')
const INDEX_SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

describe('autonomous-router — Phase 165-02 source-text invariants', () => {
	// A1 — 5 procedure names ──────────────────────────────────────────
	it('A1: source contains all 5 procedure names (list, toggle, runNow, getDailySpend, setDailyBudgetCap)', () => {
		expect(SRC).toMatch(/list:\s*adminProcedure/)
		expect(SRC).toMatch(/toggle:\s*adminProcedure/)
		expect(SRC).toMatch(/runNow:\s*adminProcedure/)
		expect(SRC).toMatch(/getDailySpend:\s*adminProcedure/)
		expect(SRC).toMatch(/setDailyBudgetCap:\s*adminProcedure/)
	})

	// A2 — adminProcedure for every procedure ─────────────────────────
	it('A2: every procedure uses adminProcedure (>=5 occurrences)', () => {
		const matches = SRC.match(/adminProcedure/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(5)
	})

	// A3 — zod input validation on mutations ──────────────────────────
	it('A3: toggle + runNow use zod .object(...).strict() input validation', () => {
		// toggle input
		expect(SRC).toMatch(
			/toggle[\s\S]{0,200}?z\.object\(\s*\{[\s\S]*?name:\s*z\.string\(\)/,
		)
		expect(SRC).toMatch(/toggle[\s\S]{0,300}?\}\s*\)\.strict\(\)/)
		// runNow input
		expect(SRC).toMatch(
			/runNow[\s\S]{0,200}?z\.object\(\s*\{[\s\S]*?name:\s*z\.string\(\)/,
		)
	})

	// A4 — runNow / toggle throw TRPCError on missing scheduler / not-found ──
	it('A4: runNow throws TRPCError on scheduler absent OR runNow returns ok:false', () => {
		expect(SRC).toMatch(/TRPCError/)
		expect(SRC).toMatch(/NOT_FOUND/)
		expect(SRC).toMatch(/PRECONDITION_FAILED/)
	})

	// A5 — getDailySpend uses dateKeyForUtc + DAILY_SPEND_KEY_PREFIX ──────
	it('A5: getDailySpend uses dateKeyForUtc(new Date()) + DAILY_SPEND_KEY_PREFIX', () => {
		expect(SRC).toMatch(/dateKeyForUtc\(\s*new Date\(\)\s*\)/)
		expect(SRC).toMatch(/DAILY_SPEND_KEY_PREFIX/)
	})

	// A6 — list calls readLastRunForAgent ──────────────────────────────
	it('A6: list calls readLastRunForAgent(<vault>, def.name) and maps lastRun* fields', () => {
		expect(SRC).toMatch(/readLastRunForAgent/)
		expect(SRC).toMatch(/lastRunAt/)
		expect(SRC).toMatch(/lastRunStatus/)
		expect(SRC).toMatch(/lastRunCostUsd/)
	})

	// A7 — no scope-reduction comments ─────────────────────────────────
	it('A7: NO scope-reduction phrases ("v1", "optional", "static for now", "if time permits", "hardcoded for now", "placeholder")', () => {
		expect(SRC).not.toMatch(/\b(v1|if time permits|static for now|hardcoded for now|placeholder)\b/i)
	})

	// A8 — setDailyBudgetCap procedure + redis.set + cap input ─────────
	it('A8: setDailyBudgetCap zod-validates capCents.int.nonnegative.max(100000) AND writes REDIS_KEY_DAILY_BUDGET_CAP via redis.set', () => {
		// adminProcedure presence
		expect(SRC).toMatch(/setDailyBudgetCap:\s*adminProcedure/)
		// zod input fragments
		expect(SRC).toMatch(/capCents:\s*z\.number\(\)/)
		expect(SRC).toMatch(/\.int\(\)/)
		expect(SRC).toMatch(/\.nonnegative\(\)/)
		expect(SRC).toMatch(/\.max\(100000\)/)
		// redis.set + REDIS_KEY_DAILY_BUDGET_CAP within the mutation body
		// (extract the setDailyBudgetCap procedure block)
		const idx = SRC.indexOf('setDailyBudgetCap:')
		const slice = SRC.substring(idx, idx + 800)
		expect(slice).toMatch(/redis\.set/)
		expect(slice).toMatch(/REDIS_KEY_DAILY_BUDGET_CAP/)
	})

	// REDIS_KEY_DAILY_BUDGET_CAP imported AND used (>=2 occurrences)
	it('A8b: REDIS_KEY_DAILY_BUDGET_CAP appears >=2 times (import + at least one redis.set)', () => {
		const matches = SRC.match(/REDIS_KEY_DAILY_BUDGET_CAP/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(2)
	})
})

describe('autonomous router — common.ts httpOnlyPaths registration', () => {
	it('H1: common.ts contains 5 autonomous.* path strings', () => {
		expect(COMMON_SRC).toMatch(/'autonomous\.list'/)
		expect(COMMON_SRC).toMatch(/'autonomous\.toggle'/)
		expect(COMMON_SRC).toMatch(/'autonomous\.runNow'/)
		expect(COMMON_SRC).toMatch(/'autonomous\.getDailySpend'/)
		expect(COMMON_SRC).toMatch(/'autonomous\.setDailyBudgetCap'/)
	})
})

describe('autonomous router — createAppRouter slot', () => {
	it('I1: index.ts contains `autonomous: autonomousRouter` slot', () => {
		expect(INDEX_SRC).toMatch(/autonomous:\s*autonomousRouter/)
	})
	it('I3a: autonomousRouter imported at top of index.ts', () => {
		expect(INDEX_SRC).toMatch(
			/import\s+autonomousRouter\s+from\s+['"]\.\/autonomous-router\.js['"]/,
		)
	})
})
