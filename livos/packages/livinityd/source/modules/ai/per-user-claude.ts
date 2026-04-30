import {EventEmitter} from 'node:events'
import {spawn, type ChildProcess} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type Livinityd from '../../index.js'

/**
 * Per-user Claude OAuth + HOME isolation helpers.
 *
 * Multi-user mode only. In single-user mode, callers MUST first check
 * `isMultiUserMode()` and short-circuit before invoking the others —
 * Phase 40's per-user logic is a no-op early-return when multi_user_mode === false.
 *
 * Path convention (per D-40-04): per-user `.claude/` lives at
 *   /opt/livos/data/users/<user_id>/.claude/
 *
 * UUID (not username) — usernames can be renamed via the rename-user flow,
 * which would orphan the credential dir if we keyed it on username.
 *
 * Security framing (per D-40-05): this is **synthetic isolation**, NOT
 * POSIX-enforced isolation. All per-user dirs are owned by the same Linux
 * UID (livinityd's). Cross-user read protection comes from livinityd-application-layer
 * enforcement: route handlers MUST always pass `ctx.currentUser.id` through
 * `getUserClaudeDir()` — never concatenate paths in handlers. The trust
 * boundary is "livinityd is honest about whose user_id it routes to."
 *
 * Introduced in v29.3 Phase 40 (FR-AUTH-01, FR-AUTH-03).
 * See .planning/phases/40-per-user-claude-oauth-home-isolation/40-CONTEXT.md.
 */

const MULTI_USER_REDIS_KEY = 'livos:system:multi_user'

/** Returns true if multi-user mode is enabled in Redis. */
export async function isMultiUserMode(livinityd: Livinityd): Promise<boolean> {
	const value = await livinityd.ai.redis.get(MULTI_USER_REDIS_KEY)
	return value === 'true'
}

/**
 * Returns the absolute path to a user's per-user .claude/ dir. Does NOT create it.
 *
 * Defensive: rejects non-UUID-like inputs to prevent path-traversal attacks
 * (any caller that bypasses ctx.currentUser and passes raw input would otherwise
 * be a silent vulnerability).
 */
export function getUserClaudeDir(livinityd: Livinityd, userId: string): string {
	if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
		throw new Error(`Invalid userId for getUserClaudeDir: ${JSON.stringify(userId)}`)
	}
	return path.join(livinityd.dataDirectory, 'users', userId, '.claude')
}

/** Lazily creates the user's .claude/ dir with mode 0700. Idempotent. */
export async function ensureUserClaudeDir(livinityd: Livinityd, userId: string): Promise<string> {
	const dir = getUserClaudeDir(livinityd, userId)
	await fs.promises.mkdir(dir, {recursive: true, mode: 0o700})
	// Re-chmod to ensure mode is 0700 even if dir pre-existed with different bits
	// (handles the case where mkdir's mode flag is masked by umask).
	await fs.promises.chmod(dir, 0o700)
	return dir
}

/** Reads .credentials.json existence + parse. Returns connection state. */
export async function checkPerUserClaudeStatus(
	livinityd: Livinityd,
	userId: string,
): Promise<{authenticated: boolean; method?: 'sdk-subscription'; expiresAt?: number}> {
	const dir = getUserClaudeDir(livinityd, userId)
	const credsPath = path.join(dir, '.credentials.json')
	try {
		const raw = await fs.promises.readFile(credsPath, 'utf8')
		const parsed = JSON.parse(raw) as {claudeAiOauth?: {expiresAt?: number}}
		const oauth = parsed?.claudeAiOauth
		if (!oauth) return {authenticated: false}
		return {
			authenticated: true,
			method: 'sdk-subscription',
			expiresAt: oauth.expiresAt,
		}
	} catch {
		return {authenticated: false}
	}
}

/** Deletes a user's .credentials.json (logout). Does NOT delete the dir itself. Idempotent. */
export async function perUserClaudeLogout(livinityd: Livinityd, userId: string): Promise<void> {
	const credsPath = path.join(getUserClaudeDir(livinityd, userId), '.credentials.json')
	try {
		await fs.promises.unlink(credsPath)
	} catch (err: any) {
		if (err.code !== 'ENOENT') throw err
	}
}

/**
 * Events emitted by spawnPerUserClaudeLogin during the device-flow lifecycle.
 */
export type PerUserClaudeLoginEvent =
	| {type: 'device_code'; verificationUrl: string; userCode: string}
	| {type: 'progress'; message: string}
	| {type: 'success'}
	| {type: 'error'; message: string}

/**
 * Spawns `claude login --no-browser` with HOME set to the user's per-user dir.
 * Returns an EventEmitter that emits PerUserClaudeLoginEvent values via 'event'.
 *
 * Lifecycle:
 *   - Caller MUST call .kill() on the returned handle when unsubscribing
 *     (or the subprocess + its 5-min timeout will hang around).
 *   - Subprocess auto-killed on internal timeout (5 minutes).
 *   - 'success' or 'error' is the terminal event — no further events emitted after.
 *
 * Stdout parsing strategy: the `claude login --no-browser` CLI prints the
 * device-code verification URL + user code to stdout. We parse line-by-line
 * with a permissive regex. The exact regex pattern depends on the installed
 * Claude CLI version — raw stdout/stderr is logged at debug level so a
 * future bump can be observed and the regex updated.
 */
export function spawnPerUserClaudeLogin(
	livinityd: Livinityd,
	userId: string,
): {events: EventEmitter; kill: () => void} {
	const events = new EventEmitter()
	const homeDir = getUserClaudeDir(livinityd, userId)

	const proc: ChildProcess = spawn('claude', ['login', '--no-browser'], {
		env: {
			...process.env,
			HOME: homeDir,
			// Don't leak unrelated secrets — minimal env (matches sdk-agent-runner.ts safeEnv pattern).
			PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
		},
		stdio: ['pipe', 'pipe', 'pipe'],
	})

	let buffer = ''
	let deviceCodeEmitted = false
	let terminated = false

	const emit = (event: PerUserClaudeLoginEvent) => {
		if (terminated) return
		if (event.type === 'success' || event.type === 'error') {
			terminated = true
		}
		events.emit('event', event)
	}

	proc.stdout?.setEncoding('utf8')
	proc.stdout?.on('data', (chunk: string) => {
		livinityd.logger.verbose(`per-user claude login stdout (user=${userId}): ${chunk.trim()}`)
		buffer += chunk

		// Detect device-code prompt — the Claude CLI prints something like:
		//   "Visit https://claude.ai/oauth/device and enter code: XXXX-XXXX"
		// The exact format may shift across Claude CLI versions; we match
		// the URL + code permissively. If parsing fails for a future version,
		// the debug logs above will surface the new format.
		if (!deviceCodeEmitted) {
			const urlMatch = buffer.match(/(https?:\/\/[^\s]*claude\.ai\/[^\s]*device[^\s]*)/i)
			const codeMatch = buffer.match(/code[:\s]+([A-Z0-9]{4,8}[-\s]?[A-Z0-9]{4,8})/i)
			if (urlMatch && codeMatch) {
				deviceCodeEmitted = true
				emit({
					type: 'device_code',
					verificationUrl: urlMatch[1],
					userCode: codeMatch[1].replace(/\s/g, '-'),
				})
			}
		}

		// Detect success — Claude CLI typically prints "Successfully logged in" or similar.
		if (/successfully\s+(logged\s+in|authenticated|signed\s+in)/i.test(buffer)) {
			emit({type: 'success'})
			proc.kill('SIGTERM')
		}
	})

	proc.stderr?.setEncoding('utf8')
	proc.stderr?.on('data', (chunk: string) => {
		livinityd.logger.verbose(`per-user claude login stderr (user=${userId}): ${chunk.trim()}`)
		// Some CLIs print device-code prompts to stderr — apply same parsing.
		buffer += chunk
	})

	proc.on('exit', (code) => {
		if (terminated) return
		if (code === 0) {
			emit({type: 'success'})
		} else {
			emit({type: 'error', message: `claude login exited with code ${code}`})
		}
	})

	proc.on('error', (err) => {
		emit({type: 'error', message: `claude login spawn error: ${err.message}`})
	})

	// 5-minute timeout — kill subprocess and emit error if device flow never completes.
	const timeoutHandle = setTimeout(
		() => {
			if (!terminated) {
				proc.kill('SIGTERM')
				emit({type: 'error', message: 'claude login timed out after 5 minutes'})
			}
		},
		5 * 60 * 1000,
	)

	proc.on('exit', () => clearTimeout(timeoutHandle))

	return {
		events,
		kill: () => {
			clearTimeout(timeoutHandle)
			if (!terminated) {
				terminated = true
				proc.kill('SIGTERM')
			}
		},
	}
}
