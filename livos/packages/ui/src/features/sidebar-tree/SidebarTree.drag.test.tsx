// @vitest-environment jsdom
//
// Phase 174-04 — SidebarTree drag-to-reparent behaviour tests (6 assertions).
//
// Pattern mirrors the 174-02 SidebarTree.test.tsx setup verbatim (RTL-absent
// react-dom/client mount, mocked @/trpc/trpc + react-arborist + ItemTreeRow)
// but additionally:
//   - captures the useMutation options (onSuccess, onError) into outer-scoped
//     variables so each test can invoke them directly to simulate the tRPC
//     callbacks without spinning up a real client;
//   - captures the mutate() call args to assert on the {id, newParentId}
//     payload;
//   - mocks `sonner` so toast.error / toast.warning calls are observable;
//   - captures the react-arborist <Tree>'s onMove prop so tests can invoke
//     it with synthetic drag events.
//
// The 6 assertions match B-ui-1 through B-ui-6 from 174-04-PLAN.md Task 2.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ─────────────────────────────────────────────────────────────────

// tRPC list query stub — populated by tests.
let listData: {items: any[]} | undefined = {items: []}
const listQueryRefetch = vi.fn()

// tRPC move mutation stub — capture options + mutate calls.
let moveMutationOptions: {
	onSuccess?: (data: any) => void
	onError?: (err: any) => void
} = {}
const moveMutate = vi.fn()

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		vault: {
			items: {
				list: {
					useQuery: (_input: unknown, _opts: any) => ({
						data: listData,
						refetch: listQueryRefetch,
					}),
				},
				move: {
					useMutation: (opts: any) => {
						moveMutationOptions = opts ?? {}
						return {mutate: moveMutate}
					},
				},
			},
		},
	},
}))

// react-arborist <Tree> — capture onMove prop into outer var so tests can
// invoke it with synthetic drag events.
let capturedOnMove:
	| ((args: {
			dragIds: string[]
			parentId: string | null
			index: number
	  }) => void)
	| null = null
vi.mock('react-arborist', () => ({
	Tree: (props: any) => {
		capturedOnMove = props.onMove ?? null
		return <div data-testid='arborist-tree' />
	},
}))

vi.mock('./ItemTreeRow', () => ({
	ItemTreeRow: () => <div data-testid='item-row' />,
}))

// sonner toast — observable spies.
const toastError = vi.fn()
const toastWarning = vi.fn()
vi.mock('sonner', () => ({
	toast: {error: toastError, warning: toastWarning},
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
	listData = {
		items: [
			fakeItem({id: 'pppppppppppppppppppp1', type: 'project'}),
			fakeItem({id: 'pppppppppppppppppppp2', type: 'project'}),
		],
	}
	moveMutationOptions = {}
	capturedOnMove = null
	moveMutate.mockReset()
	listQueryRefetch.mockReset()
	toastError.mockReset()
	toastWarning.mockReset()
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

describe('SidebarTree — drag-to-reparent (Phase 174-04)', () => {
	it('B-ui-1: happy-path move — onMove invokes mutate({id, newParentId}) exactly once per dragId', () => {
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(capturedOnMove).not.toBeNull()
		act(() => {
			capturedOnMove!({
				dragIds: ['pppppppppppppppppppp1'],
				parentId: 'pppppppppppppppppppp2',
				index: 0,
			})
		})
		expect(moveMutate).toHaveBeenCalledTimes(1)
		expect(moveMutate).toHaveBeenCalledWith({
			id: 'pppppppppppppppppppp1',
			newParentId: 'pppppppppppppppppppp2',
		})
	})

	it('B-ui-2: cycle error — toast.error fires + list.refetch invoked', () => {
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(moveMutationOptions.onError).toBeDefined()
		// Simulate the tRPC onError callback with a structured cycle error.
		act(() => {
			moveMutationOptions.onError!({
				data: {cause: {kind: 'cycle'}},
				message: 'move rejected: cycle',
			})
		})
		expect(toastError).toHaveBeenCalledTimes(1)
		expect(toastError.mock.calls[0][0]).toMatch(/cycle/i)
		expect(listQueryRefetch).toHaveBeenCalledTimes(1)
	})

	it('B-ui-3: depth-hard error — toast.error fires (/too deep|depth/i) + list.refetch invoked', () => {
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(moveMutationOptions.onError).toBeDefined()
		act(() => {
			moveMutationOptions.onError!({
				data: {cause: {kind: 'depth-exceeds-hard-cap'}},
				message: 'move rejected: depth-exceeds-hard-cap',
			})
		})
		expect(toastError).toHaveBeenCalledTimes(1)
		expect(toastError.mock.calls[0][0]).toMatch(/too deep|depth/i)
		expect(listQueryRefetch).toHaveBeenCalledTimes(1)
	})

	it('B-ui-4: depth-soft warn — toast.warning fires with warn text; NO refetch (move commits)', () => {
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(moveMutationOptions.onSuccess).toBeDefined()
		act(() => {
			moveMutationOptions.onSuccess!({
				item: {id: 'pppppppppppppppppppp1'},
				warn: 'depth-exceeds-soft-cap',
			})
		})
		expect(toastWarning).toHaveBeenCalledTimes(1)
		expect(toastWarning.mock.calls[0][0]).toBe('depth-exceeds-soft-cap')
		// Success path MUST NOT refetch — react-arborist optimistic state is truth.
		expect(listQueryRefetch).not.toHaveBeenCalled()
	})

	it('B-ui-5: Main Liv guard — dragIds includes MAIN_LIV_ID, mutate is NOT called for it', () => {
		act(() => {
			root.render(<SidebarTree />)
		})
		expect(capturedOnMove).not.toBeNull()
		act(() => {
			capturedOnMove!({
				dragIds: [MAIN_LIV_ID, 'pppppppppppppppppppp1'],
				parentId: null,
				index: 0,
			})
		})
		// Only the real id should have produced a mutate call.
		expect(moveMutate).toHaveBeenCalledTimes(1)
		expect(moveMutate).toHaveBeenCalledWith({
			id: 'pppppppppppppppppppp1',
			newParentId: null,
		})
	})

	it('B-ui-6: source-text invariants — imports toast from sonner AND calls vault.items.move.useMutation', () => {
		const src = readFileSync(resolve(__dirname, 'SidebarTree.tsx'), 'utf8')
		expect(src).toMatch(/from 'sonner'/)
		expect(src).toMatch(/vault\.items\.move\.useMutation/)
	})
})
