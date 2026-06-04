// livos/packages/livinityd/source/modules/apps/public-access.test.ts
// Phase 258 WS-A (258-01) — resolvePublicAccess pure resolver + PublicAccessConfig.
// resolvePublicAccess is the ONE source of truth for "what is the effective public
// config for this install": it merges the app-author manifest declaration with the
// operator's per-install setting into a normalized PublicAccessConfig that both the
// Caddy emitter (258-02) and the enforcement layer (258-03) consume. Pure / no I/O.
import {describe, it, expect} from 'vitest'
import {resolvePublicAccess, DEFAULT_CALCOM_PATHS} from './public-access.js'

describe('resolvePublicAccess (258-01 WS-A)', () => {
	it('paths mode: operator install paths win, manifest is the suggestion', () => {
		const out = resolvePublicAccess(
			{publicAccess: {mode: 'paths', paths: ['/booking/']}},
			{mode: 'paths', paths: ['/booking/', '/d/']},
		)
		expect(out).toEqual({mode: 'paths', paths: ['/booking/', '/d/'], hasOwnAuth: false})
	})

	it('whole-app mode: paths empty, hasOwnAuth carried from manifest', () => {
		const out = resolvePublicAccess(
			{publicAccess: {mode: 'whole-app', hasOwnAuth: true}},
			{mode: 'whole-app'},
		)
		expect(out).toEqual({mode: 'whole-app', paths: [], hasOwnAuth: true})
	})

	it('default none: no install setting => private (SC5), hasOwnAuth from manifest or false', () => {
		const out = resolvePublicAccess({publicAccess: {mode: 'paths', paths: ['/booking/'], hasOwnAuth: true}})
		expect(out).toEqual({mode: 'none', paths: [], hasOwnAuth: true})

		const bare = resolvePublicAccess(null)
		expect(bare).toEqual({mode: 'none', paths: [], hasOwnAuth: false})
	})

	it('manifest paths fallback: install paths mode with NO paths falls back to manifest suggestion', () => {
		const out = resolvePublicAccess(
			{publicAccess: {mode: 'paths', paths: ['/booking/', '/d/']}},
			{mode: 'paths'},
		)
		expect(out).toEqual({mode: 'paths', paths: ['/booking/', '/d/'], hasOwnAuth: false})

		// no manifest paths either => empty
		const empty = resolvePublicAccess({publicAccess: {mode: 'paths'}}, {mode: 'paths'})
		expect(empty).toEqual({mode: 'paths', paths: [], hasOwnAuth: false})
	})

	it('DEFAULT_CALCOM_PATHS equals the CONTEXT list and contains NO bare "/" catch-all', () => {
		expect(DEFAULT_CALCOM_PATHS).toEqual([
			'/booking',
			'/booking-successful',
			'/d/',
			'/api/book',
			'/api/trpc/public',
			'/api/trpc/slots',
			'/api/trpc/availability',
			'/[a-z]',
		])
		// catch-all-last invariant: the suggestion list must never smuggle a
		// universal prefix that would shadow the gated block.
		expect(DEFAULT_CALCOM_PATHS).not.toContain('/')
		expect(DEFAULT_CALCOM_PATHS).not.toContain('')
	})

	it('path normalization: leading slash added, empty/whitespace paths dropped', () => {
		const out = resolvePublicAccess(null, {mode: 'paths', paths: ['booking/', '  ', '', '/d/']})
		expect(out).toEqual({mode: 'paths', paths: ['/booking/', '/d/'], hasOwnAuth: false})
	})
})
