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

export const cardClass = tw`rounded-radius-xl bg-surface-1 px-4 py-5 max-lg:min-h-[95px] lg:p-6 border border-border-subtle shadow-elevation-sm transition-all duration-200 hover:bg-surface-2 hover:border-border-default hover:shadow-elevation-md`
