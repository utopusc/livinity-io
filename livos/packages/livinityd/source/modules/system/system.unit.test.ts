// TODO: Re-enable this, we temporarily disable TS here since we broke tests
// and have since changed the API. We'll refactor these later.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, afterEach, expect, test, vi} from 'vitest'

// Mocks
import systemInformation from 'systeminformation'
import * as execa from 'execa'

// Phase 33 OBS-02/03 — fs mock infrastructure
import * as fsPromises from 'node:fs/promises'

import Livinityd from '../../index.js'
import {getCpuTemperature, getMemoryUsage, getDiskUsageByPath, shutdown, reboot} from './system.js'

// Phase 33 OBS-02/03 — system router under test + httpOnlyPaths registration
import system from './routes.js'
import {httpOnlyPaths} from '../server/trpc/common.js'

vi.mock('systeminformation')
vi.mock('execa')
vi.mock('node:fs/promises')

afterEach(() => {
	vi.restoreAllMocks()
})

describe('getCpuTemperature', () => {
	test('should return main cpu temperature when system supports it', async () => {
		vi.mocked(systemInformation.cpuTemperature).mockResolvedValue({main: 69} as any)
		vi.mocked(systemInformation.system).mockResolvedValue({
			manufacturer: '',
			model: '',
			serial: '',
			uuid: '',
			sku: '',
			version: '',
		} as any)
		expect(await getCpuTemperature()).toMatchObject({warning: 'normal', temperature: 69})
	})

	test('should throw error when system does not support cpu temperature', async () => {
		vi.mocked(systemInformation.cpuTemperature).mockResolvedValue({main: null} as any)
		expect(getCpuTemperature()).rejects.toThrow('Could not get CPU temperature')
	})
})

describe('getDiskUsageByPath', () => {
	test('should return disk usage for specified path', async () => {
		vi.mocked(execa.$).mockResolvedValue({
			stdout: `   1B-blocks         Used        Avail
290821033984 126167117824 164653916160`,
		})
		expect(await getDiskUsageByPath('/tmp')).toMatchObject({
			size: 290821033984,
			totalUsed: 126167117824,
			available: 164653916160,
		})
	})
})

describe('getMemoryUsage', () => {
	test('should return memory usage', async () => {
		const livinityd = new Livinityd({dataDirectory: '/tmp'})
		vi.mocked(systemInformation.mem).mockResolvedValue({
			total: 69_420,
			active: 420,
		} as any)
		vi.mocked(execa.$).mockResolvedValue({
			stdout: '1 0.420',
		})
		expect(await getMemoryUsage(livinityd)).toMatchObject({
			size: 69_420,
			totalUsed: 420,
		})
	})
})

describe('shutdown', () => {
	test('should call execa.$ with "poweroff"', async () => {
		expect(await shutdown()).toBe(true)
		expect(execa.$).toHaveBeenCalledWith(['poweroff'])
	})

	test('should throw error when "poweroff" command fails', async () => {
		vi.mocked(execa.$).mockRejectedValue(new Error('Failed'))
		await expect(shutdown()).rejects.toThrow()
	})
})

describe('reboot', () => {
	test('should call execa.$ with "reboot"', async () => {
		expect(await reboot()).toBe(true)
		expect(execa.$).toHaveBeenCalledWith(['reboot'])
	})

	test('should throw error when "shutdown" command fails', async () => {
		vi.mocked(execa.$).mockRejectedValue(new Error('Failed'))
		await expect(reboot()).rejects.toThrow()
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 33 OBS-02 / OBS-03 — system.listUpdateHistory + system.readUpdateLog
// ─────────────────────────────────────────────────────────────────────────────

function makeCaller() {
	const livinityd = new Livinityd({dataDirectory: '/tmp'})
	return system.createCaller({
		livinityd,
		logger: {error() {}},
		dangerouslyBypassAuthentication: true,
	} as any)
}

describe('system.listUpdateHistory (Phase 33 OBS-02)', () => {
	test('L1: returns array sorted newest-first by timestamp', async () => {
		vi.mocked(fsPromises.readdir).mockResolvedValue([
			'2026-04-25T10-00-00Z-success.json',
			'2026-04-26T10-00-00Z-success.json',
			'2026-04-24T10-00-00Z-failed.json',
		] as any)
		vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
			const name = String(p).split(/[\\/]/).pop()!
			if (name === '2026-04-26T10-00-00Z-success.json')
				return JSON.stringify({timestamp: '2026-04-26T10:00:00Z', status: 'success', from_sha: 'a', to_sha: 'b', duration_ms: 1000})
			if (name === '2026-04-25T10-00-00Z-success.json')
				return JSON.stringify({timestamp: '2026-04-25T10:00:00Z', status: 'success', from_sha: 'c', to_sha: 'd', duration_ms: 2000})
			if (name === '2026-04-24T10-00-00Z-failed.json')
				return JSON.stringify({timestamp: '2026-04-24T10:00:00Z', status: 'failed', reason: 'boom', duration_ms: 500})
			return '{}'
		})
		const caller = makeCaller()
		const result = await caller.listUpdateHistory({limit: 50})
		expect(result).toHaveLength(3)
		expect(result[0].timestamp).toBe('2026-04-26T10:00:00Z')
		expect(result[1].timestamp).toBe('2026-04-25T10:00:00Z')
		expect(result[2].timestamp).toBe('2026-04-24T10:00:00Z')
	})

	test('L2: returns [] when /opt/livos/data/update-history/ does not exist (ENOENT)', async () => {
		const enoent: any = new Error('ENOENT')
		enoent.code = 'ENOENT'
		vi.mocked(fsPromises.readdir).mockRejectedValue(enoent)
		const caller = makeCaller()
		expect(await caller.listUpdateHistory({limit: 50})).toEqual([])
	})

	test('L3: skips corrupt JSON entries instead of crashing the whole list', async () => {
		vi.mocked(fsPromises.readdir).mockResolvedValue(['good.json', 'corrupt.json'] as any)
		vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
			const name = String(p).split(/[\\/]/).pop()!
			if (name === 'good.json')
				return JSON.stringify({timestamp: '2026-04-26T10:00:00Z', status: 'success', duration_ms: 1})
			if (name === 'corrupt.json') return 'invalid json{'
			return '{}'
		})
		const caller = makeCaller()
		const result = await caller.listUpdateHistory({limit: 50})
		expect(result).toHaveLength(1)
		expect(result[0].timestamp).toBe('2026-04-26T10:00:00Z')
	})

	test('L4: respects limit param', async () => {
		const files = Array.from(
			{length: 100},
			(_, i) => `2026-04-${String((i % 28) + 1).padStart(2, '0')}T10-00-${String(i).padStart(2, '0')}Z-success.json`,
		)
		vi.mocked(fsPromises.readdir).mockResolvedValue(files as any)
		vi.mocked(fsPromises.readFile).mockImplementation(async (p: any) => {
			const name = String(p).split(/[\\/]/).pop()!
			// Derive a unique timestamp per filename so sort is stable
			const ts = name.replace(/-success\.json$/, '').replace(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')
			return JSON.stringify({timestamp: ts, status: 'success', duration_ms: 0})
		})
		const caller = makeCaller()
		const result = await caller.listUpdateHistory({limit: 10})
		expect(result).toHaveLength(10)
	})

	test('L5: Zod rejects limit > 200', async () => {
		const caller = makeCaller()
		await expect(caller.listUpdateHistory({limit: 999} as any)).rejects.toMatchObject({code: 'BAD_REQUEST'})
	})
})

describe('system.readUpdateLog filename validation (Phase 33 OBS-03 security)', () => {
	const TRAVERSAL_VECTORS = [
		'../etc/passwd',
		'/etc/passwd',
		'evil/path.log',
		'..hidden.log',
		'log\\with\\backslash',
		'.bash_history',
	]

	test.each(TRAVERSAL_VECTORS)('rejects %s with BAD_REQUEST', async (filename) => {
		vi.mocked(fsPromises.readFile).mockClear()
		const caller = makeCaller()
		await expect(caller.readUpdateLog({filename, full: false})).rejects.toMatchObject({code: 'BAD_REQUEST'})
	})

	test('R7: fs.readFile is NEVER invoked for any traversal vector (defense-in-depth)', async () => {
		const spy = vi.spyOn(fsPromises, 'readFile')
		spy.mockClear()
		const caller = makeCaller()
		for (const filename of TRAVERSAL_VECTORS) {
			await expect(caller.readUpdateLog({filename, full: false})).rejects.toMatchObject({code: 'BAD_REQUEST'})
		}
		expect(spy).not.toHaveBeenCalled()
	})
})

describe('system.readUpdateLog happy path (Phase 33 OBS-03)', () => {
	test('H1: valid filename, < 500 lines, returns full content with truncated:false', async () => {
		const body = Array.from({length: 100}, (_, i) => `line${i}`).join('\n')
		vi.mocked(fsPromises.readFile).mockResolvedValue(body)
		const caller = makeCaller()
		const result = await caller.readUpdateLog({filename: 'update-2026-04-26T18-24-30Z-abc1234.log', full: false})
		expect(result.truncated).toBe(false)
		expect(result.content).toBe(body)
	})

	test('H2: > 500 lines, returns last 500 + truncated:true + totalLines', async () => {
		const body = Array.from({length: 1000}, (_, i) => `line${i}`).join('\n')
		vi.mocked(fsPromises.readFile).mockResolvedValue(body)
		const caller = makeCaller()
		const result = await caller.readUpdateLog({filename: 'update-2026-04-26T18-24-30Z-abc1234.log', full: false})
		expect(result.truncated).toBe(true)
		expect(result.totalLines).toBe(1000)
		expect(result.content.split('\n')).toHaveLength(500)
		expect(result.content.split('\n')[0]).toBe('line500')
		expect(result.content.split('\n')[499]).toBe('line999')
	})

	test('H3: full:true returns entire content even if > 500 lines', async () => {
		const body = Array.from({length: 1000}, (_, i) => `line${i}`).join('\n')
		vi.mocked(fsPromises.readFile).mockResolvedValue(body)
		const caller = makeCaller()
		const result = await caller.readUpdateLog({filename: 'update-2026-04-26T18-24-30Z-abc1234.log', full: true})
		expect(result.truncated).toBe(false)
		expect(result.content.split('\n')).toHaveLength(1000)
	})

	test('H4: ENOENT becomes TRPCError NOT_FOUND', async () => {
		const enoent: any = new Error('ENOENT')
		enoent.code = 'ENOENT'
		vi.mocked(fsPromises.readFile).mockRejectedValue(enoent)
		const caller = makeCaller()
		await expect(
			caller.readUpdateLog({filename: 'update-2026-04-26T18-24-30Z-abc1234.log', full: false}),
		).rejects.toMatchObject({code: 'NOT_FOUND'})
	})
})

describe('Phase 33 OBS-02/03 — httpOnlyPaths registration', () => {
	test('HOP1: both new routes appear in httpOnlyPaths', () => {
		expect(httpOnlyPaths).toContain('system.listUpdateHistory')
		expect(httpOnlyPaths).toContain('system.readUpdateLog')
	})
})
