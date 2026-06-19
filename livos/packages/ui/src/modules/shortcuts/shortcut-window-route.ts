// Phase 290 — shortcut window-route encoding.
//
// A SHORTCUT_<id> window carries its target URL + the desired render mode in
// the window-manager `route` string (openWindow(appId, route, title, icon)).
// This module is the single encode/decode seam so the engine and the
// window-content arm agree on the wire format.
//
// Format: `shortcut://<mode>?u=<encodeURIComponent(url)>`
//   mode ∈ 'iframe' | 'browser-stream'
//
// Decoding is defensive — a malformed route yields a null url so the window
// renders an error rather than crashing.

export const SHORTCUT_APP_ID_PREFIX = 'SHORTCUT_'

export type ShortcutWindowMode = 'iframe' | 'browser-stream'

export type DecodedShortcutRoute = {
	url: string | null
	mode: ShortcutWindowMode
}

export function encodeShortcutRoute(args: {url: string; mode: ShortcutWindowMode}): string {
	return `shortcut://${args.mode}?u=${encodeURIComponent(args.url)}`
}

export function decodeShortcutRoute(route: string | undefined | null): DecodedShortcutRoute {
	const fallback: DecodedShortcutRoute = {url: null, mode: 'iframe'}
	if (!route) return fallback
	const m = route.match(/^shortcut:\/\/(iframe|browser-stream)\?u=(.*)$/)
	if (!m) return fallback
	const mode = m[1] as ShortcutWindowMode
	let url: string | null = null
	try {
		url = decodeURIComponent(m[2])
	} catch {
		url = null
	}
	return {url, mode}
}

/** True when the appId belongs to a Shortcut window (Phase 290). */
export function isShortcutKind(appId: string): boolean {
	return appId.startsWith(SHORTCUT_APP_ID_PREFIX)
}
