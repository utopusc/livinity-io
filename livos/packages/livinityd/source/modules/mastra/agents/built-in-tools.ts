/**
 * Phase 198 UAT hot-fix #3 — Built-in agent tools.
 *
 * The Mini PC ships with NO MCP server connected (Luse + selfclaude both
 * gracefully degrade to empty sources). Without any tools, the xAI Grok
 * agent hallucinates tool calls ("I called Luse, found 3 windows...") as
 * pure text, never emitting an actual tool-call chunk — so the Phase 198
 * generative-UI renderers never trigger.
 *
 * This file ships 3 real tools that the agent CAN call today, against
 * existing infrastructure (open-meteo, system wmctrl, Node Date). The tool
 * names match the Phase 198-03 renderers:
 *   - `weather`            → WeatherToolUI         (WeatherWidget)
 *   - `luse_list_windows`  → LuseListWindowsToolUI (DataTable)
 *   - `get_current_time`   → ToolFallback          (plain text result)
 *
 * Phase 199 will replace these with actual Luse MCP server install +
 * full computer-use suite. Until then these unblock visible behaviour.
 */

import {exec} from 'node:child_process'
import {promisify} from 'node:util'

import {createTool} from '@mastra/core/tools'
import {z} from 'zod'

const execAsync = promisify(exec)

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

/**
 * Built-in tool map keyed by tool id. Merged into the agent's tool resolver
 * AFTER MCP tool filtering, so these always reach the model regardless of
 * MCP source availability.
 */
export const builtInTools = {
	weather: weatherTool,
	luse_list_windows: listWindowsTool,
	get_current_time: getCurrentTimeTool,
}
