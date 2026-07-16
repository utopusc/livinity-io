// Phase 318 (POOL-03, 318-04) — snapraid-cli.ts thin execa-wrapper tests.
//
// These tests FULLY mock execa: no real subprocess, no live snapraid, no sudo.
// They assert the security-critical invocation contract (T-318-06):
//   • the wrapper is invoked via an execa argv ARRAY, never a shell string
//     (shell:false — no string interpolation reaches a shell, D-03/D-17),
//   • `{reject:false}` so a non-zero snapraid exit is PARSED, never thrown,
//   • `fix`/`check` are disk-SCOPED via `-d <label>` (never whole-pool, Pattern 4),
//   • a missing / malformed / kernel-device-shaped disk label is rejected
//     BEFORE any wrapper call (DEVICE_ID_RE + disk-label guard),
//   • stdout is handed to the 318-02 `--log` parser exports (no duplicate parsing).
//
// NOTE (318-01 contract): the `livos-pool.sh` `snapraid` action injects
// `--conf /etc/snapraid.conf --log ">&1"` ROOT-SIDE and charset-validates every
// forwarded token (rejecting the `>&1` target). The caller therefore forwards
// ONLY the verb + verb-flags — these tests assert `>&1` is NEVER forwarded.

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {execa} from 'execa'

import {check, diff, fix, POOL_WRAPPER, scrub, status, sync} from './snapraid-cli.js'

// Fully isolate the pipeline: no real subprocess, no real sudo/snapraid.
vi.mock('execa', () => ({execa: vi.fn()}))

beforeEach(() => {
	vi.mocked(execa).mockReset()
})

// Minimal execa-result shim (mirrors monitoring/smart.test.ts asExeca).
const asExeca = (result: {stdout?: string; exitCode?: number}): any => ({
	stdout: result.stdout ?? '',
	stderr: '',
	exitCode: result.exitCode ?? 0,
	failed: (result.exitCode ?? 0) !== 0,
})

// --- Real-shape `--log` fixtures (summary:* tags, as the wrapper emits) ------

const DIFF_DIFF = ['summary:added:1', 'summary:removed:2', 'summary:updated:0', 'summary:moved:0', 'summary:exit:diff'].join('\n')
const SYNC_OK = ['summary:error_io:0', 'summary:error_data:0', 'summary:error_soft:0', 'summary:exit:ok'].join('\n')
const SCRUB_OK = SYNC_OK
const STATUS_OK = ['summary:scrub_oldest_days:14', 'summary:disk_use_percent:d1:60', 'summary:exit:ok'].join('\n')
const FIX_CLEAN = ['summary:error_unrecoverable:0', 'summary:exit:ok'].join('\n')
const CHECK_UNRECOVERABLE = ['summary:error_unrecoverable:7', 'summary:exit:unrecoverable'].join('\n')

// Grab the single execa call: [command, argv, options].
function lastCall(): [string, string[], {reject?: boolean}] {
	const calls = vi.mocked(execa).mock.calls
	expect(calls.length).toBe(1)
	return calls[0] as unknown as [string, string[], {reject?: boolean}]
}

// --- argv-shape + reject:false invariants (shared across every verb) ---------

describe('invocation contract', () => {
	test('diff → sudo -n <wrapper> snapraid diff, argv ARRAY (not a shell string), reject:false', async () => {
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: DIFF_DIFF, exitCode: 2}))
		const result = await diff()

		const [command, argv, options] = lastCall()
		expect(command).toBe('sudo')
		// argv is an ARRAY — the whole point of shell:false (no shell string ever built).
		expect(Array.isArray(argv)).toBe(true)
		expect(argv).toEqual(['-n', POOL_WRAPPER, 'snapraid', 'diff'])
		// The wrapper injects `--conf`/`--log ">&1"` root-side; the caller must NEVER
		// forward the `>&1` target (the wrapper would reject it).
		expect(argv).not.toContain('>&1')
		expect(options.reject).toBe(false)
		// stdout handed straight to the 318-02 parseDiff (no duplicate parsing here).
		expect(result).toEqual({counts: {added: 1, removed: 2, updated: 0, moved: 0}, exit: 'diff'})
	})

	test('a non-zero exitCode is PARSED, never thrown (reject:false)', async () => {
		// exitCode 2 = "differences present" — a normal parsed result, not a crash.
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: DIFF_DIFF, exitCode: 2}))
		await expect(diff()).resolves.toMatchObject({exit: 'diff'})
	})

	test('sync → snapraid sync → parseSyncScrub', async () => {
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: SYNC_OK}))
		const result = await sync()
		expect(lastCall()[1]).toEqual(['-n', POOL_WRAPPER, 'snapraid', 'sync'])
		expect(result).toEqual({errorIo: 0, errorData: 0, errorSoft: 0, exit: 'ok'})
	})

	test('scrub (no percent) → snapraid scrub', async () => {
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: SCRUB_OK}))
		await scrub()
		expect(lastCall()[1]).toEqual(['-n', POOL_WRAPPER, 'snapraid', 'scrub'])
	})

	test('scrub with a percent → snapraid scrub -p <n>', async () => {
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: SCRUB_OK}))
		await scrub({percent: 12})
		expect(lastCall()[1]).toEqual(['-n', POOL_WRAPPER, 'snapraid', 'scrub', '-p', '12'])
	})

	test('scrub rejects an out-of-range percent BEFORE any wrapper call', async () => {
		await expect(scrub({percent: 101})).rejects.toThrow()
		await expect(scrub({percent: -1})).rejects.toThrow()
		await expect(scrub({percent: 12.5})).rejects.toThrow()
		expect(execa).not.toHaveBeenCalled()
	})

	test('status → snapraid status → parseStatus', async () => {
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: STATUS_OK}))
		const result = await status()
		expect(lastCall()[1]).toEqual(['-n', POOL_WRAPPER, 'snapraid', 'status'])
		expect(result).toEqual({scrubOldestDays: 14, diskUsePercent: {d1: 60}, exit: 'ok'})
	})
})

// --- disk-scoping (fix/check) + DEVICE_ID_RE / disk-label rejection ----------

describe('fix / check disk-scoping', () => {
	test('fix → snapraid fix -d <label> (disk-scoped, never whole-pool) → parseCheckFix', async () => {
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: FIX_CLEAN}))
		const result = await fix({disk: 'd2'})
		const argv = lastCall()[1]
		expect(argv).toEqual(['-n', POOL_WRAPPER, 'snapraid', 'fix', '-d', 'd2'])
		// disk-scope flag MUST be present.
		expect(argv).toContain('-d')
		expect(result).toEqual({errorUnrecoverable: 0, exit: 'ok'})
	})

	test('check → snapraid check -d <label>; unrecoverable exit is parsed (D-11 HARD-STOP signal)', async () => {
		vi.mocked(execa).mockResolvedValue(asExeca({stdout: CHECK_UNRECOVERABLE, exitCode: 3}))
		const result = await check({disk: 'disk1'})
		expect(lastCall()[1]).toEqual(['-n', POOL_WRAPPER, 'snapraid', 'check', '-d', 'disk1'])
		expect(result).toEqual({errorUnrecoverable: 7, exit: 'unrecoverable'})
	})

	test('a missing disk label throws BEFORE any wrapper call', async () => {
		await expect(fix({disk: undefined as unknown as string})).rejects.toThrow()
		await expect(fix({disk: ''})).rejects.toThrow()
		expect(execa).not.toHaveBeenCalled()
	})

	test('a malformed disk label (shell metachar) is rejected BEFORE any wrapper call', async () => {
		await expect(fix({disk: 'd2; rm -rf /'})).rejects.toThrow()
		await expect(check({disk: '../../etc'})).rejects.toThrow()
		expect(execa).not.toHaveBeenCalled()
	})

	test('a kernel-device-shaped token (DEVICE_ID_RE) is refused as a disk label', async () => {
		// `-d` scopes by snapraid.conf slot LABEL (d1/d2), never a raw block device.
		// A `sdb`/`nvme0n1` token is a wiring bug → rejected via the shared DEVICE_ID_RE guard.
		await expect(fix({disk: 'sdb'})).rejects.toThrow()
		await expect(check({disk: 'nvme0n1'})).rejects.toThrow()
		expect(execa).not.toHaveBeenCalled()
	})
})
