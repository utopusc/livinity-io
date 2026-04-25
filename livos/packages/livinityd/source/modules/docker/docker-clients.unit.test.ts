// Phase 22 MH-02 — Dockerode factory unit tests
//
// Mocks ./environments.js so the factory can be exercised without a real PG.

import {beforeEach, describe, expect, test, vi} from 'vitest'

vi.mock('./environments.js', async () => {
	const actual = await vi.importActual<typeof import('./environments.js')>('./environments.js')
	return {
		...actual,
		getEnvironment: vi.fn(),
	}
})

import {getEnvironment, LOCAL_ENV_ID, type Environment} from './environments.js'
import {clearAllClients, getDockerClient, invalidateClient} from './docker-clients.js'

const mockedGetEnvironment = vi.mocked(getEnvironment)

const localEnv: Environment = {
	id: LOCAL_ENV_ID,
	name: 'local',
	type: 'socket',
	socketPath: '/var/run/docker.sock',
	tcpHost: null,
	tcpPort: null,
	tlsCaPem: null,
	tlsCertPem: null,
	tlsKeyPem: null,
	agentId: null,
	agentStatus: 'offline',
	lastSeen: null,
	createdBy: null,
	createdAt: new Date('2026-04-24T00:00:00Z'),
}

const tcpEnv: Environment = {
	id: '11111111-2222-3333-4444-555555555555',
	name: 'remote-1',
	type: 'tcp-tls',
	socketPath: null,
	tcpHost: '10.0.0.5',
	tcpPort: 2376,
	tlsCaPem: '-----BEGIN CERT-----\nfake\n-----END CERT-----',
	tlsCertPem: '-----BEGIN CERT-----\nfake\n-----END CERT-----',
	tlsKeyPem: '-----BEGIN KEY-----\nfake\n-----END KEY-----',
	agentId: null,
	agentStatus: 'offline',
	lastSeen: null,
	createdBy: null,
	createdAt: new Date('2026-04-25T00:00:00Z'),
}

const agentEnv: Environment = {
	id: '99999999-1111-2222-3333-444444444444',
	name: 'agent-1',
	type: 'agent',
	socketPath: null,
	tcpHost: null,
	tcpPort: null,
	tlsCaPem: null,
	tlsCertPem: null,
	tlsKeyPem: null,
	agentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	agentStatus: 'offline',
	lastSeen: null,
	createdBy: null,
	createdAt: new Date('2026-04-26T00:00:00Z'),
}

beforeEach(() => {
	clearAllClients()
	mockedGetEnvironment.mockReset()
})

describe('getDockerClient', () => {
	test('null returns a Dockerode configured with /var/run/docker.sock', async () => {
		mockedGetEnvironment.mockResolvedValue(localEnv)

		const client = await getDockerClient(null)

		expect(client).toBeDefined()
		// dockerode stores the modem opts internally; we confirm the modem socketPath
		expect((client as any).modem.socketPath).toBe('/var/run/docker.sock')
	})

	test('LOCAL_ENV_ID returns the same cached instance as the null alias', async () => {
		mockedGetEnvironment.mockResolvedValue(localEnv)

		const a = await getDockerClient(null)
		const b = await getDockerClient(LOCAL_ENV_ID)

		expect(a).toBe(b)
	})

	test('tcp-tls env returns a Dockerode with host/port/https', async () => {
		mockedGetEnvironment.mockResolvedValue(tcpEnv)

		const client = await getDockerClient(tcpEnv.id)

		expect((client as any).modem.host).toBe('10.0.0.5')
		expect((client as any).modem.port).toBe(2376)
		expect((client as any).modem.protocol).toBe('https')
	})

	test('unknown env id throws [env-not-found]', async () => {
		mockedGetEnvironment.mockResolvedValue(null)

		await expect(
			getDockerClient('00000000-0000-0000-0000-000000000999'),
		).rejects.toThrow(/\[env-not-found\]/)
	})

	test('agent env throws [agent-not-implemented] (Plan 22-03 placeholder)', async () => {
		mockedGetEnvironment.mockResolvedValue(agentEnv)

		await expect(getDockerClient(agentEnv.id)).rejects.toThrow(/\[agent-not-implemented\]/)
	})

	test('tcp-tls env with missing TLS fields throws [env-misconfigured]', async () => {
		const bad: Environment = {...tcpEnv, tlsCaPem: null}
		mockedGetEnvironment.mockResolvedValue(bad)

		await expect(getDockerClient(bad.id)).rejects.toThrow(/\[env-misconfigured\]/)
	})
})

describe('invalidateClient', () => {
	test('removes cached entry so next call rebuilds', async () => {
		mockedGetEnvironment.mockResolvedValue(localEnv)

		const a = await getDockerClient(null)
		invalidateClient(LOCAL_ENV_ID)
		const b = await getDockerClient(null)

		expect(a).not.toBe(b)
	})
})

describe('clearAllClients', () => {
	test('drops all cached entries', async () => {
		mockedGetEnvironment.mockResolvedValue(localEnv)

		const a = await getDockerClient(null)
		clearAllClients()
		const b = await getDockerClient(null)

		expect(a).not.toBe(b)
	})
})
