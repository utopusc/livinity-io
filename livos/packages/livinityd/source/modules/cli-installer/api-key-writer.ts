// Phase 267-01 Task 2 — per-CLI API-key writer (NO spawn, no terminal).
//
// `writeApiKey({name, key}, deps)` writes the operator-pasted API key to the
// target CLI's OWN config/env file, 0600, so the CLI is authenticated without
// any login spawn or device-code flow. This is the `branch:'apikey'` half of
// the no-terminal auth story (auth.ts streaming is the `branch:'device'` half).
//
// HARD SECURITY CONTRACT (267 must-haves + D-239-07):
//   1. The whitelist guard is the FIRST statement (RCE boundary). An unknown
//      `name` throws BEFORE any path is built or fs touched.
//   2. The key is NEVER logged, echoed, or returned. logger.* receives ONLY the
//      CLI name + the destination path — never `input.key`.
//   3. Every written file (and merged JSON/YAML) is chmod 0o600.
//   4. A non-'apikey' branch name (device/browser/n/a) throws — there is no
//      key-write target, so the caller must use the device/browser flow.
//
// Write-target map sourced verbatim from 267-RESEARCH "Headless creds write
// target" column. Three target kinds:
//   - 'env'  → write/merge a single `<ENV>=<key>` line into a dotenv file.
//   - 'json' → deep-merge `{...path: key}` into a JSON file (preserve siblings).
//   - 'goose-yaml' → write the goose `~/.config/goose/secrets.yaml` provider
//                    block (a 2-line `<env>: <key>` doc; goose reads flat keys).

import os from 'node:os'
import {getDesktopUser} from '../system/desktop-user.js'
import path from 'node:path'
import fsPromises from 'node:fs/promises'

import {SUPPORTED_CLIS_SET} from './install-scripts.js'
import {CLI_AUTH_METHODS} from './auth-methods.js'
import type {CliName, InstallerLogger} from './types.js'

/** 0600 — owner read/write only. Secrets MUST NOT be group/world readable. */
const SECRET_MODE = 0o600

/**
 * Target descriptor per apikey CLI.
 *
 * Phase 268-02 EXPORTS this (and WRITE_TARGETS below) so cli-uninstall.ts can
 * reuse each CLI's secret-file `relPath` to delete the 267 api-key on uninstall
 * (a re-install must not be silently pre-authed with a stale key).
 */
export type WriteTarget =
	| {kind: 'env'; relPath: string; envKey: string}
	| {kind: 'json'; relPath: string; keyPath: readonly string[]}
	| {kind: 'goose-yaml'; relPath: string; envKey: string}

/**
 * Per-CLI headless creds write target (267-RESEARCH). Keyed by CliName; ONLY
 * the `branch:'apikey'`-eligible CLIs appear. A name absent here (or whose
 * auth-methods branch is not 'apikey') is rejected by writeApiKey.
 *
 * Paths are relative to the resolved home dir (deps.homeDir ?? os.homedir()).
 */
export const WRITE_TARGETS: Partial<Record<CliName, WriteTarget>> = {
	// dotenv-style (single ENV=key line)
	gemini: {kind: 'env', relPath: '.gemini/.env', envKey: 'GEMINI_API_KEY'},
	'mistral-vibe': {kind: 'env', relPath: '.vibe/.env', envKey: 'MISTRAL_API_KEY'},
	codebuddy: {
		kind: 'env',
		relPath: '.codebuddy/.env',
		envKey: 'CODEBUDDY_API_KEY',
	},
	'factory-droid': {
		kind: 'env',
		relPath: '.factory/.env',
		envKey: 'FACTORY_API_KEY',
	},
	'cursor-agent': {kind: 'env', relPath: '.cursor/.env', envKey: 'CURSOR_API_KEY'},
	'claude-code': {kind: 'env', relPath: '.claude/.env', envKey: 'ANTHROPIC_API_KEY'},
	'hermes-agent': {
		kind: 'env',
		relPath: '.hermes/.env',
		envKey: 'OPENROUTER_API_KEY',
	},
	openclaw: {kind: 'env', relPath: '.openclaw/.env', envKey: 'ANTHROPIC_API_KEY'},
	'snow-cli': {kind: 'env', relPath: '.snow/.env', envKey: 'SNOW_API_KEY'},
	// JSON-merge (preserve existing siblings)
	'qwen-code': {
		kind: 'json',
		relPath: '.qwen/settings.json',
		keyPath: ['env', 'DASHSCOPE_API_KEY'],
	},
	nanobot: {
		kind: 'json',
		relPath: '.nanobot/config.json',
		keyPath: ['env', 'ANTHROPIC_API_KEY'],
	},
	opencode: {
		kind: 'json',
		relPath: '.local/share/opencode/auth.json',
		keyPath: ['openai', 'key'],
	},
	// goose secrets.yaml provider block
	goose: {
		kind: 'goose-yaml',
		relPath: '.config/goose/secrets.yaml',
		envKey: 'ANTHROPIC_API_KEY',
	},
}

export interface WriteApiKeyInput {
	name: CliName
	key: string
}

export interface WriteApiKeyDeps {
	logger: InstallerLogger
	/** Override the home dir (tests inject a tmp dir). Defaults to os.homedir(). */
	homeDir?: string
	/** Override fs (tests inject). Defaults to node:fs/promises. */
	fs?: Pick<typeof fsPromises, 'mkdir' | 'readFile' | 'writeFile' | 'chmod'>
}

export interface WriteApiKeyResult {
	ok: boolean
	/** The absolute path the key was written to (safe to log/return — NOT the key). */
	path: string
}

/** Escape a value for a dotenv line: wrap in double quotes, escape `"` and `\`. */
function dotenvQuote(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Set a nested key on a plain object, creating intermediate objects. Mutates+returns. */
function setNested(
	root: Record<string, unknown>,
	keyPath: readonly string[],
	value: string,
): Record<string, unknown> {
	let cursor = root
	for (let i = 0; i < keyPath.length - 1; i += 1) {
		const segment = keyPath[i]
		const existing = cursor[segment]
		if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
			cursor[segment] = {}
		}
		cursor = cursor[segment] as Record<string, unknown>
	}
	cursor[keyPath[keyPath.length - 1]] = value
	return root
}

/**
 * Merge a single ENV=key line into a dotenv file, preserving other lines.
 * If a line for `envKey` already exists, it is replaced; otherwise appended.
 */
function mergeDotenv(existing: string, envKey: string, key: string): string {
	const line = `${envKey}=${dotenvQuote(key)}`
	const lines = existing.length > 0 ? existing.split(/\r?\n/) : []
	const prefix = `${envKey}=`
	let replaced = false
	const out = lines.map((l) => {
		if (l.startsWith(prefix)) {
			replaced = true
			return line
		}
		return l
	})
	if (!replaced) {
		// Drop a trailing empty line before appending so we don't accrue blanks.
		while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
		out.push(line)
	}
	return `${out.filter((l, i) => !(l === '' && i === out.length - 1)).join('\n')}\n`
}

/**
 * Write an operator-pasted API key to the CLI's own config/env file (0600).
 *
 * THROWS:
 *   - whitelist guard (FIRST): name not in SUPPORTED_CLIS → 'CLI not in whitelist'
 *   - non-apikey branch:        auth-methods branch !== 'apikey' → 'API key not supported'
 *   - unmapped name:            apikey branch but no WRITE_TARGETS entry → 'No API-key write target'
 *
 * NEVER logs/echoes/returns the key — only the destination path.
 */
export async function writeApiKey(
	input: WriteApiKeyInput,
	deps: WriteApiKeyDeps,
): Promise<WriteApiKeyResult> {
	// 1. D-239-07 RCE BOUNDARY — whitelist guard MUST be first.
	if (!SUPPORTED_CLIS_SET.has(input.name)) {
		throw new Error(`CLI not in whitelist: ${String(input.name)}`)
	}

	// 2. Only CLIs with a real api-key write path may take a pasted key. That is
	//    every 'apikey'-branch CLI, PLUS a 'paste-back'-branch CLI that ALSO has a
	//    static WRITE_TARGETS entry — i.e. a CLI whose primary flow is paste-back
	//    but that keeps an API-key FALLBACK (268 WR-04: claude-code is paste-back
	//    with an ANTHROPIC_API_KEY → .claude/.env fallback the dialog can offer).
	//    device/browser/n-a CLIs (no WRITE_TARGETS entry) still throw.
	const method = CLI_AUTH_METHODS[input.name]
	const target = WRITE_TARGETS[input.name]
	const keyWriteAllowed =
		method.branch === 'apikey' || (method.branch === 'paste-back' && !!target)
	if (!keyWriteAllowed) {
		throw new Error(
			`API key not supported for ${input.name} (branch=${method.branch} — use the device/browser auth flow)`,
		)
	}

	if (!target) {
		throw new Error(`No API-key write target configured for ${input.name}`)
	}

	const fs = deps.fs ?? fsPromises
	const home = deps.homeDir ?? os.homedir() ?? process.env.HOME ?? `/home/${getDesktopUser()}`
	const absPath = path.join(home, target.relPath)
	const parentDir = path.dirname(absPath)

	// 3. mkdir -p the parent (recursive — harmless if it exists).
	await fs.mkdir(parentDir, {recursive: true})

	if (target.kind === 'env') {
		let existing = ''
		try {
			existing = await fs.readFile(absPath, 'utf8')
		} catch {
			/* file absent — start fresh */
		}
		const merged = mergeDotenv(existing, target.envKey, input.key)
		await fs.writeFile(absPath, merged, {mode: SECRET_MODE})
	} else if (target.kind === 'json') {
		let parsed: Record<string, unknown> = {}
		try {
			const raw = await fs.readFile(absPath, 'utf8')
			const decoded = JSON.parse(raw)
			if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
				parsed = decoded as Record<string, unknown>
			}
		} catch {
			/* absent or unparseable — start fresh */
		}
		setNested(parsed, target.keyPath, input.key)
		await fs.writeFile(absPath, `${JSON.stringify(parsed, null, 2)}\n`, {
			mode: SECRET_MODE,
		})
	} else {
		// goose-yaml — a flat `<env>: <key>` secrets doc. We do not pull in a YAML
		// dep; the doc is one scalar mapping which is valid YAML as a quoted line.
		const yaml = `${target.envKey}: ${JSON.stringify(input.key)}\n`
		await fs.writeFile(absPath, yaml, {mode: SECRET_MODE})
	}

	// 4. Belt-and-suspenders: re-assert 0600 even if the file pre-existed with
	//    a looser mode (writeFile mode only applies on create on some platforms).
	try {
		await fs.chmod(absPath, SECRET_MODE)
	} catch (err) {
		// Non-fatal on platforms without POSIX chmod (e.g. Windows dev). The file
		// was still created with the requested mode where supported.
		deps.logger.warn(
			`[cli-installer] chmod 0600 best-effort failed for ${input.name} at ${absPath}`,
			err,
		)
	}

	// NEVER log the key — only name + path.
	deps.logger.info(`[cli-installer] wrote API key for ${input.name} → ${absPath}`)
	return {ok: true, path: absPath}
}
