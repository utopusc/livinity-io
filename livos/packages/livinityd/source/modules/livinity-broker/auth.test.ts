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

	// Test 7 (Phase 41.1 hotfix): 172.18.0.1 → ALLOW (per-app compose bridge in 172.16.0.0/12)
	{
		const r = runGuard('172.18.0.1')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 7: 172.18.0.1 allowed (per-app compose bridge, RFC 1918 172.16/12)')
	}

	// Test 7b (Phase 41.1 hotfix): 172.31.255.254 → ALLOW (CIDR upper bound of 172.16.0.0/12)
	{
		const r = runGuard('172.31.255.254')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 7b: 172.31.255.254 allowed (172.16/12 upper bound)')
	}

	// Test 7c (Phase 41.1 hotfix): 172.15.0.1 → REJECT (just below 172.16/12)
	{
		const r = runGuard('172.15.0.1')
		assert.equal(r.nextCalled, false)
		assert.equal(r.captured.statusCode, 401)
		console.log('  PASS Test 7c: 172.15.0.1 rejected (outside 172.16/12)')
	}

	// Test 7d (Phase 41.1 hotfix): 172.32.0.1 → REJECT (just above 172.16/12)
	{
		const r = runGuard('172.32.0.1')
		assert.equal(r.nextCalled, false)
		assert.equal(r.captured.statusCode, 401)
		console.log('  PASS Test 7d: 172.32.0.1 rejected (outside 172.16/12)')
	}

	// Test 8 (Phase 41.2 hotfix): 10.0.0.1 → ALLOW (RFC 1918 10/8 — Docker custom/overlay nets)
	{
		const r = runGuard('10.0.0.1')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 8: 10.0.0.1 allowed (RFC 1918 10/8)')
	}

	// Test 8b (Phase 41.2): 10.21.0.2 → ALLOW (live Mini PC discovery — overlay net)
	{
		const r = runGuard('10.21.0.2')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 8b: 10.21.0.2 allowed (Mini PC overlay net)')
	}

	// Test 8c (Phase 41.2): 192.168.1.5 → ALLOW (RFC 1918 192.168/16 — macvlan)
	{
		const r = runGuard('192.168.1.5')
		assert.equal(r.nextCalled, true)
		console.log('  PASS Test 8c: 192.168.1.5 allowed (RFC 1918 192.168/16)')
	}

	// Test 8d (Phase 41.2): 11.0.0.1 → REJECT (just outside 10/8)
	{
		const r = runGuard('11.0.0.1')
		assert.equal(r.nextCalled, false)
		assert.equal(r.captured.statusCode, 401)
		console.log('  PASS Test 8d: 11.0.0.1 rejected (outside RFC 1918)')
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

	console.log('\nAll auth.test.ts tests passed (15/15)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
