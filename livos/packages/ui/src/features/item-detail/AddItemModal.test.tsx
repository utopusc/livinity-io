// @vitest-environment jsdom
//
// Phase 175-01 — AddItemModal scaffold tests (6 assertions B-01-1..B-01-6).
//
// Mirrors the 174-04 SidebarTree.drag.test.tsx pattern verbatim:
//   - vi.hoisted() namespace for shared spies/captures (avoids TDZ on
//     vitest's mock-hoisted factories)
//   - createRoot + act() mount/unmount (no @testing-library — D-NO-NEW-DEPS)
//   - mocks @/trpc/trpc to control vault.items.list response shape

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

const H = vi.hoisted(() => ({
	listData: {items: [] as any[]} as {items: any[]} | undefined,
}))

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		vault: {
			items: {
				list: {
					useQuery: (_input: unknown, _opts: any) => ({
						data: H.listData,
						refetch: vi.fn(),
					}),
				},
			},
		},
	},
}))

function fakeItem(p: {id: string; type: 'project' | 'agent' | 'chat'; name: string}) {
	return {
		...p,
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1,
		userId: 'admin',
	}
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	H.listData = {
		items: [
			fakeItem({id: 'pppppppppppppppppppp1', type: 'project', name: 'Demo Project'}),
			fakeItem({id: 'aaaaaaaaaaaaaaaaaaaa1', type: 'agent', name: 'Demo Agent'}),
			fakeItem({id: 'cccccccccccccccccccc1', type: 'chat', name: 'Demo Chat'}),
		],
	}
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
	// Radix portals — purge any leftover portal nodes between tests.
	document.body.querySelectorAll('[data-radix-portal]').forEach((n) => n.remove())
})

import {AddItemModal} from './AddItemModal'

describe('AddItemModal — Phase 175-01 scaffold', () => {
	it('B-01-1: open=false renders nothing', () => {
		act(() => {
			root.render(<AddItemModal open={false} onClose={vi.fn()} />)
		})
		expect(document.body.querySelector('[data-testid="add-item-modal"]')).toBeNull()
	})

	it('B-01-2: open=true renders the modal content', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		expect(document.body.querySelector('[data-testid="add-item-modal"]')).not.toBeNull()
	})

	it('B-01-3: three type-picker cards are rendered', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		const cards = document.body.querySelectorAll('[data-testid^="type-card-"]')
		expect(cards.length).toBe(3)
		expect(document.body.querySelector('[data-testid="type-card-project"]')).not.toBeNull()
		expect(document.body.querySelector('[data-testid="type-card-agent"]')).not.toBeNull()
		expect(document.body.querySelector('[data-testid="type-card-chat"]')).not.toBeNull()
	})

	it('B-01-4: clicking project type card invokes onTypeSelected("project")', () => {
		const onTypeSelected = vi.fn()
		act(() => {
			root.render(
				<AddItemModal
					open={true}
					onClose={vi.fn()}
					onTypeSelected={onTypeSelected}
				/>,
			)
		})
		const card = document.body.querySelector(
			'[data-testid="type-card-project"]',
		) as HTMLElement | null
		expect(card).not.toBeNull()
		act(() => {
			card!.dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		expect(onTypeSelected).toHaveBeenCalledTimes(1)
		expect(onTypeSelected).toHaveBeenCalledWith('project')
	})

	it('B-01-5: parent dropdown has Main Liv as topmost option + lists live items', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		const select = document.body.querySelector(
			'[data-testid="parent-select"]',
		) as HTMLSelectElement | null
		expect(select).not.toBeNull()
		const options = Array.from(select!.querySelectorAll('option'))
		expect(options.length).toBeGreaterThanOrEqual(4)
		// First option MUST be Main Liv.
		expect(options[0].value).toBe('main-liv')
		expect(options[0].textContent).toMatch(/Main Liv/)
	})

	it('B-01-6: source-text invariants — Radix Dialog + tRPC list + MAIN_LIV_ID + onTypeSelected prop', () => {
		const src = readFileSync(resolve(__dirname, 'AddItemModal.tsx'), 'utf8')
		expect(src).toMatch(/from '@radix-ui\/react-dialog'/)
		expect(src).toMatch(/trpcReact\.vault\.items\.list\.useQuery/)
		expect(src).toMatch(/MAIN_LIV_ID/)
		expect(src).toMatch(/onTypeSelected/)
	})
})
