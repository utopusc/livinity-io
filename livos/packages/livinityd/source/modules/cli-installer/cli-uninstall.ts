// Phase 268-02 Task 1 — per-install-method CLI uninstall.
//
// Phase 267 added install + auth but no uninstall. The install method is
// STATICALLY known per CLI (every `scripts/install/cli/<name>.sh` is fixed),
// and the installer persists NO method record — so uninstall INFERS the method
// from a static `CLI_UNINSTALL` map (268-RESEARCH §C), mirroring the drift-
// locked `CLI_AUTH_METHODS` matrix.
//
// HARD SECURITY CONTRACT (D-239-07 + 268-RESEARCH §C / Pitfall E-5):
//   1. The whitelist guard (`SUPPORTED_CLIS_SET.has(input.name)`) is the FIRST
//      statement of uninstallCli (RCE boundary). pkg names + rm paths come ONLY
//      from the static CLI_UNINSTALL map (+ static WRITE_TARGETS relPaths) —
//      NEVER from a request string beyond the enum-gated `name`.
//   2. argv-array spawn (no shell, no string interpolation) for npm/pip kinds.
//   3. rm-bin / rm-paths remove ONLY the STATIC known install paths — NEVER
//      `command -v <bin>` then rm. snow-cli's `snow` collides with Snowflake
//      CLI's `snow`; we only delete `~/.local/bin/snow`, `~/.npm-global/bin/snow`,
//      and the build dir — never a system `snow` (E-5).
//   4. aion-cli is `{kind:'none'}` → refused/no-op (it is AionUi's embedded
//      backend; removing the standalone bin would NOT drop the agent and risks
//      breaking Liv AI). Mirrors auth's aion-cli short-circuit.
//   5. The 0600 267 api-key file (WRITE_TARGETS relPath) + the CLI's config dir
//      are deleted on uninstall so a re-install isn't silently pre-authed with a
//      stale key. We delete the secret FILE but log ONLY name + static paths —
//      never the secret CONTENTS.
//   6. npm/pip spawn never throws on subprocess failure — it resolves a
//      structured {ok:false} so the tRPC layer (plan 03) renders the error.

import os from 'node:os'
import path from 'node:path'
import fsPromises from 'node:fs/promises'
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'

import {SUPPORTED_CLIS, SUPPORTED_CLIS_SET} from './install-scripts.js'
import {WRITE_TARGETS} from './api-key-writer.js'
import type {CliName, InstallerLogger} from './types.js'

/** 5-minute uninstall timeout (mirrors installer.ts INSTALL_TIMEOUT_MS). */
export const UNINSTALL_TIMEOUT_MS = 300_000

const OUTPUT_CAP_BYTES = 32 * 1024

/**
 * Static per-CLI uninstall spec — a discriminated union over the install method:
 *   - `npm-global` — `npm uninstall -g --prefix ~/.npm-global <pkg>`
 *   - `rm-bin`     — `rm` the curl-installed binary path(s) + config dir(s)
 *   - `pip`        — `pip3 uninstall -y <pkg>`
 *   - `rm-paths`   — `rm` the build-from-source / pnpm-shim install path(s)
 *                    (some absolute, e.g. openclaw's /opt/livos/bin) + config dir(s)
 *   - `none`       — NOT uninstallable (aion-cli embedded backend) — refuse/no-op
 *
 * `binRelPaths` / `relPaths` are relative to the resolved home dir UNLESS they
 * start with `/` (absolute, used as-is — openclaw's pnpm-shim). `configRelDirs`
 * are always home-relative dirs removed recursively.
 */
export type UninstallSpec =
	| {kind: 'npm-global'; pkg: string; configRelDirs?: readonly string[]}
	| {kind: 'rm-bin'; binRelPaths: readonly string[]; configRelDirs?: readonly string[]}
	| {kind: 'pip'; pkg: string; configRelDirs?: readonly string[]}
	| {kind: 'rm-paths'; relPaths: readonly string[]; configRelDirs?: readonly string[]}
	| {kind: 'none'; reason: string}

/**
 * THE uninstall map. 20 keys, one per SUPPORTED_CLIS name (drift-locked below).
 * Sourced verbatim from 268-RESEARCH §C (the install-method → uninstall table).
 * pkg names + paths are static — never derived from request strings (D-239-07).
 */
export const CLI_UNINSTALL: Readonly<Record<CliName, UninstallSpec>> = {
	// rm-bin (curl-installer → ~/.local/bin) + config dir
	'claude-code': {kind: 'rm-bin', binRelPaths: ['.local/bin/claude'], configRelDirs: ['.claude']},
	opencode: {kind: 'rm-bin', binRelPaths: ['.opencode/bin/opencode'], configRelDirs: ['.opencode']},
	// npm-global (--prefix ~/.npm-global)
	gemini: {kind: 'npm-global', pkg: '@google/gemini-cli'},
	// rm-paths (pnpm-shim — openclaw's /opt/livos/bin/openclaw is ABSOLUTE) + config dir
	openclaw: {kind: 'rm-paths', relPaths: ['/opt/livos/bin/openclaw'], configRelDirs: ['.openclaw']},
	// none — NOT uninstallable (AionUi embedded backend)
	'aion-cli': {
		kind: 'none',
		reason:
			'AionUi embedded backend — removing the standalone bin does not remove the agent and risks breaking Liv AI',
	},
	// Wave A — npm-global
	codex: {kind: 'npm-global', pkg: '@openai/codex'},
	'qwen-code': {kind: 'npm-global', pkg: '@qwen-code/qwen-code'},
	augment: {kind: 'npm-global', pkg: '@augmentcode/auggie'},
	// WR-03 — the standalone `@github/copilot` CLI stores its login token under
	// ~/.copilot; remove it so a re-install isn't silently pre-authed (it has no
	// WRITE_TARGETS api-key entry, so the config dir is the only stale-cred path).
	'github-copilot': {kind: 'npm-global', pkg: '@github/copilot', configRelDirs: ['.copilot']},
	codebuddy: {kind: 'npm-global', pkg: '@tencent-ai/codebuddy-code'},
	'qoder-cli': {kind: 'npm-global', pkg: '@qoder-ai/qodercli'},
	// Wave B — rm-bin (curl-installer → ~/.local/bin) + config dir
	goose: {kind: 'rm-bin', binRelPaths: ['.local/bin/goose'], configRelDirs: ['.config/goose']},
	'factory-droid': {kind: 'rm-bin', binRelPaths: ['.local/bin/droid'], configRelDirs: ['.factory']},
	'cursor-agent': {
		kind: 'rm-bin',
		binRelPaths: ['.local/bin/cursor-agent'],
		configRelDirs: ['.cursor'],
	},
	// Wave C
	'kimi-cli': {
		kind: 'rm-bin',
		binRelPaths: ['.local/bin/kimi', '.cargo/bin/kimi'],
		configRelDirs: ['.kimi-code'],
	},
	'mistral-vibe': {kind: 'rm-bin', binRelPaths: ['.local/bin/vibe'], configRelDirs: ['.vibe']},
	'hermes-agent': {kind: 'rm-bin', binRelPaths: ['.local/bin/hermes'], configRelDirs: ['.hermes']},
	// pip --user
	nanobot: {kind: 'pip', pkg: 'nanobot-ai'},
	// rm-paths (build-from-source + npm-link — snow collides with Snowflake CLI, E-5) + config dir
	'snow-cli': {
		kind: 'rm-paths',
		relPaths: ['.local/bin/snow', '.npm-global/bin/snow', '.livos-cli/snow-cli'],
		configRelDirs: ['.snow'],
	},
	// rm-bin (fail-closed installer — best-effort) + config dir
	kiro: {kind: 'rm-bin', binRelPaths: ['.local/bin/kiro'], configRelDirs: ['.kiro']},
}

// Eager drift-lock: a new CLI can never enter the whitelist without an explicit
// uninstall classification (and vice-versa). Mirrors auth-methods.ts verbatim.
const UNINSTALL_KEY_COUNT = Object.keys(CLI_UNINSTALL).length
if (UNINSTALL_KEY_COUNT !== SUPPORTED_CLIS.length) {
	throw new Error(
		`CLI_UNINSTALL drift: ${UNINSTALL_KEY_COUNT} keys vs ${SUPPORTED_CLIS.length} SUPPORTED_CLIS — every CLI must have an explicit uninstall classification`,
	)
}

/** DI surface — tests inject fake spawn/fs; production uses node built-ins. */
export interface UninstallCliDeps {
	logger: InstallerLogger
	/** Override the home dir (tests inject). Defaults to os.homedir(). */
	homeDir?: string
	/** Override fs (tests inject). Defaults to node:fs/promises (only `rm` used). */
	fs?: Pick<typeof fsPromises, 'rm'>
	/** Optional spawn override (vitest injects a fake). Defaults to node:child_process. */
	spawnFn?: typeof nodeSpawn
}

export interface UninstallResult {
	ok: boolean
	/** Combined stdout + stderr (npm/pip; capped 32KB) OR `removed: <paths>` (rm kinds). */
	output: string
	/** Process exit code (npm/pip); 0 for rm kinds; -1 on timeout/spawn-fail/none. */
	exitCode: number
	/** Wall-clock ms from start to completion. */
	durationMs: number
	/** true when the CLI is `{kind:'none'}` (aion-cli) — refused/no-op. */
	skipped?: boolean
}

/**
 * Combine accumulated stdout + stderr chunks into a single output string,
 * keeping at most the last OUTPUT_CAP_BYTES bytes (copied from installer.ts).
 */
function joinTail(chunks: Buffer[]): string {
	const total = Buffer.concat(chunks)
	const sliced =
		total.length > OUTPUT_CAP_BYTES ? total.subarray(total.length - OUTPUT_CAP_BYTES) : total
	return sliced.toString('utf8')
}

/**
 * Run an argv-array spawn (npm/pip uninstall) with the same non-throwing
 * skeleton as installer.ts: 5-min SIGKILL timeout, 32KB output cap, structured
 * resolve (never throws on subprocess failure).
 */
async function runSpawnUninstall(
	spawn: typeof nodeSpawn,
	cmd: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv,
	logger: InstallerLogger,
	name: CliName,
): Promise<UninstallResult> {
	const startMs = Date.now()
	return new Promise<UninstallResult>((resolve) => {
		let settled = false
		const stdoutChunks: Buffer[] = []
		const stderrChunks: Buffer[] = []

		let child: ChildProcess
		try {
			child = spawn(cmd, args as string[], {env})
		} catch (spawnErr) {
			const durationMs = Date.now() - startMs
			logger.error(`[cli-installer] uninstall spawn failed for ${name}`, spawnErr)
			resolve({
				ok: false,
				output: `===SPAWN-FAILED=== ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`,
				exitCode: -1,
				durationMs,
			})
			return
		}

		const timeoutHandle = setTimeout(() => {
			if (settled) return
			settled = true
			try {
				child.kill('SIGKILL')
			} catch {
				/* swallow — best-effort kill */
			}
			const durationMs = Date.now() - startMs
			const tail = joinTail([...stdoutChunks, ...stderrChunks])
			logger.warn(`[cli-installer] uninstall TIMEOUT after ${UNINSTALL_TIMEOUT_MS}ms: ${name}`)
			resolve({
				ok: false,
				output: `===TIMEOUT=== ${name} exceeded ${UNINSTALL_TIMEOUT_MS}ms\n${tail}`,
				exitCode: -1,
				durationMs,
			})
		}, UNINSTALL_TIMEOUT_MS)

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
		})
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
		})

		;(child as unknown as NodeJS.EventEmitter).on('exit', (code: number | null) => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			const exitCode = typeof code === 'number' ? code : -1
			const durationMs = Date.now() - startMs
			const output = joinTail([...stdoutChunks, ...stderrChunks])
			logger.info(`[cli-installer] uninstall exit ${exitCode} for ${name} (${durationMs}ms)`)
			resolve({ok: exitCode === 0, output, exitCode, durationMs})
		})

		;(child as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			const durationMs = Date.now() - startMs
			logger.error(`[cli-installer] uninstall child error for ${name}`, err)
			resolve({
				ok: false,
				output: `===CHILD-ERROR=== ${err.message}`,
				exitCode: -1,
				durationMs,
			})
		})
	})
}

/**
 * Resolve an absolute path for a spec path: a leading `/` means it is already
 * absolute (openclaw's pnpm-shim /opt/livos/bin/openclaw); otherwise join under
 * the resolved home dir. STATIC input only — never a request string.
 */
function resolveUninstallPath(home: string, relOrAbs: string): string {
	return relOrAbs.startsWith('/') ? relOrAbs : path.join(home, relOrAbs)
}

/**
 * Uninstall a locally-installed CLI per its STATIC install method.
 *
 * THROWS only on the whitelist guard (so the tRPC layer maps it to BAD_REQUEST);
 * every other failure (subprocess non-zero, missing path) resolves a structured
 * {ok:false}. Deletes the 267 api-key file + config dir(s) for all non-none kinds.
 */
export async function uninstallCli(
	input: {name: CliName},
	deps: UninstallCliDeps,
): Promise<UninstallResult> {
	// a. D-239-07 RCE BOUNDARY — whitelist guard MUST be the FIRST statement,
	//    before any path resolution, spawn, or fs touch.
	if (!SUPPORTED_CLIS_SET.has(input.name)) {
		throw new Error(`CLI not in whitelist: ${String(input.name)}`)
	}

	// b. Resolve injectable deps (production defaults).
	const home = deps.homeDir ?? os.homedir() ?? process.env.HOME ?? '/home/bruce'
	const fs = deps.fs ?? fsPromises
	const spawn = deps.spawnFn ?? nodeSpawn
	const spec = CLI_UNINSTALL[input.name]
	const startMs = Date.now()

	// d. `none` (aion-cli) → refuse/no-op. Do NOT spawn or rm. Log name only.
	if (spec.kind === 'none') {
		deps.logger.info(`[cli-installer] uninstall refused for ${input.name} (kind=none)`)
		return {
			ok: false,
			output: `UNINSTALL_REFUSED: ${spec.reason}`,
			exitCode: -1,
			durationMs: 0,
			skipped: true,
		}
	}

	deps.logger.info(`[cli-installer] uninstall start: ${input.name} (kind=${spec.kind})`)

	// e. For ALL non-none kinds, ALSO delete the 267 secret file + config dirs
	//    (best-effort — swallow so a missing file never fails the uninstall).
	//    The secret CONTENTS are never read or logged — only the static path.
	const secretRel = WRITE_TARGETS[input.name]?.relPath
	if (secretRel) {
		const secretAbs = path.join(home, secretRel)
		try {
			await fs.rm(secretAbs, {force: true})
		} catch (err) {
			deps.logger.warn(`[cli-installer] best-effort secret rm failed for ${input.name}`, err)
		}
	}
	// WR-03 — config-dir cleanup runs for EVERY kind that declares configRelDirs
	// (npm-global + pip CLIs keep tokens in their own config dirs too — e.g.
	// github-copilot's ~/.copilot). Previously this was gated to rm-bin/rm-paths,
	// so re-installing an npm-global CLI could be silently pre-authed by a stale
	// token dir. `none` (aion-cli) has no configRelDirs → no-op (untouched).
	const configRelDirs = 'configRelDirs' in spec ? (spec.configRelDirs ?? []) : []
	for (const dir of configRelDirs) {
		const dirAbs = path.join(home, dir)
		try {
			await fs.rm(dirAbs, {recursive: true, force: true})
		} catch (err) {
			deps.logger.warn(`[cli-installer] best-effort config rm failed for ${input.name} (${dir})`, err)
		}
	}

	// G13f — same PATH-prepend as authCli so `npm`/`pip3` resolve under
	// livinityd's stripped systemd PATH.
	const authHome = home
	const authEnv: NodeJS.ProcessEnv = {
		...process.env,
		HOME: authHome,
		PATH: [
			`${authHome}/.local/bin`,
			`${authHome}/.opencode/bin`,
			'/opt/livos/bin',
			`${authHome}/.bun/bin`,
			`${authHome}/.npm-global/bin`,
			'/usr/local/bin',
			process.env.PATH ?? '/usr/sbin:/usr/bin:/sbin:/bin',
		].join(':'),
	}

	// f. npm-global → npm uninstall -g --prefix ~/.npm-global <pkg> (argv-array).
	if (spec.kind === 'npm-global') {
		return runSpawnUninstall(
			spawn,
			'npm',
			['uninstall', '-g', '--prefix', path.join(home, '.npm-global'), spec.pkg],
			authEnv,
			deps.logger,
			input.name,
		)
	}

	// g. pip → pip3 uninstall -y <pkg> (argv-array; pip3 is the canonical front-end).
	if (spec.kind === 'pip') {
		return runSpawnUninstall(
			spawn,
			'pip3',
			['uninstall', '-y', spec.pkg],
			authEnv,
			deps.logger,
			input.name,
		)
	}

	// h. rm-bin / rm-paths → rm the STATIC known paths ONLY (E-5: never
	//    `command -v`/`which` then rm). Absolute paths used as-is.
	const removalPaths = spec.kind === 'rm-bin' ? spec.binRelPaths : spec.relPaths
	const removed: string[] = []
	for (const p of removalPaths) {
		const absPath = resolveUninstallPath(home, p)
		try {
			await fs.rm(absPath, {force: true})
			removed.push(absPath)
		} catch (err) {
			deps.logger.warn(`[cli-installer] best-effort bin rm failed for ${input.name} (${absPath})`, err)
		}
	}
	const durationMs = Date.now() - startMs
	deps.logger.info(`[cli-installer] uninstall removed for ${input.name}: ${removed.join(', ')}`)
	return {ok: true, output: `removed: ${removed.join(', ')}`, exitCode: 0, durationMs}
}
