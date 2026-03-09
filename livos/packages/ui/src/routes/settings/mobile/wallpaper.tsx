import {useRef} from 'react'
import {useMount, useTimeout} from 'react-use'

import {animatedWallpapers, animatedWallpaperIds} from '@/components/animated-wallpapers'
import {useWallpaper, WallpaperId} from '@/providers/wallpaper'
import {useSettingsDialogProps} from '@/routes/settings/_components/shared'
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerScroller,
	DrawerTitle,
} from '@/shadcn-components/ui/drawer'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'
import {sleep} from '@/utils/misc'

export function WallpaperDrawer() {
	const title = t('wallpaper')
	const dialogProps = useSettingsDialogProps()

	const {wallpaper, setWallpaperId} = useWallpaper()

	const selectWallpaper = async (id: WallpaperId) => {
		setWallpaperId(id)
		await sleep(500)
		dialogProps.onOpenChange(false)
	}

	const [isReady] = useTimeout(300)

	return (
		<Drawer {...dialogProps}>
			<DrawerContent fullHeight>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>{t('wallpaper-description')}</DrawerDescription>
				</DrawerHeader>
				<DrawerScroller>
					{isReady() && (
						<div className='grid grid-cols-2 gap-2.5'>
							{animatedWallpaperIds.map((id, i) => (
								<WallpaperItem
									key={id}
									id={id}
									active={id === wallpaper.id}
									onSelect={() => selectWallpaper(id)}
									className='animate-in fade-in fill-mode-both'
									style={{
										animationDelay: `${i * 20}ms`,
									}}
								/>
							))}
						</div>
					)}
				</DrawerScroller>
			</DrawerContent>
		</Drawer>
	)
}

function WallpaperItem({
	id,
	active,
	onSelect,
	className,
	style,
}: {
	id: string
	active?: boolean
	onSelect: () => void
	className?: string
	style: React.CSSProperties
}) {
	const ref = useRef<HTMLButtonElement>(null)
	const wallpaperData = animatedWallpapers[id as keyof typeof animatedWallpapers]

	useMount(() => {
		if (!active) return
		ref.current?.scrollIntoView({block: 'center'})
	})

	return (
		<button
			ref={ref}
			className={cn('relative aspect-1.9 overflow-hidden rounded-10', className)}
			style={{
				...style,
				backgroundColor: `hsl(${wallpaperData.brandColorHsl})`,
			}}
			onClick={onSelect}
		>
			<div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent px-3 pb-2 pt-6'>
				<span className='text-[12px] font-medium text-white/90'>{wallpaperData.name}</span>
			</div>
			<div
				className={cn(
					'absolute inset-0 rounded-10 border-4 transition-colors',
					active ? ' border-brand' : 'border-transparent',
				)}
			/>
		</button>
	)
}
