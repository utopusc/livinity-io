/**
 * Phase 197-04 Plan 04 Task 2 — liv-ai.test.ts.
 *
 * Coverage (≥10 PASS):
 *   1. createLivAiAgent returns object with id='liv-ai', name='Liv AI'
 *   2. model resolver invokes providerRouter.resolveAgentModel exactly once
 *   3. tools resolver invokes mcpBridge.listTools exactly once
 *   4. tools resolver drops non-allow-listed names (filterMcpTools T-197-04-04)
 *   5. LIV_AI_SYSTEM_PROMPT contains all required literal markers
 *   6. Agent ctor receives instructions === LIV_AI_SYSTEM_PROMPT
 *   7. Agent ctor receives the passed memory
 *   8. T-197-04-01 — LIV_AI_SYSTEM_PROMPT contains zero interpolation
 *   9. W-02 destructive wrap — luse_computer_click_mouse.execute wrapped; screenshot pass-through
 *   10. W-02 Reject → REJECTED_TOOL_RESULT + original execute NOT called
 */

import {describe, expect, test, vi} from 'vitest'

const agentCtorArgs: Array<unknown> = []
vi.mock('@mastra/core/agent', () => ({
	Agent: vi.fn().mockImplementation((args: unknown) => {
		agentCtorArgs.push(args)
		return {...((args as object) ?? {})}
	}),
}))

import {
	createLivAiAgent,
	filterMcpTools,
	LIV_AI_SYSTEM_PROMPT,
	wrapDestructiveTools,
} from './liv-ai.js'
import {REJECTED_TOOL_RESULT, type ApprovalGate} from './wrap-tool-with-approval.js'

function makeDeps() {
	const screenshotExec = vi.fn(async () => ({type: 'image', data: 'fake'}))
	const clickExec = vi.fn(async () => ({type: 'ok'}))
	const evilExec = vi.fn(async () => ({type: 'evil'}))

	return {
		providerRouter: {
			resolveAgentModel: vi.fn().mockResolvedValue({modelId: 'grok-4.20'}),
		},
		memory: {kind: 'mem'},
		mcpBridge: {
			listTools: vi.fn().mockResolvedValue({
				luse_computer_screenshot: {description: 's', execute: screenshotExec},
				luse_computer_click_mouse: {description: 'c', execute: clickExec},
				luse_list_windows: {description: 'l', execute: vi.fn()},
				evil_shell: {description: 'evil', execute: evilExec},
			}),
			destroy: vi.fn(),
		},
		approvalManager: {
			registerPending: vi.fn().mockResolvedValue(true),
		} satisfies ApprovalGate,
		_spies: {screenshotExec, clickExec, evilExec},
	}
}

describe('createLivAiAgent', () => {
	beforeEach()

	function beforeEach() {
		agentCtorArgs.length = 0
	}

	test('Test 1: returns agent with id=liv-ai, name=Liv AI', () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {id: string; name: string}
		expect(args.id).toBe('liv-ai')
		expect(args.name).toBe('Liv AI')
	})

	test('Test 2: model resolver invokes providerRouter.resolveAgentModel once', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		// Phase 199-03 — model: is now a per-request resolver taking
		// {requestContext}. Phase 197-04 shape was zero-arg async; this
		// pre-existing case is updated to pass a stub RequestContext so
		// the basic "model resolver delegates to providerRouter" contract
		// stays asserted independently of the modelName parameterization
		// covered in Tests 11-13.
		const args = agentCtorArgs[0] as {
			model: (input: {requestContext: {get(k: string): unknown}}) => Promise<unknown> | unknown
		}
		await args.model({requestContext: {get: () => undefined}})
		expect(deps.providerRouter.resolveAgentModel).toHaveBeenCalledTimes(1)
	})

	test('Test 3: tools resolver invokes mcpBridge.listTools once', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {tools: () => Promise<Record<string, unknown>>}
		await args.tools()
		expect(deps.mcpBridge.listTools).toHaveBeenCalledTimes(1)
	})

	test('Test 4: tools resolver filters out non-allow-listed names (T-197-04-04)', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {tools: () => Promise<Record<string, unknown>>}
		const tools = await args.tools()
		expect('evil_shell' in tools).toBe(false)
		expect('luse_computer_screenshot' in tools).toBe(true)
	})

	test('Test 5: LIV_AI_SYSTEM_PROMPT contains required markers', () => {
		expect(LIV_AI_SYSTEM_PROMPT).toContain('luse_* and selfclaude_*')
		expect(LIV_AI_SYSTEM_PROMPT).toContain('take a screenshot FIRST')
		expect(LIV_AI_SYSTEM_PROMPT).toContain('Liv AI, the assistant built into LivOS')
	})

	test('Test 6: Agent ctor receives instructions === LIV_AI_SYSTEM_PROMPT', () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {instructions: string}
		expect(args.instructions).toBe(LIV_AI_SYSTEM_PROMPT)
	})

	test('Test 7: Agent ctor receives passed memory reference', () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {memory: unknown}
		expect(args.memory).toBe(deps.memory)
	})

	test('Test 8: T-197-04-01 — system prompt contains zero interpolation', () => {
		expect(LIV_AI_SYSTEM_PROMPT).not.toContain('${')
	})

	test('Test 9: W-02 — destructive tool wrapped; non-destructive passes through', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {tools: () => Promise<Record<string, {execute: unknown}>>}
		const tools = await args.tools()
		// click_mouse is destructive — execute is wrapped (NEW reference)
		expect(tools.luse_computer_click_mouse?.execute).not.toBe(deps._spies.clickExec)
		// screenshot is non-destructive — execute is the original
		expect(tools.luse_computer_screenshot?.execute).toBe(deps._spies.screenshotExec)
	})

	test('Test 10: W-02 — Reject returns REJECTED_TOOL_RESULT, original NOT called', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		deps.approvalManager.registerPending = vi.fn().mockResolvedValue(false)
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {
			tools: () => Promise<Record<string, {execute: (i: unknown, c: unknown) => Promise<unknown>}>>
		}
		const tools = await args.tools()
		const result = await tools.luse_computer_click_mouse!.execute({}, {runId: 'r1'})
		expect(result).toEqual(REJECTED_TOOL_RESULT)
		expect(deps._spies.clickExec).not.toHaveBeenCalled()
	})
})

describe('filterMcpTools', () => {
	test('drops non-allow-listed names', () => {
		const out = filterMcpTools({
			luse_a: 1,
			selfclaude_b: 2,
			evil_c: 3,
			random: 4,
		})
		expect(Object.keys(out).sort()).toEqual(['luse_a', 'selfclaude_b'])
	})
})

describe('wrapDestructiveTools', () => {
	test('destructive tool gets wrapped; others pass through', () => {
		const click = {description: 'c', execute: vi.fn()}
		const ss = {description: 's', execute: vi.fn()}
		const gate: ApprovalGate = {registerPending: vi.fn().mockResolvedValue(true)}
		const out = wrapDestructiveTools(
			{luse_computer_click_mouse: click, luse_computer_screenshot: ss},
			gate,
		)
		expect((out.luse_computer_click_mouse as {execute: unknown}).execute).not.toBe(click.execute)
		expect(out.luse_computer_screenshot).toBe(ss)
	})
})

// --- Phase 199-03 ------------------------------------------------------
//
// Plan 199-03 flips the model: prop from zero-arg async resolver
//   model: (async () => deps.providerRouter.resolveAgentModel()) as never
// to a per-request dynamic resolver that reads modelName off the Mastra
// RequestContext (passed in by chat-route per Plan 199-03):
//   model: ({requestContext}) => deps.providerRouter.resolveAgentModel(
//       requestContext.get('modelName') as string | undefined
//   )
//
// The provider-router (Plan 199-02 coerceModel) handles soft validation
// of the modelName — invalid/undefined → XAI_DEFAULT_MODEL_ID. The agent
// just forwards whatever requestContext yields.

describe('Phase 199-03: dynamic model via RequestContext', () => {
	function makeRequestContextStub(modelName?: string): {get(key: string): unknown} {
		return {
			get: (key: string) => (key === 'modelName' ? modelName : undefined),
		}
	}

	test('Test 11: model resolver invoked with requestContext returning "grok-4.3" calls providerRouter.resolveAgentModel("grok-4.3")', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {
			model: (input: {requestContext: {get(k: string): unknown}}) => Promise<unknown> | unknown
		}
		await args.model({requestContext: makeRequestContextStub('grok-4.3')})
		expect(deps.providerRouter.resolveAgentModel).toHaveBeenCalledTimes(1)
		expect(deps.providerRouter.resolveAgentModel).toHaveBeenCalledWith('grok-4.3')
	})

	test('Test 12: model resolver invoked with requestContext returning undefined calls providerRouter.resolveAgentModel(undefined) (default-model fallback)', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {
			model: (input: {requestContext: {get(k: string): unknown}}) => Promise<unknown> | unknown
		}
		await args.model({requestContext: makeRequestContextStub(undefined)})
		expect(deps.providerRouter.resolveAgentModel).toHaveBeenCalledTimes(1)
		expect(deps.providerRouter.resolveAgentModel).toHaveBeenCalledWith(undefined)
	})

	test('Test 13: model resolver invoked with bogus modelName forwards verbatim (coerce in provider-router, not here)', async () => {
		agentCtorArgs.length = 0
		const deps = makeDeps()
		createLivAiAgent(deps)
		const args = agentCtorArgs[0] as {
			model: (input: {requestContext: {get(k: string): unknown}}) => Promise<unknown> | unknown
		}
		await args.model({requestContext: makeRequestContextStub('bogus')})
		expect(deps.providerRouter.resolveAgentModel).toHaveBeenCalledTimes(1)
		expect(deps.providerRouter.resolveAgentModel).toHaveBeenCalledWith('bogus')
	})
})
