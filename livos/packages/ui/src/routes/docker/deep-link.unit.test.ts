// Phase 29 Plan 29-02 — buildDeepLink + parseDeepLink unit tests (DOC-20).
//
// Locks down the URI shape for the docker app deep-link primitive. URIs
// look like `livinity://docker/<section>[/<id>]`. Used by the Copy Deep
// Link button in v28.0; v29.0+ will add a window.location parser
// (programmatic API stays ready).
//
// buildDeepLink cases A-D:
//   A: {section:'containers', id:'n8n'} → 'livinity://docker/containers/n8n'
//   B: {section:'dashboard'} → 'livinity://docker/dashboard'
//   C: special chars in id are uri-encoded
//   D: invalid section throws Error('[invalid-section]')
//
// parseDeepLink cases A-G:
//   A: full URI with id → {section, id}
//   B: section-only URI → {section, id: undefined}
//   C: encoded id round-trips (decoded)
//   D: wrong scheme (http://) → null
//   E: wrong host (livinity://other/foo) → null
//   F: invalid section → null
//   G: empty/undefined → null

import {describe, expect, test} from 'vitest'

import {buildDeepLink, parseDeepLink} from './deep-link.js'

describe('buildDeepLink', () => {
	test("A: {section:'containers', id:'n8n'} → 'livinity://docker/containers/n8n'", () => {
		expect(buildDeepLink({section: 'containers', id: 'n8n'})).toBe(
			'livinity://docker/containers/n8n',
		)
	})

	test("B: {section:'dashboard'} → 'livinity://docker/dashboard'", () => {
		expect(buildDeepLink({section: 'dashboard'})).toBe('livinity://docker/dashboard')
	})

	test('C: special chars in id are uri-encoded', () => {
		expect(buildDeepLink({section: 'containers', id: 'a/b c'})).toBe(
			'livinity://docker/containers/a%2Fb%20c',
		)
	})

	test("D: invalid section throws Error('[invalid-section]')", () => {
		expect(() => buildDeepLink({section: 'not-a-section' as any})).toThrow(/\[invalid-section\]/)
	})
})

describe('parseDeepLink', () => {
	test("A: 'livinity://docker/containers/n8n' → {section, id}", () => {
		expect(parseDeepLink('livinity://docker/containers/n8n')).toEqual({
			section: 'containers',
			id: 'n8n',
		})
	})

	test("B: 'livinity://docker/dashboard' → {section, id: undefined}", () => {
		expect(parseDeepLink('livinity://docker/dashboard')).toEqual({
			section: 'dashboard',
		})
	})

	test('C: encoded id round-trips (decoded)', () => {
		expect(parseDeepLink('livinity://docker/containers/a%2Fb%20c')).toEqual({
			section: 'containers',
			id: 'a/b c',
		})
	})

	test('D: wrong scheme → null', () => {
		expect(parseDeepLink('http://example.com')).toBeNull()
	})

	test('E: wrong host → null', () => {
		expect(parseDeepLink('livinity://other/foo')).toBeNull()
	})

	test('F: invalid section → null', () => {
		expect(parseDeepLink('livinity://docker/notasection')).toBeNull()
	})

	test('G: empty/undefined → null', () => {
		expect(parseDeepLink('')).toBeNull()
		expect(parseDeepLink(null)).toBeNull()
		expect(parseDeepLink(undefined)).toBeNull()
	})

	test('Round-trip: parse(build(x)) === x for all sections', () => {
		const samples = [
			{section: 'containers' as const, id: 'n8n'},
			{section: 'images' as const, id: 'sha256:abc'},
			{section: 'volumes' as const, id: 'data-vol'},
			{section: 'networks' as const, id: 'bridge'},
			{section: 'stacks' as const, id: 'app/v2'},
			{section: 'dashboard' as const},
		]
		for (const s of samples) {
			const round = parseDeepLink(buildDeepLink(s))
			expect(round).toEqual(s.id !== undefined ? s : {section: s.section})
		}
	})
})
