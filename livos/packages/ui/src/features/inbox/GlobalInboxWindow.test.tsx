// @vitest-environment jsdom
//
// Phase 177-04 — GlobalInboxWindow tests (T-UI-09..T-UI-10).
//
// Pattern: vi.hoisted() for trpcReact mock; createRoot + act mount.
// All RED until GlobalInboxWindow.tsx is created.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── tRPC mock ─────────────────────────────────────────────────────────────────

const trpcGlobalMock = vi.hoisted(() => {
	const markReadMutate = vi.fn()
	const globalData: Array<{
		id: string
		agentId: string
		runId: string
		runAt: string
		triggeredBy: 'cron' | 'manual'
		durationMs: number
		status: 'success' | 'failed'
		read: boolean
		filePath: string
	}> = []
	return {markReadMutate, globalData}
})

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		vault: {
			inbox: {
				listGlobal: {
					useQuery: vi.fn(() => ({
						data: trpcGlobalMock.globalData,
						isLoading: false,
					})),
				},
				markRead: {
					useMutation: vi.fn(() => ({
						mutate: trpcGlobalMock.markReadMutate,
						isPending: false,
					})),
				},
			},
		},
	},
}))

// ── SUT (file doesn't exist yet → RED) ───────────────────────────────────────
import {GlobalInboxWindow} from './GlobalInboxWindow'

// ── Test setup ────────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	trpcGlobalMock.globalData.length = 0
	vi.clearAllMocks()
})

afterEach(() => {
	try {
		act(() => root.unmount())
	} catch {
		/* noop */
	}
	container.remove()
})

function makeEntry(agentId: string, runId: string) {
	return {
		id: `${agentId}/${runId}`,
		agentId,
		runId,
		runAt: '2024-01-01T10:00:00.000Z',
		triggeredBy: 'cron' as const,
		durationMs: 1000,
		status: 'success' as const,
		read: false,
		filePath: `/root/liv/items/${agentId}/inbox/${runId}.md`,
	}
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GlobalInboxWindow — Phase 177-04', () => {
	it('T-UI-09: renders a list of entries from listGlobal.useQuery mock data', () => {
		trpcGlobalMock.globalData.push(
			makeEntry('agent-A', 'run-1'),
			makeEntry('agent-B', 'run-2'),
		)
		act(() => {
			root.render(<GlobalInboxWindow />)
		})
		const window = container.querySelector('[data-testid="global-inbox-window"]')
		expect(window).not.toBeNull()
		const rows = container.querySelectorAll('[data-testid="global-inbox-entry"]')
		expect(rows.length).toBe(2)
	})

	it('T-UI-10: filter input narrows list to matching agentId', () => {
		trpcGlobalMock.globalData.push(
			makeEntry('agent-alpha', 'run-1'),
			makeEntry('agent-beta', 'run-2'),
			makeEntry('agent-alpha', 'run-3'),
		)
		act(() => {
			root.render(<GlobalInboxWindow />)
		})
		// Before filter: 3 rows
		expect(container.querySelectorAll('[data-testid="global-inbox-entry"]').length).toBe(3)

		const filterInput = container.querySelector('[data-testid="inbox-filter"]') as HTMLInputElement
		expect(filterInput).not.toBeNull()

		// Type 'beta' into the filter
		act(() => {
			const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
			nativeSetter.call(filterInput, 'beta')
			filterInput.dispatchEvent(new Event('input', {bubbles: true}))
			filterInput.dispatchEvent(new Event('change', {bubbles: true}))
		})

		// After filter: 1 row (agent-beta)
		const filtered = container.querySelectorAll('[data-testid="global-inbox-entry"]')
		expect(filtered.length).toBe(1)
	})
})
