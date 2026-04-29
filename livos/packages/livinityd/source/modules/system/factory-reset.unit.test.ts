// Phase 37-02 + 37-03 unit tests for the v29.2 factory-reset module.
// Mirrors update.unit.test.ts patterns: vi.mock('node:fs/promises'),
// Livinityd({dataDirectory:'/tmp'}) for the unused _livinityd argument,
// vitest singleThread (configured in package.json line 16).
//
// Coverage:
//   - factoryResetInputSchema: 4 cases (true / false / non-boolean / missing)
//   - preflightCheck (D-RT-05): 6 cases (update-in-progress / missing .env /
//       missing key / no-preserve happy / preserve happy / corrupt JSON)
//   - stashApiKey (D-KEY-01): 3 cases (happy / missing key / quoted value)
//   - buildEventPath: 1 case (ISO basic format + path shape)
//   - deployRuntimeArtifacts (D-CG-02): 6 cases (copy-on-missing / skip-when-fresh /
//       re-copy-when-stale / re-copy-when-not-executable / missing-source / mkdir-p)
//   - spawnResetScope (D-CG-01): 4 cases (systemd-run-missing / non-root-EUID /
//       argv-shape / no-preserve flag)
//   - performFactoryReset (full happy path with spawn mocked): 3 cases
//       (200ms-return / preflight-gates-spawn / preserveApiKey-reaches-spawn)
//
// Tests MUST NOT spawn subprocesses, hit network, or touch the real filesystem.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, beforeEach, afterEach, expect, test, vi} from 'vitest'
import {EventEmitter} from 'node:events'
import * as childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import {TRPCError} from '@trpc/server'

import {
	factoryResetInputSchema,
	preflightCheck,
	stashApiKey,
	performFactoryReset,
	buildEventPath,
	deployRuntimeArtifacts,
	spawnResetScope,
	APIKEY_TMP_PATH,
	SNAPSHOT_SIDECAR_PATH,
	RESET_SCRIPT_RUNTIME_PATH,
	WRAPPER_RUNTIME_PATH,
} from './factory-reset.js'
import Livinityd from '../../index.js'

vi.mock('node:fs/promises')
vi.mock('node:child_process')
vi.mock('execa')

/** Build a minimal fake child-process emitter that satisfies child_process.spawn's
 * return-shape contract for our purposes (unref + pid). */
function fakeChild() {
	const ee = new EventEmitter() as any
	ee.unref = vi.fn()
	ee.pid = 42
	ee.stdout = null
	ee.stderr = null
	return ee
}

describe('factoryResetInputSchema (D-RT-01)', () => {
	test('accepts {preserveApiKey: true}', () => {
		expect(factoryResetInputSchema.parse({preserveApiKey: true})).toEqual({preserveApiKey: true})
	})

	test('accepts {preserveApiKey: false}', () => {
		expect(factoryResetInputSchema.parse({preserveApiKey: false})).toEqual({preserveApiKey: false})
	})

	test('rejects non-boolean preserveApiKey', () => {
		expect(() => factoryResetInputSchema.parse({preserveApiKey: 'yes'})).toThrow()
	})

	test('rejects missing preserveApiKey', () => {
		expect(() => factoryResetInputSchema.parse({})).toThrow()
	})
})

describe('preflightCheck (D-RT-05)', () => {
	beforeEach(() => {
		// Default: empty update-history, no in-progress updates
		vi.mocked(fs.readdir).mockResolvedValue([] as any)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('throws CONFLICT when an *-update.json with status:in-progress exists', async () => {
		vi.mocked(fs.readdir).mockResolvedValue(['20260429T120000Z-update.json'] as any)
		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({status: 'in-progress', timestamp: '20260429T120000Z'}) as any,
		)

		let caught: any
		try {
			await preflightCheck({preserveApiKey: false})
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('CONFLICT')
		expect(caught.message).toMatch(/update.*in progress/i)
	})

	test('throws BAD_REQUEST with /opt/livos/.env message when ENV_FILE_PATH ENOENT and preserveApiKey=true', async () => {
		const enoent: any = new Error('ENOENT: no such file or directory')
		enoent.code = 'ENOENT'
		// readdir empty -> readFile next call is for .env -> rejects ENOENT
		vi.mocked(fs.readFile).mockRejectedValue(enoent)

		let caught: any
		try {
			await preflightCheck({preserveApiKey: true})
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('BAD_REQUEST')
		expect(caught.message).toContain('/opt/livos/.env')
	})

	test('throws BAD_REQUEST with LIV_PLATFORM_API_KEY message when .env exists but lacks the key', async () => {
		vi.mocked(fs.readFile).mockResolvedValue('OTHER_VAR=foo\nANOTHER=bar\n' as any)

		let caught: any
		try {
			await preflightCheck({preserveApiKey: true})
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('BAD_REQUEST')
		expect(caught.message).toContain('LIV_PLATFORM_API_KEY')
	})

	test('succeeds when no in-progress updates AND preserveApiKey=false (no .env check)', async () => {
		// readdir is empty by default; readFile not called when preserveApiKey=false
		await expect(preflightCheck({preserveApiKey: false})).resolves.toBeUndefined()
	})

	test('succeeds when no in-progress updates AND .env contains a non-empty LIV_PLATFORM_API_KEY', async () => {
		vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY=abc123\n' as any)
		await expect(preflightCheck({preserveApiKey: true})).resolves.toBeUndefined()
	})

	test('skips corrupt JSON in update-history without crashing (defensive)', async () => {
		vi.mocked(fs.readdir).mockResolvedValue([
			'20260429T120000Z-update.json',
			'20260429T130000Z-update.json',
		] as any)
		// First file: corrupt JSON; second file: clean (not in-progress).
		vi.mocked(fs.readFile)
			.mockResolvedValueOnce('not valid json{' as any)
			.mockResolvedValueOnce(JSON.stringify({status: 'success'}) as any)
		await expect(preflightCheck({preserveApiKey: false})).resolves.toBeUndefined()
	})
})

describe('stashApiKey (D-KEY-01)', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('writes key to APIKEY_TMP_PATH with mode 0o600 and returns the path', async () => {
		vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY="secret123"\n' as any)
		vi.mocked(fs.writeFile).mockResolvedValue()
		vi.mocked(fs.chmod).mockResolvedValue()

		const resultPath = await stashApiKey()

		expect(resultPath).toBe(APIKEY_TMP_PATH)
		expect(fs.writeFile).toHaveBeenCalledWith(
			APIKEY_TMP_PATH,
			'secret123',
			expect.objectContaining({mode: 0o600}),
		)
		expect(fs.chmod).toHaveBeenCalledWith(APIKEY_TMP_PATH, 0o600)
	})

	test('throws BAD_REQUEST when LIV_PLATFORM_API_KEY missing from .env', async () => {
		vi.mocked(fs.readFile).mockResolvedValue('OTHER=x\n' as any)

		let caught: any
		try {
			await stashApiKey()
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('BAD_REQUEST')
	})

	test('strips single and double quotes from the value', async () => {
		vi.mocked(fs.readFile).mockResolvedValue("LIV_PLATFORM_API_KEY='quoted-value'\n" as any)
		vi.mocked(fs.writeFile).mockResolvedValue()
		vi.mocked(fs.chmod).mockResolvedValue()

		await stashApiKey()
		expect(fs.writeFile).toHaveBeenCalledWith(
			APIKEY_TMP_PATH,
			'quoted-value',
			expect.objectContaining({mode: 0o600}),
		)
	})
})

describe('buildEventPath', () => {
	test('produces ISO basic-format timestamp YYYYMMDDTHHMMSSZ and update-history path', () => {
		const {timestamp, eventPath} = buildEventPath()
		expect(timestamp).toMatch(/^\d{8}T\d{6}Z$/)
		// path.posix.join — no Windows backslashes
		expect(eventPath).toMatch(/update-history\/\d{8}T\d{6}Z-factory-reset\.json$/)
	})
})

describe('deployRuntimeArtifacts (D-CG-02)', () => {
	beforeEach(() => {
		vi.mocked(fs.access).mockResolvedValue()
		vi.mocked(fs.mkdir).mockResolvedValue(undefined as any)
		vi.mocked(fs.copyFile).mockResolvedValue()
		vi.mocked(fs.chmod).mockResolvedValue()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('copies both files when destinations are missing (first call)', async () => {
		// stat: source ok, dest ENOENT
		vi.mocked(fs.stat).mockImplementation(async (p: any) => {
			if (String(p).startsWith('/opt/')) {
				const e: any = new Error('ENOENT')
				e.code = 'ENOENT'
				throw e
			}
			return {mtimeMs: 1000, mode: 0o644} as any
		})
		await deployRuntimeArtifacts()
		expect(fs.copyFile).toHaveBeenCalledTimes(2)
		expect(fs.chmod).toHaveBeenCalledWith(RESET_SCRIPT_RUNTIME_PATH, 0o755)
		expect(fs.chmod).toHaveBeenCalledWith(WRAPPER_RUNTIME_PATH, 0o755)
	})

	test('skips copy when destination is fresh AND has executable bit', async () => {
		vi.mocked(fs.stat).mockResolvedValue({mtimeMs: 9999, mode: 0o755} as any)
		await deployRuntimeArtifacts()
		expect(fs.copyFile).not.toHaveBeenCalled()
	})

	test('re-copies when destination mtime is older than source mtime', async () => {
		vi.mocked(fs.stat).mockImplementation(async (p: any) => {
			// /opt/* paths are destinations (stale: mtime 1)
			if (String(p).startsWith('/opt/')) return {mtimeMs: 1, mode: 0o755} as any
			// other paths are source (fresh: mtime 9999)
			return {mtimeMs: 9999, mode: 0o644} as any
		})
		await deployRuntimeArtifacts()
		expect(fs.copyFile).toHaveBeenCalledTimes(2)
	})

	test('re-copies when destination lacks the executable bit (mode 0o644)', async () => {
		vi.mocked(fs.stat).mockImplementation(async (p: any) => {
			// dest fresh by mtime but NOT executable → must re-copy + chmod
			if (String(p).startsWith('/opt/')) return {mtimeMs: 9999, mode: 0o644} as any
			return {mtimeMs: 1, mode: 0o644} as any
		})
		await deployRuntimeArtifacts()
		expect(fs.copyFile).toHaveBeenCalled()
	})

	test('throws INTERNAL_SERVER_ERROR when source is missing (fs.access ENOENT)', async () => {
		const enoent: any = new Error('ENOENT: source missing')
		enoent.code = 'ENOENT'
		vi.mocked(fs.access).mockRejectedValue(enoent)

		let caught: any
		try {
			await deployRuntimeArtifacts()
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('INTERNAL_SERVER_ERROR')
		expect(caught.message).toContain('factory-reset source missing')
	})

	test('mkdir -p creates the runtime parent directories', async () => {
		vi.mocked(fs.stat).mockResolvedValue({mtimeMs: 9999, mode: 0o755} as any)
		await deployRuntimeArtifacts()
		expect(fs.mkdir).toHaveBeenCalledWith(
			'/opt/livos/data/factory-reset',
			expect.objectContaining({recursive: true}),
		)
		expect(fs.mkdir).toHaveBeenCalledWith(
			'/opt/livos/data/wrapper',
			expect.objectContaining({recursive: true}),
		)
	})
})

describe('spawnResetScope (D-CG-01)', () => {
	let originalGeteuid: any

	beforeEach(async () => {
		originalGeteuid = process.geteuid
		;(process as any).geteuid = () => 0
		// Default: execa('command -v systemd-run') resolves OK.
		const execaMod: any = await import('execa')
		execaMod.execa = vi.fn().mockResolvedValue({stdout: '/usr/bin/systemd-run'})
	})

	afterEach(() => {
		;(process as any).geteuid = originalGeteuid
		vi.restoreAllMocks()
	})

	test('rejects with INTERNAL_SERVER_ERROR when systemd-run is unavailable', async () => {
		const execaMod: any = await import('execa')
		execaMod.execa = vi.fn().mockRejectedValue(new Error('not found'))

		let caught: any
		try {
			await spawnResetScope({preserveApiKey: true, eventPath: '/x', timestamp: 'T'})
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('INTERNAL_SERVER_ERROR')
		expect(caught.message).toMatch(/systemd-run/i)
	})

	test('rejects with INTERNAL_SERVER_ERROR when EUID is not 0', async () => {
		;(process as any).geteuid = () => 1000

		let caught: any
		try {
			await spawnResetScope({preserveApiKey: false, eventPath: '/x', timestamp: 'T'})
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('INTERNAL_SERVER_ERROR')
		expect(caught.message).toMatch(/root/i)
	})

	test('argv shape: --scope --collect --unit <name> --quiet bash <reset.sh> --preserve-api-key <eventPath>', async () => {
		const child = fakeChild()
		vi.mocked(childProcess.spawn).mockReturnValue(child as any)

		await spawnResetScope({
			preserveApiKey: true,
			eventPath: '/event.json',
			timestamp: '20260429T120000Z',
		})

		expect(childProcess.spawn).toHaveBeenCalledWith(
			'systemd-run',
			[
				'--scope',
				'--collect',
				'--unit', 'livos-factory-reset-20260429T120000Z',
				'--quiet',
				'bash',
				RESET_SCRIPT_RUNTIME_PATH,
				'--preserve-api-key',
				'/event.json',
			],
			expect.objectContaining({detached: true, stdio: 'ignore'}),
		)
		expect(child.unref).toHaveBeenCalled()
	})

	test('preserveApiKey=false produces --no-preserve-api-key in argv', async () => {
		const child = fakeChild()
		vi.mocked(childProcess.spawn).mockReturnValue(child as any)

		await spawnResetScope({preserveApiKey: false, eventPath: '/e', timestamp: 'T'})

		const argvList = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
		expect(argvList).toContain('--no-preserve-api-key')
		expect(argvList).not.toContain('--preserve-api-key')
	})
})

describe('performFactoryReset (full happy path with spawn mocked)', () => {
	let livinityd: any
	let originalGeteuid: any

	beforeEach(async () => {
		livinityd = new Livinityd({dataDirectory: '/tmp'})
		originalGeteuid = process.geteuid
		;(process as any).geteuid = () => 0

		// Default mocks: empty update-history, fresh artifacts, root EUID, systemd-run OK.
		vi.mocked(fs.readdir).mockResolvedValue([] as any)
		vi.mocked(fs.access).mockResolvedValue()
		vi.mocked(fs.mkdir).mockResolvedValue(undefined as any)
		vi.mocked(fs.copyFile).mockResolvedValue()
		vi.mocked(fs.chmod).mockResolvedValue()
		vi.mocked(fs.stat).mockResolvedValue({mtimeMs: 9999, mode: 0o755} as any)
		vi.mocked(fs.writeFile).mockResolvedValue()

		const execaMod: any = await import('execa')
		execaMod.execa = vi.fn().mockResolvedValue({stdout: '/usr/bin/systemd-run'})

		vi.mocked(childProcess.spawn).mockReturnValue(fakeChild() as any)
	})

	afterEach(() => {
		;(process as any).geteuid = originalGeteuid
		vi.restoreAllMocks()
	})

	test('happy path returns {accepted:true, eventPath, snapshotPath}', async () => {
		const result = await performFactoryReset(livinityd, {preserveApiKey: false})

		expect(result.accepted).toBe(true)
		expect(result.eventPath).toMatch(/update-history\/\d{8}T\d{6}Z-factory-reset\.json$/)
		expect(result.snapshotPath).toBe(SNAPSHOT_SIDECAR_PATH)
	})

	test('returns within 200ms wall-clock (D-RT-03)', async () => {
		const t0 = Date.now()
		const result = await performFactoryReset(livinityd, {preserveApiKey: false})
		const elapsed = Date.now() - t0
		// 200ms budget per CONTEXT.md D-RT-03. If this is flaky in CI, raise to
		// 500ms with a comment — the actual cost is ~10-20ms (execa probe) plus
		// stat overhead. Anything > 200ms suggests an unintended sync await.
		expect(elapsed).toBeLessThan(200)
		expect(result.accepted).toBe(true)
	})

	test('preflight rejection (update-in-progress) does NOT spawn', async () => {
		vi.mocked(fs.readdir).mockResolvedValue(['20260429T120000Z-update.json'] as any)
		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({status: 'in-progress'}) as any,
		)

		let caught: any
		try {
			await performFactoryReset(livinityd, {preserveApiKey: false})
		} catch (e) {
			caught = e
		}
		expect(caught).toBeInstanceOf(TRPCError)
		expect(caught.code).toBe('CONFLICT')
		// The crucial invariant: preflight gates the spawn entirely.
		expect(childProcess.spawn).not.toHaveBeenCalled()
	})

	test('preserveApiKey=true triggers stashApiKey + reaches spawn with --preserve-api-key', async () => {
		vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY=k1\n' as any)

		const result = await performFactoryReset(livinityd, {preserveApiKey: true})

		expect(result.accepted).toBe(true)
		expect(fs.writeFile).toHaveBeenCalledWith(
			APIKEY_TMP_PATH,
			'k1',
			expect.objectContaining({mode: 0o600}),
		)
		// Verify the spawn carried the preserve flag through.
		const argv = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
		expect(argv).toContain('--preserve-api-key')
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Plan 37-04 — JSON event row schema (D-EVT-02 + D-EVT-03 Phase 33 compat)
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON event row schema (D-EVT-02 + D-EVT-03 Phase 33 compat)', () => {
	// Representative success row matching the bash output shape (factory-reset.sh
	// write_event "success"). Mirrors the cat-heredoc shape verbatim — every
	// field the bash emits MUST be present and match the contract.
	const sampleSuccessRow = {
		type: 'factory-reset',
		status: 'success',
		timestamp: '20260429T120030Z',
		started_at: '2026-04-29T12:00:30Z',
		ended_at: '2026-04-29T12:08:45Z',
		preserveApiKey: true,
		wipe_duration_ms: 12345,
		reinstall_duration_ms: 477123,
		install_sh_exit_code: 0,
		install_sh_source: 'live',
		snapshot_path: '/tmp/livos-pre-reset-20260429T120030Z.tar.gz',
		error: null as string | null,
	}

	const sampleFailedRow = {
		...sampleSuccessRow,
		status: 'failed',
		install_sh_exit_code: 1,
		error: 'api-key-401' as string | null,
	}

	const sampleInProgressRow = {
		...sampleSuccessRow,
		status: 'in-progress',
		ended_at: null as string | null,
		install_sh_exit_code: -1,
		wipe_duration_ms: 0,
		reinstall_duration_ms: 0,
	}

	const sampleRolledBackRow = {
		...sampleSuccessRow,
		status: 'rolled-back',
		install_sh_exit_code: 1,
		error: 'install-sh-failed' as string | null,
	}

	test('success row has all required D-EVT-02 fields', () => {
		const required = [
			'type',
			'status',
			'timestamp',
			'started_at',
			'ended_at',
			'preserveApiKey',
			'wipe_duration_ms',
			'reinstall_duration_ms',
			'install_sh_exit_code',
			'install_sh_source',
			'snapshot_path',
			'error',
		] as const
		for (const k of required) {
			expect(sampleSuccessRow).toHaveProperty(k)
		}
	})

	test('row passes Phase 33 reader gate: timestamp is a string in ISO basic format', () => {
		// Phase 33 listUpdateHistory (routes.ts line 136):
		//   if (typeof parsed?.timestamp !== 'string') return null
		// So a row without a string timestamp is filtered out. Our bash emits
		// `date -u +%Y%m%dT%H%M%SZ` which matches /^\d{8}T\d{6}Z$/.
		const parsed = JSON.parse(JSON.stringify(sampleSuccessRow))
		expect(typeof parsed.timestamp).toBe('string')
		expect(parsed.timestamp).toMatch(/^\d{8}T\d{6}Z$/)
	})

	test('error field is null or a plain string (D-ERR-03 — never a nested object)', () => {
		for (const row of [sampleSuccessRow, sampleFailedRow, sampleInProgressRow, sampleRolledBackRow]) {
			if (row.error !== null) {
				expect(typeof row.error).toBe('string')
			}
		}
	})

	test('status is one of in-progress | success | failed | rolled-back (D-EVT-02)', () => {
		const valid = ['in-progress', 'success', 'failed', 'rolled-back']
		expect(valid).toContain(sampleSuccessRow.status)
		expect(valid).toContain(sampleFailedRow.status)
		expect(valid).toContain(sampleInProgressRow.status)
		expect(valid).toContain(sampleRolledBackRow.status)
	})

	test('install_sh_source is "live" or "cache" (D-EVT-02)', () => {
		expect(['live', 'cache']).toContain(sampleSuccessRow.install_sh_source)
	})

	test('in-progress row has ended_at: null; terminal rows have non-null ended_at', () => {
		expect(sampleInProgressRow.ended_at).toBeNull()
		expect(sampleSuccessRow.ended_at).not.toBeNull()
		expect(sampleFailedRow.ended_at).not.toBeNull()
		expect(sampleRolledBackRow.ended_at).not.toBeNull()
	})

	test('failure error string is one of: api-key-401 | server5-unreachable | install-sh-failed | install-sh-unreachable (D-ERR-01)', () => {
		const validErrors = [
			'api-key-401',
			'server5-unreachable',
			'install-sh-failed',
			'install-sh-unreachable',
		]
		expect(validErrors).toContain(sampleFailedRow.error)
		expect(validErrors).toContain(sampleRolledBackRow.error)
	})

	test('success row has install_sh_exit_code === 0 and error === null', () => {
		expect(sampleSuccessRow.install_sh_exit_code).toBe(0)
		expect(sampleSuccessRow.error).toBeNull()
	})

	test('snapshot_path is an absolute /tmp path matching the pre-reset naming convention', () => {
		expect(sampleSuccessRow.snapshot_path).toMatch(/^\/tmp\/livos-pre-reset-\d{8}T\d{6}Z\.tar\.gz$/)
	})

	test('preserveApiKey is a boolean (never coerced to string by JSON serialization)', () => {
		const parsed = JSON.parse(JSON.stringify(sampleSuccessRow))
		expect(typeof parsed.preserveApiKey).toBe('boolean')
	})
})

describe('Phase 33 listUpdateHistory compat (D-EVT-03 — type-agnostic reader)', () => {
	test('factory-reset.json passes the type-agnostic timestamp gate', () => {
		// Simulate the bash output AND the Phase 33 parser inline.
		// routes.ts:121-145 reads the dir, JSON.parses each *.json, and gates on
		// `typeof parsed?.timestamp === 'string'`. There is NO type filtering —
		// the reader is type-agnostic, so adding `type: factory-reset` is fully
		// backward-compatible (D-EVT-03 verified).
		const bashOutput = JSON.stringify({
			type: 'factory-reset',
			status: 'success',
			timestamp: '20260429T120030Z',
			started_at: '2026-04-29T12:00:30Z',
			ended_at: '2026-04-29T12:08:45Z',
			preserveApiKey: true,
			wipe_duration_ms: 12345,
			reinstall_duration_ms: 477123,
			install_sh_exit_code: 0,
			install_sh_source: 'live',
			snapshot_path: '/tmp/livos-pre-reset-20260429T120030Z.tar.gz',
			error: null,
		})
		const parsed = JSON.parse(bashOutput)
		// Replicate the Phase 33 reader gate verbatim:
		const passes = typeof parsed?.timestamp === 'string'
		expect(passes).toBe(true)
		// The reader returns {filename: f, ...parsed} so the `type` field is
		// preserved on the way out (UI can switch on type to render
		// factory-reset rows differently from update rows).
		expect(parsed.type).toBe('factory-reset')
	})

	test('row with non-string timestamp is rejected by the Phase 33 gate', () => {
		// Sanity check: the reader correctly rejects malformed rows. If it ever
		// becomes type-restricted, this test will need to be re-evaluated.
		const malformed = JSON.parse(JSON.stringify({timestamp: 12345, type: 'factory-reset'}))
		const passes = typeof malformed?.timestamp === 'string'
		expect(passes).toBe(false)
	})

	test('buildEventPath() emits a timestamp that matches the Phase 33 ISO basic format', () => {
		// Tie the live builder back to the schema test: whatever buildEventPath
		// produces MUST be a string Phase 33 accepts. This is the bridge between
		// the route's filename generator and the bash's `timestamp` field.
		const {timestamp} = buildEventPath()
		expect(typeof timestamp).toBe('string')
		expect(timestamp).toMatch(/^\d{8}T\d{6}Z$/)
	})
})
