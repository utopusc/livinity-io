import {HTMLProps} from 'react'

import LivinityLogo from '@/assets/livinity-logo'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

export const LivinityLogoLarge = () => <LivinityLogo className='md:w-[120px]' />

export function Title({children, hasTransition}: {children: React.ReactNode; hasTransition: boolean}) {
	return (
		<h1
			className='text-center text-display-sm font-bold leading-tight -tracking-2 md:text-56'
			style={{
				viewTransitionName: hasTransition ? 'title' : undefined,
			}}
		>
			{children}
		</h1>
	)
}

export function SubTitle({
	children,
	className,
	...props
}: {
	children: React.ReactNode
	className?: string
} & HTMLProps<HTMLParagraphElement>) {
	return (
		<p className={cn('text-center text-body font-medium text-text-secondary md:text-body-lg', className)} {...props}>
			{children}
		</p>
	)
}

export const footerClass = tw`flex items-center justify-center gap-4`
export const footerLinkClass = tw`text-body-sm transition-colors font-normal text-text-secondary -tracking-3 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/20`

export const buttonClass = tw`flex h-12 items-center rounded-full bg-brand px-4 text-body font-medium -tracking-1 text-white ring-brand/20 transition-all duration-300 hover:bg-brand-lighter focus:outline-none focus-visible:ring-2 focus-visible:border-brand active:scale-100 active:bg-brand min-w-[112px] justify-center disabled:pointer-events-none disabled:opacity-50`
export const secondaryButtonClasss = tw`flex h-12 items-center rounded-full bg-surface-2 backdrop-blur-sm px-4 text-body font-medium -tracking-1 text-white ring-brand/20 transition-all duration-300 hover:bg-surface-3 focus:outline-none focus-visible:ring-2 active:scale-100 active:bg-surface-3 min-w-[112px] justify-center disabled:pointer-events-none disabled:opacity-50`

export const formGroupClass = tw`flex w-full max-w-sm flex-col gap-2.5`

// Think of it as a helper component to make it easier to be consistent between pages. It's a brittle abtraction that
// shouldn't be taken too far.
export function Layout({
	title,
	transitionTitle = true,
	subTitle,
	subTitleMaxWidth,
	children,
	footer,
	stepIndicator,
}: {
	title: string
	transitionTitle?: boolean
	subTitle: React.ReactNode
	subTitleMaxWidth?: number
	children: React.ReactNode
	footer?: React.ReactNode
	stepIndicator?: React.ReactNode
}) {
	return (
		<>
			{/* TODO: probably want consumer to set the title */}
			<div className='flex-1' />
			<div className='flex w-full flex-col items-center gap-6'>
				<LivinityLogoLarge />
				{stepIndicator}
				<div className='flex flex-col items-center gap-1.5'>
					<Title hasTransition={transitionTitle}>{title}</Title>
					<SubTitle style={{maxWidth: subTitleMaxWidth}}>{subTitle}</SubTitle>
				</div>
				{children}
			</div>
			<div className='flex-1' />
			<div className='pt-5' />
			<div className={footerClass}>{footer}</div>
		</>
	)
}
