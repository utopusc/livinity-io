/**
 * Phase 96-02 — webapp.skills.* tRPC router unit tests.
 *
 * Builds a tRPC caller with a mocked pg.Pool + a temp LIV_DATA_ROOT so the
 * uploadFrame path actually writes JPEGs through skills-storage. The DB
 * interaction surface is mocked at the queryMock level (same discipline as
 * agents-repo.test.ts).
 *
 * Coverage:
 *   T1 — create rejects when WebApp not owned by ctx.currentUser → NOT_FOUND
 *   T2 — create round-trip: insert SQL fires, returns {id, createdAt},
 *        meta.sessionId is auto-stamped
 *   T3 — create unique-violation 23505 → CONFLICT
 *   T4 — list returns the rows mapped from the queryMock
 *   T5 — get NOT_FOUND when no row matches (id, userId)
 *   T6 — get returns the row when owned (cross-user ID returns NOT_FOUND)
 *   T7 — delete returns ok + GCs the on-disk session directory referenced
 *        in the action log
 *   T8 — uploadFrame writes a JPEG to disk and returns screenshotRef
 *   T9 — discard rm-rfs the session directory
 *   T10 — httpOnlyPaths exposes all six webapp.skills.* entries
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'
import {existsSync, promises as fs} from 'node:fs'
import {join} from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'

import sharp from 'sharp'

// IMPORTANT: vi.mock the database/index.js + webapps-repository.js BEFORE
// importing skills-router. ESM-friendly factory mocks below.
const queryMock = vi.fn()
const fakePool = {query: queryMock}

vi.mock('../database/index.js', () => ({
	getPool: () => fakePool,
}))

const findWebAppByIdMock = vi.fn()
vi.mock('./webapps-repository.js', () => ({
	findWebAppById: (...a: any[]) => findWebAppByIdMock(...a),
}))

// Import AFTER mocks so the module sees the mocked deps.
const skillsRouterModule = await import('./skills-router.js')
const skillsRouter = skillsRouterModule.default
const commonModule = await import('../server/trpc/common.js')

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const WEBAPP = '33333333-3333-4333-8333-333333333333'
const SKILL = '44444444-4444-4444-8444-444444444444'

let dataRoot: string

beforeAll(async () => {
	dataRoot = await fs.mkdtemp(join(os.tmpdir(), 'livos-skills-router-'))
	process.env.LIV_DATA_ROOT = dataRoot
})

function makeCtx(userId: string | null) {
	return {
		livinityd: {} as any,
		logger: {info: () => {}, warn: () => {}, error: () => {}, verbose: () => {}, log: () => {}},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: true,
		currentUser: userId ? {id: userId, role: 'member' as const} : (undefined as any),
		transport: 'express' as const,
	}
}

function fixtureLog(sessionId: string) {
	return {
		version: 1 as const,
		webappId: WEBAPP,
		startedAt: 0,
		endedAt: 1500,
		events: [
			{
				type: 'click' as const,
				button: 'left' as const,
				coords: {x: 100, y: 200},
				ts: 100,
				screenshotRef: `${USER}/${sessionId}/100.jpg`,
			},
			{
				type: 'wait' as const,
				durationMs: 1000,
				ts: 1100,
				screenshotRef: `${USER}/${sessionId}/1100.jpg`,
			},
		],
	}
}

beforeEach(() => {
	queryMock.mockReset()
	findWebAppByIdMock.mockReset()
})

describe('webapp.skills.* tRPC router', () => {
	test('T1 — create NOT_FOUND when webapp not owned', async () => {
		findWebAppByIdMock.mockResolvedValueOnce(null)
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		await expect(
			caller.create({
				webappId: WEBAPP,
				name: 'smoke-test',
				sessionId: randomUUID(),
				actionLog: fixtureLog(randomUUID()),
			}),
		).rejects.toMatchObject({code: 'NOT_FOUND'})
	})

	test('T2 — create round-trip stamps meta.sessionId and returns {id, createdAt}', async () => {
		findWebAppByIdMock.mockResolvedValueOnce({id: WEBAPP, userId: USER})
		const sessionId = randomUUID()
		const created = new Date('2026-05-08T00:00:00Z')
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					id: SKILL,
					user_id: USER,
					webapp_id: WEBAPP,
					skill_name: 'smoke-test',
					action_log: fixtureLog(sessionId),
					created_at: created,
				},
			],
			rowCount: 1,
		})
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		const r = await caller.create({
			webappId: WEBAPP,
			name: 'smoke-test',
			sessionId,
			actionLog: fixtureLog(sessionId),
		})
		expect(r).toEqual({id: SKILL, createdAt: created})
		// Confirm INSERT was called with the JSON-stringified action log
		// containing meta.sessionId stamped.
		const callArgs = queryMock.mock.calls[0][1]
		const insertedLog = JSON.parse(callArgs[3])
		expect(insertedLog.meta.sessionId).toBe(sessionId)
	})

	test('T3 — create unique-violation 23505 → CONFLICT', async () => {
		findWebAppByIdMock.mockResolvedValueOnce({id: WEBAPP, userId: USER})
		queryMock.mockRejectedValueOnce(Object.assign(new Error('dup'), {code: '23505'}))
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		await expect(
			caller.create({
				webappId: WEBAPP,
				name: 'smoke-test',
				sessionId: randomUUID(),
				actionLog: fixtureLog(randomUUID()),
			}),
		).rejects.toMatchObject({code: 'CONFLICT'})
	})

	test('T4 — list maps rows to camelCase + numeric action_count', async () => {
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					id: SKILL,
					skill_name: 'smoke-test',
					created_at: new Date('2026-05-08T00:00:00Z'),
					action_count: '2',
				},
			],
			rowCount: 1,
		})
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		const list = await caller.list({webappId: WEBAPP})
		expect(list).toEqual([
			{
				id: SKILL,
				skillName: 'smoke-test',
				createdAt: new Date('2026-05-08T00:00:00Z'),
				actionCount: 2,
			},
		])
	})

	test('T5 — get NOT_FOUND when no row matches (cross-user STRIDE I)', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})
		const caller = skillsRouter.createCaller(makeCtx(OTHER) as any)
		await expect(caller.get({skillId: SKILL})).rejects.toMatchObject({code: 'NOT_FOUND'})
	})

	test('T6 — get returns the row when owned', async () => {
		const sessionId = randomUUID()
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					id: SKILL,
					user_id: USER,
					webapp_id: WEBAPP,
					skill_name: 'smoke-test',
					action_log: fixtureLog(sessionId),
					created_at: new Date('2026-05-08T00:00:00Z'),
				},
			],
			rowCount: 1,
		})
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		const r = await caller.get({skillId: SKILL})
		expect(r.id).toBe(SKILL)
		expect(r.skillName).toBe('smoke-test')
	})

	test('T7 — delete GCs disk + returns ok', async () => {
		const sessionId = randomUUID()
		// Pre-populate a session dir.
		const dir = join(dataRoot, 'webapp-skills', USER, sessionId)
		await fs.mkdir(dir, {recursive: true})
		await fs.writeFile(join(dir, '100.jpg'), 'fakebytes')
		expect(existsSync(dir)).toBe(true)

		queryMock.mockResolvedValueOnce({
			rows: [
				{
					id: SKILL,
					user_id: USER,
					webapp_id: WEBAPP,
					skill_name: 'smoke-test',
					action_log: {
						...fixtureLog(sessionId),
						meta: {sessionId},
					},
					created_at: new Date(),
				},
			],
			rowCount: 1,
		})
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		const r = await caller.delete({skillId: SKILL})
		expect(r).toEqual({ok: true})
		expect(existsSync(dir)).toBe(false)
	})

	test('T8 — uploadFrame writes JPEG and returns screenshotRef', async () => {
		const sessionId = randomUUID()
		// Generate a valid PNG to avoid sharp choking on bogus bytes.
		const png = await sharp({
			create: {width: 80, height: 60, channels: 3, background: {r: 0, g: 0, b: 0}},
		})
			.png()
			.toBuffer()
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		const r = await caller.uploadFrame({
			sessionId,
			ts: 42,
			imageDataBase64: png.toString('base64'),
			mimeType: 'image/png',
		})
		expect(r.screenshotRef).toBe(`${USER}/${sessionId}/42.jpg`)
		const onDisk = join(dataRoot, 'webapp-skills', USER, sessionId, '42.jpg')
		expect(existsSync(onDisk)).toBe(true)
	})

	test('T9 — discard rm-rfs the session dir (idempotent on missing)', async () => {
		const sessionId = randomUUID()
		const dir = join(dataRoot, 'webapp-skills', USER, sessionId)
		await fs.mkdir(dir, {recursive: true})
		await fs.writeFile(join(dir, 'x.jpg'), 'x')
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		await caller.discard({sessionId})
		expect(existsSync(dir)).toBe(false)
		// Idempotent.
		await expect(caller.discard({sessionId})).resolves.toEqual({ok: true})
	})
})

describe('httpOnlyPaths includes webapp.skills.* entries', () => {
	test('T10 — all six paths present', () => {
		const expected = [
			'webapp.skills.create',
			'webapp.skills.list',
			'webapp.skills.get',
			'webapp.skills.delete',
			'webapp.skills.discard',
			'webapp.skills.uploadFrame',
		]
		for (const p of expected) {
			expect(commonModule.httpOnlyPaths).toContain(p as any)
		}
	})
})

describe('P97 fixture: sample-skill.json round-trips through skills.create', () => {
	test('T11 — fixture validates as canonical action log', async () => {
		findWebAppByIdMock.mockResolvedValueOnce({id: WEBAPP, userId: USER})
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					id: SKILL,
					user_id: USER,
					webapp_id: WEBAPP,
					skill_name: 'fixture-test',
					action_log: {},
					created_at: new Date(),
				},
			],
			rowCount: 1,
		})
		// Import the fixture and re-target webappId at our test WEBAPP so the
		// router's zod validator + ownership check both pass.
		const fixturePath = join(__dirname, '__fixtures__', 'sample-skill.json')
		const raw = await fs.readFile(fixturePath, 'utf8')
		const parsed = JSON.parse(raw)
		parsed.webappId = WEBAPP
		const caller = skillsRouter.createCaller(makeCtx(USER) as any)
		await expect(
			caller.create({
				webappId: WEBAPP,
				name: 'fixture-test',
				sessionId: parsed.meta.sessionId,
				actionLog: parsed,
			}),
		).resolves.toMatchObject({id: SKILL})
	})
})
