// @vitest-environment jsdom
//
// Phase 190-01 — BareTerminal unit tests.
//
// T-190-01-A: BareTerminal mounts without throwing
// T-190-01-B: WS client receives sessionId matching /^liv-bare-/ pattern
// T-190-01-C: BareTerminal exposes sendStdin ref handle (BareTerminalHandle)
// T-190-01-D: source-text — BareTerminal.tsx does NOT import AgentTerminalPane or StarterChips
// T-190-01-E: source-text — BareTerminal.tsx does NOT contain 'claude' command string
// T-190-01-F: sendStdin('ls\n') forwarded to WS mock sendStdin exactly once

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import React from 'react'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ─────────────────────────────────────────────────────────────────

const terminalCtorCalls: any[] = []
const mockTerm = {
	loadAddon: vi.fn(),
	open: vi.fn(),
	write: vi.fn(),
	onData: vi.fn(),
	dispose: vi.fn(),
	attachCustomKeyEventHandler: vi.fn(),
	getSelection: vi.fn(() => ''),
	clearSelection: vi.fn(),
	cols: 80,
	rows: 24,
	options: {} as Record<string, unknown>,
}

vi.mock('@xterm/xterm', () => ({
	Terminal: vi.fn().mockImplementation((opts: any) => {
		terminalCtorCalls.push(opts)
		return mockTerm
	}),
}))

const fitInstances: any[] = []
vi.mock('@xterm/addon-fit', () => ({
	FitAddon: vi.fn().mockImplementation(() => {
		const inst = {fit: vi.fn()}
		fitInstances.push(inst)
		return inst
	}),
}))

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

const wsInstances: Array<{
	url: string
	sessionId: string
	onStdout: (data: string) => void
	onAttached: (env: any) => void
	onError: (msg: string) => void
	sendStdin: ReturnType<typeof vi.fn>
	sendResize: ReturnType<typeof vi.fn>
	detach: ReturnType<typeof vi.fn>
}> = []

vi.mock('./terminal-ws-client', () => ({
	CcPtyWsClient: vi.fn().mockImplementation((opts: any) => {
		const inst = {
			url: opts.url,
			sessionId: opts.sessionId,
			onStdout: opts.onStdout,
			onAttached: opts.onAttached,
			onError: opts.onError,
			sendStdin: vi.fn(),
			sendResize: vi.fn(),
			detach: vi.fn(),
		}
		wsInstances.push(inst)
		return inst
	}),
}))

vi.mock('@/hooks/use-theme', () => ({
	useTheme: () => ({theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn()}),
}))

class MockResizeObserver {
	observe = vi.fn()
	disconnect = vi.fn()
	unobserve = vi.fn()
	constructor(_cb: ResizeObserverCallback) {}
}
;(globalThis as any).ResizeObserver = MockResizeObserver

// ── Test setup / teardown ─────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	terminalCtorCalls.length = 0
	fitInstances.length = 0
	wsInstances.length = 0
	mockTerm.loadAddon.mockClear()
	mockTerm.open.mockClear()
	mockTerm.write.mockClear()
	mockTerm.onData.mockClear()
	mockTerm.dispose.mockClear()
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

// ── Tests ─────────────────────────────────────────────────────────────────

import {BareTerminal, type BareTerminalHandle} from './BareTerminal'

describe('BareTerminal — Phase 190-01', () => {
	it('T-190-01-A: mounts without throwing (xterm mock, WS mock)', () => {
		act(() => {
			root.render(<BareTerminal sessionId='liv-bare-abc-12345678' />)
		})
		expect(container.querySelector('div')).not.toBeNull()
	})

	it('T-190-01-B: WS client receives sessionId matching /^liv-bare-/ pattern', () => {
		act(() => {
			root.render(<BareTerminal sessionId='liv-bare-test-deadbeef' />)
		})
		expect(wsInstances).toHaveLength(1)
		expect(wsInstances[0].sessionId).toMatch(/^liv-bare-/)
	})

	it('T-190-01-C: BareTerminal exposes sendStdin ref handle (BareTerminalHandle)', () => {
		const ref = React.createRef<BareTerminalHandle>()
		act(() => {
			root.render(<BareTerminal ref={ref} sessionId='liv-bare-test-abc12345' />)
		})
		expect(ref.current).not.toBeNull()
		expect(typeof ref.current!.sendStdin).toBe('function')
	})

	it('T-190-01-D: source-text — BareTerminal.tsx does NOT import AgentTerminalPane or StarterChips', () => {
		const SRC = readFileSync(resolve(__dirname, 'BareTerminal.tsx'), 'utf8')
		expect(SRC).not.toMatch(/AgentTerminalPane/)
		expect(SRC).not.toMatch(/StarterChips/)
	})

	it("T-190-01-E: source-text — BareTerminal.tsx does NOT contain 'claude' command string", () => {
		const SRC = readFileSync(resolve(__dirname, 'BareTerminal.tsx'), 'utf8')
		// Must not spawn claude; only plain bash
		expect(SRC).not.toMatch(/['"`]claude['"`]/)
		expect(SRC).not.toMatch(/command.*claude/)
	})

	it("T-190-01-F: sendStdin('ls\\n') forwarded to WS mock sendStdin exactly once", () => {
		const ref = React.createRef<BareTerminalHandle>()
		act(() => {
			root.render(<BareTerminal ref={ref} sessionId='liv-bare-test-abc12345' />)
		})
		expect(wsInstances).toHaveLength(1)
		ref.current!.sendStdin('ls\n')
		expect(wsInstances[0].sendStdin).toHaveBeenCalledTimes(1)
		expect(wsInstances[0].sendStdin).toHaveBeenCalledWith('ls\n')
	})
})
