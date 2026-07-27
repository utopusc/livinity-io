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

const {
	detectEngine,
	installEngine,
	isVersionAtLeast,
	kopiaPtyArgs,
	kopiaSpawnEnv,
	parseKopiaProgressPercent,
	parseKopiaVersion,
	posixShellQuote,
	KOPIA_MINIMUM_VERSION,
} = await import('./engine.js')

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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 368.8-15 — the dock island sat at 0% for entire runs.
//
// Measured on the operator's box: across whole multi-minute backups, journal
// lines containing `estimated` = 0 and containing `hashing` = 0. kopia renders
// progress ONLY onto a terminal, and livinityd spawns it through a pipe, so
// there was never anything to parse. Reproduced in isolation on the same box:
// 1.5 GB snapshot piped → 0 progress lines; identical command under script(1)
// → progress frames within a second.
// ─────────────────────────────────────────────────────────────────────────────

test('kopiaPtyArgs runs kopia on a pty and preserves its exit status', () => {
	const args = kopiaPtyArgs(['snapshot', 'create', '/home/data'])

	// -q so script's own "Script started/done" banner never reaches the parser,
	// -e so kopia's exit status is what execa sees (without it every failed
	// backup would look successful), and the typescript goes to /dev/null
	// because we consume the live stream, not a recording.
	expect(args[0]).toBe('-qec')
	expect(args.at(-1)).toBe('/dev/null')
	expect(args[1]).toBe(`'kopia' 'snapshot' 'create' '/home/data'`)
})

test('kopiaPtyArgs quotes a destination name that would otherwise be shell injection', () => {
	// The operator types the folder name in the setup wizard, and it lands in the
	// repository path — so this string is genuinely attacker-influenced input on
	// the one code path that now goes through a shell.
	const args = kopiaPtyArgs(['snapshot', 'create', `/mnt/x'; touch /tmp/pwned; echo '`])

	// The metacharacters must survive as literal characters INSIDE quotes; what
	// must not survive is an unbalanced quote that lets the rest run as commands.
	expect(args[1]).toBe(`'kopia' 'snapshot' 'create' '/mnt/x'\\''; touch /tmp/pwned; echo '\\'''`)
	expect((args[1].match(/'/g) ?? []).length % 2).toBe(0)
})

test('posixShellQuote leaves no way out of the quotes', () => {
	for (const hostile of [`'`, `''`, `a'b`, `$(id)`, '`id`', '\\', '\n; id']) {
		const quoted = posixShellQuote(hostile)
		expect(quoted.startsWith(`'`)).toBe(true)
		expect(quoted.endsWith(`'`)).toBe(true)
		// Every inner quote is the escaped `'\''` form, so the string never closes early.
		expect(quoted.slice(1, -1).replaceAll(`'\\''`, '')).not.toContain(`'`)
	}
})

test('parseKopiaProgressPercent reads the newest frame in a chunk, not the oldest', () => {
	// A pty rewrites the line in place with \r, so one read() routinely carries
	// several frames. Rendering the first would draw a figure that is already
	// stale — and on a fast repo it can be several frames behind.
	const chunk =
		` | 1 hashing, 12 hashed (1.0 GB), estimated 7.6 GB (13.2%) 90s left\r` +
		` / 1 hashing, 44 hashed (3.0 GB), estimated 7.6 GB (39.5%) 40s left\r` +
		` - 1 hashing, 91 hashed (6.9 GB), estimated 7.6 GB (91.6%) 2s left`

	expect(parseKopiaProgressPercent(chunk)).toBe(91.6)
})

test('parseKopiaProgressPercent never reads one frame percentage against another frame', () => {
	// The failure this guards: a greedy `.` matches \r, so a pattern anchored on
	// `estimated … left` could span the frame boundary and pair the percentage of
	// the first frame with the `left` of the second. Here only the OLD frame
	// carries a figure and the newest one is still estimating, so a parser that
	// bridges frames would happily report a number for a frame that has none.
	const chunk = ` - estimated 7.6 GB (91.6%) 2s left\r | 1 hashing, 0 hashed (0 B), estimating...`

	expect(parseKopiaProgressPercent(chunk)).toBe(91.6)

	// And the reverse order, which is what actually happens at the start of a run.
	const startOfRun = ` | 1 hashing, 0 hashed (65.5 KB), uploaded 0 B, estimating...\r / estimated 7.6 GB (3.1%) 300s left`
	expect(parseKopiaProgressPercent(startOfRun)).toBe(3.1)
})

test('parseKopiaProgressPercent reports no news rather than zero while kopia is still estimating', () => {
	// Observed verbatim on the box. Returning 0 here would be indistinguishable
	// from a stalled backup — the exact quiet lie this phase has been removing.
	// The island's pulse carries "working" during this window instead.
	expect(
		parseKopiaProgressPercent(' | 1 hashing, 0 hashed (65.5 KB), 0 cached (0 B), uploaded 0 B, estimating...'),
	).toBeUndefined()
	expect(parseKopiaProgressPercent('Snapshotting root@box:/home/data ...')).toBeUndefined()
	expect(parseKopiaProgressPercent('')).toBeUndefined()
})

test('the snapshot write is the only kopia call that asks for a pty', async () => {
	const directory = path.dirname(fileURLToPath(import.meta.url))
	const source = await fs.readFile(path.join(directory, 'backups.ts'), 'utf8')

	// Two things must stay true together, and each breaks the other's value:
	//
	// 1. `snapshot create` must keep asking for one, or the percentage silently
	//    goes back to a number that never moves.
	// 2. NOTHING else may, because a pty interleaves progress frames into stdout
	//    and several other calls parse `--json` off it (getRepositorySize reads
	//    `repository status --json`, and would start throwing on JSON.parse).
	const ptyRequests = source.split('\n').filter((line) => /\bpty:\s*true/.test(line)).length
	expect(ptyRequests).toBe(1)

	const snapshotCall = source.slice(source.indexOf(`['snapshot', 'create'`))
	expect(snapshotCall.slice(0, 400)).toMatch(/\bpty:\s*true/)
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 368.8-16 — restoring a backup was impossible on every box.
//
// Reported verbatim from the field:
//   Command failed with exit code 32: mount --bind
//     /opt/livos/data/backup-mounts/<t>/home /opt/livos/data/backups/<t>/Home
//   mount: …/Home: must be superuser to use mount.
//
// Reproduced on the box AS THE ACTUAL RUN-USER: `mount --bind` → exit 32, while
// `kopia mount <snapshot>/home` succeeds and `umount` on it returns 0. livinityd
// is unprivileged, so a bind mount could never have worked — and restoreBackup
// awaited it even though it reads only the internal mountpoint.
// ─────────────────────────────────────────────────────────────────────────────

test('no backups source file shells out to a privileged mount', async () => {
	const directory = path.dirname(fileURLToPath(import.meta.url))
	const names = (await fs.readdir(directory)).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

	const offenders: string[] = []
	for (const name of names) {
		const source = await fs.readFile(path.join(directory, name), 'utf8')
		for (const [index, line] of source.split('\n').entries()) {
			if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue
			// `umount` stays legal: it succeeds unprivileged on a FUSE mount owned
			// by the user that made it (measured rc=0). It is `mount` that cannot.
			if (/execa\(\s*['"`]mount['"`]/.test(line) || /--bind/.test(line)) offenders.push(`${name}:${index + 1}`)
		}
	}

	expect(offenders).toEqual([])
})

test('restoreBackup does not stand up the browse-only virtual filesystem', async () => {
	const directory = path.dirname(fileURLToPath(import.meta.url))
	const source = await fs.readFile(path.join(directory, 'backups.ts'), 'utf8')

	// restoreBackup reads ONLY the internal mountpoint. Making it wait on the
	// browse mounts is what let a failure in a layer it never reads kill the
	// restore — so the call it makes must keep opting out.
	const restore = source.slice(source.indexOf('async restoreBackup('), source.indexOf('// Connect to a repository'))
	expect(restore).toMatch(/mountBackup\(backupId,\s*\{virtualFilesystem:\s*false\}\)/)
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
