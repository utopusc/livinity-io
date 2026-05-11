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

import type {PortAllocator} from '../streaming/port-allocator.js'

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
