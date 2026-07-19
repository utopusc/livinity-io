// Phase 348 (ABUPD-02) — unit tests for the pure manual-rollback helpers.
// The exit-code contract lives in THREE places that must stay in lockstep:
// the emitted livos-manual-rollback.sh (update.sh heredoc), rollbackErrorMessage
// here, and the RollbackConfirmModal copy. These tests pin the TS side.
import {describe, expect, test, vi} from 'vitest'

import {buildManualRollbackArgs, rollbackErrorMessage} from './update.js'

vi.mock('execa')
vi.mock('node:fs/promises')

describe('buildManualRollbackArgs (348)', () => {
	test('withDb=false emits NO argv — the pre-348 invocation stays byte-identical', () => {
		expect(buildManualRollbackArgs(false)).toEqual([])
	})

	test('withDb=true emits exactly the literal --with-db flag', () => {
		expect(buildManualRollbackArgs(true)).toEqual(['--with-db'])
	})
})

describe('rollbackErrorMessage (311-02 contract + 348 exit 4)', () => {
	test('exit 1 → restored-but-not-serving message', () => {
		expect(rollbackErrorMessage(1, 'fb')).toMatch(/did not come back on :8080/)
	})

	test('exit 2 → no-snapshot message (covers the 348 no-DB-dump refusal too)', () => {
		expect(rollbackErrorMessage(2, 'fb')).toMatch(/No last-good snapshot/)
		expect(rollbackErrorMessage(2, 'fb')).toMatch(/database snapshot/)
	})

	test('exit 3 → already-in-progress message', () => {
		expect(rollbackErrorMessage(3, 'fb')).toMatch(/already in progress/)
	})

	test('exit 4 → code rolled back but DB restore did not complete (DB left untouched)', () => {
		const msg = rollbackErrorMessage(4, 'fb')
		expect(msg).toMatch(/database restore did not complete/i)
		expect(msg).toMatch(/left untouched/)
	})

	test('unknown exit → fallback message untouched', () => {
		expect(rollbackErrorMessage(undefined, 'fallback-msg')).toBe('fallback-msg')
		expect(rollbackErrorMessage(99, 'fallback-msg')).toBe('fallback-msg')
	})
})
