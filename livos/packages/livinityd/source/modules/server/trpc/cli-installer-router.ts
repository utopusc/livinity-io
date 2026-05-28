/**
 * Phase 239-01 Task 2 + Phase 240-01 Task 2 — cli-installer tRPC router.
 *
 * Exposes three adminProcedure-gated routes mounted under `cliInstaller.*`:
 *
 *   cliInstaller.detect   — input {name} → {detected, version?, path?}
 *   cliInstaller.install  — input {name} → {ok, output, exitCode, durationMs}
 *                           Long-running mutation (30-300s typical). Routes
 *                           via HTTP per common.ts httpOnlyPaths.
 *   cliInstaller.auth     — input {name} → AuthResult (includes redisStatusKey).
 *                           Long-running too (device-code paste flows). HTTP only.
 *
 * Declaration order = [detect, install, auth] (Plan 240-01 drift-lock T14):
 *   detect first because UI calls it on mount; install second because the
 *   user runs it after seeing an "available" row; auth third because it's
 *   only meaningful after install succeeds.
 *
 * D-239-07 RCE BOUNDARY:
 *   - All three procedures pre-check `SUPPORTED_CLIS_SET.has(input.name)` BEFORE
 *     delegating to installCli/detectCli/authCli. Unknown names throw TRPCError
 *     BAD_REQUEST with the literal string `CLI_NOT_SUPPORTED`.
 *
 * Phase 240-01 additions:
 *   - `authFn?` DI seam (mirrors installFn/detectFn).
 *   - `auditLogFactory?(ctx)` DI seam — when provided, the router builds a
 *     per-request AuditLogFn (closed over ctx.currentUser.id + the live PG pool
 *     by the production factory in livinityd/source/index.ts) and threads it
 *     into installCli/authCli via the optional `auditLog` dep slot. Tests
 *     verify the factory is invoked exactly once per call (T15/T16).
 *
 * Factory-DI shape mirrors createMcpConfigRouter:
 *   - createCliInstallerRouter({...}) for prod boot
 *   - default `cliInstallerRouter` is an empty-injection stub that throws
 *     PRECONDITION_FAILED on every call until livinityd boot swaps it in
 *     via setProductionAppRouter().
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {
	SUPPORTED_CLIS_SET,
	installCli,
	detectCli,
	type AuditLogFn,
	type AuthResult,
	type DetectResult,
	type InstallResult,
	type InstallerLogger,
	type CliName,
} from '../../cli-installer/index.js'
import {adminProcedure, router} from './trpc.js'

export interface CliInstallerRouterDeps {
	logger: InstallerLogger
	/** DI seam for tests; prod uses the real `installCli` export. */
	installFn?: (
		input: {name: CliName},
		deps: {logger: InstallerLogger; auditLog?: AuditLogFn},
	) => Promise<InstallResult>
	/** DI seam for tests; prod uses the real `detectCli` export. */
	detectFn?: (
		input: {name: CliName},
		deps: {logger: InstallerLogger},
	) => Promise<DetectResult>
	/** Phase 240-01 — DI seam for tests; prod uses the real `authCli` export. */
	authFn?: (
		input: {name: CliName},
		deps: {logger: InstallerLogger; auditLog?: AuditLogFn},
	) => Promise<AuthResult>
	/**
	 * Phase 240-01 — Optional audit-log factory. When set, the router builds a
	 * per-call AuditLogFn from ctx (typically closed over ctx.currentUser.id +
	 * a PG pool in production) and threads it into install/auth via the
	 * optional auditLog dep slot. When unset (Phase 239 callers / tests
	 * without audit), behaviour is unchanged.
	 */
	auditLogFactory?: (ctx: unknown) => AuditLogFn
}

// 64-char ceiling keeps the value well under any path/buffer limits a script
// resolution could hit; the real validity check is the SUPPORTED_CLIS_SET
// gate below.
const NameInput = z.object({name: z.string().min(1).max(64)})

/**
 * D-239-07 RCE boundary guard. Throws TRPCError BAD_REQUEST with the
 * machine-readable `CLI_NOT_SUPPORTED` code so callers (UI + Phase 240)
 * can match on the string without parsing prose.
 */
function assertWhitelisted(name: string): asserts name is CliName {
	if (!SUPPORTED_CLIS_SET.has(name as CliName)) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `CLI_NOT_SUPPORTED: '${name}' is not in SUPPORTED_CLIS — install refused (D-239-07 RCE boundary)`,
		})
	}
}

/**
 * Default `authFn` fallback — throws PRECONDITION_FAILED. Production boot
 * (livinityd/source/index.ts) MUST inject a real `authFn` wrapper that closes
 * over the production redis client (authCli requires a Redis dep that the
 * router cannot construct itself). Tests inject a vi.fn() mock.
 */
const defaultAuthFn = async (): Promise<AuthResult> => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message:
			'cliInstaller.auth requires production wire-up (authFn DI seam unfilled — Redis client missing)',
	})
}

export function createCliInstallerRouter(deps: CliInstallerRouterDeps) {
	const install = deps.installFn ?? installCli
	const detect = deps.detectFn ?? detectCli
	const auth = deps.authFn ?? defaultAuthFn
	// Plan 240-01 drift-lock T14: declaration order = [detect, install, auth].
	return router({
		detect: adminProcedure.input(NameInput).query(async ({input}) => {
			assertWhitelisted(input.name)
			return detect({name: input.name}, {logger: deps.logger})
		}),
		install: adminProcedure.input(NameInput).mutation(async ({input, ctx}) => {
			assertWhitelisted(input.name)
			const auditLog = deps.auditLogFactory ? deps.auditLogFactory(ctx) : undefined
			return install({name: input.name}, {logger: deps.logger, auditLog})
		}),
		auth: adminProcedure.input(NameInput).mutation(async ({input, ctx}) => {
			assertWhitelisted(input.name)
			const auditLog = deps.auditLogFactory ? deps.auditLogFactory(ctx) : undefined
			return auth({name: input.name}, {logger: deps.logger, auditLog})
		}),
	})
}

/**
 * Empty-injection stub. Mirrors mcp-config-router / xai-auth-router pattern:
 * every procedure throws PRECONDITION_FAILED until production boot wires the
 * real router via setProductionAppRouter().
 */
export const cliInstallerRouter = createCliInstallerRouter({
	logger: {info: () => {}, warn: () => {}, error: () => {}},
	installFn: async () => {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message:
				'cli-installer-router not yet injected — livinityd boot did not wire production deps',
		})
	},
	detectFn: async () => {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message:
				'cli-installer-router not yet injected — livinityd boot did not wire production deps',
		})
	},
	authFn: async () => {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message:
				'cli-installer-router not yet injected — livinityd boot did not wire production deps',
		})
	},
})

export type CliInstallerRouter = ReturnType<typeof createCliInstallerRouter>
