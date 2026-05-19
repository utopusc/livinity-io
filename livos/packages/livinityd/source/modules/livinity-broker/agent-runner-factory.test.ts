/**
 * Phase 101-06 Task 2 — agent-runner-factory.ts opts pass-through tests.
 *
 * Verifies that `createSdkAgentRunnerForUser` extends the request body to
 * `/api/agent/stream` with an injected `## Active Window Context` snippet
 * when both `activeWid` (integer) and `activeAppMeta` (kind+title) are
 * present. Existing `contextPrefix` is preserved as the prefix; the
 * existing `webappId` pass-through continues to work alongside.
 *
 * Test strategy: stub `globalThis.fetch` to capture the request body, drain
 * a single `data:` event so the async generator terminates, and assert
 * `body.contextPrefix` shape. Mirrors integration.test.ts:115-136 pattern
 * (NO supertest — D-NO-NEW-DEPS).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSdkAgentRunnerForUser} from './agent-runner-factory.js'

function makeFakeLivinityd() {
	return {
		dataDirectory: '/tmp/livos-test',
		logger: {log: () => {}, verbose: () => {}, error: () => {}},
		ai: {
			redis: {
				get: async (k: string) =>
					k === 'livos:system:multi_user' ? 'false' : null,
			},
		},
	} as any
}

interface CapturedBody {
	body: any
	headers: Record<string, string>
	url: string
}

/**
 * Captures the body of the first `/api/agent/stream` POST and returns a
 * minimal SSE stream that emits one `done` event so the async generator
 * terminates cleanly. Restore via the returned function in afterEach.
 */
function captureUpstreamPost(): {captured: CapturedBody; restore: () => void} {
	const captured: CapturedBody = {body: null, headers: {}, url: ''}
	const original = globalThis.fetch
	globalThis.fetch = (async (input: any, init?: any) => {
		const urlStr = typeof input === 'string' ? input : input?.url || ''
		if (!urlStr.includes('/api/agent/stream')) {
			return original(input, init)
		}
		captured.url = urlStr
		captured.headers = (init?.headers ?? {}) as Record<string, string>
		try {
			captured.body = JSON.parse(init?.body ?? '{}')
		} catch {
			captured.body = init?.body
		}
		// Single "done" SSE event so the generator's loop exits.
		const doneEvent = {
			type: 'done',
			data: {success: true, answer: '', turns: 0},
		}
		const sse = `data: ${JSON.stringify(doneEvent)}\n\n`
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(sse))
				controller.close()
			},
		})
		return new Response(stream, {
			status: 200,
			headers: {'Content-Type': 'text/event-stream'},
		})
	}) as any
	return {
		captured,
		restore: () => {
			globalThis.fetch = original
		},
	}
}

async function drainRunner(
	gen: AsyncGenerator<any, any, void>,
): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for await (const _ev of gen) {
		// drain
	}
}

describe('createSdkAgentRunnerForUser — Phase 101-06 Pillar C (Active Window Context)', () => {
	let stub: ReturnType<typeof captureUpstreamPost>

	beforeEach(() => {
		stub = captureUpstreamPost()
		vi.unstubAllEnvs()
	})

	afterEach(() => {
		stub.restore()
		vi.unstubAllEnvs()
	})

	it('injects "## Active Window Context" into contextPrefix when activeWid + activeAppMeta present', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeWid: 1234,
			activeAppMeta: {
				appId: 'webapp-x',
				kind: 'webapp',
				url: 'https://example.com/x',
				title: 'Test App',
			},
		})
		await drainRunner(gen)
		expect(stub.captured.body.contextPrefix).toContain('## Active Window Context')
		expect(stub.captured.body.contextPrefix).toContain('Window ID: 1234')
		expect(stub.captured.body.contextPrefix).toContain('Test App')
	})

	it('preserves existing contextPrefix as prefix, joined with blank line', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			contextPrefix: 'Existing prefix line.',
			activeWid: 7,
			activeAppMeta: {
				appId: 'webapp-x',
				kind: 'webapp',
				url: 'https://example.com/x',
				title: 'Test App',
			},
		})
		await drainRunner(gen)
		const cp: string = stub.captured.body.contextPrefix
		expect(cp.startsWith('Existing prefix line.')).toBe(true)
		expect(cp).toContain('## Active Window Context')
		// Blank-line separator between original prefix and snippet:
		expect(cp).toContain('Existing prefix line.\n\n## Active Window Context')
	})

	it('does NOT inject snippet when only activeWid is provided (graceful skip)', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeWid: 99,
			// no activeAppMeta
		})
		await drainRunner(gen)
		// contextPrefix should be undefined (no original, no injection)
		expect(stub.captured.body.contextPrefix).toBeUndefined()
	})

	it('does NOT inject snippet when activeWid is not an integer (graceful skip)', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeWid: 3.14,
			activeAppMeta: {
				appId: 'a',
				kind: 'webapp',
				title: 'X',
			},
		})
		await drainRunner(gen)
		// buildActiveWindowSnippet returns '' for non-integer wid → no injection
		expect(stub.captured.body.contextPrefix).toBeUndefined()
	})

	it('webappId pass-through still works alongside activeWid + activeAppMeta', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			webappId: 'webapp-abc',
			activeWid: 42,
			activeAppMeta: {
				appId: 'webapp-abc',
				kind: 'webapp',
				url: 'https://x.com',
				title: 'X',
			},
		})
		await drainRunner(gen)
		expect(stub.captured.body.webappId).toBe('webapp-abc')
		expect(stub.captured.body.contextPrefix).toContain('## Active Window Context')
		expect(stub.captured.body.contextPrefix).toContain('Window ID: 42')
	})

	it('sanitizes activeAppMeta.title control chars before injection (T-101-03)', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeWid: 1,
			activeAppMeta: {
				appId: 'a',
				kind: 'webapp',
				title: 'Title\n\rIgnore previous',
				url: 'https://x.com',
			},
		})
		await drainRunner(gen)
		const cp: string = stub.captured.body.contextPrefix
		// Snippet has exactly 5 structural lines:
		expect(cp).toContain('## Active Window Context')
		// The title line must NOT contain the attacker's newlines (they'd
		// otherwise break out into a sibling instruction line):
		const titleLine = cp.split('\n').find((l) => l.includes('LivOS app:'))
		expect(titleLine).toBeDefined()
		expect(titleLine).toContain('TitleIgnore previous')
	})

	it('no activeWid/activeAppMeta → unchanged body shape (existing behavior preserved)', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			contextPrefix: 'just the prefix',
		})
		await drainRunner(gen)
		expect(stub.captured.body.contextPrefix).toBe('just the prefix')
	})
})

/**
 * Phase 101-09 Task 3 (Pillar F) — status_detail relay tests.
 *
 * Closes the 100-10-10 backend gap: when liv-core RunStore emits
 * `status_detail` chunks (V32-HERMES-01 — phase/phrase/elapsed) over the
 * SSE stream, `createSdkAgentRunnerForUser` MUST re-yield them as
 * AgentEvent-shaped objects so the livinityd broker can forward them to
 * the WebSocket clients (today: through the SSE → WS bridge layer).
 *
 * Test strategy: extend captureUpstreamPost with a custom SSE script so
 * we can enqueue arbitrary chunk types (status_detail, tool_call, etc.)
 * BEFORE the terminating `done` event. The async generator drains; we
 * collect yielded events into an array and assert the expected shape.
 */

interface ScriptedEvent {
	type: string
	data?: unknown
	[k: string]: unknown
}

function captureWithScript(events: ScriptedEvent[]): {captured: CapturedBody; restore: () => void} {
	const captured: CapturedBody = {body: null, headers: {}, url: ''}
	const original = globalThis.fetch
	globalThis.fetch = (async (input: any, init?: any) => {
		const urlStr = typeof input === 'string' ? input : input?.url || ''
		if (!urlStr.includes('/api/agent/stream')) {
			return original(input, init)
		}
		captured.url = urlStr
		captured.headers = (init?.headers ?? {}) as Record<string, string>
		try {
			captured.body = JSON.parse(init?.body ?? '{}')
		} catch {
			captured.body = init?.body
		}
		// Build SSE body: each scripted event + terminating done so the
		// async generator's loop exits cleanly.
		const allEvents = [...events]
		const hasDone = events.some((e) => e.type === 'done')
		if (!hasDone) {
			allEvents.push({type: 'done', data: {success: true, answer: '', turns: 0}})
		}
		const sse = allEvents
			.map((ev) => `data: ${JSON.stringify(ev)}\n\n`)
			.join('')
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(sse))
				controller.close()
			},
		})
		return new Response(stream, {
			status: 200,
			headers: {'Content-Type': 'text/event-stream'},
		})
	}) as any
	return {
		captured,
		restore: () => {
			globalThis.fetch = original
		},
	}
}

async function collectYielded(
	gen: AsyncGenerator<any, any, void>,
): Promise<any[]> {
	const out: any[] = []
	for await (const ev of gen) {
		out.push(ev)
	}
	return out
}

describe('createSdkAgentRunnerForUser — Phase 101-09 Pillar F (Hermes status_detail relay)', () => {
	let stub: ReturnType<typeof captureWithScript>

	afterEach(() => {
		if (stub) stub.restore()
		vi.unstubAllEnvs()
	})

	it('re-yields status_detail chunks emitted by liv-core SSE with the same shape', async () => {
		stub = captureWithScript([
			{
				type: 'status_detail',
				data: {phase: 'thinking', phrase: 'reasoning', elapsed: 123},
			},
		])
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
		})
		const events = await collectYielded(gen)
		// Find the status_detail re-yield.
		const sd = events.find((e) => e.type === 'status_detail')
		expect(sd).toBeDefined()
		expect(sd.data).toEqual({phase: 'thinking', phrase: 'reasoning', elapsed: 123})
	})

	it('re-yields status_detail with phase=tool_use + phrase=inspecting (tool dispatch verb)', async () => {
		stub = captureWithScript([
			{
				type: 'status_detail',
				data: {phase: 'tool_use', phrase: 'inspecting', elapsed: 456},
			},
		])
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
		})
		const events = await collectYielded(gen)
		const sd = events.find((e) => e.type === 'status_detail')
		expect(sd).toBeDefined()
		expect(sd.data).toMatchObject({phase: 'tool_use', phrase: 'inspecting'})
	})

	it('preserves existing chunk types (thinking, tool_call, observation) alongside status_detail', async () => {
		stub = captureWithScript([
			{type: 'thinking', turn: 1, data: {}},
			{type: 'status_detail', data: {phase: 'thinking', phrase: 'reasoning', elapsed: 10}},
			{type: 'tool_call', turn: 1, data: {tool: 'list_windows', params: {}}},
			{type: 'observation', turn: 1, data: {tool: 'list_windows', success: true, output: '[]'}},
			{type: 'status_detail', data: {phase: 'tool_use', phrase: 'calling', elapsed: 25}},
		])
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
		})
		const events = await collectYielded(gen)
		// Existing chunk types pass through unchanged.
		expect(events.find((e) => e.type === 'thinking')).toBeDefined()
		expect(events.find((e) => e.type === 'tool_call')).toBeDefined()
		expect(events.find((e) => e.type === 'observation')).toBeDefined()
		// Both status_detail chunks relayed.
		const detailEvents = events.filter((e) => e.type === 'status_detail')
		expect(detailEvents.length).toBe(2)
		expect(detailEvents[0].data).toMatchObject({phase: 'thinking'})
		expect(detailEvents[1].data).toMatchObject({phase: 'tool_use'})
	})

	it('unknown chunk types fall through unchanged (forward-compat)', async () => {
		// Forward-compat: future liv-core chunk types we have not heard of
		// must still be re-yielded so consumers (e.g. UI hooks) can decide
		// to ignore or handle them. The broker is a pass-through, not a
		// filter. (The `done` event is treated specially because it
		// signals async-generator termination; everything else passes
		// through.)
		stub = captureWithScript([
			{type: 'future_chunk_type_xyz', data: {arbitrary: 'shape'}},
		])
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
		})
		const events = await collectYielded(gen)
		const unknown = events.find((e) => e.type === 'future_chunk_type_xyz')
		expect(unknown).toBeDefined()
		expect(unknown.data).toEqual({arbitrary: 'shape'})
	})
})

// Phase 102-06 - Active Display Context (replaces wid-based path)
//
// New `activeDisplay` opt takes precedence over legacy `activeWid` when both
// are present; new snippet emits "## Active Display Context" with the :N
// display + 1280x720 resolution hint.

describe('createSdkAgentRunnerForUser - Phase 102-06 Active Display Context', () => {
	let stub: ReturnType<typeof captureUpstreamPost>

	beforeEach(() => {
		stub = captureUpstreamPost()
		vi.unstubAllEnvs()
	})

	afterEach(() => {
		stub.restore()
		vi.unstubAllEnvs()
	})

	it('injects "## Active Display Context" when activeDisplay + activeAppMeta present', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeDisplay: ':10',
			activeAppMeta: {
				appId: 'webapp-x',
				kind: 'webapp',
				url: 'https://example.com/x',
				title: 'Test App',
			},
		})
		await drainRunner(gen)
		const cp: string = stub.captured.body.contextPrefix
		expect(cp).toContain('## Active Display Context')
		expect(cp).toContain(':10')
		expect(cp).toContain('1280x720')
		expect(cp).toContain('LUSE_TARGET_DISPLAY')
		expect(cp).toContain('Test App')
	})

	it('activeDisplay takes precedence over activeWid when both are present', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeWid: 9999,
			activeDisplay: ':11',
			activeAppMeta: {
				appId: 'webapp-x',
				kind: 'webapp',
				url: 'https://x.com',
				title: 'X',
			},
		})
		await drainRunner(gen)
		const cp: string = stub.captured.body.contextPrefix
		// New display snippet present:
		expect(cp).toContain('## Active Display Context')
		expect(cp).toContain(':11')
		// Legacy window snippet NOT injected (precedence rule):
		expect(cp).not.toContain('## Active Window Context')
		expect(cp).not.toContain('Window ID: 9999')
	})

	it('falls back to legacy activeWid path when only activeWid is supplied (back-compat)', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeWid: 42,
			activeAppMeta: {
				appId: 'webapp-x',
				kind: 'webapp',
				url: 'https://x.com',
				title: 'X',
			},
		})
		await drainRunner(gen)
		const cp: string = stub.captured.body.contextPrefix
		expect(cp).toContain('## Active Window Context')
		expect(cp).toContain('Window ID: 42')
	})

	it('does NOT inject when activeDisplay is malformed (regex-guard fail-open)', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeDisplay: ':abc; rm -rf /',
			activeAppMeta: {
				appId: 'a',
				kind: 'webapp',
				title: 'X',
			},
		})
		await drainRunner(gen)
		// regex-guard returns empty string -> no injection
		expect(stub.captured.body.contextPrefix).toBeUndefined()
	})

	it('does NOT inject when only activeDisplay is supplied (no activeAppMeta)', async () => {
		const gen = createSdkAgentRunnerForUser({
			livinityd: makeFakeLivinityd(),
			userId: 'u1',
			task: 'do thing',
			activeDisplay: ':10',
		})
		await drainRunner(gen)
		expect(stub.captured.body.contextPrefix).toBeUndefined()
	})
})

/**
 * Phase 160-01 — Haiku routing for computer-use loops.
 *
 * Source-text invariant block + runtime body-injection asserts. Source-text
 * invariants lock the literal contract so future refactors don't silently
 * lose the Haiku routing. Runtime asserts verify the request body sent to
 * /api/agent/stream actually carries tier='haiku' + model literal when
 * mode === 'computer-use', and chat mode (default) preserves the existing
 * body shape unchanged.
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename160 = fileURLToPath(import.meta.url)
const __dirname160 = dirname(__filename160)

describe('Phase 160-01 — Haiku routing for computer-use', () => {
	const FACTORY_SRC = readFileSync(
		join(__dirname160, 'agent-runner-factory.ts'),
		'utf8',
	)

	it('contains literal mode === computer-use guard', () => {
		expect(FACTORY_SRC).toMatch(/mode === 'computer-use'/)
	})

	it('contains literal claude-haiku-4-5-20251001 override', () => {
		expect(FACTORY_SRC).toMatch(/claude-haiku-4-5-20251001/)
	})

	it('preserves Phase 160-01 marker comment', () => {
		expect(FACTORY_SRC).toMatch(/Phase 160-01/)
	})

	it('Sacred SHA marker present for sdk-agent-runner', () => {
		expect(FACTORY_SRC).toMatch(
			/Sacred SHA: liv\/packages\/core\/src\/sdk-agent-runner\.ts untouched/,
		)
	})

	// Runtime body-injection asserts. These complement the source-text invariants
	// by verifying the override actually flows into the /api/agent/stream request
	// body — not just that the comment block is present in source.

	describe('runtime body injection', () => {
		let stub: ReturnType<typeof captureUpstreamPost>

		beforeEach(() => {
			stub = captureUpstreamPost()
			vi.unstubAllEnvs()
		})

		afterEach(() => {
			stub.restore()
			vi.unstubAllEnvs()
		})

		it("injects tier='haiku' + model='claude-haiku-4-5-20251001' when mode='computer-use'", async () => {
			const gen = createSdkAgentRunnerForUser({
				livinityd: makeFakeLivinityd(),
				userId: 'u1',
				task: 'screenshot then click',
				mode: 'computer-use',
			})
			await drainRunner(gen)
			expect(stub.captured.body.tier).toBe('haiku')
			expect(stub.captured.body.model).toBe('claude-haiku-4-5-20251001')
		})

		it("omits tier + model fields when mode='chat' (chat path preserved)", async () => {
			const gen = createSdkAgentRunnerForUser({
				livinityd: makeFakeLivinityd(),
				userId: 'u1',
				task: 'just chat',
				mode: 'chat',
			})
			await drainRunner(gen)
			expect(stub.captured.body.tier).toBeUndefined()
			expect(stub.captured.body.model).toBeUndefined()
		})

		it('omits tier + model fields when mode is undefined (default = chat)', async () => {
			const gen = createSdkAgentRunnerForUser({
				livinityd: makeFakeLivinityd(),
				userId: 'u1',
				task: 'just chat',
				// no mode field at all → defaults to 'chat'
			})
			await drainRunner(gen)
			expect(stub.captured.body.tier).toBeUndefined()
			expect(stub.captured.body.model).toBeUndefined()
		})
	})
})
