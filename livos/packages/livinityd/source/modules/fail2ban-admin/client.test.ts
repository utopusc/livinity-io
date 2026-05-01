import assert from 'node:assert/strict'

import {
	type ExecFileFn,
	Fail2banClientError,
	makeFail2banClient,
} from './client.js'

/**
 * Phase 46 Plan 02 — client.test.ts
 *
 * DI-based tests for the fail2ban-client wrapper. Per pitfall W-20: NO
 * mock-by-module-replacement of child_process. We pass a fake `ExecFileFn` to
 * makeFail2banClient(...) and assert (a) the argv shape it would have spawned,
 * (b) error wrapping for ENOENT / service-down / jail-not-found / timeout,
 * (c) defense-in-depth input validation BEFORE spawn (pitfall X-03 / B-03).
 *
 * Critical assertion (per pitfall B-01): unbanIp argv MUST be
 * `['set', jail, 'unbanip', ip]` — action-targeted unban. NEVER global flush.
 */

const BINARY_PATH = '/usr/bin/fail2ban-client'

interface CapturedCall {
	binary: string
	args: string[]
	opts: {timeout: number}
}

function makeRecordingExec(stdout = '', stderr = ''): {
	exec: ExecFileFn
	calls: CapturedCall[]
} {
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

async function runTests() {
	// ---------------------------------------------------------------
	// argv shape — Tests 1-5 (B-01 action-targeted unban + FR-F2B-02 whitelist)
	// ---------------------------------------------------------------

	// Test 1: listJails calls (BINARY_PATH, ['status'], {timeout: 10000})
	{
		const {exec, calls} = makeRecordingExec(`Status
|- Number of jail:	1
\`- Jail list:	sshd
`)
		const client = makeFail2banClient(exec)
		const jails = await client.listJails()
		assert.deepEqual(jails, ['sshd'])
		assert.equal(calls.length, 1)
		assert.equal(calls[0].binary, BINARY_PATH)
		assert.deepEqual(calls[0].args, ['status'])
		assert.equal(calls[0].opts.timeout, 10_000)
		console.log('  PASS Test 1: listJails argv shape')
	}

	// Test 2: getJailStatus('sshd') calls with ['status', 'sshd']
	{
		const {exec, calls} = makeRecordingExec(`Status for the jail: sshd
|- Filter
|  |- Currently failed:	0
|  |- Total failed:	0
|  \`- Journal matches:	_SYSTEMD_UNIT=sshd.service + _COMM=sshd
\`- Actions
   |- Currently banned:	0
   |- Total banned:	0
   \`- Banned IP list:
`)
		const client = makeFail2banClient(exec)
		await client.getJailStatus('sshd')
		assert.equal(calls.length, 1)
		assert.deepEqual(calls[0].args, ['status', 'sshd'])
		console.log('  PASS Test 2: getJailStatus argv shape')
	}

	// Test 3: unbanIp argv = ['set', 'sshd', 'unbanip', '1.2.3.4'] (pitfall B-01)
	{
		const {exec, calls} = makeRecordingExec()
		const client = makeFail2banClient(exec)
		await client.unbanIp('sshd', '1.2.3.4')
		assert.equal(calls.length, 1)
		assert.deepEqual(calls[0].args, ['set', 'sshd', 'unbanip', '1.2.3.4'])
		console.log('  PASS Test 3: unbanIp action-targeted argv (B-01)')
	}

	// Test 4: banIp argv = ['set', 'sshd', 'banip', '1.2.3.4']
	{
		const {exec, calls} = makeRecordingExec()
		const client = makeFail2banClient(exec)
		await client.banIp('sshd', '1.2.3.4')
		assert.equal(calls.length, 1)
		assert.deepEqual(calls[0].args, ['set', 'sshd', 'banip', '1.2.3.4'])
		console.log('  PASS Test 4: banIp argv shape')
	}

	// Test 5: addIgnoreIp argv = ['set', 'sshd', 'addignoreip', '1.2.3.4'] (FR-F2B-02 whitelist)
	{
		const {exec, calls} = makeRecordingExec()
		const client = makeFail2banClient(exec)
		await client.addIgnoreIp('sshd', '1.2.3.4')
		assert.equal(calls.length, 1)
		assert.deepEqual(calls[0].args, ['set', 'sshd', 'addignoreip', '1.2.3.4'])
		console.log('  PASS Test 5: addIgnoreIp whitelist argv (FR-F2B-02)')
	}

	// ---------------------------------------------------------------
	// Error wrapping — Tests 6-9
	// ---------------------------------------------------------------

	// Test 6: ENOENT → Fail2banClientError({kind: 'binary-missing'})
	{
		const enoent = Object.assign(new Error('not found'), {code: 'ENOENT'})
		const client = makeFail2banClient(makeThrowingExec(enoent))
		await assert.rejects(
			() => client.listJails(),
			(err: unknown) =>
				err instanceof Fail2banClientError && err.kind === 'binary-missing',
		)
		console.log('  PASS Test 6: ENOENT → kind=binary-missing')
	}

	// Test 7: stderr 'Could not find server' → kind='service-down'
	{
		// fail2ban-client emits this both on stdout/stderr depending on version;
		// real fail2ban 1.0.2 surfaces it via the rejected execFile error with
		// stderr field populated. Simulate that shape.
		const childErr: any = new Error('Command failed')
		childErr.stderr = 'ERROR  Could not find server\n'
		childErr.stdout = ''
		const client = makeFail2banClient(makeThrowingExec(childErr))
		await assert.rejects(
			() => client.getJailStatus('sshd'),
			(err: unknown) => err instanceof Fail2banClientError && err.kind === 'service-down',
		)
		console.log('  PASS Test 7: stderr "Could not find server" → kind=service-down')
	}

	// Test 8: stderr 'does not exist' → kind='jail-not-found'
	{
		const childErr: any = new Error('Command failed')
		childErr.stderr = "Sorry but the jail 'wrongjail' does not exist\n"
		childErr.stdout = ''
		const client = makeFail2banClient(makeThrowingExec(childErr))
		await assert.rejects(
			() => client.getJailStatus('wrongjail'),
			(err: unknown) => err instanceof Fail2banClientError && err.kind === 'jail-not-found',
		)
		console.log('  PASS Test 8: stderr "does not exist" → kind=jail-not-found')
	}

	// Test 9: ETIMEDOUT → kind='timeout'
	{
		const tErr: any = new Error('timeout')
		tErr.code = 'ETIMEDOUT'
		const client = makeFail2banClient(makeThrowingExec(tErr))
		await assert.rejects(
			() => client.listJails(),
			(err: unknown) => err instanceof Fail2banClientError && err.kind === 'timeout',
		)
		console.log('  PASS Test 9: ETIMEDOUT → kind=timeout')
	}

	// ---------------------------------------------------------------
	// Defense-in-depth input validation — Tests 10-11
	// ---------------------------------------------------------------

	// Test 10: CIDR-shaped IP rejected BEFORE execFile (pitfall B-03)
	{
		const {exec, calls} = makeRecordingExec()
		const client = makeFail2banClient(exec)
		await assert.rejects(
			() => client.unbanIp('sshd', '0.0.0.0/0'),
			(err: unknown) => err instanceof Fail2banClientError && err.kind === 'ip-invalid',
		)
		assert.equal(calls.length, 0, 'execFile MUST NOT be called when IP is invalid')
		console.log('  PASS Test 10: CIDR rejected pre-spawn (B-03)')
	}

	// Test 11: command-injection attempt in jail name rejected pre-spawn
	{
		const {exec, calls} = makeRecordingExec()
		const client = makeFail2banClient(exec)
		await assert.rejects(
			() => client.unbanIp('sshd; rm -rf /', '1.2.3.4'),
			(err: unknown) => err instanceof Fail2banClientError && err.kind === 'ip-invalid',
		)
		assert.equal(calls.length, 0, 'execFile MUST NOT be called when jail name is invalid')
		console.log('  PASS Test 11: command-injection in jail name rejected pre-spawn (T-46-09)')
	}

	// ---------------------------------------------------------------
	// ping() — Tests 12-13 (graceful degradation)
	// ---------------------------------------------------------------

	// Test 12: ping happy path → {healthy: true}
	{
		const {exec} = makeRecordingExec(`Status
|- Number of jail:	1
\`- Jail list:	sshd
`)
		const client = makeFail2banClient(exec)
		const r = await client.ping()
		assert.equal(r.healthy, true)
		console.log('  PASS Test 12: ping() happy path')
	}

	// Test 13: ping ENOENT → {healthy: false, reason: 'binary-missing'} (no throw)
	{
		const enoent = Object.assign(new Error('not found'), {code: 'ENOENT'})
		const client = makeFail2banClient(makeThrowingExec(enoent))
		const r = await client.ping()
		assert.equal(r.healthy, false)
		assert.equal(r.reason, 'binary-missing')
		console.log('  PASS Test 13: ping() ENOENT → graceful degrade')
	}

	console.log('\nAll client.test.ts tests passed (13/13)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
