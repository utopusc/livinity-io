// Phase 28 Plan 28-01 — parseLogsParams unit tests.
//
// Locks down the URL parsing boundary so the WS handler stays a thin shell
// around `getDockerClient(envId).getContainer(name).logs(...)`. The
// surrounding handler is fired up against a real Docker socket — covered by
// manual + smoke verification, not unit tests; same rationale as Plan 24-02
// D-12 / Plan 25-01 Task 3 for layout files where heavy mocking obscures
// the assertion.

import {describe, expect, test} from 'vitest'

import {parseLogsParams} from './docker-logs-socket.js'

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
