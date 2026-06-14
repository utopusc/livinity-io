/**
 * Phase 239-01 Task 2 + Phase 240-01 Task 2 — cli-installer-router.test.ts
 *
 * Coverage (Phase 239):
 *   T1  — install({name:'foo'})            → BAD_REQUEST + CLI_NOT_SUPPORTED, no installFn call
 *   T2  — install({name:'claude-code; rm -rf /'}) → BAD_REQUEST + CLI_NOT_SUPPORTED (RCE drift-lock)
 *   T3  — install({name:'claude-code'})   → installFn called once, pass-through result
 *   T4  — install passes deps.logger to installFn
 *   T5  — detect({name:'bar'})             → BAD_REQUEST, no detectFn call
 *   T6  — detect({name:'opencode'})        → detectFn pass-through
 *   T7  — drift-lock: router has exactly the procedures `install` + `detect` + `auth`
 *   T8  — adminProcedure gate: non-admin caller is rejected by requireRole('admin')
 *
 * Coverage (Phase 240-01):
 *   T10 — auth({name:'foo'})              → BAD_REQUEST + CLI_NOT_SUPPORTED, no authFn call
 *   T11 — auth({name:'claude-code'})      → authFn called once with {name} input
 *   T12 — auth propagates AuthResult structure unchanged
 *   T13 — auth empty-injection stub throws PRECONDITION_FAILED
 *   T14 — drift-lock: router procedure list = ['detect', 'install', 'auth']
 *   T15 — install audit-log hook invoked exactly once per call
 *   T16 — auth audit-log hook invoked exactly once per call
 *   T17 — adminProcedure gate rejects non-admin caller from auth
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	createCliInstallerRouter,
	cliInstallerRouter,
} from '../cli-installer-router.js'

function makeAdminCtx() {
	return {
		livinityd: {} as any,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			verbose: () => {},
			log: () => {},
			debug: () => {},
		},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

function makeNonAdminCtx() {
	return {
		...makeAdminCtx(),
		dangerouslyBypassAuthentication: false,
		currentUser: {id: 'member-uuid', username: 'member', role: 'member' as const},
	}
}

const baseLogger = {info: () => {}, warn: () => {}, error: () => {}}

let installFn: ReturnType<typeof vi.fn>
let detectFn: ReturnType<typeof vi.fn>
// Phase 240-01 — authFn + auditLogFactory DI seams
let authFn: ReturnType<typeof vi.fn>
let auditLogFn: ReturnType<typeof vi.fn>
let auditLogFactory: ReturnType<typeof vi.fn>
// Phase 267-01 — setApiKey + getDeviceCode DI seams
let writeApiKeyFn: ReturnType<typeof vi.fn>
let getDeviceCodeFn: ReturnType<typeof vi.fn>
// Phase 267-03 — debounced liv-assistant restart + status seams
let scheduleAgentRefreshFn: ReturnType<typeof vi.fn>
let getAgentRefreshStatusFn: ReturnType<typeof vi.fn>
// Phase 268 — paste-back stdin write + CLI uninstall seams
let sendAuthInputFn: ReturnType<typeof vi.fn>
let uninstallFn: ReturnType<typeof vi.fn>
// Phase 269-01 — manual-apply pending-flag seams (kill the restart storm)
let markAgentChangesPendingFn: ReturnType<typeof vi.fn>
let getPendingAgentChangesFn: ReturnType<typeof vi.fn>
let clearPendingAgentChangesFn: ReturnType<typeof vi.fn>

beforeEach(() => {
	installFn = vi.fn().mockResolvedValue({
		ok: true,
		output: 'done',
		exitCode: 0,
		durationMs: 42,
	})
	detectFn = vi.fn().mockResolvedValue({
		detected: true,
		version: '1.2.3',
		path: '/usr/local/bin/claude',
	})
	authFn = vi.fn().mockResolvedValue({
		ok: true,
		output: 'auth-done',
		exitCode: 0,
		durationMs: 33,
		redisStatusKey: 'liv:cli:auth:claude-code',
	})
	auditLogFn = vi.fn().mockResolvedValue(undefined)
	auditLogFactory = vi.fn((_ctx: unknown) => auditLogFn)
	writeApiKeyFn = vi.fn().mockResolvedValue({
		ok: true,
		path: '/home/test/.gemini/.env',
	})
	getDeviceCodeFn = vi
		.fn()
		.mockResolvedValue(
			JSON.stringify({url: 'https://kimi.com/device', code: 'CODE-1234'}),
		)
	scheduleAgentRefreshFn = vi.fn()
	getAgentRefreshStatusFn = vi.fn().mockResolvedValue('restarting')
	// Phase 268 — sendAuthInput writes the pasted code to the live login child's
	// stdin (returns {ok}); uninstall removes the CLI per its static method.
	sendAuthInputFn = vi.fn().mockResolvedValue({ok: true})
	uninstallFn = vi.fn().mockResolvedValue({
		ok: true,
		output: 'removed',
		exitCode: 0,
		durationMs: 21,
	})
	// Phase 269-01 — markAgentChangesPending SETs the Redis pending flag on
	// auth/setApiKey/uninstall success (REPLACING the old auto-restart);
	// getPendingAgentChanges reads it; clearPendingAgentChanges DELs it after
	// the single explicit applyAgentChanges restart.
	markAgentChangesPendingFn = vi.fn().mockResolvedValue(undefined)
	getPendingAgentChangesFn = vi.fn().mockResolvedValue(true)
	clearPendingAgentChangesFn = vi.fn().mockResolvedValue(undefined)
})

function build(opts: {withAudit?: boolean} = {}) {
	return createCliInstallerRouter({
		logger: baseLogger,
		installFn: installFn as any,
		detectFn: detectFn as any,
		authFn: authFn as any,
		writeApiKeyFn: writeApiKeyFn as any,
		getDeviceCodeFn: getDeviceCodeFn as any,
		scheduleAgentRefreshFn: scheduleAgentRefreshFn as any,
		getAgentRefreshStatusFn: getAgentRefreshStatusFn as any,
		sendAuthInputFn: sendAuthInputFn as any,
		uninstallFn: uninstallFn as any,
		markAgentChangesPendingFn: markAgentChangesPendingFn as any,
		getPendingAgentChangesFn: getPendingAgentChangesFn as any,
		clearPendingAgentChangesFn: clearPendingAgentChangesFn as any,
		auditLogFactory: opts.withAudit
			? (auditLogFactory as any)
			: undefined,
	})
}

describe('cli-installer-router — whitelist guard (D-239-07 RCE boundary)', () => {
	test('T1 — install({name:"foo"}) rejects with BAD_REQUEST + CLI_NOT_SUPPORTED', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(caller.install({name: 'foo'})).rejects.toMatchObject({
			code: 'BAD_REQUEST',
		})
		expect(installFn).not.toHaveBeenCalled()
	})

	test('T2 — install({name:"claude-code; rm -rf /"}) rejects with BAD_REQUEST (RCE drift-lock)', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(
			caller.install({name: 'claude-code; rm -rf /'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})
		expect(installFn).not.toHaveBeenCalled()
	})

	test('T5 — detect({name:"bar"}) rejects with BAD_REQUEST', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(caller.detect({name: 'bar'})).rejects.toMatchObject({
			code: 'BAD_REQUEST',
		})
		expect(detectFn).not.toHaveBeenCalled()
	})
})

describe('cli-installer-router — happy path', () => {
	test('T3 — install({name:"claude-code"}) calls installFn + passes result through', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.install({name: 'claude-code'})
		expect(result).toEqual({
			ok: true,
			output: 'done',
			exitCode: 0,
			durationMs: 42,
		})
		expect(installFn).toHaveBeenCalledTimes(1)
		const [input, deps] = installFn.mock.calls[0] as [
			{name: string},
			{logger: unknown},
		]
		expect(input.name).toBe('claude-code')
		expect(deps.logger).toBe(baseLogger)
	})

	test('T4 — install passes deps.logger to installFn', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.install({name: 'opencode'})
		const [, deps] = installFn.mock.calls[0] as [unknown, {logger: unknown}]
		expect(deps.logger).toBe(baseLogger)
	})

	test('T6 — detect({name:"opencode"}) calls detectFn + passes result through', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.detect({name: 'opencode'})
		expect(result).toEqual({
			detected: true,
			version: '1.2.3',
			path: '/usr/local/bin/claude',
		})
		expect(detectFn).toHaveBeenCalledTimes(1)
	})
})

describe('cli-installer-router — contract drift-locks', () => {
	test('T7 — router exposes install + detect + auth + the Phase 267-01 trio + 267-03 status + the Phase 268 pair + the Phase 269 manual-apply pair', () => {
		const r = build()
		const procNames = Object.keys(r._def.procedures ?? {}).sort()
		expect(procNames).toEqual(
			[
				'auth',
				'detect',
				'getAuthMethod',
				'getDeviceCode',
				'install',
				'setApiKey',
				'agentRefreshStatus',
				// Phase 268 — paste-back stdin write + CLI uninstall.
				'sendAuthInput',
				'uninstall',
				// Phase 269-01 — manual apply (kill the restart storm).
				'hasPendingAgentChanges',
				'applyAgentChanges',
			].sort(),
		)
	})

	test('T14 — drift-lock: declaration order = [detect, install, auth, setApiKey, getAuthMethod, getDeviceCode, agentRefreshStatus, sendAuthInput, uninstall, hasPendingAgentChanges, applyAgentChanges]', () => {
		const r = build()
		// Insertion order of router({...}) literal — pinned by Plan 240-01 (first
		// three) + Phase 267-01 (the additive trio appended after auth) + Phase
		// 267-03 (agentRefreshStatus appended last) + Phase 268 (sendAuthInput +
		// uninstall appended last, additive) + Phase 269-01 (hasPendingAgentChanges
		// + applyAgentChanges appended last, additive).
		const procNames = Object.keys(r._def.procedures ?? {})
		expect(procNames).toEqual([
			'detect',
			'install',
			'auth',
			'setApiKey',
			'getAuthMethod',
			'getDeviceCode',
			'agentRefreshStatus',
			'sendAuthInput',
			'uninstall',
			'hasPendingAgentChanges',
			'applyAgentChanges',
		])
	})

	test('default cliInstallerRouter (empty-injection stub) throws PRECONDITION_FAILED', async () => {
		const caller = cliInstallerRouter.createCaller(makeAdminCtx() as any)
		await expect(caller.install({name: 'claude-code'})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
	})
})

describe('cli-installer-router — adminProcedure gate', () => {
	test('T8 — non-admin caller rejected before installFn fires', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)
		await expect(caller.install({name: 'claude-code'})).rejects.toThrow()
		expect(installFn).not.toHaveBeenCalled()
	})
})

// Phase 240-01 Task 2 — new cases for cliInstaller.auth procedure + audit-log hook
describe('cli-installer-router — auth procedure (Phase 240-01)', () => {
	test('T10 — auth({name:"foo"}) rejects with BAD_REQUEST + CLI_NOT_SUPPORTED', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(caller.auth({name: 'foo'})).rejects.toMatchObject({
			code: 'BAD_REQUEST',
		})
		expect(authFn).not.toHaveBeenCalled()
	})

	test('T11 — auth({name:"claude-code"}) delegates to authFn with {name} input', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.auth({name: 'claude-code'})
		expect(authFn).toHaveBeenCalledTimes(1)
		const [input] = authFn.mock.calls[0] as [{name: string}]
		expect(input.name).toBe('claude-code')
	})

	test('T12 — auth propagates AuthResult structure unchanged', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.auth({name: 'claude-code'})
		expect(result).toEqual({
			ok: true,
			output: 'auth-done',
			exitCode: 0,
			durationMs: 33,
			redisStatusKey: 'liv:cli:auth:claude-code',
		})
	})

	test('T13 — empty-injection stub auth throws PRECONDITION_FAILED', async () => {
		const caller = cliInstallerRouter.createCaller(makeAdminCtx() as any)
		await expect(caller.auth({name: 'claude-code'})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
	})

	test('T17 — non-admin caller rejected from auth before authFn fires', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)
		await expect(caller.auth({name: 'claude-code'})).rejects.toThrow()
		expect(authFn).not.toHaveBeenCalled()
	})
})

describe('cli-installer-router — audit-log hook (Phase 240-01)', () => {
	test('T15 — install procedure invokes auditLogFactory(ctx) exactly once per call', async () => {
		const r = build({withAudit: true})
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.install({name: 'claude-code'})
		expect(auditLogFactory).toHaveBeenCalledTimes(1)
		// auditLog itself is forwarded into installFn via deps — verify it was
		// passed in (the installer.ts spawn wrapper Test 10 already covers the
		// call shape; here we only assert the factory was invoked from the router).
		const [, deps] = installFn.mock.calls[0] as [unknown, {auditLog: unknown}]
		expect(deps.auditLog).toBeDefined()
	})

	test('T16 — auth procedure invokes auditLogFactory(ctx) exactly once per call', async () => {
		const r = build({withAudit: true})
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.auth({name: 'claude-code'})
		expect(auditLogFactory).toHaveBeenCalledTimes(1)
		const [, deps] = authFn.mock.calls[0] as [unknown, {auditLog: unknown}]
		expect(deps.auditLog).toBeDefined()
	})
})

// Phase 267-01 Task 5 — setApiKey / getAuthMethod / getDeviceCode procedures.
describe('cli-installer-router — setApiKey (Phase 267-01)', () => {
	test('T20 — setApiKey({name:"foo"}) rejects with BAD_REQUEST + no writeApiKeyFn call', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(
			caller.setApiKey({name: 'foo', key: 'k'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})
		expect(writeApiKeyFn).not.toHaveBeenCalled()
	})

	test('T21 — setApiKey({name:"gemini",key}) delegates to writeApiKeyFn + returns {ok,path}', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.setApiKey({name: 'gemini', key: 'sk-xyz'})
		expect(writeApiKeyFn).toHaveBeenCalledTimes(1)
		const [arg] = writeApiKeyFn.mock.calls[0] as [{name: string; key: string}]
		expect(arg.name).toBe('gemini')
		expect(arg.key).toBe('sk-xyz')
		expect(result).toEqual({ok: true, path: '/home/test/.gemini/.env'})
	})

	test('T22 — setApiKey rejects an over-long key (zod max 8000)', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(
			caller.setApiKey({name: 'gemini', key: 'x'.repeat(8001)}),
		).rejects.toThrow()
		expect(writeApiKeyFn).not.toHaveBeenCalled()
	})

	test('T23 — non-admin caller rejected from setApiKey before writeApiKeyFn fires', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)
		await expect(
			caller.setApiKey({name: 'gemini', key: 'k'}),
		).rejects.toThrow()
		expect(writeApiKeyFn).not.toHaveBeenCalled()
	})
})

describe('cli-installer-router — getAuthMethod (Phase 267-01)', () => {
	test('T24 — getAuthMethod({name:"gemini"}) returns the apikey branch classification', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const method = await caller.getAuthMethod({name: 'gemini'})
		expect(method.branch).toBe('apikey')
		expect(method.apiKeyEnv).toBe('GEMINI_API_KEY')
	})

	test('T25 — getAuthMethod({name:"kimi-cli"}) returns the device branch', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const method = await caller.getAuthMethod({name: 'kimi-cli'})
		expect(method.branch).toBe('device')
	})

	test('T26 — getAuthMethod({name:"foo"}) rejects with BAD_REQUEST', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(caller.getAuthMethod({name: 'foo'})).rejects.toMatchObject({
			code: 'BAD_REQUEST',
		})
	})
})

describe('cli-installer-router — getDeviceCode (Phase 267-01)', () => {
	test('T27 — getDeviceCode parses the cached JSON into {url, code}', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const dc = await caller.getDeviceCode({name: 'kimi-cli'})
		expect(dc).toEqual({url: 'https://kimi.com/device', code: 'CODE-1234'})
	})

	test('T28 — getDeviceCode returns null when no cache value is present', async () => {
		getDeviceCodeFn.mockResolvedValueOnce(null)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const dc = await caller.getDeviceCode({name: 'kimi-cli'})
		expect(dc).toBeNull()
	})

	test('T29 — getDeviceCode returns null on a malformed cache value', async () => {
		getDeviceCodeFn.mockResolvedValueOnce('not-json{')
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const dc = await caller.getDeviceCode({name: 'kimi-cli'})
		expect(dc).toBeNull()
	})

	test('T30 — getDeviceCode({name:"foo"}) rejects with BAD_REQUEST', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(caller.getDeviceCode({name: 'foo'})).rejects.toMatchObject({
			code: 'BAD_REQUEST',
		})
	})
})

// Phase 269-01 Task 1 — MANUAL APPLY (kill the restart storm). auth/setApiKey/
// uninstall SUCCESS no longer auto-restarts liv-assistant; instead it SETs the
// `liv:cli:agent-changes-pending` flag via markAgentChangesPendingFn. The
// debounced restart now fires ONLY from the explicit applyAgentChanges route.
describe('cli-installer-router — manual apply: pending flag on success (Phase 269-01)', () => {
	test('T31 — auth ok:true marks changes pending exactly once + does NOT auto-restart', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.auth({name: 'claude-code'})
		expect(markAgentChangesPendingFn).toHaveBeenCalledTimes(1)
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
	})

	test('T32 — auth ok:false marks NEITHER pending nor a refresh (failed login must not churn AionUi)', async () => {
		authFn.mockResolvedValueOnce({
			ok: false,
			output: 'login failed',
			exitCode: 1,
			durationMs: 12,
			redisStatusKey: 'liv:cli:auth:claude-code',
		})
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.auth({name: 'claude-code'})
		expect(markAgentChangesPendingFn).not.toHaveBeenCalled()
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
	})

	test('T33 — setApiKey ok:true marks changes pending exactly once + does NOT auto-restart', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.setApiKey({name: 'gemini', key: 'sk-xyz'})
		expect(markAgentChangesPendingFn).toHaveBeenCalledTimes(1)
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
	})

	test('T34 — setApiKey ok:false marks NEITHER pending nor a refresh', async () => {
		writeApiKeyFn.mockResolvedValueOnce({ok: false, path: ''})
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.setApiKey({name: 'gemini', key: 'sk-xyz'})
		expect(markAgentChangesPendingFn).not.toHaveBeenCalled()
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
	})

	test('T35 — a throwing markAgentChangesPendingFn NEVER invalidates the auth result (best-effort)', async () => {
		markAgentChangesPendingFn.mockRejectedValueOnce(
			new Error('redis SET blew up'),
		)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		// The auth result must still come back ok — the flag write is best-effort.
		const result = await caller.auth({name: 'claude-code'})
		expect(result.ok).toBe(true)
	})

	test('T36 — agentRefreshStatus maps restarting → {status:"restarting"}', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const s = await caller.agentRefreshStatus()
		expect(s).toEqual({status: 'restarting'})
	})

	test('T37 — agentRefreshStatus maps a null/unknown value → {status:"idle"}', async () => {
		getAgentRefreshStatusFn.mockResolvedValueOnce(null)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const s = await caller.agentRefreshStatus()
		expect(s).toEqual({status: 'idle'})
	})

	test('T38 — agentRefreshStatus maps done → {status:"done"}', async () => {
		getAgentRefreshStatusFn.mockResolvedValueOnce('done')
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const s = await caller.agentRefreshStatus()
		expect(s).toEqual({status: 'done'})
	})
})

// Phase 268-03 Task 1 — paste-back stdin write (sendAuthInput) + CLI uninstall
// (uninstall) procedures. sendAuthInput must NOT fire agent-refresh (success
// arrives later on the login child's own exit); uninstall MUST fire it on
// result.ok so the removed agent drops out of /api/agents.
describe('cli-installer-router — sendAuthInput (Phase 268-03)', () => {
	test('T40 — sendAuthInput({name:"evil"}) rejects with BAD_REQUEST + no sendAuthInputFn call', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(
			caller.sendAuthInput({name: 'evil', code: 'X'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})
		expect(sendAuthInputFn).not.toHaveBeenCalled()
	})

	test('T41 — sendAuthInput({name:"claude-code",code}) delegates once + returns {ok}', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.sendAuthInput({
			name: 'claude-code',
			code: 'ABC-123',
		})
		expect(sendAuthInputFn).toHaveBeenCalledTimes(1)
		const [arg] = sendAuthInputFn.mock.calls[0] as [{name: string; code: string}]
		expect(arg.name).toBe('claude-code')
		expect(arg.code).toBe('ABC-123')
		expect(result).toEqual({ok: true})
	})

	test('T42 — sendAuthInput ok:true does NOT schedule an agent refresh (success arrives later on the child exit)', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.sendAuthInput({name: 'claude-code', code: 'ABC-123'})
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
	})

	test('T43 — sendAuthInput rejects an over-long code (zod max 4096) + an empty code (zod min 1)', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(
			caller.sendAuthInput({name: 'claude-code', code: 'x'.repeat(4097)}),
		).rejects.toThrow()
		await expect(
			caller.sendAuthInput({name: 'claude-code', code: ''}),
		).rejects.toThrow()
		expect(sendAuthInputFn).not.toHaveBeenCalled()
	})

	test('T44 — empty-injection stub sendAuthInput throws PRECONDITION_FAILED', async () => {
		const caller = cliInstallerRouter.createCaller(makeAdminCtx() as any)
		await expect(
			caller.sendAuthInput({name: 'claude-code', code: 'ABC-123'}),
		).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})
	})

	test('T45 — non-admin caller rejected from sendAuthInput before sendAuthInputFn fires', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)
		await expect(
			caller.sendAuthInput({name: 'claude-code', code: 'ABC-123'}),
		).rejects.toThrow()
		expect(sendAuthInputFn).not.toHaveBeenCalled()
	})
})

describe('cli-installer-router — uninstall (Phase 268-03)', () => {
	test('T50 — uninstall({name:"evil"}) rejects with BAD_REQUEST + no uninstallFn call', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await expect(caller.uninstall({name: 'evil'})).rejects.toMatchObject({
			code: 'BAD_REQUEST',
		})
		expect(uninstallFn).not.toHaveBeenCalled()
	})

	test('T51 — uninstall({name:"claude-code"}) delegates once + returns the UninstallResult', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.uninstall({name: 'claude-code'})
		expect(uninstallFn).toHaveBeenCalledTimes(1)
		const [arg] = uninstallFn.mock.calls[0] as [{name: string}]
		expect(arg.name).toBe('claude-code')
		expect(result).toEqual({
			ok: true,
			output: 'removed',
			exitCode: 0,
			durationMs: 21,
		})
	})

	test('T52 — uninstall ok:true marks changes pending exactly once + does NOT auto-restart (Phase 269-01)', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.uninstall({name: 'claude-code'})
		expect(markAgentChangesPendingFn).toHaveBeenCalledTimes(1)
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
	})

	test('T53 — uninstall ok:false marks NEITHER pending nor a refresh (a failed uninstall must not churn AionUi)', async () => {
		uninstallFn.mockResolvedValueOnce({
			ok: false,
			output: 'npm error',
			exitCode: 1,
			durationMs: 12,
		})
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.uninstall({name: 'claude-code'})
		expect(markAgentChangesPendingFn).not.toHaveBeenCalled()
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
	})

	test('T54 — empty-injection stub uninstall throws PRECONDITION_FAILED', async () => {
		const caller = cliInstallerRouter.createCaller(makeAdminCtx() as any)
		await expect(
			caller.uninstall({name: 'claude-code'}),
		).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})
	})

	test('T55 — non-admin caller rejected from uninstall before uninstallFn fires', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)
		await expect(caller.uninstall({name: 'claude-code'})).rejects.toThrow()
		expect(uninstallFn).not.toHaveBeenCalled()
	})
})

// Phase 269-01 Task 1 — manual apply: the explicit applyAgentChanges route fires
// the (debounced) restart ONCE + clears the pending flag; hasPendingAgentChanges
// reports the flag so the dialog + panel can show/hide the Apply button.
describe('cli-installer-router — applyAgentChanges + hasPendingAgentChanges (Phase 269-01)', () => {
	test('T60 — applyAgentChanges schedules the agent refresh exactly once AND clears the pending flag', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.applyAgentChanges()
		expect(scheduleAgentRefreshFn).toHaveBeenCalledTimes(1)
		expect(clearPendingAgentChangesFn).toHaveBeenCalledTimes(1)
		expect(result).toEqual({ok: true})
	})

	test('T61 — applyAgentChanges does NOT mark changes pending (it CLEARS them)', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		await caller.applyAgentChanges()
		expect(markAgentChangesPendingFn).not.toHaveBeenCalled()
	})

	test('T62 — a throwing scheduleAgentRefreshFn NEVER fails applyAgentChanges (best-effort restart)', async () => {
		scheduleAgentRefreshFn.mockImplementationOnce(() => {
			throw new Error('refresh scheduling blew up')
		})
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.applyAgentChanges()
		expect(result).toEqual({ok: true})
	})

	test('T63 — a throwing clearPendingAgentChangesFn NEVER fails applyAgentChanges (best-effort clear)', async () => {
		clearPendingAgentChangesFn.mockRejectedValueOnce(
			new Error('redis DEL blew up'),
		)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.applyAgentChanges()
		// The restart still fired; the result is still ok despite the clear failing.
		expect(scheduleAgentRefreshFn).toHaveBeenCalledTimes(1)
		expect(result).toEqual({ok: true})
	})

	test('T64 — non-admin caller rejected from applyAgentChanges before any restart fires', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)
		await expect(caller.applyAgentChanges()).rejects.toThrow()
		expect(scheduleAgentRefreshFn).not.toHaveBeenCalled()
		expect(clearPendingAgentChangesFn).not.toHaveBeenCalled()
	})

	test('T65 — hasPendingAgentChanges returns {pending:true} when the flag is set', async () => {
		getPendingAgentChangesFn.mockResolvedValueOnce(true)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.hasPendingAgentChanges()
		expect(result).toEqual({pending: true})
	})

	test('T66 — hasPendingAgentChanges returns {pending:false} when the flag is clear', async () => {
		getPendingAgentChangesFn.mockResolvedValueOnce(false)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)
		const result = await caller.hasPendingAgentChanges()
		expect(result).toEqual({pending: false})
	})

	test('T67 — non-admin caller rejected from hasPendingAgentChanges before the flag is read', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)
		await expect(caller.hasPendingAgentChanges()).rejects.toThrow()
		expect(getPendingAgentChangesFn).not.toHaveBeenCalled()
	})
})
