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
const RemoteDesktopContent = React.lazy(() => import('./app-contents/remote-desktop-content'))
const ChromeWindowContent = React.lazy(() => import('./app-contents/chrome-content'))
// Phase 90 — Cutover (D-90-06). v32 Agents + Marketplace dock entries open
// the v32 routes inside a window. Both routes are self-contained React
// components (already first-class routes in router.tsx); they render
// identically inside or outside the window shell.
const AgentsWindowContent = React.lazy(() => import('@/routes/agents'))
const MarketplaceWindowContent = React.lazy(() => import('@/routes/marketplace'))

type WindowContentProps = {
	route: string
	appId: string
}

// Apps that manage their own scroll and layout (no wrapper padding/scroll)
const fullHeightApps = new Set(['LIVINITY_ai-chat', 'LIVINITY_terminal', 'LIVINITY_files', 'LIVINITY_app-store', 'LIVINITY_docker', 'LIVINITY_server-control', 'LIVINITY_my-devices', 'LIVINITY_remote-desktop', 'LIVINITY_chrome',
	'LIVINITY_facebook', 'LIVINITY_gmail', 'LIVINITY_youtube', 'LIVINITY_whatsapp', 'LIVINITY_tradingview', 'LIVINITY_google', 'LIVINITY_yahoo',
	// Phase 90 — Cutover. v32 Agents + Marketplace own their own scroll.
	'LIVINITY_agents', 'LIVINITY_marketplace'])

export function WindowContent({route, appId}: WindowContentProps) {
	if (fullHeightApps.has(appId)) {
		return (
			<div className='h-full overflow-hidden'>
				<Suspense fallback={<Loading />}>
					<WindowAppContent appId={appId} initialRoute={route} />
				</Suspense>
			</div>
		)
	}

	return (
		<div className={contentWrapperClass}>
			<div className={contentInnerClass}>
				<Suspense fallback={<Loading />}>
					<WindowAppContent appId={appId} initialRoute={route} />
				</Suspense>
			</div>
		</div>
	)
}

export function WindowAppContent({appId, initialRoute}: {appId: string; initialRoute: string}) {
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

		case 'LIVINITY_remote-desktop':
			return <RemoteDesktopContent />

		case 'LIVINITY_chrome':
		case 'LIVINITY_facebook':
		case 'LIVINITY_gmail':
		case 'LIVINITY_youtube':
		case 'LIVINITY_whatsapp':
		case 'LIVINITY_tradingview':
		case 'LIVINITY_google':
		case 'LIVINITY_yahoo':
			return <ChromeWindowContent url={initialRoute.startsWith('http') ? initialRoute : undefined} />

		// Phase 90 — Cutover (D-90-06).
		case 'LIVINITY_agents':
			return <AgentsWindowContent />

		case 'LIVINITY_marketplace':
			return <MarketplaceWindowContent />

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
