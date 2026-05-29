/**
 * Luse MCP tool handlers (renamed P100-10-02 from Bytebot per D-100-10-B) —
 * dispatch each Luse tool call to the matching native primitive function
 * (72-native-01..03).
 *
 * Apache 2.0 attribution
 * ─────────────────────────
 * The 17 tool schemas this module dispatches over (LUSE_TOOLS) are a
 * verbatim copy of upstream bytebot project's agent.tools.ts (Apache 2.0):
 *   https://github.com/bytebot-ai/bytebot
 *   File: packages/bytebot-agent/src/agent/agent.tools.ts
 *   Snapshot date: 2026-05-04 (via Plan 72-01).
 *
 * The action-dispatch strategy (post-action 750ms settle + screenshot, etc.)
 * is also derived from upstream's bytebotd:
 *   File: packages/bytebotd/src/computer-use/computer-use.service.ts
 *
 * Apache 2.0 NOTICE: full license text mirrored at
 * `.planning/licenses/bytebot-LICENSE.txt`.
 *
 * Architecture decisions (per 72-CONTEXT.md):
 *   D-NATIVE-04 — MCP tool handlers dispatch by name to native primitives.
 *   D-NATIVE-05 — 750ms post-action settle delay before post-action screenshot.
 *   D-NATIVE-08 — `_liv_meta` extension field on CallToolResult for needs-help
 *                 / completed / task-created signals.
 *   D-NATIVE-10 — MCP server name is `luse` (matched by `mcp_luse_*`
 *                 categorize patch in liv-agent-runner.ts).
 *
 * Strategy: handler-map (NOT giant switch). Each tool name maps to an async
 * Handler that returns a `LivCallToolResult` with optional `_liv_meta`.
 * Handlers are wrapped at registration time in a try/catch that converts
 * thrown errors into `{ isError: true, content: [{ type:'text', text:'Error: ...' }] }`
 * — the MCP protocol expects an `isError` flag, not exceptions.
 */
import {spawn} from 'node:child_process'
import {readdir as nodeReaddir, realpath as nodeRealpath} from 'node:fs/promises'
import {setTimeout as sleep} from 'node:timers/promises'

import {z, type ZodTypeAny} from 'zod'

import {LUSE_TOOLS, LUSE_AUTO_MODE_EXTRA_TOOLS} from '../luse-tools.js'
import {
	captureScreenshot,
	moveMouse,
	traceMouse,
	clickMouse,
	pressMouse,
	dragMouse,
	scroll,
	typeKeys,
	pressKeys,
	typeText,
	pasteText,
	getCursorPosition,
	openOrFocus,
	listWindows,
	readFileBase64,
} from '../native/index.js'
// Phase 160-03 — LivOS app catalog resolver type. The handler in this module
// calls the resolver BEFORE openOrFocus so LivOS apps (n8n, libreoffice, etc.)
// dispatch through windowManager IPC instead of the classic Bytebot APP_MAP.
import type {LivosAppResolver} from '../native/window.js'
// Phase 248-02 — display lifecycle manager surface. When `displayManager` is
// passed to buildHandlers via LuseToolsOptions, the 4 new display-lifecycle
// tool handlers (computer_create_display / computer_list_displays /
// computer_kill_display / computer_launch_app_in_display) become active.
// When omitted, those handlers return "Error: displayManager not wired"
// (same fail-closed pattern as streamManager from P100-10-04).
import type {DisplayManager, DisplayMode} from '../displays/index.js'
// Phase 201 restore: skill-replay-tool was removed in 782ee4a3 along with the
// rest of computer-use/. The webapp_replay_skill handler below now returns a
// permanent error stub — Auto-mode skill replay is Phase 100 carry-over not
// re-restored yet. Keeping the handler in place so the tool schema doesn't
// have to change and the MCP client doesn't get a missing-handler error.

// ─────────────────────────────────────────────────────────────────────────────
// Types — local to this module (avoids importing the full @modelcontextprotocol
// SDK type tree just to type the McpServer surface we touch).
// ─────────────────────────────────────────────────────────────────────────────

/** Subset of CallToolResult that handlers return. `_liv_meta` is the
 *  underscore-prefixed private extension field (D-NATIVE-08); the MCP spec
 *  permits arbitrary extras on result objects. */
export type LivCallToolResult = {
	content: Array<
		| {type: 'text'; text: string}
		| {type: 'image'; data: string; mimeType: string}
	>
	isError: boolean
	_liv_meta?: {kind: string; message?: string; tool?: string; [k: string]: unknown}
}

export type Handler = (args: Record<string, unknown>) => Promise<LivCallToolResult>

/** Subset of McpServer surface registerLuseTools touches. Avoids a hard
 *  import of `@modelcontextprotocol/sdk` types into this dispatcher module
 *  (the runtime import lives in mcp/server.ts). */
export interface McpServerLike {
	registerTool(
		name: string,
		schemaConfig: {description: string; inputSchema: unknown},
		handler: (args: Record<string, unknown>) => Promise<unknown>,
	): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Settle delay between an action and its post-action screenshot (D-NATIVE-05).
 *  208-11 (computer-use perf): 750→250ms. xdotool/wmctrl events deliver
 *  atomically; the original 750ms was a defensive upper bound that
 *  dominated agent latency. Operators can override via LUSE_POST_ACTION_SETTLE_MS. */
const POST_ACTION_SETTLE_MS = (() => {
	const env = process.env.LUSE_POST_ACTION_SETTLE_MS
	const n = env ? parseInt(env, 10) : NaN
	return Number.isFinite(n) && n >= 0 ? n : 250
})()

/** 208-11: skip the post-action screenshot entirely. Drops ~30-200KB/call.
 *  Default OFF — agent still gets visual feedback. Operator opt-in via
 *  LUSE_POST_SCREENSHOT_DISABLED=1 for high-throughput batched flows where
 *  the agent explicitly calls computer_screenshot when needed. */
const POST_SCREENSHOT_DISABLED = process.env.LUSE_POST_SCREENSHOT_DISABLED === '1'

/**
 * Phase 97-05 — runtime options for the Luse MCP tool dispatcher.
 *
 * `defaultWindowId` is the env-derived (LUSE_TARGET_WINDOW_ID) X11 window
 * id every native primitive call defaults to when the per-tool input does
 * not explicitly override it. When undefined, host-display behavior is
 * preserved (the existing pre-P97 single-instance default).
 *
 * Phase 97-07 — `skillReplayDeps` carries the DB pool + authenticated userId
 * needed by the `webapp_replay_skill` tool. When provided, the tool is
 * registered alongside the standard LUSE_TOOLS. When omitted, the tool
 * is not registered — the caller (mcp/server.ts) only sets it on per-WebApp
 * instances spawned by the Auto-mode start path.
 */
export interface LuseToolsOptions {
	defaultWindowId?: number
	skillReplayDeps?: {
		pool: import('pg').Pool
		userId: string
	}
	/**
	 * Phase 100-07.4 — runtime fallback resolver. When neither args.windowId
	 * nor defaultWindowId is set, tools call this to ask "is there an active
	 * WebApp window I should target?" Used by the host-display Luse to
	 * auto-scope to a single live WebApp without requiring a per-WebApp
	 * MCP instance. Returns undefined for true host-display intent (no
	 * active WebApps, OR multiple — caller should be explicit).
	 */
	activeWebappWidResolver?: () => number | undefined
	/**
	 * Phase 100-10-03 — caller's per-WebApp X display (LUSE_DISPLAY env)
	 * for the window-aware tools (`mcp__luse__list_windows`,
	 * `mcp__luse__screenshot_window`, `mcp__luse__focus_window`).
	 *
	 * The per-WebApp Luse MCP child reads `LUSE_DISPLAY` from env (set
	 * by 100-10-01's WebAppWindowManager → 100-10-02's LuseMcpConfig
	 * descriptor) and `mcp/server.ts` passes it here at registration.
	 * Window-aware tools default to this display when the tool input
	 * does not specify one, so the agent's "list my windows" call
	 * stays scoped to its allocated Xvfb (`:10`, `:11`, ...) by default.
	 */
	defaultDisplay?: string
	/**
	 * Phase 100-10-04 — StreamManager handle for the stream-management
	 * tools (`mcp__luse__create_stream`, `mcp__luse__list_streams`).
	 * When omitted, the stream tools are NOT registered (the schema
	 * entries in LUSE_TOOLS remain visible, but the server-side
	 * registration is skipped — matches the `skillReplayDeps` pattern
	 * from P97-07). Tests inject a mock.
	 *
	 * Duck-typed to avoid a hard dep cycle between computer-use and
	 * streaming modules.
	 */
	streamManager?: {
		startStream(opts: {
			userId: string
			mode: string
			target: Record<string, unknown>
		}): {streamId: string; wsUrl: string}
		listStreams(filter: {userId: string}): Array<Record<string, unknown>>
	}
	/**
	 * Phase 100-10-04 — Redis client used at call-time by
	 * `mcp__luse__create_stream` to read the privilege-gate flag
	 * `liv:config:luse_can_create_streams` (G-100-10-E). When `redis`
	 * is null/undefined OR `redis.get` rejects, the handler fails closed
	 * (returns isError:true). The MCP child process constructs its OWN
	 * fresh ioredis client from `process.env.LUSE_REDIS_URL` at startup
	 * (see `mcp/server.ts`) — NOT shared with the parent livinityd
	 * process.
	 */
	redis?: {
		get(key: string): Promise<string | null>
	} | null
	/**
	 * Phase 100-10-04 — userId scope for the stream tools. `create_stream`
	 * passes this to `streamManager.startStream({userId})` so the new
	 * session is owned by the caller; `list_streams` passes this to
	 * `streamManager.listStreams({userId})` so the agent only sees its
	 * own sessions (user-scoped read).
	 */
	userId?: string
	/**
	 * Phase 160-03 — LivOS app catalog resolver. When set, the
	 * `computer_application` handler invokes this resolver BEFORE the
	 * classic Bytebot APP_MAP path. A non-null return means the agent
	 * named a LivOS app (WebApp or Native) — the handler emits a
	 * structured `open_livos_app` IPC line on stderr (consumed by the
	 * parent livinityd to drive windowManager.openWindow) and returns
	 * a post-action screenshot. A null return falls through to
	 * openOrFocus (Bytebot binary spawn).
	 *
	 * Wired by livinityd's mcp/server.ts at registration. Tests inject
	 * a mock. When unset (e.g. legacy host-display Luse without a trpc
	 * context), behavior is identical to pre-Phase-160-03 (skip resolver,
	 * straight to APP_MAP).
	 */
	livosAppResolver?: LivosAppResolver
	/**
	 * Phase 248-02 — display-lifecycle manager surface (Phase 248-01 module).
	 * When set, the 4 new display-lifecycle tools are wired into the handler
	 * map (computer_create_display / computer_list_displays / computer_kill_display
	 * / computer_launch_app_in_display). When omitted, those handlers return
	 * an "Error: displayManager not wired" envelope (fail-closed — same
	 * pattern as `streamManager` from P100-10-04).
	 *
	 * Owner-session enforcement (D-V44-DISPLAY-OWNER-SCOPED) lives at the
	 * manager layer; this MCP wrapper just passes `options.userId` as the
	 * `ownerSession` (for create) / `callerSession` (for kill) and surfaces
	 * the manager's `{ok:false, error:'not-owner'}` response as
	 * `isError:true` with a helpful text block.
	 */
	displayManager?: DisplayManager
}

/**
 * Resolve the windowId a primitive should use. Tool input wins over the
 * server-level default. Phase 100-07.4 — when neither is set, fall back
 * to `activeWebappWidResolver` (auto-route to single active WebApp).
 * `undefined` means host-display.
 */
function resolveWindowId(
	args: Record<string, unknown>,
	defaultWindowId: number | undefined,
	activeWebappWidResolver?: () => number | undefined,
): number | undefined {
	const fromArgs = args.windowId
	if (typeof fromArgs === 'number' && Number.isFinite(fromArgs)) return fromArgs
	if (defaultWindowId !== undefined) return defaultWindowId
	if (activeWebappWidResolver !== undefined) {
		const resolved = activeWebappWidResolver()
		if (resolved !== undefined) return resolved
	}
	// Phase 100-07.4 — file-based cross-process fallback. livinityd's
	// window-manager writes the wid of the SOLE active WebApp to this file
	// on spawn (and clears/rewrites on close). The Luse MCP child process
	// runs in its own JS context and can't reach the parent's runtime state
	// directly, so a file-based marker is the simplest safe IPC.
	return readSingleActiveWebappWidFromFile()
}

/**
 * File-based fallback for cross-process wid lookup. The marker file is
 * written by livinityd's window-manager (Phase 100-07.4) and contains a
 * single positive integer (the wid of the only active WebApp), or is
 * absent (no active WebApps), or contains an empty string (multiple active
 * WebApps — caller should be explicit).
 *
 * Cached for 250ms because tools may be called in tight loops and we don't
 * want to thrash readFileSync on the hot path. Cache invalidates if the
 * file's mtime changed.
 */
const ACTIVE_WID_MARKER = '/tmp/livos-active-webapp-wid'
let widCache: {wid: number | undefined; cachedAt: number; mtimeMs: number} | null = null
const WID_CACHE_TTL_MS = 250

function readSingleActiveWebappWidFromFile(): number | undefined {
	// Linux-only: the marker file is a Mini PC convention; in dev/test on
	// Windows or Mac, fall through to host-display.
	if (process.platform !== 'linux') return undefined
	const now = Date.now()
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const fs = require('node:fs') as typeof import('node:fs')
		let mtimeMs = 0
		try {
			mtimeMs = fs.statSync(ACTIVE_WID_MARKER).mtimeMs
		} catch {
			widCache = null
			return undefined
		}
		if (widCache && widCache.mtimeMs === mtimeMs && now - widCache.cachedAt < WID_CACHE_TTL_MS) {
			return widCache.wid
		}
		const raw = fs.readFileSync(ACTIVE_WID_MARKER, 'utf8').trim()
		if (raw.length === 0) {
			widCache = {wid: undefined, cachedAt: now, mtimeMs}
			return undefined
		}
		const parsed = Number(raw)
		const wid =
			Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
		widCache = {wid, cachedAt: now, mtimeMs}
		return wid
	} catch {
		return undefined
	}
}

/**
 * Phase 103-B (REQ-103-B2 / Pitfall 2) — temporarily scope process.env.DISPLAY
 * for the duration of an async native-primitive call, then restore.
 *
 * Resolution: explicit `display` arg wins; otherwise fall back to
 * `defaultDisplay` (typically the LuseToolsOptions.defaultDisplay seeded
 * from LUSE_TARGET_DISPLAY env). When BOTH are undefined, do NOT mutate
 * process.env.DISPLAY at all — preserves the host-display behavior for
 * callers without scoping intent.
 *
 * The MCP child process serializes tool calls via JSON-RPC stdio (one
 * request, one response, one at a time), so concurrent handler races
 * are not possible in production. Vitest `singleThread:true` serializes
 * tests. Documented assumption: future v2 (execFile env arg) deferred
 * unless production race observed.
 */
async function withScopedDisplay<T>(
	display: string | undefined,
	defaultDisplay: string | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	const target = display ?? defaultDisplay
	if (target === undefined) return fn()
	const prev = process.env.DISPLAY
	try {
		process.env.DISPLAY = target
		return await fn()
	} finally {
		if (prev === undefined) delete process.env.DISPLAY
		else process.env.DISPLAY = prev
	}
}

/**
 * Phase 103.1 — discover all active X11 displays by scanning
 * `/tmp/.X11-unix/` for `X<N>` socket files. Each running Xvfb / Xorg
 * creates its socket on startup and removes it on shutdown, so this scan
 * is always up to date without any IPC.
 *
 * Used by the `list_windows` handler when no display arg is passed AND
 * no per-WebApp scope is set, so a global luse MCP serving all displays
 * returns the cross-display window roster (the right answer for the
 * 103-05 default-off single-MCP world).
 *
 * Display `:0` is intentionally excluded — Mini PC is headless and `:0`
 * doesn't exist; including it would just produce empty results and an
 * extra wmctrl spawn. The host LivOS canvas lives on `:1`
 * (WEBAPPS_X11_ENV); per-app WebApp Xvfbs are `:10+` (DisplayAllocator
 * range).
 *
 * Allows test injection of `readdirFn` for unit tests on Windows / Mac
 * where `/tmp/.X11-unix/` doesn't exist.
 *
 * Returns an empty array when the socket dir is unreachable (non-Linux,
 * permission denied, etc.) — callers fall back to single-display scope.
 */
/**
 * Test-only seam — vitest cannot spyOn the ESM-frozen node:fs/promises.readdir
 * binding, so we expose a mutable resolver. Production callers go through the
 * default which delegates to `nodeReaddir`. Reset to `undefined` between
 * tests via `__setReaddirForTest(undefined)`.
 */
let __readdirOverride: typeof nodeReaddir | undefined
export function __setReaddirForTest(
	fn: typeof nodeReaddir | undefined,
): void {
	__readdirOverride = fn
}

async function discoverActiveX11Displays(): Promise<string[]> {
	const readdirFn = __readdirOverride ?? nodeReaddir
	try {
		const entries = await readdirFn('/tmp/.X11-unix')
		const displays: number[] = []
		for (const name of entries) {
			const m = /^X(\d+)$/.exec(name)
			if (!m) continue
			const n = Number(m[1])
			if (!Number.isInteger(n) || n < 1 || n > 999) continue
			displays.push(n)
		}
		displays.sort((a, b) => a - b)
		return displays.map((n) => `:${n}`)
	} catch {
		return []
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 160-05 — computer_read_file path sandbox
// ─────────────────────────────────────────────────────────────────────────────
//
// `computer_read_file` is LLM-controlled file read — without a guard this is a
// jailbreak vector (e.g. agent coerced into reading /etc/passwd or
// /opt/livos/.env). We restrict reads to a per-user allowlist:
//
//   /home/<user>/                        — user home, read-only
//   /tmp/luse-*/                         — Luse-owned temp workspace
//   /opt/livos/data/uploads/<userId>/    — user uploads
//
// Symlinks are resolved via fs.realpath BEFORE the allowlist check so a
// symlink inside /home/bruce/ that points at /etc/passwd is still rejected.
// LUSE_USER_ID env var drives the per-user allowlist branches (set by
// luse-mcp-config when the child is spawned). Defaults to 'bruce' for the
// host-display single-user case where the env may be absent.
//
// Rejection error includes the original requested path AND the resolved path
// (so the LLM sees the symlink target for debugging) but NEVER the file
// content — that's the whole point of the gate.

/**
 * Test-only seam — same pattern as __setReaddirForTest. vitest cannot spyOn
 * the ESM-frozen node:fs/promises.realpath binding, so we expose a mutable
 * resolver. Production callers go through the default which delegates to
 * `nodeRealpath`. Reset to `undefined` between tests via
 * `__setRealpathForTest(undefined)`.
 */
let __realpathOverride: typeof nodeRealpath | undefined
export function __setRealpathForTest(
	fn: typeof nodeRealpath | undefined,
): void {
	__realpathOverride = fn
}

/**
 * Phase 160-05 — pure allowlist check. `resolved` is expected to be the
 * post-realpath absolute path. `userSlug` controls the `/home/<user>/`
 * branch; `userId` controls the `/opt/livos/data/uploads/<userId>/` branch.
 * Returns true ONLY if `resolved` starts with one of the three allowed
 * prefixes. The `/tmp/luse-` prefix matches any `/tmp/luse-<anything>` dir.
 */
export function isPathAllowed(
	resolved: string,
	userSlug: string,
	userId: string,
): boolean {
	const allowlist = [
		`/home/${userSlug}/`,
		'/tmp/luse-',
		`/opt/livos/data/uploads/${userId}/`,
	]
	return allowlist.some((prefix) => resolved.startsWith(prefix))
}

/**
 * Phase 103-B (T-103-03-01) — parse and validate the optional `display`
 * arg passed to an X11-touching tool. Returns undefined for any string
 * that does not match /^:[1-9][0-9]?$/ (so the handler falls back to
 * defaultDisplay rather than mutating process.env.DISPLAY with a hostile
 * value).
 *
 * Same regex as PerWebAppMcpDescriptor.display in luse-mcp-config.ts:133
 * — consistent gate everywhere a display string crosses a trust boundary.
 */
const DISPLAY_ARG_RE = /^:[1-9][0-9]?$/
function parseDisplayArg(args: Record<string, unknown>): string | undefined {
	const raw = args.display
	if (typeof raw !== 'string') return undefined
	if (!DISPLAY_ARG_RE.test(raw)) return undefined
	return raw
}

/** @internal — exported for Phase 103-B tests (tools.test.ts). The MCP
 *  child process serializes tool calls so there are no production callers
 *  outside this file. */
export {withScopedDisplay, parseDisplayArg}

/**
 * Wrap a state-changing native action in: run → 750ms settle → screenshot.
 * Returns a CallToolResult with [text summary, post-action image].
 *
 * Phase 97-05: post-action screenshot inherits the same `windowId` as the
 * action — otherwise the agent would see the full host display after a
 * window-scoped click, defeating the purpose.
 */
async function withPostScreenshot(
	actionSummary: string,
	fn: () => Promise<void>,
	windowId?: number,
): Promise<LivCallToolResult> {
	await fn()
	await sleep(POST_ACTION_SETTLE_MS)
	// 208-11: env-gated skip drops the 30-200KB image to save agent context.
	// The text summary still describes the action so the agent has feedback.
	if (POST_SCREENSHOT_DISABLED) {
		return {
			content: [{type: 'text', text: `${actionSummary} (post-screenshot disabled)`}],
			isError: false,
		}
	}
	const shot = await captureScreenshot(typeof windowId === 'number' ? {windowId} : undefined)
	return {
		content: [
			{type: 'text', text: actionSummary},
			{type: 'image', data: shot.base64, mimeType: shot.mimeType},
		],
		isError: false,
	}
}

/** Stringify args concisely for action-summary text in post-action screenshots.
 *  Best-effort — avoids dumping huge text payloads (T-72N5-02 mitigation). */
function summarizeArgs(args: Record<string, unknown>): string {
	try {
		const safe: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(args)) {
			if (typeof v === 'string' && v.length > 64) {
				safe[k] = `${v.slice(0, 64)}…`
			} else {
				safe[k] = v
			}
		}
		return JSON.stringify(safe)
	} catch {
		return '<unserializable args>'
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS — handler map for all 17 LUSE_TOOLS (D-NATIVE-04)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phase 97-05 — handler factory. The pre-P97 `HANDLERS` was a static record
 * (host-display only). Per-WebApp instances need handlers that thread an
 * env-derived `defaultWindowId` into every native primitive call. The
 * factory takes the options once at registration, returns the handler map.
 *
 * The legacy `HANDLERS` constant below is preserved as the host-display
 * default (`buildHandlers({})`) so existing callers / tests that import
 * `HANDLERS` directly keep working.
 */
export function buildHandlers(options: LuseToolsOptions = {}): Record<string, Handler> {
	const defaultWindowId = options.defaultWindowId
	const widResolver = options.activeWebappWidResolver
	const wid = (args: Record<string, unknown>): number | undefined =>
		resolveWindowId(args, defaultWindowId, widResolver)
	return {
	// ── Mouse primitives ──────────────────────────────────────────────────────

	computer_screenshot: async (args) => {
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		// Phase 103-B: thread per-call display through to captureScreenshot.
		// When `wid` is set, captureScreenshot uses maim's window-bound capture
		// path which inherits DISPLAY from process.env transitively; when wid
		// is absent, captureScreenshot grabs the whole display — also via env.
		// Either way the withScopedDisplay wrapper ensures DISPLAY points at
		// the right Xvfb for the duration of the maim subprocess.
		return withScopedDisplay(displayArg, options.defaultDisplay, async () => {
			const shot = await captureScreenshot(typeof w === 'number' ? {windowId: w} : undefined)
			return {
				content: [
					{type: 'image', data: shot.base64, mimeType: shot.mimeType},
					{
						type: 'text',
						text: `Screenshot captured (${shot.width}x${shot.height})${
							displayArg ? ` display=${displayArg}` : ''
						}`,
					},
				],
				isError: false,
			}
		})
	},

	computer_move_mouse: async (args) => {
		const coordinates = args.coordinates as {x: number; y: number}
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`moveMouse → (${coordinates.x}, ${coordinates.y})${displayArg ? ` display=${displayArg}` : ''}`,
				() => moveMouse(coordinates, w),
				w,
			),
		)
	},

	computer_trace_mouse: async (args) => {
		const path = args.path as ReadonlyArray<{x: number; y: number}>
		const holdKeys = args.holdKeys as ReadonlyArray<string> | undefined
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`traceMouse path of ${path.length} points${displayArg ? ` display=${displayArg}` : ''}`,
				() => traceMouse(path, holdKeys ?? undefined),
				w,
			),
		)
	},

	computer_click_mouse: async (args) => {
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		// R3 (208-01): accept `{coord:{x,y}}` as an alias for
		// `{coordinates:{x,y}}`. Silent — no log line, no warning.
		const coordAlias = args.coord as {x: number; y: number} | undefined
		const argsWithCoord =
			args.coordinates == null && coordAlias != null
				? {...args, coordinates: coordAlias}
				: args
		// 208-10: default clickCount=1 when omitted — schema no longer requires
		// it (LLM consistently elides), so the handler is the source of truth.
		const clickCount =
			typeof (argsWithCoord as {clickCount?: unknown}).clickCount === 'number'
				? ((argsWithCoord as {clickCount: number}).clickCount)
				: 1
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`clickMouse ${summarizeArgs(argsWithCoord)}${displayArg ? ` display=${displayArg}` : ''}`,
				() =>
					clickMouse({
						...(argsWithCoord as unknown as {
							coordinates?: {x: number; y: number}
							button: 'left' | 'right' | 'middle'
							holdKeys?: readonly string[]
						}),
						clickCount,
						windowId: w,
					}),
				w,
			),
		)
	},

	computer_press_mouse: async (args) => {
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`pressMouse ${summarizeArgs(args)}${displayArg ? ` display=${displayArg}` : ''}`,
				() =>
					pressMouse(
						args as unknown as {
							coordinates?: {x: number; y: number}
							button: 'left' | 'right' | 'middle'
							press: 'up' | 'down'
						},
					),
				w,
			),
		)
	},

	computer_drag_mouse: async (args) => {
		// R3 (208-01): accept `{coord:{x,y}}` as an alias for `{x,y}` on every
		// path entry, so LLMs that fall into the coord-object habit succeed.
		const rawPath = args.path as ReadonlyArray<Record<string, unknown>>
		const path = (rawPath ?? []).map((p) => {
			if (p && typeof p === 'object' && 'coord' in p && p.coord != null) {
				const c = p.coord as {x: number; y: number}
				return {x: c.x, y: c.y}
			}
			return p as unknown as {x: number; y: number}
		}) as ReadonlyArray<{x: number; y: number}>
		const button = args.button as 'left' | 'right' | 'middle'
		const holdKeys = args.holdKeys as ReadonlyArray<string> | undefined
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`dragMouse ${button} along ${path.length} points${displayArg ? ` display=${displayArg}` : ''}`,
				() => dragMouse(path, button, holdKeys ?? undefined),
				w,
			),
		)
	},

	computer_scroll: async (args) => {
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`scroll ${summarizeArgs(args)}${displayArg ? ` display=${displayArg}` : ''}`,
				() =>
					scroll({
						...(args as unknown as {
							coordinates: {x: number; y: number}
							direction: 'up' | 'down' | 'left' | 'right'
							scrollCount: number
							holdKeys?: readonly string[]
						}),
						// P100-09-02: thread the bound wid into scroll so tryXdotoolScroll
						// activates the target window before dispatching button 4/5/6/7
						// (Chrome filters nut-js's synthetic XTestFakeButtonEvent —
						// same fix as P100-07.3 click). Without this, scroll-down
						// against a WebApp Chrome silently no-ops.
						windowId: w,
					}),
				w,
			),
		)
	},

	// ── Keyboard primitives ──────────────────────────────────────────────────

	computer_type_keys: async (args) => {
		const keys = args.keys as ReadonlyArray<string>
		const delay = args.delay as number | undefined
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`typeKeys [${keys.join('+')}]${displayArg ? ` display=${displayArg}` : ''}`,
				() => typeKeys(keys, delay ?? undefined, w),
				w,
			),
		)
	},

	computer_press_keys: async (args) => {
		const keys = args.keys as ReadonlyArray<string>
		const press = args.press as 'up' | 'down'
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`pressKeys [${keys.join(', ')}] ${press}${displayArg ? ` display=${displayArg}` : ''}`,
				() => pressKeys(keys, press, w),
				w,
			),
		)
	},

	computer_type_text: async (args) => {
		// R3 (208-01): accept {text, content, value} interchangeably. Canonical
		// `text` wins when both are present. Silent — no log line.
		const text = (args.text ?? args.content ?? args.value) as string
		const delay = args.delay as number | undefined
		const isSensitive = args.isSensitive as boolean | undefined
		const safeText = isSensitive ? `<${text.length} sensitive chars>` : text
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`typeText ${JSON.stringify(safeText)}${displayArg ? ` display=${displayArg}` : ''}`,
				() => typeText(text, delay ?? undefined, isSensitive ?? undefined, w),
				w,
			),
		)
	},

	computer_paste_text: async (args) => {
		// R3 (208-01): accept {text, content, value} interchangeably. Canonical
		// `text` wins when both are present. Silent — no log line.
		const text = (args.text ?? args.content ?? args.value) as string
		const isSensitive = args.isSensitive as boolean | undefined
		const safeText = isSensitive ? `<${text.length} sensitive chars>` : text
		const w = wid(args)
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, () =>
			withPostScreenshot(
				`pasteText ${JSON.stringify(safeText)}${displayArg ? ` display=${displayArg}` : ''}`,
				() => pasteText(text, isSensitive ?? undefined),
				w,
			),
		)
	},

	// ── Utility actions ──────────────────────────────────────────────────────

	computer_wait: async (args) => {
		const duration = args.duration as number
		await sleep(duration)
		// No post-action screenshot — wait is purely temporal, no state change.
		return {
			content: [{type: 'text', text: `Waited ${duration}ms`}],
			isError: false,
		}
	},

	computer_cursor_position: async (args) => {
		// Read-only action — no state change, no post-action screenshot.
		// Phase 103-B: scope DISPLAY for the xdotool getmouselocation subprocess.
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, async () => {
			const pos = await getCursorPosition()
			return {
				content: [
					{
						type: 'text',
						text: `Cursor at (${pos.x}, ${pos.y})${displayArg ? ` display=${displayArg}` : ''}`,
					},
				],
				isError: false,
			}
		})
	},

	computer_application: async (args) => {
		// R3 (208-01): accept {application, name, app} interchangeably.
		// Canonical `application` wins when both are present. Silent — no log.
		const application = String(args.application ?? args.name ?? args.app ?? '').trim()
		if (!application) {
			return {
				content: [{type: 'text', text: 'application name is required'}],
				isError: true,
			}
		}

		// Phase 248-02 — optional `display:":N"` arg. parseDisplayArg
		// regex-validates against /^:[1-9][0-9]?$/ so a hostile string can't
		// poison process.env.DISPLAY. When set, withScopedDisplay swaps DISPLAY
		// for the duration of the app spawn and restores it on return.
		const displayArg = parseDisplayArg(args)
		return withScopedDisplay(displayArg, options.defaultDisplay, async () => {
			// Phase 160-03 — LivOS resolver FIRST. The resolver is injected via
			// registerLuseTools options so a test harness can mock it; production
			// path gets the default resolver wired from livinityd's trpc context.
			// On match, the handler emits a structured `open_livos_app` line on
			// stderr — the parent livinityd parses it and drives windowManager.
			// On miss (or no resolver wired), fall through to the classic
			// openOrFocus / APP_MAP Bytebot binary spawn path.
			if (options.livosAppResolver) {
				try {
					const match = await options.livosAppResolver(application)
					if (match) {
						// Phase 160-03 — IPC line consumed by parent livinityd.
						// Single-line stderr write keeps the parsing trivial; the
						// agent loop's settle screenshot follows via withPostScreenshot.
						process.stderr.write(
							`[luse-mcp] open_livos_app kind=${match.kind} appId=${match.appId} route=${match.route}\n`,
						)
						return withPostScreenshot(
							`application → ${application} (LivOS ${match.kind})${displayArg ? ` display=${displayArg}` : ''}`,
							async () => {
								/* settle — windowManager.openWindow happens in parent process */
							},
						)
					}
				} catch (err) {
					process.stderr.write(
						`[luse-mcp] livosAppResolver error: ${(err as Error).message}; falling through to APP_MAP\n`,
					)
				}
			}

			// Fallback: classic Bytebot APP_MAP path (firefox/thunderbird/vscode/etc).
			const result = await openOrFocus(application as never)
			if (result.isError) {
				return {
					content: [{type: 'text', text: result.message ?? 'application launch failed'}],
					isError: true,
				}
			}
			return withPostScreenshot(
				`application → ${application}${displayArg ? ` display=${displayArg}` : ''}`,
				async () => {
					// The action already happened inside openOrFocus; we just settle + shot.
				},
			)
		})
	},

	// ── File read ────────────────────────────────────────────────────────────

	computer_read_file: async (args) => {
		// Phase 160-05 — sandbox guard. LLM-controlled file read is a jailbreak
		// vector; restrict resolved paths to the per-user allowlist before
		// touching the disk. See the "computer_read_file path sandbox" comment
		// block above for the allowlist policy.
		const requestedPath = String(args.path ?? '').trim()
		if (!requestedPath) {
			return {
				content: [{type: 'text', text: 'path is required'}],
				isError: true,
			}
		}

		// NUL byte rejection — POSIX paths cannot contain NUL; a NUL is a
		// classic null-byte truncation attack indicator and must be rejected
		// before realpath (which may itself throw confusingly on NUL).
		if (requestedPath.includes('\x00')) {
			return {
				content: [{type: 'text', text: `path contains NUL byte (rejected): ${JSON.stringify(requestedPath)}`}],
				isError: true,
			}
		}

		// Resolve symlinks FIRST so a symlink at an allowed path that points
		// at /etc/passwd still gets rejected by the allowlist check below.
		const realpathFn = __realpathOverride ?? nodeRealpath
		let resolved: string
		try {
			resolved = await realpathFn(requestedPath)
		} catch {
			return {
				content: [{type: 'text', text: `path not found or unreadable: ${requestedPath}`}],
				isError: true,
			}
		}

		// LUSE_USER_ID env drives both the userSlug (home dir name) and the
		// userId (uploads dir name). They are the same value today (slug ==
		// id in the v7.0 single-tenant default); the parameters are kept
		// separate so a future uuid/slug split can be wired without changing
		// the allowlist shape. Falls back to 'bruce' for the host-display
		// case where LUSE_USER_ID is not set.
		const userSlug = process.env.LUSE_USER_ID ?? 'bruce'
		const userId = process.env.LUSE_USER_ID ?? 'bruce'
		if (!isPathAllowed(resolved, userSlug, userId)) {
			// Rejection includes resolved path (so the LLM sees the symlink
			// target if any — debugging) but NEVER the file content. Allowed
			// prefixes are echoed back so the agent can self-correct.
			return {
				content: [{
					type: 'text',
					text:
						`path outside sandbox: requested=${requestedPath} resolved=${resolved} ` +
						`(allowed prefixes: /home/${userSlug}/, /tmp/luse-, /opt/livos/data/uploads/${userId}/)`,
				}],
				isError: true,
			}
		}

		// Sandbox passed — preserve the original read + base64 wrap behavior.
		const file = await readFileBase64(requestedPath)
		return {
			content: [
				{
					type: 'text',
					text: `Read ${file.filename} (${file.size} bytes, ${file.mimeType}). base64=${file.base64}`,
				},
			],
			isError: false,
		}
	},

	// ── Task management (no state-change to observe — no screenshot) ─────────

	set_task_status: async (args) => {
		const status = args.status as 'completed' | 'needs_help'
		const description = (args.description as string) ?? ''

		if (status === 'needs_help') {
			return {
				content: [{type: 'text', text: `NEEDS_HELP: ${description}`}],
				isError: false,
				_liv_meta: {
					kind: 'needs-help',
					message: description,
					tool: 'mcp_luse_set_task_status',
				},
			}
		}

		// status === 'completed'
		return {
			content: [{type: 'text', text: `COMPLETED: ${description}`}],
			isError: false,
			_liv_meta: {
				kind: 'completed',
				message: description,
			},
		}
	},

	create_task: async (args) => {
		// Passthrough — no DB write at this phase. Surfaced via _liv_meta so
		// future plans (74+) can wire actual task creation behind this call.
		return {
			content: [{type: 'text', text: 'task created (passthrough — no DB write at this phase)'}],
			isError: false,
			_liv_meta: {
				kind: 'task-created',
				...args,
			},
		}
	},

	// ── Phase 97-07 — Auto-mode skill replay (per-WebApp instances only) ──
	// Phase 201 restore stub — skill-replay-tool.ts is not yet restored from
	// 782ee4a3 deletion. Always returns the no-deps error path; when Auto
	// mode is re-enabled, re-import executeWebAppReplaySkill and restore the
	// original two-branch body.

	webapp_replay_skill: async () => {
		return {
			content: [
				{
					type: 'text',
					text:
						'Error: webapp_replay_skill is only available on per-WebApp ' +
						'Luse MCP instances (Auto mode). The current MCP server has ' +
						'no skill-replay dependencies wired (Phase 201 restore stub).',
				},
			],
			isError: true,
		}
	},

	// ── Phase 248-02 — Display lifecycle (D-V44-DISPLAY-XEPHYR-DEFAULT,
	//                                     D-V44-DISPLAY-OWNER-SCOPED) ───────
	//
	// Wires the 4 display-lifecycle tools to options.displayManager
	// (Phase 248-01 backend). ownerSession (create) / callerSession (kill)
	// come from options.userId — the MCP child's per-connection session
	// identity, populated from LUSE_USER_ID env in mcp/server.ts and
	// defaulting to 'admin' for the host-display single-tenant case.
	//
	// When options.displayManager is omitted (no Redis OR test stub did not
	// inject one), every handler returns "Error: displayManager not wired"
	// with isError:true — same fail-closed semantics as streamManager.

	computer_create_display: async (args) => {
		if (!options.displayManager) {
			return {
				content: [{type: 'text', text: 'Error: displayManager not wired (no Redis client at MCP boot)'}],
				isError: true,
			}
		}
		const mode = typeof args.mode === 'string' ? (args.mode as DisplayMode) : undefined
		const name = typeof args.name === 'string' ? args.name : undefined
		const width = typeof args.width === 'number' ? args.width : undefined
		const height = typeof args.height === 'number' ? args.height : undefined
		const result = await options.displayManager.create({
			mode,
			name,
			width,
			height,
			ownerSession: options.userId ?? 'admin',
		})
		if (result.isError) {
			return {
				content: [{type: 'text', text: `Error: ${result.error ?? 'display creation failed'}`}],
				isError: true,
			}
		}
		return {
			content: [{type: 'text', text: JSON.stringify(result)}],
			isError: false,
		}
	},

	computer_list_displays: async () => {
		if (!options.displayManager) {
			return {
				content: [{type: 'text', text: 'Error: displayManager not wired (no Redis client at MCP boot)'}],
				isError: true,
			}
		}
		const records = await options.displayManager.list()
		return {
			content: [{type: 'text', text: JSON.stringify(records)}],
			isError: false,
		}
	},

	computer_kill_display: async (args) => {
		if (!options.displayManager) {
			return {
				content: [{type: 'text', text: 'Error: displayManager not wired (no Redis client at MCP boot)'}],
				isError: true,
			}
		}
		const display = typeof args.display === 'string' ? args.display : ''
		if (!display) {
			return {
				content: [{type: 'text', text: 'Error: display is required (e.g. ":12")'}],
				isError: true,
			}
		}
		const result = await options.displayManager.kill({
			display,
			callerSession: options.userId ?? 'admin',
		})
		if (!result.ok) {
			// D-V44-DISPLAY-OWNER-SCOPED — surface manager's discriminated-union
			// denial as an MCP-layer error envelope. The display is NOT killed;
			// the X server + Redis state remain intact (the manager guarantees
			// this before this branch runs).
			return {
				content: [
					{
						type: 'text',
						text: `Error: ${result.error} — only the session that called computer_create_display can kill this display (D-V44-DISPLAY-OWNER-SCOPED)`,
					},
				],
				isError: true,
			}
		}
		return {
			content: [{type: 'text', text: JSON.stringify(result)}],
			isError: false,
		}
	},

	computer_launch_app_in_display: async (args) => {
		if (!options.displayManager) {
			return {
				content: [{type: 'text', text: 'Error: displayManager not wired (no Redis client at MCP boot)'}],
				isError: true,
			}
		}
		const display = typeof args.display === 'string' ? args.display : ''
		const app = typeof args.app === 'string' ? args.app : ''
		if (!display || !app) {
			return {
				content: [{type: 'text', text: 'Error: display and app are required'}],
				isError: true,
			}
		}
		const extraArgs = Array.isArray(args.args)
			? (args.args as unknown[]).filter((a): a is string => typeof a === 'string')
			: []

		// Validate the display arg the same way every other X11-touching tool
		// does (parseDisplayArg + withScopedDisplay) so a hostile string can't
		// inject into process.env.DISPLAY. parseDisplayArg returns undefined
		// for any non-matching string → withScopedDisplay falls back to the
		// defaultDisplay, which is the existing safe behavior.
		const displayArg = parseDisplayArg({display})

		return withScopedDisplay(displayArg, options.defaultDisplay, async () => {
			// Phase 160-03 LivOS resolver path. On WebApp/native match we emit
			// the structured IPC line for parent livinityd to drive windowManager
			// (same as computer_application). The spawn pid for app-attach
			// purposes comes from a child_process.spawn of the app binary —
			// for WebApp matches there is no binary to spawn so we still need
			// SOMETHING to register with attachApp. The fallback is the current
			// MCP child's pid (process.pid) — a documented sentinel that
			// computer_kill_display's SIGTERM loop will gracefully no-op on
			// because parseDisplayNumber + the manager's processKillFn swallow
			// ESRCH for vanished pids. This keeps the running_apps list
			// observable in computer_list_displays for UAT clarity.
			let pid = process.pid
			let matched: 'webapp' | 'native' | null = null
			if (options.livosAppResolver) {
				try {
					const match = await options.livosAppResolver(app)
					if (match) {
						matched = match.kind
						process.stderr.write(
							`[luse-mcp] open_livos_app kind=${match.kind} appId=${match.appId} route=${match.route} display=${displayArg ?? '(default)'}\n`,
						)
					}
				} catch (err) {
					process.stderr.write(
						`[luse-mcp] livosAppResolver error in launch_app_in_display: ${(err as Error).message}; falling through to APP_MAP\n`,
					)
				}
			}

			// If no LivOS match, spawn the binary directly with the current
			// (already-scoped) DISPLAY env so the window opens on the nested X.
			// Detached so it survives this handler's return; unref'd so node
			// doesn't keep the child as a parent dep.
			if (matched === null) {
				// Phase 250-hotfix — resolve common symbolic app names to their
				// actual binaries, mirroring APP_MAP in native/window.ts. Without
				// this, an agent calling launch_app_in_display({app:'terminal'})
				// (the natural name, same as computer_application accepts) would
				// spawn a non-existent binary "terminal". Unknown names pass through
				// unchanged so explicit binaries still work.
				// Phase 250-hotfix — `terminal` maps to xterm (NOT gnome-terminal)
				// for launch_app_in_display specifically: this tool targets nested
				// Xephyr displays which have NO window manager and NO session dbus,
				// where gnome-terminal (dbus-activated, single-instance-per-bus)
				// will not render. xterm maps its own window standalone, so it is
				// the reliable terminal for an isolated agent display. (The host
				// :1 path via computer_application still uses gnome-terminal through
				// native/window.ts APP_MAP — that surface has fluxbox + dbus.)
				const APP_ALIASES: Record<string, string> = {
					terminal: 'xterm',
					'gnome-terminal': 'gnome-terminal',
					firefox: 'firefox',
					vscode: 'code',
					directory: 'nautilus',
					files: 'nautilus',
				}
				const bin = APP_ALIASES[app] ?? app
				try {
					const child = spawn(bin, extraArgs, {
						env: process.env,
						detached: true,
						stdio: 'ignore',
					})
					// Phase 250-hotfix — CRITICAL: attach an 'error' listener.
					// A missing/failed binary makes spawn emit an ASYNC 'error'
					// event (e.g. ENOENT) on the ChildProcess. With no listener,
					// Node re-throws it as an uncaught exception, which crashes
					// this entire MCP server process and closes the stdio JSON-RPC
					// transport — the client sees "Connection closed" (the spawn's
					// synchronous try/catch never catches it because it fires on a
					// later tick, AFTER attachApp + the response). Swallowing it to
					// stderr makes a bad app name fail this ONE call gracefully
					// instead of killing luse.
					child.on('error', (err) => {
						process.stderr.write(
							`[luse-mcp] launch_app_in_display: spawn error for "${bin}" on ${display}: ${(err as Error).message}\n`,
						)
					})
					child.unref()
					if (typeof child.pid === 'number') {
						pid = child.pid
					}
				} catch (err) {
					return {
						content: [
							{
								type: 'text',
								text: `Error: failed to spawn app "${app}" (resolved "${bin}"): ${(err as Error).message}`,
							},
						],
						isError: true,
					}
				}
			}

			// Register the spawn (or sentinel pid for WebApp matches) with the
			// display so computer_list_displays.running_apps reflects it and
			// computer_kill_display can SIGTERM it on cleanup.
			await options.displayManager!.attachApp({
				display,
				pid,
				app_name: app,
			})

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({pid, app_name: app, display, kind: matched ?? 'binary'}),
					},
				],
				isError: false,
			}
		})
	},
	}
}

/**
 * Legacy host-display HANDLERS — backed by `buildHandlers({})` so existing
 * imports from this module keep working. Per-WebApp instances should use
 * `buildHandlers({defaultWindowId})` instead and pass the resulting map
 * into `registerLuseTools(server, opts)`.
 */
export const HANDLERS: Record<string, Handler> = buildHandlers({})

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all LUSE_TOOLS handlers on the given MCP server. Loops the
 * LUSE_TOOLS array and dispatches by name to the HANDLERS map. Each
 * handler is wrapped in a try/catch that converts thrown errors into
 * `{ isError: true, content: [{ type:'text', text:'Error: ...' }] }`.
 */
/**
 * Convert a JSON-Schema node (Anthropic / OpenAPI subset) to a Zod type.
 * Handles the shapes Luse uses: object, string, number, boolean, array,
 * enum strings, nested objects. Unknown shapes fall back to `z.any()`.
 *
 * P79-02 (2026-05-05): MCP SDK 1.25.x's registerTool calls
 * `inputSchema.safeParseAsync()` at runtime — passing a plain JSON-Schema
 * object throws `v3Schema.safeParseAsync is not a function`. The SDK
 * expects either a Zod shape (record of ZodTypeAny) OR an AnySchema with
 * Zod-style methods. We convert at registration time so the Luse tool
 * schemas (verbatim JSON Schema from upstream) keep their authoring
 * format while the SDK gets what it needs.
 */
function jsonSchemaPropertyToZod(node: unknown): ZodTypeAny {
	if (!node || typeof node !== 'object') return z.any()
	const schema = node as {type?: string; enum?: unknown[]; items?: unknown; properties?: Record<string, unknown>; required?: string[]; description?: string}
	const t = schema.type
	if (t === 'string') {
		if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.every((v) => typeof v === 'string')) {
			return z.enum(schema.enum as [string, ...string[]])
		}
		return z.string()
	}
	if (t === 'integer' || t === 'number') return z.number()
	if (t === 'boolean') return z.boolean()
	if (t === 'array') return z.array(jsonSchemaPropertyToZod(schema.items ?? {}))
	if (t === 'object') {
		const shape: Record<string, ZodTypeAny> = {}
		const props = schema.properties ?? {}
		const required = new Set(schema.required ?? [])
		for (const [k, v] of Object.entries(props)) {
			const propZod = jsonSchemaPropertyToZod(v)
			shape[k] = required.has(k) ? propZod : propZod.optional()
		}
		return z.object(shape)
	}
	return z.any()
}

/** Convert top-level JSON-Schema object to a ZodRawShape (record of ZodTypeAny).
 *  This is what MCP SDK's registerTool({ inputSchema }) expects. */
function jsonSchemaToZodRawShape(rootSchema: {type: 'object'; properties: Record<string, unknown>; required?: string[]}): Record<string, ZodTypeAny> {
	const shape: Record<string, ZodTypeAny> = {}
	const required = new Set(rootSchema.required ?? [])
	for (const [k, v] of Object.entries(rootSchema.properties ?? {})) {
		const propZod = jsonSchemaPropertyToZod(v)
		shape[k] = required.has(k) ? propZod : propZod.optional()
	}
	return shape
}

/**
 * P100-10-03 + P100-10-04 — these tools are registered on the server with
 * the explicit `mcp__luse__*` prefix (NOT through the standard
 * tool.name registration loop) so the agent calls them by their
 * fully-qualified host-side dispatcher name. Their schemas live in
 * LUSE_TOOLS for the agent's tools[] enumeration, but we skip them in
 * the standard loop to avoid double-registration.
 */
const LUSE_WINDOW_TOOL_NAMES = new Set<string>([
	// P100-10-03
	'list_windows',
	'screenshot_window',
	'focus_window',
	// P100-10-04 — stream-management
	'create_stream',
	'list_streams',
])

export function registerLuseTools(server: McpServerLike, options?: LuseToolsOptions): void {
	// Phase 250-hotfix — Phase 248-02 added `displayManager` + `redis` +
	// `livosAppResolver` to LuseToolsOptions and the buildHandlers() closures,
	// but FORGOT to extend this gate. So whenever LUSE_TARGET_WINDOW_ID was
	// unset (the normal aioncore/host-display case — it was deprecated in
	// 102-06) AND skillReplayDeps was absent, registerLuseTools fell back to the
	// module-level HANDLERS, which is buildHandlers() built with EMPTY options.
	// That left options.displayManager undefined inside every handler, so
	// computer_create_display / computer_list_displays / etc. ALWAYS returned
	// "displayManager not wired" even when main() had constructed + passed a
	// live displayManager (boot log said wired; the handler map never saw it).
	// Fix: build fresh handlers whenever ANY handler-relevant option is present,
	// not just the two original ones.
	const handlers =
		options?.defaultWindowId !== undefined ||
		options?.skillReplayDeps !== undefined ||
		options?.displayManager !== undefined ||
		options?.redis !== undefined ||
		options?.livosAppResolver !== undefined ||
		options?.defaultDisplay !== undefined ||
		options?.streamManager !== undefined
			? buildHandlers(options)
			: HANDLERS
	// Phase 97-07: only register Auto-mode-only tools when skillReplayDeps
	// is wired (i.e. this is a per-WebApp instance spawned by Auto mode).
	const allTools =
		options?.skillReplayDeps !== undefined
			? [...LUSE_TOOLS, ...LUSE_AUTO_MODE_EXTRA_TOOLS]
			: LUSE_TOOLS
	for (const tool of allTools) {
		// P100-10-03 — the window-aware tools are registered separately
		// under `mcp__luse__*` prefixed names; skip them here.
		if (LUSE_WINDOW_TOOL_NAMES.has(tool.name)) continue
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				// P79-02 fix: convert JSON-Schema (Anthropic / Luse upstream
				// authoring format) to ZodRawShape since MCP SDK 1.25.x calls
				// `safeParseAsync` on this object at tool dispatch time.
				inputSchema: jsonSchemaToZodRawShape(tool.input_schema),
			},
			async (args: Record<string, unknown>) => {
				const handler = handlers[tool.name]
				if (!handler) {
					return {
						content: [{type: 'text', text: `Error: no handler registered for tool "${tool.name}"`}],
						isError: true,
					}
				}
				try {
					return await handler(args ?? {})
				} catch (err) {
					return {
						content: [
							{
								type: 'text',
								text: `Error: ${(err as Error).message}`,
							},
						],
						isError: true,
					}
				}
			},
		)
	}

	// ── P100-10-03 — window-aware tool registrations (D-100-10-C) ─────────────
	registerLuseWindowTools(server, options)

	// ── P100-10-04 — stream-management tool registrations (D-100-10-C, G-100-10-E) ──
	registerLuseStreamTools(server, options)
}

/**
 * P100-10-03 — Register the three window-aware tools
 * (`mcp__luse__list_windows`, `mcp__luse__screenshot_window`,
 * `mcp__luse__focus_window`) under their fully-qualified prefixed
 * names. Defaults to `options.defaultDisplay` (typically LUSE_DISPLAY)
 * when the tool input does not specify a display.
 */
function registerLuseWindowTools(server: McpServerLike, options?: LuseToolsOptions): void {
	const defaultDisplay =
		options?.defaultDisplay ?? process.env.LUSE_DISPLAY ?? process.env.DISPLAY

	const listWindowsTool = LUSE_TOOLS.find((t) => t.name === 'list_windows')!
	const screenshotWindowTool = LUSE_TOOLS.find((t) => t.name === 'screenshot_window')!
	const focusWindowTool = LUSE_TOOLS.find((t) => t.name === 'focus_window')!

	const wrapHandler = (
		fn: (args: Record<string, unknown>) => Promise<LivCallToolResult>,
	) => async (args: Record<string, unknown>) => {
		try {
			return await fn(args ?? {})
		} catch (err) {
			return {
				content: [{type: 'text', text: `Error: ${(err as Error).message}`}],
				isError: true,
			}
		}
	}

	// list_windows — wmctrl-based window enumeration on the caller's
	// display (W4 lock: wmctrl, not xdotool search). Phase 100-10-14:
	// registered as BARE NAME (no `mcp__luse__` prefix in registerTool
	// call) so UI displays it consistently with the other Luse tools
	// (computer_*, set_task_status, etc.). MCP runtime is responsible
	// for any server-prefix display, not the server itself.
	//
	// Phase 103-B: regex-guard the display arg through parseDisplayArg
	// before threading into both the native listWindows({display}) call
	// AND the process.env.DISPLAY scope (so the native primitive sees
	// the same value transitively in case it spawns wmctrl/xdotool).
	server.registerTool(
		'list_windows',
		{
			description: listWindowsTool.description,
			inputSchema: jsonSchemaToZodRawShape(listWindowsTool.input_schema),
		},
		wrapHandler(async (args) => {
			const displayArg = parseDisplayArg(args)

			// Phase 103.1-4 — aggregate whenever the call-time display arg is
			// absent. defaultDisplay (LUSE_TARGET_DISPLAY env, typically `:1`
			// for the host LivOS canvas) is NOT a gate: list_windows-without-arg
			// is the "what's open right now?" roster query, and the right answer
			// is ALL windows tagged with their owning display. The agent then
			// dispatches follow-up click / type / focus with the correct
			// display: ":N" arg per result row.
			//
			// Per-WebApp Luse MCP (opt-in via LIVOS_PER_APP_LUSE=1) still works
			// because its agent prompt prescribes display:":N" on every call —
			// displayArg IS set and aggregation is skipped naturally.
			//
			// Without this fix, the 103-05 default-off global luse MCP scoped
			// list_windows to its defaultDisplay (=":1", host LivOS Xvfb) and
			// missed Dinkytown WebApp on its per-app Xvfb (`:11`/`:12`) — the
			// exact 2026-05-11 UAT regression the user surfaced.
			const rawDisplayInput =
				typeof args.display === 'string' ? args.display : undefined
			const aggregateMode =
				displayArg === undefined && rawDisplayInput === undefined
			if (aggregateMode) {
				const activeDisplays = await discoverActiveX11Displays()
				if (activeDisplays.length === 0) {
					// No active displays found — fall through to default-scope
					// path (returns empty array via listWindows({})).
					const windows = await listWindows({})
					return {
						content: [{type: 'text', text: JSON.stringify(windows)}],
						isError: false,
					}
				}
				const aggregated: Array<unknown> = []
				for (const d of activeDisplays) {
					try {
						// Per-display scan. Each call mutates process.env.DISPLAY
						// for its own duration via withScopedDisplay so a wmctrl
						// spawn (if listWindows uses one) sees the right value.
						// The MCP child serializes tool calls so we don't race
						// other handlers on the env var (per withScopedDisplay
						// docs).
						// eslint-disable-next-line no-await-in-loop
						const windows = await withScopedDisplay(d, undefined, () =>
							listWindows({display: d}),
						)
						for (const w of windows) aggregated.push(w)
					} catch {
						// Display gone away mid-scan (Xvfb exited between
						// readdir and wmctrl spawn) — skip silently.
					}
				}
				return {
					content: [{type: 'text', text: JSON.stringify(aggregated)}],
					isError: false,
				}
			}

			// Single-display path (pre-103.1 behavior preserved). If the arg
			// failed regex validation but was a non-empty string, fall back
			// to defaultDisplay (per spec). If validation passed, use the
			// validated string.
			const resolvedDisplay = displayArg ?? defaultDisplay
			return withScopedDisplay(displayArg, defaultDisplay, async () => {
				const windows = resolvedDisplay !== undefined
					? await listWindows({display: resolvedDisplay})
					: await listWindows({})
				return {
					content: [{type: 'text', text: JSON.stringify(windows)}],
					isError: false,
				}
			})
		}),
	)

	// screenshot_window — accepts `{wid}` for window-bound
	// capture OR `{display}` for whole-display capture. Falls back to
	// the bound default display when neither is provided (matches the
	// "default to caller scope" pattern used by list_windows).
	server.registerTool(
		'screenshot_window',
		{
			description: screenshotWindowTool.description,
			inputSchema: jsonSchemaToZodRawShape(screenshotWindowTool.input_schema),
		},
		wrapHandler(async (args) => {
			// R3 (208-01): accept {id, window_id, wid} interchangeably.
			const widRaw = args.wid ?? args.window_id ?? args.id
			if (typeof widRaw === 'number' && Number.isFinite(widRaw)) {
				// Window-bound capture. captureScreenshot's signature is
				// `{windowId}` (P97-01 naming); we accept the `wid` alias
				// at the MCP boundary and translate here.
				const shot = await captureScreenshot({windowId: widRaw})
				return {
					content: [
						{type: 'image', data: shot.base64, mimeType: shot.mimeType},
						{
							type: 'text',
							text: `screenshot_window wid=0x${widRaw.toString(16)} (${shot.width}x${shot.height})`,
						},
					],
					isError: false,
				}
			}
			const displayArg =
				typeof args.display === 'string' && args.display.length > 0
					? args.display
					: undefined
			if (displayArg === undefined && defaultDisplay === undefined) {
				return {
					content: [
						{type: 'text', text: 'Error: must provide wid or display'},
					],
					isError: true,
				}
			}
			// Whole-display capture. captureScreenshot reads DISPLAY from
			// process.env transitively via maim/scrot subprocess inheritance
			// — when running inside the per-WebApp Luse MCP child, that env
			// is already correct. For explicit cross-display capture (display
			// arg differs from process.env.DISPLAY), we override here.
			const targetDisplay = displayArg ?? defaultDisplay!
			const prevDisplay = process.env.DISPLAY
			try {
				process.env.DISPLAY = targetDisplay
				const shot = await captureScreenshot()
				return {
					content: [
						{type: 'image', data: shot.base64, mimeType: shot.mimeType},
						{
							type: 'text',
							text: `screenshot_window display=${targetDisplay} (${shot.width}x${shot.height})`,
						},
					],
					isError: false,
				}
			} finally {
				if (prevDisplay === undefined) delete process.env.DISPLAY
				else process.env.DISPLAY = prevDisplay
			}
		}),
	)

	// focus_window — xdotool windowactivate --sync <wid>.
	// Honors the per-WebApp display via the spawn env override so xdotool
	// queries the correct X server.
	server.registerTool(
		'focus_window',
		{
			description: focusWindowTool.description,
			inputSchema: jsonSchemaToZodRawShape(focusWindowTool.input_schema),
		},
		wrapHandler(async (args) => {
			// R3 (208-01): accept {id, window_id, wid} interchangeably.
			const widRaw = args.wid ?? args.window_id ?? args.id
			if (typeof widRaw !== 'number' || !Number.isFinite(widRaw)) {
				return {
					content: [{type: 'text', text: 'Error: wid is required and must be a positive integer'}],
					isError: true,
				}
			}
			const widHex = '0x' + Math.trunc(widRaw).toString(16)
			const display = defaultDisplay ?? ':0'
			await spawnAndAwait(
				'xdotool',
				['windowactivate', '--sync', widHex],
				{...process.env, DISPLAY: display},
			)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ok: true, wid: Math.trunc(widRaw), widHex, display}),
					},
				],
				isError: false,
			}
		}),
	)
}

/**
 * P100-10-04 — Register the two stream-management tools
 * (`mcp__luse__create_stream`, `mcp__luse__list_streams`) under their
 * fully-qualified prefixed names (D-100-10-C).
 *
 * Both tools require `options.streamManager`. `create_stream` additionally
 * gates on a Redis flag (G-100-10-E `liv:config:luse_can_create_streams`)
 * — when the flag is unset / not exactly the string `"true"` / Redis
 * rejects, the handler returns `isError:true` (fail-closed). If
 * `streamManager` is undefined, NEITHER tool is registered (matches the
 * `skillReplayDeps` opt-in pattern from P97-07).
 *
 * `list_streams` is read-only and user-scoped via the existing
 * `streamManager.listStreams({userId})` filter — no privilege gate.
 */
function registerLuseStreamTools(
	server: McpServerLike,
	options?: LuseToolsOptions,
): void {
	const sm = options?.streamManager
	if (!sm) {
		// Opt-in registration. Tools are visible in LUSE_TOOLS schema but the
		// host-side handlers are not wired — matches skillReplayDeps pattern.
		return
	}
	const userId = options?.userId ?? 'admin'
	const redis = options?.redis ?? null

	const createStreamTool = LUSE_TOOLS.find((t) => t.name === 'create_stream')!
	const listStreamsTool = LUSE_TOOLS.find((t) => t.name === 'list_streams')!

	const wrapHandler = (
		fn: (args: Record<string, unknown>) => Promise<LivCallToolResult>,
	) => async (args: Record<string, unknown>) => {
		try {
			return await fn(args ?? {})
		} catch (err) {
			return {
				content: [{type: 'text', text: `Error: ${(err as Error).message}`}],
				isError: true,
			}
		}
	}

	// create_stream — privilege-gated stream spawn.
	server.registerTool(
		'create_stream',
		{
			description: createStreamTool.description,
			inputSchema: jsonSchemaToZodRawShape(createStreamTool.input_schema),
		},
		wrapHandler(async (args) => {
			// G-100-10-E privilege gate — fail-closed by default. Redis client
			// is the FRESH ioredis instance constructed by mcp/server.ts from
			// process.env.LUSE_REDIS_URL (NOT shared with the parent livinityd).
			let canCreate = false
			if (redis) {
				try {
					canCreate = (await redis.get('liv:config:luse_can_create_streams')) === 'true'
				} catch {
					canCreate = false // Redis unavailable → deny.
				}
			}
			if (!canCreate) {
				return {
					content: [
						{
							type: 'text',
							text: 'Error: luse_can_create_streams disabled (set Redis liv:config:luse_can_create_streams=true to enable)',
						},
					],
					isError: true,
				}
			}
			const display = args.display as string | undefined
			if (typeof display !== 'string' || display.length === 0) {
				return {
					content: [{type: 'text', text: 'Error: display is required and must be a non-empty string'}],
					isError: true,
				}
			}
			const result = sm.startStream({
				mode: 'vnc-window',
				target: {display},
				userId,
			})
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							streamId: result.streamId,
							wsUrl: result.wsUrl,
						}),
					},
				],
				isError: false,
			}
		}),
	)

	// list_streams — read-only, user-scoped.
	server.registerTool(
		'list_streams',
		{
			description: listStreamsTool.description,
			inputSchema: jsonSchemaToZodRawShape(listStreamsTool.input_schema),
		},
		wrapHandler(async () => {
			const records = sm.listStreams({userId})
			return {
				content: [{type: 'text', text: JSON.stringify(records)}],
				isError: false,
			}
		}),
	)
}

/**
 * P100-10-03 — spawn a short-lived process, await its `close` event, and
 * reject on non-zero exit. Used by `mcp__luse__focus_window` so xdotool's
 * `--sync` semantics propagate up (caller awaits focus completion).
 */
function spawnAndAwait(
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let stderr = ''
		const child = spawn(command, args, {
			env,
			stdio: ['ignore', 'ignore', 'pipe'],
		})
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString()
		})
		child.on('error', (err) => reject(err))
		child.on('close', (code) => {
			if (code === 0) resolve()
			else reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`))
		})
	})
}
