// @vitest-environment jsdom
//
// Phase 189-01 — AgentTerminalPane tests (TDD RED first)
// 6 assertions covering: render, data-testid, CcTerminal props, ref forwarding, header.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act, createRef} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ──────────────────────────────────────────────────────────────────

const sendStdinMock = vi.fn()
const ccTerminalHandleMock = {sendStdin: sendStdinMock}

// Phase 189-04 — StarterChips mock to assert hidden prop behavior.
vi.mock('./StarterChips', () => ({
	StarterChips: ({hidden, onPick}: {hidden?: boolean; onPick: (p: string) => void}) => (
		<div
			data-testid='starter-chips'
			data-hidden={String(hidden ?? false)}
			onClick={() => onPick('Tell me what you can do')}
		/>
	),
	STARTER_CHIP_PROMPTS: [
		'Tell me what you can do',
		'Schedule a daily summary',
		'Watch a folder for changes',
		'Help me plan something',
	],
}))

// vi.hoisted — CcTerminal mock returns a div with data attrs + exposes handle ref
vi.mock('@/features/cc-terminal/CcTerminal', () => {
	const {forwardRef} = require('react')
	return {
		CcTerminal: forwardRef(
			(
				{sessionId, cwd}: {sessionId: string; cwd?: string},
				ref: React.Ref<{sendStdin: (data: string) => void}>,
			) => {
				// expose handle via ref
				const {useImperativeHandle} = require('react')
				useImperativeHandle(ref, () => ccTerminalHandleMock, [])
				return (
					<div
						data-testid='mock-cc-terminal'
						data-session-id={sessionId}
						data-cwd={cwd}
					/>
				)
			},
		),
	}
})

// ── Helpers ────────────────────────────────────────────────────────────────

const AGENT_ITEM = {id: 'agent-id-000000000001', name: 'TestAgent', type: 'agent' as const}

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
		/* already unmounted */
	}
	container.remove()
})

import {AgentTerminalPane, type AgentTerminalPaneHandle} from './AgentTerminalPane'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AgentTerminalPane — Phase 189-01', () => {
	it('A-01: renders without crashing given agentItem + userId', () => {
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' />)
		})
		expect(container.textContent).toBeTruthy()
	})

	it('A-02: renders a div with data-testid="agent-terminal-pane"', () => {
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' />)
		})
		expect(container.querySelector('[data-testid="agent-terminal-pane"]')).not.toBeNull()
	})

	it('A-03: CcTerminal is mounted with sessionId="liv-agent-agent-id-000000000001"', () => {
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' />)
		})
		const ccTerm = container.querySelector('[data-testid="mock-cc-terminal"]')
		expect(ccTerm).not.toBeNull()
		expect(ccTerm?.getAttribute('data-session-id')).toBe('liv-agent-agent-id-000000000001')
	})

	it('A-04: CcTerminal is mounted with cwd="~/liv/items/TestAgent/"', () => {
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' />)
		})
		const ccTerm = container.querySelector('[data-testid="mock-cc-terminal"]')
		expect(ccTerm?.getAttribute('data-cwd')).toBe('~/liv/items/TestAgent/')
	})

	it('A-05: forwards a ref (terminalRef) with a sendStdin function', () => {
		const ref = createRef<AgentTerminalPaneHandle>()
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' ref={ref} />)
		})
		expect(typeof ref.current?.sendStdin).toBe('function')
		// calling sendStdin on the pane should call CcTerminal's sendStdin
		act(() => {
			ref.current?.sendStdin('hello')
		})
		expect(sendStdinMock).toHaveBeenCalledWith('hello')
	})

	it('A-06: renders a header row containing the agent name "TestAgent"', () => {
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' />)
		})
		expect(container.textContent).toContain('TestAgent')
	})
})

// ── Phase 189-04 — StarterChips integration assertions ────────────────────

describe('AgentTerminalPane — Phase 189-04 StarterChips', () => {
	it('P-01: when chipsVisible=true (initial state), StarterChips is in the document', () => {
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' />)
		})
		const chips = container.querySelector('[data-testid="starter-chips"]')
		expect(chips).not.toBeNull()
		expect(chips?.getAttribute('data-hidden')).toBe('false')
	})

	it('P-02: after handleChipPick is called (via click on StarterChips mock), chips hide', () => {
		act(() => {
			root.render(<AgentTerminalPane agentItem={AGENT_ITEM} userId='u1' />)
		})
		// Click the starter-chips mock (which calls onPick)
		const chips = container.querySelector('[data-testid="starter-chips"]') as HTMLElement
		expect(chips).not.toBeNull()
		act(() => {
			chips.click()
		})
		// After chip pick, hidden should be true
		const chipsAfter = container.querySelector('[data-testid="starter-chips"]')
		expect(chipsAfter?.getAttribute('data-hidden')).toBe('true')
	})
})
