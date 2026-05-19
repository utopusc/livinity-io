import React, {Suspense} from 'react'

import {Loading} from '@/components/ui/loading'
import {tw} from '@/utils/tw'

// Lazy load content components for each app type
const AppStoreWindowContent = React.lazy(() => import('./app-contents/app-store-content'))
const FilesWindowContent = React.lazy(() => import('./app-contents/files-content'))
const SettingsWindowContent = React.lazy(() => import('./app-contents/settings-content'))
const AiChatWindowContent = React.lazy(() => import('./app-contents/ai-chat-content'))
const DockerWindowContent = React.lazy(() => import('./app-contents/docker-content'))
const ServerControlWindowContent = React.lazy(() => import('./app-contents/server-control-content'))
const SubagentsWindowContent = React.lazy(() => import('./app-contents/subagents-content'))
const SchedulesWindowContent = React.lazy(() => import('./app-contents/schedules-content'))
const TerminalWindowContent = React.lazy(() => import('./app-contents/terminal-content'))
const MyDevicesWindowContent = React.lazy(() => import('./app-contents/my-devices-content'))
// Phase 95-02 — WebApp stream content (VNC pane + AI panel + mode selector).
// The discriminator is the `WEBAPP_<webappId>` prefix on `appId` (per CONTEXT
// C-95-05 and PLAN 95-02). The real component lands in 95-08; 95-02 ships a
// placeholder so the lazy import resolves at build time.
const WebAppStreamWindowContent = React.lazy(() => import('./app-contents/webapp-stream-window'))
// Phase 157 round 5 — NativeAppStreamWindow. Native-app equivalent of
// WebAppStreamWindow. Discriminator is `NATIVE_<nativeAppId>` prefix.
const NativeAppStreamWindowContent = React.lazy(() => import('./app-contents/native-app-stream-window'))

const WEBAPP_APP_ID_PREFIX = 'WEBAPP_'
const NATIVE_APP_ID_PREFIX = 'NATIVE_'

/** True when the appId belongs to a WebApp window (P95). */
function isWebAppKind(appId: string): boolean {
	return appId.startsWith(WEBAPP_APP_ID_PREFIX)
}

/** True when the appId belongs to a native-app stream window (P157 round 5). */
function isNativeAppKind(appId: string): boolean {
	return appId.startsWith(NATIVE_APP_ID_PREFIX)
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
const fullHeightApps = new Set(['LIVINITY_ai-chat', 'LIVINITY_terminal', 'LIVINITY_files', 'LIVINITY_app-store', 'LIVINITY_docker', 'LIVINITY_server-control', 'LIVINITY_my-devices'])

export function WindowContent({route, appId, windowId}: WindowContentProps) {
	if (fullHeightApps.has(appId) || isWebAppKind(appId) || isNativeAppKind(appId)) {
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
	if (isWebAppKind(appId)) {
		const webappId = appId.slice(WEBAPP_APP_ID_PREFIX.length)
		return <WebAppStreamWindowContent webappId={webappId} />
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

	switch (appId) {
		case 'LIVINITY_app-store':
			return <AppStoreWindowContent />

		case 'LIVINITY_files':
			return <FilesWindowContent initialRoute={initialRoute} />

		case 'LIVINITY_settings':
			return <SettingsWindowContent initialRoute={initialRoute} />

		case 'LIVINITY_ai-chat':
			return <AiChatWindowContent />

		case 'LIVINITY_docker':
			return <DockerWindowContent />

		case 'LIVINITY_server-control':
			return <ServerControlWindowContent />

		case 'LIVINITY_my-devices':
			return <MyDevicesWindowContent />

		case 'LIVINITY_subagents':
			return <SubagentsWindowContent />

		case 'LIVINITY_schedules':
			return <SchedulesWindowContent />

		case 'LIVINITY_terminal':
			return <TerminalWindowContent />


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
