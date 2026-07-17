/**
 * Phase 336 (ACLUI-01) — /Shared web enforcement through the REAL stack
 * (createTestLivinityd). With no grants seeded, every /Shared access must
 * FAIL-SAFE (empty root / [acl-denied]); own-tree ops must be byte-unchanged
 * (SC2 regression). The GRANTED happy path needs a live cross-user grant in
 * Postgres → covered by 336-HUMAN-UAT.md, not here.
 */
import {expect, beforeAll, afterAll, test} from 'vitest'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>

beforeAll(async () => {
	livinityd = await createTestLivinityd()
	await livinityd.registerAndLogin()
})

afterAll(async () => {
	await livinityd.cleanup()
})

test('/Shared root lists empty when the user has no grants (fail-safe, never throws)', async () => {
	const listing = await livinityd.client.files.list.query({path: '/Shared'})
	expect(listing.path).toBe('/Shared')
	expect(listing.type).toBe('directory')
	expect(listing.files).toEqual([])
})

test('a /Shared child path with NO grant is denied (never resolves to a system path)', async () => {
	await expect(livinityd.client.files.list.query({path: '/Shared/Home/anything'})).rejects.toThrow('[acl-denied]')
})

test('getAllowedOperations on an ungranted /Shared path is empty (no ops leak)', async () => {
	const ops = await livinityd.instance.files.getAllowedOperations('/Shared/Home/anything')
	expect(ops).toEqual([])
})

test('assertSharedWritable rejects an ungranted /Shared path (write-gate fail-safe)', async () => {
	await expect(livinityd.instance.files.assertSharedWritable('/Shared/Home/anything')).rejects.toThrow('[acl-denied]')
})

test('assertSharedWritable is a NO-OP for an own-tree path (zero regression)', async () => {
	// Own-tree paths never carry the /Shared prefix → the write-gate returns
	// without consulting the ACL layer (resolves undefined, does not throw).
	await expect(livinityd.instance.files.assertSharedWritable('/Home/whatever')).resolves.toBeUndefined()
})

test('SC2 own-tree regression — /Home still lists and stays writable', async () => {
	await expect(livinityd.client.files.list.query({path: '/Home'})).resolves.toMatchObject({path: '/Home'})
	const ops = await livinityd.instance.files.getAllowedOperations('/Home')
	expect(ops).toContain('writable')
})
