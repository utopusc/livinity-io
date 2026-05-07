/**
 * Phase 93-02 — vaapi-probe unit tests.
 *
 * Mocks `node:child_process.execFile` to feed canned vainfo stdouts /
 * errors. No real vainfo binary required.
 *
 * Test cases:
 *   1. vainfo success with H264 High encode → vaapi:true, profiles list
 *   2. vainfo success without any H264 EncSlice → vaapi:false
 *   3. vainfo binary missing (ENOENT) → error:'vainfo-not-found'
 *   4. vainfo timeout → error:'timeout'
 *   5. persistVaapiCaps round-trips through a FakeRedis
 *   6. parseVainfoOutput handles whitespace + Order
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach} from 'vitest'

// Mock execFile BEFORE module import so the promisify(execFile) inside
// vaapi-probe.ts picks up our stub.
vi.mock('node:child_process', () => {
	return {
		execFile: vi.fn(),
	}
})

import {execFile} from 'node:child_process'
import {
	probeVaapi,
	parseVainfoOutput,
	persistVaapiCaps,
	STREAMING_CAPS_KEY,
} from './vaapi-probe.js'

const mockedExecFile = execFile as unknown as ReturnType<typeof vi.fn>

// Helper: handle both promisify(execFile) calling shapes — Node's util.promisify
// returns a function that calls execFile with the *last* argument as the callback,
// so the signature is variadic. We sniff for the function-typed argument.
function findCallback(args: any[]): ((err: any, stdout?: string, stderr?: string) => void) | null {
	for (let i = args.length - 1; i >= 0; i--) {
		if (typeof args[i] === 'function') return args[i]
	}
	return null
}

function setExecFileResult(stdout: string, stderr = '') {
	mockedExecFile.mockImplementation((...callArgs: any[]) => {
		const cb = findCallback(callArgs)
		// promisify wraps so the resolved value is {stdout, stderr}; that means the
		// callback is invoked with (err, stdout, stderr).
		if (cb) cb(null, stdout, stderr)
	})
}

function setExecFileError(err: NodeJS.ErrnoException) {
	mockedExecFile.mockImplementation((...callArgs: any[]) => {
		const cb = findCallback(callArgs)
		if (cb) cb(err, '', '')
	})
}

const VAINFO_OK = `Trying display: drm
libva info: VA-API version 1.20.0
vainfo: Driver version: Intel iHD driver for Intel(R) Gen Graphics
vainfo: Supported profile and entrypoints
      VAProfileH264Main               : VAEntrypointVLD
      VAProfileH264Main               : VAEntrypointEncSlice
      VAProfileH264High               : VAEntrypointVLD
      VAProfileH264High               : VAEntrypointEncSlice
      VAProfileH264ConstrainedBaseline: VAEntrypointVLD
      VAProfileH264ConstrainedBaseline: VAEntrypointEncSlice
`

const VAINFO_DECODE_ONLY = `vainfo: Driver version: i965
      VAProfileH264Main               : VAEntrypointVLD
      VAProfileH264High               : VAEntrypointVLD
      VAProfileMPEG2Main              : VAEntrypointVLD
`

class FakeRedis {
	store: Record<string, Record<string, string>> = {}
	async hset(key: string, fields: Record<string, string>): Promise<number> {
		this.store[key] = {...(this.store[key] ?? {}), ...fields}
		return Object.keys(fields).length
	}
	async hgetall(key: string): Promise<Record<string, string>> {
		return {...(this.store[key] ?? {})}
	}
}

describe('vaapi-probe', () => {
	beforeEach(() => {
		mockedExecFile.mockReset()
	})

	it('parses VAEntrypointEncSlice for H264 profiles → vaapi:true', async () => {
		setExecFileResult(VAINFO_OK)
		const result = await probeVaapi()
		expect(result.vaapi).toBe(true)
		expect(result.profiles).toContain('VAProfileH264High')
		expect(result.profiles).toContain('VAProfileH264Main')
		expect(result.profiles).toContain('VAProfileH264ConstrainedBaseline')
		expect(result.error).toBeUndefined()
	})

	it('returns vaapi:false when only decode entrypoints are present', async () => {
		setExecFileResult(VAINFO_DECODE_ONLY)
		const result = await probeVaapi()
		expect(result.vaapi).toBe(false)
		expect(result.profiles).toEqual([])
		expect(result.error).toBeUndefined()
	})

	it('returns error:vainfo-not-found when binary is missing (ENOENT)', async () => {
		const err = Object.assign(new Error('spawn vainfo ENOENT'), {
			code: 'ENOENT',
		}) as NodeJS.ErrnoException
		setExecFileError(err)
		const result = await probeVaapi()
		expect(result.vaapi).toBe(false)
		expect(result.error).toBe('vainfo-not-found')
	})

	it('returns error:timeout when vainfo is killed by the timeout', async () => {
		const err: any = Object.assign(new Error('timeout'), {
			killed: true,
			signal: 'SIGTERM',
		})
		setExecFileError(err)
		const result = await probeVaapi()
		expect(result.vaapi).toBe(false)
		expect(result.error).toBe('timeout')
	})

	it('returns error:vainfo-failed for non-zero exit / generic spawn errors', async () => {
		const err: any = Object.assign(new Error('exit 1'), {code: 1})
		setExecFileError(err)
		const result = await probeVaapi()
		expect(result.vaapi).toBe(false)
		expect(result.error).toBe('vainfo-failed')
	})

	it('parseVainfoOutput handles empty input', () => {
		const result = parseVainfoOutput('')
		expect(result.vaapi).toBe(false)
		expect(result.error).toBe('parse-error')
	})

	it('persistVaapiCaps round-trips through a Redis HASH', async () => {
		const redis = new FakeRedis()
		const fixedNow = new Date('2026-05-07T12:00:00Z')
		await persistVaapiCaps(
			redis,
			{vaapi: true, profiles: ['VAProfileH264High']},
			() => fixedNow,
		)
		const stored = await redis.hgetall(STREAMING_CAPS_KEY)
		expect(stored.vaapi).toBe('true')
		expect(stored.profiles).toBe('VAProfileH264High')
		expect(stored.probedAt).toBe('2026-05-07T12:00:00.000Z')
		expect(stored.error).toBeUndefined()
	})

	it('persistVaapiCaps records the error code when probing failed', async () => {
		const redis = new FakeRedis()
		await persistVaapiCaps(redis, {
			vaapi: false,
			profiles: [],
			error: 'vainfo-not-found',
		})
		const stored = await redis.hgetall(STREAMING_CAPS_KEY)
		expect(stored.vaapi).toBe('false')
		expect(stored.profiles).toBe('')
		expect(stored.error).toBe('vainfo-not-found')
	})
})
