/**
 * Phase 198-06 Task 1 — slash-commands.ts tests (TDD RED → GREEN).
 *
 * Locks the parseSlashCommand contract:
 *
 *   1. parseSlashCommand('/help')           → ParsedSlash for /help
 *   2. parseSlashCommand('/screenshot')     → ParsedSlash for /screenshot
 *   3. parseSlashCommand('/search foo bar') → ParsedSlash for /search w/ rest='foo bar'
 *   4. parseSlashCommand('regular message') → null
 *   5. parseSlashCommand('/unknown')        → null
 *
 * Plus a sanity check that the SLASH_COMMANDS catalog ships the 4
 * locked triggers from the Plan 198-06 must_haves.
 */

import {describe, expect, it} from 'vitest'

import {parseSlashCommand, SLASH_COMMANDS} from './slash-commands'

describe('SLASH_COMMANDS catalog', () => {
	it('ships exactly the 4 locked triggers: /help, /clear, /screenshot, /search', () => {
		const triggers = SLASH_COMMANDS.map((c) => c.trigger).sort()
		expect(triggers).toEqual(['/clear', '/help', '/screenshot', '/search'])
	})
})

describe('parseSlashCommand', () => {
	it('Test 1: /help returns matched command + transformed help text', () => {
		const parsed = parseSlashCommand('/help')
		expect(parsed).not.toBeNull()
		expect(parsed!.command.trigger).toBe('/help')
		expect(typeof parsed!.transformedText).toBe('string')
		expect(parsed!.transformedText).toMatch(/tools|what can you do/i)
	})

	it('Test 2: /screenshot returns matched command + screenshot-prompt text', () => {
		const parsed = parseSlashCommand('/screenshot')
		expect(parsed).not.toBeNull()
		expect(parsed!.command.trigger).toBe('/screenshot')
		expect(parsed!.transformedText).toMatch(/screenshot/i)
	})

	it('Test 3: /search foo bar carries the rest as the query', () => {
		const parsed = parseSlashCommand('/search foo bar')
		expect(parsed).not.toBeNull()
		expect(parsed!.command.trigger).toBe('/search')
		expect(parsed!.transformedText).toMatch(/foo bar/)
	})

	it('Test 4: a regular message (no leading slash) returns null', () => {
		expect(parseSlashCommand('regular message')).toBeNull()
		expect(parseSlashCommand('hello world')).toBeNull()
		expect(parseSlashCommand('')).toBeNull()
	})

	it('Test 5: an unknown /command returns null', () => {
		expect(parseSlashCommand('/unknown')).toBeNull()
		expect(parseSlashCommand('/foo bar')).toBeNull()
	})

	it('Test 6: /clear returns matched command + null transformedText (handled by UI)', () => {
		const parsed = parseSlashCommand('/clear')
		expect(parsed).not.toBeNull()
		expect(parsed!.command.trigger).toBe('/clear')
		// /clear suppresses message send — UI hooks onSwitchToNewThread instead.
		expect(parsed!.transformedText).toBeNull()
	})

	it('Test 7: leading whitespace is tolerated', () => {
		const parsed = parseSlashCommand('   /help   ')
		expect(parsed).not.toBeNull()
		expect(parsed!.command.trigger).toBe('/help')
	})

	it('Test 8: /search with no argument falls back to a clarifying prompt', () => {
		const parsed = parseSlashCommand('/search')
		expect(parsed).not.toBeNull()
		expect(parsed!.command.trigger).toBe('/search')
		expect(typeof parsed!.transformedText).toBe('string')
		expect(parsed!.transformedText!.length).toBeGreaterThan(0)
	})
})
