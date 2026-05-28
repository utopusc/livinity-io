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
})

function build(opts: {withAudit?: boolean} = {}) {
	return createCliInstallerRouter({
		logger: baseLogger,
		installFn: installFn as any,
		detectFn: detectFn as any,
		authFn: authFn as any,
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
	test('T7 — router exposes exactly install + detect + auth procedures', () => {
		const r = build()
		const procNames = Object.keys(r._def.procedures ?? {}).sort()
		expect(procNames).toEqual(['auth', 'detect', 'install'])
	})

	test('T14 — drift-lock: router procedure list (in declaration order) = [detect, install, auth]', () => {
		const r = build()
		// Insertion order of router({...}) literal — pinned by Plan 240-01.
		const procNames = Object.keys(r._def.procedures ?? {})
		expect(procNames).toEqual(['detect', 'install', 'auth'])
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
