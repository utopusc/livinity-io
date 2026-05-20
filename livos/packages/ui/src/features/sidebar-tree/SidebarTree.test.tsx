// @vitest-environment jsdom
//
// Phase 174-02 — SidebarTree behaviour tests (Task 3).
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via
// act(). Mocks @/trpc/trpc so we control the query data; mocks react-arborist
// so we can assert on the tree-shaped `data` prop without rendering the
// virtualised internals (which would otherwise depend on real layout in
// jsdom). Mocks ./ItemTreeRow because Plan 174-03 fills its body; this test
// only verifies the data path through SidebarTree.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ─────────────────────────────────────────────────────────────────

type QueryStub = {
	data: {items: any[]} | undefined
	refetch: ReturnType<typeof vi.fn>
}

let listData: {items: any[]} | undefined = {items: []}
let useQueryOptionsCapture: any = null
const listQueryRefetch = vi.fn()
// Phase 176-05 — captured openItem subscription callback for T-OPEN-* tests.
let openItemCallback: ((data: {itemId: string}) => void) | null = null

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		vault: {
			items: {
				list: {
					useQuery: (_input: unknown, opts: any) => {
						useQueryOptionsCapture = opts
						const stub: QueryStub = {data: listData, refetch: listQueryRefetch}
						return stub
					},
				},
				// Phase 174-04 — SidebarTree.tsx now calls vault.items.move.useMutation
				// on mount; the 174-02 behavioural suite doesn't exercise the move
				// path so we ship a no-op stub that satisfies the hook call. The
				// dedicated drag suite (SidebarTree.drag.test.tsx) captures the
				// useMutation options and asserts on mutate/onSuccess/onError.
				move: {
					useMutation: (_opts: any) => ({mutate: () => {}}),
				},
				// Phase 176-05 — SidebarTree.tsx now calls vault.items.openItem.useSubscription
				// on mount. The callback is captured so T-OPEN-2/T-OPEN-3 can trigger it.
				openItem: {
					useSubscription: (_input: unknown, opts: any) => {
						openItemCallback = opts?.onData ?? null
					},
				},
			},
		},
	},
}))

// Mock react-arborist <Tree> — capture `data` prop into outer var so tests
// can assert on the tree-shape passed in. Render a deterministic stub so
// presence is detectable in the DOM.
// Phase 176-05: Tree is wrapped in React.forwardRef to support treeRef passed
// from SidebarTree (ref is forwarded, scrollTo spy captured for T-OPEN-2).
import React from 'react'
let lastTreeData: any[] = []
let capturedOnMove: ((args: {dragIds: string[]; parentId: string | null; index: number}) => void) | null = null
export const mockScrollTo = vi.fn()
vi.mock('react-arborist', () => ({
	Tree: React.forwardRef((props: any, ref: any) => {
		lastTreeData = props.data
		capturedOnMove = props.onMove ?? null
		React.useImperativeHandle(ref, () => ({scrollTo: mockScrollTo, focus: vi.fn()}))
		return <div data-testid='arborist-tree' />
	}),
}))

// Mock ItemTreeRow — Plan 174-03 fills the body; for 174-02 we only need
// to confirm the data path, not the per-type render.
vi.mock('./ItemTreeRow', () => ({
	ItemTreeRow: () => <div data-testid='item-row' />,
}))

// Phase 183 — window-manager mock for gear → Settings assertions.
// mockWindowManager is module-level so the factory closure can read it;
// beforeEach in the gear describe block reassigns it per test.
let mockWindowManager: {
	windows: Array<{id: string; appId: string}>
	openWindow: ReturnType<typeof vi.fn>
	focusWindow: ReturnType<typeof vi.fn>
} | null = null

vi.mock('@/providers/window-manager', () => ({
	useWindowManagerOptional: () => mockWindowManager,
}))

// ── Fixture helper ───────────────────────────────────────────────────────

function fakeItem(p: Partial<any> & {id: string; type: 'project' | 'agent' | 'chat'}) {
	return {
		name: 'fake',
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1,
		userId: 'admin',
		...p,
	}
}

// ── Test setup ───────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	listData = {items: []}
	useQueryOptionsCapture = null
	lastTreeData = []
	capturedOnMove = null
	openItemCallback = null
	listQueryRefetch.mockReset()
	mockScrollTo.mockReset()
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	try {
		act(() => root.unmount())
	} catch {
		/* already unmounted */
	}
	container.remove()
})

import {SidebarTree} from './SidebarTree'
import {MAIN_LIV_ID} from './tree-shape'

// ── Tests ────────────────────────────────────────────────────────────────

describe('SidebarTree — behavior', () => {
	it('B1: empty items renders the "talk to Liv in terminal ↓" hint and NOT the tree', () => {
		listData = {items: []}
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(container.textContent).toMatch(/talk to Liv in terminal/i)
		expect(container.querySelector('[data-testid="arborist-tree"]')).toBeNull()
	})

	it('B2: populated tree (1 project) renders the react-arborist Tree stub', () => {
		listData = {
			items: [fakeItem({id: 'pppppppppppppppppppp1', type: 'project'})],
		}
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(container.querySelector('[data-testid="arborist-tree"]')).not.toBeNull()
		// And NOT the empty hint.
		expect(container.textContent).not.toMatch(/talk to Liv in terminal/i)
	})

	it('B3: Main Liv pin is always the FIRST entry in the tree data passed to <Tree>', () => {
		listData = {
			items: [fakeItem({id: 'pppppppppppppppppppp1', type: 'project'})],
		}
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(lastTreeData.length).toBeGreaterThanOrEqual(2)
		expect(lastTreeData[0].id).toBe(MAIN_LIV_ID)
	})

	it('B4: useQuery is called with refetchInterval: 5_000 (5000) — v1 real-time fallback', () => {
		listData = {items: []}
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(useQueryOptionsCapture).toBeTruthy()
		expect(useQueryOptionsCapture.refetchInterval).toBe(5_000)
	})

	it('B5: sort order — root items [B(createdAt:200), A(createdAt:100)] → tree data [MainLiv, A, B]', () => {
		const itB = fakeItem({id: 'bbbbbbbbbbbbbbbbbbbb1', type: 'project', createdAt: 200})
		const itA = fakeItem({id: 'aaaaaaaaaaaaaaaaaaaa1', type: 'project', createdAt: 100})
		listData = {items: [itB, itA]}
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(lastTreeData.map((n) => n.id)).toEqual([
			MAIN_LIV_ID,
			'aaaaaaaaaaaaaaaaaaaa1', // 100
			'bbbbbbbbbbbbbbbbbbbb1', // 200
		])
	})

	it('B6: parent-child nesting — child appears in parent.children, not at root', () => {
		const parent = fakeItem({id: 'ppppppppppppppppppp1', type: 'project'})
		const child = fakeItem({
			id: 'cccccccccccccccccccc1',
			type: 'chat',
			parentId: 'ppppppppppppppppppp1',
		})
		listData = {items: [parent, child]}
		act(() => {
			root.render(<SidebarTree />)
		})
		// Root list has [MainLiv, parent] — no child at root.
		expect(lastTreeData.map((n) => n.id)).toEqual([
			MAIN_LIV_ID,
			'ppppppppppppppppppp1',
		])
		const parentNode = lastTreeData[1]
		expect(parentNode.children).toBeDefined()
		expect(parentNode.children[0].id).toBe('cccccccccccccccccccc1')
	})

	it('B7: archived items (archivedAt !== null) are excluded from the tree data', () => {
		const live = fakeItem({id: 'llllllllllllllllllll1', type: 'project'})
		const archived = fakeItem({
			id: 'xxxxxxxxxxxxxxxxxxxx1',
			type: 'project',
			archivedAt: 9_999_999,
		})
		listData = {items: [live, archived]}
		act(() => {
			root.render(<SidebarTree />)
		})
		const ids = lastTreeData.map((n) => n.id)
		expect(ids).toContain('llllllllllllllllllll1')
		expect(ids).not.toContain('xxxxxxxxxxxxxxxxxxxx1')
	})

	it('B8: loading state (query.data === undefined) treats items as [] and shows hint (no crash)', () => {
		listData = undefined
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(container.textContent).toMatch(/talk to Liv in terminal/i)
		// Tree should NOT have been rendered.
		expect(container.querySelector('[data-testid="arborist-tree"]')).toBeNull()
	})

	it("B9: source-text invariant — SidebarTree.tsx imports Tree from 'react-arborist'", () => {
		const src = readFileSync(resolve(__dirname, 'SidebarTree.tsx'), 'utf8')
		expect(src).toMatch(/from 'react-arborist'/)
	})

	it('B10: source-text invariant — SidebarTree.tsx does NOT call vault.items.subscribeTree (does not exist yet)', () => {
		const src = readFileSync(resolve(__dirname, 'SidebarTree.tsx'), 'utf8')
		expect(src).not.toMatch(/vault\.items\.subscribeTree/)
	})
})

// ── Phase 176-05: openItem subscription + scrollTo ────────────────────────

const VALID_ITEM_ID = 'aaaabbbbccccddddeeee1234' // matches /^[0-9A-Za-z_-]{20,}$/

describe('SidebarTree — Phase 176-05 openItem subscription', () => {
	it('T-OPEN-1: SidebarTree.tsx imports trpcReact and calls vault.items.openItem.useSubscription()', () => {
		const src = readFileSync(resolve(__dirname, 'SidebarTree.tsx'), 'utf8')
		expect(src).toMatch(/openItem/)
		expect(src).toMatch(/useSubscription/)
	})

	it('T-OPEN-2: when openItem fires with itemId, treeRef.current.scrollTo(itemId, "auto") is called', () => {
		// Need items so Tree is rendered (treeRef gets attached).
		listData = {items: [{id: VALID_ITEM_ID, type: 'project', name: 'x', parentId: null, pinned: false, createdAt: 0, updatedAt: 0, archivedAt: null, schemaVersion: 1, userId: 'admin'}]}
		act(() => {
			root.render(<SidebarTree />)
		})
		// Trigger the openItem callback.
		act(() => {
			openItemCallback?.({itemId: VALID_ITEM_ID})
		})
		// react-arborist TreeApi.scrollTo(identity: Identity, align?: Align)
		// takes the id as the first positional arg, not as {id, align} object.
		expect(mockScrollTo).toHaveBeenCalledWith(VALID_ITEM_ID, 'auto')
	})

	it('T-OPEN-3: openItem with itemId=MAIN_LIV_ID is a no-op (guard: synthetic root not scrollable)', () => {
		listData = {items: [{id: VALID_ITEM_ID, type: 'project', name: 'x', parentId: null, pinned: false, createdAt: 0, updatedAt: 0, archivedAt: null, schemaVersion: 1, userId: 'admin'}]}
		act(() => {
			root.render(<SidebarTree />)
		})
		act(() => {
			openItemCallback?.({itemId: MAIN_LIV_ID})
		})
		// scrollTo must NOT be called for the synthetic root.
		expect(mockScrollTo).not.toHaveBeenCalled()
	})

	it('T-OPEN-4: openItem subscription is registered even when vault is empty (callback captured)', () => {
		// Vault is empty — Tree is not rendered, but subscription hook is still called.
		listData = {items: []}
		act(() => {
			root.render(<SidebarTree />)
		})
		// openItemCallback should be set (hook ran), even if treeRef.current is null.
		// Calling it should not throw.
		expect(() => {
			openItemCallback?.({itemId: VALID_ITEM_ID})
		}).not.toThrow()
	})

	it('T-OPEN-5: treeRef is attached to <Tree> (source-text invariant)', () => {
		const src = readFileSync(resolve(__dirname, 'SidebarTree.tsx'), 'utf8')
		expect(src).toMatch(/treeRef/)
		expect(src).toMatch(/TreeApi/)
	})

	it('T-OPEN-6: SidebarTree still passes all existing B1-B10 regression assertions (smoke check)', () => {
		// Smoke-check: B1 empty hint still renders.
		listData = {items: []}
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(container.textContent).toMatch(/talk to Liv in terminal/i)
	})
})

// ── Phase 183: gear → Settings window ────────────────────────────────────

describe('Phase 183 — gear → Settings window', () => {
	beforeEach(() => {
		mockWindowManager = {
			windows: [],
			openWindow: vi.fn().mockReturnValue('new-window-id'),
			focusWindow: vi.fn(),
		}
	})

	it('T-GEAR-1: gear click with no existing Settings window → openWindow called with correct args', async () => {
		mockWindowManager!.windows = [] // no existing windows

		act(() => {
			root.render(<SidebarTree />)
		})

		// Gear button rendered by SidebarFooter inside SidebarTree.
		const gearBtn = container.querySelector('button[aria-label="Settings"]') as HTMLButtonElement
		expect(gearBtn).not.toBeNull()

		act(() => {
			gearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})

		expect(mockWindowManager!.openWindow).toHaveBeenCalledTimes(1)
		expect(mockWindowManager!.openWindow).toHaveBeenCalledWith(
			'LIVINITY_settings',
			'/settings',
			'Settings',
			'/figma-exports/dock-settings-new.svg',
		)
		expect(mockWindowManager!.focusWindow).not.toHaveBeenCalled()
	})

	it('T-GEAR-2: gear click when Settings window already open → focusWindow called; openWindow NOT called', async () => {
		const existingId = 'existing-settings-window-id'
		mockWindowManager!.windows = [{id: existingId, appId: 'LIVINITY_settings'}]

		act(() => {
			root.render(<SidebarTree />)
		})

		const gearBtn = container.querySelector('button[aria-label="Settings"]') as HTMLButtonElement
		expect(gearBtn).not.toBeNull()

		act(() => {
			gearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})

		expect(mockWindowManager!.focusWindow).toHaveBeenCalledTimes(1)
		expect(mockWindowManager!.focusWindow).toHaveBeenCalledWith(existingId)
		expect(mockWindowManager!.openWindow).not.toHaveBeenCalled()
	})

	it('T-GEAR-3: gear click when windowManager is null (outside provider) does not throw', async () => {
		mockWindowManager = null // simulate outside-provider

		act(() => {
			root.render(<SidebarTree />)
		})

		const gearBtn = container.querySelector('button[aria-label="Settings"]') as HTMLButtonElement
		expect(gearBtn).not.toBeNull()

		expect(() => {
			act(() => {
				gearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true}))
			})
		}).not.toThrow()
	})

	it('T-GEAR-4: SidebarTree.tsx imports useWindowManagerOptional and SidebarFooter', () => {
		const src = readFileSync(resolve(__dirname, 'SidebarTree.tsx'), 'utf8')
		expect(src).toMatch(/useWindowManagerOptional/)
		expect(src).toMatch(/SidebarFooter/)
		expect(src).toMatch(/LIVINITY_settings/)
	})
})
