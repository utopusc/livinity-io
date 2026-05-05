/**
 * Phase 75-06 — conversation-search HTTP route tests.
 *
 * Mounts `mountConversationSearchRoute(app, livinityd, options)` against an
 * Express test harness with `app.listen(0)` + native `fetch`, mirroring the
 * P67-03 agent-runs.test.ts pattern (no supertest — D-NO-NEW-DEPS).
 *
 * Coverage (CONTEXT D-29..D-31):
 *   1. q='' returns 200 with empty results, no DB call (D-30 short-circuit).
 *   2. q='a' (length 1) returns 200 with empty results, no DB call.
 *   3. q='x'.repeat(201) returns 400 'query too long'.
 *   4. valid q calls repository.search(userId, q, 25) and returns mapped JSON.
 *   5. Missing JWT returns 401 'unauthorized'.
 *   6. Repository throw returns 500 'search failed'.
 *
 * Repository injected via `messagesRepoOverride`; auth injected via
 * `authOverride` for the 4 success-path tests; the auth-failure test omits
 * the override so the real default JWT auth runs against a stub server with
 * no Authorization header.
 *
 * @vitest-environment node
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import http, {type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import express from 'express'

import {mountConversationSearchRoute} from './conversation-search.js'

// ── Test harness ──────────────────────────────────────────────────────────

interface BuildOptions {
	authUserId?: string | null
	repoSearch?: (userId: string, q: string, limit: number) => Promise<any[]>
	skipAuthOverride?: boolean
}

interface Harness {
	server: Server
	url: string
	repoSearchCalls: Array<{userId: string; q: string; limit: number}>
	close: () => Promise<void>
}

async function buildHarness(opts: BuildOptions = {}): Promise<Harness> {
	const repoSearchCalls: Array<{userId: string; q: string; limit: number}> = []
	const repoSearch = opts.repoSearch ?? (async () => [])

	const app = express()
	app.use(express.json())

	// Stub livinityd shape — only the bits conversation-search.ts touches.
	const stubLivinityd: any = {
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
			createChildLogger: () => ({
				log: () => {},
				verbose: () => {},
				error: () => {},
			}),
		},
		server: {
			verifyToken: async (_token: string) => {
				if (opts.authUserId === null) throw new Error('invalid token')
				return {loggedIn: true, userId: opts.authUserId ?? 'user_test', role: 'admin'}
			},
		},
	}

	const messagesRepoOverride = {
		search: async (userId: string, q: string, limit: number) => {
			repoSearchCalls.push({userId, q, limit})
			return repoSearch(userId, q, limit)
		},
	}

	mountConversationSearchRoute(app, stubLivinityd, {
		messagesRepoOverride,
		authOverride: opts.skipAuthOverride
			? undefined
			: (req: any, _res: any, next: any) => {
					req.agentRunsUserId = opts.authUserId ?? 'user_test'
					next()
				},
	})

	const server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, () => resolve(s))
	})
	const port = (server.address() as AddressInfo).port
	const url = `http://127.0.0.1:${port}`

	const close = async (): Promise<void> => {
		try {
			;(server as any).closeAllConnections?.()
		} catch {
			/* noop */
		}
		await new Promise<void>((resolve) => server.close(() => resolve()))
	}

	return {server, url, repoSearchCalls, close}
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/conversations/search', () => {
	let h: Harness | null = null
	afterEach(async () => {
		if (h) await h.close()
		h = null
		vi.restoreAllMocks()
	})

	it('returns 200 + empty results for q=\'\' (no DB call) — D-30', async () => {
		h = await buildHarness()
		const res = await fetch(`${h.url}/api/conversations/search?q=`)
		expect(res.status).toBe(200)
		const body = (await res.json()) as {query: string; count: number; results: any[]}
		expect(body.count).toBe(0)
		expect(body.results).toEqual([])
		expect(h.repoSearchCalls.length).toBe(0)
	})

	it('returns 200 + empty results for q=\'a\' (length<2) — D-30', async () => {
		h = await buildHarness()
		const res = await fetch(`${h.url}/api/conversations/search?q=a`)
		expect(res.status).toBe(200)
		const body = (await res.json()) as {count: number; results: any[]}
		expect(body.count).toBe(0)
		expect(body.results).toEqual([])
		expect(h.repoSearchCalls.length).toBe(0)
	})

	it('returns 400 \'query too long\' for q>200 chars — T-75-06-04', async () => {
		h = await buildHarness()
		const longQ = 'x'.repeat(201)
		const res = await fetch(`${h.url}/api/conversations/search?q=${longQ}`)
		expect(res.status).toBe(400)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('query too long')
		expect(h.repoSearchCalls.length).toBe(0)
	})

	it('calls repository.search(userId, q, 25) and returns mapped JSON — D-29', async () => {
		const fakeRow = {
			messageId: 'm1',
			conversationId: 'c1',
			conversationTitle: 'My Chat',
			role: 'user' as const,
			snippet: 'hello <mark>world</mark>',
			createdAt: new Date('2026-05-01T12:00:00Z'),
			rank: 0.42,
		}
		h = await buildHarness({
			authUserId: 'u1',
			repoSearch: async () => [fakeRow],
		})

		const res = await fetch(`${h.url}/api/conversations/search?q=hello`)
		expect(res.status).toBe(200)
		const body = (await res.json()) as {query: string; count: number; results: any[]}
		expect(body.query).toBe('hello')
		expect(body.count).toBe(1)
		expect(body.results).toHaveLength(1)
		expect(body.results[0]).toMatchObject({
			messageId: 'm1',
			conversationId: 'c1',
			conversationTitle: 'My Chat',
			role: 'user',
			snippet: 'hello <mark>world</mark>',
			createdAt: '2026-05-01T12:00:00.000Z',
			rank: 0.42,
		})
		expect(h.repoSearchCalls).toHaveLength(1)
		expect(h.repoSearchCalls[0]).toEqual({userId: 'u1', q: 'hello', limit: 25})
	})

	it('returns 401 unauthorized when no Authorization header is present — T-75-06-02', async () => {
		// Skip the test authOverride so the real default JWT auth helper runs.
		h = await buildHarness({skipAuthOverride: true})
		const res = await fetch(`${h.url}/api/conversations/search?q=hello`)
		expect(res.status).toBe(401)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('unauthorized')
		expect(h.repoSearchCalls.length).toBe(0)
	})

	it('returns 500 \'search failed\' when the repository throws', async () => {
		h = await buildHarness({
			authUserId: 'u1',
			repoSearch: async () => {
				throw new Error('pg blew up')
			},
		})
		const res = await fetch(`${h.url}/api/conversations/search?q=hello`)
		expect(res.status).toBe(500)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('search failed')
	})
})
