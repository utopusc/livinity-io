/**
 * Phase 168-01 — cc-pty-router.test.ts
 *
 * Combined source-text invariant + runtime behavioral suite. The source-text
 * invariants lock the router's shape (5 procedures, all adminProcedure-gated,
 * cross-user FORBIDDEN guard, path.basename defense). The runtime suite
 * exercises createCaller with a stubbed ctx and asserts:
 *   - list returns only the caller's sessions
 *   - create derives userId from ctx (never from input)
 *   - rename/delete/getPreview enforce cross-user 403
 *   - getPreview gracefully handles missing jsonl / missing ccSessionId
 */

import {describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'

// Hoisted mock for node:fs/promises so the cc-pty-router can be tested without
// touching real /root/.claude/projects. Default behavior: simulate ENOENT
// (matches the "no jsonl on disk" case); individual tests override per-call.
const readFileMock = vi.fn<(...args: any[]) => Promise<string>>(async () => {
	const err = Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
	throw err
})
vi.mock('node:fs/promises', () => ({
	readFile: (...args: any[]) => readFileMock(...args),
}))

const ROUTER_SRC = readFileSync(resolve(__dirname, 'cc-pty-router.ts'), 'utf8')
const COMMON_SRC = readFileSync(resolve(__dirname, 'common.ts'), 'utf8')
const INDEX_SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

// ── Source-text invariants ────────────────────────────────────────────────

describe('cc-pty-router — Phase 168-01 source-text invariants', () => {
	it('S1: source contains all 5 procedure names', () => {
		expect(ROUTER_SRC).toMatch(/list:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/create:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/rename:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/delete:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/getPreview:\s*adminProcedure/)
	})

	it('S2: adminProcedure appears at least 5 times (one per procedure)', () => {
		const matches = ROUTER_SRC.match(/adminProcedure/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(5)
	})

	it('S3: path.basename used for ccSessionId (defense-in-depth)', () => {
		expect(ROUTER_SRC).toMatch(/path\.basename/)
	})

	it('S4: requireOwnedSession helper throws FORBIDDEN for cross-user', () => {
		expect(ROUTER_SRC).toMatch(/FORBIDDEN/)
		expect(ROUTER_SRC).toMatch(/requireOwnedSession/)
	})

	it('S5: create derives userId from ctx.currentUser.id, NOT from input', () => {
		expect(ROUTER_SRC).toMatch(/ctx\.currentUser!?\.id/)
		// Input schema for create must NOT contain userId
		const createIdx = ROUTER_SRC.indexOf('create:')
		const createSlice = ROUTER_SRC.substring(createIdx, createIdx + 500)
		expect(createSlice).not.toMatch(/userId:\s*z\./)
	})

	it('S6: zod .strict() on every mutation input schema', () => {
		const matches = ROUTER_SRC.match(/\.strict\(\)/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(3)
	})

	it('S7: CC jsonl path constant points at /root/.claude/projects/-home-bruce-livinity-vault', () => {
		expect(ROUTER_SRC).toMatch(
			/['"]\/root\/\.claude\/projects\/-home-bruce-livinity-vault['"]/,
		)
	})

	it('S8: getPreview truncates preview at 120 chars', () => {
		expect(ROUTER_SRC).toMatch(/\.slice\(0,\s*120\)/)
	})
})

// ── httpOnlyPaths registration ────────────────────────────────────────────

describe('cc-pty-router — common.ts httpOnlyPaths registration', () => {
	it('H1: common.ts contains 5 ccPty.* path strings', () => {
		expect(COMMON_SRC).toMatch(/'ccPty\.list'/)
		expect(COMMON_SRC).toMatch(/'ccPty\.create'/)
		expect(COMMON_SRC).toMatch(/'ccPty\.rename'/)
		expect(COMMON_SRC).toMatch(/'ccPty\.delete'/)
		expect(COMMON_SRC).toMatch(/'ccPty\.getPreview'/)
	})
})

// ── createAppRouter registration ──────────────────────────────────────────

describe('cc-pty-router — createAppRouter slot', () => {
	it('I1: index.ts contains `ccPty: ccPtyRouter` slot', () => {
		expect(INDEX_SRC).toMatch(/ccPty:\s*ccPtyRouter/)
	})
	it('I2: ccPtyRouter imported at top of index.ts', () => {
		expect(INDEX_SRC).toMatch(
			/import\s+ccPtyRouter\s+from\s+['"]\.\/cc-pty-router\.js['"]/,
		)
	})
})

// ── Runtime behavioral suite (createCaller with stubbed ctx) ──────────────

import ccPtyRouter from './cc-pty-router.js'

function makeStubManager() {
	const sessions = new Map<string, any>()
	let killedIds: string[] = []
	let renamedTitles: Record<string, string> = {}
	return {
		sessions,
		killedIds,
		renamedTitles,
		listSessions: vi.fn(async (userId: string) => {
			return Array.from(sessions.values()).filter((s) => s.userId === userId)
		}),
		createSession: vi.fn(async (opts: any) => {
			const id = randomUUID()
			const s = {
				id,
				userId: opts.userId,
				tmuxName: `livos-cc-${opts.userId}-${id.slice(0, 8)}`,
				cwd: opts.cwd ?? '/vault',
				createdAt: Date.now(),
				lastAttachedAt: 0,
				lastMessageAt: 0,
				title: opts.title,
			}
			sessions.set(id, s)
			return s
		}),
		renameSession: vi.fn(async (id: string, title: string) => {
			renamedTitles[id] = title
			const s = sessions.get(id)
			if (s) s.title = title
		}),
		killSession: vi.fn(async (id: string) => {
			killedIds.push(id)
			sessions.delete(id)
		}),
		getSession: vi.fn(async (id: string) => sessions.get(id) ?? null),
	}
}

function makeCtx(userId: string, mgr: ReturnType<typeof makeStubManager>) {
	return {
		// Bypass isAuthenticated middleware in tests (no real JWT cookie / DB).
		dangerouslyBypassAuthentication: true,
		// currentUser must be set explicitly because we bypass the middleware
		// that normally populates it from the JWT.
		currentUser: {id: userId, username: userId, role: 'admin'},
		livinityd: {ccPtyManager: mgr},
		logger: {log: vi.fn(), warn: vi.fn(), error: vi.fn()},
	} as any
}

describe('cc-pty-router — runtime behavior', () => {
	it('B1: list returns only the caller user\'s sessions', async () => {
		const mgr = makeStubManager()
		const ctxU1 = makeCtx('u1', mgr)
		// Seed sessions for two users
		await mgr.createSession({userId: 'u1'})
		await mgr.createSession({userId: 'u1'})
		await mgr.createSession({userId: 'u2'})
		const caller = ccPtyRouter.createCaller(ctxU1)
		const res = await caller.list()
		expect(res.sessions.length).toBe(2)
		expect(res.sessions.every((s: any) => s.userId === 'u1')).toBe(true)
	})

	it('B2: create returns the session shape from manager.createSession', async () => {
		const mgr = makeStubManager()
		const ctx = makeCtx('u1', mgr)
		const caller = ccPtyRouter.createCaller(ctx)
		const res = await caller.create({title: 'My Session'})
		expect(res.session.userId).toBe('u1')
		expect(res.session.title).toBe('My Session')
		expect(res.session.tmuxName).toMatch(/^livos-cc-u1-/)
		expect(mgr.createSession).toHaveBeenCalledWith({
			userId: 'u1',
			title: 'My Session',
			cwd: undefined,
		})
	})

	it('B3: create uses ctx.currentUser.id even if input attempts to override (zod.strict rejects extras)', async () => {
		const mgr = makeStubManager()
		const ctx = makeCtx('u1', mgr)
		const caller = ccPtyRouter.createCaller(ctx)
		// strict() rejects userId field — Zod throws BAD_REQUEST
		await expect(
			caller.create({userId: 'u-spoof'} as any),
		).rejects.toThrow()
	})

	it('B4: rename persists title via manager.renameSession', async () => {
		const mgr = makeStubManager()
		const ctx = makeCtx('u1', mgr)
		const caller = ccPtyRouter.createCaller(ctx)
		const created = await caller.create({title: 'Old'})
		const res = await caller.rename({id: created.session.id, title: 'New Title'})
		expect(res.ok).toBe(true)
		expect(mgr.renameSession).toHaveBeenCalledWith(created.session.id, 'New Title')
		const after = await mgr.getSession(created.session.id)
		expect(after?.title).toBe('New Title')
	})

	it('B5: rename returns FORBIDDEN when session.userId !== ctx.currentUser.id', async () => {
		const mgr = makeStubManager()
		const ctxOwner = makeCtx('u1', mgr)
		const ctxOther = makeCtx('u2', mgr)
		const ownerCaller = ccPtyRouter.createCaller(ctxOwner)
		const otherCaller = ccPtyRouter.createCaller(ctxOther)
		const created = await ownerCaller.create({title: 'Mine'})
		await expect(
			otherCaller.rename({id: created.session.id, title: 'Stolen'}),
		).rejects.toThrow(/does not belong to caller/)
	})

	it('B6: delete removes the session from listSessions', async () => {
		const mgr = makeStubManager()
		const ctx = makeCtx('u1', mgr)
		const caller = ccPtyRouter.createCaller(ctx)
		const created = await caller.create({})
		await caller.delete({id: created.session.id})
		expect(mgr.killSession).toHaveBeenCalledWith(created.session.id)
		const remaining = await caller.list()
		expect(remaining.sessions.find((s: any) => s.id === created.session.id)).toBeUndefined()
	})

	it('B7: delete returns FORBIDDEN when session.userId !== ctx.currentUser.id', async () => {
		const mgr = makeStubManager()
		const ctxOwner = makeCtx('u1', mgr)
		const ctxOther = makeCtx('u2', mgr)
		const created = await ccPtyRouter.createCaller(ctxOwner).create({})
		await expect(
			ccPtyRouter.createCaller(ctxOther).delete({id: created.session.id}),
		).rejects.toThrow(/does not belong to caller/)
	})

	it('B8: getPreview reads jsonl and returns truncated first user message', async () => {
		const mgr = makeStubManager()
		const ctx = makeCtx('u1', mgr)
		const caller = ccPtyRouter.createCaller(ctx)
		const created = await caller.create({})
		// Patch session with a ccSessionId
		const s = mgr.sessions.get(created.session.id)
		s.ccSessionId = '00000000-0000-0000-0000-000000000abc'
		const jsonlContent = [
			JSON.stringify({role: 'user', content: 'Hello, Claude!'}),
			JSON.stringify({role: 'assistant', content: 'Hi there.'}),
		].join('\n')
		readFileMock.mockResolvedValueOnce(jsonlContent)
		const res = await caller.getPreview({id: created.session.id})
		expect(res.preview).toBe('Hello, Claude!')
	})

	it('B9: getPreview returns null when readFile rejects (ENOENT)', async () => {
		const mgr = makeStubManager()
		const ctx = makeCtx('u1', mgr)
		const caller = ccPtyRouter.createCaller(ctx)
		const created = await caller.create({})
		const s = mgr.sessions.get(created.session.id)
		s.ccSessionId = '00000000-0000-0000-0000-000000000abc'
		// Default mock already rejects with ENOENT
		const res = await caller.getPreview({id: created.session.id})
		expect(res.preview).toBeNull()
	})

	it('B10: getPreview returns null when ccSessionId is undefined', async () => {
		const mgr = makeStubManager()
		const ctx = makeCtx('u1', mgr)
		const caller = ccPtyRouter.createCaller(ctx)
		const created = await caller.create({})
		const res = await caller.getPreview({id: created.session.id})
		expect(res.preview).toBeNull()
	})

	it('B11: getPreview returns FORBIDDEN when session.userId !== ctx.currentUser.id', async () => {
		const mgr = makeStubManager()
		const ctxOwner = makeCtx('u1', mgr)
		const ctxOther = makeCtx('u2', mgr)
		const created = await ccPtyRouter.createCaller(ctxOwner).create({})
		await expect(
			ccPtyRouter.createCaller(ctxOther).getPreview({id: created.session.id}),
		).rejects.toThrow(/does not belong to caller/)
	})
})
