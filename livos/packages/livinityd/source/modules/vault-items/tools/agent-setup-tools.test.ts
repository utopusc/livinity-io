// Phase 189-03 — agent-setup-tools.test.ts (TDD RED first)
// 6 assertions: T-01..T-06

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
import {registerAgentSetupTools, AGENT_SETUP_TOOL_NAMES} from './agent-setup-tools.js'
import type {Redis} from 'ioredis'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeServer() {
	const handlers: Record<string, (args: unknown) => Promise<unknown>> = {}
	return {
		tool: vi.fn(
			(
				name: string,
				_desc: string,
				_schema: Record<string, unknown>,
				handler: (args: unknown) => Promise<unknown>,
			) => {
				handlers[name] = handler
			},
		),
		call: (name: string, args: unknown) => handlers[name]?.(args),
		handlers,
	}
}

function makeRedis() {
	return {
		rpush: vi.fn().mockResolvedValue(1),
		ltrim: vi.fn().mockResolvedValue('OK'),
	} as unknown as Redis
}

const AGENT_DIR = '/vault/items/test-agent-id'

beforeEach(() => {
	vi.clearAllMocks()
})

describe('registerAgentSetupTools — Phase 189-03', () => {
	it('T-01: agent_config_set with valid input writes setup_done:true + all fields to .agent/config.json', async () => {
		// Mock: read existing (no file), write succeeds
		vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.rename).mockResolvedValue(undefined)
		vi.mocked(fs.appendFile).mockResolvedValue(undefined)

		const server = makeServer()
		const redis = makeRedis()
		registerAgentSetupTools(server, {agentDir: AGENT_DIR, redis})

		const result = (await server.call('agent_config_set', {
			mcps: ['git'],
			tasks: 'help me code',
			schedule: null,
			tools: null,
		})) as {content: Array<{type: string; text: string}>; isError: boolean}

		expect(result.isError).toBe(false)

		// Verify writeFile was called with correct data
		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const writtenPath = writeCall[0] as string
		const writtenContent = writeCall[1] as string
		const parsed = JSON.parse(writtenContent)

		expect(writtenPath).toContain('.tmp')
		expect(parsed.setup_done).toBe(true)
		expect(parsed.mcps).toEqual(['git'])
		expect(parsed.tasks).toBe('help me code')
		expect(parsed.schedule).toBeNull()
		expect(parsed.tools).toBeNull()
	})

	it('T-02: written config.json contains configured_at ISO8601 timestamp', async () => {
		vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.rename).mockResolvedValue(undefined)
		vi.mocked(fs.appendFile).mockResolvedValue(undefined)

		const server = makeServer()
		const redis = makeRedis()
		registerAgentSetupTools(server, {agentDir: AGENT_DIR, redis})

		await server.call('agent_config_set', {
			mcps: [],
			tasks: 'test tasks',
			schedule: null,
			tools: null,
		})

		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const parsed = JSON.parse(writeCall[1] as string)
		expect(parsed.configured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
	})

	it('T-03: agent_config_set appends a "## Agent Guidelines" section to claude.md', async () => {
		vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.rename).mockResolvedValue(undefined)
		vi.mocked(fs.appendFile).mockResolvedValue(undefined)

		const server = makeServer()
		const redis = makeRedis()
		registerAgentSetupTools(server, {agentDir: AGENT_DIR, redis})

		await server.call('agent_config_set', {
			mcps: ['filesystem'],
			tasks: 'help me code',
			schedule: '0 9 * * *',
			tools: null,
		})

		expect(vi.mocked(fs.appendFile)).toHaveBeenCalled()
		const appendCall = vi.mocked(fs.appendFile).mock.calls[0]
		const appendedContent = appendCall[1] as string
		expect(appendedContent).toContain('## Agent Guidelines')
	})

	it('T-04: calling agent_config_set twice — claude.md gets exactly ONE "## Agent Guidelines" (idempotent)', async () => {
		// Second call: existing claude.md already has the marker
		const existingClaudeMd = '# My Agent\n\n## Agent Guidelines\n- Tasks: old tasks\n'
		vi.mocked(fs.readFile).mockImplementation(async (p) => {
			const pathStr = String(p)
			if (pathStr.endsWith('claude.md')) return existingClaudeMd as unknown as Buffer
			throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
		})
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.rename).mockResolvedValue(undefined)
		vi.mocked(fs.appendFile).mockResolvedValue(undefined)

		const server = makeServer()
		const redis = makeRedis()
		registerAgentSetupTools(server, {agentDir: AGENT_DIR, redis})

		await server.call('agent_config_set', {
			mcps: ['git'],
			tasks: 'help me code',
			schedule: null,
			tools: null,
		})

		// appendFile should NOT have been called (marker already exists)
		expect(vi.mocked(fs.appendFile)).not.toHaveBeenCalled()
	})

	it('T-05: agent_config_set with tasks as free-text (not a path) — tool succeeds', async () => {
		vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.rename).mockResolvedValue(undefined)
		vi.mocked(fs.appendFile).mockResolvedValue(undefined)

		const server = makeServer()
		const redis = makeRedis()
		registerAgentSetupTools(server, {agentDir: AGENT_DIR, redis})

		const result = (await server.call('agent_config_set', {
			mcps: [],
			tasks: '../../etc/passwd is a funny path but this is just metadata',
			schedule: null,
			tools: null,
		})) as {content: Array<{type: string; text: string}>; isError: boolean}

		// tasks is just metadata — should succeed
		expect(result.isError).toBe(false)
	})

	it('T-06: agent_config_set with missing required field (no tasks) returns isError:true', async () => {
		const server = makeServer()
		const redis = makeRedis()
		registerAgentSetupTools(server, {agentDir: AGENT_DIR, redis})

		const result = (await server.call('agent_config_set', {
			mcps: ['git'],
			// tasks is missing
			schedule: null,
			tools: null,
		})) as {content: Array<{type: string; text: string}>; isError: boolean}

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Validation error')
	})
})

describe('AGENT_SETUP_TOOL_NAMES', () => {
	it('exports array containing "agent_config_set"', () => {
		expect(AGENT_SETUP_TOOL_NAMES).toContain('agent_config_set')
	})
})
