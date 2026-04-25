// Phase 22 MH-04 — index.ts CLI parser tests.

import {beforeEach, describe, expect, test} from 'vitest'

import {parseArgs} from './index.js'

const ORIGINAL_ENV = {...process.env}

beforeEach(() => {
	delete process.env.LIVOS_AGENT_TOKEN
	delete process.env.LIVOS_AGENT_SERVER
	for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
		if (typeof v === 'string') process.env[k] = v
	}
})

describe('parseArgs', () => {
	test('--token and --server flags are required', () => {
		// Make sure env is clean so the test only sees the explicit argv
		delete process.env.LIVOS_AGENT_TOKEN
		delete process.env.LIVOS_AGENT_SERVER

		expect(() => parseArgs([])).toThrow(/--token/)
		expect(() => parseArgs(['--token', 'abc'])).toThrow(/--server/)
	})

	test('flag form parses correctly', () => {
		delete process.env.LIVOS_AGENT_TOKEN
		delete process.env.LIVOS_AGENT_SERVER
		const args = parseArgs([
			'--token',
			'abc123',
			'--server',
			'wss://example.com/agent/connect',
		])
		expect(args).toEqual({token: 'abc123', server: 'wss://example.com/agent/connect'})
	})

	test('env-var fallback applies', () => {
		process.env.LIVOS_AGENT_TOKEN = 'env-token'
		process.env.LIVOS_AGENT_SERVER = 'wss://env.example.com/agent/connect'
		const args = parseArgs([])
		expect(args).toEqual({
			token: 'env-token',
			server: 'wss://env.example.com/agent/connect',
		})
	})

	test('CLI flags override env vars', () => {
		process.env.LIVOS_AGENT_TOKEN = 'env-token'
		process.env.LIVOS_AGENT_SERVER = 'wss://env.example.com/agent/connect'
		const args = parseArgs([
			'--token',
			'cli-token',
			'--server',
			'wss://cli.example.com/agent/connect',
		])
		expect(args).toEqual({
			token: 'cli-token',
			server: 'wss://cli.example.com/agent/connect',
		})
	})
})
