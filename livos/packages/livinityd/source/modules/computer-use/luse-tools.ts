/**
 * Luse Computer-Use Tool Schemas (renamed P100-10-02 from Bytebot per
 * D-100-10-B; legacy LivOS layer name was "Bytebot tools".)
 *
 * Copied verbatim from upstream's open-source agent code (Apache 2.0):
 *   Source: https://github.com/bytebot-ai/bytebot
 *   File:   packages/bytebot-agent/src/agent/agent.tools.ts
 *   Snapshot date: 2026-05-04
 *   Fetched via: WebFetch / curl (Plan 72-01)
 *   Fetched URL: https://raw.githubusercontent.com/bytebot-ai/bytebot/main/packages/bytebot-agent/src/agent/agent.tools.ts
 *
 * Verbatim contract: tool name + description + input_schema fields are
 * unmodified from upstream. The only wrapping is TypeScript syntax
 * (`export const`, type annotations, `as const`) that doesn't alter the
 * schema object contents. See `.planning/phases/72-computer-use-agent-loop/72-CONTEXT.md`
 * D-09 + D-11 for the verbatim copy contract.
 *
 * Apache 2.0 NOTICE: full license text mirrored at
 * `.planning/licenses/bytebot-LICENSE.txt` (per Apache 2.0 §4(d) attribution).
 *
 * Upstream tool count at snapshot: 17 tools (separate-tools form, not
 * consolidated `computer_action`). The `_setTaskStatusTool` includes the
 * `needs_help` enum value that the P72 NEEDS_HELP UI flow (Plan 72-05)
 * keys off.
 */

/*
 * Phase 103-B (REQ-103-B1) — LivOS extension on top of the upstream verbatim copy.
 *
 * Every X11-touching tool gains an optional `display: ":N"` property in
 * input_schema. The upstream Bytebot agent.tools.ts does NOT have this
 * field (its tool set assumes a single host X display). The addition is
 * ADDITIVE — `required` is unchanged, so all existing callers continue
 * to work. The handler factory (mcp/tools.ts) regex-guards the value at
 * call time before mutating process.env.DISPLAY.
 */

/**
 * Anthropic / Kimi tool format. Every entry in LUSE_TOOLS conforms to
 * this shape — the format the agent passes through to Anthropic
 * Claude / OpenAI / Kimi via tools[]. See 72-01-PLAN.md `<interfaces>`.
 */
export type AnthropicTool = {
	name: string
	description: string
	input_schema: {
		type: 'object'
		properties: Record<string, unknown>
		required?: string[]
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Common schema definitions for reuse — VERBATIM from upstream lines 1-30
// ─────────────────────────────────────────────────────────────────────────

const coordinateSchema = {
	type: 'object' as const,
	properties: {
		x: {
			type: 'number' as const,
			description:
				'Required JSON key MUST be "x" (NOT "X", "px", "horizontal", or other aliases). Example: {"x":100,"y":200}. ' +
				'The x-coordinate',
		},
		y: {
			type: 'number' as const,
			description:
				'Required JSON key MUST be "y" (NOT "Y", "py", "vertical", or other aliases). Example: {"x":100,"y":200}. ' +
				'The y-coordinate',
		},
	},
	required: ['x', 'y'],
}

const holdKeysSchema = {
	type: 'array' as const,
	items: {type: 'string' as const},
	description: 'Optional array of keys to hold during the action',
	nullable: true,
}

const buttonSchema = {
	type: 'string' as const,
	enum: ['left', 'right', 'middle'],
	description: 'The mouse button',
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions for mouse actions — VERBATIM from upstream lines 32-155
// ─────────────────────────────────────────────────────────────────────────

const _moveMouseTool = {
	name: 'computer_move_mouse',
	description: 'Moves the mouse cursor to the specified coordinates',
	input_schema: {
		type: 'object' as const,
		properties: {
			coordinates: {
				...coordinateSchema,
				description: 'Target coordinates for mouse movement',
			},
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['coordinates'],
	},
}

const _traceMouseTool = {
	name: 'computer_trace_mouse',
	description: 'Moves the mouse cursor along a specified path of coordinates',
	input_schema: {
		type: 'object' as const,
		properties: {
			path: {
				type: 'array' as const,
				items: coordinateSchema,
				description: 'Array of coordinate objects representing the path',
			},
			holdKeys: holdKeysSchema,
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['path'],
	},
}

const _clickMouseTool = {
	name: 'computer_click_mouse',
	description:
		'Performs a mouse click at the specified coordinates or current position',
	input_schema: {
		type: 'object' as const,
		properties: {
			coordinates: {
				...coordinateSchema,
				description:
					'Required JSON key MUST be "coordinates" (NOT "coord", "xy", "position", or other aliases). Example: {"coordinates":{"x":100,"y":200},"button":"left","clickCount":1}. ' +
					'Optional click coordinates (defaults to current position)',
				nullable: true,
			},
			button: buttonSchema,
			holdKeys: holdKeysSchema,
			clickCount: {
				type: 'integer' as const,
				description: 'Number of clicks (default 1; pass 2 for double-click). OPTIONAL.',
				default: 1,
			},
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		// 208-10: clickCount dropped from `required` — LLM consistently omits it
		// and MCP SDK schema validation rejected before the handler default
		// kicked in. button is the only truly necessary field.
		required: ['button'],
	},
}

const _pressMouseTool = {
	name: 'computer_press_mouse',
	description: 'Presses or releases a specified mouse button',
	input_schema: {
		type: 'object' as const,
		properties: {
			coordinates: {
				...coordinateSchema,
				description: 'Optional coordinates (defaults to current position)',
				nullable: true,
			},
			button: buttonSchema,
			press: {
				type: 'string' as const,
				enum: ['up', 'down'],
				description: 'Whether to press down or release up',
			},
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['button', 'press'],
	},
}

const _dragMouseTool = {
	name: 'computer_drag_mouse',
	description: 'Drags the mouse along a path while holding a button',
	input_schema: {
		type: 'object' as const,
		properties: {
			path: {
				type: 'array' as const,
				items: coordinateSchema,
				description:
					'Required JSON key MUST be "path" (NOT "points", "coords", or other aliases). Each path entry MUST use keys "x" and "y" (NOT "coord"). Example: {"path":[{"x":10,"y":20},{"x":100,"y":200}],"button":"left"}. ' +
					'Array of coordinates representing the drag path',
			},
			button: buttonSchema,
			holdKeys: holdKeysSchema,
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['path', 'button'],
	},
}

const _scrollTool = {
	name: 'computer_scroll',
	description: 'Scrolls the mouse wheel in the specified direction',
	input_schema: {
		type: 'object' as const,
		properties: {
			coordinates: {
				...coordinateSchema,
				description: 'Coordinates where the scroll should occur',
			},
			direction: {
				type: 'string' as const,
				enum: ['up', 'down', 'left', 'right'],
				description: 'The direction to scroll',
			},
			scrollCount: {
				type: 'integer' as const,
				description: 'Number of scroll steps',
			},
			holdKeys: holdKeysSchema,
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['coordinates', 'direction', 'scrollCount'],
	},
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions for keyboard actions — VERBATIM from upstream lines 157-248
// ─────────────────────────────────────────────────────────────────────────

const _typeKeysTool = {
	name: 'computer_type_keys',
	description: 'Types a sequence of keys (useful for keyboard shortcuts)',
	input_schema: {
		type: 'object' as const,
		properties: {
			keys: {
				type: 'array' as const,
				items: {type: 'string' as const},
				description: 'Array of key names to type in sequence',
			},
			delay: {
				type: 'number' as const,
				description: 'Optional delay in milliseconds between key presses',
				nullable: true,
			},
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['keys'],
	},
}

const _pressKeysTool = {
	name: 'computer_press_keys',
	description:
		'Presses or releases specific keys (useful for holding modifiers)',
	input_schema: {
		type: 'object' as const,
		properties: {
			keys: {
				type: 'array' as const,
				items: {type: 'string' as const},
				description:
					'Required JSON key MUST be "keys" (NOT "key", "buttons", or other aliases). Example: {"keys":["ctrl","c"]}. ' +
					'Array of key names to press or release',
			},
			press: {
				type: 'string' as const,
				enum: ['up', 'down'],
				description: 'Whether to press down or release up',
			},
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['keys', 'press'],
	},
}

const _typeTextTool = {
	name: 'computer_type_text',
	description:
		'Types a string of text character by character. Use this tool for strings less than 25 characters, or passwords/sensitive form fields.',
	input_schema: {
		type: 'object' as const,
		properties: {
			text: {
				type: 'string' as const,
				description:
					'Required JSON key MUST be "text" (NOT "content", "value", or other aliases). Example: {"text":"hello"}. ' +
					'The text string to type',
			},
			delay: {
				type: 'number' as const,
				description: 'Optional delay in milliseconds between characters',
				nullable: true,
			},
			isSensitive: {
				type: 'boolean' as const,
				description: 'Flag to indicate sensitive information',
				nullable: true,
			},
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['text'],
	},
}

const _pasteTextTool = {
	name: 'computer_paste_text',
	description:
		'Copies text to the clipboard and pastes it. Use this tool for typing long text strings or special characters not on the standard keyboard.',
	input_schema: {
		type: 'object' as const,
		properties: {
			text: {
				type: 'string' as const,
				description:
					'Required JSON key MUST be "text" (NOT "content", "value", or other aliases). Example: {"text":"hello"}. ' +
					'The text string to type',
			},
			isSensitive: {
				type: 'boolean' as const,
				description: 'Flag to indicate sensitive information',
				nullable: true,
			},
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
		required: ['text'],
	},
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions for utility actions — VERBATIM from upstream lines 250-309
// ─────────────────────────────────────────────────────────────────────────

const _waitTool = {
	name: 'computer_wait',
	description: 'Pauses execution for a specified duration',
	input_schema: {
		type: 'object' as const,
		properties: {
			duration: {
				type: 'integer' as const,
				enum: [500],
				description: 'The duration to wait in milliseconds',
			},
		},
		required: ['duration'],
	},
}

const _screenshotTool = {
	name: 'computer_screenshot',
	description: 'Captures a screenshot of the current screen',
	input_schema: {
		type: 'object' as const,
		properties: {
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
	},
}

const _cursorPositionTool = {
	name: 'computer_cursor_position',
	description: 'Gets the current (x, y) coordinates of the mouse cursor',
	input_schema: {
		type: 'object' as const,
		properties: {
			display: {
				type: 'string' as const,
				description:
					'Optional X11 display to scope this tool call to (e.g. ":11"). When set, overrides the MCP server\'s default display (LUSE_TARGET_DISPLAY env). Use this to drive a specific per-WebApp Xvfb when one global `luse` MCP serves multiple WebApps. Format: ":N" where N is 1-99. Phase 103-B (LivOS extension on top of verbatim upstream schema).',
				nullable: true,
			},
		},
	},
}

// Phase 160-03 — application enum dropped (was Bytebot static apps only).
// Schema is now free-form string; handler runtime-validates against the
// LivOS app catalog (apps.list + apps.native.list) FIRST, then falls back
// to the classic Bytebot APP_MAP (firefox/thunderbird/vscode/etc) for
// binary-launchable defaults. Agent should prefer LivOS app names from the
// LIVOS CONTEXT overlay (Plan 160-02) over Bytebot legacy names.
const _applicationTool = {
	name: 'computer_application',
	description:
		'Opens or focuses an application by name. Accepts: (1) LivOS app names ' +
		'from the LIVOS CONTEXT overlay (e.g. "n8n", "libreoffice") — preferred. ' +
		'(2) Classic Bytebot Linux apps: firefox, thunderbird, 1password, vscode, ' +
		'terminal, desktop, directory — kept for upstream parity, may or may not ' +
		'be installed on LivOS. The handler resolves LivOS apps first via runtime ' +
		'catalog query, then falls back to Bytebot binary spawn.',
	input_schema: {
		type: 'object' as const,
		properties: {
			application: {
				type: 'string' as const,
				description:
					'PREFERRED JSON key (canonical). Accepts aliases "name", "app", "id" — ' +
					'handler coalesces. Example: {"application":"Chrome"}. ' +
					'The application name. Free-form string. Resolved at call-time ' +
					'against (a) LivOS app catalog from `apps.list` + `apps.native.list`, ' +
					'(b) classic Bytebot APP_MAP. Match is case-insensitive on name field.',
			},
			name: {
				type: 'string' as const,
				description: 'Alias for "application". Handler coalesces via R3 (Phase 208-01).',
			},
			app: {
				type: 'string' as const,
				description: 'Alias for "application". Handler coalesces via R3 (Phase 208-01).',
			},
			// Phase 248-02 — additive optional display arg. When set to ":N"
			// (regex-validated by parseDisplayArg in tools.ts), the application
			// is opened with DISPLAY=:N for the spawn duration via
			// withScopedDisplay. The `required` array stays absent (208-09).
			display: {
				type: 'string' as const,
				description:
					'Optional X display string like ":12" — when set, the application ' +
					'launches inside that nested X server (created by computer_create_display) ' +
					'instead of the default :1 desktop. The handler scopes DISPLAY env ' +
					'for the spawn via withScopedDisplay; invalid forms (anything not ' +
					'matching /^:[1-9][0-9]?$/) are silently dropped and the spawn ' +
					'falls back to the default display.',
			},
		},
		// 208-09: NO `required` — MCP SDK rejects at schema before handler R3 alias
		// can coalesce. Handler at tools.ts:761 validates with explicit error.
	},
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions for task management — VERBATIM from upstream lines 311-363
// ─────────────────────────────────────────────────────────────────────────

const _setTaskStatusTool = {
	name: 'set_task_status',
	description: 'Sets the status of the current task',
	input_schema: {
		type: 'object' as const,
		properties: {
			status: {
				type: 'string' as const,
				enum: ['completed', 'needs_help'],
				description: 'The status of the task',
			},
			description: {
				type: 'string' as const,
				description:
					'If the task is completed, a summary of the task. If the task needs help, a description of the issue or clarification needed.',
			},
		},
		required: ['status', 'description'],
	},
}

const _createTaskTool = {
	name: 'create_task',
	description: 'Creates a new task',
	input_schema: {
		type: 'object' as const,
		properties: {
			description: {
				type: 'string' as const,
				description: 'The description of the task',
			},
			type: {
				type: 'string' as const,
				enum: ['IMMEDIATE', 'SCHEDULED'],
				description: 'The type of the task (defaults to IMMEDIATE)',
			},
			scheduledFor: {
				type: 'string' as const,
				format: 'date-time',
				description: 'RFC 3339 / ISO 8601 datetime for scheduled tasks',
			},
			priority: {
				type: 'string' as const,
				enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
				description: 'The priority of the task (defaults to MEDIUM)',
			},
		},
		required: ['description'],
	},
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definition for reading files — VERBATIM from upstream lines 365-382
// ─────────────────────────────────────────────────────────────────────────

const _readFileTool = {
	name: 'computer_read_file',
	description:
		'Reads a file from the specified path and returns it as a document content block with base64 encoded data',
	input_schema: {
		type: 'object' as const,
		properties: {
			path: {
				type: 'string' as const,
				description: 'The file path to read from',
			},
		},
		required: ['path'],
	},
}

// ─────────────────────────────────────────────────────────────────────────
// Export all tools as an array — VERBATIM from upstream lines 384-405
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// P100-10-03 — Luse window-aware tools (D-100-10-C).
//
// These extend the verbatim upstream tool set with three LivOS-native
// window primitives the agent needs for the per-WebApp Xvfb model
// (D-100-10-A): list windows on its display, screenshot any window or
// the whole display, focus any window by wid.
//
// Per the registerLuseTools flow, input_schema is in JSON-Schema form
// here and converted to a Zod raw shape at registration time (P79-02).
// ─────────────────────────────────────────────────────────────────────────

const _listWindowsTool = {
	name: 'list_windows',
	description:
		'List all open windows. With a `display` arg (":N"), scope to that single X display. WITHOUT a display arg, aggregate across every active X display discovered via /tmp/.X11-unix/ — useful for "what windows are open right now?" roster queries when the agent does not yet know which display a target WebApp lives on. Each result row carries its own `display` field so follow-up click/type/focus calls can re-scope with the correct display: ":N" arg. Returns wid, title, class, geometry, and display per row (Phase 103.1).',
	input_schema: {
		type: 'object' as const,
		properties: {
			display: {
				type: 'string' as const,
				description:
					'Optional X display string like ":10". When set, scope to that display only. When omitted, aggregate across all active displays (Phase 103.1).',
			},
		},
	},
}

const _screenshotWindowTool = {
	name: 'screenshot_window',
	description:
		'Capture a screenshot of a specific window (by wid) OR an entire X display. Returns base64 PNG. Exactly one of `wid` or `display` should be provided; if both are omitted, the handler returns an error.',
	input_schema: {
		type: 'object' as const,
		properties: {
			wid: {
				type: 'number' as const,
				description:
					'Required JSON key MUST be "wid" (NOT "id", "window_id", or other aliases). Example: {"wid":12345678}. ' +
					'X11 window id (decimal). When set, capture only this window. Takes precedence over `display`.',
			},
			display: {
				type: 'string' as const,
				description:
					'X display string like ":10". When set (and `wid` is not), capture the entire display.',
			},
		},
	},
}

const _focusWindowTool = {
	name: 'focus_window',
	description:
		'Activate (focus) a window by wid. Equivalent to `xdotool windowactivate --sync <wid>`. Use this to switch the X input focus between windows on the caller display.',
	input_schema: {
		type: 'object' as const,
		properties: {
			wid: {
				type: 'number' as const,
				description:
					'Required JSON key MUST be "wid" (NOT "id", "window_id", or other aliases). Example: {"wid":12345678}. ' +
					'X11 window id (decimal).',
			},
		},
		required: ['wid'],
	},
}

// ─────────────────────────────────────────────────────────────────────────
// P100-10-04 — Luse stream-management tools (D-100-10-C / G-100-10-E).
//
// `create_stream` lets the agent spawn a new x11vnc on any X display
// (e.g. a sibling WebApp's `:11`) so it can see + drive that surface
// inter-WebApp. Because that's a privilege-escalation surface (LLM-
// controlled creation of new network listeners), it is GATED behind
// the Redis flag `liv:config:luse_can_create_streams` — default `false`
// for production, `true` for dev. The tool is REGISTERED unconditionally
// so its schema is discoverable; the handler reads the flag at call-time
// and rejects with `isError:true` when the flag is off.
//
// `list_streams` is read-only and user-scoped (uses the existing
// `streamManager.listStreams({userId})` filter — no privilege gate).
// ─────────────────────────────────────────────────────────────────────────

const _createStreamTool = {
	name: 'create_stream',
	description:
		'Create a new x11vnc stream on a given X display. Returns {streamId, wsUrl, port}. Gated behind the Redis flag `liv:config:luse_can_create_streams` (G-100-10-E) — returns isError:true when the flag is unset or not exactly the string "true".',
	input_schema: {
		type: 'object' as const,
		properties: {
			display: {
				type: 'string' as const,
				description:
					'X display string like ":10". The Xvfb must already be running (typically a sibling WebApp\'s allocated display).',
			},
			port: {
				type: 'number' as const,
				description:
					'Optional explicit rfbPort. Defaults to next free in the 15900..16099 ring allocated by StreamManager.',
			},
		},
		required: ['display'],
	},
}

const _listStreamsTool = {
	name: 'list_streams',
	description:
		'List currently-active streams for the calling user. Returns an array of `{streamId, mode, port, wsUrl, target}`. Read-only; no privilege gate.',
	input_schema: {
		type: 'object' as const,
		properties: {},
	},
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 248-02 — Display lifecycle tools.
//
// Wraps the backend display-manager (Phase 248-01) for AI agents. Lets the
// agent spawn an isolated nested X server (Xephyr visible by default per
// D-V44-DISPLAY-XEPHYR-DEFAULT, Xvfb opt-in headless), launch a LivOS app
// inside it, list active displays + their running apps, and kill displays
// it created. Owner-scoped kill (D-V44-DISPLAY-OWNER-SCOPED) is enforced
// at the manager layer; the MCP wrapper surfaces the manager's
// {ok:false, error:'not-owner'} as isError:true with a helpful text block.
// ─────────────────────────────────────────────────────────────────────────

const _createDisplayTool = {
	name: 'computer_create_display',
	description:
		'Create a new isolated nested X server (display). Use this when you want to ' +
		'open an app WITHOUT touching the operator\'s main desktop (:1) — typical ' +
		'cases: running a flaky web app, doing batch screenshots that should not ' +
		'interrupt the human, or quarantining a process that may misbehave. ' +
		'Defaults to mode="xephyr" (D-V44-DISPLAY-XEPHYR-DEFAULT — a VISIBLE nested ' +
		'X window the operator can watch); pass mode="xvfb" for an off-screen ' +
		'headless display. Defaults to 1920x1080. The returned display string ' +
		'(":N", N≥10) is what you pass to computer_launch_app_in_display, ' +
		'computer_application({display:":N"}), and computer_kill_display. ' +
		'Returns {display, name, pid}. Clean up via computer_kill_display when ' +
		'you are done — idle displays are auto-killed after 4h, but explicit ' +
		'cleanup is preferred.',
	input_schema: {
		type: 'object' as const,
		properties: {
			name: {
				type: 'string' as const,
				description:
					'Optional human-readable name for the display. Defaults to "display-N" ' +
					'(where N is the allocated display number). Visible in computer_list_displays.',
			},
			mode: {
				type: 'string' as const,
				enum: ['xephyr', 'xvfb'],
				description:
					'Optional. "xephyr" (default, D-V44-DISPLAY-XEPHYR-DEFAULT) spawns a ' +
					'VISIBLE nested X server window the operator can watch + interact with. ' +
					'"xvfb" spawns a headless off-screen X server for batch screenshots / ' +
					'no-display-needed workflows.',
			},
			width: {
				type: 'number' as const,
				description: 'Optional display width in pixels. Defaults to 1920.',
			},
			height: {
				type: 'number' as const,
				description: 'Optional display height in pixels. Defaults to 1080.',
			},
		},
	},
}

const _listDisplaysTool = {
	name: 'computer_list_displays',
	description:
		'List ALL active nested-X displays known to Luse (global read, NOT scoped ' +
		'to your session — you see other sessions\' displays for awareness, but ' +
		'computer_kill_display will refuse to kill them per D-V44-DISPLAY-OWNER-SCOPED). ' +
		'Returns an array of {display, name, mode, created_at, owner_session, ' +
		'width, height, running_apps} where running_apps is the list of PIDs ' +
		'attached to that display. Useful before computer_create_display to check ' +
		'whether you already have an idle display to reuse, and before ' +
		'computer_kill_display to confirm the display still exists.',
	input_schema: {
		type: 'object' as const,
		properties: {},
	},
}

const _killDisplayTool = {
	name: 'computer_kill_display',
	description:
		'Kill a nested-X display you created. SIGTERMs every app pid attached to ' +
		'the display, SIGTERMs the X server itself, then DELs the Redis state. ' +
		'Returns {ok:true, killed_apps_count:N} on success. ' +
		'D-V44-DISPLAY-OWNER-SCOPED: only the SESSION that called ' +
		'computer_create_display for this display can kill it. If a different ' +
		'session calls kill, the response is {ok:false, error:"not-owner"} ' +
		'surfaced as isError:true and NEITHER the X server NOR the Redis state ' +
		'is touched (display stays alive). Use computer_list_displays to discover ' +
		'whether a display is yours via owner_session before attempting kill.',
	input_schema: {
		type: 'object' as const,
		properties: {
			display: {
				type: 'string' as const,
				description:
					'X display string like ":12" — must match a display you created via ' +
					'computer_create_display.',
			},
		},
		required: ['display'],
	},
}

const _launchAppInDisplayTool = {
	name: 'computer_launch_app_in_display',
	description:
		'Launch a LivOS app (resolved via the same catalog as computer_application) ' +
		'inside a specific nested X display you previously created via ' +
		'computer_create_display. The spawned process inherits DISPLAY=:N for the ' +
		'duration of the launch, so the app window opens on the nested display ' +
		'instead of the operator\'s main desktop. On success, registers the spawn ' +
		'PID with the display so computer_kill_display can SIGTERM it on cleanup ' +
		'and computer_list_displays shows it under running_apps. Returns ' +
		'{pid, app_name}. Use this when you want to drive an app through Luse ' +
		'without it appearing on the operator\'s primary screen — e.g. running a ' +
		'browser-based wizard while the operator continues working.',
	input_schema: {
		type: 'object' as const,
		properties: {
			display: {
				type: 'string' as const,
				description:
					'X display string like ":12" — the target display from ' +
					'computer_create_display. Must match /^:[1-9][0-9]?$/.',
			},
			app: {
				type: 'string' as const,
				description:
					'App name to launch. Resolved via the same LivOS catalog as ' +
					'computer_application (preferred — LivOS apps from the LIVOS CONTEXT ' +
					'overlay), with classic Bytebot APP_MAP (firefox/thunderbird/vscode/etc) ' +
					'as a fallback.',
			},
			args: {
				type: 'array' as const,
				items: {type: 'string' as const},
				description:
					'Optional extra command-line arguments to pass to the resolved app binary. ' +
					'Ignored when the resolver matches a LivOS WebApp (which dispatches ' +
					'through windowManager IPC, not a binary spawn).',
			},
		},
		required: ['display', 'app'],
	},
}

/**
 * The complete set of Luse tool schemas, in upstream order plus the
 * P100-10-03 window-aware extension. Pass this to the Anthropic / Kimi
 * `tools[]` request field for the LivAgentRunner computer-use loop
 * (P72-03 wires this through `computerUseRouter`).
 */
export const LUSE_TOOLS: readonly AnthropicTool[] = [
	_moveMouseTool,
	_traceMouseTool,
	_clickMouseTool,
	_pressMouseTool,
	_dragMouseTool,
	_scrollTool,
	_typeKeysTool,
	_pressKeysTool,
	_typeTextTool,
	_pasteTextTool,
	_waitTool,
	_screenshotTool,
	_applicationTool,
	_cursorPositionTool,
	_setTaskStatusTool,
	_createTaskTool,
	_readFileTool,
	// P100-10-03 — window-aware tools (D-100-10-C)
	_listWindowsTool,
	_screenshotWindowTool,
	_focusWindowTool,
	// P100-10-04 — stream-management tools (D-100-10-C, G-100-10-E gate)
	_createStreamTool,
	_listStreamsTool,
	// Phase 248-02 — display lifecycle tools (D-V44-DISPLAY-XEPHYR-DEFAULT,
	// D-V44-DISPLAY-OWNER-SCOPED). Backed by createDisplayManager (Phase 248-01).
	_createDisplayTool,
	_listDisplaysTool,
	_killDisplayTool,
	_launchAppInDisplayTool,
] as const

/**
 * Phase 97-07 — Auto-mode-only tools, additive to LUSE_TOOLS.
 *
 * Registered ONLY on per-WebApp Luse MCP instances (i.e. when the
 * spawned child has `LUSE_TARGET_WINDOW_ID` in env). The host-display
 * single-instance MCP does NOT register these — that path has no WebApp
 * scope, so a `skillId` parameter would be ambiguous.
 *
 * The tool implementation lives in skill-replay-tool.ts; the schema is
 * pulled from there to keep one source of truth.
 */
// Phase 201 restore: skill-replay-tool.ts was deleted in 782ee4a3 along with
// the rest of computer-use/. The WEBAPP_REPLAY_SKILL_TOOL schema lived there,
// so LUSE_AUTO_MODE_EXTRA_TOOLS is now an empty list. Per-WebApp Auto mode is
// Phase 100 carry-over not yet re-enabled; the corresponding handler in
// mcp/tools.ts returns a permanent error stub for now. Once skill-replay-tool
// is restored, re-import WEBAPP_REPLAY_SKILL_TOOL and put it back in this list.
export const LUSE_AUTO_MODE_EXTRA_TOOLS: readonly AnthropicTool[] = [] as const

/**
 * Snake-case names of all Luse tools, derived from `LUSE_TOOLS`.
 * Used by `LivAgentRunner` (P72-03) to recognize whether an incoming
 * tool call name is a Luse computer-use tool that should be routed
 * to the LuseBridge HTTP API.
 */
export const LUSE_TOOL_NAMES: readonly string[] = LUSE_TOOLS.map(
	(t) => t.name,
)

/**
 * Union of all Luse tool names as a string-literal type. Useful for
 * type-narrowing inside switch statements that dispatch on tool name.
 */
export type LuseToolName = (typeof LUSE_TOOLS)[number]['name']

/**
 * Type guard for Luse tool names. Returns true if the given string is
 * one of the names in `LUSE_TOOL_NAMES`. Used by P72-03 wiring to
 * decide whether to dispatch a tool call to LuseBridge or to the
 * other tool category routers.
 */
export function isLuseToolName(name: string): name is LuseToolName {
	return (LUSE_TOOL_NAMES as readonly string[]).includes(name)
}
