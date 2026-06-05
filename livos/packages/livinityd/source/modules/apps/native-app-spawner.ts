/**
 * Phase 101-03 — Ubuntu native-app spawner.
 *
 * Spawns an arbitrary native binary on a target X11 display (default `:1`)
 * as a detached child process. The spawner:
 *
 *   1. Re-parses `cfg` through `nativeAppConfigSchema` BEFORE spawning
 *      (defense in depth — the schema is also enforced at the tRPC route
 *      boundary and at Redis upsert; this catches corrupt Redis entries
 *      or any caller that hand-built a config without going through tRPC).
 *   2. Builds the spawn env as `{...process.env, ...cfg.env, DISPLAY}` so
 *      DISPLAY ALWAYS wins (we never let cfg.env shadow it accidentally),
 *      cfg.env wins over process.env, and process.env provides the base.
 *   3. Calls the injected `spawnFn` (default: `node:child_process.spawn`)
 *      with `detached:true` + `stdio:['ignore','ignore','pipe']` so we can
 *      survive livinityd exit and still capture stderr for diagnostics.
 *   4. Calls `child.unref()` so livinityd's event loop is not held open by
 *      the spawned app.
 *   5. Tails the last 50 stderr lines and `logger.warn`s on non-zero exit.
 *
 * Window binding (xdotool WM_CLASS poll → port allocator) is NOT this
 * file's responsibility — that is `native-app-binder.ts` in 101-05. The
 * spawner returns `{pid, child}` and is done.
 *
 * Threat model: see 101-03-PLAN.md `<threat_model>` row T-101-02.
 * Mitigations (a)-(d). This file owns mitigations (a)/(b)/(c) defense-in-depth
 * AND the spawn-time DISPLAY pin.
 */

import {spawn as nodeSpawn, type ChildProcess, type SpawnOptions} from 'node:child_process'

import {nativeAppConfigSchema, type NativeAppConfig} from './native-app-config.js'

/** Typed error class (window-manager.ts:80-92 analog). */
export class NativeAppSpawnError extends Error {
	code = 'NATIVE_APP_SPAWN_FAILED'
	constructor(public detail: string) {
		super(`native-app spawn failed: ${detail}`)
		this.name = 'NativeAppSpawnError'
	}
}

/**
 * Spawn factory shape. Production passes `child_process.spawn`; tests pass
 * `vi.fn(() => new FakeChild())`. Argument order matches `child_process.spawn`.
 */
export type NativeSpawnFn = (
	cmd: string,
	args: string[],
	opts?: SpawnOptions,
) => ChildProcess

/** Minimal logger surface — same shape as VncBridgeLogger / window-manager logger. */
export interface NativeAppSpawnerLogger {
	info(msg: string): void
	warn(msg: string): void
	error(msg: string): void
	verbose?(msg: string): void
}

export interface SpawnNativeOpts {
	cfg: NativeAppConfig
	/** X11 display, default `:1` (matches LivOS Xvfb singleton per 100-08-01). */
	display?: string
	/** Spawn factory injection (tests use FakeChild; production omits). */
	spawnFn?: NativeSpawnFn
	logger?: NativeAppSpawnerLogger
}

/** Default display matches the singleton Xvfb set up by livinityd.start() in 100-08-01. */
const DEFAULT_DISPLAY = ':1'

/** Stderr-tail bound (vnc-bridge.ts convention). */
const STDERR_TAIL_LIMIT = 50

/**
 * Spawn an Ubuntu native binary detached on the target DISPLAY.
 *
 * The promise resolves AS SOON AS the child has a pid + unref has been
 * called. The spawned process keeps running independently afterwards;
 * tracking its window/binding/lifecycle is the caller's job (101-05).
 */
export async function spawnNativeApp(
	opts: SpawnNativeOpts,
): Promise<{pid: number; child: ChildProcess}> {
	// (a) Defense in depth — re-parse the schema. If the caller routed
	// through tRPC the schema has already validated the input, but if a
	// future call path bypasses tRPC (e.g. boot-time auto-launch from a
	// persisted Redis config) we must still gate here. Throws ZodError on
	// invalid input — we wrap that in NativeAppSpawnError so callers can
	// pattern-match on a single error type.
	let cfg: NativeAppConfig
	try {
		cfg = nativeAppConfigSchema.parse(opts.cfg)
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err)
		throw new NativeAppSpawnError(`config validation failed: ${detail}`)
	}

	const display = opts.display ?? DEFAULT_DISPLAY
	const spawnFn = opts.spawnFn ?? (nodeSpawn as NativeSpawnFn)
	const log = opts.logger

	// (b) Build env. Order matters:
	//   - process.env first (PATH, HOME, etc. — needed for the binary to
	//     resolve its own libs / config dirs)
	//   - cfg.env second (caller-provided overrides)
	//   - DISPLAY last (we OWN this — cfg.env never shadows it)
	const env: NodeJS.ProcessEnv = {
		...process.env,
		...(cfg.env ?? {}),
		DISPLAY: display,
	}

	const child = spawnFn(cfg.binaryPath, cfg.args ?? [], {
		env,
		detached: true,
		stdio: ['ignore', 'ignore', 'pipe'],
	})

	// (c) Stderr-tail diagnostic (vnc-bridge.ts:132-157 analog). Tracks the
	// last STDERR_TAIL_LIMIT lines so a crash dump is still useful even
	// after the process has been running for hours.
	const stderrTail: string[] = []
	child.stderr?.on('data', (chunk: Buffer) => {
		const line = chunk.toString('utf-8').trim()
		if (!line) return
		log?.verbose?.(`native-app[${cfg.name}] stderr: ${line}`)
		stderrTail.push(line)
		while (stderrTail.length > STDERR_TAIL_LIMIT) stderrTail.shift()
	})

	// (c2) Spawn-error handler — CRITICAL. Without an 'error' listener a failed
	// spawn (ENOENT for a missing/wrong binaryPath, EACCES, …) emits an UNHANDLED
	// 'error' event that throws and CRASHES the entire livinityd process — taking
	// down every app (incl. Docker, → 502). A single bad native-app config must
	// never crash the daemon. The async 'error' fires after this function returns,
	// so the listener MUST be attached here (synchronously) to catch it.
	child.on('error', (err) => {
		const tail = stderrTail.length > 0
			? `\n--- native-app[${cfg.name}] stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
			: ''
		log?.warn?.(
			`native-app[${cfg.name}] spawn error (${cfg.binaryPath}): ${err instanceof Error ? err.message : String(err)}${tail}`,
		)
	})

	child.on('exit', (code, signal) => {
		// code=0 → clean exit; code=null → killed by signal (signal arg carries
		// detail). We warn only on non-zero numeric codes so a deliberate
		// SIGTERM (e.g. user closed the app via the dock) does NOT emit a
		// scary warning. Signal-only exits are info-level.
		if (code !== 0 && code !== null) {
			const tail = stderrTail.length > 0
				? `\n--- native-app[${cfg.name}] stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
				: ' (no stderr captured)'
			log?.warn(
				`native-app[${cfg.name}] exited code=${code} signal=${signal}${tail}`,
			)
		} else if (code === null && signal) {
			log?.info(`native-app[${cfg.name}] terminated by signal=${signal}`)
		} else {
			log?.verbose?.(`native-app[${cfg.name}] exited cleanly (code=0)`)
		}
	})

	// (d) Unref so livinityd's event loop is not held open by this child.
	// Safe to call even when child.unref is not defined (testing edge or
	// future child_process API change).
	try {
		child.unref?.()
	} catch {
		/* noop */
	}

	if (!child.pid) {
		throw new NativeAppSpawnError('spawned child has no pid')
	}

	log?.info(`native-app[${cfg.name}] spawned pid=${child.pid} display=${display}`)
	return {pid: child.pid, child}
}
