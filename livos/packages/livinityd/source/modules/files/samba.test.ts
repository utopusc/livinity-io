import {describe, test, expect} from 'vitest'

import {sambaAccountName, resolveSambaShareAcls, renderShareBlock} from './samba.js'
import type {FileAclRow} from './file-acls.js'

// Phase 324-04 (FILES-02, D-09) — unit coverage for the render-time per-user
// Samba config derivation. These are OFFLINE tests of the PURE helpers (no live
// smbd / systemctl / PG) — the live per-user mount + smbpasswd provisioning stays
// STRICT HUMAN-UAT (324-HUMAN-UAT.md).

function acl(partial: Partial<FileAclRow>): FileAclRow {
	return {
		virtual_path: '/Home/Shared',
		principal_type: 'user',
		principal_id: 'id',
		level: 'read',
		granted_by: null,
		created_at: '2026-07-15T00:00:00Z',
		...partial,
	}
}

describe('sambaAccountName()', () => {
	test('namespaces the login username under the livos- synthetic-account prefix', () => {
		expect(sambaAccountName('alice')).toBe('livos-alice')
	})
})

describe('resolveSambaShareAcls()', () => {
	const resolvers = {
		resolveUsername: async (id: string) =>
			({'u-alice': 'alice', 'u-bob': 'bob', 'u-carol': 'carol'}[id] ?? null),
		resolveGroupMembers: async (id: string) => ({'g-team': ['bob', 'carol']}[id] ?? []),
	}

	test('a user read grant lands on valid users but NOT write list', async () => {
		const {validUsers, writeList} = await resolveSambaShareAcls(
			[acl({principal_type: 'user', principal_id: 'u-alice', level: 'read'})],
			resolvers,
		)
		expect(validUsers).toEqual(['livos-alice'])
		expect(writeList).toEqual([])
	})

	test('a user write grant lands on BOTH valid users and write list', async () => {
		const {validUsers, writeList} = await resolveSambaShareAcls(
			[acl({principal_type: 'user', principal_id: 'u-bob', level: 'write'})],
			resolvers,
		)
		expect(validUsers).toEqual(['livos-bob'])
		expect(writeList).toEqual(['livos-bob'])
	})

	test('a group write grant expands to every member on valid users + write list', async () => {
		const {validUsers, writeList} = await resolveSambaShareAcls(
			[acl({principal_type: 'group', principal_id: 'g-team', level: 'write'})],
			resolvers,
		)
		expect(validUsers.sort()).toEqual(['livos-bob', 'livos-carol'])
		expect(writeList.sort()).toEqual(['livos-bob', 'livos-carol'])
	})

	test('a none-level grant is excluded from both lists (no valid-users entry)', async () => {
		const {validUsers, writeList} = await resolveSambaShareAcls(
			[acl({principal_type: 'user', principal_id: 'u-alice', level: 'none'})],
			resolvers,
		)
		expect(validUsers).toEqual([])
		expect(writeList).toEqual([])
	})

	test('a user with both read + a group write dedupes on valid users, present once on write list', async () => {
		const {validUsers, writeList} = await resolveSambaShareAcls(
			[
				acl({principal_type: 'user', principal_id: 'u-bob', level: 'read'}),
				acl({principal_type: 'group', principal_id: 'g-team', level: 'write'}),
			],
			resolvers,
		)
		expect(validUsers.sort()).toEqual(['livos-bob', 'livos-carol'])
		expect(writeList.sort()).toEqual(['livos-bob', 'livos-carol'])
		// bob resolved by two rules but appears once
		expect(validUsers.filter((u) => u === 'livos-bob')).toHaveLength(1)
	})
})

describe('renderShareBlock()', () => {
	test('per-user block renders literal valid users + write list and DROPS force user = root', () => {
		const block = renderShareBlock('Shared (Livinity)', '/data/shared', {
			validUsers: ['livos-alice', 'livos-bob'],
			writeList: ['livos-bob'],
		})
		expect(block).toContain('valid users = livos-alice livos-bob')
		expect(block).toContain('write list = livos-bob')
		expect(block).not.toContain('force user = root')
	})

	test('legacy block (perUser=null) keeps the single shared account + force user = root', () => {
		const block = renderShareBlock('Shared (Livinity)', '/data/shared', null)
		expect(block).toContain('valid users = livinity')
		expect(block).toContain('force user = root')
	})
})
