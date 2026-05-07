// Phase 92-05 — favicon-resolver.ts unit tests.
//
// Coverage: explicit rel=icon wins, apple-touch fallback, shortcut-icon
// fallback, /favicon.ico fallback, relative-href resolution against
// post-redirect base, sizes tie-breaker (numeric + 'any' + missing).

import {describe, expect, test} from 'vitest'

import {resolveFavicon} from './favicon-resolver.js'
import type {FaviconCandidate} from './html-parser.js'

const baseUrl = new URL('https://example.com/sub/page?x=1')

describe('resolveFavicon — precedence chain', () => {
	test('rel=icon wins over apple-touch-icon and shortcut icon', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'shortcut icon', href: '/short.ico'},
			{rel: 'apple-touch-icon', href: '/apple.png'},
			{rel: 'icon', href: '/icon.png'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/icon.png')
	})

	test('falls back to apple-touch-icon when rel=icon absent', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'shortcut icon', href: '/short.ico'},
			{rel: 'apple-touch-icon', href: '/apple.png'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/apple.png')
	})

	test('falls back to shortcut icon when icon + apple-touch absent', () => {
		const candidates: FaviconCandidate[] = [{rel: 'shortcut icon', href: '/short.ico'}]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/short.ico')
	})

	test('falls back to /favicon.ico when no candidates', () => {
		expect(resolveFavicon([], baseUrl)).toBe('https://example.com/favicon.ico')
	})
})

describe('resolveFavicon — relative href resolution', () => {
	test('resolves root-relative href against base origin', () => {
		const candidates: FaviconCandidate[] = [{rel: 'icon', href: '/static/icon.png'}]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/static/icon.png')
	})

	test('resolves doc-relative href against base path', () => {
		const candidates: FaviconCandidate[] = [{rel: 'icon', href: 'icon.png'}]
		// baseUrl path is /sub/page → 'icon.png' resolves to /sub/icon.png
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/sub/icon.png')
	})

	test('preserves absolute href verbatim', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'icon', href: 'https://cdn.example.org/static/icon.png'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://cdn.example.org/static/icon.png')
	})

	test('protocol-relative href inherits base scheme', () => {
		const candidates: FaviconCandidate[] = [{rel: 'icon', href: '//cdn.example.org/icon.png'}]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://cdn.example.org/icon.png')
	})
})

describe('resolveFavicon — sizes tie-breaker', () => {
	test('larger sizes wins within a tier (192 > 32)', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'icon', href: '/icon-32.png', sizes: '32x32'},
			{rel: 'icon', href: '/icon-192.png', sizes: '192x192'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/icon-192.png')
	})

	test('sizes="any" beats finite numeric (SVG-scaling convention)', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'icon', href: '/icon-192.png', sizes: '192x192'},
			{rel: 'icon', href: '/icon.svg', sizes: 'any'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/icon.svg')
	})

	test('candidate WITH sizes beats candidate WITHOUT in the same tier', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'icon', href: '/no-size.png'},
			{rel: 'icon', href: '/sized.png', sizes: '32x32'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/sized.png')
	})

	test('parses space-separated sizes list and takes the largest entry', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'icon', href: '/multi.png', sizes: '16x16 32x32 64x64'},
			{rel: 'icon', href: '/single-48.png', sizes: '48x48'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/multi.png')
	})

	test('cross-tier: rel=icon WITHOUT sizes still beats apple-touch WITH sizes', () => {
		const candidates: FaviconCandidate[] = [
			{rel: 'apple-touch-icon', href: '/apple-192.png', sizes: '192x192'},
			{rel: 'icon', href: '/icon.png'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/icon.png')
	})
})

describe('resolveFavicon — output shape', () => {
	test('returned URL is absolute (scheme + host + path)', () => {
		const result = resolveFavicon([{rel: 'icon', href: '/x.ico'}], baseUrl)
		const parsed = new URL(result)
		expect(parsed.protocol).toBe('https:')
		expect(parsed.host).toBe('example.com')
		expect(parsed.pathname).toBe('/x.ico')
	})

	test('falls through truly malformed (throwing) href to next tier', () => {
		// `http://[invalid-ipv6` throws on URL construction; resolver should
		// skip and fall back. Most relative-href shapes are forgiving (the
		// URL constructor concatenates them as paths) so we use an absolute
		// shape that cannot parse.
		const candidates: FaviconCandidate[] = [
			{rel: 'icon', href: 'http://[invalid-ipv6'},
			{rel: 'apple-touch-icon', href: '/apple.png'},
		]
		expect(resolveFavicon(candidates, baseUrl)).toBe('https://example.com/apple.png')
	})
})
