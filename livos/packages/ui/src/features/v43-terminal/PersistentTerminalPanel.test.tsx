// @vitest-environment jsdom
//
// Phase 246-04 Task 3 — PersistentTerminalPanel multi-tab tests.
//
// Coverage (5 cases — spirit-preserved from Phase 243's 4 cases):
//   1. Empty localStorage on mount → exactly 1 default tab opens in create mode.
//   2. Two saved sessions in localStorage on mount → 2 tabs open in attach mode
//      (each with the corresponding sessionId).
//   3. Receiving {type:'reattached', scrollback:['hello\r\n']} → terminal.write
//      called with 'hello\r\n' (drift-locks the replay branch).
//   4. Receiving {type:'data', data:'world'} → terminal.write('world').
//   5. Clicking "+ New" → useTerminalWs called with mode:'create' for the
//      new pane AND tabs count increases by 1.
//
// `useTerminalWs` is mocked so we can inspect call args + simulate inbound
// messages synchronously. `@xterm/xterm` Terminal constructor is mocked.
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Captured: every useTerminalWs invocation's opts object (one per tab pane).
let capturedHookOpts: Array<{
	mode?: 'create' | 'attach'
	sessionId?: string
	onMessage: (msg: any) => void
	onOpen?: () => void
	onClose?: (event?: any) => void
}> = []
let sendSpies: Array<ReturnType<typeof vi.fn>> = []

vi.mock('./use-terminal-ws', () => ({
	useTerminalWs: (opts: any) => {
		capturedHookOpts.push(opts)
		const spy = vi.fn()
		sendSpies.push(spy)
		return {send: spy, readyState: 1}
	},
}))

// Captured terminal mocks — one per tab pane (xterm Terminal is constructed
// per-pane). We track the last-constructed terminal so the data/reattached
// tests can target it directly.
let terminalMocks: Array<{
	write: ReturnType<typeof vi.fn>
	writeln: ReturnType<typeof vi.fn>
	onData: ReturnType<typeof vi.fn>
	loadAddon: ReturnType<typeof vi.fn>
	open: ReturnType<typeof vi.fn>
	dispose: ReturnType<typeof vi.fn>
	// Phase 246 hot-fix — clipboard surface used by the copy/paste handler.
	attachCustomKeyEventHandler: ReturnType<typeof vi.fn>
	getSelection: ReturnType<typeof vi.fn>
	onSelectionChange: ReturnType<typeof vi.fn>
	paste: ReturnType<typeof vi.fn>
	selectAll: ReturnType<typeof vi.fn>
	clear: ReturnType<typeof vi.fn>
}> = []

vi.mock('@xterm/xterm', () => ({
	Terminal: vi.fn().mockImplementation(() => {
		const m = {
			write: vi.fn(),
			writeln: vi.fn(),
			onData: vi.fn(),
			loadAddon: vi.fn(),
			open: vi.fn(),
			dispose: vi.fn(),
			// Phase 246 hot-fix — clipboard surface used by the copy/paste handler.
			attachCustomKeyEventHandler: vi.fn(),
			getSelection: vi.fn().mockReturnValue(''),
			// Phase 252 (G19.2) — auto-copy-on-selection registers a listener
			// via onSelectionChange; it returns an xterm IDisposable.
			onSelectionChange: vi.fn(() => ({dispose: vi.fn()})),
			paste: vi.fn(),
			selectAll: vi.fn(),
			clear: vi.fn(),
		}
		terminalMocks.push(m)
		return m
	}),
}))

vi.mock('@xterm/addon-fit', () => ({
	FitAddon: vi.fn().mockImplementation(() => ({
		fit: vi.fn(),
		proposeDimensions: vi.fn(() => ({cols: 100, rows: 30})),
	})),
}))

vi.mock('@xterm/addon-web-links', () => ({
	WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@xterm/addon-webgl', () => ({
	WebglAddon: vi.fn().mockImplementation(() => ({
		onContextLoss: vi.fn(),
		dispose: vi.fn(),
	})),
}))

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// Stub uuidv7 so generated tab keys are deterministic across tests.
let uuidCounter = 0
vi.mock('uuidv7', () => ({
	uuidv7: () => {
		uuidCounter += 1
		return `uuid-${uuidCounter}`
	},
}))

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
	;(globalThis as any).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
}

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// Import AFTER mocks.
import PersistentTerminalPanel from './PersistentTerminalPanel'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	capturedHookOpts = []
	sendSpies = []
	terminalMocks = []
	uuidCounter = 0
	window.localStorage.clear()
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
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
	window.localStorage.clear()
})

describe('PersistentTerminalPanel — Phase 246-04 (multi-tab)', () => {
	it('1) empty localStorage → 1 default tab opens in create mode', () => {
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		// Exactly 1 tab pane rendered.
		const panes = container!.querySelectorAll('[data-test-tab-pane]')
		expect(panes).toHaveLength(1)
		// Exactly 1 useTerminalWs invocation, in create mode.
		expect(capturedHookOpts).toHaveLength(1)
		expect(capturedHookOpts[0].mode).toBe('create')
		expect(capturedHookOpts[0].sessionId).toBeUndefined()
		// The tab bar shows 1 tab.
		const tabs = container!.querySelectorAll('[data-test-tab]')
		expect(tabs).toHaveLength(1)
	})

	it('2) two saved sessions in localStorage → 2 tabs open in attach mode', () => {
		window.localStorage.setItem(
			'livos.v44.terminal.session.tab-saved-A',
			'sess-AAA',
		)
		window.localStorage.setItem(
			'livos.v44.terminal.session.tab-saved-B',
			'sess-BBB',
		)
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		expect(capturedHookOpts).toHaveLength(2)
		const modes = capturedHookOpts.map((o) => o.mode)
		const ids = capturedHookOpts.map((o) => o.sessionId)
		expect(modes).toEqual(['attach', 'attach'])
		expect(ids.sort()).toEqual(['sess-AAA', 'sess-BBB'])
	})

	it('3) {type:"reattached", scrollback:["hello\\r\\n"]} → terminal.write("hello\\r\\n")', () => {
		window.localStorage.setItem(
			'livos.v44.terminal.session.tab-X',
			'sess-X',
		)
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		expect(capturedHookOpts).toHaveLength(1)
		act(() => {
			capturedHookOpts[0].onMessage({
				type: 'reattached',
				sessionId: 'sess-X',
				scrollback: ['hello\r\n'],
			})
		})
		// First-constructed terminal mock = this tab's pane.
		expect(terminalMocks[0].write).toHaveBeenCalledWith('hello\r\n')
	})

	it('4) {type:"data", data:"world"} → terminal.write("world")', () => {
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		act(() => {
			capturedHookOpts[0].onMessage({type: 'data', data: 'world'})
		})
		expect(terminalMocks[0].write).toHaveBeenCalledWith('world')
	})

	it('5) clicking "+ New" → useTerminalWs called with mode:"create" for new pane + tab count +1', () => {
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		const panesBefore = container!.querySelectorAll('[data-test-tab-pane]').length
		const tabsBefore = container!.querySelectorAll('[data-test-tab]').length
		const createBtn = container!.querySelector(
			"[data-test='terminal-tab-create']",
		) as HTMLElement
		expect(createBtn).not.toBeNull()
		act(() => {
			createBtn.dispatchEvent(
				new MouseEvent('click', {bubbles: true, cancelable: true}),
			)
		})
		// Pane count grew by exactly 1 (the new tab).
		const panesAfter = container!.querySelectorAll('[data-test-tab-pane]').length
		expect(panesAfter).toBe(panesBefore + 1)
		const tabsAfter = container!.querySelectorAll('[data-test-tab]').length
		expect(tabsAfter).toBe(tabsBefore + 1)
		// Most recently captured hook opts (the new pane's mount) is create mode
		// with no sessionId. Earlier entries may be re-render captures of the
		// existing pane — we only assert on the newest capture.
		const latest = capturedHookOpts[capturedHookOpts.length - 1]
		expect(latest.mode).toBe('create')
		expect(latest.sessionId).toBeUndefined()
	})
})
