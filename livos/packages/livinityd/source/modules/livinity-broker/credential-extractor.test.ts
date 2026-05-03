/**
 * Phase 57 Plan 01 Wave 0 — RED tests for credential-extractor.ts
 * (implemented in Wave 1).
 *
 * Asserts the per-user subscription-token reader:
 *   - Happy path: reads claudeAiOauth.accessToken (+ refreshToken + expiresAt)
 *     from `~/.claude/.credentials.json` at the per-user homeOverride path
 *   - File missing → null (so caller can return 401 with actionable error)
 *   - Malformed JSON → null
 *   - claudeAiOauth missing → null
 *   - claudeAiOauth.accessToken missing → null
 *   - BROKER_FORCE_ROOT_HOME=true reads from process.env.HOME
 *     (single-subscription fallback per RESEARCH.md A6)
 *   - Logger NEVER receives the credential file path on read failure
 *     (Pitfall 2 — credential paths are sensitive)
 *
 * Tests are intentionally RED until Wave 1 introduces
 * `livinity-broker/credential-extractor.ts` exporting `readSubscriptionToken`.
 *
 * Per the locked decision D-30-01, broker reads per-user
 * `~/.claude/.credentials.json` server-side and forwards the OAuth subscription
 * accessToken verbatim — this file's tests guard the read step.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readSubscriptionToken} from './credential-extractor.js'
import * as perUserClaude from '../ai/per-user-claude.js'

vi.mock('../ai/per-user-claude.js', () => ({
	isMultiUserMode: vi.fn().mockResolvedValue(true),
}))

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'credentials.fixture.json')

function makeLivinityd(): any {
	return {logger: {log: vi.fn()}}
}

function getLogCalls(livinityd: any): string[] {
	return (livinityd.logger.log as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) =>
		String(call[0] ?? ''),
	)
}

describe('readSubscriptionToken — multi-user mode (per-user homeOverride)', () => {
	let workDir = ''
	const originalDataDir = process.env.LIVOS_DATA_DIR
	const originalForceRoot = process.env.BROKER_FORCE_ROOT_HOME

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), 'livbroker-cred-test-'))
		process.env.LIVOS_DATA_DIR = workDir
		delete process.env.BROKER_FORCE_ROOT_HOME
		// Re-establish mock impl: vi.restoreAllMocks() in afterEach wipes
		// vi.fn().mockResolvedValue(true), so without this every test
		// after the first would see isMultiUserMode() → undefined.
		vi.mocked(perUserClaude.isMultiUserMode).mockResolvedValue(true)
	})

	afterEach(() => {
		if (workDir && existsSync(workDir)) rmSync(workDir, {recursive: true, force: true})
		if (originalDataDir === undefined) delete process.env.LIVOS_DATA_DIR
		else process.env.LIVOS_DATA_DIR = originalDataDir
		if (originalForceRoot === undefined) delete process.env.BROKER_FORCE_ROOT_HOME
		else process.env.BROKER_FORCE_ROOT_HOME = originalForceRoot
		vi.restoreAllMocks()
	})

	function plantFixtureForUser(userId: string): void {
		const dotClaude = join(workDir, 'users', userId, '.claude')
		mkdirSync(dotClaude, {recursive: true})
		copyFileSync(FIXTURE_PATH, join(dotClaude, '.credentials.json'))
	}

	it('happy path — returns {accessToken, refreshToken, expiresAt} from valid credentials.json', async () => {
		plantFixtureForUser('abc123')
		const result = await readSubscriptionToken({livinityd: makeLivinityd(), userId: 'abc123'})
		expect(result).not.toBeNull()
		expect(result!.accessToken).toBe('sk-ant-oat01-FIXTURE-DO-NOT-USE-IN-PRODUCTION')
		expect(result!.refreshToken).toBe('sk-ant-ort01-FIXTURE-DO-NOT-USE-IN-PRODUCTION')
		expect(result!.expiresAt).toBe('2099-01-01T00:00:00.000Z')
	})

	it('returns null when credentials.json file does not exist', async () => {
		const liv = makeLivinityd()
		const result = await readSubscriptionToken({livinityd: liv, userId: 'no-such-user'})
		expect(result).toBeNull()
	})

	it('returns null when credentials.json is malformed JSON', async () => {
		const dotClaude = join(workDir, 'users', 'baduser', '.claude')
		mkdirSync(dotClaude, {recursive: true})
		writeFileSync(join(dotClaude, '.credentials.json'), '{not valid json')
		const result = await readSubscriptionToken({livinityd: makeLivinityd(), userId: 'baduser'})
		expect(result).toBeNull()
	})

	it('returns null when claudeAiOauth field is missing', async () => {
		const dotClaude = join(workDir, 'users', 'noauth', '.claude')
		mkdirSync(dotClaude, {recursive: true})
		writeFileSync(join(dotClaude, '.credentials.json'), '{}')
		const result = await readSubscriptionToken({livinityd: makeLivinityd(), userId: 'noauth'})
		expect(result).toBeNull()
	})

	it('returns null when claudeAiOauth.accessToken field is missing', async () => {
		const dotClaude = join(workDir, 'users', 'notoken', '.claude')
		mkdirSync(dotClaude, {recursive: true})
		writeFileSync(join(dotClaude, '.credentials.json'), '{"claudeAiOauth": {}}')
		const result = await readSubscriptionToken({livinityd: makeLivinityd(), userId: 'notoken'})
		expect(result).toBeNull()
	})

	it('does NOT log credential file path on read failure (Pitfall 2)', async () => {
		const liv = makeLivinityd()
		await readSubscriptionToken({livinityd: liv, userId: 'no-such-user'})
		const calls = getLogCalls(liv)
		for (const call of calls) {
			expect(call).not.toContain('/users/')
			expect(call).not.toContain('.credentials.json')
		}
	})
})

describe('readSubscriptionToken — single-user fallback (BROKER_FORCE_ROOT_HOME)', () => {
	let workDir = ''
	const originalDataDir = process.env.LIVOS_DATA_DIR
	const originalForceRoot = process.env.BROKER_FORCE_ROOT_HOME
	const originalHome = process.env.HOME

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), 'livbroker-root-cred-test-'))
		process.env.BROKER_FORCE_ROOT_HOME = 'true'
		process.env.HOME = workDir
		delete process.env.LIVOS_DATA_DIR
	})

	afterEach(() => {
		if (workDir && existsSync(workDir)) rmSync(workDir, {recursive: true, force: true})
		if (originalDataDir === undefined) delete process.env.LIVOS_DATA_DIR
		else process.env.LIVOS_DATA_DIR = originalDataDir
		if (originalForceRoot === undefined) delete process.env.BROKER_FORCE_ROOT_HOME
		else process.env.BROKER_FORCE_ROOT_HOME = originalForceRoot
		if (originalHome === undefined) delete process.env.HOME
		else process.env.HOME = originalHome
		vi.restoreAllMocks()
	})

	it('reads from process.env.HOME when BROKER_FORCE_ROOT_HOME=true (RESEARCH.md A6)', async () => {
		// Plant fixture at <HOME>/.claude/.credentials.json (NOT under users/<userId>/)
		const dotClaude = join(workDir, '.claude')
		mkdirSync(dotClaude, {recursive: true})
		copyFileSync(FIXTURE_PATH, join(dotClaude, '.credentials.json'))

		const result = await readSubscriptionToken({livinityd: makeLivinityd(), userId: 'whatever'})
		expect(result).not.toBeNull()
		expect(result!.accessToken).toBe('sk-ant-oat01-FIXTURE-DO-NOT-USE-IN-PRODUCTION')
	})
})

// ---------------------------------------------------------------------------
// Phase 57 Plan 02 Wave 1 — Risk-A1 smoke test gate (RESEARCH.md Assumption A1)
// ---------------------------------------------------------------------------
// This integration assertion mocks api.anthropic.com (via fake fetch) and
// verifies that @anthropic-ai/sdk constructs `Authorization: Bearer <token>`
// from `authToken` ClientOption. If this FAILS, the SDK does NOT use authToken
// as Bearer for /v1/messages and Phase 57 BLOCKS pending alternative auth path
// investigation per RESEARCH.md A1 mitigation.
import Anthropic from '@anthropic-ai/sdk'

describe('Risk-A1 smoke test — @anthropic-ai/sdk constructs Authorization: Bearer from authToken', () => {
	it('CRITICAL GATE: new Anthropic({authToken}) produces a fetch with Authorization: Bearer header (per RESEARCH.md Q1 verdict + Assumption A1)', async () => {
		const capturedHeaders: Record<string, string> = {}
		const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
			const headersInit = init?.headers
			if (headersInit instanceof Headers) {
				headersInit.forEach((v, k) => {
					capturedHeaders[k.toLowerCase()] = v
				})
			} else if (Array.isArray(headersInit)) {
				for (const [k, v] of headersInit) capturedHeaders[k.toLowerCase()] = v
			} else if (headersInit) {
				for (const [k, v] of Object.entries(headersInit)) capturedHeaders[k.toLowerCase()] = String(v)
			}
			return new Response(
				JSON.stringify({
					id: 'msg_smoketest',
					type: 'message',
					role: 'assistant',
					content: [{type: 'text', text: 'smoke ok'}],
					model: 'claude-sonnet-4-6',
					stop_reason: 'end_turn',
					usage: {input_tokens: 1, output_tokens: 2},
				}),
				{status: 200, headers: {'content-type': 'application/json'}},
			)
		}

		const client = new Anthropic({
			authToken: 'sk-ant-oat01-RISK-A1-SMOKE-TEST',
			defaultHeaders: {'anthropic-version': '2023-06-01'},
			// @ts-expect-error - SDK accepts custom fetch in ClientOptions
			fetch: fakeFetch,
		})

		await client.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 16,
			messages: [{role: 'user', content: 'ping'}],
		})

		// FR-BROKER-A1-01 + Risk-A1 mitigation: verify Bearer auth header present.
		expect(capturedHeaders['authorization']).toBe('Bearer sk-ant-oat01-RISK-A1-SMOKE-TEST')
		// FR-BROKER-A1-01: anthropic-version forwarded.
		expect(capturedHeaders['anthropic-version']).toBe('2023-06-01')
		// Critically: x-api-key MUST NOT be present when authToken used.
		expect(capturedHeaders['x-api-key']).toBeUndefined()
	})
})
