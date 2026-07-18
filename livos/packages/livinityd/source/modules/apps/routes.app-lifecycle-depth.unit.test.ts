// Phase 342 APPD-01/02 (W-1) — route-level WIRING test for the two admin mutations.
//
// Locks the wiring (not just the pure validator math): invoke the tRPC mutation
// handlers through a real caller and assert (a) an out-of-range cpuset and (b) a
// <30-min maintenance window both REJECT with a TRPCError BEFORE persist — the
// underlying apps.setResourceLimits / apps.setUpdateWindow is NEVER called.

import os from 'node:os'

import {describe, expect, test, vi, beforeEach, afterEach} from 'vitest'
import {TRPCError} from '@trpc/server'

import {apps as appsRouter} from './routes.js'
import {t} from '../server/trpc/trpc.js'

function makeCtx(appsStub: unknown) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'ws',
		currentUser: {id: 'user-A', username: 'alice', role: 'admin'},
		apps: appsStub,
		logger: {log: () => {}, verbose: () => {}, error: () => {}},
	} as never
}

describe('apps.setResourceLimits / apps.setUpdateWindow route wiring (342-01 W-1)', () => {
	beforeEach(() => {
		// Pin a small core count so an out-of-range cpuset is deterministic on any box.
		vi.spyOn(os, 'cpus').mockReturnValue(new Array(2).fill({}) as ReturnType<typeof os.cpus>)
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('out-of-range cpuset ("0-99" on a 2-core box) → BAD_REQUEST, setResourceLimits NOT called', async () => {
		const setResourceLimits = vi.fn().mockResolvedValue(true)
		const caller = t.createCallerFactory(appsRouter)(makeCtx({setResourceLimits}))

		await expect(caller.setResourceLimits({appId: 'gitea', cpuSet: '0-99'})).rejects.toBeInstanceOf(TRPCError)
		expect(setResourceLimits).not.toHaveBeenCalled()
	})

	test('<30-min window ("09:00"-"09:15") → BAD_REQUEST, setUpdateWindow NOT called', async () => {
		const setUpdateWindow = vi.fn().mockResolvedValue(true)
		const caller = t.createCallerFactory(appsRouter)(makeCtx({setUpdateWindow}))

		await expect(
			caller.setUpdateWindow({appId: 'gitea', window: {start: '09:00', end: '09:15'}}),
		).rejects.toBeInstanceOf(TRPCError)
		expect(setUpdateWindow).not.toHaveBeenCalled()
	})

	test('valid cpuset ("0-1" on a 2-core box) → delegates to setResourceLimits (persist path reached)', async () => {
		const setResourceLimits = vi.fn().mockResolvedValue(true)
		const caller = t.createCallerFactory(appsRouter)(makeCtx({setResourceLimits}))

		await caller.setResourceLimits({appId: 'gitea', cpuSet: '0-1'})
		expect(setResourceLimits).toHaveBeenCalledWith('gitea', {cpuLimit: undefined, memoryLimit: undefined, cpuSet: '0-1'})
	})

	test('valid window ("09:00"-"17:00") → delegates to setUpdateWindow (persist path reached)', async () => {
		const setUpdateWindow = vi.fn().mockResolvedValue(true)
		const caller = t.createCallerFactory(appsRouter)(makeCtx({setUpdateWindow}))

		await caller.setUpdateWindow({appId: 'gitea', window: {start: '09:00', end: '17:00'}})
		expect(setUpdateWindow).toHaveBeenCalledWith('gitea', {start: '09:00', end: '17:00'})
	})
})
