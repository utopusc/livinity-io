import {AnimatePresence} from 'framer-motion'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useWindowManagerOptional} from '@/providers/window-manager'

import {Window} from './window'
import {WindowContent} from './window-content'

const WEBAPP_APP_ID_PREFIX = 'WEBAPP_'

export function WindowsContainer() {
	const windowManager = useWindowManagerOptional()
	const isMobile = useIsMobile()

	// Don't render windows on mobile (use sheet fallback)
	if (isMobile) return null

	// If no window manager context, don't render
	if (!windowManager) return null

	const {windows} = windowManager

	return (
		<AnimatePresence mode='popLayout'>
			{windows
				.filter((w) => !w.isMinimized)
				.map((window) => {
					const isWebApp = window.appId.startsWith(WEBAPP_APP_ID_PREFIX)
					const webappId = isWebApp ? window.appId.slice(WEBAPP_APP_ID_PREFIX.length) : null
					return (
						<div key={window.id}>
							<Window
								id={window.id}
								title={window.title}
								icon={window.icon}
								position={window.position}
								size={window.size}
								zIndex={window.zIndex}
								originRect={window.originRect}
								isPinnedToTopBar={window.isPinnedToTopBar}
								webappId={webappId ?? undefined}
							>
								<WindowContent route={window.route} appId={window.appId} />
							</Window>
							{/* Phase 157 round 10 — both the WebApp action bar
							    AND the Skills library button now live INSIDE
							    the top chrome row (see window-chrome.tsx).
							    The outside-window satellites that used to
							    render here were retired in this round. */}
						</div>
					)
				})}
		</AnimatePresence>
	)
}
