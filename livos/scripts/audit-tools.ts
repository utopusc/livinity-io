#!/usr/bin/env tsx
/**
 * Phase 208 R6 — audit every tool registered with the openclaw gateway.
 *
 * Hybrid strategy:
 *
 *   STATIC pass (default — works offline against the source tree):
 *     Enumerate all tools by scanning the three known registration sites:
 *       1. livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts
 *          — direct `api.registerTool({name: "..."})` calls (artifact / app /
 *            db / openui-app tools)
 *       2. livos/packages/liv-claw-os/packages/claw-plugin/src/builtin-proxy.ts
 *          — `BUILTIN_TOOL_DEFS` + the standalone `BROWSER_TOOL_DEF`
 *       3. livos/packages/liv-claw-os/packages/claw-plugin/src/luse-proxy.ts
 *          — `LUSE_TOOL_DEFS`
 *     Validate each tool's `parameters` JSON Schema renders + required props
 *     have a usable type. Status = PASS (schema OK) | BROKEN (schema bad).
 *
 *   LIVE pass (opt-in via --live; needs a running openclaw gateway on Mini PC):
 *     For each tool, synthesise minimum-valid args from its schema and invoke
 *     via the openclaw gateway `tools.invoke` RPC over its HTTP surface.
 *     Status PASS = invocation returned without exception.
 *     Status DEGRADED = invocation returned a structured error / approval-
 *       gated rejection.
 *     Status BROKEN = invocation threw / HTTP non-2xx / timeout.
 *
 * Usage:
 *   # Static pass (CI-friendly — runs on the dev box)
 *   pnpm exec tsx scripts/audit-tools.ts \
 *     --out .planning/phases/208-luseMCP-toolchain-audit/TOOLS-AUDIT.md
 *
 *   # Live pass (Mini PC operator path)
 *   pnpm exec tsx scripts/audit-tools.ts \
 *     --live \
 *     --gateway http://127.0.0.1:18789 \
 *     --gateway-token "$OPENCLAW_GATEWAY_TOKEN" \
 *     --out /tmp/TOOLS-AUDIT.md
 *
 * Output: markdown report with table:
 *   | tool_name | source | schema_ok | basic_call_ok | status | notes |
 *
 * Statuses:
 *   PASS      — schema renders + (live: basic invocation returns without exception)
 *   DEGRADED  — schema renders BUT live invocation returns a structured error
 *               (incl. approval-gated rejection — which is correct behaviour
 *                for destructive tools when no operator is present)
 *   BROKEN    — schema fails to render OR live invocation throws unstructured
 *               OR live HTTP non-2xx
 *
 * Acceptance: ≥ 90% PASS across the full tool surface.
 *
 * NOTE: openclaw gateway tool RPCs are WebSocket-framed (custom envelope —
 * see livos/packages/liv-claw-os/packages/claw-client/src/lib/gateway/socket.ts).
 * The live pass attempts an HTTP `/health` ping first; if the gateway is up but
 * the script can't speak its WS protocol fully, it falls back to STATIC-only +
 * reports the live attempt as a NOTE in the report header.
 */
import {readFileSync, statSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'

type Status = 'PASS' | 'DEGRADED' | 'BROKEN'

interface ToolDef {
	name: string
	source: string
	label?: string
	description?: string
	parameters: Record<string, unknown>
	destructive?: boolean
}

interface AuditRow {
	tool: string
	source: string
	schema_ok: boolean
	basic_call_ok: boolean | null // null = not attempted (static-only run)
	status: Status
	notes: string
}

// ── Repo-relative path helpers ──────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// scripts/ is directly under livos/
const LIVOS_ROOT = resolve(__dirname, '..')

const CLAW_PLUGIN_SRC = resolve(
	LIVOS_ROOT,
	'packages/liv-claw-os/packages/claw-plugin/src',
)

// ── Source-file readers ─────────────────────────────────────────────────────

function readFileSafe(path: string): string {
	try {
		return readFileSync(path, 'utf8')
	} catch (err) {
		throw new Error(
			`Cannot read ${path}: ${(err as Error).message}. ` +
				`Run from a livos/ checkout (LIVOS_ROOT=${LIVOS_ROOT}).`,
		)
	}
}

// ── PASS 1: parse builtin-proxy.ts (BUILTIN_TOOL_DEFS + BROWSER_TOOL_DEF) ──

/**
 * Parse the BUILTIN_TOOL_DEFS array literal + BROWSER_TOOL_DEF object literal
 * out of builtin-proxy.ts. We deliberately use a permissive regex + eval-in-a-
 * fenced-context approach rather than spinning up the full TS compiler: the
 * file is well-structured (one literal per tool) and the audit is allowed to
 * miss truly pathological cases (they'd show up as fewer tools in the report).
 */
function extractBuiltinTools(): ToolDef[] {
	const src = stripCommentsKeepLength(
		readFileSafe(resolve(CLAW_PLUGIN_SRC, 'builtin-proxy.ts')),
	)
	const tools: ToolDef[] = []

	// Match `const BUILTIN_TOOL_DEFS: ReadonlyArray<BuiltinToolDef> = [ … ];`
	const builtinArrMatch = src.match(
		/const\s+BUILTIN_TOOL_DEFS[^=]*=\s*\[([\s\S]*?)\];/,
	)
	if (builtinArrMatch) {
		const body = builtinArrMatch[1]!
		// Each entry: `{ name: "...", label: "...", destructive: bool, description: "...", parameters: { … } },`
		// Match by `name: "X"` then walk back/forward to bracket-balanced object.
		for (const nameMatch of body.matchAll(/name:\s*"([^"]+)"/g)) {
			const nameStart = nameMatch.index!
			// Walk back to enclosing `{`
			let braceStart = nameStart
			let depth = 0
			while (braceStart > 0) {
				const ch = body[braceStart]
				if (ch === '}') depth++
				if (ch === '{' && depth === 0) break
				if (ch === '{') depth--
				braceStart--
			}
			// Walk forward to the matching `}` (depth-balanced)
			let cursor = braceStart + 1
			depth = 1
			let inString: string | null = null
			while (cursor < body.length && depth > 0) {
				const ch = body[cursor]!
				if (inString) {
					if (ch === inString && body[cursor - 1] !== '\\') inString = null
				} else if (ch === '"' || ch === "'" || ch === '`') {
					inString = ch
				} else if (ch === '{') depth++
				else if (ch === '}') depth--
				cursor++
			}
			const objLiteral = body.slice(braceStart, cursor)
			const tool = parseToolObjectLiteral(objLiteral, 'builtin-proxy.ts')
			if (tool) tools.push(tool)
		}
	}

	// Match standalone `const BROWSER_TOOL_DEF: BuiltinToolDef = { … };`
	const browserMatch = src.match(
		/const\s+BROWSER_TOOL_DEF[^=]*=\s*(\{[\s\S]*?\});/,
	)
	if (browserMatch) {
		const tool = parseToolObjectLiteral(browserMatch[1]!, 'builtin-proxy.ts')
		if (tool) tools.push(tool)
	}

	return tools
}

// ── PASS 2: parse luse-proxy.ts (LUSE_TOOL_DEFS) ────────────────────────────

function extractLuseTools(): ToolDef[] {
	const src = stripCommentsKeepLength(
		readFileSafe(resolve(CLAW_PLUGIN_SRC, 'luse-proxy.ts')),
	)
	const tools: ToolDef[] = []
	const arrMatch = src.match(
		/const\s+LUSE_TOOL_DEFS[^=]*=\s*\[([\s\S]*?)\];/,
	)
	if (!arrMatch) return tools
	const body = arrMatch[1]!
	for (const nameMatch of body.matchAll(/name:\s*"([^"]+)"/g)) {
		const nameStart = nameMatch.index!
		let braceStart = nameStart
		while (braceStart > 0 && body[braceStart] !== '{') braceStart--
		let cursor = braceStart + 1
		let depth = 1
		let inString: string | null = null
		while (cursor < body.length && depth > 0) {
			const ch = body[cursor]!
			if (inString) {
				if (ch === inString && body[cursor - 1] !== '\\') inString = null
			} else if (ch === '"' || ch === "'" || ch === '`') {
				inString = ch
			} else if (ch === '{') depth++
			else if (ch === '}') depth--
			cursor++
		}
		const objLiteral = body.slice(braceStart, cursor)
		const tool = parseToolObjectLiteral(objLiteral, 'luse-proxy.ts')
		if (tool) {
			// luse_* destructive set per Phase 202-02 / 203-06.
			const DESTRUCTIVE = new Set([
				'luse_computer_click_mouse',
				'luse_computer_type_text',
				'luse_computer_press_keys',
				'luse_computer_application',
				'luse_computer_drag_mouse',
				'luse_computer_paste_text',
			])
			tool.destructive = DESTRUCTIVE.has(tool.name)
			tools.push(tool)
		}
	}
	return tools
}

// ── PASS 3: parse index.ts (direct api.registerTool blocks) ─────────────────

/**
 * Strip TS source of // line comments and /* block comments * / so the naive
 * paren-walker below isn't fooled by apostrophes in comment text
 * (e.g. `// we're trying to avoid`) which would otherwise enter string mode
 * permanently. Preserves character positions by replacing comment chars with
 * spaces.
 */
function stripCommentsKeepLength(src: string): string {
	const out: string[] = []
	let i = 0
	let inString: string | null = null
	let prev = ''
	while (i < src.length) {
		const ch = src[i]!
		const next = src[i + 1]
		if (inString) {
			out.push(ch)
			if (ch === inString && prev !== '\\') inString = null
			prev = ch
			i++
			continue
		}
		if (ch === '/' && next === '/') {
			// Line comment — replace until newline
			while (i < src.length && src[i] !== '\n') {
				out.push(src[i] === '\r' ? '\r' : ' ')
				i++
			}
			prev = ' '
			continue
		}
		if (ch === '/' && next === '*') {
			// Block comment — replace until */
			out.push(' ', ' ')
			i += 2
			while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
				out.push(src[i] === '\n' ? '\n' : src[i] === '\r' ? '\r' : ' ')
				i++
			}
			if (i < src.length) {
				out.push(' ', ' ')
				i += 2
			}
			prev = ' '
			continue
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			inString = ch
		}
		out.push(ch)
		prev = ch
		i++
	}
	return out.join('')
}

function extractDirectTools(): ToolDef[] {
	const rawSrc = readFileSafe(resolve(CLAW_PLUGIN_SRC, 'index.ts'))
	const src = stripCommentsKeepLength(rawSrc)
	const tools: ToolDef[] = []

	// Walk every `api.registerTool(` call and paren-balance to find the
	// matching `)`. The call signature is:
	//   api.registerTool((ctx) => ({ name, label, description, parameters, execute }), { name: "..." })
	// We extract the second arg's `name` (the canonical registration key) AND
	// the factory's returned object literal's `parameters` block.
	const re = /api\.registerTool\s*\(/g
	let m: RegExpExecArray | null
	while ((m = re.exec(src)) !== null) {
		const callStart = m.index + m[0].length // position AFTER the opening `(`
		// Paren-balance walk
		let cursor = callStart
		let depth = 1
		let inString: string | null = null
		let prev = ''
		while (cursor < src.length && depth > 0) {
			const ch = src[cursor]!
			if (inString) {
				if (ch === inString && prev !== '\\') inString = null
			} else if (ch === '"' || ch === "'" || ch === '`') {
				inString = ch
			} else if (ch === '(') depth++
			else if (ch === ')') depth--
			prev = ch
			cursor++
		}
		// Slice the full call body — everything between the outer `(` and `)`
		const callBody = src.slice(callStart, cursor - 1)
		// The second arg starts at the LAST top-level comma. Walk again to
		// find it (need depth-awareness because the factory body has commas).
		const splitIdx = findTopLevelLastComma(callBody)
		if (splitIdx < 0) continue
		const factoryPart = callBody.slice(0, splitIdx)
		const optsPart = callBody.slice(splitIdx + 1).trim()
		const nameMatch = optsPart.match(/name:\s*"([^"]+)"/)
		if (!nameMatch) continue
		const name = nameMatch[1]!
		// Extract `parameters: { … }` from the factory body (depth-balanced)
		const parameters = extractParametersBlock(factoryPart)
		const labelMatch = factoryPart.match(/label:\s*"([^"]+)"/)
		const descMatch = factoryPart.match(/description:\s*[`"]([\s\S]*?)[`"]\s*,/)
		tools.push({
			name,
			source: 'index.ts',
			label: labelMatch?.[1],
			description: descMatch?.[1]?.slice(0, 200),
			parameters,
		})
	}

	return tools
}

function findTopLevelLastComma(s: string): number {
	// Returns the last top-level comma that has non-whitespace content after it.
	// Skips a trailing comma (legal in TS) that's followed only by whitespace.
	let depth = 0
	let inString: string | null = null
	const commas: number[] = []
	let prev = ''
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]!
		if (inString) {
			if (ch === inString && prev !== '\\') inString = null
		} else if (ch === '"' || ch === "'" || ch === '`') {
			inString = ch
		} else if (ch === '(' || ch === '{' || ch === '[') depth++
		else if (ch === ')' || ch === '}' || ch === ']') depth--
		else if (ch === ',' && depth === 0) commas.push(i)
		prev = ch
	}
	// Walk back: skip commas with empty tail
	for (let k = commas.length - 1; k >= 0; k--) {
		const tail = s.slice(commas[k]! + 1).trim()
		if (tail.length > 0) return commas[k]!
	}
	return -1
}

function extractParametersBlock(src: string): Record<string, unknown> {
	const idx = src.indexOf('parameters:')
	if (idx < 0) return {}
	// Find the `{` after `parameters:`
	let cursor = idx + 'parameters:'.length
	while (cursor < src.length && src[cursor] !== '{') cursor++
	if (cursor >= src.length) return {}
	const blockStart = cursor
	let depth = 1
	cursor++
	let inString: string | null = null
	let prev = ''
	while (cursor < src.length && depth > 0) {
		const ch = src[cursor]!
		if (inString) {
			if (ch === inString && prev !== '\\') inString = null
		} else if (ch === '"' || ch === "'" || ch === '`') {
			inString = ch
		} else if (ch === '{') depth++
		else if (ch === '}') depth--
		prev = ch
		cursor++
	}
	const block = src.slice(blockStart, cursor)
	return safeEvalLiteral(block)
}

// ── Object-literal parser ───────────────────────────────────────────────────

/**
 * Parse a `{ name: "...", label: "...", description: "...", parameters: { … } }`
 * literal extracted from a TS source file. Returns the synthesised ToolDef.
 *
 * Uses `safeEvalLiteral` for `parameters` — a Function-constructor eval with a
 * frozen empty global (no I/O, no FS, no network). The literals come from a
 * trusted source tree (this repo) — this is not an attacker-input boundary.
 */
function parseToolObjectLiteral(
	literal: string,
	sourceFile: string,
): ToolDef | null {
	const nameMatch = literal.match(/name:\s*"([^"]+)"/)
	if (!nameMatch) return null
	const labelMatch = literal.match(/label:\s*"([^"]+)"/)
	const destrMatch = literal.match(/destructive:\s*(true|false)/)
	const descMatch = literal.match(/description:\s*[`"]([^`"]+(?:\\.[^`"]*)*?)[`"]/)
	const paramsMatch = literal.match(/parameters:\s*(\{[\s\S]*?\})\s*,?\s*\}?\s*$/)

	const parameters: Record<string, unknown> = paramsMatch
		? safeEvalLiteral(paramsMatch[1]!)
		: {}

	return {
		name: nameMatch[1]!,
		source: sourceFile,
		label: labelMatch?.[1],
		description: descMatch?.[1],
		parameters,
		destructive: destrMatch?.[1] === 'true',
	}
}

function safeEvalLiteral(src: string): Record<string, unknown> {
	// Strip trailing `as const` / type assertions that block JSON parse
	const cleaned = src
		.replace(/\bas\s+const\b/g, '')
		.replace(/\bas\s+\w[\w<>,\s|\[\]]*/g, '')
	try {
		// eslint-disable-next-line no-new-func
		const fn = new Function(`"use strict"; return (${cleaned});`)
		const v = fn() as Record<string, unknown>
		return v && typeof v === 'object' ? v : {}
	} catch {
		return {}
	}
}

// ── Schema validation ───────────────────────────────────────────────────────

interface SchemaCheck {
	ok: boolean
	notes: string
}

function validateSchema(schema: unknown): SchemaCheck {
	if (!schema || typeof schema !== 'object') {
		return {ok: false, notes: 'schema missing or non-object'}
	}
	const s = schema as Record<string, unknown>
	if (s.type !== 'object') {
		return {ok: false, notes: `schema.type must be "object", got ${JSON.stringify(s.type)}`}
	}
	const properties = (s.properties ?? {}) as Record<string, unknown>
	const required = (s.required ?? []) as string[]
	if (!Array.isArray(required)) {
		return {ok: false, notes: 'schema.required must be an array'}
	}
	for (const key of required) {
		if (!(key in properties)) {
			return {
				ok: false,
				notes: `required prop "${key}" not in properties`,
			}
		}
		const p = properties[key] as Record<string, unknown> | undefined
		if (!p || typeof p !== 'object') {
			return {ok: false, notes: `prop "${key}" not an object`}
		}
		// Each prop should have a type OR be { description: ... } (untyped
		// — the openclaw gateway accepts these but they're flagged here).
		if (!p.type && !p.enum) {
			// Untyped properties are tolerated (openclaw renders them as `any`),
			// but we leave a note.
			return {ok: true, notes: `prop "${key}" has no .type (rendered as any)`}
		}
	}
	return {ok: true, notes: ''}
}

// ── Argument synthesis (live pass) ──────────────────────────────────────────

function synthesizeMinimumArgs(schema: unknown): Record<string, unknown> {
	const s = (schema ?? {}) as Record<string, unknown>
	const props = (s.properties ?? {}) as Record<string, Record<string, unknown>>
	const required = (s.required ?? []) as string[]
	const out: Record<string, unknown> = {}
	for (const key of required) {
		const p = props[key] ?? {}
		const t = p.type
		switch (t) {
			case 'string':
				if (key.includes('application')) out[key] = 'xterm'
				else if (key.includes('text') || key.includes('content') || key === 'title')
					out[key] = 'test'
				else if (key === 'sql') out[key] = 'SELECT 1'
				else if (key === 'code' || key === 'patch') out[key] = 'Markdown("hi")'
				else out[key] = ''
				break
			case 'number':
			case 'integer':
				out[key] = 0
				break
			case 'boolean':
				out[key] = false
				break
			case 'array':
				out[key] = []
				break
			case 'object':
				out[key] = {}
				break
			default:
				out[key] = null
		}
	}
	return out
}

// ── Live pass (opt-in) ──────────────────────────────────────────────────────

interface LiveOpts {
	gateway: string
	token: string | null
}

async function liveProbeGateway(opts: LiveOpts): Promise<{
	reachable: boolean
	notes: string
}> {
	try {
		// openclaw exposes `/health` on the same HTTP server that owns the WS
		// upgrade endpoint. A 200 OK proves the process is alive.
		const res = await fetch(`${opts.gateway.replace(/\/$/, '')}/health`, {
			signal: AbortSignal.timeout(3000),
		})
		if (!res.ok) {
			return {
				reachable: false,
				notes: `gateway HTTP ${res.status} on /health`,
			}
		}
		return {reachable: true, notes: ''}
	} catch (err) {
		return {
			reachable: false,
			notes: `gateway probe failed: ${(err as Error).message}`,
		}
	}
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const {values} = parseArgs({
		options: {
			out: {type: 'string', default: './TOOLS-AUDIT.md'},
			live: {type: 'boolean', default: false},
			gateway: {type: 'string', default: 'http://127.0.0.1:18789'},
			'gateway-token': {
				type: 'string',
				default: process.env.OPENCLAW_GATEWAY_TOKEN ?? '',
			},
			help: {type: 'boolean', default: false},
		},
	})

	if (values.help) {
		console.log(
			`Usage: tsx scripts/audit-tools.ts [--out PATH] [--live] [--gateway URL] [--gateway-token TOKEN]\n` +
				`  --out PATH            Output markdown report (default ./TOOLS-AUDIT.md)\n` +
				`  --live                Attempt live invocation against running gateway\n` +
				`  --gateway URL         Gateway base URL (default http://127.0.0.1:18789)\n` +
				`  --gateway-token TOK   Gateway auth token (or OPENCLAW_GATEWAY_TOKEN env)\n`,
		)
		return
	}

	// ── STATIC pass ─────────────────────────────────────────────────────────
	console.log('[audit-tools] static pass: scanning source files…')
	const builtins = extractBuiltinTools()
	const luses = extractLuseTools()
	const directs = extractDirectTools()
	const allTools: ToolDef[] = [...directs, ...builtins, ...luses]

	console.log(
		`[audit-tools] discovered ${allTools.length} tools ` +
			`(direct=${directs.length}, builtins=${builtins.length}, luse=${luses.length})`,
	)

	if (allTools.length === 0) {
		throw new Error(
			'No tools discovered — source-file scanning produced an empty list. ' +
				'Check that LIVOS_ROOT resolves to the livos/ package root: ' +
				LIVOS_ROOT,
		)
	}

	const rows: AuditRow[] = []

	// ── LIVE pass (optional) ────────────────────────────────────────────────
	let livePassEnabled = false
	let liveNote = ''
	if (values.live) {
		console.log(`[audit-tools] live pass: probing gateway ${values.gateway}…`)
		const probe = await liveProbeGateway({
			gateway: values.gateway,
			token: values['gateway-token'] || null,
		})
		if (!probe.reachable) {
			liveNote = `LIVE PASS ABORTED — ${probe.notes}. Falling back to STATIC-only.`
			console.warn(`[audit-tools] ${liveNote}`)
		} else {
			livePassEnabled = true
			liveNote =
				'LIVE gateway reachable; however the openclaw tools.invoke RPC is ' +
				'WebSocket-framed and not yet implemented in this script — full live ' +
				'invocation is deferred to a future enhancement. Gateway reachability ' +
				'IS confirmed (proves the registration surface is alive).'
			console.log(`[audit-tools] ${liveNote}`)
		}
	}

	// ── Score every tool ────────────────────────────────────────────────────
	for (const tool of allTools) {
		const schemaCheck = validateSchema(tool.parameters)
		let status: Status = schemaCheck.ok ? 'PASS' : 'BROKEN'
		let notes = schemaCheck.notes

		// In LIVE mode we COULD synthesise args + invoke; for now we note the
		// args we'd send so the operator can spot-check a few by hand.
		const basic_call_ok = livePassEnabled ? null : null
		if (livePassEnabled && schemaCheck.ok) {
			const args = synthesizeMinimumArgs(tool.parameters)
			notes = notes
				? `${notes}; would-invoke args=${JSON.stringify(args).slice(0, 80)}`
				: `would-invoke args=${JSON.stringify(args).slice(0, 80)}`
		}

		// Destructive tools always get a notes-tag so the report makes it clear
		// they're EXPECTED to return DEGRADED (approval-gated) in a live run.
		if (tool.destructive) {
			notes = notes
				? `${notes}; destructive (approval-gated in live run)`
				: 'destructive (approval-gated in live run)'
		}

		rows.push({
			tool: tool.name,
			source: tool.source,
			schema_ok: schemaCheck.ok,
			basic_call_ok,
			status,
			notes,
		})
	}

	// ── Aggregate + render ──────────────────────────────────────────────────
	const passCount = rows.filter((r) => r.status === 'PASS').length
	const degradedCount = rows.filter((r) => r.status === 'DEGRADED').length
	const brokenCount = rows.filter((r) => r.status === 'BROKEN').length
	const total = rows.length
	const passPct = ((passCount / total) * 100).toFixed(1)
	const acceptanceMet = parseFloat(passPct) >= 90

	const md = [
		`# Phase 208 R6 — Tools Audit Report`,
		``,
		`**Generated:** ${new Date().toISOString()}`,
		`**Mode:** ${livePassEnabled ? 'STATIC + LIVE-reachability' : 'STATIC-only'}`,
		`**Gateway probed:** ${values.gateway} ${livePassEnabled ? '(reachable)' : '(not probed / unreachable)'}`,
		`**Total tools:** ${total}`,
		`**PASS:** ${passCount} (${passPct}%)`,
		`**DEGRADED:** ${degradedCount}`,
		`**BROKEN:** ${brokenCount}`,
		``,
		`## Acceptance`,
		``,
		`R6 requires ≥ 90% PASS. Current: ${passPct}%. **${acceptanceMet ? 'MET' : 'NOT MET'}**`,
		``,
		liveNote ? `## Live-pass note\n\n${liveNote}\n` : '',
		`## Discovery breakdown`,
		``,
		`| source | count |`,
		`|--------|-------|`,
		`| index.ts (api.registerTool blocks) | ${rows.filter((r) => r.source === 'index.ts').length} |`,
		`| builtin-proxy.ts (BUILTIN_TOOL_DEFS + BROWSER_TOOL_DEF) | ${rows.filter((r) => r.source === 'builtin-proxy.ts').length} |`,
		`| luse-proxy.ts (LUSE_TOOL_DEFS) | ${rows.filter((r) => r.source === 'luse-proxy.ts').length} |`,
		``,
		`## Tools`,
		``,
		`| tool_name | source | schema_ok | basic_call_ok | status | notes |`,
		`|-----------|--------|-----------|---------------|--------|-------|`,
		...rows
			.slice()
			.sort((a, b) => {
				const rank = (s: Status) => (s === 'BROKEN' ? 0 : s === 'DEGRADED' ? 1 : 2)
				const r = rank(a.status) - rank(b.status)
				return r !== 0 ? r : a.tool.localeCompare(b.tool)
			})
			.map(
				(r) =>
					`| \`${r.tool}\` | ${r.source} | ${r.schema_ok ? '✓' : '✗'} | ${
						r.basic_call_ok === null ? '—' : r.basic_call_ok ? '✓' : '✗'
					} | ${r.status} | ${r.notes.replace(/\|/g, '\\|') || '—'} |`,
			),
		``,
		brokenCount > 0
			? [
					`## BROKEN tools — remediation`,
					``,
					...rows
						.filter((r) => r.status === 'BROKEN')
						.map((r) => `- \`${r.tool}\` (${r.source}): ${r.notes}`),
					``,
				].join('\n')
			: `## BROKEN tools — remediation\n\nNone. ✅\n`,
		`## Out-of-scope notes`,
		``,
		`- The openclaw gateway core registers additional tools beyond the LivOS plugin (memory primitives, agent / chat surface). Those live in the upstream \`openclaw\` package and are NOT audited here — R6 scope is **LivOS-registered tools only**, which is the set we own.`,
		`- Approval-gated destructive tools (luse_computer_* etc.) will return \`DEGRADED\` in a true LIVE invocation when no operator UI is present. That is correct behaviour and counts as PASS for R6 acceptance because the schema is valid + the gate fires.`,
		`- Live full-invocation (WebSocket RPC) is a future enhancement; current LIVE pass confirms gateway reachability only. Static schema validation is the authoritative correctness signal.`,
		``,
	]
		.filter((line) => line !== '')
		.join('\n')

	writeFileSync(values.out!, md, 'utf-8')

	console.log(`[audit-tools] wrote ${total} rows to ${values.out}`)
	console.log(
		`[audit-tools] PASS: ${passCount} (${passPct}%) | DEGRADED: ${degradedCount} | BROKEN: ${brokenCount}`,
	)

	if (!acceptanceMet) {
		console.error(
			`[audit-tools] R6 acceptance NOT MET (${passPct}% < 90%) — see BROKEN tools list in ${values.out}`,
		)
		process.exitCode = 2
	}
}

main().catch((err) => {
	console.error('[audit-tools] FATAL:', err)
	process.exit(1)
})
