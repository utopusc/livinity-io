/**
 * Phase 72-native-06 — registerLuseMcpServer unit tests (renamed P100-10-02
 * from registerBytebotMcpServer per D-100-10-B).
 *
 * Spec source: 72-native-06-PLAN.md `<task type="auto" tdd="true">` Task 2,
 * behavior block test cases T1..T7.
 *
 * Coverage (must-have list, plan behavior section):
 *   T1 — env without LUSE_MCP_ENABLED → returns {registered:false,
 *        reason:'LUSE_MCP_ENABLED unset'}; configManager.installServer
 *        NOT called.
 *   T2 — LUSE_MCP_ENABLED='true' but process.platform mocked as 'win32' →
 *        {registered:false, reason:'platform not linux'}; install NOT called.
 *   T3 — linux + enabled but server file fs.access throws ENOENT →
 *        {registered:false, reason: includes 'server file not found'}.
 *   T4 — All preconditions met + listServers returns no existing 'luse'
 *        entry → calls installServer with the documented config shape
 *        (assert exact arg).
 *   T5 — All preconditions met + listServers returns existing 'luse' with
 *        matching shape → calls neither installServer nor updateServer
 *        (no-op); returns {registered:true, reason:'no-op (matched existing)'}.
 *   T6 — All preconditions met + listServers returns existing 'luse' with
 *        DIFFERENT shape → calls updateServer with the new partial; returns
 *        {registered:true, reason:'updated existing'}.
 *   T7 — LUSE_MCP_SERVER_PATH custom env override is honored — installServer
 *        args[0] equals the custom path.
 *
 * Mocks:
 *   - `node:fs/promises` access — vi.hoisted + vi.mock pattern (matches
 *     screenshot.test.ts precedent; vi.spyOn cannot redefine ESM bindings).
 *   - process.platform — Object.defineProperty pattern with
 *     {value, configurable: true} so each test can flip and restore.
 *   - configManager — minimal duck-typed test double with vi.fn() spies for
 *     installServer / updateServer / listServers. registerLuseMcpServer
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

import {
	registerLuseMcpServer,
	buildLuseConfig,
	LUSE_TARGET_WINDOW_ID_ENV,
} from './luse-mcp-config.js'

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

const fakeRedis = {} as any // not actually used by registerLuseMcpServer

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

describe('registerLuseMcpServer', () => {
	// ── T1 ────────────────────────────────────────────────────────────
	it('T1: returns registered:false when LUSE_MCP_ENABLED is unset', async () => {
		setPlatform('linux')
		const cm = makeConfigManager()
		const result = await registerLuseMcpServer(fakeRedis, {} as any, cm as any)

		expect(result.registered).toBe(false)
		expect(result.reason).toContain('LUSE_MCP_ENABLED')
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).not.toHaveBeenCalled()
	})

	// ── T2 ────────────────────────────────────────────────────────────
	it('T2: returns registered:false on non-linux platform', async () => {
		setPlatform('win32')
		const cm = makeConfigManager()
		const env = {LUSE_MCP_ENABLED: 'true'} as any
		const result = await registerLuseMcpServer(fakeRedis, env, cm as any)

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
		const env = {LUSE_MCP_ENABLED: 'true'} as any
		const result = await registerLuseMcpServer(fakeRedis, env, cm as any)

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
			LUSE_MCP_ENABLED: 'true',
			DISPLAY: ':1',
			XAUTHORITY: '/home/test/.Xauthority',
		} as any
		const result = await registerLuseMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(true)
		expect(cm.installServer).toHaveBeenCalledTimes(1)
		expect(cm.updateServer).not.toHaveBeenCalled()

		const arg = cm.installServer.mock.calls[0][0]
		expect(arg.name).toBe('luse')
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
		const env = {LUSE_MCP_ENABLED: 'true'} as any
		const existingMatch = {
			name: 'luse',
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
		const result = await registerLuseMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(true)
		expect(result.reason).toMatch(/no-op|matched/i)
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).not.toHaveBeenCalled()
	})

	// ── T6 ────────────────────────────────────────────────────────────
	it('T6: updates existing when shape differs', async () => {
		setPlatform('linux')
		const env = {
			LUSE_MCP_ENABLED: 'true',
			DISPLAY: ':2', // differs from existing ':0'
		} as any
		const existingDiffer = {
			name: 'luse',
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
		const result = await registerLuseMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(true)
		expect(result.reason).toMatch(/updated/i)
		expect(cm.installServer).not.toHaveBeenCalled()
		expect(cm.updateServer).toHaveBeenCalledTimes(1)
		expect(cm.updateServer.mock.calls[0][0]).toBe('luse')
		const partial = cm.updateServer.mock.calls[0][1]
		expect(partial.env).toEqual({
			DISPLAY: ':2',
			XAUTHORITY: '/home/bruce/.Xauthority',
		})
	})

	// ── T7 ────────────────────────────────────────────────────────────
	it('T7: LUSE_MCP_SERVER_PATH override is honored', async () => {
		setPlatform('linux')
		const customPath = '/custom/path/to/server.ts'
		const cm = makeConfigManager([])
		const env = {
			LUSE_MCP_ENABLED: 'true',
			LUSE_MCP_SERVER_PATH: customPath,
		} as any
		const result = await registerLuseMcpServer(fakeRedis, env, cm as any)

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
		const env = {LUSE_MCP_ENABLED: 'true'} as any
		const result = await registerLuseMcpServer(fakeRedis, env, cm as any)

		expect(result.registered).toBe(false)
		expect(result.reason).toContain('redis kaboom')
	})
})

// ─── Phase 100-08-03 — descriptor.display branch ─────────────────────
//
// V33-08-03-DESCRIPTOR-DISPLAY: extend PerWebAppMcpDescriptor with optional
// `display` field (default `:1` per D-100-08-A). When the descriptor branch
// fires, the spawned Luse MCP child's env carries DISPLAY=<descriptor.display
// ?? ':1'> so child xdotool/maim/xclip spawns inherit it via process.env.
// The host Luse variant (descriptor=undefined) keeps `process.env.DISPLAY
// ?? ':0'` for backward compat with desktop-stream native app.
describe('buildLuseConfig — Phase 100-08-03 descriptor.display', () => {
	it('per-WebApp variant defaults DISPLAY to :1 when descriptor.display is omitted', () => {
		const cfg = buildLuseConfig(
			{DISPLAY: ':0'} as NodeJS.ProcessEnv,
			'/some/path/server.ts',
			{instanceKey: 'webapp-123', windowId: 0xa1b2c3},
		)
		expect(cfg.env?.DISPLAY).toBe(':1')
		expect(cfg.env?.[LUSE_TARGET_WINDOW_ID_ENV]).toBe(String(0xa1b2c3))
		expect(cfg.env?.XAUTHORITY).toBeUndefined()
		expect(cfg.name).toBe('luse:webapp:webapp-123')
	})

	// Phase 100-10-08 (D-100-10-A reverted): explicit non-:1 descriptor.display
	// is no longer driven by any live caller; the override path is retained as
	// Phase 101 CDP scaffolding. Test stays as a contract lock for CDP work.
	it('per-WebApp variant honors explicit descriptor.display (Phase 101 CDP scaffolding)', () => {
		const cfg = buildLuseConfig(
			{DISPLAY: ':99'} as NodeJS.ProcessEnv,
			'/some/path/server.ts',
			{instanceKey: 'webapp-456', windowId: 42, display: ':2'},
		)
		expect(cfg.env?.DISPLAY).toBe(':2')
	})

	// Phase 100-10-08 — default contract: when descriptor omits display, the
	// per-WebApp variant pins DISPLAY=:1 (singleton from 100-08-01).
	it('per-WebApp variant DEFAULTS DISPLAY to :1 when descriptor.display is omitted (D-100-10-A reverted)', () => {
		const cfg = buildLuseConfig(
			{DISPLAY: ':99'} as NodeJS.ProcessEnv,
			'/some/path/server.ts',
			{instanceKey: 'webapp-789', windowId: 99},
		)
		expect(cfg.env?.DISPLAY).toBe(':1')
	})

	it('host variant preserves DISPLAY from process env (default :0) AND XAUTHORITY', () => {
		const cfg = buildLuseConfig(
			{
				DISPLAY: ':0',
				XAUTHORITY: '/run/user/1000/gdm/Xauthority',
			} as NodeJS.ProcessEnv,
			'/some/path/server.ts',
		)
		expect(cfg.env?.DISPLAY).toBe(':0')
		expect(cfg.env?.XAUTHORITY).toBe('/run/user/1000/gdm/Xauthority')
		expect(cfg.env?.[LUSE_TARGET_WINDOW_ID_ENV]).toBeUndefined()
		expect(cfg.name).toBe('luse')
	})

	it('host variant uses LUSE_XAUTHORITY override when set', () => {
		const cfg = buildLuseConfig(
			{
				DISPLAY: ':0',
				XAUTHORITY: '/run/user/1000/gdm/Xauthority',
				LUSE_XAUTHORITY: '/custom/xauth',
			} as NodeJS.ProcessEnv,
			'/some/path/server.ts',
		)
		expect(cfg.env?.XAUTHORITY).toBe('/custom/xauth')
	})
})
