/**
 * Phase 48 Plan 48-03 — integration test for ssh-sessions module.
 *
 * Wires Plan 48-01's pieces together at the boundary between
 * `makeJournalctlStream` and `createSshSessionsWsHandler`. Fake spawn + fake WS
 * + injected `findUserByIdFn` / `getAdminUserFn` means:
 *
 *   - NO real `child_process.spawn('journalctl', ...)` invocation.
 *   - NO real WebSocket server (no `import { WebSocketServer } from 'ws'`).
 *   - NO real PostgreSQL (no `pg.Pool` import).
 *   - NO real JWT verify (livinityd `server.verifyToken` is faked).
 *
 * Pure in-process integration matching the parser.test / active-sessions.test /
 * fail2ban-admin/integration.test convention from Phase 46 + the bare-tsx +
 * node:assert/strict pattern (per pitfall W-20 — no Vitest, no module mocks).
 *
 * Coverage matrix (5 tests):
 *   1. Happy path — admin token → 5 events stream end-to-end → fake WS sees 5
 *      `ws.send()` calls, in order, with the right wire shape.
 *   2. Ring-buffer replay — connect WS#1, push 3 events, connect WS#2, observe
 *      that WS#2 receives those 3 buffered events on connect (replay), then
 *      push a 4th event and confirm both WS#1 and WS#2 receive it (fan-out).
 *   3. Admin gate — non-admin token resolves to role='member', WS closed with
 *      4403, AND `streamFactory` was NEVER invoked (no journalctl process spawned).
 *   4. ENOENT path — `streamFactory` invokes its `onMissing` callback synchronously,
 *      WS closed with 4404, ring buffer remains empty.
 *   5. Cleanup on disconnect — WS#1 connects, WS#2 connects, WS#1 disconnects
 *      (still 1 subscriber), WS#2 disconnects (subscribers → 0) → controllable
 *      `stream.stop()` was invoked exactly once when the last subscriber left.
 */

import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'

import {
	makeJournalctlStream,
	type JournalctlStream,
	type SpawnFn,
	type SshSessionEvent,
} from './journalctl-stream.js'
import {createSshSessionsWsHandler} from './ws-handler.js'

// ─── Fake spawn helper (mirrors journalctl-stream.test.ts) ─────────────────

interface FakeSpawnHandle {
	spawn: SpawnFn
	stdout: PassThrough
	stderr: PassThrough
	emit: (event: string, ...args: unknown[]) => void
	killCalls: string[]
}

function makeFakeSpawn(): FakeSpawnHandle {
	const stdout = new PassThrough()
	const stderr = new PassThrough()
	const ee = new EventEmitter()
	const killCalls: string[] = []
	const spawn: SpawnFn = () => ({
		stdout,
		stderr,
		on: (event, listener) => {
			ee.on(event, listener)
		},
		kill: (sig?: string) => {
			killCalls.push(sig ?? 'SIGTERM')
		},
	})
	return {
		spawn,
		stdout,
		stderr,
		emit: (event, ...args) => ee.emit(event, ...args),
		killCalls,
	}
}

// ─── Fake WS helper (mirrors ws-handler.test.ts) ───────────────────────────

interface FakeWs {
	readyState: number
	OPEN: number
	close: (code: number, reason?: string) => void
	send: (msg: string) => void
	on: (event: string, listener: (arg?: unknown) => void) => void
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
			if (closeCode !== null) return
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

// ─── Controllable stream (for tests that need direct push control) ─────────

interface ControllableStream {
	stream: JournalctlStream
	push: (ev: SshSessionEvent) => void
	stopCalls: number
	subscriberCount: () => number
}

function makeControllableStream(): ControllableStream {
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
		push: (ev) => {
			for (const s of subs) s(ev)
		},
		get stopCalls() {
			return stopCalls
		},
		subscriberCount: () => subs.size,
	}
}

// ─── Fake livinityd ────────────────────────────────────────────────────────

function makeFakeLivinityd(payload: Record<string, unknown>) {
	return {
		server: {
			verifyToken: async (_token: string) => payload,
		},
	} as unknown as Parameters<typeof createSshSessionsWsHandler>[0]['livinityd']
}

const SILENT_LOGGER = {warn: () => {}, error: () => {}, verbose: () => {}}

const tick = () => new Promise<void>((r) => setImmediate(r))

const FAILED_LINE = JSON.stringify({
	__REALTIME_TIMESTAMP: '1714589412345678',
	_SYSTEMD_UNIT: 'ssh.service',
	MESSAGE: 'Failed password for invalid user attacker from 203.0.113.99 port 51234 ssh2',
	_HOSTNAME: 'bruce-EQ',
})
const ACCEPTED_LINE = JSON.stringify({
	__REALTIME_TIMESTAMP: '1714589500000000',
	_SYSTEMD_UNIT: 'ssh.service',
	MESSAGE: 'Accepted publickey for bruce from 192.168.1.50 port 51999 ssh2: RSA SHA256:abc',
	_HOSTNAME: 'bruce-EQ',
})
const PAM_LINE = JSON.stringify({
	__REALTIME_TIMESTAMP: '1714589501000000',
	_SYSTEMD_UNIT: 'ssh.service',
	MESSAGE: 'pam_unix(sshd:session): session opened for user bruce by (uid=0)',
	_HOSTNAME: 'bruce-EQ',
})
const DISCONNECTED_LINE = JSON.stringify({
	__REALTIME_TIMESTAMP: '1714589502000000',
	_SYSTEMD_UNIT: 'ssh.service',
	MESSAGE: 'Disconnected from 10.0.0.5 port 22000',
	_HOSTNAME: 'bruce-EQ',
})
const INVALID_USER_LINE = JSON.stringify({
	__REALTIME_TIMESTAMP: '1714589503000000',
	_SYSTEMD_UNIT: 'ssh.service',
	MESSAGE: 'Invalid user bot from 198.51.100.7 port 33333',
	_HOSTNAME: 'bruce-EQ',
})

async function runTests() {
	// ─── Test 1: end-to-end happy path — fake spawn → makeJournalctlStream →
	//             ws-handler → fake WS → 5 send() calls in order. ─────────────
	{
		const fake = makeFakeSpawn()
		const ws = makeFakeWs()

		// Build the real makeJournalctlStream around the fake spawn — this is
		// the integration boundary: we exercise the actual journalctl-stream.ts
		// parser logic (NDJSON line-buffer + IP extraction + ssh.service filter)
		// AND the actual ws-handler.ts admin-gate + replay + fan-out logic.
		// The only fakes are at the very edges: spawn, WS, jwt verify, role lookup.
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'admin-1'}),
			logger: SILENT_LOGGER,
			streamFactory: ({onMissing, onExit, logger}) =>
				makeJournalctlStream(fake.spawn, {onMissing, onExit, logger}),
			findUserByIdFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
			getAdminUserFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
		})

		await handler(ws as never, {url: '/ws/ssh-sessions?token=admin-jwt'} as never)
		await tick()

		// Push 5 NDJSON lines through the spawned process's stdout.
		fake.stdout.write(FAILED_LINE + '\n')
		fake.stdout.write(ACCEPTED_LINE + '\n')
		fake.stdout.write(PAM_LINE + '\n')
		fake.stdout.write(DISCONNECTED_LINE + '\n')
		fake.stdout.write(INVALID_USER_LINE + '\n')
		await tick()

		const sent = ws.getSent()
		assert.equal(sent.length, 5, `expected 5 ws.send() calls, got ${sent.length}`)

		// Order + parsed shape.
		const parsed = sent.map((s) => JSON.parse(s) as SshSessionEvent)
		assert.equal(parsed[0].ip, '203.0.113.99', 'event 0 = Failed-password from 203.0.113.99')
		assert.equal(parsed[0].timestamp, '1714589412345678')
		assert.match(parsed[0].message, /Failed password/)
		assert.equal(parsed[1].ip, '192.168.1.50', 'event 1 = Accepted-publickey from 192.168.1.50')
		assert.equal(parsed[2].ip, null, 'event 2 = pam line, ip=null but still emitted')
		assert.equal(parsed[3].ip, '10.0.0.5', 'event 3 = Disconnected from 10.0.0.5')
		assert.equal(parsed[4].ip, '198.51.100.7', 'event 4 = Invalid user from 198.51.100.7')

		// WS still open (admin path NEVER closes the connection on its own).
		assert.equal(ws.getCloseCode(), null, 'admin WS NOT closed')
	}
	console.log('  PASS Test 1: end-to-end happy path — 5 NDJSON lines → 5 ws.send() calls in order')

	// ─── Test 2: ring-buffer replay — WS#2 sees buffered events on connect ───
	{
		const controllable = makeControllableStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'admin-1'}),
			logger: SILENT_LOGGER,
			streamFactory: () => controllable.stream,
			findUserByIdFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
			getAdminUserFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
		})

		// WS#1 connects first — primes the shared stream.
		const ws1 = makeFakeWs()
		await handler(ws1 as never, {url: '/ws/ssh-sessions?token=t1'} as never)
		await tick()

		// Push 3 events through the shared stream — buffered + delivered to WS#1.
		controllable.push({timestamp: '1', message: 'one', ip: '1.1.1.1'})
		controllable.push({timestamp: '2', message: 'two', ip: '2.2.2.2'})
		controllable.push({timestamp: '3', message: 'three', ip: null})
		await tick()
		assert.equal(ws1.getSent().length, 3, 'WS#1 sees 3 live events')

		// WS#2 connects — should receive all 3 buffered events as replay.
		const ws2 = makeFakeWs()
		await handler(ws2 as never, {url: '/ws/ssh-sessions?token=t2'} as never)
		await tick()
		const replayed = ws2.getSent()
		assert.equal(replayed.length, 3, 'WS#2 receives 3 buffered events on connect')
		const replay0 = JSON.parse(replayed[0]) as SshSessionEvent
		const replay2 = JSON.parse(replayed[2]) as SshSessionEvent
		assert.equal(replay0.timestamp, '1', 'replay preserves order — oldest first')
		assert.equal(replay2.timestamp, '3', 'replay preserves order — newest last')

		// Push a 4th event — both WS#1 and WS#2 should receive it (fan-out).
		controllable.push({timestamp: '4', message: 'four', ip: '4.4.4.4'})
		await tick()
		assert.equal(ws1.getSent().length, 4, 'WS#1 receives 4th event live')
		assert.equal(ws2.getSent().length, 4, 'WS#2 receives 4th event live (after replay)')
		const ws2Last = JSON.parse(ws2.getSent()[3]) as SshSessionEvent
		assert.equal(ws2Last.timestamp, '4', 'WS#2 4th sent is event ts=4')
	}
	console.log('  PASS Test 2: ring-buffer replay — WS#2 sees 3 buffered + live fan-out of #4')

	// ─── Test 3: admin gate — non-admin → close 4403; streamFactory NEVER called.
	{
		let factoryCalls = 0
		const ws = makeFakeWs()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'member-7'}),
			logger: SILENT_LOGGER,
			streamFactory: () => {
				factoryCalls += 1
				return makeControllableStream().stream
			},
			findUserByIdFn: async () =>
				({id: 'member-7', role: 'member'} as {id: string; role: 'member'}),
			getAdminUserFn: async () => null,
		})
		await handler(ws as never, {url: '/ws/ssh-sessions?token=member-jwt'} as never)
		await tick()
		assert.equal(ws.getCloseCode(), 4403, 'non-admin closed with 4403')
		assert.match(ws.getCloseReason(), /admin role required/)
		assert.equal(
			factoryCalls,
			0,
			'streamFactory MUST NOT be invoked when admin gate fails (no journalctl spawn)',
		)
	}
	console.log('  PASS Test 3: non-admin → close 4403, streamFactory never invoked')

	// ─── Test 4: ENOENT — streamFactory's onMissing fires synchronously ──────
	{
		const ws = makeFakeWs()
		const enoentStream: JournalctlStream = {
			subscribe: () => () => {},
			stop: () => {},
		}
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'admin-1'}),
			logger: SILENT_LOGGER,
			streamFactory: ({onMissing}) => {
				// Simulate journalctl ENOENT — fire onMissing synchronously
				// before returning. The handler should observe the callback
				// AND short-circuit the replay/subscribe path.
				onMissing()
				return enoentStream
			},
			findUserByIdFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
			getAdminUserFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
		})
		await handler(ws as never, {url: '/ws/ssh-sessions?token=admin-jwt'} as never)
		await tick()
		assert.equal(ws.getCloseCode(), 4404, 'ENOENT closed with 4404')
		assert.match(ws.getCloseReason(), /journalctl binary missing/)
		// Ring buffer empty (no events delivered).
		assert.equal(ws.getSent().length, 0, 'no events delivered on ENOENT path')
	}
	console.log('  PASS Test 4: ENOENT path → close 4404, ring buffer empty')

	// ─── Test 5: cleanup on disconnect — last subscriber → stream.stop() ─────
	{
		const controllable = makeControllableStream()
		const handler = createSshSessionsWsHandler({
			livinityd: makeFakeLivinityd({userId: 'admin-1'}),
			logger: SILENT_LOGGER,
			streamFactory: () => controllable.stream,
			findUserByIdFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
			getAdminUserFn: async () =>
				({id: 'admin-1', role: 'admin'} as {id: string; role: 'admin'}),
		})

		const ws1 = makeFakeWs()
		const ws2 = makeFakeWs()
		await handler(ws1 as never, {url: '/ws/ssh-sessions?token=t1'} as never)
		await handler(ws2 as never, {url: '/ws/ssh-sessions?token=t2'} as never)
		await tick()

		// Sanity — both WS subscribed via the handler's per-WS subscriber set;
		// the underlying stream has exactly ONE fan-out subscriber (the handler's
		// internal aggregator).
		assert.equal(controllable.subscriberCount(), 1, 'shared stream has 1 fan-out subscriber')
		assert.equal(controllable.stopCalls, 0, 'no stop() yet')

		// First WS disconnects — stream is still in use (1 subscriber left).
		ws1.emitClose()
		await tick()
		assert.equal(controllable.stopCalls, 0, 'stop() NOT called while ws2 still connected')

		// Second WS disconnects — last subscriber → stream.stop() invoked.
		ws2.emitClose()
		await tick()
		assert.equal(controllable.stopCalls, 1, 'last-subscriber close → stream.stop() invoked')
	}
	console.log(
		'  PASS Test 5: cleanup — last-subscriber close calls stream.stop() exactly once',
	)

	console.log('All ssh-sessions integration.test.ts tests passed (5/5)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
