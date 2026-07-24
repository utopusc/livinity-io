import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {afterEach, expect, test} from 'vitest'

import {
	cleanStaleStaging,
	recoverInterruptedRun,
	runBackupPreflight,
	unpauseStrandedContainers,
	type LastRunStatus,
	type PreflightDeps,
} from './backup-preflight.js'

const logger = {log: () => {}, error: () => {}}

// Temp dirs created by cleanStaleStaging tests; swept after each test.
const tempDirs: string[] = []
afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await fs.rm(dir, {recursive: true, force: true}).catch(() => {})
	}
})

async function makeStagingDir() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'preflight-'))
	tempDirs.push(dir)
	return dir
}

// ── unpauseStrandedContainers ────────────────────────────────────────────

test('unpauseStrandedContainers unpauses exactly the paused containers', async () => {
	const unpaused: string[] = []
	const count = await unpauseStrandedContainers({
		listContainers: async () => [
			{name: 'a', state: 'paused'},
			{name: 'b', state: 'running'},
			{name: 'c', state: 'paused'},
		],
		unpause: async (name) => {
			unpaused.push(name)
		},
		logger,
	})
	expect(unpaused).toEqual(['a', 'c'])
	expect(count).toBe(2)
})

test('unpauseStrandedContainers: one unpause failing does not stop the rest', async () => {
	const unpaused: string[] = []
	const errors: string[] = []
	const count = await unpauseStrandedContainers({
		listContainers: async () => [
			{name: 'a', state: 'paused'},
			{name: 'c', state: 'paused'},
		],
		unpause: async (name) => {
			if (name === 'a') throw new Error('docker exploded')
			unpaused.push(name)
		},
		logger: {log: () => {}, error: (message) => errors.push(message)},
	})
	expect(unpaused).toEqual(['c'])
	expect(count).toBe(1)
	expect(errors.some((message) => message.includes('a'))).toBe(true)
})

test('unpauseStrandedContainers: listContainers throwing → 0, logged, no throw', async () => {
	const errors: string[] = []
	const count = await unpauseStrandedContainers({
		listContainers: async () => {
			throw new Error('no docker socket')
		},
		unpause: async () => {
			throw new Error('must never be called')
		},
		logger: {log: () => {}, error: (message) => errors.push(message)},
	})
	expect(count).toBe(0)
	expect(errors.length).toBeGreaterThan(0)
})

// ── cleanStaleStaging ────────────────────────────────────────────────────

test('cleanStaleStaging: missing staging dir is a guarded no-op', async () => {
	const missing = path.join(os.tmpdir(), `preflight-does-not-exist-${process.pid}-${Date.now()}`)
	const count = await cleanStaleStaging(missing, logger)
	expect(count).toBe(0)
	// The dir must not have been created as a side effect.
	await expect(fs.stat(missing)).rejects.toThrow()
})

test('cleanStaleStaging removes exactly the .tmp entries (files AND dirs)', async () => {
	const dir = await makeStagingDir()
	await fs.mkdir(path.join(dir, 'vol1.tmp'))
	await fs.writeFile(path.join(dir, 'vol1.tmp', 'inner.bin'), 'partial copy')
	await fs.writeFile(path.join(dir, 'keep.txt'), 'not staging debris')
	await fs.writeFile(path.join(dir, 'part.tmp'), 'partial file')

	const count = await cleanStaleStaging(dir, logger)

	expect(count).toBe(2)
	const remaining = await fs.readdir(dir)
	expect(remaining).toEqual(['keep.txt'])
})

// ── recoverInterruptedRun ────────────────────────────────────────────────

test('recoverInterruptedRun flips a stale running run to failed, preserving fields', async () => {
	const writes: LastRunStatus[] = []
	const logs: string[] = []
	const recovered = await recoverInterruptedRun({
		getLastRunStatus: async () => ({status: 'running', repositoryId: 'r1', startedAt: 123}),
		setLastRunStatus: async (status) => {
			writes.push(status)
		},
		logger: {log: (message) => logs.push(message), error: () => {}},
	})
	expect(recovered).toBe(true)
	expect(writes).toEqual([{status: 'failed', repositoryId: 'r1', startedAt: 123}])
	expect(logs.some((message) => message.includes('interrupted'))).toBe(true)
})

test('recoverInterruptedRun leaves terminal/absent statuses untouched', async () => {
	for (const stored of [
		{status: 'success', repositoryId: 'r1', startedAt: 1} as LastRunStatus,
		{status: 'failed', repositoryId: 'r1', startedAt: 1} as LastRunStatus,
		undefined,
	]) {
		const writes: LastRunStatus[] = []
		const recovered = await recoverInterruptedRun({
			getLastRunStatus: async () => stored,
			setLastRunStatus: async (status) => {
				writes.push(status)
			},
			logger,
		})
		expect(recovered).toBe(false)
		expect(writes).toEqual([])
	}
})

// ── runBackupPreflight ───────────────────────────────────────────────────

test('runBackupPreflight never throws even when every step fails internally', async () => {
	const deps: PreflightDeps = {
		listContainers: async () => {
			throw new Error('docker down')
		},
		unpause: async () => {
			throw new Error('unpause down')
		},
		// A PATH-like string that stat() rejects with ENOTDIR/ENOENT either way.
		stagingDirectory: path.join(os.tmpdir(), `preflight-nope-${process.pid}-${Date.now()}`, 'nested'),
		getLastRunStatus: async () => {
			throw new Error('store down')
		},
		setLastRunStatus: async () => {
			throw new Error('store write down')
		},
		logger,
	}
	await expect(runBackupPreflight(deps)).resolves.toBeUndefined()
})

test('runBackupPreflight runs all three steps on the happy path', async () => {
	const dir = await makeStagingDir()
	await fs.writeFile(path.join(dir, 'stale.tmp'), 'debris')

	const unpaused: string[] = []
	const writes: LastRunStatus[] = []
	await runBackupPreflight({
		listContainers: async () => [{name: 'frozen', state: 'paused'}],
		unpause: async (name) => {
			unpaused.push(name)
		},
		stagingDirectory: dir,
		getLastRunStatus: async () => ({status: 'running', repositoryId: 'r9', startedAt: 42}),
		setLastRunStatus: async (status) => {
			writes.push(status)
		},
		logger,
	})

	expect(unpaused).toEqual(['frozen'])
	expect(await fs.readdir(dir)).toEqual([])
	expect(writes).toEqual([{status: 'failed', repositoryId: 'r9', startedAt: 42}])
})
