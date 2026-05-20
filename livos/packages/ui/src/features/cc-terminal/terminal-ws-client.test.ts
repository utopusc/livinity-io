// @vitest-environment jsdom
//
// Phase 167-02 — CcPtyWsClient unit tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — `@testing-library/react` is not
// installed and the `ws` Node package is server-side only. We instead stub
// `globalThis.WebSocket` with a controllable fake class so each `it(...)`
// block can drive open/message/close events synchronously, matching the
// repo's established mocking pattern.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CcPtyWsClient} from './terminal-ws-client'

// ── atob polyfill (jsdom has it but node-only test runs may not) ──────────
if (typeof globalThis.atob === 'undefined') {
	;(globalThis as any).atob = (s: string) => Buffer.from(s, 'base64').toString('binary')
}

// ── Fake WebSocket implementation ─────────────────────────────────────────
//
// A minimal stub that captures sent frames + lets the test fire
// open/message/close events in a controlled order. We track every constructed
// instance in `mockWsInstances` so tests can assert reconnect behavior.

const CONNECTING = 0
const OPEN = 1
const CLOSING = 2
const CLOSED = 3

class MockWebSocket {
	static CONNECTING = CONNECTING
	static OPEN = OPEN
	static CLOSING = CLOSING
	static CLOSED = CLOSED
	CONNECTING = CONNECTING
	OPEN = OPEN
	CLOSING = CLOSING
	CLOSED = CLOSED

	readyState: number = CONNECTING
	url: string
	sent: string[] = []
	onopen: ((ev?: unknown) => void) | null = null
	onmessage: ((ev: {data: string}) => void) | null = null
	onclose: ((ev?: unknown) => void) | null = null
	onerror: ((ev?: unknown) => void) | null = null

	constructor(url: string) {
		this.url = url
		mockWsInstances.push(this)
	}

	send(data: string) {
		this.sent.push(data)
	}

	close() {
		this.readyState = CLOSED
		// Fire onclose async to mimic real WebSocket lifecycle? Real WS fires async,
		// but synchronous fire is fine for our tests because reconnect uses setTimeout.
		this.onclose?.()
	}

	// Test helpers
	__fireOpen() {
		this.readyState = OPEN
		this.onopen?.()
	}

	__fireMessage(data: string) {
		this.onmessage?.({data})
	}

	__fireClose() {
		this.readyState = CLOSED
		this.onclose?.()
	}
}

let mockWsInstances: MockWebSocket[] = []
const realWebSocket = globalThis.WebSocket

beforeEach(() => {
	mockWsInstances = []
	;(globalThis as any).WebSocket = MockWebSocket
})

afterEach(() => {
	vi.useRealTimers()
	;(globalThis as any).WebSocket = realWebSocket
})

describe('CcPtyWsClient', () => {
	it('sends attach envelope on open with given sessionId', () => {
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-abc',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError: vi.fn(),
		})
		expect(mockWsInstances).toHaveLength(1)
		mockWsInstances[0].__fireOpen()
		expect(mockWsInstances[0].sent).toHaveLength(1)
		expect(JSON.parse(mockWsInstances[0].sent[0])).toEqual({
			type: 'attach',
			sessionId: 'sess-abc',
		})
		client.detach()
	})

	it('forwards attached envelope to onAttached callback', () => {
		const onAttached = vi.fn()
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached,
			onError: vi.fn(),
		})
		mockWsInstances[0].__fireOpen()
		mockWsInstances[0].__fireMessage(
			JSON.stringify({
				type: 'attached',
				session: {id: 'sess-1', pid: 42, cols: 80, rows: 24},
			}),
		)
		expect(onAttached).toHaveBeenCalledTimes(1)
		expect(onAttached).toHaveBeenCalledWith({
			session: {id: 'sess-1', pid: 42, cols: 80, rows: 24},
		})
		client.detach()
	})

	it('decodes base64 stdout payload via atob and forwards to onStdout', () => {
		const onStdout = vi.fn()
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout,
			onAttached: vi.fn(),
			onError: vi.fn(),
		})
		mockWsInstances[0].__fireOpen()
		// 'hello' → base64 → 'aGVsbG8='
		mockWsInstances[0].__fireMessage(
			JSON.stringify({type: 'stdout', data: 'aGVsbG8='}),
		)
		expect(onStdout).toHaveBeenCalledTimes(1)
		expect(onStdout).toHaveBeenCalledWith('hello')
		client.detach()
	})

	it('forwards error message envelope to onError', () => {
		const onError = vi.fn()
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError,
		})
		mockWsInstances[0].__fireOpen()
		mockWsInstances[0].__fireMessage(JSON.stringify({type: 'error', message: 'forbidden'}))
		expect(onError).toHaveBeenCalledWith('forbidden')
		client.detach()
	})

	it('sendStdin serializes {type:stdin,data} envelope', () => {
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError: vi.fn(),
		})
		mockWsInstances[0].__fireOpen()
		mockWsInstances[0].sent = [] // drop attach envelope
		client.sendStdin('ls\n')
		expect(mockWsInstances[0].sent).toHaveLength(1)
		expect(JSON.parse(mockWsInstances[0].sent[0])).toEqual({type: 'stdin', data: 'ls\n'})
		client.detach()
	})

	it('sendStdin > 64KB triggers onError and does not send', () => {
		const onError = vi.fn()
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError,
		})
		mockWsInstances[0].__fireOpen()
		mockWsInstances[0].sent = []
		const huge = 'x'.repeat(64 * 1024 + 1) // 65537 bytes ASCII = 65537 UTF-8 bytes
		client.sendStdin(huge)
		expect(onError).toHaveBeenCalledTimes(1)
		expect(onError.mock.calls[0][0]).toMatch(/stdin chunk too large/)
		expect(mockWsInstances[0].sent).toHaveLength(0)
		client.detach()
	})

	it('sendResize serializes {type:resize,cols,rows} envelope', () => {
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError: vi.fn(),
		})
		mockWsInstances[0].__fireOpen()
		mockWsInstances[0].sent = []
		client.sendResize(120, 30)
		expect(mockWsInstances[0].sent).toHaveLength(1)
		expect(JSON.parse(mockWsInstances[0].sent[0])).toEqual({
			type: 'resize',
			cols: 120,
			rows: 30,
		})
		client.detach()
	})

	it('detach sends {type:detach} envelope then closes and does not reconnect', () => {
		vi.useFakeTimers()
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError: vi.fn(),
		})
		mockWsInstances[0].__fireOpen()
		mockWsInstances[0].sent = []
		client.detach()
		// detach envelope sent before close
		expect(mockWsInstances[0].sent).toHaveLength(1)
		expect(JSON.parse(mockWsInstances[0].sent[0])).toEqual({type: 'detach'})
		// Advance well past max backoff — no reconnect should happen
		vi.advanceTimersByTime(10_000)
		expect(mockWsInstances).toHaveLength(1)
	})

	it('on unexpected close, reconnects with exponential backoff [250,500,1000,2000,4000]ms max 5 attempts', () => {
		vi.useFakeTimers()
		const onError = vi.fn()
		new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError,
		})
		// Initial connection — never opens (simulate flapping link), just closes
		expect(mockWsInstances).toHaveLength(1)
		mockWsInstances[0].__fireClose()

		// Reconnect attempt 1 after 250ms
		vi.advanceTimersByTime(250)
		expect(mockWsInstances).toHaveLength(2)
		mockWsInstances[1].__fireClose()

		// Reconnect attempt 2 after 500ms
		vi.advanceTimersByTime(500)
		expect(mockWsInstances).toHaveLength(3)
		mockWsInstances[2].__fireClose()

		// Attempt 3 after 1000ms
		vi.advanceTimersByTime(1000)
		expect(mockWsInstances).toHaveLength(4)
		mockWsInstances[3].__fireClose()

		// Attempt 4 after 2000ms
		vi.advanceTimersByTime(2000)
		expect(mockWsInstances).toHaveLength(5)
		mockWsInstances[4].__fireClose()

		// Attempt 5 after 4000ms
		vi.advanceTimersByTime(4000)
		expect(mockWsInstances).toHaveLength(6)
		mockWsInstances[5].__fireClose()

		// 6th close triggers onError + onClose — no more reconnects
		expect(onError).toHaveBeenCalledWith('reconnect attempts exhausted')
		vi.advanceTimersByTime(10_000)
		expect(mockWsInstances).toHaveLength(6)
	})

	it('successful reconnect resets reconnectAttempts to 0', () => {
		vi.useFakeTimers()
		new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError: vi.fn(),
		})
		// First socket closes immediately
		mockWsInstances[0].__fireClose()
		vi.advanceTimersByTime(250)
		expect(mockWsInstances).toHaveLength(2)
		// Second socket opens successfully → counter resets
		mockWsInstances[1].__fireOpen()
		// Now close it again — next backoff should be 250ms again (reset), not 500ms
		mockWsInstances[1].__fireClose()
		vi.advanceTimersByTime(250)
		expect(mockWsInstances).toHaveLength(3)
	})

	it('rejects invalid JSON frame via onError without crashing', () => {
		const onError = vi.fn()
		const client = new CcPtyWsClient({
			url: 'ws://x/ws/cc-pty',
			sessionId: 'sess-1',
			onStdout: vi.fn(),
			onAttached: vi.fn(),
			onError,
		})
		mockWsInstances[0].__fireOpen()
		mockWsInstances[0].__fireMessage('not json {')
		expect(onError).toHaveBeenCalledWith('invalid json frame')
		client.detach()
	})
})

// ── Source-text invariants (locking the documented constants) ─────────────

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

describe('CcPtyWsClient — source-text invariants', () => {
	const SRC = readFileSync(resolve(__dirname, 'terminal-ws-client.ts'), 'utf8')

	it('BACKOFF_MS array contains [250, 500, 1000, 2000, 4000] exactly', () => {
		expect(SRC).toMatch(/BACKOFF_MS\s*=\s*\[\s*250\s*,\s*500\s*,\s*1000\s*,\s*2000\s*,\s*4000\s*\]/)
	})

	it('MAX_STDIN_BYTES is 64 * 1024', () => {
		expect(SRC).toMatch(/MAX_STDIN_BYTES\s*=\s*64\s*\*\s*1024/)
	})
})
