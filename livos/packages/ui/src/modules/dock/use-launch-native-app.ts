// Phase 101-07 Task 1 — useLaunchNativeApp.
//
// Phase 157 round 5 rewrite — mirrors useLaunchWebApp.
// Before: hook fired `apps.native.spawn` directly and returned the
// {streamId, wsUrl} for the caller to mount a window themselves. No
// window component existed, so the click did nothing visible.
//
// Now: hook opens a `NATIVE_<id>` window via WindowManager. The
// NativeAppStreamWindow component (window-content.tsx routes the prefix)
// fires `apps.native.spawn` from inside the window and mounts the VNC
// canvas. Server-side spawn is idempotent so re-opening the same window
// reuses the existing Xvfb + binary + stream.

import {toast} from 'sonner'

import {useWindowManagerOptional} from '@/providers/window-manager'

export interface LaunchNativeAppArgs {
	/** UUID matching the persisted NativeAppConfig (apps.native.list[].id). */
	id: string
	/** Display name — used as the window title + dock label. */
	name: string
	/** Optional icon URL for the window chrome / dock tile. */
	iconUrl?: string
}

/**
 * React hook returning an async launch function. The hook owns a
 * `WindowManager` reference; callers invoke `launch({id, name, iconUrl})`
 * from a click handler.
 *
 * Returns void — the window itself owns the spawn lifecycle now.
 */
export function useLaunchNativeApp(): (args: LaunchNativeAppArgs) => Promise<void> {
	const windowManager = useWindowManagerOptional()
	return async function launch({id, name, iconUrl}): Promise<void> {
		if (!windowManager) {
			toast.error(`Cannot launch ${name}: window manager unavailable`)
			return
		}
		const appId = `NATIVE_${id}`
		// initialRoute is unused by NativeAppStreamWindow (id is sliced
		// from appId prefix) — pass the name as a placeholder so the
		// window chrome / focus stack carries something readable.
		windowManager.openWindow(appId, name, name, iconUrl ?? '')
	}
}
