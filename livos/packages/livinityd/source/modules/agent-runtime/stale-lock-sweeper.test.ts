/**
 * Phase 208-04 — stale-lock-sweeper tests.
 *
 * R5 acceptance: boot-time sweep of `/opt/livos/data/openclaw/agents/` removes
 * `.lock` and `.trajectory-path.json.lock` files older than 24h. Each removal
 * logged at INFO with file path + age.
 *
 * Coverage (9 cases per PLAN):
 *   1. Empty dir → {scanned:0, removed:[]}
 *   2. Fresh .lock NOT removed → {scanned:1, removed:[]}
 *   3. 25h-old .lock removed → {scanned:1, removed:[path]}
 *   4. Mixed (fresh + 25h + 23h + 25h trajectory) → 2 removed
 *   5. Subdirectory traversal works
 *   6. Logger called with file path + age for each removal
 *   7. fs.unlink EBUSY → WARN logged, sweep continues
 *   8. Default maxAgeMs = 24h
 *   9. Non-lock files (agent.log, state.json) NEVER deleted regardless of age
 */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {STALE_LOCK_MAX_AGE_MS, sweepStaleLocks} from './stale-lock-sweeper.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

async function makeFile(full: string, ageHours: number): Promise<void> {
	await fsp.mkdir(path.dirname(full), {recursive: true})
	await fsp.writeFile(full, '')
	const mtime = new Date(Date.now() - ageHours * HOUR_MS)
	await fsp.utimes(full, mtime, mtime)
}

let tmpRoot: string

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-test-'))
})

afterEach(() => {
	try {
		fs.rmSync(tmpRoot, {recursive: true, force: true})
	} catch {
		/* best-effort */
	}
})

describe('sweepStaleLocks', () => {
	test('Test 1: empty dir returns {scanned:0, removed:[]}', async () => {
		const result = await sweepStaleLocks({rootDir: tmpRoot})
		expect(result).toEqual({scanned: 0, removed: []})
	})

	test('Test 2: fresh .lock (mtime=now) NOT removed', async () => {
		const lockPath = path.join(tmpRoot, 'fresh.lock')
		await makeFile(lockPath, 0)
		const result = await sweepStaleLocks({rootDir: tmpRoot})
		expect(result.scanned).toBe(1)
		expect(result.removed).toEqual([])
		expect(fs.existsSync(lockPath)).toBe(true)
	})

	test('Test 3: 25h-old .lock IS removed', async () => {
		const lockPath = path.join(tmpRoot, 'stale.lock')
		await makeFile(lockPath, 25)
		const result = await sweepStaleLocks({rootDir: tmpRoot})
		expect(result.scanned).toBe(1)
		expect(result.removed).toEqual([lockPath])
		expect(fs.existsSync(lockPath)).toBe(false)
	})

	test('Test 4: mixed ages — only 25h-old ones removed (2 of 4)', async () => {
		const fresh = path.join(tmpRoot, 'fresh.lock')
		const old25 = path.join(tmpRoot, 'old25.lock')
		const old23 = path.join(tmpRoot, 'old23.lock')
		const trajOld = path.join(tmpRoot, 'foo.trajectory-path.json.lock')
		await makeFile(fresh, 0)
		await makeFile(old25, 25)
		await makeFile(old23, 23)
		await makeFile(trajOld, 25)
		const result = await sweepStaleLocks({rootDir: tmpRoot})
		expect(result.scanned).toBe(4)
		expect(result.removed.sort()).toEqual([old25, trajOld].sort())
		expect(fs.existsSync(fresh)).toBe(true)
		expect(fs.existsSync(old23)).toBe(true)
		expect(fs.existsSync(old25)).toBe(false)
		expect(fs.existsSync(trajOld)).toBe(false)
	})

	test('Test 5: subdirectory traversal reaches nested locks', async () => {
		const nested = path.join(tmpRoot, 'agents', 'abc', 'locks', 'x.lock')
		await makeFile(nested, 30)
		const result = await sweepStaleLocks({rootDir: tmpRoot})
		expect(result.scanned).toBe(1)
		expect(result.removed).toEqual([nested])
		expect(fs.existsSync(nested)).toBe(false)
	})

	test('Test 6: logger called with file path + age for each removal', async () => {
		const a = path.join(tmpRoot, 'a.lock')
		const b = path.join(tmpRoot, 'b.lock')
		await makeFile(a, 26)
		await makeFile(b, 48)
		const logCalls: Array<[string, string]> = []
		await sweepStaleLocks({
			rootDir: tmpRoot,
			logger: (lvl, msg) => logCalls.push([lvl, msg]),
		})
		const removedLines = logCalls.filter(
			([lvl, msg]) => lvl === 'info' && msg.includes('removed'),
		)
		expect(removedLines.length).toBe(2)
		const joined = removedLines.map((l) => l[1]).join('\n')
		expect(joined).toContain(a)
		expect(joined).toContain(b)
		// Age annotation present (e.g. "age=26h" / "age=48h")
		expect(joined).toMatch(/age=\d+h/)
	})

	test('Test 7: unlink EBUSY caught, logged as WARN, sweep continues', async () => {
		const a = path.join(tmpRoot, 'a.lock')
		const b = path.join(tmpRoot, 'b.lock')
		await makeFile(a, 30)
		await makeFile(b, 30)

		// Inject an unlink impl that throws EBUSY for one file but lets the
		// other through (delegating to the real fs.promises.unlink).
		let failed = false
		const unlinkImpl = async (full: string): Promise<void> => {
			if (!failed) {
				failed = true
				const err: NodeJS.ErrnoException = new Error(
					'EBUSY: resource busy or locked',
				)
				err.code = 'EBUSY'
				throw err
			}
			await fsp.unlink(full)
		}

		const logCalls: Array<[string, string]> = []
		const result = await sweepStaleLocks({
			rootDir: tmpRoot,
			logger: (lvl, msg) => logCalls.push([lvl, msg]),
			unlinkImpl,
		})
		expect(result.scanned).toBe(2)
		expect(result.removed.length).toBe(1)
		const warnLines = logCalls.filter(([lvl]) => lvl === 'warn')
		expect(warnLines.length).toBeGreaterThanOrEqual(1)
		expect(warnLines.some(([, msg]) => msg.includes('EBUSY'))).toBe(true)
	})

	test('Test 8: default maxAgeMs is 24h', async () => {
		expect(STALE_LOCK_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000)
		expect(STALE_LOCK_MAX_AGE_MS).toBe(DAY_MS)
	})

	test('Test 9: non-lock files NEVER deleted regardless of age', async () => {
		const log = path.join(tmpRoot, 'agent.log')
		const state = path.join(tmpRoot, 'state.json')
		const lockOld = path.join(tmpRoot, 'real.lock')
		await makeFile(log, 9999)
		await makeFile(state, 9999)
		await makeFile(lockOld, 30)
		const result = await sweepStaleLocks({rootDir: tmpRoot})
		// scanned count covers ONLY .lock files, not arbitrary files
		expect(result.scanned).toBe(1)
		expect(result.removed).toEqual([lockOld])
		expect(fs.existsSync(log)).toBe(true)
		expect(fs.existsSync(state)).toBe(true)
		expect(fs.existsSync(lockOld)).toBe(false)
	})
})
