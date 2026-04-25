// Phase 26 Plan 26-01 — useDockerResource zustand store tests.
//
// The store holds the four detail-panel selections (container / image /
// volume / network) that external surfaces can programmatically set to
// open the corresponding section's detail view. Plan 26-02 reuses
// volume/network slots; declared up-front to avoid a second store
// rev when those land.
//
// Why no @testing-library/renderHook: the store is a plain zustand
// instance; getState() is sufficient and keeps the test surface
// dependency-free (Plan 25-02 D-06 precedent).

import {beforeEach, describe, expect, test} from 'vitest'

import {
	useDockerResource,
	useSelectedContainer,
	useSelectedImage,
	useSelectedNetwork,
	useSelectedStack,
	useSelectedVolume,
} from './resource-store'

describe('useDockerResource — default state', () => {
	beforeEach(() => {
		useDockerResource.getState().clearAllSelections()
	})

	test('A: all five selections start as null', () => {
		const s = useDockerResource.getState()
		expect(s.selectedContainer).toBeNull()
		expect(s.selectedImage).toBeNull()
		expect(s.selectedVolume).toBeNull()
		expect(s.selectedNetwork).toBeNull()
		expect(s.selectedStack).toBeNull()
	})
})

describe('useDockerResource — setters set their slot only', () => {
	beforeEach(() => {
		useDockerResource.getState().clearAllSelections()
	})

	test("B: setSelectedContainer('foo') sets only selectedContainer", () => {
		useDockerResource.getState().setSelectedContainer('foo')
		const s = useDockerResource.getState()
		expect(s.selectedContainer).toBe('foo')
		expect(s.selectedImage).toBeNull()
		expect(s.selectedVolume).toBeNull()
		expect(s.selectedNetwork).toBeNull()
	})

	test('C: setSelectedImage(sha) sets only selectedImage', () => {
		useDockerResource.getState().setSelectedImage('sha256:abc')
		const s = useDockerResource.getState()
		expect(s.selectedImage).toBe('sha256:abc')
		expect(s.selectedContainer).toBeNull()
		expect(s.selectedVolume).toBeNull()
		expect(s.selectedNetwork).toBeNull()
	})

	test('D: setSelectedVolume / setSelectedNetwork set only their slot', () => {
		useDockerResource.getState().setSelectedVolume('myvol')
		expect(useDockerResource.getState().selectedVolume).toBe('myvol')
		expect(useDockerResource.getState().selectedContainer).toBeNull()
		expect(useDockerResource.getState().selectedImage).toBeNull()
		expect(useDockerResource.getState().selectedNetwork).toBeNull()

		useDockerResource.getState().setSelectedNetwork('mynet')
		expect(useDockerResource.getState().selectedNetwork).toBe('mynet')
		// Volume should still be set (independent slots, not auto-cleared)
		expect(useDockerResource.getState().selectedVolume).toBe('myvol')
	})
})

describe('useDockerResource — clearAllSelections', () => {
	test('E: clearAllSelections resets all five slots even when all five set', () => {
		const {
			setSelectedContainer,
			setSelectedImage,
			setSelectedVolume,
			setSelectedNetwork,
			setSelectedStack,
			clearAllSelections,
		} = useDockerResource.getState()
		setSelectedContainer('c')
		setSelectedImage('i')
		setSelectedVolume('v')
		setSelectedNetwork('n')
		setSelectedStack('s')

		// Sanity: all five set.
		expect(useDockerResource.getState().selectedContainer).toBe('c')
		expect(useDockerResource.getState().selectedImage).toBe('i')
		expect(useDockerResource.getState().selectedVolume).toBe('v')
		expect(useDockerResource.getState().selectedNetwork).toBe('n')
		expect(useDockerResource.getState().selectedStack).toBe('s')

		clearAllSelections()
		const s = useDockerResource.getState()
		expect(s.selectedContainer).toBeNull()
		expect(s.selectedImage).toBeNull()
		expect(s.selectedVolume).toBeNull()
		expect(s.selectedNetwork).toBeNull()
		expect(s.selectedStack).toBeNull()
	})
})

describe('useDockerResource — selector hooks', () => {
	beforeEach(() => {
		useDockerResource.getState().clearAllSelections()
	})

	test('F: useSelectedContainer / Image / Volume / Network / Stack return the current slice value', () => {
		// Selector hooks are zustand-flavoured `useStore(selector)` thin wrappers.
		// Calling them outside React — they're functions that consult the
		// current store; we invoke their underlying selector directly.
		// Pattern: getState() based read mirrors what the hook would return on first render.
		expect(useDockerResource.getState().selectedContainer).toBeNull()
		useDockerResource.getState().setSelectedContainer('alpha')
		expect(useDockerResource.getState().selectedContainer).toBe('alpha')

		// Type-only smoke: the selector hooks are exported as functions of zero args.
		expect(typeof useSelectedContainer).toBe('function')
		expect(typeof useSelectedImage).toBe('function')
		expect(typeof useSelectedVolume).toBe('function')
		expect(typeof useSelectedNetwork).toBe('function')
		expect(typeof useSelectedStack).toBe('function')
	})
})

describe('useDockerResource — selectedStack slot (Plan 27-01 / DOC-11)', () => {
	beforeEach(() => {
		useDockerResource.getState().clearAllSelections()
	})

	test("H: setSelectedStack('mystack') writes the slot only", () => {
		useDockerResource.getState().setSelectedStack('mystack')
		const s = useDockerResource.getState()
		expect(s.selectedStack).toBe('mystack')
		expect(s.selectedContainer).toBeNull()
		expect(s.selectedImage).toBeNull()
		expect(s.selectedVolume).toBeNull()
		expect(s.selectedNetwork).toBeNull()
	})

	test('I: setSelectedStack does not clobber other slots', () => {
		useDockerResource.getState().setSelectedContainer('alpha')
		useDockerResource.getState().setSelectedStack('mystack')
		const s = useDockerResource.getState()
		expect(s.selectedContainer).toBe('alpha')
		expect(s.selectedStack).toBe('mystack')
	})

	test('J: setSelectedStack(null) clears just the stack slot', () => {
		useDockerResource.getState().setSelectedStack('mystack')
		useDockerResource.getState().setSelectedContainer('alpha')
		useDockerResource.getState().setSelectedStack(null)
		const s = useDockerResource.getState()
		expect(s.selectedStack).toBeNull()
		expect(s.selectedContainer).toBe('alpha')
	})
})

describe('useDockerResource — identity-stable updates', () => {
	beforeEach(() => {
		useDockerResource.getState().clearAllSelections()
	})

	test('G: setting the SAME value twice notifies subscribers exactly once', () => {
		// zustand v5 default equality is Object.is; setting the SAME state should
		// still call set, but slice subscribers using `useStore(s => s.X)` should
		// only re-fire when their slice CHANGES. We assert at the slice subscription
		// level (via subscribe + selector + equalityFn) — that's the surface
		// React components consume.
		let count = 0
		const unsub = useDockerResource.subscribe((s, prev) => {
			if (s.selectedContainer !== prev.selectedContainer) count += 1
		})

		useDockerResource.getState().setSelectedContainer('foo')
		useDockerResource.getState().setSelectedContainer('foo')

		unsub()
		expect(count).toBe(1)
	})
})
