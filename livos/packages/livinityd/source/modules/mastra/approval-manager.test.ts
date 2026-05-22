/**
 * Phase 197-05 Plan 05 Task 1 — approval-manager.test.ts + redact-error tests.
 *
 * Coverage (≥9 PASS):
 *   1. registerPending → resolve(true) → Promise resolves to true
 *   2. registerPending → resolve(false) → Promise resolves to false
 *   3. resolve on unknown toolCallId is no-op (no throw)
 *   4. 5-minute timeout auto-rejects (fake timers)
 *   5. cancelAll(runId) resolves all matching pending approvals to false
 *   6. redactError(Error w/ stack) → stack='[redacted]', message preserved
 *   7. redactError preserves .code discriminating literal
 *   8. redactError handles non-Error inputs without throwing
 *   9. ApprovalManager structurally satisfies ApprovalGate interface
 */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ApprovalManager} from './approval-manager.js'
import {redactError} from './redact-error.js'
import type {ApprovalGate} from './agents/wrap-tool-with-approval.js'

describe('ApprovalManager', () => {
	test('Test 1: resolve(true) resolves Promise to true', async () => {
		const m = new ApprovalManager({timeoutMs: 60_000})
		const p = m.registerPending('tc1', 'r1')
		m.resolve('tc1', true)
		await expect(p).resolves.toBe(true)
	})

	test('Test 2: resolve(false) resolves Promise to false', async () => {
		const m = new ApprovalManager({timeoutMs: 60_000})
		const p = m.registerPending('tc2', 'r2')
		m.resolve('tc2', false)
		await expect(p).resolves.toBe(false)
	})

	test('Test 3: resolve on unknown id is no-op', () => {
		const m = new ApprovalManager({timeoutMs: 60_000})
		expect(() => m.resolve('does-not-exist', true)).not.toThrow()
	})

	test('Test 4: 5-minute timeout auto-rejects (fake timers)', async () => {
		vi.useFakeTimers()
		try {
			const m = new ApprovalManager() // default 5*60*1000
			const p = m.registerPending('tc-timeout', 'r-timeout')
			vi.advanceTimersByTime(5 * 60 * 1000 + 1)
			await expect(p).resolves.toBe(false)
		} finally {
			vi.useRealTimers()
		}
	})

	test('Test 5: cancelAll(runId) resolves all matching to false', async () => {
		const m = new ApprovalManager({timeoutMs: 60_000})
		const p1 = m.registerPending('tcA', 'runA')
		const p2 = m.registerPending('tcB', 'runA')
		const p3 = m.registerPending('tcC', 'runB')
		m.cancelAll('runA')
		await expect(p1).resolves.toBe(false)
		await expect(p2).resolves.toBe(false)
		// p3 is still pending — manually resolve to keep test deterministic
		m.resolve('tcC', true)
		await expect(p3).resolves.toBe(true)
	})

	test('Test 9: ApprovalManager structurally satisfies ApprovalGate', () => {
		const gate: ApprovalGate = new ApprovalManager()
		expect(typeof gate.registerPending).toBe('function')
	})
})

describe('redactError', () => {
	test('Test 6: Error w/ stack → stack=[redacted], message preserved', () => {
		const err = new Error('boom')
		err.stack = 'Stack:\n  at /opt/livos/secret/path.ts:42'
		const r = redactError(err)
		expect(r.message).toBe('boom')
		expect(r.stack).toBe('[redacted]')
	})

	test('Test 7: preserves .code discriminating literal', () => {
		const err = new Error('codeable') as Error & {code?: string}
		err.code = 'XAI_NOT_CONNECTED'
		const r = redactError(err)
		expect(r.code).toBe('XAI_NOT_CONNECTED')
	})

	test('Test 8: non-Error inputs do not throw', () => {
		expect(redactError('plain string')).toEqual({
			message: 'plain string',
			stack: '[redacted]',
		})
		expect(redactError(42)).toEqual({message: '42', stack: '[redacted]'})
		expect(redactError(null)).toEqual({message: 'null', stack: '[redacted]'})
	})
})
