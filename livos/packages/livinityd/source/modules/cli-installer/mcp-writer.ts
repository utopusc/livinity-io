// Liv-MCP CLI-picker — per-CLI MCP writer (file-write, NO spawn, no terminal).
//
// `writeLivMcpsToCli({cli, servers}, deps)` writes the Liv system MCP server
// definitions (luse, liv-system, liv-apps, liv-vault, liv-docker — read from
// Redis `liv:mcp:config` by the tRPC proc) into the TARGET CLI's OWN MCP config
// file, merged so existing servers + sibling keys are preserved. After this,
// running that CLI in a terminal (e.g. `claude`) sees the Liv tools — no manual
// per-tool add.
//
// This is the file-write sibling of api-key-writer.ts and shares its hard
// security contract:
//   1. The whitelist guard is the FIRST statement (D-239-07 RCE boundary). An
//      unknown `cli` throws BEFORE any path is built or fs touched.
//   2. A CLI with no MCP_TARGETS entry resolves to {supported:false} (NOT a
//      throw) — the picker can surface "this agent has no file-based MCP config"
//      gracefully. (aion-cli is API-driven via AionUi; nanobot has no per-user
//      config scope — both are intentionally absent from MCP_TARGETS.)
//   3. Config files are written 0600 — the Liv MCP env carries LIV_API_KEY, which
//      must never be group/world-readable (nor leak into a process list, which is
//      why we file-write instead of spawning the CLI's own `mcp add`).
//   4. NEVER overwrite a non-empty config that fails to parse — throw instead, so
//      a stray syntax error can never nuke the operator's existing CLI config.
//
// Per-CLI shapes (file path, container key, entry field names, discriminators)
// come from the per-cli-mcp-format research pass — see MCP_TARGETS below + each
// `notes`. Three serializers: 'json' (native), 'yaml' (js-yaml), 'toml'
// (smol-toml, lazy-loaded so JSON/YAML targets never depend on it).

import os from 'node:os'
import path from 'node:path'
import fsPromises from 'node:fs/promises'

import yaml from 'js-yaml'

import {SUPPORTED_CLIS_SET} from './install-scripts.js'
import type {CliName, InstallerLogger} from './types.js'

/** 0600 — owner read/write only. The Liv MCP env carries LIV_API_KEY. */
const SECRET_MODE = 0o600

/**
 * One Liv MCP server definition (subset of the Redis `liv:mcp:config` entry the
 * tRPC proc reads). Kept local to decouple the writer from the mcp-registrar
 * type graph (mirrors how api-key-writer stays self-contained).
 */
export interface LivMcpDef {
	name: string
	transport: 'stdio' | 'http'
	command?: string
	args?: string[]
	env?: Record<string, string>
	url?: string
}

export interface WriteLivMcpsToCliInput {
	cli: CliName
	servers: LivMcpDef[]
}

export interface WriteLivMcpsToCliDeps {
	logger: InstallerLogger
	/** Override the home dir (tests inject a tmp dir). Defaults to os.homedir(). */
	homeDir?: string
	/** Override fs (tests inject). Defaults to node:fs/promises. */
	fs?: Pick<typeof fsPromises, 'mkdir' | 'readFile' | 'writeFile' | 'chmod'>
}

export interface WriteLivMcpsToCliResult {
	ok: boolean
	/** False when the CLI has no MCP_TARGETS entry (no file-based per-user MCP config). */
	supported: boolean
	cli: CliName
	/** Absolute path written (safe to log/return — never contains secrets). */
	path?: string
	/** Server names written (added or refreshed) into the CLI config. */
	written: string[]
	/** Reserved — server names intentionally left untouched (none today; upsert). */
	skippedExisting: string[]
}

// ---------------------------------------------------------------------------
// Per-CLI target descriptors (research-backed). `toEntry(def)` builds the
// per-CLI VALUE stored at the server's slot. `keyBy` selects how the server is
// keyed: 'map' (name is the object/table key — the default) or 'arrayNameField'
// (mistral-vibe: an array-of-tables where the name lives inside the entry).
// ---------------------------------------------------------------------------

type McpFormat = 'json' | 'yaml' | 'toml'

interface McpTarget {
	format: McpFormat
	/** Config file path relative to the resolved home dir. */
	relPath: string
	/** Key path to the object/table (or array, for arrayNameField) holding servers. */
	containerPath: readonly string[]
	/** 'map' → container[name] = entry. 'arrayNameField' → array upsert by entry[nameField]. */
	keyBy?: 'map' | 'arrayNameField'
	/** For arrayNameField: which entry field carries the server name (vibe: 'name'). */
	nameField?: string
	/** Optional key normalizer (goose lowercases + restricts charset). */
	normalizeKey?: (name: string) => string
	/** Build the per-CLI entry VALUE from a Liv MCP def. */
	toEntry: (def: LivMcpDef) => Record<string, unknown>
}

/** Canonical `{command, args, env}` stdio entry (the most common JSON shape). */
function commandArgsEnv(def: LivMcpDef): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	if (def.command !== undefined) out.command = def.command
	if (def.args !== undefined) out.args = def.args
	if (def.env !== undefined && Object.keys(def.env).length > 0) out.env = def.env
	return out
}

/** `{type:'stdio', command, args, env}` — JSON CLIs that want an explicit stdio type. */
function stdioTyped(def: LivMcpDef): Record<string, unknown> {
	return {type: 'stdio', ...commandArgsEnv(def)}
}

const gooseKeyNormalize = (name: string): string =>
	name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')

/**
 * MCP_TARGETS — research-backed (per-cli-mcp-format pass, 2026-06-15). Keyed by
 * the internal CliName (SUPPORTED_CLIS). A name ABSENT here resolves to
 * {supported:false}:
 *   - aion-cli  → AionUi REST-driven (POST /api/mcp/servers); the "Liv AI"
 *                 one-click (installLivTools) already covers it.
 *   - nanobot   → no per-user/home config scope (DefaultConfigPath is .nanobot/
 *                 RELATIVE TO CWD) — a per-user file write would not be read.
 */
export const MCP_TARGETS: Partial<Record<CliName, McpTarget>> = {
	// ── JSON-merge, canonical mcpServers ──────────────────────────────────────
	'claude-code': {
		format: 'json',
		relPath: '.claude.json', // TOP-LEVEL mcpServers (user scope), NOT projects.*
		containerPath: ['mcpServers'],
		toEntry: stdioTyped,
	},
	gemini: {
		format: 'json',
		relPath: '.gemini/settings.json',
		containerPath: ['mcpServers'],
		toEntry: commandArgsEnv, // transport inferred from `command`
	},
	'qwen-code': {
		format: 'json',
		relPath: '.qwen/settings.json',
		containerPath: ['mcpServers'],
		toEntry: commandArgsEnv, // gemini fork
	},
	'cursor-agent': {
		format: 'json',
		relPath: '.cursor/mcp.json',
		containerPath: ['mcpServers'],
		toEntry: stdioTyped,
	},
	'github-copilot': {
		format: 'json',
		relPath: '.copilot/mcp-config.json',
		containerPath: ['mcpServers'],
		// discriminator is "local"; only PATH is inherited so env must be complete.
		toEntry: (def) => ({type: 'local', ...commandArgsEnv(def)}),
	},
	augment: {
		format: 'json',
		relPath: '.augment/settings.json',
		containerPath: ['mcpServers'],
		toEntry: stdioTyped,
	},
	codebuddy: {
		format: 'json',
		relPath: '.codebuddy/.mcp.json', // JSONC; type REQUIRED
		containerPath: ['mcpServers'],
		toEntry: stdioTyped,
	},
	'factory-droid': {
		format: 'json',
		relPath: '.factory/mcp.json',
		containerPath: ['mcpServers'],
		toEntry: stdioTyped, // disable via `disabled:true`; default enabled
	},
	'kimi-cli': {
		format: 'json',
		relPath: '.kimi/mcp.json', // NB: kimi-code variant uses ~/.kimi-code/mcp.json
		containerPath: ['mcpServers'],
		toEntry: commandArgsEnv,
	},
	'snow-cli': {
		format: 'json',
		relPath: '.snow/settings.json', // NOT the legacy mcp-config.json
		containerPath: ['mcpServers'],
		toEntry: (def) => ({type: 'stdio', ...commandArgsEnv(def), enabled: true}),
	},
	kiro: {
		format: 'json',
		relPath: '.kiro/settings/mcp.json',
		containerPath: ['mcpServers'],
		toEntry: (def) => ({...commandArgsEnv(def), disabled: false}),
	},
	'qoder-cli': {
		// MEDIUM confidence — container path inferred from docs; verify on box.
		format: 'json',
		relPath: '.qoder/settings.json',
		containerPath: ['mcpServers'],
		toEntry: commandArgsEnv,
	},
	openclaw: {
		format: 'json',
		relPath: '.openclaw/openclaw.json', // JSON5; nested mcp.servers
		containerPath: ['mcp', 'servers'],
		toEntry: (def) => ({...commandArgsEnv(def), enabled: true}),
	},

	// ── JSON-merge, opencode's distinctive shape ──────────────────────────────
	opencode: {
		format: 'json',
		relPath: '.config/opencode/opencode.json',
		containerPath: ['mcp'],
		// command is a SINGLE array (exe + args); env key is `environment`; type:'local'.
		toEntry: (def) => {
			const out: Record<string, unknown> = {
				type: 'local',
				command: [def.command, ...(def.args ?? [])].filter((x) => x !== undefined),
				enabled: true,
			}
			if (def.env !== undefined && Object.keys(def.env).length > 0) {
				out.environment = def.env
			}
			return out
		},
	},

	// ── YAML-merge ────────────────────────────────────────────────────────────
	goose: {
		format: 'yaml',
		relPath: '.config/goose/config.yaml',
		containerPath: ['extensions'],
		normalizeKey: gooseKeyNormalize,
		// goose uses unique field names: cmd (not command), envs (not env), + name.
		toEntry: (def) => ({
			enabled: true,
			type: 'stdio',
			name: def.name,
			cmd: def.command,
			args: def.args ?? [],
			envs: def.env ?? {},
			env_keys: [],
			timeout: 300,
		}),
	},
	'hermes-agent': {
		format: 'yaml',
		relPath: '.hermes/config.yaml',
		containerPath: ['mcp_servers'],
		toEntry: (def) => ({...commandArgsEnv(def), enabled: true}),
	},

	// ── TOML-merge ────────────────────────────────────────────────────────────
	codex: {
		format: 'toml',
		relPath: '.codex/config.toml',
		containerPath: ['mcp_servers'], // keyed table [mcp_servers.<name>]
		toEntry: commandArgsEnv, // env serializes as [mcp_servers.<name>.env]
	},
	'mistral-vibe': {
		format: 'toml',
		relPath: '.vibe/config.toml',
		containerPath: ['mcp_servers'], // ARRAY-OF-TABLES [[mcp_servers]]
		keyBy: 'arrayNameField',
		nameField: 'name',
		toEntry: (def) => ({transport: 'stdio', ...commandArgsEnv(def)}),
	},
}

/** The CLIs that have a file-based MCP config (the picker's selectable set). */
export const MCP_WRITABLE_CLIS: readonly CliName[] = Object.keys(MCP_TARGETS) as CliName[]

// ---------------------------------------------------------------------------
// Format engines — read → parse → upsert by name → serialize → write 0600.
// ---------------------------------------------------------------------------

/** Lazy-load smol-toml (variable specifier keeps tsc/esbuild from hard-requiring
 *  it for JSON/YAML targets). The dep ships in package.json; the box's pnpm
 *  install provides it. */
async function loadToml(): Promise<{
	parse: (s: string) => unknown
	stringify: (o: unknown) => string
}> {
	const spec = 'smol-toml'
	return (await import(spec)) as {
		parse: (s: string) => unknown
		stringify: (o: unknown) => string
	}
}

/** Navigate/create the container at keyPath inside a plain object root. */
function ensureContainer(
	root: Record<string, unknown>,
	keyPath: readonly string[],
): Record<string, unknown> {
	let cursor = root
	for (const segment of keyPath) {
		const existing = cursor[segment]
		if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
			cursor[segment] = {}
		}
		cursor = cursor[segment] as Record<string, unknown>
	}
	return cursor
}

/** Navigate to the parent of the final key + return the array at the final key. */
function ensureArrayContainer(
	root: Record<string, unknown>,
	keyPath: readonly string[],
): unknown[] {
	const parent = ensureContainer(root, keyPath.slice(0, -1))
	const last = keyPath[keyPath.length - 1]
	const existing = parent[last]
	if (!Array.isArray(existing)) parent[last] = []
	return parent[last] as unknown[]
}

/**
 * Parse an existing config file into a plain object. Empty/absent → {}. A
 * NON-empty file that fails to parse THROWS (never silently overwritten — that
 * would nuke the operator's real config).
 */
async function readConfigObject(
	fs: NonNullable<WriteLivMcpsToCliDeps['fs']>,
	absPath: string,
	format: McpFormat,
): Promise<Record<string, unknown>> {
	let raw: string
	try {
		raw = await fs.readFile(absPath, 'utf8')
	} catch {
		return {} // absent
	}
	if (!raw.trim()) return {}
	let parsed: unknown
	try {
		if (format === 'yaml') parsed = yaml.load(raw)
		else if (format === 'toml') parsed = (await loadToml()).parse(raw)
		else parsed = JSON.parse(raw)
	} catch (err) {
		throw new Error(
			`existing config at ${absPath} is not valid ${format.toUpperCase()} — refusing to overwrite (fix or remove it, then retry): ${
				err instanceof Error ? err.message : String(err)
			}`,
		)
	}
	if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
		return parsed as Record<string, unknown>
	}
	// A scalar/array top level is not a config object we can merge into safely.
	return {}
}

async function serialize(root: Record<string, unknown>, format: McpFormat): Promise<string> {
	if (format === 'yaml') return yaml.dump(root, {lineWidth: -1})
	if (format === 'toml') return (await loadToml()).stringify(root)
	return `${JSON.stringify(root, null, 2)}\n`
}

/**
 * Write the Liv MCP servers into the target CLI's config (file-write, 0600).
 *
 * THROWS on: the whitelist guard (RCE boundary); an unparseable existing config
 * (data-loss guard). A CLI with no MCP_TARGETS entry returns {supported:false}.
 * Never logs/echoes any server env value — only the destination path + names.
 */
export async function writeLivMcpsToCli(
	input: WriteLivMcpsToCliInput,
	deps: WriteLivMcpsToCliDeps,
): Promise<WriteLivMcpsToCliResult> {
	// 1. D-239-07 RCE BOUNDARY — whitelist guard MUST be first.
	if (!SUPPORTED_CLIS_SET.has(input.cli)) {
		throw new Error(`CLI not in whitelist: ${String(input.cli)}`)
	}

	const target = MCP_TARGETS[input.cli]
	if (!target) {
		deps.logger.info(
			`[cli-installer] writeLivMcpsToCli: ${input.cli} has no file-based MCP config target — skipping (supported:false)`,
		)
		return {ok: true, supported: false, cli: input.cli, written: [], skippedExisting: []}
	}

	const fs = deps.fs ?? fsPromises
	const home = deps.homeDir ?? os.homedir() ?? process.env.HOME ?? '/home/bruce'
	const absPath = path.join(home, target.relPath)
	await fs.mkdir(path.dirname(absPath), {recursive: true})

	const root = await readConfigObject(fs, absPath, target.format)
	const written: string[] = []

	if (target.keyBy === 'arrayNameField') {
		const arr = ensureArrayContainer(root, target.containerPath)
		const nameField = target.nameField ?? 'name'
		for (const def of input.servers) {
			if (def.transport === 'stdio' && !def.command) {
				deps.logger.warn(`[cli-installer] ${input.cli}: ${def.name} has no command — skipping`)
				continue
			}
			const entry = {[nameField]: def.name, ...target.toEntry(def)}
			const idx = arr.findIndex(
				(e) =>
					e !== null &&
					typeof e === 'object' &&
					(e as Record<string, unknown>)[nameField] === def.name,
			)
			if (idx >= 0) arr[idx] = entry
			else arr.push(entry)
			written.push(def.name)
		}
	} else {
		const container = ensureContainer(root, target.containerPath)
		for (const def of input.servers) {
			if (def.transport === 'stdio' && !def.command) {
				deps.logger.warn(`[cli-installer] ${input.cli}: ${def.name} has no command — skipping`)
				continue
			}
			const key = target.normalizeKey ? target.normalizeKey(def.name) : def.name
			container[key] = target.toEntry(def)
			written.push(def.name)
		}
	}

	const out = await serialize(root, target.format)
	await fs.writeFile(absPath, out, {mode: SECRET_MODE})

	// Belt-and-suspenders: re-assert 0600 even if the file pre-existed looser.
	try {
		await fs.chmod(absPath, SECRET_MODE)
	} catch (err) {
		deps.logger.warn(
			`[cli-installer] chmod 0600 best-effort failed for ${input.cli} MCP config at ${absPath}`,
			err,
		)
	}

	deps.logger.info(
		`[cli-installer] wrote ${written.length} Liv MCP(s) for ${input.cli} → ${absPath}`,
	)
	return {ok: true, supported: true, cli: input.cli, path: absPath, written, skippedExisting: []}
}
