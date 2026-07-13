import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {afterAll, afterEach, beforeEach, expect, test, vi} from 'vitest'

// Record execa invocations; let tests script each command's behaviour.
const calls: string[][] = []
let execaImpl: ((file: string, args: string[]) => Promise<{stdout: string}>) | null = null

vi.mock('execa', () => ({
	execa: (file: string, args: string[] = []) => {
		calls.push([file, ...args])
		if (execaImpl) return execaImpl(file, args)
		return Promise.resolve({stdout: '', stderr: '', exitCode: 0})
	},
}))

const {detectEngine, installEngine, isVersionAtLeast, parseKopiaVersion, KOPIA_MINIMUM_VERSION} = await import(
	'./engine.js'
)

const logger = {log: () => {}, error: () => {}}

// process.getuid is absent on Windows (win32), so spyOn can't wrap it. Install
// a stub descriptor once and let each test set the return value directly.
const originalGetuid = Object.getOwnPropertyDescriptor(process, 'getuid')
let getuidValue = 0
Object.defineProperty(process, 'getuid', {configurable: true, value: () => getuidValue})

beforeEach(() => {
	calls.length = 0
	execaImpl = null
	getuidValue = 0 // default: root, so install-path tests exercise the download
})
afterEach(() => {
	vi.restoreAllMocks()
})
afterAll(() => {
	if (originalGetuid) Object.defineProperty(process, 'getuid', originalGetuid)
	else delete (process as {getuid?: unknown}).getuid
})

// ── parseKopiaVersion ────────────────────────────────────────────────────

test('parseKopiaVersion extracts the leading version token', () => {
	expect(parseKopiaVersion('0.23.1 build: 8f2a from: kopia/kopia')).toBe('0.23.1')
	expect(parseKopiaVersion('v0.24.0 build: x')).toBe('0.24.0')
	expect(parseKopiaVersion('  0.23.1\n')).toBe('0.23.1')
})

test('parseKopiaVersion rejects non-version output', () => {
	expect(parseKopiaVersion('')).toBeUndefined()
	expect(parseKopiaVersion('command not found')).toBeUndefined()
})

// ── isVersionAtLeast ─────────────────────────────────────────────────────

test('isVersionAtLeast compares dotted versions numerically', () => {
	expect(isVersionAtLeast('0.23.1', '0.23.1')).toBe(true)
	expect(isVersionAtLeast('0.24.0', '0.23.1')).toBe(true)
	expect(isVersionAtLeast('1.0', '0.23.1')).toBe(true)
	expect(isVersionAtLeast('0.21.1', '0.23.1')).toBe(false)
	expect(isVersionAtLeast('0.23', '0.23.1')).toBe(false)
	expect(isVersionAtLeast('0.23.10', '0.23.2')).toBe(true)
})

// ── detectEngine ─────────────────────────────────────────────────────────

test('detectEngine: modern kopia → available with version', async () => {
	execaImpl = async () => ({stdout: `${KOPIA_MINIMUM_VERSION} build: abc from: kopia/kopia`})
	const status = await detectEngine()
	expect(status).toMatchObject({available: true, version: KOPIA_MINIMUM_VERSION})
})

test('detectEngine: old kopia → unavailable/outdated (0.23.1 fixes a data-loss race)', async () => {
	execaImpl = async () => ({stdout: '0.21.1 build: abc'})
	const status = await detectEngine()
	expect(status).toMatchObject({available: false, reason: 'outdated', version: '0.21.1'})
})

test('detectEngine: binary missing (ENOENT) → unavailable/missing, never throws', async () => {
	execaImpl = async () => {
		throw Object.assign(new Error('spawn kopia ENOENT'), {code: 'ENOENT'})
	}
	const status = await detectEngine()
	expect(status).toMatchObject({available: false, reason: 'missing'})
})

test('detectEngine: garbage output → unavailable/unknown', async () => {
	execaImpl = async () => ({stdout: 'not a version'})
	const status = await detectEngine()
	expect(status).toMatchObject({available: false, reason: 'unknown'})
})

// ── installEngine ────────────────────────────────────────────────────────

test('installEngine refuses on non-linux platforms', async () => {
	const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32' as NodeJS.Platform)
	expect(await installEngine(logger)).toBe(false)
	expect(calls.length).toBe(0)
	platform.mockRestore()
})

test('installEngine defers (no download) when livinityd is not root', async () => {
	vi.spyOn(process, 'platform', 'get').mockReturnValue('linux' as NodeJS.Platform)
	vi.spyOn(process, 'arch', 'get').mockReturnValue('x64' as NodeJS.Architecture)
	getuidValue = 1000
	expect(await installEngine(logger)).toBe(false)
	// Critically: no curl — a non-root box must NOT download 20MB hourly.
	expect(calls.length).toBe(0)
})

test('installEngine refuses on unsupported arch', async () => {
	vi.spyOn(process, 'platform', 'get').mockReturnValue('linux' as NodeJS.Platform)
	vi.spyOn(process, 'arch', 'get').mockReturnValue('mips' as NodeJS.Architecture)
	expect(await installEngine(logger)).toBe(false)
	expect(calls.length).toBe(0)
})

test('installEngine aborts (no install) on sha256 mismatch', async () => {
	vi.spyOn(process, 'platform', 'get').mockReturnValue('linux' as NodeJS.Platform)
	vi.spyOn(process, 'arch', 'get').mockReturnValue('x64' as NodeJS.Architecture)

	// "curl" writes a tarball whose hash cannot match the pinned sha256.
	execaImpl = async (file, args) => {
		if (file === 'curl') {
			const output = args[args.indexOf('-o') + 1]
			await fs.writeFile(output, 'definitely not the pinned kopia tarball')
		}
		return {stdout: ''}
	}

	expect(await installEngine(logger)).toBe(false)
	// curl ran, but tar/install must never have been reached.
	expect(calls.some((c) => c[0] === 'curl')).toBe(true)
	expect(calls.some((c) => c[0] === 'tar')).toBe(false)
})

test('installEngine cleans up its temporary directory on failure', async () => {
	vi.spyOn(process, 'platform', 'get').mockReturnValue('linux' as NodeJS.Platform)
	vi.spyOn(process, 'arch', 'get').mockReturnValue('x64' as NodeJS.Architecture)
	execaImpl = async () => {
		throw new Error('network down')
	}
	expect(await installEngine(logger)).toBe(false)
	const leftovers = (await fs.readdir(os.tmpdir())).filter((name) => name.startsWith('kopia-install-'))
	// Any leftover dirs must not be from this run (best-effort: none expected at all).
	for (const name of leftovers) {
		// Tolerate unrelated concurrent runs but flag obviously-fresh leaks.
		const stats = await fs.stat(path.join(os.tmpdir(), name)).catch(() => null)
		if (stats) expect(Date.now() - stats.mtimeMs).toBeGreaterThan(60_000)
	}
})
