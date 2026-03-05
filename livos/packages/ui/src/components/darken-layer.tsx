import {cn} from '@/shadcn-lib/utils'

/**
 * Put a darken layer over the page
 */
export function DarkenLayer({className}: {className?: string}) {
	return <div className={cn('fixed inset-0 bg-black/10 contrast-more:bg-black/30', className)} />
}
