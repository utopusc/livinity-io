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

import {parseExecParams} from './docker-exec-socket.js'

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
