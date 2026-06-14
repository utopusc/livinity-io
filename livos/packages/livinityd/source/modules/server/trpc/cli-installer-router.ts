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
	type UninstallResult,
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
	/**
	 * Phase 268-03 — DI seam for `sendAuthInput`. Prod wires the module-level
	 * `sendAuthInput` (the live-child registry is module-state inside auth.ts —
	 * stateless from the router's view, like writeApiKeyFn; no Redis closure).
	 * The pasted `code` reaches the process ONLY as the live login child's stdin
	 * DATA — never an argv/path/shell — and is NEVER logged/returned (the module
	 * fn returns only {ok}). Default stub throws PRECONDITION_FAILED.
	 */
	sendAuthInputFn?: (input: {
		name: CliName
		code: string
	}) => Promise<{ok: boolean}>
	/**
	 * Phase 268-03 — DI seam for `uninstall`. Prod wires `uninstallCli` (reuses
	 * the authEnv PATH-prepend internally so npm/pip resolve under livinityd's
	 * stripped systemd PATH). On `result.ok` the router marks agent changes
	 * pending (Phase 269-01 — NO LONGER an auto-restart) so the operator can
	 * batch removals and apply ONE restart. Default stub throws PRECONDITION_FAILED.
	 */
	uninstallFn?: (input: {name: CliName}) => Promise<UninstallResult>
	/**
	 * Phase 269-01 — MANUAL APPLY (kill the restart storm). Marks that an
	 * agent-affecting change happened (auth / setApiKey / uninstall SUCCESS) so
	 * the UI can surface a single "Apply changes (refresh Liv AI)" button instead
	 * of restarting liv-assistant on EVERY action (which took AionUi :3020 down
	 * ~40s → a 502 storm). Prod wires a Redis `SET liv:cli:agent-changes-pending
	 * '1' EX 86400`. Best-effort: a failure here MUST NEVER invalidate the
	 * already-locked-in auth/key/uninstall success (the flag is a UX nicety, never
	 * a correctness gate). Default fallback is a no-op async (Phase 239/240/267/268
	 * callers / tests without the seam behave as before — no restart, no flag).
	 */
	markAgentChangesPendingFn?: () => Promise<void>
	/**
	 * Phase 269-01 — reads the pending flag for `hasPendingAgentChanges`. Prod
	 * wires `(await livRedis.get('liv:cli:agent-changes-pending')) === '1'`.
	 * Default fallback resolves false (nothing pending).
	 */
	getPendingAgentChangesFn?: () => Promise<boolean>
	/**
	 * Phase 269-01 — clears the pending flag after the explicit applyAgentChanges
	 * restart. Prod wires `livRedis.del('liv:cli:agent-changes-pending')`.
	 * Best-effort: a clear failure must NOT fail the apply (the restart already
	 * fired; the flag self-expires via its EX 86400 TTL anyway). Default fallback
	 * is a no-op async.
	 */
	clearPendingAgentChangesFn?: () => Promise<void>
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

// Phase 268-03 — the pasted code is bounded 1..4096 (OAuth codes are short; 4KB
// caps abuse). NEVER logged; the whitelist guard on `name` is the RCE boundary;
// `code` is written to the live child's stdin as DATA, never argv.
const SendAuthInputInput = z.object({
	name: z.string().min(1).max(64),
	code: z.string().min(1).max(4096),
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

/**
 * Default `sendAuthInputFn` fallback — throws PRECONDITION_FAILED. Production
 * boot injects the module-level `sendAuthInput` (closed over the boot logger).
 * An un-wired router can NEVER silently no-op the paste-back.
 */
const defaultSendAuthInputFn = async (): Promise<{ok: boolean}> => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message:
			'cliInstaller.sendAuthInput requires production wire-up (sendAuthInputFn DI seam unfilled)',
	})
}

/**
 * Default `uninstallFn` fallback — throws PRECONDITION_FAILED. Production boot
 * injects `uninstallCli` (closed over the boot logger; it resolves home/fs/PATH
 * internally). An un-wired router can NEVER silently no-op an uninstall.
 */
const defaultUninstallFn = async (): Promise<UninstallResult> => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message:
			'cliInstaller.uninstall requires production wire-up (uninstallFn DI seam unfilled)',
	})
}

/**
 * Phase 269-01 — default `markAgentChangesPendingFn` fallback: a no-op async.
 * When unset (Phase 239/240/267/268 callers / tests without the seam) auth /
 * setApiKey / uninstall behave exactly as before — no flag is set.
 */
const defaultMarkAgentChangesPendingFn = async (): Promise<void> => {}

/**
 * Phase 269-01 — default `getPendingAgentChangesFn` fallback: resolves false
 * (nothing pending). Production injects a Redis GET over
 * `liv:cli:agent-changes-pending`.
 */
const defaultGetPendingAgentChangesFn = async (): Promise<boolean> => false

/**
 * Phase 269-01 — default `clearPendingAgentChangesFn` fallback: a no-op async.
 * Production injects a Redis DEL over `liv:cli:agent-changes-pending`.
 */
const defaultClearPendingAgentChangesFn = async (): Promise<void> => {}

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
	const sendAuthInput = deps.sendAuthInputFn ?? defaultSendAuthInputFn
	const uninstall = deps.uninstallFn ?? defaultUninstallFn
	// Phase 269-01 — manual-apply pending-flag seams (kill the restart storm).
	const markAgentChangesPendingFn =
		deps.markAgentChangesPendingFn ?? defaultMarkAgentChangesPendingFn
	const getPendingAgentChanges =
		deps.getPendingAgentChangesFn ?? defaultGetPendingAgentChangesFn
	const clearPendingAgentChanges =
		deps.clearPendingAgentChangesFn ?? defaultClearPendingAgentChangesFn

	/**
	 * Phase 267-03 — fire the debounced liv-assistant restart, best-effort. The
	 * result is ALREADY locked in by the time this runs; a refresh scheduling
	 * failure must NEVER bubble up and invalidate that success. Any throw is
	 * caught + logged + swallowed here (scheduleAgentRefresh itself is designed
	 * to be non-throwing, but this is defense-in-depth).
	 *
	 * Phase 269-01 — its ONLY caller is now `applyAgentChanges` (the explicit,
	 * user-triggered apply). auth / setApiKey / uninstall NO LONGER call it —
	 * they mark changes pending instead (see markAgentChangesPending below).
	 */
	const triggerAgentRefresh = (): void => {
		try {
			scheduleAgentRefresh()
		} catch (err) {
			deps.logger.warn(
				'[cli-installer] scheduleAgentRefresh threw (non-fatal — apply already requested)',
				err,
			)
		}
	}

	/**
	 * Phase 269-01 — best-effort mark-changes-pending. Called on auth / setApiKey
	 * / uninstall SUCCESS to flag that AionUi needs a (deferred, user-triggered)
	 * re-scan. REPLACES the old per-action auto-restart so the operator can batch
	 * actions and fire exactly ONE restart via applyAgentChanges. A Redis-write
	 * failure here MUST NEVER invalidate the already-locked-in success — the flag
	 * is a UX nicety, not a correctness gate (T-269-04) — so every throw is
	 * caught + logged + swallowed.
	 */
	const markAgentChangesPending = async (): Promise<void> => {
		try {
			await markAgentChangesPendingFn()
		} catch (err) {
			deps.logger.warn(
				'[cli-installer] markAgentChangesPending threw (non-fatal — the auth/key write/uninstall already succeeded; Apply will still restart on demand)',
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
			// Phase 269-01 — ONLY on a genuinely successful login do we MARK changes
			// pending (no auto-restart — that caused the 502 storm). The operator
			// applies one restart later via applyAgentChanges. A failed/timed-out auth
			// must NOT mark anything. Best-effort: the flag write never invalidates the
			// already-recorded auth success.
			if (result.ok) await markAgentChangesPending()
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
				// Phase 269-01 — on a successful key write, MARK changes pending (no
				// auto-restart). api-key CLIs PATH-resolve the same way; AionUi re-scans
				// when the operator clicks Apply. Best-effort; the key write stands
				// regardless of the flag-write outcome.
				if (result.ok) await markAgentChangesPending()
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
		// Phase 268-03 — write the operator-pasted code to the live paste-back
		// login's stdin. assertWhitelisted FIRST (RCE boundary). The code is NEVER
		// logged/echoed — the module fn returns only {ok}. NO agent-refresh here:
		// paste-back success arrives LATER on the login child's own exit
		// (liv:cli:auth:<name> = ok), not on this stdin write.
		sendAuthInput: adminProcedure
			.input(SendAuthInputInput)
			.mutation(async ({input}) => {
				assertWhitelisted(input.name)
				return sendAuthInput({name: input.name, code: input.code})
			}),
		// Phase 268-03 — uninstall the locally-installed CLI per its static method
		// (npm/rm/pip). assertWhitelisted FIRST. Phase 269-01: on success MARK
		// changes pending (no auto-restart) so the removed agent DISAPPEARS from
		// /api/agents only after the operator clicks Apply (E-6). A failed uninstall
		// does NOT mark anything (must not churn AionUi).
		uninstall: adminProcedure.input(NameInput).mutation(async ({input}) => {
			assertWhitelisted(input.name)
			const result = await uninstall({name: input.name})
			if (result.ok) await markAgentChangesPending()
			return result
		}),
		// Phase 269-01 — MANUAL APPLY (kill the restart storm). Reports whether an
		// agent-affecting change (auth / setApiKey / uninstall) happened since the
		// last apply, so the dialog + panel can show/hide the single "Apply changes
		// (refresh Liv AI)" button. adminProcedure-gated (V4); NO input (the flag is
		// process-wide, not per-CLI) so no assertWhitelisted (no untrusted name).
		hasPendingAgentChanges: adminProcedure.query(
			async (): Promise<{pending: boolean}> => ({
				pending: await getPendingAgentChanges(),
			}),
		),
		// Phase 269-01 — the EXPLICIT, user-triggered apply. Fires the debounced
		// liv-assistant restart EXACTLY ONCE (via the existing triggerAgentRefresh
		// helper — the 4s debounce coalesces a burst to one restart) THEN clears the
		// pending flag. This is the ONLY route that restarts liv-assistant now (T-269-01:
		// adminProcedure-gated, NO untrusted input, reuses the existing NOPASSWD
		// sudoers entry — no new sudo grant). The clear is best-effort (the restart
		// already fired; the flag self-expires via EX 86400 anyway).
		applyAgentChanges: adminProcedure.mutation(
			async (): Promise<{ok: true}> => {
				triggerAgentRefresh()
				try {
					await clearPendingAgentChanges()
				} catch (err) {
					deps.logger.warn(
						'[cli-installer] clearPendingAgentChanges threw (non-fatal — the restart was scheduled; the flag self-expires)',
						err,
					)
				}
				return {ok: true}
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
	// Phase 268-03 — the un-wired router must throw, never silently no-op the
	// paste-back stdin write or the uninstall.
	sendAuthInputFn: async () => {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message:
				'cli-installer-router not yet injected — livinityd boot did not wire production deps',
		})
	},
	uninstallFn: async () => {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message:
				'cli-installer-router not yet injected — livinityd boot did not wire production deps',
		})
	},
})

export type CliInstallerRouter = ReturnType<typeof createCliInstallerRouter>
