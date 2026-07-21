import {randomUUID} from 'node:crypto'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, expect, test} from 'vitest'

import FileStore from '../utilities/file-store.js'
import {VmRegistry, type VmInstanceRecord} from './vm-registry.js'

// A plain in-memory fake store — no real FileStore, no I/O. Only the accessors
// VmRegistry uses (`get`/`set`/`getWriteLock`) are implemented; cast to the
// FileStore type so the registry's constructor signature is satisfied. These
// single-flow tests never fire concurrent mutations, so an inline getWriteLock
// runner is faithful; the real PQueue serialization WR-02 depends on is
// exercised against a REAL FileStore in the concurrency test below.
function makeFakeStore() {
	return {
		_d: {} as Record<string, unknown>,
		async get(key: string) {
			return this._d[key]
		},
		async set(key: string, value: unknown) {
			this._d[key] = value
			return true
		},
		async getWriteLock(
			job: (m: {get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<unknown>}) => Promise<void>,
		) {
			return job({get: this.get.bind(this), set: this.set.bind(this)})
		},
	}
}

function makeStore() {
	return makeFakeStore() as unknown as FileStore<any>
}

function makeRecord(id: string, overrides: Partial<VmInstanceRecord> = {}): VmInstanceRecord {
	return {
		id,
		name: `vm ${id}`,
		kind: 'linux',
		resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
		lastIntent: 'stopped',
		dataDir: `/data/vm-data/${id}`,
		composePath: `/data/vm-data/${id}/docker-compose.yml`,
		containerName: `vm-${id}`,
		novncPort: 16100,
		createdAt: 1_700_000_000_000,
		...overrides,
	}
}

test('upsert then list returns exactly that record', async () => {
	const registry = new VmRegistry(makeStore())
	const rec = makeRecord('a')
	await registry.upsert(rec)
	const list = await registry.list()
	expect(list).toHaveLength(1)
	expect(list[0]).toEqual(rec)
})

test('list defaults to empty array when the key is unset', async () => {
	const registry = new VmRegistry(makeStore())
	expect(await registry.list()).toEqual([])
})

test('a second upsert with the same id replaces in place (length stays 1)', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a', {name: 'first'}))
	await registry.upsert(makeRecord('a', {name: 'second'}))
	const list = await registry.list()
	expect(list).toHaveLength(1)
	expect(list[0].name).toBe('second')
})

test('a different id appends (length 2)', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a'))
	await registry.upsert(makeRecord('b'))
	expect(await registry.list()).toHaveLength(2)
})

test('get returns the record for a known id and undefined for an unknown id', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a'))
	expect((await registry.get('a'))?.id).toBe('a')
	expect(await registry.get('missing')).toBeUndefined()
})

test('patch updates only the given field and leaves others intact', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a', {name: 'keep', novncPort: 16150}))
	await registry.patch('a', {lastError: 'boom'})
	const rec = await registry.get('a')
	expect(rec?.lastError).toBe('boom')
	expect(rec?.name).toBe('keep')
	expect(rec?.novncPort).toBe(16150)
})

test('patch of an unknown id is a no-op (does not throw, adds nothing)', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a'))
	await expect(registry.patch('missing', {lastError: 'x'})).resolves.toBeUndefined()
	expect(await registry.list()).toHaveLength(1)
})

test('delete removes only that record; list no longer contains it', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a'))
	await registry.upsert(makeRecord('b'))
	await registry.delete('a')
	const list = await registry.list()
	expect(list).toHaveLength(1)
	expect(list[0].id).toBe('b')
})

test('delete of an unknown id is a no-op (does not throw)', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a'))
	await expect(registry.delete('missing')).resolves.toBeUndefined()
	expect(await registry.list()).toHaveLength(1)
})

test('lastIntent can be patched (boot-reconciliation hint)', async () => {
	const registry = new VmRegistry(makeStore())
	await registry.upsert(makeRecord('a', {lastIntent: 'stopped'}))
	await registry.patch('a', {lastIntent: 'running'})
	expect((await registry.get('a'))?.lastIntent).toBe('running')
})

// ── WR-02 concurrency regression (against a REAL FileStore) ───────────────────
// The lost-update defect only manifests with the real FileStore's read-bypasses-
// the-write-queue model, so this test uses an on-disk FileStore (not the inline
// fake). Two concurrent upserts each did a read-modify-write; before the fix the
// second `set` clobbered the first and one record was lost, orphaning a
// privileged container. Routing through getWriteLock serializes them.
const tempFiles: string[] = []
afterEach(async () => {
	while (tempFiles.length > 0) {
		const dir = tempFiles.pop()!
		await rm(dir, {recursive: true, force: true})
	}
})

async function makeRealStore(): Promise<FileStore<any>> {
	const dir = await mkdtemp(join(tmpdir(), 'vm-registry-'))
	tempFiles.push(dir)
	return new FileStore<any>({filePath: join(dir, `store-${randomUUID()}.yml`)})
}

test('WR-02: two concurrent upserts both survive (no lost update) on a real FileStore', async () => {
	const registry = new VmRegistry(await makeRealStore())

	// Fire both without awaiting between them — they race on the shared array.
	await Promise.all([registry.upsert(makeRecord('A')), registry.upsert(makeRecord('B'))])

	const list = await registry.list()
	const ids = list.map((r) => r.id).sort()
	expect(ids).toEqual(['A', 'B'])
})

test('WR-02: a concurrent upsert + delete + patch storm keeps the store consistent', async () => {
	const registry = new VmRegistry(await makeRealStore())
	await registry.upsert(makeRecord('keep'))

	// Concurrent: add two, delete the pre-existing one, patch a fresh add.
	await Promise.all([
		registry.upsert(makeRecord('x')),
		registry.upsert(makeRecord('y')),
		registry.delete('keep'),
		registry.upsert(makeRecord('z')),
	])
	await registry.patch('x', {lastError: 'noted'})

	const list = await registry.list()
	const ids = list.map((r) => r.id).sort()
	expect(ids).toEqual(['x', 'y', 'z'])
	expect((await registry.get('x'))?.lastError).toBe('noted')
	expect(await registry.get('keep')).toBeUndefined()
})
