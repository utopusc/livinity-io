import {motion, useWillChange} from 'framer-motion'
import {Children, isValidElement, useEffect, useRef, useState} from 'react'
import {RiCloseLine} from 'react-icons/ri'

// Animation configurations
const spring = {
	type: 'spring' as const,
	stiffness: 400,
	damping: 30,
}

// Size presets
//
// Phase 368.8 — the radii moved onto LivOS's own semantic scale
// (tailwind.config.ts:100-106) so the island speaks the same language as every
// other card. Widths and heights are deliberately UNCHANGED: the Files feature
// mounts four more islands on this same component (audio / formatting /
// operations / uploading), and they must all keep the one silhouette.
//
//   minimized 22 → 20 (radius-xl). Visually a no-op — a 40px-tall box already
//   clamps its radius to 20 — so this only makes the number honest.
//   expanded  32 → 28 (radius-3xl). A real, small softening.
const sizes = {
	minimized: {
		width: 150,
		height: 40,
		borderRadius: 20,
	},
	expanded: {
		width: 371,
		height: 180,
		borderRadius: 28,
	},
}

interface IslandProps {
	id: string
	children: React.ReactNode
	onClose?: () => void
	nonDismissable?: boolean
}

interface IslandChildProps {
	children: React.ReactNode
}

export const IslandMinimized = ({children}: IslandChildProps) => {
	return <>{children}</>
}

export const IslandExpanded = ({children}: IslandChildProps) => {
	return <>{children}</>
}

export const Island = ({children, onClose, nonDismissable}: IslandProps) => {
	const [isExpanded, setIsExpanded] = useState(true)
	const islandRef = useRef<HTMLDivElement>(null)
	const willChange = useWillChange()

	// Expand the island on click
	const handleIslandClick = () => {
		if (!isExpanded) {
			setIsExpanded(true)
		}
	}

	const size = isExpanded ? sizes.expanded : sizes.minimized

	// Find and render the appropriate child component
	const childArray = Children.toArray(children)
	const minimizedChild = childArray.find((child) => isValidElement(child) && child.type === IslandMinimized)
	const expandedChild = childArray.find((child) => isValidElement(child) && child.type === IslandExpanded)

	// Add touch/click outside handler
	// to minimize the island when clicking outside of it
	useEffect(() => {
		// If the island isn't expanded we don't need to listen for outside clicks
		if (!isExpanded) return

		const handleInteractionOutside = (event: MouseEvent | TouchEvent) => {
			if (islandRef.current && !islandRef.current.contains(event.target as Node)) {
				setIsExpanded(false)
			}
		}

		document.addEventListener('touchstart', handleInteractionOutside)
		document.addEventListener('mousedown', handleInteractionOutside)

		return () => {
			document.removeEventListener('touchstart', handleInteractionOutside)
			document.removeEventListener('mousedown', handleInteractionOutside)
		}
	}, [isExpanded])

	return (
		<div className='flex justify-center md:block'>
			<motion.div
				ref={islandRef}
				className='relative select-none bg-surface-3 text-text-primary shadow-floating-island'
				style={{
					// Phase 368.8 — the island now carries LivOS's brand tint.
					//
					// This replaces a long-dead TODO that tried
					// `backgroundColor: color-mix(in srgb, #000000 95%, rgb(var(--color-brand)) 5%)`
					// and was disabled over a macOS Safari bug. Two reasons not to restore it:
					// color-mix is the part Safari choked on, and `--color-brand` is an HSL
					// triplet (wallpaper.tsx:220 sets it via setProperty), so `rgb()` was the
					// wrong function for it anyway.
					//
					// backgroundImage, NOT backgroundColor: --surface-3 is rgba(0,0,0,0.12),
					// i.e. mostly transparent. Overwriting background-color would drop that
					// panel and leave the island a 6% wash over the raw wallpaper. A flat
					// gradient paints ABOVE background-color, so bg-surface-3 survives and the
					// brand only tints it.
					//
					// The colour is wallpaper-derived (wallpaper.tsx:220-222), so the island
					// picks up whatever the operator's wallpaper is — the same token the
					// backups island's own progress gradient already uses
					// (features/backups/components/floating-island/expanded.tsx:62-63).
					backgroundImage:
						'linear-gradient(hsl(var(--color-brand) / 0.06), hsl(var(--color-brand) / 0.06))',
					// Genuinely load-bearing here rather than decoration: at 12% opacity the
					// island used to show the wallpaper through it unblurred, which cost
					// legibility on busy images.
					backdropFilter: 'blur(12px)',
					WebkitBackdropFilter: 'blur(12px)',
					willChange,
				}}
				animate={{
					width: size.width,
					height: size.height,
					borderRadius: size.borderRadius,
				}}
				transition={spring}
				onClick={handleIslandClick}
			>
				<div className='absolute inset-0'>
					{isExpanded ? expandedChild : minimizedChild}
					{isExpanded && onClose && !nonDismissable && (
						<motion.button
							className='absolute right-4 top-4 rounded-full bg-surface-2 p-1 transition-colors hover:bg-surface-3'
							initial={{scale: 0}}
							animate={{scale: 1}}
							onClick={(e) => {
								e.stopPropagation()
								onClose()
							}}
						>
							<RiCloseLine className='h-4 w-4 text-text-primary' />
						</motion.button>
					)}
				</div>
			</motion.div>
		</div>
	)
}
