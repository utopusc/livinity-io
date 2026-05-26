/**
 * Phase 219 T7 — skills marketplace router smoke tests.
 *
 * Round-trip: list → install → list-installed (via SkillsLoader) → file exists.
 */
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {SkillsLoader} from '../../skills/loader.js'
import {createSkillsMarketRouter, skillsMarketRouter} from './skills-market-router.js'

function makeAdminCtx() {
	return {
		livinityd: {} as never,
		logger: {info: () => undefined, warn: () => undefined, error: () => undefined, verbose: () => undefined, log: () => undefined, debug: () => undefined},
		server: {} as never,
		user: {} as never,
		appStore: {} as never,
		apps: {} as never,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

const loggerSpy = () => ({info: vi.fn(), warn: vi.fn()})

describe('skills-market-router (Phase 219 T7)', () => {
	let vaultRoot: string

	beforeEach(() => {
		vaultRoot = mkdtempSync(join(tmpdir(), 'liv-skills-market-test-'))
	})
	afterEach(() => {
		rmSync(vaultRoot, {recursive: true, force: true})
	})

	test('list returns ≥10 verified-aware curated entries sorted alphabetically', async () => {
		const caller = createSkillsMarketRouter({logger: loggerSpy(), vaultRoot}).createCaller(
			makeAdminCtx() as never,
		)
		const cards = await caller.list()
		expect(cards.length).toBeGreaterThanOrEqual(10)
		const names = cards.map((c) => c.name)
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
		expect(cards.some((c) => c.verified)).toBe(true)
		// Every card has the contract fields.
		for (const c of cards) {
			expect(typeof c.slug).toBe('string')
			expect(typeof c.name).toBe('string')
			expect(typeof c.description).toBe('string')
			expect(typeof c.category).toBe('string')
		}
	})

	test('list filters by category', async () => {
		const caller = createSkillsMarketRouter({logger: loggerSpy(), vaultRoot}).createCaller(
			makeAdminCtx() as never,
		)
		const cards = await caller.list({category: 'devops'})
		expect(cards.length).toBeGreaterThan(0)
		for (const c of cards) {
			expect(c.category).toBe('devops')
		}
	})

	test('install writes SKILL.md into the agent vault dir and SkillsLoader picks it up', async () => {
		const caller = createSkillsMarketRouter({logger: loggerSpy(), vaultRoot}).createCaller(
			makeAdminCtx() as never,
		)
		const res = await caller.install({agentSlug: 'liv-ai', skillSlug: 'code-review'})
		expect(res.ok).toBe(true)
		expect(existsSync(res.path)).toBe(true)
		const body = readFileSync(res.path, 'utf8')
		expect(body).toMatch(/^---\nname: code-review/)

		// Roundtrip via SkillsLoader (T6) confirms the install lands in the same place T6 reads from.
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		const manifest = loader.loadManifest('liv-ai')
		expect(manifest.skills.find((s) => s.slug === 'code-review')).toBeTruthy()
	})

	test('install rejects unknown skill slugs with NOT_FOUND', async () => {
		const caller = createSkillsMarketRouter({logger: loggerSpy(), vaultRoot}).createCaller(
			makeAdminCtx() as never,
		)
		await expect(
			caller.install({agentSlug: 'liv-ai', skillSlug: 'does-not-exist'}),
		).rejects.toMatchObject({code: 'NOT_FOUND'})
	})

	test('stub list works without injection (catalog is pure data)', async () => {
		const caller = skillsMarketRouter.createCaller(makeAdminCtx() as never)
		const cards = await caller.list()
		expect(cards.length).toBeGreaterThanOrEqual(10)
	})

	test('stub install throws PRECONDITION_FAILED until boot wires the real router', async () => {
		const caller = skillsMarketRouter.createCaller(makeAdminCtx() as never)
		await expect(
			caller.install({agentSlug: 'liv-ai', skillSlug: 'code-review'}),
		).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})
	})
})
