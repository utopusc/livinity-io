/**
 * Phase 171-04 — vault-items-router vitest spec (14 assertions).
 *
 * Combined source-text invariant + runtime behavioral suite. The
 * source-text invariants lock the router's structural shape (7
 * adminProcedure-gated procedures, zod `.strict()` on every input,
 * `validateMove` import, registration in common.ts httpOnlyPaths +
 * index.ts createAppRouter). The runtime suite exercises createCaller
 * against a real ItemStore (backed by os.tmpdir()) and asserts:
 *   - happy-path list/create with the new namespace
 *   - cross-type field smuggling rejected (cwd on agent, schedule on project)
 *   - parentId-in-patch rejected (must use move)
 *   - self-parent move rejected with reason in error message
 *   - delete on a not-found valid-shaped id returns {ok: false}
 *
 * Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
 * + D-09 + Phase 162-01/02 + Phase 166 cc-pty backend
 * + Phase 168 cc-pty-router.ts (analog READ-ONLY)
 * + Phase 169 vault-graph backend
 * + Phase 171-01/02/03 upstream all UNCHANGED.
 */

import {describe, expect, it, beforeEach, afterEach} from 'vitest'
import {readFileSync, promises as fs} from 'node:fs'
import {resolve} from 'node:path'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import vaultItemsRouter from './vault-items-router.js'
import {ItemStore} from '../../vault-items/index.js'

const ROUTER_SRC = readFileSync(
	resolve(__dirname, 'vault-items-router.ts'),
	'utf8',
)
const COMMON_SRC = readFileSync(resolve(__dirname, 'common.ts'), 'utf8')
const INDEX_SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

// ── Source-text invariants (S1-S7 → 7 assertions) ────────────────────────

describe('vault-items-router — Phase 171-04 source-text invariants', () => {
	it('S1: source contains all 7 procedure declarations as adminProcedure', () => {
		expect(ROUTER_SRC).toMatch(/list:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/get:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/create:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/update:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/move:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/archive:\s*adminProcedure/)
		expect(ROUTER_SRC).toMatch(/delete:\s*adminProcedure/)
	})

	it('S2: adminProcedure appears at least 7 times (one per procedure)', () => {
		const matches = ROUTER_SRC.match(/adminProcedure/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(7)
	})

	it('S3: every input schema uses .strict() — count >= 5', () => {
		const matches = ROUTER_SRC.match(/\.strict\(\)/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(5)
	})

	it('S4: createInput zod schema does NOT contain server-authoritative keys', () => {
		// Locate the createInput block and bound the slice to that block's
		// terminating `.strict()` call (anything past it belongs to other
		// schema declarations like idOnly / updateInput).
		const createSchemaIdx = ROUTER_SRC.indexOf('const createInput')
		expect(createSchemaIdx).toBeGreaterThanOrEqual(0)
		const tail = ROUTER_SRC.substring(createSchemaIdx)
		const closeIdx = tail.indexOf('.strict()')
		expect(closeIdx).toBeGreaterThan(0)
		const slice = tail.substring(0, closeIdx)
		expect(slice).not.toMatch(/userId:\s*z\./)
		expect(slice).not.toMatch(/\bid:\s*z\./)
		expect(slice).not.toMatch(/createdAt:\s*z\./)
		expect(slice).not.toMatch(/updatedAt:\s*z\./)
		expect(slice).not.toMatch(/archivedAt:\s*z\./)
		expect(slice).not.toMatch(/schemaVersion:\s*z\./)
	})

	it('S5: validateMove imported from vault-items barrel', () => {
		expect(ROUTER_SRC).toMatch(
			/import\s+\{[^}]*validateMove[^}]*\}\s+from\s+['"]\.\.\/\.\.\/vault-items\/index\.js['"]/,
		)
		// Used inside the router body too — at least one call site.
		expect(ROUTER_SRC).toMatch(/validateMove\(/)
	})

	it('S6: common.ts httpOnlyPaths contains all 7 vault.items.* literals', () => {
		expect(COMMON_SRC).toMatch(/'vault\.items\.list'/)
		expect(COMMON_SRC).toMatch(/'vault\.items\.get'/)
		expect(COMMON_SRC).toMatch(/'vault\.items\.create'/)
		expect(COMMON_SRC).toMatch(/'vault\.items\.update'/)
		expect(COMMON_SRC).toMatch(/'vault\.items\.move'/)
		expect(COMMON_SRC).toMatch(/'vault\.items\.archive'/)
		expect(COMMON_SRC).toMatch(/'vault\.items\.delete'/)
	})

	it('S7: index.ts registers vault namespace as router({items: vaultItemsRouter})', () => {
		expect(INDEX_SRC).toMatch(/vault:\s*router\(\{\s*items:\s*vaultItemsRouter\s*\}\)/)
		expect(INDEX_SRC).toMatch(
			/import\s+vaultItemsRouter\s+from\s+['"]\.\/vault-items-router\.js['"]/,
		)
	})
})

// ── Runtime behavior (R1-R7 → 7 assertions) ──────────────────────────────

describe('vault-items-router — runtime behavior (createCaller against real ItemStore)', () => {
	let vaultRoot: string
	let store: ItemStore
	let caller: ReturnType<typeof vaultItemsRouter.createCaller>

	beforeEach(async () => {
		vaultRoot = path.join(os.tmpdir(), 'vault-items-rt-' + randomUUID())
		await fs.mkdir(vaultRoot, {recursive: true})
		store = new ItemStore({vaultRoot})
		caller = vaultItemsRouter.createCaller({
			// Bypass isAuthenticated middleware in tests (no real JWT cookie / DB).
			dangerouslyBypassAuthentication: true,
			currentUser: {id: 'admin', username: 'admin', role: 'admin'},
			livinityd: {itemStore: store},
			logger: {log: () => {}, warn: () => {}, error: () => {}},
		} as any)
	})

	afterEach(async () => {
		await fs.rm(vaultRoot, {recursive: true, force: true}).catch(() => {})
	})

	it('R1: list with empty vault returns {items: []}', async () => {
		const res = await caller.list()
		expect(res).toEqual({items: []})
	})

	it('R2: create({type: project, name: X}) returns the created Item', async () => {
		const res = await caller.create({type: 'project', name: 'My Project'})
		expect(res.item).toMatchObject({
			type: 'project',
			name: 'My Project',
			parentId: null,
			pinned: false,
			archivedAt: null,
			schemaVersion: 1,
		})
		expect(typeof res.item.id).toBe('string')
		expect(res.item.id.length).toBeGreaterThanOrEqual(20)
		// And it survives list()
		const list = await caller.list()
		expect(list.items.length).toBe(1)
		expect(list.items[0].id).toBe(res.item.id)
	})

	it('R3: create({type: project, schedule: cron}) rejects BAD_REQUEST (schedule is agent-only)', async () => {
		await expect(
			caller.create({type: 'project', name: 'X', schedule: '0 * * * *'} as any),
		).rejects.toThrow(/schedule is agent-only/)
	})

	it('R4: create({type: agent, cwd: /x}) rejects BAD_REQUEST (cwd is project-only)', async () => {
		await expect(
			caller.create({type: 'agent', name: 'X', cwd: '/x'} as any),
		).rejects.toThrow(/cwd is project-only/)
	})

	it('R5: update({id, patch: {parentId}}) rejects BAD_REQUEST (parentId must use move)', async () => {
		const created = await caller.create({type: 'project', name: 'X'})
		const other = await caller.create({type: 'project', name: 'Y'})
		await expect(
			caller.update({id: created.item.id, patch: {parentId: other.item.id}}),
		).rejects.toThrow(/vault\.items\.move/)
	})

	it('R6: move({id, newParentId: id}) rejects BAD_REQUEST containing self', async () => {
		const created = await caller.create({type: 'project', name: 'X'})
		await expect(
			caller.move({id: created.item.id, newParentId: created.item.id}),
		).rejects.toThrow(/self/)
	})

	it('R7: delete({id: <unused valid-shaped id>}) returns {ok: false}', async () => {
		// 20-char valid-shape id that is NOT in the store.
		const unused = '0123456789abcdef0123_unused'
		const res = await caller.delete({id: unused})
		expect(res.ok).toBe(false)
	})
})
