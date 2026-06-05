/**
 * Phase 260.1-02 Task 2 (RED → GREEN) — `displays.close` mutation.
 *
 * SC-B: created displays currently cannot be closed — there is NO displays.close
 * route, so `:N` persists in Redis and re-appears in displays.list. This drives
 * the UNIMPLEMENTED close mutation:
 *
 *   - unknown display            → NOT_FOUND
 *   - no ctx.currentUser         → UNAUTHORIZED
 *   - non-admin, foreign owner   → FORBIDDEN (canAccessDisplay gate)
 *   - admin on owner_session=bruce → allowed (single-tenant operator bypass)
 *   - NATIVE display             → closeNativeAppByDisplay delegates teardown,
 *                                  then dm.kill({callerSession:''}) DELs the record
 *   - luse/computer-use display  → dm.kill({callerSession: record.owner_session})
 *   - kill not-found (already gone) → treated as success
 *
 * The native-routes closeNativeAppByDisplay is mocked so the test asserts the
 * dispatch (native vs luse) without spawning real X teardown.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest'

const closeNativeAppByDisplayMock = vi.fn((_display: string, _deps: unknown): Promise<boolean> => Promise.resolve(false))
vi.mock('../../apps/native-routes.js', () => ({
	closeNativeAppByDisplay: (display: string, deps: unknown) =>
		closeNativeAppByDisplayMock(display, deps),
}))

import {displaysRouter} from '../trpc-router.js'

/** Resolve the close procedure's resolver fn, or throw if unmounted. */
function getCloseResolver(): (opts: {ctx: unknown; input: unknown}) => Promise<unknown> {
	const procs = (displaysRouter as unknown as {_def: {procedures: Record<string, unknown>}})._def
		.procedures
	const proc = procs.close as
		| {_def?: {resolver?: (opts: {ctx: unknown; input: unknown}) => Promise<unknown>}}
		| undefined
	if (!proc || typeof proc._def?.resolver !== 'function') {
		throw new Error('displays.close procedure is not mounted on displaysRouter')
	}
	return proc._def.resolver
}

function makeDm(records: Array<{display: string; owner_session: string}>, killResult: unknown = {ok: true, killed_apps_count: 0}) {
	return {
		list: vi.fn().mockResolvedValue(records),
		kill: vi.fn().mockResolvedValue(killResult),
	}
}

function makeCtx(over: Record<string, unknown> = {}): {ctx: unknown; dm: ReturnType<typeof makeDm>} {
	const dm =
		(over.__dm as ReturnType<typeof makeDm>) ??
		makeDm([{display: ':10', owner_session: 'bruce'}])
	const ctx = {
		currentUser: {id: 'admin-uuid', role: 'admin'},
		livinityd: {
			displayManager: dm,
			streamManager: {getPortAllocator: () => ({})},
		},
		logger: {log() {}, error() {}, verbose() {}},
		...over,
	}
	delete (ctx as Record<string, unknown>).__dm
	return {ctx, dm}
}

describe('displays.close — Phase 260.1-02', () => {
	let resolve: (opts: {ctx: unknown; input: unknown}) => Promise<unknown>

	beforeEach(() => {
		closeNativeAppByDisplayMock.mockReset()
		closeNativeAppByDisplayMock.mockResolvedValue(false)
		resolve = getCloseResolver()
	})

	it('no ctx.currentUser → UNAUTHORIZED', async () => {
		const {ctx} = makeCtx({currentUser: undefined})
		await expect(resolve({ctx, input: {display: ':10'}})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
		})
	})

	it('unknown display → NOT_FOUND', async () => {
		const {ctx} = makeCtx({__dm: makeDm([])})
		await expect(resolve({ctx, input: {display: ':99'}})).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
	})

	it('non-admin caller, foreign non-empty owner_session → FORBIDDEN', async () => {
		const {ctx} = makeCtx({
			currentUser: {id: 'someone-else', role: 'member'},
			__dm: makeDm([{display: ':10', owner_session: 'bruce'}]),
		})
		await expect(resolve({ctx, input: {display: ':10'}})).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
	})

	it('admin caller bypasses owner_session=bruce mismatch (luse branch)', async () => {
		const {ctx, dm} = makeCtx()
		const res = (await resolve({ctx, input: {display: ':10'}})) as {ok: boolean; kind: string}
		expect(res).toEqual({ok: true, kind: 'luse'})
		// luse branch kills with the record's OWN owner_session so the gate passes.
		expect(dm.kill).toHaveBeenCalledWith({display: ':10', callerSession: 'bruce'})
	})

	it('NATIVE display → delegates to closeNativeAppByDisplay then DELs via kill({callerSession:""})', async () => {
		closeNativeAppByDisplayMock.mockResolvedValue(true)
		const {ctx, dm} = makeCtx({__dm: makeDm([{display: ':12', owner_session: ''}])})
		const res = (await resolve({ctx, input: {display: ':12'}})) as {ok: boolean; kind: string}
		expect(res).toEqual({ok: true, kind: 'native'})
		expect(closeNativeAppByDisplayMock).toHaveBeenCalledWith(':12', expect.anything())
		expect(dm.kill).toHaveBeenCalledWith({display: ':12', callerSession: ''})
	})

	it('luse kill returning not-found (record already gone) → success', async () => {
		const dm = makeDm([{display: ':10', owner_session: 'bruce'}], {ok: false, error: 'not-found'})
		const {ctx} = makeCtx({__dm: dm})
		const res = (await resolve({ctx, input: {display: ':10'}})) as {ok: boolean; kind: string}
		expect(res).toEqual({ok: true, kind: 'luse'})
	})
})
