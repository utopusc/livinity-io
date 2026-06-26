// @vitest-environment jsdom
/**
 * Phase 291 — tests for the AionUi command-bar dispatch client.
 * Pure parsing + WS frame handling (the box-unverifiable bits, locked here so
 * a protocol assumption can't silently regress). Network + WebSocket mocked.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
	LivCommandStream,
	applyLivMode,
	createLivConversation,
	getLivMcpServers,
	listLivAgents,
	listLivSkills,
	runLivCommand,
	sendLivMessage,
	type LivStreamHandlers,
} from './liv-command-aionui'

// ── Fake WebSocket ───────────────────────────────────────────────────────────
class FakeWebSocket {
	static instances: FakeWebSocket[] = []
	onopen: ((ev: Event) => void) | null = null
	onmessage: ((ev: MessageEvent) => void) | null = null
	onerror: ((ev: Event) => void) | null = null
	onclose: ((ev: Event) => void) | null = null
	readyState = 0
	sent: string[] = []
	constructor(public url: string) {
		FakeWebSocket.instances.push(this)
	}
	send(d: string) {
		this.sent.push(d)
	}
	close() {
		this.readyState = 3
		this.onclose?.(new Event('close'))
	}
	triggerOpen() {
		this.readyState = 1
		this.onopen?.(new Event('open'))
	}
	emit(obj: unknown) {
		this.onmessage?.({data: JSON.stringify(obj)} as MessageEvent)
	}
}

function mockFetchOnce(impl: (url: string, init?: RequestInit) => {ok?: boolean; status?: number; body?: unknown}) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			const {ok = true, status = 200, body = {}} = impl(url, init)
			return {
				ok,
				status,
				text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
			} as Response
		}),
	)
}

beforeEach(() => {
	FakeWebSocket.instances = []
	vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('listLivAgents', () => {
	it('GETs /api/agents/management + parses {success,data:[...]} with agent_type, dropping not-installed (2.1.24)', async () => {
		let calledUrl = ''
		mockFetchOnce((url) => {
			calledUrl = url
			return {
				body: {
					success: true,
					data: [
						{id: '2d23ff1c', name: 'Claude Code', agent_type: 'acp', installed: true},
						{id: 'g1', name: 'Gemini', agent_type: 'acp'},
						{id: 'qwen', name: 'Qwen', agent_type: 'acp', installed: false}, // dropped
					],
				},
			}
		})
		const agents = await listLivAgents()
		// 2.1.24 moved the list to /api/agents/management (bare /api/agents → 404).
		expect(calledUrl).toContain('/liv/api/agents/management')
		expect(agents).toEqual([
			{id: '2d23ff1c', name: 'Claude Code', agentType: 'acp', models: [], defaultModelId: null},
			{id: 'g1', name: 'Gemini', agentType: 'acp', models: [], defaultModelId: null},
		])
	})
	it('still tolerates a legacy handshake.available_models block if a build re-adds it', async () => {
		mockFetchOnce(() => ({
			body: {
				success: true,
				data: [
					{
						id: 'a',
						name: 'A',
						handshake: {
							available_models: {
								current_model_id: 'sonnet',
								available_models: [{id: 'sonnet', label: 'Sonnet'}],
							},
						},
					},
				],
			},
		}))
		expect(await listLivAgents()).toEqual([
			{id: 'a', name: 'A', agentType: undefined, models: [{id: 'sonnet', label: 'Sonnet'}], defaultModelId: 'sonnet'},
		])
	})
	it('parses a bare array and an {agents:[...]} wrapper, dropping id-less rows', async () => {
		mockFetchOnce(() => ({body: [{id: 'a', name: 'A'}, {name: 'no-id'}]}))
		expect(await listLivAgents()).toEqual([{id: 'a', name: 'A', agentType: undefined, models: [], defaultModelId: null}])
		mockFetchOnce(() => ({body: {agents: [{id: 'b'}]}}))
		expect(await listLivAgents()).toEqual([{id: 'b', name: 'b', agentType: undefined, models: [], defaultModelId: null}])
	})
	it('drops operator-DISABLED agents (enabled:false), keeping enabled:true and undefined (2.1.24 enabled flag)', async () => {
		mockFetchOnce(() => ({
			body: {
				success: true,
				data: [
					{id: 'cc', name: 'Claude Code', agent_type: 'acp', enabled: true},
					{id: 'aion', name: 'Aion CLI', agent_type: 'aionrs', enabled: false}, // operator disabled → dropped
					{id: 'gem', name: 'Gemini', agent_type: 'acp'}, // enabled undefined → kept (AionUi guard: enabled !== false)
				],
			},
		}))
		expect((await listLivAgents()).map((a) => a.id)).toEqual(['cc', 'gem'])
	})
})

describe('listLivSkills / getLivMcpServers', () => {
	it('parses the skills + mcp envelopes, dropping malformed rows', async () => {
		mockFetchOnce(() => ({body: {success: true, data: [{name: 'commit', description: 'git commit'}, {name: ''}]}}))
		expect(await listLivSkills()).toEqual([{name: 'commit', description: 'git commit'}])
		mockFetchOnce(() => ({body: {data: [{id: 's1', name: 'liv-docker', enabled: true}, {id: 's2', name: 'x', enabled: false}, {name: 'no-id'}]}}))
		expect(await getLivMcpServers()).toEqual([
			{id: 's1', name: 'liv-docker', enabled: true},
			{id: 's2', name: 'x', enabled: false},
		])
	})
})

describe('applyLivMode', () => {
	it('finds the mode option by category and PUTs the value', async () => {
		const calls: {url: string; init?: RequestInit}[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				calls.push({url, init})
				if (init?.method === 'PUT') return {ok: true, status: 200, text: async () => '{}'} as Response
				return {
					ok: true,
					status: 200,
					text: async () =>
						JSON.stringify({config_options: [{id: 'agent', category: 'agent'}, {id: 'mode-1', category: 'mode', options: [{value: 'plan'}]}]}),
				} as Response
			}),
		)
		await applyLivMode('c1', 'plan')
		const put = calls.find((c) => c.init?.method === 'PUT')!
		expect(put.url).toContain('/conversations/c1/config-options/mode-1')
		expect(JSON.parse(put.init!.body as string)).toEqual({value: 'plan'})
	})
	it('no-ops for an empty mode (no network)', async () => {
		const f = vi.fn()
		vi.stubGlobal('fetch', f)
		await applyLivMode('c1', '')
		expect(f).not.toHaveBeenCalled()
	})
})

describe('createLivConversation body + sendLivMessage files/skills', () => {
	it('sends the 2.1.24 assistant-preset body bare:<agentId> for ANY agent (no legacy type/extra.agent_id/model)', async () => {
		const fetchMock = vi.fn(
			async () => ({ok: true, status: 200, text: async () => JSON.stringify({data: {id: 'c1'}})}) as Response,
		)
		vi.stubGlobal('fetch', fetchMock)
		// A non-Claude agent id, with a model arg — both honoured agent-agnostically.
		expect(await createLivConversation('g1-gemini', 'gemini-2.5')).toBe('c1')
		const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
		expect(body).toEqual({name: 'Liv command', extra: {}, assistant: {id: 'bare:g1-gemini'}})
		expect(body.type).toBeUndefined()
		expect(body.extra.agent_id).toBeUndefined()
		// modelId is NOT sent at create for ACP (model is set later via config-options).
		expect(JSON.stringify(body)).not.toContain('gemini-2.5')
	})
	it('sends files + inject_skills only when provided', async () => {
		const fetchMock = vi.fn(async () => ({ok: true, status: 200, text: async () => '{}'}) as Response)
		vi.stubGlobal('fetch', fetchMock)
		await sendLivMessage('c1', 'hi', {files: ['/tmp/a.png'], injectSkills: ['commit']})
		expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
			// Phase 302 R3: the absolute path is ALSO embedded in `content` (AionUi's ACP
			// pipeline feeds only content to the agent; the files[] array alone never
			// reaches the model). The bare files[] + inject_skills are still sent for the
			// bubble/DB display.
			content: 'hi\n\nAttached file (open with your tools):\n/tmp/a.png',
			files: ['/tmp/a.png'],
			inject_skills: ['commit'],
		})
		await sendLivMessage('c1', 'plain')
		expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({content: 'plain'})
	})
})

describe('createLivConversation', () => {
	it('extracts the id from {data:{id}} / {id} / {data:{conversation_id}}', async () => {
		mockFetchOnce(() => ({body: {data: {id: 'c1'}}}))
		expect(await createLivConversation()).toBe('c1')
		mockFetchOnce(() => ({body: {id: 'c2'}}))
		expect(await createLivConversation()).toBe('c2')
		mockFetchOnce(() => ({body: {data: {conversation_id: 'c3'}}}))
		expect(await createLivConversation()).toBe('c3')
	})

	it('creates with a single bare-assistant attempt for the given agent (no legacy retry)', async () => {
		let call = 0
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
			call += 1
			return {ok: true, status: 200, text: async () => JSON.stringify({data: {id: 'c-ok'}})} as Response
		})
		vi.stubGlobal('fetch', fetchMock)
		expect(await createLivConversation('any-agent')).toBe('c-ok')
		expect(call).toBe(1) // agentId given → no listLivAgents resolution, single create POST
		const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
		expect(body.assistant).toEqual({id: 'bare:any-agent'})
		expect(body.extra).toEqual({})
		expect(body.type).toBeUndefined()
	})

	it('with NO agentId, resolves a default from /api/agents/management (first ACP, NOT hardcoded Claude)', async () => {
		let createBody: string | undefined
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/agents/management')) {
				return {
					ok: true,
					status: 200,
					text: async () =>
						JSON.stringify({
							success: true,
							data: [
								{id: 'aion', name: 'Aion CLI', agent_type: 'aionrs'},
								{id: 'gem', name: 'Gemini', agent_type: 'acp'},
								{id: '2d23ff1c', name: 'Claude Code', agent_type: 'acp'},
							],
						}),
				} as Response
			}
			createBody = init?.body as string
			return {ok: true, status: 200, text: async () => JSON.stringify({data: {id: 'c1'}})} as Response
		})
		vi.stubGlobal('fetch', fetchMock)
		expect(await createLivConversation()).toBe('c1')
		// First ACP agent (Gemini here) wins — proves it's agent-agnostic, not Claude-pinned.
		expect(JSON.parse(createBody!).assistant).toEqual({id: 'bare:gem'})
	})

	it('preloads a non-default mode via extra.pending_config_options at create (2.1.24)', async () => {
		const fetchMock = vi.fn(async () => ({ok: true, status: 200, text: async () => JSON.stringify({data: {id: 'c1'}})}) as Response)
		vi.stubGlobal('fetch', fetchMock)
		expect(await createLivConversation('g1', undefined, 'acceptEdits')).toBe('c1')
		const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
		expect(body).toEqual({
			name: 'Liv command',
			extra: {pending_config_options: {mode: 'acceptEdits'}},
			assistant: {id: 'bare:g1'},
		})
	})
	it('omits pending_config_options for the default mode (fresh conv already starts default)', async () => {
		const fetchMock = vi.fn(async () => ({ok: true, status: 200, text: async () => JSON.stringify({data: {id: 'c1'}})}) as Response)
		vi.stubGlobal('fetch', fetchMock)
		await createLivConversation('g1', undefined, 'default')
		expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).extra).toEqual({})
	})
	it('retries WITHOUT pending_config_options when the preload body is rejected', async () => {
		let call = 0
		const bodies: string[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				call += 1
				bodies.push(init?.body as string)
				// First attempt (with pending_config_options) → 400; fallback (without) → 200.
				if (call === 1) return {ok: false, status: 400, text: async () => 'Invalid JSON request body'} as Response
				return {ok: true, status: 200, text: async () => JSON.stringify({data: {id: 'c-ok'}})} as Response
			}),
		)
		expect(await createLivConversation('g1', undefined, 'plan')).toBe('c-ok')
		expect(call).toBe(2)
		expect(JSON.parse(bodies[0]!).extra).toEqual({pending_config_options: {mode: 'plan'}})
		expect(JSON.parse(bodies[1]!).extra).toEqual({}) // fallback drops the preload
		expect(JSON.parse(bodies[1]!).assistant).toEqual({id: 'bare:g1'})
	})

	it('throws when no attempt yields an id', async () => {
		mockFetchOnce(() => ({ok: false, status: 500}))
		await expect(createLivConversation()).rejects.toThrow()
	})
})

describe('LivCommandStream frame handling', () => {
	function makeHandlers() {
		const calls = {text: [] as string[], complete: [] as string[], approval: [] as unknown[], error: [] as string[]}
		const handlers: LivStreamHandlers = {
			onText: (t) => calls.text.push(t),
			onComplete: (t) => calls.complete.push(t),
			onApprovalNeeded: (i) => calls.approval.push(i),
			onError: (m) => calls.error.push(m),
		}
		return {handlers, calls}
	}

	it('accumulates content deltas (append) and finishes on turn.completed', async () => {
		const {handlers, calls} = makeHandlers()
		const stream = new LivCommandStream('c1', handlers)
		const open = stream.open()
		const ws = FakeWebSocket.instances[0]!
		ws.triggerOpen()
		await open
		ws.emit({name: 'message.stream', data: {type: 'content', msg_id: 'm1', data: 'Hel'}})
		ws.emit({name: 'message.stream', data: {type: 'content', msg_id: 'm1', data: 'lo'}})
		ws.emit({name: 'turn.completed', data: {status: 'finished'}})
		expect(calls.text).toEqual(['Hel', 'Hello'])
		expect(calls.complete).toEqual(['Hello'])
	})

	it('honors replace=true and the {event,payload} frame shape + string data delta', async () => {
		const {handlers, calls} = makeHandlers()
		const stream = new LivCommandStream('c1', handlers)
		const open = stream.open()
		const ws = FakeWebSocket.instances[0]!
		ws.triggerOpen()
		await open
		// alt frame shape {event,payload}; delta as a {text} object
		ws.emit({event: 'message.stream', payload: {type: 'content', msg_id: 'm1', data: {text: 'draft'}}})
		ws.emit({event: 'message.stream', payload: {type: 'content', msg_id: 'm1', data: {text: 'final answer'}, replace: true}})
		expect(calls.text).toEqual(['draft', 'final answer'])
	})

	it('ignores frames for a different conversation', async () => {
		const {handlers, calls} = makeHandlers()
		const stream = new LivCommandStream('c1', handlers)
		const open = stream.open()
		const ws = FakeWebSocket.instances[0]!
		ws.triggerOpen()
		await open
		ws.emit({name: 'message.stream', data: {type: 'content', msg_id: 'x', conversation_id: 'OTHER', data: 'nope'}})
		expect(calls.text).toEqual([])
	})

	it('accumulates type:"text" deltas (bare string) and finishes on a finish frame', async () => {
		const {handlers, calls} = makeHandlers()
		const stream = new LivCommandStream('c1', handlers)
		const open = stream.open()
		const ws = FakeWebSocket.instances[0]!
		ws.triggerOpen()
		await open
		ws.emit({name: 'message.stream', data: {type: 'text', msg_id: 'm1', data: 'Hi '}})
		ws.emit({name: 'message.stream', data: {type: 'text', msg_id: 'm1', data: 'there'}})
		ws.emit({name: 'message.stream', data: {type: 'finish', msg_id: 'm1', data: null}})
		expect(calls.text).toEqual(['Hi', 'Hi there'])
		expect(calls.complete).toEqual(['Hi there'])
	})

	it('surfaces tool approvals via confirmation.add (callId + approve option + title)', async () => {
		const {handlers, calls} = makeHandlers()
		const stream = new LivCommandStream('c1', handlers)
		const open = stream.open()
		const ws = FakeWebSocket.instances[0]!
		ws.triggerOpen()
		await open
		ws.emit({
			name: 'confirmation.add',
			data: {
				call_id: 'call-1',
				msg_id: 'm9',
				title: 'Run install_app?',
				options: [
					{value: 'reject', label: 'No'},
					{value: 'allow_always', label: 'Always allow'},
				],
			},
		})
		expect(calls.approval).toEqual([
			{
				callId: 'call-1',
				msgId: 'm9',
				approveValue: 'allow_always',
				title: 'Run install_app?',
				options: [
					{label: 'No', value: 'reject', kind: 'reject'},
					{label: 'Always allow', value: 'allow_always', kind: 'approve'},
				],
			},
		])
	})

	it('reports a terminal error when the socket closes mid-stream before completion', async () => {
		const {handlers, calls} = makeHandlers()
		const stream = new LivCommandStream('c1', handlers)
		const open = stream.open()
		const ws = FakeWebSocket.instances[0]!
		ws.triggerOpen()
		await open
		ws.emit({name: 'message.stream', data: {type: 'text', msg_id: 'm1', data: 'partial'}})
		ws.close() // AionUi reset the socket mid-turn
		expect(calls.complete).toEqual([])
		expect(calls.error.length).toBe(1)
	})

	it('does NOT error when the socket closes after a normal completion', async () => {
		const {handlers, calls} = makeHandlers()
		const stream = new LivCommandStream('c1', handlers)
		const open = stream.open()
		const ws = FakeWebSocket.instances[0]!
		ws.triggerOpen()
		await open
		ws.emit({name: 'message.stream', data: {type: 'text', msg_id: 'm1', data: 'done'}})
		ws.emit({name: 'turn.completed', data: {status: 'finished'}})
		ws.close() // complete() already closed it; this trailing close must not error
		expect(calls.complete).toEqual(['done'])
		expect(calls.error).toEqual([])
	})
})

describe('runLivCommand', () => {
	it('new conv + non-default mode: create → warmup → config-options(GET+PUT) → message, in order', async () => {
		const seq: string[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				const method = init?.method ?? 'GET'
				const path = url.replace(/^.*\/liv\/api/, '').replace(/^.*\/liv-login.*/, '/liv-login')
				if (path !== '/liv-login') seq.push(`${method} ${path}`)
				let body: unknown = {}
				if (url.endsWith('/conversations')) body = {data: {id: 'c-new'}}
				else if (url.includes('config-options') && method !== 'PUT') body = {config_options: [{id: 'mode', category: 'mode'}]}
				return {ok: true, status: 200, text: async () => JSON.stringify(body)} as Response
			}),
		)
		const run = runLivCommand(
			{prompt: 'hi', agentId: 'g1', mode: 'acceptEdits', autoApprove: false},
			{onWorking: vi.fn(), onConversation: vi.fn(), onText: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onApprovalNeeded: vi.fn()},
		)
		// The WS is constructed inside stream.open(); open it so send() proceeds.
		await vi.waitFor(() => expect(FakeWebSocket.instances[0]).toBeTruthy())
		FakeWebSocket.instances[0]!.triggerOpen()
		await vi.waitFor(() => expect(seq.some((s) => s.includes('/messages'))).toBe(true))
		run.abort()
		expect(seq).toEqual([
			'POST /conversations',
			'POST /conversations/c-new/warmup',
			'GET /conversations/c-new/config-options',
			'PUT /conversations/c-new/config-options/mode',
			'POST /conversations/c-new/messages',
		])
	})

	it('new conv + bypassPermissions SKIPS warmup (preload + client auto-approve) → create → message', async () => {
		const seq: string[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				const method = init?.method ?? 'GET'
				const path = url.replace(/^.*\/liv\/api/, '').replace(/^.*\/liv-login.*/, '/liv-login')
				if (path !== '/liv-login') seq.push(`${method} ${path}`)
				return {ok: true, status: 200, text: async () => JSON.stringify(url.endsWith('/conversations') ? {data: {id: 'c-yolo'}} : {})} as Response
			}),
		)
		const run = runLivCommand(
			{prompt: 'go', agentId: 'g1', mode: 'bypassPermissions', autoApprove: true},
			{onWorking: vi.fn(), onConversation: vi.fn(), onText: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onApprovalNeeded: vi.fn()},
		)
		await vi.waitFor(() => expect(FakeWebSocket.instances[0]).toBeTruthy())
		FakeWebSocket.instances[0]!.triggerOpen()
		await vi.waitFor(() => expect(seq.some((s) => s.includes('/messages'))).toBe(true))
		run.abort()
		// No warmup, no config-options round-trip — the fast YOLO path goes straight to send.
		expect(seq).toEqual(['POST /conversations', 'POST /conversations/c-yolo/messages'])
		// The create body still preloads the mode server-side.
		expect(seq.every((s) => !s.includes('warmup') && !s.includes('config-options'))).toBe(true)
	})

	it('abort during warmup cancels the in-flight warmup and never sends a message', async () => {
		let warmupSignal: AbortSignal | undefined
		let warmupAborted = false
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.includes('/warmup')) {
				warmupSignal = init?.signal ?? undefined
				// A warmup that never resolves on its own — only the run's abort can end it
				// (mirrors a real long-poll blocking until session_active).
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						warmupAborted = true
						reject(new DOMException('Aborted', 'AbortError'))
					})
				})
			}
			const body = url.endsWith('/conversations') ? {data: {id: 'c-new'}} : {}
			return Promise.resolve({ok: true, status: 200, text: async () => JSON.stringify(body)} as Response)
		})
		vi.stubGlobal('fetch', fetchMock)
		const run = runLivCommand(
			{prompt: 'hi', agentId: 'g1', mode: 'acceptEdits', autoApprove: false},
			{onWorking: vi.fn(), onConversation: vi.fn(), onText: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onApprovalNeeded: vi.fn()},
		)
		// Wait until warmup is in flight, then abort — the run's signal must cancel it.
		await vi.waitFor(() => expect(warmupSignal).toBeTruthy())
		run.abort()
		await vi.waitFor(() => expect(warmupAborted).toBe(true))
		// The orchestration bailed at `if (aborted) return` — no message, no WS opened.
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/messages'))).toBe(false)
		expect(FakeWebSocket.instances.length).toBe(0)
	})

	it('falls back (fallback:true) when the conversation cannot be created', async () => {
		mockFetchOnce((url) => {
			if (url.includes('/liv-login')) return {ok: true, body: {}}
			return {ok: false, status: 502} // create conversation fails
		})
		const onError = vi.fn()
		const onWorking = vi.fn()
		runLivCommand({prompt: 'hi', autoApprove: false}, {
			onWorking,
			onText: vi.fn(),
			onDone: vi.fn(),
			onError,
			onApprovalNeeded: vi.fn(),
		})
		// flush the async orchestration
		await vi.waitFor(() => expect(onError).toHaveBeenCalled())
		expect(onWorking).toHaveBeenCalled()
		expect(onError.mock.calls[0]![1]).toEqual({fallback: true})
	})
})
