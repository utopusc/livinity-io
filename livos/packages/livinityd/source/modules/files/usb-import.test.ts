import {expect, test, describe, beforeEach, vi, type Mock} from 'vitest'

import getDirectorySize from '../utilities/get-directory-size.js'
import {getDiskUsageByPath} from '../system/system.js'
import {findUserByUsername} from '../database/index.js'
import fse from 'fs-extra'

import UsbImport, {USB_IMPORT_JUNK, scanSourceCounts, type UsbImportRule} from './usb-import.js'

// Fully offline: no real USB, no real disk, no rsync. The runner's external
// dependencies (recursive size, free space, DB owner lookup, source walk) are all
// mocked; the file operations are a spied fake `files` surface.
vi.mock('../utilities/get-directory-size.js', () => ({default: vi.fn()}))
vi.mock('../system/system.js', () => ({getDiskUsageByPath: vi.fn()}))
vi.mock('../database/index.js', () => ({findUserByUsername: vi.fn()}))
vi.mock('fs-extra', () => {
	const readdir = vi.fn()
	return {default: {readdir}}
})

const mockGetDirectorySize = getDirectorySize as unknown as Mock
const mockGetDiskUsageByPath = getDiskUsageByPath as unknown as Mock
const mockFindUserByUsername = findUserByUsername as unknown as Mock
const mockReaddir = (fse as unknown as {readdir: Mock}).readdir

// Fake fs Dirent factories for the scanSourceCounts walk.
const fileEntry = (name: string) => ({name, isDirectory: () => false, isFile: () => true}) as any
const dirEntry = (name: string) => ({name, isDirectory: () => true, isFile: () => false}) as any

const MOUNT = {label: 'USB', virtualMountPoint: '/External/USB'}
const RULE: UsbImportRule = {
	id: 'rule-1',
	enabled: true,
	destinationVirtualPath: '/Home/USB Imports',
	ownerUsername: 'alice',
	ownerRole: 'admin',
}

function setup(rules: UsbImportRule[] = [{...RULE}]) {
	let stored = rules
	const files = {
		// The real runAsUser wraps fn in AsyncLocalStorage; for tests just execute it.
		runAsUser: vi.fn((_owner: unknown, fn: () => unknown) => fn()),
		virtualToSystemPath: vi.fn(async (p: string) => `/sys${p}`),
		createDirectory: vi.fn(async () => true),
		copy: vi.fn(async () => '/Home/USB Imports/USB'),
		rename: vi.fn(async (_v: string, name: string) => `/Home/USB Imports/${name}`),
		getUniqueName: vi.fn(async (p: string) => p),
		assertWithinQuota: vi.fn(async () => {}),
		assertWithinFolderQuota: vi.fn(async () => {}),
		// Never-move guard surfaces — must stay untouched by the runner.
		move: vi.fn(),
		trash: vi.fn(),
		delete: vi.fn(),
	}
	const store = {
		get: vi.fn(async (key: string) => (key === 'usbImport' ? stored : undefined)),
		getWriteLock: vi.fn(async (fn: (h: {get: any; set: any}) => Promise<void>) => {
			await fn({
				get: async (key: string) => (key === 'usbImport' ? stored : undefined),
				set: async (key: string, val: any) => {
					if (key === 'usbImport') stored = val
				},
			})
		}),
	}
	const notifications = {add: vi.fn(async () => true), clear: vi.fn(async () => true)}
	const logger: any = {log: vi.fn(), error: vi.fn(), verbose: vi.fn()}
	logger.createChildLogger = () => logger
	const livinityd: any = {logger, files, store, notifications}
	const runner = new UsbImport(livinityd)
	return {runner, files, store, notifications, getRules: () => stored}
}

const ruleById = (rules: UsbImportRule[], id: string) => rules.find((r) => r.id === id)!

beforeEach(() => {
	vi.clearAllMocks()
	// Defaults describe a healthy, successful import; individual tests override.
	mockFindUserByUsername.mockResolvedValue({username: 'alice', role: 'admin', isActive: true} as any)
	mockGetDirectorySize.mockResolvedValue(1_000_000) // 1 MB source
	mockGetDiskUsageByPath.mockResolvedValue({size: 1e12, totalUsed: 0, available: 1e12}) // 1 TB free
	mockReaddir.mockResolvedValue([fileEntry('a.txt'), fileEntry('b.txt')]) // 2 importable files
})

describe('scanSourceCounts', () => {
	test('counts regular files and tallies (never descends) junk names', async () => {
		mockReaddir.mockResolvedValue([
			fileEntry('photo.jpg'),
			fileEntry('.DS_Store'),
			dirEntry('System Volume Information'),
			fileEntry('._foo'),
			fileEntry('doc.txt'),
		])
		const {fileCount, junkCount} = await scanSourceCounts('/sys/External/USB')
		expect(fileCount).toBe(2) // photo.jpg + doc.txt
		expect(junkCount).toBe(3) // .DS_Store + System Volume Information + ._foo
	})
})

describe('UsbImport runner', () => {
	test('matcher fires exactly once per new mount (only the enabled rule copies)', async () => {
		const {runner, files, notifications} = setup([
			{...RULE, id: 'disabled', enabled: false},
			{...RULE, id: 'enabled', enabled: true},
		])
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(files.copy).toHaveBeenCalledTimes(1)
		expect(notifications.add).toHaveBeenCalledTimes(1)
		expect(notifications.add).toHaveBeenCalledWith('usb-import-complete:enabled', expect.anything())
	})

	test('recursive-size precheck closes the inode-size gap (regression)', async () => {
		// 64 GB source, only 10 GB free — the decision MUST use getDirectorySize's real
		// bytes (64 GB), not a ~4 KB directory-inode stat. copy() is never reached.
		mockGetDirectorySize.mockResolvedValue(64 * 1e9)
		mockGetDiskUsageByPath.mockResolvedValue({size: 1e12, totalUsed: 0, available: 10 * 1e9})

		const {runner, files, notifications, getRules} = setup()
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(mockGetDirectorySize).toHaveBeenCalled()
		expect(files.copy).not.toHaveBeenCalled()
		expect(notifications.add).toHaveBeenCalledWith('usb-import-failed:rule-1', expect.anything())
		expect(ruleById(getRules(), 'rule-1').lastRun?.copied).toBe(0)
	})

	test('owner confinement — a destination escaping the base is rejected, no copy', async () => {
		const {runner, files, notifications} = setup()
		files.virtualToSystemPath.mockImplementation(async (p: string) => {
			if (p === '/Home/USB Imports') throw new Error('[escapes-base]')
			return `/sys${p}`
		})
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(files.copy).not.toHaveBeenCalled()
		expect(files.move).not.toHaveBeenCalled()
		expect(notifications.add).toHaveBeenCalledWith('usb-import-failed:rule-1', expect.anything())
	})

	test('owner missing/inactive → inert (no context wrap, no copy)', async () => {
		mockFindUserByUsername.mockResolvedValue(null)
		const {runner, files, notifications} = setup()
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(files.runAsUser).not.toHaveBeenCalled()
		expect(files.copy).not.toHaveBeenCalled()
		expect(notifications.add).toHaveBeenCalledWith('usb-import-failed:rule-1', expect.anything())
	})

	test('junk-skip — copy receives the exclude list; junk counted in skipped, not copied', async () => {
		mockReaddir.mockResolvedValue([
			fileEntry('photo.jpg'),
			fileEntry('.DS_Store'),
			dirEntry('System Volume Information'),
			fileEntry('._foo'),
			fileEntry('doc.txt'),
		])
		const {runner, files, getRules} = setup()
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(files.copy).toHaveBeenCalledWith('/External/USB', '/Home/USB Imports', {
			collision: 'keep-both',
			excludes: [...USB_IMPORT_JUNK],
		})
		const lastRun = ruleById(getRules(), 'rule-1').lastRun!
		expect(lastRun.skipped).toBe(3)
		expect(lastRun.copied).toBe(2)
	})

	test('failure summary counts — a mid-copy reject does not propagate out of handleNewMount', async () => {
		const {runner, files, notifications, getRules} = setup()
		files.copy.mockRejectedValue(new Error('rsync exited with a non-zero code'))

		// handleNewMount resolves even though the enqueued copy rejects.
		await expect(runner.handleNewMount(MOUNT)).resolves.toBeUndefined()
		await expect(runner.onIdle()).resolves.toBeUndefined()

		const lastRun = ruleById(getRules(), 'rule-1').lastRun!
		expect(lastRun.failed).toBeGreaterThanOrEqual(1)
		expect(lastRun.copied).toBe(0) // nothing landed (copy never returned a path)
		expect(notifications.add).toHaveBeenCalledWith('usb-import-failed:rule-1', expect.anything())
	})

	test('never-move — only copy + rename are used, source is never moved/trashed/deleted', async () => {
		const {runner, files} = setup()
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(files.copy).toHaveBeenCalledTimes(1)
		expect(files.rename).toHaveBeenCalledTimes(1)
		expect(files.move).not.toHaveBeenCalled()
		expect(files.trash).not.toHaveBeenCalled()
		expect(files.delete).not.toHaveBeenCalled()
	})

	test('detached — the hook returns without awaiting the copy', async () => {
		const {runner, files} = setup()
		files.copy.mockImplementation(() => new Promise(() => {})) // never resolves

		const result = await Promise.race([
			runner.handleNewMount(MOUNT).then(() => 'handled'),
			new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 50)),
		])
		// handleNewMount resolves promptly because the copy is enqueued detached, not awaited.
		expect(result).toBe('handled')
	})

	test('over-quota → skip, no copy', async () => {
		const {runner, files, notifications, getRules} = setup()
		files.assertWithinFolderQuota.mockRejectedValue(new Error('[folder-quota-exceeded]'))
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(files.copy).not.toHaveBeenCalled()
		expect(notifications.add).toHaveBeenCalledWith('usb-import-failed:rule-1', expect.anything())
		expect(ruleById(getRules(), 'rule-1').lastRun?.copied).toBe(0)
	})

	test('empty source → no copy AND no notification (just-formatted / empty card)', async () => {
		const {runner, files, notifications, getRules} = setup()
		mockReaddir.mockResolvedValue([fileEntry('.DS_Store'), dirEntry('System Volume Information')]) // all junk
		await runner.handleNewMount(MOUNT)
		await runner.onIdle()

		expect(files.copy).not.toHaveBeenCalled()
		expect(notifications.add).not.toHaveBeenCalled()
		expect(ruleById(getRules(), 'rule-1').lastRun).toBeUndefined()
	})
})
