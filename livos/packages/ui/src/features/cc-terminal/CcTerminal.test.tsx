// @vitest-environment jsdom
//
// Phase 167-01 — CcTerminal unit tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — `@testing-library/react` is not
// installed (see livos/packages/ui/src/components/highlighted-text.unit.test.tsx
// header for the established precedent). This suite combines:
//   - Mocked @xterm/xterm + addon-fit + ./terminal-ws-client + useTheme hook
//   - Direct react-dom/client mount via `act()` for lifecycle assertions
//   - Source-text invariants on CcTerminal.tsx for grep-locked contracts

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ─────────────────────────────────────────────────────────────────

// xterm.js Terminal — captures constructor args + provides stub methods.
const terminalCtorCalls: any[] = []
const mockTerm = {
	loadAddon: vi.fn(),
	open: vi.fn(),
	write: vi.fn(),
	onData: vi.fn(),
	dispose: vi.fn(),
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

// FitAddon — constructor + .fit() stub.
const fitInstances: any[] = []
vi.mock('@xterm/addon-fit', () => ({
	FitAddon: vi.fn().mockImplementation(() => {
		const inst = {fit: vi.fn()}
		fitInstances.push(inst)
		return inst
	}),
}))

// xterm css side-effect import — no-op.
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// ./terminal-ws-client — stub class with spied methods.
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

// useTheme hook — return a stable mock theme.
vi.mock('@/hooks/use-theme', () => ({
	useTheme: () => ({theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn()}),
}))

// ResizeObserver capture — store callback so tests can invoke it.
let lastRoCallback: ResizeObserverCallback | null = null
class MockResizeObserver {
	observe = vi.fn()
	disconnect = vi.fn()
	unobserve = vi.fn()
	constructor(cb: ResizeObserverCallback) {
		lastRoCallback = cb
	}
}
;(globalThis as any).ResizeObserver = MockResizeObserver

// ── Test setup / teardown ─────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	terminalCtorCalls.length = 0
	fitInstances.length = 0
	wsInstances.length = 0
	lastRoCallback = null
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
	act(() => root.unmount())
	container.remove()
})

// ── Lifecycle tests ───────────────────────────────────────────────────────

import {CcTerminal} from './CcTerminal'

describe('CcTerminal', () => {
	it('mounts <CcTerminal sessionId="abc" /> without throwing', () => {
		act(() => {
			root.render(<CcTerminal sessionId='abc' />)
		})
		expect(container.querySelector('div')).not.toBeNull()
	})

	it('renders container div with h-full w-full bg-bg classes', () => {
		act(() => {
			root.render(<CcTerminal sessionId='abc' />)
		})
		const div = container.querySelector('div')
		expect(div?.className).toContain('h-full')
		expect(div?.className).toContain('w-full')
		expect(div?.className).toContain('bg-bg')
	})

	it('constructs Terminal with fontFamily JetBrains Mono, fontSize 13, cursorBlink true, scrollback 5000', () => {
		act(() => {
			root.render(<CcTerminal sessionId='abc' />)
		})
		expect(terminalCtorCalls).toHaveLength(1)
		expect(terminalCtorCalls[0].fontFamily).toBe('"JetBrains Mono", monospace')
		expect(terminalCtorCalls[0].fontSize).toBe(13)
		expect(terminalCtorCalls[0].cursorBlink).toBe(true)
		expect(terminalCtorCalls[0].scrollback).toBe(5000)
	})

	it('loads FitAddon (1 loadAddon call after addon trimming per D-NEW-DEPS-v35)', () => {
		act(() => {
			root.render(<CcTerminal sessionId='abc' />)
		})
		expect(mockTerm.loadAddon).toHaveBeenCalledTimes(1)
		expect(fitInstances).toHaveLength(1)
	})

	it('constructs CcPtyWsClient with the sessionId prop', () => {
		act(() => {
			root.render(<CcTerminal sessionId='my-session-42' />)
		})
		expect(wsInstances).toHaveLength(1)
		expect(wsInstances[0].sessionId).toBe('my-session-42')
		expect(wsInstances[0].url).toMatch(/\/ws\/cc-pty$/)
	})

	it('term.onData callback forwards to ws.sendStdin', () => {
		act(() => {
			root.render(<CcTerminal sessionId='abc' />)
		})
		// Capture the onData callback xterm received
		expect(mockTerm.onData).toHaveBeenCalledTimes(1)
		const onDataCb = mockTerm.onData.mock.calls[0][0] as (s: string) => void
		onDataCb('typed-char')
		expect(wsInstances[0].sendStdin).toHaveBeenCalledWith('typed-char')
	})

	it('unmount triggers term.dispose() and ws.detach()', () => {
		act(() => {
			root.render(<CcTerminal sessionId='abc' />)
		})
		expect(mockTerm.dispose).not.toHaveBeenCalled()
		expect(wsInstances[0].detach).not.toHaveBeenCalled()
		act(() => {
			root.unmount()
		})
		expect(mockTerm.dispose).toHaveBeenCalledTimes(1)
		expect(wsInstances[0].detach).toHaveBeenCalledTimes(1)
		// re-render a no-op so afterEach's unmount doesn't double-unmount
		container = document.createElement('div')
		document.body.appendChild(container)
		root = createRoot(container)
	})

	it('ResizeObserver callback triggers fit.fit() and ws.sendResize(cols, rows)', () => {
		act(() => {
			root.render(<CcTerminal sessionId='abc' />)
		})
		expect(lastRoCallback).not.toBeNull()
		const initialFitCalls = fitInstances[0].fit.mock.calls.length
		act(() => {
			lastRoCallback!([], {} as ResizeObserver)
		})
		// fit.fit() called at mount + by the RO callback
		expect(fitInstances[0].fit.mock.calls.length).toBe(initialFitCalls + 1)
		expect(wsInstances[0].sendResize).toHaveBeenCalledWith(80, 24)
	})
})

// ── Source-text invariants ─────────────────────────────────────────────────

describe('CcTerminal — source-text invariants', () => {
	const SRC = readFileSync(resolve(__dirname, 'CcTerminal.tsx'), 'utf8')

	it('imports @xterm/xterm + @xterm/addon-fit + xterm.css', () => {
		expect(SRC).toMatch(/from\s+['"]@xterm\/xterm['"]/)
		expect(SRC).toMatch(/from\s+['"]@xterm\/addon-fit['"]/)
		expect(SRC).toMatch(/['"]@xterm\/xterm\/css\/xterm\.css['"]/)
	})

	it('cleanup contains term.dispose() + ws.detach() + ro.disconnect()', () => {
		expect(SRC).toMatch(/term\.dispose\(\)/)
		expect(SRC).toMatch(/ws\.detach\(\)/)
		expect(SRC).toMatch(/ro\.disconnect\(\)/)
	})

	it('uses /ws/cc-pty path (matches Phase 166-04 server mount)', () => {
		expect(SRC).toMatch(/\/ws\/cc-pty/)
	})
})
