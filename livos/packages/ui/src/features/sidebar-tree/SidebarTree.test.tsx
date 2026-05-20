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
			},
		},
	},
}))

// Mock react-arborist <Tree> — capture `data` prop into outer var so tests
// can assert on the tree-shape passed in. Render a deterministic stub so
// presence is detectable in the DOM.
let lastTreeData: any[] = []
vi.mock('react-arborist', () => ({
	Tree: (props: any) => {
		lastTreeData = props.data
		return <div data-testid='arborist-tree' />
	},
}))

// Mock ItemTreeRow — Plan 174-03 fills the body; for 174-02 we only need
// to confirm the data path, not the per-type render.
vi.mock('./ItemTreeRow', () => ({
	ItemTreeRow: () => <div data-testid='item-row' />,
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
	listQueryRefetch.mockReset()
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
