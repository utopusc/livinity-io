// Phase 92-04 — html-parser.ts unit tests.
//
// Three fixture-driven tests cover the rich (github.html), minimal
// (title-only), and empty (no-meta) cases. Plus a focused test for the
// og:description-as-description-fallback gray area #3.

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

import {parseMetadata} from './html-parser.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function fixture(name: string): string {
	return readFileSync(join(__dirname, '__fixtures__', name), 'utf8')
}

const baseUrl = new URL('https://example.com/')

describe('parseMetadata — rich (github.html)', () => {
	test('extracts every metadata field', () => {
		const html = fixture('github.html')
		const result = parseMetadata(html, baseUrl)

		expect(result.title).toBe("GitHub: Let's build from here")
		expect(result.description).toBe(
			'GitHub is where over 100 million developers shape the future of software, together.',
		)
		expect(result.ogImage).toBe(
			'https://github.githubassets.com/images/modules/site/social-cards/campaign-social.png',
		)
		expect(result.faviconCandidates).toHaveLength(4)

		// Order is parser-encountered order — the icon SVG comes first.
		expect(result.faviconCandidates[0]).toEqual({
			rel: 'icon',
			href: '/favicons/favicon.svg',
		})
		expect(result.faviconCandidates[1]).toEqual({
			rel: 'icon',
			href: '/favicons/favicon-32.png',
			sizes: '32x32',
		})
		expect(result.faviconCandidates[2]).toEqual({
			rel: 'apple-touch-icon',
			href: '/apple-touch-icon-192.png',
			sizes: '192x192',
		})
		expect(result.faviconCandidates[3]).toEqual({
			rel: 'shortcut icon',
			href: '/favicon.ico',
		})
	})
})

describe('parseMetadata — minimal (title only)', () => {
	test('extracts title, leaves the rest undefined', () => {
		const html = fixture('minimal.html')
		const result = parseMetadata(html, baseUrl)

		expect(result.title).toBe('Minimal Page') // trimmed
		expect(result.description).toBeUndefined()
		expect(result.ogImage).toBeUndefined()
		expect(result.faviconCandidates).toEqual([])
	})
})

describe('parseMetadata — empty (no-meta)', () => {
	test('returns an empty result object (no title, no candidates)', () => {
		const html = fixture('no-meta.html')
		const result = parseMetadata(html, baseUrl)

		expect(result.title).toBeUndefined()
		expect(result.description).toBeUndefined()
		expect(result.ogImage).toBeUndefined()
		expect(result.faviconCandidates).toEqual([])
	})
})

describe('parseMetadata — og:description fallback', () => {
	test('uses og:description when meta name=description is absent', () => {
		const html = `<!DOCTYPE html><html><head>
			<title>OG Fallback</title>
			<meta property="og:description" content="An OG-only description.">
		</head><body></body></html>`
		const result = parseMetadata(html, baseUrl)
		expect(result.description).toBe('An OG-only description.')
	})

	test('prefers meta name=description over og:description when both present', () => {
		const html = fixture('github.html')
		const result = parseMetadata(html, baseUrl)
		// github.html has both; canonical name= wins (no '(og)' suffix).
		expect(result.description).toBe(
			'GitHub is where over 100 million developers shape the future of software, together.',
		)
	})
})

describe('parseMetadata — robustness', () => {
	test('handles totally malformed HTML without throwing', () => {
		const html = '<title>Broken</title><meta name="description" content="x"><link rel="icon" href="/x">'
		const result = parseMetadata(html, baseUrl)
		expect(result.title).toBe('Broken')
		expect(result.description).toBe('x')
		expect(result.faviconCandidates).toEqual([{rel: 'icon', href: '/x'}])
	})

	test('ignores link[rel] values outside the favicon allowlist', () => {
		const html = `<html><head>
			<link rel="stylesheet" href="/x.css">
			<link rel="canonical" href="https://example.com/">
			<link rel="icon" href="/favicon.ico">
		</head></html>`
		const result = parseMetadata(html, baseUrl)
		expect(result.faviconCandidates).toEqual([{rel: 'icon', href: '/favicon.ico'}])
	})

	test('skips link[rel="icon"] without href', () => {
		const html = `<html><head>
			<link rel="icon">
			<link rel="icon" href="/ok.ico">
		</head></html>`
		const result = parseMetadata(html, baseUrl)
		expect(result.faviconCandidates).toEqual([{rel: 'icon', href: '/ok.ico'}])
	})
})
