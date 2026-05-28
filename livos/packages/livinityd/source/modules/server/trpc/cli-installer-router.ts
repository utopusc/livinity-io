/**
 * Phase 239-01 Task 2 — cli-installer tRPC router.
 *
 * Exposes two adminProcedure-gated routes mounted under `cliInstaller.*`:
 *
 *   cliInstaller.install  — input {name} → {ok, output, exitCode, durationMs}
 *                           Long-running mutation (30-300s typical). Routes
 *                           via HTTP per common.ts httpOnlyPaths — same
 *                           precedent as system.update.
 *   cliInstaller.detect   — input {name} → {detected, version?, path?}
 *
 * D-239-07 RCE BOUNDARY:
 *   - Both procedures pre-check `SUPPORTED_CLIS_SET.has(input.name)` BEFORE
 *     delegating to installCli/detectCli. Unknown names throw TRPCError
 *     BAD_REQUEST with the literal string `CLI_NOT_SUPPORTED` so the UI +
 *     Phase 240 can map the error to a friendly message without parsing
 *     prose.
 *   - The whitelist itself lives in cli-installer/install-scripts.ts so
 *     Phase 240's planned uninstall/auth-status procedures import the
 *     SAME constant (D-239-10 stable contract).
 *
 * Factory-DI shape mirrors createMcpConfigRouter:
 *   - createCliInstallerRouter({logger, installFn?, detectFn?}) for prod boot
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
	type InstallResult,
	type DetectResult,
	type InstallerLogger,
	type CliName,
} from '../../cli-installer/index.js'
import {adminProcedure, router} from './trpc.js'

export interface CliInstallerRouterDeps {
	logger: InstallerLogger
	/** DI seam for tests; prod uses the real `installCli` export. */
	installFn?: (
		input: {name: CliName},
		deps: {logger: InstallerLogger},
	) => Promise<InstallResult>
	/** DI seam for tests; prod uses the real `detectCli` export. */
	detectFn?: (
		input: {name: CliName},
		deps: {logger: InstallerLogger},
	) => Promise<DetectResult>
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

export function createCliInstallerRouter(deps: CliInstallerRouterDeps) {
	const install = deps.installFn ?? installCli
	const detect = deps.detectFn ?? detectCli
	return router({
		install: adminProcedure.input(NameInput).mutation(async ({input}) => {
			assertWhitelisted(input.name)
			return install({name: input.name}, {logger: deps.logger})
		}),
		detect: adminProcedure.input(NameInput).query(async ({input}) => {
			assertWhitelisted(input.name)
			return detect({name: input.name}, {logger: deps.logger})
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
})

export type CliInstallerRouter = ReturnType<typeof createCliInstallerRouter>
