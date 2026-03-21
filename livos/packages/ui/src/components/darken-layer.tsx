import {cn} from '@/shadcn-lib/utils'

/** Full-screen overlay to dim background content */
export function DarkenLayer({className, opacity = 'light'}: {className?: string; opacity?: 'light' | 'medium' | 'heavy'}) {
	const opacityClass = opacity === 'heavy' ? 'bg-black/30' : opacity === 'medium' ? 'bg-black/20' : 'bg-black/10'
	return <div className={cn('fixed inset-0 contrast-more:bg-black/40', opacityClass, className)} />
}
