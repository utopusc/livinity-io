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

type WindowContentProps = {
	route: string
	appId: string
}

export function WindowContent({route, appId}: WindowContentProps) {
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
			return <AppStoreWindowContent initialRoute={initialRoute} />

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
