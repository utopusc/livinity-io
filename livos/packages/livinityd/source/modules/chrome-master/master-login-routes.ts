/**
 * Phase 102-07 + Phase 103-01 — Chrome Master Login tRPC routes
 * (D-102-MASTER-LOGIN-UI / REQ-103-A1 / REQ-103-A3 / REQ-103-A4).
 *
 * Admin-gated routes for managing the master Chrome profile that lives at
 * /opt/livos/data/chrome-master/ (also exported as `MASTER_PROFILE_DIR`).
 *
 *   chromeMaster.status        — privateProcedure query; reads
 *                                /opt/livos/data/chrome-master/Default/Cookies
 *                                presence (does NOT decrypt the contents) and
 *                                returns {hasCookies, dir, running, pid?,
 *                                startedAt?, display?, wsUrl?, streamId?}.
 *
 *   chromeMaster.startLogin    — adminProcedure mutation (T-102-07 + T-103-01-01);
 *                                allocates an Xvfb display via DisplayAllocator,
 *                                spawns Xvfb on :N, spawns chrome with
 *                                --user-data-dir=/opt/livos/data/chrome-master,
 *                                spawns x11vnc bound to the display, then opens
 *                                a StreamManager 'vnc-window' session. Returns
 *                                {pid, startedAt, display, wsUrl, streamId}.
 *
 *                                Phase 103 supersedes the Phase 102-07 `:0`
 *                                physical-screen path — headless Mini PCs have
 *                                no monitor and the old path produced an
 *                                invisible browser window. Streaming the
 *                                managed Xvfb display via the noVNC pipeline
 *                                (the same one used by every per-app WebApp)
 *                                lets the user reach the master Chrome through
 *                                the UI viewer (plan 103-02).
 *
 *   chromeMaster.stopLogin     — adminProcedure mutation; cleans up master
 *                                state (stream → x11vnc → chrome → xvfb →
 *                                port/display release) idempotently. Returns
 *                                {ok:true}. PRECONDITION_FAILED if not running.
 *
 *   chromeMaster.input.click   — adminProcedure mutation; dispatches
 *                                xdotool against the master display via the
 *                                shared input-dispatcher (wid=0 display-mode
 *                                branch). Same surface for .key / .type /
 *                                .scroll.
 *
 *   chromeMaster.reset         — adminProcedure mutation (T-102-07c); wipes
 *                                /opt/livos/data/chrome-master, optionally
 *                                renaming to .backup first (default
 *                                backup=true).
 *
 *   chromeMaster.restoreBackup — adminProcedure mutation; renames
 *                                .backup back over master.
 *
 * Threat mitigations:
 *
 *   T-102-07  Elevation of Privilege — adminProcedure gate on every mutation.
 *
 *   T-102-07b Tampering (concurrent master spawns) — module-singleton
 *             `currentMaster` lock; second concurrent startLogin throws
 *             CONFLICT. The child exit watcher + stopLogin clear it.
 *
 *   T-102-07c Data Loss (accidental reset) — default backup=true renames
 *             master → master.backup BEFORE delete. UI confirms via
 *             AlertDialog before invoking. restoreBackup is also
 *             adminProcedure-gated.
 *
 *   T-103-01-01 Elevation (chromeMaster.startLogin / stopLogin / input.*) —
 *             adminProcedure middleware enforces role=admin BEFORE handler;
 *             non-admin caller gets FORBIDDEN before any spawn/dispatch runs.
 *
 *   T-103-01-02 Tampering (chrome-process-spawner USER_DATA_DIR_RE) — addressed
 *             by 103-01 Task 1 (regex widening); the caller here passes the
 *             hardcoded MASTER_PROFILE_DIR constant, not a caller-controlled
 *             path.
 *
 *   T-103-01-03 Tampering (input.click x/y/button payload) — zod schema rejects
 *             non-finite x/y, out-of-range button, bad kind enum. The `display`
 *             argument is NOT accepted from the caller — it's read from
 *             currentMaster.display so no injection surface exists.
 *
 *   T-103-01-04 DenialOfService (resource leak on master Chrome crash) —
 *             cleanupMaster() runs on chrome.on('exit'), on explicit stopLogin,
 *             AND on startLogin compensating-cleanup. PortAllocator.release +
 *             DisplayAllocator.release paired with every allocate.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f — never touched.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {
	access as nodeAccess,
	rm as nodeRm,
	rename as nodeRename,
	mkdir as nodeMkdir,
	unlink as nodeUnlink,
} from 'node:fs/promises'
import {constants as fsConstants} from 'node:fs'

import {router, adminProcedure, privateProcedure} from '../server/trpc/trpc.js'
import {spawnXvfb} from '../streaming/xvfb-spawner.js'
import {spawnChromeProcess} from '../webapps/chrome-process-spawner.js'
import {spawnVncForDisplay} from '../streaming/vnc-bridge.js'
import {
	dispatchPointer as defaultDispatchPointer,
	dispatchKey as defaultDispatchKey,
	dispatchType as defaultDispatchType,
	dispatchScroll as defaultDispatchScroll,
} from '../webapps/input-dispatcher.js'

export const MASTER_PROFILE_DIR = '/opt/livos/data/chrome-master'
export const MASTER_BACKUP_DIR = '/opt/livos/data/chrome-master.backup'
const COOKIES_PATH = `${MASTER_PROFILE_DIR}/Default/Cookies`

// Phase 103-01 — direction enum for scroll dispatch. dispatchScroll consumes
// 'up'|'down'|'left'|'right' (its newer signature) rather than X11 button
// numbers; we forward the literal direction unchanged.
type ScrollDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Lightweight type-only handles for the Phase 103-01 native primitives.
 * These mirror the shapes exported by streaming/xvfb-spawner.ts,
 * webapps/chrome-process-spawner.ts and streaming/vnc-bridge.ts but are
 * re-declared here as structural types so tests can pass plain mocks
 * without importing the real classes.
 */
interface XvfbHandleLike {
	display: string
	pid: number
	stop(): Promise<void>
}
interface ChromeProcessHandleLike {
	pid: number
	child: ChildProcess
	stop(): Promise<void>
}

type XvfbSpawnFnLike = (opts: {
	display: string
	width: number
	height: number
	logger?: unknown
}) => Promise<XvfbHandleLike>
type ChromeSpawnFnLike = (opts: {
	display: string
	userDataDir: string
	url: string
	logger?: unknown
}) => Promise<ChromeProcessHandleLike>
type VncSpawnFnLike = (opts: {
	display: string
	rfbPort: number
	logger?: unknown
}) => ChildProcess

type DispatchPointerFnLike = (
	wid: number,
	x: number,
	y: number,
	button: 1 | 2 | 3,
	kind: 'click' | 'mousedown' | 'mouseup' | 'doubleclick',
	display?: string,
) => Promise<void>
type DispatchKeyFnLike = (
	wid: number,
	key: string,
	kind?: 'key' | 'keydown' | 'keyup',
	display?: string,
) => Promise<void>
type DispatchTypeFnLike = (wid: number, text: string, display?: string) => Promise<void>
type DispatchScrollFnLike = (
	wid: number,
	x: number,
	y: number,
	direction: ScrollDirection,
	clicks: number,
	display?: string,
) => Promise<void>

interface DisplayAllocatorLike {
	allocate(): number
	release(n: number): void
}
interface PortAllocatorLike {
	allocate(): number
	release(n: number): void
}
interface StreamManagerLike {
	startStream(opts: {
		userId: string
		mode: 'vnc-window'
		target: {display: string}
	}): {streamId: string; wsUrl: string}
	// Real StreamManager returns Promise<{stopped: boolean}>; tests may return
	// Promise<void>. Either is fine — we await it but never inspect the result.
	stopStream(streamId: string): Promise<unknown>
	getPortAllocator(): PortAllocatorLike
}
interface ProfileSeederLike {
	ensureMasterExists(): Promise<void>
}

/**
 * Injection bag for unit tests. Production callers (livinityd index.ts —
 * Phase 103-01 Task 3) wire the Phase 103-01 fields with real allocator /
 * streamManager / profileSeeder instances. Tests pass mocks via
 * createChromeMasterRouter({...}).
 */
export interface MasterLoginInjectables {
	// EXISTING Phase 102-07 fields (status / reset / restoreBackup paths)
	spawnFn?: typeof nodeSpawn
	accessFn?: typeof nodeAccess
	rmFn?: typeof nodeRm
	renameFn?: typeof nodeRename
	mkdirFn?: typeof nodeMkdir
	// Phase 103.1 — stale singleton lock cleanup before Chrome spawn
	unlinkFn?: typeof nodeUnlink
	logger?: {info?: (msg: string) => void; warn?: (msg: string, err?: unknown) => void}
	// Phase 103-01 — Xvfb-driven master pipeline.
	displayAllocator?: DisplayAllocatorLike
	streamManager?: StreamManagerLike
	profileSeeder?: ProfileSeederLike
	// Native-primitive injection (test-only; production resolves at module level).
	xvfbSpawnFn?: XvfbSpawnFnLike
	chromeSpawnFn?: ChromeSpawnFnLike
	vncSpawnFn?: VncSpawnFnLike
	// Input dispatcher injection (default = real input-dispatcher exports).
	dispatchPointerFn?: DispatchPointerFnLike
	dispatchKeyFn?: DispatchKeyFnLike
	dispatchTypeFn?: DispatchTypeFnLike
	dispatchScrollFn?: DispatchScrollFnLike
}

interface CurrentMaster {
	pid: number
	child: ChildProcess
	startedAt: number
	// Phase 103-01 fields
	displayN: number
	display: string
	rfbPort: number
	streamId: string
	wsUrl: string
	xvfb: {stop(): Promise<void>}
	x11vnc: ChildProcess
	chrome: {stop(): Promise<void>}
}

// Module-singleton state (per livinityd boot). T-102-07b: prevents concurrent
// master Chrome spawns from racing on the same --user-data-dir.
let currentMaster: CurrentMaster | null = null

/**
 * Test-only state reset. The router uses a module-scoped `currentMaster`
 * singleton (T-102-07b lock); tests reset between cases. NOT exported from
 * index.ts barrel — internal-only.
 */
export function _resetMasterStateForTest(): void {
	currentMaster = null
}

/**
 * Factory: returns a tRPC router with injected fs+child_process+streaming
 * primitives.
 *
 * The default export `chromeMasterRouter` (kept for back-compat with the
 * server/trpc/index.ts composition site) calls this with empty injectables.
 * Without injection the Phase 103-01 routes (startLogin / stopLogin /
 * input.*) throw INTERNAL_SERVER_ERROR — production wire-up lives in
 * livinityd/source/index.ts (Phase 103-01 Task 3).
 *
 * status() + reset() + restoreBackup() work without Phase 103 deps; they
 * only rely on the existing fs primitives.
 */
/**
 * Phase 103.1 — list of Chromium process-singleton artifacts to clear before
 * a fresh master Chrome spawn. When a prior master session crashed or got
 * SIGKILLed (e.g. host restart, OOM kill), these files persist with an
 * embedded dead PID. Chromium's process_singleton_posix.cc reads them,
 * attempts to message the dead PID, and the new instance exits with non-zero
 * code → our `chrome.on('exit')` fires → cleanupMaster runs → the stream we
 * just registered gets stopStream'd → client WS attempt 404s.
 *
 * Clearing them is safe: a LIVE Chrome holds advisory locks on these files
 * via flock(); if a prior instance is still alive it'll re-create them on
 * its next IPC round-trip. The only side-effect of a wrongful delete is the
 * tiny risk of two Chromes contending — which Chromium itself recovers from
 * (the loser exits gracefully). The current bug (stale lock blocking new
 * Chrome) is the dominant failure mode for an OS that auto-restarts livinityd.
 */
const CHROME_SINGLETON_LOCK_FILES = [
	'SingletonLock',
	'SingletonCookie',
	'SingletonSocket',
] as const

/**
 * Delete any stale Chromium singleton-lock artifacts in `dir`. Each missing
 * file is silently ignored (ENOENT is the happy path). Non-ENOENT errors
 * are logged but never thrown — failure to clear should not block startup,
 * Chrome will just hit the same lock and the user will see the same bug
 * (no regression vs pre-103.1 behavior).
 */
async function clearStaleSingletonLocks(
	dir: string,
	unlinkFn: typeof nodeUnlink,
	logger?: MasterLoginInjectables['logger'],
): Promise<number> {
	let cleared = 0
	for (const f of CHROME_SINGLETON_LOCK_FILES) {
		try {
			await unlinkFn(`${dir}/${f}`)
			cleared += 1
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code
			if (code !== 'ENOENT') {
				logger?.warn?.(
					`[chrome-master] clearStaleSingletonLocks: could not unlink ${f}`,
					err,
				)
			}
		}
	}
	if (cleared > 0) {
		logger?.info?.(
			`[chrome-master] cleared ${cleared} stale Chromium singleton-lock file(s) from ${dir} (Phase 103.1)`,
		)
	}
	return cleared
}

export function createChromeMasterRouter(injectables: MasterLoginInjectables = {}) {
	const accessFn = injectables.accessFn ?? nodeAccess
	const rmFn = injectables.rmFn ?? nodeRm
	const renameFn = injectables.renameFn ?? nodeRename
	const mkdirFn = injectables.mkdirFn ?? nodeMkdir
	const unlinkFn = injectables.unlinkFn ?? nodeUnlink
	const logger = injectables.logger
	// Phase 103-01 — capture injectables in closure so cleanupMaster() can
	// reach them from chrome.on('exit') AND stopLogin via the same handles.
	const displayAllocator = injectables.displayAllocator
	const streamManager = injectables.streamManager
	const profileSeeder = injectables.profileSeeder
	const xvfbSpawnFn = injectables.xvfbSpawnFn ?? (spawnXvfb as unknown as XvfbSpawnFnLike)
	const chromeSpawnFn =
		injectables.chromeSpawnFn ?? (spawnChromeProcess as unknown as ChromeSpawnFnLike)
	const vncSpawnFn =
		injectables.vncSpawnFn ?? (spawnVncForDisplay as unknown as VncSpawnFnLike)
	const dispatchPointerFn =
		injectables.dispatchPointerFn ?? (defaultDispatchPointer as DispatchPointerFnLike)
	const dispatchKeyFn = injectables.dispatchKeyFn ?? (defaultDispatchKey as DispatchKeyFnLike)
	const dispatchTypeFn =
		injectables.dispatchTypeFn ?? (defaultDispatchType as DispatchTypeFnLike)
	const dispatchScrollFn =
		injectables.dispatchScrollFn ?? (defaultDispatchScroll as unknown as DispatchScrollFnLike)

	function depsMissingError(): TRPCError {
		return new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message:
				'chromeMaster routes require displayAllocator + streamManager + profileSeeder injection (see livinityd index.ts wire-up)',
		})
	}

	/**
	 * Idempotent teardown — runs through ALL exit paths (chrome.on('exit'),
	 * explicit stopLogin, startLogin compensating cleanup). Each step in its
	 * own try/catch so a failure in (e.g.) stopStream doesn't prevent the
	 * displayAllocator.release at the end. Pairs every allocate with a
	 * release. REQ-103-A4 invariant.
	 */
	async function cleanupMaster(): Promise<void> {
		if (currentMaster === null) return
		const m = currentMaster
		currentMaster = null
		// 1. stop stream (StreamManager.stopStream sends SIGTERM to its x11vnc)
		if (streamManager) {
			try {
				await streamManager.stopStream(m.streamId)
			} catch {
				/* non-fatal */
			}
		}
		// 2. SIGTERM x11vnc directly as belt-and-braces (idempotent double-kill)
		try {
			m.x11vnc.kill('SIGTERM')
		} catch {
			/* non-fatal */
		}
		// 3. SIGTERM chrome (if not already exited)
		try {
			await m.chrome.stop()
		} catch {
			/* non-fatal */
		}
		// 4. SIGTERM xvfb
		try {
			await m.xvfb.stop()
		} catch {
			/* non-fatal */
		}
		// 5. release port + display
		if (streamManager) {
			try {
				streamManager.getPortAllocator().release(m.rfbPort)
			} catch {
				/* non-fatal */
			}
		}
		if (displayAllocator) {
			try {
				displayAllocator.release(m.displayN)
			} catch {
				/* non-fatal */
			}
		}
	}

	return router({
		/**
		 * chromeMaster.status — privateProcedure (any authenticated user can
		 * read; mutations are admin-only). Returns:
		 *
		 *   - hasCookies / dir — Phase 102-07 (master profile presence)
		 *   - running / pid / startedAt — Phase 102-07b (singleton state)
		 *   - display / wsUrl / streamId — Phase 103-01 (active stream binding)
		 */
		status: privateProcedure.query(async () => {
			let hasCookies = false
			try {
				await accessFn(COOKIES_PATH, fsConstants.R_OK)
				hasCookies = true
			} catch {
				/* file absent — user has not yet completed master login */
			}
			return {
				hasCookies,
				dir: MASTER_PROFILE_DIR,
				running: currentMaster !== null,
				pid: currentMaster?.pid,
				startedAt: currentMaster?.startedAt,
				// Phase 103-01:
				display: currentMaster?.display,
				wsUrl: currentMaster?.wsUrl,
				streamId: currentMaster?.streamId,
			}
		}),

		/**
		 * chromeMaster.startLogin — adminProcedure mutation (T-102-07 + T-103-01-01).
		 *
		 * Phase 103-01 pipeline:
		 *   1. profileSeeder.ensureMasterExists — idempotent mkdir on MASTER_PROFILE_DIR.
		 *   2. displayAllocator.allocate → :N
		 *   3. spawnXvfb({display, width: 1280, height: 720})
		 *   4. spawnChromeProcess({display, userDataDir: MASTER_PROFILE_DIR, url})
		 *   5. portAllocator.allocate → rfbPort
		 *   6. spawnVncForDisplay({display, rfbPort})
		 *   7. streamManager.startStream({mode: 'vnc-window', target: {display}})
		 *   8. chrome.on('exit', cleanupMaster) — REQ-103-A4 exit watcher
		 *
		 * Compensating-cleanup REVERSE order on any throw. Singleton lock from
		 * Phase 102-07b preserved.
		 */
		startLogin: adminProcedure.mutation(async ({ctx}) => {
			if (!displayAllocator || !streamManager || !profileSeeder) {
				throw depsMissingError()
			}
			if (currentMaster !== null) {
				throw new TRPCError({
					code: 'CONFLICT',
					message:
						'master chrome already running; close the existing window before starting a new login',
				})
			}

			await profileSeeder.ensureMasterExists()

			// Phase 103.1 — clear stale Chromium singleton lock files (root
			// cause of the WS 1006 bug seen in 103-01 deploy UAT 2026-05-11:
			// stream registered then immediately stopRequested because Chrome
			// exited within ms of spawn). Failure to clear is non-fatal —
			// Chrome will hit the same lock and the user sees the same bug,
			// which is no worse than before 103.1.
			await clearStaleSingletonLocks(MASTER_PROFILE_DIR, unlinkFn, logger)

			const displayN = displayAllocator.allocate()
			const display = `:${displayN}`

			let xvfb: XvfbHandleLike | null = null
			let chrome: ChromeProcessHandleLike | null = null
			let port: number | null = null
			let x11vnc: ChildProcess | null = null
			let stream: {streamId: string; wsUrl: string} | null = null

			try {
				// 3. Xvfb on :N with readiness poll.
				xvfb = await xvfbSpawnFn({display, width: 1280, height: 720})

				// 4. Per-master Chrome subprocess on :N pointed at the master profile.
				chrome = await chromeSpawnFn({
					display,
					userDataDir: MASTER_PROFILE_DIR,
					url: 'https://accounts.google.com',
				})

				// 5. Allocate RFB port from the shared StreamManager port pool.
				port = streamManager.getPortAllocator().allocate()

				// 6. Spawn x11vnc bound to the whole display.
				x11vnc = vncSpawnFn({display, rfbPort: port})

				// 7. StreamManager 'vnc-window' session on the same display.
				// adminProcedure guarantees ctx.currentUser is set (privateProcedure
				// -> isAuthenticated -> requireRole('admin')) but the inferred
				// Context type still marks it optional, so use `?.id ?? 'admin'`.
				stream = streamManager.startStream({
					userId: ctx.currentUser?.id ?? 'admin',
					mode: 'vnc-window',
					target: {display},
				})

				const startedAt = Date.now()
				currentMaster = {
					pid: chrome.pid,
					child: chrome.child,
					startedAt,
					displayN,
					display,
					rfbPort: port,
					streamId: stream.streamId,
					wsUrl: stream.wsUrl,
					xvfb,
					x11vnc,
					chrome,
				}

				// 8. REQ-103-A4 — chrome exit watcher → cleanupMaster cascade.
				chrome.child.on('exit', () => {
					void cleanupMaster()
				})

				return {
					pid: chrome.pid,
					startedAt,
					display,
					streamId: stream.streamId,
					wsUrl: stream.wsUrl,
				}
			} catch (err) {
				// Compensating cleanup — REVERSE order. Each step try/catch so a
				// failure does not prevent later releases.
				if (stream) {
					try {
						await streamManager.stopStream(stream.streamId)
					} catch {
						/* non-fatal */
					}
				}
				if (x11vnc) {
					try {
						x11vnc.kill('SIGTERM')
					} catch {
						/* non-fatal */
					}
				}
				if (chrome) {
					try {
						await chrome.stop()
					} catch {
						/* non-fatal */
					}
				}
				if (xvfb) {
					try {
						await xvfb.stop()
					} catch {
						/* non-fatal */
					}
				}
				if (port !== null) {
					try {
						streamManager.getPortAllocator().release(port)
					} catch {
						/* non-fatal */
					}
				}
				try {
					displayAllocator.release(displayN)
				} catch {
					/* non-fatal */
				}
				throw err
			}
		}),

		/**
		 * chromeMaster.stopLogin — adminProcedure mutation (Phase 103-01).
		 *
		 * Idempotent teardown invoked via cleanupMaster. PRECONDITION_FAILED
		 * if no master is currently running.
		 */
		stopLogin: adminProcedure.mutation(async () => {
			if (!displayAllocator || !streamManager || !profileSeeder) {
				throw depsMissingError()
			}
			if (currentMaster === null) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'no master Chrome running',
				})
			}
			await cleanupMaster()
			return {ok: true}
		}),

		/**
		 * Phase 103-01 — input dispatch sub-router. Every mutation is
		 * admin-gated (T-103-01-01) and zod-validated (T-103-01-03). The
		 * `display` argument is NOT accepted from the caller — it's read from
		 * currentMaster.display so callers cannot drive xdotool against
		 * arbitrary X displays.
		 */
		input: router({
			click: adminProcedure
				.input(
					z.object({
						x: z.number().finite(),
						y: z.number().finite(),
						button: z.number().int().min(1).max(3),
						kind: z
							.enum(['click', 'mousedown', 'mouseup', 'doubleclick'])
							.default('click'),
					}),
				)
				.mutation(async ({input}) => {
					if (!displayAllocator || !streamManager || !profileSeeder) {
						throw depsMissingError()
					}
					if (currentMaster === null) {
						throw new TRPCError({
							code: 'PRECONDITION_FAILED',
							message: 'no master Chrome running',
						})
					}
					await dispatchPointerFn(
						0,
						input.x,
						input.y,
						input.button as 1 | 2 | 3,
						input.kind,
						currentMaster.display,
					)
					return {ok: true}
				}),
			key: adminProcedure
				.input(
					z.object({
						key: z.string().min(1).max(64),
						kind: z.enum(['key', 'keydown', 'keyup']).default('key'),
					}),
				)
				.mutation(async ({input}) => {
					if (!displayAllocator || !streamManager || !profileSeeder) {
						throw depsMissingError()
					}
					if (currentMaster === null) {
						throw new TRPCError({
							code: 'PRECONDITION_FAILED',
							message: 'no master Chrome running',
						})
					}
					await dispatchKeyFn(0, input.key, input.kind, currentMaster.display)
					return {ok: true}
				}),
			type: adminProcedure
				.input(z.object({text: z.string().max(4096)}))
				.mutation(async ({input}) => {
					if (!displayAllocator || !streamManager || !profileSeeder) {
						throw depsMissingError()
					}
					if (currentMaster === null) {
						throw new TRPCError({
							code: 'PRECONDITION_FAILED',
							message: 'no master Chrome running',
						})
					}
					await dispatchTypeFn(0, input.text, currentMaster.display)
					return {ok: true}
				}),
			scroll: adminProcedure
				.input(
					z.object({
						x: z.number().finite(),
						y: z.number().finite(),
						direction: z.enum(['up', 'down', 'left', 'right']),
						clicks: z.number().int().min(1).max(50).default(1),
					}),
				)
				.mutation(async ({input}) => {
					if (!displayAllocator || !streamManager || !profileSeeder) {
						throw depsMissingError()
					}
					if (currentMaster === null) {
						throw new TRPCError({
							code: 'PRECONDITION_FAILED',
							message: 'no master Chrome running',
						})
					}
					await dispatchScrollFn(
						0,
						input.x,
						input.y,
						input.direction,
						input.clicks,
						currentMaster.display,
					)
					return {ok: true}
				}),
		}),

		/**
		 * chromeMaster.reset — adminProcedure mutation (T-102-07c).
		 *
		 * Two paths:
		 *   - backup=true (default): rename master → master.backup, then
		 *     mkdir master. Existing master.backup is rm -rf'd first so the
		 *     rename can't ENOTEMPTY. If the master dir does not exist this
		 *     becomes a no-op for the rename path (mkdir still runs).
		 *   - backup=false: rm -rf master directly, no rename.
		 *
		 * Refuses to run while master Chrome is up; user must close it.
		 */
		reset: adminProcedure
			.input(z.object({backup: z.boolean().default(true)}))
			.mutation(async ({input}) => {
				if (currentMaster !== null) {
					throw new TRPCError({
						code: 'CONFLICT',
						message:
							'master chrome is still running; close it before resetting the profile',
					})
				}
				if (input.backup) {
					let masterPresent = true
					try {
						await accessFn(MASTER_PROFILE_DIR, fsConstants.F_OK)
					} catch {
						masterPresent = false
					}
					if (masterPresent) {
						try {
							await rmFn(MASTER_BACKUP_DIR, {recursive: true, force: true})
						} catch {
							/* nothing to clear */
						}
						await renameFn(MASTER_PROFILE_DIR, MASTER_BACKUP_DIR)
					}
				} else {
					await rmFn(MASTER_PROFILE_DIR, {recursive: true, force: true})
				}
				await mkdirFn(MASTER_PROFILE_DIR, {recursive: true})
				return {ok: true}
			}),

		/**
		 * chromeMaster.restoreBackup — adminProcedure mutation. Renames
		 * master.backup back over master, restoring the pre-reset profile.
		 * Throws NOT_FOUND if no backup exists.
		 */
		restoreBackup: adminProcedure.mutation(async () => {
			if (currentMaster !== null) {
				throw new TRPCError({
					code: 'CONFLICT',
					message:
						'master chrome is still running; close it before restoring the backup',
				})
			}
			try {
				await accessFn(MASTER_BACKUP_DIR, fsConstants.F_OK)
			} catch {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'no master profile backup available',
				})
			}
			try {
				await rmFn(MASTER_PROFILE_DIR, {recursive: true, force: true})
			} catch {
				/* master may already be absent — fine */
			}
			await renameFn(MASTER_BACKUP_DIR, MASTER_PROFILE_DIR)
			return {ok: true}
		}),
	})
}

/**
 * Default export — empty-injection back-compat router. Production wire-up in
 * livinityd/source/index.ts calls createChromeMasterRouter({...real deps...})
 * explicitly (Phase 103-01 Task 3). status() + reset() + restoreBackup() work
 * without Phase 103 deps; startLogin / stopLogin / input.* throw
 * INTERNAL_SERVER_ERROR if injection is missing.
 */
export const chromeMasterRouter = createChromeMasterRouter()

export type ChromeMasterRouter = typeof chromeMasterRouter
