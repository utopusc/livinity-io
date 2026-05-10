/**
 * Phase 72-native-06 — registerBytebotMcpServer.
 *
 * Boot-time MCP config installer for the bytebot computer-use stdio server
 * (D-NATIVE-10). Called from livinityd's lifecycle (mountAgentRunsRoutes /
 * AiModule.start chain) AFTER the daemon's redis connection is up.
 *
 * Behavior:
 *   1. Gating — registers ONLY when ALL of:
 *      a) env.BYTEBOT_MCP_ENABLED === 'true' (default-disabled per D-NATIVE-10)
 *      b) process.platform === 'linux' (X11 + xdotool/wmctrl/xclip are linux-only)
 *      c) the resolved server entry-point file exists at the resolved path
 *         (probed via fs.access)
 *   2. Resolved server path:
 *        env.BYTEBOT_MCP_SERVER_PATH ?? '/opt/livos/.../mcp/server.ts'
 *      The default is hardcoded to the Mini PC deploy path; operator can
 *      override via .env if needed for dev or migration.
 *   3. On register, calls McpConfigManager.installServer with stdio transport,
 *      command 'tsx', args=[<resolved path>], env={DISPLAY, XAUTHORITY},
 *      enabled=true, installedAt=Date.now().
 *   4. Idempotency — if a 'bytebot' server already exists in the config:
 *        - matching shape  → no-op (return registered:true,
 *                            reason:'no-op (matched existing)')
 *        - differing shape → updateServer with the partial (return
 *                            registered:true, reason:'updated existing')
 *   5. Graceful degradation — any error caught and converted to
 *      {registered:false, reason: err.message}. livinityd boots normally
 *      even if registration fails; the agent's MCP tool list simply won't
 *      include `mcp_bytebot_*` tools.
 *
 * Sacred file `nexus/packages/core/src/sdk-agent-runner.ts`
 * (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) is read-only — this
 * module imports `@liv/core/lib` types but never modifies sacred internals.
 */

import {access} from 'node:fs/promises'
// ioredis exports Redis as a named export (not default) per CLAUDE.md memory.
// We only need the type here for the function signature; the parameter is
// otherwise unused in this module.
import type {Redis} from 'ioredis'

// Import types only — McpConfigManager is exported from @liv/core/lib for
// this purpose (Phase 72-native-06 lib.ts patch). We use a duck-typed
// interface here so the test can inject a minimal stub without a Redis
// dependency. The real McpConfigManager satisfies this contract.
export interface McpConfigManagerLike {
	installServer(server: McpServerConfigInput): Promise<void>
	updateServer(
		name: string,
		updates: Partial<McpServerConfigInput>,
	): Promise<unknown>
	listServers(): Promise<McpServerConfigStored[]>
}

/** Minimal subset of McpServerConfig that we read from listServers and write
 *  to install/updateServer. The full McpServerConfig has additional optional
 *  fields (description, installedFrom, headers, url) which we never set. */
export interface McpServerConfigInput {
	name: string
	transport: 'stdio' | 'streamableHttp'
	command?: string
	args?: string[]
	env?: Record<string, string>
	enabled: boolean
	installedAt: number
}

/** Stored config entries — same as input shape. We never read extra fields,
 *  so a strict type alias is sufficient and matches the real
 *  McpConfigManager.listServers() return type. */
export type McpServerConfigStored = McpServerConfigInput

/**
 * Default deploy-time path for the bytebot computer-use MCP stdio server.
 * The MCP server lives in livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
 * (created by 72-native-05). On Mini PC the rsync deploy lays this out at
 * /opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts.
 */
export const DEFAULT_BYTEBOT_MCP_SERVER_PATH =
	'/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts'

/**
 * Phase 97-05 — soft cap on per-WebApp bytebot MCP instances.
 *
 * Provisional default per gray-area Q4 in 97-CONTEXT: 3 concurrent Auto-mode
 * sessions. Each spawned instance is a Node child process (~30-60 MB RSS)
 * plus per-tool transient maim/xdotool spawns. 3 leaves headroom for the
 * host-display debug/ad-hoc instance and the rest of livinityd.
 *
 * The cap *value* lives here; `mcp-client-manager.ts` (97-06) is the
 * resource owner that refuses registration above the cap.
 */
export const PER_WEBAPP_BYTEBOT_INSTANCE_CAP = 3

/**
 * Phase 97-05 — env var that signals a bytebot MCP child process to scope
 * all native primitive calls to a specific X11 window id by default. The
 * server reads this once at boot; tools.ts threads it into native primitive
 * calls when a tool's input doesn't explicitly override it.
 */
export const BYTEBOT_TARGET_WINDOW_ID_ENV = 'BYTEBOT_TARGET_WINDOW_ID'

/**
 * Phase 97-05 — descriptor for a per-WebApp bytebot MCP server instance.
 *
 * `instanceKey` namespaces the entry in McpConfigManager (e.g. registered
 * under server name `bytebot:webapp:<instanceKey>` instead of the bare
 * `bytebot`). Two simultaneous WebApp instances will not collide even if
 * they happen to wrap the same Chrome window id at different times.
 *
 * `windowId` is plumbed into the spawned child's env as
 * BYTEBOT_TARGET_WINDOW_ID, where mcp/server.ts picks it up and tools.ts
 * uses it as the default windowId for every primitive call.
 */
export interface PerWebAppMcpDescriptor {
	instanceKey: string
	windowId: number
	/**
	 * Phase 100-08-03 — X11 display the spawned bytebot MCP child should
	 * target via its `DISPLAY` env var. Defaults to `:1` (D-100-08-A: Xvfb
	 * dedicated to WebApp Chromes).
	 *
	 * Native xdotool/maim/xclip calls inside the child process (see
	 * ./native/input.ts which spawns these binaries with default
	 * process.env) inherit DISPLAY from the spawned env, so setting it
	 * once at MCP child boot makes all primitive calls target the right
	 * display.
	 */
	display?: string
}

/** Minimal logger contract — only .log + .error are used. Compatible with
 *  livinityd's createLogger and console. */
export interface BytebotMcpConfigLogger {
	log(message: string, ...args: unknown[]): void
	error(message: string, ...args: unknown[]): void
}

/** Default logger — defers to console so test path doesn't have to wire one. */
const defaultLogger: BytebotMcpConfigLogger = {
	log: (msg, ...rest) => console.log(msg, ...rest),
	error: (msg, ...rest) => console.error(msg, ...rest),
}

/** Resolve the path the server file should live at — env override or default. */
function resolveServerPath(env: NodeJS.ProcessEnv): string {
	const override = env.BYTEBOT_MCP_SERVER_PATH
	if (typeof override === 'string' && override.trim().length > 0) {
		return override
	}
	return DEFAULT_BYTEBOT_MCP_SERVER_PATH
}

interface PreconditionResult {
	ok: boolean
	reason?: string
	path?: string
}

/** Run the 3 gates — enabled flag + linux platform + server file exists. */
async function checkPreconditions(
	env: NodeJS.ProcessEnv,
): Promise<PreconditionResult> {
	if (env.BYTEBOT_MCP_ENABLED !== 'true') {
		return {ok: false, reason: 'BYTEBOT_MCP_ENABLED unset (default-disabled)'}
	}
	if (process.platform !== 'linux') {
		return {
			ok: false,
			reason: `platform not linux (got ${process.platform}); bytebot MCP requires X11`,
		}
	}
	const path = resolveServerPath(env)
	try {
		await access(path)
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code ?? 'EUNKNOWN'
		return {
			ok: false,
			reason: `server file not found at ${path} (${code})`,
		}
	}
	return {ok: true, path}
}

/**
 * Build the canonical bytebot MCP server config. The same shape is used for
 * fresh installs AND idempotency comparison.
 *
 * Phase 97-05 — when `descriptor` is provided, returns a per-WebApp variant:
 *   - name: `bytebot:webapp:<instanceKey>` (so two instances coexist with the
 *     bare host-display `bytebot` entry).
 *   - env: BYTEBOT_TARGET_WINDOW_ID is set so the spawned child scopes its
 *     native primitive calls to that X11 window by default.
 */
export function buildBytebotConfig(
	env: NodeJS.ProcessEnv,
	resolvedPath: string,
	descriptor?: PerWebAppMcpDescriptor,
): McpServerConfigInput {
	// Phase 100-08-03 — branch on descriptor presence:
	//   - per-WebApp variant: DISPLAY from descriptor.display (default :1,
	//     D-100-08-A); XAUTHORITY dropped (Xvfb :1 runs with -ac, no cookie
	//     required). BYTEBOT_TARGET_WINDOW_ID propagated from descriptor.windowId.
	//   - host variant (desktop-stream native app): DISPLAY from process.env
	//     (default :0); XAUTHORITY preserved at the GDM-managed path
	//     (2026-05-05 P79-03 — GDM sessions on Ubuntu 24.04). nut-js'
	//     screen.capture() hangs when X server is unreachable, triggering MCP
	//     SDK timeouts ('Connection closed' from client side); the GDM path
	//     fixes that. Override via env BYTEBOT_XAUTHORITY.
	const baseEnv: Record<string, string> = descriptor
		? {
				DISPLAY: descriptor.display ?? ':1',
				[BYTEBOT_TARGET_WINDOW_ID_ENV]: String(descriptor.windowId),
			}
		: {
				DISPLAY: env.DISPLAY ?? ':0',
				XAUTHORITY:
					env.BYTEBOT_XAUTHORITY ??
					env.XAUTHORITY ??
					'/run/user/1000/gdm/Xauthority',
			}
	return {
		name: descriptor ? `bytebot:webapp:${descriptor.instanceKey}` : 'bytebot',
		transport: 'stdio',
		command: 'tsx',
		args: [resolvedPath],
		env: baseEnv,
		enabled: true,
		installedAt: Date.now(),
	}
}

/**
 * Compare the SUBSTANTIVE fields of two configs. installedAt is excluded —
 * it's a stamp set on every register call; comparing it would prevent the
 * idempotent no-op path.
 *
 * Substantive fields: name, transport, command, args, env, enabled.
 */
function configsMatch(
	existing: McpServerConfigStored,
	candidate: McpServerConfigInput,
): boolean {
	if (existing.name !== candidate.name) return false
	if (existing.transport !== candidate.transport) return false
	if (existing.command !== candidate.command) return false
	if (existing.enabled !== candidate.enabled) return false
	// Compare args arrays
	const existingArgs = existing.args ?? []
	const candidateArgs = candidate.args ?? []
	if (existingArgs.length !== candidateArgs.length) return false
	for (let i = 0; i < existingArgs.length; i++) {
		if (existingArgs[i] !== candidateArgs[i]) return false
	}
	// Compare env objects
	const existingEnv = (existing.env as Record<string, string>) ?? {}
	const candidateEnv = candidate.env ?? {}
	const existingKeys = Object.keys(existingEnv).sort()
	const candidateKeys = Object.keys(candidateEnv).sort()
	if (existingKeys.length !== candidateKeys.length) return false
	for (let i = 0; i < existingKeys.length; i++) {
		if (existingKeys[i] !== candidateKeys[i]) return false
		const k = existingKeys[i]
		if (existingEnv[k] !== candidateEnv[k]) return false
	}
	return true
}

/**
 * Register the bytebot computer-use MCP server in the McpConfigManager,
 * gated by BYTEBOT_MCP_ENABLED + linux + server-file-exists. Idempotent
 * across boot invocations.
 *
 * @param redis  livinityd's existing Redis client (unused here; reserved for
 *               future use — the McpConfigManager already owns its own Redis
 *               handle. Kept in the signature per plan interfaces block).
 * @param env    process.env (or test env). Must include BYTEBOT_MCP_ENABLED.
 * @param configManager  McpConfigManager (or a duck-typed test stub).
 * @param logger optional logger (defaults to console).
 * @returns      {registered: boolean; reason?: string}
 */
export async function registerBytebotMcpServer(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	redis: Redis,
	env: NodeJS.ProcessEnv,
	configManager: McpConfigManagerLike,
	logger: BytebotMcpConfigLogger = defaultLogger,
): Promise<{registered: boolean; reason?: string}> {
	try {
		// Gate 1+2+3: env flag, linux platform, file exists.
		const pre = await checkPreconditions(env)
		if (!pre.ok || !pre.path) {
			logger.log(`[bytebot-mcp-config] skipped: ${pre.reason}`)
			return {registered: false, reason: pre.reason}
		}

		const candidate = buildBytebotConfig(env, pre.path)

		// Idempotency check.
		const existing = (await configManager.listServers()).find(
			(s) => s.name === 'bytebot',
		)

		if (existing) {
			if (configsMatch(existing, candidate)) {
				logger.log(
					`[bytebot-mcp-config] registered: no-op (matched existing) path=${pre.path}`,
				)
				return {registered: true, reason: 'no-op (matched existing)'}
			}
			// Differing shape — update.
			const partial: Partial<McpServerConfigInput> = {
				transport: candidate.transport,
				command: candidate.command,
				args: candidate.args,
				env: candidate.env,
				enabled: candidate.enabled,
			}
			await configManager.updateServer('bytebot', partial)
			logger.log(
				`[bytebot-mcp-config] registered: updated existing path=${pre.path}`,
			)
			return {registered: true, reason: 'updated existing'}
		}

		// Fresh install.
		await configManager.installServer(candidate)
		logger.log(
			`[bytebot-mcp-config] registered: fresh path=${pre.path}`,
		)
		return {registered: true, reason: 'fresh install'}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		logger.error(`[bytebot-mcp-config] error: ${message}`)
		return {registered: false, reason: message}
	}
}
