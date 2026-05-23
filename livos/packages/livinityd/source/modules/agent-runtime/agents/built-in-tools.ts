/**
 * Phase 198 UAT hot-fix #3 / Phase 200-C — Built-in agent tools.
 *
 * The Mini PC ships with NO MCP server connected (Luse + selfclaude both
 * gracefully degrade to empty sources). Without any tools, the xAI Grok
 * agent hallucinates tool calls ("I called Luse, found 3 windows...") as
 * pure text, never emitting an actual tool-call chunk — so the Phase 198
 * generative-UI renderers never trigger.
 *
 * Phase 200-C expands the original 3 tools to the full Luse-compatible
 * computer-use suite, backed by Linux CLI tools (xdotool, scrot/ImageMagick,
 * wmctrl, xsel). The 6 destructive tools use the same namespaced names that
 * appear in mcp-bridge.ts destructiveToolNames Set — so liv-ai.ts's
 * wrapDestructiveTools attaches the existing W-02 approval gate
 * automatically, and the Phase 198-04 ApprovalCard renderers fire on the
 * UI side without any wire changes.
 *
 *   Non-destructive (auto-execute):
 *     - `weather`                       → WeatherWidget
 *     - `luse_list_windows`             → DataTable
 *     - `luse_computer_screenshot`      → inline <img>
 *     - `get_current_time`              → ToolFallback (plain text)
 *
 *   Destructive (HITL-gated via W-02 approval wrap):
 *     - `luse_computer_click_mouse`     → ApprovalCard
 *     - `luse_computer_type_text`       → ApprovalCard
 *     - `luse_computer_press_keys`      → ApprovalCard
 *     - `luse_computer_application`     → ApprovalCard
 *     - `luse_computer_drag_mouse`      → ApprovalCard
 *     - `luse_computer_paste_text`      → ApprovalCard
 *
 * All shell-invoking destructive tools use execFile with arg arrays (NOT
 * `exec` shell strings) so operator-controlled inputs cannot escape into a
 * sub-shell. Coordinates are coerced to integers; large strings are passed
 * via stdin where possible.
 */

import {exec, execFile} from 'node:child_process'
import {promisify} from 'node:util'

import {z} from 'zod'

/**
 * Phase 203-08 — Local createTool shim. Replaces `@mastra/core/tools`
 * createTool (purged with @mastra/* deps). Returns a plain tool descriptor
 * carrying `id`, `description`, `inputSchema`, `outputSchema`, `meta`, and
 * an `execute({context})` wrapper that runs the typed handler. Shape matches
 * what downstream consumers touch:
 *   - mcp-tool-adapter.ts duck-types `.execute({context})`
 *   - plugin-rpc.ts duck-types `.execute({context: args})`
 *   - agent-factory.ts treats tool entries as opaque records
 *   - approval wrap (wrap-tool-with-approval.ts) duck-types `.execute(input, ctx)`
 *     (compat shim: when called with two args we collapse to {context: input}).
 *
 * Intentionally NO dependency on @mastra/core types — this is the Plan 203-08
 * purge gate.
 */
interface ToolDefinitionInput<I, O> {
	id?: string
	description?: string
	inputSchema?: z.ZodType<I>
	outputSchema?: z.ZodType<O>
	meta?: Record<string, unknown>
	/**
	 * Per-call handler. `input` is the unwrapped tool argument bag (matches
	 * the cast pattern downstream tool bodies use: `input as {x, y, button}`).
	 * The outer `.execute({context})` shim below normalises Mastra-style
	 * `{context}` envelopes from mcp-tool-adapter / plugin-rpc.
	 */
	execute: (input: I) => Promise<O> | O
}

interface LocalTool<I, O> {
	id?: string
	description?: string
	inputSchema?: z.ZodType<I>
	outputSchema?: z.ZodType<O>
	parameters?: z.ZodType<I>
	meta?: Record<string, unknown>
	execute: (input: {context: I} | I, _ctx?: unknown) => Promise<O>
}

function createTool<I, O>(def: ToolDefinitionInput<I, O>): LocalTool<I, O> {
	return {
		id: def.id,
		description: def.description,
		inputSchema: def.inputSchema,
		outputSchema: def.outputSchema,
		parameters: def.inputSchema,
		meta: def.meta,
		async execute(input: {context: I} | I, _ctx?: unknown): Promise<O> {
			// Two call shapes: Mastra-style `{context: I}` (used by mcp-tool-adapter,
			// plugin-rpc) and approval-wrap style `(I, ctx)` (legacy
			// wrapToolWithApproval signature). Unwrap to `I` before handing to
			// the typed handler so downstream tool bodies do not have to
			// pierce a `{context}` envelope.
			const context: I =
				typeof input === 'object' &&
				input !== null &&
				'context' in (input as Record<string, unknown>)
					? ((input as {context: I}).context as I)
					: (input as I)
			return Promise.resolve(def.execute(context))
		},
	}
}

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// Default X11 display when DISPLAY env var is unset. The Mini PC bruce
// session pins to :0 (Xorg + fluxbox).
const DEFAULT_DISPLAY = ':0'
function displayEnv(): NodeJS.ProcessEnv {
	return {...process.env, DISPLAY: process.env.DISPLAY ?? DEFAULT_DISPLAY}
}

// Maximum byte-size of a screenshot payload returned inline (4 MiB). Larger
// frames are rejected rather than blowing through the SSE channel.
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024

// Open-Meteo WMO weather-code → short description map. Aligns with
// WeatherWidget's "conditions" string.
const WMO_CODE_MAP: Record<number, string> = {
	0: 'Clear sky',
	1: 'Mainly clear',
	2: 'Partly cloudy',
	3: 'Overcast',
	45: 'Fog',
	48: 'Depositing rime fog',
	51: 'Light drizzle',
	53: 'Drizzle',
	55: 'Heavy drizzle',
	56: 'Light freezing drizzle',
	57: 'Freezing drizzle',
	61: 'Light rain',
	63: 'Rain',
	65: 'Heavy rain',
	66: 'Light freezing rain',
	67: 'Freezing rain',
	71: 'Light snow',
	73: 'Snow',
	75: 'Heavy snow',
	77: 'Snow grains',
	80: 'Light rain showers',
	81: 'Rain showers',
	82: 'Heavy rain showers',
	85: 'Snow showers',
	86: 'Heavy snow showers',
	95: 'Thunderstorm',
	96: 'Thunderstorm with hail',
	99: 'Heavy thunderstorm with hail',
}

const weatherTool = createTool({
	id: 'weather',
	description:
		'Get current weather and 3-day forecast for a city or location. ' +
		'Use this when the operator asks about weather, temperature, or forecast. ' +
		'Returns a structured result that the UI renders as a WeatherWidget — ' +
		'you do NOT need to repeat the data in markdown.',
	inputSchema: z.object({
		location: z
			.string()
			.describe('City name (any language), e.g., "Istanbul", "İstanbul", "London"'),
	}),
	outputSchema: z.object({
		temperature: z.number(),
		conditions: z.string(),
		humidity: z.number().optional(),
		windSpeed: z.number().optional(),
		unit: z.literal('C').optional(),
		forecast: z
			.array(
				z.object({
					day: z.string(),
					high: z.number(),
					low: z.number(),
					conditions: z.string().optional(),
				}),
			)
			.optional(),
	}),
	execute: async (input) => {
		const {location} = input as {location: string}
		const geoRes = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
		)
		const geoData = (await geoRes.json()) as {
			results?: Array<{latitude: number; longitude: number; name: string}>
		}
		if (!geoData.results?.[0]) {
			throw new Error(`Location not found: ${location}`)
		}
		const {latitude, longitude} = geoData.results[0]

		const wxRes = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
				`&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
				`&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`,
		)
		const wxData = (await wxRes.json()) as {
			current: {
				temperature_2m: number
				relative_humidity_2m: number
				weather_code: number
				wind_speed_10m: number
			}
			daily: {
				time: string[]
				weather_code: number[]
				temperature_2m_max: number[]
				temperature_2m_min: number[]
			}
		}

		return {
			temperature: Math.round(wxData.current.temperature_2m),
			conditions: WMO_CODE_MAP[wxData.current.weather_code] ?? 'Unknown',
			humidity: Math.round(wxData.current.relative_humidity_2m),
			windSpeed: Math.round(wxData.current.wind_speed_10m),
			unit: 'C' as const,
			forecast: wxData.daily.time.slice(0, 3).map((day, i) => ({
				day,
				high: Math.round(wxData.daily.temperature_2m_max[i] ?? 0),
				low: Math.round(wxData.daily.temperature_2m_min[i] ?? 0),
				conditions: WMO_CODE_MAP[wxData.daily.weather_code[i] ?? 0] ?? 'Unknown',
			})),
		}
	},
})

const listWindowsTool = createTool({
	id: 'luse_list_windows',
	description:
		'List all currently open windows on the LivOS desktop. ' +
		'Use this when the operator asks what windows or apps are open. ' +
		'Returns a structured list that the UI renders as a DataTable — ' +
		'you do NOT need to repeat the list in markdown.',
	inputSchema: z.object({}),
	outputSchema: z.object({
		windows: z.array(
			z.object({
				id: z.string(),
				title: z.string(),
				pid: z.number().optional(),
				app: z.string().optional(),
			}),
		),
	}),
	execute: async () => {
		try {
			const {stdout} = await execAsync('wmctrl -lp 2>/dev/null || true', {
				timeout: 3000,
			})
			const lines = stdout.trim().split('\n').filter(Boolean)
			const windows = lines
				.map((line) => {
					// wmctrl -lp format: <WID> <DESKTOP> <PID> <HOST> <TITLE...>
					const parts = line.split(/\s+/)
					const id = parts[0] ?? ''
					const pidStr = parts[2] ?? '0'
					const pid = parseInt(pidStr, 10)
					const title = parts.slice(4).join(' ')
					return {
						id,
						title,
						pid: Number.isNaN(pid) ? undefined : pid,
					}
				})
				.filter((w) => w.title.length > 0)
			return {windows}
		} catch {
			return {windows: []}
		}
	},
})

const getCurrentTimeTool = createTool({
	id: 'get_current_time',
	description:
		'Get the current date and time on the LivOS Mini PC. ' +
		'Use this when the operator asks what time or date it is.',
	inputSchema: z.object({
		timezone: z
			.string()
			.optional()
			.describe('IANA timezone, e.g., "Europe/Istanbul". Defaults to system zone.'),
	}),
	outputSchema: z.object({
		iso: z.string(),
		localized: z.string(),
		timezone: z.string(),
	}),
	execute: async (input) => {
		const tz =
			(input as {timezone?: string}).timezone ||
			Intl.DateTimeFormat().resolvedOptions().timeZone
		const now = new Date()
		return {
			iso: now.toISOString(),
			localized: now.toLocaleString('tr-TR', {
				timeZone: tz,
				dateStyle: 'full',
				timeStyle: 'medium',
			}),
			timezone: tz,
		}
	},
})

// ─── Phase 200-C-1 — luse_computer_screenshot ──────────────────────────
//
// Captures the X11 root window to PNG via scrot, falls back to
// `import -window root` (ImageMagick) if scrot is missing. Returns
// {dataUrl, base64, mimeType} so LuseScreenshotToolUI renders inline.
//
// The shell command is fixed (no operator input is interpolated) and runs
// against /tmp/livos-screenshot-*.png — afterwards we read the file as
// base64 and unlink it.

const screenshotTool = createTool({
	id: 'luse_computer_screenshot',
	description:
		'Capture the current LivOS desktop as a PNG screenshot. ' +
		'Use this FIRST when the operator asks for a desktop action — ' +
		'see current state before clicking, typing, or launching anything. ' +
		'Returns a base64 PNG that the UI renders inline.',
	inputSchema: z.object({}),
	outputSchema: z.object({
		dataUrl: z.string().optional(),
		base64: z.string().optional(),
		mimeType: z.string().optional(),
	}),
	execute: async () => {
		const tmpPath = `/tmp/livos-screenshot-${process.pid}-${Date.now()}.png`
		const env = displayEnv()
		// Try scrot first, fall back to ImageMagick `import`.
		try {
			await execAsync(`scrot -o ${tmpPath}`, {timeout: 5000, env})
		} catch {
			try {
				await execAsync(`import -window root ${tmpPath}`, {
					timeout: 5000,
					env,
				})
			} catch (err) {
				throw new Error(
					`screenshot failed: neither scrot nor ImageMagick available (${(err as Error).message})`,
				)
			}
		}
		const {readFile, unlink} = await import('node:fs/promises')
		const buf = await readFile(tmpPath)
		await unlink(tmpPath).catch(() => {
			/* best-effort */
		})
		if (buf.byteLength > MAX_SCREENSHOT_BYTES) {
			throw new Error(
				`screenshot exceeds ${MAX_SCREENSHOT_BYTES} bytes (got ${buf.byteLength})`,
			)
		}
		const base64 = buf.toString('base64')
		return {
			dataUrl: `data:image/png;base64,${base64}`,
			base64,
			mimeType: 'image/png',
		}
	},
})

// ─── Phase 200-C-2 — luse_computer_click_mouse (DESTRUCTIVE) ───────────
//
// Moves the X11 cursor and clicks once. Inputs are coerced to integers
// before passing to xdotool via execFile (NOT exec) — coords cannot
// contain shell metacharacters once they hit the spawn syscall.

const clickMouseTool = createTool({
	id: 'luse_computer_click_mouse',
	description:
		'Move the cursor to (x, y) on the LivOS desktop and click. ' +
		'Default button is left. This is a DESTRUCTIVE tool — the operator ' +
		'will be asked to approve before it runs.',
	inputSchema: z.object({
		x: z.number().int(),
		y: z.number().int(),
		button: z.enum(['left', 'middle', 'right']).optional().default('left'),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		x: z.number(),
		y: z.number(),
		button: z.string(),
	}),
	execute: async (input) => {
		const {x, y, button = 'left'} = input as {
			x: number
			y: number
			button?: 'left' | 'middle' | 'right'
		}
		const xi = Math.trunc(x)
		const yi = Math.trunc(y)
		const buttonCode = button === 'left' ? '1' : button === 'middle' ? '2' : '3'
		const env = displayEnv()
		await execFileAsync(
			'xdotool',
			['mousemove', '--sync', String(xi), String(yi), 'click', buttonCode],
			{timeout: 4000, env},
		)
		return {success: true, x: xi, y: yi, button}
	},
})

// ─── Phase 200-C-3 — luse_computer_type_text (DESTRUCTIVE) ─────────────
//
// Types arbitrary text into the focused window. The text payload is
// passed via execFile arg list (NOT interpolated into a shell string) so
// the operator's `;`, `$`, backticks, etc. cannot escape into a sub-shell.
// `--` terminates xdotool option parsing so text starting with `-` is
// not misread as a flag.

const typeTextTool = createTool({
	id: 'luse_computer_type_text',
	description:
		'Type the given text into the currently focused window on the LivOS desktop. ' +
		'This is a DESTRUCTIVE tool — the operator will be asked to approve before it runs.',
	inputSchema: z.object({
		text: z.string(),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		charsTyped: z.number(),
	}),
	execute: async (input) => {
		const {text} = input as {text: string}
		const env = displayEnv()
		await execFileAsync('xdotool', ['type', '--delay', '20', '--', text], {
			timeout: 10_000,
			env,
		})
		return {success: true, charsTyped: text.length}
	},
})

// ─── Phase 200-C-4 — luse_computer_press_keys (DESTRUCTIVE) ────────────
//
// Sends an xdotool keysym sequence — e.g. "ctrl+c", "Return", "alt+F4".
// The keys string is parsed by xdotool itself; we pass it through
// execFile so the operator cannot inject shell metacharacters.

const pressKeysTool = createTool({
	id: 'luse_computer_press_keys',
	description:
		'Press one or more keys on the LivOS desktop using xdotool key syntax. ' +
		"Examples: 'ctrl+c', 'Return', 'alt+F4', 'super'. " +
		'This is a DESTRUCTIVE tool — the operator will be asked to approve before it runs.',
	inputSchema: z.object({
		keys: z.string().min(1),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		keys: z.string(),
	}),
	execute: async (input) => {
		const {keys} = input as {keys: string}
		const env = displayEnv()
		await execFileAsync('xdotool', ['key', '--', keys], {
			timeout: 4000,
			env,
		})
		return {success: true, keys}
	},
})

// ─── Phase 200-C-5 — luse_computer_application (DESTRUCTIVE) ───────────
//
// Three sub-actions:
//   - launch → `gtk-launch <name>` (looks up name.desktop); if that fails,
//              fall back to `setsid <name> &` so the bare binary spawns
//              detached from livinityd's process group.
//   - focus  → `wmctrl -a <name>` (case-insensitive substring match against
//              window titles).
//   - close  → `wmctrl -c <name>` (closes the matching window).
//
// `name` is passed through execFile arg list — no shell interpolation
// for the gtk-launch / wmctrl paths. The setsid fallback DOES use sh -c
// for backgrounding; we wrap name in single quotes via JSON.stringify-ish
// shell-escape to neutralise embedded single quotes and metacharacters.

function shellQuote(s: string): string {
	// POSIX single-quoted form: end-quote → escape ' as '\'' → reopen quote
	return `'${s.replace(/'/g, `'\\''`)}'`
}

const applicationTool = createTool({
	id: 'luse_computer_application',
	description:
		'Launch, focus, or close an application on the LivOS desktop. ' +
		"action='launch' starts an app, 'focus' brings its window to front, " +
		"'close' asks it to quit. This is a DESTRUCTIVE tool — the operator " +
		'will be asked to approve before it runs.',
	inputSchema: z.object({
		action: z.enum(['launch', 'focus', 'close']),
		name: z.string().min(1),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		action: z.string(),
		name: z.string(),
	}),
	execute: async (input) => {
		const {action, name} = input as {
			action: 'launch' | 'focus' | 'close'
			name: string
		}
		const env = displayEnv()
		if (action === 'launch') {
			try {
				await execFileAsync('gtk-launch', [name], {timeout: 4000, env})
			} catch {
				// Fall back to a detached spawn so livinityd doesn't wait on
				// the child. shellQuote(name) neutralises any operator-supplied
				// shell meta — sh sees a single literal token.
				await execFileAsync(
					'sh',
					[
						'-c',
						`setsid ${shellQuote(name)} >/dev/null 2>&1 < /dev/null &`,
					],
					{timeout: 4000, env},
				)
			}
		} else if (action === 'focus') {
			await execFileAsync('wmctrl', ['-a', name], {timeout: 4000, env})
		} else {
			await execFileAsync('wmctrl', ['-c', name], {timeout: 4000, env})
		}
		return {success: true, action, name}
	},
})

// ─── Phase 200-C-6 — luse_computer_drag_mouse (DESTRUCTIVE) ────────────
//
// Click-and-drag between two coords. Coordinates are coerced to integers,
// command runs through execFile arg list — no shell injection surface.

const dragMouseTool = createTool({
	id: 'luse_computer_drag_mouse',
	description:
		'Drag the mouse from (fromX, fromY) to (toX, toY) on the LivOS desktop. ' +
		'Default button is left. This is a DESTRUCTIVE tool — the operator ' +
		'will be asked to approve before it runs.',
	inputSchema: z.object({
		fromX: z.number().int(),
		fromY: z.number().int(),
		toX: z.number().int(),
		toY: z.number().int(),
		button: z.enum(['left', 'middle', 'right']).optional().default('left'),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		fromX: z.number(),
		fromY: z.number(),
		toX: z.number(),
		toY: z.number(),
		button: z.string(),
	}),
	execute: async (input) => {
		const {fromX, fromY, toX, toY, button = 'left'} = input as {
			fromX: number
			fromY: number
			toX: number
			toY: number
			button?: 'left' | 'middle' | 'right'
		}
		const fx = Math.trunc(fromX)
		const fy = Math.trunc(fromY)
		const tx = Math.trunc(toX)
		const ty = Math.trunc(toY)
		const btn = button === 'left' ? '1' : button === 'middle' ? '2' : '3'
		const env = displayEnv()
		await execFileAsync(
			'xdotool',
			[
				'mousemove',
				String(fx),
				String(fy),
				'mousedown',
				btn,
				'mousemove',
				String(tx),
				String(ty),
				'mouseup',
				btn,
			],
			{timeout: 6000, env},
		)
		return {success: true, fromX: fx, fromY: fy, toX: tx, toY: ty, button}
	},
})

// ─── Phase 200-C-7 — luse_computer_paste_text (DESTRUCTIVE) ────────────
//
// Stuffs `text` into the X11 CLIPBOARD via `xsel --clipboard --input` then
// issues ctrl+v. We feed text on stdin so the operator's input never
// appears as a shell argument (no metacharacter risk, no ENV/ARG_MAX
// truncation by long strings).
//
// Why paste vs. type for long strings: xdotool type at 20ms/char hits
// ~50 chars/sec; paste is single-shot. Paste also preserves Unicode that
// some xdotool builds mishandle.

const pasteTextTool = createTool({
	id: 'luse_computer_paste_text',
	description:
		'Paste the given text into the focused window on the LivOS desktop ' +
		'(copies to the X11 clipboard, then issues ctrl+v). Use this for long ' +
		'strings or Unicode-heavy content where type_text would be slow or lossy. ' +
		'This is a DESTRUCTIVE tool — the operator will be asked to approve before it runs.',
	inputSchema: z.object({
		text: z.string(),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		charsPasted: z.number(),
	}),
	execute: async (input) => {
		const {text} = input as {text: string}
		const env = displayEnv()
		// Step 1: copy text to X11 CLIPBOARD via xsel stdin. We use the
		// callback form of execFile (NOT execFileAsync) so we can grab the
		// child object and pipe to its stdin before the process exits.
		await new Promise<void>((resolve, reject) => {
			const child = execFile(
				'xsel',
				['--clipboard', '--input'],
				{timeout: 4000, env},
				(err) => (err ? reject(err) : resolve()),
			)
			child.stdin?.end(text, 'utf8')
		})
		// Step 2: simulate ctrl+v in the focused window.
		await execFileAsync('xdotool', ['key', '--', 'ctrl+v'], {
			timeout: 4000,
			env,
		})
		return {success: true, charsPasted: text.length}
	},
})

// ─── Phase 202-08 — ui_render (Generative UI passthrough) ──────────────
//
// The agent emits an OpenUI Lang JSON tree via this tool. The server-side
// execute is a pure passthrough — there is no compute step; the tool exists
// solely so the SSE pipeline emits a `tool-result` chunk that the subapp's
// `makeAssistantToolUI({ toolName: 'ui_render', ... })` registration can
// dispatch on. The client-side renderer validates the tree against a
// whitelisted component set (T-202-06) and mounts it inline.
//
// Schema is intentionally loose (`tree: z.unknown()`): OpenUI Lang shape
// validation happens client-side so the renderer can drop unknown
// components gracefully without raising on the backend.
//
// Not destructive — no approval gate. INV-202-09 updated: this is the
// 11th built-in tool (10 pre-existing Phase 200-C entries + ui_render).

const uiRenderTool = createTool({
	id: 'ui_render',
	description:
		'Render a custom inline UI in the chat (card, list, layout, table). ' +
		'Use when the operator asks to "show", "display", or "design" something ' +
		'visual, or when structured data is best presented as UI rather than ' +
		'markdown text. Pass an OpenUI Lang JSON tree (shape: ' +
		'{ component: "name", props?: {...}, children?: [...] }). The host ' +
		'renders it inline. Do NOT use for plain prose answers — the 10 ' +
		'specialised tools (weather, list_windows, screenshot, etc.) take ' +
		'priority when their topic fits.',
	inputSchema: z.object({
		// Loose schema — actual OpenUI Lang validation happens client-side.
		// We forward the tree opaquely; the renderer validates the shape.
		tree: z.unknown(),
		title: z.string().optional(),
	}),
	outputSchema: z.object({
		rendered: z.literal(true),
		title: z.string().optional(),
	}),
	execute: async (input) => {
		// No-op server-side. The UI is rendered by the client via the
		// tool-ui makeAssistantToolUI('ui_render') registration. We just
		// acknowledge so the chunk pipeline emits a tool-result frame.
		const {title} = input as {title?: string}
		return {rendered: true as const, title}
	},
})

/**
 * Phase 201-05 — Built-in tool catalog (UI surface).
 *
 * Static catalog the MCP panel renders as a "Built-in tools" group above
 * the external-MCP server list. Source-of-truth for what the operator sees;
 * the Mastra agent generation loop is untouched (`builtInTools` map below
 * is still the runtime resolver). 10 entries match the 10 createTool() ids
 * exactly (3 non-destructive `data` + 7 destructive `computer-use`).
 *
 * Consumed by `mastra.agent.listBuiltInTools` tRPC privateProcedure
 * (livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts).
 *
 * Phase 202-08 extends this to 11 entries — the new `ui_render` tool
 * surfaces the OpenUI Lang generative-UI primitive (INV-202-09 updated).
 */
export const BUILT_IN_TOOL_CATALOG = [
	{
		id: 'weather',
		name: 'Weather',
		description: 'Get current weather + 3-day forecast',
		destructive: false,
		category: 'data',
	},
	{
		id: 'luse_list_windows',
		name: 'List Windows',
		description: 'List open desktop windows',
		destructive: false,
		category: 'computer-use',
	},
	{
		id: 'luse_computer_screenshot',
		name: 'Screenshot',
		description: 'Capture the desktop screen',
		destructive: false,
		category: 'computer-use',
	},
	{
		id: 'get_current_time',
		name: 'Current Time',
		description: 'Get current date/time',
		destructive: false,
		category: 'data',
	},
	{
		id: 'luse_computer_click_mouse',
		name: 'Click Mouse',
		description: 'Click at coordinates',
		destructive: true,
		category: 'computer-use',
	},
	{
		id: 'luse_computer_type_text',
		name: 'Type Text',
		description: 'Type text via keyboard',
		destructive: true,
		category: 'computer-use',
	},
	{
		id: 'luse_computer_press_keys',
		name: 'Press Keys',
		description: 'Send keypress combos',
		destructive: true,
		category: 'computer-use',
	},
	{
		id: 'luse_computer_application',
		name: 'Application',
		description: 'Launch/focus/close apps',
		destructive: true,
		category: 'computer-use',
	},
	{
		id: 'luse_computer_drag_mouse',
		name: 'Drag Mouse',
		description: 'Drag from one coord to another',
		destructive: true,
		category: 'computer-use',
	},
	{
		id: 'luse_computer_paste_text',
		name: 'Paste Text',
		description: 'Paste text via clipboard',
		destructive: true,
		category: 'computer-use',
	},
	// Phase 202-08 — 11th built-in: ad-hoc OpenUI Lang renderer
	{
		id: 'ui_render',
		name: 'Render UI',
		description: 'Show a custom inline UI block (OpenUI Lang)',
		destructive: false,
		category: 'generative-ui',
	},
] as const

export type BuiltInToolCatalogEntry = (typeof BUILT_IN_TOOL_CATALOG)[number]

/**
 * Built-in tool map keyed by tool id. Merged into the agent's tool resolver
 * AFTER MCP tool filtering, so these always reach the model regardless of
 * MCP source availability.
 *
 * Destructive Phase 200-C entries match the mcp-bridge.ts destructiveToolNames
 * Set verbatim — liv-ai.ts wrapDestructiveTools wraps them with the W-02
 * approval gate automatically.
 */
export const builtInTools = {
	weather: weatherTool,
	luse_list_windows: listWindowsTool,
	get_current_time: getCurrentTimeTool,
	// Phase 200-C-1 (non-destructive)
	luse_computer_screenshot: screenshotTool,
	// Phase 200-C destructive additions (W-02 approval-wrapped at agent build time)
	luse_computer_click_mouse: clickMouseTool,
	luse_computer_type_text: typeTextTool,
	luse_computer_press_keys: pressKeysTool,
	luse_computer_application: applicationTool,
	luse_computer_drag_mouse: dragMouseTool,
	luse_computer_paste_text: pasteTextTool,
	// Phase 202-08 — Generative UI passthrough (non-destructive)
	ui_render: uiRenderTool,
}
