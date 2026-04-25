// Phase 26 Plan 26-02 — DOC-20 programmatic deep-link contract tests.
//
// Three Vitest tests verifying that the four programmatic deep-link APIs
// (Plan 26-01 containers + images, Plan 26-02 volumes + networks) all
// work through the SAME `useDockerResource` store. This is "TDD as a
// contract pin" — the tests pass on first run because Plan 26-01 already
// shipped the store contract. Their job is to LOCK the contract in for
// Phase 28 (cross-container logs deep-link) and Phase 29 (palette + URL-
// bar deep-linking) consumers, who will read these slots as the canonical
// programmatic-navigation surface.
//
// The store is a plain zustand instance — getState() is sufficient and
// keeps the test surface dependency-free (Plan 25-02 D-06 + Plan 26-01
// resource-store.unit.test.ts precedent).

import {beforeEach, describe, expect, test} from 'vitest'

import {useDockerResource} from '../resource-store'

describe('DOC-20 programmatic deep-link contract — all 4 resource types', () => {
	beforeEach(() => {
		// Hard reset: not using clearAllSelections because Test C asserts on it.
		useDockerResource.setState({
			selectedContainer: null,
			selectedImage: null,
			selectedVolume: null,
			selectedNetwork: null,
		})
	})

	test('A: all four setters write to and read back from the store', () => {
		// External code (env card click pattern, Phase 28 cross-container logs,
		// Phase 29 palette) uses these four setters to programmatically open a
		// resource detail panel. The contract: setSelectedX(value) writes value
		// into the corresponding store slot; getState() reads it back.
		useDockerResource.getState().setSelectedContainer('c1')
		useDockerResource.getState().setSelectedImage('i1')
		useDockerResource.getState().setSelectedVolume('v1')
		useDockerResource.getState().setSelectedNetwork('n1')

		const s = useDockerResource.getState()
		expect(s.selectedContainer).toBe('c1')
		expect(s.selectedImage).toBe('i1')
		expect(s.selectedVolume).toBe('v1')
		expect(s.selectedNetwork).toBe('n1')
	})

	test('B: setters are independent — setting one does NOT clear another', () => {
		// Catches a regression where someone refactors the store to a single
		// `selectedResource` field with a discriminated union — the contract
		// is FOUR independent slots so multiple sections can have an "open"
		// detail panel simultaneously (e.g., user opens a container detail,
		// switches to Images section, expands an image — both selections
		// must persist for back-navigation to feel right).
		useDockerResource.getState().setSelectedContainer('a')
		expect(useDockerResource.getState().selectedContainer).toBe('a')

		useDockerResource.getState().setSelectedImage('b')
		// container slot must be untouched.
		expect(useDockerResource.getState().selectedContainer).toBe('a')
		expect(useDockerResource.getState().selectedImage).toBe('b')

		useDockerResource.getState().setSelectedVolume('c')
		// container + image still set.
		expect(useDockerResource.getState().selectedContainer).toBe('a')
		expect(useDockerResource.getState().selectedImage).toBe('b')
		expect(useDockerResource.getState().selectedVolume).toBe('c')

		useDockerResource.getState().setSelectedNetwork('d')
		// All four set independently.
		expect(useDockerResource.getState().selectedContainer).toBe('a')
		expect(useDockerResource.getState().selectedImage).toBe('b')
		expect(useDockerResource.getState().selectedVolume).toBe('c')
		expect(useDockerResource.getState().selectedNetwork).toBe('d')
	})

	test('C: clearAllSelections() resets all four slots to null', () => {
		// Used by external surfaces that need to wipe all detail panels in
		// one shot — e.g., the Docker window-close hook in a future Phase 29
		// polish task, or an "Escape" key handler in the palette.
		useDockerResource.getState().setSelectedContainer('c')
		useDockerResource.getState().setSelectedImage('i')
		useDockerResource.getState().setSelectedVolume('v')
		useDockerResource.getState().setSelectedNetwork('n')

		// Sanity: all four set.
		const before = useDockerResource.getState()
		expect(before.selectedContainer).toBe('c')
		expect(before.selectedImage).toBe('i')
		expect(before.selectedVolume).toBe('v')
		expect(before.selectedNetwork).toBe('n')

		useDockerResource.getState().clearAllSelections()

		const after = useDockerResource.getState()
		expect(after.selectedContainer).toBeNull()
		expect(after.selectedImage).toBeNull()
		expect(after.selectedVolume).toBeNull()
		expect(after.selectedNetwork).toBeNull()
	})
})
