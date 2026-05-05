/**
 * Phase 76 Plan 76-03 — agent_templates tRPC routes integration tests.
 *
 * Spec source: 76-03-PLAN.md `<task type="auto" tdd="true">` Task 1.
 *
 * Strategy (per plan step 6):
 *   - createCallerFactory + stub Context — mirrors api-keys/routes.test.ts
 *     (the canonical tRPC route test pattern in this codebase).
 *   - Mock the agent-templates repo functions imported via
 *     `../database/index.js` so we can assert the tRPC layer's contract
 *     (input validation, output shape, error mapping, fetch sequencing,
 *     post-success increment) without touching real Postgres.
 *   - `globalThis.fetch` is stubbed via `vi.spyOn(globalThis, 'fetch')`
 *     for the nexus /api/subagents POST — pattern matches Pitfall-3 from
 *     `livinity-broker/mode-dispatch.test.ts` (no msw, no supertest;
 *     D-NO-NEW-DEPS preserved).
 *   - `getPool()` is stubbed to return a non-null sentinel so the
 *     "Database not initialized" guard does not trip; the repo functions
 *     receive that sentinel and our mocks pay no attention to it.
 *
 * Discovered ctx shape (plan step 3 — verify, do NOT guess):
 *   - The route handlers call `getPool()` from `../database/index.js`
 *     (free function, NOT `ctx.livinityd.db.getPool()` as the plan's
 *     interfaces snippet showed). The pool is module-level state. This
 *     mirrors the existing pattern in `platform/routes.ts` and matches
 *     76-01 SUMMARY decisions.
 *   - `ctx.currentUser?.id` is the canonical user id source (matches
 *     existing routes at lines 815, 749 in routes.ts).
 *   - `ctx.livinityd.logger` is the structured logger.
 *
 * 6 cases (per plan behavior block):
 *   T1. listAgentTemplates with no input returns all rows (created_at ASC).
 *   T2. listAgentTemplates({tags:['research']}) propagates the tag filter.
 *   T3. getAgentTemplate({slug:'researcher'}) returns the row.
 *   T4. getAgentTemplate({slug:'nope'}) throws NOT_FOUND.
 *   T5. cloneAgentTemplate happy path: fetch template → POST nexus → on 200
 *       call incrementCloneCount → return nexus body.
 *   T6. cloneAgentTemplate when nexus returns 503: throws TRPCError; clone
 *       count NOT incremented.
 *
 * +1 defensive case: cloneAgentTemplate({slug:'nope'}) throws NOT_FOUND
 * BEFORE attempting any nexus call (T-76-03-05 mitigation guard).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, afterEach, describe, expect, test, vi} from 'vitest'
import {TRPCError} from '@trpc/server'

// ── Mock the database barrel (where the route imports the repo from) ──────
const listAgentTemplatesMock = vi.fn()
const getAgentTemplateMock = vi.fn()
const incrementCloneCountMock = vi.fn()
const getPoolMock = vi.fn()
const getUserPreferenceMock = vi.fn()
const setUserPreferenceMock = vi.fn()

vi.mock('../database/index.js', () => ({
	listAgentTemplates: (...args: unknown[]) => listAgentTemplatesMock(...args),
	getAgentTemplate: (...args: unknown[]) => getAgentTemplateMock(...args),
	incrementCloneCount: (...args: unknown[]) => incrementCloneCountMock(...args),
	getPool: () => getPoolMock(),
	getUserPreference: (...args: unknown[]) => getUserPreferenceMock(...args),
	setUserPreference: (...args: unknown[]) => setUserPreferenceMock(...args),
}))

// ── Stub the per-user-claude module (routes.ts imports it) ─────────────────
// per-user-claude.ts pulls in node-pty + filesystem helpers that are
// expensive/irrelevant for these tests. Empty stub keeps module-load fast.
vi.mock('./per-user-claude.js', () => ({
	isMultiUserMode: () => false,
	ensureUserClaudeDir: vi.fn(),
	spawnPerUserClaudeLogin: vi.fn(),
	checkPerUserClaudeStatus: vi.fn(),
	perUserClaudeLogout: vi.fn(),
}))

// Import the router AFTER vi.mock — vi hoists vi.mock() to top so this is fine.
import aiRouter from './routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(aiRouter)

const SENTINEL_POOL = {__sentinel: 'pool'} as any

function makeCtx(opts: {role?: 'admin' | 'member' | 'guest'; userId?: string} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'ws',
		currentUser: {
			id: opts.userId ?? 'user-A',
			username: 'alice',
			role: opts.role ?? 'member',
		},
		livinityd: {
			logger: {
				log: () => {},
				verbose: () => {},
				error: () => {},
				createChildLogger: () => ({log: () => {}, verbose: () => {}, error: () => {}}),
			},
			ai: {
				redis: {} as any,
				toolRegistry: {list: () => [], get: () => undefined},
				chatStatus: new Map(),
				activeStreams: new Map(),
			},
		},
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
		},
	} as never
}

function makeTemplateRow(overrides: Partial<any> = {}) {
	return {
		slug: 'researcher',
		name: 'Researcher',
		description: 'Deep research agent',
		systemPrompt: 'You are a research expert.',
		toolsEnabled: ['Bash', 'Read', 'WebFetch'],
		tags: ['research'],
		mascotEmoji: '🔬',
		cloneCount: 7,
		createdAt: new Date('2026-05-04T00:00:00Z'),
		...overrides,
	}
}

describe('agent-templates tRPC routes (Phase 76 Plan 76-03)', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn> | null = null

	beforeEach(() => {
		listAgentTemplatesMock.mockReset()
		getAgentTemplateMock.mockReset()
		incrementCloneCountMock.mockReset()
		getPoolMock.mockReset().mockReturnValue(SENTINEL_POOL)
	})

	afterEach(() => {
		if (fetchSpy) {
			fetchSpy.mockRestore()
			fetchSpy = null
		}
		vi.restoreAllMocks()
	})

	test('T1 — listAgentTemplates() with no input forwards undefined opts and returns all rows', async () => {
		const rows = [makeTemplateRow({slug: 'general'}), makeTemplateRow({slug: 'researcher'})]
		listAgentTemplatesMock.mockResolvedValueOnce(rows)

		const caller = createCaller(makeCtx())
		const result = await caller.listAgentTemplates()

		expect(result).toEqual(rows)
		expect(listAgentTemplatesMock).toHaveBeenCalledTimes(1)
		const [poolArg, optsArg] = listAgentTemplatesMock.mock.calls[0]
		expect(poolArg).toBe(SENTINEL_POOL)
		// Caller passes through undefined or {tags: undefined} — both honored
		// by the repo's `opts?.tags && opts.tags.length > 0` guard.
		expect(optsArg === undefined || (optsArg && (optsArg.tags === undefined || optsArg.tags.length === 0))).toBe(true)
	})

	test('T2 — listAgentTemplates({tags:["research"]}) forwards the tag filter to the repo', async () => {
		const rows = [makeTemplateRow()]
		listAgentTemplatesMock.mockResolvedValueOnce(rows)

		const caller = createCaller(makeCtx())
		const result = await caller.listAgentTemplates({tags: ['research']})

		expect(result).toEqual(rows)
		expect(listAgentTemplatesMock).toHaveBeenCalledTimes(1)
		const [poolArg, optsArg] = listAgentTemplatesMock.mock.calls[0]
		expect(poolArg).toBe(SENTINEL_POOL)
		expect(optsArg).toEqual({tags: ['research']})
	})

	test('T3 — getAgentTemplate({slug:"researcher"}) returns the mapped row', async () => {
		const row = makeTemplateRow()
		getAgentTemplateMock.mockResolvedValueOnce(row)

		const caller = createCaller(makeCtx())
		const result = await caller.getAgentTemplate({slug: 'researcher'})

		expect(result).toEqual(row)
		expect(getAgentTemplateMock).toHaveBeenCalledWith(SENTINEL_POOL, 'researcher')
	})

	test('T4 — getAgentTemplate({slug:"nope"}) throws TRPCError NOT_FOUND', async () => {
		getAgentTemplateMock.mockResolvedValueOnce(null)

		const caller = createCaller(makeCtx())
		await expect(caller.getAgentTemplate({slug: 'nope'})).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: expect.stringMatching(/template/i),
		})
	})

	test('T5 — cloneAgentTemplate({slug:"researcher"}): fetches template → POSTs nexus → on 200 increments clone_count → returns nexus body', async () => {
		const row = makeTemplateRow()
		getAgentTemplateMock.mockResolvedValueOnce(row)
		incrementCloneCountMock.mockResolvedValueOnce(true)

		const nexusResponseBody = {
			id: 'researcher-user-A-1746409200000',
			name: 'Researcher',
			status: 'active',
		}
		fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(JSON.stringify(nexusResponseBody), {
				status: 200,
				headers: {'Content-Type': 'application/json'},
			}) as any,
		)

		const caller = createCaller(makeCtx({userId: 'user-A'}))
		const result = await caller.cloneAgentTemplate({slug: 'researcher'})

		expect(result).toEqual(nexusResponseBody)

		// Sequence + sequencing:
		expect(getAgentTemplateMock).toHaveBeenCalledWith(SENTINEL_POOL, 'researcher')
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		const [urlArg, initArg] = fetchSpy!.mock.calls[0] as [string, RequestInit]
		expect(String(urlArg)).toMatch(/\/api\/subagents$/)
		expect(initArg.method).toBe('POST')
		const headers = initArg.headers as Record<string, string>
		expect(headers['Content-Type']).toBe('application/json')

		const sentBody = JSON.parse(initArg.body as string)
		// Body shape: matches existing createSubagent contract (D-09).
		expect(sentBody.systemPrompt).toBe(row.systemPrompt)
		expect(sentBody.skills ?? sentBody.tools).toEqual(row.toolsEnabled)
		expect(typeof sentBody.id).toBe('string')
		expect(sentBody.id.length).toBeGreaterThan(0)
		expect(sentBody.id.length).toBeLessThanOrEqual(64)
		expect(sentBody.id.startsWith('researcher-')).toBe(true)
		expect(sentBody.name).toBe(row.name)
		expect(sentBody.description).toBe(row.description)
		expect(sentBody.status).toBe('active')
		expect(sentBody.createdBy).toMatch(/marketplace|clone/)

		// Increment is invoked AFTER nexus 200 (T-76-03-05 mitigation).
		expect(incrementCloneCountMock).toHaveBeenCalledTimes(1)
		expect(incrementCloneCountMock).toHaveBeenCalledWith(SENTINEL_POOL, 'researcher')
	})

	test('T6 — cloneAgentTemplate when nexus returns 503 throws TRPCError; clone count NOT incremented', async () => {
		const row = makeTemplateRow()
		getAgentTemplateMock.mockResolvedValueOnce(row)

		fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response('service unavailable', {
				status: 503,
				headers: {'Content-Type': 'text/plain'},
			}) as any,
		)

		const caller = createCaller(makeCtx())

		await expect(caller.cloneAgentTemplate({slug: 'researcher'})).rejects.toBeInstanceOf(TRPCError)

		// Nexus was called exactly once.
		expect(fetchSpy).toHaveBeenCalledTimes(1)
		// Increment was NEVER called (T-76-03-05 — no count drift).
		expect(incrementCloneCountMock).not.toHaveBeenCalled()
	})

	test('T7 (defensive) — cloneAgentTemplate({slug:"nope"}) throws NOT_FOUND BEFORE any nexus call (T-76-03-05 guard)', async () => {
		getAgentTemplateMock.mockResolvedValueOnce(null)
		fetchSpy = vi.spyOn(globalThis, 'fetch')

		const caller = createCaller(makeCtx())
		await expect(caller.cloneAgentTemplate({slug: 'nope'})).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})

		expect(fetchSpy).not.toHaveBeenCalled()
		expect(incrementCloneCountMock).not.toHaveBeenCalled()
	})
})
