// Phase 290 R3 (REQ2) — normalizeAptInput unit tests.
//
// Guards the contract the Add Shortcut → Native "Install via apt" field relies
// on: a pasted full command OR a bare package name both reduce to the SINGLE
// first package token (the server `installFromHost({pkg})` rejects spaces).

import {describe, expect, it} from 'vitest'

import {normalizeAptInput} from './apt-input'

describe('normalizeAptInput', () => {
	it('passes a bare package name through unchanged', () => {
		expect(normalizeAptInput('gimp')).toBe('gimp')
	})

	it('strips a "sudo apt install" wrapper', () => {
		expect(normalizeAptInput('sudo apt install gimp')).toBe('gimp')
	})

	it('strips "apt-get install -y"', () => {
		expect(normalizeAptInput('apt-get install -y gimp')).toBe('gimp')
	})

	it('returns only the first token for multi-word input', () => {
		expect(normalizeAptInput('foo bar baz')).toBe('foo')
	})

	it('trims surrounding whitespace', () => {
		expect(normalizeAptInput('   gimp   ')).toBe('gimp')
	})

	it('drops common flags before the package', () => {
		expect(normalizeAptInput('apt install --no-install-recommends -q gimp')).toBe('gimp')
	})

	it('returns an empty string for blank input', () => {
		expect(normalizeAptInput('')).toBe('')
		expect(normalizeAptInput('   ')).toBe('')
	})
})
