// Phase 339 STORD-01 — folder-quota-scan unit tests.
//
// Covers:
//   - nearestAncestorFolderQuota: exact match, deepest-ancestor wins, segment-boundary
//     (no /Home/Docs vs /Home/DocsBackup false match), no-match → undefined, root `/`
//     governs everything.
//   - foldersOverSoftQuota: over/under/at the soft ratio, limit <= 0 skipped, empty set.
//   - folderQuotaScanHandler: !livinityd → skipped; happy-path writes the per-entry cache
//     via getWriteLock + raises/clears the target-qualified bell; one bad entry does not
//     fail the tick; a persist failure → {status:'failure'}.
//
// getDirectorySize is mocked so no real du is touched; the store/files/notifications
// collaborators are plain vi.fn stubs (no live PG/Redis/FS).

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from '../scheduler/types.js'

const mockGetDirectorySize = vi.fn()
vi.mock('../utilities/get-directory-size.js', () => ({
	default: (...args: unknown[]) => mockGetDirectorySize(...args),
}))

import {
	nearestAncestorFolderQuota,
	foldersOverSoftQuota,
	folderQuotaScanHandler,
	type FolderQuotaEntry,
} from './folder-quota-scan.js'

const fakeJob = {name: 'folder-quota-scan', type: 'folder-quota-scan'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

describe('nearestAncestorFolderQuota (pure)', () => {
	const entries = [
		{virtualPath: '/Home'},
		{virtualPath: '/Home/Downloads'},
		{virtualPath: '/Home/Docs'},
	]

	test('exact match wins', () => {
		expect(nearestAncestorFolderQuota(entries, '/Home/Docs')?.virtualPath).toBe('/Home/Docs')
	})
	test('deepest ancestor wins over a shallower one', () => {
		expect(nearestAncestorFolderQuota(entries, '/Home/Downloads/big.iso')?.virtualPath).toBe('/Home/Downloads')
	})
	test('falls back to the shallower ancestor when no deeper entry governs', () => {
		expect(nearestAncestorFolderQuota(entries, '/Home/Photos/a.jpg')?.virtualPath).toBe('/Home')
	})
	test('segment-boundary only: /Home/Docs is NOT an ancestor of /Home/DocsBackup', () => {
		expect(nearestAncestorFolderQuota(entries, '/Home/DocsBackup/x')?.virtualPath).toBe('/Home')
	})
	test('no matching entry → undefined', () => {
		expect(nearestAncestorFolderQuota([{virtualPath: '/Apps'}], '/Home/x')).toBeUndefined()
	})
	test('trailing slashes on the entry path are normalized', () => {
		expect(nearestAncestorFolderQuota([{virtualPath: '/Home/Docs/'}], '/Home/Docs/a')?.virtualPath).toBe('/Home/Docs/')
	})
	test('a root `/` entry governs everything', () => {
		const withRoot = [{virtualPath: '/'}, {virtualPath: '/Home'}]
		expect(nearestAncestorFolderQuota(withRoot, '/Apps/x')?.virtualPath).toBe('/')
		// but a deeper entry still wins where it applies
		expect(nearestAncestorFolderQuota(withRoot, '/Home/x')?.virtualPath).toBe('/Home')
	})
})

describe('foldersOverSoftQuota (pure)', () => {
	test('over the soft ratio → listed', () => {
		expect(foldersOverSoftQuota([{virtualPath: '/A', limitBytes: 100, hardBlock: false, usageBytes: 95}])).toEqual(['/A'])
	})
	test('under the soft ratio → not listed', () => {
		expect(foldersOverSoftQuota([{virtualPath: '/A', limitBytes: 100, hardBlock: false, usageBytes: 50}])).toEqual([])
	})
	test('exactly at the soft ratio → listed (>=)', () => {
		expect(foldersOverSoftQuota([{virtualPath: '/A', limitBytes: 100, hardBlock: false, usageBytes: 90}])).toEqual(['/A'])
	})
	test('limit <= 0 = unlimited → skipped', () => {
		expect(
			foldersOverSoftQuota([
				{virtualPath: '/A', limitBytes: 0, hardBlock: false, usageBytes: 999},
				{virtualPath: '/B', limitBytes: -1, hardBlock: false, usageBytes: 999},
			]),
		).toEqual([])
	})
	test('missing usageBytes treated as 0; empty set → empty', () => {
		expect(foldersOverSoftQuota([{virtualPath: '/A', limitBytes: 100, hardBlock: false}])).toEqual([])
		expect(foldersOverSoftQuota([])).toEqual([])
	})
})

function makeLivinityd(entries: FolderQuotaEntry[]) {
	const add = vi.fn().mockResolvedValue(true)
	const clear = vi.fn().mockResolvedValue(true)
	const set = vi.fn().mockResolvedValue(true)
	const getWriteLock = vi.fn(async (fn: (io: {get: (k: string) => Promise<unknown>; set: typeof set}) => Promise<void>) =>
		fn({get: async () => entries, set}),
	)
	const virtualToSystemPath = vi.fn(async (vp: string) => `/sys${vp}`)
	const livinityd = {
		store: {get: vi.fn(async () => entries), getWriteLock},
		files: {virtualToSystemPath},
		notifications: {add, clear},
	} as never
	return {livinityd, add, clear, set, getWriteLock, virtualToSystemPath}
}

describe('folderQuotaScanHandler', () => {
	test('SKIP-PATH: no ctx.livinityd → resolves, never throws, {status: skipped}', async () => {
		const result = await folderQuotaScanHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('happy-path: caches per-folder usage via getWriteLock + adds/clears the target-qualified bell', async () => {
		mockGetDirectorySize.mockReset()
		mockGetDirectorySize.mockImplementation(async (p: string) => (p === '/sys/Home/Big' ? 950 : 100))
		const entries: FolderQuotaEntry[] = [
			{virtualPath: '/Home/Big', limitBytes: 1000, hardBlock: true},
			{virtualPath: '/Home/Small', limitBytes: 1000, hardBlock: false},
		]
		const {livinityd, add, clear, set} = makeLivinityd(entries)

		const result = await folderQuotaScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		// cache persisted with usageBytes + scannedAt, config preserved
		const persisted = set.mock.calls[0][1] as FolderQuotaEntry[]
		expect(persisted.find((e) => e.virtualPath === '/Home/Big')?.usageBytes).toBe(950)
		expect(persisted.find((e) => e.virtualPath === '/Home/Small')?.usageBytes).toBe(100)
		expect(persisted.every((e) => typeof e.scannedAt === 'number')).toBe(true)
		// /Home/Big is over 90% → target-qualified bell; /Home/Small under → cleared
		expect(add).toHaveBeenCalledWith('folder-quota-exceeded:/Home/Big', {severity: 'warning', external: false})
		expect(clear).toHaveBeenCalledWith('folder-quota-exceeded:/Home/Small')
	})

	test('one bad entry (du fails) degrades to previous/0 — job still success', async () => {
		mockGetDirectorySize.mockReset()
		mockGetDirectorySize.mockImplementation(async (p: string) => {
			if (p === '/sys/Home/Bad') throw new Error('du: cannot access')
			return 10
		})
		const entries: FolderQuotaEntry[] = [
			{virtualPath: '/Home/Bad', limitBytes: 1000, hardBlock: false, usageBytes: 42},
			{virtualPath: '/Home/Good', limitBytes: 1000, hardBlock: false},
		]
		const {livinityd, set} = makeLivinityd(entries)

		const result = await folderQuotaScanHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		const persisted = set.mock.calls[0][1] as FolderQuotaEntry[]
		expect(persisted.find((e) => e.virtualPath === '/Home/Bad')?.usageBytes).toBe(42) // previous cache preserved
		expect(persisted.find((e) => e.virtualPath === '/Home/Good')?.usageBytes).toBe(10)
	})

	test('a persist failure → {status: failure}', async () => {
		mockGetDirectorySize.mockReset()
		mockGetDirectorySize.mockResolvedValue(10)
		const entries: FolderQuotaEntry[] = [{virtualPath: '/Home/X', limitBytes: 1000, hardBlock: false}]
		const {livinityd, getWriteLock} = makeLivinityd(entries)
		getWriteLock.mockRejectedValueOnce(new Error('store down'))

		const result = await folderQuotaScanHandler(fakeJob, {logger: fakeLogger, livinityd})
		expect(result.status).toBe('failure')
	})
})
