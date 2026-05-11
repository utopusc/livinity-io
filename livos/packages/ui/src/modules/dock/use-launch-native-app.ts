// Phase 101-07 Task 1 — useLaunchNativeApp.
//
// Native-app analog of `useLaunchWebApp` (Phase 94-05). Where the WebApp
// hook routes a click into the WindowManager openWindow flow (mounts a
// WebAppStreamWindow lazily), the native-app hook fires the server-side
// orchestrator `apps.native.spawn(id)` which:
//   1. looks up the persisted config (Plan 101-03)
//   2. spawns the binary detached on DISPLAY=:1 (Plan 101-03)
//   3. polls xdotool for the WM_CLASS-matching wid (Plan 101-05)
//   4. allocates a port from the shared PortAllocator and starts an
//      x11vnc stream (Plan 101-02 + 101-05)
//   5. returns {streamId, wsUrl} to the caller
//
// Caller (NativeAppIcon, Plan 101-07 Task 3) uses the returned {streamId,
// wsUrl} to mount a streaming window — for now we surface the values so a
// future hookup (UAT row 7) can wire the WindowManager once the
// NativeAppStreamWindow component lands.
//
// Failure mode: any tRPC error path (NOT_FOUND, SERVICE_UNAVAILABLE,
// PRECONDITION_FAILED, INTERNAL_SERVER_ERROR — see native-routes.ts:194-
// 245) is caught, surfaced as a sonner toast, and the hook returns `null`.
// We deliberately do NOT throw — a failed launch should not unmount the
// dock icon or crash the desktop.

import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'

export interface LaunchNativeAppArgs {
	/** UUID matching the persisted NativeAppConfig (apps.native.list[].id). */
	id: string
	/** Display name — used in the failure-toast for human-readable context. */
	name: string
}

export interface LaunchNativeAppResult {
	streamId: string
	wsUrl: string
}

/**
 * React hook returning an async launch function. The hook owns a
 * `trpcReact.apps.native.spawn` mutation handle and exposes a stable
 * callback shape — caller invokes `launch({id, name})` from a click
 * handler.
 *
 * The mutation is intentionally NOT auto-invoked on mount — callers must
 * explicitly fire it from an event (matches useLaunchWebApp's "factory
 * returns onClick handler" shape).
 */
export function useLaunchNativeApp(): (args: LaunchNativeAppArgs) => Promise<LaunchNativeAppResult | null> {
	const spawnMut = trpcReact.apps.native.spawn.useMutation()
	return async function launch({id, name}): Promise<LaunchNativeAppResult | null> {
		try {
			const r = await spawnMut.mutateAsync({id})
			return {streamId: r.streamId, wsUrl: r.wsUrl}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			toast.error(`Failed to launch ${name}: ${msg}`)
			return null
		}
	}
}
