/**
 * Bytebot MCP tool handlers — dispatch each Bytebot tool call to the
 * matching native primitive function (72-native-01..03).
 *
 * Apache 2.0 attribution
 * ─────────────────────────
 * The 17 tool schemas this module dispatches over (BYTEBOT_TOOLS) are a
 * verbatim copy of upstream Bytebot agent.tools.ts (Apache 2.0):
 *   https://github.com/bytebot-ai/bytebot
 *   File: packages/bytebot-agent/src/agent/agent.tools.ts
 *   Snapshot date: 2026-05-04 (via Plan 72-01).
 *
 * The action-dispatch strategy (post-action 750ms settle + screenshot, etc.)
 * is also derived from Bytebot's bytebotd:
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
 *   D-NATIVE-10 — MCP server name is `bytebot` (matched by `mcp_bytebot_*`
 *                 categorize patch in liv-agent-runner.ts).
 *
 * Strategy: handler-map (NOT giant switch). Each tool name maps to an async
 * Handler that returns a `LivCallToolResult` with optional `_liv_meta`.
 * Handlers are wrapped at registration time in a try/catch that converts
 * thrown errors into `{ isError: true, content: [{ type:'text', text:'Error: ...' }] }`
 * — the MCP protocol expects an `isError` flag, not exceptions.
 */
import {setTimeout as sleep} from 'node:timers/promises'

import {z, type ZodTypeAny} from 'zod'

import {BYTEBOT_TOOLS, BYTEBOT_AUTO_MODE_EXTRA_TOOLS} from '../bytebot-tools.js'
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
import {executeWebAppReplaySkill} from '../skill-replay-tool.js'

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

/** Subset of McpServer surface registerBytebotTools touches. Avoids a hard
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

/** Settle delay between an action and its post-action screenshot (D-NATIVE-05). */
const POST_ACTION_SETTLE_MS = 750

/**
 * Phase 97-05 — runtime options for the bytebot MCP tool dispatcher.
 *
 * `defaultWindowId` is the env-derived (BYTEBOT_TARGET_WINDOW_ID) X11 window
 * id every native primitive call defaults to when the per-tool input does
 * not explicitly override it. When undefined, host-display behavior is
 * preserved (the existing pre-P97 single-instance default).
 *
 * Phase 97-07 — `skillReplayDeps` carries the DB pool + authenticated userId
 * needed by the `webapp_replay_skill` tool. When provided, the tool is
 * registered alongside the standard BYTEBOT_TOOLS. When omitted, the tool
 * is not registered — the caller (mcp/server.ts) only sets it on per-WebApp
 * instances spawned by the Auto-mode start path.
 */
export interface BytebotToolsOptions {
	defaultWindowId?: number
	skillReplayDeps?: {
		pool: import('pg').Pool
		userId: string
	}
	/**
	 * Phase 100-07.4 — runtime fallback resolver. When neither args.windowId
	 * nor defaultWindowId is set, tools call this to ask "is there an active
	 * WebApp window I should target?" Used by the host-display bytebot to
	 * auto-scope to a single live WebApp without requiring a per-WebApp
	 * MCP instance. Returns undefined for true host-display intent (no
	 * active WebApps, OR multiple — caller should be explicit).
	 */
	activeWebappWidResolver?: () => number | undefined
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
	// on spawn (and clears/rewrites on close). The bytebot MCP child process
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
// HANDLERS — handler map for all 17 BYTEBOT_TOOLS (D-NATIVE-04)
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
export function buildHandlers(options: BytebotToolsOptions = {}): Record<string, Handler> {
	const defaultWindowId = options.defaultWindowId
	const widResolver = options.activeWebappWidResolver
	const wid = (args: Record<string, unknown>): number | undefined =>
		resolveWindowId(args, defaultWindowId, widResolver)
	return {
	// ── Mouse primitives ──────────────────────────────────────────────────────

	computer_screenshot: async (args) => {
		const w = wid(args)
		const shot = await captureScreenshot(typeof w === 'number' ? {windowId: w} : undefined)
		return {
			content: [
				{type: 'image', data: shot.base64, mimeType: shot.mimeType},
				{type: 'text', text: `Screenshot captured (${shot.width}x${shot.height})`},
			],
			isError: false,
		}
	},

	computer_move_mouse: async (args) => {
		const coordinates = args.coordinates as {x: number; y: number}
		const w = wid(args)
		return withPostScreenshot(
			`moveMouse → (${coordinates.x}, ${coordinates.y})`,
			() => moveMouse(coordinates, w),
			w,
		)
	},

	computer_trace_mouse: async (args) => {
		const path = args.path as ReadonlyArray<{x: number; y: number}>
		const holdKeys = args.holdKeys as ReadonlyArray<string> | undefined
		const w = wid(args)
		return withPostScreenshot(
			`traceMouse path of ${path.length} points`,
			() => traceMouse(path, holdKeys ?? undefined),
			w,
		)
	},

	computer_click_mouse: async (args) => {
		const w = wid(args)
		return withPostScreenshot(
			`clickMouse ${summarizeArgs(args)}`,
			() =>
				clickMouse({
					...(args as unknown as {
						coordinates?: {x: number; y: number}
						button: 'left' | 'right' | 'middle'
						clickCount: number
						holdKeys?: readonly string[]
					}),
					windowId: w,
				}),
			w,
		)
	},

	computer_press_mouse: async (args) => {
		const w = wid(args)
		return withPostScreenshot(
			`pressMouse ${summarizeArgs(args)}`,
			() =>
				pressMouse(
					args as unknown as {
						coordinates?: {x: number; y: number}
						button: 'left' | 'right' | 'middle'
						press: 'up' | 'down'
					},
				),
			w,
		)
	},

	computer_drag_mouse: async (args) => {
		const path = args.path as ReadonlyArray<{x: number; y: number}>
		const button = args.button as 'left' | 'right' | 'middle'
		const holdKeys = args.holdKeys as ReadonlyArray<string> | undefined
		const w = wid(args)
		return withPostScreenshot(
			`dragMouse ${button} along ${path.length} points`,
			() => dragMouse(path, button, holdKeys ?? undefined),
			w,
		)
	},

	computer_scroll: async (args) => {
		const w = wid(args)
		return withPostScreenshot(
			`scroll ${summarizeArgs(args)}`,
			() =>
				scroll(
					args as unknown as {
						coordinates: {x: number; y: number}
						direction: 'up' | 'down' | 'left' | 'right'
						scrollCount: number
						holdKeys?: readonly string[]
					},
				),
			w,
		)
	},

	// ── Keyboard primitives ──────────────────────────────────────────────────

	computer_type_keys: async (args) => {
		const keys = args.keys as ReadonlyArray<string>
		const delay = args.delay as number | undefined
		const w = wid(args)
		return withPostScreenshot(
			`typeKeys [${keys.join('+')}]`,
			() => typeKeys(keys, delay ?? undefined, w),
			w,
		)
	},

	computer_press_keys: async (args) => {
		const keys = args.keys as ReadonlyArray<string>
		const press = args.press as 'up' | 'down'
		const w = wid(args)
		return withPostScreenshot(
			`pressKeys [${keys.join(', ')}] ${press}`,
			() => pressKeys(keys, press, w),
			w,
		)
	},

	computer_type_text: async (args) => {
		const text = args.text as string
		const delay = args.delay as number | undefined
		const isSensitive = args.isSensitive as boolean | undefined
		const safeText = isSensitive ? `<${text.length} sensitive chars>` : text
		const w = wid(args)
		return withPostScreenshot(
			`typeText ${JSON.stringify(safeText)}`,
			() => typeText(text, delay ?? undefined, isSensitive ?? undefined, w),
			w,
		)
	},

	computer_paste_text: async (args) => {
		const text = args.text as string
		const isSensitive = args.isSensitive as boolean | undefined
		const safeText = isSensitive ? `<${text.length} sensitive chars>` : text
		const w = wid(args)
		return withPostScreenshot(
			`pasteText ${JSON.stringify(safeText)}`,
			() => pasteText(text, isSensitive ?? undefined),
			w,
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

	computer_cursor_position: async () => {
		// Read-only action — no state change, no post-action screenshot.
		const pos = await getCursorPosition()
		return {
			content: [{type: 'text', text: `Cursor at (${pos.x}, ${pos.y})`}],
			isError: false,
		}
	},

	computer_application: async (args) => {
		const application = args.application as string
		const result = await openOrFocus(application as never)
		if (result.isError) {
			return {
				content: [{type: 'text', text: result.message ?? 'application launch failed'}],
				isError: true,
			}
		}
		return withPostScreenshot(
			`application → ${application}`,
			async () => {
				// The action already happened inside openOrFocus; we just settle + shot.
			},
		)
	},

	// ── File read ────────────────────────────────────────────────────────────

	computer_read_file: async (args) => {
		const filePath = args.path as string
		const file = await readFileBase64(filePath)
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
					tool: 'mcp_bytebot_set_task_status',
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

	webapp_replay_skill: async (args) => {
		if (!options.skillReplayDeps) {
			return {
				content: [
					{
						type: 'text',
						text:
							'Error: webapp_replay_skill is only available on per-WebApp ' +
							'bytebot MCP instances (Auto mode). The current MCP server has ' +
							'no skill-replay dependencies wired.',
					},
				],
				isError: true,
			}
		}
		return executeWebAppReplaySkill(options.skillReplayDeps, {
			skillId: args.skillId as string,
			freeFormGoal: args.freeFormGoal as string | undefined,
		}) as Promise<LivCallToolResult>
	},
	}
}

/**
 * Legacy host-display HANDLERS — backed by `buildHandlers({})` so existing
 * imports from this module keep working. Per-WebApp instances should use
 * `buildHandlers({defaultWindowId})` instead and pass the resulting map
 * into `registerBytebotTools(server, opts)`.
 */
export const HANDLERS: Record<string, Handler> = buildHandlers({})

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all BYTEBOT_TOOLS handlers on the given MCP server. Loops the
 * BYTEBOT_TOOLS array and dispatches by name to the HANDLERS map. Each
 * handler is wrapped in a try/catch that converts thrown errors into
 * `{ isError: true, content: [{ type:'text', text:'Error: ...' }] }`.
 */
/**
 * Convert a JSON-Schema node (Anthropic / OpenAPI subset) to a Zod type.
 * Handles the shapes Bytebot uses: object, string, number, boolean, array,
 * enum strings, nested objects. Unknown shapes fall back to `z.any()`.
 *
 * P79-02 (2026-05-05): MCP SDK 1.25.x's registerTool calls
 * `inputSchema.safeParseAsync()` at runtime — passing a plain JSON-Schema
 * object throws `v3Schema.safeParseAsync is not a function`. The SDK
 * expects either a Zod shape (record of ZodTypeAny) OR an AnySchema with
 * Zod-style methods. We convert at registration time so the bytebot tool
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

export function registerBytebotTools(server: McpServerLike, options?: BytebotToolsOptions): void {
	const handlers =
		options?.defaultWindowId !== undefined || options?.skillReplayDeps !== undefined
			? buildHandlers(options)
			: HANDLERS
	// Phase 97-07: only register Auto-mode-only tools when skillReplayDeps
	// is wired (i.e. this is a per-WebApp instance spawned by Auto mode).
	const allTools =
		options?.skillReplayDeps !== undefined
			? [...BYTEBOT_TOOLS, ...BYTEBOT_AUTO_MODE_EXTRA_TOOLS]
			: BYTEBOT_TOOLS
	for (const tool of allTools) {
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				// P79-02 fix: convert JSON-Schema (Anthropic / Bytebot upstream
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
}
