import {useIsMobile} from '@/hooks/use-is-mobile'
import {useMobileApp} from './mobile-app-context'
import {IconHome2, IconMessageCircle, IconFolder, IconSettings, IconServer} from '@tabler/icons-react'

const TABS = [
	{id: 'home', label: 'Home', icon: IconHome2, appId: null, route: null, appIcon: null},
	{id: 'ai-chat', label: 'AI Chat', icon: IconMessageCircle, appId: 'LIVINITY_ai-chat', route: '/ai-chat', appIcon: '/figma-exports/dock-home.png'},
	{id: 'files', label: 'Files', icon: IconFolder, appId: 'LIVINITY_files', route: '/files/Home', appIcon: '/figma-exports/dock-files.png'},
	{id: 'settings', label: 'Settings', icon: IconSettings, appId: 'LIVINITY_settings', route: '/settings', appIcon: '/figma-exports/dock-settings.png'},
	{id: 'server', label: 'Server', icon: IconServer, appId: 'LIVINITY_server-control', route: '/server-control', appIcon: '/figma-exports/dock-live-usage.png'},
] as const

export function MobileTabBar() {
	const isMobile = useIsMobile()
	const {activeApp, openApp, closeApp} = useMobileApp()

	if (!isMobile) return null

	return (
		<div className='fixed bottom-0 left-0 right-0 z-[60] bg-white/95 backdrop-blur-md border-t border-black/10 pb-safe'>
			<div className='flex h-14'>
				{TABS.map((tab) => {
					const isActive = tab.appId === null
						? activeApp === null
						: activeApp?.appId === tab.appId

					return (
						<button
							key={tab.id}
							className='flex flex-1 flex-col items-center justify-center gap-0.5'
							onClick={() => {
								if (tab.appId === null) {
									closeApp()
								} else if (!isActive) {
									openApp(tab.appId, tab.route!, tab.label, tab.appIcon!)
								}
							}}
						>
							<tab.icon
								size={24}
								stroke={1.5}
								className={isActive ? 'text-blue-500' : 'text-gray-400'}
							/>
							<span className={`text-[10px] font-medium ${isActive ? 'text-blue-500' : 'text-gray-400'}`}>
								{tab.label}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}
