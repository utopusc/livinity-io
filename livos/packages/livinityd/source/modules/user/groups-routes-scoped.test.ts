/**
 * Phase 335 (ROLE-01, D-335-3) — groups.* scoped-delegation route tests.
 *
 * RBAC matrix on the swapped procedures:
 *   read-only-admin → list/listMembers YES; addMember/create NO
 *   share-admin     → list/listMembers YES (shared read surface) + addMember/
 *                     removeMember YES; create/rename/delete NO (topology
 *                     stays hard-admin)
 *   plain member    → everything FORBIDDEN
 *   admin           → everything (byte-identical to pre-335)
 */
import {describe, expect, test, vi, beforeEach} from 'vitest'
import {TRPCError} from '@trpc/server'

vi.mock('../database/index.js', () => ({getPool: vi.fn(() => ({}))}))
vi.mock('../database/groups.js', () => ({
	createGroup: vi.fn(),
	renameGroup: vi.fn(),
	deleteGroup: vi.fn(),
	listGroups: vi.fn().mockResolvedValue([]),
	addGroupMember: vi.fn(),
	removeGroupMember: vi.fn().mockResolvedValue(true),
	listGroupMembers: vi.fn().mockResolvedValue([]),
}))
vi.mock('../database/admin-grants.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../database/admin-grants.js')>()
	return {...actual, hasAdminScope: vi.fn(), isAppOperator: vi.fn()}
})

import {hasAdminScope} from '../database/admin-grants.js'
import {addGroupMember, createGroup} from '../database/groups.js'

import groupsRouter from './groups-routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(groupsRouter)
const GROUP = '22222222-2222-2222-2222-222222222222'
const USER = '33333333-3333-3333-3333-333333333333'

function makeCtx(role: 'admin' | 'member' = 'member') {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: {id: 'user-A', username: 'alice', role},
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

function holdScopes(...scopes: string[]) {
	vi.mocked(hasAdminScope).mockImplementation(async (_u, scope) => scopes.includes(scope))
}

beforeEach(() => {
	vi.mocked(hasAdminScope).mockReset()
	vi.mocked(addGroupMember).mockReset()
	vi.mocked(createGroup).mockReset()
})

describe('groups — Phase 335 scoped delegation matrix', () => {
	test('plain member: EVERYTHING denied', async () => {
		holdScopes(/* none */)
		const caller = createCaller(makeCtx())
		await expect(caller.list()).rejects.toBeInstanceOf(TRPCError)
		await expect(caller.listMembers({groupId: GROUP})).rejects.toBeInstanceOf(TRPCError)
		await expect(caller.addMember({groupId: GROUP, userId: USER})).rejects.toBeInstanceOf(TRPCError)
		expect(addGroupMember).not.toHaveBeenCalled()
	})

	test('read-only-admin: reads YES, membership mutation NO', async () => {
		holdScopes('read-only-admin')
		const caller = createCaller(makeCtx())
		await expect(caller.list()).resolves.toEqual([])
		await expect(caller.listMembers({groupId: GROUP})).resolves.toEqual([])
		await expect(caller.addMember({groupId: GROUP, userId: USER})).rejects.toMatchObject({code: 'FORBIDDEN'})
		expect(addGroupMember).not.toHaveBeenCalled()
	})

	test('share-admin: reads + membership YES; group topology NO', async () => {
		holdScopes('share-admin')
		const caller = createCaller(makeCtx())
		await expect(caller.list()).resolves.toEqual([])
		await expect(caller.addMember({groupId: GROUP, userId: USER})).resolves.toEqual({success: true})
		expect(addGroupMember).toHaveBeenCalledWith({groupId: GROUP, userId: USER, addedBy: 'user-A'})
		await expect(caller.removeMember({groupId: GROUP, userId: USER})).resolves.toEqual({success: true})
		// create/rename/delete stay hard adminProcedure — share-admin denied.
		await expect(caller.create({name: 'devs'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		expect(createGroup).not.toHaveBeenCalled()
	})

	test('admin: byte-identical (everything passes, no scope lookup needed)', async () => {
		vi.mocked(createGroup).mockResolvedValue({id: GROUP} as never)
		const caller = createCaller(makeCtx('admin'))
		await expect(caller.list()).resolves.toEqual([])
		await expect(caller.addMember({groupId: GROUP, userId: USER})).resolves.toEqual({success: true})
		await expect(caller.create({name: 'devs'})).resolves.toEqual({id: GROUP})
		expect(hasAdminScope).not.toHaveBeenCalled()
	})
})
