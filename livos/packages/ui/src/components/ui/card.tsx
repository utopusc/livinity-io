import {HtmlHTMLAttributes} from 'react'

import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

export function Card({
	children,
	className,
	...props
}: {children?: React.ReactNode; className?: string} & HtmlHTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn(cardClass, className)} {...props}>
			{children}
		</div>
	)
}

export const cardClass = tw`rounded-20 bg-white/6 px-4 py-5 max-lg:min-h-[95px] lg:p-6 border border-white/5 shadow-card-elevated transition-all duration-200 hover:bg-white/8 hover:border-white/10 hover:shadow-card-hover`
