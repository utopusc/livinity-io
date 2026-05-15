import {AnimatePresence} from 'framer-motion'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useWindowManagerOptional} from '@/providers/window-manager'

import {WebAppFloatingActionBar} from './webapp-floating-action-bar'
import {WebAppFloatingSkillsButton} from './webapp-floating-skills-button'
import {useWebAppDrawerStore} from './webapp-drawer-store'
import {Window} from './window'
import {WindowContent} from './window-content'

const WEBAPP_APP_ID_PREFIX = 'WEBAPP_'

export function WindowsContainer() {
	const windowManager = useWindowManagerOptional()
	const isMobile = useIsMobile()
	// Phase 100-10-05 D-100-10-D — outside-window skills button writes the
	// selected skill id here; the WebAppStreamWindow reads it to render the
	// SkillReplayScrubber overlay (bridges the previously-inline coupling).
	const setSelectedSkillId = useWebAppDrawerStore((s) => s.setSelectedSkillId)

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
							>
								<WindowContent route={window.route} appId={window.appId} />
							</Window>
							{webappId ? (
								<>
									<WebAppFloatingActionBar
										webappId={webappId}
										windowX={window.position.x}
										windowBottomY={window.position.y + window.size.height}
										windowWidth={window.size.width}
										zIndex={window.zIndex}
									/>
									{/* Phase 100-10-05 D-100-10-D — Skills button OUTSIDE the WebApp
									    window at the top-right corner (replaces the inside-window
									    `<WebAppSkillsPopover/>` render from 09-06). */}
									<WebAppFloatingSkillsButton
										webappId={webappId}
										windowX={window.position.x}
										windowY={window.position.y}
										windowWidth={window.size.width}
										zIndex={window.zIndex}
										onReplaySkill={(skillId) => setSelectedSkillId(webappId, skillId)}
									/>
								</>
							) : null}
						</div>
					)
				})}
		</AnimatePresence>
	)
}
