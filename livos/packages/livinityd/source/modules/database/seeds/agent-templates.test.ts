/**
 * Phase 76 Plan 76-02 — agent_templates seed runner tests.
 *
 * Test backend selection: mocked-pool, matching the Phase 76-01 test
 * discipline (api-keys/database.test.ts, usage-tracking/database.test.ts,
 * agent-templates-repo.test.ts). pg-mem is NOT in livinityd devDeps and
 * DATABASE_URL skip-fallback would silently no-op in CI; mocked-pool
 * deterministically asserts the SQL contract verbatim.
 *
 * Cases (per plan tasks step 5):
 *   1. all 8 seeds satisfy shape constraints — pure unit, no DB.
 *   2. seedAgentTemplates inserts all 8 on empty table.
 *   3. seedAgentTemplates is idempotent (second call inserts 0, skips 8).
 *   4. seed runner caller can recover when query throws (seedAgentTemplates
 *      propagates; initDatabase wraps in try/catch — verified by contract).
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	AGENT_TEMPLATE_SEEDS,
	seedAgentTemplates,
	type AgentTemplateSeed,
} from './agent-templates.js'

const LOCKED_SLUGS = [
	'general-assistant',
	'code-reviewer',
	'researcher',
	'writer',
	'data-analyst',
	'computer-operator',
	'mcp-manager',
	'translator',
] as const

const queryMock = vi.fn()
const fakePool = {query: queryMock} as any

describe('agent-templates seed runner (Phase 76 MARKET-03)', () => {
	beforeEach(() => {
		queryMock.mockReset()
	})

	test('T1 — all 8 seeds satisfy shape constraints (CONTEXT D-05)', () => {
		// Length lock: exactly 8 (NOT 10) per CONTEXT D-05.
		expect(AGENT_TEMPLATE_SEEDS).toHaveLength(8)

		// Slug list lock: exact match in exact order per plan must-haves.
		const seedSlugs = AGENT_TEMPLATE_SEEDS.map(s => s.slug)
		expect(seedSlugs).toEqual([...LOCKED_SLUGS])

		// Per-seed constraints.
		const toolNameRe = /^[a-z][a-z0-9-]*$/
		for (const seed of AGENT_TEMPLATE_SEEDS) {
			// description ≤ 180 (UI card constraint).
			expect(seed.description.length).toBeGreaterThan(0)
			expect(seed.description.length).toBeLessThanOrEqual(180)

			// systemPrompt word count in [100, 300].
			const wordCount = seed.systemPrompt.trim().split(/\s+/).length
			expect(wordCount).toBeGreaterThanOrEqual(100)
			expect(wordCount).toBeLessThanOrEqual(300)

			// tags 1-3 entries.
			expect(seed.tags.length).toBeGreaterThanOrEqual(1)
			expect(seed.tags.length).toBeLessThanOrEqual(3)

			// All tool names are kebab-case (greppable).
			for (const tool of seed.toolsEnabled) {
				expect(tool).toMatch(toolNameRe)
			}

			// mascotEmoji is non-empty single grapheme (allow ZWJ sequences ≤ 4 codepoints).
			expect(seed.mascotEmoji.length).toBeGreaterThan(0)
			expect([...seed.mascotEmoji].length).toBeLessThanOrEqual(4)

			// name non-empty.
			expect(seed.name.length).toBeGreaterThan(0)
		}
	})

	test('T2 — seedAgentTemplates inserts all 8 on empty table', async () => {
		// All 8 inserts return rowCount=1 (fresh inserts).
		for (let i = 0; i < 8; i++) {
			queryMock.mockResolvedValueOnce({rows: [], rowCount: 1})
		}

		const result = await seedAgentTemplates(fakePool)

		expect(result).toEqual({inserted: 8, skipped: 0})
		expect(queryMock).toHaveBeenCalledTimes(8)

		// Every call uses the idempotent INSERT...ON CONFLICT pattern.
		for (const call of queryMock.mock.calls) {
			const [sql, params] = call
			expect(sql).toContain('INSERT INTO agent_templates')
			expect(sql).toContain('ON CONFLICT (slug) DO NOTHING')
			expect(sql).toContain('$5::jsonb')
			expect(Array.isArray(params)).toBe(true)
			expect(params).toHaveLength(7)
		}

		// First call gets first locked slug.
		expect(queryMock.mock.calls[0][1][0]).toBe(LOCKED_SLUGS[0])
		// Last call gets last locked slug.
		expect(queryMock.mock.calls[7][1][0]).toBe(LOCKED_SLUGS[7])
	})

	test('T3 — seedAgentTemplates is idempotent (second run inserts 0, skips 8)', async () => {
		// Re-run on already-seeded table: every INSERT...ON CONFLICT DO NOTHING returns rowCount=0.
		for (let i = 0; i < 8; i++) {
			queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})
		}

		const result = await seedAgentTemplates(fakePool)

		expect(result).toEqual({inserted: 0, skipped: 8})
		expect(queryMock).toHaveBeenCalledTimes(8)
	})

	test('T4 — seedAgentTemplates propagates query errors (caller wraps in try/catch)', async () => {
		// First 2 inserts succeed, 3rd throws.
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 1})
		queryMock.mockRejectedValueOnce(new Error('connection refused'))

		// seedAgentTemplates does NOT catch internally — the contract is that
		// initDatabase() wraps the call in try/catch (verified by reading
		// database/index.ts which logs `Agent template seed failed (non-fatal)`
		// and continues). Promoting the error makes the failure observable.
		await expect(seedAgentTemplates(fakePool)).rejects.toThrow('connection refused')
		expect(queryMock).toHaveBeenCalledTimes(3)
	})

	test('T4b — every seed payload uses parameterized SQL ($1-$7), no string interpolation', async () => {
		for (let i = 0; i < 8; i++) {
			queryMock.mockResolvedValueOnce({rows: [], rowCount: 1})
		}

		await seedAgentTemplates(fakePool)

		// Defensive: assert SQL string literal contains all $1..$7 placeholders
		// AND does NOT contain the seed slug string interpolated raw (T-76-02-02
		// mitigation — no SQL injection via seed strings even though seeds are
		// trusted compile-time literals).
		for (let i = 0; i < 8; i++) {
			const [sql, params] = queryMock.mock.calls[i]
			for (const placeholder of ['$1', '$2', '$3', '$4', '$5', '$6', '$7']) {
				expect(sql).toContain(placeholder)
			}
			// Slug must be in params, not in SQL text.
			const seedSlug = AGENT_TEMPLATE_SEEDS[i].slug
			expect(params[0]).toBe(seedSlug)
			expect(sql).not.toContain(seedSlug)
		}
	})

	test('T_type — AgentTemplateSeed export is a usable type', () => {
		// Compile-time check: assigning a fully-typed literal must succeed.
		const _example: AgentTemplateSeed = {
			slug: 'x',
			name: 'X',
			description: 'd',
			systemPrompt: 'p',
			toolsEnabled: [],
			tags: ['t'],
			mascotEmoji: '🤖',
		}
		expect(_example.slug).toBe('x')
	})
})
