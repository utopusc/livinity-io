// Phase 189-02 — agent-session-hooks.test.ts (TDD RED first)
// 4 assertions: H-01..H-04
// Phase 189-05 — 6 more assertions (R-01..R-06) added to this same file.

import {describe, expect, it, vi, beforeEach} from 'vitest'

// Mock fs before imports
vi.mock('node:fs', () => ({
	promises: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		rename: vi.fn(),
		mkdir: vi.fn(),
		appendFile: vi.fn(),
	},
}))

import {promises as fs} from 'node:fs'
import {isAgentSession, resolveAgentSpawnArgs, createAgentSessionRecorder, flushAgentSessionTranscript} from './agent-session-hooks.js'

beforeEach(() => {
	vi.clearAllMocks()
})

describe('isAgentSession — Phase 189-02', () => {
	it('H-01: isAgentSession("liv-agent-abc123") returns true', () => {
		expect(isAgentSession('liv-agent-abc123')).toBe(true)
	})

	it('H-02: isAgentSession("livos-cc-user1-deadbeef") returns false', () => {
		expect(isAgentSession('livos-cc-user1-deadbeef')).toBe(false)
	})
})

describe('resolveAgentSpawnArgs — Phase 189-02', () => {
	it('H-03: setup_done=false → returns extraArgs with --append-system-prompt containing agent name', async () => {
		const mockConfig = JSON.stringify({setup_done: false, mcps: [], tools: [], schedule: null})
		vi.mocked(fs.readFile).mockResolvedValue(mockConfig as unknown as Buffer)

		const result = await resolveAgentSpawnArgs({
			tmuxName: 'liv-agent-abc123',
			agentDir: '/vault/items/abc123',
			agentItem: {id: 'abc123', name: 'MyAgent'},
			mcpNames: ['filesystem', 'git'],
		})

		expect(result.extraArgs).toHaveLength(2)
		expect(result.extraArgs[0]).toBe('--append-system-prompt')
		expect(result.extraArgs[1]).toContain('MyAgent')
	})

	it('H-04: setup_done=true → returns extraArgs=[] (no wizard injection)', async () => {
		const mockConfig = JSON.stringify({setup_done: true, mcps: ['filesystem'], tools: [], schedule: null})
		vi.mocked(fs.readFile).mockResolvedValue(mockConfig as unknown as Buffer)

		const result = await resolveAgentSpawnArgs({
			tmuxName: 'liv-agent-abc123',
			agentDir: '/vault/items/abc123',
			agentItem: {id: 'abc123', name: 'MyAgent'},
			mcpNames: ['filesystem'],
		})

		expect(result.extraArgs).toHaveLength(0)
	})
})

// ── Phase 189-05 — Session Transcript Recorder assertions ─────────────────

describe('createAgentSessionRecorder — Phase 189-05', () => {
	it('R-01: createAgentSessionRecorder() returns a recorder with append() and getTranscript()', () => {
		const recorder = createAgentSessionRecorder()
		expect(typeof recorder.runId).toBe('string')
		expect(recorder.runId.length).toBeGreaterThan(0)
		expect(typeof recorder.startedAt).toBe('number')
		expect(typeof recorder.append).toBe('function')
		expect(typeof recorder.getTranscript).toBe('function')
	})

	it('R-02: after appending two Buffer chunks, getTranscript() returns concatenated ANSI-stripped string', () => {
		const recorder = createAgentSessionRecorder()
		recorder.append(Buffer.from('Hello \x1b[32mWorld\x1b[0m'))
		recorder.append(Buffer.from(' and more'))
		const transcript = recorder.getTranscript()
		// ANSI codes stripped: \x1b[32m and \x1b[0m removed
		expect(transcript).toContain('Hello World and more')
		expect(transcript).not.toContain('\x1b[')
	})
})

describe('flushAgentSessionTranscript — Phase 189-05', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.rename).mockResolvedValue(undefined)
	})

	it('R-03: flushAgentSessionTranscript writes a .md file with YAML frontmatter containing runAt, durationMs, summary', async () => {
		const recorder = createAgentSessionRecorder()
		recorder.append(Buffer.from('First line of transcript\nSecond line'))

		await flushAgentSessionTranscript({
			recorder,
			agentDir: '/vault/items/agent-1',
		})

		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const content = writeCall[1] as string
		expect(content).toContain('runAt:')
		expect(content).toContain('durationMs:')
		expect(content).toContain('summary:')
		expect(content).toContain('---')
	})

	it('R-04: frontmatter summary is the first non-empty line of transcript (max 120 chars)', async () => {
		const recorder = createAgentSessionRecorder()
		recorder.append(Buffer.from('\nHello from the agent\nSecond line'))

		await flushAgentSessionTranscript({
			recorder,
			agentDir: '/vault/items/agent-2',
		})

		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const content = writeCall[1] as string
		expect(content).toContain('Hello from the agent')
	})

	it('R-05: calling flushAgentSessionTranscript twice with same runId is a no-op (idempotent)', async () => {
		const recorder = createAgentSessionRecorder()
		recorder.append(Buffer.from('test content'))

		await flushAgentSessionTranscript({recorder, agentDir: '/vault/items/agent-3'})
		// Second call — same runId
		await flushAgentSessionTranscript({recorder, agentDir: '/vault/items/agent-3'})

		// writeFile should have been called exactly ONCE (first call only)
		expect(vi.mocked(fs.writeFile)).toHaveBeenCalledTimes(1)
	})

	it('R-06: transcript body > 1MB is truncated to 1MB before writing', async () => {
		const recorder = createAgentSessionRecorder()
		// Append slightly more than 1MB
		const chunk = Buffer.alloc(600_000, 'x')
		recorder.append(chunk)
		recorder.append(chunk) // total 1.2MB — exceeds cap

		await flushAgentSessionTranscript({recorder, agentDir: '/vault/items/agent-4'})

		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const content = writeCall[1] as string
		// The body (after frontmatter) should be at most 1MB
		// Frontmatter adds ~100 bytes; total written < 1MB + frontmatter
		expect(Buffer.byteLength(content, 'utf-8')).toBeLessThanOrEqual(1_048_576 + 500)
	})
})
