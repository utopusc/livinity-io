import {forwardRef, useEffect, useRef} from 'react'

import {animatedWallpapers, animatedWallpaperIds} from '@/components/animated-wallpapers'
import {useWallpaper, wallpaperIds} from '@/providers/wallpaper'
import {cn} from '@/shadcn-lib/utils'

const ITEM_W = 40
const GAP = 4
const ACTIVE_SCALE = 1.4

const WallpaperItem = forwardRef(
	(
		{
			active,
			bgColor,
			onSelect,
			className,
		}: {
			active?: boolean
			bgColor: string
			onSelect: () => void
			className?: string
		},
		ref: React.ForwardedRef<HTMLButtonElement>,
	) => {
		return (
			<button
				ref={ref}
				onClick={onSelect}
				className={cn(
					'h-6 shrink-0 bg-cover bg-center outline-none ring-brand/30 transition-all duration-200 focus-visible:ring-1',
					active
						? 'mx-3 rounded-5 ring-2 ring-brand/30'
						: 'rounded-3',
					className,
				)}
				style={{
					width: ITEM_W,
					transform: `scale(${active ? ACTIVE_SCALE : 1})`,
					backgroundColor: bgColor,
				}}
			/>
		)
	},
)

WallpaperItem.displayName = 'WallpaperItem'

export function WallpaperPicker({maxW}: {maxW?: number}) {
	const {wallpaper, setWallpaperId} = useWallpaper()
	const containerRef = useRef<HTMLDivElement>(null)
	const scrollerRef = useRef<HTMLDivElement>(null)
	const itemsRef = useRef<HTMLDivElement>(null)
	const selectedItemRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!containerRef.current || !selectedItemRef.current || !itemsRef.current || !scrollerRef.current) {
			return
		}

		const containerW = containerRef.current.clientWidth
		const index = wallpaperIds.findIndex((id) => id === wallpaper.id)

		scrollerRef.current.scrollTo({
			behavior: 'smooth',
			left: index * (ITEM_W + GAP) - containerW / 2 + (ITEM_W * ACTIVE_SCALE) / 2,
		})
	}, [wallpaper.id])

	return (
		<div ref={containerRef} className='flex-grow-1 flex h-7 max-w-full items-center animate-in fade-in'>
			<div
				className={cn(
					'livinity-hide-scrollbar livinity-wallpaper-fade-scroller w-full items-center overflow-x-auto bg-red-500/0 py-3',
					!maxW && 'md:max-w-[350px]',
				)}
				ref={scrollerRef}
				style={{
					maxWidth: maxW,
				}}
			>
				<div ref={itemsRef} className='flex' style={{gap: GAP}}>
					<div className='w-1 shrink-0' />
					{animatedWallpaperIds.map((id) => (
						<WallpaperItem
							ref={id === wallpaper.id ? selectedItemRef : undefined}
							key={id}
							active={id === wallpaper.id}
							onSelect={() => setWallpaperId(id)}
							bgColor={`hsl(${animatedWallpapers[id].brandColorHsl})`}
						/>
					))}
					<div className='w-1 shrink-0' />
				</div>
			</div>
		</div>
	)
}
