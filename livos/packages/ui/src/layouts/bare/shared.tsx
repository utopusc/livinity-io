import {HTMLProps} from 'react'

import LivinityLogo from '@/assets/livinity-logo'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

export const LivinityLogoLarge = () => (
	<div className='animate-[logo-glow-pulse_4s_ease-in-out_infinite]'>
		<LivinityLogo className='md:w-[120px]' />
	</div>
)

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
		<p className={cn('text-center text-body font-medium text-white/60 md:text-body-lg', className)} {...props}>
			{children}
		</p>
	)
}

export const footerClass = tw`flex items-center justify-center gap-4`
export const footerLinkClass = tw`text-body-sm transition-colors font-normal text-white/50 -tracking-3 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20`

export const buttonClass = tw`flex h-12 items-center rounded-full bg-brand px-6 text-body font-medium -tracking-1 text-white transition-all duration-300 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98] min-w-[112px] justify-center disabled:pointer-events-none disabled:opacity-50 shadow-[0_0_20px_rgba(139,92,246,0.3)]`
export const secondaryButtonClasss = tw`flex h-12 items-center rounded-full bg-white/[0.06] backdrop-blur-md border border-white/[0.08] px-6 text-body font-medium -tracking-1 text-white transition-all duration-300 hover:bg-white/[0.1] hover:border-white/[0.15] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.98] min-w-[112px] justify-center disabled:pointer-events-none disabled:opacity-50`

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
			{/* Glassmorphic card */}
			<div
				className='flex w-full max-w-[520px] flex-col items-center gap-6 rounded-3xl border border-white/[0.08] px-8 py-10 md:px-12 md:py-14'
				style={{
					background: 'rgba(255, 255, 255, 0.03)',
					backdropFilter: 'blur(24px)',
					WebkitBackdropFilter: 'blur(24px)',
					boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
				}}
			>
				<LivinityLogoLarge />
				{stepIndicator}
				<div className='flex flex-col items-center gap-2'>
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
