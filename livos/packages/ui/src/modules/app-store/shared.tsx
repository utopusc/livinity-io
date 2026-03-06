import {ReactNode} from 'react'

import {AppIcon} from '@/components/app-icon'
import {SheetHeader, SheetTitle} from '@/shadcn-components/ui/sheet'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

// ─── Animations ─────────────────────────────────────────────────
export const slideInFromBottomClass = tw`animate-in fade-in slide-in-from-bottom-8 duration-300`
export const fadeInClass = tw`animate-in fade-in duration-500`
export const scaleInClass = tw`animate-in zoom-in-95 duration-300`

// ─── Card Styles ────────────────────────────────────────────────
const cardBaseClass = tw`rounded-2xl px-4 py-4 md:px-8 md:py-8`

// Clean card with semantic surface
export const cardClass = cn(
	cardBaseClass,
	tw`relative overflow-hidden`,
	tw`bg-white`,
	tw`border border-neutral-200/80`,
	tw`shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]`,
	tw`rounded-2xl`,
)

// Subtle card for secondary sections
export const cardFaintClass = cn(
	cardBaseClass,
	tw`bg-neutral-50/50 hover:bg-white transition-all duration-300`,
	tw`border border-neutral-200/60`,
	tw`rounded-2xl`,
)

// Featured card with brand accent
export const cardFeaturedClass = cn(
	cardBaseClass,
	tw`relative overflow-hidden`,
	tw`bg-gradient-to-br from-white to-neutral-50`,
	tw`border border-neutral-200/80`,
	tw`shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]`,
	tw`rounded-2xl`,
)

// ─── Grid Layouts ───────────────────────────────────────────────
export const appsGridClass = tw`grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
export const appsGridCompactClass = tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`

// ─── Typography ─────────────────────────────────────────────────
export const sectionOverlineClass = tw`text-[11px] font-bold uppercase tracking-[0.08em] text-brand mb-1.5`
export const sectionTitleClass = tw`text-2xl md:text-3xl font-bold text-neutral-900 tracking-tight`
export const sectionDescriptionClass = tw`text-body-sm md:text-body text-neutral-500 mt-2 max-w-2xl leading-relaxed`

// ─── Section Title Component ────────────────────────────────────
export function SectionTitle({
	overline,
	title,
	description,
	action,
}: {
	overline?: string
	title: ReactNode
	description?: string
	action?: ReactNode
}) {
	return (
		<div className='mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between'>
			<div>
				{overline && <p className={sectionOverlineClass}>{overline}</p>}
				<h3 className={sectionTitleClass}>{title}</h3>
				{description && <p className={sectionDescriptionClass}>{description}</p>}
			</div>
			{action && <div className='mt-4 md:mt-0'>{action}</div>}
		</div>
	)
}

// ─── App Store Layout Wrapper ───────────────────────────────────
export function AppStoreSheetInner({
	children,
	beforeHeaderChildren,
	titleRightChildren,
	title,
}: {
	children: ReactNode
	beforeHeaderChildren?: ReactNode
	titleRightChildren?: ReactNode
	title: string
}) {
	return (
		<div className='flex flex-col gap-6 md:gap-10'>
			{beforeHeaderChildren}
			<SheetHeader className='gap-5'>
				<div className='flex flex-col gap-x-5 gap-y-4 px-2 md:flex-row md:items-center md:px-0'>
					<SheetTitle className='flex-1 whitespace-nowrap text-3xl font-bold leading-none tracking-tight text-neutral-900'>
						{title}
					</SheetTitle>
					{titleRightChildren}
				</div>
			</SheetHeader>
			<div className='space-y-8 md:space-y-12'>{children}</div>
		</div>
	)
}

// ─── App Card Components ────────────────────────────────────────
export function AppWithName({
	icon,
	appName,
	childrenRight,
	className,
}: {
	icon: string
	appName: ReactNode
	childrenRight?: ReactNode
	className?: string
}) {
	return (
		<div className={cn('flex w-full items-center gap-3', className)}>
			<AppIcon src={icon} size={40} className='rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200/60' />
			<h3 className='flex-1 truncate text-body-sm font-semibold leading-tight tracking-tight text-neutral-900'>{appName}</h3>
			{childrenRight}
		</div>
	)
}

// ─── Premium App Card ───────────────────────────────────────────
export function PremiumAppCard({
	icon,
	name,
	tagline,
	category,
	onClick,
}: {
	icon: string
	name: string
	tagline: string
	category?: string
	onClick?: () => void
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'group relative flex flex-col items-start gap-4 p-5 text-left',
				'rounded-2xl border border-neutral-200/60',
				'bg-white',
				'hover:bg-neutral-50 hover:border-neutral-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
				'transition-all duration-300 ease-out',
				'focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
			)}
		>
			{/* Left accent bar on hover */}
			<div className='absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand opacity-0 transition-opacity group-hover:opacity-100' />

			<div className='relative flex w-full items-start gap-4'>
				<AppIcon
					src={icon}
					size={56}
					className='rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200/60 transition-transform duration-300 group-hover:scale-105'
				/>
				<div className='min-w-0 flex-1'>
					<h4 className='truncate text-body-lg font-semibold tracking-tight text-neutral-900'>{name}</h4>
					<p className='mt-1 line-clamp-2 text-body-sm leading-snug text-neutral-500'>{tagline}</p>
				</div>
			</div>

			{category && (
				<span className='rounded-full bg-neutral-100 px-3 py-1 text-caption font-medium text-neutral-600'>
					{category}
				</span>
			)}
		</button>
	)
}

// ─── Featured App Spotlight ─────────────────────────────────────
export function FeaturedAppSpotlight({
	icon,
	name,
	tagline,
	description,
	gradient,
	onClick,
}: {
	icon: string
	name: string
	tagline: string
	description?: string
	gradient?: string
	onClick?: () => void
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'group relative w-full overflow-hidden rounded-3xl p-6 md:p-8 text-left',
				'border border-neutral-200/80',
				'transition-all duration-500 ease-out',
				'hover:border-neutral-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]',
				'focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
				gradient || 'bg-gradient-to-br from-white to-neutral-50',
			)}
		>
			{/* Subtle hover overlay */}
			<div className='absolute inset-0 bg-white/50 opacity-0 transition-opacity duration-500 group-hover:opacity-100' />

			<div className='relative flex flex-col gap-4 md:flex-row md:items-center md:gap-6'>
				<AppIcon
					src={icon}
					size={80}
					className='rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-2 ring-neutral-200/80 transition-transform duration-500 group-hover:scale-110'
				/>
				<div className='flex-1'>
					<p className='text-[11px] font-bold uppercase tracking-[0.08em] text-brand'>Featured</p>
					<h3 className='mt-1 text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl'>{name}</h3>
					<p className='mt-2 text-body-lg text-neutral-700'>{tagline}</p>
					{description && <p className='mt-3 text-body-sm text-neutral-500'>{description}</p>}
				</div>
				<div className='flex items-center gap-2 text-body-sm font-medium text-neutral-500 transition-colors group-hover:text-neutral-900'>
					<span>View App</span>
					<svg className='h-4 w-4 transition-transform group-hover:translate-x-1' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
					</svg>
				</div>
			</div>
		</button>
	)
}

// ─── Category Pill ──────────────────────────────────────────────
export function CategoryPill({
	label,
	isActive,
	onClick,
	icon,
}: {
	label: string
	isActive?: boolean
	onClick?: () => void
	icon?: ReactNode
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'flex items-center gap-2 rounded-full px-4 py-2 text-body-sm font-medium',
				'transition-all duration-200',
				'focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
				isActive
					? 'bg-brand text-white shadow-lg'
					: 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900',
			)}
		>
			{icon}
			{label}
		</button>
	)
}

// ─── Stats Badge ────────────────────────────────────────────────
export function StatsBadge({label, value, icon}: {label: string; value: string | number; icon?: ReactNode}) {
	return (
		<div className='flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3'>
			{icon && <div className='text-brand'>{icon}</div>}
			<div>
				<p className='text-lg font-bold text-neutral-900'>{value}</p>
				<p className='text-caption text-neutral-500'>{label}</p>
			</div>
		</div>
	)
}
