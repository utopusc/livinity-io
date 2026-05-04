// @vitest-environment jsdom
//
// LivComposer — Phase 70-01 Task 2 unit tests.
//
// Locked behaviour (CONTEXT D-18..D-21):
//   - shouldShowSlashMenu: starts with `/` and no space yet ⇒ open slash menu.
//   - shouldShowMentionMenu: tail of input is `@xxx` after a space or at start
//     ⇒ open mention menu, with `xxx` as the filter substring.
//   - Mutual exclusion: slash takes priority when value starts with `/`.
//   - calculateTextareaHeight: clamps DOM scrollHeight to [24px, 200px] for
//     auto-grow behaviour.
//
// These tests target the PURE HELPERS exported by `./liv-composer` — RTL
// component-render tests are deferred per the P67-04 pattern (D-NO-NEW-DEPS;
// no `@testing-library/react`/jsdom-binding in this slice). Substantive logic
// is fully covered by exercising the helpers directly.

import {describe, expect, it} from 'vitest'

import {
	calculateTextareaHeight,
	shouldShowMentionMenu,
	shouldShowSlashMenu,
} from './liv-composer'

describe('shouldShowSlashMenu (D-21)', () => {
	it('returns true for value starting with / and no space', () => {
		expect(shouldShowSlashMenu('/cle')).toBe(true)
		expect(shouldShowSlashMenu('/')).toBe(true)
		expect(shouldShowSlashMenu('/clear')).toBe(true)
	})

	it('returns false when slash followed by space', () => {
		expect(shouldShowSlashMenu('/clear ')).toBe(false)
		expect(shouldShowSlashMenu('/clear arg')).toBe(false)
	})

	it('returns false when no slash at start', () => {
		expect(shouldShowSlashMenu('hello')).toBe(false)
		expect(shouldShowSlashMenu(' /clear')).toBe(false)
		expect(shouldShowSlashMenu('')).toBe(false)
	})

	it('returns false when slash mid-string', () => {
		expect(shouldShowSlashMenu('hello/world')).toBe(false)
		expect(shouldShowSlashMenu('a/b')).toBe(false)
	})
})

describe('shouldShowMentionMenu (D-21)', () => {
	it('returns true with empty filter for @ at start', () => {
		expect(shouldShowMentionMenu('@')).toEqual({show: true, filter: ''})
	})

	it('returns true with filter for @xxx at start', () => {
		expect(shouldShowMentionMenu('@al')).toEqual({show: true, filter: 'al'})
		expect(shouldShowMentionMenu('@agent')).toEqual({show: true, filter: 'agent'})
	})

	it('returns true after space + @', () => {
		expect(shouldShowMentionMenu('hello @ag')).toEqual({show: true, filter: 'ag'})
		expect(shouldShowMentionMenu('hello @')).toEqual({show: true, filter: ''})
		expect(shouldShowMentionMenu('one two @bob')).toEqual({show: true, filter: 'bob'})
	})

	it('returns false for @ followed by space', () => {
		expect(shouldShowMentionMenu('@al ')).toEqual({show: false, filter: ''})
		expect(shouldShowMentionMenu('hello @ag ')).toEqual({show: false, filter: ''})
	})

	it('returns false when no @ in tail', () => {
		expect(shouldShowMentionMenu('hello world')).toEqual({show: false, filter: ''})
		expect(shouldShowMentionMenu('')).toEqual({show: false, filter: ''})
		expect(shouldShowMentionMenu('hello @bob and more')).toEqual({show: false, filter: ''})
	})

	it('slash priority — returns false when value starts with /', () => {
		expect(shouldShowMentionMenu('/clear')).toEqual({show: false, filter: ''})
		expect(shouldShowMentionMenu('/')).toEqual({show: false, filter: ''})
		expect(shouldShowMentionMenu('/agent@ag')).toEqual({show: false, filter: ''})
	})
})

describe('calculateTextareaHeight (D-18)', () => {
	it('returns scrollHeight when within bounds', () => {
		expect(calculateTextareaHeight(100)).toBe(100)
		expect(calculateTextareaHeight(50)).toBe(50)
		expect(calculateTextareaHeight(150)).toBe(150)
	})

	it('clamps to MIN_HEIGHT_PX (24) when scrollHeight smaller', () => {
		expect(calculateTextareaHeight(0)).toBe(24)
		expect(calculateTextareaHeight(20)).toBe(24)
		expect(calculateTextareaHeight(-5)).toBe(24)
	})

	it('clamps to MAX_HEIGHT_PX (200) when scrollHeight larger', () => {
		expect(calculateTextareaHeight(300)).toBe(200)
		expect(calculateTextareaHeight(1000)).toBe(200)
		expect(calculateTextareaHeight(201)).toBe(200)
	})

	it('handles boundary cases exactly', () => {
		expect(calculateTextareaHeight(24)).toBe(24)
		expect(calculateTextareaHeight(200)).toBe(200)
	})
})
