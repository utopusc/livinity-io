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

import {BYTEBOT_TOOLS} from '../bytebot-tools.js'
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
 * Wrap a state-changing native action in: run → 750ms settle → screenshot.
 * Returns a CallToolResult with [text summary, post-action image].
 */
async function withPostScreenshot(
	actionSummary: string,
	fn: () => Promise<void>,
): Promise<LivCallToolResult> {
	await fn()
	await sleep(POST_ACTION_SETTLE_MS)
	const shot = await captureScreenshot()
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

export const HANDLERS: Record<string, Handler> = {
	// ── Mouse primitives ──────────────────────────────────────────────────────

	computer_screenshot: async () => {
		const shot = await captureScreenshot()
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
		return withPostScreenshot(
			`moveMouse → (${coordinates.x}, ${coordinates.y})`,
			() => moveMouse(coordinates),
		)
	},

	computer_trace_mouse: async (args) => {
		const path = args.path as ReadonlyArray<{x: number; y: number}>
		const holdKeys = args.holdKeys as ReadonlyArray<string> | undefined
		return withPostScreenshot(
			`traceMouse path of ${path.length} points`,
			() => traceMouse(path, holdKeys ?? undefined),
		)
	},

	computer_click_mouse: async (args) => {
		return withPostScreenshot(
			`clickMouse ${summarizeArgs(args)}`,
			() =>
				clickMouse(
					args as unknown as {
						coordinates?: {x: number; y: number}
						button: 'left' | 'right' | 'middle'
						clickCount: number
						holdKeys?: readonly string[]
					},
				),
		)
	},

	computer_press_mouse: async (args) => {
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
		)
	},

	computer_drag_mouse: async (args) => {
		const path = args.path as ReadonlyArray<{x: number; y: number}>
		const button = args.button as 'left' | 'right' | 'middle'
		const holdKeys = args.holdKeys as ReadonlyArray<string> | undefined
		return withPostScreenshot(
			`dragMouse ${button} along ${path.length} points`,
			() => dragMouse(path, button, holdKeys ?? undefined),
		)
	},

	computer_scroll: async (args) => {
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
		)
	},

	// ── Keyboard primitives ──────────────────────────────────────────────────

	computer_type_keys: async (args) => {
		const keys = args.keys as ReadonlyArray<string>
		const delay = args.delay as number | undefined
		return withPostScreenshot(
			`typeKeys [${keys.join('+')}]`,
			() => typeKeys(keys, delay ?? undefined),
		)
	},

	computer_press_keys: async (args) => {
		const keys = args.keys as ReadonlyArray<string>
		const press = args.press as 'up' | 'down'
		return withPostScreenshot(
			`pressKeys [${keys.join(', ')}] ${press}`,
			() => pressKeys(keys, press),
		)
	},

	computer_type_text: async (args) => {
		const text = args.text as string
		const delay = args.delay as number | undefined
		const isSensitive = args.isSensitive as boolean | undefined
		const safeText = isSensitive ? `<${text.length} sensitive chars>` : text
		return withPostScreenshot(
			`typeText ${JSON.stringify(safeText)}`,
			() => typeText(text, delay ?? undefined, isSensitive ?? undefined),
		)
	},

	computer_paste_text: async (args) => {
		const text = args.text as string
		const isSensitive = args.isSensitive as boolean | undefined
		const safeText = isSensitive ? `<${text.length} sensitive chars>` : text
		return withPostScreenshot(
			`pasteText ${JSON.stringify(safeText)}`,
			() => pasteText(text, isSensitive ?? undefined),
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all BYTEBOT_TOOLS handlers on the given MCP server. Loops the
 * BYTEBOT_TOOLS array and dispatches by name to the HANDLERS map. Each
 * handler is wrapped in a try/catch that converts thrown errors into
 * `{ isError: true, content: [{ type:'text', text:'Error: ...' }] }`.
 */
export function registerBytebotTools(server: McpServerLike): void {
	for (const tool of BYTEBOT_TOOLS) {
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				// MCP SDK accepts either a Zod shape or a JSON-Schema object;
				// BYTEBOT_TOOLS use Anthropic's JSON-Schema form, pass through.
				inputSchema: tool.input_schema,
			},
			async (args: Record<string, unknown>) => {
				const handler = HANDLERS[tool.name]
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
