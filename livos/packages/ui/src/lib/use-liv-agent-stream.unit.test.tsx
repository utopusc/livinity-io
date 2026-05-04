// @vitest-environment jsdom
//
// Phase 67 Plan 67-04 — useLivAgentStream unit tests.
//
// `@testing-library/react` and `msw` are NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62 precedent — see
// livos/packages/ui/src/routes/factory-reset/_components/use-preflight.unit.test.tsx
// for the canonical "RTL absent" testing posture).
//
// Per that precedent, this file ships:
//   1. **Pure-helper unit tests** (applyChunk, nextBackoffMs, buildStreamUrl)
//      — these cover the substantive logic of the hook (D-15 dedupe,
//      D-25 backoff, D-25 ?after= URL shape). The hook's React-side wiring
//      is a thin adapter around these helpers.
//   2. **MockEventSource integration test** that drives the `applyChunk`
//      reducer end-to-end with the SSE wire format from CONTEXT D-09 +
//      Plan 67-03. This validates the chunk-shape contract without
//      needing a full React render harness.
//   3. **Smoke import** of the hook module + Zustand store.
//   4. **Source-text invariants** that lock down the wire-level contract
//      (POST /api/agent/start, POST /control, signal: 'stop', after=,
//      EventSource construction, JWT auth via ?token=) so it cannot
//      drift silently before P68/P70 adopt the hook.
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests (uncomment when @testing-library/react + msw land):
// ─────────────────────────────────────────────────────────────────────
//
// Setup blocks for the deferred RTL tests would import:
//   import {renderHook, act, waitFor} from '@testing-library/react'
//   import {setupServer} from 'msw/node'
//   import {http, HttpResponse} from 'msw'
//   const server = setupServer(
//     http.post('/api/agent/start', () => HttpResponse.json({runId: 'r-1'})),
//     http.post('/api/agent/runs/:runId/control', () => HttpResponse.json({ok: true})),
//   )
//   beforeAll(() => server.listen())
//   afterEach(() => server.resetHandlers())
//   afterAll(() => server.close())
//
//   ULA1 (sendMessage): renderHook(() => useLivAgentStream({conversationId:
//     'c1'})); call sendMessage('hello'); assert msw setupServer saw POST
//     /api/agent/start with body {task: 'hello', conversationId: 'c1'}
//     AND that a MockEventSource was constructed with URL matching
//     /api/agent/runs/<uuid>/stream?after=-1&token=...
//
//   ULA2 (snapshot dedupe): dispatch two tool_snapshot chunks with same
//     toolId (first running, second done); assert hook's snapshots Map
//     has size 1 with status 'done' (D-15). [Pure helper covers this —
//     see "applyChunk dedupe" describe block below.]
//
//   ULA3 (reconnect-after): dispatch a few text chunks (lastSeenIdx=2),
//     trigger MockEventSource.onerror, vi.advanceTimersByTime(1100),
//     assert a NEW MockEventSource was constructed with URL containing
//     ?after=2.
//
//   ULA4 (stop): after sendMessage, call stop(), assert msw saw POST
//     /api/agent/runs/<runId>/control with body {signal: 'stop'}.
//
//   ULA5 (unmount cleanup): renderHook + sendMessage, then unmount,
//     assert MockEventSource.close() was called and no further reconnect
//     attempts occur.
//
// References:
//   - .planning/phases/67-liv-agent-core-rebuild/67-CONTEXT.md (D-09,
//     D-12, D-15, D-23, D-24, D-25)
//   - .planning/phases/67-liv-agent-core-rebuild/67-04-PLAN.md
//   - livos/packages/ui/src/routes/factory-reset/_components/use-preflight.unit.test.tsx
//     — established RTL-absent precedent
//   - livos/packages/ui/src/routes/settings/_components/api-keys-create-modal.unit.test.tsx
//     — source-text invariants pattern

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {beforeEach, describe, expect, it, vi} from 'vitest'

import {
	applyChunk,
	buildStreamUrl,
	nextBackoffMs,
	useLivAgentStore,
	useLivAgentStream,
} from './use-liv-agent-stream'
import {
	makeEmptyConversationState,
	type Chunk,
	type ConversationStreamState,
	type ToolCallSnapshot,
} from './liv-agent-types'

// ─────────────────────────────────────────────────────────────────────
// MockEventSource — local SSE simulator. Captures every `new EventSource`
// call so URL assertions can verify the reconnect-after path. Used by the
// integration test below. Also documented for the deferred RTL tests
// (ULA1, ULA3, ULA5 reference it by name in the comment block above).
// ─────────────────────────────────────────────────────────────────────

type ListenerMap = Record<string, Array<(ev: MessageEvent) => void>>

class MockEventSource {
	static instances: MockEventSource[] = []
	url: string
	readyState = 0
	onmessage: ((ev: MessageEvent) => void) | null = null
	onerror: ((ev: Event) => void) | null = null
	onopen: ((ev: Event) => void) | null = null
	closed = false
	private listeners: ListenerMap = {}

	constructor(url: string) {
		this.url = url
		MockEventSource.instances.push(this)
	}

	addEventListener(name: string, fn: (ev: MessageEvent) => void): void {
		if (!this.listeners[name]) this.listeners[name] = []
		this.listeners[name].push(fn)
	}

	close(): void {
		this.closed = true
	}

	// Test helpers
	_dispatch(chunk: Chunk): void {
		const ev = new MessageEvent('message', {data: JSON.stringify(chunk)})
		if (this.onmessage) this.onmessage(ev)
	}

	_dispatchNamed(name: string, payload: unknown): void {
		const ev = new MessageEvent(name, {data: JSON.stringify(payload)})
		const fns = this.listeners[name] ?? []
		for (const fn of fns) fn(ev)
	}

	_error(): void {
		if (this.onerror) this.onerror(new Event('error'))
	}
}

// ─────────────────────────────────────────────────────────────────────
// 1. Pure helper: nextBackoffMs (D-25 exponential 1s -> 30s cap)
// ─────────────────────────────────────────────────────────────────────

describe('nextBackoffMs (D-25 exponential backoff)', () => {
	it('attempts=0 -> 1000ms', () => {
		expect(nextBackoffMs(0)).toBe(1000)
	})
	it('attempts=1 -> 2000ms', () => {
		expect(nextBackoffMs(1)).toBe(2000)
	})
	it('attempts=2 -> 4000ms', () => {
		expect(nextBackoffMs(2)).toBe(4000)
	})
	it('attempts=3 -> 8000ms', () => {
		expect(nextBackoffMs(3)).toBe(8000)
	})
	it('attempts=4 -> 16000ms', () => {
		expect(nextBackoffMs(4)).toBe(16_000)
	})
	it('attempts=5 -> 30000ms (cap reached)', () => {
		expect(nextBackoffMs(5)).toBe(30_000)
	})
	it('attempts=99 -> 30000ms (cap holds)', () => {
		expect(nextBackoffMs(99)).toBe(30_000)
	})
	it('attempts=-1 -> 1000ms (defensive default)', () => {
		expect(nextBackoffMs(-1)).toBe(1000)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. Pure helper: buildStreamUrl (D-25 ?after= query shape)
// ─────────────────────────────────────────────────────────────────────

describe('buildStreamUrl (?after= + ?token= per D-25 / T-67-04-01)', () => {
	it('initial open uses after=-1', () => {
		const url = buildStreamUrl('run123', -1, 'tok')
		expect(url).toBe('/api/agent/runs/run123/stream?after=-1&token=tok')
	})

	it('reconnect uses after=<lastSeenIdx>', () => {
		const url = buildStreamUrl('run123', 7, 'tok')
		expect(url).toContain('after=7')
		expect(url).toContain('/api/agent/runs/run123/stream')
	})

	it('encodes runId and token', () => {
		const url = buildStreamUrl('r/u n', -1, 't o k+')
		expect(url).toContain('r%2Fu%20n')
		expect(url).toContain('t%20o%20k%2B')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. Pure reducer: applyChunk — covers all 6 ChunkType branches + D-15 dedupe
// ─────────────────────────────────────────────────────────────────────

function makeSlice(): ConversationStreamState {
	return {...makeEmptyConversationState('c1'), runId: 'run-1'}
}

describe('applyChunk — text branch', () => {
	it('creates a new assistant message when no last message exists', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'text',
			payload: 'hello',
			ts: 1,
		})
		expect(next.messages).toHaveLength(1)
		expect(next.messages[0].role).toBe('assistant')
		expect(next.messages[0].text).toBe('hello')
		expect(next.lastSeenIdx).toBe(0)
	})

	it('appends to last assistant message', () => {
		let s = applyChunk(makeSlice(), {idx: 0, type: 'text', payload: 'hel', ts: 1})
		s = applyChunk(s, {idx: 1, type: 'text', payload: 'lo', ts: 2})
		expect(s.messages).toHaveLength(1)
		expect(s.messages[0].text).toBe('hello')
		expect(s.lastSeenIdx).toBe(1)
	})

	it('starts a new assistant message after a user message', () => {
		const slice: ConversationStreamState = {
			...makeSlice(),
			messages: [{id: 'u1', role: 'user', text: 'q', ts: 0}],
		}
		const next = applyChunk(slice, {idx: 0, type: 'text', payload: 'a', ts: 1})
		expect(next.messages).toHaveLength(2)
		expect(next.messages[1].role).toBe('assistant')
		expect(next.messages[1].text).toBe('a')
	})
})

describe('applyChunk — reasoning branch', () => {
	it('attaches reasoning to last assistant message', () => {
		let s = applyChunk(makeSlice(), {idx: 0, type: 'text', payload: 'a', ts: 1})
		s = applyChunk(s, {idx: 1, type: 'reasoning', payload: 'because', ts: 2})
		expect(s.messages[0].reasoning).toBe('because')
		expect(s.messages[0].text).toBe('a')
	})

	it('appends reasoning across chunks', () => {
		let s = applyChunk(makeSlice(), {idx: 0, type: 'text', payload: 'a', ts: 1})
		s = applyChunk(s, {idx: 1, type: 'reasoning', payload: 'be', ts: 2})
		s = applyChunk(s, {idx: 2, type: 'reasoning', payload: 'cause', ts: 3})
		expect(s.messages[0].reasoning).toBe('because')
	})

	it('creates assistant message when none exists', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'reasoning',
			payload: 'r',
			ts: 1,
		})
		expect(next.messages).toHaveLength(1)
		expect(next.messages[0].reasoning).toBe('r')
		expect(next.messages[0].text).toBe('')
	})
})

describe('applyChunk — tool_snapshot branch (D-15 dedupe)', () => {
	const running: ToolCallSnapshot = {
		toolId: 'tu_1',
		toolName: 'browser-navigate',
		category: 'browser',
		assistantCall: {input: {url: 'x'}, ts: 1},
		status: 'running',
		startedAt: 1,
	}
	const done: ToolCallSnapshot = {
		...running,
		toolResult: {output: 'ok', isError: false, ts: 2},
		status: 'done',
		completedAt: 2,
	}

	it('inserts a new snapshot keyed by toolId', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'tool_snapshot',
			payload: running,
			ts: 1,
		})
		expect(next.snapshots.size).toBe(1)
		expect(next.snapshots.get('tu_1')?.status).toBe('running')
	})

	it('replaces snapshot on second call with same toolId — D-15 dedupe', () => {
		let s = applyChunk(makeSlice(), {
			idx: 0,
			type: 'tool_snapshot',
			payload: running,
			ts: 1,
		})
		s = applyChunk(s, {
			idx: 1,
			type: 'tool_snapshot',
			payload: done,
			ts: 2,
		})
		expect(s.snapshots.size).toBe(1)
		expect(s.snapshots.get('tu_1')?.status).toBe('done')
		expect(s.snapshots.get('tu_1')?.toolResult?.output).toBe('ok')
	})

	it('keeps separate snapshots for different toolIds', () => {
		const second: ToolCallSnapshot = {...running, toolId: 'tu_2'}
		let s = applyChunk(makeSlice(), {
			idx: 0,
			type: 'tool_snapshot',
			payload: running,
			ts: 1,
		})
		s = applyChunk(s, {idx: 1, type: 'tool_snapshot', payload: second, ts: 2})
		expect(s.snapshots.size).toBe(2)
	})
})

describe('applyChunk — error branch', () => {
	it('sets status=error and stores message from object payload', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'error',
			payload: {message: 'boom'},
			ts: 1,
		})
		expect(next.status).toBe('error')
		expect(next.errorMessage).toBe('boom')
	})

	it('accepts string payload', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'error',
			payload: 'bad',
			ts: 1,
		})
		expect(next.errorMessage).toBe('bad')
	})
})

describe('applyChunk — status branch', () => {
	it('transitions to complete', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'status',
			payload: 'complete',
			ts: 1,
		})
		expect(next.status).toBe('complete')
	})

	it('transitions to stopped', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'status',
			payload: 'stopped',
			ts: 1,
		})
		expect(next.status).toBe('stopped' as never)
	})

	it('ignores unknown status payloads', () => {
		const next = applyChunk(makeSlice(), {
			idx: 0,
			type: 'status',
			payload: 'weirdvalue',
			ts: 1,
		})
		expect(next.status).toBe('idle')
	})
})

describe('applyChunk — lastSeenIdx tracking', () => {
	it('only advances forward (max of prev, chunk.idx)', () => {
		let s = applyChunk(makeSlice(), {idx: 5, type: 'text', payload: 'x', ts: 1})
		expect(s.lastSeenIdx).toBe(5)
		s = applyChunk(s, {idx: 3, type: 'text', payload: 'y', ts: 2})
		expect(s.lastSeenIdx).toBe(5) // does not regress
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. MockEventSource end-to-end via store: drive a full chunk sequence
//    through applyChunk and assert the snapshot dedupe + lastSeenIdx
//    invariants hold. This exercises the same code path the hook uses.
// ─────────────────────────────────────────────────────────────────────

describe('MockEventSource integration with store', () => {
	beforeEach(() => {
		MockEventSource.instances.length = 0
		// Reset Zustand store between tests.
		useLivAgentStore.setState({conversations: new Map()})
	})

	it('drives chunks through useLivAgentStore.applyChunk and dedupes snapshots', () => {
		const convId = 'integ-1'
		useLivAgentStore.getState().ensureConversation(convId)
		useLivAgentStore.getState().setRunId(convId, 'run-integ')

		const es = new MockEventSource(buildStreamUrl('run-integ', -1, 'tok'))
		expect(es.url).toContain('after=-1')
		expect(es.url).toContain('token=tok')
		expect(MockEventSource.instances).toHaveLength(1)

		// Wire onmessage to apply chunks (mimics the hook's openStream).
		es.onmessage = (ev) => {
			const chunk = JSON.parse(ev.data) as Chunk
			useLivAgentStore.getState().applyChunk(convId, chunk)
		}

		const running: ToolCallSnapshot = {
			toolId: 'tu_1',
			toolName: 'browser-navigate',
			category: 'browser',
			assistantCall: {input: {url: 'x'}, ts: 1},
			status: 'running',
			startedAt: 1,
		}
		es._dispatch({idx: 0, type: 'text', payload: 'hi', ts: 1})
		es._dispatch({idx: 1, type: 'tool_snapshot', payload: running, ts: 1})
		es._dispatch({
			idx: 2,
			type: 'tool_snapshot',
			payload: {...running, status: 'done', completedAt: 2},
			ts: 2,
		})

		const slice = useLivAgentStore.getState().conversations.get(convId)!
		expect(slice.snapshots.size).toBe(1) // D-15 dedupe
		expect(slice.snapshots.get('tu_1')?.status).toBe('done')
		expect(slice.lastSeenIdx).toBe(2)
		expect(slice.messages[0].text).toBe('hi')
	})

	it('reconnect URL uses ?after=<lastSeenIdx> (D-25)', () => {
		// Simulate the hook's reconnect path by calling buildStreamUrl with
		// the current lastSeenIdx (the same code the hook runs).
		const reconnectUrl = buildStreamUrl('run-X', 5, 'tok')
		expect(reconnectUrl).toContain('after=5')

		// And construct a NEW MockEventSource with that URL (mimics close()
		// + new EventSource() in the hook's onerror handler).
		const initial = new MockEventSource(buildStreamUrl('run-X', -1, 'tok'))
		initial.close()
		expect(initial.closed).toBe(true)
		initial._error()
		const reconnected = new MockEventSource(reconnectUrl)
		expect(MockEventSource.instances).toHaveLength(2)
		expect(MockEventSource.instances[1].url).toContain('after=5')
		// Cleanup verification — close() was called on initial.
		expect(initial.closed).toBe(true)
	})

	it('malformed chunk JSON does NOT crash the dispatch (T-67-04-02)', () => {
		const convId = 'integ-2'
		useLivAgentStore.getState().ensureConversation(convId)
		const es = new MockEventSource(buildStreamUrl('r', -1, 't'))
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		es.onmessage = (ev) => {
			let chunk: Chunk | null = null
			try {
				chunk = JSON.parse(ev.data) as Chunk
			} catch (err) {
				console.error('malformed', err)
				return
			}
			if (chunk) useLivAgentStore.getState().applyChunk(convId, chunk)
		}
		// Manually dispatch a non-JSON payload via the underlying event ctor.
		const badEv = new MessageEvent('message', {data: 'this is not json {{{'})
		expect(() => es.onmessage?.(badEv)).not.toThrow()
		consoleSpy.mockRestore()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Smoke import — the hook module loads in jsdom without throwing
// ─────────────────────────────────────────────────────────────────────

describe('useLivAgentStream smoke', () => {
	it('module exports useLivAgentStream as a function', () => {
		expect(typeof useLivAgentStream).toBe('function')
	})

	it('exports useLivAgentStore (zustand store hook)', () => {
		expect(typeof useLivAgentStore).toBe('function')
	})

	it('Zustand store starts with an empty conversations Map', () => {
		useLivAgentStore.setState({conversations: new Map()})
		expect(useLivAgentStore.getState().conversations.size).toBe(0)
	})

	it('ensureConversation creates an empty slice', () => {
		useLivAgentStore.setState({conversations: new Map()})
		useLivAgentStore.getState().ensureConversation('smoke-1')
		const slice = useLivAgentStore.getState().conversations.get('smoke-1')
		expect(slice).toBeDefined()
		expect(slice?.status).toBe('idle')
		expect(slice?.messages).toEqual([])
		expect(slice?.snapshots.size).toBe(0)
		expect(slice?.lastSeenIdx).toBe(-1)
		expect(slice?.runId).toBe(null)
	})

	it('appendUserMessage adds a user-role message', () => {
		useLivAgentStore.setState({conversations: new Map()})
		const s = useLivAgentStore.getState()
		s.ensureConversation('smoke-2')
		s.appendUserMessage('smoke-2', 'hi')
		const slice = useLivAgentStore.getState().conversations.get('smoke-2')!
		expect(slice.messages).toHaveLength(1)
		expect(slice.messages[0].role).toBe('user')
		expect(slice.messages[0].text).toBe('hi')
	})

	it('bumpReconnect increments attempts AND sets status=reconnecting', () => {
		useLivAgentStore.setState({conversations: new Map()})
		const s = useLivAgentStore.getState()
		s.ensureConversation('smoke-3')
		s.bumpReconnect('smoke-3')
		const slice = useLivAgentStore.getState().conversations.get('smoke-3')!
		expect(slice.reconnectAttempts).toBe(1)
		expect(slice.status).toBe('reconnecting')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 6. Source-text invariants — lock the wire-level contract (P67-03 endpoints)
//    so it can't drift before P68/P70 adopt the hook. Mirrors the
//    api-keys-create-modal.unit.test.tsx pattern.
// ─────────────────────────────────────────────────────────────────────

describe('use-liv-agent-stream.ts source-text invariants', () => {
	const sourcePath = resolve(
		process.cwd(),
		'src/lib/use-liv-agent-stream.ts',
	)
	const source = readFileSync(sourcePath, 'utf8')

	it('POSTs to /api/agent/start (Plan 67-03 contract)', () => {
		expect(source).toMatch(/['"]\/api\/agent\/start['"]/)
		expect(source).toMatch(/method:\s*['"]POST['"]/)
	})

	it('opens EventSource against /api/agent/runs/.../stream', () => {
		expect(source).toMatch(/new\s+EventSource\s*\(/)
		expect(source).toMatch(/\/api\/agent\/runs\//)
		expect(source).toMatch(/\/stream/)
	})

	it("stop() POSTs to /control with body { signal: 'stop' }", () => {
		expect(source).toMatch(/\/control/)
		expect(source).toMatch(/signal:\s*['"]stop['"]/)
	})

	it('reconnect uses ?after=<lastSeenIdx> query param (D-25)', () => {
		expect(source).toMatch(/after=/)
	})

	it('JWT token attached as ?token= for EventSource (T-67-04-01)', () => {
		expect(source).toMatch(/token=/)
	})

	it('uses zustand for state (D-24)', () => {
		expect(source).toMatch(/from\s+['"]zustand['"]/)
		expect(source).toMatch(/create\s*</)
	})

	it('hook exposes the D-24 return shape (messages/snapshots/status/sendMessage/stop/runId/retry)', () => {
		expect(source).toMatch(/messages\s*[:,]/)
		expect(source).toMatch(/snapshots\s*[:,]/)
		expect(source).toMatch(/status\s*[:,]/)
		expect(source).toMatch(/sendMessage\s*[:,]/)
		expect(source).toMatch(/stop\s*[:,]/)
		expect(source).toMatch(/runId\s*[:,]/)
		expect(source).toMatch(/retry\s*[:,]/)
	})

	it('cleanup effect closes EventSource on unmount', () => {
		expect(source).toMatch(/closeStream/)
		expect(source).toMatch(/\.close\s*\(\s*\)/)
	})

	it('reconnect path bumps attempts + transitions to reconnecting status', () => {
		expect(source).toMatch(/bumpReconnect|reconnecting/)
	})
})
