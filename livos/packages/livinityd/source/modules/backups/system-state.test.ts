import {afterEach, beforeEach, expect, test, vi} from 'vitest'

// Record execa invocations; let tests make specific ones throw.
const calls: string[][] = []
let failMatcher: ((argv: string[]) => boolean) | null = null

vi.mock('execa', () => ({
	$: (parts: TemplateStringsArray, ...args: unknown[]) => {
		// Reconstruct the argv the tag would run (parts interleaved with args).
		const argv: string[] = []
		parts.forEach((p, i) => {
			p.split(' ').filter(Boolean).forEach((tok) => argv.push(tok))
			if (i < args.length) argv.push(String(args[i]))
		})
		calls.push(argv)
		if (failMatcher && failMatcher(argv)) return Promise.reject(new Error('simulated failure'))
		return Promise.resolve({stdout: '', stderr: '', exitCode: 0})
	},
}))

const pathExists = vi.fn(async () => true)
vi.mock('fs-extra', () => ({
	default: {
		mkdirp: vi.fn(async () => {}),
		move: vi.fn(async () => {}),
		remove: vi.fn(async () => {}),
		pathExists: (...a: unknown[]) => pathExists(...(a as [])),
	},
}))

const {captureSystemState, restoreSystemState} = await import('./system-state.js')

const logger = {log: () => {}, error: () => {}}

beforeEach(() => {
	calls.length = 0
	failMatcher = null
	pathExists.mockResolvedValue(true)
	process.env.DATABASE_URL = 'postgresql://livos:pw@127.0.0.1:5432/livos'
})
afterEach(() => {
	delete process.env.DATABASE_URL
})

test('capture runs pg_dump (custom, no-owner) + tars liv-assistant data', async () => {
	await captureSystemState('/data', logger)
	const dump = calls.find((c) => c[0] === 'pg_dump')
	expect(dump).toBeTruthy()
	expect(dump).toContain('--format=custom')
	expect(dump).toContain('--no-owner')
	expect(dump).toContain('postgresql://livos:pw@127.0.0.1:5432/livos')
	expect(calls.some((c) => c[0] === 'tar' && c.includes('-czf'))).toBe(true)
})

test('capture skips DB when DATABASE_URL is unset (still non-fatal)', async () => {
	delete process.env.DATABASE_URL
	await expect(captureSystemState('/data', logger)).resolves.toBeUndefined()
	expect(calls.some((c) => c[0] === 'pg_dump')).toBe(false)
})

test('capture is non-fatal when pg_dump fails', async () => {
	failMatcher = (argv) => argv[0] === 'pg_dump'
	await expect(captureSystemState('/data', logger)).resolves.toBeUndefined()
	// tar still attempted after the dump failure
	expect(calls.some((c) => c[0] === 'tar')).toBe(true)
})

test('restore runs pg_restore --clean --if-exists against the DB url', async () => {
	await restoreSystemState('/data', logger)
	const restore = calls.find((c) => c[0] === 'pg_restore')
	expect(restore).toBeTruthy()
	expect(restore).toContain('--clean')
	expect(restore).toContain('--if-exists')
	// (the mock splits `--dbname=${url}` into two tokens; execa glues them —
	// assert the url token is present rather than the glued form)
	expect(restore).toContain('postgresql://livos:pw@127.0.0.1:5432/livos')
	expect(calls.some((c) => c[0] === 'tar' && c.includes('-xzf'))).toBe(true)
})

test('restore is a no-op when the snapshot has no system-state files', async () => {
	pathExists.mockResolvedValue(false)
	await restoreSystemState('/data', logger)
	expect(calls.some((c) => c[0] === 'pg_restore')).toBe(false)
	expect(calls.some((c) => c[0] === 'tar')).toBe(false)
})

test('restore is non-fatal when pg_restore reports errors', async () => {
	failMatcher = (argv) => argv[0] === 'pg_restore'
	await expect(restoreSystemState('/data', logger)).resolves.toBeUndefined()
})
