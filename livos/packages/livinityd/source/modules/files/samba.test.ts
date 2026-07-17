import {describe, test, expect} from 'vitest'

import {
	sambaAccountName,
	resolveSambaShareAcls,
	renderShareBlock,
	renderRecycleStanza,
	DEFAULT_SMB_RECYCLE,
} from './samba.js'
import Files from './files.js'
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

	// 324-review WR-01: the per-user share must be READ-ONLY by default so a
	// read-level ACL principal (on valid users but NOT write list) genuinely cannot
	// write over SMB. `writeable = yes` / `read only = no` would make write list a
	// no-op and turn every read grant into a write grant.
	test('per-user block is read-only by default so read-grantees cannot write over SMB', () => {
		const block = renderShareBlock('Shared (Livinity)', '/data/shared', {
			validUsers: ['livos-alice', 'livos-bob'],
			writeList: ['livos-bob'],
		})
		expect(block).toContain('read only = yes')
		// A globally-writable share (writeable = yes / read only = no) would reduce
		// write list to a no-op — assert neither DIRECTIVE line is present (anchored
		// so the explanatory comments mentioning these tokens don't false-match).
		expect(block).not.toMatch(/^\s*writeable\s*=\s*yes/m)
		expect(block).not.toMatch(/^\s*read only\s*=\s*no/m)
		// alice has only a read grant → present on valid users, absent from write list.
		expect(block).toContain('valid users = livos-alice livos-bob')
		expect(block).not.toContain('write list = livos-alice')
	})

	test('legacy block (perUser=null) keeps the single shared account + force user = root', () => {
		const block = renderShareBlock('Shared (Livinity)', '/data/shared', null)
		expect(block).toContain('valid users = livinity')
		expect(block).toContain('force user = root')
	})

	// 324-review WR-02: a per-user share with zero applicable grants must NOT render
	// an empty `valid users =` (Samba would treat that as "allow any authenticated
	// account"). The block is skipped entirely so the share is unreachable, never
	// open-to-all.
	test('per-user block with no grants is skipped (fail-closed, not open-to-all)', () => {
		const block = renderShareBlock('Shared (Livinity)', '/data/shared', {
			validUsers: [],
			writeList: [],
		})
		expect(block).toBe('')
		// Defensively assert no empty valid-users directive leaks into smb.conf.
		expect(block).not.toMatch(/valid users\s*=\s*$/m)
	})
})

// Phase 338 (RECYCLE-01, D-338-1) — offline coverage for the vfs_recycle stanza + its
// wiring. The live SMB delete → .Recycle.Bin/livos-<user>/ behaviour stays HUMAN-UAT.
describe('renderRecycleStanza() / recycle wiring', () => {
	const perUser = {validUsers: ['livos-alice'], writeList: []}

	test('enabled per-user block appends the recycle stanza with the full vfs chain', () => {
		const block = renderShareBlock('S', '/p', {validUsers: ['livos-a'], writeList: []}, true)
		// The per-share `vfs objects` REPLACES the global chain, so it must re-list the
		// macOS-compat modules AND recycle (W7 — sourced from the shared SMB_VFS_CHAIN).
		expect(block).toContain('vfs objects = catia fruit streams_xattr recycle')
		expect(block).toContain('recycle:repository = .Recycle.Bin/%U')
		expect(block).toContain('hide files = /.Recycle.Bin/')
	})

	test('disabled per-user block is BYTE-IDENTICAL to today', () => {
		// Default param (recycle absent) === explicit false, and neither renders recycle.
		expect(renderShareBlock('S', '/p', perUser, false)).toBe(renderShareBlock('S', '/p', perUser))
		expect(renderShareBlock('S', '/p', perUser, false)).not.toContain('recycle:')
	})

	test('recycle exclude_dir contains the bin itself (no re-recycle loop)', () => {
		const block = renderShareBlock('S', '/p', perUser, true)
		const excludeDir = block.split('\n').find((line) => line.startsWith('recycle:exclude_dir'))
		expect(excludeDir).toContain('.Recycle.Bin//')
	})

	test('legacy block never carries recycle regardless of flag', () => {
		const block = renderShareBlock('S', '/p', null, true)
		expect(block).not.toContain('recycle:')
		expect(block).toContain('force user = root')
	})

	test('renderRecycleStanza(false) === empty string', () => {
		expect(renderRecycleStanza(false)).toBe('')
	})

	test('DEFAULT_SMB_RECYCLE is the documented default-ON policy', () => {
		expect(DEFAULT_SMB_RECYCLE).toEqual({enabled: true, purgeDays: 30})
	})
})

// Phase 338 (RECYCLE-01, D-338-3) — the SMB bin must be hidden from the web Files-app
// listing + basename search/recents via the shared isHidden() chokepoint.
describe('isHidden() — .Recycle.Bin (D-338-3)', () => {
	function makeFakeLivinityd() {
		return {
			logger: {createChildLogger: () => ({log() {}, error() {}, warn() {}})},
			dataDirectory: '/tmp/livos-test',
		} as any
	}

	test('.Recycle.Bin is in the default hiddenFiles list and isHidden() hides it', () => {
		const files = new Files(makeFakeLivinityd())
		expect(files.hiddenFiles).toContain('.Recycle.Bin')
		expect(files.isHidden('.Recycle.Bin')).toBe(true)
		// A normal dotfile is still shown (no general dot-prefix hide).
		expect(files.isHidden('.env')).toBe(false)
	})
})
