// Phase 290 — open-mode engine (Wave 1, T1.2).
//
// `openShortcut(shortcut, deps)` is the SINGLE entry point for launching a
// shortcut tile. It dispatches by the persisted `open_mode` and is the real fix
// for the OpenClaw "tile opens nothing / blank iframe / blocked pop-up" bug.
//
// HARD RULE (#1 fix): NEVER a bare `window.open` that pop-up-blocks. Web
// shortcuts ALWAYS render IN-WINDOW (iframe or browser-stream) — both are a
// guaranteed-visible result, never a blocked pop-up. (External shortcut URLs
// are NOT per-app `{app}-{user}.livinity.io` hosts, so the Phase-287 verify-live
// DNS gate — which exists for speculative per-app-subdomain DNS — does not apply
// to a direct user-gesture in-window navigation to an external site.)
//
// Dispatch:
//   iframe        → SHORTCUT_<id> window; ShortcutIframeWindow renders <iframe>.
//                   (Runtime timeout watchdog inside that component downgrades
//                    to browser-stream if the frame never signals — H3.)
//   browser-stream→ SHORTCUT_<id> window; reuses the WebApp X11 stream
//                   (immune to X-Frame-Options) via a url override.
//   terminal      → opens the Terminal window + queues the command in a fresh
//                   tab (no SHORTCUT_ window). L6-gated by the caller.
//   local-port    → DEFERRED (Wave 4). Logs + no-op this session.

import {SHORTCUT_APP_ID_PREFIX, encodeShortcutRoute} from './shortcut-window-route'

export type OpenableShortcut = {
	id: string
	kind: 'web' | 'terminal' | 'local'
	title: string
	iconUrl: string
	openMode: 'iframe' | 'browser-stream' | 'local-port' | 'terminal'
	payload: unknown
}

export type OpenShortcutDeps = {
	/** WindowManager.openWindow (may be null when no provider is mounted). */
	openWindow:
		| ((appId: string, route: string, title: string, icon: string) => unknown)
		| null
		| undefined
	/** Opens (or focuses) the Terminal window. */
	openTerminalWindow?: () => void
	/** Queues a command to run in a fresh terminal tab. */
	runInNewTerminalTab?: (command: string) => void
}

function payloadUrl(payload: unknown): string | null {
	if (payload && typeof payload === 'object' && 'url' in payload) {
		const u = (payload as {url?: unknown}).url
		if (typeof u === 'string' && u.length > 0) return u
	}
	return null
}

function payloadCommand(payload: unknown): string | null {
	if (payload && typeof payload === 'object' && 'command' in payload) {
		const c = (payload as {command?: unknown}).command
		if (typeof c === 'string' && c.length > 0) return c
	}
	return null
}

/**
 * Launch a shortcut. Returns true if an action was dispatched, false if it was
 * a no-op (missing dependency / deferred kind / malformed payload). Safe to call
 * from a click handler.
 */
export function openShortcut(shortcut: OpenableShortcut, deps: OpenShortcutDeps): boolean {
	switch (shortcut.openMode) {
		case 'iframe':
		case 'browser-stream': {
			const url = payloadUrl(shortcut.payload)
			if (!url || !deps.openWindow) {
				console.warn(
					`[open-mode-engine] cannot open web shortcut ${shortcut.id}: ` +
						`${!url ? 'no url in payload' : 'no window manager'}`,
				)
				return false
			}
			const appId = `${SHORTCUT_APP_ID_PREFIX}${shortcut.id}`
			// Encode url + the desired mode into the route string so the window
			// content arm can render without an extra round-trip.
			const route = encodeShortcutRoute({url, mode: shortcut.openMode})
			deps.openWindow(appId, route, shortcut.title, shortcut.iconUrl)
			return true
		}

		case 'terminal': {
			const command = payloadCommand(shortcut.payload)
			if (!command) {
				console.warn(`[open-mode-engine] terminal shortcut ${shortcut.id} has no command`)
				return false
			}
			// Open the Terminal window (no SHORTCUT_ window for terminal kind),
			// then queue the command in a fresh tab. The caller wires these to the
			// window manager + terminal-command-queue and gates on the v43 flag (L6).
			deps.openTerminalWindow?.()
			if (deps.runInNewTerminalTab) {
				deps.runInNewTerminalTab(command)
				return true
			}
			console.warn(`[open-mode-engine] terminal shortcut ${shortcut.id}: no terminal queue dep`)
			return false
		}

		case 'local-port':
			// DEFERRED (Wave 4 — needs the /app/:appId/* loopback proxy + box UAT).
			console.warn(`[open-mode-engine] local-port shortcut ${shortcut.id} not wired this session`)
			return false

		default:
			console.warn(`[open-mode-engine] unknown open_mode for shortcut ${shortcut.id}`)
			return false
	}
}
