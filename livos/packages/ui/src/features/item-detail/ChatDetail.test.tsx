// @vitest-environment jsdom
//
// Phase 175-03 — ChatDetail thin-wrapper tests (3 assertions B-03-C-1..B-03-C-3).
// CcTerminal is mocked — the real component spawns a WS pipeline jsdom can't satisfy.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/features/cc-terminal', () => ({
	CcTerminal: (props: {sessionId: string}) => (
		<div data-testid='cc-terminal-mounted' data-session-id={props.sessionId} />
	),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	try {
		act(() => root.unmount())
	} catch {
		/* noop */
	}
	container.remove()
})

import {ChatDetail} from './ChatDetail'

describe('ChatDetail — Phase 175-03', () => {
	it('B-03-C-1: no ccSessionId → empty state, no CcTerminal mounted', () => {
		act(() => {
			root.render(<ChatDetail item={{id: 'c1', name: 'chat'}} />)
		})
		expect(container.querySelector('[data-testid="chat-no-session"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="cc-terminal-mounted"]')).toBeNull()
	})

	it('B-03-C-2: ccSessionId set → CcTerminal mounted with correct sessionId', () => {
		act(() => {
			root.render(
				<ChatDetail item={{id: 'c1', name: 'chat', ccSessionId: 'sess-abc-123'}} />,
			)
		})
		const term = container.querySelector('[data-testid="cc-terminal-mounted"]')
		expect(term).not.toBeNull()
		expect(term!.getAttribute('data-session-id')).toBe('sess-abc-123')
		expect(container.querySelector('[data-testid="chat-no-session"]')).toBeNull()
	})

	it('B-03-C-3: source-text invariants — imports CcTerminal from cc-terminal feature', () => {
		const src = readFileSync(resolve(__dirname, 'ChatDetail.tsx'), 'utf8')
		expect(src).toMatch(/from '@\/features\/cc-terminal'/)
		expect(src).toMatch(/CcTerminal/)
		expect(src).toMatch(/sessionId/)
	})
})
