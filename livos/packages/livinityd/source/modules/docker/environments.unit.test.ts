// Phase 22 MH-01 — environments PG CRUD unit tests
//
// Mocks the `getPool()` helper from database/index.js so these tests run
// without a live PostgreSQL instance. Pool.query is replaced with an in-memory
// fake that records calls and returns canned rows.

import {describe, beforeEach, expect, test, vi} from 'vitest'

vi.mock('../database/index.js', () => {
	const fake = {query: vi.fn()}
	return {
		getPool: () => fake,
		__fakePool: fake,
	}
})

import * as dbMod from '../database/index.js'
import {
	LOCAL_ENV_ID,
	createEnvironment,
	deleteEnvironment,
	getEnvironment,
	listEnvironments,
	seedLocalEnvironment,
	updateEnvironment,
} from './environments.js'

const fakePool = (dbMod as unknown as {__fakePool: {query: ReturnType<typeof vi.fn>}}).__fakePool

const localRow = {
	id: LOCAL_ENV_ID,
	name: 'local',
	type: 'socket',
	socket_path: '/var/run/docker.sock',
	tcp_host: null,
	tcp_port: null,
	tls_ca_pem: null,
	tls_cert_pem: null,
	tls_key_pem: null,
	agent_id: null,
	agent_status: 'offline',
	last_seen: null,
	created_by: null,
	created_at: new Date('2026-04-24T00:00:00Z'),
}

const tcpRow = {
	id: '11111111-2222-3333-4444-555555555555',
	name: 'remote-1',
	type: 'tcp-tls',
	socket_path: null,
	tcp_host: '10.0.0.5',
	tcp_port: 2376,
	tls_ca_pem: '-----BEGIN CERT-----\nfake\n-----END CERT-----',
	tls_cert_pem: '-----BEGIN CERT-----\nfake\n-----END CERT-----',
	tls_key_pem: '-----BEGIN KEY-----\nfake\n-----END KEY-----',
	agent_id: null,
	agent_status: 'offline',
	last_seen: null,
	created_by: null,
	created_at: new Date('2026-04-25T00:00:00Z'),
}

beforeEach(() => {
	fakePool.query.mockReset()
})

describe('seedLocalEnvironment', () => {
	test('issues an idempotent INSERT … ON CONFLICT (name) DO NOTHING', async () => {
		fakePool.query.mockResolvedValue({rows: [], rowCount: 0})
		await seedLocalEnvironment()

		expect(fakePool.query).toHaveBeenCalledTimes(1)
		const sql = fakePool.query.mock.calls[0][0] as string
		expect(sql).toContain('INSERT INTO environments')
		expect(sql).toContain('ON CONFLICT (name) DO NOTHING')

		const params = fakePool.query.mock.calls[0][1] as any[]
		expect(params[0]).toBe(LOCAL_ENV_ID)
		expect(params[1]).toBe('local')
	})

	test('two consecutive seeds use the same idempotent statement (DB-side dedup)', async () => {
		fakePool.query.mockResolvedValue({rows: [], rowCount: 0})
		await seedLocalEnvironment()
		await seedLocalEnvironment()

		expect(fakePool.query).toHaveBeenCalledTimes(2)
		const sql1 = fakePool.query.mock.calls[0][0] as string
		const sql2 = fakePool.query.mock.calls[1][0] as string
		expect(sql1).toBe(sql2)
	})
})

describe('createEnvironment', () => {
	test('creates a tcp-tls environment with all required connection fields', async () => {
		fakePool.query.mockResolvedValue({rows: [tcpRow]})

		const result = await createEnvironment(
			{
				name: 'remote-1',
				type: 'tcp-tls',
				tcpHost: '10.0.0.5',
				tcpPort: 2376,
				tlsCaPem: tcpRow.tls_ca_pem,
				tlsCertPem: tcpRow.tls_cert_pem,
				tlsKeyPem: tcpRow.tls_key_pem,
			},
			null,
		)

		expect(result.id).toBe(tcpRow.id)
		expect(result.type).toBe('tcp-tls')
		expect(result.tcpHost).toBe('10.0.0.5')
		expect(result.tcpPort).toBe(2376)
	})

	test('creates an agent environment with agent_status default offline', async () => {
		const agentRow = {
			...localRow,
			id: '99999999-1111-2222-3333-444444444444',
			name: 'agent-1',
			type: 'agent',
			socket_path: null,
			agent_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
			agent_status: 'offline',
			last_seen: null,
		}
		fakePool.query.mockResolvedValue({rows: [agentRow]})

		const result = await createEnvironment(
			{
				name: 'agent-1',
				type: 'agent',
				agentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
			},
			null,
		)

		expect(result.type).toBe('agent')
		expect(result.agentStatus).toBe('offline')
		expect(result.lastSeen).toBeNull()
	})

	test('throws [validation-error] when type=tcp-tls is missing TLS fields', async () => {
		await expect(
			createEnvironment({name: 'bad', type: 'tcp-tls', tcpHost: '10.0.0.5'} as any, null),
		).rejects.toThrow(/\[validation-error\]/)
	})

	test('throws [validation-error] when type=socket is missing socketPath', async () => {
		await expect(
			createEnvironment({name: 'bad', type: 'socket'} as any, null),
		).rejects.toThrow(/\[validation-error\]/)
	})

	test('throws [validation-error] when type=agent is missing agentId', async () => {
		await expect(
			createEnvironment({name: 'bad', type: 'agent'} as any, null),
		).rejects.toThrow(/\[validation-error\]/)
	})
})

describe('getEnvironment alias resolution', () => {
	test('null resolves to LOCAL_ENV_ID', async () => {
		fakePool.query.mockResolvedValue({rows: [localRow]})

		const result = await getEnvironment(null)

		expect(result).not.toBeNull()
		expect(result!.name).toBe('local')
		const params = fakePool.query.mock.calls[0][1] as any[]
		expect(params[0]).toBe(LOCAL_ENV_ID)
	})

	test('undefined resolves to LOCAL_ENV_ID', async () => {
		fakePool.query.mockResolvedValue({rows: [localRow]})

		await getEnvironment(undefined)

		const params = fakePool.query.mock.calls[0][1] as any[]
		expect(params[0]).toBe(LOCAL_ENV_ID)
	})

	test("'local' alias resolves to LOCAL_ENV_ID", async () => {
		fakePool.query.mockResolvedValue({rows: [localRow]})

		await getEnvironment('local')

		const params = fakePool.query.mock.calls[0][1] as any[]
		expect(params[0]).toBe(LOCAL_ENV_ID)
	})

	test('UUID is passed through unchanged', async () => {
		fakePool.query.mockResolvedValue({rows: [tcpRow]})

		await getEnvironment(tcpRow.id)

		const params = fakePool.query.mock.calls[0][1] as any[]
		expect(params[0]).toBe(tcpRow.id)
	})

	test('returns null (not throws) when not found', async () => {
		fakePool.query.mockResolvedValue({rows: []})

		const result = await getEnvironment('00000000-0000-0000-0000-000000000999')

		expect(result).toBeNull()
	})
})

describe('listEnvironments', () => {
	test("orders local first, then by created_at ASC", async () => {
		fakePool.query.mockResolvedValue({rows: [localRow, tcpRow]})

		const result = await listEnvironments()

		expect(result.length).toBe(2)
		expect(result[0].name).toBe('local')
		const sql = fakePool.query.mock.calls[0][0] as string
		expect(sql).toContain("(name = 'local') DESC")
		expect(sql).toContain('created_at ASC')
	})
})

describe('deleteEnvironment', () => {
	test('throws [cannot-delete-local] when id is LOCAL_ENV_ID', async () => {
		await expect(deleteEnvironment(LOCAL_ENV_ID)).rejects.toThrow(/\[cannot-delete-local\]/)
		expect(fakePool.query).not.toHaveBeenCalled()
	})

	test('throws [not-found] when no row matches', async () => {
		fakePool.query.mockResolvedValue({rowCount: 0})
		await expect(
			deleteEnvironment('11111111-2222-3333-4444-555555555555'),
		).rejects.toThrow(/\[not-found\]/)
	})

	test('succeeds for a non-local environment', async () => {
		fakePool.query.mockResolvedValue({rowCount: 1})
		await expect(
			deleteEnvironment('11111111-2222-3333-4444-555555555555'),
		).resolves.toBeUndefined()
	})
})

describe('updateEnvironment', () => {
	test('throws [cannot-modify-local] when id is LOCAL_ENV_ID', async () => {
		await expect(
			updateEnvironment(LOCAL_ENV_ID, {name: 'renamed'}, null),
		).rejects.toThrow(/\[cannot-modify-local\]/)
	})

	test('updates a tcp-tls environment partial fields', async () => {
		fakePool.query.mockResolvedValue({rows: [{...tcpRow, tcp_host: '10.0.0.99'}]})

		const result = await updateEnvironment(tcpRow.id, {tcpHost: '10.0.0.99'}, null)

		expect(result.tcpHost).toBe('10.0.0.99')
	})

	test('throws [not-found] when no row matches', async () => {
		fakePool.query.mockResolvedValue({rows: []})

		await expect(
			updateEnvironment('11111111-2222-3333-4444-555555555555', {tcpHost: 'x'}, null),
		).rejects.toThrow(/\[not-found\]/)
	})
})
