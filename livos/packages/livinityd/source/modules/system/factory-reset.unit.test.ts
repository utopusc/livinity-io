// Phase 37-02 unit tests for the v29.2 factory-reset module.
// Mirrors update.unit.test.ts patterns: vi.mock('node:fs/promises'),
// Livinityd({dataDirectory:'/tmp'}) for the unused _livinityd argument,
// vitest singleThread (configured in package.json line 16).
//
// Coverage:
//   - factoryResetInputSchema: 4 cases (true / false / non-boolean / missing)
//   - preflightCheck (D-RT-05): 5 cases (update-in-progress / missing .env /
//       missing key / no-preserve happy / preserve happy)
//   - stashApiKey (D-KEY-01): 2 cases (happy / missing key)
//   - buildEventPath: 1 case (ISO basic format + path shape)
//   - performFactoryReset (Plan 02 stub): 2 cases (happy / preserve triggers stash)
//
// Tests MUST NOT spawn subprocesses, hit network, or touch the real filesystem.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, beforeEach, afterEach, expect, test, vi} from 'vitest'
import fs from 'node:fs/promises'
import {TRPCError} from '@trpc/server'

import {
	factoryResetInputSchema,
	preflightCheck,
	stashApiKey,
	performFactoryReset,
	buildEventPath,
	APIKEY_TMP_PATH,
	SNAPSHOT_SIDECAR_PATH,
} from './factory-reset.js'
import Livinityd from '../../index.js'

vi.mock('node:fs/promises')

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

describe('performFactoryReset (Plan 02 stub — no spawn yet)', () => {
	let livinityd: any

	beforeEach(() => {
		livinityd = new Livinityd({dataDirectory: '/tmp'})
		// Default: empty update-history (so preflight passes)
		vi.mocked(fs.readdir).mockResolvedValue([] as any)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('happy path returns {accepted:true, eventPath, snapshotPath}', async () => {
		const result = await performFactoryReset(livinityd, {preserveApiKey: false})

		expect(result.accepted).toBe(true)
		expect(result.eventPath).toMatch(/update-history\/\d{8}T\d{6}Z-factory-reset\.json$/)
		expect(result.snapshotPath).toBe(SNAPSHOT_SIDECAR_PATH)
	})

	test('preserveApiKey=true triggers stashApiKey + returns metadata', async () => {
		vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY=k1\n' as any)
		vi.mocked(fs.writeFile).mockResolvedValue()
		vi.mocked(fs.chmod).mockResolvedValue()

		const result = await performFactoryReset(livinityd, {preserveApiKey: true})

		expect(result.accepted).toBe(true)
		expect(fs.writeFile).toHaveBeenCalledWith(
			APIKEY_TMP_PATH,
			'k1',
			expect.objectContaining({mode: 0o600}),
		)
	})

	test('propagates preflightCheck CONFLICT when an update is in progress', async () => {
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
	})
})
