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

import {createTool} from '@mastra/core/tools'
import {z} from 'zod'

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
	execute: async ({context}) => {
		const {location} = context as {location: string}
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
	execute: async ({context}) => {
		const tz =
			(context as {timezone?: string}).timezone ||
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

/**
 * Built-in tool map keyed by tool id. Merged into the agent's tool resolver
 * AFTER MCP tool filtering, so these always reach the model regardless of
 * MCP source availability.
 *
 * Destructive Phase 200-C entries (added in later C-* commits) MUST match
 * the mcp-bridge.ts destructiveToolNames Set verbatim — liv-ai.ts
 * wrapDestructiveTools wraps them with the W-02 approval gate automatically.
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
}
