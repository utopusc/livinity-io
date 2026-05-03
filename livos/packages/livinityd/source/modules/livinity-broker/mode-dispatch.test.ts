/**
 * Phase 57 Plan 01 Wave 0 — RED tests for mode-dispatch.ts (implemented in Wave 1).
 *
 * Asserts the broker's request-mode resolver:
 *   - Default = passthrough (header absent, garbage values, empty arrays)
 *   - Agent only when header value (post-trim, post-lowercase) === 'agent'
 *   - Header is array-form-tolerant (Express normalizes some headers to string[])
 *   - Header survives the Express middleware chain (Pitfall 3 from RESEARCH.md
 *     Risk-C — verifies no upstream middleware strips X-Livinity-Mode before
 *     the handler reads it)
 *
 * These tests are intentionally RED until Wave 1 introduces
 * `livinity-broker/mode-dispatch.ts` exporting `resolveMode(req): BrokerMode`.
 *
 * Per the locked decision D-30-03, header-based opt-in is the v30 dispatch
 * mechanism (URL path `/agent/v1/...` takes precedence and lands in a later
 * plan; this file covers the header path only).
 */

import {describe, it, expect, afterEach} from 'vitest'
import express, {type Request} from 'express'
import type {AddressInfo} from 'node:net'
import {resolveMode} from './mode-dispatch.js'

function makeReq(headers: Record<string, string | string[] | undefined>): Request {
	return {headers} as unknown as Request
}

describe('resolveMode — header parsing', () => {
	it('returns passthrough when X-Livinity-Mode header absent', () => {
		expect(resolveMode(makeReq({}))).toBe('passthrough')
	})

	it('returns agent for header value "agent" (lowercase)', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': 'agent'}))).toBe('agent')
	})

	it('returns agent for header value "AGENT" (uppercase) — case-insensitive', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': 'AGENT'}))).toBe('agent')
	})

	it('returns agent for header value "Agent" (mixed-case) — case-insensitive', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': 'Agent'}))).toBe('agent')
	})

	it('returns agent when header has surrounding whitespace " agent "', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': ' agent '}))).toBe('agent')
	})

	it('returns passthrough for garbage value "passthrough"', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': 'passthrough'}))).toBe('passthrough')
	})

	it('returns passthrough for garbage value "foobar"', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': 'foobar'}))).toBe('passthrough')
	})

	it('returns passthrough for empty string ""', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': ''}))).toBe('passthrough')
	})

	it('returns agent for array form ["agent"]', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': ['agent']}))).toBe('agent')
	})

	it('returns passthrough for empty array []', () => {
		expect(resolveMode(makeReq({'x-livinity-mode': [] as unknown as string[]}))).toBe('passthrough')
	})
})

describe('resolveMode — Express middleware chain (Pitfall 3 — Risk-C)', () => {
	let server: ReturnType<ReturnType<typeof express>['listen']> | null = null

	afterEach(() => {
		if (server) {
			server.close()
			server = null
		}
	})

	it('preserves X-Livinity-Mode header through the Express middleware chain', async () => {
		const app = express()
		app.use(express.json())
		app.post('/probe', (req, res) => {
			res.json({mode: resolveMode(req)})
		})

		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve())
		})
		const port = (server!.address() as AddressInfo).port

		const resp = await fetch(`http://127.0.0.1:${port}/probe`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Livinity-Mode': 'agent',
			},
			body: '{}',
		})
		const body = (await resp.json()) as {mode: string}
		expect(body).toEqual({mode: 'agent'})
	})
})
