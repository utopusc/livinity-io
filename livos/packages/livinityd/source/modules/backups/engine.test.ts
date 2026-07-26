import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

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

const {detectEngine, installEngine, isVersionAtLeast, kopiaSpawnEnv, parseKopiaVersion, KOPIA_MINIMUM_VERSION} =
	await import('./engine.js')

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

// ── where kopia keeps its state (368.8-10) ───────────────────────────────
//
// WHY this is asserted instead of merely written down.
//
// /kopia, /kopia/config and /kopia/cache are created ONLY by root — update.sh
// (Step 1c, the kopia install) and scripts/install/deploy-livinityd.sh — and
// there is not a single chown of /kopia anywhere in this repo. livinityd runs
// as an unprivileged service user (systemd `User=`, Phase 192) and spawns kopia
// with a plain execa, no sudo and no container. So every spawn whose XDG dirs
// point inside /kopia dies before it does any work.
//
// Measured on the operator's box 2026-07-26, running v1.1.13:
//
//   $ kopia repository create filesystem --path=…/backups-internal/…
//   Unable to create logs directory: mkdir /kopia/cache/kopia: permission denied
//   unable to write config file: … open /kopia/config/190aa42e.config…: permission denied
//
//   drwxr-xr-x 4 root root /kopia          # run-user is `everything`, uid 1001
//   ls -la /kopia/config/ → EMPTY          # ⇒ NO kopia repository has ever been
//                                          #   created on this box: USB, NAS, pool
//                                          #   and the 368.5 safety snapshots have
//                                          #   all been failing here since they shipped
//
// /opt/livos, by contrast, is chowned to the DERIVED run-user on every update
// (update.sh:4566-4568), and livinityd already creates children there itself —
// SAFETY_REPO_PATH (/opt/livos/backups-local) and INTERNAL_BACKUP_ROOT
// (/opt/livos/backups-internal, Route C / OP-05). Same reasoning, same answer:
// kopia's state belongs under /opt/livos, not at the root-owned filesystem top.

const KOPIA_STATE_MUST_LIVE_UNDER = '/opt/livos/'

test('every kopia state path livinityd hands the engine is under /opt/livos', () => {
	const env = kopiaSpawnEnv()

	// XDG_CACHE_HOME → "Unable to create logs directory … permission denied".
	// XDG_CONFIG_HOME → "unable to write config file … permission denied".
	// Asserted as a filtered list rather than two booleans so that a failure
	// PRINTS the offending path instead of "expected false to be true" — the
	// point of this test is to name the thing that broke on the box.
	const statePaths = [env.XDG_CACHE_HOME, env.XDG_CONFIG_HOME]
	expect(statePaths.filter((statePath) => !statePath.startsWith(KOPIA_STATE_MUST_LIVE_UNDER))).toEqual([])

	// Unchanged — pinned so the extraction cannot quietly drop it.
	expect(env.KOPIA_CHECK_FOR_UPDATES).toBe('false')
})

test('no backups source file spells a kopia state path inline', async () => {
	const directory = path.dirname(fileURLToPath(import.meta.url))
	const names = (await fs.readdir(directory)).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

	// Regression net for the SECOND half of the same defect: the per-repository
	// `--config-file=` flags, which do not travel through the env above. Every
	// kopia state path must be derived from engine.ts's constants so that moving
	// the root moves all of them at once.
	const offenders: string[] = []
	for (const name of names) {
		// destination-policy.ts lists /kopia in REFUSED_SYSTEM_PREFIXES — i.e. as a
		// FORBIDDEN backup DESTINATION. That is unrelated to where kopia keeps its
		// own state, and it stays correct however this move turns out.
		if (name === 'destination-policy.ts') continue
		const source = await fs.readFile(path.join(directory, name), 'utf8')
		for (const [index, line] of source.split('\n').entries()) {
			if (/\/kopia\/(config|cache)/.test(line)) offenders.push(`${name}:${index + 1}`)
		}
	}

	expect(offenders).toEqual([])
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
