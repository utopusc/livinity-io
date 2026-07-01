import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {attachWsHeartbeat} from './ws-heartbeat.js'

type Handler = (...args: unknown[]) => void

function makeFakeWs() {
	const handlers = new Map<string, Handler[]>()
	const ws = {
		OPEN: 1,
		readyState: 1,
		pings: 0,
		terminated: false,
		on(event: string, fn: Handler) {
			const list = handlers.get(event) ?? []
			list.push(fn)
			handlers.set(event, list)
		},
		emit(event: string) {
			for (const fn of handlers.get(event) ?? []) fn()
		},
		ping() {
			this.pings++
		},
		terminate() {
			this.terminated = true
		},
	}
	return ws
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('pings every interval while pongs come back; never terminates', () => {
	const ws = makeFakeWs()
	attachWsHeartbeat(ws as never, {pingMs: 1000})
	for (let i = 0; i < 5; i++) {
		vi.advanceTimersByTime(1000)
		ws.emit('pong')
	}
	expect(ws.pings).toBe(5)
	expect(ws.terminated).toBe(false)
})

test('terminates a peer that stops answering after two missed intervals', () => {
	const ws = makeFakeWs()
	attachWsHeartbeat(ws as never, {pingMs: 1000})
	vi.advanceTimersByTime(1000) // ping #1, no pong
	expect(ws.terminated).toBe(false)
	vi.advanceTimersByTime(1000) // still no pong → terminate
	expect(ws.terminated).toBe(true)
	expect(ws.pings).toBe(1)
})

test('close clears the timer (no pings after close)', () => {
	const ws = makeFakeWs()
	attachWsHeartbeat(ws as never, {pingMs: 1000})
	ws.emit('close')
	vi.advanceTimersByTime(5000)
	expect(ws.pings).toBe(0)
})

test('non-open sockets are left alone', () => {
	const ws = makeFakeWs()
	ws.readyState = 3 // CLOSED
	attachWsHeartbeat(ws as never, {pingMs: 1000})
	vi.advanceTimersByTime(5000)
	expect(ws.pings).toBe(0)
	expect(ws.terminated).toBe(false)
})
