/**
 * Phase 169-01 — parser.ts unit tests (8 assertions).
 *
 * Pure: no fs, no network. Verifies frontmatter parsing, malformed-YAML
 * graceful handling, custom-tag rejection (CORE_SCHEMA enforcement), and
 * wikilink extraction including alias stripping + multi-match.
 */

import {describe, it, expect} from 'vitest'

import {parseFrontmatter, extractWikilinks} from './parser.js'

describe('parseFrontmatter', () => {
	it('parses basic frontmatter and separates body', () => {
		const result = parseFrontmatter('---\nfoo: bar\n---\nbody')
		expect(result.frontmatter).toEqual({foo: 'bar'})
		expect(result.body).toBe('body')
	})

	it('returns undefined frontmatter when no fence present', () => {
		const result = parseFrontmatter('no frontmatter')
		expect(result.frontmatter).toBeUndefined()
		expect(result.body).toBe('no frontmatter')
	})

	it('gracefully recovers from malformed YAML', () => {
		const result = parseFrontmatter('---\n: malformed yaml :\n---\nbody')
		expect(result.frontmatter).toBeUndefined()
		expect(result.body).toBe('body')
	})

	it('rejects custom !!js/function tag via CORE_SCHEMA (no execution)', () => {
		// CORE_SCHEMA does not include !!js/function — js-yaml throws,
		// parseFrontmatter swallows the throw and returns undefined frontmatter.
		const malicious =
			"---\nevil: !!js/function 'function () { return 42; }'\n---\nbody"
		const result = parseFrontmatter(malicious)
		expect(result.frontmatter).toBeUndefined()
		expect(result.body).toBe('body')
	})
})

describe('extractWikilinks', () => {
	it('extracts a single bare wikilink target', () => {
		expect(extractWikilinks('see [[target]]')).toEqual(['target'])
	})

	it('drops the |alias portion of a piped wikilink', () => {
		expect(extractWikilinks('see [[target|display name]]')).toEqual(['target'])
	})

	it('extracts multiple wikilinks in one body', () => {
		expect(extractWikilinks('see [[a]] and [[b]] and [[c]]')).toEqual([
			'a',
			'b',
			'c',
		])
	})

	it('returns empty array when no wikilinks present', () => {
		expect(extractWikilinks('no links here')).toEqual([])
	})
})
