/**
 * Phase 48 Plan 48-01 — ws-handler.test.ts
 *
 * Bare-tsx + node:assert/strict pattern. NO Vitest, NO module mocks.
 * Fakes: WS, JournalctlStream factory, livinityd.server.verifyToken, findUserById,
 * getAdminUser — all injected via CreateHandlerDeps so tests don't touch DB / spawn / network.
 */

import assert from 'node:assert/strict'

import type {JournalctlStream, SshSessionEvent} from './journalctl-stream.js'
import {createSshSessionsWsHandler} from './ws-handler.js'

interface FakeWs {
	readyState: number
	OPEN: number
	close: (code: number, reason?: string) => void
	send: (msg: string) => void
	on: (event: string, listener: (arg?: unknown) => void) => void
	terminate?: () => void
	getCloseCode: () => number | null
	getCloseReason: () => string
	getSent: () => string[]
	emitClose: () => void
}

function makeFakeWs(): FakeWs {
	let closeCode: number | null = null
	let closeReason = ''
	const sent: string[] = []
	const listeners: Record<string, Array<(arg?: unknown) => void>> = {close: [], error: []}
	return {
		readyState: 1,
		OPEN: 1,
		close(code: number, reason?: string) {
			if (closeCode !== null) return // already closed — first close wins
			closeCode = code
			closeReason = reason ?? ''
		},
		send(msg: string) {
			sent.push(msg)
		},
		on(event: string, listener: (arg?: unknown) => void) {
			;(listeners[event] ??= []).push(listener)
		},
		getCloseCode: () => closeCode,
		getCloseReason: () => closeReason,
		getSent: () => sent,
		emitClose: () => {
			for (const l of listeners.close) l()
		},
	}
}

interface FakeStreamHandle {
	stream: JournalctlStream
	emit: (ev: SshSessionEvent) => void
	stopCalls: number
	subscribers: number
}

function makeFakeStream(): FakeStreamHandle {
	const subs = new Set<(ev: SshSessionEvent) => void>()
	let stopCalls = 0
	const stream: JournalctlStream = {
		subscribe(listener) {
			subs.add(listener)
			return () => {
				subs.delete(listener)
			}
		},
		stop() {
			stopCalls += 1
		},
	}
	return {
		stream,
		emit: (ev) => {
			for (const s of subs) s(ev)
		},
		get stopCalls() {
			return stopCalls
		},
		get subscribers() {
			return subs.size
		},
	} as FakeStreamHandle
}

const SILENT_LOGGER = {warn: () => {}, error: () => {}, verbose: () => {}}

const ADMIN_TOKEN = 'fake.admin.token'

/**
 * Build a Livinityd-shaped fake whose `server.verifyToken` resolves to a synthetic
 * payload. The actual JWT-verification path is exercised by livinityd's own jwt.ts
 * tests — what matters here is that the handler READS payload.userId and gates
 * downstream on findUserByIdFn.
 */
function makeFakeLivinityd(payload: Record<string, unknown>) {
	return {
		server: {
			verifyToken: async (_token: string) => payload,
		},
	}
}

const tick = () => new Promise<void>((r) => setImmediate(r))

async function runTests() {
	// ---------------------------------------------------------------
	// Test 1: admin → connection accepted, NO close, subscribed.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const fake = makeFakeStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-admin'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: () => fake.stream,
			findUserByIdFn: async () => ({id: 'u-admin', role: 'admin'} as never),
			getAdminUserFn: async () => ({id: 'u-admin', role: 'admin'} as never),
		})
		await handler(ws as never, {url: `/ws/ssh-sessions?token=${ADMIN_TOKEN}`} as never)
		await tick()
		assert.equal(ws.getCloseCode(), null, 'admin connection NOT closed')
		assert.equal(fake.subscribers, 1, 'handler subscribed to stream')
	}
	console.log('  PASS Test 1: admin token → connection accepted + subscribed')

	// ---------------------------------------------------------------
	// Test 2: member → close 4403 'admin role required'.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const fake = makeFakeStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-member'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: () => fake.stream,
			findUserByIdFn: async () => ({id: 'u-member', role: 'member'} as never),
			getAdminUserFn: async () => null,
		})
		await handler(ws as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()
		assert.equal(ws.getCloseCode(), 4403, 'member closed with 4403')
		assert.match(ws.getCloseReason(), /admin role required/)
		assert.equal(fake.subscribers, 0, 'NO subscription for non-admin')
	}
	console.log('  PASS Test 2: member token → close 4403, no subscription')

	// ---------------------------------------------------------------
	// Test 3: guest → close 4403.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const fake = makeFakeStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-guest'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: () => fake.stream,
			findUserByIdFn: async () => ({id: 'u-guest', role: 'guest'} as never),
			getAdminUserFn: async () => null,
		})
		await handler(ws as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()
		assert.equal(ws.getCloseCode(), 4403, 'guest closed with 4403')
	}
	console.log('  PASS Test 3: guest token → close 4403')

	// ---------------------------------------------------------------
	// Test 4: findUserById returns null (deleted user) → close 4403.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const fake = makeFakeStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-deleted'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: () => fake.stream,
			findUserByIdFn: async () => null,
			getAdminUserFn: async () => null,
		})
		await handler(ws as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()
		assert.equal(ws.getCloseCode(), 4403, 'deleted user closed with 4403')
	}
	console.log('  PASS Test 4: deleted user (findUserById null) → close 4403')

	// ---------------------------------------------------------------
	// Test 5: ENOENT — stream factory invokes onMissing synchronously → close 4404.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const enoentStream: JournalctlStream = {
			subscribe: () => () => {},
			stop: () => {},
		}
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-admin'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: ({onMissing}) => {
				// Simulate journalctl ENOENT — fire onMissing synchronously.
				onMissing()
				return enoentStream
			},
			findUserByIdFn: async () => ({id: 'u-admin', role: 'admin'} as never),
			getAdminUserFn: async () => ({id: 'u-admin', role: 'admin'} as never),
		})
		await handler(ws as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()
		assert.equal(ws.getCloseCode(), 4404, 'ENOENT closed with 4404')
		assert.match(ws.getCloseReason(), /journalctl binary missing/)
	}
	console.log('  PASS Test 5: ENOENT → close 4404')

	// ---------------------------------------------------------------
	// Test 6: ring buffer — after 5001 events, oldest is dropped.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const fake = makeFakeStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-admin'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: () => fake.stream,
			findUserByIdFn: async () => ({id: 'u-admin', role: 'admin'} as never),
			getAdminUserFn: async () => ({id: 'u-admin', role: 'admin'} as never),
		})

		// First connect — primes the shared stream + subscribes.
		await handler(ws as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()

		// Push 5001 events. Each ts is unique to make assertions easy.
		for (let i = 1; i <= 5001; i += 1) {
			fake.emit({timestamp: String(i), message: `m${i}`, ip: null})
		}
		await tick()

		// Now have a SECOND admin client connect — replay should be exactly the LAST
		// 5000 events (ev #2 through ev #5001). ev #1 was dropped.
		const ws2 = makeFakeWs()
		await handler(ws2 as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()
		const replayed = ws2.getSent()
		assert.equal(replayed.length, 5000, 'second client gets exactly 5000 replayed events')
		const first = JSON.parse(replayed[0]) as {timestamp: string}
		const last = JSON.parse(replayed[replayed.length - 1]) as {timestamp: string}
		assert.equal(first.timestamp, '2', 'oldest replayed is event #2 (ev #1 dropped)')
		assert.equal(last.timestamp, '5001', 'newest replayed is event #5001')
	}
	console.log('  PASS Test 6: ring buffer drops oldest at 5001 (replay shows ev #2..#5001)')

	// ---------------------------------------------------------------
	// Test 7: broadcast format — exact JSON-line wire shape per event.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const fake = makeFakeStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-admin'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: () => fake.stream,
			findUserByIdFn: async () => ({id: 'u-admin', role: 'admin'} as never),
			getAdminUserFn: async () => ({id: 'u-admin', role: 'admin'} as never),
		})
		await handler(ws as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()
		fake.emit({
			timestamp: '1714589412345678',
			message: 'Failed password for X from 1.2.3.4 port 51234 ssh2',
			ip: '1.2.3.4',
			hostname: 'bruce-EQ',
		})
		await tick()
		const sent = ws.getSent()
		assert.equal(sent.length, 1)
		const decoded = JSON.parse(sent[0]) as {
			timestamp: string
			message: string
			ip: string
			hostname: string
		}
		assert.equal(decoded.timestamp, '1714589412345678')
		assert.equal(decoded.ip, '1.2.3.4')
		assert.equal(decoded.hostname, 'bruce-EQ')
		assert.match(decoded.message, /Failed password/)
	}
	console.log('  PASS Test 7: broadcast format = JSON-line {timestamp,message,ip,hostname}')

	// ---------------------------------------------------------------
	// Test 8: cleanup on close — handler unsubscribes; last subscriber stops the process.
	// ---------------------------------------------------------------
	{
		const ws = makeFakeWs()
		const fake = makeFakeStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'u-admin'}) as never,
			logger: SILENT_LOGGER,
			streamFactory: () => fake.stream,
			findUserByIdFn: async () => ({id: 'u-admin', role: 'admin'} as never),
			getAdminUserFn: async () => ({id: 'u-admin', role: 'admin'} as never),
		})
		await handler(ws as never, {url: `/ws/ssh-sessions?token=t`} as never)
		await tick()
		// One fan-out subscriber on the underlying stream (the handler's internal
		// per-WS subs are tracked in `state.subscribers`, not on the stream itself).
		assert.equal(fake.subscribers, 1, 'one fan-out subscriber on stream')
		assert.equal(fake.stopCalls, 0)

		// Verify per-WS broadcast still works pre-close.
		fake.emit({timestamp: '1', message: 'x', ip: null})
		await tick()
		assert.equal(ws.getSent().length, 1, 'connected WS receives events pre-close')

		ws.emitClose()
		await tick()
		// After close, the per-WS sub is removed (verifiable: subsequent emits
		// do NOT reach this WS).
		fake.emit({timestamp: '2', message: 'y', ip: null})
		await tick()
		assert.equal(ws.getSent().length, 1, 'closed WS receives no further events')
		// Last-subscriber → stream.stop() invoked.
		assert.equal(fake.stopCalls, 1, 'last-subscriber → stream.stop() invoked')
	}
	console.log('  PASS Test 8: cleanup on close — unsubscribe + stop process if last')

	console.log('All ws-handler.test.ts tests passed (8/8)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
