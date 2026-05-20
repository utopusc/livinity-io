// @vitest-environment jsdom
//
// Phase 168-02 — SessionSidebar unit tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via
// act(). Mocks @/trpc/trpc so the behavior under test is the sidebar's
// composition / sort / mutation wiring, not the real tRPC client.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ─────────────────────────────────────────────────────────────────

type QueryStub = {
	data: {sessions: any[]} | undefined
	refetch: ReturnType<typeof vi.fn>
}

type MutationStub = {
	mutate: ReturnType<typeof vi.fn>
	isPending: boolean
	isLoading: boolean
	onSuccess?: (result: any) => void
}

const listQueryMock: QueryStub = {
	data: {sessions: []},
	refetch: vi.fn(),
}

const createMutationConfig = {onSuccess: undefined as any}
const renameMutationConfig = {onSuccess: undefined as any}
const deleteMutationConfig = {onSuccess: undefined as any}

const createMutationMock: MutationStub = {
	mutate: vi.fn(),
	isPending: false,
	isLoading: false,
}
const renameMutationMock: MutationStub = {
	mutate: vi.fn(),
	isPending: false,
	isLoading: false,
}
const deleteMutationMock: MutationStub = {
	mutate: vi.fn(),
	isPending: false,
	isLoading: false,
}

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		ccPty: {
			list: {
				useQuery: () => listQueryMock,
			},
			create: {
				useMutation: (opts?: any) => {
					createMutationConfig.onSuccess = opts?.onSuccess
					return createMutationMock
				},
			},
			rename: {
				useMutation: (opts?: any) => {
					renameMutationConfig.onSuccess = opts?.onSuccess
					return renameMutationMock
				},
			},
			delete: {
				useMutation: (opts?: any) => {
					deleteMutationConfig.onSuccess = opts?.onSuccess
					return deleteMutationMock
				},
			},
		},
	},
}))

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	listQueryMock.data = {sessions: []}
	listQueryMock.refetch.mockReset()
	createMutationMock.mutate.mockReset()
	renameMutationMock.mutate.mockReset()
	deleteMutationMock.mutate.mockReset()
	createMutationConfig.onSuccess = undefined
	renameMutationConfig.onSuccess = undefined
	deleteMutationConfig.onSuccess = undefined
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

import {SessionSidebar} from './SessionSidebar'

function makeSession(id: string, overrides: Partial<any> = {}) {
	return {
		id,
		userId: 'admin',
		tmuxName: `livos-cc-admin-${id.slice(0, 8)}`,
		cwd: '/vault',
		createdAt: 1_000_000,
		lastAttachedAt: 0,
		lastMessageAt: 0,
		title: `Session ${id}`,
		...overrides,
	}
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('SessionSidebar — behavior', () => {
	it('A1: empty list renders the "No sessions yet" prompt', () => {
		listQueryMock.data = {sessions: []}
		act(() => {
			root.render(
				<SessionSidebar activeSessionId={null} onSelect={vi.fn()} />,
			)
		})
		expect(container.textContent).toMatch(/No sessions yet/)
	})

	it('A2: populated list renders one SessionItem per session', () => {
		listQueryMock.data = {
			sessions: [makeSession('aaaa-1'), makeSession('bbbb-2')],
		}
		act(() => {
			root.render(
				<SessionSidebar activeSessionId={null} onSelect={vi.fn()} />,
			)
		})
		// Each session row contains its title.
		expect(container.textContent).toMatch(/Session aaaa-1/)
		expect(container.textContent).toMatch(/Session bbbb-2/)
	})

	it('A3: sort by max(lastMessageAt,lastAttachedAt) DESC — session B (max=300) before session A (max=200)', () => {
		const a = makeSession('aaaa-1', {
			lastMessageAt: 100,
			lastAttachedAt: 200,
			title: 'A_session',
		})
		const b = makeSession('bbbb-2', {
			lastMessageAt: 300,
			lastAttachedAt: 50,
			title: 'B_session',
		})
		listQueryMock.data = {sessions: [a, b]} // input order: A, B
		act(() => {
			root.render(
				<SessionSidebar activeSessionId={null} onSelect={vi.fn()} />,
			)
		})
		const text = container.textContent ?? ''
		const idxA = text.indexOf('A_session')
		const idxB = text.indexOf('B_session')
		expect(idxA).toBeGreaterThan(-1)
		expect(idxB).toBeGreaterThan(-1)
		// B (max 300) must precede A (max 200) in document order.
		expect(idxB).toBeLessThan(idxA)
	})

	it('A4: active session row has data-active="true", inactive has data-active="false"', () => {
		const a = makeSession('aaaa-1')
		const b = makeSession('bbbb-2')
		listQueryMock.data = {sessions: [a, b]}
		act(() => {
			root.render(
				<SessionSidebar activeSessionId='aaaa-1' onSelect={vi.fn()} />,
			)
		})
		const rows = Array.from(container.querySelectorAll('[data-active]'))
		expect(rows.length).toBeGreaterThanOrEqual(2)
		const activeRows = rows.filter((r) => r.getAttribute('data-active') === 'true')
		const inactiveRows = rows.filter((r) => r.getAttribute('data-active') === 'false')
		expect(activeRows.length).toBe(1)
		expect(inactiveRows.length).toBe(1)
	})

	it('A5: clicking a session row calls onSelect(sessionId)', () => {
		const onSelect = vi.fn()
		listQueryMock.data = {sessions: [makeSession('aaaa-1')]}
		act(() => {
			root.render(<SessionSidebar activeSessionId={null} onSelect={onSelect} />)
		})
		const openBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === 'Open session',
		) as HTMLButtonElement
		expect(openBtn).toBeTruthy()
		act(() => openBtn.click())
		expect(onSelect).toHaveBeenCalledWith('aaaa-1')
	})

	it('A6: clicking "+ New Session" invokes createMutation.mutate({})', () => {
		listQueryMock.data = {sessions: []}
		act(() => {
			root.render(<SessionSidebar activeSessionId={null} onSelect={vi.fn()} />)
		})
		const newBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === 'Create new session',
		) as HTMLButtonElement
		expect(newBtn).toBeTruthy()
		act(() => newBtn.click())
		expect(createMutationMock.mutate).toHaveBeenCalledTimes(1)
		expect(createMutationMock.mutate).toHaveBeenCalledWith({})
	})

	it('A7: createMutation.onSuccess refetches list AND calls onSelect(newId)', () => {
		const onSelect = vi.fn()
		listQueryMock.data = {sessions: []}
		act(() => {
			root.render(
				<SessionSidebar activeSessionId={null} onSelect={onSelect} />,
			)
		})
		// Invoke the captured onSuccess as if the mutation completed.
		expect(createMutationConfig.onSuccess).toBeTypeOf('function')
		act(() => {
			createMutationConfig.onSuccess!({session: {id: 'new-id-123'}})
		})
		expect(listQueryMock.refetch).toHaveBeenCalled()
		expect(onSelect).toHaveBeenCalledWith('new-id-123')
	})

	it('A8: rename via SessionItem inline-edit fires renameMutation.mutate({id, title})', () => {
		listQueryMock.data = {sessions: [makeSession('aaaa-1')]}
		act(() => {
			root.render(
				<SessionSidebar activeSessionId={null} onSelect={vi.fn()} />,
			)
		})
		// Open the actions menu
		const menuBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === 'Session actions',
		) as HTMLButtonElement
		expect(menuBtn).toBeTruthy()
		act(() => menuBtn.click())
		const renameItem = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Rename',
		) as HTMLButtonElement
		expect(renameItem).toBeTruthy()
		act(() => renameItem.click())
		// Now the input should be present
		const input = container.querySelector(
			'input[aria-label="Rename session"]',
		) as HTMLInputElement
		expect(input).toBeTruthy()
		// Simulate typing + Enter
		input.value = 'Renamed Title'
		act(() => {
			input.dispatchEvent(
				new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}),
			)
		})
		expect(renameMutationMock.mutate).toHaveBeenCalledWith({
			id: 'aaaa-1',
			title: 'Renamed Title',
		})
	})

	it('A9: delete via SessionItem 3-dot menu + window.confirm(true) fires deleteMutation.mutate({id})', () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
		listQueryMock.data = {sessions: [makeSession('aaaa-1')]}
		act(() => {
			root.render(
				<SessionSidebar activeSessionId={null} onSelect={vi.fn()} />,
			)
		})
		const menuBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === 'Session actions',
		) as HTMLButtonElement
		act(() => menuBtn.click())
		const deleteItem = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Delete',
		) as HTMLButtonElement
		expect(deleteItem).toBeTruthy()
		act(() => deleteItem.click())
		expect(confirmSpy).toHaveBeenCalled()
		expect(deleteMutationMock.mutate).toHaveBeenCalled()
		// First positional arg = {id: 'aaaa-1'}
		expect(deleteMutationMock.mutate.mock.calls[0][0]).toEqual({id: 'aaaa-1'})
		confirmSpy.mockRestore()
	})

	it('A10: refetchInterval literal `10_000` is present in SessionSidebar.tsx source', () => {
		const src = readFileSync(resolve(__dirname, 'SessionSidebar.tsx'), 'utf8')
		expect(src).toMatch(/refetchInterval:\s*10_000/)
	})
})

// ── Source-text invariants ────────────────────────────────────────────────

describe('SessionSidebar — source-text invariants (XSS + barrel)', () => {
	const SIDEBAR_SRC = readFileSync(
		resolve(__dirname, 'SessionSidebar.tsx'),
		'utf8',
	)
	const ITEM_SRC = readFileSync(resolve(__dirname, 'SessionItem.tsx'), 'utf8')
	const BUTTON_SRC = readFileSync(
		resolve(__dirname, 'NewSessionButton.tsx'),
		'utf8',
	)
	const BARREL_SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

	it('zero dangerouslySetInnerHTML across all 4 feature files (T-168-02-01)', () => {
		expect(SIDEBAR_SRC).not.toMatch(/dangerouslySetInnerHTML/)
		expect(ITEM_SRC).not.toMatch(/dangerouslySetInnerHTML/)
		expect(BUTTON_SRC).not.toMatch(/dangerouslySetInnerHTML/)
	})

	it('barrel re-exports SessionSidebar + SessionItem + NewSessionButton', () => {
		expect(BARREL_SRC).toMatch(/export\s*\{\s*SessionSidebar\s*\}/)
		expect(BARREL_SRC).toMatch(/export\s*\{\s*SessionItem\s*\}/)
		expect(BARREL_SRC).toMatch(/export\s*\{\s*NewSessionButton\s*\}/)
	})

	it('SessionSidebar wires trpcReact.ccPty.list / create / rename / delete', () => {
		expect(SIDEBAR_SRC).toMatch(/trpcReact\.ccPty\.list\.useQuery/)
		expect(SIDEBAR_SRC).toMatch(/trpcReact\.ccPty\.create\.useMutation/)
		expect(SIDEBAR_SRC).toMatch(/trpcReact\.ccPty\.rename\.useMutation/)
		expect(SIDEBAR_SRC).toMatch(/trpcReact\.ccPty\.delete\.useMutation/)
	})
})
