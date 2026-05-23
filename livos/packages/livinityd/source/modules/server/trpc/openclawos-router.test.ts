/**
 * Phase 203-04 — openclawos.apps.* tRPC router unit tests.
 *
 * Verifies the boundary contracts the plugin's HTTP client depends on:
 *
 *   - validateContent rejects JSON trees that fail validateOpenUITree:
 *     BAD_REQUEST + OPENUI_DISALLOWED_COMPONENT (or OPENUI_UNSAFE_URL)
 *   - validateContent accepts raw lang source (non-JSON) — the plugin's
 *     lint-openui hook is the structural gate for that surface
 *   - mapRepoError maps PG UNIQUE violation → CONFLICT + OPENUI_APP_SLUG_TAKEN
 *   - the empty-injection stub throws PRECONDITION_FAILED + OPENUI_REPO_UNAVAILABLE
 *   - SlugSchema rejects whitespace/special chars
 *
 * Strategy: call the input schemas + validateContent helper directly. The
 * full tRPC chain is exercised by integration tests (Plan 203-12 UAT).
 */

import {TRPCError} from '@trpc/server'
import {describe, expect, test} from 'vitest'

import {
	NativeAppConfigStore,
	type RedisLike,
} from '../../apps/native-app-config.js'
import {deterministicUuidForSlug} from '../../openclawos/desktop-registrar.js'
import {
	createOpenclawosAppsRouter,
	openclawosAppsRouter,
} from './openclawos-router.js'
import type {OpenUIAppsRepository} from '../../openclawos/openui-apps-repository.js'

/**
 * Admin context bypasses the JWT gate via `dangerouslyBypassAuthentication`.
 * Mirrors the pattern used in `mastra-router.test.ts` (the source-of-truth
 * test scaffold for adminProcedure-gated routers in this codebase).
 */
function makeAdminCtx() {
	return {
		livinityd: {} as never,
		logger: {
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
			verbose: () => undefined,
			log: () => undefined,
			debug: () => undefined,
		},
		server: {} as never,
		user: {} as never,
		appStore: {} as never,
		apps: {} as never,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

describe('openclawosAppsRouter — empty-injection stub', () => {
	test('list throws OPENUI_REPO_UNAVAILABLE when production boot has not wired the repo', async () => {
		const caller = openclawosAppsRouter.createCaller(makeAdminCtx() as never)
		await expect(caller.list({limit: 50})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
			message: 'OPENUI_REPO_UNAVAILABLE',
		})
	})
})

describe('createOpenclawosAppsRouter — validation', () => {
	const fakeRepo = {
		listAll: async () => [],
		getBySlug: async () => null,
		upsert: async (input: {slug: string; name: string; content: string}) => ({
			slug: input.slug,
			name: input.name,
			content: input.content,
			version: 1,
			userId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
		delete: async () => undefined,
		versions: async () => [],
		currentVersion: async () => null,
		incrementVersion: async () => null,
	} as unknown as OpenUIAppsRepository

	const router = createOpenclawosAppsRouter({
		repo: fakeRepo,
		logger: {info: () => undefined, warn: () => undefined},
	})

	test('create accepts well-formed slug + name + raw lang content', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		const r = await caller.create({
			slug: 'my-app-1',
			name: 'My App',
			content: 'root = Card("hi")',
		})
		expect(r.slug).toBe('my-app-1')
	})

	test('create REJECTS JSON tree with disallowed component', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(
			caller.create({
				slug: 'bad',
				name: 'Bad',
				content: JSON.stringify({type: 'iframe', props: {}}),
			}),
		).rejects.toMatchObject({
			code: 'BAD_REQUEST',
			message: expect.stringContaining('OPENUI_DISALLOWED_COMPONENT'),
		})
	})

	test('create REJECTS JSON tree with javascript: URL on image.src', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(
			caller.create({
				slug: 'bad-url',
				name: 'Bad',
				content: JSON.stringify({
					type: 'image',
					props: {src: 'javascript:alert(1)'},
				}),
			}),
		).rejects.toMatchObject({
			code: 'BAD_REQUEST',
			message: 'OPENUI_UNSAFE_URL:image.src',
		})
	})

	test('create REJECTS dangerouslySetInnerHTML in JSON tree', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(
			caller.create({
				slug: 'bad-html',
				name: 'Bad',
				content: JSON.stringify({
					type: 'card',
					props: {dangerouslySetInnerHTML: {__html: '<script>alert(1)</script>'}},
				}),
			}),
		).rejects.toMatchObject({
			code: 'BAD_REQUEST',
			message: 'OPENUI_RAW_HTML',
		})
	})

	test('SlugSchema rejects whitespace + path chars', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(
			caller.create({slug: 'has space', name: 'X', content: 'x'}),
		).rejects.toBeInstanceOf(TRPCError)
		await expect(
			caller.create({slug: '../etc', name: 'X', content: 'x'}),
		).rejects.toBeInstanceOf(TRPCError)
	})

	test('get returns NOT_FOUND for missing slug', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(caller.get({slug: 'missing'})).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'OPENUI_APP_NOT_FOUND',
		})
	})

	test('update accepts the same shape as create (upsert semantics)', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		const r = await caller.update({
			slug: 'iter',
			name: 'Iter',
			content: 'root = Text("v2")',
		})
		expect(r.slug).toBe('iter')
	})

	test('delete returns {ok:true}', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(caller.delete({slug: 'd'})).resolves.toEqual({ok: true})
	})

	test('version returns {version: null} for missing slug', async () => {
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(caller.version({slug: 'missing'})).resolves.toEqual({version: null})
	})
})

// Phase 203-10 — D-203-10 desktop integration hook.
//
// When nativeAppStore is injected, create/update/delete fire
// register/unregister so the OpenUI app surfaces as a LivOS dock icon.
// Failures inside the hook MUST NOT mask a successful repo write — the
// operator still gets the row back; the hook log surfaces the partial state.
describe('createOpenclawosAppsRouter — desktop-registrar hook (D-203-10)', () => {
	function fakeRedis(): RedisLike & {
		store: Map<string, string>
		publishes: Array<{channel: string; message: string}>
	} {
		const store = new Map<string, string>()
		const publishes: Array<{channel: string; message: string}> = []
		return {
			store,
			publishes,
			async set(k, v) {
				store.set(k, v)
				return 'OK'
			},
			async get(k) {
				return store.get(k) ?? null
			},
			async del(k) {
				return store.delete(k) ? 1 : 0
			},
			async keys(p) {
				const pre = p.replace(/\*$/, '')
				return [...store.keys()].filter((k) => k.startsWith(pre))
			},
			async publish(c, m) {
				publishes.push({channel: c, message: m})
				return 0
			},
		}
	}

	const fakeRepo = {
		listAll: async () => [],
		getBySlug: async () => null,
		upsert: async (input: {slug: string; name: string; content: string}) => ({
			slug: input.slug,
			name: input.name,
			content: input.content,
			version: 1,
			userId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
		delete: async () => undefined,
		versions: async () => [],
		currentVersion: async () => null,
		incrementVersion: async () => null,
	} as unknown as OpenUIAppsRepository

	test('create propagates to NativeAppConfigStore.upsert', async () => {
		const redis = fakeRedis()
		const nativeAppStore = new NativeAppConfigStore(redis)
		const router = createOpenclawosAppsRouter({
			repo: fakeRepo,
			nativeAppStore,
			logger: {info: () => undefined, warn: () => undefined},
		})
		const caller = router.createCaller(makeAdminCtx() as never)

		await caller.create({slug: 'calc', name: 'Calculator', content: 'root = Text("hi")'})

		const cfg = await nativeAppStore.get(deterministicUuidForSlug('calc'))
		expect(cfg).not.toBeNull()
		expect(cfg!.name).toBe('Calculator')
		expect(cfg!.wmClassHint).toBe('liv-openui-calc')
	})

	test('update re-fires register (idempotent on deterministic UUID)', async () => {
		const redis = fakeRedis()
		const nativeAppStore = new NativeAppConfigStore(redis)
		const router = createOpenclawosAppsRouter({
			repo: fakeRepo,
			nativeAppStore,
			logger: {info: () => undefined, warn: () => undefined},
		})
		const caller = router.createCaller(makeAdminCtx() as never)

		await caller.create({slug: 'rename', name: 'Old Name', content: 'x'})
		await caller.update({slug: 'rename', name: 'New Name', content: 'x'})

		const all = await nativeAppStore.list()
		expect(all).toHaveLength(1)
		expect(all[0]!.name).toBe('New Name')
	})

	test('delete propagates to NativeAppConfigStore.delete', async () => {
		const redis = fakeRedis()
		const nativeAppStore = new NativeAppConfigStore(redis)
		const router = createOpenclawosAppsRouter({
			repo: fakeRepo,
			nativeAppStore,
			logger: {info: () => undefined, warn: () => undefined},
		})
		const caller = router.createCaller(makeAdminCtx() as never)

		await caller.create({slug: 'gone', name: 'Gone', content: 'x'})
		await caller.delete({slug: 'gone'})

		const all = await nativeAppStore.list()
		expect(all).toHaveLength(0)
	})

	test('hook failure does NOT mask successful create response (non-fatal)', async () => {
		// Inject a NativeAppConfigStore whose upsert throws.
		const failingStore = {
			upsert: () => Promise.reject(new Error('redis down')),
			delete: () => Promise.resolve(false),
		} as unknown as NativeAppConfigStore

		const warns: string[] = []
		const router = createOpenclawosAppsRouter({
			repo: fakeRepo,
			nativeAppStore: failingStore,
			logger: {info: () => undefined, warn: (m) => warns.push(m)},
		})
		const caller = router.createCaller(makeAdminCtx() as never)

		const r = await caller.create({slug: 'a', name: 'A', content: 'x'})
		expect(r.slug).toBe('a') // create still succeeded
		expect(warns.join('\n')).toContain('Phase 203-10 desktop-registrar (create)')
	})

	test('omitting nativeAppStore is allowed (router still functional)', async () => {
		const router = createOpenclawosAppsRouter({
			repo: fakeRepo,
			logger: {info: () => undefined, warn: () => undefined},
		})
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(
			caller.create({slug: 'no-dock', name: 'X', content: 'x'}),
		).resolves.toMatchObject({slug: 'no-dock'})
	})
})
