// Dock+Launchpad Phase 2+3 — the "everything" grid.
//
// Rendered inside the AppleSpotlight overlay (the unified ⌘K/Apps
// Launchpad). Shows the FULL content superset, macOS-Launchpad style:
// every installed user app (on the desktop or not), WebApps, native
// apps, system apps, file shortcuts (Downloads / Recents / Trash) and
// desktop folders — large icons with white labels on the dark dimmed
// backdrop.
//
// Phase 3 additions:
//   • Live filtering — the search query filters THIS grid (the pill
//     dropdown only keeps system ACTIONS like wallpaper/restart).
//   • Horizontal snap-scroll pages + macOS dot indicators when the
//     (unfiltered) superset overflows one page.
//   • Keyboard navigation (empty query): arrows move a ring-highlighted
//     selection across tiles/pages, Enter launches. While typing, Enter
//     launches the first filtered tile (wired via launchFirstRef).
//   • Per-tile zoom-in stagger, reduced-motion aware.
//
// Launch contracts (mirror the existing surfaces — dock, spotlight
// results, desktop icons):
//   user app  ready/running → useLaunchApp() (running ≡ ready — see
//             feedback_app_running_vs_ready_state); otherwise opens the
//             App Store window (same as spotlight unready results)
//   webapp    → useLaunchWebApp() (WEBAPP_<id> stream window)
//   native    → useLaunchNativeApp() (spawn / OpenUI iframe)
//   system    → windowManager.openWindow for windowable appIds (the
//             window-content.tsx switch set), navigate(systemAppTo)
//             fallback for the rest (Live Usage)
//   files     → openWindow('LIVINITY_files', <route>)
//   folder    → openWindow('LIVINITY_files', '/files/Home/<name>')

import {motion, useReducedMotion} from 'framer-motion'
import React, {useEffect, useMemo, useRef, useState} from 'react'
import {TbClockHour4, TbDownload, TbTrash} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'

import {AppIcon} from '@/components/app-icon'
import {LauncherIcon} from '@/components/launcher-icon'
import {RECENTS_PATH as FILES_RECENTS_PATH, TRASH_PATH as FILES_TRASH_PATH} from '@/features/files/constants'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useLaunchApp} from '@/hooks/use-launch-app'
import {useLaunchWebApp} from '@/hooks/use-launch-webapp'
import {useV42MigrationActive} from '@/hooks/use-v42-migration-active'
import {useDesktopFolders} from '@/modules/desktop/desktop-content'
import {FolderShape} from '@/modules/desktop/desktop-folder'
import {DockGlyph, DockGlyphTile, hasDockGlyph} from '@/modules/desktop/dock-item'
import {WINDOWED_SYSTEM_ROUTES} from '@/modules/desktop/system-windowed-routes'
import {DockPin, useDockPins} from '@/modules/desktop/use-dock-pins'
import {useLaunchNativeApp} from '@/modules/dock/use-launch-native-app'
import {systemAppsKeyed, useApps} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

// Order of the system-app row. Home/System are skipped (Home IS the
// desktop behind the overlay). Liv AI is appended conditionally below
// (v42 migration flag — same gate as its dock tile).
// LIVINITY_schedules is EXCLUDED on purpose (review finding 2026-06-10):
// it has no window-content arm AND no '/schedules' route — navigate()
// would land on the top-level NotFound catch-all, unmounting the whole
// desktop. The Scheduler surface was removed in the 2026-06-09 Settings
// overhaul; re-add here only if it gets a real surface again.
const SYSTEM_GRID_IDS = [
	'LIVINITY_files',
	'LIVINITY_settings',
	'LIVINITY_app-store',
	'LIVINITY_docker',
	'LIVINITY_server-control',
	'LIVINITY_terminal',
	'LIVINITY_my-devices',
	'LIVINITY_live-usage',
]

const TILE_SIZE = 72
// Tile + grid-cell metrics shared by tiles and the keyboard-nav math.
const TILE_RADIUS = TILE_SIZE * 0.28

// Icon-tile Phase 2 (2026-06-11, operator-picked C2 "Frameless Frost" in
// /icon-lab): app/webapp/native tiles render through LauncherIcon —
// transparent logos at 80% on a frameless frosted squircle, full-bleed art
// covers the tile (unchanged look). System tiles stay on DockGlyphTile.
function LauncherTile({src}: {src?: string}) {
	return (
		<div className='shadow-lg' style={{width: TILE_SIZE, height: TILE_SIZE, borderRadius: TILE_RADIUS}}>
			<LauncherIcon src={src} />
		</div>
	)
}

type LaunchpadEntry = {
	key: string
	label: string
	sublabel?: string
	dimmed?: boolean
	tile: React.ReactNode
	onSelect: () => void
	/** Phase 4 — when set, right-click offers "Keep in Dock"/"Remove from Dock". */
	pin?: DockPin
}

// Icon-consistency pass (operator 2026-06-10): file shortcuts render on
// the SAME dock squircle surface as system tiles (DockGlyphTile with a
// custom glyph) — the earlier translucent GlassTile looked like a third
// icon family next to the dock-style tiles.

function appStateSublabel(state: string): string | undefined {
	const map: Record<string, string> = {
		'not-installed': 'Not installed',
		installing: 'Installing…',
		starting: 'Starting…',
		restarting: 'Restarting…',
		stopping: 'Stopping…',
		updating: 'Updating…',
		uninstalling: 'Uninstalling…',
		unknown: 'Offline',
		stopped: 'Stopped',
		loading: 'Loading…',
	}
	return map[state]
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
	return out.length ? out : [[]]
}

export function LaunchpadGrid({
	query,
	onClose,
	launchFirstRef,
	closingRef,
	hideEmptyState,
}: {
	/** Live search query from the pill — filters the grid. */
	query: string
	onClose: () => void
	/** Set by this component: () => boolean, launches the first filtered tile (Enter in the pill). */
	launchFirstRef?: React.MutableRefObject<(() => boolean) | null>
	/** Flips true when the overlay starts closing — all input goes inert (exit anim keeps us mounted). */
	closingRef?: React.MutableRefObject<boolean>
	/** Suppress the "No apps match" line (the pill's action dropdown has results). */
	hideEmptyState?: boolean
}) {
	const navigate = useNavigate()
	const windowManager = useWindowManagerOptional()
	const launchApp = useLaunchApp()
	const launchWebApp = useLaunchWebApp()
	const launchNativeApp = useLaunchNativeApp()
	const showLivAssistant = useV42MigrationActive()
	const {userApps, webapps} = useApps()
	const {folders} = useDesktopFolders()
	const {isPinned, pin: addPin, unpin} = useDockPins()
	const isMobile = useIsMobile()
	const reduceMotion = useReducedMotion()

	// Same query/policy as desktop-content.tsx (Phase 101-07) — including
	// the reference-stable empty fallback (React #185 guard).
	const nativeAppsQ = trpcReact.apps.native.list.useQuery(undefined, {staleTime: 30 * 1000, retry: false})
	const nativeApps = useMemo(() => nativeAppsQ.data ?? [], [nativeAppsQ.data])

	const filesIcon = systemAppsKeyed['LIVINITY_files'].icon

	const openFilesAt = (route: string, title: string) => {
		if (windowManager) {
			windowManager.openWindow('LIVINITY_files', route, title, filesIcon)
		} else {
			navigate(route)
		}
	}

	// ── Build the superset ──────────────────────────────────────────────

	// 1. "Real" apps — user apps + WebApps + native apps, alphabetical.
	const appEntries: LaunchpadEntry[] = []

	for (const app of userApps ?? []) {
		// running ≡ ready (openable) — feedback_app_running_vs_ready_state.
		const openable = app.state === 'ready' || app.state === 'running'
		appEntries.push({
			key: `app-${app.id}`,
			label: app.name,
			sublabel: openable ? undefined : appStateSublabel(app.state),
			dimmed: !openable,
			pin: {kind: 'app', id: app.id},
			tile: <LauncherTile src={app.icon} />,
			onSelect: () => {
				if (openable) {
					launchApp(app.id)
				} else {
					// Same fallback as the spotlight unready results — open the
					// App Store window so the user can manage the app from there.
					windowManager?.openWindow(
						'LIVINITY_app-store',
						'/app-store',
						'App Store',
						systemAppsKeyed['LIVINITY_app-store'].icon,
					)
				}
			},
		})
	}

	for (const wa of webapps) {
		const label =
			wa.title?.trim() ||
			(() => {
				try {
					return new URL(wa.url).hostname
				} catch {
					return wa.url
				}
			})()
		appEntries.push({
			key: `webapp-${wa.id}`,
			label,
			pin: {kind: 'webapp', id: wa.id},
			tile: <LauncherTile src={wa.faviconUrl || undefined} />,
			onSelect: launchWebApp({id: wa.id, url: wa.url, title: label, iconUrl: wa.faviconUrl || ''}),
		})
	}

	for (const cfg of nativeApps) {
		appEntries.push({
			key: `native-${cfg.id}`,
			label: cfg.name,
			pin: {kind: 'native', id: cfg.id},
			tile: <LauncherTile src={cfg.iconUrl || undefined} />,
			onSelect: () => {
				void launchNativeApp({id: cfg.id, name: cfg.name, iconUrl: cfg.iconUrl, wmClassHint: cfg.wmClassHint})
			},
		})
	}

	appEntries.sort((a, b) => a.label.localeCompare(b.label, undefined, {sensitivity: 'base'}))

	// 2. System apps.
	const systemIds = showLivAssistant ? [...SYSTEM_GRID_IDS, 'LIVINITY_liv-assistant'] : SYSTEM_GRID_IDS
	const systemEntries: LaunchpadEntry[] = systemIds
		.map((id) => systemAppsKeyed[id as keyof typeof systemAppsKeyed])
		.filter(Boolean)
		.map((sys) => ({
			key: `system-${sys.id}`,
			label: sys.name,
			pin: {kind: 'system' as const, id: sys.id},
			// Same tile as the dock (frosted squircle + stroke glyph) — the
			// legacy figma-export images made Files/Docker/etc. look like a
			// different app family here. Image fallback only for system ids
			// without a dock glyph.
			tile: hasDockGlyph(sys.id) ? (
				<DockGlyphTile appId={sys.id} size={TILE_SIZE} className='shadow-lg' />
			) : (
				<AppIcon src={sys.icon} size={TILE_SIZE} className='shadow-lg' style={{borderRadius: TILE_RADIUS}} />
			),
			onSelect: () => {
				const windowRoute = WINDOWED_SYSTEM_ROUTES[sys.id]
				if (windowManager && windowRoute) {
					const route =
						sys.id === 'LIVINITY_files' ? sessionStorage.getItem('lastFilesPath') || windowRoute : windowRoute
					windowManager.openWindow(sys.id, route, sys.name, sys.icon)
				} else {
					navigate(sys.systemAppTo ?? '/')
				}
			},
		}))

	// 3. File shortcuts — Downloads / Recents / Trash, on the dock tile
	// surface (custom glyph variant) so they match the system row.
	const fileEntries: LaunchpadEntry[] = [
		{
			key: 'files-downloads',
			label: 'Downloads',
			tile: <DockGlyphTile glyph={TbDownload as unknown as DockGlyph} size={TILE_SIZE} className='shadow-lg' />,
			onSelect: () => openFilesAt('/files/Home/Downloads', 'Downloads'),
		},
		{
			key: 'files-recents',
			label: 'Recents',
			tile: <DockGlyphTile glyph={TbClockHour4 as unknown as DockGlyph} size={TILE_SIZE} className='shadow-lg' />,
			onSelect: () => openFilesAt(`/files${FILES_RECENTS_PATH}`, 'Recents'),
		},
		{
			key: 'files-trash',
			label: 'Trash',
			tile: <DockGlyphTile glyph={TbTrash as unknown as DockGlyph} size={TILE_SIZE} className='shadow-lg' />,
			onSelect: () => openFilesAt(`/files${FILES_TRASH_PATH}`, 'Trash'),
		},
	]

	// 4. Desktop folders → Files window at /Home/<name>. Index in the key
	// because the rename path allows two folders to share a name
	// (review finding 2026-06-10 — same exposure as the desktop grid).
	const folderEntries: LaunchpadEntry[] = folders.map((folder, index) => ({
		key: `folder-${index}-${folder.name}`,
		label: folder.name,
		// items-center (not items-end) so the keyboard-selection ring hugs
		// the folder silhouette instead of framing 20px of empty headroom
		// (review fix 2026-06-10).
		tile: (
			<div className='flex items-center justify-center' style={{width: TILE_SIZE - 8, height: TILE_SIZE}}>
				<FolderShape color={folder.color} icon={folder.icon} />
			</div>
		),
		onSelect: () => openFilesAt(`/files/Home/${encodeURIComponent(folder.name)}`, folder.name),
	}))

	const entries = [...appEntries, ...systemEntries, ...fileEntries, ...folderEntries]

	// ── Phase 3: live filtering ─────────────────────────────────────────
	const q = query.trim().toLowerCase()
	const filtered = q ? entries.filter((e) => e.label.toLowerCase().includes(q)) : entries

	const launchEntry = (entry: LaunchpadEntry) => {
		// Inert while the overlay is exiting (review fix 2026-06-10).
		if (closingRef?.current) return
		entry.onSelect()
		onClose()
	}

	// Enter in the search pill launches the first filtered tile (the pill
	// dropdown only carries system actions now). Registered every render
	// so the closure always sees the current filter. Defense-in-depth: a
	// trimmed-empty query must NOT launch (the caller also gates on
	// trim() — review fix 2026-06-10).
	useEffect(() => {
		if (!launchFirstRef) return
		launchFirstRef.current = () => {
			if (closingRef?.current || !q) return false
			const first = filtered[0]
			if (!first) return false
			launchEntry(first)
			return true
		}
		return () => {
			launchFirstRef.current = null
		}
	})

	// ── Phase 3: pages (only for the unfiltered superset) ───────────────
	const COLS = isMobile ? 4 : 7
	const ROWS = isMobile ? 5 : 4
	const perPage = COLS * ROWS
	const pages = q ? [filtered] : chunk(filtered, perPage)
	const pageCount = pages.length

	const scrollRef = useRef<HTMLDivElement>(null)
	const [page, setPage] = useState(0)
	// While a keyboard-initiated smooth scroll is in flight, intermediate
	// scroll events must not clear the selection (see handleScroll).
	const programmaticScrollUntil = useRef(0)

	const scrollToPage = (i: number) => {
		const el = scrollRef.current
		if (!el) return
		programmaticScrollUntil.current = Date.now() + 700
		el.scrollTo({left: i * el.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth'})
	}

	const handleScroll = () => {
		const el = scrollRef.current
		if (!el || el.clientWidth === 0) return
		const p = Math.round(el.scrollLeft / el.clientWidth)
		if (p !== page) setPage(p)
		// Manual swipe / dot click while a tile is keyboard-selected: clear
		// the selection instead of stranding the ring on a hidden page
		// (Enter would launch an off-screen tile — review fix 2026-06-10).
		if (selIndex !== null && Date.now() > programmaticScrollUntil.current && Math.floor(selIndex / perPage) !== p) {
			setSelIndex(null)
		}
	}

	// Dots: clamp when the page count shrinks under us (background
	// refetch removing entries) so one dot is always active.
	useEffect(() => {
		if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1))
	}, [page, pageCount])

	// ── Phase 3: keyboard navigation (empty query — macOS Launchpad) ────
	const [selIndex, setSelIndex] = useState<number | null>(null)

	useEffect(() => {
		// Selection only makes sense on the unfiltered grid (typing routes
		// Enter through launchFirstRef instead).
		setSelIndex(null)
	}, [q])

	useEffect(() => {
		if (q) return
		const onKey = (e: KeyboardEvent) => {
			// Inert during the overlay's exit animation (review fix 2026-06-10).
			if (closingRef?.current) return
			if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
			const total = filtered.length
			if (!total) return
			// `selIndex`/`page` are fresh — this effect re-subscribes every
			// render. Computing `next` OUT here keeps the setState updater
			// pure (no scrollTo side effect inside it — StrictMode double-
			// invokes updaters; review fix 2026-06-10). First arrow press
			// starts on the currently VISIBLE page, not page 1.
			const move = (delta: number) => {
				e.preventDefault()
				const next =
					selIndex === null
						? Math.min(page * perPage, total - 1)
						: Math.max(0, Math.min(total - 1, selIndex + delta))
				setSelIndex(next)
				scrollToPage(Math.floor(next / perPage))
			}
			switch (e.key) {
				case 'ArrowRight':
					move(1)
					break
				case 'ArrowLeft':
					move(-1)
					break
				case 'ArrowDown':
					move(COLS)
					break
				case 'ArrowUp':
					move(-COLS)
					break
				case 'Enter': {
					if (selIndex !== null && filtered[selIndex]) {
						e.preventDefault()
						launchEntry(filtered[selIndex])
					}
					break
				}
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	// ── Render ──────────────────────────────────────────────────────────

	if (q && filtered.length === 0) {
		// hideEmptyState: the pill's action dropdown has matches — a "No
		// apps match" line right beneath it reads contradictory.
		if (hideEmptyState) return null
		return (
			<div className='flex h-40 w-full items-center justify-center text-[14px] text-white/60'>
				No apps match “{query.trim()}”
			</div>
		)
	}

	return (
		<div className='flex w-full flex-col' onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className={cn(
					'livinity-hide-scrollbar flex w-full',
					pageCount > 1 ? 'snap-x snap-mandatory overflow-x-auto' : 'overflow-x-hidden',
				)}
			>
				{pages.map((pageEntries, pi) => (
					<div
						key={pi}
						className='grid w-full min-w-full snap-start content-start justify-items-center gap-x-3 gap-y-7 px-1'
						style={{gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`}}
					>
						{pageEntries.map((entry, ei) => {
							const globalIndex = pi * perPage + ei
							const selected = !q && selIndex === globalIndex
							const tileButton = (
								<button
									type='button'
									onClick={(e) => {
										// Launch then close — stopPropagation so the outer overlay
										// onClick={onClose} doesn't race the launch action.
										e.stopPropagation()
										launchEntry(entry)
									}}
									// w-fit (not w-full) — clicks in the cell gutter around the
									// icon must fall through to the overlay's close-on-click,
									// matching macOS Launchpad (review finding 2026-06-10).
									className='group flex w-fit flex-col items-center gap-2 px-1 outline-none'
								>
									<motion.div
										initial={reduceMotion ? {opacity: 0} : {opacity: 0, scale: 0.8}}
										animate={reduceMotion ? {opacity: 1} : {opacity: 1, scale: 1}}
										// No stagger wave while typing — tiles reparent into the
										// single filtered page and would replay the cascade on
										// every first keystroke (review fix 2026-06-10).
										transition={{duration: 0.18, ease: 'easeOut', delay: q ? 0 : Math.min(ei, 28) * 0.012}}
										className={cn(
											'transition-transform duration-150 group-hover:scale-110 group-active:scale-95 group-focus-visible:scale-110',
											entry.dimmed && 'opacity-40',
											selected && 'scale-110',
										)}
										style={
											selected
												? {borderRadius: TILE_RADIUS + 4, boxShadow: '0 0 0 3px rgba(255,255,255,0.85)'}
												: undefined
										}
									>
										{entry.tile}
									</motion.div>
									<span
										className={cn(
											'max-w-[110px] truncate text-[12px] font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]',
											selected ? 'text-white' : 'text-white/90',
										)}
									>
										{entry.label}
									</span>
									{entry.sublabel && <span className='-mt-1.5 text-[10px] text-white/50'>{entry.sublabel}</span>}
								</button>
							)

							// Phase 4 — pinnable entries get a right-click dock menu. The
							// menu portal needs z-[1000] (overlay is z-[999]); clicks inside
							// it must not bubble to the overlay's onClick={onClose}.
							if (!entry.pin) return <React.Fragment key={entry.key}>{tileButton}</React.Fragment>
							const pinned = isPinned(entry.pin.kind, entry.pin.id)
							return (
								<ContextMenu key={entry.key}>
									<ContextMenuTrigger asChild>{tileButton}</ContextMenuTrigger>
									<ContextMenuContent className='z-[1000]' onClick={(e) => e.stopPropagation()}>
										<ContextMenuItem
											onSelect={() => {
												if (pinned) unpin(entry.pin!.kind, entry.pin!.id)
												else addPin(entry.pin!)
											}}
										>
											{pinned ? 'Remove from Dock' : 'Keep in Dock'}
										</ContextMenuItem>
									</ContextMenuContent>
								</ContextMenu>
							)
						})}
					</div>
				))}
			</div>

			{/* macOS page dots */}
			{pageCount > 1 && (
				<div className='mt-5 flex items-center justify-center gap-2.5'>
					{pages.map((_, i) => (
						<button
							key={i}
							type='button'
							aria-label={`Page ${i + 1}`}
							onClick={(e) => {
								e.stopPropagation()
								scrollToPage(i)
							}}
							className={cn(
								'h-2 w-2 rounded-full transition-all duration-200',
								i === page ? 'scale-110 bg-white/90' : 'bg-white/30 hover:bg-white/50',
							)}
						/>
					))}
				</div>
			)}
		</div>
	)
}
