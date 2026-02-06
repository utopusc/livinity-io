import {motion, useMotionValue} from 'framer-motion'
import React, {Suspense, useCallback} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {useLocation} from 'react-router-dom'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useQueryParams} from '@/hooks/use-query-params'
import {useSettingsNotificationCount} from '@/hooks/use-settings-notification-count'
import {systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

import {DockItem} from './dock-item'
import {LogoutDialog} from './logout-dialog'

const LiveUsageDialog = React.lazy(() => import('@/routes/live-usage'))
const WhatsNewModal = React.lazy(() => import('@/routes/whats-new-modal').then((m) => ({default: m.WhatsNewModal})))

const DOCK_BOTTOM_PADDING_PX = 10

const DOCK_DIMENSIONS_PX = {
	preview: {
		iconSize: 50,
		iconSizeZoomed: 80,
		padding: 12,
	},
	desktop: {
		iconSize: 50,
		iconSizeZoomed: 80,
		padding: 10,
	},
	mobile: {
		iconSize: 48,
		iconSizeZoomed: 60,
		padding: 8,
	},
} as const

type DockDimensionsPx = {
	iconSize: number
	iconSizeZoomed: number
	padding: number
	dockHeight: number
}

function useDockDimensions(options?: {isPreview?: boolean}): DockDimensionsPx {
	const isMobile = useIsMobile()

	if (options?.isPreview) {
		const {iconSize, iconSizeZoomed, padding} = DOCK_DIMENSIONS_PX.preview
		return {iconSize, iconSizeZoomed, padding, dockHeight: iconSize + padding * 2}
	}

	const dimensions = isMobile ? DOCK_DIMENSIONS_PX.mobile : DOCK_DIMENSIONS_PX.desktop
	const {iconSize, iconSizeZoomed, padding} = dimensions
	return {iconSize, iconSizeZoomed, padding, dockHeight: iconSize + padding * 2}
}

export function Dock() {
	const {pathname} = useLocation()
	const {addLinkSearchParams} = useQueryParams()
	const mouseX = useMotionValue(Infinity)
	const settingsNotificationCount = useSettingsNotificationCount()
	const isMobile = useIsMobile()
	const {iconSize, iconSizeZoomed, padding, dockHeight} = useDockDimensions()
	const windowManager = useWindowManagerOptional()

	const lastFilesPath = sessionStorage.getItem('lastFilesPath')

	const handleOpenWindow = useCallback(
		(appId: string, route: string, title: string, icon: string) => {
			if (!windowManager) return false
			windowManager.openWindow(appId, route, title, icon)
			return true
		},
		[windowManager],
	)

	return (
		<>
			<motion.div
				initial={{translateY: 80, opacity: 0}}
				animate={{translateY: 0, opacity: 1}}
				transition={{type: 'spring', stiffness: 200, damping: 20, delay: 0.2, duration: 0.2}}
				onPointerMove={(e) => e.pointerType === 'mouse' && mouseX.set(e.pageX)}
				onPointerLeave={() => mouseX.set(Infinity)}
				className={cn(dockClass, isMobile && 'gap-2')}
				style={{
					height: dockHeight,
					paddingBottom: padding,
				}}
			>
				<DockItem
					appId='LIVINITY_home'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					to={systemAppsKeyed['LIVINITY_home'].systemAppTo}
					open={pathname === '/'}
					mouseX={mouseX}
				/>
				<DockItem
					appId='LIVINITY_files'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					to={lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo}
					open={pathname.startsWith('/files')}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_files',
							lastFilesPath || '/files/Home',
							'Files',
							systemAppsKeyed['LIVINITY_files'].icon,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_settings'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					to={systemAppsKeyed['LIVINITY_settings'].systemAppTo}
					open={pathname.startsWith(systemAppsKeyed['LIVINITY_settings'].systemAppTo)}
					notificationCount={settingsNotificationCount}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_settings',
							'/settings',
							'Settings',
							systemAppsKeyed['LIVINITY_settings'].icon,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_live-usage'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					to={{search: addLinkSearchParams({dialog: 'live-usage'})}}
					open={pathname.startsWith(systemAppsKeyed['LIVINITY_live-usage'].systemAppTo)}
					mouseX={mouseX}
				/>
				<DockItem
					appId='LIVINITY_app-store'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_app-store',
							'/app-store',
							'App Store',
							systemAppsKeyed['LIVINITY_app-store'].icon,
						)
					}
				/>
				<DockDivider iconSize={iconSize} />
				<DockItem
					appId='LIVINITY_ai-chat'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_ai-chat',
							'/ai-chat',
							'AI Chat',
							systemAppsKeyed['LIVINITY_ai-chat'].icon,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_server-control'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_server-control',
							'/server-control',
							'Server',
							systemAppsKeyed['LIVINITY_server-control'].icon,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_subagents'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_subagents',
							'/subagents',
							'Agents',
							systemAppsKeyed['LIVINITY_subagents'].icon,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_schedules'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_schedules',
							'/schedules',
							'Schedules',
							systemAppsKeyed['LIVINITY_schedules'].icon,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_terminal'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={() =>
						handleOpenWindow(
							'LIVINITY_terminal',
							'/terminal',
							'Terminal',
							systemAppsKeyed['LIVINITY_terminal'].icon,
						)
					}
				/>
			</motion.div>
			<LogoutDialog />

			<ErrorBoundary fallbackRender={() => null}>
				<Suspense>
					<LiveUsageDialog />
				</Suspense>
			</ErrorBoundary>
			<ErrorBoundary fallbackRender={() => null}>
				<Suspense>
					<WhatsNewModal />
				</Suspense>
			</ErrorBoundary>
		</>
	)
}

export function DockPreview() {
	const mouseX = useMotionValue(Infinity)
	const {iconSize, iconSizeZoomed, padding, dockHeight} = useDockDimensions({isPreview: true})

	return (
		<div
			className={dockPreviewClass}
			style={{
				height: dockHeight,
				paddingBottom: padding,
			}}
		>
			<DockItem
				appId='LIVINITY_home'
				mouseX={mouseX}
				iconSize={iconSize}
				iconSizeZoomed={iconSizeZoomed}
			/>
			<DockItem
				appId='LIVINITY_files'
				mouseX={mouseX}
				iconSize={iconSize}
				iconSizeZoomed={iconSizeZoomed}
			/>
			<DockItem
				appId='LIVINITY_settings'
				mouseX={mouseX}
				iconSize={iconSize}
				iconSizeZoomed={iconSizeZoomed}
			/>
			<DockDivider iconSize={iconSize} />
			<DockItem
				appId='LIVINITY_live-usage'
				mouseX={mouseX}
				iconSize={iconSize}
				iconSizeZoomed={iconSizeZoomed}
			/>
		</div>
	)
}

export function DockSpacer({className}: {className?: string}) {
	const {dockHeight} = useDockDimensions()
	return <div className={cn('w-full shrink-0', className)} style={{height: dockHeight + DOCK_BOTTOM_PADDING_PX}} />
}

export function DockBottomPositioner({children}: {children: React.ReactNode}) {
	return (
		<div className='fixed bottom-0 left-1/2 z-50 -translate-x-1/2' style={{paddingBottom: DOCK_BOTTOM_PADDING_PX}}>
			{children}
		</div>
	)
}

const dockClass = tw`mx-auto flex items-end gap-3 rounded-radius-xl bg-surface-base contrast-more:bg-neutral-700 backdrop-blur-2xl contrast-more:backdrop-blur-none px-2.5 shadow-dock shrink-0 will-change-transform transform-gpu border-hpx border-border-default`
const dockPreviewClass = tw`mx-auto flex items-end gap-4 rounded-radius-xl bg-neutral-900/80 px-3 shadow-dock shrink-0 border-hpx border-border-default`

const DockDivider = ({iconSize}: {iconSize: number}) => (
	<div className='br grid w-1 place-items-center' style={{height: iconSize}}>
		<div className='h-6 border-r border-border-subtle' />
	</div>
)
