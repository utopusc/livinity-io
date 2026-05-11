/**
 * Phase 102-07-01 RED — chromeMaster tRPC router vitest spec.
 *
 * Created BEFORE master-login-routes.ts exists. `pnpm --filter
 * @livos/livinityd test:run chrome-master/master-login-routes.test.ts` MUST
 * fail with "Cannot find module './master-login-routes.js'" at this
 * checkpoint. Task 2 (GREEN) lands the implementation which turns the 9
 * tests below into passes.
 *
 * Coverage (D-102-MASTER-LOGIN-UI + T-102-07 admin gate + T-102-07b
 * singleton lock + T-102-07c backup-before-delete):
 *
 *   1. T-102-07 admin gate on startLogin — non-admin caller throws
 *      FORBIDDEN (requireRole). spawn() never invoked.
 *   2. startLogin happy path — admin caller, spawn argv includes
 *      sudo -n -u bruce DISPLAY=:0 google-chrome --user-data-dir=
 *      /opt/livos/data/chrome-master, --no-first-run,
 *      --no-default-browser-check.
 *   3. T-102-07b singleton lock — second concurrent startLogin throws
 *      CONFLICT ("master chrome already running").
 *   4. status when Cookies file present — returns {hasCookies: true}.
 *   5. status when Cookies file absent — returns {hasCookies: false}.
 *   6. T-102-07c reset({backup: true}) — renames master → master.backup
 *      BEFORE creating fresh master dir (rename happens before mkdir).
 *   7. reset({backup: false}) — rm -rf master directly, no rename.
 *   8. T-102-07 admin gate on reset — non-admin caller throws FORBIDDEN.
 *   9. httpOnlyPaths registration — common.ts httpOnlyPaths includes
 *      chromeMaster.{startLogin,reset,restoreBackup,status}.
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {beforeEach, describe, expect, test, vi} from 'vitest'
import {TRPCError} from '@trpc/server'

import {
	createChromeMasterRouter,
	MASTER_PROFILE_DIR,
	MASTER_BACKUP_DIR,
	_resetMasterStateForTest,
} from './master-login-routes.js'
import {t} from '../server/trpc/trpc.js'

function makeCtx(opts: {role?: 'admin' | 'member' | 'guest'; userId?: string} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'ws',
		currentUser: {
			id: opts.userId ?? 'user-A',
			username: 'alice',
			role: opts.role ?? 'admin',
		},
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
		},
	} as never
}

function makeFakeChild(pid = 12345) {
	const listeners: Record<string, Array<(...a: unknown[]) => void>> = {}
	return {
		pid,
		stderr: null,
		on: (ev: string, cb: (...a: unknown[]) => void) => {
			listeners[ev] = listeners[ev] ?? []
			listeners[ev].push(cb)
		},
		once: (ev: string, cb: (...a: unknown[]) => void) => {
			listeners[ev] = listeners[ev] ?? []
			listeners[ev].push(cb)
		},
		unref: () => {},
		__listeners: listeners,
		__emit: (ev: string, ...args: unknown[]) => {
			for (const cb of listeners[ev] ?? []) cb(...args)
		},
	}
}

function makeOkAccess() {
	return vi.fn(async (_p: string) => undefined)
}
function makeFailAccess() {
	return vi.fn(async (_p: string) => {
		throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
	})
}
function makeRm() {
	return vi.fn(async (_p: string, _opts?: unknown) => undefined)
}
function makeRename() {
	return vi.fn(async (_from: string, _to: string) => undefined)
}
function makeMkdir() {
	return vi.fn(async (_p: string, _opts: {recursive: boolean}) => undefined)
}

describe('102-07-01 chromeMaster tRPC router', () => {
	beforeEach(() => {
		_resetMasterStateForTest()
	})

	describe('startLogin — T-102-07 admin gate', () => {
		test('Test 1: non-admin caller throws FORBIDDEN; spawnFn never invoked', async () => {
			const spawnFn = vi.fn(() => makeFakeChild() as never)
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: spawnFn as never,
				accessFn: makeOkAccess() as never,
				rmFn: makeRm() as never,
				renameFn: makeRename() as never,
				mkdirFn: makeMkdir() as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			await expect(caller.startLogin()).rejects.toThrow(TRPCError)
			await expect(caller.startLogin()).rejects.toMatchObject({code: 'FORBIDDEN'})
			expect(spawnFn).not.toHaveBeenCalled()
		})
	})

	describe('startLogin — happy path', () => {
		test('Test 2: admin caller spawns sudo -n -u bruce DISPLAY=:0 google-chrome with --user-data-dir=/opt/livos/data/chrome-master', async () => {
			const spawnFn = vi.fn(() => makeFakeChild(54321) as never)
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: spawnFn as never,
				accessFn: makeOkAccess() as never,
				rmFn: makeRm() as never,
				renameFn: makeRename() as never,
				mkdirFn: makeMkdir() as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'admin'}))
			const result = await caller.startLogin()
			expect(result.pid).toBe(54321)
			expect(typeof result.startedAt).toBe('number')
			expect(spawnFn).toHaveBeenCalledTimes(1)
			const [cmd, args] = spawnFn.mock.calls[0] as unknown as [string, string[]]
			expect(cmd).toBe('sudo')
			expect(args).toContain('-n')
			expect(args).toContain('-u')
			expect(args).toContain('bruce')
			expect(args).toContain('DISPLAY=:0')
			expect(args).toContain('google-chrome')
			expect(args).toContain(`--user-data-dir=${MASTER_PROFILE_DIR}`)
			expect(args).toContain('--no-first-run')
			expect(args).toContain('--no-default-browser-check')
		})
	})

	describe('startLogin — T-102-07b singleton lock', () => {
		test('Test 3: second concurrent startLogin throws CONFLICT', async () => {
			const spawnFn = vi.fn(() => makeFakeChild(98765) as never)
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: spawnFn as never,
				accessFn: makeOkAccess() as never,
				rmFn: makeRm() as never,
				renameFn: makeRename() as never,
				mkdirFn: makeMkdir() as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'admin'}))
			await caller.startLogin()
			await expect(caller.startLogin()).rejects.toMatchObject({code: 'CONFLICT'})
			// Only the first spawn happened
			expect(spawnFn).toHaveBeenCalledTimes(1)
		})
	})

	describe('status', () => {
		test('Test 4: returns {hasCookies: true} when accessFn resolves', async () => {
			const accessFn = makeOkAccess()
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: vi.fn(() => makeFakeChild() as never) as never,
				accessFn: accessFn as never,
				rmFn: makeRm() as never,
				renameFn: makeRename() as never,
				mkdirFn: makeMkdir() as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			const result = await caller.status()
			expect(result.hasCookies).toBe(true)
			expect(result.dir).toBe(MASTER_PROFILE_DIR)
			expect(accessFn).toHaveBeenCalled()
			expect((accessFn.mock.calls[0] as unknown as [string])[0]).toContain('Default/Cookies')
		})

		test('Test 5: returns {hasCookies: false} when accessFn rejects', async () => {
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: vi.fn(() => makeFakeChild() as never) as never,
				accessFn: makeFailAccess() as never,
				rmFn: makeRm() as never,
				renameFn: makeRename() as never,
				mkdirFn: makeMkdir() as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			const result = await caller.status()
			expect(result.hasCookies).toBe(false)
			expect(result.dir).toBe(MASTER_PROFILE_DIR)
		})
	})

	describe('reset — T-102-07c backup-before-delete', () => {
		test('Test 6: reset({backup: true}) renames master → master.backup BEFORE recreating master dir', async () => {
			const callOrder: string[] = []
			const accessFn = vi.fn(async (_p: string) => {
				callOrder.push('access')
			})
			const rmFn = vi.fn(async (_p: string, _opts?: unknown) => {
				callOrder.push('rm')
			})
			const renameFn = vi.fn(async (_from: string, _to: string) => {
				callOrder.push('rename')
			})
			const mkdirFn = vi.fn(async (_p: string, _opts: {recursive: boolean}) => {
				callOrder.push('mkdir')
			})
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: vi.fn(() => makeFakeChild() as never) as never,
				accessFn: accessFn as never,
				rmFn: rmFn as never,
				renameFn: renameFn as never,
				mkdirFn: mkdirFn as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'admin'}))
			const result = await caller.reset({backup: true})
			expect(result.ok).toBe(true)
			// rename happens BEFORE mkdir of master
			expect(renameFn).toHaveBeenCalled()
			expect(mkdirFn).toHaveBeenCalled()
			const renameCall = renameFn.mock.calls[0] as unknown as [string, string]
			expect(renameCall[0]).toBe(MASTER_PROFILE_DIR)
			expect(renameCall[1]).toBe(MASTER_BACKUP_DIR)
			// Ordering: 'rename' must precede 'mkdir' in callOrder
			expect(callOrder.indexOf('rename')).toBeLessThan(callOrder.indexOf('mkdir'))
		})
	})

	describe('reset — no-backup direct path', () => {
		test('Test 7: reset({backup: false}) rm -rf master directly; renameFn never invoked', async () => {
			const renameFn = makeRename()
			const rmFn = makeRm()
			const mkdirFn = makeMkdir()
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: vi.fn(() => makeFakeChild() as never) as never,
				accessFn: makeOkAccess() as never,
				rmFn: rmFn as never,
				renameFn: renameFn as never,
				mkdirFn: mkdirFn as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'admin'}))
			const result = await caller.reset({backup: false})
			expect(result.ok).toBe(true)
			expect(renameFn).not.toHaveBeenCalled()
			expect(rmFn).toHaveBeenCalled()
			const rmCall = rmFn.mock.calls[0] as unknown as [string, {recursive: boolean; force: boolean}]
			expect(rmCall[0]).toBe(MASTER_PROFILE_DIR)
			expect(rmCall[1]).toMatchObject({recursive: true, force: true})
		})
	})

	describe('reset — T-102-07 admin gate', () => {
		test('Test 8: non-admin caller throws FORBIDDEN; rmFn never invoked', async () => {
			const rmFn = makeRm()
			const chromeMasterRouter = createChromeMasterRouter({
				spawnFn: vi.fn(() => makeFakeChild() as never) as never,
				accessFn: makeOkAccess() as never,
				rmFn: rmFn as never,
				renameFn: makeRename() as never,
				mkdirFn: makeMkdir() as never,
			})
			const caller = t.createCallerFactory(chromeMasterRouter)(makeCtx({role: 'member'}))
			await expect(caller.reset({backup: false})).rejects.toMatchObject({code: 'FORBIDDEN'})
			expect(rmFn).not.toHaveBeenCalled()
		})
	})

	describe('httpOnlyPaths registration', () => {
		test('Test 9: common.ts httpOnlyPaths includes chromeMaster.{startLogin,reset,restoreBackup,status}', () => {
			const __filename = fileURLToPath(import.meta.url)
			const __dirname = dirname(__filename)
			const commonPath = join(__dirname, '..', 'server', 'trpc', 'common.ts')
			const commonSrc = readFileSync(commonPath, 'utf8')
			expect(commonSrc).toContain("'chromeMaster.startLogin'")
			expect(commonSrc).toContain("'chromeMaster.reset'")
			expect(commonSrc).toContain("'chromeMaster.restoreBackup'")
			expect(commonSrc).toContain("'chromeMaster.status'")
		})
	})
})
