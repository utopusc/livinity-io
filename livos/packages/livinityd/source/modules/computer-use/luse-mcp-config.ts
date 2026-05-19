/**
 * Phase 72-native-06 — registerLuseMcpServer (renamed P100-10-02 from
 * registerBytebotMcpServer per D-100-10-B; legacy bytebot tooling derived
 * from upstream https://github.com/bytebot-ai/bytebot Apache 2.0).
 *
 * Boot-time MCP config installer for the Luse computer-use stdio server
 * (D-NATIVE-10). Called from livinityd's lifecycle (mountAgentRunsRoutes /
 * AiModule.start chain) AFTER the daemon's redis connection is up.
 *
 * Behavior:
 *   1. Gating — registers ONLY when ALL of:
 *      a) env.LUSE_MCP_ENABLED === 'true' (default-disabled per D-NATIVE-10)
 *      b) process.platform === 'linux' (X11 + xdotool/wmctrl/xclip are linux-only)
 *      c) the resolved server entry-point file exists at the resolved path
 *         (probed via fs.access)
 *   2. Resolved server path:
 *        env.LUSE_MCP_SERVER_PATH ?? '/opt/livos/.../mcp/server.ts'
 *      The default is hardcoded to the Mini PC deploy path; operator can
 *      override via .env if needed for dev or migration.
 *   3. On register, calls McpConfigManager.installServer with stdio transport,
 *      command 'tsx', args=[<resolved path>], env={DISPLAY, XAUTHORITY},
 *      enabled=true, installedAt=Date.now().
 *   4. Idempotency — if a 'luse' server already exists in the config:
 *        - matching shape  → no-op (return registered:true,
 *                            reason:'no-op (matched existing)')
 *        - differing shape → updateServer with the partial (return
 *                            registered:true, reason:'updated existing')
 *   5. Graceful degradation — any error caught and converted to
 *      {registered:false, reason: err.message}. livinityd boots normally
 *      even if registration fails; the agent's MCP tool list simply won't
 *      include `mcp_luse_*` tools.
 *
 * Sacred file `liv/packages/core/src/sdk-agent-runner.ts`
 * (SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`) is read-only — this
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
	/**
	 * Phase 100-10-09 — optional for back-compat with the duck-typed test stubs
	 * in other test files. The real McpConfigManager (in @liv/core) implements
	 * this method; cleanupLegacyBytebotState narrows on existence at call time.
	 */
	removeServer?(name: string): Promise<boolean>
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
 * Default deploy-time path for the Luse computer-use MCP stdio server.
 * The MCP server lives in livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
 * (created by 72-native-05). On Mini PC the rsync deploy lays this out at
 * /opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts.
 */
export const DEFAULT_LUSE_MCP_SERVER_PATH =
	'/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts'

/**
 * Phase 97-05 — soft cap on per-WebApp Luse MCP instances.
 *
 * Provisional default per gray-area Q4 in 97-CONTEXT: 3 concurrent Auto-mode
 * sessions. Each spawned instance is a Node child process (~30-60 MB RSS)
 * plus per-tool transient maim/xdotool spawns. 3 leaves headroom for the
 * host-display debug/ad-hoc instance and the rest of livinityd.
 *
 * The cap *value* lives here; `mcp-client-manager.ts` (97-06) is the
 * resource owner that refuses registration above the cap.
 */
export const PER_WEBAPP_LUSE_INSTANCE_CAP = 3

/**
 * Phase 102-06 — env var that signals a Luse MCP child process to scope all
 * native primitive calls to a specific X11 display (e.g. `:10`, `:11`).
 *
 * Replaces the pre-102 `LUSE_TARGET_WINDOW_ID` per-WebApp env (which scoped by
 * X11 window-id, not display). The per-WebApp Luse child now runs against its
 * own dedicated Xvfb display (D-102-PER-APP-XVFB / D-102-LUSE-DISPLAY-SCOPING)
 * so every xdotool / maim / xclip call inherits `DISPLAY=:N` from the child's
 * environment — no window-coord translation, no offset, no scaling.
 *
 * `LUSE_TARGET_WINDOW_ID` (the legacy env name) is NO LONGER set in the
 * per-WebApp descriptor branch; mcp/server.ts retains a read of it as a
 * deprecated legacy fallback for the host-display Luse instance only.
 */
export const LUSE_TARGET_DISPLAY_ENV = 'LUSE_TARGET_DISPLAY'

/**
 * Phase 102-06 — display-value validation regex.
 *
 * Threat T-102-06 (env injection): the per-WebApp descriptor's `display` is a
 * caller-controlled string that flows into the spawned child's env, where
 * downstream xdotool / maim / xclip concatenate it into X11 socket paths and
 * argv. Permitting arbitrary strings would let an attacker inject shell-meta
 * or path-traversal payloads (`:1 ; rm -rf` etc).
 *
 * Allowed shape: `:N` where N is an integer in [1, 99]. This matches the
 * DisplayAllocator range [10, 100) (102-01) plus the host-display singletons
 * `:0` … `:9`. The lower bound is `:1` (not `:0`) because `:0` is the local
 * console and never enters per-WebApp territory.
 */
const DISPLAY_RE = /^:[1-9][0-9]?$/

function validateDescriptorDisplay(d: PerWebAppMcpDescriptor): void {
	if (!DISPLAY_RE.test(d.display)) {
		throw new Error(
			`PerWebAppMcpDescriptor.display must match /^:[1-9][0-9]?$/ (:1..:99), got: ${JSON.stringify(d.display)}`,
		)
	}
}

/**
 * Phase 102-06 — descriptor for a per-WebApp Luse MCP server instance.
 *
 * `instanceKey` namespaces the entry in McpConfigManager (e.g. registered
 * under server name `luse:webapp:<instanceKey>` instead of the bare
 * `luse`). Two simultaneous WebApp instances do not collide even if they
 * happen to render the same underlying URL on different displays.
 *
 * `display` is the X11 display (`:10`, `:11`, …) the spawned Luse MCP child
 * should target via its `DISPLAY` env var. REQUIRED by Phase 102 — every
 * per-WebApp Luse child runs on its own dedicated Xvfb display (D-102-PER-
 * APP-XVFB). Native xdotool/maim/xclip calls inside the child process (see
 * ./native/input.ts which spawns these binaries with default process.env)
 * inherit DISPLAY from the spawned env, so setting it once at MCP child
 * boot makes all primitive calls target the right display.
 *
 * NOTE on pre-102 `windowId` field: dropped in Phase 102 — per-WebApp Luse
 * is no longer wid-scoped (display IS the unit of isolation). Callers that
 * still reference `.windowId` must be updated to pass `display: ':N'`.
 */
export interface PerWebAppMcpDescriptor {
	instanceKey: string
	display: string
	/**
	 * Phase 160-02 — LivOS overlay context threaded to the MCP child.
	 *
	 * Reason: not all flows go through `agent-prompt-builder.ts` in the parent
	 * process. Some prompt-construction paths run INSIDE the spawned Luse MCP
	 * child (the child runs its own message loop for some local tool-resolution
	 * cases — see mcp/server.ts handlers). The child needs to know which user
	 * + which domain root to render into its own copy of the LivOS overlay so
	 * the WEBAPP URL PATTERN line is correct (`<app>-${userSlug}.${domainRoot}`,
	 * dash not dot).
	 *
	 * Threaded as env (not as part of the URL/argv) so the values survive the
	 * tsx subprocess fork without going through shell quoting. Read by the
	 * child as `process.env.LIVOS_USER_SLUG` / `process.env.LIVOS_DOMAIN_ROOT`.
	 *
	 * Both are optional — callers that don't have user/domain context (e.g.
	 * the host-display luse instance or pre-multi-user single-user mode)
	 * simply omit them, and the child renders the overlay with the
	 * `<user>` + `livinity.io` defaults from buildLuseOverlay.
	 *
	 * NOT threaded here: `LIVOS_AVAILABLE_APPS` + `LIVOS_DISPLAY_SIZE`.
	 *   - `LIVOS_AVAILABLE_APPS` (Plan 03 scope) comes from a runtime
	 *     `apps.list` + `apps.native.list` query — changes per-session,
	 *     not appropriate for boot-time env.
	 *   - `LIVOS_DISPLAY_SIZE` (Plan 04 scope) comes from a runtime
	 *     `xdpyinfo` read against `LUSE_TARGET_DISPLAY` — display content
	 *     may change live (resolution change), again not env-stable.
	 *
	 * The child reconciles per-call: STATIC values from env, DYNAMIC values
	 * (apps list + display size) from per-call discovery hooks in Plans 03+04.
	 */
	userSlug?: string
	domainRoot?: string
}

/** Minimal logger contract — only .log + .error are used. Compatible with
 *  livinityd's createLogger and console. */
export interface LuseMcpConfigLogger {
	log(message: string, ...args: unknown[]): void
	error(message: string, ...args: unknown[]): void
}

/** Default logger — defers to console so test path doesn't have to wire one. */
const defaultLogger: LuseMcpConfigLogger = {
	log: (msg, ...rest) => console.log(msg, ...rest),
	error: (msg, ...rest) => console.error(msg, ...rest),
}

/** Resolve the path the server file should live at — env override or default. */
function resolveServerPath(env: NodeJS.ProcessEnv): string {
	const override = env.LUSE_MCP_SERVER_PATH
	if (typeof override === 'string' && override.trim().length > 0) {
		return override
	}
	return DEFAULT_LUSE_MCP_SERVER_PATH
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
	if (env.LUSE_MCP_ENABLED !== 'true') {
		return {ok: false, reason: 'LUSE_MCP_ENABLED unset (default-disabled)'}
	}
	if (process.platform !== 'linux') {
		return {
			ok: false,
			reason: `platform not linux (got ${process.platform}); Luse MCP requires X11`,
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
 * Build the canonical Luse MCP server config. The same shape is used for
 * fresh installs AND idempotency comparison.
 *
 * Phase 97-05 — when `descriptor` is provided, returns a per-WebApp variant:
 *   - name: `luse:webapp:<instanceKey>` (so two instances coexist with the
 *     bare host-display `luse` entry).
 *   - env: LUSE_TARGET_WINDOW_ID is set so the spawned child scopes its
 *     native primitive calls to that X11 window by default.
 */
export function buildLuseConfig(
	env: NodeJS.ProcessEnv,
	resolvedPath: string,
	descriptor?: PerWebAppMcpDescriptor,
): McpServerConfigInput {
	// Phase 102-06 — branch on descriptor presence:
	//   - per-WebApp variant: descriptor.display is REQUIRED (D-102-PER-APP-
	//     XVFB) and validated against /^:[1-9][0-9]?$/ to deny env-injection
	//     payloads (T-102-06). Set BOTH `DISPLAY` (for xdotool/maim/xclip
	//     inheritance) AND `LUSE_TARGET_DISPLAY` (canonical Phase 102 env
	//     read by mcp/server.ts). XAUTHORITY dropped (per-WebApp Xvfb runs
	//     with -ac, no cookie required).
	//   - host variant (desktop-stream native app): DISPLAY default `:1`
	//     (Phase 100-10-09 — flipped from previous `env.DISPLAY ?? ':0'`).
	//     Rationale: Chrome WebApps spawn on the Xvfb display `:1` (Phase
	//     100-08-01 baseline, preserved through 100-10-08 revert). The MCP
	//     child MUST target the same display so list_windows / screenshot /
	//     focus see the Chrome WebApp windows the AI is meant to interact
	//     with. systemd-inherited `DISPLAY=:0` on Mini PC routed the child
	//     to Bruce's GNOME desktop and blinded the AI to WebApp state
	//     (live UAT 2026-05-10). Explicit `LUSE_DISPLAY` env override is
	//     still honored for the legacy host-desktop-stream native app path.
	//     XAUTHORITY preserved at the GDM-managed path (2026-05-05 P79-03 —
	//     GDM sessions on Ubuntu 24.04). nut-js' screen.capture() hangs
	//     when X server is unreachable, triggering MCP SDK timeouts; the
	//     GDM path fixes that. Override via env LUSE_XAUTHORITY.
	//
	// Phase 100-10-04 (D-100-10-C, G-100-10-E) — LUSE_REDIS_URL threads
	// livinityd's resolved Redis connection URL into the spawned MCP child.
	// The MCP server is a SEPARATE Node.js process; it cannot reuse the
	// parent's ioredis client. Instead, `mcp/server.ts` constructs its OWN
	// fresh `new Redis(luseRedisUrl, ...)` at boot and passes it into
	// `registerLuseTools({redis})` so the `mcp__luse__create_stream` handler
	// can read the privilege-gate flag `liv:config:luse_can_create_streams`
	// at call-time. When `process.env.REDIS_URL` is unset, the empty string
	// passes through and the MCP child falls back to "no Redis" semantics
	// (gate denies — fail-closed).
	if (descriptor) validateDescriptorDisplay(descriptor)
	const luseRedisUrl = env.REDIS_URL ?? ''
	// Phase 160-02 — LivOS overlay context for the MCP child. The child uses
	// these to construct its own overlay when running the system prompt locally
	// (not all flows go through agent-prompt-builder in the parent process).
	// Default to 'admin' / 'livinity.io' so single-user / pre-multi-user
	// deployments still render a sensible WEBAPP URL PATTERN line.
	// Note: LIVOS_AVAILABLE_APPS + LIVOS_DISPLAY_SIZE come from runtime queries
	// performed by Plan 03 + Plan 04 (the apps query and xdpyinfo read);
	// not threaded as env because they change per-call. The MCP child still
	// gets STATIC USER_SLUG + DOMAIN_ROOT here.
	const baseEnv: Record<string, string> = descriptor
		? {
				DISPLAY: descriptor.display,
				[LUSE_TARGET_DISPLAY_ENV]: descriptor.display,
				LUSE_REDIS_URL: luseRedisUrl,
				LIVOS_USER_SLUG: descriptor.userSlug ?? 'admin',
				LIVOS_DOMAIN_ROOT: descriptor.domainRoot ?? 'livinity.io',
			}
		: {
				DISPLAY: env.LUSE_DISPLAY ?? ':1',
				XAUTHORITY:
					env.LUSE_XAUTHORITY ??
					env.XAUTHORITY ??
					'/run/user/1000/gdm/Xauthority',
				LUSE_REDIS_URL: luseRedisUrl,
			}
	return {
		name: descriptor ? `luse:webapp:${descriptor.instanceKey}` : 'luse',
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
 * Register the Luse computer-use MCP server in the McpConfigManager,
 * gated by LUSE_MCP_ENABLED + linux + server-file-exists. Idempotent
 * across boot invocations.
 *
 * @param redis  livinityd's existing Redis client (unused here; reserved for
 *               future use — the McpConfigManager already owns its own Redis
 *               handle. Kept in the signature per plan interfaces block).
 * @param env    process.env (or test env). Must include LUSE_MCP_ENABLED.
 * @param configManager  McpConfigManager (or a duck-typed test stub).
 * @param logger optional logger (defaults to console).
 * @returns      {registered: boolean; reason?: string}
 */
export async function registerLuseMcpServer(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	redis: Redis,
	env: NodeJS.ProcessEnv,
	configManager: McpConfigManagerLike,
	logger: LuseMcpConfigLogger = defaultLogger,
): Promise<{registered: boolean; reason?: string}> {
	try {
		// Gate 1+2+3: env flag, linux platform, file exists.
		const pre = await checkPreconditions(env)
		if (!pre.ok || !pre.path) {
			logger.log(`[luse-mcp-config] skipped: ${pre.reason}`)
			return {registered: false, reason: pre.reason}
		}

		const candidate = buildLuseConfig(env, pre.path)

		// Idempotency check.
		const existing = (await configManager.listServers()).find(
			(s) => s.name === 'luse',
		)

		if (existing) {
			if (configsMatch(existing, candidate)) {
				logger.log(
					`[luse-mcp-config] registered: no-op (matched existing) path=${pre.path}`,
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
			await configManager.updateServer('luse', partial)
			logger.log(
				`[luse-mcp-config] registered: updated existing path=${pre.path}`,
			)
			return {registered: true, reason: 'updated existing'}
		}

		// Fresh install.
		await configManager.installServer(candidate)
		logger.log(
			`[luse-mcp-config] registered: fresh path=${pre.path}`,
		)
		return {registered: true, reason: 'fresh install'}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		logger.error(`[luse-mcp-config] error: ${message}`)
		return {registered: false, reason: message}
	}
}
