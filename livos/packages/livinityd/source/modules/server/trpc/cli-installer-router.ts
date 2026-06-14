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
	CLI_AUTH_METHODS,
	type AuditLogFn,
	type AuthResult,
	type AuthMethod,
	type DetectResult,
	type InstallResult,
	type InstallerLogger,
	type CliName,
	type WriteApiKeyResult,
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
	/**
	 * Phase 267-01 — DI seam for `setApiKey`. Prod wires a wrapper that calls
	 * `writeApiKey` with the live home dir + fs (the router stays fs-free for
	 * testability). The key NEVER appears in logs/returns — writeApiKey returns
	 * only {ok, path}. Default stub throws PRECONDITION_FAILED.
	 */
	writeApiKeyFn?: (input: {
		name: CliName
		key: string
	}) => Promise<WriteApiKeyResult>
	/**
	 * Phase 267-01 — DI seam for `getDeviceCode`. Prod wires a Redis GET over
	 * `liv:cli:auth:url:<name>` (the late-poll key authCli sets when it parses a
	 * device URL+code). Returns the raw JSON string or null. Default stub
	 * returns null (no device-code available).
	 */
	getDeviceCodeFn?: (name: CliName) => Promise<string | null>
	/**
	 * Phase 267-03 — DI seam for the debounced liv-assistant restart. Called
	 * (best-effort, fire-and-forget) AFTER `auth` resolves `ok:true` OR
	 * `setApiKey` resolves `ok:true`, so AionUi re-PATH-scans and the freshly-
	 * authed CLI flips Failed→ready with no terminal. Prod wires
	 * `scheduleAgentRefresh` closed over the live redis client. Default stub is a
	 * no-op (tests inject a spy; Phase 239/240 callers without the seam are
	 * unaffected). It MUST be synchronous + non-throwing — the success result is
	 * already locked in and must never be invalidated by a refresh failure.
	 */
	scheduleAgentRefreshFn?: () => void
	/**
	 * Phase 267-03 — DI seam for `agentRefreshStatus`. Prod wires a Redis GET
	 * over `liv:cli:agent-refresh` (set 'restarting'→'done' by the refresh). The
	 * UI polls this to show "Applying…". Default stub returns null.
	 */
	getAgentRefreshStatusFn?: () => Promise<string | null>
}

// 64-char ceiling keeps the value well under any path/buffer limits a script
// resolution could hit; the real validity check is the SUPPORTED_CLIS_SET
// gate below.
const NameInput = z.object({name: z.string().min(1).max(64)})

// Phase 267-01 — setApiKey input. `key` is bounded 1..8000 chars (OAuth tokens
// + long provider keys fit; an 8KB ceiling caps abuse). The key is never
// logged; the whitelist guard on `name` is the RCE boundary.
const SetApiKeyInput = z.object({
	name: z.string().min(1).max(64),
	key: z.string().min(1).max(8000),
})

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

/**
 * Default `writeApiKeyFn` fallback — throws PRECONDITION_FAILED. Production boot
 * injects a wrapper closed over the live home dir + fs (writeApiKey needs a
 * filesystem the router cannot construct itself). Tests inject a vi.fn() mock.
 */
const defaultWriteApiKeyFn = async (): Promise<WriteApiKeyResult> => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message:
			'cliInstaller.setApiKey requires production wire-up (writeApiKeyFn DI seam unfilled)',
	})
}

/**
 * Default `getDeviceCodeFn` fallback — returns null (no device code available).
 * Production injects a Redis GET over `liv:cli:auth:url:<name>`.
 */
const defaultGetDeviceCodeFn = async (): Promise<string | null> => null

/**
 * Default `scheduleAgentRefreshFn` fallback — a no-op. Production injects
 * `scheduleAgentRefresh` (closed over the redis client). When unset (Phase
 * 239/240 callers / tests without the seam) auth/setApiKey behave exactly as
 * before — no restart is triggered.
 */
const defaultScheduleAgentRefreshFn = (): void => {}

/**
 * Default `getAgentRefreshStatusFn` fallback — returns null. Production injects
 * a Redis GET over `liv:cli:agent-refresh`.
 */
const defaultGetAgentRefreshStatusFn = async (): Promise<string | null> => null

export function createCliInstallerRouter(deps: CliInstallerRouterDeps) {
	const install = deps.installFn ?? installCli
	const detect = deps.detectFn ?? detectCli
	const auth = deps.authFn ?? defaultAuthFn
	const writeApiKey = deps.writeApiKeyFn ?? defaultWriteApiKeyFn
	const getDeviceCode = deps.getDeviceCodeFn ?? defaultGetDeviceCodeFn
	const scheduleAgentRefresh =
		deps.scheduleAgentRefreshFn ?? defaultScheduleAgentRefreshFn
	const getAgentRefreshStatus =
		deps.getAgentRefreshStatusFn ?? defaultGetAgentRefreshStatusFn

	/**
	 * Phase 267-03 — fire the debounced liv-assistant restart, best-effort. The
	 * auth/setApiKey result is ALREADY locked in by the time this runs; a refresh
	 * scheduling failure must NEVER bubble up and invalidate that success. Any
	 * throw is caught + logged + swallowed here (scheduleAgentRefresh itself is
	 * designed to be non-throwing, but this is defense-in-depth).
	 */
	const triggerAgentRefresh = (): void => {
		try {
			scheduleAgentRefresh()
		} catch (err) {
			deps.logger.warn(
				'[cli-installer] scheduleAgentRefresh threw (non-fatal — auth/key write already succeeded)',
				err,
			)
		}
	}
	// Plan 240-01 drift-lock T14: declaration order = [detect, install, auth].
	// Phase 267-01 appends [setApiKey, getAuthMethod, getDeviceCode] (additive).
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
			const result = await auth({name: input.name}, {logger: deps.logger, auditLog})
			// Phase 267-03 — ONLY on a genuinely successful device-flow login do we
			// schedule the (debounced, best-effort) liv-assistant restart so AionUi
			// re-scans and the agent flips Failed→ready. A failed/timed-out auth must
			// NOT churn AionUi.
			if (result.ok) triggerAgentRefresh()
			return result
		}),
		// Phase 267-01 — write an operator-pasted API key to the CLI's own
		// config/env file (writeApiKey; 0600; no spawn). The whitelist guard runs
		// FIRST (assertWhitelisted) — same RCE boundary as install/auth. The key
		// is NEVER logged or echoed back; only {ok, path} is returned.
		setApiKey: adminProcedure
			.input(SetApiKeyInput)
			.mutation(async ({input}) => {
				assertWhitelisted(input.name)
				const result = await writeApiKey({name: input.name, key: input.key})
				// Phase 267-03 — on a successful key write, schedule the debounced
				// restart too (api-key CLIs PATH-resolve the same way; AionUi must
				// re-scan to flip them Failed→ready). Best-effort; the key write stands
				// regardless of the restart outcome.
				if (result.ok) triggerAgentRefresh()
				return result
			}),
		// Phase 267-01 — the UI branch contract (apikey | device | browser | n/a)
		// + the canonical login argv / api-key env label for the given CLI.
		getAuthMethod: adminProcedure
			.input(NameInput)
			.query(async ({input}): Promise<AuthMethod> => {
				assertWhitelisted(input.name)
				return CLI_AUTH_METHODS[input.name]
			}),
		// Phase 267-01 — late-poll fallback: read liv:cli:auth:url:<name> (set by
		// authCli when it parses a device URL+code). Returns {url, code} | null.
		getDeviceCode: adminProcedure
			.input(NameInput)
			.query(async ({input}): Promise<{url: string; code: string} | null> => {
				assertWhitelisted(input.name)
				const raw = await getDeviceCode(input.name)
				if (!raw) return null
				try {
					const parsed = JSON.parse(raw) as {url?: string; code?: string}
					if (parsed.url && parsed.code) {
						return {url: parsed.url, code: parsed.code}
					}
				} catch {
					/* malformed cache value — treat as no device code */
				}
				return null
			}),
		// Phase 267-03 — the UI polls this after auth/setApiKey success to show
		// "Applying…" while the debounced liv-assistant restart is in flight.
		// Reads `liv:cli:agent-refresh` ('restarting' | 'done' | null). No input —
		// the refresh is a single process-wide debounce, not per-CLI.
		agentRefreshStatus: adminProcedure.query(
			async (): Promise<{status: 'restarting' | 'done' | 'idle'}> => {
				const raw = await getAgentRefreshStatus()
				if (raw === 'restarting' || raw === 'done') {
					return {status: raw}
				}
				return {status: 'idle'}
			},
		),
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
