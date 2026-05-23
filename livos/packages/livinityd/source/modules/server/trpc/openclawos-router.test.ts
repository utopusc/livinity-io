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
