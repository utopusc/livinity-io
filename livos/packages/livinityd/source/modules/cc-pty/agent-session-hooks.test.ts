// Phase 189-02 — agent-session-hooks.test.ts (TDD RED first)
// 4 assertions: H-01..H-04
// Phase 189-05 will ADD 6 more assertions (R-01..R-06) to this same file.

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
import {isAgentSession, resolveAgentSpawnArgs} from './agent-session-hooks.js'

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
