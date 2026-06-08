import {motion, Variant} from 'framer-motion'
import {useLocation} from 'react-router-dom'
import {useState, useEffect, useCallback, useMemo, useRef} from 'react'

import {useCliAuthBridge} from '@/hooks/use-cli-auth-bridge'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useMobileApp} from '@/modules/mobile/mobile-app-context'
import {useApps, systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {trpcReact} from '@/trpc/trpc'

import {NativeAppIcon} from '../dock/native-app-icon'

import {AppGrid, AppGridItem, DesktopLayout} from './app-grid/app-grid'
import {AppIcon, AppIconConnected} from './app-icon'
import {DesktopFolder} from './desktop-folder'
import {DockSpacer} from './dock'
import {WebAppIcon} from './webapp-icon'
import {WidgetMeta, getWidgetSize} from './widgets/widget-types'
import {WidgetRenderer} from './widgets/widget-renderer'
import {WidgetContextMenu} from './widgets/widget-context-menu'

// ── Folder metadata storage ──────────────────────────────

export interface FolderMeta {
	name: string
	color?: string
	icon?: string
}

const FOLDERS_STORAGE_KEY = 'livinity-desktop-folders-v2'
const LAYOUT_STORAGE_KEY = 'livinity-desktop-layout'

// localStorage helpers (fallback for offline / initial load)

function loadFoldersLocal(): FolderMeta[] {
	try {
		const raw = localStorage.getItem(FOLDERS_STORAGE_KEY)
		if (raw) return JSON.parse(raw)
		const v1 = localStorage.getItem('livinity-desktop-folders')
		if (v1) return (JSON.parse(v1) as string[]).map((n) => ({name: n}))
	} catch {}
	return []
}

function saveFoldersLocal(folders: FolderMeta[]) {
	localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders))
	window.dispatchEvent(new StorageEvent('storage', {key: FOLDERS_STORAGE_KEY, newValue: JSON.stringify(folders)}))
}

function loadLayoutLocal(): DesktopLayout {
	try {
		const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
		if (raw) return JSON.parse(raw)
	} catch {}
	return {}
}

function saveLayoutLocal(layout: DesktopLayout) {
	localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

// ── Hooks ────────────────────────────────────────────────

function useDesktopFolders() {
	const [folders, setFolders] = useState<FolderMeta[]>(loadFoldersLocal)
	const serverSynced = useRef(false)

	const prefsQ = trpcReact.preferences.get.useQuery({keys: ['desktop-folders']}, {retry: false})
	const setPref = trpcReact.preferences.set.useMutation()

	useEffect(() => {
		if (prefsQ.data && !serverSynced.current) {
			serverSynced.current = true
			const remote = prefsQ.data['desktop-folders']
			if (Array.isArray(remote) && remote.length > 0) {
				setFolders(remote)
				saveFoldersLocal(remote)
			}
		}
	}, [prefsQ.data])

	useEffect(() => {
		const handler = (e: StorageEvent) => {
			if (e.key === FOLDERS_STORAGE_KEY) try { setFolders(JSON.parse(e.newValue || '[]')) } catch {}
		}
		window.addEventListener('storage', handler)
		return () => window.removeEventListener('storage', handler)
	}, [])

	const update = useCallback((fn: (prev: FolderMeta[]) => FolderMeta[]) => {
		setFolders((prev) => {
			const next = fn(prev)
			saveFoldersLocal(next)
			setPref.mutate({key: 'desktop-folders', value: next})
			return next
		})
	}, [setPref])

	return {folders, update}
}

function useDesktopLayout() {
	const [layout, setLayout] = useState<DesktopLayout>(loadLayoutLocal)
	const serverSynced = useRef(false)

	const prefsQ = trpcReact.preferences.get.useQuery({keys: ['desktop-layout']}, {retry: false})
	const setPref = trpcReact.preferences.set.useMutation()

	useEffect(() => {
		if (prefsQ.data && !serverSynced.current) {
			serverSynced.current = true
			const remote = prefsQ.data['desktop-layout']
			if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
				setLayout(remote as DesktopLayout)
				saveLayoutLocal(remote as DesktopLayout)
			}
		}
	}, [prefsQ.data])

	const updateLayout = useCallback((newLayout: DesktopLayout) => {
		setLayout(newLayout)
		saveLayoutLocal(newLayout)
		setPref.mutate({key: 'desktop-layout', value: newLayout})
	}, [setPref])

	return {layout, updateLayout}
}

// ── Widget metadata storage ──────────────────────────────

const WIDGETS_STORAGE_KEY = 'livinity-desktop-widgets'

function loadWidgetsLocal(): WidgetMeta[] {
	try {
		const raw = localStorage.getItem(WIDGETS_STORAGE_KEY)
		if (raw) return JSON.parse(raw)
	} catch {}
	return []
}

function saveWidgetsLocal(widgets: WidgetMeta[]) {
	localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(widgets))
	window.dispatchEvent(new StorageEvent('storage', {key: WIDGETS_STORAGE_KEY, newValue: JSON.stringify(widgets)}))
}

export function useDesktopWidgets() {
	const [widgets, setWidgets] = useState<WidgetMeta[]>(loadWidgetsLocal)
	const serverSynced = useRef(false)

	const prefsQ = trpcReact.preferences.get.useQuery({keys: ['desktop-widgets']}, {retry: false})
	const setPref = trpcReact.preferences.set.useMutation()

	useEffect(() => {
		if (prefsQ.data && !serverSynced.current) {
			serverSynced.current = true
			const remote = prefsQ.data['desktop-widgets']
			if (Array.isArray(remote) && remote.length > 0) {
				setWidgets(remote)
				saveWidgetsLocal(remote)
			}
		}
	}, [prefsQ.data])

	useEffect(() => {
		const handler = (e: StorageEvent) => {
			if (e.key === WIDGETS_STORAGE_KEY) try { setWidgets(JSON.parse(e.newValue || '[]')) } catch {}
		}
		window.addEventListener('storage', handler)
		return () => window.removeEventListener('storage', handler)
	}, [])

	const update = useCallback((fn: (prev: WidgetMeta[]) => WidgetMeta[]) => {
		setWidgets((prev) => {
			const next = fn(prev)
			saveWidgetsLocal(next)
			setPref.mutate({key: 'desktop-widgets', value: next})
			return next
		})
	}, [setPref])

	return {widgets, update}
}

export function addDesktopWidget(widget: WidgetMeta) {
	const widgets = loadWidgetsLocal()
	widgets.push(widget)
	saveWidgetsLocal(widgets)
}

export function removeDesktopWidget(widgetId: string) {
	const widgets = loadWidgetsLocal().filter(w => w.id !== widgetId)
	saveWidgetsLocal(widgets)
}

// ── Desktop Content ──────────────────────────────────────

export function DesktopContent({onSearchClick}: {onSearchClick?: () => void}) {
	const {pathname} = useLocation()

	const getQuery = trpcReact.user.get.useQuery()
	const name = getQuery.data?.name

	const {userApps, isLoading, webapps} = useApps()
	const {folders, update: updateFolders} = useDesktopFolders()
	const {widgets, update: updateWidgets} = useDesktopWidgets()
	const {layout, updateLayout} = useDesktopLayout()

	// Phase 101-07 — pull persisted native-app configs (apps.native.list).
	// Direct query rather than threading through useApps to minimize blast
	// radius on the shared provider. Same staleTime/retry policy as
	// webappsQ above for parity. Invalidations from create/delete mutations
	// inside NativeAppForm / NativeAppIcon remain the primary refresh path.
	const nativeAppsQ = trpcReact.apps.native.list.useQuery(undefined, {
		staleTime: 30 * 1000,
		retry: false,
	})
	// React #185 fix: `?? []` creates a NEW empty array every render when
	// data is undefined → unstable reference in the gridItems useMemo dep
	// list (line ~471) → infinite re-render loop in production. Memoize
	// against the query result so the empty fallback is reference-stable.
	const nativeApps = useMemo(() => nativeAppsQ.data ?? [], [nativeAppsQ.data])

	const isMobile = useIsMobile()
	const {openApp} = useMobileApp()

	const handleWidgetConfigUpdate = useCallback((widgetId: string, config: Record<string, unknown>) => {
		updateWidgets((prev) => prev.map((w) => w.id === widgetId ? {...w, config} : w))
	}, [updateWidgets])

	// Phase 157 round 4 — React hooks-rules fix.
	//
	// The early-return `if (isLoading || !userApps || !name) return null`
	// used to live HERE — between the trpc query hooks above and the
	// `useWindowManagerOptional` / `useMemo(gridItems)` hooks below.
	//
	// When `userApps` flickered to undefined during refetch (or a 500
	// from apps.native.list mid-session), the early return skipped
	// those hooks → next successful render called MORE hooks than the
	// previous → React error #310 "Rendered fewer hooks than expected".
	//
	// Fix: defer the conditional render until AFTER all hooks run. The
	// hooks themselves are made defensive (gridItems returns [] when
	// userApps is undefined). Moves a runtime crash into a no-op render.

	const windowManager = useWindowManagerOptional()

	// Phase 252 G17 — bridge the Liv AI "Local Agents" CLI-auth postMessage to
	// the LivOS Terminal (opens it + runs `<cli> auth login` interactively).
	// Mounted here because DesktopContent is guaranteed to live inside the
	// window-manager provider (it already drives openWindow for Docker etc.).
	useCliAuthBridge()


	const gridItems: AppGridItem[] = useMemo(() => {
		// Phase 157 round 4 — defensive guard against userApps being
		// undefined mid-refetch. See the comment block above
		// `useWindowManagerOptional` for context.
		if (!userApps) return []
		const appItems: AppGridItem[] = userApps.map((app) => ({
			id: app.id,
			node: (
				<motion.div
					initial={{opacity: 0, scale: 0}}
					animate={{opacity: 1, scale: 1}}
					transition={{type: 'spring', stiffness: 400, damping: 25}}
				>
					<AppIconConnected appId={app.id} />
				</motion.div>
			),
		}))

		// Phase 94-05 — persisted user-defined WebApps appear immediately
		// after Docker apps (and before the hardcoded LIVINITY_* shortcuts).
		// Drag-arrange ordering deferred to v34.
		const webappItems: AppGridItem[] = webapps.map((wa) => ({
			id: `webapp-${wa.id}`,
			node: (
				<motion.div
					initial={{opacity: 0, scale: 0}}
					animate={{opacity: 1, scale: 1}}
					transition={{type: 'spring', stiffness: 400, damping: 25}}
				>
					<WebAppIcon id={wa.id} url={wa.url} title={wa.title} faviconUrl={wa.faviconUrl} />
				</motion.div>
			),
		}))
		appItems.push(...webappItems)

		// Phase 101-07 — persisted native apps (apps.native.list). Discriminated
		// from WebApps by the data source — same desktop grid surface, same
		// motion animation, swap WebAppIcon → NativeAppIcon. Native icons sort
		// after WebApps in the initial MVP; drag-arrange ordering is shared
		// with WebApps and deferred to v34.
		const nativeAppItems: AppGridItem[] = nativeApps.map((cfg) => ({
			id: `native-app-${cfg.id}`,
			node: (
				<motion.div
					initial={{opacity: 0, scale: 0}}
					animate={{opacity: 1, scale: 1}}
					transition={{type: 'spring', stiffness: 400, damping: 25}}
				>
					<NativeAppIcon
						id={cfg.id}
						name={cfg.name}
						iconUrl={cfg.iconUrl}
						wmClassHint={cfg.wmClassHint}
					/>
				</motion.div>
			),
		}))
		appItems.push(...nativeAppItems)

		// System apps shown in grid on mobile (dock is hidden)
		if (isMobile) {
			const mobileSystemApps = [
				{id: 'LIVINITY_files', label: 'Files', icon: systemAppsKeyed['LIVINITY_files'].icon, route: '/files/Home'},
				{id: 'LIVINITY_settings', label: 'Settings', icon: systemAppsKeyed['LIVINITY_settings'].icon, route: '/settings'},
				{id: 'LIVINITY_docker', label: 'Docker', icon: systemAppsKeyed['LIVINITY_docker'].icon, route: '/docker'},
				{id: 'LIVINITY_terminal', label: 'Terminal', icon: systemAppsKeyed['LIVINITY_terminal'].icon, route: '/terminal'},
			]
			for (const sysApp of mobileSystemApps) {
				appItems.unshift({
					id: sysApp.id,
					node: (
						<motion.div
							initial={{opacity: 0, scale: 0}}
							animate={{opacity: 1, scale: 1}}
							transition={{type: 'spring', stiffness: 400, damping: 25}}
						>
							<AppIcon
								label={sysApp.label}
								src={sysApp.icon}
								onClick={() => openApp(sysApp.id, sysApp.route, sysApp.label, sysApp.icon)}
							/>
						</motion.div>
					),
				})
			}
		}

		// Docker desktop tile REMOVED 2026-06-08 (operator) — Docker now launches
		// from the navbar utility cluster (top-bar.tsx). Server Management stays
		// dock-only. Both kept off the desktop grid to reduce clutter.

		const folderItems: AppGridItem[] = folders.map((folder) => ({
			id: `folder-${folder.name}`,
			node: (
				<motion.div
					initial={{opacity: 0, scale: 0}}
					animate={{opacity: 1, scale: 1}}
					transition={{type: 'spring', stiffness: 400, damping: 25}}
				>
					<DesktopFolder
						name={folder.name}
						color={folder.color}
						icon={folder.icon}
						onRemove={() => updateFolders((prev) => prev.filter((f) => f.name !== folder.name))}
						onRename={(newName) => updateFolders((prev) => prev.map((f) => f.name === folder.name ? {...f, name: newName} : f))}
						onChangeColor={(c) => updateFolders((prev) => prev.map((f) => f.name === folder.name ? {...f, color: c} : f))}
						onChangeIcon={(ic) => updateFolders((prev) => prev.map((f) => f.name === folder.name ? {...f, icon: ic} : f))}
					/>
				</motion.div>
			),
		}))

		const widgetItems: AppGridItem[] = widgets.map((widget) => {
			const size = getWidgetSize(widget.type)
			return {
				id: widget.id,
				colSpan: size.colSpan,
				rowSpan: size.rowSpan,
				node: (
					<WidgetContextMenu widget={widget} onUpdateConfig={handleWidgetConfigUpdate}>
						<motion.div
							initial={{opacity: 0, scale: 0.8}}
							animate={{opacity: 1, scale: 1}}
							transition={{type: 'spring', stiffness: 400, damping: 25}}
							className='h-full w-full'
						>
							<WidgetRenderer widget={widget} />
						</motion.div>
					</WidgetContextMenu>
				),
			}
		})

		return [...appItems, ...folderItems, ...widgetItems]
	}, [userApps, webapps, nativeApps, folders, widgets, isMobile, openApp, windowManager])

	// Phase 157 round 4 — conditional render deferred to AFTER all hooks
	// have run. Returning `null` mid-function would have skipped the
	// hooks above on no-data renders → React error #310 on the next
	// successful render.
	if (isLoading || !userApps || !name) return null

	type V = 'default' | 'overlayed'
	const variant: V = pathname === '/' ? 'default' : 'overlayed'
	const variants: Record<V, Variant> = {
		default: {opacity: 1, scale: 1, transition: {duration: 0.2, ease: 'easeOut'}},
		overlayed: {opacity: 0, scale: 0.98, transition: {duration: 0.1}},
	}

	return (
		<motion.div className='flex h-full w-full select-none flex-col' variants={variants} animate={variant} initial={{opacity: 1}} transition={{duration: 0.15, ease: 'easeOut'}}>
			<div className='w-full grow overflow-hidden'>
				<AppGrid items={gridItems} layout={layout} onLayoutChange={updateLayout} />
			</div>
			<DockSpacer />
		</motion.div>
	)
}

export function addDesktopFolder(folderName: string) {
	const folders = loadFoldersLocal()
	if (!folders.some((f) => f.name === folderName)) {
		folders.push({name: folderName})
		saveFoldersLocal(folders)
	}
}
