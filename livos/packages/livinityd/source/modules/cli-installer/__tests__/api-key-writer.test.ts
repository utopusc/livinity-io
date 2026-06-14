/**
 * Phase 267-01 Task 2 — api-key-writer.test.ts
 *
 * Unit tests for writeApiKey — the no-spawn per-CLI API-key writer.
 *
 * Covers the 267 must-haves:
 *   - whitelist guard (D-239-07): unknown name throws BEFORE any fs touch
 *   - non-apikey branch (e.g. aion-cli n/a, kimi-cli device) throws
 *   - gemini → ~/.gemini/.env contains `GEMINI_API_KEY=` AND file mode 0600
 *   - the key is NEVER passed to logger.* (only name + path)
 *   - JSON-merge target (qwen-code) preserves siblings
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {writeApiKey} from '../api-key-writer.js'
import type {InstallerLogger} from '../types.js'

function makeLogger(): InstallerLogger {
	return {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
}

let tmpHome: string

beforeEach(async () => {
	tmpHome = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'livos-apikey-'))
})

afterEach(async () => {
	await fsPromises.rm(tmpHome, {recursive: true, force: true})
})

describe('writeApiKey — whitelist guard (D-239-07 RCE boundary)', () => {
	test('unknown name throws BEFORE any fs operation', async () => {
		const fs = {
			mkdir: vi.fn(),
			readFile: vi.fn(),
			writeFile: vi.fn(),
			chmod: vi.fn(),
		}
		await expect(
			writeApiKey(
				{name: '../etc/passwd' as any, key: 'k'},
				{logger: makeLogger(), homeDir: tmpHome, fs: fs as any},
			),
		).rejects.toThrow(/not in whitelist/i)
		expect(fs.mkdir).not.toHaveBeenCalled()
		expect(fs.writeFile).not.toHaveBeenCalled()
	})
})

describe('writeApiKey — non-apikey branch rejection', () => {
	test('aion-cli (branch n/a) throws — no key target', async () => {
		await expect(
			writeApiKey(
				{name: 'aion-cli', key: 'k'},
				{logger: makeLogger(), homeDir: tmpHome},
			),
		).rejects.toThrow(/API key not supported/i)
	})

	test('kimi-cli (branch device) throws — must use device flow', async () => {
		await expect(
			writeApiKey(
				{name: 'kimi-cli', key: 'k'},
				{logger: makeLogger(), homeDir: tmpHome},
			),
		).rejects.toThrow(/API key not supported/i)
	})
})

describe('writeApiKey — env target (gemini)', () => {
	test('writes GEMINI_API_KEY= to ~/.gemini/.env at mode 0600', async () => {
		const result = await writeApiKey(
			{name: 'gemini', key: 'sk-test-1234'},
			{logger: makeLogger(), homeDir: tmpHome},
		)
		expect(result.ok).toBe(true)
		const expectedPath = path.join(tmpHome, '.gemini', '.env')
		expect(result.path).toBe(expectedPath)

		const contents = await fsPromises.readFile(expectedPath, 'utf8')
		expect(contents).toContain('GEMINI_API_KEY=')
		expect(contents).toContain('sk-test-1234')

		// Mode 0600 — owner rw only. (POSIX only; Windows reports a coarser mode,
		// so assert the low bits on POSIX and skip the strict check on win32.)
		if (process.platform !== 'win32') {
			const stat = await fsPromises.stat(expectedPath)
			expect(stat.mode & 0o777).toBe(0o600)
		}
	})

	test('never passes the key value to logger.*', async () => {
		const logger = makeLogger()
		await writeApiKey(
			{name: 'gemini', key: 'SUPER-SECRET-VALUE'},
			{logger, homeDir: tmpHome},
		)
		const allLogArgs = [
			...(logger.info as any).mock.calls,
			...(logger.warn as any).mock.calls,
			...(logger.error as any).mock.calls,
		]
			.flat()
			.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
			.join(' | ')
		expect(allLogArgs).not.toContain('SUPER-SECRET-VALUE')
	})

	test('merging preserves a pre-existing unrelated dotenv line', async () => {
		const dir = path.join(tmpHome, '.gemini')
		await fsPromises.mkdir(dir, {recursive: true})
		await fsPromises.writeFile(path.join(dir, '.env'), 'OTHER_VAR=keepme\n')
		await writeApiKey(
			{name: 'gemini', key: 'new-key'},
			{logger: makeLogger(), homeDir: tmpHome},
		)
		const contents = await fsPromises.readFile(path.join(dir, '.env'), 'utf8')
		expect(contents).toContain('OTHER_VAR=keepme')
		expect(contents).toContain('GEMINI_API_KEY=')
	})
})

describe('writeApiKey — json target (qwen-code)', () => {
	test('deep-merges DASHSCOPE_API_KEY into ~/.qwen/settings.json preserving siblings', async () => {
		const dir = path.join(tmpHome, '.qwen')
		await fsPromises.mkdir(dir, {recursive: true})
		await fsPromises.writeFile(
			path.join(dir, 'settings.json'),
			JSON.stringify({theme: 'dark', env: {OTHER: 'x'}}),
		)
		await writeApiKey(
			{name: 'qwen-code', key: 'qwen-key-9'},
			{logger: makeLogger(), homeDir: tmpHome},
		)
		const raw = await fsPromises.readFile(path.join(dir, 'settings.json'), 'utf8')
		const parsed = JSON.parse(raw)
		expect(parsed.theme).toBe('dark')
		expect(parsed.env.OTHER).toBe('x')
		expect(parsed.env.DASHSCOPE_API_KEY).toBe('qwen-key-9')
	})
})
