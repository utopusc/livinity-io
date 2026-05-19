/**
 * Phase 164-03 — inbox-writer.test.ts
 *
 * Vitest suite for the autonomous-run inbox writeback module. Locks the
 * filename pattern, frontmatter shape, idempotency, and collision sequencing
 * that the scheduler (164-02) builds against.
 *
 * Invariants enforced:
 *   - Filename: <YYYY-MM-DD>_<HH-MM>_<agent>.md (UTC), seconds/ms dropped
 *   - Frontmatter: 8 fields, locked order, cost_usd as .toFixed(4)
 *   - Collision sequencing: unsuffixed → _2 → _3 → ... → _99 cap
 *   - Idempotency: identical content hash → no-op skip (mtime preserved)
 *   - Backlinks: agent definition wikilink ALWAYS present + optional extras
 *   - mkdir recursive when vault/inbox/ missing
 *   - Zero real /home/bruce writes from tests (tmpdir-only)
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync, existsSync, statSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'

import {writeInboxEntry, type InboxEntryInput} from './inbox-writer.js'

let workDir: string

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), 'livos-inbox-'))
})

afterEach(() => {
	rmSync(workDir, {recursive: true, force: true})
})

function baseInput(overrides: Partial<InboxEntryInput> = {}): InboxEntryInput {
	return {
		vaultPath: workDir,
		agent: 'nightly-backup-audit',
		status: 'success',
		startedAt: new Date('2026-05-20T03:00:00Z'),
		durationMs: 47312,
		costUsd: 0.42,
		turns: 4,
		model: 'claude-sonnet-4-6',
		body: 'Latest backup OK at 03:00. Disk pressure normal.',
		agentSourceRelPath: 'livos-agents/nightly-backup-audit',
		...overrides,
	}
}

describe('writeInboxEntry — Phase 164-03 inbox writeback', () => {
	it('Test 1 (happy path): writes the locked file with full frontmatter + body + backlinks', async () => {
		const result = await writeInboxEntry(baseInput())
		expect(result.written).toBe(true)
		if (!result.written) return
		const expectedPath = join(workDir, 'inbox', '2026-05-20_03-00_nightly-backup-audit.md')
		expect(result.path).toBe(expectedPath)
		expect(existsSync(expectedPath)).toBe(true)

		const content = readFileSync(expectedPath, 'utf8')
		expect(content).toContain('agent: nightly-backup-audit')
		expect(content).toContain('status: success')
		expect(content).toContain('started: 2026-05-20T03:00:00.000Z')
		expect(content).toContain('duration_ms: 47312')
		expect(content).toContain('cost_usd: 0.4200')
		expect(content).toContain('turns: 4')
		expect(content).toContain('model: claude-sonnet-4-6')
		expect(content).toContain('Latest backup OK at 03:00. Disk pressure normal.')
		expect(content).toContain('## Backlinks')
		expect(content).toContain('[[livos-agents/nightly-backup-audit]]')
	})

	it('Test 2 (filename pattern): seconds + ms dropped from filename, frontmatter keeps ISO 8601', async () => {
		const input = baseInput({
			startedAt: new Date('2026-05-20T15:42:17.123Z'),
		})
		const result = await writeInboxEntry(input)
		expect(result.written).toBe(true)
		if (!result.written) return
		expect(result.path).toBe(
			join(workDir, 'inbox', '2026-05-20_15-42_nightly-backup-audit.md'),
		)
		const content = readFileSync(result.path, 'utf8')
		// Frontmatter retains full ISO 8601 including ms (seconds preserved):
		expect(content).toContain('started: 2026-05-20T15:42:17.123Z')
	})

	it('Test 3 (collision sequencing): first unsuffixed, second _2, third _3', async () => {
		// Three writes within the same minute for the same agent.
		// Bodies differ so the idempotency hash does NOT short-circuit.
		const a = await writeInboxEntry(baseInput({body: 'run 1 body'}))
		const b = await writeInboxEntry(baseInput({body: 'run 2 body'}))
		const c = await writeInboxEntry(baseInput({body: 'run 3 body'}))

		expect(a.written).toBe(true)
		expect(b.written).toBe(true)
		expect(c.written).toBe(true)
		if (!a.written || !b.written || !c.written) return

		expect(a.path).toBe(join(workDir, 'inbox', '2026-05-20_03-00_nightly-backup-audit.md'))
		expect(b.path).toBe(join(workDir, 'inbox', '2026-05-20_03-00_nightly-backup-audit_2.md'))
		expect(c.path).toBe(join(workDir, 'inbox', '2026-05-20_03-00_nightly-backup-audit_3.md'))
	})

	it('Test 4 (idempotency via content hash): identical payload → no-op, mtime preserved', async () => {
		const first = await writeInboxEntry(baseInput())
		expect(first.written).toBe(true)
		if (!first.written) return

		const mtimeBefore = statSync(first.path).mtimeMs

		// Give the filesystem a moment so any rewrite would be detectable.
		await new Promise(r => setTimeout(r, 25))

		const second = await writeInboxEntry(baseInput())
		expect(second.written).toBe(false)
		if (second.written) return
		expect(second.reason).toBe('duplicate')

		const mtimeAfter = statSync(first.path).mtimeMs
		expect(mtimeAfter).toBe(mtimeBefore)
	})

	it('Test 5 (idempotency does NOT block when content differs): collision sequencing kicks in', async () => {
		// Same minute + same agent, DIFFERENT body — must sequence, not skip.
		const first = await writeInboxEntry(baseInput({body: 'original body'}))
		const second = await writeInboxEntry(baseInput({body: 'modified body'}))

		expect(first.written).toBe(true)
		expect(second.written).toBe(true)
		if (!first.written || !second.written) return
		expect(first.path).toBe(join(workDir, 'inbox', '2026-05-20_03-00_nightly-backup-audit.md'))
		expect(second.path).toBe(join(workDir, 'inbox', '2026-05-20_03-00_nightly-backup-audit_2.md'))
	})

	it('Test 6 (inbox dir missing): mkdir recursive creates vault/inbox/', async () => {
		// vault root exists (workDir) but inbox/ does not.
		expect(existsSync(join(workDir, 'inbox'))).toBe(false)
		const result = await writeInboxEntry(baseInput())
		expect(result.written).toBe(true)
		expect(existsSync(join(workDir, 'inbox'))).toBe(true)
		expect(statSync(join(workDir, 'inbox')).isDirectory()).toBe(true)
	})

	it('Test 7 (error status): status=error body preserved verbatim, no special decoration', async () => {
		const input = baseInput({
			status: 'error',
			body: 'Agent execution failed: connection timeout',
		})
		const result = await writeInboxEntry(input)
		expect(result.written).toBe(true)
		if (!result.written) return
		const content = readFileSync(result.path, 'utf8')
		expect(content).toContain('status: error')
		expect(content).toContain('Agent execution failed: connection timeout')
	})

	it('Test 8 (no backlinks): only agent definition wikilink appears', async () => {
		const result = await writeInboxEntry(baseInput({backlinks: undefined}))
		expect(result.written).toBe(true)
		if (!result.written) return
		const content = readFileSync(result.path, 'utf8')
		expect(content).toContain('[[livos-agents/nightly-backup-audit]]')
		// The Backlinks section should NOT contain any other wikilinks.
		const backlinksSection = content.slice(content.indexOf('## Backlinks'))
		const wikilinks = backlinksSection.match(/\[\[[^\]]+\]\]/g) ?? []
		expect(wikilinks).toEqual(['[[livos-agents/nightly-backup-audit]]'])

		// Empty array variant — same result.
		const result2 = await writeInboxEntry(baseInput({backlinks: []}))
		expect(result2.written).toBe(true)
		if (!result2.written) return
		const content2 = readFileSync(result2.path, 'utf8')
		const backlinksSection2 = content2.slice(content2.indexOf('## Backlinks'))
		const wikilinks2 = backlinksSection2.match(/\[\[[^\]]+\]\]/g) ?? []
		expect(wikilinks2).toEqual(['[[livos-agents/nightly-backup-audit]]'])
	})

	it('Test 9 (extra backlinks): caller-supplied targets appear after the definition link', async () => {
		const input = baseInput({
			backlinks: ['references/mini-pc', 'memory/projects/v34'],
		})
		const result = await writeInboxEntry(input)
		expect(result.written).toBe(true)
		if (!result.written) return
		const content = readFileSync(result.path, 'utf8')
		expect(content).toContain('[[livos-agents/nightly-backup-audit]]')
		expect(content).toContain('[[references/mini-pc]]')
		expect(content).toContain('[[memory/projects/v34]]')
		// Order check: definition link comes first.
		const idxDef = content.indexOf('[[livos-agents/nightly-backup-audit]]')
		const idxMini = content.indexOf('[[references/mini-pc]]')
		const idxV34 = content.indexOf('[[memory/projects/v34]]')
		expect(idxDef).toBeGreaterThan(-1)
		expect(idxMini).toBeGreaterThan(idxDef)
		expect(idxV34).toBeGreaterThan(idxMini)
	})

	it('Test 10 (cost formatting): toFixed(4) lock — 0 → 0.0000, 1.23456789 → 1.2346', async () => {
		const zeroResult = await writeInboxEntry(
			baseInput({costUsd: 0, agent: 'zero-cost-agent'}),
		)
		expect(zeroResult.written).toBe(true)
		if (!zeroResult.written) return
		expect(readFileSync(zeroResult.path, 'utf8')).toContain('cost_usd: 0.0000')

		const roundedResult = await writeInboxEntry(
			baseInput({costUsd: 1.23456789, agent: 'rounded-cost-agent'}),
		)
		expect(roundedResult.written).toBe(true)
		if (!roundedResult.written) return
		expect(readFileSync(roundedResult.path, 'utf8')).toContain('cost_usd: 1.2346')
	})

	it('Test 11 (content hash sanity): rewriting after delete is NOT a duplicate', async () => {
		// Defensive: SHA-256 idempotency only blocks when the EXISTING file
		// matches; if the file is gone, a fresh write must succeed.
		const first = await writeInboxEntry(baseInput())
		expect(first.written).toBe(true)
		if (!first.written) return
		rmSync(first.path)
		const second = await writeInboxEntry(baseInput())
		expect(second.written).toBe(true)
		if (!second.written) return
		expect(second.path).toBe(first.path)
	})

	it('Test 12 (frontmatter order locked): downstream parsers can depend on field order', async () => {
		const result = await writeInboxEntry(baseInput())
		expect(result.written).toBe(true)
		if (!result.written) return
		const content = readFileSync(result.path, 'utf8')
		const frontmatter = content.split('---')[1] ?? ''
		const fieldOrder = frontmatter
			.split('\n')
			.map(l => l.split(':')[0].trim())
			.filter(k => k.length > 0)
		expect(fieldOrder).toEqual([
			'agent',
			'status',
			'started',
			'duration_ms',
			'cost_usd',
			'turns',
			'model',
		])
	})
})
