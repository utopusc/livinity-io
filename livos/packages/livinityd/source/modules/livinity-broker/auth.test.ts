import assert from 'node:assert/strict'
import type {Request, Response, NextFunction} from 'express'
import {containerSourceIpGuard} from './auth.js'

interface CapturedResponse {
	statusCode?: number
	body?: unknown
}

function makeReq(remoteAddress: string): Request {
	return {socket: {remoteAddress}} as unknown as Request
}

function makeRes(): {res: Response; captured: CapturedResponse} {
	const captured: CapturedResponse = {}
	const res = {
		status(code: number) {
			captured.statusCode = code
			return this
		},
		json(body: unknown) {
			captured.body = body
			return this
		},
	} as unknown as Response
	return {res, captured}
}

function runGuard(remoteAddress: string): {nextCalled: boolean; captured: CapturedResponse} {
	let nextCalled = false
	const next: NextFunction = () => {
		nextCalled = true
	}
	const {res, captured} = makeRes()
	containerSourceIpGuard(makeReq(remoteAddress), res, next)
	return {nextCalled, captured}
}

async function runTests() {
	// Test 1: 127.0.0.1 → allow (next called, no error response)
	{
		const r = runGuard('127.0.0.1')
		assert.equal(r.nextCalled, true)
		assert.equal(r.captured.statusCode, undefined)
		console.log('  PASS Test 1: 127.0.0.1 allowed')
	}

	// Test 2: ::1 → allow
	{
		const r = runGuard('::1')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 2: ::1 allowed')
	}

	// Test 3: ::ffff:127.0.0.1 → allow (IPv4-mapped-IPv6 stripped)
	{
		const r = runGuard('::ffff:127.0.0.1')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 3: ::ffff:127.0.0.1 allowed (IPv4-mapped IPv6)')
	}

	// Test 4: 172.17.0.5 → allow (Docker bridge)
	{
		const r = runGuard('172.17.0.5')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 4: 172.17.0.5 allowed (Docker bridge)')
	}

	// Test 5: 172.17.255.254 → allow (CIDR upper bound)
	{
		const r = runGuard('172.17.255.254')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 5: 172.17.255.254 allowed (CIDR upper bound)')
	}

	// Test 6: 8.8.8.8 → reject (401)
	{
		const r = runGuard('8.8.8.8')
		assert.equal(r.nextCalled, false)
		assert.equal(r.captured.statusCode, 401)
		console.log('  PASS Test 6: 8.8.8.8 rejected (external)')
	}

	// Test 7: 172.18.0.1 → reject (different bridge)
	{
		const r = runGuard('172.18.0.1')
		assert.equal(r.nextCalled, false)
		assert.equal(r.captured.statusCode, 401)
		console.log('  PASS Test 7: 172.18.0.1 rejected (different bridge)')
	}

	// Test 8: 10.0.0.1 → reject (private but not Docker bridge)
	{
		const r = runGuard('10.0.0.1')
		assert.equal(r.nextCalled, false)
		assert.equal(r.captured.statusCode, 401)
		console.log('  PASS Test 8: 10.0.0.1 rejected (other private)')
	}

	// Test 9: empty string → reject
	{
		const r = runGuard('')
		assert.equal(r.nextCalled, false)
		assert.equal(r.captured.statusCode, 401)
		console.log('  PASS Test 9: empty/missing remoteAddress rejected')
	}

	// resolveAndAuthorizeUserId: deferred to integration.test.ts (Task 2)
	// Acceptable per Plan 41-05 — integration test covers the full chain end-to-end.

	console.log('\nAll auth.test.ts tests passed (9/9)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
