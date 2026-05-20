// Phase 177-02 — AgentRunner tests (T-RUN-01..T-RUN-12).
//
// Pattern: vi.hoisted() mocks; ioredis Redis mocked as plain object;
// CcPtyManager mocked (no tmux). All RED until agent-runner.ts exists.

import {describe, it, expect, vi, beforeEach} from 'vitest'

// ── SUT imports ───────────────────────────────────────────────────────────────
// These will fail with "Cannot find module" until agent-runner.ts is created.
import {AgentRunner} from './agent-runner.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAgentItem(id: string, cwd?: string) {
	return {
		id,
		type: 'agent' as const,
		name: `Agent ${id}`,
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1 as const,
		...(cwd !== undefined ? {cwd} : {}),
	}
}

function makeRedisMock(setResult: 'OK' | null = 'OK') {
	return {
		set: vi.fn(async () => setResult),
		del: vi.fn(async () => 1),
	}
}

function makePtyManagerMock() {
	return {
		createSession: vi.fn(async () => ({
			id: 'session-1',
			userId: 'scheduler',
			tmuxName: 'livos-cc-scheduler-abc12345',
			cwd: '/root/liv',
		})),
	}
}

function makeItemStoreMock(item: ReturnType<typeof makeAgentItem> | null = makeAgentItem('agent-abc123456789012')) {
	return {
		read: vi.fn(async () => item),
	}
}

function makeInboxWriterMock() {
	return vi.fn(async () => ({written: true, path: '/tmp/fake.md'}))
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AgentRunner — T-RUN-01 through T-RUN-12', () => {
	const VAULT_ROOT = '/root/livinity-vault'
	let redisMock: ReturnType<typeof makeRedisMock>
	let ptyManagerMock: ReturnType<typeof makePtyManagerMock>
	let itemStoreMock: ReturnType<typeof makeItemStoreMock>
	let inboxWriterMock: ReturnType<typeof makeInboxWriterMock>
	let runner: AgentRunner

	beforeEach(() => {
		redisMock = makeRedisMock('OK')
		ptyManagerMock = makePtyManagerMock()
		itemStoreMock = makeItemStoreMock()
		inboxWriterMock = makeInboxWriterMock()
		runner = new AgentRunner({
			redis: redisMock as any,
			itemStore: itemStoreMock as any,
			ccPtyManager: ptyManagerMock as any,
			vaultRoot: VAULT_ROOT,
			inboxWriterImpl: inboxWriterMock,
		})
	})

	it('T-RUN-01: runAgent acquires Redis lock and returns {ok: true} with a runId', async () => {
		const result = await runner.runAgent('agent-abc123456789012')
		expect(result).toMatchObject({ok: true})
		expect((result as {ok: true; runId: string}).runId).toBeTruthy()
		expect(redisMock.set).toHaveBeenCalledWith(
			'liv:agent:running:agent-abc123456789012',
			expect.any(String),
			'NX',
			'PX',
			900_000,
		)
	})

	it('T-RUN-02: second concurrent call (lock held) returns {ok: false, reason: "already_running"}', async () => {
		redisMock.set.mockResolvedValueOnce(null) // first call: lock not acquired
		const result = await runner.runAgent('agent-abc123456789012')
		expect(result).toEqual({ok: false, reason: 'already_running'})
		expect(ptyManagerMock.createSession).not.toHaveBeenCalled()
	})

	it('T-RUN-03: runAgent returns {ok: false, reason: "agent_not_found"} when item missing', async () => {
		itemStoreMock.read.mockResolvedValueOnce(null)
		const result = await runner.runAgent('agent-notexist-99999')
		expect(result).toEqual({ok: false, reason: 'agent_not_found'})
		expect(redisMock.set).not.toHaveBeenCalled()
	})

	it('T-RUN-04: Redis lock key is deleted in finally even if PTY spawn throws', async () => {
		ptyManagerMock.createSession.mockRejectedValueOnce(new Error('tmux failed'))
		const result = await runner.runAgent('agent-abc123456789012')
		expect(result).toMatchObject({ok: false, reason: 'spawn_error'})
		expect(redisMock.del).toHaveBeenCalledWith('liv:agent:running:agent-abc123456789012')
	})

	it('T-RUN-05: inbox entry written with correct frontmatter fields', async () => {
		const result = await runner.runAgent('agent-abc123456789012')
		expect(result).toMatchObject({ok: true})
		expect(inboxWriterMock).toHaveBeenCalledTimes(1)
		const [, frontmatter] = inboxWriterMock.mock.calls[0] as [string, Record<string, unknown>]
		expect(frontmatter).toHaveProperty('runAt')
		expect(frontmatter).toHaveProperty('triggeredBy', 'manual')
		expect(frontmatter).toHaveProperty('durationMs')
		expect(frontmatter).toHaveProperty('status', 'success')
	})

	it('T-RUN-06: triggeredBy="cron" when opts.triggeredBy="cron"', async () => {
		await runner.runAgent('agent-abc123456789012', {triggeredBy: 'cron'})
		const [, frontmatter] = inboxWriterMock.mock.calls[0] as [string, Record<string, unknown>]
		expect(frontmatter).toHaveProperty('triggeredBy', 'cron')
	})

	it('T-RUN-07: triggeredBy="manual" when opts.triggeredBy omitted', async () => {
		await runner.runAgent('agent-abc123456789012')
		const [, frontmatter] = inboxWriterMock.mock.calls[0] as [string, Record<string, unknown>]
		expect(frontmatter).toHaveProperty('triggeredBy', 'manual')
	})

	it('T-RUN-08: CcPtyManager.createSession called with userId="scheduler" and item.cwd when set', async () => {
		itemStoreMock.read.mockResolvedValueOnce(makeAgentItem('agent-abc123456789012', '/home/user/project'))
		await runner.runAgent('agent-abc123456789012')
		expect(ptyManagerMock.createSession).toHaveBeenCalledWith(
			expect.objectContaining({userId: 'scheduler', cwd: '/home/user/project'}),
		)
	})

	it('T-RUN-09: CcPtyManager.createSession called with cwd=vaultRoot when item.cwd is undefined', async () => {
		// item has no cwd (default makeAgentItem doesn't set it)
		await runner.runAgent('agent-abc123456789012')
		expect(ptyManagerMock.createSession).toHaveBeenCalledWith(
			expect.objectContaining({userId: 'scheduler', cwd: VAULT_ROOT}),
		)
	})

	it('T-RUN-10: CcPtyManager.createSession throws → {ok: false, reason: "spawn_error"} + lock released', async () => {
		ptyManagerMock.createSession.mockRejectedValueOnce(new Error('spawn failed'))
		const result = await runner.runAgent('agent-abc123456789012')
		expect(result).toMatchObject({ok: false, reason: 'spawn_error'})
		expect(redisMock.del).toHaveBeenCalledTimes(1)
	})

	it('T-RUN-11: runAgent returns a UUID v4-shaped runId on success', async () => {
		const result = await runner.runAgent('agent-abc123456789012')
		expect(result).toMatchObject({ok: true})
		const {runId} = result as {ok: true; runId: string}
		// UUID v4: 8-4-4-4-12 hex chars
		expect(runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
	})

	it('T-RUN-12: inboxWriterImpl injected in constructor is called instead of real writeFile', async () => {
		await runner.runAgent('agent-abc123456789012')
		// inboxWriterMock was injected — must have been called (not the real fs.writeFile)
		expect(inboxWriterMock).toHaveBeenCalledTimes(1)
		// First arg should be the inbox file path
		const [filePath] = inboxWriterMock.mock.calls[0] as [string]
		expect(filePath).toContain('agent-abc123456789012')
		expect(filePath).toContain('inbox')
	})
})
