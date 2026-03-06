import {motion} from 'framer-motion'
import {useEffect, useState} from 'react'
import {TbChevronLeft, TbChevronRight} from 'react-icons/tb'
import {useLocation, useNavigate} from 'react-router-dom'
import {Magnetic} from '@/components/motion-primitives/magnetic'
import {BASE_ROUTE_PATH, SEARCH_PATH} from '@/features/files/constants'
import {useNavigate as useFilesNavigate} from '@/features/files/hooks/use-navigate'
import {useIsFilesEmbedded} from '@/features/files/providers/files-capabilities-context'
import {cn} from '@/shadcn-lib/utils'

/**
 * File browser navigation controls that track visited folder paths.
 * Maintains clean paths without query parameters to prevent
 * dialog re-renders during back/forward navigation.
 */
export function NavigationControls() {
	const location = useLocation()
	const navigate = useNavigate()
	const {uiPath, navigateToDirectory} = useFilesNavigate()
	const isEmbedded = useIsFilesEmbedded()

	// Track visited paths and current position
	const [navigation, setNavigation] = useState({
		paths: [isEmbedded ? uiPath : location.pathname],
		currentPathIndex: 0,
	})

	// Add new path when location or embedded currentPath changes
	// and store the latest path in session storage for the Dock to restore
	useEffect(() => {
		// We only persist the path for the standalone Files feature (skip in embedded/Rewind)
		if (!isEmbedded) {
			const isSearchPage = location.pathname === `${BASE_ROUTE_PATH}${SEARCH_PATH}`
			const newPath = isSearchPage ? `${location.pathname}${location.search}` : location.pathname

			setNavigation((current) => {
				const lastPath = current.paths[current.currentPathIndex]

				// If the new path is the same as the last path, do nothing
				if (newPath === lastPath) {
					return current
				}

				// If the new path is a search page and the last path was also a search page,
				// update the last path with the new path so we don't store the path for every
				// search query character (e.g., "?q=t" => "?q=te" => "?q=tes" => "?q=test")
				if (isSearchPage && lastPath.startsWith(`${BASE_ROUTE_PATH}${SEARCH_PATH}`)) {
					const updatedPaths = [...current.paths.slice(0, current.currentPathIndex), newPath]
					return {
						paths: updatedPaths,
						currentPathIndex: current.currentPathIndex,
					}
				}

				// Normal navigation push, truncate any forward history
				const updatedPaths = [...current.paths.slice(0, current.currentPathIndex + 1), newPath]
				return {
					paths: updatedPaths,
					currentPathIndex: updatedPaths.length - 1,
				}
			})
		} else {
			const newPath = uiPath
			setNavigation((current) => {
				const lastPath = current.paths[current.currentPathIndex]
				if (newPath === lastPath) return current
				const updatedPaths = [...current.paths.slice(0, current.currentPathIndex + 1), newPath]
				return {
					paths: updatedPaths,
					currentPathIndex: updatedPaths.length - 1,
				}
			})
		}
	}, [isEmbedded, location.pathname, location.search, uiPath])

	// Navigation handlers
	const handleBack = () => {
		if (!canGoBack) return
		const prevIndex = navigation.currentPathIndex - 1
		setNavigation((curr) => ({...curr, currentPathIndex: prevIndex}))
		if (isEmbedded) {
			navigateToDirectory(navigation.paths[prevIndex])
		} else {
			navigate(navigation.paths[prevIndex])
		}
	}

	const handleForward = () => {
		if (!canGoForward) return
		const nextIndex = navigation.currentPathIndex + 1
		setNavigation((curr) => ({...curr, currentPathIndex: nextIndex}))
		if (isEmbedded) {
			navigateToDirectory(navigation.paths[nextIndex])
		} else {
			navigate(navigation.paths[nextIndex])
		}
	}

	// can go back if there is a previous path
	const canGoBack = Boolean(navigation.paths[navigation.currentPathIndex - 1])
	// can go forward if there is a next path
	const canGoForward = Boolean(navigation.paths[navigation.currentPathIndex + 1])

	return (
		<div className='flex items-center gap-0.5'>
			<Magnetic intensity={0.3} range={50} springOptions={{stiffness: 200, damping: 15, mass: 0.1}}>
				<motion.button
					onClick={handleBack}
					disabled={!canGoBack}
					className={cn(
						'flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200',
						'focus:ring-0 focus-visible:ring-0',
						canGoBack
							? 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 hover:shadow-sm'
							: 'opacity-20 cursor-default',
					)}
					whileTap={canGoBack ? {scale: 0.88} : undefined}
					aria-label='Go back'
				>
					<TbChevronLeft className='h-[17px] w-[17px]' strokeWidth={2.5} />
				</motion.button>
			</Magnetic>
			<Magnetic intensity={0.3} range={50} springOptions={{stiffness: 200, damping: 15, mass: 0.1}}>
				<motion.button
					onClick={handleForward}
					disabled={!canGoForward}
					className={cn(
						'flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200',
						'focus:ring-0 focus-visible:ring-0',
						canGoForward
							? 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 hover:shadow-sm'
							: 'opacity-20 cursor-default',
					)}
					whileTap={canGoForward ? {scale: 0.88} : undefined}
					aria-label='Go forward'
				>
					<TbChevronRight className='h-[17px] w-[17px]' strokeWidth={2.5} />
				</motion.button>
			</Magnetic>
		</div>
	)
}
