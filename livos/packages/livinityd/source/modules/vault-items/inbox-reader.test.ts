// Phase 177-03 — InboxReader tests (T-READ-01..T-READ-08).
//
// Uses real temp filesystem (os.tmpdir() + randomUUID subfolder) for fixtures.
// No mocks for the reader itself — it IS the filesystem layer.
// All RED until inbox-reader.ts exists.

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'
import * as os from 'node:os'

// SUT — will fail "Cannot find module" until created
import {InboxReader} from './inbox-reader.js'

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeFrontmatter(opts: {
	runAt: string
	triggeredBy: 'cron' | 'manual'
	durationMs: number
	status: 'success' | 'failed'
	read?: boolean
}) {
	const read = opts.read ?? false
	return [
		'---',
		`runAt: "${opts.runAt}"`,
		`triggeredBy: ${opts.triggeredBy}`,
		`durationMs: ${opts.durationMs}`,
		`status: ${opts.status}`,
		`read: ${read}`,
		'---',
		'Body text here.',
	].join('\n')
}

async function writeInboxFile(
	vaultRoot: string,
	agentId: string,
	runId: string,
	opts: Parameters<typeof makeFrontmatter>[0],
) {
	const dir = path.join(vaultRoot, 'items', agentId, 'inbox')
	await fs.mkdir(dir, {recursive: true})
	const filePath = path.join(dir, `${runId}.md`)
	await fs.writeFile(filePath, makeFrontmatter(opts), 'utf-8')
	return filePath
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InboxReader — T-READ-01 through T-READ-08', () => {
	let tmpDir: string
	let reader: InboxReader

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `inbox-reader-test-${randomUUID()}`)
		await fs.mkdir(tmpDir, {recursive: true})
		reader = new InboxReader({vaultRoot: tmpDir})
	})

	afterEach(async () => {
		await fs.rm(tmpDir, {recursive: true, force: true})
	})

	it('T-READ-01: listByAgent returns entries sorted newest-first by runAt', async () => {
		await writeInboxFile(tmpDir, 'agent-A', 'run-1', {
			runAt: '2024-01-01T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 1000,
			status: 'success',
		})
		await writeInboxFile(tmpDir, 'agent-A', 'run-2', {
			runAt: '2024-01-03T10:00:00.000Z',
			triggeredBy: 'manual',
			durationMs: 2000,
			status: 'success',
		})
		await writeInboxFile(tmpDir, 'agent-A', 'run-3', {
			runAt: '2024-01-02T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 3000,
			status: 'failed',
		})

		const entries = await reader.listByAgent('agent-A')
		expect(entries.length).toBe(3)
		// Newest first
		expect(entries[0].runAt).toBe('2024-01-03T10:00:00.000Z')
		expect(entries[entries.length - 1].runAt).toBe('2024-01-01T10:00:00.000Z')
	})

	it('T-READ-02: listGlobal returns entries from all agents sorted newest-first', async () => {
		await writeInboxFile(tmpDir, 'agent-A', 'run-1', {
			runAt: '2024-01-01T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 1000,
			status: 'success',
		})
		await writeInboxFile(tmpDir, 'agent-A', 'run-2', {
			runAt: '2024-01-03T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 2000,
			status: 'success',
		})
		await writeInboxFile(tmpDir, 'agent-B', 'run-3', {
			runAt: '2024-01-02T10:00:00.000Z',
			triggeredBy: 'manual',
			durationMs: 3000,
			status: 'success',
		})
		await writeInboxFile(tmpDir, 'agent-B', 'run-4', {
			runAt: '2024-01-04T10:00:00.000Z',
			triggeredBy: 'manual',
			durationMs: 4000,
			status: 'failed',
		})

		const entries = await reader.listGlobal()
		expect(entries.length).toBe(4)
		expect(entries[0].runAt).toBe('2024-01-04T10:00:00.000Z')
	})

	it('T-READ-03: listByAgent filters to only the specified agentId', async () => {
		await writeInboxFile(tmpDir, 'agent-A', 'run-1', {
			runAt: '2024-01-01T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 1000,
			status: 'success',
		})
		await writeInboxFile(tmpDir, 'agent-B', 'run-2', {
			runAt: '2024-01-02T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 2000,
			status: 'success',
		})

		const entries = await reader.listByAgent('agent-A')
		expect(entries.length).toBe(1)
		expect(entries[0].agentId).toBe('agent-A')
	})

	it('T-READ-04: markRead rewrites frontmatter — getEntry then shows read=true', async () => {
		const filePath = await writeInboxFile(tmpDir, 'agent-A', 'run-1', {
			runAt: '2024-01-01T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 1000,
			status: 'success',
			read: false,
		})

		await reader.markRead(filePath)

		const {meta} = await reader.getEntry(filePath)
		expect(meta.read).toBe(true)
	})

	it('T-READ-05: getEntry returns the body text below the frontmatter', async () => {
		const filePath = await writeInboxFile(tmpDir, 'agent-A', 'run-1', {
			runAt: '2024-01-01T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 1000,
			status: 'success',
		})

		const {body} = await reader.getEntry(filePath)
		expect(body).toContain('Body text here.')
	})

	it('T-READ-06: listByAgent with unread=true returns only unread entries', async () => {
		await writeInboxFile(tmpDir, 'agent-A', 'run-1', {
			runAt: '2024-01-01T10:00:00.000Z',
			triggeredBy: 'cron',
			durationMs: 1000,
			status: 'success',
			read: true,
		})
		await writeInboxFile(tmpDir, 'agent-A', 'run-2', {
			runAt: '2024-01-02T10:00:00.000Z',
			triggeredBy: 'manual',
			durationMs: 2000,
			status: 'success',
			read: false,
		})

		const unread = await reader.listByAgent('agent-A', {unread: true})
		expect(unread.length).toBe(1)
		expect(unread[0].read).toBe(false)
	})

	it('T-READ-07: path traversal guard — walker skips paths outside vaultRoot/items/', async () => {
		// Create a file outside the valid subtree (simulate by calling getEntry with a traversal path)
		const traversalPath = path.join(tmpDir, 'items', '..', '..', 'etc', 'passwd')
		await expect(reader.getEntry(traversalPath)).rejects.toThrow(/path traversal/i)
	})

	it('T-READ-08: listByAgent returns [] when items/<agentId>/inbox/ does not exist', async () => {
		const entries = await reader.listByAgent('no-such-agent')
		expect(entries).toEqual([])
	})
})
