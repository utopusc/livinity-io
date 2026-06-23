import {DndContext, DragEndEvent, PointerSensor, useSensor, useSensors} from '@dnd-kit/core'
import {restrictToHorizontalAxis} from '@dnd-kit/modifiers'
import {horizontalListSortingStrategy, SortableContext, useSortable} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {motion, useMotionValue} from 'framer-motion'
import React, {useCallback, useMemo} from 'react'
import {useLocation} from 'react-router-dom'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useQueryParams} from '@/hooks/use-query-params'
import {useSettingsNotificationCount} from '@/hooks/use-settings-notification-count'
import {useV42MigrationActive} from '@/hooks/use-v42-migration-active'
import {systemAppsKeyed, useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

import {useLaunchApp} from '@/hooks/use-launch-app'
import {useLaunchWebApp} from '@/hooks/use-launch-webapp'
import {OPENUI_APP_ID_PREFIX, OPENUI_WMCLASS_PREFIX, useLaunchNativeApp} from '@/modules/dock/use-launch-native-app'
import {openCommandPalette} from '@/components/cmdk'
import {DockItem} from './dock-item'
import {LogoutDialog} from './logout-dialog'
import {WINDOWED_SYSTEM_ROUTES} from './system-windowed-routes'
import {DockPin, dockPinKey, useDockPins} from './use-dock-pins'


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

type OpenWindowFn = (
	appId: string,
	route: string,
	title: string,
	icon: string,
	originRect?: {x: number; y: number; width: number; height: number},
) => boolean

export function Dock() {
	const {pathname} = useLocation()
	const {addLinkSearchParams} = useQueryParams()
	const mouseX = useMotionValue(Infinity)
	const settingsNotificationCount = useSettingsNotificationCount()
	const isMobile = useIsMobile()
	const {iconSize, iconSizeZoomed, padding, dockHeight} = useDockDimensions()
	const windowManager = useWindowManagerOptional()
	// Phase 227-02 — gate the Liv Assistant dock entry behind the v42
	// migration flag (default ON). Flip Redis `liv:config:liv_v42_migration_active=false`
	// to hide it without code revert (D-V42-ROLLBACK pattern).
	const showLivAssistant = useV42MigrationActive()

	// Dock+Launchpad Phase 4 — data-driven, persisted, reorderable pins
	// replace the old hardcoded DockItem JSX (pre-Phase-4 dock.tsx 102-218).
	const {pins, unpin, reorder} = useDockPins()

	// Resolve-or-skip data for app/webapp/native pins. Queried once here,
	// threaded into each DockPinItem (apps.native.list policy mirrors
	// desktop-content.tsx, incl. the reference-stable empty fallback).
	const nativeAppsQ = trpcReact.apps.native.list.useQuery(undefined, {staleTime: 30 * 1000, retry: false})
	const nativeApps = useMemo(() => nativeAppsQ.data ?? [], [nativeAppsQ.data])

	const lastFilesPath = sessionStorage.getItem('lastFilesPath')

	const handleOpenWindow = useCallback<OpenWindowFn>(
		(appId, route, title, icon, originRect) => {
			if (!windowManager) return false
			windowManager.openWindow(appId, route, title, icon, originRect)
			return true
		},
		[windowManager],
	)

	// Drag-reorder: PointerSensor with a small distance constraint so plain
	// clicks still reach the tile buttons (dnd only kicks in after 8px).
	const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 8}}))
	const handleDragEnd = useCallback(
		(e: DragEndEvent) => {
			if (e.over && e.active.id !== e.over.id) reorder(String(e.active.id), String(e.over.id))
		},
		[reorder],
	)

	// Recent apps that are already pinned shouldn't show twice.
	const pinnedUserAppIds = useMemo(() => pins.filter((p) => p.kind === 'app').map((p) => p.id), [pins])

	// Phase 3 polish — macOS-style "open" dots: a pin shows the dot when
	// the window manager currently hosts a window for it (minimized
	// counts as open, like macOS). User-app pins open in a browser tab,
	// which we can't observe — they keep open=false.
	const windowAppIds = useMemo(
		() => new Set((windowManager?.windows ?? []).map((w) => w.appId)),
		[windowManager?.windows],
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
				{/* Phase 130-02 — Profile avatar moved to the TopBar. */}
				{/* Dock+Launchpad Phase 1 — the "Apps" tile (macOS Launchpad
				    convention: fixed first position, non-removable, NOT a pin).
				    Opens the unified Launchpad/Spotlight overlay — same surface
				    as ⌘K — via the module-level openCommandPalette() opener. */}
				<div data-test-dock-item='launchpad' className='contents'>
					<DockItem
						appId='LIVINITY_launchpad'
						iconSize={iconSize}
						iconSizeZoomed={iconSizeZoomed}
						open={false}
						mouseX={mouseX}
						onOpenWindow={() => {
							openCommandPalette()
							return true
						}}
					/>
				</div>
				{/* Pinned tiles — persisted order, drag to reorder, right-click
				    → Remove from Dock. Defaults seed the pre-Phase-4 dock. */}
				<DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis]}>
					<SortableContext items={pins.map(dockPinKey)} strategy={horizontalListSortingStrategy}>
						{pins.map((pin) => (
							<DockPinItem
								key={dockPinKey(pin)}
								pin={pin}
								mouseX={mouseX}
								iconSize={iconSize}
								iconSizeZoomed={iconSizeZoomed}
								pathname={pathname}
								lastFilesPath={lastFilesPath}
								settingsNotificationCount={settingsNotificationCount}
								showLivAssistant={showLivAssistant}
								nativeApps={nativeApps}
								windowAppIds={windowAppIds}
								onOpenWindow={handleOpenWindow}
								onUnpin={() => unpin(pin.kind, pin.id)}
							/>
						))}
					</SortableContext>
				</DndContext>
				{/* Recent apps */}
				<RecentAppsDock
					mouseX={mouseX}
					iconSize={iconSize}
					iconSizeZoomed={iconSizeZoomed}
					excludeAppIds={pinnedUserAppIds}
				/>
			</motion.div>
			<LogoutDialog />
		</>
	)
}

// Stable test seam per pin — system pins keep the bare id (the Phase
// 227 'liv-assistant' convention dock.test.tsx queries); other kinds
// are namespaced to avoid collisions with system ids.
function pinTestSeam(pin: DockPin): string {
	return pin.kind === 'system' ? pin.id.replace(/^LIVINITY_/, '') : `${pin.kind}-${pin.id}`
}

function DockPinItem({
	pin,
	mouseX,
	iconSize,
	iconSizeZoomed,
	pathname,
	lastFilesPath,
	settingsNotificationCount,
	showLivAssistant,
	nativeApps,
	windowAppIds,
	onOpenWindow,
	onUnpin,
}: {
	pin: DockPin
	mouseX: ReturnType<typeof useMotionValue<number>>
	iconSize: number
	iconSizeZoomed: number
	pathname: string
	lastFilesPath: string | null
	settingsNotificationCount: number | undefined
	showLivAssistant: boolean
	nativeApps: {id: string; name: string; iconUrl?: string; wmClassHint?: string}[]
	windowAppIds: Set<string>
	onOpenWindow: OpenWindowFn
	onUnpin: () => void
}) {
	// Hooks run unconditionally — resolve-or-skip happens after.
	const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id: dockPinKey(pin)})
	const {userAppsKeyed, webapps} = useApps()
	const launchApp = useLaunchApp()
	const launchWebApp = useLaunchWebApp()
	const launchNativeApp = useLaunchNativeApp()

	const itemProps = {iconSize, iconSizeZoomed, mouseX}

	const inner = (() => {
		switch (pin.kind) {
			case 'system': {
				const sys = systemAppsKeyed[pin.id as keyof typeof systemAppsKeyed]
				if (!sys) return null
				// D-V42-ROLLBACK — the Liv AI pin survives in storage but only
				// renders while the migration flag is on (pre-Phase-4 behavior).
				if (pin.id === 'LIVINITY_liv-assistant' && !showLivAssistant) return null
				const windowRoute = WINDOWED_SYSTEM_ROUTES[pin.id]
				const route = pin.id === 'LIVINITY_files' ? lastFilesPath || windowRoute : windowRoute
				const routeOpen =
					pin.id === 'LIVINITY_files'
						? pathname.startsWith('/files')
						: !!sys.systemAppTo &&
							sys.systemAppTo !== '/' &&
							!sys.systemAppTo.startsWith('?') &&
							pathname.startsWith(sys.systemAppTo)
				// macOS open dot: full-page route active OR a window is hosted.
				const open = routeOpen || windowAppIds.has(pin.id)
				return (
					<DockItem
						appId={pin.id}
						{...itemProps}
						open={open}
						notificationCount={pin.id === 'LIVINITY_settings' ? settingsNotificationCount : undefined}
						{...(windowRoute
							? {
									onOpenWindow: (originRect: {x: number; y: number; width: number; height: number}) =>
										onOpenWindow(pin.id, route!, sys.name, sys.icon, originRect),
								}
							: {to: sys.systemAppTo})}
					/>
				)
			}
			case 'app': {
				const app = userAppsKeyed?.[pin.id]
				if (!app) return null
				return (
					<DockItem
						appId={pin.id}
						bg={app.icon}
						label={app.name}
						{...itemProps}
						open={false}
						onClick={() => launchApp(pin.id)}
					/>
				)
			}
			case 'webapp': {
				const wa = (webapps ?? []).find((w) => w.id === pin.id)
				if (!wa) return null
				const label =
					wa.title?.trim() ||
					(() => {
						try {
							return new URL(wa.url).hostname
						} catch {
							return wa.url
						}
					})()
				return (
					<DockItem
						appId={pin.id}
						bg={wa.faviconUrl || undefined}
						label={label}
						{...itemProps}
						open={windowAppIds.has(`WEBAPP_${wa.id}`)}
						onClick={launchWebApp({id: wa.id, url: wa.url, title: label, iconUrl: wa.faviconUrl || ''})}
					/>
				)
			}
			case 'native': {
				const cfg = nativeApps.find((n) => n.id === pin.id)
				if (!cfg) return null
				// NATIVE_<id> stream windows; OpenUI apps open OPENUI_<slug>
				// iframe windows (slug = wmClassHint past the prefix).
				const nativeOpen =
					windowAppIds.has(`NATIVE_${cfg.id}`) ||
					(!!cfg.wmClassHint &&
						cfg.wmClassHint.startsWith(OPENUI_WMCLASS_PREFIX) &&
						windowAppIds.has(`${OPENUI_APP_ID_PREFIX}${cfg.wmClassHint.slice(OPENUI_WMCLASS_PREFIX.length)}`))
				return (
					<DockItem
						appId={pin.id}
						bg={cfg.iconUrl || undefined}
						label={cfg.name}
						{...itemProps}
						open={nativeOpen}
						onClick={() => {
							void launchNativeApp({id: cfg.id, name: cfg.name, iconUrl: cfg.iconUrl, wmClassHint: cfg.wmClassHint})
						}}
					/>
				)
			}
		}
	})()

	// Unresolvable pin (uninstalled app, deleted webapp/native config,
	// gated system surface) — render nothing; the pin stays in storage
	// so reinstalling/re-enabling restores the tile.
	if (!inner) return null

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					ref={setNodeRef}
					data-test-dock-item={pinTestSeam(pin)}
					className='flex touch-none items-end'
					style={{
						transform: CSS.Translate.toString(transform),
						transition,
						zIndex: isDragging ? 60 : undefined,
						opacity: isDragging ? 0.7 : 1,
					}}
					{...attributes}
					{...listeners}
				>
					{inner}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onUnpin}>Remove from Dock</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
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

function RecentAppsDock({
	mouseX,
	iconSize,
	iconSizeZoomed,
	excludeAppIds = [],
}: {
	mouseX: ReturnType<typeof useMotionValue<number>>
	iconSize: number
	iconSizeZoomed: number
	excludeAppIds?: string[]
}) {
	const recentQ = trpcReact.apps.recentlyOpened.useQuery(undefined, {staleTime: 30_000})
	const {userAppsKeyed} = useApps()
	const launchApp = useLaunchApp()

	const recentApps = (recentQ.data ?? [])
		.filter((appId: string) => userAppsKeyed?.[appId])
		// Phase 4 — pinned apps already have a permanent tile; don't double up.
		.filter((appId: string) => !excludeAppIds.includes(appId))
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

