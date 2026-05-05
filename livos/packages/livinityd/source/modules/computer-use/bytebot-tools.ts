/**
 * Bytebot Computer-Use Tool Schemas
 *
 * Copied verbatim from Bytebot's open-source agent code (Apache 2.0):
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

/**
 * Anthropic / Kimi tool format. Every entry in BYTEBOT_TOOLS conforms to
 * this shape — the format Bytebot's agent passes through to Anthropic
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
			description: 'The x-coordinate',
		},
		y: {
			type: 'number' as const,
			description: 'The y-coordinate',
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
					'Optional click coordinates (defaults to current position)',
				nullable: true,
			},
			button: buttonSchema,
			holdKeys: holdKeysSchema,
			clickCount: {
				type: 'integer' as const,
				description: 'Number of clicks to perform (e.g., 2 for double-click)',
				default: 1,
			},
		},
		required: ['button', 'clickCount'],
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
				description: 'Array of coordinates representing the drag path',
			},
			button: buttonSchema,
			holdKeys: holdKeysSchema,
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
				description: 'Array of key names to press or release',
			},
			press: {
				type: 'string' as const,
				enum: ['up', 'down'],
				description: 'Whether to press down or release up',
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
				description: 'The text string to type',
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
				description: 'The text string to type',
			},
			isSensitive: {
				type: 'boolean' as const,
				description: 'Flag to indicate sensitive information',
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
		properties: {},
	},
}

const _cursorPositionTool = {
	name: 'computer_cursor_position',
	description: 'Gets the current (x, y) coordinates of the mouse cursor',
	input_schema: {
		type: 'object' as const,
		properties: {},
	},
}

const _applicationTool = {
	name: 'computer_application',
	description: 'Opens or focuses an application and ensures it is fullscreen',
	input_schema: {
		type: 'object' as const,
		properties: {
			application: {
				type: 'string' as const,
				enum: [
					'firefox',
					'1password',
					'thunderbird',
					'vscode',
					'terminal',
					'desktop',
					'directory',
				],
				description: 'The application to open or focus',
			},
		},
		required: ['application'],
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

/**
 * The complete set of Bytebot tool schemas, in upstream order. Pass this
 * to the Anthropic / Kimi `tools[]` request field for the LivAgentRunner
 * computer-use loop (P72-03 wires this through `computerUseRouter`).
 */
export const BYTEBOT_TOOLS: readonly AnthropicTool[] = [
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
] as const

/**
 * Snake-case names of all Bytebot tools, derived from `BYTEBOT_TOOLS`.
 * Used by `LivAgentRunner` (P72-03) to recognize whether an incoming
 * tool call name is a Bytebot computer-use tool that should be routed
 * to the BytebotBridge HTTP API.
 */
export const BYTEBOT_TOOL_NAMES: readonly string[] = BYTEBOT_TOOLS.map(
	(t) => t.name,
)

/**
 * Union of all Bytebot tool names as a string-literal type. Useful for
 * type-narrowing inside switch statements that dispatch on tool name.
 */
export type BytebotToolName = (typeof BYTEBOT_TOOLS)[number]['name']

/**
 * Type guard for Bytebot tool names. Returns true if the given string is
 * one of the names in `BYTEBOT_TOOL_NAMES`. Used by P72-03 wiring to
 * decide whether to dispatch a tool call to BytebotBridge or to the
 * other tool category routers.
 */
export function isBytebotToolName(name: string): name is BytebotToolName {
	return (BYTEBOT_TOOL_NAMES as readonly string[]).includes(name)
}
