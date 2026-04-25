// Phase 24-01 — Sidebar metadata completeness tests.
//
// We don't test render output here (the visual surface is covered by
// Plan 24-02's checkpoint and the SectionView exhaustiveness check that
// tsc enforces in docker-app.tsx). Instead we lock down that SECTION_META
// stays in sync with the SectionId union — every id must have an icon +
// label, otherwise the sidebar would crash at runtime when it tries to
// render that entry.

import {describe, expect, test} from 'vitest'

import {SECTION_META} from './sidebar'
import {SECTION_IDS} from './store'

describe('SECTION_META', () => {
	test('has an entry for every SECTION_IDS member', () => {
		for (const id of SECTION_IDS) {
			expect(SECTION_META, `missing entry for ${id}`).toHaveProperty(id)
		}
	})

	test('every entry has a non-empty label string', () => {
		for (const id of SECTION_IDS) {
			const meta = SECTION_META[id]
			expect(typeof meta.label).toBe('string')
			expect(meta.label.length).toBeGreaterThan(0)
		}
	})

	test('every entry has a function-typed icon (Tabler icons are React components)', () => {
		for (const id of SECTION_IDS) {
			const meta = SECTION_META[id]
			// Tabler exports `Icon` as a React.ForwardRefExoticComponent — `typeof` is 'object' for those.
			// Either function (plain SFC) or object (forwardRef) is valid; both are renderable by React.
			expect(['function', 'object']).toContain(typeof meta.icon)
			expect(meta.icon).not.toBeNull()
		}
	})
})
