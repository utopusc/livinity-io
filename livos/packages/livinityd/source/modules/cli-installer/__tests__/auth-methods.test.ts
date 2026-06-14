/**
 * Phase 267-01 Task 1 — auth-methods.test.ts
 *
 * Drift-lock + contract tests for the per-CLI auth-method matrix.
 *
 *   - CLI_AUTH_METHODS has exactly one key per SUPPORTED_CLIS name (=== 20).
 *   - Every entry has a valid branch discriminant.
 *   - aion-cli is the only 'n/a'.
 *   - DEVICE_CODE_RE extracts {url, code} from a representative device-login
 *     transcript line.
 */

import {describe, expect, test} from 'vitest'

import {
	CLI_AUTH_METHODS,
	DEVICE_CODE_RE,
	type AuthBranch,
} from '../auth-methods.js'
import {CLI_AUTH_COMMANDS} from '../auth.js'
import {SUPPORTED_CLIS} from '../install-scripts.js'

// Phase 268-01 — 'paste-back' is now a valid AuthBranch (orthogonal capability).
const VALID_BRANCHES: readonly AuthBranch[] = [
	'apikey',
	'device',
	'browser',
	'paste-back',
	'n/a',
]

describe('CLI_AUTH_METHODS — drift-lock', () => {
	test('has exactly one entry per SUPPORTED_CLIS name (=== 20)', () => {
		const keys = Object.keys(CLI_AUTH_METHODS).sort()
		const expected = [...SUPPORTED_CLIS].sort()
		expect(keys).toEqual(expected)
		expect(keys.length).toBe(20)
	})

	test('every entry has a valid branch discriminant', () => {
		for (const name of SUPPORTED_CLIS) {
			const method = CLI_AUTH_METHODS[name]
			expect(method).toBeDefined()
			expect(VALID_BRANCHES).toContain(method.branch)
		}
	})

	test('aion-cli is the only n/a branch', () => {
		const naNames = SUPPORTED_CLIS.filter(
			(n) => CLI_AUTH_METHODS[n].branch === 'n/a',
		)
		expect(naNames).toEqual(['aion-cli'])
	})

	test('device-branch CLIs carry a loginArgv', () => {
		for (const name of SUPPORTED_CLIS) {
			const method = CLI_AUTH_METHODS[name]
			if (method.branch === 'device') {
				expect(method.loginArgv).toBeDefined()
				expect(Array.isArray(method.loginArgv)).toBe(true)
			}
		}
	})

	test('apikey-branch CLIs carry an apiKeyEnv label', () => {
		for (const name of SUPPORTED_CLIS) {
			const method = CLI_AUTH_METHODS[name]
			if (method.branch === 'apikey') {
				expect(typeof method.apiKeyEnv).toBe('string')
				expect((method.apiKeyEnv ?? '').length).toBeGreaterThan(0)
			}
		}
	})

	test('the 5 device CLIs are kimi-cli, github-copilot, qoder-cli, kiro (and no others unexpected)', () => {
		const deviceNames = SUPPORTED_CLIS.filter(
			(n) => CLI_AUTH_METHODS[n].branch === 'device',
		).sort()
		expect(deviceNames).toEqual(
			['github-copilot', 'kimi-cli', 'kiro', 'qoder-cli'].sort(),
		)
	})
})

// Phase 268-01 Task 1 — 'paste-back' AuthBranch + claude-code reclassification.
describe('AuthBranch — paste-back capability (Phase 268-01)', () => {
	test("the AuthBranch type permits 'paste-back'", () => {
		// Compiles ONLY if 'paste-back' is a member of the union (TS-level proof).
		const b: AuthBranch = 'paste-back'
		expect(b).toBe('paste-back')
	})

	test("VALID_BRANCHES includes 'paste-back'", () => {
		expect(VALID_BRANCHES).toContain('paste-back')
	})

	test('adding the union member does NOT change the matrix key count (still 20)', () => {
		// A new union member is orthogonal to the matrix — no CLI is forced onto
		// paste-back in this task; the drift-lock must still read exactly 20.
		expect(Object.keys(CLI_AUTH_METHODS).length).toBe(SUPPORTED_CLIS.length)
		expect(Object.keys(CLI_AUTH_METHODS).length).toBe(20)
	})
})

describe('claude-code reclassification — bare login paste-back (Phase 268-01 / WR-04)', () => {
	test("claude-code branch is 'paste-back' (the bare headless login is the primary flow)", () => {
		// WR-04 fix: the dialog reaches the paste-back UI ONLY when the branch is
		// 'paste-back'; claude-code was the lone paste-back CLI but was still tagged
		// 'apikey', leaving the entire 268-04 paste-back path as dead code. The
		// ANTHROPIC_API_KEY env stays as the fallback the dialog can switch to.
		expect(CLI_AUTH_METHODS['claude-code'].branch).toBe('paste-back')
		expect(CLI_AUTH_METHODS['claude-code'].apiKeyEnv).toBe('ANTHROPIC_API_KEY')
	})

	test("claude-code loginArgv is bare ['claude', []] (NOT ['claude', ['setup-token']])", () => {
		// setup-token's localhost callback fails headless; the bare `claude` login
		// prompts `Paste code here if prompted` (the paste-back flow).
		expect(CLI_AUTH_METHODS['claude-code'].loginArgv).toEqual(['claude', []])
	})

	test("auth.ts CLI_AUTH_COMMANDS['claude-code'] deep-equals ['claude', []] (mirrors loginArgv)", () => {
		// auth-methods.ts loginArgv is the UI mirror; auth.ts CLI_AUTH_COMMANDS is
		// what authCli actually spawns. Both MUST agree for claude-code (RESEARCH §A).
		expect(CLI_AUTH_COMMANDS['claude-code']).toEqual(['claude', []])
	})
})

describe('DEVICE_CODE_RE — transcript parser', () => {
	test('extracts url + code from a github-style device line', () => {
		const line =
			'! First copy your one-time code: ABCD-1234\n! Open https://github.com/login/device in your browser'
		const url = line.match(DEVICE_CODE_RE.url)?.[1]
		const code = line.match(DEVICE_CODE_RE.code)?.[1]
		expect(url).toBe('https://github.com/login/device')
		expect(code).toBe('ABCD-1234')
	})

	test('extracts url + short code from a kimi-style stderr line', () => {
		const line = 'Visit https://kimi.com/device and enter code WXYZ9'
		const url = line.match(DEVICE_CODE_RE.url)?.[1]
		const code = line.match(DEVICE_CODE_RE.code)?.[1]
		expect(url).toBe('https://kimi.com/device')
		expect(code).toBe('WXYZ9')
	})
})
