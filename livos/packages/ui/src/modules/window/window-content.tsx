import React, {Suspense} from 'react'

import {Loading} from '@/components/ui/loading'
import {tw} from '@/utils/tw'

// Lazy load content components for each app type
const AppStoreWindowContent = React.lazy(() => import('./app-contents/app-store-content'))
const FilesWindowContent = React.lazy(() => import('./app-contents/files-content'))
const SettingsWindowContent = React.lazy(() => import('./app-contents/settings-content'))
const DockerWindowContent = React.lazy(() => import('./app-contents/docker-content'))
const ServerControlWindowContent = React.lazy(() => import('./app-contents/server-control-content'))
const TerminalWindowContent = React.lazy(() => import('./app-contents/terminal-content'))
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

const WEBAPP_APP_ID_PREFIX = 'WEBAPP_'
const NATIVE_APP_ID_PREFIX = 'NATIVE_'
const OPENUI_APP_ID_PREFIX = 'OPENUI_'
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

export function WindowContent({route, appId, windowId}: WindowContentProps) {
	if (
		fullHeightApps.has(appId) ||
		isWebAppKind(appId) ||
		isNativeAppKind(appId) ||
		isOpenUiAppKind(appId)
	) {
		return (
			<div className='h-full overflow-hidden'>
				<Suspense fallback={<Loading />}>
					<WindowAppContent appId={appId} initialRoute={route} windowId={windowId} />
				</Suspense>
			</div>
		)
	}

	return (
		<div className={contentWrapperClass}>
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
			return <TerminalWindowContent />

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
