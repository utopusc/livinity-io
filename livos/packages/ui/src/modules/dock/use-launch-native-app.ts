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
//
// Phase 203-10 — D-203-10 desktop integration. When the persisted
// NativeAppConfig has a `wmClassHint` starting with `liv-openui-`, the
// "app" is an OpenUI app generated via openclaw `app_create` (NOT a real
// binary). Launching opens an `OPENUI_<slug>` window whose body is the
// OpenUiAppContent iframe (Plan 203-10 Task 3) instead of the x11vnc
// stream. window-content.tsx dispatches on the `OPENUI_` prefix.

import {toast} from 'sonner'

import {useWindowManagerOptional} from '@/providers/window-manager'

/** Phase 203-10 — wmClassHint prefix marking an OpenUI-app entry. */
export const OPENUI_WMCLASS_PREFIX = 'liv-openui-'

/** Window-manager appId prefix for OpenUI app windows (vs. NATIVE_ for binaries). */
export const OPENUI_APP_ID_PREFIX = 'OPENUI_'

/**
 * Phase 231 retirement — legacy chat-iframe wmClassHint + appId consts
 * removed. The seeded "Liv AI" wmClassHint short-circuit branch in
 * useLaunchNativeApp is gone; if livinityd's seedLivAiDockEntry
 * (KEEP_SCOPE_EXPANSION R17) still emits a native-app config with the
 * `liv-ai` wmClassHint, that hint now falls through to the standard
 * NATIVE_<id> branch — the seeded config has no real backing process so
 * the click is effectively a no-op. Liv Assistant (Phase 227) is the
 * v42 chat surface.
 */

export interface LaunchNativeAppArgs {
	/** UUID matching the persisted NativeAppConfig (apps.native.list[].id). */
	id: string
	/** Display name — used as the window title + dock label. */
	name: string
	/** Optional icon URL for the window chrome / dock tile. */
	iconUrl?: string
	/**
	 * Phase 203-10 — when the wmClassHint starts with `liv-openui-`, the
	 * launcher short-circuits the binary-spawn path and opens an iframe
	 * window pointed at /liv-ai-app/apps/<slug>. Slug = wmClassHint sliced
	 * past the prefix. Callers that omit wmClassHint (legacy NativeAppIcon
	 * paths) fall through to the existing NATIVE_<id> behaviour.
	 */
	wmClassHint?: string
}

/**
 * React hook returning an async launch function. The hook owns a
 * `WindowManager` reference; callers invoke
 * `launch({id, name, iconUrl, wmClassHint})` from a click handler.
 *
 * Returns void — the window itself owns the spawn lifecycle now.
 */
export function useLaunchNativeApp(): (args: LaunchNativeAppArgs) => Promise<void> {
	const windowManager = useWindowManagerOptional()
	return async function launch({id, name, iconUrl, wmClassHint}): Promise<void> {
		if (!windowManager) {
			toast.error(`Cannot launch ${name}: window manager unavailable`)
			return
		}

		// Phase 231 retirement — legacy "Liv AI" wmClassHint short-circuit
		// removed (was Phase 203 Hot-fix D). Liv Assistant (Phase 227) is
		// the v42 chat surface; legacy chat-window hints fall through to
		// the standard NATIVE_<id> branch below.

		// Phase 203-10 — OpenUI app short-circuit. The slug we want to render
		// lives past the prefix in wmClassHint; the underlying UUID (`id`) is
		// derived from the slug deterministically server-side, but the OpenUI
		// route on the gateway is slug-keyed, not UUID-keyed, so we ride the
		// hint here.
		if (wmClassHint && wmClassHint.startsWith(OPENUI_WMCLASS_PREFIX)) {
			const slug = wmClassHint.slice(OPENUI_WMCLASS_PREFIX.length)
			const appId = `${OPENUI_APP_ID_PREFIX}${slug}`
			windowManager.openWindow(appId, name, name, iconUrl ?? '')
			return
		}

		const appId = `NATIVE_${id}`

		// Phase 260-06 (SC8 + SC3 icon-recall) — native apps are SINGLE-INSTANCE.
		// Before opening a new window, scan for an already-open window with the
		// SAME singleton appId. If one exists, RECALL it instead of spawning a
		// duplicate (a second window would mount NativeAppStreamWindow over the
		// SAME idempotent server-side stream, and closing one would tear the
		// shared stream out from under the other — see 260-RESEARCH §SC8).
		//
		// Recall precedence:
		//   1. pinned (docked into the Displays button) → unpin = SC3's
		//      recall-from-app-icon path (window animates back to full size).
		//   2. minimized → restore.
		//   3. otherwise → focus (raise z-index).
		// In all three branches we RETURN without calling openWindow.
		const existing = windowManager.windows.find((w) => w.appId === `NATIVE_${id}`)
		if (existing) {
			if (existing.isPinnedToTopBar) {
				windowManager.unpinWindowFromTopBar(existing.id)
			} else if (existing.isMinimized) {
				windowManager.restoreWindow(existing.id)
			} else {
				windowManager.focusWindow(existing.id)
			}
			return
		}

		// initialRoute is unused by NativeAppStreamWindow (id is sliced
		// from appId prefix) — pass the name as a placeholder so the
		// window chrome / focus stack carries something readable.
		windowManager.openWindow(appId, name, name, iconUrl ?? '')
	}
}
