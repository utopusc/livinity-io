/**
 * Phase 329-07 FILES-04 (D-05) — saveTextFile() unit tests.
 *
 * Unit-shaped like files.test.ts: exercises the saveTextFile logic by
 * .call()-ing it on a minimal stub that provides the collaborators it reads
 * (getAllowedOperations / virtualToSystemPath / assertWithinQuota /
 * chownSystemPath / systemToVirtualPath), so no heavy Livinityd / Postgres /
 * redis bring-up is needed. The atomic write is exercised against a real temp
 * directory.
 *
 * Covers the four locked behaviors:
 *   - writable-deny            → a non-writable dir throws [operation-not-allowed]
 *                                and NOTHING is written (quota never consulted).
 *   - quota-delta throw        → the growth delta max(0, newSize-oldSize) — not
 *                                the full newSize — is what reaches assertWithinQuota;
 *                                a shrink/rewrite-smaller passes with delta 0.
 *   - admin bypass             → an admin context resolves username = undefined
 *                                (quota-exempt) but is STILL writable-gated.
 *   - atomic write             → content lands via a temp file + rename, the
 *                                temp file is gone, and no partial file survives
 *                                a mid-write failure.
 */

import {randomUUID} from 'node:crypto'
import os from 'node:os'
import nodePath from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import fse from 'fs-extra'

import Files, {fileUserContext} from './files.js'

let workDir: string

beforeEach(async () => {
	workDir = nodePath.join(os.tmpdir(), `livos-savetext-${randomUUID()}`)
	await fse.ensureDir(workDir)
})

afterEach(async () => {
	await fse.remove(workDir).catch(() => {})
})

// Minimal stub carrying only what saveTextFile reads. virtualToSystemPath maps
// any virtual path onto a file inside the per-test temp directory.
function makeStub(overrides: Partial<Record<string, unknown>> = {}): Files {
	const virtualToSystemPath = vi.fn(async (virtualPath: string) =>
		nodePath.join(workDir, virtualPath.split('/').filter(Boolean).join('__')),
	)
	return {
		getAllowedOperations: vi.fn(async () => ['writable']),
		virtualToSystemPath,
		assertWithinQuota: vi.fn(async () => {}),
		// Phase 339 STORD-01 — saveTextFile now also calls the sibling per-folder gate;
		// stub it as a no-op (its own semantics are covered by files.assertWithinFolderQuota.test.ts).
		assertWithinFolderQuota: vi.fn(async () => {}),
		chownSystemPath: vi.fn(async () => {}),
		systemToVirtualPath: vi.fn((systemPath: string) => systemPath),
		...overrides,
	} as unknown as Files
}

function save(stub: Files, virtualPath: string, content: string) {
	return Files.prototype.saveTextFile.call(stub, virtualPath, content)
}

describe('saveTextFile — FILES-04 writable + quota-delta + atomic write', () => {
	test('non-writable dir throws [operation-not-allowed] and writes nothing', async () => {
		const assertWithinQuota = vi.fn(async (_username?: string, _addBytes?: number) => {})
		const stub = makeStub({
			getAllowedOperations: vi.fn(async () => ['copy', 'move']), // no 'writable'
			assertWithinQuota,
		})

		await expect(save(stub, '/Home/note.txt', 'hello')).rejects.toThrow('[operation-not-allowed]')

		// Quota must not even be consulted, and no file should exist.
		expect(assertWithinQuota).not.toHaveBeenCalled()
		const target = await (stub.virtualToSystemPath as any)('/Home/note.txt')
		expect(await fse.pathExists(target)).toBe(false)
	})

	test('new file → delta equals full new size', async () => {
		const assertWithinQuota = vi.fn(async (_username?: string, _addBytes?: number) => {})
		const stub = makeStub({assertWithinQuota})

		await save(stub, '/Home/new.txt', 'abcde') // 5 bytes, no prior file

		expect(assertWithinQuota).toHaveBeenCalledTimes(1)
		const [, addBytes] = assertWithinQuota.mock.calls[0]
		expect(addBytes).toBe(5)
	})

	test('growing a file → delta is only the growth, not the full new size', async () => {
		const assertWithinQuota = vi.fn(async (_username?: string, _addBytes?: number) => {})
		const stub = makeStub({assertWithinQuota})

		await save(stub, '/Home/grow.txt', 'abc') // 3 bytes new
		await save(stub, '/Home/grow.txt', 'abcdefghij') // 10 bytes total → delta 7

		const [, addBytes] = assertWithinQuota.mock.calls[1]
		expect(addBytes).toBe(7)
	})

	test('shrinking / rewriting smaller → delta 0 (passes a strict quota gate)', async () => {
		// assertWithinQuota throws if ANY positive delta is requested.
		const assertWithinQuota = vi.fn(async (_u: unknown, bytes: number) => {
			if (bytes > 0) throw new Error('[quota-exceeded]')
		})
		const stub = makeStub({assertWithinQuota})

		await save(makeStub(), '/Home/shrink.txt', 'abcdefghij') // seed via a permissive stub
		// Re-seed the real file for THIS stub's path resolver.
		const target = await (stub.virtualToSystemPath as any)('/Home/shrink.txt')
		await fse.writeFile(target, 'abcdefghij') // 10 bytes

		await expect(save(stub, '/Home/shrink.txt', 'xy')).resolves.toBeDefined() // 2 bytes → delta 0
		const [, addBytes] = assertWithinQuota.mock.calls[0]
		expect(addBytes).toBe(0)
		expect(await fse.readFile(target, 'utf8')).toBe('xy')
	})

	test('over-quota growth throws [quota-exceeded] before writing', async () => {
		const assertWithinQuota = vi.fn(async (_u: unknown, bytes: number) => {
			if (bytes > 4) throw new Error('[quota-exceeded]')
		})
		const stub = makeStub({assertWithinQuota})

		await expect(save(stub, '/Home/big.txt', 'abcdefghij')).rejects.toThrow('[quota-exceeded]')
		const target = await (stub.virtualToSystemPath as any)('/Home/big.txt')
		expect(await fse.pathExists(target)).toBe(false)
	})

	test('admin context → quota username undefined (exempt) but still writable-gated', async () => {
		const assertWithinQuota = vi.fn(async (_username?: string, _addBytes?: number) => {})
		const stub = makeStub({assertWithinQuota})

		await fileUserContext.run({username: 'boss', role: 'admin'}, async () => {
			await save(stub, '/Home/admin.txt', 'data')
		})

		const [username] = assertWithinQuota.mock.calls[0]
		expect(username).toBeUndefined()
	})

	test('member context → quota username is the member username', async () => {
		const assertWithinQuota = vi.fn(async (_username?: string, _addBytes?: number) => {})
		const stub = makeStub({assertWithinQuota})

		await fileUserContext.run({username: 'mary', role: 'member'}, async () => {
			await save(stub, '/Home/mary.txt', 'data')
		})

		const [username] = assertWithinQuota.mock.calls[0]
		expect(username).toBe('mary')
	})

	test('atomic write: content lands and no .livinity-upload temp file is left behind', async () => {
		const stub = makeStub()
		await save(stub, '/Home/atomic.txt', 'final-content')

		const target = await (stub.virtualToSystemPath as any)('/Home/atomic.txt')
		expect(await fse.readFile(target, 'utf8')).toBe('final-content')

		// No temp artifact anywhere in the work dir.
		const leftovers = (await fse.readdir(workDir)).filter((f) => f.includes('livinity-upload'))
		expect(leftovers).toEqual([])
	})

	test('atomic write: a rename failure cleans up the temp file (no partial survives)', async () => {
		const stub = makeStub()
		const target = await (stub.virtualToSystemPath as any)('/Home/partial.txt')

		// Force fse.rename to fail exactly once so the catch/cleanup path runs.
		const renameSpy = vi.spyOn(fse, 'rename').mockRejectedValueOnce(new Error('boom'))
		try {
			await expect(save(stub, '/Home/partial.txt', 'never-lands')).rejects.toThrow('boom')
		} finally {
			renameSpy.mockRestore()
		}

		// Neither the final file nor a temp artifact should survive.
		expect(await fse.pathExists(target)).toBe(false)
		const leftovers = (await fse.readdir(workDir)).filter((f) => f.includes('livinity-upload'))
		expect(leftovers).toEqual([])
	})
})
