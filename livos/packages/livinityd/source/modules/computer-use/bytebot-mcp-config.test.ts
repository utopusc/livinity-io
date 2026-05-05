/**
 * Phase 72-native-06 — registerBytebotMcpServer unit tests.
 *
 * Spec source: 72-native-06-PLAN.md `<task type="auto" tdd="true">` Task 2,
 * behavior block test cases T1..T7.
 *
 * Coverage (must-have list, plan behavior section):
 *   T1 — env without BYTEBOT_MCP_ENABLED → returns {registered:false,
 *        reason:'BYTEBOT_MCP_ENABLED unset'}; configManager.installServer
 *        NOT called.
 *   T2 — BYTEBOT_MCP_ENABLED='true' but process.platform mocked as 'win32' →
 *        {registered:false, reason:'platform not linux'}; install NOT called.
 *   T3 — linux + enabled but server file fs.access throws ENOENT →
 *        {registered:false, reason: includes 'server file not found'}.
 *   T4 — All preconditions met + listServers returns no existing 'bytebot'
 *        entry → calls installServer with the documented config shape
 *        (assert exact arg).
 *   T5 — All preconditions met + listServers returns existing 'bytebot' with
 *        matching shape → calls neither installServer nor updateServer
 *        (no-op); returns {registered:true, reason:'no-op (matched existing)'}.
 *   T6 — All preconditions met + listServers returns existing 'bytebot' with
 *        DIFFERENT shape → calls updateServer with the new partial; returns
 *        {registered:true, reason:'updated existing'}.
 *   T7 — BYTEBOT_MCP_SERVER_PATH custom env override is honored — installServer
 *        args[0] equals the custom path.
 *
 * Mocks:
 *   - `node:fs/promises` access — vi.hoisted + vi.mock pattern (matches
 *     screenshot.test.ts precedent; vi.spyOn cannot redefine ESM bindings).
 *   - process.platform — Object.defineProperty pattern with
 *     {value, configurable: true} so each test can flip and restore.
 *   - configManager — minimal duck-typed test double with vi.fn() spies for
 *     installServer / updateServer / listServers. registerBytebotMcpServer
 *     calls only these three methods.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

// Hoisted mock state — vi.hoisted() ensures these vi.fn()s are constructed
// BEFORE vi.mock factories below run.
const mocks = vi.hoisted(() => ({
	accessMock: vi.fn<(path: string) => Promise<void>>(),
}))

vi.mock('node:fs/promises', () => ({
	access: mocks.accessMock,
}))

import {registerBytebotMcpServer} from './bytebot-mcp-config.js'

const DEFAULT_PATH =
	'/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts'

interface FakeConfigManager {
	installServer: ReturnType<typeof vi.fn>
	updateServer: ReturnType<typeof vi.fn>
	listServers: ReturnType<typeof vi.fn>
}

function makeConfigManager(existing: any[] = []): FakeConfigManager {
	return {
		installServer: vi.fn().mockResolvedValue(undefined),
		updateServer: vi.fn().mockResolvedValue(undefined),
		listServers: vi.fn().mockResolvedValue(existing),
	}
}

const fakeRedis = {} as any // not actually used by registerBytebotMcpServer

let originalPlatform: PropertyDescriptor | undefined

function setPlatform(value: NodeJS.Platform): void {
	originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
	Object.defineProperty(process, 'platform', {
		value,
		configurable: true,
		writable: false,
	})
}

function restorePlatform(): void {
	if (originalPlatform) {
		Object.defineProperty(process, 'platform', originalPlatform)
		originalPlatform = undefined
	}
}

beforeEach(() => {
	mocks.accessMock.mockReset()
	mocks.accessMock.mockResolvedValue(undefined) // file exists by default
})

afterEach(() => {
	restorePlatform()
})

describe('registerBytebotMcpServer', () => {
	// ── T1 ────────────────────────────────────────────────────────────
	it('T1: returns registered:false when BYTEBOT_MCP_ENABLED is unset', async () => {
		setPlatform('linux')
		const cm = makeConfigManager()
		const result = await registerBytebotMcpServer(fakeRedis, {} as any, cm as any)

		expect(result.registered).toBe(false)
		expect(result.reason).toContain('BYTEBOT_MCP_ENABLED')
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).not.toHaveBeenCalled()
	})

	// ── T2 ────────────────────────────────────────────────────────────
	it('T2: returns registered:false on non-linux platform', async () => {
		setPlatform('win32')
		const cm = makeConfigManager()
		const env = {BYTEBOT_MCP_ENABLED: 'true'} as any
		const result = await registerBytebotMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(false)
		expect(result.reason).toContain('linux')
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).not.toHaveBeenCalled()
	})

	// ── T3 ────────────────────────────────────────────────────────────
	it("T3: returns registered:false when server file doesn't exist", async () => {
		setPlatform('linux')
		const enoent: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), {
			code: 'ENOENT',
		})
		mocks.accessMock.mockRejectedValueOnce(enoent)

		const cm = makeConfigManager()
		const env = {BYTEBOT_MCP_ENABLED: 'true'} as any
		const result = await registerBytebotMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(false)
		expect(result.reason).toMatch(/server file not found/i)
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).not.toHaveBeenCalled()
	})

	// ── T4 ────────────────────────────────────────────────────────────
	it('T4: happy path — installs fresh when no existing config', async () => {
		setPlatform('linux')
		const cm = makeConfigManager([])
		const env = {
			BYTEBOT_MCP_ENABLED: 'true',
			DISPLAY: ':1',
			XAUTHORITY: '/home/test/.Xauthority',
		} as any
		const result = await registerBytebotMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(true)
		expect(cm.installServer).toHaveBeenCalledTimes(1)
		expect(cm.updateServer).not.toHaveBeenCalled()

		const arg = cm.installServer.mock.calls[0][0]
		expect(arg.name).toBe('bytebot')
		expect(arg.transport).toBe('stdio')
		expect(arg.command).toBe('tsx')
		expect(arg.args).toEqual([DEFAULT_PATH])
		expect(arg.env).toEqual({
			DISPLAY: ':1',
			XAUTHORITY: '/home/test/.Xauthority',
		})
		expect(arg.enabled).toBe(true)
	})

	// ── T5 ────────────────────────────────────────────────────────────
	it('T5: idempotent no-op when matching config already exists', async () => {
		setPlatform('linux')
		const env = {BYTEBOT_MCP_ENABLED: 'true'} as any
		const existingMatch = {
			name: 'bytebot',
			transport: 'stdio',
			command: 'tsx',
			args: [DEFAULT_PATH],
			env: {
				DISPLAY: ':0',
				XAUTHORITY: '/home/bruce/.Xauthority',
			},
			enabled: true,
			installedAt: 1700000000000,
		}
		const cm = makeConfigManager([existingMatch])
		const result = await registerBytebotMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(true)
		expect(result.reason).toMatch(/no-op|matched/i)
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).not.toHaveBeenCalled()
	})

	// ── T6 ────────────────────────────────────────────────────────────
	it('T6: updates existing when shape differs', async () => {
		setPlatform('linux')
		const env = {
			BYTEBOT_MCP_ENABLED: 'true',
			DISPLAY: ':2', // differs from existing ':0'
		} as any
		const existingDiffer = {
			name: 'bytebot',
			transport: 'stdio',
			command: 'tsx',
			args: [DEFAULT_PATH],
			env: {
				DISPLAY: ':0', // <-- old value, the new env would set ':2'
				XAUTHORITY: '/home/bruce/.Xauthority',
			},
			enabled: true,
			installedAt: 1700000000000,
		}
		const cm = makeConfigManager([existingDiffer])
		const result = await registerBytebotMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(true)
		expect(result.reason).toMatch(/updated/i)
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).toHaveBeenCalledTimes(1)
		expect(cm.updateServer.mock.calls[0][0]).toBe('bytebot')
		const partial = cm.updateServer.mock.calls[0][1]
		expect(partial.env).toEqual({
			DISPLAY: ':2',
			XAUTHORITY: '/home/bruce/.Xauthority',
		})
	})

	// ── T7 ────────────────────────────────────────────────────────────
	it('T7: BYTEBOT_MCP_SERVER_PATH override is honored', async () => {
		setPlatform('linux')
		const customPath = '/custom/path/to/server.ts'
		const cm = makeConfigManager([])
		const env = {
			BYTEBOT_MCP_ENABLED: 'true',
			BYTEBOT_MCP_SERVER_PATH: customPath,
		} as any
		const result = await registerBytebotMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(true)
		expect(cm.installServer).toHaveBeenCalledTimes(1)
		const arg = cm.installServer.mock.calls[0][0]
		expect(arg.args).toEqual([customPath])
		// access() must have been called with the custom path
		expect(mocks.accessMock).toHaveBeenCalledWith(customPath)
	})

	// ── Defensive: graceful degradation on unexpected error ──────────
	it('Defensive: configManager error returns registered:false (graceful degradation)', async () => {
		setPlatform('linux')
		const cm = makeConfigManager([])
		cm.listServers.mockRejectedValueOnce(new Error('redis kaboom'))
		const env = {BYTEBOT_MCP_ENABLED: 'true'} as any
		const result = await registerBytebotMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(false)
		expect(result.reason).toContain('redis kaboom')
	})
})
