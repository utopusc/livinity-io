// Phase 28 Plan 28-01 — parseLogsParams unit tests.
//
// Locks down the URL parsing boundary so the WS handler stays a thin shell
// around `getDockerClient(envId).getContainer(name).logs(...)`. The
// surrounding handler is fired up against a real Docker socket — covered by
// manual + smoke verification, not unit tests; same rationale as Plan 24-02
// D-12 / Plan 25-01 Task 3 for layout files where heavy mocking obscures
// the assertion.

import {describe, expect, test} from 'vitest'

import createDockerLogsHandler, {parseLogsParams} from './docker-logs-socket.js'

describe('parseLogsParams', () => {
	test('A: ?container=foo&tail=200 → tail honoured, envId null', () => {
		expect(parseLogsParams('/ws/docker/logs?container=foo&tail=200')).toEqual({
			containerName: 'foo',
			tail: 200,
			envId: null,
		})
	})

	test('B: ?container=foo&envId=<uuid> → uuid preserved, default tail 500', () => {
		const out = parseLogsParams(
			'/ws/docker/logs?container=foo&envId=00000000-0000-0000-0000-000000000000',
		)
		expect(out).toEqual({
			containerName: 'foo',
			tail: 500,
			envId: '00000000-0000-0000-0000-000000000000',
		})
	})

	test("C: ?container=foo&envId=local → 'local' alias preserved (getDockerClient accepts alias)", () => {
		expect(parseLogsParams('/ws/docker/logs?container=foo&envId=local')).toEqual({
			containerName: 'foo',
			tail: 500,
			envId: 'local',
		})
	})

	test('D: empty envId= → treated as missing for back-compat', () => {
		expect(parseLogsParams('/ws/docker/logs?container=foo&envId=')).toEqual({
			containerName: 'foo',
			tail: 500,
			envId: null,
		})
	})

	test('E: missing container → containerName null (consumer rejects with 1008)', () => {
		expect(parseLogsParams('/ws/docker/logs?tail=10')).toEqual({
			containerName: null,
			tail: 10,
			envId: null,
		})
	})

	test('F: tail clamping — 99999 → 5000, -1 → 0, banana → 500 default', () => {
		expect(parseLogsParams('/ws/docker/logs?container=foo&tail=99999')).toMatchObject({
			tail: 5000,
		})
		expect(parseLogsParams('/ws/docker/logs?container=foo&tail=-1')).toMatchObject({
			tail: 0,
		})
		expect(parseLogsParams('/ws/docker/logs?container=foo&tail=banana')).toMatchObject({
			tail: 500,
		})
	})

	test('G: undefined / empty / weird URL still returns a defined shape (no throw)', () => {
		expect(parseLogsParams('')).toEqual({
			containerName: null,
			tail: 500,
			envId: null,
		})
		expect(parseLogsParams('/ws/docker/logs')).toEqual({
			containerName: null,
			tail: 500,
			envId: null,
		})
	})

	test('H: token query param is NOT surfaced (consumed by upgrade authn before handler runs)', () => {
		// Defensive: even if the URL contains token=..., parseLogsParams should
		// not return it. The shape is exactly {containerName, tail, envId} so
		// downstream consumers can't accidentally leak the JWT into a log.
		const out = parseLogsParams(
			'/ws/docker/logs?container=foo&envId=local&token=abc.def.ghi',
		)
		expect(Object.keys(out).sort()).toEqual(['containerName', 'envId', 'tail'])
	})
})

// ───────────────────────────────────────────────────────────────────────────
// Phase 263-03 (L-062) — RBAC gate at the docker-logs WS handler boundary.
//
// Mirrors the docker-exec gate: the generic WS upgrade gate does verifyToken
// ONLY — ANY valid token used to tail ANY container's logs. Pin the handler-
// boundary re-verify + admin-OR-owner gate: non-owner member → ws.close(4403);
// owner/admin/legacy proceed (asserted as the ABSENCE of a 4403 close).
// ───────────────────────────────────────────────────────────────────────────

interface FakeClose {
	code: number
	reason: string
}

function makeFakeWs() {
	const closes: FakeClose[] = []
	const ws = {
		OPEN: 1,
		readyState: 1,
		closes,
		close(code?: number, reason?: string) {
			closes.push({code: code ?? 1000, reason: reason ?? ''})
			ws.readyState = 3 // CLOSED
		},
		send() {},
		on() {},
		terminate() {},
		ping() {},
	}
	return ws
}

function fakeLivinityd(verifyResult: unknown) {
	return {
		server: {
			verifyToken: async (_token: string) => {
				if (verifyResult instanceof Error) throw verifyResult
				return verifyResult
			},
		},
	} as never
}

const silentLogger = {
	log() {},
	verbose() {},
	error() {},
	warn() {},
} as never

function makeRequest(url: string) {
	return {url} as never
}

const ADMIN = {id: 'admin-id', role: 'admin' as const}
const MEMBER = {id: 'member-id', role: 'member' as const}

describe('createDockerLogsHandler — RBAC gate (L-062)', () => {
	test('Test 6: member token, container NOT owned → ws.close(4403); no logs', async () => {
		let getClientCalled = false
		const handler = createDockerLogsHandler({
			livinityd: fakeLivinityd({userId: 'member-id'}),
			logger: silentLogger,
			findUserByIdFn: async () => MEMBER,
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => false,
			getDockerClientFn: async () => {
				getClientCalled = true
				throw new Error('should not reach docker')
			},
		})
		const ws = makeFakeWs()
		await handler(ws as never, makeRequest('/ws/docker/logs?container=other-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(true)
		expect(getClientCalled).toBe(false)
	})

	test('Test 7: member token, container OWNED → proceeds past gate (no 4403)', async () => {
		const handler = createDockerLogsHandler({
			livinityd: fakeLivinityd({userId: 'member-id'}),
			logger: silentLogger,
			findUserByIdFn: async () => MEMBER,
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => true,
			getDockerClientFn: async () => {
				throw new Error('docker-down')
			},
		})
		const ws = makeFakeWs()
		await handler(ws as never, makeRequest('/ws/docker/logs?container=my-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(false)
	})

	test('Test 8: admin token → proceeds for ANY container (ownership not consulted)', async () => {
		let ownershipConsulted = false
		const handler = createDockerLogsHandler({
			livinityd: fakeLivinityd({userId: 'admin-id'}),
			logger: silentLogger,
			findUserByIdFn: async () => ADMIN,
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => {
				ownershipConsulted = true
				return false
			},
			getDockerClientFn: async () => {
				throw new Error('docker-down')
			},
		})
		const ws = makeFakeWs()
		await handler(ws as never, makeRequest('/ws/docker/logs?container=anyones-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(false)
		expect(ownershipConsulted).toBe(false)
	})

	test('Test 9: no token / invalid token → ws.close(4403)', async () => {
		const handlerNoToken = createDockerLogsHandler({
			livinityd: fakeLivinityd({userId: 'member-id'}),
			logger: silentLogger,
			findUserByIdFn: async () => MEMBER,
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => false,
			getDockerClientFn: async () => {
				throw new Error('should not reach docker')
			},
		})
		const ws1 = makeFakeWs()
		await handlerNoToken(ws1 as never, makeRequest('/ws/docker/logs?container=app'))
		expect(ws1.closes.some((c) => c.code === 4403)).toBe(true)

		const handlerBadToken = createDockerLogsHandler({
			livinityd: fakeLivinityd(new Error('bad sig')),
			logger: silentLogger,
			findUserByIdFn: async () => MEMBER,
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => false,
			getDockerClientFn: async () => {
				throw new Error('should not reach docker')
			},
		})
		const ws2 = makeFakeWs()
		await handlerBadToken(ws2 as never, makeRequest('/ws/docker/logs?container=app&token=bad'))
		expect(ws2.closes.some((c) => c.code === 4403)).toBe(true)
	})

	test('Test 10: legacy {loggedIn:true} token → resolves to admin → proceeds', async () => {
		const handler = createDockerLogsHandler({
			livinityd: fakeLivinityd({loggedIn: true}),
			logger: silentLogger,
			findUserByIdFn: async (id: string) => (id === 'admin-id' ? ADMIN : null),
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => false,
			getDockerClientFn: async () => {
				throw new Error('docker-down')
			},
		})
		const ws = makeFakeWs()
		await handler(ws as never, makeRequest('/ws/docker/logs?container=any&token=legacy'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(false)
	})

	test('Test 11 (WR-02): deactivated owner (isActive:false) → ws.close(4403); no logs', async () => {
		// An owning-but-deactivated member must lose log access immediately.
		let getClientCalled = false
		const handler = createDockerLogsHandler({
			livinityd: fakeLivinityd({userId: 'member-id'}),
			logger: silentLogger,
			findUserByIdFn: async () => ({...MEMBER, isActive: false}),
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => true, // owns it, but inactive trumps
			getDockerClientFn: async () => {
				getClientCalled = true
				throw new Error('should not reach docker')
			},
		})
		const ws = makeFakeWs()
		await handler(ws as never, makeRequest('/ws/docker/logs?container=my-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(true)
		expect(getClientCalled).toBe(false)
	})
})
