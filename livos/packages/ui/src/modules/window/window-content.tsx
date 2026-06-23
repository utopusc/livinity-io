import React, {Suspense} from 'react'

import {Loading} from '@/components/ui/loading'
import {SHORTCUT_APP_ID_PREFIX, isShortcutKind} from '@/modules/shortcuts/shortcut-window-route'
import {tw} from '@/utils/tw'

// Lazy load content components for each app type
const AppStoreWindowContent = React.lazy(() => import('./app-contents/app-store-content'))
const FilesWindowContent = React.lazy(() => import('./app-contents/files-content'))
const SettingsWindowContent = React.lazy(() => import('./app-contents/settings-content'))
const DockerWindowContent = React.lazy(() => import('./app-contents/docker-content'))
const ServerControlWindowContent = React.lazy(() => import('./app-contents/server-control-content'))
// Phase 243-03 / Phase 290 REQ5 — terminal route. The new
// `PersistentTerminalPanel` (xterm.js + /livos/terminal/ws cookie auth) is now
// the ONLY terminal surface. The legacy `terminal-content.tsx` surface
// (LivOS/App tabs, XTermTerminal reading from /terminal?token= WS) is no longer
// imported/rendered here so it can never mount — the prior flag-gated fallback
// flashed legacy on cold open while `useTerminalPanelEnabled` defaulted false.
const PersistentTerminalPanel = React.lazy(
	() => import('@/features/v43-terminal/PersistentTerminalPanel'),
)
const MyDevicesWindowContent = React.lazy(() => import('./app-contents/my-devices-content'))
// Phase 234-02 — Phase 197-06 LivAiWindowContent (legacy assistant-ui chat
// iframe over /liv-ai-app) was removed here as the deferred Phase 231 cleanup
// per 234-01-INVESTIGATION.md Section G.1. LIVINITY_liv-assistant
// (Phase 227-01 below — AionUi iframe over /liv/) is the sole v42 chat surface.
// Phase 95-02 — WebApp stream content (VNC pane + AI panel + mode selector).
// The discriminator is the `WEBAPP_<webappId>` prefix on `appId` (per CONTEXT
// C-95-05 and PLAN 95-02). The real component lands in 95-08; 95-02 ships a
// placeholder so the lazy import resolves at build time.
const WebAppStreamWindowContent = React.lazy(() => import('./app-contents/webapp-stream-window'))
// Phase 157 round 5 — NativeAppStreamWindow. Native-app equivalent of
// WebAppStreamWindow. Discriminator is `NATIVE_<nativeAppId>` prefix.
const NativeAppStreamWindowContent = React.lazy(() => import('./app-contents/native-app-stream-window'))
// Phase 203-10 — OpenUI app window. Discriminator is `OPENUI_<slug>` prefix.
// The slug is sliced off the appId and rendered as
// `<iframe src="/liv-ai-app/apps/<slug>">` (D-203-10, T-203-06).
const OpenUiAppContent = React.lazy(() => import('./app-contents/openui-app-content'))
// Phase 231 retirement — legacy chat-iframe window removed (was the
// Phase 203 Hot-fix D surface). Liv Assistant (Phase 227-01) below is
// the v42 chat surface.
// Phase 227-01 — Liv Assistant iframe window. Discriminator is the exact
// appId `LIVINITY_liv-assistant` (set by systemApps in apps.tsx). Renders
// the AionUi surface served at /liv/ via Phase 226 Caddy handle.
const LivAssistantWindow = React.lazy(() => import('./app-contents/liv-assistant-window'))
// Phase 254-03 — X11DisplayStreamWindow. Discriminator is the `DISPLAY_:N`
// prefix on appId (set by the Plan 04 Active-Displays hover panel when it calls
// openWindow). Renders a LIVE, interactive noVNC stream of a real X display via
// displays.getVncUrl + useWebAppVnc({viewOnly:false}) (locked decision #1).
const X11DisplayStreamWindow = React.lazy(() => import('./app-contents/x11-display-stream-window'))
// Phase 290 — ShortcutIframeWindow. Discriminator is the `SHORTCUT_<id>`
// prefix on appId (set by the open-mode engine via openWindow). Renders an
// iframe (with a timeout-only frame-deny watchdog) or, for the browser-stream
// open-mode, reuses the WebApp X11 stream. The target URL + mode are encoded in
// the window-manager `route` string (shortcut://<mode>?u=<url>).
const ShortcutIframeWindow = React.lazy(() => import('./app-contents/shortcut-iframe-window'))

const WEBAPP_APP_ID_PREFIX = 'WEBAPP_'
const NATIVE_APP_ID_PREFIX = 'NATIVE_'
const OPENUI_APP_ID_PREFIX = 'OPENUI_'
/** Phase 254-03 — prefix for a live-VNC X-display window (`DISPLAY_:11`). */
const DISPLAY_APP_ID_PREFIX = 'DISPLAY_'
/** Phase 227-01 — exact appId for the Liv Assistant iframe window. */
const LIV_ASSISTANT_APP_ID = 'LIVINITY_liv-assistant'

/** True when the appId belongs to a WebApp window (P95). */
function isWebAppKind(appId: string): boolean {
	return appId.startsWith(WEBAPP_APP_ID_PREFIX)
}

/** True when the appId belongs to a native-app stream window (P157 round 5). */
function isNativeAppKind(appId: string): boolean {
	return appId.startsWith(NATIVE_APP_ID_PREFIX)
}

/** True when the appId belongs to an OpenUI app iframe window (Phase 203-10). */
function isOpenUiAppKind(appId: string): boolean {
	return appId.startsWith(OPENUI_APP_ID_PREFIX)
}

/** True when the appId belongs to a live-VNC X-display window (Phase 254-03). */
function isDisplayKind(appId: string): boolean {
	return appId.startsWith(DISPLAY_APP_ID_PREFIX)
}

/**
 * Phase 295 — apps whose CONTENT must render LIGHT even when the LivOS OS
 * theme is dark ("Docker karanlık temada bile beyaz dursun, diğer
 * uygulamalarda da aynı — sadece uygulamalarda"). The returned wrapper gets the
 * `.livos-app-light` class, which sets `color-scheme: light` (light form
 * controls + makes embedded iframes resolve `prefers-color-scheme: light`) and
 * opts the subtree out of Tailwind `dark:` variants (tailwind.config darkMode).
 *
 * Scope = the apps that actually render dark/broken on a dark OS:
 *   - Docker (native React app with its own `dark:` theme that html.dark
 *     re-activates on top of its hardcoded white canvas)
 *   - App Store + OpenUI (iframe web content that honours prefers-color-scheme)
 *   - Files — built light-first (0 `dark:` variants, but pervasive hardcoded
 *     light colors: text-neutral-*, bg-white, text-black + v36 var() tokens),
 *     so it renders broken under the OS dark theme. `.livos-app-light` (now
 *     also re-declaring the v36 family) makes those light-first colors correct.
 *
 * Deliberately EXCLUDED:
 *   - Liv Assistant (LIV_ASSISTANT_APP_ID) — a separate SPA that manages its
 *     own (dark-capable) theme; forcing it light would break it.
 *   - VNC stream windows (isWebAppKind / isNativeAppKind / isDisplayKind, and
 *     shortcut windows which now render as a browser-stream) — raw <canvas>
 *     pixels are immune to CSS, and their floating chrome stays on the OS theme.
 *   - The other LivOS token-apps (Settings / Terminal / Server Control /
 *     My Devices) — they theme coherently via the body.dark CSS-var tokens, so
 *     they stay on the OS theme ("OS stays dark").
 */
function isForceLightApp(appId: string): boolean {
	return (
		appId === 'LIVINITY_docker' ||
		appId === 'LIVINITY_app-store' ||
		appId === 'LIVINITY_files' ||
		isOpenUiAppKind(appId)
	)
}

type WindowContentProps = {
	route: string
	appId: string
	// Phase 159 — windowId is forwarded to NativeAppStreamWindow so it can
	// register a close handler with the WindowManager (159-02 registry
	// pattern). Optional because other content types (settings, files,
	// etc.) don't need it. The call site in windows-container.tsx is
	// wired up by Plan 07's full `.map(...)` block rewrite — this plan
	// only widens the accept side.
	windowId?: string
}

// Apps that manage their own scroll and layout (no wrapper padding/scroll).
// WebApps (any appId starting with WEBAPP_) are full-height too — handled
// via `isWebAppKind(appId)` in `WindowContent` rather than expanding this set.
// Phase 234-02 — LIVINITY_liv-ai removed from the fullHeightApps set as part
// of the Section G.1 cleanup (entry no longer reachable; switch-case + lazy
// import + apps.tsx registry entry all deleted in the same commit).
const fullHeightApps = new Set(['LIVINITY_terminal', 'LIVINITY_files', 'LIVINITY_app-store', 'LIVINITY_docker', 'LIVINITY_server-control', 'LIVINITY_my-devices', LIV_ASSISTANT_APP_ID])

/**
 * Phase 243-03 / Phase 290 REQ5 — Terminal route shell. Mounts the persistent
 * xterm.js panel (v43) UNCONDITIONALLY. The legacy LivOS/App-tabs terminal is
 * no longer reachable here: the prior `useTerminalPanelEnabled()` flag branch
 * defaulted `false` while the backing tRPC query loaded, so legacy flashed on
 * cold open before flipping to v43. Dropping the branch (and the legacy import)
 * means only the v43 panel can ever mount. The lazy child stays wrapped in its
 * own Suspense boundary so the outer WindowContent Suspense doesn't double-fire.
 *
 * NOTE: the server PTY backend (`/livos/terminal/ws`) is still gated by the
 * `livos:v43:terminal_panel` Redis flag — update.sh (REQ5) sets it `true` so
 * the WS path is live on Update.
 */
function TerminalRouteShell() {
	return (
		<Suspense fallback={<Loading />}>
			<PersistentTerminalPanel />
		</Suspense>
	)
}

export function WindowContent({route, appId, windowId}: WindowContentProps) {
	// Phase 295 — force-light app content (Docker + iframe web apps) regardless
	// of the OS dark theme. `.livos-app-light` carries `color-scheme: light` and
	// the Tailwind `dark:` opt-out (see isForceLightApp + index.css + tailwind
	// config). Applied only to the app-content wrapper, never the OS chrome.
	const forceLight = isForceLightApp(appId)

	if (
		fullHeightApps.has(appId) ||
		isWebAppKind(appId) ||
		isNativeAppKind(appId) ||
		isOpenUiAppKind(appId) ||
		isDisplayKind(appId) ||
		// H2 — Shortcut windows are full-height too. Added to the boolean chain
		// (NOT the fullHeightApps exact-match Set, which can't match a prefix).
		isShortcutKind(appId)
	) {
		return (
			<div className={forceLight ? 'livos-app-light h-full overflow-hidden' : 'h-full overflow-hidden'}>
				<Suspense fallback={<Loading />}>
					<WindowAppContent appId={appId} initialRoute={route} windowId={windowId} />
				</Suspense>
			</div>
		)
	}

	return (
		<div className={forceLight ? `livos-app-light ${contentWrapperClass}` : contentWrapperClass}>
			<div className={contentInnerClass}>
				<Suspense fallback={<Loading />}>
					<WindowAppContent appId={appId} initialRoute={route} windowId={windowId} />
				</Suspense>
			</div>
		</div>
	)
}

export function WindowAppContent({appId, initialRoute, windowId}: {appId: string; initialRoute: string; windowId?: string}) {
	// Phase 95-02 — WebApp stream window. appId is `WEBAPP_<webappId>`; the
	// webappId is sliced off and passed to the lazy-loaded component. Match
	// before the `switch` so the prefix wins over any future literal collision.
	//
	// Phase 159-05 — windowId is forwarded so WebAppStreamWindow can register
	// a close handler with the WindowManager (defensive symmetry with the
	// native-app branch below; same registry pattern from Plan 02/04). When
	// windowId is absent (e.g. component rendered outside the WindowManager
	// tree, or before Plan 07 reliably threads it), the component falls back
	// to the legacy D-95-CLEANUP unmount path.
	if (isWebAppKind(appId)) {
		const webappId = appId.slice(WEBAPP_APP_ID_PREFIX.length)
		return <WebAppStreamWindowContent webappId={webappId} windowId={windowId} />
	}

	// Phase 157 round 5 — Native-app stream window. Mirrors the WebApp
	// branch above; appId is `NATIVE_<nativeAppId>` (NativeAppConfig
	// UUID from apps.native.list).
	//
	// Phase 159-04 — windowId is forwarded so NativeAppStreamWindow can
	// register a close handler with the WindowManager (replaces the H1
	// unmount-cleanup race). The WebApp branch above does NOT receive
	// windowId in this plan — Plan 05 will do that defensive migration.
	if (isNativeAppKind(appId)) {
		const nativeAppId = appId.slice(NATIVE_APP_ID_PREFIX.length)
		return <NativeAppStreamWindowContent nativeAppId={nativeAppId} windowId={windowId} />
	}

	// Phase 203-10 — OpenUI app window. The window-manager passed
	// `OPENUI_<slug>`; slice the prefix and render the iframe pointed at
	// /liv-ai-app/apps/<slug>. The window title carries the human-readable
	// app name (set by useLaunchNativeApp when it called openWindow).
	if (isOpenUiAppKind(appId)) {
		const slug = appId.slice(OPENUI_APP_ID_PREFIX.length)
		return <OpenUiAppContent slug={slug} name={slug} />
	}

	// Phase 254-03 — live-VNC X-display window. appId is `DISPLAY_:N`; the
	// display string (':N') is sliced off and passed to the lazy-loaded
	// X11DisplayStreamWindow, which resolves the display's VNC ws URL via
	// displays.getVncUrl and renders it with native RFB input (viewOnly:false).
	// Matched before the `switch` so the prefix wins over any literal collision.
	if (isDisplayKind(appId)) {
		const displayId = appId.slice(DISPLAY_APP_ID_PREFIX.length)
		return <X11DisplayStreamWindow displayId={displayId} windowId={windowId} />
	}

	// Phase 290 — Shortcut window. appId is `SHORTCUT_<id>`; the URL + render
	// mode are carried in `initialRoute` (shortcut://<mode>?u=<url>, set by the
	// open-mode engine). Matched before the `switch` so the prefix wins.
	if (isShortcutKind(appId)) {
		const shortcutId = appId.slice(SHORTCUT_APP_ID_PREFIX.length)
		return <ShortcutIframeWindow shortcutId={shortcutId} route={initialRoute} windowId={windowId} />
	}

	// Phase 231 retirement — legacy chat-iframe branch removed.
	// Liv Assistant (Phase 227-01 below) is the v42 chat surface.

	// Phase 227-01 — Liv Assistant iframe window. Mounts LivAssistantWindow
	// pointed at /liv/ (Phase 226 Caddy handle). Checked BEFORE the switch
	// so the literal appId wins over any future collision.
	if (appId === LIV_ASSISTANT_APP_ID) {
		return <LivAssistantWindow />
	}

	switch (appId) {
		case 'LIVINITY_app-store':
			return <AppStoreWindowContent />

		case 'LIVINITY_files':
			return <FilesWindowContent initialRoute={initialRoute} />

		case 'LIVINITY_settings':
			return <SettingsWindowContent initialRoute={initialRoute} />

		case 'LIVINITY_docker':
			return <DockerWindowContent />

		case 'LIVINITY_server-control':
			return <ServerControlWindowContent />

		case 'LIVINITY_my-devices':
			return <MyDevicesWindowContent />


		case 'LIVINITY_terminal':
			// Phase 243-03 — flag-aware swap. When `livos:v43:terminal_panel`
			// is `'true'`, mount the new persistent xterm.js panel; otherwise
			// keep the legacy LivOS/App-tabs terminal (D-243-FLAG-ROLLBACK
			// reversibility — flipping the Redis key restores the previous
			// surface without code revert). The server-side `/livos/terminal/ws`
			// WS handler enforces the same flag (Plan 243-02 SC-06), so a
			// direct URL navigation can NEVER reach the new panel when the
			// flag is OFF (T-243-03-01 mitigation).
			return <TerminalRouteShell />


		// Phase 234-02 — LIVINITY_liv-ai switch arm removed (Section G.1
		// cleanup); LIV_ASSISTANT_APP_ID branch above handles the v42 chat
		// surface.

		default:
			return (
				<div className='flex h-full items-center justify-center'>
					<p className='text-text-secondary'>Unknown app: {appId}</p>
				</div>
			)
	}
}

const contentWrapperClass = tw`
	h-full
	overflow-auto
	livinity-hide-scrollbar
`

const contentInnerClass = tw`
	flex
	flex-col
	gap-5
	p-4
	md:p-6
`
