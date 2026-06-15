// Phase 240-01 Task 1 — `authCli` per-CLI canonical login spawn wrapper.
//
// Companion to `installCli` (Phase 239-01). After install completes the UI
// surfaces an "Auth" button; clicking it routes through cliInstaller.auth(name)
// which spawns the per-CLI canonical login command (e.g. `claude code login`,
// `opencode auth login`) in argv-array form (NO shell=true, NO interpolation).
//
// Drift-locks (vitest enforced):
//   - AUTH_TIMEOUT_MS === 300_000 (matches INSTALL_TIMEOUT_MS magnitude —
//     auth flows can include a one-time browser device-code paste).
//   - CLI_AUTH_COMMANDS has exactly 20 keys matching SUPPORTED_CLIS tuple
//     (Phase 253-04; was 5). null entries are EXPLICITLY UNSUPPORTED — auth
//     short-circuits to AUTH_UNSUPPORTED without spawning. null keys: aion-cli
//     (Phase 239 unreachable) + the 6 Wave C install-only CLIs (kimi-cli,
//     mistral-vibe, hermes-agent, nanobot, snow-cli, kiro — authHidden).
//
// Side-effects beyond spawn:
//   - Redis SET liv:cli:auth:<name> = 'running' (on dispatch), 'ok' | 'failed'
//     (on completion), TTL 3600s. The UI may poll this key for status.
//   - Optional auditLog DI seam writes one row to device_audit_log per attempt.

import {createHash} from 'node:crypto'
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import os from 'node:os'

import pty from 'node-pty'
import type {Redis} from 'ioredis'

import {SUPPORTED_CLIS_SET} from './install-scripts.js'
import {CLI_AUTH_METHODS, DEVICE_CODE_RE} from './auth-methods.js'
import type {MinimalPty} from '../pty-sessions/session.js'
import type {CliName, InstallerLogger} from './types.js'

/** 5-minute auth timeout (drift-locked; same magnitude as INSTALL_TIMEOUT_MS). */
export const AUTH_TIMEOUT_MS = 300_000

const OUTPUT_CAP_BYTES = 32 * 1024
const REDIS_TTL_SECONDS = 3600
/** TTL for the late-poll device-code key `liv:cli:auth:url:<name>` (10 min). */
const DEVICE_URL_TTL_SECONDS = 600
/** Max chars accepted from a pasted code (OAuth codes are short; cap blocks pipe-flood). */
const MAX_PASTE_CODE_CHARS = 4096

// ─────────────────────────────────────────────────────────────────────────────
// Phase 268-01 — live-child registry + stdin write-back seam (paste-back auth).
//
// 267's authCli is read-only: it spawns, reads stdout/stderr, and resolves+kills
// on exit — there is NO way for a later request to write to the child's stdin.
// Paste-back auth (the bare `claude` login `Paste code here if prompted` prompt
// in headless/SSH/container sessions — exactly the LivOS server) needs the child
// to stay ALIVE with a writable stdin. This registry keeps the spawned login
// child reachable so `sendAuthInput({name, code})` can write the operator-pasted
// code to its stdin as DATA. The argv is STILL name-derived (D-239-07); the
// pasted code never builds a command — it only selects (by name) which
// already-running child receives the stdin write.
// ─────────────────────────────────────────────────────────────────────────────

// Phase 269-02 — the registry now backs a login with EITHER a child_process
// (device-poll CLIs — github-copilot/codex/kimi/kiro/…, UNCHANGED) OR a node-pty
// (paste-back CLIs that need a real TTY — claude). The bare `claude` login under a
// PIPE stdin drops into `--print` mode and errors; only a real TTY renders the
// `Paste code here if prompted` prompt (RESEARCH WS2). A pty has NO `.stdin`
// stream — you write to the handle itself (`pty.write(code + '\r')`), so the
// backing must be a discriminated union to write correctly per-kind.
type LiveAuthBacking =
	| {kind: 'child'; child: ChildProcess}
	| {kind: 'pty'; pty: MinimalPty}

interface LiveAuth {
	backing: LiveAuthBacking
	createdAt: number
	timeout: NodeJS.Timeout
}

/** Kill whichever backing kind an entry holds (SIGKILL a child, kill() a pty). */
function killBacking(backing: LiveAuthBacking): void {
	try {
		if (backing.kind === 'child') {
			backing.child.kill('SIGKILL')
		} else {
			backing.pty.kill()
		}
	} catch {
		/* best-effort */
	}
}

/** One live login per CLI name (single-in-flight). ≤1 backing per CLI (≤20). */
const liveAuths = new Map<CliName, LiveAuth>()

/**
 * Test-only registry reset for suite isolation. Kills any live login (child or
 * pty) and clears their teardown timers so a leaked login can't bleed into the
 * next test. Mirrors agent-refresh's `_resetAgentRefreshForTests`.
 */
export function _resetLiveAuthsForTests(): void {
	for (const v of liveAuths.values()) {
		killBacking(v.backing)
		clearTimeout(v.timeout)
	}
	liveAuths.clear()
}

/**
 * Register a freshly-spawned login backing (a child_process for device-poll CLIs
 * or a node-pty for paste-back CLIs) so `sendAuthInput` can write the pasted code
 * to it. Guarantees teardown three ways (identical for BOTH backing kinds):
 *   - single-in-flight: kills any prior live backing for the SAME name before
 *     registering this one (prevents two concurrent logins fighting over input);
 *   - timeout: after AUTH_TIMEOUT_MS (300s) kills + deletes IF the entry is still
 *     this backing (stranded — user never pasted). `.unref()`'d so the timer
 *     never holds the event loop open;
 *   - natural exit: clears the timer + deletes the entry IF it's still this
 *     backing. For a child this is `child.on('exit')` (coexists with authCli's
 *     own resolve-on-exit listener — Node allows multiple listeners); for a pty
 *     it is `pty.onExit(...)`.
 */
export function registerLiveAuth(name: CliName, backing: LiveAuthBacking): void {
	const prior = liveAuths.get(name)
	if (prior) {
		killBacking(prior.backing)
		clearTimeout(prior.timeout)
	}
	const timeout = setTimeout(() => {
		const cur = liveAuths.get(name)
		if (cur?.backing === backing) {
			killBacking(backing)
			liveAuths.delete(name)
		}
	}, AUTH_TIMEOUT_MS)
	;(timeout as {unref?: () => void}).unref?.()
	liveAuths.set(name, {backing, createdAt: Date.now(), timeout})
	if (backing.kind === 'child') {
		const child = backing.child
		// WR-01 (crash safety): attach a best-effort 'error' listener to the
		// child's stdin so a broken pipe (the login process exits between
		// sendAuthInput's !destroyed guard and the write) emits a HANDLED error
		// event instead of an uncaught one that would crash livinityd. The pasted
		// code is never in scope here, so nothing secret can be logged. Guarded for
		// the fake-child test stdin (a plain {write,destroyed} object with no
		// EventEmitter surface). node-pty's `write` no-ops on a dead pty (no throw),
		// so the pty path needs no equivalent stdin 'error' listener.
		const stdin = child.stdin as {on?: (ev: string, cb: (err: Error) => void) => void} | null
		if (stdin && typeof stdin.on === 'function') {
			stdin.on('error', (err) => {
				console.warn(`[cli-installer] live-auth stdin error for ${name}: ${err.message}`)
			})
		}
		child.on('exit', () => {
			const cur = liveAuths.get(name)
			if (cur?.backing === backing) {
				clearTimeout(cur.timeout)
				liveAuths.delete(name)
			}
		})
	} else {
		// pty backing — register cleanup via onExit instead of child.on('exit').
		backing.pty.onExit(() => {
			const cur = liveAuths.get(name)
			if (cur?.backing === backing) {
				clearTimeout(cur.timeout)
				liveAuths.delete(name)
			}
		})
	}
}

/** DI surface for sendAuthInput — tests inject a spy logger; production wires the real one. */
export interface SendAuthInputDeps {
	logger: InstallerLogger
}

/**
 * Write an operator-pasted login code to a live login child's stdin (the
 * paste-back primitive). The pasted `code` is UNTRUSTED stdin DATA — it is
 * NEVER used to build an argv, shell string, path, or spawn call (D-239-07 /
 * RESEARCH §B security analysis). It only selects (by `name`) which
 * ALREADY-running child receives the write.
 *
 * Returns `{ok:false}` (never throws) when no live login is awaiting input for
 * this CLI (no registered child, or its stdin is gone/destroyed). Throws ONLY
 * the whitelist guard so the tRPC layer can map it to BAD_REQUEST.
 *
 * The pasted code may be a bearer token (claude OAuth) — it is NEVER logged or
 * returned; only its char length is logged (mirrors writeApiKey's never-log
 * contract). Completion still arrives via the child's eventual exit, which SETs
 * `liv:cli:auth:<name>` = ok|failed (267 contract — unchanged).
 */
export async function sendAuthInput(
	input: {name: CliName; code: string},
	deps: SendAuthInputDeps,
): Promise<{ok: boolean}> {
	// 1. D-239-07 RCE BOUNDARY — whitelist guard MUST be the first statement.
	//    The `code` is NEVER used to build an argv/path/command — it only selects
	//    (by name) an ALREADY-running child and is written as stdin DATA.
	if (!SUPPORTED_CLIS_SET.has(input.name)) {
		throw new Error(`CLI not in whitelist: ${String(input.name)}`)
	}
	const live = liveAuths.get(input.name)
	if (!live) {
		return {ok: false} // no registered backing awaiting input
	}
	// For a child backing the stdin can be gone/destroyed — guard it (UNCHANGED).
	// A pty has no `.stdin` stream; its `write` no-ops on a dead pty so no
	// equivalent pre-guard is needed (the try/catch below is belt-and-suspenders).
	if (live.backing.kind === 'child') {
		const stdin = live.backing.child.stdin
		if (!stdin || stdin.destroyed) {
			return {ok: false}
		}
	}
	// 2. Strip trailing CR/LF + cap length defensively. We append exactly ONE
	//    terminator below — '\n' for a child's stdin, '\r' for a pty (TTY line
	//    discipline submits on CARRIAGE RETURN, not newline — RESEARCH P-4).
	const safe = input.code.replace(/[\r\n]+$/g, '').slice(0, MAX_PASTE_CODE_CHARS)
	// WR-01 (crash safety): a child's stdin can be destroyed AFTER the !destroyed
	// guard above (the login process exits in that narrow window) — `write` then
	// throws synchronously on a broken pipe. Wrap it so we resolve {ok:false}
	// instead of letting the throw escape. node-pty's `write` does not throw on a
	// dead pty (it no-ops), but the catch covers it defensively too. The catch
	// NEVER logs the code (bearer token) — only the CLI name + the error message.
	try {
		if (live.backing.kind === 'pty') {
			live.backing.pty.write(safe + '\r')
		} else {
			live.backing.child.stdin!.write(safe + '\n')
		}
	} catch (err) {
		deps.logger.warn(
			`[cli-installer] sendAuthInput write failed for ${input.name}: ${err instanceof Error ? err.message : String(err)}`,
		)
		return {ok: false}
	}
	// NEVER log the code (it may be a bearer token) — only its char length.
	deps.logger.info(
		`[cli-installer] sendAuthInput wrote ${safe.length} chars to ${input.name}`,
	)
	return {ok: true}
}

/**
 * Parse a stdout/stderr chunk for a device-flow verification URL + user code.
 * Returns `{url, code}` only when BOTH match; otherwise null. The caller
 * surfaces the FIRST hit live (see authCli).
 *
 * WR-01 (267 code review): the code is matched from the text AROUND the URL,
 * NOT the full 32KB tail. An unrelated uppercase token printed earlier in the
 * stream (startup banner, version string, hex/env-var fragment) would otherwise
 * win the `[A-Z0-9]{4,8}` match and, via the fire-once guard in authCli,
 * permanently shadow the real device code. Device CLIs (github-copilot, kimi,
 * kiro …) print the URL and the code on the SAME line ("visit <URL> … code
 * XXXX"), so the URL's own line is tried first; a tight ±2-line window is the
 * fallback for CLIs that split them across adjacent lines. Lines further away
 * are never consulted. The URL itself is stripped so the code can never be
 * matched inside the URL path.
 */
function parseDeviceCode(text: string): {url: string; code: string} | null {
	const urlMatch = text.match(DEVICE_CODE_RE.url)
	if (!urlMatch?.[1] || urlMatch.index === undefined) return null
	const url = urlMatch[1]

	const stripUrl = (s: string): string => s.split(url).join(' ')
	const lines = text.split(/\r?\n/)
	const urlLineIdx = lines.findIndex((line) => line.includes(url))
	const windows =
		urlLineIdx === -1
			? [text]
			: [
					lines[urlLineIdx],
					lines.slice(Math.max(0, urlLineIdx - 2), urlLineIdx + 3).join('\n'),
				]

	for (const window of windows) {
		const codeMatch = stripUrl(window).match(DEVICE_CODE_RE.code)
		if (codeMatch?.[1]) {
			return {url, code: codeMatch[1]}
		}
	}
	return null
}

/**
 * Per-CLI canonical login argv. `null` = explicitly unsupported (no canonical
 * login command exists upstream — authCli short-circuits to AUTH_UNSUPPORTED).
 *
 * Phase 253-04 contract: exactly 20 keys matching SUPPORTED_CLIS. Drift-lock
 * test enforces shape. Subcommands verified in Phase 253 RESEARCH.
 *
 *   claude-code → ['claude', ['auth', 'login']]    // verified: `claude auth {login,logout,status}`
 *   opencode    → ['opencode', ['auth', 'login']]  // Phase 195/196 reference
 *   gemini      → ['gemini',   ['auth', 'login']]  // best-effort
 *   openclaw    → ['openclaw', ['onboard']]        // 271-A: no `auth login` upstream
 *   aion-cli    → null                             // EXPLICITLY UNSUPPORTED
 *   --- Wave A ---
 *   codex          → ['codex', ['login','--device-auth']]  // 271-A: `codex login` (headless)
 *   qwen-code      → ['qwen', ['auth']]
 *   augment        → ['auggie', ['login']]
 *   github-copilot → ['copilot', []]    // bare TUI → operator types /login
 *   codebuddy      → ['codebuddy', []]  // bare TUI
 *   qoder-cli      → ['qodercli', []]   // bare TUI
 *   --- Wave B ---
 *   goose          → ['goose', ['configure']]
 *   factory-droid  → ['droid', ['login']]
 *   cursor-agent   → ['cursor-agent', ['login']]  // bin == install/detector/auth (BLOCKER 1)
 *   --- Wave C (install-only / authHidden) ---
 *   kimi-cli/mistral-vibe/hermes-agent/nanobot/snow-cli/kiro → null
 */
export const CLI_AUTH_COMMANDS: Readonly<
	Record<CliName, readonly [string, readonly string[]] | null>
> = {
	// G13g/268 — bare `claude` first-launch login prints a URL + prompts `Paste
	// code here if prompted` in SSH/container/headless (the paste-back flow).
	// `setup-token`'s localhost callback fails headless; `auth login` was the 253
	// device argv. Bare argv → paste-back.
	'claude-code': ['claude', []],
	opencode: ['opencode', ['auth', 'login']],
	gemini: ['gemini', ['auth', 'login']],
	// 271-A — upstream has NO top-level `openclaw auth login`; the canonical
	// interactive first-run login is `openclaw onboard` (auth subcmds are nested
	// under `openclaw infer auth …`). Now mirrors auth-methods.ts loginArgv.
	openclaw: ['openclaw', ['onboard']],
	'aion-cli': null,
	// Wave A
	// 271-A — `codex auth login` is not a real subcommand; the verified login is
	// `codex login`, and `--device-auth` is the headless/SSH-correct variant for
	// the LivOS server (no localhost browser callback). Mirrors auth-methods.ts.
	codex: ['codex', ['login', '--device-auth']],
	'qwen-code': ['qwen', ['auth']],
	augment: ['auggie', ['login']],
	'github-copilot': ['copilot', []],
	codebuddy: ['codebuddy', []],
	'qoder-cli': ['qodercli', []],
	// Wave B
	goose: ['goose', ['configure']],
	'factory-droid': ['droid', ['login']],
	'cursor-agent': ['cursor-agent', ['login']],
	// Wave C — Phase 267-01 gave the auth-able Wave-C CLIs a real login argv.
	// Device-flow: kimi-cli (`kimi login` → stderr URL+code), kiro
	// (`kiro-cli login` Builder ID/Google/GitHub). hermes-agent has a device
	// portal (`hermes setup --portal`) AS WELL AS an api-key path — keep the
	// login argv so the device branch works; the api-key path goes via
	// cliInstaller.setApiKey (writeApiKey → ~/.hermes/.env). The remaining
	// Wave-C names stay null (no canonical login spawn): mistral-vibe / nanobot
	// / snow-cli authenticate ONLY via setApiKey (api-key write, no login);
	// aion-cli is genuinely unsupported (AionUi embedded backend). null →
	// AUTH_UNSUPPORTED short-circuit (no spawn).
	'kimi-cli': ['kimi', ['login']],
	'mistral-vibe': null, // api-key only → cliInstaller.setApiKey
	'hermes-agent': ['hermes', ['setup', '--portal']],
	nanobot: null, // api-key only → cliInstaller.setApiKey
	'snow-cli': null, // api-key only → cliInstaller.setApiKey
	kiro: ['kiro-cli', ['login']],
}

/**
 * Result of authCli — same shape as InstallResult plus `redisStatusKey` echo
 * so the UI can derive the poll-key without re-deriving the literal.
 */
export interface AuthResult {
	ok: boolean
	/** Combined stdout + stderr (last 32KB only). */
	output: string
	/** Process exit code; -1 on timeout / spawn-failure / AUTH_UNSUPPORTED. */
	exitCode: number
	/** Wall-clock ms from spawn start to exit/timeout. */
	durationMs: number
	/** `liv:cli:auth:<name>` — the key the UI may poll for live status. */
	redisStatusKey: string
}

/**
 * Optional auditLog DI seam. When provided, authCli invokes it ONCE on
 * completion with the structured row. Production wires this via
 * livinityd boot — see source/index.ts auditLogFactory.
 *
 * Shape mirrors device_audit_log columns (user_id + device_id are added by
 * the production auditLog implementation; this seam only carries the
 * tool-level fields). Plan 240-01 Task 3 wires `user_id` from
 * ctx.currentUser.id and `device_id = 'livinityd-trpc'`.
 */
export interface AuditLogRow {
	tool_name: 'cliInstaller.auth' | 'cliInstaller.install'
	params_digest: string
	success: boolean
	error: string | null
}

export type AuditLogFn = (row: AuditLogRow) => Promise<void>

/** DI surface — tests inject fake spawn/redis/auditLog; production uses real. */
export interface AuthCliDeps {
	logger: InstallerLogger
	/** Required: ioredis client (production passes this.ai.redis). */
	redis: Pick<Redis, 'set'>
	/**
	 * Optional spawn override (vitest injects a fake). When absent, the real
	 * `node:child_process` spawn is used.
	 */
	spawnFn?: typeof nodeSpawn
	/** Optional audit-log writer (production wires via auditLogFactory). */
	auditLog?: AuditLogFn
	/**
	 * Phase 267-01 — optional live device-code seam. The FIRST time a device
	 * verification URL + user code are parsed out of the login's stdout/stderr
	 * (while the process is still running, polling for the user to finish in a
	 * browser), authCli calls `onChunk({raw, url, code})`. Tests inject a spy;
	 * production may use it to push over a websocket/SSE.
	 */
	onChunk?: (payload: {raw: string; url?: string; code?: string}) => void
	/**
	 * Phase 267-01 — optional ioredis pub client. The same first device-code hit
	 * is best-effort published to `liv:cli:auth:stream:<name>` so a subscribed UI
	 * receives {url, code} live. (`redis` above is the status-key SET client; a
	 * separate pub connection is conventional with ioredis subscribe mode.)
	 */
	redisPub?: Pick<Redis, 'publish'>
	/**
	 * Phase 269-02 — optional node-pty spawn override for the PASTE-BACK branch
	 * (claude-code). The bare `claude` login under a child_process PIPE stdin
	 * drops into `--print` mode and errors; only a real TTY renders the `Paste
	 * code here if prompted` prompt. When a paste-back CLI is auth'd, authCli
	 * spawns it via this factory (a node-pty IPty) instead of `spawnFn`. Tests
	 * inject a fake pty so NOTHING actually spawns; production uses the default
	 * (real `pty.spawn`, below — mirroring pty-sessions/session.ts
	 * DEFAULT_PTY_FACTORY). Device-poll CLIs ignore this seam and stay on
	 * child_process (RESEARCH P-5).
	 */
	ptyFactory?: (
		file: string,
		args: string[],
		opts: {name: string; cols: number; rows: number; cwd?: string; env?: NodeJS.ProcessEnv},
	) => MinimalPty
}

export interface AuthCliInput {
	name: CliName
}

/**
 * Phase 269-02 — production default pty factory. Mirrors pty-sessions/session.ts
 * DEFAULT_PTY_FACTORY: real node-pty `pty.spawn` cast to the MinimalPty surface.
 * Only the paste-back (claude) branch uses it; device-poll CLIs stay on
 * child_process.
 */
const DEFAULT_PTY_FACTORY: NonNullable<AuthCliDeps['ptyFactory']> = (
	file,
	args,
	opts,
) => pty.spawn(file, args, opts) as unknown as MinimalPty

/**
 * Combine accumulated stdout + stderr chunks into a single output string,
 * keeping at most the last OUTPUT_CAP_BYTES bytes (tail-truncation).
 */
function joinTail(chunks: Buffer[]): string {
	const total = Buffer.concat(chunks)
	const sliced =
		total.length > OUTPUT_CAP_BYTES ? total.subarray(total.length - OUTPUT_CAP_BYTES) : total
	return sliced.toString('utf8')
}

/** Compute SHA-256 hex digest of JSON.stringify({name}) — tamper-evidence marker. */
function paramsDigestFor(name: CliName): string {
	return createHash('sha256').update(JSON.stringify({name})).digest('hex')
}

/**
 * Fire the per-CLI canonical login command in a child process. Resolves
 * structured AuthResult — never throws on subprocess failure (only the
 * whitelist guard throws so the tRPC layer can map it to BAD_REQUEST).
 *
 * Lifecycle:
 *   1. Whitelist guard (D-239-07 RCE boundary).
 *   2. aion-cli short-circuit → AUTH_UNSUPPORTED (no spawn, no Redis write).
 *   3. Redis SET 'running' (best-effort; failure is non-fatal — logged).
 *   4. Spawn (argv-array form). On ENOENT → ===SPAWN-FAILED===.
 *   5. Timeout race: AUTH_TIMEOUT_MS → SIGKILL → ===TIMEOUT===.
 *   6. Redis SET 'ok' | 'failed' (best-effort).
 *   7. auditLog (when provided) called ONCE with the structured row.
 */
export async function authCli(
	input: AuthCliInput,
	deps: AuthCliDeps,
): Promise<AuthResult> {
	// 1. D-239-07 RCE BOUNDARY — whitelist guard MUST be first.
	if (!SUPPORTED_CLIS_SET.has(input.name)) {
		throw new Error(`CLI not in whitelist: ${String(input.name)}`)
	}

	const redisStatusKey = `liv:cli:auth:${input.name}`

	// 2. aion-cli short-circuit — no canonical login command upstream.
	const command = CLI_AUTH_COMMANDS[input.name]
	if (command === null) {
		const result: AuthResult = {
			ok: false,
			output:
				'AUTH_UNSUPPORTED: aion-cli has no canonical login command (Phase 239 found upstream unreachable)',
			exitCode: -1,
			durationMs: 0,
			redisStatusKey,
		}
		// Best-effort audit row even on short-circuit (operator visibility).
		if (deps.auditLog) {
			try {
				await deps.auditLog({
					tool_name: 'cliInstaller.auth',
					params_digest: paramsDigestFor(input.name),
					success: false,
					error: 'AUTH_UNSUPPORTED',
				})
			} catch (err) {
				deps.logger.warn(
					`[cli-installer] auditLog AUTH_UNSUPPORTED row failed for ${input.name}`,
					err,
				)
			}
		}
		return result
	}

	const spawn = deps.spawnFn ?? nodeSpawn
	const [bin, args] = command
	const startMs = Date.now()

	// G13f — same PATH gap as the detector (G13d): livinityd's systemd PATH lacks
	// the CLI install dirs (claude/opencode ~/.local/bin, openclaw /opt/livos/bin,
	// gemini/aion npm-global), so `spawn('claude', …)` fails with ENOENT ("spawn
	// claude ENOENT"). Prepend the known install dirs so the auth command resolves.
	const authHome = os.homedir() || process.env.HOME || '/home/bruce'
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

	deps.logger.info(`[cli-installer] auth start: ${input.name} (${bin} ${args.join(' ')})`)

	// 3. Redis SET 'running' on dispatch (best-effort).
	try {
		await deps.redis.set(redisStatusKey, 'running', 'EX', REDIS_TTL_SECONDS)
	} catch (err) {
		deps.logger.warn(`[cli-installer] redis SET 'running' failed for ${input.name}`, err)
	}

	const result = await new Promise<AuthResult>((resolve) => {
		let settled = false
		const stdoutChunks: Buffer[] = []
		const stderrChunks: Buffer[] = []
		// Phase 267-01 — fire the device-code seam at most ONCE, the instant the
		// login prints the verification URL + user code (well before exit).
		let deviceCodeSurfaced = false
		const handleChunkForDeviceCode = (raw: string): void => {
			if (deviceCodeSurfaced) return
			const parsed = parseDeviceCode(raw)
			if (!parsed) return
			deviceCodeSurfaced = true
			const {url, code} = parsed
			// (a) onChunk DI seam — synchronous, never throws into the stream.
			try {
				deps.onChunk?.({raw, url, code})
			} catch (err) {
				deps.logger.warn(
					`[cli-installer] onChunk seam threw for ${input.name}`,
					err,
				)
			}
			const payload = JSON.stringify({url, code})
			// (b) best-effort pub/sub for a subscribed UI (fire-and-forget).
			try {
				const pub = deps.redisPub?.publish(
					`liv:cli:auth:stream:${input.name}`,
					payload,
				)
				if (pub && typeof (pub as Promise<unknown>).catch === 'function') {
					;(pub as Promise<unknown>).catch((err) =>
						deps.logger.warn(
							`[cli-installer] redis publish device-code failed for ${input.name}`,
							err,
						),
					)
				}
			} catch (err) {
				deps.logger.warn(
					`[cli-installer] redis publish device-code threw for ${input.name}`,
					err,
				)
			}
			// (c) late-poll fallback key so a UI that connects AFTER the print
			//     still gets the code (EX 600s).
			try {
				const setP = deps.redis.set(
					`liv:cli:auth:url:${input.name}`,
					payload,
					'EX',
					DEVICE_URL_TTL_SECONDS,
				)
				if (setP && typeof (setP as Promise<unknown>).catch === 'function') {
					;(setP as Promise<unknown>).catch((err) =>
						deps.logger.warn(
							`[cli-installer] redis SET device-code url key failed for ${input.name}`,
							err,
						),
					)
				}
			} catch (err) {
				deps.logger.warn(
					`[cli-installer] redis SET device-code url key threw for ${input.name}`,
					err,
				)
			}
		}

		// Shared timeout resolver — fires on AUTH_TIMEOUT_MS for BOTH backings.
		// `killFn` reaps whichever backing is live (child SIGKILL vs pty.kill()).
		const makeTimeout = (killFn: () => void): NodeJS.Timeout =>
			setTimeout(() => {
				if (settled) return
				settled = true
				try {
					killFn()
				} catch {
					/* swallow — best-effort kill */
				}
				const durationMs = Date.now() - startMs
				const tail = joinTail([...stdoutChunks, ...stderrChunks])
				deps.logger.warn(
					`[cli-installer] auth TIMEOUT after ${AUTH_TIMEOUT_MS}ms: ${input.name}`,
				)
				resolve({
					ok: false,
					output: `===TIMEOUT=== ${input.name} exceeded ${AUTH_TIMEOUT_MS}ms\n${tail}`,
					exitCode: -1,
					durationMs,
					redisStatusKey,
				})
			}, AUTH_TIMEOUT_MS)

		// Shared completion resolver — exitCode===0 → ok. The final Redis SET
		// 'ok'|'failed' (below the Promise) is shared by both backings.
		const resolveOnExit = (exitCode: number, timeoutHandle: NodeJS.Timeout): void => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			const durationMs = Date.now() - startMs
			const output = joinTail([...stdoutChunks, ...stderrChunks])
			deps.logger.info(
				`[cli-installer] auth exit ${exitCode} for ${input.name} (${durationMs}ms)`,
			)
			resolve({
				ok: exitCode === 0,
				output,
				exitCode,
				durationMs,
				redisStatusKey,
			})
		}

		// 4. Spawn. PASTE-BACK CLIs (claude-code) run under a REAL TTY via node-pty
		//    — the bare `claude` login under a child_process PIPE drops into
		//    `--print` mode and errors; only a TTY renders `Paste code here if
		//    prompted` (RESEARCH WS2). Device-poll CLIs stay on child_process — a
		//    pipe is fine (they print URL+code and self-poll to exit) and a pty
		//    would inject TUI escape noise into parseDeviceCode (RESEARCH P-5).
		//    Branch source of truth: CLI_AUTH_METHODS[name].branch === 'paste-back'.
		//
		//    R269-7 — the ANTHROPIC_API_KEY fallback is UNTOUCHED here: the dialog's
		//    "Use an API key instead" branch routes through cliInstaller.setApiKey →
		//    writeApiKey (api-key-writer.ts), never this spawn. It stays the
		//    GUARANTEED path given upstream claude code-paste regressions (#47994).
		const isPasteBack = CLI_AUTH_METHODS[input.name].branch === 'paste-back'

		if (isPasteBack) {
			// ─── node-pty (real TTY) path ───────────────────────────────────────
			const ptyFactory = deps.ptyFactory ?? DEFAULT_PTY_FACTORY
			let ptyChild: MinimalPty
			try {
				ptyChild = ptyFactory(bin, args as string[], {
					name: 'xterm-color',
					// Wide enough that the prompt/URL aren't wrapped mid-token.
					cols: 120,
					rows: 40,
					cwd: authHome,
					env: authEnv,
				})
				// Keep the pty reachable so sendAuthInput can write the pasted code
				// to it (CR-terminated). Registered as a {kind:'pty'} backing.
				registerLiveAuth(input.name, {kind: 'pty', pty: ptyChild})
			} catch (spawnErr) {
				const durationMs = Date.now() - startMs
				deps.logger.error(
					`[cli-installer] auth pty spawn failed for ${input.name}`,
					spawnErr,
				)
				resolve({
					ok: false,
					output: `===SPAWN-FAILED=== ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`,
					exitCode: -1,
					durationMs,
					redisStatusKey,
				})
				return
			}
			const timeoutHandle = makeTimeout(() => ptyChild.kill())
			// node-pty's onData is a SINGLE stream that MERGES stdout+stderr — the
			// 267 device-code parser runs on it exactly as it ran on stdout/stderr.
			ptyChild.onData((chunk: string) => {
				stdoutChunks.push(Buffer.from(chunk))
				handleChunkForDeviceCode(joinTail(stdoutChunks))
			})
			// Completion = pty exit (robust; do NOT string-match a banner — A6).
			ptyChild.onExit(({exitCode}) => resolveOnExit(exitCode, timeoutHandle))
			return
		}

		// ─── child_process (device-poll) path — UNCHANGED ───────────────────────
		let child: ChildProcess
		try {
			child = spawn(bin, args as string[], {env: authEnv})
			// Phase 268-01 — keep the login child reachable so sendAuthInput can
			// write the operator-pasted code to its stdin (paste-back). Purely
			// additive: the registry's own exit listener coexists with the
			// resolve-on-exit listener below (Node allows multiple listeners).
			registerLiveAuth(input.name, {kind: 'child', child})
		} catch (spawnErr) {
			const durationMs = Date.now() - startMs
			deps.logger.error(
				`[cli-installer] auth spawn failed for ${input.name}`,
				spawnErr,
			)
			resolve({
				ok: false,
				output: `===SPAWN-FAILED=== ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`,
				exitCode: -1,
				durationMs,
				redisStatusKey,
			})
			return
		}

		// WR-02 (advisory): this is a SECOND 300s SIGKILL timer on the SAME child —
		// registerLiveAuth also set one. Both fire on timeout; the kill is redundant
		// (best-effort, harmless). They serve DIFFERENT purposes: registerLiveAuth's
		// timer REAPS the live-child map (stranded paste-back login), while THIS one
		// RESOLVES the authCli promise. Both are intentionally kept.
		const timeoutHandle = makeTimeout(() => child.kill('SIGKILL'))

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
			// Parse against the accumulated stdout tail so a URL+code split across
			// chunk boundaries still resolves (Phase 267-01 device-code streaming).
			handleChunkForDeviceCode(joinTail(stdoutChunks))
		})
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
			// kimi-cli (and others) print the device URL+code to STDERR — parse it too.
			handleChunkForDeviceCode(joinTail(stderrChunks))
		})

		;(child as unknown as NodeJS.EventEmitter).on('exit', (code: number | null) => {
			resolveOnExit(typeof code === 'number' ? code : -1, timeoutHandle)
		})

		;(child as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
			if (settled) return
			settled = true
			clearTimeout(timeoutHandle)
			const durationMs = Date.now() - startMs
			deps.logger.error(`[cli-installer] auth child error for ${input.name}`, err)
			resolve({
				ok: false,
				output: `===CHILD-ERROR=== ${err.message}`,
				exitCode: -1,
				durationMs,
				redisStatusKey,
			})
		})
	})

	// 6. Redis SET 'ok' | 'failed' on completion (best-effort).
	try {
		await deps.redis.set(
			redisStatusKey,
			result.ok ? 'ok' : 'failed',
			'EX',
			REDIS_TTL_SECONDS,
		)
	} catch (err) {
		deps.logger.warn(
			`[cli-installer] redis SET final status failed for ${input.name}`,
			err,
		)
	}

	// 7. auditLog on completion (when provided).
	if (deps.auditLog) {
		try {
			await deps.auditLog({
				tool_name: 'cliInstaller.auth',
				params_digest: paramsDigestFor(input.name),
				success: result.ok,
				error: result.ok ? null : `exit=${result.exitCode}`,
			})
		} catch (err) {
			deps.logger.warn(
				`[cli-installer] auditLog row write failed for ${input.name}`,
				err,
			)
		}
	}

	return result
}
