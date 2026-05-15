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
	// v36 LivOS Design Port — login title matches auth.html .form-title:
	// clamp(34px, 4vw, 46px) font-weight 500, letter-spacing -0.035em.
	// Existing display-sm hierarchy (44px+ bold) replaced for the v36 invitation
	// feel. Translation strings rendered as-is; if a string contains '<em>' it
	// will not parse — keep this for v37 i18n upgrade.
	return (
		<h1
			className='text-center text-[clamp(34px,4vw,46px)] font-medium leading-[1.05] tracking-[-0.035em] text-fg text-balance'
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
export const footerLinkClass = tw`text-body-sm transition-colors font-normal text-text-tertiary -tracking-3 hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/20`

// v36 LivOS Design Port — login primary button matches auth.html .passkey:
// bg-fg + text-[var(--bg)] invert, rounded-[14px], 16/20 padding-equivalent,
// hover translateY(-1px) opacity 0.92. No cyan glow.
export const buttonClass = tw`flex h-12 items-center rounded-[14px] bg-fg px-6 text-body font-medium -tracking-[0.005em] text-[color:var(--bg)] transition-all duration-200 hover:opacity-90 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/20 active:scale-[0.98] min-w-[112px] justify-center disabled:pointer-events-none disabled:opacity-50`
export const secondaryButtonClasss = tw`flex h-12 items-center rounded-full bg-surface-1 border border-border-default px-6 text-body font-medium -tracking-1 text-text-primary transition-all duration-300 hover:bg-surface-2 hover:border-border-emphasis focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 active:scale-[0.98] min-w-[112px] justify-center disabled:pointer-events-none disabled:opacity-50`

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
				className='flex w-full max-w-[520px] flex-col items-center gap-6 rounded-3xl border border-border-subtle px-8 py-10 md:px-12 md:py-14'
				style={{
					background: 'rgba(255, 255, 255, 0.85)',
					backdropFilter: 'blur(24px)',
					WebkitBackdropFilter: 'blur(24px)',
					boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
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
