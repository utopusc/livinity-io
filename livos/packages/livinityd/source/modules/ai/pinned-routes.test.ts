/**
 * Phase 75-07 — pinned-routes HTTP route tests.
 *
 * Mounts `mountPinnedRoutes(app, livinityd, options)` against an Express test
 * harness with `app.listen(0)` + native `fetch`, mirroring the P67-03
 * agent-runs.test.ts and P75-06 conversation-search.test.ts pattern (no
 * supertest — D-NO-NEW-DEPS).
 *
 * Coverage (CONTEXT D-19 + 75-07 must-haves):
 *   1. Missing JWT returns 401 'unauthorized' (auth fail).
 *   2. POST creates a pin and returns 200 { id }.
 *   3. POST with empty content returns 400.
 *   4. DELETE removes a pin and returns 200 { ok: true }.
 *   5. GET returns user's pins as { count, results: [...] }.
 *   6. Repository throw on POST returns 500 'pin operation failed'.
 *
 * Repository injected via `pinnedRepoOverride`; auth injected via `authOverride`
 * for the success-path tests; the auth-failure test omits the override so the
 * real default JWT auth runs against a stub server with no Authorization
 * header.
 *
 * @vitest-environment node
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, afterEach, vi} from 'vitest'
import http, {type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import express from 'express'

import {mountPinnedRoutes} from './pinned-routes.js'

// ── Test harness ──────────────────────────────────────────────────────────

interface BuildOptions {
	authUserId?: string | null
	repo?: {
		pin?: (input: any) => Promise<string>
		unpin?: (userId: string, messageId: string) => Promise<void>
		unpinById?: (userId: string, pinId: string) => Promise<void>
		listForUser?: (userId: string, limit?: number) => Promise<any[]>
	}
	skipAuthOverride?: boolean
}

interface Harness {
	server: Server
	url: string
	calls: {
		pin: any[]
		unpin: any[]
		unpinById: any[]
		listForUser: any[]
	}
	close: () => Promise<void>
}

async function buildHarness(opts: BuildOptions = {}): Promise<Harness> {
	const calls = {
		pin: [] as any[],
		unpin: [] as any[],
		unpinById: [] as any[],
		listForUser: [] as any[],
	}

	const app = express()
	app.use(express.json())

	// Stub livinityd shape — only the bits pinned-routes.ts touches.
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

	const pinnedRepoOverride = {
		pin: async (input: any) => {
			calls.pin.push(input)
			return opts.repo?.pin ? await opts.repo.pin(input) : 'pin_id_default'
		},
		unpin: async (userId: string, messageId: string) => {
			calls.unpin.push({userId, messageId})
			if (opts.repo?.unpin) await opts.repo.unpin(userId, messageId)
		},
		unpinById: async (userId: string, pinId: string) => {
			calls.unpinById.push({userId, pinId})
			if (opts.repo?.unpinById) await opts.repo.unpinById(userId, pinId)
		},
		listForUser: async (userId: string, limit?: number) => {
			calls.listForUser.push({userId, limit})
			return opts.repo?.listForUser ? await opts.repo.listForUser(userId, limit) : []
		},
	}

	mountPinnedRoutes(app, stubLivinityd, {
		pinnedRepoOverride,
		authOverride: opts.skipAuthOverride
			? undefined
			: (req: any, _res: any, next: any) => {
					req.pinnedRoutesUserId = opts.authUserId ?? 'user_test'
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

	return {server, url, calls, close}
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('pinned-routes', () => {
	let h: Harness | null = null
	afterEach(async () => {
		if (h) await h.close()
		h = null
		vi.restoreAllMocks()
	})

	it('GET /api/pinned-messages returns 401 unauthorized when no JWT is present', async () => {
		// Skip the test authOverride so the real default JWT auth helper runs.
		h = await buildHarness({skipAuthOverride: true})
		const res = await fetch(`${h.url}/api/pinned-messages`)
		expect(res.status).toBe(401)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('unauthorized')
		expect(h.calls.listForUser.length).toBe(0)
	})

	it('POST /api/pinned-messages creates a pin and returns 200 { id }', async () => {
		h = await buildHarness({
			authUserId: 'u1',
			repo: {
				pin: async (_input) => 'new_pin_id_42',
			},
		})
		const res = await fetch(`${h.url}/api/pinned-messages`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				messageId: 'msg_abc',
				conversationId: 'conv_xyz',
				content: 'remember this fact',
				label: 'fact',
			}),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {id: string}
		expect(body.id).toBe('new_pin_id_42')
		expect(h.calls.pin).toHaveLength(1)
		expect(h.calls.pin[0]).toEqual({
			userId: 'u1',
			messageId: 'msg_abc',
			conversationId: 'conv_xyz',
			content: 'remember this fact',
			label: 'fact',
		})
	})

	it('POST /api/pinned-messages returns 400 when content is missing/empty', async () => {
		h = await buildHarness({authUserId: 'u1'})
		const res = await fetch(`${h.url}/api/pinned-messages`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({messageId: 'm1', content: '   '}),
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('content is required')
		expect(h.calls.pin.length).toBe(0)
	})

	it('DELETE /api/pinned-messages/:id removes a pin and returns 200 { ok: true }', async () => {
		h = await buildHarness({authUserId: 'u1'})
		const res = await fetch(`${h.url}/api/pinned-messages/pin_xyz`, {
			method: 'DELETE',
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean}
		expect(body.ok).toBe(true)
		expect(h.calls.unpinById).toHaveLength(1)
		expect(h.calls.unpinById[0]).toEqual({userId: 'u1', pinId: 'pin_xyz'})
	})

	it('GET /api/pinned-messages returns user pins as { count, results }', async () => {
		const rows = [
			{
				id: 'p1',
				userId: 'u1',
				conversationId: 'c1',
				messageId: 'm1',
				content: 'first pin',
				label: 'note 1',
				pinnedAt: new Date('2026-05-01T12:00:00Z'),
			},
			{
				id: 'p2',
				userId: 'u1',
				conversationId: null,
				messageId: null,
				content: 'free-form pin',
				label: null,
				pinnedAt: new Date('2026-05-02T08:30:00Z'),
			},
		]
		h = await buildHarness({
			authUserId: 'u1',
			repo: {listForUser: async () => rows},
		})
		const res = await fetch(`${h.url}/api/pinned-messages`)
		expect(res.status).toBe(200)
		const body = (await res.json()) as {count: number; results: any[]}
		expect(body.count).toBe(2)
		expect(body.results).toHaveLength(2)
		expect(body.results[0]).toMatchObject({
			id: 'p1',
			messageId: 'm1',
			conversationId: 'c1',
			content: 'first pin',
			label: 'note 1',
			pinnedAt: '2026-05-01T12:00:00.000Z',
		})
		expect(body.results[1]).toMatchObject({
			id: 'p2',
			messageId: null,
			conversationId: null,
			content: 'free-form pin',
			label: null,
		})
		expect(h.calls.listForUser).toHaveLength(1)
		expect(h.calls.listForUser[0]).toEqual({userId: 'u1', limit: 50})
	})

	it('POST /api/pinned-messages returns 500 when the repository throws', async () => {
		h = await buildHarness({
			authUserId: 'u1',
			repo: {
				pin: async () => {
					throw new Error('pg blew up')
				},
			},
		})
		const res = await fetch(`${h.url}/api/pinned-messages`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({content: 'something'}),
		})
		expect(res.status).toBe(500)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('pin operation failed')
	})
})
