import {AnimatePresence} from 'framer-motion'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useWindowManagerOptional} from '@/providers/window-manager'

import {Window} from './window'
import {WindowContent} from './window-content'

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
				.map((window) => (
					<Window
						key={window.id}
						id={window.id}
						title={window.title}
						icon={window.icon}
						position={window.position}
						size={window.size}
						zIndex={window.zIndex}
					>
						<WindowContent route={window.route} appId={window.appId} />
					</Window>
				))}
		</AnimatePresence>
	)
}
