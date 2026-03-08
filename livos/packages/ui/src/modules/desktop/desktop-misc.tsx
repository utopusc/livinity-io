import {TbSearch} from 'react-icons/tb'
import {useLocation} from 'react-router-dom'

import {useIsSmallMobile} from '@/hooks/use-is-mobile'
import {useWallpaper} from '@/providers/wallpaper'
import {t} from '@/utils/i18n'
import {cmdOrCtrl, platform} from '@/utils/misc'

export function Search({onClick}: {onClick?: () => void}) {
	const isMobile = useIsSmallMobile()
	return (
		<button
			className='z-10 flex select-none items-center gap-2 rounded-full border border-neutral-200/60 bg-white/90 px-4 py-2.5 text-[13px] font-medium leading-tight text-neutral-500 shadow-[0_2px_8px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-200 animate-in fade-in fill-mode-both hover:bg-white hover:text-neutral-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] active:scale-[0.98]'
			onClick={onClick}
		>
			<TbSearch className='h-4 w-4' strokeWidth={2} />
			{t('search')}
			{platform() !== 'other' && !isMobile && (
				<span className='ml-1 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-400'>
					{cmdOrCtrl()}K
				</span>
			)}
		</button>
	)
}

export function AppGridGradientMasking() {
	const {pathname} = useLocation()

	// Only show gradient on home page
	// Also, when transitioning between pages, this gradient can get in the way, so we hide it without animating it
	if (pathname !== '/') return null

	return (
		<>
			<GradientMaskSide side='left' />
			<GradientMaskSide side='right' />
		</>
	)
}

function GradientMaskSide({side}: {side: 'left' | 'right'}) {
	const {wallpaper, wallpaperFullyVisible, isLoading} = useWallpaper()

	if (!wallpaperFullyVisible || isLoading) return null

	return (
		<div
			// Ideally, we'd match the `block` visibility to the arrow buttons, but that would require a lot of work.
			// Ideally we'd use a breakpoint based on the CSS var --app-max-w, but that's not possible
			className='pointer-events-none fixed top-0 hidden h-full bg-cover bg-center md:block'
			style={{
				// For debugging:
				// backgroundColor: 'red',
				backgroundImage: `url(${wallpaper.url})`,
				backgroundAttachment: 'fixed',
				WebkitMaskImage: `linear-gradient(to ${side}, transparent, black)`,
				[side]: 'calc((100% - (var(--page-w) + var(--apps-padding-x) * 2)) / 2)',
				width: 'var(--apps-padding-x)',
			}}
		/>
	)
}
