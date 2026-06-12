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
import {execFile as execFileCb, spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {
	access as nodeAccess,
	rm as nodeRm,
	rename as nodeRename,
	mkdir as nodeMkdir,
	unlink as nodeUnlink,
} from 'node:fs/promises'
import {constants as fsConstants} from 'node:fs'
import {promisify} from 'node:util'

const execFile = promisify(execFileCb)

import {router, adminProcedure, privateProcedure} from '../server/trpc/trpc.js'
import {spawnXvfb} from '../streaming/xvfb-spawner.js'
import {spawnChromeProcess} from '../webapps/chrome-process-spawner.js'
import {getDesktopUser} from '../system/desktop-user.js'
import {startFluxbox, type FluxboxHandle} from '../webapps/fluxbox-wm.js'
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
type FluxboxSpawnFnLike = (opts: {
	display: string
	logger?: unknown
}) => Promise<{pid: number; display: string; stop(): Promise<void>}>

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
	// Phase 103.1-3 — chown master dir to bruce so SingletonLock can be written by `sudo -u bruce google-chrome`
	chownExecFn?: (cmd: string, args: string[]) => Promise<{stdout: string; stderr: string}>
	// Phase 103.1-5 — post-spawn dialog dismissal + main window activation. Tests inject a no-op.
	dismissProfileDialogFn?: (display: string) => Promise<void>
	// Phase 103.1-7 — resolve the master Chrome wid on each input call so dispatch
	// uses the explicit-wid xdotool path (same as WebApp). Tests inject a stub.
	resolveMasterChromeWidFn?: (display: string) => Promise<number | undefined>
	logger?: {info?: (msg: string) => void; warn?: (msg: string, err?: unknown) => void}
	// Phase 103-01 — Xvfb-driven master pipeline.
	displayAllocator?: DisplayAllocatorLike
	streamManager?: StreamManagerLike
	profileSeeder?: ProfileSeederLike
	// Native-primitive injection (test-only; production resolves at module level).
	xvfbSpawnFn?: XvfbSpawnFnLike
	chromeSpawnFn?: ChromeSpawnFnLike
	vncSpawnFn?: VncSpawnFnLike
	// Phase 103.1-4 — fluxbox spawn for master display so window focus works
	// (xdotool input dispatch needs a WM to deliver to the right window).
	fluxboxSpawnFn?: FluxboxSpawnFnLike
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
	// Phase 103.1-4 — fluxbox handle for cleanupMaster cascade
	fluxbox?: {stop(): Promise<void>}
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
 * Phase 103.1-7 — resolve the master Chrome window's actual X11 wid on the
 * master display, EXCLUDING any "Profile error" dialog. Used by the input
 * routes so each click/key/type/scroll dispatches via the WebApp's
 * explicit-wid xdotool path (windowactivate --sync wid → windowfocus
 * --sync wid → mousemove --window wid → click) instead of the brittle
 * display-mode search-and-pick-first path. WebApp parity: input on master
 * Chrome now behaves byte-for-byte the same as input on a per-WebApp
 * Chrome window.
 *
 * Returns undefined if no chrome-class window is visible on the display
 * (caller treats as "not ready yet, fall back to display-mode dispatch").
 */
async function resolveMasterChromeWid(
	display: string,
	execFileFn: typeof execFile,
): Promise<number | undefined> {
	const env = {...process.env, DISPLAY: display} as NodeJS.ProcessEnv
	let candidates: string[]
	try {
		const {stdout} = await execFileFn(
			'xdotool',
			['search', '--onlyvisible', '--class', 'chrome'],
			{env, timeout: 1500} as never,
		)
		candidates = String(stdout).trim().split('\n').filter(Boolean)
	} catch {
		return undefined
	}
	if (candidates.length === 0) return undefined

	// Pick the largest geometry — that's the main Chrome window, not the
	// small "Profile error" dialog (~400x213) or DevTools popup.
	let bestWid: number | undefined
	let bestArea = 0
	for (const widStr of candidates) {
		const wid = Number(widStr)
		if (!Number.isInteger(wid) || wid <= 0) continue
		try {
			// First, skip "Profile error" dialogs by name. xdotool returns
			// "Profile error occurred" verbatim for the modal.
			const {stdout: nameOut} = await execFileFn(
				'xdotool',
				['getwindowname', String(wid)],
				{env, timeout: 800} as never,
			)
			const name = String(nameOut).trim()
			if (/^Profile error/.test(name)) continue
			const {stdout: geomOut} = await execFileFn(
				'xdotool',
				['getwindowgeometry', '--shell', String(wid)],
				{env, timeout: 800} as never,
			)
			const wm = /^WIDTH=(\d+)$/m.exec(String(geomOut))
			const hm = /^HEIGHT=(\d+)$/m.exec(String(geomOut))
			const w = wm ? Number(wm[1]) : 0
			const h = hm ? Number(hm[1]) : 0
			const area = w * h
			if (area > bestArea) {
				bestArea = area
				bestWid = wid
			}
		} catch {
			// skip this candidate
		}
	}
	return bestWid
}

/**
 * Phase 103.1-5 — after master Chrome spawn, dismiss any "Profile error"
 * modal dialog and pre-activate the main Chrome window.
 *
 * Why: when livinityd restarts mid-master-session, the previous Chrome
 * process is killed without a clean shutdown. On the next spawn Chrome
 * detects `exited_cleanly:false` in `Local State` and pops a modal:
 *   "Profile error occurred — Some settings may not be available."
 * The dialog is its own top-level Chrome window with `class=Chrome` and
 * geometry like 400x213. xdotool's display-mode input dispatch uses
 * `search --class chrome --limit 1 windowactivate` which can match the
 * dialog instead of the main Chrome window. Result: every keystroke /
 * click the user sends from the master viewer lands on the dialog (or
 * disappears), and login is impossible — the exact 2026-05-11 symptom:
 *   "klavyeye yaziyorum 'a' geç basiyor, delete çalışmıyor".
 *
 * Fix: post-spawn polling loop (5 × 500ms) that:
 *   1. Searches for any window whose title starts with "Profile error"
 *      and sends `windowkill` to close it.
 *   2. Searches for the main Chrome window (largest visible Chrome window
 *      on the display, excluding the dialog) and `windowactivate --sync`
 *      it so subsequent dispatcher `search --limit 1` calls land on it.
 *
 * Failures are logged but non-fatal: if xdotool is absent or no window
 * is found yet, the loop retries; if we exhaust retries, dispatch falls
 * back to the existing search-and-activate logic in input-dispatcher.ts.
 */
async function dismissProfileErrorAndActivateMain(
	display: string,
	execFileFn: typeof execFile,
	logger?: MasterLoginInjectables['logger'],
): Promise<void> {
	const env = {...process.env, DISPLAY: display} as NodeJS.ProcessEnv
	for (let attempt = 0; attempt < 5; attempt++) {
		// 1. Try to find the "Profile error" dialog and dismiss it via
		//    `windowactivate + key Escape`. We deliberately do NOT use
		//    `windowkill` here — killing the X11 window can cascade-kill
		//    the parent Chrome process (live UAT 2026-05-11 showed Chrome
		//    rendering nothing when windowkill was the dismissal). Escape
		//    on a Chrome modal dialog tells Chrome to close it gracefully,
		//    same as the user clicking the X button.
		try {
			const {stdout} = await execFileFn(
				'xdotool',
				['search', '--onlyvisible', '--name', '^Profile error'],
				{env, timeout: 1000} as never,
			)
			const wids = String(stdout).trim().split('\n').filter(Boolean)
			for (const wid of wids) {
				try {
					await execFileFn(
						'xdotool',
						[
							'windowactivate',
							'--sync',
							wid,
							'key',
							'--clearmodifiers',
							'Escape',
						],
						{env, timeout: 1000} as never,
					)
					logger?.info?.(
						`[chrome-master] sent Escape to "Profile error" dialog wid=${wid} on ${display}`,
					)
				} catch {
					/* dismissal failed — non-fatal */
				}
			}
		} catch {
			/* search throws when no match — that is the happy path */
		}

		// 2. Find the main Chrome window (largest visible chrome class) and activate it.
		try {
			const {stdout} = await execFileFn(
				'xdotool',
				['search', '--onlyvisible', '--class', 'chrome'],
				{env, timeout: 1000} as never,
			)
			const wids = String(stdout)
				.trim()
				.split('\n')
				.filter(Boolean)
			let bestWid: string | undefined
			let bestArea = 0
			for (const wid of wids) {
				try {
					const {stdout: geomOut} = await execFileFn(
						'xdotool',
						['getwindowgeometry', '--shell', wid],
						{env, timeout: 1000} as never,
					)
					const wm = /^WIDTH=(\d+)$/m.exec(String(geomOut))
					const hm = /^HEIGHT=(\d+)$/m.exec(String(geomOut))
					const w = wm ? Number(wm[1]) : 0
					const h = hm ? Number(hm[1]) : 0
					const area = w * h
					if (area > bestArea) {
						bestArea = area
						bestWid = wid
					}
				} catch {
					/* skip wid we couldn't probe */
				}
			}
			if (bestWid !== undefined) {
				try {
					await execFileFn(
						'xdotool',
						['windowactivate', '--sync', bestWid, 'windowfocus', '--sync', bestWid],
						{env, timeout: 1000} as never,
					)
					logger?.info?.(
						`[chrome-master] activated main Chrome window wid=${bestWid} (area=${bestArea}) on ${display}`,
					)
					return // success — done.
				} catch {
					/* will retry */
				}
			}
		} catch {
			/* xdotool search failed (no windows yet) — retry */
		}

		await new Promise((r) => setTimeout(r, 500))
	}
	logger?.warn?.(
		`[chrome-master] dismissProfileErrorAndActivateMain exhausted retries on ${display}; dispatch will fall back to first-match`,
	)
}

/**
 * Phase 103.1-3 — chown the master profile dir to `bruce:bruce` so the
 * `sudo -u bruce google-chrome` process can create its
 * SingletonLock/SingletonCookie/SingletonSocket files at startup.
 *
 * Background: `livinityd` runs as root and its `profileSeeder.ensureMasterExists()`
 * does `mkdir({recursive: true})` against /opt/livos/data/chrome-master/. That
 * leaves the dir as `root:root:drwxr-xr-x`. Chrome then runs as bruce via
 * `sudo -n -u bruce` and tries to write `SingletonLock` in the dir — denied
 * with `Permission denied (13)`, Chrome exits with `code=21` and the message
 *
 *   Failed to create /opt/livos/data/chrome-master/SingletonLock: Permission denied (13)
 *   Failed to create a ProcessSingleton for your profile directory.
 *   Aborting now to avoid profile corruption.
 *
 * The same pattern is already handled for per-app WebApp profile dirs in
 * `profile-seeder.ts:244` (`execP('chown', ['-R', 'bruce:bruce', appDir])`).
 * Master path was missed because the master dir is rarely re-created (one-shot
 * via Settings → Chrome Profile login).
 *
 * Live diagnostic 2026-05-11: `sudo -u bruce google-chrome ... master-dir` on
 * Mini PC reproduces `EXIT FIRED: code=21 signal=null` with the above stderr.
 *
 * Idempotent — re-running chown on an already-bruce-owned dir is a no-op.
 * Non-fatal: if chown fails (e.g. dir doesn't exist yet, or bruce user is
 * absent on a non-Linux test host), we log and let `chromeSpawnFn` surface
 * the underlying error (no regression vs pre-103.1-3 behavior).
 */
async function ensureMasterDirWritableByBruce(
	dir: string,
	chownExecFn: (cmd: string, args: string[]) => Promise<{stdout: string; stderr: string}>,
	logger?: MasterLoginInjectables['logger'],
): Promise<void> {
	try {
		const _du = getDesktopUser()
		await chownExecFn('chown', [`${_du}:${_du}`, dir])
	} catch (err) {
		logger?.warn?.(
			`[chrome-master] ensureMasterDirWritableByBruce: chown ${dir} failed (non-fatal — Chrome may fail to start)`,
			err,
		)
	}
}

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
	const chownExecFn =
		injectables.chownExecFn ??
		((cmd: string, args: string[]) =>
			execFile(cmd, args) as Promise<{stdout: string; stderr: string}>)
	const logger = injectables.logger
	const dismissProfileDialogFn =
		injectables.dismissProfileDialogFn ??
		((display: string) => dismissProfileErrorAndActivateMain(display, execFile, logger))
	const resolveMasterChromeWidFn =
		injectables.resolveMasterChromeWidFn ??
		((display: string) => resolveMasterChromeWid(display, execFile))
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
	const fluxboxSpawnFn: FluxboxSpawnFnLike =
		injectables.fluxboxSpawnFn ??
		(((opts: {display: string}) =>
			startFluxbox({display: opts.display})) as FluxboxSpawnFnLike)
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
		// 3.5 SIGTERM fluxbox (103.1-4)
		if (m.fluxbox) {
			try {
				await m.fluxbox.stop()
			} catch {
				/* non-fatal */
			}
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

			// Phase 103.1-3 — chown master dir to bruce so `sudo -u bruce
			// google-chrome` can create its SingletonLock. profileSeeder's
			// mkdir runs as root and leaves the dir root:root:755, which
			// causes Chrome to exit code=21 with "Failed to create
			// SingletonLock: Permission denied" — the TRUE blocking root
			// cause of the WS 1006 bug, deeper than the stale-lock and
			// daemonization-filter fixes.
			await ensureMasterDirWritableByBruce(MASTER_PROFILE_DIR, chownExecFn, logger)

			// Phase 103.1 — clear stale Chromium singleton lock files (one
			// layer of the WS 1006 bug; another being the wrong dir owner
			// fixed by ensureMasterDirWritableByBruce above, and the third
			// being the daemonization filter on chrome.on('exit') below).
			// Failure to clear is non-fatal — Chrome will hit the same lock
			// and the user sees the same bug, which is no worse than before.
			await clearStaleSingletonLocks(MASTER_PROFILE_DIR, unlinkFn, logger)

			const displayN = displayAllocator.allocate()
			const display = `:${displayN}`

			let xvfb: XvfbHandleLike | null = null
			let chrome: ChromeProcessHandleLike | null = null
			let port: number | null = null
			let x11vnc: ChildProcess | null = null
			let stream: {streamId: string; wsUrl: string} | null = null
			let fluxbox: {pid: number; display: string; stop(): Promise<void>} | null = null

			try {
				// 3. Xvfb on :N with readiness poll.
				xvfb = await xvfbSpawnFn({display, width: 1280, height: 720})

				// 3.5 Phase 103.1-4 — fluxbox WM on the same display so that:
				//   (a) xdotool input dispatch finds a focused window (otherwise
				//       keystrokes/clicks land in the void — user-visible bug
				//       2026-05-11 "Chrome görüyorum ama ekrani kullanamiyorum"),
				//   (b) wmctrl can publish `_NET_CLIENT_LIST` so list_windows
				//       aggregation actually finds the master Chrome window
				//       instead of skipping the display silently.
				// Same pattern WebApp window-manager uses on per-app Xvfbs.
				fluxbox = await fluxboxSpawnFn({display})

				// 4. Per-master Chrome subprocess on :N pointed at the master profile.
				chrome = await chromeSpawnFn({
					display,
					userDataDir: MASTER_PROFILE_DIR,
					url: 'https://accounts.google.com',
				})

				// 4.5 Phase 103.1-5 — dismiss the "Profile error occurred" modal
				// (if Chrome detects exited_cleanly:false from a prior livinityd
				// restart) and pre-activate the main Chrome window.
				//
				// Fire-and-forget on a separate tick so the awaited startLogin
				// path does NOT interfere with Chrome's startup race — earlier
				// `await dismissProfileDialogFn` caused Chrome to die silently
				// (live UAT 2026-05-11: status returned running:true but no
				// window rendered on the master Xvfb). The dispatcher's own
				// activate-first chain handles per-call routing; this helper
				// just nudges the X11 focus to the main window for the first
				// few seconds while the user might be racing the dialog.
				void dismissProfileDialogFn(display).catch(() => {
					/* non-fatal — dispatcher fallback is sufficient */
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
					fluxbox: fluxbox ?? undefined,
				}

				// 8. REQ-103-A4 — chrome exit watcher → cleanupMaster cascade.
				//
				// Phase 103.1 — `chrome.child` is the `sudo -n -u bruce
				// google-chrome ...` wrapper process. Google Chrome forks
				// itself into the background on startup; the launcher
				// (the one sudo execs) then exits with code=0. That is NOT
				// a Chrome crash — the actual Chrome process continues
				// running detached on the assigned Xvfb. Pre-103.1 the
				// exit handler treated code=0 as a crash and tore down
				// the stream within ms of spawn, causing the WS 1006 bug
				// the user surfaced on 2026-05-11. Filter:
				//
				//   code=0 + signal=null  → daemonization (no-op)
				//   code!=0               → real crash (cleanup)
				//   code=null + signal    → SIGTERM/SIGKILL (cleanup)
				//
				// Trade-off: a clean post-daemonization Chrome crash will
				// not be auto-detected (the launcher already returned).
				// User can recover by clicking "Close Master Chrome" which
				// calls cleanupMaster explicitly. A future patch could
				// poll the daemonized PID via /proc; out of scope for the
				// 103.1 hot-fix.
				chrome.child.on('exit', (code, signal) => {
					if (code === 0 && signal === null) {
						logger?.info?.(
							`[chrome-master] sudo wrapper exited code=0 (Chrome daemonized to background) — keeping stream alive (Phase 103.1)`,
						)
						return
					}
					logger?.warn?.(
						`[chrome-master] chrome wrapper exited code=${code} signal=${signal} — running cleanupMaster cascade`,
					)
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
				if (fluxbox) {
					try {
						await fluxbox.stop()
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
					// Phase 103.1-7 — WebApp parity: resolve the real Chrome
					// wid on each call and dispatch via the explicit-wid xdotool
					// path. wid=0 falls back to display-mode which is fragile
					// when the Profile error modal is open.
					const wid = (await resolveMasterChromeWidFn(currentMaster.display)) ?? 0
					await dispatchPointerFn(
						wid,
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
					const wid = (await resolveMasterChromeWidFn(currentMaster.display)) ?? 0
					await dispatchKeyFn(wid, input.key, input.kind, currentMaster.display)
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
					const wid = (await resolveMasterChromeWidFn(currentMaster.display)) ?? 0
					await dispatchTypeFn(wid, input.text, currentMaster.display)
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
					const wid = (await resolveMasterChromeWidFn(currentMaster.display)) ?? 0
					await dispatchScrollFn(
						wid,
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
