// Phase 164-01 — Agent definition parser (master plan D-V34-G).
//
// Parses `vault/livos-agents/<agent-name>.md` files into typed AgentDefinition
// objects consumed by the autonomous scheduler (164-02) and inbox writer
// (164-03). Each markdown file is YAML frontmatter + markdown body — the body
// is the prompt that will be passed to the Claude Agent SDK at trigger time.
//
// File layout:
//   ---
//   name: nightly-backup-audit
//   schedule: "0 3 * * *"           # cron expression (5-field, node-cron validated)
//   model: claude-sonnet-4-6
//   max_turns: 15                   # optional, default 20
//   max_budget_usd: 3               # optional, default 5
//   allowed_tools: ["Read","Bash"]  # optional, default ['Read','Bash','Glob','Grep']
//   mcp_servers: ["luse"]           # optional, default []
//   enabled: true                   # optional, default true
//   ---
//
//   # markdown body = prompt sent to the agent
//   ...
//
// YAML parser choice: `js-yaml` (direct dep of livinityd — see package.json
// `dependencies` line for `"js-yaml": "^4.1.0"`). FAILSAFE_SCHEMA is used so
// embedded YAML tags / directives cannot trigger arbitrary type coercion
// (threat T-164-01-01 mitigated). Numbers + booleans are re-parsed from the
// resulting string values manually.
//
// Non-fatal contract: the parser NEVER throws. All recoverable errors flow
// through the ParseResult / DirParseResult discriminator so the scheduler
// (164-02) can keep partially-broken vaults running.

import {readdir, readFile} from 'node:fs/promises'
import path from 'node:path'

import yaml from 'js-yaml'
import * as cron from 'node-cron'

export interface AgentDefinition {
	name: string
	schedule: string
	model: string
	maxTurns: number
	maxBudgetUsd: number
	allowedTools: string[]
	mcpServers: string[]
	enabled: boolean
	body: string
	sourcePath: string
}

export type ParseResult =
	| {ok: true; definition: AgentDefinition}
	| {ok: false; err: string}

export interface ParseError {
	path: string
	err: string
}

export interface DirParseResult {
	ok: AgentDefinition[]
	errors: ParseError[]
}

const DEFAULT_MAX_TURNS = 20
const DEFAULT_MAX_BUDGET_USD = 5
const DEFAULT_ALLOWED_TOOLS: ReadonlyArray<string> = ['Read', 'Bash', 'Glob', 'Grep']
const DEFAULT_MCP_SERVERS: ReadonlyArray<string> = []
const DEFAULT_ENABLED = true

// Matches `---\n<yaml>\n---\n?` at the very start of the document.
// `[\s\S]*?` non-greedy so a body containing `---` is not consumed.
// `\r?\n` handles CRLF line endings (Obsidian on Windows is a thing).
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Coerce a YAML-parsed FAILSAFE value (which yields only strings, arrays and
 * objects) into the concrete number / boolean the schema expects. Returns
 * `undefined` if the value isn't present at all, which lets the caller
 * substitute the default.
 */
function coerceNumber(raw: unknown, fieldName: string): {ok: true; value: number | undefined} | {ok: false; err: string} {
	if (raw === undefined || raw === null) return {ok: true, value: undefined}
	const asString = typeof raw === 'string' ? raw : String(raw)
	const n = Number(asString)
	if (!Number.isFinite(n)) return {ok: false, err: `invalid ${fieldName}: expected number, got ${JSON.stringify(raw)}`}
	return {ok: true, value: n}
}

function coerceBoolean(raw: unknown, fieldName: string): {ok: true; value: boolean | undefined} | {ok: false; err: string} {
	if (raw === undefined || raw === null) return {ok: true, value: undefined}
	if (typeof raw === 'boolean') return {ok: true, value: raw}
	const asString = typeof raw === 'string' ? raw.toLowerCase() : String(raw).toLowerCase()
	if (asString === 'true') return {ok: true, value: true}
	if (asString === 'false') return {ok: true, value: false}
	return {ok: false, err: `invalid ${fieldName}: expected boolean, got ${JSON.stringify(raw)}`}
}

function coerceStringArray(raw: unknown, fieldName: string): {ok: true; value: string[] | undefined} | {ok: false; err: string} {
	if (raw === undefined || raw === null) return {ok: true, value: undefined}
	if (!Array.isArray(raw)) return {ok: false, err: `invalid ${fieldName}: expected array, got ${JSON.stringify(raw)}`}
	const out: string[] = []
	for (const item of raw) {
		if (typeof item !== 'string') {
			return {ok: false, err: `invalid ${fieldName}: array entries must be strings, got ${JSON.stringify(item)}`}
		}
		out.push(item)
	}
	return {ok: true, value: out}
}

function coerceString(raw: unknown, fieldName: string): {ok: true; value: string | undefined} | {ok: false; err: string} {
	if (raw === undefined || raw === null) return {ok: true, value: undefined}
	if (typeof raw !== 'string') return {ok: false, err: `invalid ${fieldName}: expected string, got ${JSON.stringify(raw)}`}
	return {ok: true, value: raw}
}

/**
 * Parse a single agent-definition markdown blob.
 *
 * @param markdown raw file contents (frontmatter + body)
 * @param sourcePath absolute path of the source `.md` (used for inbox backlinks
 *                   and for the AgentDefinition.sourcePath field). Tests can
 *                   pass any path; production callers pass the real on-disk
 *                   location.
 */
export function parseAgentDefinition(markdown: string, sourcePath: string): ParseResult {
	const fmMatch = markdown.match(FRONTMATTER_RE)
	if (!fmMatch) {
		return {ok: false, err: 'missing YAML frontmatter'}
	}

	const fmText = fmMatch[1]
	const body = markdown.slice(fmMatch[0].length).trim()

	// FAILSAFE_SCHEMA prevents YAML's permissive type coercion + custom tags.
	// Result is a plain object with string / array / object values only.
	let fmRaw: unknown
	try {
		fmRaw = yaml.load(fmText, {schema: yaml.FAILSAFE_SCHEMA})
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		return {ok: false, err: `invalid YAML frontmatter: ${msg}`}
	}

	if (fmRaw === null || typeof fmRaw !== 'object' || Array.isArray(fmRaw)) {
		return {ok: false, err: 'invalid YAML frontmatter: expected object at top level'}
	}

	const fm = fmRaw as Record<string, unknown>

	// Required: name
	const nameRes = coerceString(fm.name, 'name')
	if (!nameRes.ok) return {ok: false, err: nameRes.err}
	const name = nameRes.value
	if (!name || name.trim() === '') {
		return {ok: false, err: 'missing required field: name'}
	}

	// Required: schedule
	const scheduleRes = coerceString(fm.schedule, 'schedule')
	if (!scheduleRes.ok) return {ok: false, err: scheduleRes.err}
	const schedule = scheduleRes.value
	if (!schedule || schedule.trim() === '') {
		return {ok: false, err: 'missing required field: schedule'}
	}
	if (!cron.validate(schedule)) {
		return {ok: false, err: `invalid cron expression: ${schedule}`}
	}

	// Required: model
	const modelRes = coerceString(fm.model, 'model')
	if (!modelRes.ok) return {ok: false, err: modelRes.err}
	const model = modelRes.value
	if (!model || model.trim() === '') {
		return {ok: false, err: 'missing required field: model'}
	}

	// Optional: max_turns
	const maxTurnsRes = coerceNumber(fm.max_turns, 'max_turns')
	if (!maxTurnsRes.ok) return {ok: false, err: maxTurnsRes.err}
	const maxTurns = maxTurnsRes.value ?? DEFAULT_MAX_TURNS

	// Optional: max_budget_usd
	const maxBudgetRes = coerceNumber(fm.max_budget_usd, 'max_budget_usd')
	if (!maxBudgetRes.ok) return {ok: false, err: maxBudgetRes.err}
	const maxBudgetUsd = maxBudgetRes.value ?? DEFAULT_MAX_BUDGET_USD

	// Optional: allowed_tools
	const toolsRes = coerceStringArray(fm.allowed_tools, 'allowed_tools')
	if (!toolsRes.ok) return {ok: false, err: toolsRes.err}
	const allowedTools = toolsRes.value ?? [...DEFAULT_ALLOWED_TOOLS]

	// Optional: mcp_servers
	const mcpRes = coerceStringArray(fm.mcp_servers, 'mcp_servers')
	if (!mcpRes.ok) return {ok: false, err: mcpRes.err}
	const mcpServers = mcpRes.value ?? [...DEFAULT_MCP_SERVERS]

	// Optional: enabled
	const enabledRes = coerceBoolean(fm.enabled, 'enabled')
	if (!enabledRes.ok) return {ok: false, err: enabledRes.err}
	const enabled = enabledRes.value ?? DEFAULT_ENABLED

	const definition: AgentDefinition = {
		name,
		schedule,
		model,
		maxTurns,
		maxBudgetUsd,
		allowedTools,
		mcpServers,
		enabled,
		body,
		sourcePath,
	}

	return {ok: true, definition}
}

/**
 * Walk a directory of agent-definition markdown files (typically
 * `<vault>/livos-agents/`) and parse each `.md` entry.
 *
 * Non-fatal contract: a broken file does NOT block other files. Errors
 * are aggregated into `errors`; successful parses into `ok`. Stable sort
 * on `definition.name` so the scheduler (164-02) registers cron jobs in
 * deterministic order across reboots.
 *
 * Missing directory: returns `{ok: [], errors: [{path: dir, err: '...'}]}`
 * — never throws.
 */
export async function parseAgentDefinitionsDir(dir: string): Promise<DirParseResult> {
	const ok: AgentDefinition[] = []
	const errors: ParseError[] = []

	let entries: Awaited<ReturnType<typeof readdir>>
	try {
		entries = await readdir(dir, {withFileTypes: true})
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		// ENOENT path: surface as a structured error instead of throwing.
		// The scheduler treats this as "no agents defined yet" — first-boot
		// behaviour when the user hasn't placed any agent files.
		return {ok: [], errors: [{path: dir, err: msg}]}
	}

	for (const entry of entries) {
		if (!entry.isFile()) continue
		if (!entry.name.endsWith('.md')) continue

		const filePath = path.join(dir, entry.name)
		let contents: string
		try {
			contents = await readFile(filePath, 'utf8')
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err)
			errors.push({path: filePath, err: `read failed: ${msg}`})
			continue
		}

		const result = parseAgentDefinition(contents, filePath)
		if (result.ok) {
			ok.push(result.definition)
		} else {
			errors.push({path: filePath, err: result.err})
		}
	}

	// Stable sort by definition.name so cron registration order is
	// reboot-deterministic (test 164-02 will rely on this).
	ok.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

	return {ok, errors}
}
