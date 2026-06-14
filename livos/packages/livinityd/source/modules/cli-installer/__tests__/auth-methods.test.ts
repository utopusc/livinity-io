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
import {SUPPORTED_CLIS} from '../install-scripts.js'

const VALID_BRANCHES: readonly AuthBranch[] = ['apikey', 'device', 'browser', 'n/a']

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
