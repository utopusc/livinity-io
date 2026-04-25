import {motion, useMotionValue} from 'framer-motion'
import React, {Suspense, useCallback} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {useLocation} from 'react-router-dom'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useQueryParams} from '@/hooks/use-query-params'
import {useSettingsNotificationCount} from '@/hooks/use-settings-notification-count'
import {systemAppsKeyed, useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

import {useLaunchApp} from '@/hooks/use-launch-app'
import {DockItem} from './dock-item'
import {DockProfile} from './dock-profile'
import {LogoutDialog} from './logout-dialog'

const LiveUsageDialog = React.lazy(() => import('@/routes/live-usage'))
const WhatsNewModal = React.lazy(() => import('@/routes/whats-new-modal').then((m) => ({default: m.WhatsNewModal})))

const DOCK_BOTTOM_PADDING_PX = 8

const DOCK_DIMENSIONS_PX = {
	preview: {
		iconSize: 48,
		iconSizeZoomed: 72,
		padding: 10,
	},
	desktop: {
		iconSize: 46,
		iconSizeZoomed: 74,
		padding: 8,
	},
	mobile: {
		iconSize: 44,
		iconSizeZoomed: 58,
		padding: 6,
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
		(appId: string, route: string, title: string, icon: string, originRect?: {x: number; y: number; width: number; height: number}) => {
			if (!windowManager) return false
			windowManager.openWindow(appId, route, title, icon, originRect)
			return true
		},
		[windowManager],
	)

	return (
		<>
			<motion.div
				initial={{translateY: 60, opacity: 0, scale: 0.95}}
				animate={{translateY: 0, opacity: 1, scale: 1}}
				transition={{type: 'spring', stiffness: 280, damping: 24, delay: 0.15}}
				onPointerMove={(e) => e.pointerType === 'mouse' && mouseX.set(e.pageX)}
				onPointerLeave={() => mouseX.set(Infinity)}
				className={cn(dockClass, isMobile && 'gap-2')}
				style={{
					height: dockHeight,
					paddingBottom: padding,
				}}
			>
				{/* Profile avatar */}
				<DockProfile mouseX={mouseX} iconSize={iconSize} iconSizeZoomed={iconSizeZoomed} />
				{/* Separator */}
				<div className='mx-0.5 h-[60%] w-px bg-white/20 self-center' />
				<DockItem
					appId='LIVINITY_files'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					to={lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo}
					open={pathname.startsWith('/files')}
					mouseX={mouseX}
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_files',
							lastFilesPath || '/files/Home',
							'Files',
							systemAppsKeyed['LIVINITY_files'].icon,
							originRect,
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
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_settings',
							'/settings',
							'Settings',
							systemAppsKeyed['LIVINITY_settings'].icon,
							originRect,
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
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_app-store',
							'/app-store',
							'App Store',
							systemAppsKeyed['LIVINITY_app-store'].icon,
							originRect,
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
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_ai-chat',
							'/ai-chat',
							'AI Chat',
							systemAppsKeyed['LIVINITY_ai-chat'].icon,
							originRect,
						)
					}
				/>
				{/* Phase 24-01 — replaces the legacy server-control app. */}
				<DockItem
					appId='LIVINITY_docker'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_docker',
							'/docker',
							'Docker',
							systemAppsKeyed['LIVINITY_docker'].icon,
							originRect,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_my-devices'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_my-devices',
							'/my-devices',
							'Devices',
							systemAppsKeyed['LIVINITY_my-devices'].icon,
							originRect,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_subagents'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_subagents',
							'/subagents',
							'Agents',
							systemAppsKeyed['LIVINITY_subagents'].icon,
							originRect,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_schedules'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_schedules',
							'/schedules',
							'Schedules',
							systemAppsKeyed['LIVINITY_schedules'].icon,
							originRect,
						)
					}
				/>
				<DockItem
					appId='LIVINITY_terminal'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_terminal',
							'/terminal',
							'Terminal',
							systemAppsKeyed['LIVINITY_terminal'].icon,
							originRect,
						)
					}
				/>
				{/* Recent apps */}
				<RecentAppsDock mouseX={mouseX} iconSize={iconSize} iconSizeZoomed={iconSizeZoomed} />
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
	const isMobile = useIsMobile()
	const {dockHeight} = useDockDimensions()
	if (isMobile) return <div className={cn('w-full shrink-0', className)} style={{height: 72}} />
	return <div className={cn('w-full shrink-0', className)} style={{height: dockHeight + DOCK_BOTTOM_PADDING_PX}} />
}

export function DockBottomPositioner({children}: {children: React.ReactNode}) {
	const isMobile = useIsMobile()
	if (isMobile) return null
	return (
		<div className='fixed bottom-0 left-1/2 z-50 -translate-x-1/2' style={{paddingBottom: DOCK_BOTTOM_PADDING_PX}}>
			{children}
		</div>
	)
}

const dockClass = tw`mx-auto flex items-end gap-3 rounded-radius-xl bg-white/80 contrast-more:bg-neutral-700 backdrop-blur-2xl contrast-more:backdrop-blur-none px-3 shadow-dock shrink-0 will-change-transform transform-gpu border-px border-white/60`
const dockPreviewClass = tw`mx-auto flex items-end gap-4 rounded-radius-xl bg-white/80 backdrop-blur-md px-3 shadow-dock shrink-0 border-hpx border-border-default`

function RecentAppsDock({mouseX, iconSize, iconSizeZoomed}: {mouseX: ReturnType<typeof useMotionValue<number>>; iconSize: number; iconSizeZoomed: number}) {
	const recentQ = trpcReact.apps.recentlyOpened.useQuery(undefined, {staleTime: 30_000})
	const {userAppsKeyed} = useApps()
	const launchApp = useLaunchApp()

	const recentApps = (recentQ.data ?? [])
		.filter((appId: string) => userAppsKeyed?.[appId])
		.slice(0, 3)

	if (recentApps.length === 0) return null

	return (
		<>
			<div className='mx-0.5 h-[60%] w-px bg-white/20 self-center' />
			{recentApps.map((appId: string) => {
				const app = userAppsKeyed![appId]
				return (
					<DockItem
						key={appId}
						appId={appId}
						bg={app.icon}
						label={app.name}
						iconSize={iconSize}
						iconSizeZoomed={iconSizeZoomed}
						open={false}
						mouseX={mouseX}
						onClick={() => launchApp(appId)}
					/>
				)
			})}
		</>
	)
}

const DockDivider = ({iconSize}: {iconSize: number}) => (
	<div className='br grid w-1 place-items-center' style={{height: iconSize}}>
		<div className='h-6 border-r border-border-subtle' />
	</div>
)

