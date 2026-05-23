/**
 * Phase 197-05 Plan 05 Task 2 — mastra-router.test.ts.
 *
 * Coverage (≥10 PASS):
 *   T1  — mastra.agent.threads.list returns array (mocked memory.getThreads)
 *   T2  — threads.delete calls memory.deleteThread; non-admin rejected
 *   T3  — agent.cancel calls approvalManager.cancelAll(runId)
 *   T4  — agent.approve calls approvalManager.resolve
 *   T5  — empty-injection default mastraRouter throws on call
 *   T6  — agent.approve adminProcedure gate — non-admin rejected
 *   T7  — agent.cancel adminProcedure gate — non-admin rejected
 *   T8  — agent.stream emits tool-call-approval chunk for destructive tools
 *         + does NOT emit it for non-destructive tools (W-02 + N-01)
 *   T9  — W-02 lock — mastra-router.ts source has zero "if (!approved).*abort"
 *         or "if (approved === false).*abort" anti-patterns
 *   T10 — adminProcedure protects threads.list
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {ApprovalManager} from '../../mastra/approval-manager.js'
import {LivOSMastra} from '../../mastra/index.js'
import {createMastraRouter, mastraRouter} from './mastra-router.js'

function makeAdminCtx() {
	return {
		livinityd: {} as any,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			verbose: () => {},
			log: () => {},
			debug: () => {},
		},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

function makeNonAdminCtx() {
	return {
		livinityd: {} as any,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			verbose: () => {},
			log: () => {},
			debug: () => {},
		},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: false,
		currentUser: {id: 'member-uuid', username: 'member', role: 'member' as const},
		transport: 'express' as const,
	}
}

function makeLivOSMastra(opts?: {
	agentStream?: (msgs: unknown, options: unknown) => AsyncIterable<unknown>
	memoryOps?: {
		getThreads?: () => Promise<unknown[]>
		deleteThread?: (id: string) => Promise<void>
	}
}) {
	const m = new LivOSMastra({providerRouter: {resolveAgentModel: vi.fn()} as never})
	if (opts?.agentStream) {
		m.attachLivAiAgent({
			stream: opts.agentStream,
		} as never)
	}
	if (opts?.memoryOps) {
		m.attachMemory(opts.memoryOps as never)
	}
	return m
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = []
	for await (const x of iter) out.push(x)
	return out
}

let approvalManager: ApprovalManager

beforeEach(() => {
	approvalManager = new ApprovalManager({timeoutMs: 60_000})
})

describe('mastra.agent.threads.*', () => {
	test('T1 — threads.list returns {threads:[]} when no getThreads', async () => {
		const livOSMastra = makeLivOSMastra() // memory null
		const r = createMastraRouter({livOSMastra, approvalManager})
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.agent.threads.list()
		expect(result).toEqual({threads: []})
	})

	test('T1b — threads.list returns memory.getThreads result', async () => {
		const getThreads = vi.fn().mockResolvedValue([{id: 't1'}, {id: 't2'}])
		const livOSMastra = makeLivOSMastra({memoryOps: {getThreads}})
		const r = createMastraRouter({livOSMastra, approvalManager})
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.agent.threads.list()
		expect(result.threads).toEqual([{id: 't1'}, {id: 't2'}])
	})

	test('T2 — threads.delete calls memory.deleteThread; non-admin rejected', async () => {
		const deleteThread = vi.fn().mockResolvedValue(undefined)
		const livOSMastra = makeLivOSMastra({memoryOps: {deleteThread}})
		const r = createMastraRouter({livOSMastra, approvalManager})

		const admin = r.createCaller(makeAdminCtx() as any)
		const ok = await admin.agent.threads.delete({threadId: 't1'})
		expect(ok).toEqual({ok: true})
		expect(deleteThread).toHaveBeenCalledWith('t1')

		const nonAdmin = r.createCaller(makeNonAdminCtx() as any)
		await expect(nonAdmin.agent.threads.delete({threadId: 't1'})).rejects.toThrow()
	})

	test('T10 — threads.list non-admin rejected (adminProcedure gate)', async () => {
		const livOSMastra = makeLivOSMastra()
		const r = createMastraRouter({livOSMastra, approvalManager})
		const nonAdmin = r.createCaller(makeNonAdminCtx() as any)
		await expect(nonAdmin.agent.threads.list()).rejects.toThrow()
	})
})

describe('mastra.agent.cancel + approve', () => {
	test('T3 — cancel calls approvalManager.cancelAll(runId)', async () => {
		const livOSMastra = makeLivOSMastra()
		const cancelSpy = vi.spyOn(approvalManager, 'cancelAll')
		const r = createMastraRouter({livOSMastra, approvalManager})
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.agent.cancel({runId: 'r1'})
		expect(cancelSpy).toHaveBeenCalledWith('r1')
	})

	test('T4 — approve calls approvalManager.resolve(toolCallId, approved)', async () => {
		const livOSMastra = makeLivOSMastra()
		const resolveSpy = vi.spyOn(approvalManager, 'resolve')
		const r = createMastraRouter({livOSMastra, approvalManager})
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.agent.approve({toolCallId: 'tc1', approved: true})
		expect(resolveSpy).toHaveBeenCalledWith('tc1', true)
		await caller.agent.approve({toolCallId: 'tc1', approved: false})
		expect(resolveSpy).toHaveBeenCalledWith('tc1', false)
	})

	test('T6 — approve adminProcedure gate', async () => {
		const livOSMastra = makeLivOSMastra()
		const r = createMastraRouter({livOSMastra, approvalManager})
		const nonAdmin = r.createCaller(makeNonAdminCtx() as any)
		await expect(
			nonAdmin.agent.approve({toolCallId: 'tc1', approved: true}),
		).rejects.toThrow()
	})

	test('T7 — cancel adminProcedure gate', async () => {
		const livOSMastra = makeLivOSMastra()
		const r = createMastraRouter({livOSMastra, approvalManager})
		const nonAdmin = r.createCaller(makeNonAdminCtx() as any)
		await expect(nonAdmin.agent.cancel({runId: 'r1'})).rejects.toThrow()
	})
})

describe('mastra.agent.stream (W-02 + N-01)', () => {
	test('T8 — destructive tool-call chunk → emits tool-call-approval; non-destructive → does NOT', async () => {
		async function* agentStream() {
			yield {type: 'tool-call', toolName: 'luse_computer_click_mouse', toolCallId: 'tc1'}
			yield {type: 'tool-call', toolName: 'luse_computer_screenshot', toolCallId: 'tc2'}
			yield {type: 'finish'}
		}
		const livOSMastra = makeLivOSMastra({agentStream})
		const r = createMastraRouter({livOSMastra, approvalManager})
		const caller = r.createCaller(makeAdminCtx() as any)
		const iter = (await caller.agent.stream({threadId: 'tA', message: 'hi'})) as AsyncIterable<unknown>
		const chunks = await collect(iter)
		const types = chunks
			.map((c) => (c as {type?: string}).type)
			.filter((t): t is string => typeof t === 'string')
		// tool-call-approval present for click_mouse
		expect(types).toContain('tool-call-approval')
		// Count tool-call-approval emissions — must be exactly 1 (click_mouse only)
		const approvals = chunks.filter(
			(c) => (c as {type?: string}).type === 'tool-call-approval',
		)
		expect(approvals.length).toBe(1)
		expect((approvals[0] as {toolName: string}).toolName).toBe('luse_computer_click_mouse')
		// run-start + finish bracketing
		expect(types[0]).toBe('run-start')
		expect(types[types.length - 1]).toBe('finish')
	})
})

describe('empty-injection mastraRouter default', () => {
	test('T5 — bare mastraRouter throws on procedure call', async () => {
		const caller = mastraRouter.createCaller(makeAdminCtx() as any)
		await expect(caller.agent.approve({toolCallId: 'x', approved: true})).rejects.toThrow(
			/not injected/i,
		)
	})
})

describe('W-02 anti-pattern grep (source)', () => {
	test('T9 — mastra-router.ts has zero "if (!approved).*abort" anti-pattern', async () => {
		const fs = await import('node:fs/promises')
		const path = await import('node:path')
		const {fileURLToPath} = await import('node:url')
		const here = path.dirname(fileURLToPath(import.meta.url))
		const src = await fs.readFile(path.join(here, 'mastra-router.ts'), 'utf-8')
		expect(src).not.toMatch(/if \(!approved\)[\s\S]{0,80}abort/)
		expect(src).not.toMatch(/if \(approved === false\)[\s\S]{0,80}abort/)
		expect(src).not.toMatch(/if \(!approved\)[\s\S]{0,80}cancelAll/)
	})
})

/**
 * Phase 199-02 — mastra.agent.listAvailableModels procedure tests.
 *
 * Coverage:
 *   T11 — listAvailableModels returns the 4-item D-199-06 catalogue with
 *         {id, name, description} shape and stable ALLOWED_XAI_MODELS order
 *   T12 — privateProcedure gate — unauthenticated call rejects (T-199-02-01)
 *   T13 — labels mirror the D-199-11 mapping
 */
describe('mastra.agent.listAvailableModels (Phase 199-02)', () => {
	test('T11 — returns 4-item catalogue in ALLOWED_XAI_MODELS order with {id, name, description}', async () => {
		const livOSMastra = makeLivOSMastra()
		const r = createMastraRouter({livOSMastra, approvalManager})
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.agent.listAvailableModels()
		expect(Array.isArray(result)).toBe(true)
		expect(result).toHaveLength(4)
		const ids = result.map((m: {id: string}) => m.id)
		expect(ids).toEqual([
			'grok-4.20-0309-fast',
			'grok-4.20-0309-non-reasoning',
			'grok-4.20-0309-reasoning',
			'grok-4.3',
		])
		for (const entry of result) {
			expect(typeof (entry as {id: string}).id).toBe('string')
			expect(typeof (entry as {name: string}).name).toBe('string')
			expect(typeof (entry as {description: string}).description).toBe('string')
		}
	})

	test('T12 — privateProcedure gate: unauthenticated caller rejects (T-199-02-01)', async () => {
		const livOSMastra = makeLivOSMastra()
		const r = createMastraRouter({livOSMastra, approvalManager})
		// Unauthenticated context: dangerouslyBypassAuthentication=false AND no currentUser
		const unauthCtx = {
			livinityd: {} as any,
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
				verbose: () => {},
				log: () => {},
				debug: () => {},
			},
			server: {} as any,
			user: {} as any,
			appStore: {} as any,
			apps: {} as any,
			dangerouslyBypassAuthentication: false,
			currentUser: undefined,
			transport: 'express' as const,
		}
		const caller = r.createCaller(unauthCtx as any)
		await expect(caller.agent.listAvailableModels()).rejects.toThrow()
	})

	test('T13 — labels match D-199-11 spec', async () => {
		const livOSMastra = makeLivOSMastra()
		const r = createMastraRouter({livOSMastra, approvalManager})
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = (await caller.agent.listAvailableModels()) as Array<{
			id: string
			name: string
			description: string
		}>
		const byId = Object.fromEntries(result.map((m) => [m.id, m]))
		expect(byId['grok-4.20-0309-fast']?.name).toBe('Grok 4.20 Fast')
		expect(byId['grok-4.20-0309-fast']?.description).toBe('Fast non-reasoning. Default.')
		expect(byId['grok-4.20-0309-non-reasoning']?.name).toBe('Grok 4.20')
		expect(byId['grok-4.20-0309-reasoning']?.name).toBe('Grok 4.20 Think')
		expect(byId['grok-4.3']?.name).toBe('Grok 4.3')
		expect(byId['grok-4.3']?.description).toBe('Latest. Reasoning + tool use.')
	})
})
