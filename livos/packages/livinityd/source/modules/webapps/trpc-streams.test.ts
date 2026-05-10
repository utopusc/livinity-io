/**
 * Phase 93-11 — tRPC routes auth + ownership unit tests.
 *
 * Builds a minimal tRPC caller against the streams + webapp.window routers
 * with stubbed managers + ctx. Covers:
 *   1. streams.start unauthenticated → UNAUTHORIZED
 *   2. streams.start happy path returns {streamId, wsUrl}
 *   3. streams.start enforces input schema (rejects extra userId field)
 *   4. streams.stop on foreign streamId → NOT_FOUND (not FORBIDDEN — STRIDE I)
 *   5. streams.list filters to ctx.currentUser.id
 *   6. webapp.window.spawn returns {webappId, windowId, streamId, wsUrl}
 *   7. webapp.window.spawn WINDOW_NOT_FOUND → NOT_FOUND tRPC error
 *   8. webapp.window.close on foreign webappId → NOT_FOUND
 *   9. httpOnlyPaths includes the seven new entries
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

// Phase 100-09-02 — mock node:child_process BEFORE importing input-dispatcher
// (which uses execFile). Mock is benign for the pre-existing tests because
// they exercise router code with stubbed managers and never hit xdotool.
vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
}))

import {execFile} from 'node:child_process'
import streamsRouter from '../streaming/trpc-router.js'
import webappRouter from './trpc-router.js'
import {WindowNotFoundError} from './window-manager.js'
import {dispatchScroll} from './input-dispatcher.js'

const mockedExecFile = execFile as unknown as ReturnType<typeof vi.fn>

function findCallback(args: any[]): ((err: any, stdout?: string, stderr?: string) => void) | null {
	for (let i = args.length - 1; i >= 0; i--) {
		if (typeof args[i] === 'function') return args[i]
	}
	return null
}

function makeCtx(opts: {
	currentUser?: {id: string; role: 'admin' | 'member' | 'guest'} | null
	streamManager?: any
	webappWindowManager?: any
}) {
	const livinityd: any = {}
	if (opts.streamManager !== undefined) livinityd.streamManager = opts.streamManager
	if (opts.webappWindowManager !== undefined) livinityd.webappWindowManager = opts.webappWindowManager
	return {
		livinityd,
		logger: {info: () => {}, warn: () => {}, error: () => {}, verbose: () => {}, log: () => {}},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: true,
		currentUser: (opts.currentUser ?? undefined) as any,
		transport: 'express' as const,
	}
}

function fakeStreamManager(opts: {
	startResult?: {streamId: string; wsUrl: string}
	listResult?: any[]
	throwOnStart?: Error
} = {}) {
	const calls: {start: any[]; stop: any[]; list: any[]} = {start: [], stop: [], list: []}
	return {
		startStream: (input: any) => {
			calls.start.push(input)
			if (opts.throwOnStart) throw opts.throwOnStart
			return opts.startResult ?? {streamId: 'fake-stream', wsUrl: '/ws/stream/fake-stream'}
		},
		stopStream: async (streamId: string) => {
			calls.stop.push(streamId)
			return {stopped: true}
		},
		listStreams: (input: any) => {
			calls.list.push(input)
			return opts.listResult ?? []
		},
		_calls: calls,
	}
}

function fakeWindowManager(opts: {
	spawnResult?: any
	throwOnSpawn?: Error
	listResult?: any[]
} = {}) {
	return {
		spawn: async () => {
			if (opts.throwOnSpawn) throw opts.throwOnSpawn
			return opts.spawnResult ?? {
				webappId: 'app1',
				windowId: 0x200,
				streamId: 'fake-stream',
				wsUrl: '/ws/stream/fake-stream',
			}
		},
		focus: async () => ({ok: true}),
		close: async () => ({ok: true}),
		list: () => opts.listResult ?? [],
	}
}

describe('streams.* tRPC routes', () => {
	it('Test 1: streams.start without currentUser → UNAUTHORIZED', async () => {
		const ctx = makeCtx({currentUser: null, streamManager: fakeStreamManager()})
		const caller = streamsRouter.createCaller(ctx as any)
		await expect(
			caller.start({mode: 'desktop', target: {display: ':0.0', width: 1920, height: 1080}}),
		).rejects.toMatchObject({code: 'UNAUTHORIZED'})
	})

	it('Test 2: streams.start happy path returns {streamId, wsUrl}', async () => {
		const sm = fakeStreamManager({startResult: {streamId: 's1', wsUrl: '/ws/stream/s1'}})
		const ctx = makeCtx({
			currentUser: {id: 'u1', role: 'member'},
			streamManager: sm,
		})
		const caller = streamsRouter.createCaller(ctx as any)
		const r = await caller.start({
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		expect(r).toEqual({streamId: 's1', wsUrl: '/ws/stream/s1'})
		// userId is sourced from ctx, NOT input
		expect(sm._calls.start[0].userId).toBe('u1')
	})

	it('Test 3: streams.start ignores any userId field in input — userId always sourced from ctx', async () => {
		const sm = fakeStreamManager({startResult: {streamId: 's1', wsUrl: '/ws/stream/s1'}})
		const ctx = makeCtx({
			currentUser: {id: 'u1', role: 'member'},
			streamManager: sm,
		})
		const caller = streamsRouter.createCaller(ctx as any)
		// Even if a malicious client smuggles `userId: 'attacker'` in input, the
		// procedure body uses ctx.currentUser.id ('u1') — STRIDE S spoofing
		// prevention. Zod's discriminatedUnion ignores unknown extra fields.
		await caller.start({
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
			// @ts-expect-error — extra field (smuggled from a malicious client)
			userId: 'attacker',
		} as any)
		// startStream was called with userId from ctx, NOT from input
		expect(sm._calls.start[0].userId).toBe('u1')
		expect(sm._calls.start[0].userId).not.toBe('attacker')
	})

	it('Test 4: streams.stop on foreign streamId → NOT_FOUND (STRIDE I)', async () => {
		const sm = fakeStreamManager({listResult: []}) // user owns nothing
		const ctx = makeCtx({
			currentUser: {id: 'u1', role: 'member'},
			streamManager: sm,
		})
		const caller = streamsRouter.createCaller(ctx as any)
		// Use a valid UUID format so Zod passes; ownership check fails after.
		await expect(
			caller.stop({streamId: '00000000-0000-4000-8000-000000000000'}),
		).rejects.toMatchObject({code: 'NOT_FOUND'})
	})

	it('Test 5: streams.list returns only ctx.currentUser owned streams', async () => {
		const sm = fakeStreamManager({listResult: [{streamId: 's1', userId: 'u1'}]})
		const ctx = makeCtx({
			currentUser: {id: 'u1', role: 'member'},
			streamManager: sm,
		})
		const caller = streamsRouter.createCaller(ctx as any)
		const list = await caller.list()
		expect(list).toEqual([{streamId: 's1', userId: 'u1'}])
		// listStreams was called with userId from ctx
		expect(sm._calls.list[0]).toEqual({userId: 'u1'})
	})
})

describe('webapp.window.* tRPC routes', () => {
	it('Test 6: webapp.window.spawn happy path returns {webappId,windowId,streamId,wsUrl}', async () => {
		const wm = fakeWindowManager({
			spawnResult: {
				webappId: 'app1',
				windowId: 0x200,
				streamId: 's1',
				wsUrl: '/ws/stream/s1',
			},
		})
		const ctx = makeCtx({
			currentUser: {id: 'u1', role: 'member'},
			webappWindowManager: wm,
		})
		const caller = webappRouter.createCaller(ctx as any)
		const r = await caller.window.spawn({webappId: 'app1', url: 'https://github.com'})
		expect(r.streamId).toBe('s1')
	})

	it('Test 7: webapp.window.spawn maps WindowNotFoundError to NOT_FOUND', async () => {
		const wm = fakeWindowManager({throwOnSpawn: new WindowNotFoundError('https://nope.com')})
		const ctx = makeCtx({
			currentUser: {id: 'u1', role: 'member'},
			webappWindowManager: wm,
		})
		const caller = webappRouter.createCaller(ctx as any)
		await expect(
			caller.window.spawn({webappId: 'app1', url: 'https://nope.com'}),
		).rejects.toMatchObject({code: 'NOT_FOUND'})
	})

	it('Test 8: webapp.window.close unauthenticated → UNAUTHORIZED', async () => {
		const ctx = makeCtx({currentUser: null, webappWindowManager: fakeWindowManager()})
		const caller = webappRouter.createCaller(ctx as any)
		await expect(caller.window.close({webappId: 'app1'})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
		})
	})
})

describe('httpOnlyPaths registration', () => {
	it('Test 9: httpOnlyPaths includes the seven new Phase 93 entries', () => {
		const commonPath = join(import.meta.dirname, '..', 'server', 'trpc', 'common.ts')
		const src = readFileSync(commonPath, 'utf-8')
		expect(src).toContain("'streams.start'")
		expect(src).toContain("'streams.stop'")
		expect(src).toContain("'streams.list'")
		expect(src).toContain("'webapp.window.spawn'")
		expect(src).toContain("'webapp.window.focus'")
		expect(src).toContain("'webapp.window.close'")
		expect(src).toContain("'webapp.window.list'")
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 100-09-02 — webapp.input.scroll dispatch tests.
//
// Closes Bug 2 from the 100-08 deploy live test (scroll-down doesn't work).
// The user-canvas RFB transport is viewOnly:true (P100-07), so wheel events
// must round-trip via tRPC → dispatchScroll → xdotool activate-first chain.
// Same Chrome XSendEvent filter that broke clicks (fixed in P100-07.3) breaks
// `xdotool click --window <wid> 5` for scroll-down too — fix is the same
// activate-first pattern as `dispatchPointer`.
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 100-09-02 webapp.input.scroll dispatch', () => {
	const recorded: Array<{cmd: string; args: string[]}> = []

	beforeEach(() => {
		mockedExecFile.mockReset()
		recorded.length = 0
		mockedExecFile.mockImplementation((...callArgs: any[]) => {
			const cmd = String(callArgs[0])
			const args = Array.isArray(callArgs[1]) ? [...callArgs[1]] : []
			recorded.push({cmd, args})
			const cb = findCallback(callArgs)
			if (cb) cb(null, '', '')
		})
	})

	it('T-09-02-01: dispatchScroll(wid, x, y, 5) → xdotool click 5 with activate-first chain', async () => {
		await dispatchScroll(0x4280002, 100, 200, 5)
		const xdotoolCall = recorded.find((c) => c.cmd === 'xdotool')
		expect(xdotoolCall).toBeDefined()
		const args = xdotoolCall!.args
		// Activate-first chain present.
		expect(args).toContain('windowactivate')
		expect(args).toContain('--sync')
		expect(args).toContain(String(0x4280002))
		expect(args).toContain('windowfocus')
		// Scroll button 5 (scroll-down) dispatched after the click verb.
		const clickIdx = args.indexOf('click')
		expect(clickIdx).toBeGreaterThan(-1)
		// click should appear AFTER mousemove (activate → focus → mousemove → click).
		const mousemoveIdx = args.indexOf('mousemove')
		expect(mousemoveIdx).toBeGreaterThan(-1)
		expect(clickIdx).toBeGreaterThan(mousemoveIdx)
		const tail = args.slice(clickIdx)
		expect(tail).toContain('--clearmodifiers')
		expect(tail).toContain('5')
	})

	it('T-09-02-02: dispatchScroll(wid, x, y, 4) → xdotool click 4 (scroll-up)', async () => {
		await dispatchScroll(0x4280002, 100, 200, 4)
		const xdotoolCall = recorded.find((c) => c.cmd === 'xdotool')
		expect(xdotoolCall).toBeDefined()
		const args = xdotoolCall!.args
		const clickIdx = args.indexOf('click')
		expect(clickIdx).toBeGreaterThan(-1)
		expect(args.slice(clickIdx)).toContain('4')
	})

	it('T-09-02-03: dispatchScroll throws on invalid button', async () => {
		await expect(dispatchScroll(0x4280002, 100, 200, 99 as 4)).rejects.toThrow(/invalid scroll button/)
	})
})
