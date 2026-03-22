import React, {Suspense} from 'react'

import {Loading} from '@/components/ui/loading'
import {tw} from '@/utils/tw'

// Lazy load content components for each app type
const AppStoreWindowContent = React.lazy(() => import('./app-contents/app-store-content'))
const FilesWindowContent = React.lazy(() => import('./app-contents/files-content'))
const SettingsWindowContent = React.lazy(() => import('./app-contents/settings-content'))
const AiChatWindowContent = React.lazy(() => import('./app-contents/ai-chat-content'))
const ServerControlWindowContent = React.lazy(() => import('./app-contents/server-control-content'))
const SubagentsWindowContent = React.lazy(() => import('./app-contents/subagents-content'))
const SchedulesWindowContent = React.lazy(() => import('./app-contents/schedules-content'))
const TerminalWindowContent = React.lazy(() => import('./app-contents/terminal-content'))
const ChromeWindowContent = React.lazy(() => import('./app-contents/chrome-content'))

type WindowContentProps = {
	route: string
	appId: string
}

// Apps that manage their own scroll and layout (no wrapper padding/scroll)
const fullHeightApps = new Set(['LIVINITY_ai-chat', 'LIVINITY_terminal', 'LIVINITY_files', 'LIVINITY_app-store', 'LIVINITY_server-control', 'LIVINITY_chrome',
	'LIVINITY_facebook', 'LIVINITY_gmail', 'LIVINITY_youtube', 'LIVINITY_tradingview', 'LIVINITY_google', 'LIVINITY_yahoo'])

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

function WindowAppContent({appId, initialRoute}: {appId: string; initialRoute: string}) {
	switch (appId) {
		case 'LIVINITY_app-store':
			return <AppStoreWindowContent />

		case 'LIVINITY_files':
			return <FilesWindowContent initialRoute={initialRoute} />

		case 'LIVINITY_settings':
			return <SettingsWindowContent initialRoute={initialRoute} />

		case 'LIVINITY_ai-chat':
			return <AiChatWindowContent />

		case 'LIVINITY_server-control':
			return <ServerControlWindowContent />

		case 'LIVINITY_subagents':
			return <SubagentsWindowContent />

		case 'LIVINITY_schedules':
			return <SchedulesWindowContent />

		case 'LIVINITY_terminal':
			return <TerminalWindowContent />

		case 'LIVINITY_chrome':
		case 'LIVINITY_facebook':
		case 'LIVINITY_gmail':
		case 'LIVINITY_youtube':
		case 'LIVINITY_tradingview':
		case 'LIVINITY_google':
		case 'LIVINITY_yahoo':
			return <ChromeWindowContent url={initialRoute.startsWith('http') ? initialRoute : undefined} />

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
