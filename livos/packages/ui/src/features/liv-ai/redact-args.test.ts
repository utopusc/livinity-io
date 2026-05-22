/**
 * Phase 197-06 — redact-args.test.ts (T-197-06-03 regression-lock).
 */

import {describe, expect, test} from 'vitest'

import {redactArgsForDisplay} from './redact-args'

describe('redactArgsForDisplay', () => {
	test('scrubs token / key / secret / password / authorization fields', () => {
		expect(
			redactArgsForDisplay({token: 'abc123', prompt: 'hi'}),
		).toEqual({token: '***', prompt: 'hi'})
		expect(redactArgsForDisplay({api_key: 'k'})).toEqual({api_key: '***'})
		expect(redactArgsForDisplay({SECRET: 's'})).toEqual({SECRET: '***'})
		expect(redactArgsForDisplay({password: 'p'})).toEqual({password: '***'})
		expect(redactArgsForDisplay({Authorization: 'Bearer x'})).toEqual({Authorization: '***'})
	})

	test('non-sensitive fields pass through', () => {
		expect(redactArgsForDisplay({x: 1, y: 'two'})).toEqual({x: 1, y: 'two'})
	})

	test('recursive on nested objects', () => {
		expect(
			redactArgsForDisplay({outer: {token: 'abc', name: 'liv'}}),
		).toEqual({outer: {token: '***', name: 'liv'}})
	})

	test('handles arrays', () => {
		expect(redactArgsForDisplay([1, 2, {token: 't'}])).toEqual([1, 2, {token: '***'}])
	})

	test('passes through primitives', () => {
		expect(redactArgsForDisplay('hello')).toBe('hello')
		expect(redactArgsForDisplay(42)).toBe(42)
		expect(redactArgsForDisplay(null)).toBe(null)
	})
})
