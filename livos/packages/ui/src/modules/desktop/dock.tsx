import {motion, useMotionValue} from 'framer-motion'
import React, {Suspense, useCallback} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {useLocation} from 'react-router-dom'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useQueryParams} from '@/hooks/use-query-params'
import {useSettingsNotificationCount} from '@/hooks/use-settings-notification-count'
import {useV42MigrationActive} from '@/hooks/use-v42-migration-active'
import {systemAppsKeyed, useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

import {useLaunchApp} from '@/hooks/use-launch-app'
import {DockItem} from './dock-item'
import {LogoutDialog} from './logout-dialog'

const LiveUsageDialog = React.lazy(() => import('@/routes/live-usage'))

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
	// Phase 227-02 — gate the new Liv Assistant dock entry behind the v42
	// migration flag (default ON). Flip Redis `liv:config:liv_v42_migration_active=false`
	// to hide it without code revert (D-V42-ROLLBACK pattern).
	const showLivAssistant = useV42MigrationActive()

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
				{/* Phase 130-02 — Profile avatar moved to the TopBar.
				    The trailing separator went with it. */}
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
				{/* AI Chat dock entry removed with AI Chat teardown. */}
				{/* Phase 30 hot-patch round 11 (post-v28.0.2): Server Management
				    restored to the dock per user request. Docker is intentionally
				    NOT in the dock — user wants the original sleek server-control
				    entry, not the heavyweight Docker app. */}
				<DockItem
					appId='LIVINITY_server-control'
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					open={false}
					mouseX={mouseX}
					onOpenWindow={(originRect) =>
						handleOpenWindow(
							'LIVINITY_server-control',
							'/server-control',
							'Server Management',
							systemAppsKeyed['LIVINITY_server-control'].icon,
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
				{/* Phase 227-02 — Liv Assistant dock entry (the v42 AI surface). Gated
				    by Phase 224-01's `useV42MigrationActive()` so flipping the Redis
				    key `liv:config:liv_v42_migration_active=false` hides this icon
				    without removing code (D-V42-ROLLBACK pattern). Phase 231 retirement
				    removed the legacy Liv + Chat dock tiles that previously sat below
				    this one; Liv Assistant is now the sole AI chat dock surface.
				    The openWindow call targets the LIVINITY_liv-assistant appId
				    registered in apps.tsx (Plan 227-02 Task 1), which window-content
				    maps to LivAssistantWindow (Plan 227-01). The wrapping `<div
				    data-test-dock-item ... className='contents'>` is a layout-neutral
				    test seam (CSS display: contents) so dock.test.tsx can query the
				    tile reliably without ordinal fragility (D-P227-TEST-SEAM). */}
				{/* Phase 234-02 — Liv AI brand rename: window title argument
				    flipped from 'Liv Assistant' to 'Liv AI' per Section G.1
				    Resolution (operator directive 2026-05-27). Icon is now
				    resolved from systemAppsKeyed['LIVINITY_liv-assistant'].icon
				    which apps.tsx points at /figma-exports/dock-ai-chat.svg
				    (was /figma-exports/liv-ai.svg shared with the retired
				    LIVINITY_liv-ai surface). */}
				{showLivAssistant && (
					<div data-test-dock-item='liv-assistant' className='contents'>
						<DockItem
							appId='LIVINITY_liv-assistant'
							iconSize={iconSize}
							iconSizeZoomed={iconSizeZoomed}
							open={false}
							mouseX={mouseX}
							onOpenWindow={(originRect) =>
								handleOpenWindow(
									'LIVINITY_liv-assistant',
									'/liv-assistant',
									'Liv AI',
									systemAppsKeyed['LIVINITY_liv-assistant'].icon,
									originRect,
								)
							}
						/>
					</div>
				)}
				{/* Recent apps */}
				<RecentAppsDock mouseX={mouseX} iconSize={iconSize} iconSizeZoomed={iconSizeZoomed} />
			</motion.div>
			<LogoutDialog />

			<ErrorBoundary fallbackRender={() => null}>
				<Suspense>
					<LiveUsageDialog />
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

// v36 (micro): amplify the dock's glass feel — lower bg opacity so the
// wallpaper bleeds through, push blur one step (2xl→3xl), add saturate so
// colors behind the dock punch through. Apple's frosted-glass trick.
// Same shape/position/layout/icons — only the glass effect changes.
//
// 2026-05-15 — dark-mode pass. The dark dock is a slate-glass shelf: deeper
// translucent black so the wallpaper barely bleeds, a hairline white border
// for definition, and a darker shadow tuned for low-light contrast.
const dockClass = tw`mx-auto flex items-end gap-3 rounded-radius-xl bg-card-bg/50 dark:bg-black/55 contrast-more:bg-neutral-700 backdrop-blur-3xl backdrop-saturate-150 contrast-more:backdrop-blur-none px-3 shadow-dock dark:shadow-[0_10px_32px_rgba(0,0,0,0.55)] shrink-0 will-change-transform transform-gpu border-px border-white/60 dark:border-white/12`
const dockPreviewClass = tw`mx-auto flex items-end gap-4 rounded-radius-xl bg-card-bg/80 backdrop-blur-md px-3 shadow-dock shrink-0 border-hpx border-border-default`

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

