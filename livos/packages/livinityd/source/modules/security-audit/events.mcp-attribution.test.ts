/**
 * Phase 346-02 (MCP-01, D-346-7) — MCP attribution in the audit payload.
 *
 * Asserts recordAdminActionEvent threads `mcpKeyId` into the JSON forensics
 * payload when an admin mutation was MCP-initiated, and records undefined (byte-
 * parity) for a normal human-admin action. getPool is mocked to null so the
 * writer takes the fail-open JSON-only path; fs is mocked to capture the payload
 * without touching disk.
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

// Fail-open: null pool → skip PG INSERT, still do the JSON belt-and-suspenders
// write, which is what we inspect.
vi.mock('../database/index.js', () => ({
	getPool: () => null,
}))

const writeFileMock = vi.fn().mockResolvedValue(undefined)
const mkdirMock = vi.fn().mockResolvedValue(undefined)

vi.mock('node:fs', async () => {
	const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
	return {
		...actual,
		promises: {
			...actual.promises,
			mkdir: (...args: unknown[]) => mkdirMock(...args),
			writeFile: (...args: unknown[]) => writeFileMock(...args),
		},
	}
})

import {recordAdminActionEvent} from './events.js'

const silentLogger = {warn: vi.fn(), error: vi.fn()}

function lastWrittenPayload(): Record<string, unknown> {
	const lastCall = writeFileMock.mock.calls.at(-1)
	expect(lastCall).toBeDefined()
	return JSON.parse(String(lastCall![1]))
}

describe('security-audit/events — MCP attribution (Phase 346-02)', () => {
	beforeEach(() => {
		writeFileMock.mockClear()
		mkdirMock.mockClear()
	})

	test('a mutation carrying mcpKeyId records it in the JSON payload', async () => {
		await recordAdminActionEvent(
			{
				action: 'apps.restart',
				userId: 'admin-1',
				redactedInput: {slug: 'nextcloud'},
				success: true,
				mcpKeyId: 'mcp-key-42',
			},
			silentLogger,
		)

		const payload = lastWrittenPayload()
		expect(payload.mcpKeyId).toBe('mcp-key-42')
		expect(payload.action).toBe('apps.restart')
	})

	test('a mutation WITHOUT mcpKeyId records undefined (byte-parity for non-MCP)', async () => {
		await recordAdminActionEvent(
			{
				action: 'docker.pruneImages',
				userId: 'admin-1',
				redactedInput: {},
				success: true,
			},
			silentLogger,
		)

		const payload = lastWrittenPayload()
		// undefined is dropped by JSON.stringify → the key is simply absent, exactly
		// as a pre-346 audit row (no new field materializes for human-admin actions).
		expect('mcpKeyId' in payload).toBe(false)
	})
})
