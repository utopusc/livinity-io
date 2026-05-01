import assert from 'node:assert/strict'

import {makeActiveSessionsProvider} from './active-sessions.js'
import type {ExecFileFn} from './client.js'

/**
 * Phase 46 Plan 02 — active-sessions.test.ts
 *
 * DI-based tests for the `who -u` provider abstraction. Per pitfall B-19 +
 * sub-issue #7 in PATTERNS.md: ENOENT for `who` binary MUST degrade to
 * `[]` + warn, never throw (livinityd may run in environments where `who`
 * is absent).
 */

interface CapturedCall {
	binary: string
	args: string[]
	opts: {timeout: number}
}

function makeRecordingExec(stdout = '', stderr = ''): {exec: ExecFileFn; calls: CapturedCall[]} {
	const calls: CapturedCall[] = []
	const exec: ExecFileFn = async (binary, args, opts) => {
		calls.push({binary, args, opts})
		return {stdout, stderr}
	}
	return {exec, calls}
}

function makeThrowingExec(err: unknown): ExecFileFn {
	return async () => {
		throw err
	}
}

// Silent logger so tests don't pollute stdout with expected warnings.
function makeSilentLogger() {
	return {
		warn: () => {},
		error: () => {},
	}
}

async function runTests() {
	// Test 1: argv shape — provider calls execFile with ('who', ['-u'], {timeout: 5000})
	{
		const {exec, calls} = makeRecordingExec()
		const provider = makeActiveSessionsProvider(exec)
		await provider.listActiveSshSessions()
		assert.equal(calls.length, 1)
		assert.equal(calls[0].binary, 'who')
		assert.deepEqual(calls[0].args, ['-u'])
		assert.equal(calls[0].opts.timeout, 5_000)
		console.log('  PASS Test 1: who -u argv shape')
	}

	// Test 2: parsed output delegates to parseWhoOutput correctly
	{
		const {exec} = makeRecordingExec(`bruce    pts/0        2026-05-01 12:34   .          9876 (203.0.113.5)
bruce    seat0        2026-04-29 10:54   ?          1984 (login screen)
`)
		const provider = makeActiveSessionsProvider(exec)
		const sessions = await provider.listActiveSshSessions()
		assert.equal(sessions.length, 2)
		// Row 0: remote SSH with IP
		assert.equal(sessions[0].user, 'bruce')
		assert.equal(sessions[0].sourceIp, '203.0.113.5')
		// Row 1: local seat — '(login screen)' must NOT be extracted as IP
		assert.equal(sessions[1].user, 'bruce')
		assert.equal(sessions[1].sourceIp, null)
		console.log('  PASS Test 2: parses delegated who -u output (LIVE local + SYNTHETIC remote)')
	}

	// Test 3: ENOENT for `who` binary → returns [] (graceful degrade per sub-issue #7)
	{
		const enoent = Object.assign(new Error('not found'), {code: 'ENOENT'})
		const provider = makeActiveSessionsProvider(makeThrowingExec(enoent), makeSilentLogger())
		const sessions = await provider.listActiveSshSessions()
		assert.deepEqual(sessions, [], 'ENOENT MUST return [] not throw')
		console.log('  PASS Test 3: ENOENT for `who` binary → [] (graceful degrade)')
	}

	// Test 4: empty stdout → returns []
	{
		const {exec} = makeRecordingExec('')
		const provider = makeActiveSessionsProvider(exec)
		const sessions = await provider.listActiveSshSessions()
		assert.deepEqual(sessions, [])
		console.log('  PASS Test 4: empty who -u stdout → []')
	}

	console.log('\nAll active-sessions.test.ts tests passed (4/4)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
