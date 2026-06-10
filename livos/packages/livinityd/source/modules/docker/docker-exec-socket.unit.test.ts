// Phase 29 Plan 29-01 — parseExecParams unit tests.
//
// Locks down the URL parsing boundary for the env-aware exec WS handler. Pure
// helper extraction so the surrounding handler stays a thin shell around
// `getDockerClient(envId).getContainer(name).exec(...)`. Mirrors Plan 28-01
// docker-logs-socket.unit.test.ts pattern verbatim.
//
// Test cases A-J cover:
//   A: back-compat — no envId param → envId:null (Phase 17 ConsoleTab callers)
//   B: envId UUID → preserved verbatim
//   C: envId='local' alias → preserved (getDockerClient canonicalises)
//   D: empty envId= → null fallback (back-compat)
//   E: missing container → null (handler closes 1008)
//   F: default shell → 'bash' when missing
//   G: shell value preserved as-is — handler validates against ALLOWED_SHELLS
//   H: token query param NOT surfaced (security boundary — JWT consumed by
//      WS upgrade authn, not the handler)
//   I: weird URLs (empty, '/') → safe default shape, no throw
//   J: user param preserved when present

import {describe, expect, test} from 'vitest'

import createDockerExecHandler, {parseExecParams} from './docker-exec-socket.js'

describe('parseExecParams', () => {
	test('A: ?container=n8n&shell=bash → back-compat shape, envId null', () => {
		expect(parseExecParams('/ws/docker-exec?container=n8n&shell=bash')).toEqual({
			containerName: 'n8n',
			shell: 'bash',
			user: '',
			envId: null,
		})
	})

	test('B: ?container=app&shell=sh&envId=<uuid> → uuid preserved', () => {
		expect(
			parseExecParams(
				'/ws/docker-exec?container=app&shell=sh&envId=00000000-0000-0000-0000-000000000000',
			),
		).toEqual({
			containerName: 'app',
			shell: 'sh',
			user: '',
			envId: '00000000-0000-0000-0000-000000000000',
		})
	})

	test("C: ?container=app&envId=local → 'local' alias preserved (getDockerClient canonicalises)", () => {
		expect(parseExecParams('/ws/docker-exec?container=app&envId=local')).toEqual({
			containerName: 'app',
			shell: 'bash',
			user: '',
			envId: 'local',
		})
	})

	test('D: empty envId= → treated as missing for back-compat', () => {
		expect(parseExecParams('/ws/docker-exec?container=app&envId=')).toEqual({
			containerName: 'app',
			shell: 'bash',
			user: '',
			envId: null,
		})
	})

	test('E: missing container → containerName null (consumer rejects with 1008)', () => {
		expect(parseExecParams('/ws/docker-exec?shell=bash')).toEqual({
			containerName: null,
			shell: 'bash',
			user: '',
			envId: null,
		})
	})

	test("F: shell defaults to 'bash' when omitted", () => {
		expect(parseExecParams('/ws/docker-exec?container=app')).toMatchObject({
			containerName: 'app',
			shell: 'bash',
		})
	})

	test('G: parser preserves shell value verbatim — handler validates against ALLOWED_SHELLS', () => {
		// parseExecParams is dumb-and-pure; it does NOT validate. The handler
		// rejects unknown shells with ws.close(1008). This test pins the
		// boundary so future refactors don't accidentally move validation.
		expect(parseExecParams('/ws/docker-exec?container=app&shell=zsh')).toMatchObject({
			containerName: 'app',
			shell: 'zsh',
		})
	})

	test('H: token query param is NOT surfaced (consumed by upgrade authn before handler runs)', () => {
		const out = parseExecParams(
			'/ws/docker-exec?container=app&shell=bash&envId=local&token=secret-jwt.payload.sig',
		)
		// Defensive shape pin — exact key set, no token leakage path.
		expect(Object.keys(out).sort()).toEqual(['containerName', 'envId', 'shell', 'user'])
	})

	test('I: empty / weird URL still returns a defined shape (no throw)', () => {
		expect(parseExecParams('')).toEqual({
			containerName: null,
			shell: 'bash',
			user: '',
			envId: null,
		})
		expect(parseExecParams('/')).toEqual({
			containerName: null,
			shell: 'bash',
			user: '',
			envId: null,
		})
		expect(parseExecParams('/ws/docker-exec')).toEqual({
			containerName: null,
			shell: 'bash',
			user: '',
			envId: null,
		})
	})

	test("J: ?container=app&user=root → user:'root' preserved", () => {
		expect(parseExecParams('/ws/docker-exec?container=app&user=root')).toMatchObject({
			containerName: 'app',
			user: 'root',
		})
	})
})

// ───────────────────────────────────────────────────────────────────────────
// Phase 263-03 (L-062) — RBAC gate at the docker-exec WS handler boundary.
//
// The generic WS upgrade gate (index.ts) does verifyToken ONLY — no role, no
// ownership. ANY valid token used to reach `exec bash as root into ANY
// container`. These tests pin the handler-boundary re-verify + admin-OR-owner
// gate: non-owner member → ws.close(4403); owner/admin/legacy proceed.
//
// A "proceed" is asserted as the ABSENCE of a 4403 close (we do NOT wire a
// real Docker socket — getDockerClient will throw/hang past the gate, which is
// fine; we only care the gate did not 4403). We stub getDockerClient via a
// fake that rejects so the post-gate path errors out cleanly.
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

describe('createDockerExecHandler — RBAC gate (L-062)', () => {
	test('Test 1: member token, container NOT owned → ws.close(4403); no exec', async () => {
		let getClientCalled = false
		const handler = createDockerExecHandler({
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
		await handler(ws as never, makeRequest('/ws/docker-exec?container=other-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(true)
		expect(getClientCalled).toBe(false)
	})

	test('Test 2: member token, container OWNED → proceeds past gate (no 4403)', async () => {
		const handler = createDockerExecHandler({
			livinityd: fakeLivinityd({userId: 'member-id'}),
			logger: silentLogger,
			findUserByIdFn: async () => MEMBER,
			getAdminUserFn: async () => ADMIN,
			userOwnsContainerFn: async () => true,
			getDockerClientFn: async () => {
				throw new Error('docker-down') // past the gate; handler maps to 1011
			},
		})
		const ws = makeFakeWs()
		await handler(ws as never, makeRequest('/ws/docker-exec?container=my-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(false)
	})

	test('Test 3: admin token → proceeds for ANY container (ownership not consulted)', async () => {
		let ownershipConsulted = false
		const handler = createDockerExecHandler({
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
		await handler(ws as never, makeRequest('/ws/docker-exec?container=anyones-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(false)
		expect(ownershipConsulted).toBe(false)
	})

	test('Test 4: no token / invalid token → ws.close(4403)', async () => {
		const handlerNoToken = createDockerExecHandler({
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
		await handlerNoToken(ws1 as never, makeRequest('/ws/docker-exec?container=app'))
		expect(ws1.closes.some((c) => c.code === 4403)).toBe(true)

		// invalid token → verifyToken throws → 4403
		const handlerBadToken = createDockerExecHandler({
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
		await handlerBadToken(ws2 as never, makeRequest('/ws/docker-exec?container=app&token=bad'))
		expect(ws2.closes.some((c) => c.code === 4403)).toBe(true)
	})

	test('Test 5: legacy {loggedIn:true} token → resolves to admin → proceeds', async () => {
		const handler = createDockerExecHandler({
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
		await handler(ws as never, makeRequest('/ws/docker-exec?container=any&token=legacy'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(false)
	})

	test('Test 6 (WR-02): deactivated owner (isActive:false) → ws.close(4403); no exec', async () => {
		// A member who OWNS the container but has been deactivated must lose
		// access immediately — before the ownership branch, before any docker.
		let getClientCalled = false
		const handler = createDockerExecHandler({
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
		await handler(ws as never, makeRequest('/ws/docker-exec?container=my-app&token=t'))
		expect(ws.closes.some((c) => c.code === 4403)).toBe(true)
		expect(getClientCalled).toBe(false)
	})
})
