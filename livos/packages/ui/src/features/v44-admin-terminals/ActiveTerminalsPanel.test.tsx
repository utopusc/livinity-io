// @vitest-environment jsdom
//
// Phase 246-05 Task 3 — ActiveTerminalsPanel component tests.
//
// Coverage (4 cases):
//   1. Feature flag OFF → component renders null (no panel testid in DOM).
//   2. Flag ON + empty list → empty-state message rendered.
//   3. Flag ON + 2 sessions → 2 session rows + 2 Kill buttons rendered.
//   4. Clicking a Kill button → killSession.mutate called with {id: row's id}.
//
// Same pattern as Phase 246-04 TerminalTabBar test — raw react-dom/client +
// jsdom, no @testing-library/react dep (D-NO-NEW-DEPS in @livos/ui).
//
// trpcReact and useTerminalPanelEnabled are vi.mocked at the top of the file
// so each test can configure return values via the mocked references.
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@/hooks/use-terminal-panel-enabled', () => ({
	useTerminalPanelEnabled: vi.fn(),
}))

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		ptySessions: {
			listSessions: {useQuery: vi.fn()},
			killSession: {useMutation: vi.fn()},
		},
	},
}))

// Resolve the mocked refs AFTER vi.mock so we can drive them per-test.
import {useTerminalPanelEnabled} from '@/hooks/use-terminal-panel-enabled'
import {trpcReact} from '@/trpc/trpc'
import {ActiveTerminalsPanel} from './ActiveTerminalsPanel'

const mockedFlag = vi.mocked(useTerminalPanelEnabled)
const mockedListQuery = vi.mocked(trpcReact.ptySessions.listSessions.useQuery)
const mockedKillMutation = vi.mocked(trpcReact.ptySessions.killSession.useMutation)

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	mockedFlag.mockReset()
	mockedListQuery.mockReset()
	mockedKillMutation.mockReset()
})

afterEach(() => {
	if (root) {
		act(() => {
			root!.unmount()
		})
	}
	root = null
	if (container?.parentNode) container.parentNode.removeChild(container)
	container = null
})

function setKillMutation(mutate = vi.fn(), isPending = false) {
	mockedKillMutation.mockReturnValue({
		mutate,
		isPending,
		mutateAsync: vi.fn(),
		reset: vi.fn(),
	} as any)
	return mutate
}

describe('ActiveTerminalsPanel — Phase 246-05', () => {
	it('1) flag OFF → component renders null (no [data-testid=active-terminals-panel] in DOM)', () => {
		mockedFlag.mockReturnValue(false)
		mockedListQuery.mockReturnValue({
			isLoading: false,
			isError: false,
			data: [],
			refetch: vi.fn(),
		} as any)
		setKillMutation()

		act(() => {
			root!.render(<ActiveTerminalsPanel />)
		})

		expect(container!.querySelector('[data-testid="active-terminals-panel"]')).toBeNull()
		expect(container!.textContent ?? '').not.toContain('Active terminals')
	})

	it('2) flag ON + empty list → empty-state message renders', () => {
		mockedFlag.mockReturnValue(true)
		mockedListQuery.mockReturnValue({
			isLoading: false,
			isError: false,
			data: [],
			refetch: vi.fn(),
		} as any)
		setKillMutation()

		act(() => {
			root!.render(<ActiveTerminalsPanel />)
		})

		expect(container!.querySelector('[data-testid="active-terminals-panel"]')).not.toBeNull()
		expect(container!.querySelector('[data-testid="active-terminals-empty"]')).not.toBeNull()
		expect(container!.textContent).toContain('No active terminal sessions.')
		expect(container!.querySelectorAll('[data-testid^="session-row-"]')).toHaveLength(0)
	})

	it('3) flag ON + 2 sessions → 2 rows + 2 Kill buttons rendered with names', () => {
		mockedFlag.mockReturnValue(true)
		mockedListQuery.mockReturnValue({
			isLoading: false,
			isError: false,
			data: [
				{
					id: 'sess-a-uuid',
					name: 'terminal-1',
					createdAt: '2026-05-28T22:00:00.000Z',
					lastAttachAt: '2026-05-28T23:00:00.000Z',
				},
				{
					id: 'sess-b-uuid',
					name: 'terminal-2',
					createdAt: '2026-05-28T21:00:00.000Z',
					lastAttachAt: '2026-05-28T23:30:00.000Z',
				},
			],
			refetch: vi.fn(),
		} as any)
		setKillMutation()

		act(() => {
			root!.render(<ActiveTerminalsPanel />)
		})

		const rows = container!.querySelectorAll('[data-testid^="session-row-"]')
		expect(rows).toHaveLength(2)
		expect(rows[0].getAttribute('data-testid')).toBe('session-row-sess-a-uuid')
		expect(rows[1].getAttribute('data-testid')).toBe('session-row-sess-b-uuid')

		const killButtons = container!.querySelectorAll('[data-testid^="kill-button-"]')
		expect(killButtons).toHaveLength(2)

		expect(container!.textContent).toContain('terminal-1')
		expect(container!.textContent).toContain('terminal-2')
	})

	it('4) clicking a Kill button calls killSession.mutate with {id: row id}', () => {
		const mutate = vi.fn()
		mockedFlag.mockReturnValue(true)
		mockedListQuery.mockReturnValue({
			isLoading: false,
			isError: false,
			data: [
				{
					id: 'sess-a-uuid',
					name: 'terminal-1',
					createdAt: '2026-05-28T22:00:00.000Z',
					lastAttachAt: '2026-05-28T23:00:00.000Z',
				},
				{
					id: 'sess-b-uuid',
					name: 'terminal-2',
					createdAt: '2026-05-28T21:00:00.000Z',
					lastAttachAt: '2026-05-28T23:30:00.000Z',
				},
			],
			refetch: vi.fn(),
		} as any)
		setKillMutation(mutate)

		act(() => {
			root!.render(<ActiveTerminalsPanel />)
		})

		const killA = container!.querySelector(
			'[data-testid="kill-button-sess-a-uuid"]',
		) as HTMLButtonElement
		expect(killA).not.toBeNull()

		act(() => {
			killA.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))
		})

		expect(mutate).toHaveBeenCalledTimes(1)
		expect(mutate).toHaveBeenCalledWith({id: 'sess-a-uuid'})
	})
})
