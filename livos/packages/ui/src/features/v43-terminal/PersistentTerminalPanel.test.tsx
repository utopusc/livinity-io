// @vitest-environment jsdom
//
// Phase 243-03 Task 2 — PersistentTerminalPanel component tests.
//
// Coverage:
//   1. On mount: useTerminalWs receives an onOpen callback that, when
//      invoked, triggers `send` with {type:'init', cols:<number>, rows:<number>}.
//   2. onMessage({type:'data', data:'hello'}) → terminal.write('hello').
//   3. onMessage({type:'exit', code:0, signal:null}) → terminal.writeln
//      called with a string matching /session exited.*code=0/.
//   4. onMessage({type:'error', message:'boom'}) → terminal.writeln called
//      with a string containing '[error] boom'.
//
// Both `useTerminalWs` and `@xterm/xterm` Terminal constructor are mocked
// so the test runs fully synchronously without touching real WS / xterm.
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Captured per-mount hook arguments + last `send` spy.
let capturedOpts: {
	onMessage: (msg: any) => void
	onOpen?: () => void
	onClose?: () => void
} | null = null
let sendSpy = vi.fn()

vi.mock('./use-terminal-ws', () => ({
	useTerminalWs: (opts: any) => {
		capturedOpts = opts
		return {send: sendSpy, readyState: 1}
	},
}))

// Captured terminal mock surface.
let terminalMock: {
	write: ReturnType<typeof vi.fn>
	writeln: ReturnType<typeof vi.fn>
	onData: ReturnType<typeof vi.fn>
	loadAddon: ReturnType<typeof vi.fn>
	open: ReturnType<typeof vi.fn>
	dispose: ReturnType<typeof vi.fn>
}

vi.mock('@xterm/xterm', () => ({
	Terminal: vi.fn().mockImplementation(() => terminalMock),
}))

vi.mock('@xterm/addon-fit', () => ({
	FitAddon: vi.fn().mockImplementation(() => ({
		fit: vi.fn(),
		// proposeDimensions used to derive cols/rows for init.
		proposeDimensions: vi.fn(() => ({cols: 100, rows: 30})),
	})),
}))

vi.mock('@xterm/addon-web-links', () => ({
	WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}))

// xterm.css side-effect import — stub it out for jsdom.
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// Stub ResizeObserver — jsdom doesn't ship one by default and we don't
// need to exercise resize messages from these tests.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
	;(globalThis as any).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
}

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// Import AFTER mocks so the component picks up the stubbed dependencies.
import PersistentTerminalPanel from './PersistentTerminalPanel'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	terminalMock = {
		write: vi.fn(),
		writeln: vi.fn(),
		onData: vi.fn(),
		loadAddon: vi.fn(),
		open: vi.fn(),
		dispose: vi.fn(),
	}
	sendSpy = vi.fn()
	capturedOpts = null
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
})

describe('PersistentTerminalPanel — Phase 243-03', () => {
	it('1) onOpen() → send({type:"init", cols:<number>, rows:<number>})', () => {
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		expect(capturedOpts).not.toBeNull()
		expect(capturedOpts!.onOpen).toBeTypeOf('function')

		// Simulate WS open.
		act(() => {
			capturedOpts!.onOpen!()
		})

		expect(sendSpy).toHaveBeenCalledTimes(1)
		const sent = sendSpy.mock.calls[0][0]
		expect(sent).toMatchObject({type: 'init'})
		expect(typeof sent.cols).toBe('number')
		expect(typeof sent.rows).toBe('number')
		expect(sent.cols).toBeGreaterThan(0)
		expect(sent.rows).toBeGreaterThan(0)
	})

	it('2) onMessage({type:"data", data:"hello"}) → terminal.write("hello")', () => {
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		act(() => {
			capturedOpts!.onMessage({type: 'data', data: 'hello'})
		})
		expect(terminalMock.write).toHaveBeenCalledWith('hello')
	})

	it('3) onMessage({type:"exit", code:0, signal:null}) → terminal.writeln matches /session exited.*code=0/', () => {
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		act(() => {
			capturedOpts!.onMessage({type: 'exit', code: 0, signal: null})
		})
		expect(terminalMock.writeln).toHaveBeenCalled()
		const writelnCalls = terminalMock.writeln.mock.calls.map((c) => String(c[0]))
		const matched = writelnCalls.some((s) => /session exited.*code=0/.test(s))
		expect(matched).toBe(true)
	})

	it('4) onMessage({type:"error", message:"boom"}) → terminal.writeln contains "[error] boom"', () => {
		act(() => {
			root!.render(<PersistentTerminalPanel />)
		})
		act(() => {
			capturedOpts!.onMessage({type: 'error', message: 'boom'})
		})
		expect(terminalMock.writeln).toHaveBeenCalled()
		const writelnCalls = terminalMock.writeln.mock.calls.map((c) => String(c[0]))
		const matched = writelnCalls.some((s) => s.includes('[error] boom'))
		expect(matched).toBe(true)
	})
})
