/**
 * Phase 48 Plan 48-01 — journalctl-stream.test.ts
 *
 * Bare-tsx + node:assert/strict pattern (mirrors translate-request.test.ts).
 * NO `vi.mock('child_process')` — DI factory takes a fake `SpawnFn` (per pitfall W-20).
 * Fake spawn uses `node:stream.PassThrough` + a small EventEmitter — both built-ins,
 * NO new deps (D-NO-NEW-DEPS upheld).
 */

import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'

import {extractIp, makeJournalctlStream, type SpawnFn} from './journalctl-stream.js'

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

const NON_SSH_LINE = JSON.stringify({
	__REALTIME_TIMESTAMP: '1714589502000000',
	_SYSTEMD_UNIT: 'cron.service',
	MESSAGE: 'cron started',
	_HOSTNAME: 'bruce-EQ',
})

async function runTests() {
	// Test 1: extractIp — Failed password
	assert.equal(
		extractIp('Failed password for invalid user X from 203.0.113.99 port 51234 ssh2'),
		'203.0.113.99',
	)
	console.log('  PASS Test 1: extractIp Failed-password form')

	// Test 2: extractIp — Accepted publickey
	assert.equal(
		extractIp(
			'Accepted publickey for bruce from 192.168.1.50 port 51999 ssh2: RSA SHA256:abc',
		),
		'192.168.1.50',
	)
	console.log('  PASS Test 2: extractIp Accepted-publickey form')

	// Test 3: extractIp — pam session line (no IP) -> null
	assert.equal(
		extractIp('pam_unix(sshd:session): session opened for user bruce by (uid=0)'),
		null,
	)
	console.log('  PASS Test 3: extractIp returns null for pam line')

	// Test 4: extractIp — Disconnected form
	assert.equal(extractIp('Disconnected from 10.0.0.5 port 22000'), '10.0.0.5')
	console.log('  PASS Test 4: extractIp Disconnected form')

	// Test 5: factory emits parsed events for valid NDJSON lines (3 events from 3 lines).
	{
		const fake = makeFakeSpawn()
		const stream = makeJournalctlStream(fake.spawn, {
			logger: {warn: () => {}, error: () => {}},
		})
		const events: Array<{timestamp: string; message: string; ip: string | null}> = []
		stream.subscribe((ev) => {
			events.push({timestamp: ev.timestamp, message: ev.message, ip: ev.ip})
		})
		fake.stdout.write(FAILED_LINE + '\n')
		fake.stdout.write(ACCEPTED_LINE + '\n')
		fake.stdout.write(PAM_LINE + '\n')
		await tick()
		assert.equal(events.length, 3, 'three rows → three events')
		assert.equal(events[0].ip, '203.0.113.99')
		assert.equal(events[0].timestamp, '1714589412345678')
		assert.match(events[0].message, /Failed password/)
		assert.equal(events[1].ip, '192.168.1.50')
		assert.equal(events[2].ip, null) // pam row still emits, but ip=null
		stream.stop()
	}
	console.log('  PASS Test 5: factory emits 3 events from 3 NDJSON lines (pam ip=null still emitted)')

	// Test 6: factory ignores stdout lines that fail JSON.parse (does NOT throw, does NOT emit).
	{
		const fake = makeFakeSpawn()
		const stream = makeJournalctlStream(fake.spawn, {
			logger: {warn: () => {}, error: () => {}},
		})
		const events: unknown[] = []
		stream.subscribe((ev) => events.push(ev))
		fake.stdout.write('not-json-at-all\n')
		fake.stdout.write('{half-broken\n')
		fake.stdout.write(FAILED_LINE + '\n')
		await tick()
		assert.equal(events.length, 1, 'only the valid line emits — malformed lines skipped silently')
		stream.stop()
	}
	console.log('  PASS Test 6: malformed JSON lines skipped silently')

	// Test 7: factory honors _SYSTEMD_UNIT === 'ssh.service' filter (defensive — `-u ssh` should already gate).
	{
		const fake = makeFakeSpawn()
		const stream = makeJournalctlStream(fake.spawn, {
			logger: {warn: () => {}, error: () => {}},
		})
		const events: unknown[] = []
		stream.subscribe((ev) => events.push(ev))
		fake.stdout.write(NON_SSH_LINE + '\n')
		fake.stdout.write(FAILED_LINE + '\n')
		await tick()
		assert.equal(events.length, 1, 'non-ssh.service lines dropped')
		stream.stop()
	}
	console.log('  PASS Test 7: _SYSTEMD_UNIT mismatch dropped (defensive filter)')

	// Test 8: ENOENT signal — fake spawn fires `error` event with {code:'ENOENT'}; onMissing called.
	{
		const fake = makeFakeSpawn()
		let onMissingCalls = 0
		const stream = makeJournalctlStream(fake.spawn, {
			onMissing: () => {
				onMissingCalls += 1
			},
			logger: {warn: () => {}, error: () => {}},
		})
		const enoentErr: NodeJS.ErrnoException = Object.assign(new Error('spawn journalctl ENOENT'), {
			code: 'ENOENT',
		})
		fake.emit('error', enoentErr)
		await tick()
		assert.equal(onMissingCalls, 1, 'onMissing invoked once on ENOENT')
		stream.stop()
	}
	console.log('  PASS Test 8: ENOENT fires onMissing callback (no throw)')

	console.log('All journalctl-stream.test.ts tests passed (8/8)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
