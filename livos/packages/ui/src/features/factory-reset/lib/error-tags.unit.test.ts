// Phase 38 Plan 01 — D-RT-02 error-tag → message mapping tests.
//
// Locks the user-facing strings the failure page renders. Phase 37's bash
// emits exactly these 4 tags + null; the UI must surface each with the spec
// text from `.planning/phases/38-ui-factory-reset/38-CONTEXT.md` D-RT-02.
//
// Hard rule (project memory): no message may mention Server4. Server5 is the
// internal tag name, but the message body refers only to `livinity.io`.

import {describe, expect, it} from 'vitest'

import {mapErrorTagToMessage} from './error-tags'
import type {FactoryResetErrorTag} from './types'

const ALL_TAGS: ReadonlyArray<FactoryResetErrorTag | null> = [
	'api-key-401',
	'server5-unreachable',
	'install-sh-failed',
	'install-sh-unreachable',
	null,
]

describe('mapErrorTagToMessage (D-RT-02 verbatim)', () => {
	it('api-key-401: mentions HTTP 401 + livinity.io re-issue', () => {
		const msg = mapErrorTagToMessage('api-key-401')
		expect(msg).toContain('HTTP 401')
		expect(msg).toContain('livinity.io')
		expect(msg).toContain('re-issue')
	})

	it('server5-unreachable: mentions livinity.io and NEVER Server4 NEVER Server5', () => {
		const msg = mapErrorTagToMessage('server5-unreachable')
		expect(msg).toContain('livinity.io')
		expect(msg).not.toContain('Server4')
		expect(msg).not.toContain('Server5')
	})

	it('install-sh-failed: interpolates exit_code when provided as number', () => {
		expect(mapErrorTagToMessage('install-sh-failed', {install_sh_exit_code: 42})).toContain('42')
	})

	it('install-sh-failed: shows ? when exit_code is null', () => {
		expect(mapErrorTagToMessage('install-sh-failed', {install_sh_exit_code: null})).toContain('?')
	})

	it('install-sh-failed: shows ? when exit_code is undefined', () => {
		expect(mapErrorTagToMessage('install-sh-failed')).toContain('?')
	})

	it('install-sh-unreachable: mentions Manual recovery', () => {
		expect(mapErrorTagToMessage('install-sh-unreachable')).toContain('Manual recovery')
	})

	it('null fallback: returns "unspecified reason" message', () => {
		expect(mapErrorTagToMessage(null)).toContain('unspecified')
	})

	it('every message is a non-empty string', () => {
		for (const tag of ALL_TAGS) {
			const msg = mapErrorTagToMessage(tag)
			expect(typeof msg).toBe('string')
			expect(msg.length).toBeGreaterThan(0)
		}
	})

	it('NO message contains "Server4" string anywhere (memory hard rule)', () => {
		for (const tag of ALL_TAGS) {
			expect(mapErrorTagToMessage(tag)).not.toContain('Server4')
		}
	})
})
