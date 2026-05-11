/**
 * Phase 102-05 — Native-app display binder (display-only flow).
 *
 * Replaces the Phase 101-05 WM_CLASS poll on shared `:1`. Under Phase 102
 * (D-102-NATIVE-APP-PARITY) each native app gets a dedicated `:N` Xvfb
 * display allocated by `streaming/display-allocator.ts` + brought up by
 * `streaming/xvfb-spawner.ts`, so the binder no longer needs to find a wid
 * on a shared display — x11vnc captures the whole display (`-display :N`)
 * and the display IS the binding unit.
 *
 * Algorithm (all subprocess work happens upstream in the route):
 *   1. Allocate a port from the shared PortAllocator (101-02). If
 *      `startStreamFn` later rejects, release the port (cleanup safety).
 *   2. Call `startStreamFn({display, port, label})` — production wraps
 *      `StreamManager.startStream({mode: 'vnc-window', target: {display}})`.
 *   3. Return `{display, port, streamId, wsUrl}` on success.
 *
 * What this module DOES NOT do anymore (was Phase 101-05):
 *   - No xdotool / WM_CLASS poll loop. The shared-display ambiguity is gone.
 *   - No baseline-and-poll diff. No `snapshotWindowIds` export.
 *   - No `NativeAppWindowNotFoundError`. The window IS the display.
 *   - No `execFileFn` injection. No subprocess invocation of any kind.
 *
 * What this module STILL exposes (used by upstream callers):
 *   - `inferWmClass(binaryPath)`: pure basename helper — still useful for
 *     persisting `wmClassHint` metadata on the native-app config (D-101
 *     `nativeAppConfigSchema`). Not used by `bind` itself anymore.
 *   - `bind(opts)`: the display-based bind primitive.
 *   - `StreamStartFn`: the contract a callback must satisfy.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) — untouched.
 */

import {basename} from 'node:path'
import type {ChildProcess} from 'node:child_process'

import type {PortAllocator} from '../streaming/port-allocator.js'
import type {DisplayAllocator} from '../streaming/display-allocator.js'
import type {XvfbHandle} from '../streaming/xvfb-spawner.js'

/**
 * The contract a stream-start callback must satisfy. Production wraps
 * `StreamManager.startStream({userId, mode: 'vnc-window', target: {display}})`
 * into the Promise-returning shape the binder expects. Tests supply a
 * `vi.fn()` directly. The legacy Phase 101-05 shape was `{wid, port, label?}`
 * — Phase 102 swaps `wid` for `display` (D-102-NATIVE-APP-PARITY).
 */
export interface StreamStartFn {
	(opts: {display: string; port: number; label?: string}): Promise<{
		streamId: string
		wsUrl: string
	}>
}

/** Minimal logger surface — matches the spawner/window-manager conventions. */
export interface BinderLogger {
	info(msg: string): void
	warn(msg: string): void
	error(msg: string): void
	verbose?(msg: string): void
}

/**
 * Infer a sensible WM_CLASS-style identifier from a binary path. The basename
 * is lowercased and any trailing file extension is stripped. The result is
 * persisted on the native-app config under `wmClassHint` for diagnostic /
 * future-feature use; the binder itself does NOT consume it anymore (Phase
 * 102 binds by display, not by WM_CLASS).
 */
export function inferWmClass(binaryPath: string): string {
	const base = basename(binaryPath).toLowerCase()
	return base.replace(/\.[^.]+$/, '')
}

export interface BindOpts {
	/** Dedicated Xvfb display, e.g. `:12` (allocated upstream by DisplayAllocator). */
	display: string
	/** Shared PortAllocator instance (101-02). */
	portAllocator: PortAllocator
	/** Stream-start callback (wraps StreamManager.startStream in production). */
	startStreamFn: StreamStartFn
	/** Optional human-readable label propagated to the stream (used in logs). */
	label?: string
	logger?: BinderLogger
}

/**
 * Bind a per-app dedicated Xvfb display to a freshly-allocated stream port.
 *
 * Returns `{display, port, streamId, wsUrl}` on success. If `startStreamFn`
 * rejects, the allocated port is released back to the pool and the original
 * error is re-thrown verbatim — callers see no allocator leak.
 *
 * This function performs zero subprocess work. All Xvfb/x11vnc/Chrome/binary
 * spawning is orchestrated by the upstream route (`apps/native-routes.ts`)
 * before this call.
 */
export async function bind(
	opts: BindOpts,
): Promise<{display: string; port: number; streamId: string; wsUrl: string}> {
	const port = opts.portAllocator.allocate()
	try {
		const {streamId, wsUrl} = await opts.startStreamFn({
			display: opts.display,
			port,
			label: opts.label,
		})
		opts.logger?.info(
			`native-app bound display=${opts.display} port=${port} streamId=${streamId}`,
		)
		return {display: opts.display, port, streamId, wsUrl}
	} catch (err) {
		// Cleanup safety: release the port so the next bind can use the slot.
		opts.portAllocator.release(port)
		throw err
	}
}

/**
 * Phase 102-08 — Active native-app entry shape consumed by `closeNativeApp`.
 *
 * Matches the production map (`activeNative` in `apps/native-routes.ts`) field-
 * for-field for the keys the teardown needs. Re-declared here (rather than
 * imported from native-routes.ts) to keep the binder module dependency-free
 * of the route layer — preserves the Phase 102-05 inversion (`bind` is a
 * primitive; the route composes it).
 */
export interface NativeActiveEntry {
	id: string
	displayN: number
	display: string
	port: number
	streamId: string
	wsUrl: string
	xvfb: XvfbHandle
	child: ChildProcess
	startedAt: number
}

/**
 * Phase 102-08 — kill ladder grace in ms before SIGKILL is sent if the binary
 * has not yet exited after SIGTERM. Matches the Chrome handle in
 * `webapps/chrome-process-spawner.ts`.
 */
const NATIVE_KILL_GRACE_MS = 2000

export interface CloseNativeOpts {
	/** The native-app UUID — same as ActiveNativeApp.id. */
	id: string
	/** The module-scope activeNative map (route owns the singleton). */
	active: Map<string, NativeActiveEntry>
	/** DisplayAllocator instance (102-01) — call release(N) on teardown. */
	displayAllocator: DisplayAllocator
	/**
	 * PortAllocator instance (101-02). The stream-manager already calls
	 * `release(port)` internally on stopStream — this second release is a
	 * no-op per 101-02's idempotent contract but is invoked for symmetry with
	 * the WebApp close path (window-manager.ts Phase 102-08).
	 */
	portAllocator: PortAllocator
	/**
	 * Stream-manager surface (only `stopStream` is needed for teardown). The
	 * production `StreamManager.stopStream` resolves to `{stopped: boolean}`;
	 * we accept any return shape because the binder doesn't read it.
	 */
	streamManager: {stopStream(id: string): Promise<unknown>}
	logger?: BinderLogger
	/**
	 * Override the kill-grace in ms (test hook). Default 2000ms before SIGKILL
	 * is fired if SIGTERM didn't take.
	 */
	killGraceMs?: number
}

/**
 * D-102-CLOSE-LIFECYCLE — ordered shutdown for a native-app instance:
 *
 *   1. child.kill('SIGTERM')         (graceful 2s)
 *   2. child.kill('SIGKILL')         (if still alive after grace)
 *   3. streamManager.stopStream      (kills x11vnc + releases stream port)
 *   4. xvfb.stop()                   (SIGTERM Xvfb)
 *   5. displayAllocator.release(N)
 *   6. portAllocator.release(port)   (idempotent — stream-manager already released)
 *   7. active.delete(id)             (performed eagerly first — concurrent-close guard)
 *
 * No master-profile cleanup (D-102-MASTER-PROFILE-SEED is WebApps-only —
 * native binaries manage their own state).
 *
 * Idempotency: if `active.get(id)` is missing, return immediately (no-op).
 * Eager `active.delete` before any teardown work prevents concurrent closes
 * from running the same teardown twice. Every step wrapped in try/catch —
 * a failure in (e.g.) child.kill or xvfb.stop NEVER blocks subsequent releases.
 */
export async function closeNativeApp(opts: CloseNativeOpts): Promise<void> {
	const entry = opts.active.get(opts.id)
	if (!entry) return // idempotent — no-op for missing entries

	// Eagerly remove so a concurrent close() short-circuits on the missing-entry
	// path above. All teardown work happens AFTER this line; failures don't put
	// the entry back.
	opts.active.delete(opts.id)

	const graceMs = opts.killGraceMs ?? NATIVE_KILL_GRACE_MS

	// 1. SIGTERM the binary.
	try {
		entry.child.kill('SIGTERM')
	} catch (err) {
		opts.logger?.warn(
			`closeNativeApp(${opts.id}): child.kill('SIGTERM') threw (non-fatal): ` +
				(err instanceof Error ? err.message : String(err)),
		)
	}

	// 2. Wait up to grace for exit, then SIGKILL if still alive. We race a timer
	// against the child's exit event; whichever wins, we move on.
	if (entry.child.exitCode === null && entry.child.signalCode === null) {
		const exited = new Promise<void>((resolve) => {
			entry.child.once('exit', () => resolve())
			entry.child.once('error', () => resolve())
		})
		const killer = new Promise<'killed'>((resolve) => {
			setTimeout(() => {
				try {
					entry.child.kill('SIGKILL')
				} catch (err) {
					opts.logger?.warn(
						`closeNativeApp(${opts.id}): child.kill('SIGKILL') threw (non-fatal): ` +
							(err instanceof Error ? err.message : String(err)),
					)
				}
				resolve('killed')
			}, graceMs).unref?.()
		})
		// Wait for either exit or the killer to fire (whichever comes first).
		await Promise.race([exited, killer]).catch(() => undefined)
	}

	// 3. Stop the x11vnc stream (releases its allocated port internally).
	try {
		await opts.streamManager.stopStream(entry.streamId)
	} catch (err) {
		opts.logger?.warn(
			`closeNativeApp(${opts.id}): streamManager.stopStream threw (non-fatal): ` +
				(err instanceof Error ? err.message : String(err)),
		)
	}

	// 4. Stop Xvfb.
	try {
		await entry.xvfb.stop()
	} catch (err) {
		opts.logger?.warn(
			`closeNativeApp(${opts.id}): xvfb.stop threw (non-fatal): ` +
				(err instanceof Error ? err.message : String(err)),
		)
	}

	// 5. Release display slot.
	try {
		opts.displayAllocator.release(entry.displayN)
	} catch (err) {
		opts.logger?.warn(
			`closeNativeApp(${opts.id}): displayAllocator.release threw (non-fatal): ` +
				(err instanceof Error ? err.message : String(err)),
		)
	}

	// 6. Release tracking port slot (idempotent at allocator).
	try {
		opts.portAllocator.release(entry.port)
	} catch (err) {
		opts.logger?.warn(
			`closeNativeApp(${opts.id}): portAllocator.release threw (non-fatal): ` +
				(err instanceof Error ? err.message : String(err)),
		)
	}

	opts.logger?.info(`closeNativeApp(${opts.id}): complete`)
}
