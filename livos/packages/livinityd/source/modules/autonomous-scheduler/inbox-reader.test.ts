/**
 * Phase 165-02 — inbox-reader.test.ts
 *
 * Vitest suite for `readLastRunForAgent` (the READ-ONLY frontmatter parser
 * that the Settings UI autonomous panel uses to populate last-run + cost
 * cells per agent).
 *
 * Filename convention + frontmatter shape are locked by inbox-writer.ts; the
 * reader treats both as a public contract.
 *
 * Test isolation: each case mkdtemp's a fresh vault dir + cleans up.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {readLastRunForAgent} from './inbox-reader.js'

describe('readLastRunForAgent — Phase 165-02', () => {
	let vaultPath: string

	beforeEach(async () => {
		vaultPath = await mkdtemp(path.join(tmpdir(), 'inbox-reader-test-'))
	})

	afterEach(async () => {
		await rm(vaultPath, {recursive: true, force: true})
	})

	// Test R1 ──────────────────────────────────────────────────────────
	it('R1 (no inbox dir → all-null)', async () => {
		// vaultPath exists but vaultPath/inbox does NOT
		const r = await readLastRunForAgent(vaultPath, 'nightly')
		expect(r).toEqual({at: null, status: null, costUsd: null})
	})

	// Test R2 ──────────────────────────────────────────────────────────
	it('R2 (empty inbox dir → all-null)', async () => {
		await mkdir(path.join(vaultPath, 'inbox'), {recursive: true})
		const r = await readLastRunForAgent(vaultPath, 'nightly')
		expect(r).toEqual({at: null, status: null, costUsd: null})
	})

	// Test R3 ──────────────────────────────────────────────────────────
	it('R3 (no files match agent → all-null)', async () => {
		const inbox = path.join(vaultPath, 'inbox')
		await mkdir(inbox, {recursive: true})
		await writeFile(
			path.join(inbox, '2026-05-18_09-30_other-agent.md'),
			`---
agent: other-agent
status: success
started: 2026-05-18T09:30:00.000Z
cost_usd: 0.1234
---
body
`,
			'utf8',
		)
		const r = await readLastRunForAgent(vaultPath, 'target-agent')
		expect(r).toEqual({at: null, status: null, costUsd: null})
	})

	// Test R4 ──────────────────────────────────────────────────────────
	it('R4 (single matching entry populated)', async () => {
		const inbox = path.join(vaultPath, 'inbox')
		await mkdir(inbox, {recursive: true})
		await writeFile(
			path.join(inbox, '2026-05-18_09-30_target-agent.md'),
			`---
agent: target-agent
status: success
started: 2026-05-18T09:30:00.000Z
duration_ms: 1234
cost_usd: 0.1234
turns: 1
model: claude-haiku-4-5
---
# body
`,
			'utf8',
		)
		const r = await readLastRunForAgent(vaultPath, 'target-agent')
		expect(r.at).toBe('2026-05-18T09:30:00.000Z')
		expect(r.status).toBe('success')
		expect(r.costUsd).toBe(0.1234)
	})

	// Test R5 ──────────────────────────────────────────────────────────
	it('R5 (multiple entries — newest lexicographic wins; collision _2 sorts after unsuffixed)', async () => {
		const inbox = path.join(vaultPath, 'inbox')
		await mkdir(inbox, {recursive: true})
		// Older entry
		await writeFile(
			path.join(inbox, '2026-05-17_03-00_target-agent.md'),
			`---
agent: target-agent
status: error
started: 2026-05-17T03:00:00.000Z
cost_usd: 0.5000
---
old
`,
			'utf8',
		)
		// Newest minute (unsuffixed)
		await writeFile(
			path.join(inbox, '2026-05-18_09-30_target-agent.md'),
			`---
agent: target-agent
status: success
started: 2026-05-18T09:30:00.000Z
cost_usd: 0.1234
---
mid
`,
			'utf8',
		)
		// Newest minute (collision _2 — sorts AFTER unsuffixed lexicographically)
		await writeFile(
			path.join(inbox, '2026-05-18_09-30_target-agent_2.md'),
			`---
agent: target-agent
status: budget_exceeded
started: 2026-05-18T09:30:01.000Z
cost_usd: 0.0010
---
newest
`,
			'utf8',
		)
		const r = await readLastRunForAgent(vaultPath, 'target-agent')
		expect(r.at).toBe('2026-05-18T09:30:01.000Z')
		expect(r.status).toBe('budget_exceeded')
		expect(r.costUsd).toBe(0.001)
	})

	// Test R6 ──────────────────────────────────────────────────────────
	it('R6 (malformed frontmatter — individual nulls per missing field)', async () => {
		const inbox = path.join(vaultPath, 'inbox')
		await mkdir(inbox, {recursive: true})
		// Frontmatter present but cost_usd missing
		await writeFile(
			path.join(inbox, '2026-05-18_09-30_target-agent.md'),
			`---
agent: target-agent
status: success
started: 2026-05-18T09:30:00.000Z
---
body
`,
			'utf8',
		)
		const r = await readLastRunForAgent(vaultPath, 'target-agent')
		expect(r.at).toBe('2026-05-18T09:30:00.000Z')
		expect(r.status).toBe('success')
		expect(r.costUsd).toBeNull()
	})
})
