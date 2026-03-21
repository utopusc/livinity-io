import {motion, Variant} from 'framer-motion'
import {useLocation} from 'react-router-dom'
import {useState, useEffect, useCallback, useMemo, useRef} from 'react'

import {useApps, systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {trpcReact} from '@/trpc/trpc'

import {AppGrid, AppGridItem, DesktopLayout} from './app-grid/app-grid'
import {AppIcon, AppIconConnected} from './app-icon'
import {DesktopFolder} from './desktop-folder'
import {DockSpacer} from './dock'
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

	const {userApps, isLoading} = useApps()
	const {folders, update: updateFolders} = useDesktopFolders()
	const {widgets, update: updateWidgets} = useDesktopWidgets()
	const {layout, updateLayout} = useDesktopLayout()

	const handleWidgetConfigUpdate = useCallback((widgetId: string, config: Record<string, unknown>) => {
		updateWidgets((prev) => prev.map((w) => w.id === widgetId ? {...w, config} : w))
	}, [updateWidgets])

	if (isLoading || !userApps || !name) return null

	type V = 'default' | 'overlayed'
	const variant: V = pathname === '/' ? 'default' : 'overlayed'
	const variants: Record<V, Variant> = {
		default: {opacity: 1, scale: 1, transition: {duration: 0.2, ease: 'easeOut'}},
		overlayed: {opacity: 0, scale: 0.98, transition: {duration: 0.1}},
	}

	const gridItems: AppGridItem[] = useMemo(() => {
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

		// Web app shortcuts on desktop
		const webAppIds = ['LIVINITY_facebook', 'LIVINITY_gmail', 'LIVINITY_youtube', 'LIVINITY_tradingview', 'LIVINITY_google', 'LIVINITY_yahoo'] as const
		const webAppIcons: Record<string, string> = {
			'LIVINITY_facebook': 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg',
			'LIVINITY_gmail': 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg',
			'LIVINITY_youtube': 'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg',
			'LIVINITY_tradingview': 'https://www.tradingview.com/static/images/favicon.ico',
			'LIVINITY_google': 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg',
			'LIVINITY_yahoo': 'https://upload.wikimedia.org/wikipedia/commons/5/58/Yahoo%21_logo.svg',
		}
		const webAppItems: AppGridItem[] = webAppIds.map((id) => {
			const app = systemAppsKeyed[id]
			return {
				id,
				node: (
					<motion.div
						initial={{opacity: 0, scale: 0}}
						animate={{opacity: 1, scale: 1}}
						transition={{type: 'spring', stiffness: 400, damping: 25}}
					>
						<WebAppShortcut appId={id} name={app.name} icon={webAppIcons[id]} url={app.systemAppTo} />
					</motion.div>
				),
			}
		})

		return [...webAppItems, ...appItems, ...folderItems, ...widgetItems]
	}, [userApps, folders, widgets])

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

// Web app shortcut that opens Chrome KasmVNC in a new browser tab
function WebAppShortcut({name, icon}: {appId: string; name: string; icon: string; url: string}) {
	const handleClick = useCallback(() => {
		// Open Chrome's KasmVNC stream in a new browser tab
		const host = window.location.hostname
		const proto = window.location.protocol
		const chromeUrl = `${proto}//chrome.${host}/`
		window.open(chromeUrl, '_blank')
	}, [])

	return <AppIcon label={name} src={icon} onClick={handleClick} />
}
