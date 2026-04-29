// @vitest-environment jsdom
//
// Phase 38 Plan 02 — DangerZone component RED tests.
//
// `@testing-library/react` is NOT installed in this UI package (verified
// via package.json devDeps, 2026-04-29). Per the established Phase 33
// pattern (past-deploys-table.unit.test.tsx), we ship:
//   1. A smoke test that imports the module + asserts exports
//   2. Pure-helper tests for `decideDangerZoneVisibility` (the admin-gating
//      decision lives in a pure function — fully unit-testable)
//   3. A negative-assertion test enforcing the "no Server4" memory rule
//      against the rendered-text source code itself (no DOM needed)
//   4. Deferred RTL test plan as comments
//
// Deferred RTL tests (uncomment + run when @testing-library/react lands):
//
//   DZ1: when isAdmin=true, query.getByTestId('factory-reset-button') exists
//        and has a destructive-variant class on its root.
//   DZ2: when isAdmin=true, the button's <a> href ends with '/factory-reset'.
//   DZ3: when isAdmin=false + isLoading=false, query.getByTestId(
//        'factory-reset-non-admin-note') exists, query.queryByTestId(
//        'factory-reset-button') is null.
//   DZ4: when isLoading=true, neither testid exists; the loading testid does.
//   DZ5: heading text is exactly 'Danger Zone' (D-UI-01 verbatim).
//   DZ6: shield-warning icon rendered (assert <svg> with TbShieldExclamation
//        class signature inside the heading).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('DangerZone smoke (FR-UI-01)', () => {
	it('module exports DangerZone and decideDangerZoneVisibility', async () => {
		const mod = await import('./danger-zone')
		expect(typeof mod.DangerZone).toBe('function')
		expect(typeof mod.decideDangerZoneVisibility).toBe('function')
	})
})

describe('decideDangerZoneVisibility (admin-gate decision)', () => {
	it('isLoading=true -> "loading" regardless of isAdmin (admin)', async () => {
		const {decideDangerZoneVisibility} = await import('./danger-zone')
		expect(decideDangerZoneVisibility({isLoading: true, isAdmin: true})).toBe('loading')
	})
	it('isLoading=true -> "loading" regardless of isAdmin (non-admin)', async () => {
		const {decideDangerZoneVisibility} = await import('./danger-zone')
		expect(decideDangerZoneVisibility({isLoading: true, isAdmin: false})).toBe('loading')
	})
	it('isLoading=false + isAdmin=true -> "admin-button"', async () => {
		const {decideDangerZoneVisibility} = await import('./danger-zone')
		expect(decideDangerZoneVisibility({isLoading: false, isAdmin: true})).toBe('admin-button')
	})
	it('isLoading=false + isAdmin=false -> "non-admin-note"', async () => {
		const {decideDangerZoneVisibility} = await import('./danger-zone')
		expect(decideDangerZoneVisibility({isLoading: false, isAdmin: false})).toBe('non-admin-note')
	})
	it('the three states are exhaustive (covers all combinations)', async () => {
		const {decideDangerZoneVisibility} = await import('./danger-zone')
		const got = new Set([
			decideDangerZoneVisibility({isLoading: false, isAdmin: false}),
			decideDangerZoneVisibility({isLoading: false, isAdmin: true}),
			decideDangerZoneVisibility({isLoading: true, isAdmin: false}),
			decideDangerZoneVisibility({isLoading: true, isAdmin: true}),
		])
		expect(got).toEqual(new Set(['non-admin-note', 'admin-button', 'loading']))
	})
})

describe('DangerZone source-text invariants (memory rule: no Server4/5)', () => {
	it('danger-zone.tsx contains no "Server4" or "Server5" substring', () => {
		// process.cwd() at vitest run-time is the UI package root
		// (livos/packages/ui). Resolve against that — avoids the
		// jsdom URL-scheme mismatch where import.meta.url is not file://.
		const sourcePath = resolve(process.cwd(), 'src/routes/settings/_components/danger-zone.tsx')
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).not.toMatch(/Server4/)
		expect(source).not.toMatch(/Server5/)
	})
})
