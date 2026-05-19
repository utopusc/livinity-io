/**
 * Phase 162-03 — auth-verifier.test.ts
 *
 * Vitest suite for smokeAuthCheck (subscription-path SDK boot probe).
 *
 * All tests stub the SDK `query()` via the injectable `queryImpl` option so
 * the suite NEVER hits api.anthropic.com (CI machines have no
 * /root/.claude/.credentials.json; the real SDK would network-fail anyway).
 *
 * Invariants locked here:
 * - Result shape: discriminator `{ok:true, model}` | `{ok:false, err}`
 * - Subscription-path env contract: HOME=/root, PATH=process.env.PATH
 * - No BYOK leak: ANTHROPIC_API_KEY must be undefined in passed env
 * - cwd defaults to '/home/bruce/livinity-vault'
 * - settingSources is ['project'] (CC project-context loading)
 * - Redis side-effect: liv:config:cc_auth_status = 'ok' | 'failed: <reason>'
 * - Logger side-effect: success → log; failure → error
 * - Throws are SWALLOWED into {ok:false, err} (non-fatal contract)
 */

import {describe, it, expect, vi} from 'vitest'
import {smokeAuthCheck} from './auth-verifier.js'

type Captured = {
	cwd?: string
	settingSources?: unknown
	env?: Record<string, string | undefined>
	model?: string
	maxTurns?: number
	maxBudgetUsd?: number
	permissionMode?: string
	persistSession?: boolean
	prompt?: unknown
}

function makeQueryImpl(yields: unknown[], opts?: {captureInto?: {value: Captured}; throwOnCall?: Error}) {
	return (callArgs: any) => {
		if (opts?.captureInto) {
			opts.captureInto.value = {...(callArgs?.options ?? {}), prompt: callArgs?.prompt}
		}
		if (opts?.throwOnCall) {
			throw opts.throwOnCall
		}
		return (async function* () {
			for (const y of yields) yield y
		})()
	}
}

describe('smokeAuthCheck — Phase 162-03 subscription-path SDK probe', () => {
	it('Test 1 (happy path): init event yields {ok:true, model}', async () => {
		const queryImpl = makeQueryImpl([
			{type: 'system', subtype: 'init', model: 'claude-haiku-4-5'},
		])
		const result = await smokeAuthCheck({queryImpl})
		expect(result).toEqual({ok: true, model: 'claude-haiku-4-5'})
	})

	it('Test 2 (no init event): yields only assistant → {ok:false, err: "no init event received"}', async () => {
		const queryImpl = makeQueryImpl([{type: 'assistant', text: 'ok'}])
		const result = await smokeAuthCheck({queryImpl})
		expect(result).toEqual({ok: false, err: 'no init event received'})
	})

	it('Test 3 (throws): synchronous throw is swallowed into {ok:false, err}', async () => {
		const queryImpl = makeQueryImpl([], {throwOnCall: new Error('auth denied')})
		const result = await smokeAuthCheck({queryImpl})
		expect(result).toEqual({ok: false, err: 'auth denied'})
	})

	it('Test 4 (Redis write on success)', async () => {
		const queryImpl = makeQueryImpl([
			{type: 'system', subtype: 'init', model: 'claude-haiku-4-5'},
		])
		const set = vi.fn().mockResolvedValue('OK')
		const redis = {set} as any
		await smokeAuthCheck({queryImpl, redis})
		expect(set).toHaveBeenCalledWith('liv:config:cc_auth_status', 'ok')
	})

	it('Test 5 (Redis write on failure)', async () => {
		const queryImpl = makeQueryImpl([], {throwOnCall: new Error('auth denied')})
		const set = vi.fn().mockResolvedValue('OK')
		const redis = {set} as any
		await smokeAuthCheck({queryImpl, redis})
		expect(set).toHaveBeenCalledTimes(1)
		const [key, value] = set.mock.calls[0]!
		expect(key).toBe('liv:config:cc_auth_status')
		expect(value).toMatch(/^failed: .+/)
		expect(value).toContain('auth denied')
	})

	it('Test 6 (env shape — HOME=/root + PATH propagation)', async () => {
		const captured: {value: Captured} = {value: {}}
		const queryImpl = makeQueryImpl(
			[{type: 'system', subtype: 'init', model: 'claude-haiku-4-5'}],
			{captureInto: captured},
		)
		await smokeAuthCheck({queryImpl})
		expect(captured.value.env?.HOME).toBe('/root')
		expect(captured.value.env?.PATH).toBe(process.env.PATH)
	})

	it('Test 7 (no API key leak — feedback_subscription_only)', async () => {
		const captured: {value: Captured} = {value: {}}
		const queryImpl = makeQueryImpl(
			[{type: 'system', subtype: 'init', model: 'claude-haiku-4-5'}],
			{captureInto: captured},
		)
		await smokeAuthCheck({queryImpl})
		expect(captured.value.env?.ANTHROPIC_API_KEY).toBeUndefined()
	})

	it('Test 8 (cwd default = /home/bruce/livinity-vault)', async () => {
		const captured: {value: Captured} = {value: {}}
		const queryImpl = makeQueryImpl(
			[{type: 'system', subtype: 'init', model: 'claude-haiku-4-5'}],
			{captureInto: captured},
		)
		await smokeAuthCheck({queryImpl})
		expect(captured.value.cwd).toBe('/home/bruce/livinity-vault')
	})

	it('Test 9 (settingSources deep-equals ["project"])', async () => {
		const captured: {value: Captured} = {value: {}}
		const queryImpl = makeQueryImpl(
			[{type: 'system', subtype: 'init', model: 'claude-haiku-4-5'}],
			{captureInto: captured},
		)
		await smokeAuthCheck({queryImpl})
		expect(captured.value.settingSources).toEqual(['project'])
	})

	it('Test 10 (logger fires success + failure paths)', async () => {
		// success path
		const successQueryImpl = makeQueryImpl([
			{type: 'system', subtype: 'init', model: 'claude-haiku-4-5'},
		])
		const log = vi.fn()
		const error = vi.fn()
		await smokeAuthCheck({queryImpl: successQueryImpl, logger: {log, error}})
		expect(log).toHaveBeenCalledTimes(1)
		expect(log.mock.calls[0]![0]).toContain('smoke check passed model=')
		expect(error).not.toHaveBeenCalled()

		// failure path
		const failureQueryImpl = makeQueryImpl([], {throwOnCall: new Error('boom')})
		const log2 = vi.fn()
		const error2 = vi.fn()
		await smokeAuthCheck({queryImpl: failureQueryImpl, logger: {log: log2, error: error2}})
		expect(error2).toHaveBeenCalledTimes(1)
		expect(error2.mock.calls[0]![0]).toContain('smoke check failed:')
		expect(log2).not.toHaveBeenCalled()
	})
})
