/**
 * Phase 182-03 — cc-pty-config-router.test.ts
 *
 * Source-text invariant suite (vitest). Locks the router's shape:
 *   - 3 procedures all adminProcedure-gated
 *   - getConfig reads 7 Redis keys with fallback defaults
 *   - setConfig accepts partial schema, writes only provided keys
 *   - validatePaths checks filesystem existence + writable, blocks '..' traversal
 *   - All 3 paths in httpOnlyPaths
 *   - ccPty namespace in createAppRouter
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const SRC = readFileSync(resolve(__dirname, 'cc-pty-config-router.ts'), 'utf8')
const COMMON_SRC = readFileSync(resolve(__dirname, 'common.ts'), 'utf8')
const INDEX_SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

describe('cc-pty-config-router — Phase 182-03 source-text invariants', () => {
	// P1 — procedure names ─────────────────────────────────────────────────────
	it('P1: source contains all 3 procedure names (getConfig, setConfig, validatePaths)', () => {
		expect(SRC).toMatch(/getConfig:\s*adminProcedure/)
		expect(SRC).toMatch(/setConfig:\s*adminProcedure/)
		expect(SRC).toMatch(/validatePaths:\s*adminProcedure/)
	})

	// P2 — adminProcedure count ────────────────────────────────────────────────
	it('P2: every procedure uses adminProcedure (>=3 occurrences)', () => {
		const matches = SRC.match(/adminProcedure/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(3)
	})

	// P3 — Redis prefix ────────────────────────────────────────────────────────
	it('P3: Redis key prefix is liv:config:cc_pty_', () => {
		expect(SRC).toMatch(/liv:config:cc_pty_/)
	})

	// P4 — getConfig defaults ──────────────────────────────────────────────────
	it('P4: getConfig has 7 default values defined in DEFAULTS object', () => {
		expect(SRC).toMatch(/skip_perms:\s*true/)
		expect(SRC).toMatch(/default_cwd:\s*['"]\/home\/bruce\/liv['"]/)
		expect(SRC).toMatch(/idle_h:\s*24/)
		expect(SRC).toMatch(/max_sessions:\s*10/)
		expect(SRC).toMatch(/allowed_paths:/)
		expect(SRC).toMatch(/force_terminal_phone:\s*false/)
		expect(SRC).toMatch(/default_model:\s*['"]claude-opus-4-7['"]/)
	})

	// P5 — setConfig partial schema ────────────────────────────────────────────
	it('P5: setConfig uses ccPtyConfigSchema.partial() for input', () => {
		expect(SRC).toMatch(/ccPtyConfigSchema\.partial\(\)/)
	})

	// P6 — setConfig idle_h range validation ───────────────────────────────────
	it('P6: ccPtyConfigSchema validates idle_h with min(1).max(168)', () => {
		expect(SRC).toMatch(/idle_h:\s*z\.number\(\)[\s\S]{0,100}\.min\(1\)[\s\S]{0,100}\.max\(168\)/)
	})

	// P7 — setConfig max_sessions range ────────────────────────────────────────
	it('P7: ccPtyConfigSchema validates max_sessions with min(1).max(50)', () => {
		expect(SRC).toMatch(/max_sessions:\s*z\.number\(\)[\s\S]{0,100}\.min\(1\)[\s\S]{0,100}\.max\(50\)/)
	})

	// P8 — model enum ──────────────────────────────────────────────────────────
	it('P8: ccPtyConfigSchema contains all 3 model literals', () => {
		expect(SRC).toMatch(/claude-opus-4-7/)
		expect(SRC).toMatch(/claude-sonnet-4-6/)
		expect(SRC).toMatch(/claude-haiku-4-5-20251001/)
	})

	// P9 — validatePaths path traversal guard ──────────────────────────────────
	it('P9: validatePaths rejects paths containing ".."', () => {
		expect(SRC).toMatch(/p\.includes\(['"]\.\.['"]/)
	})

	// P10 — validatePaths fs.access ────────────────────────────────────────────
	it('P10: validatePaths uses fs.access with F_OK and W_OK constants', () => {
		expect(SRC).toMatch(/fs\.constants\.F_OK/)
		expect(SRC).toMatch(/fs\.constants\.W_OK/)
	})

	// P11 — pipeline batch write ───────────────────────────────────────────────
	it('P11: setConfig uses redis.pipeline() for batch writes', () => {
		expect(SRC).toMatch(/redis\.pipeline\(\)/)
	})

	// P12 — setConfig empty input guard ───────────────────────────────────────
	it('P12: setConfig only calls pipeline when writes.length > 0', () => {
		expect(SRC).toMatch(/writes\.length\s*>\s*0/)
	})

	// P13 — ccPtyConfigSchema exported ────────────────────────────────────────
	it('P13: ccPtyConfigSchema is exported', () => {
		expect(SRC).toMatch(/export\s+const\s+ccPtyConfigSchema/)
	})

	// P14 — export default ccPtyConfigRouter ──────────────────────────────────
	it('P14: router is exported as default', () => {
		expect(SRC).toMatch(/export\s+default\s+ccPtyConfigRouter/)
	})
})

describe('cc-pty-config-router — common.ts httpOnlyPaths registration', () => {
	it('H1: common.ts contains ccPty.getConfig path', () => {
		expect(COMMON_SRC).toMatch(/'ccPty\.getConfig'/)
	})
	it('H2: common.ts contains ccPty.setConfig path', () => {
		expect(COMMON_SRC).toMatch(/'ccPty\.setConfig'/)
	})
	it('H3: common.ts contains ccPty.validatePaths path', () => {
		expect(COMMON_SRC).toMatch(/'ccPty\.validatePaths'/)
	})
})

describe('cc-pty-config-router — createAppRouter slot', () => {
	it('I1: index.ts contains ccPty: ccPtyConfigRouter slot', () => {
		expect(INDEX_SRC).toMatch(/ccPty:\s*ccPtyConfigRouter/)
	})
	it('I2: ccPtyConfigRouter imported at top of index.ts', () => {
		expect(INDEX_SRC).toMatch(
			/import\s+ccPtyConfigRouter\s+from\s+['"]\.\/cc-pty-config-router\.js['"]/,
		)
	})
})
