import {AnimatePresence, motion, useReducedMotion} from 'framer-motion'
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {TbChevronRight, TbFolder, TbLayoutGrid, TbSearch, TbServer, TbSettings} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'

import {LaunchpadGrid} from '@/components/launchpad-grid'
import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {
	APPS_PATH as FILES_APPS_PATH,
	RECENTS_PATH as FILES_RECENTS_PATH,
	TRASH_PATH as FILES_TRASH_PATH,
} from '@/features/files/constants'
import {useQueryParams} from '@/hooks/use-query-params'
import {systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
	icon: React.ReactNode
	label: string
	description: string
	onSelect: () => void
}

// ---------------------------------------------------------------------------
// SVG blob filter for the gooey morph animation
// ---------------------------------------------------------------------------

const SVGFilter = () => (
	<svg width='0' height='0'>
		<filter id='blob'>
			<feGaussianBlur stdDeviation='10' in='SourceGraphic' />
			<feColorMatrix values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9' result='blob' />
			<feBlend in='SourceGraphic' in2='blob' />
		</filter>
	</svg>
)

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SpotlightPlaceholder({text, className}: {text: string; className?: string}) {
	return (
		<motion.div layout className={cn('pointer-events-none absolute z-10 flex items-center text-neutral-400', className)}>
			<AnimatePresence mode='popLayout'>
				<motion.p
					layoutId={`placeholder-${text}`}
					key={`placeholder-${text}`}
					initial={{opacity: 0, y: 10, filter: 'blur(5px)'}}
					animate={{opacity: 1, y: 0, filter: 'blur(0px)'}}
					exit={{opacity: 0, y: -10, filter: 'blur(5px)'}}
					transition={{duration: 0.2, ease: 'easeOut'}}
				>
					{text}
				</motion.p>
			</AnimatePresence>
		</motion.div>
	)
}

function SpotlightInput({
	placeholder,
	hidePlaceholder,
	value,
	onChange,
	placeholderClassName,
	onKeyDown,
}: {
	placeholder: string
	hidePlaceholder: boolean
	value: string
	onChange: (value: string) => void
	placeholderClassName?: string
	onKeyDown?: (e: React.KeyboardEvent) => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	return (
		<div className='flex h-14 w-full items-center justify-start gap-3 px-5'>
			<motion.div layoutId='search-icon'>
				<TbSearch className='h-5 w-5 text-neutral-400' strokeWidth={1.8} />
			</motion.div>
			<div className='relative flex-1 text-xl'>
				{!hidePlaceholder && <SpotlightPlaceholder text={placeholder} className={placeholderClassName} />}
				<motion.input
					ref={inputRef}
					layout='position'
					type='text'
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={onKeyDown}
					className='w-full bg-transparent text-neutral-800 outline-none'
				/>
			</div>
		</div>
	)
}

function SearchResultCard({
	icon,
	label,
	description,
	onSelect,
	isSelected,
}: SearchResult & {isSelected: boolean}) {
	return (
		<button
			type='button'
			onClick={onSelect}
			className={cn(
				'group/card flex w-full items-center justify-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150',
				// Phase 260.2 — pure-white palette: selected/hover row uses a theme-independent
				// light neutral (card-bg is dark in the dark theme → unreadable on white).
				isSelected ? 'bg-neutral-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)]' : 'hover:bg-neutral-100',
			)}
		>
			<div className='flex aspect-square size-8 shrink-0 items-center justify-center [&_svg]:size-5 [&_svg]:stroke-[1.5]'>
				{icon}
			</div>
			<div className='flex min-w-0 flex-1 flex-col'>
				<p className='truncate text-[13px] font-medium text-neutral-800'>{label}</p>
				<p className='truncate text-[11px] text-neutral-400'>{description}</p>
			</div>
			<div
				className={cn(
					'flex items-center justify-end transition-opacity duration-150',
					isSelected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100',
				)}
			>
				<TbChevronRight className='size-4 text-neutral-300' />
			</div>
		</button>
	)
}

function SearchResultsContainer({
	searchResults,
	selectedIndex,
	onHover,
	listRef,
}: {
	searchResults: SearchResult[]
	selectedIndex: number | null
	onHover: (index: number | null) => void
	listRef: React.RefObject<HTMLDivElement>
}) {
	return (
		<motion.div
			layout
			ref={listRef as React.RefObject<HTMLDivElement>}
			onMouseLeave={() => onHover(null)}
			// Phase 260.2 — pure-white palette: results list stays white (was card-bg-2/80,
			// which is dark/translucent in the dark theme). Border keeps the input divider.
			className='flex max-h-80 w-full flex-col overflow-y-auto border-t border-dash-line bg-white px-2 py-1.5'
		>
			{searchResults.map((result, index) => (
				<motion.div
					key={`search-result-${result.label}-${index}`}
					onMouseEnter={() => onHover(index)}
					initial={{opacity: 0}}
					animate={{opacity: 1}}
					exit={{opacity: 0}}
					transition={{delay: index * 0.03, duration: 0.15, ease: 'easeOut'}}
				>
					<SearchResultCard
						icon={result.icon}
						label={result.label}
						description={result.description}
						onSelect={result.onSelect}
						isSelected={selectedIndex === index}
					/>
				</motion.div>
			))}
		</motion.div>
	)
}

// ---------------------------------------------------------------------------
// External search providers bridge
// Renders cmdk search providers invisibly and collects their results
// (The cmdk providers expect to render CommandItem inside CommandList,
// which we don't have here. We'll use our own search logic instead.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AppleSpotlightProps {
	isOpen: boolean
	onClose: () => void
}

export function AppleSpotlight({isOpen, onClose}: AppleSpotlightProps) {
	const [hoveredSearchResult, setHoveredSearchResult] = useState<number | null>(null)
	const [searchValue, setSearchValue] = useState('')
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
	const navigate = useNavigate()
	const windowManager = useWindowManagerOptional()
	const {addLinkSearchParams} = useQueryParams()
	const listRef = useRef<HTMLDivElement>(null)
	const reduceMotion = useReducedMotion()
	// Phase 3 — set by LaunchpadGrid; Enter in the pill launches the first
	// filtered grid tile (the dropdown only carries system actions now).
	const launchFirstRef = useRef<(() => boolean) | null>(null)
	// Review fix 2026-06-10 — AnimatePresence keeps the subtree mounted
	// (live listeners + frozen props) during the ~300ms exit animation.
	// This ref flips true the moment a close is requested so every input
	// path (pill Enter, grid keydown, tile clicks) goes inert immediately.
	// A ref (stable identity) pierces the frozen-props problem.
	const closingRef = useRef(false)

	// Reset state when opening/closing
	useEffect(() => {
		if (isOpen) {
			closingRef.current = false
			setSearchValue('')
			setHoveredSearchResult(null)
			setSelectedIndex(null)
		}
	}, [isOpen])

	const requestClose = useCallback(() => {
		closingRef.current = true
		onClose()
	}, [onClose])

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				// Radix dismissable layers (the grid's "Keep in Dock" context
				// menus) preventDefault on the document listener when they
				// consume Escape — menu closes first, overlay stays (review
				// fix 2026-06-10, macOS layering).
				if (e.defaultPrevented) return
				e.preventDefault()
				requestClose()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [isOpen, requestClose])

	// Phase 3 — the legacy hover "shortcut bubbles" (Files/Settings/Docker/
	// Server/Devices circles flying out of the pill) were removed: the
	// Launchpad grid below the pill IS the shortcut surface now, and the
	// bubbles duplicated it with extra layout churn.

	// Build search results — SYSTEM ACTIONS only (navigation/settings).
	// App results were removed in Phase 3: typing now filters the grid
	// itself, so listing apps here duplicated the tiles right above.
	const searchResults: SearchResult[] = useMemo(() => {
		if (!searchValue.trim()) return []

		const query = searchValue.toLowerCase()
		const results: SearchResult[] = []

		// System navigation items
		const systemItems: {label: string; description: string; icon: React.ReactNode; action: () => void}[] = [
			{
				label: 'Home',
				description: 'Go to desktop',
				icon: <TbLayoutGrid className='text-neutral-500' />,
				action: () => navigate(systemAppsKeyed['LIVINITY_home'].systemAppTo),
			},
			{
				label: 'Files',
				description: 'File manager',
				icon: <TbFolder className='text-neutral-500' />,
				action: () => {
					const lastFilesPath = sessionStorage.getItem('lastFilesPath')
					const target = lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo
					const filesIcon = systemAppsKeyed['LIVINITY_files']?.icon || ''
					if (windowManager) windowManager.openWindow('LIVINITY_files', target, 'Files', filesIcon)
					else navigate(target)
				},
			},
			{
				label: t('files-sidebar.recents'),
				description: 'Recently accessed files',
				icon: <TbFolder className='text-neutral-500' />,
				action: () => {
					const target = `/files${FILES_RECENTS_PATH}`
					if (windowManager)
						windowManager.openWindow('LIVINITY_files', target, 'Files', systemAppsKeyed['LIVINITY_files']?.icon || '')
					else navigate(target)
				},
			},
			{
				label: t('files-sidebar.apps'),
				description: 'App data files',
				icon: <TbFolder className='text-neutral-500' />,
				action: () => {
					const target = `/files${FILES_APPS_PATH}`
					if (windowManager)
						windowManager.openWindow('LIVINITY_files', target, 'Files', systemAppsKeyed['LIVINITY_files']?.icon || '')
					else navigate(target)
				},
			},
			{
				label: t('files-sidebar.trash'),
				description: 'Deleted files',
				icon: <TbFolder className='text-neutral-500' />,
				action: () => {
					const target = `/files${FILES_TRASH_PATH}`
					if (windowManager)
						windowManager.openWindow('LIVINITY_files', target, 'Files', systemAppsKeyed['LIVINITY_files']?.icon || '')
					else navigate(target)
				},
			},
			{
				label: 'Settings',
				description: 'System settings',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate(systemAppsKeyed['LIVINITY_settings'].systemAppTo),
			},
			{
				label: t('cmdk.restart-livinity'),
				description: 'Restart your server',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate({pathname: '/settings', search: addLinkSearchParams({dialog: 'restart'})}),
			},
			{
				label: t('cmdk.change-wallpaper'),
				description: 'Change desktop wallpaper',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate('/settings/wallpaper'),
			},
			{
				label: t('change-name'),
				description: 'Account settings',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate('settings/account/change-name'),
			},
			{
				label: t('change-password'),
				description: 'Account settings',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate('settings/account/change-password'),
			},
			{
				label: t('language'),
				description: 'Language preferences',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate('/settings/language'),
			},
			{
				label: t('troubleshoot'),
				description: 'Diagnose issues',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate('/settings/troubleshoot'),
			},
			{
				label: t('software-update.title'),
				description: 'Check for updates',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate('/settings/software-update'),
			},
			{
				label: t('device-info'),
				description: 'Hardware information',
				icon: <TbServer className='text-neutral-500' />,
				action: () => navigate('/settings/device-info'),
			},
			{
				label: t('terminal'),
				description: 'Command line interface',
				icon: <TbServer className='text-neutral-500' />,
				action: () => navigate('/settings/terminal'),
			},
			{
				label: t('logout'),
				description: 'Sign out of LivOS',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate({search: addLinkSearchParams({dialog: 'logout'})}),
			},
		]

		// Filter system items by search query
		for (const item of systemItems) {
			if (item.label.toLowerCase().includes(query)) {
				results.push({
					icon: item.icon,
					label: item.label,
					description: item.description,
					onSelect: () => {
						item.action()
						onClose()
					},
				})
			}
		}

		// (App entries removed Phase 3 — the Launchpad grid below filters
		// live and shows them as tiles; only actions live in this dropdown.)

		return results.slice(0, 8)
	}, [searchValue, navigate, onClose, addLinkSearchParams])

	// Keyboard navigation — ArrowUp/Down walks the action dropdown; Enter
	// prefers (1) an explicitly selected action, then (2) the first
	// filtered grid tile (launchFirstRef, set by LaunchpadGrid), then
	// (3) the first action result. Arrow keys on an EMPTY query are left
	// alone — the grid's own listener handles tile navigation.
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Inert while the close/exit animation runs (review fix 2026-06-10).
			if (closingRef.current) return
			if (e.key === 'ArrowDown' && searchResults.length) {
				e.preventDefault()
				setSelectedIndex((prev) => {
					const next = prev === null ? 0 : Math.min(prev + 1, searchResults.length - 1)
					// Scroll into view
					const el = listRef.current?.children[next] as HTMLElement
					el?.scrollIntoView({block: 'nearest'})
					return next
				})
			} else if (e.key === 'ArrowUp' && searchResults.length) {
				e.preventDefault()
				setSelectedIndex((prev) => {
					const next = prev === null ? 0 : Math.max(prev - 1, 0)
					const el = listRef.current?.children[next] as HTMLElement
					el?.scrollIntoView({block: 'nearest'})
					return next
				})
			} else if (e.key === 'Enter' && searchValue.trim()) {
				// .trim() — a whitespace-only query looks identical to the
				// empty state but used to launch the first app of the FULL
				// superset (review fix 2026-06-10).
				e.preventDefault()
				// Honor the mouse-hovered action row too — it carries the
				// visible highlight (effectiveSelected), so Enter must match.
				const sel =
					hoveredSearchResult !== null && searchResults[hoveredSearchResult] ? hoveredSearchResult : selectedIndex
				if (sel !== null && searchResults[sel]) {
					searchResults[sel].onSelect()
				} else if (!launchFirstRef.current?.()) {
					searchResults[0]?.onSelect()
				}
			}
		},
		[searchResults, selectedIndex, searchValue, hoveredSearchResult],
	)

	// Reset selection when search changes — default stays null so Enter
	// targets the grid's first match unless an action was arrow-selected.
	useEffect(() => {
		setSelectedIndex(null)
	}, [searchValue])

	const effectiveSelected = hoveredSearchResult !== null ? hoveredSearchResult : selectedIndex

	return (
		<AnimatePresence mode='wait'>
			{isOpen && (
				<motion.div
					key='launchpad'
					className='fixed inset-0 z-[999] flex flex-col items-center justify-start pt-[6vh]'
					onClick={requestClose}
				>
					<SVGFilter />

					{/* Backdrop — Launchpad shell (Dock+Launchpad Phase 1): deep dim +
					    heavy blur (was bg-black/5 backdrop-blur-sm) so the full-screen
					    content grid reads as macOS Launchpad: dark dimmed desktop,
					    everything in front. MUST stay a sibling of the animated content
					    wrapper below — an ancestor `filter`/`transform` (the old outer
					    blur/scale entrance) voids descendant backdrop-filter (isolated
					    backdrop root), which is why the blur never visibly applied. */}
					<motion.div
						className='fixed inset-0 bg-black/40 backdrop-blur-xl'
						initial={{opacity: 0}}
						animate={{opacity: 1}}
						exit={{opacity: 0}}
					/>

					{/* Content wrapper — macOS Launchpad zoom: the whole surface
					    settles DOWN from a slightly larger scale on open and zooms
					    back out on close. Kept as a sibling of the backdrop (an
					    ancestor filter/transform would void backdrop-filter) and
					    deliberately filter-free for the same reason. Reduced
					    motion: opacity only. */}
					<motion.div
						initial={reduceMotion ? {opacity: 0} : {opacity: 0, scale: 1.12}}
						animate={reduceMotion ? {opacity: 1} : {opacity: 1, scale: 1}}
						exit={reduceMotion ? {opacity: 0} : {opacity: 0, scale: 1.12}}
						transition={{type: 'spring', stiffness: 380, damping: 32}}
						className='flex min-h-0 w-full flex-1 flex-col items-center justify-start'
					>

					<div
						onClick={(e) => e.stopPropagation()}
						style={{filter: 'url(#blob)'}}
						className={cn(
							'z-20 flex w-full max-w-2xl items-center justify-end gap-4 group',
							// Phase 260.2 (operator-locked 2026-06-06): the Spotlight palette is a
							// PURE-WHITE opaque surface in ALL themes. The `card-bg` token renders
							// dark/transparent under the dark theme (the see-through bug), so the
							// input pill + shortcut bubbles are pinned to solid white. Child text is
							// already neutral-800/400 (this component was designed for a light panel).
							'[&>div]:rounded-full [&>div]:bg-white [&>div]:text-neutral-800 [&>div]:backdrop-blur-2xl',
							'[&_svg]:size-6 [&_svg]:stroke-[1.4]',
						)}
					>
						<AnimatePresence mode='popLayout'>
							<motion.div
								layoutId='search-input-container'
								transition={{
									layout: {duration: 0.5, type: 'spring', bounce: 0.2},
								}}
								style={{borderRadius: '24px'}}
								className='relative z-10 flex h-full w-full flex-col items-center justify-start overflow-hidden border border-dash-line shadow-[0_8px_40px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.03)]'
							>
								<SpotlightInput
									placeholder={
										hoveredSearchResult !== null && searchResults[hoveredSearchResult]
											? searchResults[hoveredSearchResult].label
											: t('search')
									}
									placeholderClassName={hoveredSearchResult !== null ? 'text-neutral-800' : 'text-neutral-400'}
									hidePlaceholder={!(hoveredSearchResult !== null || !searchValue)}
									value={searchValue}
									onChange={(value) => {
										setSearchValue(value)
										setHoveredSearchResult(null)
									}}
									onKeyDown={handleKeyDown}
								/>

								{searchValue && searchResults.length > 0 && (
									<SearchResultsContainer
										searchResults={searchResults}
										selectedIndex={effectiveSelected}
										onHover={setHoveredSearchResult}
										listRef={listRef}
									/>
								)}
								{/* Phase 3 — the dropdown's no-results block and the hover
								    "shortcut bubbles" were removed: the grid below filters
								    live (with its own empty state) and IS the shortcut
								    surface. */}
							</motion.div>
						</AnimatePresence>
					</div>

					{/* Launchpad grid area — Phase 2+3: the full content superset
					    (user apps + system apps + webapps + native + file
					    shortcuts + desktop folders), live-filtered by the query.
					    No stopPropagation on the empty space on purpose: clicks
					    fall through to the outer onClick={onClose}, matching
					    macOS Launchpad dismissal. */}
					<div className='livinity-hide-scrollbar z-10 mt-8 min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-8 pb-16'>
						<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
							<LaunchpadGrid
								query={searchValue}
								onClose={requestClose}
								launchFirstRef={launchFirstRef}
								closingRef={closingRef}
								// When the action dropdown has matches, the grid's
								// "No apps match" line right under it reads
								// contradictory — suppress it (review fix 2026-06-10).
								hideEmptyState={!!searchValue.trim() && searchResults.length > 0}
							/>
						</ErrorBoundary>
					</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
