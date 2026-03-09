import {TbSearch} from 'react-icons/tb'

import {useIsSmallMobile} from '@/hooks/use-is-mobile'
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
	// No gradient masking needed for animated wallpapers (no static image URL)
	return null
}
