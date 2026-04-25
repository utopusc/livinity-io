import {AnimatePresence, motion} from 'framer-motion'
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {TbChevronRight, TbDevices2, TbFolder, TbLayoutGrid, TbMessage, TbSearch, TbServer, TbSettings} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'

import {cmdkSearchProviders} from '@/components/cmdk-providers'
import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {
	APPS_PATH as FILES_APPS_PATH,
	RECENTS_PATH as FILES_RECENTS_PATH,
	TRASH_PATH as FILES_TRASH_PATH,
} from '@/features/files/constants'
import {useQueryParams} from '@/hooks/use-query-params'
import {useLaunchApp} from '@/hooks/use-launch-app'
import {systemAppsKeyed, useApps} from '@/providers/apps'
import {useAvailableApps} from '@/providers/available-apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {cn} from '@/shadcn-lib/utils'
import {AppState, trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Shortcut {
	label: string
	icon: React.ReactNode
	onSelect: () => void
}

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

function ShortcutButton({icon, onSelect}: {icon: React.ReactNode; onSelect: () => void}) {
	return (
		<button type='button' onClick={onSelect}>
			<div className='cursor-pointer rounded-full opacity-30 transition-[opacity,shadow] duration-200 hover:opacity-100 hover:shadow-lg'>
				<div className='flex aspect-square size-16 items-center justify-center'>{icon}</div>
			</div>
		</button>
	)
}

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
				isSelected ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]' : 'hover:bg-white/60',
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
			className='flex max-h-80 w-full flex-col overflow-y-auto border-t border-neutral-200/60 bg-neutral-50/80 px-2 py-1.5'
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

function appStateToDescription(state: AppState): string {
	const map: Record<AppState, string> = {
		'not-installed': 'Not installed',
		installing: 'Installing...',
		ready: 'Open app',
		running: 'Open app',
		starting: 'Starting...',
		restarting: 'Restarting...',
		stopping: 'Stopping...',
		updating: 'Updating...',
		uninstalling: 'Uninstalling...',
		unknown: 'Offline',
		stopped: 'Stopped',
		loading: 'Loading...',
	}
	return map[state] ?? ''
}

export function AppleSpotlight({isOpen, onClose}: AppleSpotlightProps) {
	const [hovered, setHovered] = useState(false)
	const [hoveredSearchResult, setHoveredSearchResult] = useState<number | null>(null)
	const [hoveredShortcut, setHoveredShortcut] = useState<number | null>(null)
	const [searchValue, setSearchValue] = useState('')
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
	const navigate = useNavigate()
	const {addLinkSearchParams} = useQueryParams()
	const launchApp = useLaunchApp()
	const {userApps, userAppsKeyed, isLoading: appsLoading} = useApps()
	const availableApps = useAvailableApps()
	const windowManager = useWindowManagerOptional()
	const listRef = useRef<HTMLDivElement>(null)

	// Reset state when opening/closing
	useEffect(() => {
		if (isOpen) {
			setSearchValue('')
			setHoveredSearchResult(null)
			setHoveredShortcut(null)
			setSelectedIndex(null)
			setHovered(false)
		}
	}, [isOpen])

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [isOpen, onClose])

	// Shortcuts — quick-access buttons that appear when hovering the search bar
	const shortcuts: Shortcut[] = useMemo(
		() => [
			{
				label: 'Files',
				icon: <TbFolder className='text-neutral-600' />,
				onSelect: () => {
					const lastFilesPath = sessionStorage.getItem('lastFilesPath')
					if (windowManager) {
						windowManager.openWindow(
							'LIVINITY_files',
							lastFilesPath || '/files/Home',
							'Files',
							systemAppsKeyed['LIVINITY_files'].icon,
						)
					} else {
						navigate(lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo)
					}
					onClose()
				},
			},
			{
				label: 'Settings',
				icon: <TbSettings className='text-neutral-600' />,
				onSelect: () => {
					if (windowManager) {
						windowManager.openWindow(
							'LIVINITY_settings',
							'/settings',
							'Settings',
							systemAppsKeyed['LIVINITY_settings'].icon,
						)
					} else {
						navigate(systemAppsKeyed['LIVINITY_settings'].systemAppTo)
					}
					onClose()
				},
			},
			{
				label: 'AI Chat',
				icon: <TbMessage className='text-neutral-600' />,
				onSelect: () => {
					if (windowManager) {
						windowManager.openWindow(
							'LIVINITY_ai-chat',
							'/ai-chat',
							'AI Chat',
							systemAppsKeyed['LIVINITY_ai-chat'].icon,
						)
					} else {
						navigate(systemAppsKeyed['LIVINITY_ai-chat'].systemAppTo)
					}
					onClose()
				},
			},
			{
				// Phase 24-01 — replaces the legacy 'Server' app entry.
				label: 'Docker',
				icon: <TbServer className='text-neutral-600' />,
				onSelect: () => {
					if (windowManager) {
						windowManager.openWindow(
							'LIVINITY_docker',
							'/docker',
							'Docker',
							systemAppsKeyed['LIVINITY_docker'].icon,
						)
					} else {
						navigate(systemAppsKeyed['LIVINITY_docker'].systemAppTo)
					}
					onClose()
				},
			},
			{
				label: 'Devices',
				icon: <TbDevices2 className='text-neutral-600' />,
				onSelect: () => {
					if (windowManager) {
						windowManager.openWindow(
							'LIVINITY_my-devices',
							'/my-devices',
							'Devices',
							systemAppsKeyed['LIVINITY_my-devices'].icon,
						)
					} else {
						navigate(systemAppsKeyed['LIVINITY_my-devices'].systemAppTo)
					}
					onClose()
				},
			},
		],
		[navigate, onClose, windowManager],
	)

	// Build search results from all available data
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
					navigate(lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo)
				},
			},
			{
				label: t('files-sidebar.recents'),
				description: 'Recently accessed files',
				icon: <TbFolder className='text-neutral-500' />,
				action: () => navigate(`/files${FILES_RECENTS_PATH}`),
			},
			{
				label: t('files-sidebar.apps'),
				description: 'App data files',
				icon: <TbFolder className='text-neutral-500' />,
				action: () => navigate(`/files${FILES_APPS_PATH}`),
			},
			{
				label: t('files-sidebar.trash'),
				description: 'Deleted files',
				icon: <TbFolder className='text-neutral-500' />,
				action: () => navigate(`/files${FILES_TRASH_PATH}`),
			},
			{
				label: 'Settings',
				description: 'System settings',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate(systemAppsKeyed['LIVINITY_settings'].systemAppTo),
			},
			{
				label: t('cmdk.live-usage'),
				description: 'CPU, memory, storage usage',
				icon: <TbServer className='text-neutral-500' />,
				action: () => navigate(systemAppsKeyed['LIVINITY_live-usage'].systemAppTo),
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
				label: t('wifi'),
				description: 'Network settings',
				icon: <TbSettings className='text-neutral-500' />,
				action: () => navigate('/settings/wifi'),
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

		// Ready user apps (can be launched)
		if (userApps) {
			const readyApps = userApps.filter((app) => app.state === 'ready')
			for (const app of readyApps) {
				if (app.name.toLowerCase().includes(query)) {
					results.push({
						icon: <img src={app.icon} alt='' className='h-6 w-6 rounded-lg' />,
						label: app.name,
						description: 'Open app',
						onSelect: () => {
							launchApp(app.id)
							onClose()
						},
					})
				}
			}

			// Unready user apps
			const unreadyApps = userApps.filter((app) => app.state !== 'ready')
			for (const app of unreadyApps) {
				if (app.name.toLowerCase().includes(query)) {
					results.push({
						icon: <img src={app.icon} alt='' className='h-6 w-6 rounded-lg opacity-50' />,
						label: app.name,
						description: appStateToDescription(app.state),
						onSelect: () => {
							navigate(`/app-store/${app.id}`)
							onClose()
						},
					})
				}
			}
		}

		// Installable apps from the app store
		if (availableApps.apps && userAppsKeyed) {
			const installableApps = availableApps.apps.filter((app) => !userAppsKeyed[app.id])
			for (const app of installableApps) {
				if (app.name.toLowerCase().includes(query)) {
					results.push({
						icon: <img src={app.icon} alt='' className='h-6 w-6 rounded-lg' />,
						label: app.name,
						description: 'Available in App Store',
						onSelect: () => {
							navigate(`/app-store/${app.id}`)
							onClose()
						},
					})
				}
			}
		}

		return results.slice(0, 15) // Cap at 15 results
	}, [searchValue, userApps, userAppsKeyed, availableApps.apps, navigate, onClose, launchApp, addLinkSearchParams])

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!searchResults.length) return

			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setSelectedIndex((prev) => {
					const next = prev === null ? 0 : Math.min(prev + 1, searchResults.length - 1)
					// Scroll into view
					const el = listRef.current?.children[next] as HTMLElement
					el?.scrollIntoView({block: 'nearest'})
					return next
				})
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedIndex((prev) => {
					const next = prev === null ? 0 : Math.max(prev - 1, 0)
					const el = listRef.current?.children[next] as HTMLElement
					el?.scrollIntoView({block: 'nearest'})
					return next
				})
			} else if (e.key === 'Enter' && selectedIndex !== null && searchResults[selectedIndex]) {
				e.preventDefault()
				searchResults[selectedIndex].onSelect()
			}
		},
		[searchResults, selectedIndex],
	)

	// Reset selection when search changes
	useEffect(() => {
		setSelectedIndex(searchValue ? 0 : null)
	}, [searchValue])

	const effectiveSelected = hoveredSearchResult !== null ? hoveredSearchResult : selectedIndex

	return (
		<AnimatePresence mode='wait'>
			{isOpen && (
				<motion.div
					initial={{opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: -10}}
					animate={{opacity: 1, filter: 'blur(0px)', scaleX: 1, scaleY: 1, y: 0}}
					exit={{opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: 10}}
					transition={{stiffness: 550, damping: 50, type: 'spring'}}
					className='fixed inset-0 z-[999] flex flex-col items-center justify-start pt-[12vh]'
					onClick={onClose}
				>
					<SVGFilter />

					{/* Backdrop */}
					<motion.div
						className='fixed inset-0 bg-black/5 backdrop-blur-sm'
						initial={{opacity: 0}}
						animate={{opacity: 1}}
						exit={{opacity: 0}}
					/>

					<div
						onMouseEnter={() => setHovered(true)}
						onMouseLeave={() => {
							setHovered(false)
							setHoveredShortcut(null)
						}}
						onClick={(e) => e.stopPropagation()}
						style={{filter: 'url(#blob)'}}
						className={cn(
							'z-20 flex w-full max-w-2xl items-center justify-end gap-4 group',
							'[&>div]:rounded-full [&>div]:bg-white/95 [&>div]:text-neutral-800 [&>div]:backdrop-blur-2xl',
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
								className='relative z-10 flex h-full w-full flex-col items-center justify-start overflow-hidden border border-neutral-200/60 shadow-[0_8px_40px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.03)]'
							>
								<SpotlightInput
									placeholder={
										hoveredShortcut !== null
											? shortcuts[hoveredShortcut].label
											: hoveredSearchResult !== null && searchResults[hoveredSearchResult]
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

								{searchValue && searchResults.length === 0 && !appsLoading && (
									<motion.div
										layout
										className='border-t border-neutral-200/60 bg-neutral-50/80 px-5 py-6 text-center text-[13px] text-neutral-400'
									>
										{t('no-results-found')}
									</motion.div>
								)}
							</motion.div>

							{/* Shortcut bubbles */}
							{hovered &&
								!searchValue &&
								shortcuts.map((shortcut, index) => (
									<motion.div
										key={`shortcut-${index}`}
										onMouseEnter={() => setHoveredShortcut(index)}
										layout
										initial={{scale: 0.7, x: -1 * (64 * (index + 1))}}
										animate={{scale: 1, x: 0}}
										exit={{
											scale: 0.7,
											x:
												1 *
												(16 * (shortcuts.length - index - 1) +
													64 * (shortcuts.length - index - 1)),
										}}
										transition={{
											duration: 0.8,
											type: 'spring',
											bounce: 0.2,
											delay: index * 0.05,
										}}
										className='cursor-pointer rounded-full'
									>
										<ShortcutButton icon={shortcut.icon} onSelect={shortcut.onSelect} />
									</motion.div>
								))}
						</AnimatePresence>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
