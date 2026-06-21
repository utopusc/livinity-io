// @vitest-environment jsdom
/**
 * Phase 291 — tests for the AionUi command-bar dispatch client.
 * Pure parsing + WS frame handling (the box-unverifiable bits, locked here so
 * a protocol assumption can't silently regress). Network + WebSocket mocked.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
	LivCommandStream,
	createLivConversation,
	listLivAgents,
	runLivCommand,
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
	it('parses the {success,data:[...]} envelope (vendored AionUi shape)', async () => {
		mockFetchOnce(() => ({body: {success: true, data: [{id: '2d23ff1c', name: 'Claude Code'}, {id: 'g1', name: 'Gemini'}]}}))
		const agents = await listLivAgents()
		expect(agents).toEqual([
			{id: '2d23ff1c', name: 'Claude Code'},
			{id: 'g1', name: 'Gemini'},
		])
	})
	it('parses a bare array and an {agents:[...]} wrapper, dropping id-less rows', async () => {
		mockFetchOnce(() => ({body: [{id: 'a', name: 'A'}, {name: 'no-id'}]}))
		expect(await listLivAgents()).toEqual([{id: 'a', name: 'A'}])
		mockFetchOnce(() => ({body: {agents: [{id: 'b'}]}}))
		expect(await listLivAgents()).toEqual([{id: 'b', name: 'b'}])
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

	it('retries WITHOUT extra when the agent-scoped create is rejected', async () => {
		let call = 0
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			call += 1
			// First attempt (with extra.agent_id) → 400; second (no extra) → ok.
			const ok = call > 1
			return {
				ok,
				status: ok ? 200 : 400,
				text: async () => JSON.stringify(ok ? {data: {id: 'c-default'}} : {error: 'bad agent'}),
			} as Response
		})
		vi.stubGlobal('fetch', fetchMock)
		expect(await createLivConversation('bogus-agent')).toBe('c-default')
		expect(call).toBe(2)
		// Body of the first attempt carried the agent; the retry did not.
		const firstBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
		const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
		expect(firstBody.extra).toEqual({agent_id: 'bogus-agent'})
		expect(secondBody.extra).toBeUndefined()
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
			{callId: 'call-1', msgId: 'm9', approveValue: 'allow_always', title: 'Run install_app?'},
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
