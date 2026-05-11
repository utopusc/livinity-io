/**
 * Phase 102-06 Task 3 — mcp/server.ts env-read precedence unit tests.
 *
 * Covers the exported `resolveDisplay()` helper (extracted in 102-06 from
 * the inline env-read block in `main()` so the precedence can be unit-tested
 * without booting a stdio MCP server).
 *
 * Precedence under test:
 *   1. LUSE_TARGET_DISPLAY (canonical Phase 102 env — must satisfy
 *      /^:[1-9][0-9]?$/ or it's dropped with a stderr warning).
 *   2. LUSE_DISPLAY (legacy alias from Phase 100-10-03).
 *   3. DISPLAY (system default).
 *   4. undefined when none set.
 *
 * Threat T-102-06 (display env injection): the regex validation step is
 * the pure-function gatekeeper — malformed `LUSE_TARGET_DISPLAY` values
 * (shell-meta, path-traversal, over-99) MUST fall through to the legacy
 * fallback chain rather than be propagated as `defaultDisplay`.
 */

import {describe, it, expect, vi} from 'vitest'
import {resolveDisplay} from './server.js'

describe('resolveDisplay — Phase 102-06 env precedence', () => {
	it('Test 1: LUSE_TARGET_DISPLAY=:10 set → effective display is :10', () => {
		const env: NodeJS.ProcessEnv = {LUSE_TARGET_DISPLAY: ':10'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':10')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 2: only LUSE_DISPLAY=:11 set → effective display is :11', () => {
		const env: NodeJS.ProcessEnv = {LUSE_DISPLAY: ':11'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':11')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 3: only DISPLAY=:12 set → effective display is :12', () => {
		const env: NodeJS.ProcessEnv = {DISPLAY: ':12'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':12')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 4: LUSE_TARGET_DISPLAY=invalid → ignored, falls through to LUSE_DISPLAY (T-102-06 fail-open)', () => {
		const env: NodeJS.ProcessEnv = {
			LUSE_TARGET_DISPLAY: 'invalid; rm -rf /',
			LUSE_DISPLAY: ':5',
		}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':5')
		expect(writeWarn).toHaveBeenCalledOnce()
		expect(writeWarn.mock.calls[0][0]).toMatch(/LUSE_TARGET_DISPLAY/)
		expect(writeWarn.mock.calls[0][0]).toMatch(/does not match/)
	})

	it('Test 4b: LUSE_TARGET_DISPLAY=:100 (over 99) → ignored, falls through (T-102-06 bounds)', () => {
		const env: NodeJS.ProcessEnv = {
			LUSE_TARGET_DISPLAY: ':100',
			DISPLAY: ':0',
		}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':0')
		expect(writeWarn).toHaveBeenCalledOnce()
	})

	it('Test 4c: LUSE_TARGET_DISPLAY=10 (no colon prefix) → ignored, falls through (T-102-06 shape)', () => {
		const env: NodeJS.ProcessEnv = {LUSE_TARGET_DISPLAY: '10'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBeUndefined()
		expect(writeWarn).toHaveBeenCalledOnce()
	})

	it('Test 5: LUSE_TARGET_DISPLAY precedence wins over LUSE_DISPLAY and DISPLAY', () => {
		const env: NodeJS.ProcessEnv = {
			LUSE_TARGET_DISPLAY: ':10',
			LUSE_DISPLAY: ':99',
			DISPLAY: ':0',
		}
		const result = resolveDisplay({env})
		expect(result).toBe(':10')
	})

	it('Test 6: LUSE_DISPLAY precedence wins over DISPLAY when LUSE_TARGET_DISPLAY is unset', () => {
		const env: NodeJS.ProcessEnv = {LUSE_DISPLAY: ':11', DISPLAY: ':0'}
		const result = resolveDisplay({env})
		expect(result).toBe(':11')
	})

	it('Test 7: no env vars set → returns undefined', () => {
		const env: NodeJS.ProcessEnv = {}
		const result = resolveDisplay({env})
		expect(result).toBeUndefined()
	})

	it('Test 8: empty-string LUSE_TARGET_DISPLAY ignored (no warning, falls through silently)', () => {
		const env: NodeJS.ProcessEnv = {LUSE_TARGET_DISPLAY: '', LUSE_DISPLAY: ':5'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':5')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 9: valid :1 (low edge) and :99 (high edge) both accepted', () => {
		expect(resolveDisplay({env: {LUSE_TARGET_DISPLAY: ':1'}})).toBe(':1')
		expect(resolveDisplay({env: {LUSE_TARGET_DISPLAY: ':99'}})).toBe(':99')
	})
})
