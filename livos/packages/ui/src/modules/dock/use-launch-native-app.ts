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
 * Phase 203 Hot-fix D 2026-05-24 — EXACT wmClassHint string marking the
 * permanent "Liv AI" dock entry seeded by livinityd's liv-ai-dock-seed.ts.
 * Distinct from the `liv-openui-` PREFIX (per-app OpenUI tiles); this is an
 * exact-match string so the two short-circuit branches stay disjoint.
 */
export const LIV_AI_WMCLASS_HINT = 'liv-ai'

/**
 * Window-manager appId for the Liv AI chat iframe. window-content.tsx
 * dispatches on this exact string and mounts LivAiChatIframeContent
 * (iframe → /liv-ai-app/liv-ai → openclaw claw-client).
 */
export const LIV_AI_CHAT_APP_ID = 'LIV_AI_CHAT'

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

		// Phase 203 Hot-fix D 2026-05-24 — permanent "Liv AI" dock entry
		// short-circuit. The seeded NativeAppConfig has wmClassHint='liv-ai'
		// (EXACT match, NOT a prefix). Open the LIV_AI_CHAT window which
		// window-content.tsx mounts as an iframe pointed at /liv-ai-app/liv-ai
		// (Caddy Hot-fix-D part 1 rewrites that to /plugins/openclawos so the
		// openclaw gateway plugin serves the claw-client chat surface).
		// Checked BEFORE the OpenUI prefix branch so the two stay disjoint.
		if (wmClassHint === LIV_AI_WMCLASS_HINT) {
			windowManager.openWindow(LIV_AI_CHAT_APP_ID, name, name, iconUrl ?? '')
			return
		}

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
		// initialRoute is unused by NativeAppStreamWindow (id is sliced
		// from appId prefix) — pass the name as a placeholder so the
		// window chrome / focus stack carries something readable.
		windowManager.openWindow(appId, name, name, iconUrl ?? '')
	}
}
