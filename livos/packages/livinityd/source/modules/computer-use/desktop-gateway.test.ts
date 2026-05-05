/**
 * desktop-gateway unit tests — Phase 71-05.
 *
 * Pure helpers + middleware logic with mocked Express req/res. No real
 * Express server, no real Docker, no real PG. Mirrors the pure-helper
 * extraction discipline established in 70-01 / 67-04 D-25 / 68-05.
 *
 * Coverage matrix (>= 16 cases):
 *   isAllowedDesktopPath       — 7 allowed + 6 disallowed (incl. prefix-collision)
 *   pathRequiresActiveTask     — 3 protected + 1 non-protected (/health)
 *   extractWebsockifyToken     — 4 cases (read / null / empty / undef)
 *   mountDesktopGateway        — 4 middleware behaviors:
 *     - bails on non-desktop subdomain
 *     - 404 disallowed path
 *     - 401 /websockify without token
 *     - 403 authed but no active task
 */
import {describe, it, expect, vi} from 'vitest'

import {
	isAllowedDesktopPath,
	pathRequiresActiveTask,
	extractWebsockifyToken,
	mountDesktopGateway,
} from './desktop-gateway.js'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

describe('isAllowedDesktopPath', () => {
	it.each([
		['/computer-use'],
		['/computer-use/screenshot'],
		['/websockify'],
		['/websockify/'],
		['/screenshot'],
		['/screenshot/png'],
		['/health'],
	])('returns true for allowed path %s', (p) => {
		expect(isAllowedDesktopPath(p)).toBe(true)
	})

	it.each([
		['/'],
		['/admin'],
		['/etc/passwd'],
		['/computer-use/../../etc'],
		['/api/secret'],
		['/computer-useless'], // prefix-collision check (/computer-use vs /computer-useless)
	])('returns false for disallowed path %s', (p) => {
		expect(isAllowedDesktopPath(p)).toBe(false)
	})
})

describe('pathRequiresActiveTask', () => {
	it('returns true for /computer-use', () => {
		expect(pathRequiresActiveTask('/computer-use')).toBe(true)
	})
	it('returns true for /websockify', () => {
		expect(pathRequiresActiveTask('/websockify')).toBe(true)
	})
	it('returns true for /screenshot', () => {
		expect(pathRequiresActiveTask('/screenshot')).toBe(true)
	})
	it('returns false for /health (health gate must work without active task)', () => {
		expect(pathRequiresActiveTask('/health')).toBe(false)
	})
})

describe('extractWebsockifyToken', () => {
	it('reads ?token= from req.query', () => {
		expect(extractWebsockifyToken({query: {token: 'abc.def.ghi'}} as any)).toBe('abc.def.ghi')
	})
	it('returns null when token absent', () => {
		expect(extractWebsockifyToken({query: {}} as any)).toBeNull()
	})
	it('returns null when token is empty string', () => {
		expect(extractWebsockifyToken({query: {token: ''}} as any)).toBeNull()
	})
	it('returns null when query is undefined', () => {
		expect(extractWebsockifyToken({} as any)).toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────
// Middleware behavior
// ─────────────────────────────────────────────────────────────────────

function makeApp() {
	const middlewares: any[] = []
	return {
		app: {use: (fn: any) => middlewares.push(fn)} as any,
		run: async (req: any, res: any) => {
			const next = vi.fn()
			for (const m of middlewares) await m(req, res, next)
			return next
		},
	}
}

function makeRes() {
	return {
		status: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
		end: vi.fn().mockReturnThis(),
		redirect: vi.fn(),
	}
}

function makeDeps(over: any = {}) {
	return {
		server: {} as any,
		manager: {
			getStatus: vi.fn(async () => 'running' as const),
			bumpActivity: vi.fn(async () => {}),
			ensureContainer: vi.fn(),
			stopContainer: vi.fn(),
		} as any,
		getMainDomain: async () => 'livinity.io',
		getMultiUserMode: async () => true,
		verifyToken: async (_t: string) => ({userId: 'user-1'}),
		logger: {log: vi.fn(), error: vi.fn(), verbose: vi.fn()},
		...over,
	}
}

describe('mountDesktopGateway middleware', () => {
	it('bails to next() on non-desktop subdomain', async () => {
		const {app, run} = makeApp()
		mountDesktopGateway({...makeDeps(), app})
		const req: any = {
			hostname: 'mail.livinity.io',
			path: '/inbox',
			cookies: {},
			query: {},
		}
		const res = makeRes()
		const next = await run(req, res)
		expect(next).toHaveBeenCalled()
		expect(res.status).not.toHaveBeenCalled()
	})

	it('returns 404 for disallowed path under desktop subdomain', async () => {
		const {app, run} = makeApp()
		mountDesktopGateway({...makeDeps(), app})
		const req: any = {
			hostname: 'desktop.bruce.livinity.io',
			path: '/admin',
			cookies: {LIVINITY_SESSION: 'x'},
			query: {},
		}
		const res = makeRes()
		await run(req, res)
		expect(res.status).toHaveBeenCalledWith(404)
	})

	it('returns 401 for /websockify without token', async () => {
		const {app, run} = makeApp()
		mountDesktopGateway({...makeDeps(), app})
		const req: any = {
			hostname: 'desktop.bruce.livinity.io',
			path: '/websockify',
			cookies: {},
			query: {},
		}
		const res = makeRes()
		await run(req, res)
		expect(res.status).toHaveBeenCalledWith(401)
	})

	it('returns 403 when authed but no active task', async () => {
		const deps = makeDeps({
			manager: {
				getStatus: vi.fn(async () => 'absent' as const),
				bumpActivity: vi.fn(),
			},
		})
		const {app, run} = makeApp()
		mountDesktopGateway({...deps, app})
		const req: any = {
			hostname: 'desktop.bruce.livinity.io',
			path: '/computer-use',
			cookies: {LIVINITY_SESSION: 'x'},
			query: {},
		}
		const res = makeRes()
		await run(req, res)
		expect(res.status).toHaveBeenCalledWith(403)
	})

	it('redirects to /login for /computer-use without auth (browser nav)', async () => {
		const {app, run} = makeApp()
		mountDesktopGateway({...makeDeps(), app})
		const req: any = {
			hostname: 'desktop.bruce.livinity.io',
			path: '/computer-use',
			cookies: {},
			query: {},
		}
		const res = makeRes()
		await run(req, res)
		expect(res.redirect).toHaveBeenCalledWith('https://livinity.io/login')
	})

	it('bails when no main domain configured', async () => {
		const {app, run} = makeApp()
		mountDesktopGateway({...makeDeps({getMainDomain: async () => null}), app})
		const req: any = {
			hostname: 'desktop.bruce.livinity.io',
			path: '/computer-use',
			cookies: {LIVINITY_SESSION: 'x'},
			query: {},
		}
		const res = makeRes()
		const next = await run(req, res)
		expect(next).toHaveBeenCalled()
	})

	it('bails on the main domain itself', async () => {
		const {app, run} = makeApp()
		mountDesktopGateway({...makeDeps(), app})
		const req: any = {
			hostname: 'livinity.io',
			path: '/computer-use',
			cookies: {LIVINITY_SESSION: 'x'},
			query: {},
		}
		const res = makeRes()
		const next = await run(req, res)
		expect(next).toHaveBeenCalled()
	})
})
