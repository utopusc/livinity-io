// Phase 239-01 Task 1 — `detectCli` probe wrapper.
//
// Whitelist-gated (D-239-07) presence-and-version probe for each of the 5
// supported CLIs. Two-stage probe per call:
//   1. `bash -c "command -v <bin>"` to locate the binary on PATH
//   2. `<bin> --version` to capture a version string (first line)
//
// Both subprocesses use the bin name from the enum-keyed CLI_BIN_NAMES map —
// never user input. The `bash -c` form is only used for the locator; the
// version probe uses argv-array form for defense in depth.

import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import os from 'node:os'

import {
	CLI_BIN_NAMES,
	CLI_VERSION_ARGS,
	SUPPORTED_CLIS_SET,
} from './install-scripts.js'
import type {CliName, DetectResult, InstallerLogger} from './types.js'

const PROBE_TIMEOUT_MS = 5_000

export interface DetectCliDeps {
	logger: InstallerLogger
	spawnFn?: typeof nodeSpawn
}

export interface DetectCliInput {
	name: CliName
}

interface ProbeResult {
	exitCode: number
	stdout: string
}

/** Run a single bounded spawn; resolve with exit + accumulated stdout. */
function runProbe(
	spawn: typeof nodeSpawn,
	command: string,
	args: string[],
	env?: NodeJS.ProcessEnv,
): Promise<ProbeResult> {
	return new Promise<ProbeResult>((resolve) => {
		let settled = false
		let child: ChildProcess
		const stdoutChunks: Buffer[] = []

		try {
			child = env ? spawn(command, args, {env}) : spawn(command, args)
		} catch {
			resolve({exitCode: -1, stdout: ''})
			return
		}

		const timeoutHandle = setTimeout(() => {
			if (settled) return
			settled = true
			try {
				child.kill('SIGKILL')
			} catch {
				/* swallow */
			}
			resolve({exitCode: -1, stdout: Buffer.concat(stdoutChunks).toString('utf8')})
		}, PROBE_TIMEOUT_MS)

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
		})

		;(child as unknown as NodeJS.EventEmitter).on('exit', (code: number | null) => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			resolve({
				exitCode: typeof code === 'number' ? code : -1,
				stdout: Buffer.concat(stdoutChunks).toString('utf8'),
			})
		})

		;(child as unknown as NodeJS.EventEmitter).on('error', () => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			resolve({exitCode: -1, stdout: Buffer.concat(stdoutChunks).toString('utf8')})
		})
	})
}

/**
 * Detect whether the given CLI is installed and probe its version.
 *
 * Whitelist guard (D-239-07) — throws BEFORE any subprocess for unknown
 * names. Returns `{detected:false}` on any non-zero exit from `command -v`,
 * even if the upstream binary exists but isn't on PATH. A failed version
 * probe is non-fatal: the detector still returns `detected:true` with the
 * path it found, leaving `version` undefined.
 */
export async function detectCli(
	input: DetectCliInput,
	deps: DetectCliDeps,
): Promise<DetectResult> {
	if (!SUPPORTED_CLIS_SET.has(input.name)) {
		throw new Error(`CLI not in whitelist: ${String(input.name)}`)
	}

	const spawn = deps.spawnFn ?? nodeSpawn
	const bin = CLI_BIN_NAMES[input.name]
	const versionArgs = CLI_VERSION_ARGS[input.name]

	// G13d — livinityd's systemd PATH is /usr/local/sbin:/usr/local/bin:/usr/sbin:
	// /usr/bin:/snap/bin, and a plain `bash -c` is non-login, so the install
	// scripts' targets are invisible to `command -v` (claude/opencode →
	// ~/.local/bin, openclaw → /opt/livos/bin, gemini/aion → npm-global prefix).
	// Result: detect returned {detected:false} even right after a successful
	// install (the agent re-shows as "Available to Install" after a refresh).
	// Fix: (1) login shell (`-lc`) so the user's profile PATH (npm/nvm/etc.) is
	// sourced; (2) explicitly prepend the known install dirs.
	const home = os.homedir() || process.env.HOME || '/home/bruce'
	const probePath = [
		`${home}/.local/bin`,
		'/opt/livos/bin',
		`${home}/.bun/bin`,
		`${home}/.npm-global/bin`,
		'/usr/local/bin',
		process.env.PATH ?? '/usr/sbin:/usr/bin:/sbin:/bin',
	].join(':')
	const probeEnv: NodeJS.ProcessEnv = {...process.env, HOME: home, PATH: probePath}

	// Stage 1 — locate the binary. `bash -lc "command -v <bin>"` is safe
	// because `<bin>` comes from CLI_BIN_NAMES (enum-constrained), never user input.
	const locate = await runProbe(spawn, 'bash', ['-lc', `command -v ${bin}`], probeEnv)
	if (locate.exitCode !== 0) {
		return {detected: false}
	}
	const probedPath = locate.stdout.split(/\r?\n/)[0]?.trim()
	if (!probedPath) {
		return {detected: false}
	}

	// Stage 2 — version probe. Spawn the absolute `probedPath` (from `command -v`
	// above) directly — resolves regardless of PATH and uses no shell. Failure
	// here is non-fatal: detection still succeeds with `version` undefined.
	const version = await runProbe(spawn, probedPath, versionArgs, probeEnv)
	if (version.exitCode === 0) {
		const firstLine = version.stdout.split(/\r?\n/)[0]?.trim()
		return {
			detected: true,
			path: probedPath,
			version: firstLine || undefined,
		}
	}

	deps.logger.warn(
		`[cli-installer] ${input.name} located at ${probedPath} but ${bin} ${versionArgs.join(' ')} exited ${version.exitCode}`,
	)
	return {detected: true, path: probedPath}
}
