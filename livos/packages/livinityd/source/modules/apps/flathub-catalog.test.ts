/**
 * v44.58 r8 — regression lock for the generic app-store (Flathub-backed) catalog
 * helpers in native-routes.ts: the PINNED category label list, the label→slug
 * mapping, the page-clamp, and the hasMore computation. These are PURE — no
 * network, no tRPC context, no spawn.
 *
 * Contract (consumed verbatim by the Add Shortcut "Browse apps" UI):
 *   flathubCategories()                       -> string[] (labels)
 *   flathubBrowse({category?, page?})         -> {apps, hasMore}
 *   flathubSearch({query, page?})             -> {apps, hasMore}
 *
 * The Flathub slugs were verified LIVE (2026-06-20) against
 * /api/v2/collection/category/<slug> (all HTTP 200): Office, Graphics, Game,
 * Development, AudioVideo, Network, Utility, Education, Science, System.
 *
 * The labels are deliberately GENERIC — they MUST NOT leak the words
 * "Flathub" / "Flatpak" / "runtime" to the user (operator refinement).
 */

import {describe, it, expect} from 'vitest'

import {
	FLATHUB_CATEGORIES,
	FLATHUB_PER_PAGE,
	flathubCategoryLabels,
	flathubSlugForLabel,
	flathubHasMore,
	flathubClampPage,
} from './native-routes.js'

describe('flathubCategoryLabels — PINNED contract list', () => {
	it('returns the exact ordered label list (no Flatpak/Flathub/runtime branding)', () => {
		expect(flathubCategoryLabels()).toEqual([
			'Productivity',
			'Graphics & Photography',
			'Games',
			'Developer Tools',
			'Audio & Video',
			'Communication & News',
			'Utilities',
			'Education',
			'Science & Engineering',
			'System',
		])
	})

	it('never surfaces the words Flathub / Flatpak / runtime in any label', () => {
		for (const label of flathubCategoryLabels()) {
			expect(label).not.toMatch(/flathub|flatpak|runtime|freedesktop/i)
		}
	})

	it('maps every label to a verified Flathub MainCategory slug', () => {
		// The 10 live-verified MainCategory slugs.
		const VERIFIED = new Set([
			'Office',
			'Graphics',
			'Game',
			'Development',
			'AudioVideo',
			'Network',
			'Utility',
			'Education',
			'Science',
			'System',
		])
		expect(FLATHUB_CATEGORIES).toHaveLength(10)
		for (const {slug} of FLATHUB_CATEGORIES) {
			expect(VERIFIED.has(slug)).toBe(true)
		}
	})
})

describe('flathubSlugForLabel — label → slug mapping', () => {
	it('maps each user-facing label to its slug', () => {
		expect(flathubSlugForLabel('Productivity')).toBe('Office')
		expect(flathubSlugForLabel('Graphics & Photography')).toBe('Graphics')
		expect(flathubSlugForLabel('Games')).toBe('Game')
		expect(flathubSlugForLabel('Developer Tools')).toBe('Development')
		expect(flathubSlugForLabel('Audio & Video')).toBe('AudioVideo')
		expect(flathubSlugForLabel('Communication & News')).toBe('Network')
		expect(flathubSlugForLabel('Utilities')).toBe('Utility')
		expect(flathubSlugForLabel('Education')).toBe('Education')
		expect(flathubSlugForLabel('Science & Engineering')).toBe('Science')
		expect(flathubSlugForLabel('System')).toBe('System')
	})

	it('is case-insensitive and also accepts a raw slug', () => {
		expect(flathubSlugForLabel('productivity')).toBe('Office')
		expect(flathubSlugForLabel('  GAMES  ')).toBe('Game')
		expect(flathubSlugForLabel('office')).toBe('Office') // raw slug
		expect(flathubSlugForLabel('Game')).toBe('Game')
	})

	it('returns undefined for empty / unknown values (→ caller falls back to POPULAR, never a 422)', () => {
		expect(flathubSlugForLabel(undefined)).toBeUndefined()
		expect(flathubSlugForLabel('')).toBeUndefined()
		expect(flathubSlugForLabel('   ')).toBeUndefined()
		expect(flathubSlugForLabel('NotACategory')).toBeUndefined()
		expect(flathubSlugForLabel('productivity ')).toBe('Office') // trims, still matches
	})
})

describe('flathubClampPage — sane 1-based page', () => {
	it('defaults undefined / non-finite / <1 to page 1', () => {
		expect(flathubClampPage(undefined)).toBe(1)
		expect(flathubClampPage(NaN)).toBe(1)
		expect(flathubClampPage(Infinity)).toBe(1)
		expect(flathubClampPage(0)).toBe(1)
		expect(flathubClampPage(-5)).toBe(1)
	})

	it('floors and passes through valid pages', () => {
		expect(flathubClampPage(1)).toBe(1)
		expect(flathubClampPage(7)).toBe(7)
		expect(flathubClampPage(3.9)).toBe(3)
	})
})

describe('flathubHasMore — Meilisearch pagination signal', () => {
	const PER = FLATHUB_PER_PAGE // 30

	it('prefers page < totalPages when totalPages is present', () => {
		expect(flathubHasMore({page: 1, totalPages: 109}, 30, PER, 1)).toBe(true)
		expect(flathubHasMore({page: 109, totalPages: 109}, 30, PER, 109)).toBe(false)
		expect(flathubHasMore({page: 2, totalPages: 2}, 12, PER, 2)).toBe(false)
	})

	it('uses the requested page when the response omits page', () => {
		expect(flathubHasMore({totalPages: 5}, 30, PER, 4)).toBe(true)
		expect(flathubHasMore({totalPages: 5}, 30, PER, 5)).toBe(false)
	})

	it('falls back to a full-page heuristic when totalPages is absent', () => {
		// A full page came back ⇒ probably more.
		expect(flathubHasMore({}, 30, PER, 1)).toBe(true)
		// A partial page ⇒ end of results.
		expect(flathubHasMore({}, 12, PER, 3)).toBe(false)
		expect(flathubHasMore({}, 0, PER, 9)).toBe(false)
	})

	it('treats a non-numeric totalPages as absent (heuristic path)', () => {
		expect(flathubHasMore({totalPages: 'lots' as unknown}, 30, PER, 1)).toBe(true)
		expect(flathubHasMore({totalPages: 'lots' as unknown}, 5, PER, 1)).toBe(false)
	})
})
