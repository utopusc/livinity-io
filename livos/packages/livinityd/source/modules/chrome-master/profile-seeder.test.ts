/**
 * Phase 102-03-01 RED — MasterProfileSeeder vitest spec.
 *
 * Created BEFORE profile-seeder.ts exists. `pnpm --filter @livos/livinityd
 * test:run chrome-master/profile-seeder.test.ts` MUST fail with "Cannot find
 * module './profile-seeder.js'" at this checkpoint. Task 2 (GREEN) lands the
 * implementation which turns the 10 tests below into passes.
 *
 * Coverage (D-102-MASTER-PROFILE-SEED + A1 reflink risk + A7 SingletonLock
 * risk + T-102-03 path-traversal threat):
 *
 *   1. seed() happy path — execFileFn('cp', ['-r', '--reflink=auto', master, dest])
 *   2. A1 reflink fallback — when --reflink=auto rejects, retries plain cp -r
 *   3. A7 SingletonLock cleanup — post-cp rm -f of master's Singleton{Lock,Cookie,Socket}
 *   4. MasterProfileMissingError thrown when access(masterDir) rejects
 *   5. T-102-03 UUID validation — '../../etc' rejected with ProfileSeederInputError
 *   6. T-102-03 UUID validation — 'NOTAUUID' rejected with ProfileSeederInputError
 *   7. ensureMasterExists creates dir when absent (mkdirFn recursive:true)
 *   8. ensureMasterExists no-op when present (mkdirFn NOT called)
 *   9. cleanup(uuid) idempotent — calls rm -rf and swallows errors
 *  10. sweepOrphans() — execFileFn('sh', ['-c', 'rm -rf <prefix>*'])
 */

import {describe, it, expect, vi, beforeEach} from 'vitest'

import {
	createProfileSeeder,
	MasterProfileMissingError,
	ProfileSeederInputError,
	MASTER_PROFILE_DIR,
	APP_PROFILE_PREFIX,
	WEBAPP_PROFILE_DIR,
} from './profile-seeder.js'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'

function makeOkExec() {
	// execFileFn returns a child-process-shaped value; production code uses
	// promisify(execFile). We mock as a function returning `Promise<{stdout,stderr}>`
	// shape via the promisify path — but the seeder wraps with promisify(execFn).
	// promisify(fn) calls fn(cmd, args, cb). So our mock takes (cmd, args, cb).
	return vi.fn((_cmd: string, _args: string[], cb: (err: unknown, stdout?: string, stderr?: string) => void) => {
		cb(null, '', '')
	})
}

function makeFailExec(errMsg = 'cp: reflink unsupported') {
	return vi.fn((_cmd: string, _args: string[], cb: (err: unknown, stdout?: string, stderr?: string) => void) => {
		cb(new Error(errMsg))
	})
}

function makeOkAccess() {
	return vi.fn(async () => {
		/* resolved — master exists */
	})
}

function makeFailAccess() {
	return vi.fn(async () => {
		throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
	})
}

function makeOkMkdir() {
	// Typed mkdir(path, opts) — vitest infers parameter tuple from this
	// signature so `mock.calls[0][0]` / `[0][1]` are addressable in tests.
	return vi.fn(async (_path: string, _opts: {recursive: boolean}) => undefined)
}

describe('102-03-01 MasterProfileSeeder', () => {
	describe('seed() — happy path', () => {
		it('Test 1: calls execFileFn with cp -r --reflink=auto master dest', async () => {
			const execFn = makeOkExec()
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			const result = await seeder.seed()
			expect(result.uuid).toBe(VALID_UUID)
			expect(result.appDir).toBe(`${APP_PROFILE_PREFIX}${VALID_UUID}`)
			// First call: cp -r --reflink=auto
			const cpCall = execFn.mock.calls.find(
				(c) => c[0] === 'cp' && (c[1] as string[]).includes('--reflink=auto'),
			)
			expect(cpCall).toBeDefined()
			expect(cpCall![1]).toEqual([
				'-r',
				'--reflink=auto',
				MASTER_PROFILE_DIR,
				`${APP_PROFILE_PREFIX}${VALID_UUID}`,
			])
		})
	})

	describe('seed() — A1 reflink fallback', () => {
		it('Test 2: when --reflink=auto rejects, retries plain cp -r without --reflink flag', async () => {
			// First cp call fails (reflink unsupported), second cp call succeeds, then rm of Singletons.
			let cpAttempt = 0
			const execFn = vi.fn(
				(cmd: string, args: string[], cb: (err: unknown, stdout?: string, stderr?: string) => void) => {
					if (cmd === 'cp') {
						cpAttempt += 1
						if (cpAttempt === 1) {
							// A1 risk realized — --reflink=auto rejected on ext4
							expect(args).toContain('--reflink=auto')
							cb(new Error('cp: reflink unsupported'))
							return
						}
						// Fallback retry — no --reflink flag
						expect(args).not.toContain('--reflink=auto')
						expect(args).toEqual(['-r', MASTER_PROFILE_DIR, `${APP_PROFILE_PREFIX}${VALID_UUID}`])
						cb(null, '', '')
						return
					}
					cb(null, '', '')
				},
			)
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			const result = await seeder.seed()
			expect(result.uuid).toBe(VALID_UUID)
			expect(cpAttempt).toBe(2)
		})
	})

	describe('seed() — A7 SingletonLock cleanup', () => {
		it('Test 3: after successful cp, removes master Singleton{Lock,Cookie,Socket} via rm -f', async () => {
			const execFn = makeOkExec()
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			await seeder.seed()
			const appDir = `${APP_PROFILE_PREFIX}${VALID_UUID}`
			const rmCall = execFn.mock.calls.find((c) => c[0] === 'rm' && (c[1] as string[]).includes('-f'))
			expect(rmCall).toBeDefined()
			expect(rmCall![1]).toEqual([
				'-f',
				`${appDir}/SingletonLock`,
				`${appDir}/SingletonCookie`,
				`${appDir}/SingletonSocket`,
			])
		})
	})

	describe('seed() — master missing', () => {
		it('Test 4: throws MasterProfileMissingError when access(masterDir) rejects; cp never called', async () => {
			const execFn = makeOkExec()
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeFailAccess() as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			await expect(seeder.seed()).rejects.toThrow(MasterProfileMissingError)
			// cp must not have been invoked
			const cpCall = execFn.mock.calls.find((c) => c[0] === 'cp')
			expect(cpCall).toBeUndefined()
			// And the thrown error must carry the canonical code
			try {
				await seeder.seed()
			} catch (e) {
				expect((e as MasterProfileMissingError).code).toBe('MASTER_PROFILE_MISSING')
			}
		})
	})

	describe('seed() — T-102-03 UUID path-traversal validation', () => {
		it('Test 5: rejects uuid="../../etc" with ProfileSeederInputError; execFileFn never called', async () => {
			const execFn = makeOkExec()
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			await expect(seeder.seed({uuid: '../../etc'})).rejects.toThrow(ProfileSeederInputError)
			expect(execFn).not.toHaveBeenCalled()
			try {
				await seeder.seed({uuid: '../../etc'})
			} catch (e) {
				expect((e as ProfileSeederInputError).code).toBe('PROFILE_INVALID_UUID')
			}
		})

		it('Test 6: rejects uuid="NOTAUUID" with ProfileSeederInputError; execFileFn never called', async () => {
			const execFn = makeOkExec()
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			await expect(seeder.seed({uuid: 'NOTAUUID'})).rejects.toThrow(ProfileSeederInputError)
			expect(execFn).not.toHaveBeenCalled()
		})
	})

	describe('ensureMasterExists()', () => {
		it('Test 7: creates dir when access rejects (mkdirFn called with recursive:true)', async () => {
			const mkdirFn = makeOkMkdir()
			const seeder = createProfileSeeder({
				execFileFn: makeOkExec() as never,
				accessFn: makeFailAccess() as never,
				mkdirFn: mkdirFn as never,
			})
			await seeder.ensureMasterExists()
			expect(mkdirFn).toHaveBeenCalledTimes(1)
			expect(mkdirFn.mock.calls[0][0]).toBe(MASTER_PROFILE_DIR)
			expect(mkdirFn.mock.calls[0][1]).toEqual({recursive: true})
		})

		it('Test 8: no-op when access resolves — mkdirFn never called', async () => {
			const mkdirFn = makeOkMkdir()
			const seeder = createProfileSeeder({
				execFileFn: makeOkExec() as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: mkdirFn as never,
			})
			await seeder.ensureMasterExists()
			expect(mkdirFn).not.toHaveBeenCalled()
		})
	})

	describe('cleanup()', () => {
		it('Test 9: rm -rf <dest>, idempotent — does NOT throw on repeat rm failure', async () => {
			let rmAttempt = 0
			const execFn = vi.fn(
				(_cmd: string, _args: string[], cb: (err: unknown, stdout?: string, stderr?: string) => void) => {
					rmAttempt += 1
					if (rmAttempt === 2) {
						// Second cleanup: rm rejects (e.g., already gone) — must be swallowed
						cb(new Error('rm: cannot remove'))
						return
					}
					cb(null, '', '')
				},
			)
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
			})
			await seeder.cleanup(VALID_UUID)
			// First call: rm -rf <prefix><uuid>
			expect(execFn.mock.calls[0][0]).toBe('rm')
			expect(execFn.mock.calls[0][1]).toEqual(['-rf', `${APP_PROFILE_PREFIX}${VALID_UUID}`])
			// Second call must not throw
			await expect(seeder.cleanup(VALID_UUID)).resolves.toBeUndefined()
		})
	})

	describe('sweepOrphans()', () => {
		it('Test 10: invokes sh -c "rm -rf <prefix>*" and returns a number', async () => {
			const execFn = makeOkExec()
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
			})
			const swept = await seeder.sweepOrphans()
			expect(typeof swept).toBe('number')
			const shCall = execFn.mock.calls.find((c) => c[0] === 'sh')
			expect(shCall).toBeDefined()
			expect(shCall![1]).toEqual(['-c', `rm -rf ${APP_PROFILE_PREFIX}*`])
		})
	})

	describe('seed() — Phase 259 persistent profiles', () => {
		const PERSIST_DIR = `${WEBAPP_PROFILE_DIR}/${VALID_UUID}`

		it('persistent FRESH: seeds master → chrome-webapps/<uuid>, persistent=true', async () => {
			const execFn = makeOkExec()
			// Reject ONLY the appDir existence probe (fresh); master + prefs resolve.
			const accessFn = vi.fn(async (p: string) => {
				if (p === PERSIST_DIR) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
			})
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: accessFn as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			const r = await seeder.seed({persistent: true})
			expect(r.persistent).toBe(true)
			expect(r.appDir).toBe(PERSIST_DIR)
			const cpCall = execFn.mock.calls.find((c) => c[0] === 'cp')
			expect(cpCall).toBeDefined()
			expect((cpCall![1] as string[]).at(-1)).toBe(PERSIST_DIR)
		})

		it('persistent REUSE: existing dir is NOT re-cloned (state preserved), locks still stripped', async () => {
			const execFn = makeOkExec()
			const accessFn = makeOkAccess() // everything resolves → appDir exists → reuse
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: accessFn as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			const r = await seeder.seed({persistent: true})
			expect(r.persistent).toBe(true)
			expect(r.appDir).toBe(PERSIST_DIR)
			// No cp — the persistent dir was reused, preserving login + state.
			expect(execFn.mock.calls.find((c) => c[0] === 'cp')).toBeUndefined()
			// Singleton{Lock,Cookie,Socket} stripped so a crashed prior session can restart.
			const rmCall = execFn.mock.calls.find(
				(c) => c[0] === 'rm' && (c[1] as string[]).some((a) => a.includes('SingletonLock')),
			)
			expect(rmCall).toBeDefined()
		})

		it('default (no persistent flag): throwaway /tmp dir + persistent=false', async () => {
			const execFn = makeOkExec()
			const seeder = createProfileSeeder({
				execFileFn: execFn as never,
				accessFn: makeOkAccess() as never,
				mkdirFn: makeOkMkdir() as never,
				uuidFn: () => VALID_UUID,
			})
			const r = await seeder.seed()
			expect(r.persistent).toBe(false)
			expect(r.appDir).toBe(`${APP_PROFILE_PREFIX}${VALID_UUID}`)
		})
	})
})
